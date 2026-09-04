import type { StyleProp, ViewStyle } from "react-native";

// =============================================================================
// LOG LEVEL
// =============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error" | "none";

// =============================================================================
// REGISTRATION
// =============================================================================

/**
 * Registration state flow: unavailable → available → registering → registered
 *
 * Android additionally reports `unregistering` while a registration is being
 * torn down; iOS collapses that into `unavailable`.
 */
export type RegistrationState =
  | "unavailable"
  | "available"
  | "registering"
  | "registered"
  | "unregistering";

// =============================================================================
// PERMISSIONS
// =============================================================================

export type Permission = "camera";

export type PermissionStatus = "granted" | "denied";

// =============================================================================
// DEVICE
// =============================================================================

export type DeviceIdentifier = string;

export type LinkState = "connected" | "disconnected" | "connecting";

export type Compatibility =
  | "compatible"
  | "undefined"
  | "deviceUpdateRequired"
  | "sdkUpdateRequired";

export type DeviceType =
  | "rayBanMeta"
  | "oakleyMetaHSTN"
  | "oakleyMetaVanguard"
  | "metaRayBanDisplay"
  | "rayBanMetaOptics"
  | "metaGlasses"
  | "unknown";

export interface Device {
  identifier: DeviceIdentifier;
  name: string;
  linkState: LinkState;
  deviceType: DeviceType;
  compatibility: Compatibility;
  /** Whether this device can render display content (Meta Ray-Ban Display). */
  supportsDisplay: boolean;
}

/** Per-device thermal state reported by the glasses. */
export type ThermalLevel =
  | "unknown"
  | "none"
  | "light"
  | "moderate"
  | "severe"
  | "critical"
  | "emergency"
  | "shutdown";

/** Live device state (SDK 0.7+). */
export interface DeviceState {
  thermalLevel: ThermalLevel;
}

// =============================================================================
// STREAMING
// =============================================================================

export type StreamingResolution = "high" | "medium" | "low";

export type VideoCodec = "raw" | "hvc1";

/** Frame rates accepted by the SDK. */
export type StreamFrameRate = 2 | 7 | 15 | 24 | 30;

export interface StreamConfiguration {
  videoCodec: VideoCodec;
  resolution: StreamingResolution;
  frameRate: number;
  /** Target a specific device by identifier. When omitted, auto-selects a connected device. */
  deviceId?: DeviceIdentifier;
  /**
   * When true, the SDK delivers compressed HEVC buffers instead of decoded pixel data.
   * On iOS this maps to videoCodec "hvc1". On Android it uses StreamConfiguration.compressVideo.
   * Default: false.
   */
  compressVideo?: boolean;
}

/** @deprecated Renamed to {@link StreamConfiguration} to match SDK 0.7+. */
export type StreamSessionConfig = StreamConfiguration;

/**
 * Camera stream state.
 *
 * iOS: stopping → stopped → waitingForDevice → starting → streaming → paused.
 * Android: STARTING → STARTED → STREAMING → PAUSED → STOPPING → STOPPED → CLOSED.
 * The union covers both; `waitingForDevice` is iOS-only, `started`/`closed` are Android-only.
 */
export type StreamState =
  | "stopping"
  | "stopped"
  | "closed"
  | "waitingForDevice"
  | "starting"
  | "started"
  | "streaming"
  | "paused";

/** @deprecated Renamed to {@link StreamState} to match SDK 0.7+. */
export type StreamSessionState = StreamState;

/**
 * Lifecycle of the `Camera` capability that owns the camera hardware (SDK 0.9+).
 * Stopping the camera cascades to its stream child.
 */
export type CameraState = "starting" | "started" | "stopping" | "stopped";

/**
 * Metadata sent over the bridge for each video frame.
 * Actual pixel data stays on the native side (rendered via EMWDATStreamView).
 */
export interface VideoFrameMetadata {
  timestamp: number;
  width: number;
  height: number;
  /** Whether this frame contains compressed HEVC data (true) or decoded pixel data (false). */
  isCompressed?: boolean;
  /** Android only — whether the frame carries HEVC codec configuration instead of picture data. */
  isCodecConfig?: boolean;
}

// =============================================================================
// PHOTO CAPTURE
// =============================================================================

export type PhotoCaptureFormat = "jpeg" | "heic";

export interface PhotoData {
  filePath: string;
  format: PhotoCaptureFormat;
  timestamp: number;
  width?: number;
  height?: number;
  base64?: string;
}

// =============================================================================
// DEVICE SESSION
// =============================================================================

/**
 * Lifecycle of a DeviceSession: idle → starting → started → paused → stopping → stopped.
 * `stopped` is terminal — create a new session via createSession().
 */
export type DeviceSessionState =
  | "idle"
  | "starting"
  | "started"
  | "paused"
  | "stopping"
  | "stopped";

/**
 * Errors that can occur during DeviceSession operations.
 *
 * `capabilityDenied`, `deviceDisconnected` and `sessionEndedByDevice` are Android-only;
 * every other case exists on both platforms.
 */
export type DeviceSessionErrorCode =
  | "noEligibleDevice"
  | "sessionAlreadyStopped"
  | "sessionAlreadyExists"
  | "sessionIdle"
  | "capabilityAlreadyActive"
  | "capabilityNotFound"
  | "capabilityDenied"
  | "deviceDisconnected"
  | "sessionEndedByDevice"
  | "thermalCritical"
  | "thermalEmergency"
  | "peakPowerShutdown"
  | "batteryCritical"
  | "datAppOnTheGlassesUpdateRequired"
  | "dwaUnavailable"
  | "unexpectedError";

/**
 * State of a capability (e.g. Camera) attached to a DeviceSession.
 */
export type CapabilityState = "active" | "stopped";

// =============================================================================
// MOCK DEVICE
// =============================================================================

/**
 * Configuration for enabling MockDeviceKit.
 */
export interface MockDeviceKitConfig {
  /** Whether to start in registered state. Default: true. */
  initiallyRegistered?: boolean;
  /** Whether camera permission starts as granted. Default: true. */
  initialPermissionsGranted?: boolean;
}

/** Glasses models MockDeviceKit can simulate (SDK 0.8+). */
export type GlassesModel =
  | "rayBanMeta"
  | "oakleyMetaHSTN"
  | "oakleyMetaVanguard"
  | "rayBanMetaOptics"
  | "metaGlasses";

/**
 * Which phone camera to use as mock device camera source.
 */
export type CameraFacing = "front" | "back";

// =============================================================================
// ERRORS
// =============================================================================

export type WearablesErrorCode =
  | "internalError"
  | "alreadyConfigured"
  | "configurationError"
  | "notInitialized";

export type RegistrationErrorCode =
  | "alreadyRegistered"
  | "configurationInvalid"
  | "metaAINotInstalled"
  | "networkUnavailable"
  | "timeout"
  | "failedToRegister"
  | "unknown";

export type UnregistrationErrorCode =
  | "alreadyUnregistered"
  | "configurationInvalid"
  | "metaAINotInstalled"
  | "timeout"
  | "failedToUnregister"
  | "unknown";

export type PermissionErrorCode =
  | "noDevice"
  | "noDeviceWithConnection"
  | "connectionError"
  | "metaAINotInstalled"
  | "requestInProgress"
  | "requestTimeout"
  | "internalError";

/** Errors from openFirmwareUpdate() / openDATGlassesAppUpdate() (SDK 0.7+). */
export type NavigationErrorCode = "metaAINotInstalled" | "notRegistered";

export type WearablesHandleURLErrorCode = "registrationError" | "unregistrationError";

/**
 * Discriminated union — errors with associated values carry extra fields.
 *
 * iOS reports `internalError`, `deviceNotFound`, `deviceNotConnected`, `videoStreamingError`,
 * `thermalCritical`, `thermalEmergency`, `peakPowerShutdown`, `batteryCritical` and
 * `photoCaptureFailed`. Android reports `videoStreamingError` (STREAM_ERROR),
 * `criticalStreamError`, `thermalHot`, `batteryLow` and `peakPowerLimit`.
 * `timeout`, `permissionDenied` and `hingesClosed` exist on both.
 */
export type StreamError =
  | { type: "internalError" }
  | { type: "criticalStreamError" }
  | { type: "deviceNotFound"; deviceId: DeviceIdentifier }
  | { type: "deviceNotConnected"; deviceId: DeviceIdentifier }
  | { type: "timeout" }
  | { type: "videoStreamingError" }
  | { type: "permissionDenied" }
  | { type: "hingesClosed" }
  | { type: "thermalCritical" }
  | { type: "thermalHot" }
  | { type: "thermalEmergency" }
  | { type: "peakPowerShutdown" }
  | { type: "peakPowerLimit" }
  | { type: "batteryCritical" }
  | { type: "batteryLow" }
  | { type: "photoCaptureFailed" };

export type StreamErrorCode = StreamError["type"];

/** @deprecated Renamed to {@link StreamError} to match SDK 0.7+. */
export type StreamSessionError = StreamError;
/** @deprecated Renamed to {@link StreamErrorCode} to match SDK 0.7+. */
export type StreamSessionErrorCode = StreamErrorCode;

/**
 * Photo capture failures.
 *
 * Android surfaces these as a typed `CaptureError`. iOS removed `CaptureError` in SDK 0.9 —
 * capture failures arrive on the stream error publisher as `photoCaptureFailed`.
 */
export type CaptureError =
  | "deviceDisconnected"
  | "notStreaming"
  | "captureInProgress"
  | "captureFailed";

export type DecoderError =
  | { type: "unexpected" }
  | { type: "cancelled" }
  | { type: "invalidFormat" }
  | { type: "configurationError"; status: number }
  | { type: "decodingFailed"; status: number };

export type DecoderErrorCode = DecoderError["type"];

// =============================================================================
// DISPLAY (Meta Ray-Ban Display — SDK 0.9)
// =============================================================================

/**
 * Display capability lifecycle.
 *
 * Android adds `closed` (terminal) on top of the iOS set; iOS never emits it.
 */
export type DisplayState = "starting" | "started" | "stopping" | "stopped" | "closed";

/**
 * Display failures, normalised across platforms.
 *
 * The two SDK enums share only `deviceDisconnected`. iOS reports `deviceNotFound`,
 * `connectionNotAvailable`, `invalidVideoUrl` and `displayError` (with a message);
 * Android reports `invalidSessionState`, `renderingFailed` and `unexpectedError`.
 * Platform-only codes surface as themselves rather than collapsing to `unexpectedError`.
 */
export type DisplayError =
  | { type: "deviceDisconnected" }
  | { type: "deviceNotFound" }
  | { type: "connectionNotAvailable" }
  | { type: "invalidVideoUrl" }
  | { type: "invalidSessionState" }
  | { type: "renderingFailed" }
  | { type: "unexpectedError" }
  | { type: "displayError"; message: string };

export type DisplayErrorCode = DisplayError["type"];

/** Video playback lifecycle on the glasses display. */
export type DisplayVideoEventType = "unknown" | "started" | "ended" | "stopped" | "error";

/** Video failure detail, present when {@link DisplayVideoEventType} is `error`. */
export type DisplayVideoErrorType =
  | "unknown"
  | "urlInvalid"
  | "alreadyPlaying"
  | "playbackFailed"
  | "notBound"
  | "streamRejected"
  | "invalidDimensions"
  | "unexpectedError";

// --- View tree ------------------------------------------------------------

export type DisplayAlignment = "start" | "center" | "end" | "stretch";
export type DisplayDirection = "column" | "row" | "columnReverse" | "rowReverse";
export type DisplayTextStyle = "heading" | "body" | "meta";
export type DisplayTextColor = "primary" | "secondary";
export type DisplayButtonStyle = "primary" | "secondary" | "outline";
export type DisplayButtonGroupAlignment = "start" | "center" | "end";
export type DisplayImageSize = "icon" | "fill";
export type DisplayCornerRadius = "none" | "small" | "medium";
export type DisplayIconStyle = "filled" | "outline";
export type DisplayBackground = "none" | "card";

/**
 * Padding in display points. Omitted edges default to 0.
 *
 * Edges are writing-direction relative, matching both SDKs: iOS uses `leading`/`trailing`
 * and Android uses `paddingStart`/`paddingEnd`.
 */
export interface DisplayEdgeInsets {
  top?: number;
  bottom?: number;
  leading?: number;
  trailing?: number;
}

/** Layout properties every child of a flex node may set. */
export interface DisplayFlexChildProps {
  flexGrow?: number;
  flexShrink?: number;
  alignSelf?: DisplayAlignment;
}

/**
 * System glyphs available to {@link DisplayIconNode} and {@link DisplayButtonNode}.
 *
 * Generated from the SDK 0.9 artifacts; identical on iOS and Android (116 values).
 */
export type IconName =
  | "airplane"
  | "arrowDownShallowU"
  | "arrowLeft"
  | "arrowRight"
  | "arrowULeft"
  | "arrowUpShallowU"
  | "avatar"
  | "avatarOff"
  | "bedSide"
  | "bell"
  | "bellDiagonalRightDot"
  | "bellOff"
  | "bikeShare"
  | "bug"
  | "bullhorn"
  | "bus"
  | "calendar"
  | "campfire"
  | "caretDown"
  | "caretLeft"
  | "caretRight"
  | "caretUp"
  | "carFrontView"
  | "cart"
  | "checkmark"
  | "checkmarkCircle"
  | "circle8RaysLarge"
  | "circleHandle"
  | "clock"
  | "cloud"
  | "cloudCrescentMoon"
  | "cloudDotFourRays"
  | "cloudFiveDashes"
  | "cloudHookSwirl"
  | "cloudLightning"
  | "cocktailGlass"
  | "code"
  | "coffeeCup"
  | "compassNorthUpRed"
  | "containerWithLid"
  | "crossBriefcase"
  | "dropper"
  | "envelopeOpen"
  | "exclamationCircle"
  | "exclamationTriangle"
  | "eye"
  | "forkKnife"
  | "fourArcsUpFilled"
  | "fourArcsUpGrayscale"
  | "fourCornerFrame"
  | "gear"
  | "globeWesternHemisphere"
  | "graduationCap"
  | "hashtag"
  | "headphones"
  | "heart"
  | "house"
  | "iCircle"
  | "lightBulb"
  | "magicWand"
  | "metaAi"
  | "mountainSquare"
  | "mountainSquareStacked"
  | "museumBuilding"
  | "musicNote"
  | "nineSquaresGrid"
  | "padlockClosed"
  | "padlockOpen"
  | "palette"
  | "paperAirplane"
  | "pencil"
  | "pencilSquare"
  | "person"
  | "personCircle"
  | "phone"
  | "phoneHandsetArrowDownLeft"
  | "phoneHandsetArrowUpRight"
  | "phoneSlash"
  | "pizzaSlice"
  | "plus"
  | "plusCircle"
  | "shoppingBag"
  | "slidersHorizontal"
  | "smartGlasses"
  | "smileyCircle"
  | "speakerOff"
  | "speakerWithOneArc"
  | "speakerWithThreeArcs"
  | "speakerWithTwoArcs"
  | "speechBubble"
  | "speechBubbleOff"
  | "stadium"
  | "star"
  | "starCircleTriangleAi"
  | "taxi"
  | "threeDotsHorizontal"
  | "threeDotSpeechBubble"
  | "threeHorizontalLines"
  | "threeHorizontalLinesStackedDescending"
  | "threePeopleOverlapping"
  | "train"
  | "tree"
  | "triangleLeftVerticalLine"
  | "triangleRight"
  | "triangleRightCircle"
  | "triangleRightVerticalLine"
  | "twoArrowsClockwise"
  | "twoLinesParallel"
  | "twoSquaresStackedRightDown"
  | "twoTrianglesLeft"
  | "twoTrianglesRight"
  | "videoCamera"
  | "videoCameraOff"
  | "wristband"
  | "wristbandSlash"
  | "x";

export interface DisplayFlexNode extends DisplayFlexChildProps {
  type: "flex";
  direction?: DisplayDirection;
  spacing?: number;
  alignment?: DisplayAlignment;
  crossAlignment?: DisplayAlignment;
  wrap?: boolean;
  padding?: DisplayEdgeInsets;
  background?: DisplayBackground;
  /** Flex nodes are tappable. Wrap text in one to make the text tappable. */
  onTap?: () => void;
  children: DisplayChildNode[];
}

export interface DisplayTextNode extends DisplayFlexChildProps {
  type: "text";
  content: string;
  style?: DisplayTextStyle;
  color?: DisplayTextColor;
}

export interface DisplayButtonNode extends DisplayFlexChildProps {
  type: "button";
  label: string;
  style?: DisplayButtonStyle;
  iconName?: IconName;
  onTap?: () => void;
}

export interface DisplayImageNode extends DisplayFlexChildProps {
  type: "image";
  uri: string;
  sizePreset?: DisplayImageSize;
  cornerRadius?: DisplayCornerRadius;
}

export interface DisplayIconNode extends DisplayFlexChildProps {
  type: "icon";
  name: IconName;
  style?: DisplayIconStyle;
}

export interface DisplayButtonGroupNode extends DisplayFlexChildProps {
  type: "buttonGroup";
  alignment?: DisplayButtonGroupAlignment;
  buttons: DisplayButtonNode[];
}

/** Full-screen video. Root-only — it cannot be a sibling of other nodes. */
export interface DisplayVideoNode {
  type: "video";
  uri: string;
  codec?: "mp4";
}

/** Anything that may appear inside a flex node. */
export type DisplayChildNode =
  | DisplayFlexNode
  | DisplayTextNode
  | DisplayButtonNode
  | DisplayImageNode
  | DisplayIconNode
  | DisplayButtonGroupNode;

/**
 * What {@link renderDisplay} accepts.
 *
 * Only `flex` and `video` may be the root: on iOS only `FlexBox` and `VideoPlayer`
 * conform to `DisplayableView`, and Android's `ContentScope` exposes only those two.
 */
export type DisplayRoot = DisplayFlexNode | DisplayVideoNode;

/** Any node in a display tree. */
export type DisplayNode = DisplayRoot | DisplayChildNode;

/**
 * Wire form of a display tree: the same shape with `onTap` closures replaced by
 * generated `tapId` strings. Produced by `serializeDisplayTree`; not written by hand.
 */
export type SerializedDisplayNode = {
  type: DisplayNode["type"];
  tapId?: string;
  children?: SerializedDisplayNode[];
  buttons?: SerializedDisplayNode[];
  [key: string]: unknown;
};

// =============================================================================
// NATIVE MODULE EVENTS
// =============================================================================

/** Event map — function signatures as required by Expo NativeModule<EventsMap>. */
export type EMWDATModuleEvents = {
  onRegistrationStateChange: (payload: { state: RegistrationState }) => void;
  onDevicesChange: (payload: { devices: Device[] }) => void;
  onLinkStateChange: (payload: { deviceId: DeviceIdentifier; linkState: LinkState }) => void;
  onDeviceStateChange: (payload: {
    deviceId: DeviceIdentifier;
    thermalLevel: ThermalLevel;
  }) => void;
  onStreamStateChange: (payload: { sessionId: string; state: StreamState }) => void;
  onCameraStateChange: (payload: { sessionId: string; state: CameraState }) => void;
  onVideoFrame: (payload: VideoFrameMetadata) => void;
  onPhotoCaptured: (payload: PhotoData) => void;
  onStreamError: (payload: StreamError) => void;
  onPermissionStatusChange: (payload: { permission: Permission; status: PermissionStatus }) => void;
  onCompatibilityChange: (payload: {
    deviceId: DeviceIdentifier;
    compatibility: Compatibility;
  }) => void;
  onDeviceSessionStateChange: (payload: { sessionId: string; state: DeviceSessionState }) => void;
  onDeviceSessionError: (payload: {
    sessionId: string;
    error: DeviceSessionErrorCode;
    message?: string;
  }) => void;
  onCapabilityStateChange: (payload: { sessionId: string; state: CapabilityState }) => void;
  onDisplayStateChange: (payload: { sessionId: string; state: DisplayState }) => void;
  onDisplayTap: (payload: { sessionId: string; tapId: string }) => void;
  onDisplayError: (payload: { sessionId: string } & DisplayError) => void;
  onDisplayVideoEvent: (payload: {
    sessionId: string;
    event: DisplayVideoEventType;
    errorType?: DisplayVideoErrorType;
  }) => void;
};

export type EMWDATEventName = keyof EMWDATModuleEvents;

// =============================================================================
// CALLBACKS (for hook consumers)
// =============================================================================

export interface MetaWearablesCallbacks {
  onRegistrationStateChange?: (state: RegistrationState) => void;
  onDevicesChange?: (devices: Device[]) => void;
  onLinkStateChange?: (deviceId: DeviceIdentifier, linkState: LinkState) => void;
  onDeviceStateChange?: (deviceId: DeviceIdentifier, thermalLevel: ThermalLevel) => void;
  onStreamStateChange?: (state: StreamState, sessionId: string) => void;
  onCameraStateChange?: (state: CameraState, sessionId: string) => void;
  onVideoFrame?: (metadata: VideoFrameMetadata) => void;
  onPhotoCaptured?: (photo: PhotoData) => void;
  onStreamError?: (error: StreamError) => void;
  onPermissionStatusChange?: (permission: Permission, status: PermissionStatus) => void;
  onCompatibilityChange?: (deviceId: DeviceIdentifier, compatibility: Compatibility) => void;
  onDeviceSessionStateChange?: (sessionId: string, state: DeviceSessionState) => void;
  onDeviceSessionError?: (
    sessionId: string,
    error: DeviceSessionErrorCode,
    message?: string
  ) => void;
  onCapabilityStateChange?: (sessionId: string, state: CapabilityState) => void;
  onDisplayStateChange?: (state: DisplayState, sessionId: string) => void;
  onDisplayError?: (error: DisplayError, sessionId: string) => void;
  onDisplayVideoEvent?: (
    event: DisplayVideoEventType,
    errorType: DisplayVideoErrorType | undefined,
    sessionId: string
  ) => void;
}

// =============================================================================
// HOOK TYPES
// =============================================================================

export interface UseMetaWearablesOptions extends MetaWearablesCallbacks {
  /** Call configure() automatically on mount (default: true) */
  autoConfig?: boolean;
  /** Initial log level (default: "info") */
  logLevel?: LogLevel;
}

export interface UseMetaWearablesReturn {
  // State
  isConfigured: boolean;
  isConfiguring: boolean;
  configError: Error | null;
  registrationState: RegistrationState;
  permissionStatus: PermissionStatus;
  devices: Device[];
  deviceStates: Record<DeviceIdentifier, DeviceState>;
  deviceSessionStates: Record<string, DeviceSessionState>;
  deviceSessionErrors: Record<string, { error: DeviceSessionErrorCode; message?: string }>;
  capabilityStates: Record<string, CapabilityState>;
  streamState: StreamState;
  cameraState: CameraState;

  // Actions — configuration
  configure: () => Promise<void>;
  setLogLevel: (level: LogLevel) => void;

  // Actions — registration
  startRegistration: () => Promise<void>;
  startUnregistration: () => Promise<void>;

  // Actions — permissions
  checkPermissionStatus: (permission: Permission) => Promise<PermissionStatus>;
  requestPermission: (permission: Permission) => Promise<PermissionStatus>;

  // Actions — devices
  getDevice: (identifier: DeviceIdentifier) => Promise<Device | null>;
  refreshDevices: () => Promise<Device[]>;
  openFirmwareUpdate: () => Promise<void>;
  openDATGlassesAppUpdate: () => Promise<void>;

  // Actions — session-based streaming
  createSession: (deviceId?: DeviceIdentifier) => Promise<string>;
  startSession: (sessionId: string) => Promise<void>;
  stopSession: (sessionId: string) => Promise<void>;
  addCameraToSession: (sessionId: string, config?: Partial<StreamConfiguration>) => Promise<void>;
  removeCameraFromSession: (sessionId: string) => Promise<void>;
  /** @deprecated Renamed to {@link UseMetaWearablesReturn.addCameraToSession} for SDK 0.9. */
  addStreamToSession: (sessionId: string, config?: Partial<StreamConfiguration>) => Promise<void>;
  /** @deprecated Renamed to {@link UseMetaWearablesReturn.removeCameraFromSession} for SDK 0.9. */
  removeStreamFromSession: (sessionId: string) => Promise<void>;
  capturePhoto: (format?: PhotoCaptureFormat) => Promise<void>;

  // Actions — display
  addDisplayToSession: (sessionId: string) => Promise<void>;
  renderDisplay: (sessionId: string, root: DisplayRoot) => Promise<void>;
  clearDisplay: (sessionId: string) => Promise<void>;
  removeDisplayFromSession: (sessionId: string) => Promise<void>;
  getDisplayState: (sessionId: string) => Promise<DisplayState>;
  displayState: DisplayState | null;

  // Actions — mock device kit
  enableMockDeviceKit: (config?: MockDeviceKitConfig) => Promise<void>;
  disableMockDeviceKit: () => Promise<void>;
  isMockDeviceKitEnabled: () => Promise<boolean>;
  pairMockDevice: (model?: GlassesModel) => Promise<string>;
  unpairMockDevice: (deviceId: string) => Promise<void>;
  mockSetPermissionStatus: (permission: Permission, status: PermissionStatus) => Promise<void>;
  mockSetPermissionRequestResult: (
    permission: Permission,
    result: PermissionStatus
  ) => Promise<void>;
  mockDeviceSetCameraFeedFromCamera: (id: string, facing: CameraFacing) => Promise<void>;
  mockDeviceTap: (id: string) => Promise<void>;
  mockDeviceTapAndHold: (id: string) => Promise<void>;
}

// =============================================================================
// VIEW PROPS
// =============================================================================

export type StreamViewResizeMode = "contain" | "cover" | "stretch";

export interface EMWDATStreamViewProps {
  isActive?: boolean;
  resizeMode?: StreamViewResizeMode;
  style?: StyleProp<ViewStyle>;
}

// =============================================================================
// CONFIG PLUGIN
// =============================================================================

export interface EMWDATPluginProps {
  /** URL scheme for Meta AI app callback (required) */
  urlScheme: string;
  /** Meta App ID (defaults to "0") */
  metaAppId?: string;
  /** Client Token from Meta Wearables Developer Center */
  clientToken?: string;
  /** Custom NSBluetoothAlwaysUsageDescription */
  bluetoothUsageDescription?: string;
  /** GitHub token for accessing Meta Wearables Maven packages. Falls back to GITHUB_TOKEN env var. */
  githubToken?: string;
  /** Opt out of DAT SDK crash reporting (SDK 0.9+). Default: false. */
  crashReportingOptOut?: boolean;
}
