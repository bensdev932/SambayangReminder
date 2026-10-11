import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Notifications from 'expo-notifications';

export const NOTIFICATION_CHANNELS = {
  STANDARD_ADHAN: 'adhan-prayer-channel',
  FAJR_ADHAN: 'adhan-fajr-channel',
  POST_SALAH: 'post-salah-channel',
} as const;

let isHandlerConfigured = false;

/**
 * Configure global notification presentation behavior safely.
 * When the app is foregrounded, we suppress the system notification sound (`shouldPlaySound: false`)
 * so the in-app interactive audio player can play the Adhan with full stop/snooze UI controls without double-ringing.
 * When the app is backgrounded or device is locked, Android OS automatically sounds the channel's custom Adhan audio.
 */
export function initNotificationHandler(): void {
  if (isHandlerConfigured || (Platform.OS === 'android' && isRunningInExpoGo())) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false, // Prevents duplicate chime in foreground while in-app player plays
        shouldSetBadge: false,
        priority: Notifications.AndroidNotificationPriority.MAX,
      }),
    });
    isHandlerConfigured = true;
  } catch (error) {
    console.warn('[Notifications] Failed to set notification handler:', error);
  }
}

/**
 * Configure high-priority Android notification channels for Adhan prayer reminders.
 * Standard prayers use `adhan.mp3` and Fajr prayer uses `fajr_adhan.mp3`.
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android' || isRunningInExpoGo()) {
    if (Platform.OS === 'android' && isRunningInExpoGo()) {
      console.log('[Notifications] Running in Expo Go: skipping native channel creation.');
    }
    return;
  }

  try {
    // 1. Standard Adhan Channel (Dhuhr, Asr, Maghrib, Isha)
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.STANDARD_ADHAN, {
      name: 'Adhan Prayer Reminders',
      description: 'Plays the Adhan call to prayer at each prescribed prayer time.',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'adhan', // Refers to res/raw/adhan.mp3
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#2563EB',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });

    // 2. Fajr Adhan Channel (Special As-Salatu khayrun minan-nawm recitation)
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.FAJR_ADHAN, {
      name: 'Fajr Adhan Reminders',
      description: 'Plays the Fajr Adhan call to prayer at dawn.',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'fajr_adhan', // Refers to res/raw/fajr_adhan.mp3
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#10B981',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });

    // 3. Post-Salah Du'a & Adhkar Channel
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.POST_SALAH, {
      name: 'Post-Salah Du\'a & Adhkar',
      description: 'Reminders for authentic post-prayer supplications.',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8B5CF6',
    });

    console.log('[Notifications] All native Adhan notification channels registered successfully.');
  } catch (error) {
    console.warn('[Notifications] Failed to setup notification channels:', error);
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
 * In development / standalone builds, this leverages exact alarms and native sound channels.
 */
export async function schedulePrayerNotification(
  prayerName: string,
  targetDate: Date,
  locationName: string
): Promise<void> {
  if (Platform.OS === 'android' && isRunningInExpoGo()) return;
  try {
    const isFajr = prayerName === 'Fajr';
    const channelId = isFajr ? NOTIFICATION_CHANNELS.FAJR_ADHAN : NOTIFICATION_CHANNELS.STANDARD_ADHAN;
    const soundName = Platform.OS === 'ios'
      ? (isFajr ? 'fajr_adhan.mp3' : 'adhan.mp3')
      : (isFajr ? 'fajr_adhan' : 'adhan');

    const body = isFajr
      ? `It is now time for Fajr prayer in ${locationName}. As-Salatu khayrun minan-nawm (Prayer is better than sleep).`
      : `It is now time for ${prayerName} prayer in ${locationName}. Hayya 'ala-s-Salah.`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🕌 Time for ${prayerName} Prayer`,
        body,
        sound: soundName,
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: {
          type: 'adhan_prayer',
          prayerName,
          locationName,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: targetDate,
        channelId,
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
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
        data: {
          type: 'post_salah_dua',
          prayerName,
          locationName,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: targetDate,
        channelId: NOTIFICATION_CHANNELS.POST_SALAH,
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
