/**
 * Prayer Alert Coordinator — deep module owning every rule about *how* prayer
 * alerts reach the user.
 *
 * Interface (what callers must know):
 *   - `connect()` once per app session; returns a disposer.
 *   - `subscribe` / `getSnapshot` follow the React 19 `useSyncExternalStore`
 *     contract: `getSnapshot()` is referentially stable until state changes.
 *   - `syncSchedule(request)` is safe to call on every location / date / toggle
 *     change. Calls are serialized; a newer call supersedes older in-flight ones.
 *   - Every method degrades instead of throwing.
 *
 * Invariants hidden behind the seam:
 *   1. Sequential permissions (Android 13–15): the notification prompt never runs
 *      before `locationResolved === true`, and auto-prompts at most once per session.
 *   2. Single authoritative engine: when native AlarmManager is available it owns
 *      every prayer-time Adhan (7-day rolling queue). Local notifications then only
 *      carry +15 min Post-Salah Du'a reminders, so the Adhan never double-rings.
 *   3. Readiness merges native diagnostics with notification permission depending
 *      on which engine is active.
 *
 * Dependencies cross the seam through `PrayerAlertPlatform`; production wires
 * Expo/React Native adapters, tests wire in-memory adapters. This file never
 * imports `react-native` or `expo-*`.
 */
import {
  buildRollingPrayerAlarms,
  computeDailyPrayerWindow,
  nextPrayerOccurrence,
  type GeoCoordinates,
  type PrayerName,
  type ScheduledPrayerAlarm,
} from './prayer-calendar';

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export interface OemPowerInfo {
  readonly manufacturer: string;
  readonly brand: string;
  readonly sdkInt: number;
  readonly oemCategory: string;
  readonly hasOemRestrictions: boolean;
}

export interface ReadinessProbe {
  readonly notificationsEnabled: boolean;
  readonly canScheduleExactAlarms: boolean;
  readonly canUseFullScreenIntent: boolean;
  readonly isBatteryOptimizationIgnored: boolean;
  readonly oemInfo: OemPowerInfo;
}

export type SettingsTarget =
  | 'notification_settings'
  | 'exact_alarm'
  | 'full_screen_intent'
  | 'battery_optimization'
  | 'oem_background';

export interface NativeAlarmPort {
  isAvailable(): boolean;
  scheduleBatch(alarms: readonly ScheduledPrayerAlarm[]): Promise<number>;
  cancelAll(): Promise<boolean>;
  scheduleTestAlarm(delaySeconds: number, isFajr: boolean): Promise<number | null>;
  getPlaybackStatus(): Promise<{ isPlaying: boolean; prayerName: string }>;
  stopPlayback(): Promise<boolean>;
  subscribePlayback(callbacks: {
    onStarted: (prayerName: string) => void;
    onStopped: (prayerName: string) => void;
  }): () => void;
  probeReadiness(): Promise<ReadinessProbe>;
  openSettings(target: SettingsTarget): Promise<boolean>;
}

export type NotificationTap =
  | { readonly type: 'post_salah_dua'; readonly prayerName: string }
  | { readonly type: 'adhan_prayer'; readonly prayerName: PrayerName };

export interface LocalNotificationPort {
  /** Foreground handler + channel registration. Called at most once per session. */
  initialize(): Promise<void>;
  getPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  cancelAll(): Promise<void>;
  schedulePrayerAlert(prayerName: PrayerName, at: Date, locationName: string): Promise<void>;
  /** Schedules the Du'a reminder 15 minutes after `prayerTime`. */
  schedulePostSalahDua(prayerName: PrayerName, prayerTime: Date, locationName: string): Promise<void>;
  subscribeTaps(onTap: (tap: NotificationTap) => void): () => void;
}

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface PrayerAlertPlatform {
  readonly nativeAlarm: NativeAlarmPort;
  readonly notifications: LocalNotificationPort;
  readonly storage: KeyValueStore;
  subscribeAppForeground(onForeground: () => void): () => void;
  now(): number;
  /** Run `fn` after `ms`; returns a cancel function. */
  delay(fn: () => void, ms: number): () => void;
}

// ---------------------------------------------------------------------------
// Interface types
// ---------------------------------------------------------------------------

export interface ReadinessReport extends ReadinessProbe {
  readonly allPassed: boolean;
}

export interface PrayerAlertSnapshot {
  readonly readiness: ReadinessReport;
  readonly bannerDismissed: boolean;
  readonly testAlarm: { readonly pending: boolean; readonly message: string | null };
  readonly nativePlayback: { readonly isPlaying: boolean; readonly prayerName: PrayerName | null };
}

export interface ScheduleSyncRequest {
  readonly enabled: boolean;
  readonly locationResolved: boolean;
  readonly coords: GeoCoordinates;
  readonly locationName: string;
  readonly calendarDateKey: string;
}

export interface ScheduleSyncOutcome {
  readonly status: 'scheduled' | 'muted' | 'deferred_location' | 'superseded' | 'failed';
  readonly mode: 'native_rolling' | 'notification_next_occurrence' | 'none';
  readonly permissionGranted: boolean;
  readonly nativeAlarmCount: number;
  readonly prayerNotificationCount: number;
  readonly postSalahDuaCount: number;
}

export type ReadinessAction =
  | 'notifications'
  | 'exact_alarm'
  | 'full_screen_intent'
  | 'battery_optimization'
  | 'oem_background';

export type TestAlarmOutcome =
  | { readonly scheduled: true; readonly triggerAtMs: number }
  | { readonly scheduled: false; readonly reason: 'native_unavailable' | 'already_pending' | 'rejected' };

export interface PrayerAlertCoordinator {
  connect(): () => void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): PrayerAlertSnapshot;
  onNotificationTap(listener: (tap: NotificationTap) => void): () => void;
  syncSchedule(request: ScheduleSyncRequest): Promise<ScheduleSyncOutcome>;
  /** Explicit user-initiated permission request (bypasses the auto-prompt guard). */
  requestNotificationPermission(): Promise<boolean>;
  remediate(action: ReadinessAction): Promise<void>;
  dismissReadinessBanner(): Promise<void>;
  triggerTestAlarm(): Promise<TestAlarmOutcome>;
  stopNativePlayback(): Promise<void>;
}

export const BANNER_DISMISSED_KEY = '@sambayang_battery_banner_dismissed';
export const ROLLING_HORIZON_DAYS = 7;
export const TEST_ALARM_DELAY_SECONDS = 5;
export const TEST_ALARM_RESET_MS = 7000;

const PRAYER_NAMES = new Set<string>(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);

function toPrayerName(value: string): PrayerName | null {
  return PRAYER_NAMES.has(value) ? (value as PrayerName) : null;
}

function emptyOutcome(
  status: ScheduleSyncOutcome['status'],
  permissionGranted = false
): ScheduleSyncOutcome {
  return {
    status,
    mode: 'none',
    permissionGranted,
    nativeAlarmCount: 0,
    prayerNotificationCount: 0,
    postSalahDuaCount: 0,
  };
}

const INITIAL_READINESS: ReadinessReport = {
  notificationsEnabled: true,
  canScheduleExactAlarms: true,
  canUseFullScreenIntent: true,
  isBatteryOptimizationIgnored: true,
  allPassed: true,
  oemInfo: { manufacturer: '', brand: '', sdkInt: 0, oemCategory: 'standard', hasOemRestrictions: false },
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createPrayerAlertCoordinator(platform: PrayerAlertPlatform): PrayerAlertCoordinator {
  const { nativeAlarm, notifications, storage } = platform;

  let snapshot: PrayerAlertSnapshot = {
    readiness: INITIAL_READINESS,
    bannerDismissed: false,
    testAlarm: { pending: false, message: null },
    nativePlayback: { isPlaying: false, prayerName: null },
  };
  const listeners = new Set<() => void>();
  const tapListeners = new Set<(tap: NotificationTap) => void>();

  let initialization: Promise<void> | null = null;
  let hasAutoPrompted = false;
  let syncEpoch = 0;
  let syncQueue: Promise<unknown> = Promise.resolve();
  let cancelTestReset: (() => void) | null = null;

  /** Replace the snapshot atomically, then notify. Keeps `getSnapshot` stable. */
  function update(patch: Partial<PrayerAlertSnapshot>): void {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  }

  function ensureInitialized(): Promise<void> {
    if (!initialization) {
      initialization = notifications.initialize().catch(() => {});
    }
    return initialization;
  }

  async function refreshReadiness(): Promise<void> {
    try {
      const [probe, permissionGranted] = await Promise.all([
        nativeAlarm.probeReadiness(),
        notifications.getPermissionGranted(),
      ]);
      // Native builds report the OS-level toggle; elsewhere the Expo permission is authoritative.
      const notificationsEnabled = nativeAlarm.isAvailable()
        ? probe.notificationsEnabled
        : permissionGranted;
      const readiness: ReadinessReport = {
        ...probe,
        notificationsEnabled,
        allPassed:
          notificationsEnabled &&
          probe.canScheduleExactAlarms &&
          probe.canUseFullScreenIntent &&
          probe.isBatteryOptimizationIgnored,
      };
      update({ readiness });
    } catch {
      // Keep last known readiness
    }
  }

  async function refreshPlayback(): Promise<void> {
    try {
      const status = await nativeAlarm.getPlaybackStatus();
      update({
        nativePlayback: {
          isPlaying: status.isPlaying,
          prayerName: status.isPlaying ? toPrayerName(status.prayerName) : null,
        },
      });
    } catch {
      // Keep last known playback state
    }
  }

  async function runSync(epoch: number, request: ScheduleSyncRequest): Promise<ScheduleSyncOutcome> {
    const isStale = () => epoch !== syncEpoch;

    // Invariant 1: never touch permissions or schedules before location settles.
    if (!request.locationResolved) return emptyOutcome('deferred_location');
    if (isStale()) return emptyOutcome('superseded');

    await ensureInitialized();
    await notifications.cancelAll();
    await nativeAlarm.cancelAll();
    if (isStale()) return emptyOutcome('superseded');

    if (!request.enabled) return emptyOutcome('muted');

    let granted = await notifications.getPermissionGranted();
    if (!granted && !hasAutoPrompted) {
      hasAutoPrompted = true;
      granted = await notifications.requestPermission();
    }
    if (isStale()) return emptyOutcome('superseded', granted);
    void refreshReadiness();

    const nowMs = platform.now();
    const native = nativeAlarm.isAvailable();
    let nativeAlarmCount = 0;
    let prayerNotificationCount = 0;
    let postSalahDuaCount = 0;

    // Invariant 2: native AlarmManager owns prayer-time Adhan when available.
    if (native) {
      nativeAlarmCount = await nativeAlarm.scheduleBatch(
        buildRollingPrayerAlarms(request.coords, request.calendarDateKey, nowMs, ROLLING_HORIZON_DAYS)
      );
      if (isStale()) return emptyOutcome('superseded', granted);
    }

    if (granted) {
      const window = computeDailyPrayerWindow(request.coords, request.calendarDateKey);
      for (const prayer of window.prayersList) {
        if (isStale()) return emptyOutcome('superseded', granted);

        if (!native) {
          const next = nextPrayerOccurrence(window, prayer.id, nowMs);
          if (next) {
            await notifications.schedulePrayerAlert(prayer.id, next, request.locationName);
            prayerNotificationCount++;
          }
        }

        // Du'a follows the most recent prayer whose +15 min reminder is still ahead.
        const duaBase =
          prayer.time.getTime() + 15 * 60_000 > nowMs ? prayer.time : window.tomorrowPrayerMap[prayer.id];
        await notifications.schedulePostSalahDua(prayer.id, duaBase, request.locationName);
        postSalahDuaCount++;
      }
    }

    return {
      status: 'scheduled',
      mode: native ? 'native_rolling' : 'notification_next_occurrence',
      permissionGranted: granted,
      nativeAlarmCount,
      prayerNotificationCount,
      postSalahDuaCount,
    };
  }

  return {
    connect() {
      void ensureInitialized();
      void storage
        .getItem(BANNER_DISMISSED_KEY)
        .then((value) => {
          if (value === 'true') update({ bannerDismissed: true });
        })
        .catch(() => {});
      void refreshReadiness();
      void refreshPlayback();

      const unsubscribePlayback = nativeAlarm.subscribePlayback({
        onStarted: (prayerName) =>
          update({ nativePlayback: { isPlaying: true, prayerName: toPrayerName(prayerName) } }),
        onStopped: () => update({ nativePlayback: { isPlaying: false, prayerName: null } }),
      });
      const unsubscribeForeground = platform.subscribeAppForeground(() => {
        void refreshReadiness();
        void refreshPlayback();
      });
      const unsubscribeTaps = notifications.subscribeTaps((tap) => {
        tapListeners.forEach((listener) => listener(tap));
      });

      return () => {
        unsubscribePlayback();
        unsubscribeForeground();
        unsubscribeTaps();
        cancelTestReset?.();
        cancelTestReset = null;
      };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return snapshot;
    },

    onNotificationTap(listener) {
      tapListeners.add(listener);
      return () => {
        tapListeners.delete(listener);
      };
    },

    syncSchedule(request) {
      const epoch = ++syncEpoch;
      const run = syncQueue.then(() =>
        runSync(epoch, request).catch((error: unknown) => {
          console.warn('[PrayerAlerts] Schedule sync failed:', error);
          return emptyOutcome('failed');
        })
      );
      syncQueue = run;
      return run;
    },

    async requestNotificationPermission() {
      let granted = false;
      try {
        await ensureInitialized();
        granted = await notifications.requestPermission();
      } catch {
        granted = false;
      }
      await refreshReadiness();
      return granted;
    },

    async remediate(action) {
      try {
        if (action === 'notifications') {
          const granted = await notifications.requestPermission();
          if (!granted) await nativeAlarm.openSettings('notification_settings');
        } else {
          await nativeAlarm.openSettings(action);
        }
      } catch {
        // Settings screens are best effort
      }
      if (action !== 'oem_background') await refreshReadiness();
    },

    async dismissReadinessBanner() {
      update({ bannerDismissed: true });
      try {
        await storage.setItem(BANNER_DISMISSED_KEY, 'true');
      } catch {
        // Preference persistence is best effort
      }
    },

    async triggerTestAlarm() {
      if (snapshot.testAlarm.pending) return { scheduled: false, reason: 'already_pending' };
      if (!nativeAlarm.isAvailable()) return { scheduled: false, reason: 'native_unavailable' };

      update({
        testAlarm: {
          pending: true,
          message: `Test alarm armed! Lock your screen — triggers in ${TEST_ALARM_DELAY_SECONDS} seconds...`,
        },
      });

      let triggerAtMs: number | null = null;
      try {
        triggerAtMs = await nativeAlarm.scheduleTestAlarm(TEST_ALARM_DELAY_SECONDS, false);
      } catch {
        triggerAtMs = null;
      }

      if (!triggerAtMs) {
        update({
          testAlarm: {
            pending: false,
            message: 'Unable to schedule test alarm. Check Exact Alarm & Notification settings above.',
          },
        });
        return { scheduled: false, reason: 'rejected' };
      }

      cancelTestReset?.();
      cancelTestReset = platform.delay(() => {
        cancelTestReset = null;
        update({ testAlarm: { pending: false, message: null } });
      }, TEST_ALARM_RESET_MS);
      return { scheduled: true, triggerAtMs };
    },

    async stopNativePlayback() {
      try {
        await nativeAlarm.stopPlayback();
      } catch {
        // Fall through and clear local state regardless
      }
      update({ nativePlayback: { isPlaying: false, prayerName: null } });
    },
  };
}

