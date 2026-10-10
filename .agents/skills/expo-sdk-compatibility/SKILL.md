---
name: expo-sdk-compatibility
description: >-
  Use this skill when developing, debugging, or configuring Expo/React Native mobile applications, especially when dealing with native modules (expo-notifications, expo-audio), Expo Go limitations on Android SDK 53+, route evaluation crashes, React 19 external stores, or patch-package workflows.
---

# Expo SDK Compatibility & Native Module Defense Runbook

This skill provides step-by-step procedures to prevent and resolve common runtime and startup crashes in modern Expo applications (SDK 50, 52, 53, 57+).

---

## 1. The "3 Logs Error" in Expo Go on Android

### Symptoms
When launching an Expo app in Expo Go on Android:
1. `Uncaught Error: expo-notifications: Android Push notifications functionality was removed from Expo Go with SDK 53.`
2. `Console Warning: Route "./index.tsx" is missing the required default export.`
3. `Render Error: TypeError: Cannot read property 'ErrorBoundary' of undefined.`

### Diagnostic Protocol
1. **Identify the Culprit**:
   Look for packages with top-level side effects (e.g. `DevicePushTokenAutoRegistration.fx.js` or `TopicSubscriptionModule.android.js` in `expo-notifications`).
2. **Never Import at Screen Top-Level**:
   Ensure `src/app/**` files never import native modules directly if those modules execute code upon evaluation.
3. **Check Environment**:
   Use `isRunningInExpoGo()` from `expo` to skip unsupported native calls (such as channel creation or push token registrations).
4. **Apply Postinstall Patch**:
   Create `scripts/patch-expo-notifications.js` and add `"postinstall": "node ./scripts/patch-expo-notifications.js"` in `package.json`.

---

## 2. Notification Service Pattern

When implementing notifications in an Expo app that must work in both **Expo Go** and **Development Builds**:

```typescript
// src/services/notifications.ts
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Notifications from 'expo-notifications';

export function initNotificationHandler(): void {
  if (isRunningInExpoGo()) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      }),
    });
  } catch (error) {
    console.warn('[Notifications] Handler setup failed:', error);
  }
}

export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android' || isRunningInExpoGo()) return;
  try {
    await Notifications.setNotificationChannelAsync('prayer-channel', {
      name: 'Prayer Notifications',
      importance: Notifications.AndroidImportance.HIGH,
    });
  } catch (error) {
    console.warn('[Notifications] Channel setup failed:', error);
  }
}
```

---

## 3. Route Containment & Error Boundaries

Expo Router evaluates route files at bundle time. If an import fails, the entire route export becomes `undefined`.

Always enforce the following in `src/app/_layout.tsx`:
```tsx
export { ErrorBoundary } from 'expo-router';
```
And ensure that screens have fallback default exports:
```tsx
export default function Screen() {
  return <View>...</View>;
}
```

---

## 4. React 19 `useSyncExternalStore` Strict Rules

React 19 validates store snapshots with `Object.is`:
- **Problem**: Calling `() => Date.now()` inside `getSnapshot` returns a new number each call, triggering an infinite render loop.
- **Solution**:
  ```typescript
  let cachedClock = Date.now();
  
  export function useClock() {
    return useSyncExternalStore(
      (notify) => {
        const id = setInterval(() => {
          cachedClock = Date.now();
          notify();
        }, 1000);
        return () => clearInterval(id);
      },
      () => cachedClock,
      () => cachedClock
    );
  }
  ```

---

## 5. Offline Calendar Robustness

For non-Gregorian calendars (Hijri, Islamic Umm al-Qura, Persian):
- Android Hermes might not have full ICU locales bundled.
- Always provide an astronomical tabular algorithm fallback (e.g., Kuwaiti algorithm) when calculating Islamic dates offline.

---

## 6. Development Build Migration & Background Adhan Audio

### Why Expo Go Fails for Adhan Audio
1. `isRunningInExpoGo()` intentionally halts scheduling in defensive services to evade Android SDK 53+ Expo Go push crashes.
2. Expo Go does not bundle project-specific audio into `android/app/src/main/res/raw`.

### Development Build Requirements
1. **Config Plugin for Notification Sound**:
   Use `withDangerousMod` or an Expo config plugin to copy `assets/audio/adhan.mp3` and `assets/audio/fajr_adhan.mp3` into Android `res/raw/`. Note that Android resource names in `res/raw` must be lowercase alphanumeric and underscores only.
2. **Channel Sound Binding**:
   Specify `sound: 'adhan'` and `sound: 'fajr_adhan'` (without the `.mp3` extension) in `setNotificationChannelAsync`.
3. **Exact Alarm Permissions**:
   Add `android.permission.SCHEDULE_EXACT_ALARM` and `android.permission.USE_EXACT_ALARM` to `app.json` for precise prayer notification delivery.

