import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Notifications from 'expo-notifications';

let isHandlerConfigured = false;

/**
 * Configure global notification presentation behavior safely.
 */
export function initNotificationHandler(): void {
  if (isHandlerConfigured || (Platform.OS === 'android' && isRunningInExpoGo())) return;
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
    isHandlerConfigured = true;
  } catch (error) {
    console.warn('[Notifications] Failed to set notification handler:', error);
  }
}

/**
 * Configure high-priority Android notification channel for prayer reminders.
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android' || isRunningInExpoGo()) return;
  try {
    await Notifications.setNotificationChannelAsync('adhan-prayer-channel', {
      name: 'Adhan Prayer Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
      sound: 'default',
    });
  } catch (error) {
    console.warn('[Notifications] Failed to setup notification channel:', error);
  }
}

/**
 * Request notification permissions from device.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android' && isRunningInExpoGo()) return true;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.warn('[Notifications] Permission request error:', error);
    return false;
  }
}

/**
 * Cancel all pending scheduled prayer notifications.
 */
export async function cancelAllPrayerNotifications(): Promise<void> {
  if (Platform.OS === 'android' && isRunningInExpoGo()) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.warn('[Notifications] Failed to cancel scheduled notifications:', error);
  }
}

/**
 * Schedule a local prayer reminder at the specified target time.
 */
export async function schedulePrayerNotification(
  prayerName: string,
  targetDate: Date,
  locationName: string
): Promise<void> {
  if (Platform.OS === 'android' && isRunningInExpoGo()) return;
  try {
    const isFajr = prayerName === 'Fajr';
    const body = isFajr
      ? `It is now time for Fajr prayer in ${locationName}. As-Salatu khayrun minan-nawm (Prayer is better than sleep).`
      : `It is now time for ${prayerName} prayer in ${locationName}. Hayya 'ala-s-Salah.`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🕌 Time for ${prayerName} Prayer`,
        body,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: targetDate,
        channelId: 'adhan-prayer-channel',
      },
    });
  } catch (error) {
    console.warn(`[Notifications] Failed to schedule reminder for ${prayerName}:`, error);
  }
}

/**
 * Schedule a local Post-Salah Du'a reminder 15 minutes after the prayer time.
 */
export async function schedulePostPrayerDuaNotification(
  prayerName: string,
  prayerTime: Date,
  locationName: string
): Promise<void> {
  if (Platform.OS === 'android' && isRunningInExpoGo()) return;
  try {
    const targetDate = new Date(prayerTime.getTime() + 15 * 60 * 1000);
    if (targetDate.getTime() <= Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🤲 Post-Salah Du'a & Adhkar (${prayerName})`,
        body: `Time for post-prayer remembrance: "Allahumma a'inni 'ala dhikrika wa shukrika wa husni 'ibadatik." Tap to view authentic adhkar & tasbih.`,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          type: 'post_salah_dua',
          prayerName,
          locationName,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: targetDate,
        channelId: 'adhan-prayer-channel',
      },
    });
  } catch (error) {
    console.warn(`[Notifications] Failed to schedule post-salah dua for ${prayerName}:`, error);
  }
}

/**
 * Register a listener for when the user taps on a notification.
 */
export function addNotificationResponseListener(
  onResponse: (response: Notifications.NotificationResponse) => void
): { remove: () => void } {
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    return { remove: () => {} };
  }
  try {
    const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);
    return subscription;
  } catch (error) {
    console.warn('[Notifications] Failed to add notification response listener:', error);
    return { remove: () => {} };
  }
}
