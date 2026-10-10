# Expo & React Native Best Practices: Error Prevention & Compatibility

This rule establishes mandatory engineering guidelines to prevent startup crashes, missing default exports, unhandled native module exceptions, and render errors across all current and future Expo projects.

---

## 1. Defensive Native Module Imports & Expo Go Limitations

### The Rule
- **Never import native modules that have runtime limitations directly inside screen components (`src/app/**`)**.
- Always encapsulate native APIs (notifications, audio, location, camera, background fetch) in an isolated service directory (e.g., `src/services/<service-name>.ts`).
- Always check the execution environment using `isRunningInExpoGo()` from `expo` before triggering native APIs that are unsupported in Expo Go.

### Why This Matters
Starting in **Expo SDK 53+**, Android Expo Go stripped native push notification modules. Directly importing `expo-notifications` at the root of a screen triggers top-level module code that throws an unhandled fatal error in Expo Go. Because top-level code throws, the screen never exports its React component, resulting in cascading errors:
1. `Uncaught Error: Push notifications removed from Expo Go...`
2. `Console Warning: Route "./index.tsx" is missing the required default export.`
3. `Render Error: TypeError: Cannot read property 'ErrorBoundary' of undefined.`

### Defensive Service Pattern
```typescript
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Notifications from 'expo-notifications';

export async function setupNotificationChannel(): Promise<void> {
  // Expo Go on Android lacks NotificationsChannelsProvider
  if (Platform.OS !== 'android' || isRunningInExpoGo()) return;
  
  try {
    await Notifications.setNotificationChannelAsync('channel-id', {
      name: 'Channel Name',
      importance: Notifications.AndroidImportance.HIGH,
    });
  } catch (error) {
    console.warn('[Notifications] Failed to setup channel:', error);
  }
}
```

---

## 2. Automatic Postinstall Patching for Known Expo Go Package Bugs

When an Expo package has a known top-level side-effect bug on Expo Go (such as `expo-notifications` `warnOfExpoGoPushUsage` throwing an error, or `TopicSubscriptionModule.android.js` missing):
1. Create a zero-dependency script: `scripts/patch-expo-notifications.js`.
2. Add `"postinstall": "node ./scripts/patch-expo-notifications.js"` in `package.json`.
3. This guarantees that `npm install`, CI/CD pipelines, and other developers cloning the repo will never experience broken module imports.

---

## 3. Expo Router Root Error Boundaries

Every Expo Router application **must** export `ErrorBoundary` in its root layout:

```tsx
// src/app/_layout.tsx
export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
```

This prevents transient rendering or component errors from crashing the entire app shell and provides clean developer error diagnostics.

---

## 4. React 19 `useSyncExternalStore` Strict Snapshot Caching

In React 19, `useSyncExternalStore` strictly checks that:
```typescript
Object.is(getSnapshot(), getSnapshot()) === true
```
when the store has not changed.

### What to Avoid
```typescript
// ❌ CRITICAL BUG: Creates a new timestamp/object every call -> causes infinite re-render loop
useSyncExternalStore(subscribe, () => Date.now());
```

### The Correct Pattern
```typescript
// ✅ CORRECT: Maintain a stable cached snapshot updated only when listeners are notified
let cachedSnapshot = Date.now();

const subscribe = (callback: () => void) => {
  const interval = setInterval(() => {
    cachedSnapshot = Date.now();
    callback();
  }, 1000);
  return () => clearInterval(interval);
};

const getSnapshot = () => cachedSnapshot;
```

---

## 5. Non-Gregorian (Hijri/Lunar) Calculations

- Never rely exclusively on `Intl.DateTimeFormat` with non-Gregorian calendars (`islamic-umalqura`, `persian`, etc.) on mobile.
- Android Hermes builds often lack full ICU locale tables, causing `Intl` to return `NaN` or invalid dates.
- Always implement or bundle an offline mathematical algorithm (e.g. astronomical tabular calculation) as a primary or fallback mechanism.
