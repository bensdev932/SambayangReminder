package com.ben.adhanprayerreminder.adhan

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * BroadcastReceiver triggered by Android AlarmManager when a scheduled prayer time arrives.
 * Starts the foreground AdhanPlaybackService to sound the Adhan on the Alarm audio stream.
 */
class AdhanAlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AdhanAlarmReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val prayerName = intent.getStringExtra(AdhanPlaybackService.EXTRA_PRAYER_NAME) ?: "Prayer"
        val isFajr = intent.getBooleanExtra(AdhanPlaybackService.EXTRA_IS_FAJR, false)

        Log.d(TAG, "Adhan alarm triggered for $prayerName (isFajr=$isFajr). Starting playback service.")

        val serviceIntent = Intent(context, AdhanPlaybackService::class.java).apply {
            action = AdhanPlaybackService.ACTION_START
            putExtra(AdhanPlaybackService.EXTRA_PRAYER_NAME, prayerName)
            putExtra(AdhanPlaybackService.EXTRA_IS_FAJR, isFajr)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start AdhanPlaybackService: ${e.message}", e)
        }
    }
}
