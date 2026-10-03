import { registerWebModule, NativeModule } from "expo";

import type { EMWDATModuleEvents } from "./EMWDAT.types";

const NOT_SUPPORTED = "EMWDAT is not supported on web";

function unsupported(): never {
  throw new Error(NOT_SUPPORTED);
}

class EMWDATWebModule extends NativeModule<EMWDATModuleEvents> {
  getSessionDevice(): Promise<never> {
    unsupported();
  }
  addInputsToSession(): Promise<never> {
    unsupported();
  }
  removeInputsFromSession(): Promise<never> {
    unsupported();
  }
  addMotionToSession(): Promise<never> {
    unsupported();
  }
  startMotion(): Promise<never> {
    unsupported();
  }
  stopMotion(): Promise<never> {
    unsupported();
  }
  removeMotionFromSession(): Promise<never> {
    unsupported();
  }
  addSpeechToSession(): Promise<never> {
    unsupported();
  }
  startSpeech(): Promise<never> {
    unsupported();
  }
  stopSpeech(): Promise<never> {
    unsupported();
  }
  removeSpeechFromSession(): Promise<never> {
    unsupported();
  }
  startVoiceInvocations(): Promise<never> {
    unsupported();
  }
  stopVoiceInvocations(): Promise<never> {
    unsupported();
  }
  respondToVoiceInvocation(): Promise<never> {
    unsupported();
  }
  getPendingVoiceInvocations(): Promise<never> {
    unsupported();
  }
  isVoiceInvocationLaunch(): Promise<never> {
    unsupported();
  }
  getPendingRegistrationRequests(): Promise<never> {
    unsupported();
  }
  respondToRegistrationRequest(): Promise<never> {
    unsupported();
  }
  startPhotoCapture(): Promise<never> {
    unsupported();
  }
  stopPhotoCapture(): Promise<never> {
    unsupported();
  }
  captureHighQualityPhoto(): Promise<never> {
    unsupported();
  }
  startCameraStream(): Promise<never> {
    unsupported();
  }
  stopCameraStream(): Promise<never> {
    unsupported();
  }
  mockDeviceSimulate(): Promise<never> {
    unsupported();
  }
  startMockDeviceTestServer(): Promise<never> {
    unsupported();
  }
  stopMockDeviceTestServer(): Promise<never> {
    unsupported();
  }
  mockSimulateRegistrationOutcome(): Promise<never> {
    unsupported();
  }
  setLogLevel(): void {
    unsupported();
  }
  configure(): Promise<void> {
    unsupported();
  }
  getRegistrationState(): string {
    unsupported();
  }
  getRegistrationStateAsync(): Promise<string> {
    unsupported();
  }
  startRegistration(): Promise<void> {
    unsupported();
  }
  startUnregistration(): Promise<void> {
    unsupported();
  }
  handleUrl(): Promise<boolean> {
    unsupported();
  }
  checkPermissionStatus(): Promise<string> {
    unsupported();
  }
  requestPermission(): Promise<string> {
    unsupported();
  }
  getDevices(): Promise<never[]> {
    unsupported();
  }
  getDevice(): Promise<null> {
    unsupported();
  }
  openFirmwareUpdate(): Promise<void> {
    unsupported();
  }
  openDATGlassesAppUpdate(): Promise<void> {
    unsupported();
  }

  // Session-based streaming
  createSession(): Promise<string> {
    unsupported();
  }
  startSession(): Promise<void> {
    unsupported();
  }
  stopSession(): Promise<void> {
    unsupported();
  }
  addCameraToSession(): Promise<void> {
    unsupported();
  }
  removeCameraFromSession(): Promise<void> {
    unsupported();
  }
  capturePhoto(): Promise<void> {
    unsupported();
  }

  // Display
  addDisplayToSession(): Promise<void> {
    unsupported();
  }
  renderDisplay(): Promise<void> {
    unsupported();
  }
  clearDisplay(): Promise<void> {
    unsupported();
  }
  removeDisplayFromSession(): Promise<void> {
    unsupported();
  }
  getDisplayState(): Promise<string> {
    unsupported();
  }

  // Mock device kit
  enableMockDeviceKit(): Promise<void> {
    unsupported();
  }
  disableMockDeviceKit(): Promise<void> {
    unsupported();
  }
  isMockDeviceKitEnabled(): Promise<boolean> {
    unsupported();
  }
  pairMockDevice(): Promise<string> {
    unsupported();
  }
  unpairMockDevice(): Promise<void> {
    unsupported();
  }
  getMockDevices(): Promise<string[]> {
    unsupported();
  }
  mockDevicePowerOn(): Promise<void> {
    unsupported();
  }
  mockDevicePowerOff(): Promise<void> {
    unsupported();
  }
  mockDeviceDon(): Promise<void> {
    unsupported();
  }
  mockDeviceDoff(): Promise<void> {
    unsupported();
  }
  mockDeviceFold(): Promise<void> {
    unsupported();
  }
  mockDeviceUnfold(): Promise<void> {
    unsupported();
  }
  mockDeviceTap(): Promise<void> {
    unsupported();
  }
  mockDeviceTapAndHold(): Promise<void> {
    unsupported();
  }
  mockDeviceSetCameraFeed(): Promise<void> {
    unsupported();
  }
  mockDeviceSetCapturedImage(): Promise<void> {
    unsupported();
  }
  mockDeviceSetCameraFeedFromCamera(): Promise<void> {
    unsupported();
  }
  mockSetPermissionStatus(): Promise<void> {
    unsupported();
  }
  mockSetPermissionRequestResult(): Promise<void> {
    unsupported();
  }
}

/** Web module — all methods throw "not supported". */
export const EMWDATModule = registerWebModule(EMWDATWebModule, "EMWDAT");

// =============================================================================
// Wrapper functions (matching EMWDATModule.ts exports — all throw on web)
// =============================================================================

export function addListener(): null {
  return null;
}

export function setLogLevel(): void {
  unsupported();
}
export async function configure(): Promise<void> {
  unsupported();
}
export function getRegistrationState(): never {
  unsupported();
}
export async function getRegistrationStateAsync(): Promise<never> {
  unsupported();
}
export async function startRegistration(): Promise<void> {
  unsupported();
}
export async function startUnregistration(): Promise<void> {
  unsupported();
}
export async function handleUrl(): Promise<never> {
  unsupported();
}
export async function checkPermissionStatus(): Promise<never> {
  unsupported();
}
export async function requestPermission(): Promise<never> {
  unsupported();
}
export async function getDevices(): Promise<never[]> {
  unsupported();
}
export async function getDevice(): Promise<null> {
  unsupported();
}
export async function openFirmwareUpdate(): Promise<void> {
  unsupported();
}
export async function openDATGlassesAppUpdate(): Promise<void> {
  unsupported();
}

// Session-based streaming
export async function createSession(): Promise<never> {
  unsupported();
}
export async function startSession(): Promise<void> {
  unsupported();
}
export async function stopSession(): Promise<void> {
  unsupported();
}
export async function addCameraToSession(): Promise<void> {
  unsupported();
}
export async function removeCameraFromSession(): Promise<void> {
  unsupported();
}
/** @deprecated Renamed to {@link addCameraToSession} for SDK 0.9. */
export async function addStreamToSession(): Promise<void> {
  unsupported();
}
/** @deprecated Renamed to {@link removeCameraFromSession} for SDK 0.9. */
export async function removeStreamFromSession(): Promise<void> {
  unsupported();
}
export async function capturePhoto(): Promise<void> {
  unsupported();
}

// Display
export async function addDisplayToSession(): Promise<void> {
  unsupported();
}
export async function renderDisplay(): Promise<void> {
  unsupported();
}
export async function clearDisplay(): Promise<void> {
  unsupported();
}
export async function removeDisplayFromSession(): Promise<void> {
  unsupported();
}
export async function getDisplayState(): Promise<string> {
  unsupported();
}

// Mock device kit
export async function enableMockDeviceKit(): Promise<void> {
  unsupported();
}
export async function disableMockDeviceKit(): Promise<void> {
  unsupported();
}
export async function isMockDeviceKitEnabled(): Promise<never> {
  unsupported();
}
export async function pairMockDevice(): Promise<never> {
  unsupported();
}
export async function unpairMockDevice(): Promise<void> {
  unsupported();
}
export async function getMockDevices(): Promise<never> {
  unsupported();
}
export async function mockDevicePowerOn(): Promise<void> {
  unsupported();
}
export async function mockDevicePowerOff(): Promise<void> {
  unsupported();
}
export async function mockDeviceDon(): Promise<void> {
  unsupported();
}
export async function mockDeviceDoff(): Promise<void> {
  unsupported();
}
export async function mockDeviceFold(): Promise<void> {
  unsupported();
}
export async function mockDeviceUnfold(): Promise<void> {
  unsupported();
}
export async function mockDeviceTap(): Promise<void> {
  unsupported();
}
export async function mockDeviceTapAndHold(): Promise<void> {
  unsupported();
}
export async function mockDeviceSetCameraFeed(): Promise<void> {
  unsupported();
}
export async function mockDeviceSetCapturedImage(): Promise<void> {
  unsupported();
}
export async function mockDeviceSetCameraFeedFromCamera(): Promise<void> {
  unsupported();
}
export async function mockSetPermissionStatus(): Promise<void> {
  unsupported();
}
export async function mockSetPermissionRequestResult(): Promise<void> {
  unsupported();
}

export async function getSessionDevice(): Promise<never> {
  unsupported();
}
export async function addInputsToSession(): Promise<never> {
  unsupported();
}
export async function removeInputsFromSession(): Promise<never> {
  unsupported();
}
export async function addMotionToSession(): Promise<never> {
  unsupported();
}
export async function startMotion(): Promise<never> {
  unsupported();
}
export async function stopMotion(): Promise<never> {
  unsupported();
}
export async function removeMotionFromSession(): Promise<never> {
  unsupported();
}
export async function addSpeechToSession(): Promise<never> {
  unsupported();
}
export async function startSpeech(): Promise<never> {
  unsupported();
}
export async function stopSpeech(): Promise<never> {
  unsupported();
}
export async function removeSpeechFromSession(): Promise<never> {
  unsupported();
}
export async function startVoiceInvocations(): Promise<never> {
  unsupported();
}
export async function stopVoiceInvocations(): Promise<never> {
  unsupported();
}
export async function respondToVoiceInvocation(): Promise<never> {
  unsupported();
}
export async function getPendingVoiceInvocations(): Promise<never> {
  unsupported();
}
export async function isVoiceInvocationLaunch(): Promise<never> {
  unsupported();
}
export async function getPendingRegistrationRequests(): Promise<never> {
  unsupported();
}
export async function respondToRegistrationRequest(): Promise<never> {
  unsupported();
}
export async function startPhotoCapture(): Promise<never> {
  unsupported();
}
export async function stopPhotoCapture(): Promise<never> {
  unsupported();
}
export async function captureHighQualityPhoto(): Promise<never> {
  unsupported();
}
export async function startCameraStream(): Promise<never> {
  unsupported();
}
export async function stopCameraStream(): Promise<never> {
  unsupported();
}
export async function mockDeviceSimulate(): Promise<never> {
  unsupported();
}
export async function startMockDeviceTestServer(): Promise<never> {
  unsupported();
}
export async function stopMockDeviceTestServer(): Promise<never> {
  unsupported();
}
export async function mockSimulateRegistrationOutcome(): Promise<never> {
  unsupported();
}
