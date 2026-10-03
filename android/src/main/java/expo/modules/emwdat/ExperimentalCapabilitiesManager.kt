package expo.modules.emwdat

import android.app.Activity
import android.content.Intent
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.registration.RegistrationRequest
import com.meta.wearable.dat.core.selectors.SpecificDeviceSelector
import com.meta.wearable.dat.core.types.DatError
import com.meta.wearable.dat.core.types.DatResult
import com.meta.wearable.dat.core.types.DeviceIdentifier
import com.meta.wearable.dat.core.voiceinvocations.VoiceInvocationsStream
import com.meta.wearable.dat.core.voiceinvocations.isVoiceInvocationsIntent
import com.meta.wearable.dat.core.voiceinvocations.startVoiceInvocationsStream
import com.meta.wearable.dat.core.voiceinvocations.types.actions.LaunchApp
import com.meta.wearable.dat.core.voiceinvocations.types.actions.ResponseHandle
import com.meta.wearable.dat.inputs.Inputs
import com.meta.wearable.dat.inputs.addInputs
import com.meta.wearable.dat.inputs.removeInputs
import com.meta.wearable.dat.inputs.types.*
import com.meta.wearable.dat.motion.Motion
import com.meta.wearable.dat.motion.addMotion
import com.meta.wearable.dat.motion.removeMotion
import com.meta.wearable.dat.motion.types.*
import com.meta.wearable.dat.speech.Speech
import com.meta.wearable.dat.speech.addSpeech
import com.meta.wearable.dat.speech.removeSpeech
import kotlinx.coroutines.*
import java.util.UUID

internal fun sdkEnumName(value: Enum<*>): String = value.name.lowercase().split('_').let { parts ->
    parts.first() + parts.drop(1).joinToString("") { it.replaceFirstChar(Char::uppercaseChar) }
}
internal fun <T, E : DatError> DatResult<T, E>.bridgeValue(): T = fold(
    onSuccess = { it }, onFailure = { error, cause -> throw IllegalStateException(error.description, cause) }
)

object ExperimentalCapabilitiesManager {
    private var emit: EventEmitter? = null
    private var scope: CoroutineScope? = null
    private val inputs = mutableMapOf<String, Inputs>()
    private val motion = mutableMapOf<String, Motion>()
    private val speech = mutableMapOf<String, Speech>()
    private val jobs = mutableMapOf<String, MutableList<Job>>()
    private var voice: VoiceInvocationsStream? = null
    private val responses = mutableMapOf<String, ResponseHandle>()
    private val pendingInvocations = mutableMapOf<String, Map<String, Any>>()
    private val requests = mutableMapOf<String, RegistrationRequest>()
    private var voiceLaunch = false

    fun configure(emitter: EventEmitter, scope: CoroutineScope) { emit = emitter; this.scope = scope }
    private fun session(id: String) = WearablesManager.getSession(id)
        ?: throw IllegalArgumentException("Session not found: $id")
    private fun collect(key: String, block: suspend CoroutineScope.() -> Unit) {
        jobs.getOrPut(key) { mutableListOf() }.add(
            checkNotNull(scope).launch(start = CoroutineStart.UNDISPATCHED, block = block)
        )
    }
    private fun cancel(key: String) { jobs.remove(key)?.forEach { it.cancel() } }
    private fun state(id: String, capability: String, state: Enum<*>) {
        emit?.invoke("onExperimentalCapabilityStateChange", mapOf("sessionId" to id, "capability" to capability, "state" to sdkEnumName(state)))
    }
    private fun error(id: String, capability: String, error: DatError) {
        emit?.invoke("onExperimentalCapabilityError", mapOf("sessionId" to id, "capability" to capability,
            "error" to (if (error is Enum<*>) sdkEnumName(error) else error.toString()), "message" to error.description))
    }

    fun addInputs(id: String, config: Map<String, Any>) {
        check(!inputs.containsKey(id)) { "Inputs already attached" }
        val sources = (config["sources"] as? List<*>)?.map { name ->
            InputSource.entries.firstOrNull { sdkEnumName(it) == name } ?: throw IllegalArgumentException("Unknown input source: $name")
        }?.toSet() ?: InputsConfiguration().sources
        val capability = session(id).addInputs(InputsConfiguration(sources, config["consumeBack"] as? Boolean ?: true)).bridgeValue()
        inputs[id] = capability
        val key = "$id:inputs"
        collect(key) { capability.state.collect { state(id, "inputs", it) } }
        collect(key) { capability.errors.collect { it?.let { error(id, "inputs", it) } } }
        collect(key) { capability.events.collect { emit?.invoke("onInputEvent", mapOf("sessionId" to id) + serializeInput(it)) } }
    }
    fun removeInputs(id: String) { session(id).removeInputs().bridgeValue(); inputs.remove(id); cancel("$id:inputs") }

    fun addMotion(id: String, config: Map<String, Any>) {
        check(!motion.containsKey(id)) { "Motion already attached" }
        val rate = (config["samplingRate"] as? Number)?.toInt() ?: 10
        val samplingRate = MotionSamplingRate.entries.firstOrNull { it.name == "HZ_$rate" }
            ?: throw IllegalArgumentException("Invalid motion sampling rate: $rate")
        val capability = session(id).addMotion(MotionConfiguration(samplingRate)).bridgeValue()
        motion[id] = capability
        val key = "$id:motion"
        collect(key) { capability.state.collect { state(id, "motion", it) } }
        collect(key) { capability.errors.collect { it?.let { error(id, "motion", it) } } }
        collect(key) { capability.samples.collect { sample ->
            val body = mutableMapOf<String, Any>("sessionId" to id, "timestampNs" to sample.timestampNs.toString(), "source" to sdkEnumName(sample.source))
            sample.accelerometer?.let { body["accelerometer"] = vector(it) }
            sample.gyroscope?.let { body["gyroscope"] = vector(it) }
            sample.magnetometer?.let { body["magnetometer"] = vector(it) }
            sample.orientation?.let { body["orientation"] = mapOf("x" to it.x, "y" to it.y, "z" to it.z, "w" to it.w) }
            emit?.invoke("onMotionSample", body)
        } }
        capability.start()
    }
    fun startMotion(id: String) { checkNotNull(motion[id]) { "Motion not attached" }.start() }
    fun stopMotion(id: String) { checkNotNull(motion[id]) { "Motion not attached" }.stop() }
    fun removeMotion(id: String) { session(id).removeMotion().bridgeValue(); motion.remove(id); cancel("$id:motion") }

    fun addSpeech(id: String) {
        check(!speech.containsKey(id)) { "Speech already attached" }
        val capability = session(id).addSpeech().bridgeValue()
        speech[id] = capability
        val key = "$id:speech"
        collect(key) { capability.state.collect { state(id, "speech", it) } }
        collect(key) { capability.errors.collect { it?.let { error(id, "speech", it) } } }
        collect(key) { capability.locale.collect { locale -> locale?.let {
            emit?.invoke("onSpeechLocaleChange", mapOf("sessionId" to id, "locale" to it))
        } } }
        collect(key) { capability.transcriptions.collect { result -> result?.let {
            emit?.invoke("onTranscription", mapOf("sessionId" to id, "text" to it.text, "isFinal" to it.isFinal, "confidence" to it.confidence))
        } } }
        try { capability.start().bridgeValue() } catch (error: Exception) {
            removeSpeech(id)
            throw error
        }
    }
    fun startSpeech(id: String) { checkNotNull(speech[id]) { "Speech not attached" }.start().bridgeValue() }
    fun stopSpeech(id: String) { checkNotNull(speech[id]) { "Speech not attached" }.stop() }
    fun removeSpeech(id: String) { session(id).removeSpeech().bridgeValue(); speech.remove(id); cancel("$id:speech") }

    fun startVoice(deviceId: String) {
        check(WearablesManager.isConfigured) { "Call configure() first" }
        check(voice == null) { "Voice invocation stream already started" }
        val stream = Wearables.startVoiceInvocationsStream(SpecificDeviceSelector(DeviceIdentifier(deviceId)))
        voice = stream
        collect("voice") { stream.invocations.collect { invocation ->
            if (invocation is LaunchApp && voice === stream) {
                val id = UUID.randomUUID().toString()
                val body = mapOf("invocationId" to id, "type" to "launchApp", "deviceId" to deviceId)
                responses[id] = invocation.responseHandle
                pendingInvocations[id] = body
                emit?.invoke("onVoiceInvocation", body)
            }
        } }
        collect("voice") { stream.errors.collect { error ->
            emit?.invoke("onVoiceInvocationError", mapOf("error" to sdkEnumName(error), "message" to error.description))
        } }
        collect("voice") { stream.state.collect { emit?.invoke("onVoiceInvocationStateChange", mapOf("state" to sdkEnumName(it))) } }
    }
    suspend fun respondToVoice(id: String, success: Boolean, output: String?): Boolean {
        val response = responses.remove(id) ?: throw IllegalArgumentException("Unknown or already answered voice invocation")
        pendingInvocations.remove(id)
        return if (success) response.sendSuccess(output) else response.sendFailure(output)
    }
    fun getPendingVoiceInvocations() = pendingInvocations.values.toList()
    suspend fun stopVoice() {
        val stream = voice
        voice = null
        cancel("voice")
        val unanswered = responses.values.toList()
        responses.clear(); pendingInvocations.clear()
        unanswered.forEach { it.sendFailure(null) }
        stream?.close()
        emit?.invoke("onVoiceInvocationStateChange", mapOf("state" to "stopped"))
    }

    fun handleIntent(intent: Intent) {
        if (!WearablesManager.isConfigured) return
        if (isVoiceInvocationsIntent(intent)) {
            voiceLaunch = true
            emit?.invoke("onVoiceInvocationLaunch", mapOf("launched" to true))
        }
        Wearables.handleIntent(intent) { request ->
            if (!requests.containsKey(request.flowId)) {
                requests[request.flowId] = request
                emit?.invoke("onRegistrationRequest", serializeRequest(request))
            }
        }.onFailure { error, cause -> EMWDATLogger.warn("Registration", error.description) }
    }
    fun consumeVoiceLaunch(): Boolean = voiceLaunch.also { voiceLaunch = false }
    private fun serializeRequest(request: RegistrationRequest) = mapOf("requestId" to request.flowId,
        "flowId" to request.flowId, "protocolVersion" to request.protocolVersion)
    fun getPendingRegistrationRequests() = requests.values.map(::serializeRequest)
    fun respondToRegistrationRequest(id: String, accept: Boolean, activity: Activity) {
        val request = requests.remove(id) ?: throw IllegalArgumentException("Unknown or already handled registration request")
        (if (accept) request.continueRegistration(activity) else request.cancelRegistration()).bridgeValue()
    }

    fun removeSession(id: String) {
        listOf("inputs", "motion", "speech").forEach { cancel("$id:$it") }
        inputs.remove(id); motion.remove(id); speech.remove(id)
    }
    suspend fun destroy() {
        (inputs.keys + motion.keys + speech.keys).toSet().forEach(::removeSession)
        stopVoice()
        requests.values.forEach { it.cancelRegistration() }
        requests.clear()
    }
    private fun vector(v: Vector3) = mapOf("x" to v.x, "y" to v.y, "z" to v.z)
    private fun serializeInput(event: InputEvent): Map<String, Any> {
        val body = mutableMapOf<String, Any>("source" to sdkEnumName(event.source), "timestampMs" to event.timestampMs)
        body.putAll(when (event) {
            is InputEvent.Nav -> mapOf("type" to "nav", "direction" to sdkEnumName(event.direction))
            is InputEvent.Select -> mapOf("type" to "select")
            is InputEvent.Back -> mapOf("type" to "back")
            is InputEvent.Button -> mapOf("type" to "button", "button" to sdkEnumName(event.button))
            is InputEvent.Capture -> mapOf("type" to "capture", "pressType" to sdkEnumName(event.pressType))
            is InputEvent.Drag -> mapOf("type" to "drag", "action" to sdkEnumName(event.action), "x" to event.x, "y" to event.y, "dx" to event.dx, "dy" to event.dy)
        })
        return body
    }
}
