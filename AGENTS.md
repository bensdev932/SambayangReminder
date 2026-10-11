This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Critical Rules to Prevent Startup Crashes & "3 Logs Error"

### 1. `expo-notifications` & Android Expo Go (SDK 53+)
- **Breaking Change**: Starting in Expo SDK 53, remote push notification functionality and `ExpoTopicSubscriptionModule` were removed from Android Expo Go. Importing `expo-notifications` directly can cause unhandled fatal exceptions at module-load time.
- **Never Import in Route Files**: NEVER import `expo-notifications` directly in `src/app/**` screens or UI components.
- **Encapsulate in Service**: Always isolate notification logic in a defensive service layer (e.g. `src/services/notifications.ts`).
- **Guard with `isRunningInExpoGo()`**: Always check `if (isRunningInExpoGo()) return;` before calling `setNotificationChannelAsync`, `scheduleNotificationAsync`, or `setNotificationHandler`.
- **Auto-Patch Postinstall**: In projects targeting Expo Go on Android, always configure a postinstall hook (`scripts/patch-expo-notifications.js` in `package.json` `"postinstall"`) to patch `warnOfExpoGoPushUsage.js` and `TopicSubscriptionModule.android.js`.

### 2. Expo Router Route Resilience & Error Boundaries
- **Export ErrorBoundary**: Every root navigator `src/app/_layout.tsx` must explicitly export `ErrorBoundary`:
  ```tsx
  export { ErrorBoundary } from 'expo-router';
  ```
- **Zero Top-Level Throwing**: Top-level code in `src/app/**` must NEVER throw unhandled errors during module evaluation. An unhandled exception during module import halts evaluation and causes Expo Router to log:
  1. `Route "./<name>.tsx" is missing the required default export.`
  2. `TypeError: Cannot read property 'ErrorBoundary' of undefined`

### 3. React 19 `useSyncExternalStore` Snapshot Caching
- **Strict Referential Stability**: React 19 requires that `Object.is(getSnapshot(), getSnapshot()) === true` when store state has not changed.
- **Never Return Dynamic Values Directly**: Never return `Date.now()` or newly constructed objects/arrays directly from `getSnapshot`. Always maintain a cached snapshot in store scope that only updates when listeners are notified.

### 4. Non-Gregorian (Hijri) Offline Calculations
- **Hermes Locale Incomplete Support**: Android Hermes does not reliably support non-Gregorian calendar locales (`islamic-umalqura` via `Intl.DateTimeFormat`) on all devices.
- **Always Provide Offline Tabular Fallback**: Implement astronomical/Kuwaiti mathematical algorithms as primary or fallback logic for Islamic calendar dates.

### 5. Transitioning from Expo Go to Development Builds for Background Tasks & Audio
- **Expo Go Limitation**: Expo Go disables native background tasks, custom notification sounds in `res/raw`, and background audio execution when the app is killed.
- **Development Build Execution**: When building with `expo-dev-client` or EAS (`eas build`), `isRunningInExpoGo()` evaluates to `false`, activating native services.
- **Exact Alarms & Background Tasks**: For scheduled prayer calls and Adhan playback, configure `SCHEDULE_EXACT_ALARM` permissions in `app.json` and use an Expo config plugin to copy local audio files into `android/app/src/main/res/raw/`.

### 6. Universal Clean-Room CI Parity & Ambient Assets
- **Zero Ephemeral Dependencies**: CI runners are clean-room environments. Never rely on gitignored stubs (e.g. `expo-env.d.ts`), developer machine caches, or ambient IDE files for builds, tests, or typechecks.
- **Ambient Asset Typing**: When importing non-code assets (`.css`, `.module.css`, audio, fonts, vectors), commit explicit ambient type declarations in tracked files (e.g. `src/types/declarations.d.ts`) and ensure `tsconfig.json` explicitly includes `"**/*.d.ts"`.
- **Node Test Runner Parity**: With Node 20+ ESM TypeScript test suites, always run tests via `tsx --test` to avoid `ERR_UNKNOWN_FILE_EXTENSION` on clean runners without global loaders.

### 7. Atomic SemVer Release & Tagging Protocol
- **Deterministic 5-Step Order**:
  1. Synchronize all version manifests (`package.json`, `app.json`, etc.).
  2. Execute verification triad (`npm test`, `npx tsc --noEmit`, `npx expo lint`).
  3. Commit version bumps atomically (`git commit -m "chore(release): bump version to vX.Y.Z"`). Never create empty commits.
  4. Tag the bump commit (`git tag vX.Y.Z`).
  5. Push the branch commit, then push the tag.
- **Single Canonical Release Pipeline**: Maintain exactly ONE CI workflow listening to release tag triggers (`push.tags: ['v*']`). Duplicate release workflows create race conditions and release collision errors.
- **Failed Release Recovery**: If CI fails post-tag, fix code on the branch, commit, re-point tag locally (`git tag -f vX.Y.Z`), push branch, and force-push tag (`git push -f origin vX.Y.Z`).

### 8. The Binary Horizon & Client Distribution Rules
- **The Binary Horizon Law**: A compiled client binary (APK, IPA, executable) is frozen at compile time. Version `N` cannot run code or features introduced in `N+1`. Upgrading from an un-instrumented client requires a one-time manual install of the instrumented binary.
- **Aggressive Cache Invalidation**: Release check requests must append query timestamps (`?_t=${Date.now()}`) and include `Cache-Control: no-cache, no-store, must-revalidate` headers to prevent mobile HTTP caches (OkHttp/URLSession) from serving stale release data.
- **Multi-Modal Discovery**: Provide at least 3 update discovery vectors: startup silent check, pull-to-refresh / manual user gesture, and on-demand modal check.


