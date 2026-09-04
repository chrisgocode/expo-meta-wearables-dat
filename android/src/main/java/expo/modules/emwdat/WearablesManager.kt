package expo.modules.emwdat

import android.app.Activity
import android.content.Context
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.selectors.AutoDeviceSelector
import com.meta.wearable.dat.core.selectors.SpecificDeviceSelector
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.session.DeviceSessionState
import com.meta.wearable.dat.core.types.DeviceCompatibility
import com.meta.wearable.dat.core.types.DeviceIdentifier
import com.meta.wearable.dat.core.types.DeviceSessionError
import com.meta.wearable.dat.core.types.DeviceType
import com.meta.wearable.dat.core.types.LinkState
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.core.types.RegistrationState
import com.meta.wearable.dat.core.types.ThermalLevel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.util.UUID

typealias EventEmitter = (String, Map<String, Any>) -> Unit

object WearablesManager {
    private val logger = EMWDATLogger

    var isConfigured = false
        private set

    private var eventEmitter: EventEmitter? = null
    private var scope: CoroutineScope? = null

    // Flow collection jobs
    private var registrationJob: Job? = null
    private var registrationErrorJob: Job? = null
    private var devicesJob: Job? = null
    private var deviceMetadataJobs: MutableMap<DeviceIdentifier, Job> = mutableMapOf()
    private var deviceStateJobs: MutableMap<DeviceIdentifier, Job> = mutableMapOf()

    // Device sessions
    private val sessions: MutableMap<String, DeviceSession> = mutableMapOf()
    private val sessionStateJobs: MutableMap<String, Job> = mutableMapOf()
    private val sessionErrorJobs: MutableMap<String, Job> = mutableMapOf()

    // Cached state
    var currentRegistrationState: String = "unavailable"
        private set
    private var currentDevices: Set<DeviceIdentifier> = emptySet()
    private var deviceNames: MutableMap<DeviceIdentifier, String> = mutableMapOf()
    private var deviceCompatibilities: MutableMap<DeviceIdentifier, DeviceCompatibility> = mutableMapOf()
    private var deviceLinkStates: MutableMap<DeviceIdentifier, LinkState> = mutableMapOf()
    private var deviceTypes: MutableMap<DeviceIdentifier, DeviceType> = mutableMapOf()
    private var deviceDisplaySupport: MutableMap<DeviceIdentifier, Boolean> = mutableMapOf()

    fun setEventEmitter(emitter: EventEmitter) {
        logger.debug("Manager", "Event emitter set")
        this.eventEmitter = emitter
    }

    fun setScope(scope: CoroutineScope) {
        this.scope = scope
    }

    fun configure(context: Context) {
        if (isConfigured) {
            logger.info("Manager", "SDK already configured, skipping")
            return
        }

        logger.info("Manager", "Configuring SDK")
        // Wearables.initialize returns DatResult since SDK 0.7 — ALREADY_INITIALIZED is benign.
        Wearables.initialize(context).onFailure { error, _ ->
            logger.warn("Manager", "Wearables.initialize reported an error", mapOf(
                "error" to error.description
            ))
        }
        isConfigured = true

        setupListeners()
        logger.info("Manager", "SDK configured and listeners attached")
    }

    private fun setupListeners() {
        val scope = this.scope ?: return

        registrationJob = scope.launch {
            Wearables.registrationState.collect { state ->
                handleRegistrationStateChange(state)
            }
        }

        // Registration errors moved out of RegistrationState into their own stream in SDK 0.7.
        registrationErrorJob = scope.launch {
            Wearables.registrationErrorStream.collect { error ->
                logger.error("Manager", "Registration error", mapOf("error" to error.description))
            }
        }

        devicesJob = scope.launch {
            Wearables.devices.collect { devices ->
                handleDevicesChange(devices)
            }
        }

        logger.debug("Manager", "Listeners attached")
    }

    private fun handleRegistrationStateChange(state: RegistrationState) {
        val mapped = mapRegistrationState(state)
        logger.info("Manager", "Registration state changed", mapOf(
            "from" to currentRegistrationState,
            "to" to mapped
        ))

        currentRegistrationState = mapped
        emitEvent("onRegistrationStateChange", mapOf("state" to mapped))
    }

    private fun handleDevicesChange(devices: Set<DeviceIdentifier>) {
        logger.info("Manager", "Devices changed", mapOf("count" to devices.size))

        val previousDevices = currentDevices
        val addedDevices = devices - previousDevices
        val removedDevices = previousDevices - devices

        // Remove metadata jobs for removed devices
        for (deviceId in removedDevices) {
            deviceMetadataJobs.remove(deviceId)?.cancel()
            deviceStateJobs.remove(deviceId)?.cancel()
            deviceNames.remove(deviceId)
            deviceCompatibilities.remove(deviceId)
            deviceLinkStates.remove(deviceId)
            deviceTypes.remove(deviceId)
            deviceDisplaySupport.remove(deviceId)
            logger.debug("Manager", "Removed device listeners", mapOf("deviceId" to deviceId.toString()))
        }

        // Add metadata listeners for new devices
        val currentScope = this.scope ?: return
        for (deviceId in addedDevices) {
            val metadataFlow = Wearables.devicesMetadata[deviceId]
            if (metadataFlow != null) {
                deviceMetadataJobs[deviceId] = currentScope.launch {
                    metadataFlow.collect { metadata ->
                        deviceNames[deviceId] = metadata.name
                        deviceCompatibilities[deviceId] = metadata.compatibility
                        deviceDisplaySupport[deviceId] = metadata.isDisplayCapable()

                        // Track link state
                        val previousLinkState = deviceLinkStates[deviceId]
                        deviceLinkStates[deviceId] = metadata.linkState
                        if (previousLinkState != null && previousLinkState != metadata.linkState) {
                            emitEvent("onLinkStateChange", mapOf(
                                "deviceId" to deviceId.toString(),
                                "linkState" to mapLinkState(metadata.linkState)
                            ))
                        }

                        // Track device type
                        deviceTypes[deviceId] = metadata.deviceType

                        emitEvent("onCompatibilityChange", mapOf(
                            "deviceId" to deviceId.toString(),
                            "compatibility" to mapCompatibility(metadata.compatibility)
                        ))

                        // Re-emit full device list
                        emitDeviceList()
                    }
                }
            }

            // Live device state (thermal level) — SDK 0.7+
            deviceStateJobs[deviceId] = currentScope.launch {
                Wearables.getDeviceState(deviceId).collect { state ->
                    emitEvent("onDeviceStateChange", mapOf(
                        "deviceId" to deviceId.toString(),
                        "thermalLevel" to mapThermalLevel(state.thermalLevel)
                    ))
                }
            }

            logger.debug("Manager", "Added device listeners", mapOf("deviceId" to deviceId.toString()))
        }

        currentDevices = devices
        emitDeviceList()
    }

    private fun emitDeviceList() {
        emitEvent("onDevicesChange", mapOf(
            "devices" to currentDevices.map { id -> serializeDevice(id) }
        ))
    }

    // MARK: - Session Management

    fun createSession(deviceId: String?): String {
        if (!isConfigured) {
            throw IllegalStateException("Wearables SDK has not been configured. Call configure() first.")
        }

        val deviceSelector = if (deviceId != null) {
            logger.info("Manager", "Creating session for device", mapOf("deviceId" to deviceId))
            SpecificDeviceSelector(DeviceIdentifier(deviceId))
        } else {
            logger.info("Manager", "Creating session with auto device selector")
            AutoDeviceSelector()
        }

        val session = Wearables.createSession(deviceSelector).fold(
            onSuccess = { it },
            onFailure = { error, _ ->
                throw IllegalStateException("Failed to create session: ${error.description}")
            }
        )

        val sessionId = UUID.randomUUID().toString()
        sessions[sessionId] = session

        // Collect session state
        val currentScope = this.scope ?: throw IllegalStateException("Module scope not available")
        sessionStateJobs[sessionId] = currentScope.launch {
            session.state.collect { state ->
                handleSessionStateChange(sessionId, state)
            }
        }

        // Collect session errors
        sessionErrorJobs[sessionId] = currentScope.launch {
            session.errors.collect { error ->
                handleSessionError(sessionId, error)
            }
        }

        logger.info("Manager", "Session created", mapOf("sessionId" to sessionId))
        return sessionId
    }

    fun startSession(sessionId: String) {
        val session = sessions[sessionId]
            ?: throw IllegalArgumentException("Session not found: $sessionId")
        logger.info("Manager", "Starting session", mapOf("sessionId" to sessionId))
        session.start()
    }

    fun stopSession(sessionId: String) {
        val session = sessions[sessionId]
            ?: throw IllegalArgumentException("Session not found: $sessionId")
        logger.info("Manager", "Stopping session", mapOf("sessionId" to sessionId))
        session.stop()
    }

    fun getSession(sessionId: String): DeviceSession? = sessions[sessionId]

    fun removeSession(sessionId: String) {
        sessionStateJobs.remove(sessionId)?.cancel()
        sessionErrorJobs.remove(sessionId)?.cancel()
        sessions.remove(sessionId)
        logger.info("Manager", "Session removed", mapOf("sessionId" to sessionId))
    }

    private fun handleSessionStateChange(sessionId: String, state: DeviceSessionState) {
        val mapped = mapDeviceSessionState(state)
        logger.info("Manager", "Session state changed", mapOf(
            "sessionId" to sessionId,
            "state" to mapped
        ))

        emitEvent("onDeviceSessionStateChange", mapOf(
            "sessionId" to sessionId,
            "state" to mapped
        ))

        // Auto-clean stopped sessions
        if (state == DeviceSessionState.STOPPED) {
            CameraSessionManager.destroySession(sessionId)
            removeSession(sessionId)
        }
    }

    private fun handleSessionError(sessionId: String, error: DeviceSessionError) {
        val mapped = mapDeviceSessionError(error)
        logger.error("Manager", "Session error", mapOf(
            "sessionId" to sessionId,
            "error" to mapped
        ))

        emitEvent("onDeviceSessionError", mapOf(
            "sessionId" to sessionId,
            "error" to mapped,
            "message" to error.description
        ))
    }

    // MARK: - Registration

    fun startRegistration(activity: Activity) {
        if (!isConfigured) {
            throw IllegalStateException("Wearables SDK has not been configured. Call configure() first.")
        }
        logger.info("Manager", "Starting registration")
        Wearables.startRegistration(activity)
    }

    fun startUnregistration(activity: Activity) {
        if (!isConfigured) {
            throw IllegalStateException("Wearables SDK has not been configured. Call configure() first.")
        }
        logger.info("Manager", "Starting unregistration")
        Wearables.startUnregistration(activity)
    }

    // MARK: - Navigation (SDK 0.7+)

    fun openFirmwareUpdate(activity: Activity) {
        if (!isConfigured) {
            throw IllegalStateException("Wearables SDK has not been configured. Call configure() first.")
        }
        Wearables.openFirmwareUpdate(activity).onFailure { error, _ ->
            throw IllegalStateException(error.description)
        }
    }

    fun openDATGlassesAppUpdate(activity: Activity) {
        if (!isConfigured) {
            throw IllegalStateException("Wearables SDK has not been configured. Call configure() first.")
        }
        Wearables.openDATGlassesAppUpdate(activity).onFailure { error, _ ->
            throw IllegalStateException(error.description)
        }
    }

    // MARK: - Permissions

    suspend fun checkPermissionStatus(permission: Permission): String {
        logger.debug("Manager", "Checking permission status", mapOf("permission" to permission.toString()))
        val result = Wearables.checkPermissionStatus(permission)
        val status = result.getOrNull()
        val mapped = if (status != null) mapPermissionStatus(status) else "denied"
        logger.debug("Manager", "Permission status result", mapOf(
            "permission" to permission.toString(),
            "status" to mapped,
            "rawResult" to result.toString()
        ))
        return mapped
    }

    suspend fun requestPermission(activity: Activity, permission: Permission): String {
        if (!isConfigured) {
            throw IllegalStateException("Wearables SDK has not been configured. Call configure() first.")
        }
        logger.info("Manager", "Requesting permission", mapOf("permission" to permission.toString()))

        val permName = if (permission == Permission.CAMERA) "camera" else "unknown"

        // Return early if already granted
        val currentStatus = checkPermissionStatus(permission)
        if (currentStatus == "granted") {
            logger.info("Manager", "Permission already granted, skipping request")
            emitEvent("onPermissionStatusChange", mapOf(
                "permission" to permName,
                "status" to currentStatus
            ))
            return currentStatus
        }

        val contract = Wearables.RequestPermissionContract()
        val intent = contract.createIntent(activity, permission)
        activity.startActivity(intent)

        // Poll for permission status change (500ms intervals, 30s total)
        repeat(60) {
            kotlinx.coroutines.delay(500)
            val status = checkPermissionStatus(permission)
            if (status == "granted") {
                emitEvent("onPermissionStatusChange", mapOf(
                    "permission" to permName,
                    "status" to status
                ))
                return status
            }
        }

        val finalStatus = checkPermissionStatus(permission)
        emitEvent("onPermissionStatusChange", mapOf(
            "permission" to permName,
            "status" to finalStatus
        ))
        return finalStatus
    }

    // MARK: - Devices

    fun getDevices(): List<Map<String, Any>> {
        return currentDevices.map { id -> serializeDevice(id) }
    }

    fun getDevice(identifier: String): Map<String, Any>? {
        val deviceId = currentDevices.find { it.toString() == identifier } ?: return null
        return serializeDevice(deviceId)
    }

    // MARK: - Serialization

    private fun serializeDevice(id: DeviceIdentifier): Map<String, Any> {
        return mapOf(
            "identifier" to id.toString(),
            "name" to (deviceNames[id] ?: "Unknown"),
            "linkState" to mapLinkState(deviceLinkStates[id] ?: LinkState.DISCONNECTED),
            "deviceType" to mapDeviceType(deviceTypes[id]),
            "compatibility" to mapCompatibility(deviceCompatibilities[id] ?: DeviceCompatibility.UNDEFINED),
            "supportsDisplay" to (deviceDisplaySupport[id] ?: false)
        )
    }

    // MARK: - Mapping Helpers

    private fun mapLinkState(state: LinkState): String = when (state) {
        LinkState.CONNECTED -> "connected"
        LinkState.CONNECTING -> "connecting"
        LinkState.DISCONNECTED -> "disconnected"
    }

    // RegistrationState became a plain enum in SDK 0.7.
    private fun mapRegistrationState(state: RegistrationState): String = when (state) {
        RegistrationState.UNAVAILABLE -> "unavailable"
        RegistrationState.AVAILABLE -> "available"
        RegistrationState.REGISTERING -> "registering"
        RegistrationState.REGISTERED -> "registered"
        RegistrationState.UNREGISTERING -> "unregistering"
    }

    private fun mapPermissionStatus(status: PermissionStatus): String = when (status) {
        is PermissionStatus.Granted -> "granted"
        is PermissionStatus.Denied -> "denied"
    }

    private fun mapCompatibility(compat: DeviceCompatibility): String = when (compat) {
        DeviceCompatibility.COMPATIBLE -> "compatible"
        DeviceCompatibility.UNDEFINED -> "undefined"
        DeviceCompatibility.DEVICE_UPDATE_REQUIRED -> "deviceUpdateRequired"
        DeviceCompatibility.SDK_UPDATE_REQUIRED -> "sdkUpdateRequired"
    }

    private fun mapDeviceType(type: DeviceType?): String = when (type) {
        DeviceType.RAYBAN_META -> "rayBanMeta"
        DeviceType.OAKLEY_META_HSTN -> "oakleyMetaHSTN"
        DeviceType.OAKLEY_META_VANGUARD -> "oakleyMetaVanguard"
        DeviceType.META_RAYBAN_DISPLAY -> "metaRayBanDisplay"
        DeviceType.RAYBAN_META_OPTICS -> "rayBanMetaOptics"
        DeviceType.META_GLASSES -> "metaGlasses"
        DeviceType.UNKNOWN -> "unknown"
        null -> "unknown"
    }

    private fun mapThermalLevel(level: ThermalLevel): String = when (level) {
        ThermalLevel.UNKNOWN -> "unknown"
        ThermalLevel.NONE -> "none"
        ThermalLevel.LIGHT -> "light"
        ThermalLevel.MODERATE -> "moderate"
        ThermalLevel.SEVERE -> "severe"
        ThermalLevel.CRITICAL -> "critical"
        ThermalLevel.EMERGENCY -> "emergency"
        ThermalLevel.SHUTDOWN -> "shutdown"
    }

    private fun mapDeviceSessionState(state: DeviceSessionState): String = when (state) {
        DeviceSessionState.IDLE -> "idle"
        DeviceSessionState.STARTING -> "starting"
        DeviceSessionState.STARTED -> "started"
        DeviceSessionState.PAUSED -> "paused"
        DeviceSessionState.STOPPING -> "stopping"
        DeviceSessionState.STOPPED -> "stopped"
    }

    private fun mapDeviceSessionError(error: DeviceSessionError): String = when (error) {
        DeviceSessionError.NO_ELIGIBLE_DEVICE -> "noEligibleDevice"
        DeviceSessionError.SESSION_ALREADY_STOPPED -> "sessionAlreadyStopped"
        DeviceSessionError.SESSION_ALREADY_EXISTS -> "sessionAlreadyExists"
        DeviceSessionError.SESSION_IDLE -> "sessionIdle"
        DeviceSessionError.CAPABILITY_ALREADY_ADDED -> "capabilityAlreadyActive"
        DeviceSessionError.CAPABILITY_NOT_FOUND -> "capabilityNotFound"
        DeviceSessionError.CAPABILITY_DENIED -> "capabilityDenied"
        DeviceSessionError.DEVICE_DISCONNECTED -> "deviceDisconnected"
        DeviceSessionError.SESSION_ENDED_BY_DEVICE -> "sessionEndedByDevice"
        DeviceSessionError.THERMAL_CRITICAL -> "thermalCritical"
        DeviceSessionError.THERMAL_EMERGENCY -> "thermalEmergency"
        DeviceSessionError.PEAK_POWER_SHUTDOWN -> "peakPowerShutdown"
        DeviceSessionError.BATTERY_CRITICAL -> "batteryCritical"
        DeviceSessionError.DAT_APP_ON_THE_GLASSES_UPDATE_REQUIRED -> "datAppOnTheGlassesUpdateRequired"
        DeviceSessionError.DWA_UNAVAILABLE -> "dwaUnavailable"
        DeviceSessionError.UNEXPECTED_ERROR -> "unexpectedError"
    }

    // MARK: - Event Emission

    private fun emitEvent(name: String, body: Map<String, Any>) {
        logger.debug("Manager", "Emitting event", mapOf("event" to name))
        eventEmitter?.invoke(name, body)
    }

    // MARK: - Cleanup

    fun cleanup() {
        logger.info("Manager", "Cleaning up listeners")
        registrationJob?.cancel()
        registrationErrorJob?.cancel()
        devicesJob?.cancel()
        deviceMetadataJobs.values.forEach { it.cancel() }
        deviceMetadataJobs.clear()
        deviceStateJobs.values.forEach { it.cancel() }
        deviceStateJobs.clear()
        sessionStateJobs.values.forEach { it.cancel() }
        sessionStateJobs.clear()
        sessionErrorJobs.values.forEach { it.cancel() }
        sessionErrorJobs.clear()
        sessions.clear()
        deviceNames.clear()
        deviceCompatibilities.clear()
        deviceLinkStates.clear()
        deviceTypes.clear()
        deviceDisplaySupport.clear()
        currentDevices = emptySet()
        currentRegistrationState = "unavailable"
        isConfigured = false
    }
}
