package expo.modules.emwdat

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import androidx.exifinterface.media.ExifInterface
import com.meta.wearable.dat.camera.Camera
import com.meta.wearable.dat.camera.Stream
import com.meta.wearable.dat.camera.addCamera
import com.meta.wearable.dat.camera.removeCamera
import com.meta.wearable.dat.camera.types.CameraState
import com.meta.wearable.dat.camera.types.CaptureError
import com.meta.wearable.dat.camera.types.PhotoData
import com.meta.wearable.dat.camera.types.StreamConfiguration
import com.meta.wearable.dat.camera.types.StreamError
import com.meta.wearable.dat.camera.types.StreamState
import com.meta.wearable.dat.camera.types.VideoFrame
import com.meta.wearable.dat.camera.types.VideoQuality
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File

typealias FrameCallback = (Bitmap) -> Unit

/**
 * Manages the camera capability attached to a [com.meta.wearable.dat.core.session.DeviceSession].
 *
 * SDK 0.9 consolidated streaming under `Camera`: `DeviceSession.addCamera(config)` returns a
 * `Camera` that owns the hardware resource and exposes its `stream` child. Stopping the camera
 * cascades to the stream.
 */
object CameraSessionManager {
    private val logger = EMWDATLogger

    // Active cameras keyed by sessionId
    private val cameras: MutableMap<String, Camera> = mutableMapOf()
    private val streams: MutableMap<String, Stream> = mutableMapOf()
    private val videoJobs: MutableMap<String, Job> = mutableMapOf()
    private val stateJobs: MutableMap<String, Job> = mutableMapOf()
    private val cameraStateJobs: MutableMap<String, Job> = mutableMapOf()
    private val errorJobs: MutableMap<String, Job> = mutableMapOf()

    private var scope: CoroutineScope? = null

    // Callbacks
    private var eventEmitter: EventEmitter? = null
    private var frameCallback: FrameCallback? = null
    private var frameCallbackOwner: Any? = null

    fun setEventEmitter(emitter: EventEmitter) {
        this.eventEmitter = emitter
    }

    fun setScope(scope: CoroutineScope) {
        this.scope = scope
    }

    fun setFrameCallback(callback: FrameCallback, owner: Any) {
        this.frameCallback = callback
        this.frameCallbackOwner = owner
    }

    fun removeFrameCallback(owner: Any) {
        if (frameCallbackOwner !== owner) return
        this.frameCallback = null
        this.frameCallbackOwner = null
    }

    // MARK: - Camera Capability Control

    fun addCameraToSession(sessionId: String, config: Map<String, Any>) {
        val session = WearablesManager.getSession(sessionId)
            ?: throw IllegalArgumentException("Session not found: $sessionId")

        if (cameras.containsKey(sessionId)) {
            throw IllegalStateException("Camera already added to session: $sessionId")
        }

        val videoQuality = when (config["resolution"] as? String) {
            "high" -> VideoQuality.HIGH
            "medium" -> VideoQuality.MEDIUM
            else -> VideoQuality.LOW
        }
        val frameRate = (config["frameRate"] as? Number)?.toInt() ?: 15
        val compressVideo = config["compressVideo"] as? Boolean
            ?: ((config["videoCodec"] as? String) == "hvc1")

        val streamConfig = StreamConfiguration(videoQuality, frameRate, compressVideo)

        logger.info("Camera", "Adding camera to session", mapOf(
            "sessionId" to sessionId,
            "quality" to videoQuality.toString(),
            "frameRate" to frameRate,
            "compressVideo" to compressVideo
        ))

        val currentScope = scope ?: throw IllegalStateException("Module scope not available")

        val camera = session.addCamera(streamConfig).fold(
            onSuccess = { it },
            onFailure = { error, _ ->
                throw IllegalStateException("Failed to add camera: ${error.description}")
            }
        )
        cameras[sessionId] = camera

        val stream = camera.stream
        streams[sessionId] = stream

        // Collect camera lifecycle
        cameraStateJobs[sessionId] = currentScope.launch {
            camera.state.collect { state ->
                handleCameraStateChange(sessionId, state)
            }
        }

        // Collect video frames
        videoJobs[sessionId] = currentScope.launch {
            stream.videoStream.collect { frame ->
                handleVideoFrame(sessionId, frame)
            }
        }

        // Collect state changes
        stateJobs[sessionId] = currentScope.launch {
            stream.state.collect { state ->
                handleStateChange(sessionId, state)
            }
        }

        // Collect errors
        errorJobs[sessionId] = currentScope.launch {
            stream.errorStream.collect { error ->
                logger.error("Camera", "Stream error", mapOf(
                    "sessionId" to sessionId,
                    "error" to error.description
                ))
                emitEvent("onStreamError", mapOf("type" to mapStreamError(error)))
            }
        }

        // Start the stream — explicit since SDK 0.7
        stream.start().onFailure { error, _ ->
            logger.error("Camera", "Failed to start stream", mapOf(
                "sessionId" to sessionId,
                "error" to error.description
            ))
            camera.stop()
            destroySession(sessionId)
            throw IllegalStateException("Failed to start stream: ${error.description}")
        }

        // Emit capability state
        emitEvent("onCapabilityStateChange", mapOf(
            "sessionId" to sessionId,
            "state" to "active"
        ))

        logger.info("Camera", "Camera added to session", mapOf("sessionId" to sessionId))
    }

    fun removeCameraFromSession(sessionId: String) {
        // Stopping the camera cascades to its stream child.
        cameras[sessionId]?.stop()
        WearablesManager.getSession(sessionId)?.removeCamera()
        destroySession(sessionId)

        emitEvent("onCapabilityStateChange", mapOf(
            "sessionId" to sessionId,
            "state" to "stopped"
        ))

        logger.info("Camera", "Camera removed from session", mapOf("sessionId" to sessionId))
    }

    suspend fun capturePhoto(context: Context, format: String) {
        // Find the first active stream
        val stream = streams.values.firstOrNull()
            ?: throw Exception("No active camera stream")

        logger.info("Camera", "Capturing photo", mapOf("requestedFormat" to format))
        val result = stream.capturePhoto()

        result.fold(
            onSuccess = { photoData ->
                handlePhotoCapture(context, photoData, format)
            },
            onFailure = { error, _ ->
                val msg = when (error) {
                    is CaptureError.DeviceDisconnected -> "Device disconnected"
                    is CaptureError.NotStreaming -> "Not streaming"
                    is CaptureError.CaptureInProgress -> "Capture already in progress"
                    is CaptureError.CaptureFailed -> "Capture failed"
                }
                logger.error("Camera", "Photo capture failed", mapOf("error" to msg))
                throw Exception("Photo capture failed: $msg")
            }
        )
    }

    // MARK: - Frame Handling

    private fun handleVideoFrame(sessionId: String, videoFrame: VideoFrame) {
        // If frame is compressed HEVC, emit metadata only (can't decode to bitmap here)
        if (videoFrame.isCompressed) {
            emitEvent("onVideoFrame", mapOf(
                "timestamp" to System.currentTimeMillis(),
                "width" to videoFrame.width,
                "height" to videoFrame.height,
                "isCompressed" to true,
                "isCodecConfig" to videoFrame.isCodecConfig
            ))
            return
        }

        val buffer = videoFrame.buffer
        val dataSize = buffer.remaining()
        val byteArray = ByteArray(dataSize)

        val originalPosition = buffer.position()
        buffer.get(byteArray)
        buffer.position(originalPosition)

        // I420 -> NV21 -> JPEG -> Bitmap
        val nv21 = convertI420toNV21(byteArray, videoFrame.width, videoFrame.height)
        val image = YuvImage(nv21, ImageFormat.NV21, videoFrame.width, videoFrame.height, null)
        val out = ByteArrayOutputStream()
        image.compressToJpeg(Rect(0, 0, videoFrame.width, videoFrame.height), 50, out)
        val jpegBytes = out.toByteArray()
        val bitmap = BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size) ?: return

        // Forward to native view
        frameCallback?.invoke(bitmap)

        // Emit metadata to JS
        emitEvent("onVideoFrame", mapOf(
            "timestamp" to System.currentTimeMillis(),
            "width" to videoFrame.width,
            "height" to videoFrame.height,
            "isCompressed" to false,
            "isCodecConfig" to false
        ))
    }

    private fun convertI420toNV21(input: ByteArray, width: Int, height: Int): ByteArray {
        val output = ByteArray(input.size)
        val size = width * height
        val quarter = size / 4

        // Copy Y plane directly
        input.copyInto(output, 0, 0, size)

        // Interleave V and U planes into NV21 format
        for (n in 0 until quarter) {
            output[size + n * 2] = input[size + quarter + n]     // V
            output[size + n * 2 + 1] = input[size + n]           // U
        }
        return output
    }

    // MARK: - State Handling

    private fun handleStateChange(sessionId: String, state: StreamState) {
        val mapped = mapStreamState(state)
        logger.info("Camera", "Stream state changed", mapOf(
            "sessionId" to sessionId,
            "state" to mapped
        ))

        emitEvent("onStreamStateChange", mapOf(
            "sessionId" to sessionId,
            "state" to mapped
        ))
    }

    private fun handleCameraStateChange(sessionId: String, state: CameraState) {
        val mapped = mapCameraState(state)
        logger.info("Camera", "Camera state changed", mapOf(
            "sessionId" to sessionId,
            "state" to mapped
        ))

        emitEvent("onCameraStateChange", mapOf(
            "sessionId" to sessionId,
            "state" to mapped
        ))
    }

    // MARK: - Photo Handling

    private fun handlePhotoCapture(context: Context, photoData: PhotoData, requestedFormat: String) {
        val timestamp = System.currentTimeMillis()
        val tempDir = context.cacheDir

        when (photoData) {
            is PhotoData.Bitmap -> {
                val filename = "emwdat_photo_${timestamp}.jpg"
                val file = File(tempDir, filename)
                file.outputStream().use { out ->
                    photoData.bitmap.compress(Bitmap.CompressFormat.JPEG, 95, out)
                }
                logger.info("Camera", "Photo saved (Bitmap→JPEG)", mapOf("path" to file.absolutePath))

                emitEvent("onPhotoCaptured", mapOf(
                    "filePath" to file.absolutePath,
                    "format" to "jpeg",
                    "timestamp" to timestamp,
                    "width" to photoData.bitmap.width,
                    "height" to photoData.bitmap.height
                ))
            }
            is PhotoData.HEIC -> {
                val buffer = photoData.data
                val bytes = ByteArray(buffer.remaining())
                val originalPos = buffer.position()
                buffer.get(bytes)
                buffer.position(originalPos)

                // If JPEG requested, decode HEIC to bitmap and re-encode as JPEG
                if (requestedFormat == "jpeg") {
                    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    if (bitmap != null) {
                        val filename = "emwdat_photo_${timestamp}.jpg"
                        val file = File(tempDir, filename)
                        file.outputStream().use { out ->
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 95, out)
                        }
                        logger.info("Camera", "Photo saved (HEIC→JPEG)", mapOf("path" to file.absolutePath))

                        emitEvent("onPhotoCaptured", mapOf(
                            "filePath" to file.absolutePath,
                            "format" to "jpeg",
                            "timestamp" to timestamp,
                            "width" to bitmap.width,
                            "height" to bitmap.height
                        ))
                        return
                    }
                    logger.warn("Camera", "HEIC→JPEG conversion failed, saving as HEIC")
                }

                // Save as HEIC (default or conversion failed)
                val filename = "emwdat_photo_${timestamp}.heic"
                val file = File(tempDir, filename)
                file.writeBytes(bytes)
                logger.info("Camera", "Photo saved (HEIC)", mapOf("path" to file.absolutePath))

                // Try to get dimensions from EXIF
                var width = 0
                var height = 0
                try {
                    val exif = ExifInterface(ByteArrayInputStream(bytes))
                    width = exif.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0)
                    height = exif.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0)
                } catch (e: Exception) {
                    logger.warn("Camera", "Could not read HEIC EXIF", mapOf("error" to e.toString()))
                }

                val payload = mutableMapOf<String, Any>(
                    "filePath" to file.absolutePath,
                    "format" to "heic",
                    "timestamp" to timestamp
                )
                if (width > 0 && height > 0) {
                    payload["width"] = width
                    payload["height"] = height
                }
                emitEvent("onPhotoCaptured", payload)
            }
        }
    }

    // MARK: - Mapping Helpers

    private fun mapStreamState(state: StreamState): String = when (state) {
        StreamState.STARTING -> "starting"
        StreamState.STARTED -> "started"
        StreamState.STREAMING -> "streaming"
        StreamState.PAUSED -> "paused"
        StreamState.STOPPING -> "stopping"
        StreamState.STOPPED -> "stopped"
        StreamState.CLOSED -> "closed"
    }

    private fun mapCameraState(state: CameraState): String = when (state) {
        CameraState.STARTING -> "starting"
        CameraState.STARTED -> "started"
        CameraState.STOPPING -> "stopping"
        CameraState.STOPPED -> "stopped"
    }

    private fun mapStreamError(error: StreamError): String = when (error) {
        StreamError.STREAM_ERROR -> "videoStreamingError"
        StreamError.CRITICAL_STREAM_ERROR -> "criticalStreamError"
        StreamError.HINGE_CLOSED -> "hingesClosed"
        StreamError.PERMISSIONS_DENIED -> "permissionDenied"
        StreamError.THERMAL_HOT -> "thermalHot"
        StreamError.BATTERY_LOW -> "batteryLow"
        StreamError.PEAK_POWER_LIMIT -> "peakPowerLimit"
        StreamError.TIMEOUT -> "timeout"
    }

    // MARK: - Cleanup

    /** Cancel collectors and drop references for a session's camera. */
    fun destroySession(sessionId: String) {
        videoJobs.remove(sessionId)?.cancel()
        stateJobs.remove(sessionId)?.cancel()
        cameraStateJobs.remove(sessionId)?.cancel()
        errorJobs.remove(sessionId)?.cancel()
        streams.remove(sessionId)
        cameras.remove(sessionId)
        logger.debug("Camera", "Camera destroyed", mapOf("sessionId" to sessionId))
    }

    fun destroy() {
        for (sessionId in cameras.keys.toList()) {
            cameras[sessionId]?.stop()
            destroySession(sessionId)
        }
    }

    // MARK: - Event Emission

    private fun emitEvent(name: String, body: Map<String, Any>) {
        eventEmitter?.invoke(name, body)
    }
}
