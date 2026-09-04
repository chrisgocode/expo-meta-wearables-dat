import { useCallback, useEffect, useRef, useState } from "react";

import type {
  DisplayError,
  DisplayRoot,
  DisplayState,
  CameraFacing,
  CameraState,
  CapabilityState,
  Compatibility,
  Device,
  DeviceIdentifier,
  DeviceSessionErrorCode,
  DeviceSessionState,
  DeviceState,
  GlassesModel,
  LogLevel,
  MockDeviceKitConfig,
  Permission,
  PermissionStatus,
  PhotoCaptureFormat,
  RegistrationState,
  StreamConfiguration,
  StreamState,
  UseMetaWearablesOptions,
  UseMetaWearablesReturn,
} from "./EMWDAT.types";
import {
  addListener,
  addCameraToSession as nativeAddCameraToSession,
  capturePhoto as nativeCapturePhoto,
  addDisplayToSession as nativeAddDisplayToSession,
  renderDisplay as nativeRenderDisplay,
  clearDisplay as nativeClearDisplay,
  removeDisplayFromSession as nativeRemoveDisplayFromSession,
  getDisplayState as nativeGetDisplayState,
  checkPermissionStatus as nativeCheckPermissionStatus,
  configure as nativeConfigure,
  createSession as nativeCreateSession,
  disableMockDeviceKit as nativeDisableMockDeviceKit,
  enableMockDeviceKit as nativeEnableMockDeviceKit,
  getDevice as nativeGetDevice,
  getDevices as nativeGetDevices,
  getRegistrationStateAsync as nativeGetRegistrationStateAsync,
  isMockDeviceKitEnabled as nativeIsMockDeviceKitEnabled,
  mockDeviceSetCameraFeedFromCamera as nativeMockDeviceSetCameraFeedFromCamera,
  mockDeviceTap as nativeMockDeviceTap,
  mockDeviceTapAndHold as nativeMockDeviceTapAndHold,
  mockSetPermissionRequestResult as nativeMockSetPermissionRequestResult,
  mockSetPermissionStatus as nativeMockSetPermissionStatus,
  openDATGlassesAppUpdate as nativeOpenDATGlassesAppUpdate,
  openFirmwareUpdate as nativeOpenFirmwareUpdate,
  pairMockDevice as nativePairMockDevice,
  removeCameraFromSession as nativeRemoveCameraFromSession,
  requestPermission as nativeRequestPermission,
  setLogLevel as nativeSetLogLevel,
  startRegistration as nativeStartRegistration,
  startSession as nativeStartSession,
  startUnregistration as nativeStartUnregistration,
  stopSession as nativeStopSession,
  unpairMockDevice as nativeUnpairMockDevice,
} from "./EMWDATModule";

/**
 * React hook for interacting with Meta Wearables glasses.
 *
 * Provides state management, event handling, and validated actions
 * for registration, permissions, device management, session-based
 * video streaming, and photo capture.
 *
 * @example
 * ```tsx
 * const {
 *   isConfigured,
 *   registrationState,
 *   devices,
 *   createSession,
 *   startSession,
 *   addCameraToSession,
 *   capturePhoto,
 * } = useMetaWearables({
 *   onRegistrationStateChange: (state) => console.log('Registration:', state),
 *   onPhotoCaptured: (photo) => console.log('Photo saved:', photo.filePath),
 * });
 * ```
 */
export function useMetaWearables(options: UseMetaWearablesOptions = {}): UseMetaWearablesReturn {
  const { autoConfig = true, logLevel = "info", ...callbacks } = options;

  // ---------------------------------------------------------------------------
  // Refs — used for guards & callbacks to avoid stale closures
  // ---------------------------------------------------------------------------

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const isConfiguredRef = useRef(false);
  const registrationStateRef = useRef<RegistrationState>("unavailable");
  const permissionStatusRef = useRef<PermissionStatus>("denied");

  // ---------------------------------------------------------------------------
  // State — drives re-renders
  // ---------------------------------------------------------------------------

  const [isConfigured, setIsConfigured] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configError, setConfigError] = useState<Error | null>(null);
  const [registrationState, setRegistrationState] = useState<RegistrationState>("unavailable");
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("denied");
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceStates, setDeviceStates] = useState<Record<DeviceIdentifier, DeviceState>>({});
  const [deviceSessionStates, setDeviceSessionStates] = useState<
    Record<string, DeviceSessionState>
  >({});
  const [deviceSessionErrors, setDeviceSessionErrors] = useState<
    Record<string, { error: DeviceSessionErrorCode; message?: string }>
  >({});
  const [capabilityStates, setCapabilityStates] = useState<Record<string, CapabilityState>>({});
  const [streamState, setStreamState] = useState<StreamState>("stopped");
  const [cameraState, setCameraState] = useState<CameraState>("stopped");
  const [displayState, setDisplayState] = useState<DisplayState | null>(null);

  // Sync helpers — update both ref and state
  const syncIsConfigured = useCallback((v: boolean) => {
    isConfiguredRef.current = v;
    setIsConfigured(v);
  }, []);

  const syncRegistrationState = useCallback((v: RegistrationState) => {
    registrationStateRef.current = v;
    setRegistrationState(v);
  }, []);

  const syncPermissionStatus = useCallback((v: PermissionStatus) => {
    permissionStatusRef.current = v;
    setPermissionStatus(v);
  }, []);

  // ---------------------------------------------------------------------------
  // Event subscriptions — single effect, empty deps (refs keep values fresh)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const subs = [
      addListener("onRegistrationStateChange", (e) => {
        syncRegistrationState(e.state);
        callbacksRef.current.onRegistrationStateChange?.(e.state);

        // Auto-sync permission and devices on registration change
        if (e.state === "registered") {
          nativeCheckPermissionStatus("camera")
            .then((status) => syncPermissionStatus(status))
            .catch(() => syncPermissionStatus("denied"));
          nativeGetDevices()
            .then((deviceList) => setDevices(deviceList))
            .catch(() => {});
        } else {
          syncPermissionStatus("denied");
          setStreamState("stopped");
          setCameraState("stopped");
          setDeviceStates({});
          setDeviceSessionStates({});
          setDeviceSessionErrors({});
          setCapabilityStates({});
        }
      }),

      addListener("onDevicesChange", (e) => {
        setDevices(e.devices);
        callbacksRef.current.onDevicesChange?.(e.devices);
      }),

      addListener("onLinkStateChange", (e) => {
        callbacksRef.current.onLinkStateChange?.(e.deviceId, e.linkState);
      }),

      addListener("onDeviceStateChange", (e) => {
        setDeviceStates((prev) => ({ ...prev, [e.deviceId]: { thermalLevel: e.thermalLevel } }));
        callbacksRef.current.onDeviceStateChange?.(e.deviceId, e.thermalLevel);
      }),

      addListener("onStreamStateChange", (e) => {
        setStreamState(e.state);
        callbacksRef.current.onStreamStateChange?.(e.state, e.sessionId);
      }),

      addListener("onCameraStateChange", (e) => {
        setCameraState(e.state);
        callbacksRef.current.onCameraStateChange?.(e.state, e.sessionId);
      }),

      addListener("onVideoFrame", (e) => {
        callbacksRef.current.onVideoFrame?.(e);
      }),

      addListener("onPhotoCaptured", (e) => {
        callbacksRef.current.onPhotoCaptured?.(e);
      }),

      addListener("onStreamError", (e) => {
        callbacksRef.current.onStreamError?.(e);
      }),

      addListener("onPermissionStatusChange", (e) => {
        if (e.permission === "camera") {
          syncPermissionStatus(e.status);
        }
        callbacksRef.current.onPermissionStatusChange?.(e.permission, e.status);
      }),

      addListener("onCompatibilityChange", (e) => {
        setDevices((prev) =>
          prev.map((d) =>
            d.identifier === e.deviceId
              ? { ...d, compatibility: e.compatibility as Compatibility }
              : d
          )
        );
        callbacksRef.current.onCompatibilityChange?.(e.deviceId, e.compatibility as Compatibility);
      }),

      addListener("onDeviceSessionStateChange", (e) => {
        setDeviceSessionStates((prev) => ({
          ...prev,
          [e.sessionId]: e.state,
        }));
        callbacksRef.current.onDeviceSessionStateChange?.(e.sessionId, e.state);

        // Clean up stopped sessions from state
        if (e.state === "stopped") {
          setDeviceSessionStates((prev) => {
            const next = { ...prev };
            delete next[e.sessionId];
            return next;
          });
          setDeviceSessionErrors((prev) => {
            const next = { ...prev };
            delete next[e.sessionId];
            return next;
          });
          setCapabilityStates((prev) => {
            const next = { ...prev };
            delete next[e.sessionId];
            return next;
          });
        }
      }),

      addListener("onDeviceSessionError", (e) => {
        setDeviceSessionErrors((prev) => ({
          ...prev,
          [e.sessionId]: { error: e.error, message: e.message },
        }));
        callbacksRef.current.onDeviceSessionError?.(e.sessionId, e.error, e.message);
      }),

      addListener("onCapabilityStateChange", (e) => {
        setCapabilityStates((prev) => ({
          ...prev,
          [e.sessionId]: e.state,
        }));
        callbacksRef.current.onCapabilityStateChange?.(e.sessionId, e.state);
      }),

      addListener("onDisplayStateChange", (e) => {
        setDisplayState(e.state);
        callbacksRef.current.onDisplayStateChange?.(e.state, e.sessionId);
      }),

      addListener("onDisplayError", (e) => {
        const { sessionId, ...error } = e;
        callbacksRef.current.onDisplayError?.(error as DisplayError, sessionId);
      }),

      addListener("onDisplayVideoEvent", (e) => {
        callbacksRef.current.onDisplayVideoEvent?.(e.event, e.errorType, e.sessionId);
      }),
    ];

    return () => {
      subs.forEach((sub) => sub?.remove());
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Actions — stable references (guards use refs, not state)
  // ---------------------------------------------------------------------------

  const configure = useCallback(async () => {
    if (isConfiguredRef.current) {
      return;
    }

    setIsConfiguring(true);
    setConfigError(null);

    try {
      nativeSetLogLevel(logLevel);
      await nativeConfigure();
      syncIsConfigured(true);

      // Sync initial state
      const [regState, deviceList] = await Promise.all([
        nativeGetRegistrationStateAsync(),
        nativeGetDevices(),
      ]);

      syncRegistrationState(regState);
      setDevices(deviceList);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setConfigError(error);
      throw error;
    } finally {
      setIsConfiguring(false);
    }
  }, [logLevel, syncIsConfigured, syncRegistrationState]);

  // Auto-configure on mount
  useEffect(() => {
    if (autoConfig) {
      configure().catch((err) => {
        console.error("[useMetaWearables] Auto-configure failed:", err);
      });
    }
  }, []);

  const setLogLevelAction = useCallback((level: LogLevel) => {
    nativeSetLogLevel(level);
  }, []);

  const startRegistration = useCallback(async () => {
    if (!isConfiguredRef.current) {
      throw new Error("SDK not configured. Call configure() first.");
    }
    if (registrationStateRef.current === "registering") {
      console.warn("[useMetaWearables] Already registering");
      return;
    }
    await nativeStartRegistration();
  }, []);

  const startUnregistration = useCallback(async () => {
    if (!isConfiguredRef.current) {
      throw new Error("SDK not configured. Call configure() first.");
    }
    await nativeStartUnregistration();
  }, []);

  const checkPermissionStatusAction = useCallback(
    async (permission: Permission): Promise<PermissionStatus> => {
      if (!isConfiguredRef.current) {
        return "denied";
      }
      const status = await nativeCheckPermissionStatus(permission);
      if (permission === "camera") {
        syncPermissionStatus(status);
      }
      return status;
    },
    [syncPermissionStatus]
  );

  const requestPermissionAction = useCallback(
    async (permission: Permission): Promise<PermissionStatus> => {
      if (!isConfiguredRef.current) {
        throw new Error("SDK not configured. Call configure() first.");
      }
      if (registrationStateRef.current !== "registered") {
        throw new Error("Must be registered before requesting permissions.");
      }
      return nativeRequestPermission(permission);
    },
    []
  );

  const getDevice = useCallback(async (identifier: DeviceIdentifier): Promise<Device | null> => {
    return nativeGetDevice(identifier);
  }, []);

  const openFirmwareUpdate = useCallback(async (): Promise<void> => {
    if (!isConfiguredRef.current) {
      throw new Error("SDK not configured. Call configure() first.");
    }
    await nativeOpenFirmwareUpdate();
  }, []);

  const openDATGlassesAppUpdate = useCallback(async (): Promise<void> => {
    if (!isConfiguredRef.current) {
      throw new Error("SDK not configured. Call configure() first.");
    }
    await nativeOpenDATGlassesAppUpdate();
  }, []);

  const refreshDevices = useCallback(async (): Promise<Device[]> => {
    if (!isConfiguredRef.current) {
      throw new Error("SDK not configured. Call configure() first.");
    }
    const deviceList = await nativeGetDevices();
    setDevices(deviceList);
    return deviceList;
  }, []);

  // ---------------------------------------------------------------------------
  // Session-based streaming actions
  // ---------------------------------------------------------------------------

  const createSession = useCallback(async (deviceId?: DeviceIdentifier): Promise<string> => {
    if (!isConfiguredRef.current) {
      throw new Error("SDK not configured. Call configure() first.");
    }
    if (registrationStateRef.current !== "registered") {
      throw new Error("Must be registered before creating a session.");
    }
    return nativeCreateSession(deviceId);
  }, []);

  const startSession = useCallback(async (sessionId: string): Promise<void> => {
    await nativeStartSession(sessionId);
  }, []);

  const stopSession = useCallback(async (sessionId: string): Promise<void> => {
    await nativeStopSession(sessionId);
  }, []);

  const addCameraToSession = useCallback(
    async (sessionId: string, config?: Partial<StreamConfiguration>): Promise<void> => {
      // Verify camera permission before adding stream
      const status = await nativeCheckPermissionStatus("camera");
      if (status !== "granted") {
        const requested = await nativeRequestPermission("camera");
        syncPermissionStatus(requested as PermissionStatus);
        if (requested !== "granted") {
          throw new Error("Camera permission required for streaming.");
        }
      } else {
        syncPermissionStatus("granted");
      }
      await nativeAddCameraToSession(sessionId, config);
    },
    [syncPermissionStatus]
  );

  const removeCameraFromSession = useCallback(async (sessionId: string): Promise<void> => {
    await nativeRemoveCameraFromSession(sessionId);
  }, []);

  const capturePhoto = useCallback(async (format?: PhotoCaptureFormat) => {
    await nativeCapturePhoto(format);
  }, []);

  // ---------------------------------------------------------------------------
  // Display actions
  // ---------------------------------------------------------------------------

  const addDisplayToSession = useCallback(async (sessionId: string): Promise<void> => {
    await nativeAddDisplayToSession(sessionId);
  }, []);

  const renderDisplay = useCallback(async (sessionId: string, root: DisplayRoot): Promise<void> => {
    await nativeRenderDisplay(sessionId, root);
  }, []);

  const clearDisplay = useCallback(async (sessionId: string): Promise<void> => {
    await nativeClearDisplay(sessionId);
  }, []);

  const removeDisplayFromSession = useCallback(async (sessionId: string): Promise<void> => {
    await nativeRemoveDisplayFromSession(sessionId);
  }, []);

  const getDisplayState = useCallback(async (sessionId: string): Promise<DisplayState> => {
    return nativeGetDisplayState(sessionId);
  }, []);

  // ---------------------------------------------------------------------------
  // Mock device kit actions
  // ---------------------------------------------------------------------------

  const enableMockDeviceKit = useCallback(async (config?: MockDeviceKitConfig): Promise<void> => {
    await nativeEnableMockDeviceKit(config);
  }, []);

  const disableMockDeviceKit = useCallback(async (): Promise<void> => {
    await nativeDisableMockDeviceKit();
  }, []);

  const isMockDeviceKitEnabled = useCallback(async (): Promise<boolean> => {
    return nativeIsMockDeviceKitEnabled();
  }, []);

  const pairMockDevice = useCallback(async (model?: GlassesModel): Promise<string> => {
    return nativePairMockDevice(model);
  }, []);

  const unpairMockDevice = useCallback(async (deviceId: string): Promise<void> => {
    await nativeUnpairMockDevice(deviceId);
  }, []);

  const mockSetPermissionStatusAction = useCallback(
    async (permission: Permission, status: PermissionStatus): Promise<void> => {
      await nativeMockSetPermissionStatus(permission, status);
    },
    []
  );

  const mockSetPermissionRequestResultAction = useCallback(
    async (permission: Permission, result: PermissionStatus): Promise<void> => {
      await nativeMockSetPermissionRequestResult(permission, result);
    },
    []
  );

  const mockDeviceSetCameraFeedFromCameraAction = useCallback(
    async (id: string, facing: CameraFacing): Promise<void> => {
      await nativeMockDeviceSetCameraFeedFromCamera(id, facing);
    },
    []
  );

  const mockDeviceTapAction = useCallback(async (id: string): Promise<void> => {
    await nativeMockDeviceTap(id);
  }, []);

  const mockDeviceTapAndHoldAction = useCallback(async (id: string): Promise<void> => {
    await nativeMockDeviceTapAndHold(id);
  }, []);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // State
    isConfigured,
    isConfiguring,
    configError,
    registrationState,
    permissionStatus,
    devices,
    deviceStates,
    deviceSessionStates,
    deviceSessionErrors,
    capabilityStates,
    streamState,
    cameraState,
    displayState,

    // Actions — configuration
    configure,
    setLogLevel: setLogLevelAction,

    // Actions — registration
    startRegistration,
    startUnregistration,

    // Actions — permissions
    checkPermissionStatus: checkPermissionStatusAction,
    requestPermission: requestPermissionAction,

    // Actions — devices
    getDevice,
    refreshDevices,
    openFirmwareUpdate,
    openDATGlassesAppUpdate,

    // Actions — session-based streaming
    createSession,
    startSession,
    stopSession,
    addCameraToSession,
    removeCameraFromSession,
    addStreamToSession: addCameraToSession,
    removeStreamFromSession: removeCameraFromSession,
    capturePhoto,
    addDisplayToSession,
    renderDisplay,
    clearDisplay,
    removeDisplayFromSession,
    getDisplayState,

    // Actions — mock device kit
    enableMockDeviceKit,
    disableMockDeviceKit,
    isMockDeviceKitEnabled,
    pairMockDevice,
    unpairMockDevice,
    mockSetPermissionStatus: mockSetPermissionStatusAction,
    mockSetPermissionRequestResult: mockSetPermissionRequestResultAction,
    mockDeviceSetCameraFeedFromCamera: mockDeviceSetCameraFeedFromCameraAction,
    mockDeviceTap: mockDeviceTapAction,
    mockDeviceTapAndHold: mockDeviceTapAndHoldAction,
  };
}
