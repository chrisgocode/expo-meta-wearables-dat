import Foundation
import UIKit
import MWDATCore
import MWDATCamera

/// Callback type for frame updates
public typealias FrameCallback = (UIImage) -> Void

/// Manages the camera capability attached to a `DeviceSession`.
///
/// SDK 0.9 consolidated streaming under `Camera`: `DeviceSession.addCamera(config:)` returns a
/// `Camera` that owns the hardware resource and exposes its `stream` child. Stopping the camera
/// cascades to the stream.
@MainActor
public final class CameraSessionManager {
    public static let shared = CameraSessionManager()

    private let logger = EMWDATLogger.shared

    // MARK: - State

    /// Active cameras keyed by sessionId
    private var cameras: [String: Camera] = [:]
    private var cameraStateTokens: [String: AnyListenerToken] = [:]
    private var stateTokens: [String: AnyListenerToken] = [:]
    private var frameTokens: [String: AnyListenerToken] = [:]
    private var errorTokens: [String: AnyListenerToken] = [:]
    private var photoTokens: [String: AnyListenerToken] = [:]
    private var hevcDecoders: [String: HEVCDecoder] = [:]

    // MARK: - Callbacks

    private var eventEmitter: EventEmitter?
    private var frameCallback: FrameCallback?
    private var frameCallbackOwner: UUID?

    private init() {}

    // MARK: - Configuration

    /// Set the event emitter for sending events to JavaScript
    public func setEventEmitter(_ emitter: @escaping EventEmitter) {
        self.eventEmitter = emitter
    }

    /// Set the frame callback for native view rendering
    public func setFrameCallback(_ callback: @escaping FrameCallback, owner: UUID) {
        self.frameCallback = callback
        self.frameCallbackOwner = owner
    }

    /// Remove the frame callback only if the caller is the current owner
    public func removeFrameCallback(owner: UUID) {
        guard frameCallbackOwner == owner else { return }
        self.frameCallback = nil
        self.frameCallbackOwner = nil
    }

    // MARK: - Camera Capability Control

    /// Add the camera capability to a device session and start its stream.
    public func addCameraToSession(sessionId: String, config: StreamConfiguration) throws {
        guard let session = WearablesManager.shared.getSession(sessionId: sessionId) else {
            throw CameraSessionManagerError.sessionNotFound(sessionId)
        }

        logger.info("Camera", "Adding camera to session", context: [
            "sessionId": sessionId,
            "resolution": String(describing: config.resolution),
            "frameRate": config.frameRate,
            "codec": String(describing: config.videoCodec)
        ])

        // Create HEVC decoder if needed
        if config.videoCodec == .hvc1 {
            hevcDecoders[sessionId] = HEVCDecoder()
            logger.info("Camera", "HEVC decoder created for session", context: ["sessionId": sessionId])
        }

        // Add the camera capability to the session
        guard let camera = try session.addCamera(config: config) else {
            hevcDecoders[sessionId]?.invalidate()
            hevcDecoders[sessionId] = nil
            throw CameraSessionManagerError.cameraNotAvailable(sessionId)
        }
        cameras[sessionId] = camera
        let stream = camera.stream

        // Subscribe to camera lifecycle
        cameraStateTokens[sessionId] = camera.statePublisher.listen { [weak self] state in
            Task { @MainActor in
                self?.handleCameraStateChange(sessionId: sessionId, state: state)
            }
        }

        // Subscribe to stream state changes
        stateTokens[sessionId] = stream.statePublisher.listen { [weak self] state in
            Task { @MainActor in
                self?.handleStateChange(sessionId: sessionId, state: state)
            }
        }

        // Subscribe to video frames
        frameTokens[sessionId] = stream.videoFramePublisher.listen { [weak self] frame in
            Task { @MainActor in
                self?.handleVideoFrame(sessionId: sessionId, frame: frame)
            }
        }

        // Subscribe to errors
        errorTokens[sessionId] = stream.errorPublisher.listen { [weak self] error in
            Task { @MainActor in
                self?.handleError(sessionId: sessionId, error: error)
            }
        }

        // Subscribe to photos
        photoTokens[sessionId] = stream.photoDataPublisher.listen { [weak self] photoData in
            Task { @MainActor in
                self?.handlePhotoCapture(sessionId: sessionId, photoData: photoData)
            }
        }

        // Start the stream (synchronous since SDK 0.8)
        stream.start()

        // Emit initial capability state
        emitEvent("onCapabilityStateChange", [
            "sessionId": sessionId,
            "state": "active"
        ])

        logger.info("Camera", "Camera added and stream started", context: ["sessionId": sessionId])
    }

    /// Remove the camera capability from a session. Stopping the camera cascades to the stream.
    public func removeCameraFromSession(sessionId: String) {
        cameras[sessionId]?.stop()

        destroyCamera(sessionId: sessionId)

        emitEvent("onCapabilityStateChange", [
            "sessionId": sessionId,
            "state": "stopped"
        ])

        logger.info("Camera", "Camera removed from session", context: ["sessionId": sessionId])
    }

    /// Capture a photo from the active stream on any session.
    public func capturePhoto(format: PhotoCaptureFormat) -> Bool {
        guard let camera = cameras.values.first else {
            logger.warn("Camera", "Cannot capture photo - no active camera")
            return false
        }

        logger.info("Camera", "Capturing photo", context: ["format": String(describing: format)])
        return camera.stream.capturePhoto(format: format)
    }

    // MARK: - Event Handlers

    private func handleCameraStateChange(sessionId: String, state: CameraState) {
        logger.info("Camera", "Camera state changed", context: [
            "sessionId": sessionId,
            "state": String(describing: state)
        ])

        emitEvent("onCameraStateChange", [
            "sessionId": sessionId,
            "state": mapCameraState(state)
        ])
    }

    private func handleStateChange(sessionId: String, state: StreamState) {
        logger.info("Camera", "Stream state changed", context: [
            "sessionId": sessionId,
            "state": String(describing: state)
        ])

        emitEvent("onStreamStateChange", [
            "sessionId": sessionId,
            "state": mapStreamState(state)
        ])
    }

    private func handleVideoFrame(sessionId: String, frame: VideoFrame) {
        let decoder = hevcDecoders[sessionId]

        // Try SDK's built-in conversion first (works for raw codec).
        // For HEVC, makeUIImage() returns nil — fall back to hardware decoder.
        let image: UIImage
        if let direct = frame.makeUIImage() {
            image = direct
        } else if let decoded = decoder?.decode(frame.sampleBuffer) {
            image = decoded
        } else {
            return
        }

        // Forward to native view
        frameCallback?(image)

        // Emit metadata to JS
        emitEvent("onVideoFrame", [
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "width": Int(image.size.width),
            "height": Int(image.size.height)
        ])
    }

    private func handleError(sessionId: String, error: StreamError) {
        logger.error("Camera", "Stream error", context: [
            "sessionId": sessionId,
            "error": String(describing: error)
        ])

        emitEvent("onStreamError", mapStreamErrorToDict(error))
    }

    private func handlePhotoCapture(sessionId: String, photoData: PhotoData) {
        logger.info("Camera", "Photo captured", context: [
            "sessionId": sessionId,
            "format": String(describing: photoData.format)
        ])

        let tempDir = FileManager.default.temporaryDirectory
        let ext = photoData.format == .jpeg ? "jpg" : "heic"
        let filename = "emwdat_photo_\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)"
        let filePath = tempDir.appendingPathComponent(filename)

        do {
            try photoData.data.write(to: filePath)
            logger.info("Camera", "Photo saved", context: ["path": filePath.path])

            var payload: [String: Any] = [
                "filePath": filePath.path,
                "format": mapPhotoFormat(photoData.format),
                "timestamp": Int(Date().timeIntervalSince1970 * 1000)
            ]

            if let image = UIImage(data: photoData.data) {
                payload["width"] = Int(image.size.width * image.scale)
                payload["height"] = Int(image.size.height * image.scale)
            }

            emitEvent("onPhotoCaptured", payload)
        } catch {
            logger.error("Camera", "Failed to save photo", error: error)
        }
    }

    // MARK: - Cleanup

    /// Destroy a specific camera (listeners + decoder).
    private func destroyCamera(sessionId: String) {
        cancel(&cameraStateTokens, sessionId)
        cancel(&stateTokens, sessionId)
        cancel(&frameTokens, sessionId)
        cancel(&errorTokens, sessionId)
        cancel(&photoTokens, sessionId)
        cameras[sessionId] = nil
        hevcDecoders[sessionId]?.invalidate()
        hevcDecoders[sessionId] = nil
        logger.debug("Camera", "Camera destroyed", context: ["sessionId": sessionId])
    }

    private func cancel(_ tokens: inout [String: AnyListenerToken], _ sessionId: String) {
        guard let token = tokens.removeValue(forKey: sessionId) else { return }
        Task { await token.cancel() }
    }

    /// Full teardown for module lifecycle (OnDestroy).
    public func destroy() {
        for sessionId in cameras.keys {
            cameras[sessionId]?.stop()
            destroyCamera(sessionId: sessionId)
        }
    }

    // MARK: - Event Emission

    private func emitEvent(_ name: String, _ body: [String: Any]) {
        eventEmitter?(name, body)
    }

    // MARK: - Mapping Helpers

    private func mapCameraState(_ state: CameraState) -> String {
        switch state {
        case .starting: return "starting"
        case .started: return "started"
        case .stopping: return "stopping"
        case .stopped: return "stopped"
        @unknown default: return "stopped"
        }
    }

    private func mapStreamState(_ state: StreamState) -> String {
        switch state {
        case .stopping: return "stopping"
        case .stopped: return "stopped"
        case .waitingForDevice: return "waitingForDevice"
        case .starting: return "starting"
        case .streaming: return "streaming"
        case .paused: return "paused"
        @unknown default: return "stopped"
        }
    }

    /// Maps StreamError to a dictionary matching the TS discriminated union
    private func mapStreamErrorToDict(_ error: StreamError) -> [String: Any] {
        switch error {
        case .deviceNotFound(let deviceId):
            return ["type": "deviceNotFound", "deviceId": deviceId]
        case .deviceNotConnected(let deviceId):
            return ["type": "deviceNotConnected", "deviceId": deviceId]
        case .timeout:
            return ["type": "timeout"]
        case .permissionDenied:
            return ["type": "permissionDenied"]
        case .internalError:
            return ["type": "internalError"]
        case .videoStreamingError:
            return ["type": "videoStreamingError"]
        case .hingesClosed:
            return ["type": "hingesClosed"]
        case .thermalCritical:
            return ["type": "thermalCritical"]
        case .thermalEmergency:
            return ["type": "thermalEmergency"]
        case .peakPowerShutdown:
            return ["type": "peakPowerShutdown"]
        case .batteryCritical:
            return ["type": "batteryCritical"]
        case .photoCaptureFailed:
            return ["type": "photoCaptureFailed"]
        @unknown default:
            return ["type": "internalError"]
        }
    }

    private func mapPhotoFormat(_ format: PhotoCaptureFormat) -> String {
        switch format {
        case .jpeg: return "jpeg"
        case .heic: return "heic"
        @unknown default: return "jpeg"
        }
    }
}

// MARK: - Configuration Parsing

extension CameraSessionManager {
    /// Parse configuration from JavaScript object
    nonisolated public static func parseConfig(from dict: [String: Any]) -> StreamConfiguration {
        let videoCodec: VideoCodec
        let compressVideo = dict["compressVideo"] as? Bool ?? false
        if compressVideo || (dict["videoCodec"] as? String) == "hvc1" {
            videoCodec = .hvc1
        } else {
            videoCodec = .raw
        }

        let resolution: StreamingResolution
        if let resStr = dict["resolution"] as? String {
            switch resStr {
            case "high": resolution = .high
            case "medium": resolution = .medium
            default: resolution = .low
            }
        } else {
            resolution = .low
        }

        let frameRate = dict["frameRate"] as? Int ?? 15

        return StreamConfiguration(
            videoCodec: videoCodec,
            resolution: resolution,
            frameRate: UInt(frameRate)
        )
    }
}

// MARK: - Errors

public enum CameraSessionManagerError: LocalizedError {
    case sessionNotFound(String)
    case cameraNotAvailable(String)
    case notConfigured

    public var errorDescription: String? {
        switch self {
        case .sessionNotFound(let id):
            return "Session not found: \(id)"
        case .cameraNotAvailable(let id):
            return "Camera capability unavailable for session: \(id)"
        case .notConfigured:
            return "Wearables SDK has not been configured"
        }
    }
}
