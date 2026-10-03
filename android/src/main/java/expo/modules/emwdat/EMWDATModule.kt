package expo.modules.emwdat

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import kotlinx.coroutines.withContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

class EMWDATModule : Module() {
    private val logger = EMWDATLogger
    private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val isDebug by lazy {
        try {
            val appContext = appContext.reactContext?.applicationContext ?: return@lazy false
            val appInfo = appContext.applicationInfo
            appInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0
        } catch (e: Exception) {
            false
        }
    }

    override fun definition() = ModuleDefinition {
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

        OnCreate {
            logger.info("Module", "Module created")
            val emitter: EventEmitter = { name, body ->
                sendEvent(name, body)
            }
            WearablesManager.setEventEmitter(emitter)
            WearablesManager.setScope(moduleScope)
            CameraSessionManager.setEventEmitter(emitter)
            CameraSessionManager.setScope(moduleScope)
            DisplayManager.setEventEmitter(emitter)
            DisplayManager.setScope(moduleScope)
            ExperimentalCapabilitiesManager.configure(emitter, moduleScope)
        }

        OnDestroy {
            logger.info("Module", "Module destroyed")
            moduleScope.launch(start = kotlinx.coroutines.CoroutineStart.UNDISPATCHED) {
                ExperimentalCapabilitiesManager.destroy()
                CameraSessionManager.destroy()
                DisplayManager.destroy()
                WearablesManager.cleanup()
                moduleScope.cancel()
            }
        }

        // MARK: - Logging

        Function("setLogLevel") { level: String ->
            val logLevel = EMWDATLogLevel.fromString(level)
            EMWDATLogger.setLogLevel(logLevel)
            logger.info("Module", "Log level set", mapOf("level" to level))
        }

        // MARK: - Configuration

        AsyncFunction("configure") {
            val context = appContext.reactContext?.applicationContext
                ?: throw Exception("Application context not available")

            // Request BLUETOOTH_CONNECT runtime permission on Android 12+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val activity = appContext.currentActivity
                if (activity != null && ContextCompat.checkSelfPermission(
                        activity, Manifest.permission.BLUETOOTH_CONNECT
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    ActivityCompat.requestPermissions(
                        activity,
                        arrayOf(Manifest.permission.BLUETOOTH_CONNECT),
                        1001
                    )
                }
            }

            WearablesManager.configure(context)
            appContext.currentActivity?.intent?.let { ExperimentalCapabilitiesManager.handleIntent(it) }
        }

        // MARK: - Registration

        Function("getRegistrationState") {
            WearablesManager.currentRegistrationState
        }

        AsyncFunction("getRegistrationStateAsync") {
            WearablesManager.currentRegistrationState
        }

        AsyncFunction("startRegistration") {
            val activity = appContext.currentActivity
                ?: throw Exception("Current activity not available")
            WearablesManager.startRegistration(activity)
        }

        AsyncFunction("startUnregistration") {
            val activity = appContext.currentActivity
                ?: throw Exception("Current activity not available")
            WearablesManager.startUnregistration(activity)
        }

        // MARK: - URL Handling (no-op on Android — deep links handled via intent-filter)

        AsyncFunction("handleUrl") { _: String ->
            false
        }

        // MARK: - Permissions

        AsyncFunction("checkPermissionStatus") Coroutine { permission: String ->
            require(permission == "camera" || permission == "microphone") { "Unknown permission: $permission" }
            WearablesManager.checkPermissionStatus(if (permission == "camera") com.meta.wearable.dat.core.types.Permission.CAMERA else com.meta.wearable.dat.core.types.Permission.MICROPHONE)
        }

        AsyncFunction("requestPermission") Coroutine { permission: String ->
            require(permission == "camera" || permission == "microphone") { "Unknown permission: $permission" }
            withContext(Dispatchers.Main) {
                WearablesManager.requestPermission(checkNotNull(appContext.currentActivity),
                    if (permission == "camera") com.meta.wearable.dat.core.types.Permission.CAMERA else com.meta.wearable.dat.core.types.Permission.MICROPHONE)
            }
        }

        // MARK: - Devices

        AsyncFunction("getDevices") {
            WearablesManager.getDevices()
        }

        AsyncFunction("getDevice") { identifier: String ->
            WearablesManager.getDevice(identifier)
        }

        AsyncFunction("openFirmwareUpdate") {
            val activity = appContext.currentActivity
                ?: throw Exception("Current activity not available")
            WearablesManager.openFirmwareUpdate(activity)
        }

        AsyncFunction("openDATGlassesAppUpdate") {
            val activity = appContext.currentActivity
                ?: throw Exception("Current activity not available")
            WearablesManager.openDATGlassesAppUpdate(activity)
        }

        // MARK: - Session Management

        AsyncFunction("createSession") { deviceId: String? ->
            WearablesManager.createSession(deviceId)
        }

        AsyncFunction("startSession") { sessionId: String ->
            WearablesManager.startSession(sessionId)
        }

        AsyncFunction("stopSession") { sessionId: String ->
            WearablesManager.stopSession(sessionId)
        }

        AsyncFunction("addCameraToSession") { sessionId: String, config: Map<String, Any> ->
            CameraSessionManager.addCameraToSession(sessionId, config)
        }

        AsyncFunction("removeCameraFromSession") { sessionId: String ->
            CameraSessionManager.removeCameraFromSession(sessionId)
        }

        // MARK: - Photo Capture

        // Display

        AsyncFunction("addDisplayToSession") { sessionId: String ->
            DisplayManager.addDisplayToSession(sessionId)
        }

        AsyncFunction("renderDisplay") { sessionId: String, root: Map<String, Any?> ->
            runBlocking {
                DisplayManager.renderDisplay(sessionId, root)
            }
            null
        }

        AsyncFunction("clearDisplay") { sessionId: String ->
            runBlocking {
                DisplayManager.clearDisplay(sessionId)
            }
            null
        }

        AsyncFunction("removeDisplayFromSession") { sessionId: String ->
            DisplayManager.removeDisplayFromSession(sessionId)
        }

        AsyncFunction("getDisplayState") { sessionId: String ->
            DisplayManager.getDisplayState(sessionId) ?: "stopped"
        }

        AsyncFunction("capturePhoto") { format: String ->
            val context = appContext.reactContext?.applicationContext
                ?: throw Exception("Application context not available")
            runBlocking {
                CameraSessionManager.capturePhoto(context, format)
            }
            null
        }

        // MARK: - Mock Device Kit (DEBUG only)

        AsyncFunction("enableMockDeviceKit") { config: Map<String, Any> ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            val context = appContext.reactContext?.applicationContext
                ?: throw Exception("Application context not available")
            val initiallyRegistered = config["initiallyRegistered"] as? Boolean ?: true
            val initialPermissionsGranted = config["initialPermissionsGranted"] as? Boolean ?: true
            MockDeviceManager.enableMockDeviceKit(context, initiallyRegistered, initialPermissionsGranted)
        }

        AsyncFunction("disableMockDeviceKit") {
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            val context = appContext.reactContext?.applicationContext
                ?: throw Exception("Application context not available")
            MockDeviceManager.disableMockDeviceKit(context)
        }

        AsyncFunction("isMockDeviceKitEnabled") {
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            val context = appContext.reactContext?.applicationContext
                ?: throw Exception("Application context not available")
            MockDeviceManager.isMockDeviceKitEnabled(context)
        }

        AsyncFunction("pairMockDevice") { model: String? ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            val context = appContext.reactContext?.applicationContext
                ?: throw Exception("Application context not available")
            MockDeviceManager.pairMockDevice(context, model ?: "rayBanMeta")
        }

        AsyncFunction("unpairMockDevice") { deviceId: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            val context = appContext.reactContext?.applicationContext
                ?: throw Exception("Application context not available")
            MockDeviceManager.unpairMockDevice(context, deviceId)
        }

        AsyncFunction("getMockDevices") {
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            MockDeviceManager.getMockDevices()
        }

        AsyncFunction("mockDevicePowerOn") { id: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            MockDeviceManager.powerOn(id)
        }

        AsyncFunction("mockDevicePowerOff") { id: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            MockDeviceManager.powerOff(id)
        }

        AsyncFunction("mockDeviceDon") { id: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            MockDeviceManager.don(id)
        }

        AsyncFunction("mockDeviceDoff") { id: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            MockDeviceManager.doff(id)
        }

        AsyncFunction("mockDeviceFold") { id: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            MockDeviceManager.fold(id)
        }

        AsyncFunction("mockDeviceUnfold") { id: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            MockDeviceManager.unfold(id)
        }

        AsyncFunction("mockDeviceTap") { id: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            MockDeviceManager.tap(id)
        }

        AsyncFunction("mockDeviceTapAndHold") { id: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            MockDeviceManager.tapAndHold(id)
        }

        AsyncFunction("mockDeviceSetCameraFeed") { id: String, fileUrl: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            MockDeviceManager.setCameraFeed(id, fileUrl)
        }

        AsyncFunction("mockDeviceSetCapturedImage") { id: String, fileUrl: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            MockDeviceManager.setCapturedImage(id, fileUrl)
        }

        AsyncFunction("mockDeviceSetCameraFeedFromCamera") { id: String, facing: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            MockDeviceManager.setCameraFeedFromCamera(id, facing)
        }

        AsyncFunction("mockSetPermissionStatus") { permission: String, status: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            val context = appContext.reactContext?.applicationContext
                ?: throw Exception("Application context not available")
            MockDeviceManager.setPermissionStatus(context, permission, status)
        }

        AsyncFunction("mockSetPermissionRequestResult") { permission: String, result: String ->
            if (!isDebug) throw Exception("Mock devices are only available in debug builds")
            val context = appContext.reactContext?.applicationContext
                ?: throw Exception("Application context not available")
            MockDeviceManager.setPermissionRequestResult(context, permission, result)
        }


        OnNewIntent { intent -> ExperimentalCapabilitiesManager.handleIntent(intent) }

        AsyncFunction("addInputsToSession") { id: String, config: Map<String, Any> ->
            ExperimentalCapabilitiesManager.addInputs(id, config)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("removeInputsFromSession") { id: String ->
            ExperimentalCapabilitiesManager.removeInputs(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("addMotionToSession") { id: String, config: Map<String, Any> ->
            ExperimentalCapabilitiesManager.addMotion(id, config)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("startMotion") { id: String ->
            ExperimentalCapabilitiesManager.startMotion(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("stopMotion") { id: String ->
            ExperimentalCapabilitiesManager.stopMotion(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("removeMotionFromSession") { id: String ->
            ExperimentalCapabilitiesManager.removeMotion(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("addSpeechToSession") { id: String ->
            ExperimentalCapabilitiesManager.addSpeech(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("startSpeech") { id: String ->
            ExperimentalCapabilitiesManager.startSpeech(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("stopSpeech") { id: String ->
            ExperimentalCapabilitiesManager.stopSpeech(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("removeSpeechFromSession") { id: String ->
            ExperimentalCapabilitiesManager.removeSpeech(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("startVoiceInvocations") { id: String ->
            ExperimentalCapabilitiesManager.startVoice(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("startPhotoCapture") { id: String ->
            CameraSessionManager.startPhotoCapture(id, checkNotNull(appContext.reactContext))
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("stopPhotoCapture") { id: String ->
            CameraSessionManager.stopPhotoCapture(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("captureHighQualityPhoto") { id: String, config: Map<String, Any> ->
            CameraSessionManager.captureHighQualityPhoto(id, config)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("startCameraStream") { id: String ->
            CameraSessionManager.startCameraStream(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("stopCameraStream") { id: String ->
            CameraSessionManager.stopCameraStream(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("stopVoiceInvocations") Coroutine { ->
            withContext(Dispatchers.Main) { ExperimentalCapabilitiesManager.stopVoice() }
        }
        AsyncFunction("respondToVoiceInvocation") Coroutine { id: String, success: Boolean, output: String? ->
            withContext(Dispatchers.Main) { ExperimentalCapabilitiesManager.respondToVoice(id, success, output) }
        }
        AsyncFunction("getPendingVoiceInvocations") { ExperimentalCapabilitiesManager.getPendingVoiceInvocations() }.runOnQueue(Queues.MAIN)
        AsyncFunction("isVoiceInvocationLaunch") { ExperimentalCapabilitiesManager.consumeVoiceLaunch() }.runOnQueue(Queues.MAIN)
        AsyncFunction("getPendingRegistrationRequests") { ExperimentalCapabilitiesManager.getPendingRegistrationRequests() }.runOnQueue(Queues.MAIN)
        AsyncFunction("respondToRegistrationRequest") { id: String, accept: Boolean ->
            ExperimentalCapabilitiesManager.respondToRegistrationRequest(id, accept, checkNotNull(appContext.currentActivity))
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("getSessionDevice") { id: String ->
            WearablesManager.getSessionDevice(id)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("mockDeviceSimulate") { id: String, event: Map<String, Any> ->
            check(isDebug) { "Mock devices are only available in debug builds" }
            MockDeviceManager.simulate(id, event)
        }.runOnQueue(Queues.MAIN)
        AsyncFunction("startMockDeviceTestServer") Coroutine { port: Int ->
            check(isDebug) { "Mock devices are only available in debug builds" }
            require(port in 0..65535) { "Invalid port" }
            MockDeviceManager.startTestServer(checkNotNull(appContext.reactContext), port)
        }
        AsyncFunction("stopMockDeviceTestServer") Coroutine { ->
            check(isDebug) { "Mock devices are only available in debug builds" }
            MockDeviceManager.stopTestServer(checkNotNull(appContext.reactContext))
        }
        AsyncFunction("mockSimulateRegistrationOutcome") { success: Boolean ->
            check(isDebug) { "Mock devices are only available in debug builds" }
            MockDeviceManager.simulateRegistrationOutcome(checkNotNull(appContext.reactContext), success)
        }.runOnQueue(Queues.MAIN)

        // MARK: - View

        View(EMWDATView::class) {
            Prop("mockDisplayDeviceId") { view: EMWDATView, id: String? -> view.setMockDisplayDevice(id) }

            Prop("isActive") { view: EMWDATView, isActive: Boolean ->
                view.setActive(isActive)
            }

            Prop("resizeMode") { view: EMWDATView, resizeMode: String ->
                view.setResizeMode(resizeMode)
            }
        }
    }
}
