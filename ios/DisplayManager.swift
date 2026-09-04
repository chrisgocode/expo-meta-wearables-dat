import Foundation
import MWDATCore
import MWDATDisplay

/// Manages the display capability attached to a `DeviceSession`.
///
/// SDK 0.9 reaches the Meta Ray-Ban Display through `DeviceSession.addDisplay()`, which returns a
/// `Display` whose `send(_:)` replaces the entire screen — there is no partial update, and the
/// glasses retain no state.
///
/// Unlike Android, iOS requires an explicit `start()` after attaching; `addDisplayToSession`
/// hides that difference.
@MainActor
public final class DisplayManager {
    public static let shared = DisplayManager()

    private let logger = EMWDATLogger.shared

    // MARK: - State

    private var displays: [String: Display] = [:]
    private var stateTokens: [String: AnyListenerToken] = [:]

    // MARK: - Callbacks

    private var eventEmitter: EventEmitter?

    private init() {}

    public func setEventEmitter(_ emitter: @escaping EventEmitter) {
        self.eventEmitter = emitter
    }

    // MARK: - Display Capability Control

    /// Add the display capability to a device session and start it.
    public func addDisplayToSession(sessionId: String) throws {
        guard let session = WearablesManager.shared.getSession(sessionId: sessionId) else {
            throw DisplayManagerError.sessionNotFound(sessionId)
        }

        logger.info("Display", "Adding display to session", context: ["sessionId": sessionId])

        let display = try session.addDisplay()
        displays[sessionId] = display

        stateTokens[sessionId] = display.statePublisher.listen { [weak self] state in
            Task { @MainActor in
                self?.handleStateChange(sessionId: sessionId, state: state)
            }
        }

        display.onPlaybackEvent = { [weak self] event in
            Task { @MainActor in
                self?.handlePlaybackEvent(sessionId: sessionId, event: event)
            }
        }

        // iOS-only: Android starts on attach.
        display.start()

        emitEvent("onCapabilityStateChange", [
            "sessionId": sessionId,
            "state": "active"
        ])

        logger.info("Display", "Display added and started", context: ["sessionId": sessionId])
    }

    /// Replace the entire screen with the given tree.
    public func renderDisplay(sessionId: String, root: [String: Any]) async throws {
        guard let display = displays[sessionId] else {
            throw DisplayManagerError.displayNotAvailable(sessionId)
        }

        let view = try buildRoot(sessionId: sessionId, node: root)
        try await display.send(view)
    }

    /// Clear the screen without detaching the capability.
    public func clearDisplay(sessionId: String) async throws {
        guard let display = displays[sessionId] else {
            throw DisplayManagerError.displayNotAvailable(sessionId)
        }
        try await display.clearDisplay()
    }

    /// Detach the display capability from a session.
    public func removeDisplayFromSession(sessionId: String) {
        displays[sessionId]?.onPlaybackEvent = nil
        displays[sessionId]?.stop()
        displays.removeValue(forKey: sessionId)
        cancel(&stateTokens, sessionId)

        emitEvent("onCapabilityStateChange", [
            "sessionId": sessionId,
            "state": "stopped"
        ])

        logger.info("Display", "Display removed from session", context: ["sessionId": sessionId])
    }

    /// Current display state, or `nil` when no display is attached.
    public func getDisplayState(sessionId: String) -> String? {
        guard let display = displays[sessionId] else { return nil }
        return mapDisplayState(display.state)
    }

    // MARK: - Tree Building

    /// Build the root view. Only flex and video are renderable at the root: they are the only
    /// two types conforming to `DisplayableView`.
    private func buildRoot(sessionId: String, node: [String: Any]) throws -> any DisplayableView {
        let type = node["type"] as? String ?? ""

        switch type {
        case "flex":
            return try buildFlex(sessionId: sessionId, node: node)
        case "video":
            guard let uri = node["uri"] as? String else {
                throw DisplayManagerError.invalidTree("video node is missing \"uri\"")
            }
            return VideoPlayer(provider: .uri(uri), codec: .mp4) { [weak self] error in
                Task { @MainActor in
                    self?.handleVideoError(sessionId: sessionId, error: error)
                }
            }
        default:
            throw DisplayManagerError.invalidTree(
                "root node must be \"flex\" or \"video\", received \"\(type)\""
            )
        }
    }

    private func buildFlex(sessionId: String, node: [String: Any]) throws -> FlexBox {
        let children = node["children"] as? [[String: Any]] ?? []
        let built = try children.map { try buildChild(sessionId: sessionId, node: $0) }

        var flex = FlexBox(
            direction: mapDirection(node["direction"] as? String),
            spacing: node["spacing"] as? Double ?? 0,
            alignment: mapAlignment(node["alignment"] as? String) ?? .start,
            crossAlignment: mapAlignment(node["crossAlignment"] as? String) ?? .start,
            wrap: node["wrap"] as? Bool ?? false,
            padding: mapPadding(node["padding"] as? [String: Any])
        ) {
            for child in built { child }
        }

        if let background = node["background"] as? String, background == "card" {
            flex = flex.background(MWDATDisplay.Background.card)
        }

        if let tapId = node["tapId"] as? String {
            flex = flex.onTap { [weak self] in
                Task { @MainActor in
                    self?.emitTap(sessionId: sessionId, tapId: tapId)
                }
            }
        }

        return applyFlexChildProps(flex, node) { $0.flexGrow($1) } shrink: { $0.flexShrink($1) }
            alignSelf: { $0.alignSelf($1) }
    }

    private func buildChild(sessionId: String, node: [String: Any]) throws -> any ViewComponent {
        let type = node["type"] as? String ?? ""

        switch type {
        case "flex":
            return try buildFlex(sessionId: sessionId, node: node)

        case "text":
            guard let content = node["content"] as? String else {
                throw DisplayManagerError.invalidTree("text node is missing \"content\"")
            }
            let text = Text(
                content,
                style: mapTextStyle(node["style"] as? String),
                color: mapTextColor(node["color"] as? String)
            )
            return applyFlexChildProps(text, node) { $0.flexGrow($1) } shrink: { $0.flexShrink($1) }
                alignSelf: { $0.alignSelf($1) }

        case "button":
            return try buildButton(sessionId: sessionId, node: node)

        case "image":
            guard let uri = node["uri"] as? String else {
                throw DisplayManagerError.invalidTree("image node is missing \"uri\"")
            }
            let image = Image(
                uri: uri,
                sizePreset: mapImageSize(node["sizePreset"] as? String),
                cornerRadius: mapCornerRadius(node["cornerRadius"] as? String)
            )
            return applyFlexChildProps(image, node) { $0.flexGrow($1) } shrink: { $0.flexShrink($1) }
                alignSelf: { $0.alignSelf($1) }

        case "icon":
            guard
                let rawName = node["name"] as? String,
                let name = IconName(rawValue: rawName)
            else {
                throw DisplayManagerError.invalidTree(
                    "icon node has a missing or unknown \"name\": \(node["name"] ?? "nil")"
                )
            }
            let icon = Icon(name: name, style: mapIconStyle(node["style"] as? String))
            return applyFlexChildProps(icon, node) { $0.flexGrow($1) } shrink: { $0.flexShrink($1) }
                alignSelf: { $0.alignSelf($1) }

        case "buttonGroup":
            let buttons = node["buttons"] as? [[String: Any]] ?? []
            let built = try buttons.map { try buildButton(sessionId: sessionId, node: $0) }
            let group = ButtonGroup(
                alignment: mapButtonGroupAlignment(node["alignment"] as? String)
            ) {
                for button in built { button }
            }
            let sized: ButtonGroup = applyFlexChildProps(group, node) { $0.flexGrow($1) }
                shrink: { $0.flexShrink($1) }
                alignSelf: { $0.alignSelf($1) }
            return sized

        case "video":
            throw DisplayManagerError.invalidTree(
                "video is root-only and cannot be nested inside a flex node"
            )

        default:
            throw DisplayManagerError.invalidTree("unknown node type \"\(type)\"")
        }
    }

    private func buildButton(sessionId: String, node: [String: Any]) throws -> Button {
        guard let label = node["label"] as? String else {
            throw DisplayManagerError.invalidTree("button node is missing \"label\"")
        }

        let iconName = (node["iconName"] as? String).flatMap { IconName(rawValue: $0) }
        let tapId = node["tapId"] as? String

        var onClick: (@Sendable () -> Void)?
        if let id = tapId {
            onClick = { [weak self] in
                Task { @MainActor in
                    self?.emitTap(sessionId: sessionId, tapId: id)
                }
            }
        }

        let button = Button(
            label: label,
            style: mapButtonStyle(node["style"] as? String),
            iconName: iconName,
            onClick: onClick
        )

        return applyFlexChildProps(button, node) { $0.flexGrow($1) } shrink: { $0.flexShrink($1) }
            alignSelf: { $0.alignSelf($1) }
    }

    /// Apply `flexGrow` / `flexShrink` / `alignSelf`, which every child type exposes as
    /// independent chainable modifiers rather than init parameters.
    private func applyFlexChildProps<T>(
        _ value: T,
        _ node: [String: Any],
        _ grow: (T, Float) -> T,
        shrink: (T, Float) -> T,
        alignSelf: (T, Alignment) -> T
    ) -> T {
        var result = value
        if let g = node["flexGrow"] as? Double { result = grow(result, Float(g)) }
        if let s = node["flexShrink"] as? Double { result = shrink(result, Float(s)) }
        if let a = mapAlignment(node["alignSelf"] as? String) { result = alignSelf(result, a) }
        return result
    }

    // MARK: - Event Handling

    private func handleStateChange(sessionId: String, state: DisplayState) {
        logger.info("Display", "Display state changed", context: [
            "sessionId": sessionId,
            "state": String(describing: state)
        ])

        emitEvent("onDisplayStateChange", [
            "sessionId": sessionId,
            "state": mapDisplayState(state)
        ])
    }

    private func handlePlaybackEvent(sessionId: String, event: VideoPlaybackEvent) {
        var body: [String: Any] = [
            "sessionId": sessionId,
            "event": mapVideoEventType(event.type)
        ]
        if event.type == .error {
            body["errorType"] = mapVideoErrorType(event.errorType)
        }
        emitEvent("onDisplayVideoEvent", body)
    }

    private func handleVideoError(sessionId: String, error: VideoError) {
        switch error {
        case .playbackFailed(let type):
            emitEvent("onDisplayVideoEvent", [
                "sessionId": sessionId,
                "event": "error",
                "errorType": mapVideoErrorType(type)
            ])
        @unknown default:
            emitEvent("onDisplayVideoEvent", [
                "sessionId": sessionId,
                "event": "error",
                "errorType": "unknown"
            ])
        }
    }

    private func emitTap(sessionId: String, tapId: String) {
        emitEvent("onDisplayTap", ["sessionId": sessionId, "tapId": tapId])
    }

    private func emitEvent(_ name: String, _ body: [String: Any]) {
        eventEmitter?(name, body)
    }

    /// Emit a display error to JS. Used by the module definition when a call fails.
    public func emitDisplayError(sessionId: String, error: DisplayError) {
        var body: [String: Any] = ["sessionId": sessionId]
        switch error {
        case .deviceNotFound:
            body["type"] = "deviceNotFound"
        case .connectionNotAvailable:
            body["type"] = "connectionNotAvailable"
        case .deviceDisconnected:
            body["type"] = "deviceDisconnected"
        case .invalidVideoURL:
            body["type"] = "invalidVideoUrl"
        case .displayError(let message):
            body["type"] = "displayError"
            body["message"] = message
        @unknown default:
            body["type"] = "unexpectedError"
        }
        emitEvent("onDisplayError", body)
    }

    // MARK: - Mapping Helpers

    private func mapDisplayState(_ state: DisplayState) -> String {
        switch state {
        case .starting: return "starting"
        case .started: return "started"
        case .stopping: return "stopping"
        case .stopped: return "stopped"
        @unknown default: return "stopped"
        }
    }

    private func mapDirection(_ value: String?) -> Direction {
        switch value {
        case "row": return .row
        case "columnReverse": return .columnReverse
        case "rowReverse": return .rowReverse
        default: return .column
        }
    }

    private func mapAlignment(_ value: String?) -> Alignment? {
        switch value {
        case "start": return .start
        case "center": return .center
        case "end": return .end
        case "stretch": return .stretch
        default: return nil
        }
    }

    private func mapTextStyle(_ value: String?) -> TextStyle {
        switch value {
        case "heading": return .heading
        case "meta": return .meta
        default: return .body
        }
    }

    private func mapTextColor(_ value: String?) -> TextColor {
        value == "secondary" ? .secondary : .primary
    }

    private func mapButtonStyle(_ value: String?) -> ButtonStyle {
        switch value {
        case "secondary": return .secondary
        case "outline": return .outline
        default: return .primary
        }
    }

    private func mapButtonGroupAlignment(_ value: String?) -> ButtonGroupAlignment {
        switch value {
        case "start": return .start
        case "end": return .end
        default: return .center
        }
    }

    private func mapImageSize(_ value: String?) -> ImageSize {
        value == "fill" ? .fill : .icon
    }

    private func mapCornerRadius(_ value: String?) -> CornerRadius {
        switch value {
        case "small": return .small
        case "medium": return .medium
        default: return .none
        }
    }

    private func mapIconStyle(_ value: String?) -> IconStyle {
        value == "outline" ? .outline : .filled
    }

    private func mapPadding(_ value: [String: Any]?) -> EdgeInsets? {
        guard let value else { return nil }
        return EdgeInsets(
            top: value["top"] as? Double ?? 0,
            bottom: value["bottom"] as? Double ?? 0,
            leading: value["leading"] as? Double ?? 0,
            trailing: value["trailing"] as? Double ?? 0
        )
    }

    private func mapVideoEventType(_ type: VideoPlaybackEventType) -> String {
        switch type {
        case .started: return "started"
        case .ended: return "ended"
        case .stopped: return "stopped"
        case .error: return "error"
        case .unknown: return "unknown"
        @unknown default: return "unknown"
        }
    }

    private func mapVideoErrorType(_ type: VideoErrorType) -> String {
        switch type {
        case .urlInvalid: return "urlInvalid"
        case .alreadyPlaying: return "alreadyPlaying"
        case .playbackFailed: return "playbackFailed"
        case .unknown: return "unknown"
        @unknown default: return "unknown"
        }
    }

    // MARK: - Cleanup

    private func cancel(_ tokens: inout [String: AnyListenerToken], _ sessionId: String) {
        guard let token = tokens.removeValue(forKey: sessionId) else { return }
        Task { await token.cancel() }
    }

    /// Full teardown for module lifecycle (OnDestroy).
    public func destroy() {
        for sessionId in displays.keys {
            displays[sessionId]?.onPlaybackEvent = nil
            displays[sessionId]?.stop()
            cancel(&stateTokens, sessionId)
        }
        displays.removeAll()
        stateTokens.removeAll()
    }
}

public enum DisplayManagerError: LocalizedError {
    case sessionNotFound(String)
    case displayNotAvailable(String)
    case invalidTree(String)

    public var errorDescription: String? {
        switch self {
        case .sessionNotFound(let id):
            return "Session not found: \(id)"
        case .displayNotAvailable(let id):
            return "Display capability unavailable for session: \(id)"
        case .invalidTree(let reason):
            return "Invalid display tree: \(reason)"
        }
    }
}
