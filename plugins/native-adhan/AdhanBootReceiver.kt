package com.ben.adhanprayerreminder.adhan

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver triggered upon device restart (BOOT_COMPLETED).
 * Restores all pending future prayer alarms in Android AlarmManager.
 */
class AdhanBootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AdhanBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            Log.d(TAG, "Device reboot detected. Restoring scheduled prayer alarms.")
            AdhanAlarmModule.restoreScheduledAlarms(context)
        }
    }
}
