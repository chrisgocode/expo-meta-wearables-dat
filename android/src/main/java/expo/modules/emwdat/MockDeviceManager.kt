package expo.modules.emwdat

import android.content.Context
import android.view.View
import com.meta.wearable.dat.core.types.ChargingState
import com.meta.wearable.dat.core.types.ThermalLevel
import com.meta.wearable.dat.inputs.types.*
import com.meta.wearable.dat.mockdevice.api.speech.MockSpeechSource
import android.net.Uri
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.mockdevice.MockDeviceKit
import com.meta.wearable.dat.mockdevice.api.GlassesModel
import com.meta.wearable.dat.mockdevice.api.MockDeviceKitConfig
import com.meta.wearable.dat.mockdevice.api.MockDeviceKitInterface
import com.meta.wearable.dat.mockdevice.api.MockGlasses
import com.meta.wearable.dat.mockdevice.api.camera.CameraFacing

object MockDeviceManager {
    private val logger = EMWDATLogger
    private var devices: MutableMap<String, MockGlasses> = mutableMapOf()
    private var mockDeviceKit: MockDeviceKitInterface? = null

    private fun getKit(context: Context): MockDeviceKitInterface {
        return mockDeviceKit ?: MockDeviceKit.getInstance(context.applicationContext).also {
            mockDeviceKit = it
        }
    }

    // MARK: - Kit Lifecycle

    fun enableMockDeviceKit(context: Context, initiallyRegistered: Boolean, initialPermissionsGranted: Boolean) {
        val kit = getKit(context)
        val config = MockDeviceKitConfig(
            initiallyRegistered = initiallyRegistered,
            initialPermissionsGranted = initialPermissionsGranted
        )
        kit.enable(config)
        logger.info("MockDeviceManager", "MockDeviceKit enabled", mapOf(
            "initiallyRegistered" to initiallyRegistered,
            "initialPermissionsGranted" to initialPermissionsGranted
        ))
    }

    fun disableMockDeviceKit(context: Context) {
        val kit = getKit(context)
        kit.disable()
        devices.clear()
        logger.info("MockDeviceManager", "MockDeviceKit disabled")
    }

    fun isMockDeviceKitEnabled(context: Context): Boolean {
        val kit = getKit(context)
        return kit.isEnabled
    }

    // MARK: - Pair / Unpair

    fun pairMockDevice(context: Context, model: String): String {
        val kit = getKit(context)
        val device = kit.pairGlasses(mapGlassesModel(model)).fold(
            onSuccess = { it },
            onFailure = { error, _ ->
                throw IllegalStateException("Failed to pair mock device: ${error.description}")
            }
        )
        val id = device.deviceIdentifier.toString()
        devices[id] = device
        logger.info("MockDeviceManager", "Paired mock device", mapOf("id" to id, "model" to model))
        return id
    }

    fun unpairMockDevice(context: Context, id: String) {
        val device = devices[id] ?: throw IllegalArgumentException("Mock device not found: $id")
        val kit = getKit(context)
        kit.unpairDevice(device)
        devices.remove(id)
        logger.info("MockDeviceManager", "Unpaired mock device", mapOf("id" to id))
    }

    fun getMockDevices(): List<String> = devices.keys.toList()

    // MARK: - Power

    fun powerOn(id: String) {
        getDevice(id).powerOn()
    }

    fun powerOff(id: String) {
        getDevice(id).powerOff()
    }

    // MARK: - Don / Doff

    fun don(id: String) {
        getDevice(id).don()
    }

    fun doff(id: String) {
        getDevice(id).doff()
    }

    // MARK: - Fold / Unfold

    fun fold(id: String) {
        getDevice(id).fold()
    }

    fun unfold(id: String) {
        getDevice(id).unfold()
    }

    // MARK: - Camera (file-based)

    fun setCameraFeed(id: String, fileUrl: String) {
        val device = getDevice(id)
        val uri = parseUri(fileUrl)
        device.services.camera.setCameraFeed(uri)
        logger.info("MockDeviceManager", "Set camera feed", mapOf("id" to id, "uri" to uri.toString()))
    }

    fun setCapturedImage(id: String, fileUrl: String) {
        val device = getDevice(id)
        val uri = parseUri(fileUrl)
        device.services.camera.setCapturedImage(uri)
        logger.info("MockDeviceManager", "Set captured image", mapOf("id" to id, "uri" to uri.toString()))
    }

    // MARK: - Camera (phone camera — SDK 0.6+)

    fun setCameraFeedFromCamera(id: String, facing: String) {
        val device = getDevice(id)
        val cameraFacing = if (facing == "back") CameraFacing.BACK else CameraFacing.FRONT
        device.services.camera.setCameraFeed(cameraFacing)
        logger.info("MockDeviceManager", "Set camera feed from camera", mapOf("id" to id, "facing" to facing))
    }

    // MARK: - Captouch (SDK 0.7+)

    fun tap(id: String) {
        getDevice(id).services.captouch.tap()
    }

    fun tapAndHold(id: String) {
        getDevice(id).services.captouch.tapAndHold()
    }

    // MARK: - Permissions

    fun setPermissionStatus(context: Context, permission: String, status: String) {
        val kit = getKit(context)
        val perm = mapPermission(permission) ?: return
        val stat = mapPermissionStatus(status) ?: return
        kit.permissions.set(perm, stat)
        logger.info("MockDeviceManager", "Set permission status", mapOf(
            "permission" to permission,
            "status" to status
        ))
    }

    fun setPermissionRequestResult(context: Context, permission: String, result: String) {
        val kit = getKit(context)
        val perm = mapPermission(permission) ?: return
        val stat = mapPermissionStatus(result) ?: return
        kit.permissions.setRequestResult(perm, stat)
        logger.info("MockDeviceManager", "Set permission request result", mapOf(
            "permission" to permission,
            "result" to result
        ))
    }

    fun createDisplayPreview(id: String, context: Context): View = getDevice(id).services.display.createPreviewView(context)
    fun startTestServer(context: Context, port: Int): Int = getKit(context).startTestServer(port).bridgeValue()
    fun stopTestServer(context: Context) { getKit(context).stopTestServer() }
    fun simulateRegistrationOutcome(context: Context, success: Boolean) { getKit(context).simulateRegistrationOutcome(success) }

    fun simulate(id: String, event: Map<String, Any>): Any? {
        val device = getDevice(id)
        fun text(key: String) = event[key] as? String ?: throw IllegalArgumentException("Missing $key")
        when (text("type")) {
            "battery" -> {
                val level = (event["level"] as? Number)?.toInt() ?: -1
                require(level in -1..100) { "Battery must be 0–100 or null" }
                device.setBatteryLevel(level)
            }
            "charging" -> device.setChargingState(ChargingState.entries.firstOrNull { sdkEnumName(it) == text("state") }
                ?: throw IllegalArgumentException("Invalid charging state"))
            "thermal" -> device.setThermalLevel(ThermalLevel.entries.firstOrNull { sdkEnumName(it) == text("level") }
                ?: throw IllegalArgumentException("Invalid thermal level"))
            "input" -> {
                val input = event["event"] as? Map<*, *> ?: throw IllegalArgumentException("Missing input event")
                val source = InputSource.entries.firstOrNull { sdkEnumName(it) == (input["source"] ?: "captouch") }
                    ?: throw IllegalArgumentException("Invalid input source")
                val kit = device.services.input
                when (input["type"]) {
                    "nav" -> when (input["direction"]) {
                        "up" -> kit.navUp(source); "down" -> kit.navDown(source)
                        "left" -> kit.navLeft(source); "right" -> kit.navRight(source)
                        else -> throw IllegalArgumentException("Invalid navigation direction")
                    }
                    "select" -> kit.select(source)
                    "back" -> kit.back(source)
                    "button" -> kit.button(ButtonType.ACTION)
                    "capture" -> kit.capture(CapturePressType.entries.firstOrNull { sdkEnumName(it) == input["pressType"] }
                        ?: throw IllegalArgumentException("Invalid capture press type"))
                    "drag" -> {
                        val action = DragAction.entries.firstOrNull { sdkEnumName(it) == input["action"] }
                            ?: throw IllegalArgumentException("Invalid drag action")
                        val coords = listOf("x", "y", "dx", "dy").map { key ->
                            (input[key] as? Number)?.toFloat()?.takeIf { it.isFinite() }
                                ?: throw IllegalArgumentException("Invalid drag coordinate")
                        }
                        kit.drag(action, coords[0], coords[1], coords[2], coords[3])
                    }
                    else -> throw IllegalArgumentException("Invalid input type")
                }
            }
            "motionFeed" -> device.services.motion.setMotionFeed(parseUri(text("fileUrl")))
            "transcription" -> {
                val confidence = (event["confidence"] as? Number)?.toFloat() ?: -1f
                require(confidence == -1f || confidence in 0f..1f) { "Invalid confidence" }
                device.services.speech.simulateTranscription(text("text"), event["isFinal"] as? Boolean ?: true, confidence)
            }
            "speechLocale" -> device.services.speech.setLocale(text("locale"))
            "speechError" -> device.services.speech.simulateError((event["code"] as Number).toInt(), text("message"))
            "speechCompletion" -> device.services.speech.simulateCompletion()
            "speechSource" -> device.services.speech.setTranscriptionSource(if (event["live"] == true) MockSpeechSource.LIVE_DEVICE_ASR else MockSpeechSource.INJECTED)
            "launchApp" -> {
                check(device.services.voiceInvocation.hasConnectedApps()) { "Start voice invocation listening first" }
                return device.services.voiceInvocation.simulateLaunchAppAction()
            }
            "incompleteVoiceInvocation" -> {
                check(device.services.voiceInvocation.hasConnectedApps()) { "Start voice invocation listening first" }
                return device.services.voiceInvocation.simulateIncompleteAction()
            }
            "capturedPhoto" -> device.services.cameraCapture.setCapturedPhoto(parseUri(text("fileUrl")))
            "photoFailure" -> device.services.cameraCapture.simulateCaptureFailure()
            "displayClick" -> return device.services.display.sendClick(text("identifier"))
            else -> throw IllegalArgumentException("Unknown mock event type")
        }
        return null
    }

    // MARK: - Helpers

    private fun mapGlassesModel(model: String): GlassesModel = when (model) {
        "oakleyMetaHSTN" -> GlassesModel.OAKLEY_META_HSTN
        "oakleyMetaVanguard" -> GlassesModel.OAKLEY_META_VANGUARD
        "rayBanMetaOptics" -> GlassesModel.RAYBAN_META_OPTICS
        "metaRayBanDisplay" -> GlassesModel.META_RAYBAN_DISPLAY
        "metaGlasses" -> GlassesModel.META_GLASSES
        else -> GlassesModel.RAYBAN_META
    }

    private fun getDevice(id: String): MockGlasses {
        return devices[id] ?: throw IllegalArgumentException("Mock device not found: $id")
    }

    private fun parseUri(fileUrl: String): Uri {
        return if (fileUrl.startsWith("file://")) {
            Uri.parse(fileUrl)
        } else {
            Uri.parse("file://$fileUrl")
        }
    }

    private fun mapPermission(permission: String): Permission? = when (permission) {
        "microphone" -> Permission.MICROPHONE
        "camera" -> Permission.CAMERA
        else -> null
    }

    private fun mapPermissionStatus(status: String): PermissionStatus? = when (status) {
        "granted" -> PermissionStatus.Granted
        "denied" -> PermissionStatus.Denied
        else -> null
    }
}
