import ExpoModulesCore
import MWDATCore
import MWDATCamera
import MWDATDisplay
#if DEBUG
import MWDATMockDevice
#endif

public class EMWDATModule: Module {
    private let logger = EMWDATLogger.shared

    public func definition() -> ModuleDefinition {
        Name("EMWDAT")

        Events(
            "onRegistrationStateChange",
            "onDevicesChange",
            "onLinkStateChange",
            "onDeviceStateChange",
            "onStreamStateChange",
            "onCameraStateChange",
            "onVideoFrame",
            "onPhotoCaptured",
            "onStreamError",
            "onPermissionStatusChange",
            "onCompatibilityChange",
            "onDeviceSessionStateChange",
            "onDeviceSessionError",
            "onCapabilityStateChange",
            "onDisplayStateChange",
            "onDisplayTap",
            "onDisplayError",
            "onDisplayVideoEvent", "onInputEvent", "onMotionSample", "onTranscription", "onSpeechLocaleChange",
            "onExperimentalCapabilityStateChange", "onExperimentalCapabilityError", "onVoiceInvocation", "onVoiceInvocationLaunch",
            "onVoiceInvocationStateChange", "onVoiceInvocationError", "onRegistrationRequest", "onHighQualityPhotoCaptured",
            "onPhotoTransferProgress", "onAudioFrame"
        )

        // MARK: - Lifecycle

        OnCreate {
            self.logger.info("Module", "Module created")
            Task<Void, Never> { @MainActor in
                let emitter: EventEmitter = { [weak self] name, body in
                    self?.sendEvent(name, body)
                }
                WearablesManager.shared.setEventEmitter(emitter)
                CameraSessionManager.shared.setEventEmitter(emitter)
                DisplayManager.shared.setEventEmitter(emitter)
                ExperimentalCapabilitiesManager.shared.setEventEmitter(emitter)
            }
        }

        OnDestroy {
            self.logger.info("Module", "Module destroyed")
            Task { @MainActor in
                await ExperimentalCapabilitiesManager.shared.destroy()
                CameraSessionManager.shared.destroy()
                DisplayManager.shared.destroy()
                WearablesManager.shared.cleanup()
            }
        }

        // MARK: - Logging

        Function("setLogLevel") { (level: String) in
            let logLevel: EMWDATLogLevel
            switch level {
            case "debug": logLevel = .debug
            case "info": logLevel = .info
            case "warn": logLevel = .warn
            case "error": logLevel = .error
            case "none": logLevel = .none
            default: logLevel = .info
            }
            self.logger.setLogLevel(logLevel)
            self.logger.info("Module", "Log level set", context: ["level": level])
        }

        // MARK: - Configuration

        AsyncFunction("configure") { (promise: Promise) in
            Task { @MainActor in
                do {
                    try WearablesManager.shared.configure()
                    promise.resolve(nil)
                } catch let error as WearablesError {
                    promise.reject("CONFIGURATION_FAILED", self.describeWearablesError(error))
                } catch {
                    promise.reject("CONFIGURATION_FAILED", "Failed to configure SDK: \(error.localizedDescription)")
                }
            }
        }

        // MARK: - Registration

        Function("getRegistrationState") { () -> String in
            return "unavailable"
        }

        AsyncFunction("getRegistrationStateAsync") { (promise: Promise) in
            Task { @MainActor in
                let state = WearablesManager.shared.currentRegistrationState
                promise.resolve(self.mapRegistrationState(state))
            }
        }

        AsyncFunction("startRegistration") { (promise: Promise) in
            Task { @MainActor in
                do {
                    try await WearablesManager.shared.startRegistration()
                    promise.resolve(nil)
                } catch let error as RegistrationError {
                    promise.reject("REGISTRATION_FAILED", self.describeRegistrationError(error))
                } catch {
                    promise.reject("REGISTRATION_FAILED", error.localizedDescription)
                }
            }
        }

        AsyncFunction("startUnregistration") { (promise: Promise) in
            Task { @MainActor in
                do {
                    try await WearablesManager.shared.startUnregistration()
                    promise.resolve(nil)
                } catch let error as UnregistrationError {
                    promise.reject("UNREGISTRATION_FAILED", self.describeUnregistrationError(error))
                } catch {
                    promise.reject("UNREGISTRATION_FAILED", error.localizedDescription)
                }
            }
        }

        // MARK: - URL Handling

        AsyncFunction("handleUrl") { (url: String, promise: Promise) in
            guard let parsedUrl = URL(string: url) else {
                self.logger.warn("Module", "Invalid URL", context: ["url": url])
                promise.resolve(false)
                return
            }
            Task { @MainActor in
                do {
                    let handled = await WearablesManager.shared.handleUrl(parsedUrl)
                    promise.resolve(handled)
                } catch let error as WearablesHandleURLError {
                    switch error {
                    case .registrationError:
                        promise.reject("HANDLE_URL_REGISTRATION_ERROR", "\(error)")
                    case .unregistrationError:
                        promise.reject("HANDLE_URL_UNREGISTRATION_ERROR", "\(error)")
                    @unknown default:
                        promise.reject("HANDLE_URL_ERROR", "\(error)")
                    }
                } catch {
                    self.logger.error("Module", "handleUrl failed", error: error)
                    promise.resolve(false)
                }
            }
        }

        // MARK: - Permissions

        AsyncFunction("checkPermissionStatus") { (permission: String, promise: Promise) in
            guard permission == "camera" || permission == "microphone" else {
                promise.resolve("denied")
                return
            }
            Task { @MainActor in
                do {
                    let status = try await WearablesManager.shared.checkPermissionStatus(permission == "camera" ? .camera : .microphone)
                    promise.resolve(self.mapPermissionStatus(status))
                } catch {
                    self.logger.error("Module", "checkPermissionStatus failed", error: error)
                    promise.resolve("denied")
                }
            }
        }

        AsyncFunction("requestPermission") { (permission: String, promise: Promise) in
            guard permission == "camera" || permission == "microphone" else {
                promise.reject("INVALID_PERMISSION", "Unknown permission: \(permission)")
                return
            }
            Task { @MainActor in
                do {
                    let status = try await WearablesManager.shared.requestPermission(permission == "camera" ? .camera : .microphone)
                    promise.resolve(self.mapPermissionStatus(status))
                } catch {
                    promise.reject("PERMISSION_FAILED", error.localizedDescription)
                }
            }
        }

        // MARK: - Devices

        AsyncFunction("getDevices") { (promise: Promise) in
            Task { @MainActor in
                promise.resolve(WearablesManager.shared.getDevices())
            }
        }

        AsyncFunction("getDevice") { (identifier: String, promise: Promise) in
            Task { @MainActor in
                promise.resolve(WearablesManager.shared.getDevice(identifier: identifier))
            }
        }

        AsyncFunction("openFirmwareUpdate") { (promise: Promise) in
            Task { @MainActor in
                do {
                    try await WearablesManager.shared.openFirmwareUpdate()
                    promise.resolve(nil)
                } catch let error as NavigationError {
                    promise.reject("NAVIGATION_FAILED", error.description)
                } catch {
                    promise.reject("NAVIGATION_FAILED", error.localizedDescription)
                }
            }
        }

        AsyncFunction("openDATGlassesAppUpdate") { (promise: Promise) in
            Task { @MainActor in
                do {
                    try await WearablesManager.shared.openDATGlassesAppUpdate()
                    promise.resolve(nil)
                } catch let error as NavigationError {
                    promise.reject("NAVIGATION_FAILED", error.description)
                } catch {
                    promise.reject("NAVIGATION_FAILED", error.localizedDescription)
                }
            }
        }

        // MARK: - Session Management

        AsyncFunction("createSession") { (deviceId: String?, promise: Promise) in
            Task { @MainActor in
                do {
                    let sessionId = try WearablesManager.shared.createSession(deviceId: deviceId)
                    promise.resolve(sessionId)
                } catch {
                    promise.reject("SESSION_CREATE_FAILED", error.localizedDescription)
                }
            }
        }

        AsyncFunction("startSession") { (sessionId: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try WearablesManager.shared.startSession(sessionId: sessionId)
                    promise.resolve(nil)
                } catch {
                    promise.reject("SESSION_START_FAILED", error.localizedDescription)
                }
            }
        }

        AsyncFunction("stopSession") { (sessionId: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try WearablesManager.shared.stopSession(sessionId: sessionId)
                    promise.resolve(nil)
                } catch {
                    promise.reject("SESSION_STOP_FAILED", error.localizedDescription)
                }
            }
        }

        AsyncFunction("addCameraToSession") { (sessionId: String, config: [String: Any], promise: Promise) in
            Task { @MainActor in
                do {
                    let streamConfig = try CameraSessionManager.parseConfig(from: config)
                    try CameraSessionManager.shared.addCameraToSession(sessionId: sessionId, config: streamConfig, startStream: config["startStream"] as? Bool ?? true)
                    promise.resolve(nil)
                } catch let error as DeviceSessionError {
                    promise.reject("CAMERA_ADD_FAILED", error.description)
                } catch {
                    promise.reject("CAMERA_ADD_FAILED", error.localizedDescription)
                }
            }
        }

        AsyncFunction("removeCameraFromSession") { (sessionId: String, promise: Promise) in
            Task { @MainActor in
                CameraSessionManager.shared.removeCameraFromSession(sessionId: sessionId)
                promise.resolve(nil)
            }
        }

        // MARK: - Display

        AsyncFunction("addDisplayToSession") { (sessionId: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try DisplayManager.shared.addDisplayToSession(sessionId: sessionId)
                    promise.resolve(nil)
                } catch let error as DeviceSessionError {
                    promise.reject("DISPLAY_ADD_FAILED", error.description)
                } catch {
                    promise.reject("DISPLAY_ADD_FAILED", error.localizedDescription)
                }
            }
        }

        AsyncFunction("renderDisplay") { (sessionId: String, root: [String: Any], promise: Promise) in
            Task { @MainActor in
                do {
                    try await DisplayManager.shared.renderDisplay(sessionId: sessionId, root: root)
                    promise.resolve(nil)
                } catch let error as DisplayError {
                    DisplayManager.shared.emitDisplayError(sessionId: sessionId, error: error)
                    promise.reject("DISPLAY_RENDER_FAILED", error.description)
                } catch {
                    promise.reject("DISPLAY_RENDER_FAILED", error.localizedDescription)
                }
            }
        }

        AsyncFunction("clearDisplay") { (sessionId: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try await DisplayManager.shared.clearDisplay(sessionId: sessionId)
                    promise.resolve(nil)
                } catch let error as DisplayError {
                    DisplayManager.shared.emitDisplayError(sessionId: sessionId, error: error)
                    promise.reject("DISPLAY_CLEAR_FAILED", error.description)
                } catch {
                    promise.reject("DISPLAY_CLEAR_FAILED", error.localizedDescription)
                }
            }
        }

        AsyncFunction("removeDisplayFromSession") { (sessionId: String, promise: Promise) in
            Task { @MainActor in
                DisplayManager.shared.removeDisplayFromSession(sessionId: sessionId)
                promise.resolve(nil)
            }
        }

        AsyncFunction("getDisplayState") { (sessionId: String, promise: Promise) in
            Task { @MainActor in
                promise.resolve(DisplayManager.shared.getDisplayState(sessionId: sessionId) ?? "stopped")
            }
        }

        // MARK: - Photo Capture

        AsyncFunction("capturePhoto") { (format: String, promise: Promise) in
            Task { @MainActor in
                let photoFormat: PhotoCaptureFormat = format == "heic" ? .heic : .jpeg
                let success = CameraSessionManager.shared.capturePhoto(format: photoFormat)
                if success {
                    promise.resolve(nil)
                } else {
                    promise.reject("CAPTURE_FAILED", "Failed to capture photo - stream may not be active")
                }
            }
        }

        // MARK: - Mock Device Kit (DEBUG only)

        #if DEBUG
        AsyncFunction("enableMockDeviceKit") { (config: [String: Any], promise: Promise) in
            Task { @MainActor in
                let initiallyRegistered = config["initiallyRegistered"] as? Bool ?? true
                let initialPermissionsGranted = config["initialPermissionsGranted"] as? Bool ?? true
                do {
                    try MockDeviceManager.shared.enableMockDeviceKit(
                        initiallyRegistered: initiallyRegistered,
                        initialPermissionsGranted: initialPermissionsGranted
                    )
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("disableMockDeviceKit") { (promise: Promise) in
            Task { @MainActor in
                await MockDeviceManager.shared.disableMockDeviceKit()
                promise.resolve(nil)
            }
        }

        AsyncFunction("isMockDeviceKitEnabled") { (promise: Promise) in
            Task { @MainActor in
                promise.resolve(MockDeviceManager.shared.isMockDeviceKitEnabled())
            }
        }

        AsyncFunction("pairMockDevice") { (model: String?, promise: Promise) in
            Task { @MainActor in
                do {
                    let id = try MockDeviceManager.shared.pairMockDevice(model: model ?? "rayBanMeta")
                    promise.resolve(id)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("unpairMockDevice") { (deviceId: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try await MockDeviceManager.shared.unpairMockDevice(id: deviceId)
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("getMockDevices") { (promise: Promise) in
            Task { @MainActor in
                promise.resolve(MockDeviceManager.shared.getMockDevices())
            }
        }

        AsyncFunction("mockDevicePowerOn") { (id: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try MockDeviceManager.shared.powerOn(id: id)
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("mockDevicePowerOff") { (id: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try MockDeviceManager.shared.powerOff(id: id)
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("mockDeviceDon") { (id: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try MockDeviceManager.shared.don(id: id)
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("mockDeviceDoff") { (id: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try MockDeviceManager.shared.doff(id: id)
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("mockDeviceFold") { (id: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try MockDeviceManager.shared.fold(id: id)
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("mockDeviceUnfold") { (id: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try MockDeviceManager.shared.unfold(id: id)
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("mockDeviceTap") { (id: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try MockDeviceManager.shared.tap(id: id)
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("mockDeviceTapAndHold") { (id: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try MockDeviceManager.shared.tapAndHold(id: id)
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("mockDeviceSetCameraFeed") { (id: String, fileUrl: String, promise: Promise) in
            let url: URL
            if fileUrl.hasPrefix("file://") {
                let path = String(fileUrl.dropFirst("file://".count))
                url = URL(fileURLWithPath: path)
            } else if let parsed = URL(string: fileUrl) {
                url = parsed
            } else {
                promise.reject("MOCK_DEVICE_ERROR", "Invalid file URL: \(fileUrl)")
                return
            }
            Task { @MainActor in
                do {
                    try MockDeviceManager.shared.setCameraFeed(id: id, fileURL: url)
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("mockDeviceSetCapturedImage") { (id: String, fileUrl: String, promise: Promise) in
            let url: URL
            if fileUrl.hasPrefix("file://") {
                let path = String(fileUrl.dropFirst("file://".count))
                url = URL(fileURLWithPath: path)
            } else if let parsed = URL(string: fileUrl) {
                url = parsed
            } else {
                promise.reject("MOCK_DEVICE_ERROR", "Invalid file URL: \(fileUrl)")
                return
            }
            Task { @MainActor in
                do {
                    try MockDeviceManager.shared.setCapturedImage(id: id, fileURL: url)
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("mockDeviceSetCameraFeedFromCamera") { (id: String, facing: String, promise: Promise) in
            Task { @MainActor in
                do {
                    try MockDeviceManager.shared.setCameraFeedFromCamera(id: id, facing: facing)
                    promise.resolve(nil)
                } catch {
                    promise.reject("MOCK_DEVICE_ERROR", error.localizedDescription)
                }
            }
        }

        AsyncFunction("mockSetPermissionStatus") { (permission: String, status: String, promise: Promise) in
            Task { @MainActor in
                MockDeviceManager.shared.setPermissionStatus(permission: permission, status: status)
                promise.resolve(nil)
            }
        }

        AsyncFunction("mockSetPermissionRequestResult") { (permission: String, result: String, promise: Promise) in
            Task { @MainActor in
                MockDeviceManager.shared.setPermissionRequestResult(permission: permission, result: result)
                promise.resolve(nil)
            }
        }
        #endif


        // DAT 1.0 capabilities
        AsyncFunction("addInputsToSession") { (id: String, config: [String: Any]) in
            try await MainActor.run { try ExperimentalCapabilitiesManager.shared.addInputs(id, config: config) }
        }
        AsyncFunction("removeInputsFromSession") { (id: String) in
            try await MainActor.run { try ExperimentalCapabilitiesManager.shared.removeInputs(id) }
        }
        AsyncFunction("addMotionToSession") { (id: String, config: [String: Any]) in
            try await MainActor.run { try ExperimentalCapabilitiesManager.shared.addMotion(id, config: config) }
        }
        AsyncFunction("startMotion") { (id: String) in
            try await MainActor.run { try ExperimentalCapabilitiesManager.shared.startMotion(id) }
        }
        AsyncFunction("stopMotion") { (id: String) in
            try await MainActor.run { try ExperimentalCapabilitiesManager.shared.stopMotion(id) }
        }
        AsyncFunction("removeMotionFromSession") { (id: String) in
            try await MainActor.run { try ExperimentalCapabilitiesManager.shared.removeMotion(id) }
        }
        AsyncFunction("addSpeechToSession") { (id: String) in
            try await MainActor.run { try ExperimentalCapabilitiesManager.shared.addSpeech(id) }
        }
        AsyncFunction("startSpeech") { (id: String) in
            try await MainActor.run { try ExperimentalCapabilitiesManager.shared.startSpeech(id) }
        }
        AsyncFunction("stopSpeech") { (id: String) in
            try await MainActor.run { try ExperimentalCapabilitiesManager.shared.stopSpeech(id) }
        }
        AsyncFunction("removeSpeechFromSession") { (id: String) in
            try await MainActor.run { try ExperimentalCapabilitiesManager.shared.removeSpeech(id) }
        }
        AsyncFunction("startVoiceInvocations") { (id: String) in
            try await MainActor.run { try ExperimentalCapabilitiesManager.shared.startVoice(id) }
        }
        AsyncFunction("startPhotoCapture") { (id: String) in
            try await MainActor.run { try CameraSessionManager.shared.startPhotoCapture(id) }
        }
        AsyncFunction("stopPhotoCapture") { (id: String) in
            try await MainActor.run { try CameraSessionManager.shared.stopPhotoCapture(id) }
        }
        AsyncFunction("captureHighQualityPhoto") { (id: String, config: [String: Any]) in
            try await MainActor.run { try CameraSessionManager.shared.captureHighQualityPhoto(id, config: config) }
        }
        AsyncFunction("startCameraStream") { (id: String) in
            try await MainActor.run { try CameraSessionManager.shared.startCameraStream(id) }
        }
        AsyncFunction("stopCameraStream") { (id: String) in
            try await MainActor.run { try CameraSessionManager.shared.stopCameraStream(id) }
        }
        AsyncFunction("stopVoiceInvocations") { await ExperimentalCapabilitiesManager.shared.stopVoice() }
        AsyncFunction("respondToVoiceInvocation") { (id: String, success: Bool, output: String?) in
            try await ExperimentalCapabilitiesManager.shared.respondToVoice(id, success: success, output: output)
        }
        AsyncFunction("getPendingVoiceInvocations") {
            await MainActor.run { ExperimentalCapabilitiesManager.shared.getPendingVoiceInvocations() }
        }
        AsyncFunction("isVoiceInvocationLaunch") { false }
        AsyncFunction("getPendingRegistrationRequests") {
            await MainActor.run { ExperimentalCapabilitiesManager.shared.getPendingRegistrationRequests() }
        }
        AsyncFunction("respondToRegistrationRequest") { (id: String, accept: Bool) in
            try await ExperimentalCapabilitiesManager.shared.respondToRegistrationRequest(id, accept: accept)
        }
        AsyncFunction("getSessionDevice") { (id: String) in
            await MainActor.run { () -> [String: Any]? in
                guard let device = WearablesManager.shared.getSession(sessionId: id)?.device else { return nil }
                return WearablesManager.shared.getDevice(identifier: device.identifier)
            }
        }
        AsyncFunction("mockDeviceSimulate") { (id: String, event: [String: Any]) in
#if DEBUG
            return try await MainActor.run { try MockDeviceManager.shared.simulate(id: id, event: event) }
#else
            throw NSError(domain: "EMWDAT", code: 1, userInfo: [NSLocalizedDescriptionKey: "Mock devices are only available in debug builds"])
#endif
        }
        AsyncFunction("startMockDeviceTestServer") { (port: Int) in
#if DEBUG
            guard (0...65535).contains(port) else { throw NSError(domain: "EMWDAT", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid port"]) }
            return Int(try await MWDATMockDevice.MockDeviceKit.shared.startTestServer(port: UInt16(port)))
#else
            throw NSError(domain: "EMWDAT", code: 1, userInfo: [NSLocalizedDescriptionKey: "Mock devices are only available in debug builds"])
#endif
        }
        AsyncFunction("stopMockDeviceTestServer") {
#if DEBUG
            await MWDATMockDevice.MockDeviceKit.shared.stopTestServer()
#else
            throw NSError(domain: "EMWDAT", code: 1, userInfo: [NSLocalizedDescriptionKey: "Mock devices are only available in debug builds"])
#endif
        }
        AsyncFunction("mockSimulateRegistrationOutcome") { (_: Bool) in
            throw NSError(domain: "EMWDAT", code: 1, userInfo: [NSLocalizedDescriptionKey: "Registration outcome injection is Android-only"])
        }
        // MARK: - View

        View(EMWDATStreamView.self) {
            Prop("mockDisplayDeviceId") { (view: EMWDATStreamView, id: String?) in
                Task { @MainActor in
                    do { try view.setMockDisplayDevice(id) }
                    catch { self.logger.error("StreamView", "Mock display preview failed", error: error) }
                }
            }
            Prop("isActive") { (view: EMWDATStreamView, isActive: Bool) in
                view.setActive(isActive)
            }

            Prop("resizeMode") { (view: EMWDATStreamView, resizeMode: String) in
                view.setResizeMode(resizeMode)
            }
        }
    }

    // MARK: - Mapping Helpers

    private func mapRegistrationState(_ state: RegistrationState) -> String {
        switch state {
        case .unavailable: return "unavailable"
        case .available: return "available"
        case .registering: return "registering"
        case .registered: return "registered"
        @unknown default: return "unavailable"
        }
    }

    private func mapPermissionStatus(_ status: PermissionStatus) -> String {
        switch status {
        case .granted: return "granted"
        case .denied: return "denied"
        @unknown default: return "denied"
        }
    }

    // MARK: - Error Descriptions

    private func describeWearablesError(_ error: WearablesError) -> String {
        switch error {
        case .internalError:
            return "Internal SDK error during configuration."
        case .alreadyConfigured:
            return "Wearables SDK is already configured."
        case .configurationError:
            return "SDK configuration error. Check Info.plist MWDAT dictionary (MetaAppID, ClientToken, AppLinkURLScheme)."
        default:
            return error.description
        }
    }

    private func describeRegistrationError(_ error: RegistrationError) -> String {
        switch error {
        case .alreadyRegistered:
            return "Device is already registered."
        case .configurationInvalid:
            return "MWDAT configuration is invalid. Check Info.plist MWDAT dictionary (MetaAppID, ClientToken, AppLinkURLScheme). Ensure Developer Mode is enabled in the Meta AI app."
        case .metaAINotInstalled:
            return "Meta AI app is not installed on this device."
        case .networkUnavailable:
            return "Network is unavailable."
        case .unknown:
            return "Unknown registration error."
        @unknown default:
            return "Unexpected registration error."
        }
    }

    private func describeUnregistrationError(_ error: UnregistrationError) -> String {
        switch error {
        case .alreadyUnregistered:
            return "Device is already unregistered."
        case .configurationInvalid:
            return "MWDAT configuration is invalid. Check Info.plist MWDAT dictionary."
        case .metaAINotInstalled:
            return "Meta AI app is not installed on this device."
        case .unknown:
            return "Unknown unregistration error."
        @unknown default:
            return "Unexpected unregistration error."
        }
    }
}
