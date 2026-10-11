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
        const val CHANNEL_ID = "adhan_alarm_playback_channel"
        const val NOTIFICATION_ID = 1001

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

        startAdhanPlayback(prayerName, isFajr)
        return START_NOT_STICKY
    }

    private fun startAdhanPlayback(prayerName: String, isFajr: Boolean) {
        // If already playing, stop previous instance
        stopMediaPlayer()

        currentPrayerName = prayerName
        isPlaying = true

        // 1. Acquire WakeLock to keep CPU active while screen is off
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "SambayangReminder:AdhanWakeLock"
            ).apply {
                acquire(5 * 60 * 1000L) // 5 minutes max timeout
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to acquire wake lock: ${e.message}")
        }

        // 2. Build ongoing notification with Stop action
        val notification = buildAlarmNotification(prayerName)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // 3. Initialize MediaPlayer on the ALARM stream
        try {
            val audioResId = if (isFajr) R.raw.fajr_adhan else R.raw.adhan

            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )

                val afd = resources.openRawResourceFd(audioResId)
                setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                afd.close()

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
        }
    }

    private fun buildAlarmNotification(prayerName: String): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("openedFromAdhan", true)
            putExtra("prayerName", prayerName)
        }
        val contentPendingIntent = PendingIntent.getActivity(
            this,
            0,
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

        val iconRes = applicationInfo.icon.takeIf { it != 0 }
            ?: android.R.drawable.ic_lock_idle_alarm

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🕌 Time for $prayerName Prayer")
            .setContentText("Hayya 'ala-s-Salah. Tap to open app.")
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
            .build()
    }

    private fun stopAdhanPlayback() {
        stopMediaPlayer()
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

            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopMediaPlayer()
        releaseWakeLock()
        isPlaying = false
        currentPrayerName = null
    }
}
