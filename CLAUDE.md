# CLAUDE.md

Expo native module for Meta Wearables DAT SDK 1.0 (iOS + Android). Web stubs throw "not supported".

## Commands

Use **pnpm** (enforced). Scripts delegate to `expo-module` CLI.

```bash
pnpm build    # TS → build/
pnpm test     # Jest (4-project: iOS/Android/Web/Node)
pnpm lint     # ESLint
```

## Structure

- `src/` — TS API: module (`EMWDATModule.ts`), types, `useMetaWearables` hook, `EMWDATStreamView` native view. Web stubs in `.web.ts` files.
- `ios/` — Swift: `EMWDATModule.swift` (module def), `WearablesManager.swift` + `CameraSessionManager.swift` + `DisplayManager.swift` + `ExperimentalCapabilitiesManager.swift` (@MainActor singletons), `EMWDATStreamView.swift` (video), `HEVCDecoder.swift`, `MockDeviceManager.swift`, `EMWDATAppDelegateSubscriber.swift` (deep links). SDK linked via SPM in `EMWDAT.podspec` (min iOS 17.2).
- `android/` — Kotlin: `EMWDATModule.kt` (module def), `WearablesManager.kt` + `CameraSessionManager.kt` + `DisplayManager.kt` + `ExperimentalCapabilitiesManager.kt` (singletons), `MockDeviceManager.kt`, `EMWDATView.kt` (video), `EMWDATLogger.kt`. SDK from Maven Central (`com.meta.wearable:mwdat-*:1.0.0`); no credentials.
- `plugin/` — Config plugin: Info.plist, Xcode, Podfile setup for iOS; AndroidManifest meta-data + intent-filter for Android. Entry: `app.plugin.js`.
- `example/` — Standalone Expo app with own `node_modules`. Linked via metro `watchFolders`.

## SDK Docs

- Online: https://wearables.developer.meta.com/docs/develop
- Full API reference (text): https://wearables.developer.meta.com/llms.txt?full=true
- Changelogs: https://github.com/facebook/meta-wearables-dat-ios/blob/main/CHANGELOG.md and https://github.com/facebook/meta-wearables-dat-android/blob/main/CHANGELOG.md
- For 1.0 capability setup, platform differences and source links, read [docs/dat-1.0-upgrade.md](docs/dat-1.0-upgrade.md) before changing native APIs.

## Key Patterns

- Module name: `"EMWDAT"` across all platforms
- iOS managers decoupled from ExpoModulesCore via callback closures
- Platform files use `.web.ts`/`.web.tsx` suffix (Metro/webpack resolved)
- Trust the SDK `.swiftinterface` (in the SPM checkout) over docs for iOS signatures
- Session + camera (SDK 1.0): `createSession()` → `DeviceSession`, then `addCamera(config:)` → `Camera`, stream at `camera.stream`. `addStream(config:)` was removed in 0.9
- iOS `Stream.start()` / `.stop()` are sync since 0.8; `Camera.stop()` cascades to the stream
- Inputs attach/start automatically; Motion and Speech attach/start together. Voice invocation is app scoped; every invocation receives one response. Speech and stream audio need DAT microphone permission.
- Android stopped Photo/Stream children are terminal; remove/re-add Camera to reuse them.
- iOS photo-capture failures arrive as `StreamError.photoCaptureFailed` (`CaptureError` was removed in 0.9); Android still returns `DatResult<PhotoData, CaptureError>`
- `DeviceSessionState`: idle → starting → started → paused → stopping → stopped (terminal)
- iOS publisher subscriptions use `.listen { }` → `AnyListenerToken` (cancel with `await token.cancel()`)
- Android uses `DatResult` everywhere; failure lambdas take `(error, cause)`
- JS API keeps `addCameraToSession` / `removeCameraFromSession`; the old `addStreamToSession` / `removeStreamFromSession` names remain as deprecated aliases
- Display (`mwdat-display` / `MWDATDisplay`): `session.addDisplay()` → `Display`, then
  `send(view)` (iOS) / `sendContent { }` (Android) replaces the **entire** screen — no partial
  updates. iOS needs an explicit `display.start()`; Android starts on attach
- Display trees cross the bridge as plain JSON: `src/displayTree.ts` strips `onTap` closures into
  a per-session registry and replaces it wholesale on each render, so taps for a superseded tree
  are dropped rather than misrouted
- Only `flex` and `button` accept taps; only `flex` and `video` may be a display root

## Conventions

- Conventional Commits (commitlint + husky). Releases via semantic-release on `main`.
