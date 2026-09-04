# CLAUDE.md

Expo native module for Meta Wearables DAT SDK 0.9 (iOS + Android). Web stubs throw "not supported".

## Commands

Use **pnpm** (enforced). Scripts delegate to `expo-module` CLI.

```bash
pnpm build    # TS → build/
pnpm test     # Jest (4-project: iOS/Android/Web/Node)
pnpm lint     # ESLint
```

## Structure

- `src/` — TS API: module (`EMWDATModule.ts`), types, `useMetaWearables` hook, `EMWDATStreamView` native view. Web stubs in `.web.ts` files.
- `ios/` — Swift: `EMWDATModule.swift` (module def), `WearablesManager.swift` + `CameraSessionManager.swift` (@MainActor singletons), `EMWDATStreamView.swift` (video), `HEVCDecoder.swift`, `MockDeviceManager.swift`, `EMWDATAppDelegateSubscriber.swift` (deep links). SDK linked via SPM in `EMWDAT.podspec` (min iOS 17.2).
- `android/` — Kotlin: `EMWDATModule.kt` (module def), `WearablesManager.kt` + `CameraSessionManager.kt` (singletons), `MockDeviceManager.kt`, `EMWDATView.kt` (video), `EMWDATLogger.kt`. SDK from GitHub Packages Maven (`com.meta.wearable:mwdat-*:0.9.0`).
- `plugin/` — Config plugin: Info.plist, Xcode, Podfile setup for iOS; AndroidManifest meta-data + intent-filter for Android. Entry: `app.plugin.js`.
- `example/` — Standalone Expo app with own `node_modules`. Linked via metro `watchFolders`.

## SDK Docs

- Online: https://wearables.developer.meta.com/docs/develop
- Full API reference (text): https://wearables.developer.meta.com/llms.txt?full=true
- Changelogs: https://github.com/facebook/meta-wearables-dat-ios/blob/main/CHANGELOG.md and https://github.com/facebook/meta-wearables-dat-android/blob/main/CHANGELOG.md
- The docs site is a client-side rendered SPA — use `agent-browser` to browse API reference pages at https://wearables.developer.meta.com/docs/reference/

## Key Patterns

- Module name: `"EMWDAT"` across all platforms
- iOS managers decoupled from ExpoModulesCore via callback closures
- Platform files use `.web.ts`/`.web.tsx` suffix (Metro/webpack resolved)
- Trust the SDK `.swiftinterface` (in the SPM checkout) over docs for iOS signatures
- Session + camera (SDK 0.9): `createSession()` → `DeviceSession`, then `addCamera(config:)` → `Camera`, stream at `camera.stream`. `addStream(config:)` was removed in 0.9
- iOS `Stream.start()` / `.stop()` are sync since 0.8; `Camera.stop()` cascades to the stream
- iOS photo-capture failures arrive as `StreamError.photoCaptureFailed` (`CaptureError` was removed in 0.9); Android still returns `DatResult<PhotoData, CaptureError>`
- `DeviceSessionState`: idle → starting → started → paused → stopping → stopped (terminal)
- iOS publisher subscriptions use `.listen { }` → `AnyListenerToken` (cancel with `await token.cancel()`)
- Android uses `DatResult` everywhere; failure lambdas take `(error, cause)`
- JS API keeps `addCameraToSession` / `removeCameraFromSession`; the old `addStreamToSession` / `removeStreamFromSession` names remain as deprecated aliases

## Conventions

- Conventional Commits (commitlint + husky). Releases via semantic-release on `main`.
