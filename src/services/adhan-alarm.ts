import { Platform, NativeModules, DeviceEventEmitter } from 'react-native';
import { isRunningInExpoGo } from 'expo';

export interface AdhanPlaybackStatus {
  isPlaying: boolean;
  prayerName: string;
}

export interface ScheduledPrayerAlarmInput {
  prayerName: string;
  timestampMs: number;
  isFajr: boolean;
}

export interface OemPowerManagerInfo {
  manufacturer: string;
  brand: string;
  sdkInt: number;
  oemCategory: 'xiaomi' | 'samsung' | 'coloros' | 'vivo' | 'huawei' | 'standard' | string;
  hasOemRestrictions: boolean;
}

export interface AndroidReliabilityStatus {
  notificationsEnabled: boolean;
  canScheduleExactAlarms: boolean;
  canUseFullScreenIntent: boolean;
  isBatteryOptimizationIgnored: boolean;
  oemInfo: OemPowerManagerInfo;
}

export interface AdhanPlaybackListenerCallbacks {
  onStarted?: (prayerName: string) => void;
  onStopped?: (prayerName: string) => void;
}

const { AdhanAlarmModule } = NativeModules;

/**
 * Check if the native Adhan Alarm module is available.
 * It is available exclusively in standalone / development Android builds (not Expo Go or Web).
 */
export function isNativeAlarmAvailable(): boolean {
  return Platform.OS === 'android' && !isRunningInExpoGo() && !!AdhanAlarmModule;
}

/**
 * Schedule a native exact alarm for a prescribed prayer time.
 * When the alarm fires, the native Android service will sound the Adhan
 * on the high-priority USAGE_ALARM audio stream even if the device is locked/killed.
 */
export async function schedulePrayerAlarm(
  prayerName: string,
  targetDate: Date,
  isFajr: boolean
): Promise<boolean> {
  const timestampMs = targetDate.getTime();
  if (timestampMs <= Date.now()) {
    return false;
  }

  if (!isNativeAlarmAvailable()) {
    return false;
  }

  try {
    const success: boolean = await AdhanAlarmModule.schedulePrayerAlarm(
      prayerName,
      timestampMs,
      isFajr
    );
    return success;
  } catch (error) {
    console.warn(`[AdhanAlarm] Failed to schedule native alarm for ${prayerName}:`, error);
    return false;
  }
}

/**
 * Cancel all scheduled native prayer alarms in Android AlarmManager.
 */
export async function cancelAllPrayerAlarms(): Promise<boolean> {
  if (!isNativeAlarmAvailable()) {
    return false;
  }

  try {
    const success: boolean = await AdhanAlarmModule.cancelAllPrayerAlarms();
    return success;
  } catch (error) {
    console.warn('[AdhanAlarm] Failed to cancel native alarms:', error);
    return false;
  }
}

/**
 * Query whether the native background Adhan service is currently sounding audio.
 */
export async function getAdhanPlaybackStatus(): Promise<AdhanPlaybackStatus> {
  if (!isNativeAlarmAvailable()) {
    return { isPlaying: false, prayerName: '' };
  }

  try {
    const result: AdhanPlaybackStatus = await AdhanAlarmModule.isAdhanPlaying();
    return {
      isPlaying: !!result?.isPlaying,
      prayerName: result?.prayerName || '',
    };
  } catch (error) {
    console.warn('[AdhanAlarm] Failed to query playback status:', error);
    return { isPlaying: false, prayerName: '' };
  }
}

/**
 * Stop the active background Adhan playback and dismiss the ongoing notification.
 */
export async function stopCurrentAdhan(): Promise<boolean> {
  if (!isNativeAlarmAvailable()) {
    return false;
  }

  try {
    const success: boolean = await AdhanAlarmModule.stopCurrentAdhan();
    return success;
  } catch (error) {
    console.warn('[AdhanAlarm] Failed to stop Adhan playback:', error);
    return false;
  }
}

/**
 * Check whether Sambayang Reminder is exempted from Android Battery Optimization (Doze Mode).
 */
export async function isBatteryOptimizationIgnored(): Promise<boolean> {
  if (!isNativeAlarmAvailable()) {
    return true; // Assume true on iOS / Web / Expo Go
  }

  try {
    const isIgnored: boolean = await AdhanAlarmModule.isBatteryOptimizationIgnored();
    return isIgnored;
  } catch {
    return false;
  }
}

/**
 * Open the native Android system dialog requesting exemption from Battery Optimization.
 */
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (!isNativeAlarmAvailable()) {
    return false;
  }

  try {
    const requested: boolean = await AdhanAlarmModule.requestIgnoreBatteryOptimizations();
    return requested;
  } catch (error) {
    console.warn('[AdhanAlarm] Failed to request battery optimization exemption:', error);
    return false;
  }
}

/**
 * Check whether Sambayang Reminder has permission to schedule exact alarms (Android 12+ / API 31+).
 */
export async function canScheduleExactAlarms(): Promise<boolean> {
  if (!isNativeAlarmAvailable()) {
    return true; // iOS, Expo Go, Web do not impose Android exact alarm permissions
  }

  try {
    const canSchedule: boolean = await AdhanAlarmModule.canScheduleExactAlarms();
    return canSchedule;
  } catch {
    return false;
  }
}

/**
 * Open the native Android system settings page for "Alarms & reminders" (SCHEDULE_EXACT_ALARM).
 */
export async function requestScheduleExactAlarmPermission(): Promise<boolean> {
  if (!isNativeAlarmAvailable()) {
    return false;
  }

  try {
    const requested: boolean = await AdhanAlarmModule.requestScheduleExactAlarmPermission();
    return requested;
  } catch (error) {
    console.warn('[AdhanAlarm] Failed to request exact alarm permission:', error);
    return false;
  }
}

/**
 * Subscribe to native background Adhan start and stop events to keep the in-app UI 100% synchronized.
 */
export function addAdhanPlaybackListener(
  callbacks: AdhanPlaybackListenerCallbacks
): () => void {
  if (!isNativeAlarmAvailable()) {
    return () => {};
  }

  const startSubscription = DeviceEventEmitter.addListener(
    'onAdhanPlaybackStarted',
    (data: { prayerName?: string }) => {
      callbacks.onStarted?.(data?.prayerName || 'Prayer');
    }
  );

  const stopSubscription = DeviceEventEmitter.addListener(
    'onAdhanPlaybackStopped',
    (data: { prayerName?: string }) => {
      callbacks.onStopped?.(data?.prayerName || '');
    }
  );

  return () => {
    startSubscription.remove();
    stopSubscription.remove();
  };
}

/**
 * Batch-schedule a multi-day rolling prayer queue into Android AlarmManager + SharedPreferences.
 * Native AdhanAlarmReceiver chains each prayer's next future day automatically upon trigger.
 */
export async function schedulePrayerAlarmsBatch(
  alarms: ScheduledPrayerAlarmInput[]
): Promise<number> {
  if (!isNativeAlarmAvailable()) {
    return 0;
  }

  const nowMs = Date.now();
  const futureAlarms = alarms.filter((a) => a.timestampMs > nowMs);
  if (futureAlarms.length === 0) {
    return 0;
  }

  try {
    if (typeof AdhanAlarmModule.schedulePrayerAlarmsBatch === 'function') {
      return await AdhanAlarmModule.schedulePrayerAlarmsBatch(futureAlarms);
    }

    // Fallback: schedule the next earliest future occurrence for each distinct prayer
    const earliestByPrayer = new Map<string, ScheduledPrayerAlarmInput>();
    for (const item of futureAlarms) {
      const existing = earliestByPrayer.get(item.prayerName);
      if (!existing || item.timestampMs < existing.timestampMs) {
        earliestByPrayer.set(item.prayerName, item);
      }
    }
    let scheduled = 0;
    for (const item of earliestByPrayer.values()) {
      const ok = await schedulePrayerAlarm(
        item.prayerName,
        new Date(item.timestampMs),
        item.isFajr
      );
      if (ok) scheduled++;
    }
    return scheduled;
  } catch (error) {
    console.warn('[AdhanAlarm] Failed to batch-schedule native prayer alarms:', error);
    return 0;
  }
}

/**
 * Schedule an end-to-end native test alarm through AlarmManager -> AdhanAlarmReceiver -> AdhanPlaybackService.
 */
export async function scheduleTestAlarm(
  delaySeconds = 5,
  isFajr = false
): Promise<number | null> {
  if (!isNativeAlarmAvailable() || typeof AdhanAlarmModule.scheduleTestAlarm !== 'function') {
    return null;
  }

  try {
    const triggerAtMs: number = await AdhanAlarmModule.scheduleTestAlarm(delaySeconds, isFajr);
    return triggerAtMs;
  } catch (error) {
    console.warn('[AdhanAlarm] Failed to schedule test alarm:', error);
    return null;
  }
}

export async function areNativeNotificationsEnabled(): Promise<boolean> {
  if (!isNativeAlarmAvailable() || typeof AdhanAlarmModule.areNotificationsEnabled !== 'function') {
    return true;
  }
  try {
    return Boolean(await AdhanAlarmModule.areNotificationsEnabled());
  } catch {
    return false;
  }
}

export async function canUseFullScreenIntent(): Promise<boolean> {
  if (!isNativeAlarmAvailable() || typeof AdhanAlarmModule.canUseFullScreenIntent !== 'function') {
    return true;
  }
  try {
    return Boolean(await AdhanAlarmModule.canUseFullScreenIntent());
  } catch {
    return true;
  }
}

export async function requestFullScreenIntentPermission(): Promise<boolean> {
  if (!isNativeAlarmAvailable() || typeof AdhanAlarmModule.requestFullScreenIntentPermission !== 'function') {
    return false;
  }
  try {
    return Boolean(await AdhanAlarmModule.requestFullScreenIntentPermission());
  } catch (error) {
    console.warn('[AdhanAlarm] Failed to open full-screen intent settings:', error);
    return false;
  }
}

export async function openNotificationSettings(): Promise<boolean> {
  if (!isNativeAlarmAvailable() || typeof AdhanAlarmModule.openNotificationSettings !== 'function') {
    return false;
  }
  try {
    return Boolean(await AdhanAlarmModule.openNotificationSettings());
  } catch (error) {
    console.warn('[AdhanAlarm] Failed to open notification settings:', error);
    return false;
  }
}

export async function getOemPowerManagerInfo(): Promise<OemPowerManagerInfo> {
  const fallback: OemPowerManagerInfo = {
    manufacturer: '',
    brand: '',
    sdkInt: Number(Platform.Version) || 0,
    oemCategory: 'standard',
    hasOemRestrictions: false,
  };

  if (!isNativeAlarmAvailable() || typeof AdhanAlarmModule.getOemPowerManagerInfo !== 'function') {
    return fallback;
  }

  try {
    const info = await AdhanAlarmModule.getOemPowerManagerInfo();
    return {
      manufacturer: info?.manufacturer || '',
      brand: info?.brand || '',
      sdkInt: Number(info?.sdkInt || fallback.sdkInt),
      oemCategory: info?.oemCategory || 'standard',
      hasOemRestrictions: Boolean(info?.hasOemRestrictions),
    };
  } catch {
    return fallback;
  }
}

export async function openOemBackgroundSettings(): Promise<boolean> {
  if (!isNativeAlarmAvailable()) {
    return false;
  }
  try {
    if (typeof AdhanAlarmModule.openOemBackgroundSettings === 'function') {
      return Boolean(await AdhanAlarmModule.openOemBackgroundSettings());
    }
    return requestIgnoreBatteryOptimizations();
  } catch (error) {
    console.warn('[AdhanAlarm] Failed to open OEM background settings:', error);
    return false;
  }
}

export async function getAndroidReliabilityStatus(): Promise<AndroidReliabilityStatus> {
  const [
    notificationsEnabled,
    exactAlarms,
    fullScreenIntent,
    batteryIgnored,
    oemInfo,
  ] = await Promise.all([
    areNativeNotificationsEnabled(),
    canScheduleExactAlarms(),
    canUseFullScreenIntent(),
    isBatteryOptimizationIgnored(),
    getOemPowerManagerInfo(),
  ]);

  return {
    notificationsEnabled,
    canScheduleExactAlarms: exactAlarms,
    canUseFullScreenIntent: fullScreenIntent,
    isBatteryOptimizationIgnored: batteryIgnored,
    oemInfo,
  };
}
