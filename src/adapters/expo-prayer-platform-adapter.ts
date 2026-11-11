import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import {
  createPrayerAlertCoordinator,
  type KeyValueStore,
  type LocalNotificationPort,
  type NativeAlarmPort,
  type PrayerAlertCoordinator,
  type PrayerAlertPlatform,
  type ReadinessProbe,
  type SettingsTarget,
} from '../domain/prayer-alert-coordinator';
import type { PrayerName, ScheduledPrayerAlarm } from '../domain/prayer-calendar';
import {
  addAdhanPlaybackListener,
  cancelAllPrayerAlarms,
  getAdhanPlaybackStatus,
  getAndroidReliabilityStatus,
  isNativeAlarmAvailable,
  openNotificationSettings,
  openOemBackgroundSettings,
  requestFullScreenIntentPermission,
  requestIgnoreBatteryOptimizations,
  requestScheduleExactAlarmPermission,
  schedulePrayerAlarmsBatch,
  scheduleTestAlarm,
  stopCurrentAdhan,
  type ScheduledPrayerAlarmInput,
} from '../services/adhan-alarm';
import {
  addNotificationResponseListener,
  cancelAllPrayerNotifications,
  getNotificationPermissionGranted,
  initNotificationHandler,
  requestNotificationPermissions,
  schedulePostPrayerDuaNotification,
  schedulePrayerNotification,
  setupNotificationChannel,
} from '../services/notifications';

const expoStorage: KeyValueStore = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
};

const expoNotifications: LocalNotificationPort = {
  initialize: async () => {
    initNotificationHandler();
    await setupNotificationChannel();
  },
  getPermissionGranted: () => getNotificationPermissionGranted(),
  requestPermission: () => requestNotificationPermissions(),
  cancelAll: () => cancelAllPrayerNotifications(),
  schedulePrayerAlert: (prayerName, at, locationName) =>
    schedulePrayerNotification(prayerName, at, locationName),
  schedulePostSalahDua: (prayerName, prayerTime, locationName) =>
    schedulePostPrayerDuaNotification(prayerName, prayerTime, locationName),
  subscribeTaps: (onTap) => {
    const sub = addNotificationResponseListener((res) => {
      const data = res?.notification?.request?.content?.data as
        | { type?: string; prayerName?: string; locationName?: string }
        | undefined;
      if (!data) return;
      if (data.type === 'post_salah_dua' && data.prayerName) {
        onTap({ type: 'post_salah_dua', prayerName: data.prayerName });
      } else if (data.type === 'adhan_prayer' && data.prayerName) {
        onTap({ type: 'adhan_prayer', prayerName: data.prayerName as PrayerName });
      }
    });
    return () => sub.remove();
  },
};

const expoNativeAlarm: NativeAlarmPort = {
  isAvailable: () => isNativeAlarmAvailable(),
  scheduleBatch: (alarms: readonly ScheduledPrayerAlarm[]) =>
    schedulePrayerAlarmsBatch(alarms as unknown as ScheduledPrayerAlarmInput[]),
  cancelAll: () => cancelAllPrayerAlarms(),
  scheduleTestAlarm: (delaySeconds: number, isFajr: boolean) =>
    scheduleTestAlarm(delaySeconds, isFajr),
  getPlaybackStatus: () => getAdhanPlaybackStatus(),
  stopPlayback: () => stopCurrentAdhan(),
  subscribePlayback: (callbacks) => addAdhanPlaybackListener(callbacks),
  probeReadiness: async (): Promise<ReadinessProbe> => {
    const status = await getAndroidReliabilityStatus();
    return status;
  },
  openSettings: async (target: SettingsTarget) => {
    switch (target) {
      case 'notification_settings':
        return openNotificationSettings();
      case 'exact_alarm':
        return requestScheduleExactAlarmPermission();
      case 'full_screen_intent':
        return requestFullScreenIntentPermission();
      case 'battery_optimization':
        return requestIgnoreBatteryOptimizations();
      case 'oem_background':
        return openOemBackgroundSettings();
    }
  },
};

export function createExpoPrayerPlatform(): PrayerAlertPlatform {
  return {
    nativeAlarm: expoNativeAlarm,
    notifications: expoNotifications,
    storage: expoStorage,
    subscribeAppForeground: (onForeground: () => void) => {
      const sub = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          onForeground();
        }
      });
      return () => sub.remove();
    },
    now: () => Date.now(),
    delay: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  };
}

let sharedCoordinator: PrayerAlertCoordinator | null = null;

export function getSharedPrayerAlertCoordinator(): PrayerAlertCoordinator {
  if (!sharedCoordinator) {
    sharedCoordinator = createPrayerAlertCoordinator(createExpoPrayerPlatform());
  }
  return sharedCoordinator;
}
