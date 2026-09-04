package expo.modules.emwdat

import com.meta.wearable.dat.display.Display
import com.meta.wearable.dat.display.addDisplay
import com.meta.wearable.dat.display.removeDisplay
import com.meta.wearable.dat.display.types.DisplayConfiguration
import com.meta.wearable.dat.display.types.DisplayError
import com.meta.wearable.dat.display.types.DisplayState
import com.meta.wearable.dat.display.types.VideoCodec
import com.meta.wearable.dat.display.types.VideoPlayerError
import com.meta.wearable.dat.display.types.VideoPlayerState
import com.meta.wearable.dat.display.types.VideoSource
import com.meta.wearable.dat.display.views.Alignment
import com.meta.wearable.dat.display.views.ButtonGroupAlignment
import com.meta.wearable.dat.display.views.ButtonGroupScope
import com.meta.wearable.dat.display.views.ButtonStyle
import com.meta.wearable.dat.display.views.ContentScope
import com.meta.wearable.dat.display.views.CornerRadius
import com.meta.wearable.dat.display.views.Direction
import com.meta.wearable.dat.display.views.FlexBoxBackground
import com.meta.wearable.dat.display.views.FlexBoxScope
import com.meta.wearable.dat.display.views.IconName
import com.meta.wearable.dat.display.views.IconStyle
import com.meta.wearable.dat.display.views.ImageSize
import com.meta.wearable.dat.display.views.TextColor
import com.meta.wearable.dat.display.views.TextStyle
import com.meta.wearable.dat.display.views.VideoPlayer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Manages the display capability attached to a [com.meta.wearable.dat.core.session.DeviceSession].
 *
 * SDK 0.9 reaches the Meta Ray-Ban Display through `DeviceSession.addDisplay(config)`, which
 * returns a `Display` whose `sendContent { }` replaces the entire screen — there is no partial
 * update, and the glasses retain no state.
 *
 * Unlike iOS there is no `start()`: the display starts on attach.
 */
object DisplayManager {
    private val logger = EMWDATLogger

    private val displays: MutableMap<String, Display> = mutableMapOf()
    private val stateJobs: MutableMap<String, Job> = mutableMapOf()
    private val videoPlayers: MutableMap<String, VideoPlayer> = mutableMapOf()
    private val videoJobs: MutableMap<String, Job> = mutableMapOf()

    private var scope: CoroutineScope? = null
    private var eventEmitter: EventEmitter? = null

    fun setEventEmitter(emitter: EventEmitter) {
        this.eventEmitter = emitter
    }

    fun setScope(scope: CoroutineScope) {
        this.scope = scope
    }

    // ---------------------------------------------------------------------------
    // Display capability control
    // ---------------------------------------------------------------------------

    /** Attach the display capability to a session. Throws if the session is unknown. */
    fun addDisplayToSession(sessionId: String) {
        val session = WearablesManager.getSession(sessionId)
            ?: throw IllegalStateException("Session not found: $sessionId")

        logger.info("Display", "Adding display to session: $sessionId")

        val display = session.addDisplay(DisplayConfiguration()).fold(
            onSuccess = { it },
            onFailure = { error, _ ->
                throw IllegalStateException("Failed to add display: ${error.description}")
            }
        )

        displays[sessionId] = display

        stateJobs[sessionId] = scope?.launch {
            display.state.collect { state -> handleStateChange(sessionId, state) }
        } ?: throw IllegalStateException("DisplayManager scope not set")

        emitEvent("onCapabilityStateChange", mapOf("sessionId" to sessionId, "state" to "active"))

        logger.info("Display", "Display added to session: $sessionId")
    }

    /** Replace the entire screen with [root]. */
    suspend fun renderDisplay(sessionId: String, root: Map<String, Any?>) {
        val display = displays[sessionId]
            ?: throw IllegalStateException("Display capability unavailable for session: $sessionId")

        val type = root["type"] as? String
        if (type != "flex" && type != "video") {
            throw IllegalArgumentException(
                "Display root must be a \"flex\" or \"video\" node, received \"$type\""
            )
        }

        display.sendContent {
            when (type) {
                "video" -> buildVideo(sessionId, root)
                else -> buildFlexRoot(sessionId, root)
            }
        }.onFailure { error, _ ->
            emitDisplayError(sessionId, error)
            throw IllegalStateException("Failed to render display: ${error.description}")
        }
    }

    /** Clear the screen without detaching the capability. */
    suspend fun clearDisplay(sessionId: String) {
        val display = displays[sessionId]
            ?: throw IllegalStateException("Display capability unavailable for session: $sessionId")

        display.clearDisplay().onFailure { error, _ ->
            emitDisplayError(sessionId, error)
            throw IllegalStateException("Failed to clear display: ${error.description}")
        }
    }

    /** Detach the display capability from a session. */
    fun removeDisplayFromSession(sessionId: String) {
        displays[sessionId]?.stop()
        displays.remove(sessionId)
        stateJobs.remove(sessionId)?.cancel()
        videoJobs.remove(sessionId)?.cancel()
        videoPlayers.remove(sessionId)?.close()

        WearablesManager.getSession(sessionId)?.removeDisplay()

        emitEvent("onCapabilityStateChange", mapOf("sessionId" to sessionId, "state" to "stopped"))

        logger.info("Display", "Display removed from session: $sessionId")
    }

    /** Current display state, or null when no display is attached. */
    fun getDisplayState(sessionId: String): String? =
        displays[sessionId]?.let { mapDisplayState(it.state.value) }

    // ---------------------------------------------------------------------------
    // Tree building
    // ---------------------------------------------------------------------------

    private fun ContentScope.buildVideo(sessionId: String, node: Map<String, Any?>) {
        val uri = node["uri"] as? String
            ?: throw IllegalArgumentException("video node is missing \"uri\"")

        val player = VideoPlayer(VideoSource.Url(uri), VideoCodec.MP4)
        videoPlayers[sessionId] = player
        observeVideo(sessionId, player)

        video(player) {}
    }

    /**
     * Bridge the player's state and error flows to onDisplayVideoEvent.
     *
     * iOS delivers these through a single `onPlaybackEvent` callback; Android exposes two
     * StateFlows, so both are collected and normalised to the same event shape.
     */
    private fun observeVideo(sessionId: String, player: VideoPlayer) {
        videoJobs.remove(sessionId)?.cancel()
        val activeScope = scope ?: return
        videoJobs[sessionId] = activeScope.launch {
            launch {
                player.state.collect { state ->
                    emitEvent(
                        "onDisplayVideoEvent",
                        mapOf("sessionId" to sessionId, "event" to mapVideoState(state))
                    )
                }
            }
            launch {
                player.error.collect { error ->
                    if (error == null) return@collect
                    emitEvent(
                        "onDisplayVideoEvent",
                        mapOf(
                            "sessionId" to sessionId,
                            "event" to "error",
                            "errorType" to mapVideoError(error)
                        )
                    )
                }
            }
        }
    }

    private fun ContentScope.buildFlexRoot(sessionId: String, node: Map<String, Any?>) {
        flexBox(
            direction = mapDirection(node["direction"] as? String),
            gap = intOf(node["spacing"]),
            alignment = mapAlignment(node["alignment"] as? String) ?: Alignment.START,
            crossAlignment = mapAlignment(node["crossAlignment"] as? String) ?: Alignment.START,
            wrap = node["wrap"] as? Boolean ?: false,
            paddingTop = paddingOf(node, "top"),
            paddingBottom = paddingOf(node, "bottom"),
            paddingStart = paddingOf(node, "leading"),
            paddingEnd = paddingOf(node, "trailing"),
            background = mapBackground(node["background"] as? String),
            onClick = tapHandler(sessionId, node)
        ) {
            buildChildren(sessionId, node)
        }
    }

    private fun FlexBoxScope.buildChildren(sessionId: String, node: Map<String, Any?>) {
        @Suppress("UNCHECKED_CAST")
        val children = node["children"] as? List<Map<String, Any?>> ?: emptyList()
        for (child in children) buildChild(sessionId, child)
    }

    private fun FlexBoxScope.buildChild(sessionId: String, node: Map<String, Any?>) {
        when (val type = node["type"] as? String) {
            "flex" -> flexBox(
                direction = mapDirection(node["direction"] as? String),
                gap = intOf(node["spacing"]),
                alignment = mapAlignment(node["alignment"] as? String) ?: Alignment.START,
                crossAlignment = mapAlignment(node["crossAlignment"] as? String) ?: Alignment.START,
                wrap = node["wrap"] as? Boolean ?: false,
                paddingTop = paddingOf(node, "top"),
                paddingBottom = paddingOf(node, "bottom"),
                paddingStart = paddingOf(node, "leading"),
                paddingEnd = paddingOf(node, "trailing"),
                background = mapBackground(node["background"] as? String),
                onClick = tapHandler(sessionId, node),
                flexGrow = floatOf(node["flexGrow"]),
                flexShrink = floatOf(node["flexShrink"], default = 1f),
                alignSelf = mapAlignment(node["alignSelf"] as? String) ?: Alignment.START
            ) {
                buildChildren(sessionId, node)
            }

            "text" -> text(
                content = node["content"] as? String
                    ?: throw IllegalArgumentException("text node is missing \"content\""),
                style = mapTextStyle(node["style"] as? String),
                color = mapTextColor(node["color"] as? String),
                flexGrow = floatOf(node["flexGrow"]),
                flexShrink = floatOf(node["flexShrink"], default = 1f),
                alignSelf = mapAlignment(node["alignSelf"] as? String) ?: Alignment.START
            )

            "button" -> button(
                label = node["label"] as? String
                    ?: throw IllegalArgumentException("button node is missing \"label\""),
                style = mapButtonStyle(node["style"] as? String),
                iconName = mapIconName(node["iconName"] as? String),
                onClick = tapHandler(sessionId, node) ?: {},
                flexGrow = floatOf(node["flexGrow"]),
                flexShrink = floatOf(node["flexShrink"], default = 1f),
                alignSelf = mapAlignment(node["alignSelf"] as? String) ?: Alignment.START
            )

            "image" -> image(
                uri = node["uri"] as? String
                    ?: throw IllegalArgumentException("image node is missing \"uri\""),
                sizePreset = mapImageSize(node["sizePreset"] as? String),
                cornerRadius = mapCornerRadius(node["cornerRadius"] as? String),
                flexGrow = floatOf(node["flexGrow"]),
                flexShrink = floatOf(node["flexShrink"], default = 1f),
                alignSelf = mapAlignment(node["alignSelf"] as? String) ?: Alignment.START
            )

            "icon" -> icon(
                name = mapIconName(node["name"] as? String)
                    ?: throw IllegalArgumentException(
                        "icon node has a missing or unknown \"name\": ${node["name"]}"
                    ),
                style = mapIconStyle(node["style"] as? String),
                flexGrow = floatOf(node["flexGrow"]),
                flexShrink = floatOf(node["flexShrink"], default = 1f),
                alignSelf = mapAlignment(node["alignSelf"] as? String) ?: Alignment.START
            )

            "buttonGroup" -> buttonGroup(
                alignment = mapButtonGroupAlignment(node["alignment"] as? String),
                flexGrow = floatOf(node["flexGrow"]),
                flexShrink = floatOf(node["flexShrink"], default = 1f),
                alignSelf = mapAlignment(node["alignSelf"] as? String) ?: Alignment.START
            ) {
                @Suppress("UNCHECKED_CAST")
                val buttons = node["buttons"] as? List<Map<String, Any?>> ?: emptyList()
                for (b in buttons) buildGroupButton(sessionId, b)
            }

            "video" -> throw IllegalArgumentException(
                "video is root-only and cannot be nested inside a flex node"
            )

            else -> throw IllegalArgumentException("unknown node type \"$type\"")
        }
    }

    private fun ButtonGroupScope.buildGroupButton(sessionId: String, node: Map<String, Any?>) {
        button(
            label = node["label"] as? String
                ?: throw IllegalArgumentException("button node is missing \"label\""),
            style = mapButtonStyle(node["style"] as? String),
            iconName = mapIconName(node["iconName"] as? String),
            onClick = tapHandler(sessionId, node) ?: {}
        )
    }

    /** Bind a serialized tapId to the SDK's click mechanism, or null when the node has none. */
    private fun tapHandler(sessionId: String, node: Map<String, Any?>): (() -> Unit)? {
        val tapId = node["tapId"] as? String ?: return null
        return { emitEvent("onDisplayTap", mapOf("sessionId" to sessionId, "tapId" to tapId)) }
    }

    // ---------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------

    private fun handleStateChange(sessionId: String, state: DisplayState) {
        logger.info("Display", "Display state changed: $state")
        emitEvent(
            "onDisplayStateChange",
            mapOf("sessionId" to sessionId, "state" to mapDisplayState(state))
        )
    }

    private fun emitDisplayError(sessionId: String, error: DisplayError) {
        emitEvent(
            "onDisplayError",
            mapOf("sessionId" to sessionId, "type" to mapDisplayError(error))
        )
    }

    private fun emitEvent(name: String, body: Map<String, Any>) {
        eventEmitter?.invoke(name, body)
    }

    // ---------------------------------------------------------------------------
    // Mapping helpers
    // ---------------------------------------------------------------------------

    private fun intOf(value: Any?): Int = (value as? Number)?.toInt() ?: 0

    private fun floatOf(value: Any?, default: Float = 0f): Float =
        (value as? Number)?.toFloat() ?: default

    @Suppress("UNCHECKED_CAST")
    private fun paddingOf(node: Map<String, Any?>, edge: String): Int? {
        val padding = node["padding"] as? Map<String, Any?> ?: return null
        return (padding[edge] as? Number)?.toInt()
    }

    private fun mapDisplayState(state: DisplayState): String = when (state) {
        DisplayState.STARTING -> "starting"
        DisplayState.STARTED -> "started"
        DisplayState.STOPPING -> "stopping"
        DisplayState.STOPPED -> "stopped"
        DisplayState.CLOSED -> "closed"
    }

    private fun mapDisplayError(error: DisplayError): String = when (error) {
        DisplayError.DEVICE_DISCONNECTED -> "deviceDisconnected"
        DisplayError.INVALID_SESSION_STATE -> "invalidSessionState"
        DisplayError.RENDERING_FAILED -> "renderingFailed"
        DisplayError.UNEXPECTED_ERROR -> "unexpectedError"
    }

    private fun mapVideoState(state: VideoPlayerState): String = when (state) {
        VideoPlayerState.STARTING -> "started"
        VideoPlayerState.PLAYING -> "started"
        VideoPlayerState.ENDED -> "ended"
        VideoPlayerState.PAUSE -> "stopped"
        VideoPlayerState.IDLE -> "unknown"
    }

    private fun mapVideoError(error: VideoPlayerError): String = when (error) {
        VideoPlayerError.NOT_BOUND -> "notBound"
        VideoPlayerError.STREAM_REJECTED -> "streamRejected"
        VideoPlayerError.INVALID_URL -> "urlInvalid"
        VideoPlayerError.ALREADY_PLAYING -> "alreadyPlaying"
        VideoPlayerError.PLAYBACK_FAILED -> "playbackFailed"
        VideoPlayerError.INVALID_DIMENSIONS -> "invalidDimensions"
        VideoPlayerError.UNEXPECTED_ERROR -> "unexpectedError"
    }

    private fun mapDirection(value: String?): Direction = when (value) {
        "row" -> Direction.ROW
        "columnReverse" -> Direction.COLUMN_REVERSE
        "rowReverse" -> Direction.ROW_REVERSE
        else -> Direction.COLUMN
    }

    private fun mapAlignment(value: String?): Alignment? = when (value) {
        "start" -> Alignment.START
        "center" -> Alignment.CENTER
        "end" -> Alignment.END
        "stretch" -> Alignment.STRETCH
        else -> null
    }

    private fun mapTextStyle(value: String?): TextStyle = when (value) {
        "heading" -> TextStyle.HEADING
        "meta" -> TextStyle.META
        else -> TextStyle.BODY
    }

    private fun mapTextColor(value: String?): TextColor =
        if (value == "secondary") TextColor.SECONDARY else TextColor.PRIMARY

    private fun mapButtonStyle(value: String?): ButtonStyle = when (value) {
        "secondary" -> ButtonStyle.SECONDARY
        "outline" -> ButtonStyle.OUTLINE
        else -> ButtonStyle.PRIMARY
    }

    private fun mapButtonGroupAlignment(value: String?): ButtonGroupAlignment = when (value) {
        "start" -> ButtonGroupAlignment.START
        "end" -> ButtonGroupAlignment.END
        else -> ButtonGroupAlignment.CENTER
    }

    private fun mapImageSize(value: String?): ImageSize =
        if (value == "fill") ImageSize.FILL else ImageSize.ICON

    private fun mapCornerRadius(value: String?): CornerRadius = when (value) {
        "small" -> CornerRadius.SMALL
        "medium" -> CornerRadius.MEDIUM
        else -> CornerRadius.NONE
    }

    private fun mapIconStyle(value: String?): IconStyle =
        if (value == "outline") IconStyle.OUTLINE else IconStyle.FILLED

    private fun mapBackground(value: String?): FlexBoxBackground =
        if (value == "card") FlexBoxBackground.CARD else FlexBoxBackground.NONE

    /** Camel-cased TS name to the SDK's SCREAMING_SNAKE enum constant. */
    private fun mapIconName(value: String?): IconName? {
        if (value == null) return null
        val constant = value.replace(Regex("([a-z0-9])([A-Z])"), "$1_$2").uppercase()
        return runCatching { IconName.valueOf(constant) }.getOrNull()
    }

    // ---------------------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------------------

    fun destroy() {
        displays.values.forEach { it.stop() }
        displays.clear()
        stateJobs.values.forEach { it.cancel() }
        stateJobs.clear()
        videoJobs.values.forEach { it.cancel() }
        videoJobs.clear()
        videoPlayers.values.forEach { it.close() }
        videoPlayers.clear()
    }
}
