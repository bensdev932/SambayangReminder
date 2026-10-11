import { Platform, NativeModules, DeviceEventEmitter } from 'react-native';
import { isRunningInExpoGo } from 'expo';

export interface AdhanPlaybackStatus {
  isPlaying: boolean;
  prayerName: string;
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
