package com.ben.adhanprayerreminder.adhan

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.ben.adhanprayerreminder.MainActivity

/**
 * BroadcastReceiver triggered by Android AlarmManager when a scheduled prayer time arrives.
 * Starts the foreground AdhanPlaybackService to sound the Adhan on the Alarm audio stream.
 */
class AdhanAlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AdhanAlarmReceiver"
        private const val WAKE_LOCK_TAG = "SambayangReminder:AdhanReceiverWakeLock"
        const val EXTRA_IS_TEST = "is_test"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val prayerName = intent.getStringExtra(AdhanPlaybackService.EXTRA_PRAYER_NAME) ?: "Prayer"
        val isFajr = intent.getBooleanExtra(AdhanPlaybackService.EXTRA_IS_FAJR, false)
        val isTest = intent.getBooleanExtra(EXTRA_IS_TEST, false)

        Log.d(TAG, "Adhan alarm triggered for $prayerName (isFajr=$isFajr). Starting playback service.")

        // Acquire a temporary wake lock to ensure CPU remains active and screen wakes up during service startup
        try {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            powerManager?.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                WAKE_LOCK_TAG
            )?.apply {
                acquire(30 * 1000L) // 30 seconds max timeout
            }

            @Suppress("DEPRECATION")
            powerManager?.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                PowerManager.ON_AFTER_RELEASE,
                "$WAKE_LOCK_TAG:Screen"
            )?.apply {
                acquire(15 * 1000L) // 15 seconds screen wake
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to acquire receiver wake lock: ${e.message}")
        }

        if (!isTest) {
            try {
                AdhanAlarmModule.scheduleNextQueuedAlarm(context, prayerName)
            } catch (e: Exception) {
                Log.w(TAG, "Unable to chain next alarm for $prayerName: ${e.message}")
            }
        }

        val serviceIntent = Intent(context, AdhanPlaybackService::class.java).apply {
            action = AdhanPlaybackService.ACTION_START
            putExtra(AdhanPlaybackService.EXTRA_PRAYER_NAME, prayerName)
            putExtra(AdhanPlaybackService.EXTRA_IS_FAJR, isFajr)
            putExtra(AdhanPlaybackService.EXTRA_IS_TEST, isTest)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start AdhanPlaybackService: ${e.message}", e)
            AdhanNotificationHelper.postFallbackPrayerNotification(context, prayerName, isFajr, isTest)
        }
    }
}

internal object AdhanNotificationHelper {
    private const val TAG = "AdhanNotificationHelper"
    const val FALLBACK_STANDARD_CHANNEL_ID = "adhan-prayer-channel-v2"
    const val FALLBACK_FAJR_CHANNEL_ID = "adhan-fajr-channel-v2"
    private const val LEGACY_STANDARD_CHANNEL_ID = "adhan-prayer-channel"
    private const val LEGACY_FAJR_CHANNEL_ID = "adhan-fajr-channel"

    fun resolveSmallIcon(context: Context): Int {
        val notifIconId = context.resources.getIdentifier(
            "notification_icon",
            "drawable",
            context.packageName
        )
        return if (notifIconId != 0) notifIconId else android.R.drawable.ic_lock_idle_alarm
    }

    fun resolveAdhanRawUri(context: Context, isFajr: Boolean): Uri {
        val rawName = if (isFajr) "fajr_adhan" else "adhan"
        val rawResId = context.resources.getIdentifier(rawName, "raw", context.packageName)
        return if (rawResId != 0) {
            Uri.parse("android.resource://${context.packageName}/$rawResId")
        } else {
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        }
    }

    fun canPostNotifications(context: Context): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return false
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        }
        return true
    }

    fun canUseFullScreenIntentCompat(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            return nm?.canUseFullScreenIntent() ?: true
        }
        return true
    }

    fun createOpenAppPendingIntent(context: Context, requestCode: Int): PendingIntent {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        } ?: Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    fun ensureFallbackChannel(context: Context, isFajr: Boolean): String {
        val channelId = if (isFajr) FALLBACK_FAJR_CHANNEL_ID else FALLBACK_STANDARD_CHANNEL_ID
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            if (nm != null) {
                nm.deleteNotificationChannel(LEGACY_STANDARD_CHANNEL_ID)
                nm.deleteNotificationChannel(LEGACY_FAJR_CHANNEL_ID)
                if (nm.getNotificationChannel(channelId) == null) {
                    val soundUri = resolveAdhanRawUri(context, isFajr)
                    val audioAttributes = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                    val name = if (isFajr) {
                        "Fajr Adhan Fallback Alerts"
                    } else {
                        "Prayer Adhan Fallback Alerts"
                    }
                    val channel = NotificationChannel(
                        channelId,
                        name,
                        NotificationManager.IMPORTANCE_HIGH
                    ).apply {
                        description = "High-priority prayer alert with Adhan audio when foreground service is restricted"
                        enableVibration(true)
                        vibrationPattern = longArrayOf(0, 400, 200, 400)
                        setSound(soundUri, audioAttributes)
                        setBypassDnd(true)
                        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    }
                    nm.createNotificationChannel(channel)
                }
            }
        }
        return channelId
    }

    fun postFallbackPrayerNotification(
        context: Context,
        prayerName: String,
        isFajr: Boolean,
        isTest: Boolean = false
    ) {
        if (!canPostNotifications(context)) {
            Log.w(TAG, "POST_NOTIFICATIONS denied or disabled; cannot post fallback alert for $prayerName")
            return
        }

        val channelId = ensureFallbackChannel(context, isFajr)
        val soundUri = resolveAdhanRawUri(context, isFajr)
        val notificationId = if (isTest) 2901 else 2000 + (prayerName.hashCode() and 0xFF)
        val openPendingIntent = createOpenAppPendingIntent(context, notificationId)

        val title = if (isTest) {
            "🔔 Test Adhan Alert ($prayerName)"
        } else {
            "🕌 Time for $prayerName Prayer"
        }
        val body = if (isFajr) {
            "As-Salatu khayrun minan-nawm. Tap to open app."
        } else {
            "Hayya 'ala-s-Salah. Tap to open app."
        }

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(resolveSmallIcon(context))
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setSound(soundUri, AudioManager.STREAM_ALARM)
            .setContentIntent(openPendingIntent)

        if (canUseFullScreenIntentCompat(context)) {
            builder.setFullScreenIntent(openPendingIntent, true)
        }

        try {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build())
            Log.i(TAG, "Posted fallback Adhan notification for $prayerName (id=$notificationId, channel=$channelId)")
        } catch (se: SecurityException) {
            Log.e(TAG, "SecurityException posting fallback notification: ${se.message}", se)
        } catch (e: Exception) {
            Log.e(TAG, "Failed posting fallback notification: ${e.message}", e)
        }
    }
}
