package com.ben.adhanprayerreminder.adhan

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.ben.adhanprayerreminder.MainActivity
import com.ben.adhanprayerreminder.R

/**
 * Foreground Service that plays the Adhan recitation on the Android ALARM audio stream.
 * Rings at full volume even in Doze / Silent mode, displays a heads-up notification with
 * a "Stop Adhan" action, and terminates automatically after the track finishes (~2m 50s).
 */
class AdhanPlaybackService : Service() {

    companion object {
        private const val TAG = "AdhanPlaybackService"
        const val CHANNEL_ID = "adhan_alarm_playback_channel_v2"
        const val LEGACY_CHANNEL_ID = "adhan_alarm_playback_channel"
        const val NOTIFICATION_ID = 1001
        const val EXTRA_IS_TEST = "is_test"

        const val ACTION_START = "com.ben.adhanprayerreminder.adhan.ACTION_START"
        const val ACTION_STOP = "com.ben.adhanprayerreminder.adhan.ACTION_STOP"

        const val EXTRA_PRAYER_NAME = "prayerName"
        const val EXTRA_IS_FAJR = "isFajr"

        @Volatile
        var isPlaying: Boolean = false
            private set

        @Volatile
        var currentPrayerName: String? = null
            private set
    }

    private var mediaPlayer: MediaPlayer? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        if (action == ACTION_STOP) {
            Log.d(TAG, "Received ACTION_STOP. Terminating Adhan playback.")
            stopAdhanPlayback()
            return START_NOT_STICKY
        }

        val prayerName = intent?.getStringExtra(EXTRA_PRAYER_NAME) ?: "Prayer"
        val isFajr = intent?.getBooleanExtra(EXTRA_IS_FAJR, false) ?: false
        val isTest = intent?.getBooleanExtra(EXTRA_IS_TEST, false) ?: false

        startAdhanPlayback(prayerName, isFajr, isTest)
        return START_NOT_STICKY
    }

    private fun startAdhanPlayback(prayerName: String, isFajr: Boolean, isTest: Boolean = false) {
        // If already playing, stop previous instance
        stopMediaPlayer()

        currentPrayerName = prayerName
        isPlaying = true

        // 1. Acquire WakeLock to keep CPU active while screen is off, plus turn screen on
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "SambayangReminder:AdhanWakeLock"
            ).apply {
                acquire(5 * 60 * 1000L) // 5 minutes max timeout
            }

            // Briefly wake the display if the device is currently asleep
            @Suppress("DEPRECATION")
            powerManager.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                PowerManager.ON_AFTER_RELEASE,
                "SambayangReminder:AdhanScreenWakeLock"
            ).apply {
                acquire(15 * 1000L) // 15 seconds screen illumination
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to acquire wake lock: ${e.message}")
        }

        // 2. Build ongoing notification with Stop action and guard startForeground on Android 14/15+
        val notification = buildAlarmNotification(prayerName, isFajr, isTest)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed (${e.javaClass.simpleName}): ${e.message}", e)
            AdhanNotificationHelper.postFallbackPrayerNotification(this, prayerName, isFajr, isTest)
            isPlaying = false
            currentPrayerName = null
            releaseWakeLock()
            stopSelf()
            return
        }

        // 3. Initialize MediaPlayer on the ALARM stream
        val audioResId = if (isFajr) R.raw.fajr_adhan else R.raw.adhan
        val afd = try {
            resources.openRawResourceFd(audioResId)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open raw resource for Adhan (resId=$audioResId): ${e.message}", e)
            null
        }

        if (afd == null) {
            Log.e(TAG, "AssetFileDescriptor is null for Adhan (resId=$audioResId)")
            stopAdhanPlayback()
            return
        }

        try {
            requestAlarmAudioFocus()
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )

                setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)

                setOnCompletionListener {
                    Log.d(TAG, "Adhan recitation completed naturally (~2m 50s). Cleaning up.")
                    stopAdhanPlayback()
                }

                setOnErrorListener { _, what, extra ->
                    Log.e(TAG, "MediaPlayer error: what=$what, extra=$extra")
                    stopAdhanPlayback()
                    true
                }

                prepare()
                start()
            }

            Log.d(TAG, "Adhan playback started for $prayerName on USAGE_ALARM stream.")
            AdhanAlarmModule.notifyPlaybackStarted(prayerName)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start MediaPlayer for Adhan: ${e.message}", e)
            stopAdhanPlayback()
        } finally {
            try {
                afd.close()
            } catch (closeErr: Exception) {
                Log.w(TAG, "Failed to close AssetFileDescriptor: ${closeErr.message}")
            }
        }
    }

    private fun buildAlarmNotification(
        prayerName: String,
        isFajr: Boolean = false,
        isTest: Boolean = false
    ): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("openedFromAdhan", true)
            putExtra("prayerName", prayerName)
        }
        val contentPendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Full-screen intent to wake the screen and display the alarm UI when locked
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this,
            2,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, AdhanPlaybackService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val iconRes = AdhanNotificationHelper.resolveSmallIcon(this)
        val contentTitle = if (isTest) {
            "🔔 Test Adhan Alert ($prayerName)"
        } else {
            "🕌 Time for $prayerName Prayer"
        }
        val contentText = if (isFajr) {
            "As-Salatu khayrun minan-nawm. Tap to open app."
        } else {
            "Hayya 'ala-s-Salah. Tap to open app."
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(contentTitle)
            .setContentText(contentText)
            .setSmallIcon(iconRes)
            .setContentIntent(contentPendingIntent)
            .setOngoing(true)
            .setAutoCancel(false)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(
                android.R.drawable.ic_media_pause,
                "🛑 Stop Adhan",
                stopPendingIntent
            )

        if (AdhanNotificationHelper.canUseFullScreenIntentCompat(this)) {
            builder.setFullScreenIntent(fullScreenPendingIntent, true)
        }

        return builder.build()
    }

    private fun requestAlarmAudioFocus() {
        try {
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
            val alarmAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(alarmAttributes)
                    .setWillPauseWhenDucked(false)
                    .build()
                audioFocusRequest = request
                audioManager.requestAudioFocus(request)
            } else {
                @Suppress("DEPRECATION")
                audioManager.requestAudioFocus(
                    null,
                    AudioManager.STREAM_ALARM,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed requesting alarm audio focus: ${e.message}")
        }
    }

    private fun abandonAlarmAudioFocus() {
        try {
            val audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest?.let { req ->
                    audioManager.abandonAudioFocusRequest(req)
                }
                audioFocusRequest = null
            } else {
                @Suppress("DEPRECATION")
                audioManager.abandonAudioFocus(null)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed abandoning alarm audio focus: ${e.message}")
        }
    }

    private fun stopAdhanPlayback() {
        stopMediaPlayer()
        abandonAlarmAudioFocus()
        releaseWakeLock()

        isPlaying = false
        val finishedPrayer = currentPrayerName
        currentPrayerName = null

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()

        AdhanAlarmModule.notifyPlaybackStopped(finishedPrayer)
    }

    private fun stopMediaPlayer() {
        try {
            mediaPlayer?.apply {
                if (isPlaying) {
                    stop()
                }
                reset()
                release()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing MediaPlayer: ${e.message}")
        } finally {
            mediaPlayer = null
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing WakeLock: ${e.message}")
        } finally {
            wakeLock = null
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager?.deleteNotificationChannel(LEGACY_CHANNEL_ID)
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Adhan Prayer Alarms",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "High-priority alarm notifications when the Adhan call to prayer is sounding."
                setSound(null, null) // Audio is managed directly via MediaPlayer to prevent double-ringing
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 250, 500)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
                setShowBadge(true)
                enableLights(true)
                lightColor = android.graphics.Color.BLUE
            }

            manager?.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopMediaPlayer()
        abandonAlarmAudioFocus()
        releaseWakeLock()
        isPlaying = false
        currentPrayerName = null
    }
}
