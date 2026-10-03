import Foundation
import MWDATCore
import MWDATInputs
import MWDATMotion
import MWDATSpeech

/// DAT 1.0 capabilities share the existing device sessions; voice listening is app scoped.
@MainActor
final class ExperimentalCapabilitiesManager {
    static let shared = ExperimentalCapabilitiesManager()
    private var emit: EventEmitter?
    private var inputs: [String: Inputs] = [:]
    private var motion: [String: Motion] = [:]
    private var speech: [String: Speech] = [:]
    private var tasks: [String: Task<Void, Never>] = [:]
    private var tokens: [String: [AnyListenerToken]] = [:]
    private var voice: VoiceInvocationsStream?
    private var voiceTokens: [AnyListenerToken] = []
    private var responses: [String: any ResponseHandle] = [:]
    private var pendingInvocations: [String: [String: Any]] = [:]
    private var registrationRequests: [String: RegistrationRequest] = [:]

    func setEventEmitter(_ emitter: @escaping EventEmitter) { emit = emitter }

    private func session(_ id: String) throws -> DeviceSession {
        guard let session = WearablesManager.shared.getSession(sessionId: id) else {
            throw WearablesManagerError.sessionNotFound(id)
        }
        return session
    }

    func addInputs(_ id: String, config: [String: Any]) throws {
        guard inputs[id] == nil else { throw invalid("Inputs already attached") }
        let sources: [String: InputSource] = ["captouch": .captouch, "neuralBand": .neuralBand,
            "captureButton": .captureButton, "actionButton": .actionButton, "neuralBandDrag": .neuralBandDrag, "unknown": .unknown]
        var configuration = InputsConfiguration(consumeBack: config["consumeBack"] as? Bool ?? true)
        if let names = config["sources"] as? [String] {
            let selected = try names.map { name -> InputSource in
                guard let source = sources[name] else { throw invalid("Unknown input source: \(name)") }
                return source
            }
            configuration = InputsConfiguration(sources: Set(selected), consumeBack: configuration.consumeBack)
        }
        guard let capability = try session(id).addInputs(configuration: configuration) else {
            throw invalid("Inputs capability unavailable")
        }
        inputs[id] = capability
        let key = id + ":inputs"
        tokens[key] = [
            capability.statePublisher.listen { [weak self] state in
                let name: String
                switch state { case .inactive: name = "inactive"; case .activating: name = "activating";
                case .active: name = "active"; case .deactivating: name = "deactivating"; @unknown default: name = "inactive" }
                Task { @MainActor in self?.state(id, "inputs", name) }
            },
            capability.errorPublisher.listen { [weak self] error in
                Task { @MainActor in self?.error(id, "inputs", error) }
            }
        ]
        tasks[key] = Task { [weak self] in
            for await event in capability.events {
                self?.emit?("onInputEvent", ["sessionId": id].merging(Self.serializeInput(event)) { _, new in new })
            }
        }
    }

    func removeInputs(_ id: String) throws {
        try session(id).removeInputs()
        inputs[id] = nil
        cancel(id + ":inputs")
    }

    func addMotion(_ id: String, config: [String: Any]) throws {
        guard motion[id] == nil else { throw invalid("Motion already attached") }
        let rates: [Int: MotionSamplingRate] = [5: .hz5, 10: .hz10, 15: .hz15, 24: .hz24, 30: .hz30, 60: .hz60]
        guard let rate = rates[config["samplingRate"] as? Int ?? 10] else { throw invalid("Invalid motion sampling rate") }
        guard let capability = try session(id).addMotion(configuration: MotionConfiguration(samplingRate: rate)) else {
            throw invalid("Motion capability unavailable")
        }
        motion[id] = capability
        let key = id + ":motion"
        tokens[key] = [
            capability.statePublisher.listen { [weak self] state in
                let name: String
                switch state { case .stopped: name = "stopped"; case .starting: name = "starting";
                case .started: name = "started"; case .stopping: name = "stopping"; @unknown default: name = "stopped" }
                Task { @MainActor in self?.state(id, "motion", name) }
            },
            capability.errorPublisher.listen { [weak self] error in
                Task { @MainActor in self?.error(id, "motion", error) }
            }
        ]
        tasks[key] = Task { [weak self] in
            for await sample in capability.samples {
                var body: [String: Any] = ["sessionId": id, "timestampNs": String(sample.timestampNs), "source": String(describing: sample.source)]
                if let value = sample.accelerometer { body["accelerometer"] = Self.vector(value) }
                if let value = sample.gyroscope { body["gyroscope"] = Self.vector(value) }
                if let value = sample.magnetometer { body["magnetometer"] = Self.vector(value) }
                if let value = sample.orientation { body["orientation"] = ["x": value.x, "y": value.y, "z": value.z, "w": value.w] }
                self?.emit?("onMotionSample", body)
            }
        }
        capability.start()
    }

    func startMotion(_ id: String) throws {
        guard let capability = motion[id] else { throw invalid("Motion not attached") }
        capability.start()
    }
    func stopMotion(_ id: String) throws {
        guard let capability = motion[id] else { throw invalid("Motion not attached") }
        capability.stop()
    }
    func removeMotion(_ id: String) throws {
        try session(id).removeMotion()
        motion[id] = nil
        cancel(id + ":motion")
    }

    func addSpeech(_ id: String) throws {
        guard speech[id] == nil else { throw invalid("Speech already attached") }
        guard let capability = try session(id).addSpeech() else { throw invalid("Speech capability unavailable") }
        speech[id] = capability
        tokens[id + ":speech"] = [
            capability.statePublisher.listen { [weak self] state in
                let name: String
                switch state { case .stopped: name = "stopped"; case .starting: name = "starting";
                case .started: name = "started"; case .stopping: name = "stopping" }
                Task { @MainActor in self?.state(id, "speech", name) }
            },
            capability.errorPublisher.listen { [weak self] error in
                Task { @MainActor in self?.error(id, "speech", error) }
            },
            capability.transcriptionPublisher.listen { [weak self] result in
                Task { @MainActor in self?.emit?("onTranscription", ["sessionId": id, "text": result.text,
                    "isFinal": result.isFinal, "confidence": result.confidence]) }
            },
            capability.localePublisher.listen { [weak self] locale in
                Task { @MainActor in self?.emit?("onSpeechLocaleChange", ["sessionId": id, "locale": locale]) }
            }
        ]
        capability.start()
    }
    func startSpeech(_ id: String) throws {
        guard let capability = speech[id] else { throw invalid("Speech not attached") }
        capability.start()
    }
    func stopSpeech(_ id: String) throws {
        guard let capability = speech[id] else { throw invalid("Speech not attached") }
        capability.stop()
    }
    func removeSpeech(_ id: String) throws {
        try session(id).removeSpeech()
        speech[id] = nil
        cancel(id + ":speech")
    }

    func startVoice(_ deviceId: String) throws {
        guard WearablesManager.shared.isConfigured else { throw WearablesManagerError.notConfigured }
        guard voice == nil else { throw invalid("Voice invocation stream already started") }
        let stream = try VoiceInvocationsStream(wearables: Wearables.shared)
        voiceTokens = [
            stream.invocationsPublisher.listen { [weak self] invocation in
                guard let launch = invocation as? LaunchApp else { return }
                Task { @MainActor in
                    guard let self, self.voice === stream else { return }
                    let id = UUID().uuidString
                    let body: [String: Any] = ["invocationId": id, "type": "launchApp", "deviceId": launch.deviceIdentifier]
                    self.responses[id] = launch.responseHandle
                    self.pendingInvocations[id] = body
                    self.emit?("onVoiceInvocation", body)
                }
            },
            stream.errorPublisher.listen { [weak self] error in
                Task { @MainActor in self?.emit?("onVoiceInvocationError", ["error": String(describing: error), "message": error.description]) }
            }
        ]
        voice = stream
        emit?("onVoiceInvocationStateChange", ["state": "starting"])
        do {
            try stream.start(deviceIdentifier: deviceId)
            emit?("onVoiceInvocationStateChange", ["state": "started"])
        } catch {
            voice = nil
            stream.stop()
            for token in voiceTokens { Task { await token.cancel() } }
            voiceTokens.removeAll()
            emit?("onVoiceInvocationStateChange", ["state": "stopped"])
            throw error
        }
    }

    func respondToVoice(_ id: String, success: Bool, output: String?) async throws -> Bool {
        guard let response = responses.removeValue(forKey: id) else { throw invalid("Unknown or already answered voice invocation") }
        pendingInvocations[id] = nil
        return await (success ? response.sendSuccess(actionOutput: output) : response.sendFailure(actionOutput: output))
    }
    func getPendingVoiceInvocations() -> [[String: Any]] { Array(pendingInvocations.values) }

    func stopVoice() async {
        let stream = voice
        voice = nil
        let unanswered = Array(responses.values)
        responses.removeAll()
        pendingInvocations.removeAll()
        let oldTokens = voiceTokens
        voiceTokens.removeAll()
        for token in oldTokens { await token.cancel() }
        for response in unanswered { _ = await response.sendFailure(actionOutput: nil) }
        stream?.stop()
        emit?("onVoiceInvocationStateChange", ["state": "stopped"])
    }

    func receiveRegistrationRequest(_ request: RegistrationRequest) {
        // flowID is stable across duplicate app-delegate/module URL delivery.
        guard registrationRequests[request.flowID] == nil else { return }
        registrationRequests[request.flowID] = request
        emit?("onRegistrationRequest", serializeRegistrationRequest(request))
    }
    private func serializeRegistrationRequest(_ request: RegistrationRequest) -> [String: Any] {
        ["requestId": request.flowID, "flowId": request.flowID, "protocolVersion": request.protocolVersion]
    }
    func getPendingRegistrationRequests() -> [[String: Any]] { registrationRequests.values.map(serializeRegistrationRequest) }
    func respondToRegistrationRequest(_ id: String, accept: Bool) async throws {
        guard let request = registrationRequests.removeValue(forKey: id) else { throw invalid("Unknown or already handled registration request") }
        if accept { try await request.continueRegistration() } else { try await request.cancelRegistration() }
    }

    func removeSession(_ id: String) {
        for capability in ["inputs", "motion", "speech"] { cancel(id + ":" + capability) }
        inputs[id] = nil
        motion[id] = nil
        speech[id] = nil
    }
    func destroy() async {
        for id in Set(inputs.keys).union(motion.keys).union(speech.keys) { removeSession(id) }
        await stopVoice()
        let requests = Array(registrationRequests.values)
        registrationRequests.removeAll()
        for request in requests { try? await request.cancelRegistration() }
    }
    private func cancel(_ key: String) {
        tasks.removeValue(forKey: key)?.cancel()
        let old = tokens.removeValue(forKey: key) ?? []
        Task { for token in old { await token.cancel() } }
    }
    private func state(_ id: String, _ capability: String, _ name: String) {
        emit?("onExperimentalCapabilityStateChange", ["sessionId": id, "capability": capability, "state": name])
    }
    private func error(_ id: String, _ capability: String, _ error: any DatError) {
        emit?("onExperimentalCapabilityError", ["sessionId": id, "capability": capability,
            "error": String(describing: error), "message": error.description])
    }
    private func invalid(_ message: String) -> NSError { NSError(domain: "EMWDAT", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    private static func vector(_ v: Vector3) -> [String: Float] { ["x": v.x, "y": v.y, "z": v.z] }
    private static func serializeInput(_ event: InputEvent) -> [String: Any] {
        var body: [String: Any] = ["source": String(describing: event.source), "timestampMs": event.timestampMs]
        switch event {
        case .nav(let direction, _, _): body["type"] = "nav"; body["direction"] = String(describing: direction)
        case .select: body["type"] = "select"
        case .back: body["type"] = "back"
        case .button(let button, _, _): body["type"] = "button"; body["button"] = String(describing: button)
        case .capture(let press, _, _): body["type"] = "capture"; body["pressType"] = String(describing: press)
        case .drag(let action, let x, let y, let dx, let dy, _, _):
            body.merge(["type": "drag", "action": String(describing: action), "x": x, "y": y, "dx": dx, "dy": dy]) { _, new in new }
        @unknown default: body["type"] = "unknown"
        }
        return body
    }
}
