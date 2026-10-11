package com.ben.adhanprayerreminder.adhan

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * BroadcastReceiver triggered upon device restart, exact alarm permission changes, or clock updates.
 * Restores all pending future prayer alarms in Android AlarmManager.
 */
class AdhanBootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AdhanBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        val isBoot = action == Intent.ACTION_BOOT_COMPLETED ||
                     action == "android.intent.action.QUICKBOOT_POWERON"
        val isExactAlarmPermChanged = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            action == AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED
        } else {
            false
        }
        val isTimeChanged = action == Intent.ACTION_TIME_CHANGED ||
                            action == Intent.ACTION_TIMEZONE_CHANGED

        if (isBoot || isExactAlarmPermChanged || isTimeChanged) {
            Log.d(TAG, "Triggered by action '$action'. Restoring scheduled prayer alarms.")
            AdhanAlarmModule.restoreScheduledAlarms(context)
        }
    }
}
