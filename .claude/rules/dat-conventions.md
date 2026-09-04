# DAT SDK Conventions (Android, v0.9)

## Architecture

The SDK is organized into four public modules (this repo links all four):

- **mwdat-core**: Device discovery, registration, permissions, device selectors, session management
- **mwdat-camera**: Camera capability (`Camera` → `Camera.stream`), VideoFrame, photo capture
- **mwdat-display**: Display capability for Meta Ray-Ban Display
- **mwdat-mockdevice**: MockDeviceKit for testing without hardware

## Session + Camera model (v0.9)

Streaming is reached through the consolidated `Camera` capability. `addStream(...)` /
`removeStream()` were removed in 0.9.

```kotlin
val session = Wearables.createSession(AutoDeviceSelector()).getOrElse { error ->
    throw IllegalStateException(error.description)
}
session.start()

val camera = session.addCamera(
    StreamConfiguration(VideoQuality.MEDIUM, frameRate = 24, compressVideo = false)
).getOrElse { error -> throw IllegalStateException(error.description) }

val stream = camera.stream
// Collect from stream.videoStream, stream.state, stream.errorStream, camera.state
stream.start().onFailure { error, _ -> /* handle */ }

camera.stop()          // detaches the camera; cascades to its stream child
session.removeCamera() // capability slot freed
session.stop()         // terminal — create a new session to stream again
```

`DeviceSessionState` lifecycle: `IDLE → STARTING → STARTED → PAUSED → STOPPING → STOPPED`
`CameraState` lifecycle: `STARTING → STARTED → STOPPING → STOPPED`
`StreamState`: `STARTING`, `STARTED`, `STREAMING`, `PAUSED`, `STOPPING`, `STOPPED`, `CLOSED`

## Kotlin Patterns

- Use `suspend` functions for async operations — no callbacks
- Use `StateFlow` / `Flow` for observing state changes
- Use `DatResult<T, E>` for error handling — not exceptions
- Prefer immutable collections
- `DeviceSession.start()` / `stop()` are sync fire-and-forget — observe `session.state` for completion
- Keep per-frame work off the main thread

## Error Handling

`DatResult<T, E>` failure callbacks take two arguments (`error`, `cause`):

```kotlin
Wearables.checkPermissionStatus(Permission.CAMERA)
    .onSuccess { status -> /* handle success */ }
    .onFailure { error, _ -> /* handle error */ }
```

Do **not** use `getOrThrow()` — always handle both paths. Every `DatError` exposes
`description` and `getLocalizedDescription(context)`.

## Naming Conventions

| Suffix     | Purpose                        | Example               |
| ---------- | ------------------------------ | --------------------- |
| `*Manager` | Long-lived resource management | `RegistrationManager` |
| `*Session` | Device session                 | `DeviceSession`       |
| `*Result`  | DatResult type aliases         | `RegistrationResult`  |
| `*Error`   | Typed error enums              | `DeviceSessionError`  |

Methods: `get*`, `set*`, `check*`, `request*`, `observe*`

## Imports

```kotlin
import com.meta.wearable.dat.core.Wearables                  // Entry point
import com.meta.wearable.dat.core.session.DeviceSession       // Device session
import com.meta.wearable.dat.core.session.DeviceSessionState
import com.meta.wearable.dat.core.types.DeviceSessionError
import com.meta.wearable.dat.camera.Camera                    // Camera capability
import com.meta.wearable.dat.camera.Stream
import com.meta.wearable.dat.camera.addCamera                 // DeviceSession extension
import com.meta.wearable.dat.camera.removeCamera
import com.meta.wearable.dat.camera.types.*                   // VideoFrame, PhotoData, etc.
```

For testing:

```kotlin
import com.meta.wearable.dat.mockdevice.MockDeviceKit
import com.meta.wearable.dat.mockdevice.api.GlassesModel
import com.meta.wearable.dat.mockdevice.api.MockDeviceKitConfig
import com.meta.wearable.dat.mockdevice.api.MockGlasses
import com.meta.wearable.dat.mockdevice.api.camera.CameraFacing
```

## Key Types

- `Wearables` — SDK entry point. `Wearables.initialize(context)` returns `DatResult`
- `DeviceSession` — created via `Wearables.createSession(deviceSelector)` (returns `DatResult`)
- `Camera` — camera capability; `Camera.stream`, `Camera.state`, `Camera.stop()` (also `Closeable`)
- `Stream` — video/photo child of `Camera`; `start()` returns `DatResult`
- `DeviceSessionState` — `IDLE`, `STARTING`, `STARTED`, `PAUSED`, `STOPPING`, `STOPPED`
- `DeviceSessionError` — `NO_ELIGIBLE_DEVICE`, `CAPABILITY_ALREADY_ADDED`, `CAPABILITY_DENIED`,
  `DEVICE_DISCONNECTED`, `SESSION_ENDED_BY_DEVICE`, `THERMAL_CRITICAL`, `THERMAL_EMERGENCY`,
  `PEAK_POWER_SHUTDOWN`, `BATTERY_CRITICAL`, `DAT_APP_ON_THE_GLASSES_UPDATE_REQUIRED`,
  `DWA_UNAVAILABLE`, `UNEXPECTED_ERROR`, … (`DEVICE_POWERED_OFF` / `NOT_INITIALIZED` removed in 0.9)
- `StreamError` — `STREAM_ERROR`, `CRITICAL_STREAM_ERROR`, `HINGE_CLOSED`, `PERMISSIONS_DENIED`,
  `THERMAL_HOT`, `BATTERY_LOW`, `PEAK_POWER_LIMIT`, `TIMEOUT` (`THERMAL_EMERGENCY` removed in 0.9)
- `StreamConfiguration` — `videoQuality`, `frameRate`, `compressVideo`
- `VideoFrame` — buffer, width/height, `presentationTimeUs`, `isCompressed`, `isCodecConfig`
- `RegistrationState` — plain enum since 0.7: `UNAVAILABLE`, `AVAILABLE`, `REGISTERING`,
  `REGISTERED`, `UNREGISTERING`. Errors arrive on `Wearables.registrationErrorStream`
- `DeviceState` / `ThermalLevel` — live device state via `Wearables.getDeviceState(deviceId)`
- `AutoDeviceSelector` / `SpecificDeviceSelector` — device targeting
- `MockDeviceKit` — `MockDeviceKit.getInstance(context)`, `enable(config)`,
  `pairGlasses(GlassesModel)` → `DatResult<MockGlasses, MockDeviceKitError>`
- `MockGlasses.services` — `camera` (`MockCameraKit`) and `captouch` (`MockCaptouchKit`)
- `DeviceType` — includes `META_GLASSES` (new in 0.8)

## Dependencies (v0.9)

Dependencies use Maven coordinates via GitHub Packages:

```gradle
implementation "com.meta.wearable:mwdat-core:0.9.0"
implementation "com.meta.wearable:mwdat-camera:0.9.0"
implementation "com.meta.wearable:mwdat-display:0.9.0"
implementation "com.meta.wearable:mwdat-mockdevice:0.9.0"
```

Requires GitHub Packages Maven repository with `GITHUB_ACTOR`/`GITHUB_TOKEN` credentials.

DAM is always enabled since 0.9 — the `com.meta.wearable.mwdat.DAM_ENABLED` manifest
meta-data key is ignored. Crash reporting can be opted out with
`<meta-data android:name="com.meta.wearable.mwdat.CRASH_REPORTING_OPT_OUT" android:value="true" />`.

## Display capability (v0.9)

```kotlin
val display = session.addDisplay(DisplayConfiguration()).getOrElse { error ->
    throw IllegalStateException(error.description)
}

// Each sendContent replaces the entire screen — there are no incremental updates.
display.sendContent {
    flexBox(direction = Direction.COLUMN, gap = 12) {
        text("Step 1", style = TextStyle.META)
        text("Fill the kettle", style = TextStyle.HEADING)
        button(label = "Next", style = ButtonStyle.PRIMARY, onClick = { /* handle */ })
    }
}.onFailure { error, _ -> /* DisplayError */ }

display.clearDisplay()
display.stop()
session.removeDisplay()
```

`DisplayState`: `STARTING → STARTED → STOPPING → STOPPED → CLOSED` (iOS has no `CLOSED`).
`DisplayError`: `DEVICE_DISCONNECTED`, `INVALID_SESSION_STATE`, `RENDERING_FAILED`,
`UNEXPECTED_ERROR` — note this shares only `DEVICE_DISCONNECTED` with the iOS enum.

Only `flexBox` and `button` take an `onClick`; `text`, `image` and `icon` do not. Only `flexBox`
and `video` may be the root (`ContentScope` exposes just those two). Padding parameters are
`paddingTop` / `paddingBottom` / `paddingStart` / `paddingEnd`.

## Links

- [Android API Reference](https://wearables.developer.meta.com/docs/reference/android/dat/0.9)
- [Developer Documentation](https://wearables.developer.meta.com/docs/develop/)
- [GitHub Repository](https://github.com/facebook/meta-wearables-dat-android)
