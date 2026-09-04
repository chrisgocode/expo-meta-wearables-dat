# @chrisgocode/expo-meta-wearables-dat

[![npm version](https://img.shields.io/npm/v/@chrisgocode/expo-meta-wearables-dat)](https://www.npmjs.com/package/@chrisgocode/expo-meta-wearables-dat)
[![CI](https://github.com/chrisgocode/expo-meta-wearables-dat/actions/workflows/ci.yml/badge.svg)](https://github.com/chrisgocode/expo-meta-wearables-dat/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@chrisgocode/expo-meta-wearables-dat)](./LICENSE)
![platform: iOS | Android](https://img.shields.io/badge/platform-iOS%20%7C%20Android-blue)

Expo native module for integrating **Meta Wearables DAT** (Ray-Ban Meta smart glasses) into React Native apps. Provides device registration, permissions, session-based camera streaming, photo capture, and a React hook — bridged from the official Meta Wearables DAT SDK 0.9 on both iOS and Android.

> **Official SDK docs:** [Meta Wearables DAT — Developer Documentation](https://wearables.developer.meta.com/docs/develop)
>
> You must register your app in the [Meta Wearables Developer Center](https://wearables.developer.meta.com/) to obtain your App ID and Client Token.

> **Disclaimer:** This project is **not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc.** It is an independent, community-maintained wrapper around the publicly available Meta Wearables DAT SDK.

## Non-goals

- **Background streaming** — the SDK doesn't support it
- **Expo Go** — requires a [development build](https://docs.expo.dev/develop/development-builds/introduction/) (native code)

## Features

- Device registration / unregistration via Meta AI app
- Permission management (camera)
- Device discovery and link state monitoring
- Session-based camera streaming with native view
- Display rendering on Meta Ray-Ban Display (declarative view tree with tap handlers)
- Compressed HEVC video streaming (Android)
- Photo capture (JPEG / HEIC)
- `useMetaWearables` React hook with full state management
- Mock device simulation for testing (debug builds) with permission mocking and phone camera feed
- Expo config plugin (auto-configures Info.plist, AndroidManifest, URL schemes, deployment target)

## Compatibility

| Requirement      | Version  |
| ---------------- | -------- |
| React Native     | 0.76+    |
| Expo SDK         | 52+      |
| iOS              | 17.2+    |
| Android          | API 31+  |
| Xcode            | 16+      |
| Swift            | 5.9+     |
| DAT SDK          | 0.9      |
| New Architecture | Untested |

## Supported Devices

- Ray-Ban Meta (verified)
- Ray-Ban Meta Optics (untested)
- Meta Ray-Ban Display (display capability wrapped; untested on hardware)
- Oakley Meta HSTN / Vanguard (untested)
- Meta Glasses (untested)

## Installation

```bash
npx expo install @chrisgocode/expo-meta-wearables-dat
```

Or manually:

```bash
# pnpm
pnpm add @chrisgocode/expo-meta-wearables-dat

# yarn
yarn add @chrisgocode/expo-meta-wearables-dat

# npm
npm install @chrisgocode/expo-meta-wearables-dat
```

## Setup

### Config plugin

Add the plugin to your `app.json` / `app.config.js`:

```json
{
  "plugins": [
    [
      "@chrisgocode/expo-meta-wearables-dat",
      {
        "urlScheme": "myapp",
        "metaAppId": "YOUR_META_APP_ID",
        "clientToken": "YOUR_CLIENT_TOKEN",
        "bluetoothUsageDescription": "This app uses Bluetooth to connect to Meta Wearables."
      }
    ]
  ]
}
```

| Prop                        | Required | Description                                                                                                                                                                   |
| --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `urlScheme`                 | Yes      | URL scheme for Meta AI app callback (e.g. `"myapp"`). Do not include `://` — only the scheme name                                                                             |
| `metaAppId`                 | No       | Meta App ID from [Wearables Developer Center](https://wearables.developer.meta.com/). Omit for Developer Mode                                                                 |
| `clientToken`               | No       | Client Token from Wearables Developer Center                                                                                                                                  |
| `bluetoothUsageDescription` | No       | Custom Bluetooth usage description (iOS only)                                                                                                                                 |
| `githubToken`               | No       | GitHub token for Maven packages (Android). Falls back to `GITHUB_TOKEN` env var                                                                                               |
| `crashReportingOptOut`      | No       | Opt out of DAT SDK crash reporting (SDK 0.9+). Writes `MWDAT > CrashReporting > OptOut` on iOS and the `com.meta.wearable.mwdat.CRASH_REPORTING_OPT_OUT` meta-data on Android |

### iOS

The plugin automatically configures:

- `CFBundleURLTypes` (URL scheme)
- `LSApplicationQueriesSchemes` (`fb-viewapp`)
- `UISupportedExternalAccessoryProtocols` (`com.meta.ar.wearable`)
- `UIBackgroundModes` (`bluetooth-peripheral`, `external-accessory`)
- `NSBluetoothAlwaysUsageDescription`
- `MWDAT` configuration dictionary (including `TeamID` auto-resolved from Xcode's `DEVELOPMENT_TEAM` signing setting)
- iOS deployment target to 17.2
- Embeds MWDATCamera, MWDATCore & MWDATMockDevice dynamic frameworks

> **Note:** DAT SDK 0.9 raised the iOS minimum deployment target from 15.2 to 17.2; apps targeting older iOS versions can no longer link the SDK. The podspec and config plugin both target 17.2.

### Android

The plugin automatically configures:

- `<meta-data>` entries for `APPLICATION_ID` and `CLIENT_TOKEN` in AndroidManifest.xml
- Deep link `<intent-filter>` on MainActivity with the configured URL scheme
- Bluetooth permissions (`BLUETOOTH`, `BLUETOOTH_CONNECT`)

The Android SDK dependencies are resolved via Maven from [GitHub Packages](https://github.com/facebook/meta-wearables-dat-android). The config plugin injects the Maven repository automatically. You need either:

- `GITHUB_ACTOR` and `GITHUB_TOKEN` environment variables set, **or**
- The `githubToken` plugin prop configured

### Prebuild

After adding the plugin, generate the native projects:

```bash
npx expo prebuild
```

If you change plugin configuration later, regenerate with `--clean` to ensure native projects are fully updated:

```bash
npx expo prebuild --clean
```

### Prerequisites

- The user must have the **Meta AI** app installed and paired with their glasses
- A physical device is required (no simulator/emulator support)
- **iOS**: Xcode 16+ with a valid signing team
- **Android**: Android Studio with SDK installed, minSdk 31 (Android 12+)

## Quick Start

```tsx
import { View, Button, Text } from "react-native";
import { useMetaWearables, EMWDATStreamView } from "@chrisgocode/expo-meta-wearables-dat";
import { useState } from "react";

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const {
    isConfigured,
    registrationState,
    devices,
    startRegistration,
    createSession,
    startSession,
    stopSession,
    addCameraToSession,
    capturePhoto,
  } = useMetaWearables({
    onPhotoCaptured: (photo) => console.log("Photo saved:", photo.filePath),
    onStreamStateChange: (state) => console.log("Stream:", state),
  });

  const handleStartStream = async () => {
    const id = await createSession();
    setSessionId(id);
    await startSession(id);
    await addCameraToSession(id, { resolution: "medium", frameRate: 24 });
  };

  const handleStopStream = async () => {
    if (sessionId) {
      await stopSession(sessionId);
      setSessionId(null);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20, paddingTop: 60, gap: 10 }}>
      <Text>Configured: {String(isConfigured)}</Text>
      <Text>Registration: {registrationState}</Text>
      <Text>Devices: {devices.length}</Text>

      <Button title="Register" onPress={() => startRegistration()} />
      <Button title="Start Stream" onPress={handleStartStream} />
      <Button title="Stop Stream" onPress={handleStopStream} />
      <Button title="Capture Photo" onPress={() => capturePhoto("jpeg")} />

      <EMWDATStreamView isActive={!!sessionId} resizeMode="contain" style={{ flex: 1 }} />
    </View>
  );
}
```

## API Reference

### `useMetaWearables(options?)`

React hook that manages the full lifecycle of Meta Wearables integration.

**Options** (`UseMetaWearablesOptions`):

| Option                       | Type                                                                     | Default  | Description                      |
| ---------------------------- | ------------------------------------------------------------------------ | -------- | -------------------------------- |
| `autoConfig`                 | `boolean`                                                                | `true`   | Auto-call `configure()` on mount |
| `logLevel`                   | `LogLevel`                                                               | `"info"` | Initial log level                |
| `onRegistrationStateChange`  | `(state) => void`                                                        | —        | Registration state changed       |
| `onDevicesChange`            | `(devices) => void`                                                      | —        | Device list updated              |
| `onLinkStateChange`          | `(deviceId, linkState) => void`                                          | —        | Device connection changed        |
| `onStreamStateChange`        | `(state) => void`                                                        | —        | Stream state changed             |
| `onVideoFrame`               | `(metadata) => void`                                                     | —        | Video frame received             |
| `onPhotoCaptured`            | `(photo) => void`                                                        | —        | Photo captured                   |
| `onStreamError`              | `(error) => void`                                                        | —        | Stream error occurred            |
| `onPermissionStatusChange`   | `(permission, status) => void`                                           | —        | Permission status changed        |
| `onCompatibilityChange`      | `(deviceId, compatibility) => void`                                      | —        | Device compatibility changed     |
| `onDeviceSessionStateChange` | `(sessionId, state) => void`                                             | —        | Device session state changed     |
| `onDeviceSessionError`       | `(sessionId, error, message?) => void`                                   | —        | Device session error             |
| `onDisplayStateChange`       | `{ sessionId: string; state: DisplayState }`                             |
| `onDisplayTap`               | `{ sessionId: string; tapId: string }` (routed to your `onTap` closures) |
| `onDisplayError`             | `{ sessionId: string } & DisplayError`                                   |
| `onDisplayVideoEvent`        | `{ sessionId, event: DisplayVideoEventType, errorType? }`                |
| `onCapabilityStateChange`    | `(sessionId, state) => void`                                             | —        | Capability state changed         |

**Returned state:**

| Field                 | Type                                  | Description                    |
| --------------------- | ------------------------------------- | ------------------------------ |
| `isConfigured`        | `boolean`                             | SDK configured                 |
| `isConfiguring`       | `boolean`                             | `true` while configuring       |
| `configError`         | `Error \| null`                       | Error from last `configure`    |
| `registrationState`   | `RegistrationState`                   | Registration lifecycle state   |
| `permissionStatus`    | `PermissionStatus`                    | `"granted"` \| `"denied"`      |
| `devices`             | `Device[]`                            | Connected devices              |
| `deviceStates`        | `Record<string, DeviceState>`         | Per-device thermal state       |
| `deviceSessionStates` | `Record<string, DeviceSessionState>`  | Per-session states             |
| `deviceSessionErrors` | `Record<string, { error, message? }>` | Per-session errors             |
| `capabilityStates`    | `Record<string, CapabilityState>`     | Per-session capability state   |
| `streamState`         | `StreamState`                         | Latest stream state            |
| `cameraState`         | `CameraState`                         | Latest camera capability state |

**Returned actions:**

| Action                              | Signature                                   | Description                        |
| ----------------------------------- | ------------------------------------------- | ---------------------------------- |
| `configure`                         | `() => Promise<void>`                       | Initialize SDK                     |
| `setLogLevel`                       | `(level: LogLevel) => void`                 | Change log level                   |
| `startRegistration`                 | `() => Promise<void>`                       | Open Meta AI app for registration  |
| `startUnregistration`               | `() => Promise<void>`                       | Unregister from Meta AI            |
| `checkPermissionStatus`             | `(permission) => Promise<PermissionStatus>` | Check permission                   |
| `requestPermission`                 | `(permission) => Promise<PermissionStatus>` | Request permission                 |
| `getDevice`                         | `(id) => Promise<Device \| null>`           | Get device by identifier           |
| `refreshDevices`                    | `() => Promise<Device[]>`                   | Refresh device list                |
| `createSession`                     | `(deviceId?) => Promise<string>`            | Create a device session            |
| `startSession`                      | `(sessionId) => Promise<void>`              | Start a session                    |
| `stopSession`                       | `(sessionId) => Promise<void>`              | Stop a session (terminal)          |
| `addCameraToSession`                | `(sessionId, config?) => Promise<void>`     | Attach the camera capability       |
| `removeCameraFromSession`           | `(sessionId) => Promise<void>`              | Detach the camera capability       |
| `addStreamToSession`                | `(sessionId, config?) => Promise<void>`     | Deprecated alias of the above      |
| `removeStreamFromSession`           | `(sessionId) => Promise<void>`              | Deprecated alias of the above      |
| `openFirmwareUpdate`                | `() => Promise<void>`                       | Open Meta AI firmware update       |
| `openDATGlassesAppUpdate`           | `() => Promise<void>`                       | Open Meta AI DAT app update        |
| `capturePhoto`                      | `(format?) => Promise<void>`                | Capture photo                      |
| `addDisplayToSession`               | `(sessionId) => Promise<void>`              | Attach the display capability      |
| `renderDisplay`                     | `(sessionId, root) => Promise<void>`        | Replace the whole glasses screen   |
| `clearDisplay`                      | `(sessionId) => Promise<void>`              | Clear the screen, stay attached    |
| `removeDisplayFromSession`          | `(sessionId) => Promise<void>`              | Detach the display capability      |
| `getDisplayState`                   | `(sessionId) => Promise<DisplayState>`      | Read the current display state     |
| `enableMockDeviceKit`               | `(config?) => Promise<void>`                | Enable mock device kit             |
| `disableMockDeviceKit`              | `() => Promise<void>`                       | Disable mock device kit            |
| `isMockDeviceKitEnabled`            | `() => Promise<boolean>`                    | Check if mock kit is enabled       |
| `pairMockDevice`                    | `(model?) => Promise<string>`               | Pair a mock device (any model)     |
| `unpairMockDevice`                  | `(deviceId) => Promise<void>`               | Unpair a mock device               |
| `mockDeviceTap`                     | `(id) => Promise<void>`                     | Simulate a captouch tap            |
| `mockDeviceTapAndHold`              | `(id) => Promise<void>`                     | Simulate a captouch tap-and-hold   |
| `mockSetPermissionStatus`           | `(permission, status) => Promise<void>`     | Set mock permission status         |
| `mockSetPermissionRequestResult`    | `(permission, result) => Promise<void>`     | Set mock permission request result |
| `mockDeviceSetCameraFeedFromCamera` | `(id, facing) => Promise<void>`             | Set mock camera from phone camera  |

### Module Functions

These can be imported directly for lower-level control:

```ts
import {
  EMWDATModule,
  configure,
  setLogLevel,
  startRegistration,
  startUnregistration,
  handleUrl,
  checkPermissionStatus,
  requestPermission,
  getDevices,
  getDevice,
  getRegistrationState,
  getRegistrationStateAsync,
  createSession,
  startSession,
  stopSession,
  addCameraToSession,
  removeCameraFromSession,
  capturePhoto,
  addListener,
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
  mockDeviceSetCameraFeed,
  mockDeviceSetCapturedImage,
  mockDeviceSetCameraFeedFromCamera,
  mockSetPermissionStatus,
  mockSetPermissionRequestResult,
} from "@chrisgocode/expo-meta-wearables-dat";
```

### Events

Subscribe via `addListener` or hook callbacks:

| Event                        | Payload                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| `onRegistrationStateChange`  | `{ state: RegistrationState }`                                           |
| `onDevicesChange`            | `{ devices: Device[] }`                                                  |
| `onLinkStateChange`          | `{ deviceId: string, linkState: LinkState }`                             |
| `onStreamStateChange`        | `{ sessionId: string; state: StreamState }`                              |
| `onCameraStateChange`        | `{ sessionId: string; state: CameraState }`                              |
| `onDeviceStateChange`        | `{ deviceId: DeviceIdentifier; thermalLevel: ThermalLevel }`             |
| `onVideoFrame`               | `{ timestamp, width, height, isCompressed? }`                            |
| `onPhotoCaptured`            | `{ filePath, format, timestamp, width?, height?, base64? }`              |
| `onStreamError`              | `StreamError` (discriminated union)                                      |
| `onPermissionStatusChange`   | `{ permission: Permission, status: PermissionStatus }`                   |
| `onCompatibilityChange`      | `{ deviceId: string, compatibility: Compatibility }`                     |
| `onDeviceSessionStateChange` | `{ sessionId: string, state: DeviceSessionState }`                       |
| `onDeviceSessionError`       | `{ sessionId: string, error: DeviceSessionErrorCode, message?: string }` |
| `onCapabilityStateChange`    | `{ sessionId: string, state: CapabilityState }`                          |

### `EMWDATStreamView`

Native view component for rendering the camera stream.

| Prop         | Type                                    | Default     | Description                 |
| ------------ | --------------------------------------- | ----------- | --------------------------- |
| `isActive`   | `boolean`                               | `false`     | Whether to render frames    |
| `resizeMode` | `"contain"` \| `"cover"` \| `"stretch"` | `"contain"` | How frames fit the view     |
| `style`      | `ViewStyle`                             | —           | Standard React Native style |

### Types

Key types exported from the package:

- `LogLevel` — `"debug"` \| `"info"` \| `"warn"` \| `"error"` \| `"none"`
- `RegistrationState` — `"unavailable"` \| `"available"` \| `"registering"` \| `"registered"` \| `"unregistering"`
- `Permission` — `"camera"`
- `PermissionStatus` — `"granted"` \| `"denied"`
- `Device` — `{ identifier, name, linkState, deviceType, compatibility, supportsDisplay }`
- `DeviceType` — `"rayBanMeta"` \| `"oakleyMetaHSTN"` \| `"oakleyMetaVanguard"` \| `"metaRayBanDisplay"` \| `"rayBanMetaOptics"` \| `"metaGlasses"` \| `"unknown"`
- `LinkState` — `"connected"` \| `"disconnected"` \| `"connecting"`
- `DisplayState` — `"starting"` \| `"started"` \| `"stopping"` \| `"stopped"` \| `"closed"` (Android only)
- `DisplayRoot` — `DisplayFlexNode` \| `DisplayVideoNode` (only these two may be the root)
- `DisplayChildNode` — flex \| text \| button \| image \| icon \| buttonGroup
- `IconName` — 116 system glyphs, identical on both platforms
- `DisplayError` — `deviceDisconnected` \| `deviceNotFound` \| `connectionNotAvailable` \| `invalidVideoUrl` \| `invalidSessionState` \| `renderingFailed` \| `unexpectedError` \| `displayError`
- `Compatibility` — `"compatible"` \| `"undefined"` \| `"deviceUpdateRequired"` \| `"sdkUpdateRequired"`
- `DeviceSessionState` — `"idle"` \| `"starting"` \| `"started"` \| `"paused"` \| `"stopping"` \| `"stopped"`
- `DeviceSessionErrorCode` — `"noEligibleDevice"` \| `"sessionAlreadyStopped"` \| `"sessionAlreadyExists"` \| `"sessionIdle"` \| `"capabilityAlreadyActive"` \| `"capabilityNotFound"` \| `"unexpectedError"`
- `CapabilityState` — `"active"` \| `"stopped"`
- `StreamConfiguration` — `{ videoCodec, resolution, frameRate, deviceId?, compressVideo? }` (`skipAppLaunch` was removed in SDK 0.9; `StreamSessionConfig` remains as a deprecated alias)
- `StreamState` — `"stopped"` \| `"closed"` \| `"waitingForDevice"` \| `"starting"` \| `"started"` \| `"streaming"` \| `"paused"` \| `"stopping"` (`waitingForDevice` is iOS-only; `started`/`closed` are Android-only. `StreamSessionState` remains as a deprecated alias)
- `CameraState` — `"starting"` \| `"started"` \| `"stopping"` \| `"stopped"` (the SDK 0.9 camera capability lifecycle)
- `StreamError` — Discriminated union: `internalError` \| `criticalStreamError` \| `deviceNotFound` \| `deviceNotConnected` \| `timeout` \| `videoStreamingError` \| `permissionDenied` \| `hingesClosed` \| `thermalCritical` \| `thermalHot` \| `thermalEmergency` \| `peakPowerShutdown` \| `peakPowerLimit` \| `batteryCritical` \| `batteryLow` \| `photoCaptureFailed` (`StreamSessionError` remains as a deprecated alias)
- `PhotoData` — `{ filePath, format, timestamp, width?, height?, base64? }`
- `PhotoCaptureFormat` — `"jpeg"` \| `"heic"`
- `VideoFrameMetadata` — `{ timestamp, width, height, isCompressed? }`
- `StreamingResolution` — `"high"` \| `"medium"` \| `"low"`
- `VideoCodec` — `"raw"` \| `"hvc1"`
- `CameraFacing` — `"front"` \| `"back"`
- `MockDeviceKitConfig` — `{ initiallyRegistered?, initialPermissionsGranted? }`
- `CaptureError` — `"deviceDisconnected"` \| `"notStreaming"` \| `"captureInProgress"` \| `"captureFailed"`
- `StreamViewResizeMode` — `"contain"` \| `"cover"` \| `"stretch"`
- `EMWDATPluginProps` — Config plugin options
- Error code types: `WearablesErrorCode`, `RegistrationErrorCode`, `UnregistrationErrorCode`, `PermissionErrorCode`, `DecoderError`

See [`src/EMWDAT.types.ts`](./src/EMWDAT.types.ts) for the full list.

### Display (Meta Ray-Ban Display)

Build a tree of plain objects and send it. Each render **replaces the entire screen** — the SDK
has no partial update and the glasses hold no state, so your app is the source of truth.

```tsx
import { addDisplayToSession, renderDisplay } from "@chrisgocode/expo-meta-wearables-dat";
import type { DisplayRoot } from "@chrisgocode/expo-meta-wearables-dat";

const card = (step: number): DisplayRoot => ({
  type: "flex",
  direction: "column",
  spacing: 12,
  padding: { top: 24, bottom: 24, leading: 24, trailing: 24 },
  children: [
    { type: "text", content: `Step ${step + 1}`, style: "meta" },
    { type: "text", content: STEPS[step], style: "heading" },
    {
      type: "buttonGroup",
      alignment: "center",
      buttons: [
        { type: "button", label: "Back", style: "outline", onTap: () => show(step - 1) },
        { type: "button", label: "Next", style: "primary", onTap: () => show(step + 1) },
      ],
    },
  ],
});

await addDisplayToSession(sessionId);
await renderDisplay(sessionId, card(0));
```

`onTap` closures are called directly — the module assigns each handler an id, strips the
closures before crossing the bridge, and routes `onDisplayTap` back to your function.

**Constraints worth knowing before you design a screen:**

- **Root must be `flex` or `video`.** Only `FlexBox` and `VideoPlayer` are renderable at the top
  level; `video` has no siblings. Enforced by the `DisplayRoot` type.
- **Only `flex` and `button` are tappable.** Text, image and icon take no handler on either
  platform — wrap them in a `flex` with `onTap`. Passing `onTap` elsewhere throws.
- **Handler identity does not survive a render.** Taps for a superseded tree are dropped, not
  misrouted.
- The display is **600×600**, fixed, with no scrolling.
- Video is MP4, under 400px per side and ≤70,000 total pixels.
- **The back gesture (two-finger temple tap) ends the display session.** It arrives as
  `onDisplayStateChange` → `stopped`, not as a tap — handle disappearance you did not initiate.
- Bluetooth-bound: large images and deep trees lag. Render coarsely.
- `renderDisplay` resolving means the SDK accepted the tree, not that it is visible.

Padding edges are writing-direction relative (`leading` / `trailing`), matching iOS `EdgeInsets`
and Android `paddingStart` / `paddingEnd`.

### Mock Device API (Testing)

Functions for simulating Meta Wearables devices during development using the SDK's mock device framework. Only available in debug builds.

```ts
import {
  // Kit lifecycle
  enableMockDeviceKit,
  disableMockDeviceKit,
  isMockDeviceKitEnabled,
  // Device pairing
  pairMockDevice,
  unpairMockDevice,
  getMockDevices,
  // Device simulation
  mockDevicePowerOn,
  mockDevicePowerOff,
  mockDeviceDon,
  mockDeviceDoff,
  mockDeviceFold,
  mockDeviceUnfold,
  mockDeviceSetCameraFeed,
  mockDeviceSetCapturedImage,
  mockDeviceSetCameraFeedFromCamera,
  // Permission mocking
  mockSetPermissionStatus,
  mockSetPermissionRequestResult,
} from "@chrisgocode/expo-meta-wearables-dat";
```

| Function                            | Signature                                             | Description                           |
| ----------------------------------- | ----------------------------------------------------- | ------------------------------------- |
| `enableMockDeviceKit`               | `(config?: MockDeviceKitConfig) => Promise<void>`     | Enable mock kit with optional config  |
| `disableMockDeviceKit`              | `() => Promise<void>`                                 | Disable mock kit and remove fakes     |
| `isMockDeviceKitEnabled`            | `() => Promise<boolean>`                              | Check if mock kit is enabled          |
| `pairMockDevice`                    | `(model?: GlassesModel) => Promise<string>`           | Pair mock glasses, returns ID         |
| `unpairMockDevice`                  | `(id: string) => Promise<void>`                       | Unpair a mock device                  |
| `getMockDevices`                    | `() => Promise<string[]>`                             | List active mock device IDs           |
| `mockDevicePowerOn`                 | `(id: string) => Promise<void>`                       | Power on                              |
| `mockDevicePowerOff`                | `(id: string) => Promise<void>`                       | Power off                             |
| `mockDeviceDon`                     | `(id: string) => Promise<void>`                       | Simulate putting glasses on           |
| `mockDeviceDoff`                    | `(id: string) => Promise<void>`                       | Simulate taking glasses off           |
| `mockDeviceFold`                    | `(id: string) => Promise<void>`                       | Fold hinges                           |
| `mockDeviceUnfold`                  | `(id: string) => Promise<void>`                       | Unfold hinges                         |
| `mockDeviceSetCameraFeed`           | `(id: string, fileUrl: string) => Promise<void>`      | Set camera feed from local video file |
| `mockDeviceSetCapturedImage`        | `(id: string, fileUrl: string) => Promise<void>`      | Set captured image from local file    |
| `mockDeviceSetCameraFeedFromCamera` | `(id: string, facing: CameraFacing) => Promise<void>` | Use phone camera as mock feed         |
| `mockSetPermissionStatus`           | `(permission, status) => Promise<void>`               | Set mock permission check result      |
| `mockSetPermissionRequestResult`    | `(permission, result) => Promise<void>`               | Set mock permission request result    |

## Example App

The `example/` directory contains a full demo app:

1. Copy the example credentials and fill in your values:

   ```bash
   cd example
   ```

   Edit `app.json` and replace the placeholders:
   - `YOUR_APPLE_TEAM_ID` — your Apple Developer Team ID
   - `YOUR_META_APP_ID` — from the [Meta Wearables Developer Center](https://wearables.developer.meta.com/)
   - `YOUR_CLIENT_TOKEN` — from the same Developer Center page

2. Build and run:
   ```bash
   npx expo prebuild --clean
   npx expo run:ios --device
   # or
   npx expo run:android --device
   ```

> Requires a physical device with a paired Meta Wearables device.

## Upgrading to SDK 0.9

This release moves from DAT SDK 0.6 to 0.9 (spanning the 0.7, 0.8 and 0.9 SDK releases).

**Requirements:**

- **iOS deployment target is now 17.2** (was 16.0). Apps below 17.2 can no longer link the SDK.
- Android SDK artifacts move to `com.meta.wearable:mwdat-*:0.9.0`.
- Meta AI app V282 and glasses firmware V125/V126 are the minimum supported versions for 0.9.

**Changed:**

- Streaming is reached through the consolidated **Camera** capability. `addStreamToSession` /
  `removeStreamFromSession` are now deprecated aliases of `addCameraToSession` /
  `removeCameraFromSession`; the SDK's `addStream(...)` was removed in 0.9.
- `onStreamStateChange` now carries `sessionId` alongside `state`, and the hook callback signature
  is `(state, sessionId)`.
- `StreamSessionConfig` / `StreamSessionState` / `StreamSessionError` were renamed to
  `StreamConfiguration` / `StreamState` / `StreamError` (old names kept as deprecated aliases).
- `StreamState` gained `started` and `closed` (Android). Android no longer collapses `STARTED` into
  `starting` or `CLOSED` into `stopped`.
- `Device` gained `supportsDisplay`.
- `RegistrationState` gained `unregistering` (Android reports it; iOS collapses it into `unavailable`).

**Removed:**

- `skipAppLaunch` from the stream config — the SDK removed it.
- iOS `CaptureError` — photo-capture failures now arrive on `onStreamError` as `photoCaptureFailed`.
  Android still surfaces a typed `CaptureError` for `capturePhoto`.
- The `MWDAT.DAMEnabled` Info.plist key and the `com.meta.wearable.mwdat.DAM_ENABLED` manifest
  meta-data are ignored — DAM is always enabled. You can delete them.

**Added:**

- `onCameraStateChange` event and `CameraState` type (the 0.9 camera lifecycle).
- `onDeviceStateChange` event with `ThermalLevel`, plus `deviceStates` on the hook.
- `openFirmwareUpdate()` and `openDATGlassesAppUpdate()`.
- `pairMockDevice(model?)` with `GlassesModel`, plus `mockDeviceTap` / `mockDeviceTapAndHold`
  captouch simulation.
- `metaGlasses` device type; new session error codes (`thermalCritical`, `thermalEmergency`,
  `peakPowerShutdown`, `batteryCritical`, `datAppOnTheGlassesUpdateRequired`, `dwaUnavailable`,
  and the Android-only `capabilityDenied`, `deviceDisconnected`, `sessionEndedByDevice`).
- New stream error codes: `thermalEmergency`, `peakPowerShutdown`, `batteryCritical`,
  `photoCaptureFailed` (iOS) and `criticalStreamError`, `thermalHot`, `batteryLow`,
  `peakPowerLimit` (Android).
- `isCodecConfig` in `VideoFrameMetadata` (Android compressed HEVC frames).
- `crashReportingOptOut` config-plugin prop (SDK 0.9 crash-reporting opt-out).

## Upgrading to 1.2.0 (SDK 0.6)

1.2.0 migrates to Meta Wearables DAT SDK 0.6, introducing a session-based streaming model.

**Deprecated (removed):**

- `startStream(config?)` — use `createSession()` → `startSession(id)` → `addStreamToSession(id, config)`
- `stopStream()` — use `stopSession(sessionId)`
- `getStreamState()` — observe stream state via `onStreamStateChange` event
- `streamState` and `lastError` from hook return — use events and `deviceSessionStates`/`deviceSessionErrors`
- `SessionState` type — replaced by `DeviceSessionState`
- `createMockDevice()` / `removeMockDevice()` — use `enableMockDeviceKit()` + `pairMockDevice()` / `unpairMockDevice()`

**Added:**

- Session management: `createSession`, `startSession`, `stopSession`, `addStreamToSession`, `removeStreamFromSession`
- `DeviceSessionState`, `DeviceSessionErrorCode`, `CapabilityState` types
- `compressVideo` and `skipAppLaunch` in `StreamSessionConfig` (`skipAppLaunch` removed again in SDK 0.9)
- `isCompressed` in `VideoFrameMetadata`
- `rayBanMetaOptics` device type
- Mock device kit lifecycle: `enableMockDeviceKit`, `disableMockDeviceKit`, `isMockDeviceKitEnabled`
- Mock permissions: `mockSetPermissionStatus`, `mockSetPermissionRequestResult`
- Mock phone camera: `mockDeviceSetCameraFeedFromCamera` with `CameraFacing` type
- New events: `onDeviceSessionError`, `onCapabilityStateChange`

## Troubleshooting

### Pod install fails / autolinking skips EMWDAT

Ensure iOS deployment target is 17.2. The config plugin sets this automatically, but if you ran `expo prebuild --clean`, check that `ios/Podfile.properties.json` contains:

```json
{ "ios.deploymentTarget": "17.2" }
```

### `MWDATCamera` / `MWDATCore` framework not found at runtime

The config plugin adds a build phase to embed these dynamic frameworks. Run `npx expo prebuild --clean` to regenerate the Xcode project.

### Registration opens Meta AI app but callback doesn't return

Verify your `urlScheme` matches the one registered in the Meta Wearables Developer Center, and that `CFBundleURLTypes` in Info.plist contains it. The config plugin handles this, but double-check after prebuild.

### Stream starts but no video frames

Ensure the glasses hinges are open and the device is connected (`linkState: "connected"`). Check `onStreamError` for `hingesClosed` or `deviceNotConnected` errors.

### `expo prebuild --clean` breaks the build

This wipes `Podfile.properties.json`. Re-run prebuild (the config plugin will re-inject the deployment target) and then `pod install`.

### Android: Mock device stream shows no frames

The mock video feed **must be HEVC (H.265) encoded**. The SDK requests `video/hevc` mime type and rejects H.264 (AVC) videos. Resolution does not matter — only the codec.

## Privacy & Data

- The library **does not store, persist, or log** personally identifiable information
- **No network requests** are made beyond what the Meta Wearables DAT SDK itself performs
- **Debug logging** is disabled by default (`logLevel: "info"`) — logs stay on the device console
- **Photos** are saved to a local file path and never uploaded by the library
- **Video frames** are rendered on-device and not transmitted or stored

See [SECURITY.md](./SECURITY.md) for the vulnerability reporting process.

## Roadmap

- Speaker playback / microphone capability
- Background streaming (pending SDK support)
- New Architecture validation

## License

[MIT](./LICENSE)
