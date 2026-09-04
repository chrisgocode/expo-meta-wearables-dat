// Hook
export { useMetaWearables } from "./useMetaWearables";

// View
export { EMWDATStreamView } from "./EMWDATStreamView";

// Native module + typed wrapper functions
// On web, resolved to EMWDATModule.web.ts via platform-specific file resolution
export {
  EMWDATModule,
  addListener,
  setLogLevel,
  configure,
  getRegistrationState,
  getRegistrationStateAsync,
  startRegistration,
  startUnregistration,
  handleUrl,
  checkPermissionStatus,
  requestPermission,
  getDevices,
  getDevice,
  openFirmwareUpdate,
  openDATGlassesAppUpdate,
  // Session-based streaming
  createSession,
  startSession,
  stopSession,
  addCameraToSession,
  removeCameraFromSession,
  addStreamToSession,
  removeStreamFromSession,
  capturePhoto,
  // Display
  addDisplayToSession,
  renderDisplay,
  clearDisplay,
  removeDisplayFromSession,
  getDisplayState,
  // Mock device kit
  enableMockDeviceKit,
  disableMockDeviceKit,
  isMockDeviceKitEnabled,
  pairMockDevice,
  unpairMockDevice,
  getMockDevices,
  mockDevicePowerOn,
  mockDevicePowerOff,
  mockDeviceDon,
  mockDeviceDoff,
  mockDeviceFold,
  mockDeviceUnfold,
  mockDeviceTap,
  mockDeviceTapAndHold,
  mockDeviceSetCameraFeed,
  mockDeviceSetCapturedImage,
  mockDeviceSetCameraFeedFromCamera,
  mockSetPermissionStatus,
  mockSetPermissionRequestResult,
} from "./EMWDATModule";

// Types
export * from "./EMWDAT.types";
