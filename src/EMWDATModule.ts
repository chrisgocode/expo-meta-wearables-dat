import { NativeModule, requireNativeModule } from "expo";
import { Platform } from "react-native";

import type {
  InputsConfiguration,
  MotionConfiguration,
  VoiceInvocation,
  RegistrationRequest,
  PhotoConfiguration,
  MockDeviceEvent,
  CameraFacing,
  Device,
  DisplayRoot,
  DisplayState,
  EMWDATModuleEvents,
  LogLevel,
  MockDeviceKitConfig,
  Permission,
  PermissionStatus,
  PhotoCaptureFormat,
  GlassesModel,
  RegistrationState,
  StreamConfiguration,
  SerializedDisplayNode,
} from "./EMWDAT.types";
import { serializeDisplayTree, assertValidDisplayRoot, type TapRegistry } from "./displayTree";

/**
 * Raw native module interface.
 * Uses string types for enum params/returns — wrapper functions cast to typed unions.
 */
declare class EMWDATNativeModule extends NativeModule<EMWDATModuleEvents> {
  setLogLevel(level: string): void;
  configure(): Promise<void>;
  getRegistrationState(): string;
  getRegistrationStateAsync(): Promise<string>;
  startRegistration(): Promise<void>;
  startUnregistration(): Promise<void>;
  handleUrl(url: string): Promise<boolean>;
  checkPermissionStatus(permission: string): Promise<string>;
  requestPermission(permission: string): Promise<string>;
  getDevices(): Promise<Device[]>;
  getDevice(identifier: string): Promise<Device | null>;
  openFirmwareUpdate(): Promise<void>;
  openDATGlassesAppUpdate(): Promise<void>;

  // Display
  addDisplayToSession(sessionId: string): Promise<void>;
  renderDisplay(sessionId: string, root: SerializedDisplayNode): Promise<void>;
  clearDisplay(sessionId: string): Promise<void>;
  removeDisplayFromSession(sessionId: string): Promise<void>;
  getDisplayState(sessionId: string): Promise<string>;

  // Session-based streaming
  createSession(deviceId?: string): Promise<string>;
  startSession(sessionId: string): Promise<void>;
  stopSession(sessionId: string): Promise<void>;
  addCameraToSession(sessionId: string, config: Partial<StreamConfiguration>): Promise<void>;
  removeCameraFromSession(sessionId: string): Promise<void>;
  capturePhoto(format: string): Promise<void>;

  getSessionDevice(sessionId: string): Promise<Device | null>;
  addInputsToSession(sessionId: string, config: InputsConfiguration): Promise<void>;
  removeInputsFromSession(sessionId: string): Promise<void>;
  addMotionToSession(sessionId: string, config: MotionConfiguration): Promise<void>;
  startMotion(sessionId: string): Promise<void>;
  stopMotion(sessionId: string): Promise<void>;
  removeMotionFromSession(sessionId: string): Promise<void>;
  addSpeechToSession(sessionId: string): Promise<void>;
  startSpeech(sessionId: string): Promise<void>;
  stopSpeech(sessionId: string): Promise<void>;
  removeSpeechFromSession(sessionId: string): Promise<void>;
  startVoiceInvocations(deviceId: string): Promise<void>;
  stopVoiceInvocations(): Promise<void>;
  respondToVoiceInvocation(
    invocationId: string,
    success: boolean,
    actionOutput?: string
  ): Promise<boolean>;
  getPendingVoiceInvocations(): Promise<VoiceInvocation[]>;
  isVoiceInvocationLaunch(): Promise<boolean>;
  getPendingRegistrationRequests(): Promise<RegistrationRequest[]>;
  respondToRegistrationRequest(requestId: string, accept: boolean): Promise<void>;
  startPhotoCapture(sessionId: string): Promise<void>;
  stopPhotoCapture(sessionId: string): Promise<void>;
  captureHighQualityPhoto(sessionId: string, config: PhotoConfiguration): Promise<void>;
  startCameraStream(sessionId: string): Promise<void>;
  stopCameraStream(sessionId: string): Promise<void>;
  mockDeviceSimulate(deviceId: string, event: MockDeviceEvent): Promise<string | boolean | null>;
  startMockDeviceTestServer(port: number): Promise<number>;
  stopMockDeviceTestServer(): Promise<void>;
  mockSimulateRegistrationOutcome(success: boolean): Promise<void>;

  // Mock device kit
  enableMockDeviceKit(config: MockDeviceKitConfig): Promise<void>;
  disableMockDeviceKit(): Promise<void>;
  isMockDeviceKitEnabled(): Promise<boolean>;
  pairMockDevice(model: string): Promise<string>;
  unpairMockDevice(deviceId: string): Promise<void>;
  getMockDevices(): Promise<string[]>;
  mockDevicePowerOn(id: string): Promise<void>;
  mockDevicePowerOff(id: string): Promise<void>;
  mockDeviceDon(id: string): Promise<void>;
  mockDeviceDoff(id: string): Promise<void>;
  mockDeviceFold(id: string): Promise<void>;
  mockDeviceUnfold(id: string): Promise<void>;
  mockDeviceTap(id: string): Promise<void>;
  mockDeviceTapAndHold(id: string): Promise<void>;
  mockDeviceSetCameraFeed(id: string, fileUrl: string): Promise<void>;
  mockDeviceSetCapturedImage(id: string, fileUrl: string): Promise<void>;
  mockDeviceSetCameraFeedFromCamera(id: string, facing: string): Promise<void>;
  mockSetPermissionStatus(permission: string, status: string): Promise<void>;
  mockSetPermissionRequestResult(permission: string, result: string): Promise<void>;
}

/** The native EMWDAT module instance. */
export const EMWDATModule = requireNativeModule<EMWDATNativeModule>("EMWDAT");

// =============================================================================
// Typed wrapper functions
// =============================================================================

/**
 * Subscribe to a native SDK event. Returns a subscription handle, or `null` on web.
 *
 * @param eventName - The event to listen for (e.g. `"onRegistrationStateChanged"`).
 * @param listener - Callback invoked when the event fires.
 */
export function addListener<E extends keyof EMWDATModuleEvents>(
  eventName: E,
  listener: EMWDATModuleEvents[E]
): { remove: () => void } | null {
  if (Platform.OS === "web") {
    return null;
  }
  return EMWDATModule.addListener(eventName, listener);
}

/** Set the native SDK log verbosity. */
export function setLogLevel(level: LogLevel): void {
  EMWDATModule.setLogLevel(level);
}

/** Initialize the Meta Wearables SDK. Must be called before any other SDK method. */
export async function configure(): Promise<void> {
  return EMWDATModule.configure();
}

/** Return the current registration state synchronously. */
export function getRegistrationState(): RegistrationState {
  return EMWDATModule.getRegistrationState() as RegistrationState;
}

/** Return the current registration state asynchronously. */
export async function getRegistrationStateAsync(): Promise<RegistrationState> {
  return (await EMWDATModule.getRegistrationStateAsync()) as RegistrationState;
}

/** Begin the device registration flow. Opens the Meta AI companion app. */
export async function startRegistration(): Promise<void> {
  return EMWDATModule.startRegistration();
}

/** Unregister the current device from the SDK. */
export async function startUnregistration(): Promise<void> {
  return EMWDATModule.startUnregistration();
}

/** Handle a deep-link URL callback from the Meta AI companion app. Returns `true` if the URL was consumed. */
export async function handleUrl(url: string): Promise<boolean> {
  return EMWDATModule.handleUrl(url);
}

/** Check the current status of a permission without prompting the user. */
export async function checkPermissionStatus(permission: Permission): Promise<PermissionStatus> {
  return (await EMWDATModule.checkPermissionStatus(permission)) as PermissionStatus;
}

/** Request a permission from the user. Returns the resulting status. */
export async function requestPermission(permission: Permission): Promise<PermissionStatus> {
  return (await EMWDATModule.requestPermission(permission)) as PermissionStatus;
}

/** Return all registered Meta Wearables devices. */
export async function getDevices(): Promise<Device[]> {
  return EMWDATModule.getDevices();
}

/** Return a specific device by its identifier, or `null` if not found. */
export async function getDevice(identifier: string): Promise<Device | null> {
  return EMWDATModule.getDevice(identifier);
}

/** Open the Meta AI firmware update screen for the connected device. */
export async function openFirmwareUpdate(): Promise<void> {
  return EMWDATModule.openFirmwareUpdate();
}

/** Open the Meta AI DAT glasses-app update destination for the configured app. */
export async function openDATGlassesAppUpdate(): Promise<void> {
  return EMWDATModule.openDATGlassesAppUpdate();
}

// =============================================================================
// Session-based streaming
// =============================================================================

/** Create a new device session. Returns a sessionId. Optionally target a specific device. */
export async function createSession(deviceId?: string): Promise<string> {
  return EMWDATModule.createSession(deviceId);
}

/** Start a previously created session. Connects to the device. */
export async function startSession(sessionId: string): Promise<void> {
  return EMWDATModule.startSession(sessionId);
}

/** Stop a session. This is terminal — create a new session to stream again. */
export async function stopSession(sessionId: string): Promise<void> {
  return EMWDATModule.stopSession(sessionId);
}

/**
 * Attach the camera capability to a session and start its stream.
 *
 * Backed by `DeviceSession.addCamera(config)` (SDK 0.9) — the camera owns the hardware
 * resource and exposes the video stream as its child.
 */
export async function addCameraToSession(
  sessionId: string,
  config?: Partial<StreamConfiguration>
): Promise<void> {
  return EMWDATModule.addCameraToSession(sessionId, config ?? {});
}

/** Detach the camera capability from a session. Stopping it cascades to the stream. */
export async function removeCameraFromSession(sessionId: string): Promise<void> {
  return EMWDATModule.removeCameraFromSession(sessionId);
}

/** @deprecated Renamed to {@link addCameraToSession} for SDK 0.9 (`addStream` was removed). */
export async function addStreamToSession(
  sessionId: string,
  config?: Partial<StreamConfiguration>
): Promise<void> {
  return addCameraToSession(sessionId, config);
}

/** @deprecated Renamed to {@link removeCameraFromSession} for SDK 0.9. */
export async function removeStreamFromSession(sessionId: string): Promise<void> {
  return removeCameraFromSession(sessionId);
}

/** Capture a photo from the active stream. Defaults to JPEG format. */
export async function capturePhoto(format?: PhotoCaptureFormat): Promise<void> {
  return EMWDATModule.capturePhoto(format ?? "jpeg");
}

// =============================================================================
// Display (Meta Ray-Ban Display)
// =============================================================================

/**
 * Tap handlers for the tree most recently rendered to each session.
 *
 * Replaced wholesale on every render: the SDK has no partial update, so a tree that has
 * been superseded can no longer receive taps. Taps for unknown ids are dropped.
 */
const displayTapRegistries = new Map<string, TapRegistry>();

let displayTapSubscription: { remove: () => void } | null = null;

function ensureDisplayTapRouting(): void {
  if (displayTapSubscription) return;
  displayTapSubscription = EMWDATModule.addListener("onDisplayTap", ({ sessionId, tapId }) => {
    displayTapRegistries.get(sessionId)?.get(tapId)?.();
  });
}

/**
 * Attach the display capability to a session.
 *
 * Hides a lifecycle difference: iOS requires an explicit `start()` after attaching, Android
 * starts on attach. One display per session; the session must already be started.
 */
export async function addDisplayToSession(sessionId: string): Promise<void> {
  ensureDisplayTapRouting();
  return EMWDATModule.addDisplayToSession(sessionId);
}

/**
 * Render a tree to the glasses, replacing whatever is on screen.
 *
 * There is no partial update — re-render the whole tree. Tap handler identity does not
 * survive a render, so do not hold ids across calls.
 *
 * Resolving means the SDK accepted the tree, not that it is visible yet.
 */
export async function renderDisplay(sessionId: string, root: DisplayRoot): Promise<void> {
  assertValidDisplayRoot(root);
  const { root: serialized, handlers } = serializeDisplayTree(root);
  displayTapRegistries.set(sessionId, handlers);
  return EMWDATModule.renderDisplay(sessionId, serialized);
}

/** Clear the display without detaching the capability. */
export async function clearDisplay(sessionId: string): Promise<void> {
  displayTapRegistries.set(sessionId, new Map());
  return EMWDATModule.clearDisplay(sessionId);
}

/** Detach the display capability, freeing the session's capability slot. */
export async function removeDisplayFromSession(sessionId: string): Promise<void> {
  displayTapRegistries.delete(sessionId);
  return EMWDATModule.removeDisplayFromSession(sessionId);
}

/** Current display state for a session. */
export async function getDisplayState(sessionId: string): Promise<DisplayState> {
  return (await EMWDATModule.getDisplayState(sessionId)) as DisplayState;
}

// =============================================================================
// Mock Device Kit (DEBUG only, throws on web/release)
// =============================================================================

/** Enable MockDeviceKit with optional configuration. */
export async function enableMockDeviceKit(config?: MockDeviceKitConfig): Promise<void> {
  return EMWDATModule.enableMockDeviceKit(config ?? {});
}

/** Disable MockDeviceKit and remove all fake implementations. */
export async function disableMockDeviceKit(): Promise<void> {
  return EMWDATModule.disableMockDeviceKit();
}

/** Check if MockDeviceKit is currently enabled. */
export async function isMockDeviceKitEnabled(): Promise<boolean> {
  return EMWDATModule.isMockDeviceKitEnabled();
}

/** Pair a simulated glasses device. Defaults to Ray-Ban Meta. Returns the device identifier. */
export async function pairMockDevice(model: GlassesModel = "rayBanMeta"): Promise<string> {
  return EMWDATModule.pairMockDevice(model);
}

/** Unpair a mock device by identifier. */
export async function unpairMockDevice(deviceId: string): Promise<void> {
  return EMWDATModule.unpairMockDevice(deviceId);
}

/** Get identifiers of all active mock devices. */
export async function getMockDevices(): Promise<string[]> {
  return EMWDATModule.getMockDevices();
}

/** Power on a mock device. */
export async function mockDevicePowerOn(id: string): Promise<void> {
  return EMWDATModule.mockDevicePowerOn(id);
}

/** Power off a mock device. */
export async function mockDevicePowerOff(id: string): Promise<void> {
  return EMWDATModule.mockDevicePowerOff(id);
}

/** Simulate putting the glasses on (don). */
export async function mockDeviceDon(id: string): Promise<void> {
  return EMWDATModule.mockDeviceDon(id);
}

/** Simulate taking the glasses off (doff). */
export async function mockDeviceDoff(id: string): Promise<void> {
  return EMWDATModule.mockDeviceDoff(id);
}

/** Simulate folding the glasses. */
export async function mockDeviceFold(id: string): Promise<void> {
  return EMWDATModule.mockDeviceFold(id);
}

/** Simulate unfolding the glasses. */
export async function mockDeviceUnfold(id: string): Promise<void> {
  return EMWDATModule.mockDeviceUnfold(id);
}

/** Simulate a captouch tap on a mock device (pauses/resumes the active stream). */
export async function mockDeviceTap(id: string): Promise<void> {
  return EMWDATModule.mockDeviceTap(id);
}

/** Simulate a captouch tap-and-hold on a mock device (stops the active stream). */
export async function mockDeviceTapAndHold(id: string): Promise<void> {
  return EMWDATModule.mockDeviceTapAndHold(id);
}

/** Set the camera feed video for a mock device from a local file URL. */
export async function mockDeviceSetCameraFeed(id: string, fileUrl: string): Promise<void> {
  return EMWDATModule.mockDeviceSetCameraFeed(id, fileUrl);
}

/** Set the captured image for a mock device from a local file URL. */
export async function mockDeviceSetCapturedImage(id: string, fileUrl: string): Promise<void> {
  return EMWDATModule.mockDeviceSetCapturedImage(id, fileUrl);
}

/** Set the camera feed from the phone's physical camera for a mock device. */
export async function mockDeviceSetCameraFeedFromCamera(
  id: string,
  facing: CameraFacing
): Promise<void> {
  return EMWDATModule.mockDeviceSetCameraFeedFromCamera(id, facing);
}

/** Set a mock permission status for testing. */
export async function mockSetPermissionStatus(
  permission: Permission,
  status: PermissionStatus
): Promise<void> {
  return EMWDATModule.mockSetPermissionStatus(permission, status);
}

/** Set the expected result when a permission is requested in mock mode. */
export async function mockSetPermissionRequestResult(
  permission: Permission,
  result: PermissionStatus
): Promise<void> {
  return EMWDATModule.mockSetPermissionRequestResult(permission, result);
}

// DAT 1.0 capabilities (experimental)
/** Return the live device snapshot associated with a session. */
export async function getSessionDevice(sessionId: string): Promise<Device | null> {
  return EMWDATModule.getSessionDevice(sessionId);
}

/** Experimental: attach inputs. Starts automatically; listen for onInputEvent. */
export async function addInputsToSession(
  sessionId: string,
  config: InputsConfiguration = {}
): Promise<void> {
  return EMWDATModule.addInputsToSession(sessionId, config);
}

/** Detach inputs from a session. */
export async function removeInputsFromSession(sessionId: string): Promise<void> {
  return EMWDATModule.removeInputsFromSession(sessionId);
}

/** Experimental: attach and start motion. Listen for onMotionSample. */
export async function addMotionToSession(
  sessionId: string,
  config: MotionConfiguration = {}
): Promise<void> {
  return EMWDATModule.addMotionToSession(sessionId, config);
}

/** Restart attached motion after stopMotion. */
export async function startMotion(sessionId: string): Promise<void> {
  return EMWDATModule.startMotion(sessionId);
}

/** Pause motion without removing the capability. */
export async function stopMotion(sessionId: string): Promise<void> {
  return EMWDATModule.stopMotion(sessionId);
}

/** Detach motion from a session. */
export async function removeMotionFromSession(sessionId: string): Promise<void> {
  return EMWDATModule.removeMotionFromSession(sessionId);
}

/** Experimental: attach and start speech after microphone permission is granted. */
export async function addSpeechToSession(sessionId: string): Promise<void> {
  return EMWDATModule.addSpeechToSession(sessionId);
}

/** Restart attached speech after stopSpeech. */
export async function startSpeech(sessionId: string): Promise<void> {
  return EMWDATModule.startSpeech(sessionId);
}

/** Stop speech without removing the capability. */
export async function stopSpeech(sessionId: string): Promise<void> {
  return EMWDATModule.stopSpeech(sessionId);
}

/** Detach speech from a session. */
export async function removeSpeechFromSession(sessionId: string): Promise<void> {
  return EMWDATModule.removeSpeechFromSession(sessionId);
}

/** Experimental: start the app-scoped voice stream. No device session is required. */
export async function startVoiceInvocations(deviceId: string): Promise<void> {
  return EMWDATModule.startVoiceInvocations(deviceId);
}

/** Stop voice listening and fail unanswered requests. */
export async function stopVoiceInvocations(): Promise<void> {
  return EMWDATModule.stopVoiceInvocations();
}

/** Answer a voice request once. Returns whether the SDK delivered the response. */
export async function respondToVoiceInvocation(
  invocationId: string,
  success: boolean,
  actionOutput?: string
): Promise<boolean> {
  return EMWDATModule.respondToVoiceInvocation(invocationId, success, actionOutput);
}

/** Get delivered requests that still need a response, including cold starts. */
export async function getPendingVoiceInvocations(): Promise<VoiceInvocation[]> {
  return EMWDATModule.getPendingVoiceInvocations();
}

/** Android: consume the cold/warm launch flag validated by DAT. iOS returns false. */
export async function isVoiceInvocationLaunch(): Promise<boolean> {
  return EMWDATModule.isVoiceInvocationLaunch();
}

/** Get Meta AI registration requests, including ones received before JS subscribed. */
export async function getPendingRegistrationRequests(): Promise<RegistrationRequest[]> {
  return EMWDATModule.getPendingRegistrationRequests();
}

/** Continue or cancel a Meta AI initiated registration request once. */
export async function respondToRegistrationRequest(
  requestId: string,
  accept: boolean
): Promise<void> {
  return EMWDATModule.respondToRegistrationRequest(requestId, accept);
}

/** Experimental: start the attached camera photo child without starting a video stream. */
export async function startPhotoCapture(sessionId: string): Promise<void> {
  return EMWDATModule.startPhotoCapture(sessionId);
}

/** Stop standalone photo capture. Android photo children are terminal; reattach the camera to capture again. */
export async function stopPhotoCapture(sessionId: string): Promise<void> {
  return EMWDATModule.stopPhotoCapture(sessionId);
}

/** Experimental: capture via Camera.photo. Wait for photo started state first; result arrives by event. */
export async function captureHighQualityPhoto(
  sessionId: string,
  config: PhotoConfiguration = {}
): Promise<void> {
  return EMWDATModule.captureHighQualityPhoto(sessionId, config);
}

/** Start the video stream of an attached camera. Android stopped streams are terminal; reattach the camera. */
export async function startCameraStream(sessionId: string): Promise<void> {
  return EMWDATModule.startCameraStream(sessionId);
}

/** Stop the video stream while retaining the camera and photo child. */
export async function stopCameraStream(sessionId: string): Promise<void> {
  return EMWDATModule.stopCameraStream(sessionId);
}

/** Debug-only: inject a DAT 1.0 mock service event. */
export async function mockDeviceSimulate(
  deviceId: string,
  event: MockDeviceEvent
): Promise<string | boolean | null> {
  return EMWDATModule.mockDeviceSimulate(deviceId, event);
}

/** Debug-only: start the SDK test server and return its bound port. */
export async function startMockDeviceTestServer(port: number = 0): Promise<number> {
  return EMWDATModule.startMockDeviceTestServer(port);
}

/** Debug-only: stop the SDK test server. */
export async function stopMockDeviceTestServer(): Promise<void> {
  return EMWDATModule.stopMockDeviceTestServer();
}

/** Debug-only, Android: simulate a registration outcome. iOS rejects this method. */
export async function mockSimulateRegistrationOutcome(success: boolean): Promise<void> {
  return EMWDATModule.mockSimulateRegistrationOutcome(success);
}
