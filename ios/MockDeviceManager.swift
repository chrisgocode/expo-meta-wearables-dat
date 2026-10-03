#if DEBUG
import Foundation
import UIKit
import MWDATCore
import MWDATMockDevice

/// Manages mock devices for testing without physical hardware.
/// Only available in DEBUG builds.
@MainActor
public final class MockDeviceManager {
    public static let shared = MockDeviceManager()

    private let logger = EMWDATLogger.shared

    /// Map of deviceIdentifier → MockGlasses instance
    private var devices: [String: any MockGlasses] = [:]

    private init() {}

    // MARK: - Kit Lifecycle

    public func enableMockDeviceKit(initiallyRegistered: Bool = true, initialPermissionsGranted: Bool = true) throws {
        try WearablesManager.shared.configure()
        let config = MockDeviceKitConfig(
            initiallyRegistered: initiallyRegistered,
            initialPermissionsGranted: initialPermissionsGranted
        )
        MockDeviceKit.shared.enable(config: config)
        logger.info("MockDeviceManager", "MockDeviceKit enabled", context: [
            "initiallyRegistered": initiallyRegistered,
            "initialPermissionsGranted": initialPermissionsGranted
        ])
    }

    public func disableMockDeviceKit() async {
        await MockDeviceKit.shared.disable()
        devices.removeAll()
        logger.info("MockDeviceManager", "MockDeviceKit disabled")
    }

    public func isMockDeviceKitEnabled() -> Bool {
        return MockDeviceKit.shared.isEnabled
    }

    // MARK: - Pair / Unpair

    public func pairMockDevice(model: String = "rayBanMeta") throws -> String {
        let device = try MockDeviceKit.shared.pairGlasses(model: mapGlassesModel(model))
        let id = "\(device.deviceIdentifier)"
        devices[id] = device
        logger.info("MockDeviceManager", "Paired mock device", context: ["id": id, "model": model])
        return id
    }

    public func unpairMockDevice(id: String) async throws {
        guard let device = devices[id] else {
            throw MockDeviceManagerError.deviceNotFound(id)
        }
        await MockDeviceKit.shared.unpairDevice(device)
        devices.removeValue(forKey: id)
        logger.info("MockDeviceManager", "Unpaired mock device", context: ["id": id])
    }

    public func getMockDevices() -> [String] {
        return Array(devices.keys)
    }

    // MARK: - Power

    public func powerOn(id: String) throws {
        try getDevice(id).powerOn()
    }

    public func powerOff(id: String) throws {
        try getDevice(id).powerOff()
    }

    // MARK: - Don / Doff

    public func don(id: String) throws {
        try getDevice(id).don()
    }

    public func doff(id: String) throws {
        try getDevice(id).doff()
    }

    // MARK: - Fold / Unfold

    public func fold(id: String) throws {
        try getDevice(id).fold()
    }

    public func unfold(id: String) throws {
        try getDevice(id).unfold()
    }

    // MARK: - Camera (file-based — synchronous since SDK 0.6)

    public func setCameraFeed(id: String, fileURL: URL) throws {
        let camera = try getDevice(id).services.camera
        camera.setCameraFeed(fileURL: fileURL)
    }

    public func setCapturedImage(id: String, fileURL: URL) throws {
        let camera = try getDevice(id).services.camera
        camera.setCapturedImage(fileURL: fileURL)
    }

    // MARK: - Camera (phone camera — synchronous since SDK 0.9)

    public func setCameraFeedFromCamera(id: String, facing: String) throws {
        let camera = try getDevice(id).services.camera
        let cameraFacing: CameraFacing = facing == "back" ? .back : .front
        camera.setCameraFeed(cameraFacing: cameraFacing)
    }

    // MARK: - Captouch (SDK 0.7+)

    public func tap(id: String) throws {
        try getDevice(id).services.captouch.tap()
    }

    public func tapAndHold(id: String) throws {
        try getDevice(id).services.captouch.tapAndHold()
    }

    // MARK: - Permissions

    public func setPermissionStatus(permission: String, status: String) {
        guard let perm = mapPermission(permission),
              let stat = mapPermissionStatus(status) else { return }
        MockDeviceKit.shared.permissions.set(perm, stat)
        logger.info("MockDeviceManager", "Set permission status", context: [
            "permission": permission,
            "status": status
        ])
    }

    public func setPermissionRequestResult(permission: String, result: String) {
        guard let perm = mapPermission(permission),
              let stat = mapPermissionStatus(result) else { return }
        MockDeviceKit.shared.permissions.setRequestResult(perm, result: stat)
        logger.info("MockDeviceManager", "Set permission request result", context: [
            "permission": permission,
            "result": result
        ])
    }

    public func createDisplayPreview(id: String) throws -> UIView {
        try getDevice(id).services.display.createPreviewView()
    }

    public func simulate(id: String, event: [String: Any]) throws -> Any? {
        let device = try getDevice(id)
        func text(_ key: String) throws -> String {
            guard let value = event[key] as? String else { throw invalid("Missing \(key)") }
            return value
        }
        switch try text("type") {
        case "battery":
            let level = event["level"] as? Int
            guard level == nil || (0...100).contains(level!) else { throw invalid("Battery must be 0–100 or null") }
            device.setBatteryLevel(level)
        case "charging":
            let values: [String: ChargingState] = ["unknown": .unknown, "charging": .charging, "notCharging": .notCharging]
            guard let value = values[try text("state")] else { throw invalid("Invalid charging state") }
            device.setChargingState(value)
        case "thermal":
            let values: [String: ThermalLevel] = ["unknown": .unknown, "none": .none, "light": .light, "moderate": .moderate,
                "severe": .severe, "critical": .critical, "emergency": .emergency, "shutdown": .shutdown]
            guard let value = values[try text("level")] else { throw invalid("Invalid thermal level") }
            device.setThermalLevel(value)
        case "input":
            guard let input = event["event"] as? [String: Any], let type = input["type"] as? String else { throw invalid("Missing input event") }
            let kit = device.services.input
            let sources: [String: MWDATMockDevice.InputSource] = ["captouch": .captouch, "neuralBand": .neuralBand, "captureButton": .captureButton,
                "actionButton": .actionButton, "neuralBandDrag": .neuralBandDrag, "unknown": .unknown]
            guard let source = sources[input["source"] as? String ?? "captouch"] else { throw invalid("Invalid input source") }
            switch type {
            case "nav":
                switch input["direction"] as? String {
                case "up": kit.navUp(source: source)
                case "down": kit.navDown(source: source)
                case "left": kit.navLeft(source: source)
                case "right": kit.navRight(source: source)
                default: throw invalid("Invalid navigation direction")
                }
            case "select": kit.select(source: source)
            case "back": kit.back(source: source)
            case "button": kit.button(type: .action)
            case "capture":
                let values: [String: MWDATMockDevice.CapturePressType] = ["shortPress": .shortPress, "hold": .hold, "doublePress": .doublePress]
                guard let press = values[input["pressType"] as? String ?? ""] else { throw invalid("Invalid capture press type") }
                kit.capture(pressType: press)
            case "drag":
                let values: [String: MWDATMockDevice.DragAction] = ["down": .down, "move": .move, "up": .up]
                guard let action = values[input["action"] as? String ?? ""] else { throw invalid("Invalid drag action") }
                let coords = try ["x", "y", "dx", "dy"].map { key -> Float in
                    guard let n = input[key] as? NSNumber, n.doubleValue.isFinite else { throw invalid("Invalid drag coordinate") }
                    return n.floatValue
                }
                kit.drag(action: action, x: coords[0], y: coords[1], dx: coords[2], dy: coords[3])
            default: throw invalid("Invalid input type")
            }
        case "motionFeed": device.services.motion.setMotionFeed(fileURL: try localURL(text("fileUrl")))
        case "transcription":
            let confidence = event["confidence"] as? Float ?? -1
            guard confidence == -1 || (0...1).contains(confidence) else { throw invalid("Invalid confidence") }
            device.services.speech.simulateTranscription(text: try text("text"), isFinal: event["isFinal"] as? Bool ?? true, confidence: confidence)
        case "speechLocale": device.services.speech.setLocale(try text("locale"))
        case "speechError":
            guard let code = event["code"] as? Int, let int32 = Int32(exactly: code) else { throw invalid("Invalid speech error code") }
            device.services.speech.simulateError(errorCode: int32, message: try text("message"))
        case "speechCompletion": device.services.speech.simulateCompletion()
        case "speechSource": device.services.speech.setTranscriptionSource(event["live"] as? Bool == true ? .liveDeviceAsr : .injected)
        case "launchApp":
            guard device.services.voiceInvocation.hasConnectedClients else { throw invalid("Start voice invocation listening first") }
            return device.services.voiceInvocation.sendLaunchAppAction()
        case "incompleteVoiceInvocation":
            guard device.services.voiceInvocation.hasConnectedClients else { throw invalid("Start voice invocation listening first") }
            return device.services.voiceInvocation.sendIncompleteAction()
        case "capturedPhoto": device.services.cameraCapture.setCapturedPhoto(fileURL: try localURL(text("fileUrl")))
        case "photoFailure": device.services.cameraCapture.simulateCaptureFailure()
        case "displayClick": return device.services.display.sendClick(identifier: try text("identifier"))
        default: throw invalid("Unknown mock event type")
        }
        return nil
    }
    private func localURL(_ path: String) throws -> URL {
        if let url = URL(string: path), url.isFileURL { return url }
        guard path.hasPrefix("/") else { throw invalid("Expected a local file URL or absolute path") }
        return URL(fileURLWithPath: path)
    }
    private func invalid(_ message: String) -> NSError { NSError(domain: "EMWDAT", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }

    // MARK: - Helpers

    private func mapGlassesModel(_ model: String) -> GlassesModel {
        switch model {
        case "oakleyMetaHSTN": return .oakleyMetaHSTN
        case "oakleyMetaVanguard": return .oakleyMetaVanguard
        case "rayBanMetaOptics": return .rayBanMetaOptics
        case "metaRayBanDisplay": return .metaRayBanDisplay
        case "metaGlasses": return .metaGlasses
        default: return .rayBanMeta
        }
    }

    private func getDevice(_ id: String) throws -> any MockGlasses {
        guard let device = devices[id] else {
            throw MockDeviceManagerError.deviceNotFound(id)
        }
        return device
    }

    private func mapPermission(_ permission: String) -> Permission? {
        switch permission {
        case "microphone": return .microphone
        case "camera": return .camera
        default: return nil
        }
    }

    private func mapPermissionStatus(_ status: String) -> PermissionStatus? {
        switch status {
        case "granted": return .granted
        case "denied": return .denied
        default: return nil
        }
    }
}

public enum MockDeviceManagerError: LocalizedError {
    case deviceNotFound(String)

    public var errorDescription: String? {
        switch self {
        case .deviceNotFound(let id):
            return "Mock device not found: \(id)"
        }
    }
}
#endif
