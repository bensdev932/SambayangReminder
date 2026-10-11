package com.ben.adhanprayerreminder.adhan

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.ben.adhanprayerreminder.MainActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

/**
 * React Native Module providing programmatic scheduling of exact prayer alarms,
 * background playback queries, cancellation, exact alarm permissions, and battery optimization requests.
 */
class AdhanAlarmModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        instance = this
    }

    companion object {
        private const val TAG = "AdhanAlarmModule"
        private const val PREFS_NAME = "adhan_alarm_schedules"
        private const val PREF_KEY_SCHEDULES = "schedules"

        @Volatile
        private var instance: AdhanAlarmModule? = null

        fun notifyPlaybackStarted(prayerName: String) {
            instance?.sendEvent("onAdhanPlaybackStarted", Arguments.createMap().apply {
                putString("prayerName", prayerName)
            })
        }

        fun notifyPlaybackStopped(prayerName: String?) {
            instance?.sendEvent("onAdhanPlaybackStopped", Arguments.createMap().apply {
                putString("prayerName", prayerName ?: "")
            })
        }

        fun restoreScheduledAlarms(context: Context) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val jsonString = prefs.getString(PREF_KEY_SCHEDULES, null) ?: return

            try {
                val array = JSONArray(jsonString)
                val now = System.currentTimeMillis()
                val updatedArray = JSONArray()

                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    val prayerName = obj.getString("prayerName")
                    val timestamp = obj.getLong("timestamp")
                    val isFajr = obj.optBoolean("isFajr", false)

                    if (timestamp > now) {
                        scheduleExactAlarm(context, prayerName, timestamp, isFajr)
                        updatedArray.put(obj)
                    }
                }

                prefs.edit().putString(PREF_KEY_SCHEDULES, updatedArray.toString()).apply()
                Log.d(TAG, "Restored ${updatedArray.length()} future prayer alarms upon boot.")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to restore scheduled alarms: ${e.message}", e)
            }
        }

        private fun getRequestCodeForPrayer(prayerName: String): Int {
            return when (prayerName.lowercase()) {
                "fajr" -> 101
                "dhuhr" -> 102
                "asr" -> 103
                "maghrib" -> 104
                "isha" -> 105
                else -> prayerName.hashCode() and 0xFFFF
            }
        }

        @SuppressLint("ScheduleExactAlarm")
        private fun scheduleExactAlarm(
            context: Context,
            prayerName: String,
            timestampMs: Long,
            isFajr: Boolean
        ) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, AdhanAlarmReceiver::class.java).apply {
                putExtra(AdhanPlaybackService.EXTRA_PRAYER_NAME, prayerName)
                putExtra(AdhanPlaybackService.EXTRA_IS_FAJR, isFajr)
            }

            val requestCode = getRequestCodeForPrayer(prayerName)
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val showIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("prayerName", prayerName)
            }
            val showPendingIntent = PendingIntent.getActivity(
                context,
                requestCode,
                showIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            try {
                val canScheduleExact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    alarmManager.canScheduleExactAlarms()
                } else {
                    true
                }

                if (canScheduleExact) {
                    // AlarmClockInfo guarantees waking the device from Doze mode
                    val alarmClockInfo = AlarmManager.AlarmClockInfo(timestampMs, showPendingIntent)
                    alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)
                    Log.d(TAG, "Scheduled alarm clock for $prayerName at $timestampMs (code $requestCode)")
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    // Fallback to setAndAllowWhileIdle if exact alarm permission not granted
                    alarmManager.setAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        timestampMs,
                        pendingIntent
                    )
                    Log.d(TAG, "Exact alarms not permitted. Scheduled fallback setAndAllowWhileIdle for $prayerName at $timestampMs")
                } else {
                    alarmManager.set(
                        AlarmManager.RTC_WAKEUP,
                        timestampMs,
                        pendingIntent
                    )
                    Log.d(TAG, "Scheduled standard alarm for $prayerName at $timestampMs")
                }
            } catch (e: SecurityException) {
                Log.w(TAG, "SecurityException scheduling exact alarm for $prayerName. Falling back to setAndAllowWhileIdle: ${e.message}")
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        alarmManager.setAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP,
                            timestampMs,
                            pendingIntent
                        )
                    } else {
                        alarmManager.set(AlarmManager.RTC_WAKEUP, timestampMs, pendingIntent)
                    }
                } catch (fallbackErr: Exception) {
                    Log.e(TAG, "Failed fallback alarm scheduling for $prayerName: ${fallbackErr.message}", fallbackErr)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to set alarm for $prayerName: ${e.message}", e)
            }
        }

        private fun cancelAlarm(context: Context, prayerName: String) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, AdhanAlarmReceiver::class.java)
            val requestCode = getRequestCodeForPrayer(prayerName)
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )

            if (pendingIntent != null) {
                alarmManager.cancel(pendingIntent)
                pendingIntent.cancel()
            }
        }
    }

    override fun getName(): String = "AdhanAlarmModule"

    private fun sendEvent(eventName: String, params: Any?) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit(eventName, params)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to emit event $eventName to JS: ${e.message}")
        }
    }

    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        try {
            val alarmManager =
                reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val canSchedule = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                alarmManager.canScheduleExactAlarms()
            } else {
                true
            }
            promise.resolve(canSchedule)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestScheduleExactAlarmPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${reactApplicationContext.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            try {
                val fallbackIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${reactApplicationContext.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactApplicationContext.startActivity(fallbackIntent)
                promise.resolve(true)
            } catch (fallbackError: Exception) {
                promise.reject("EXACT_ALARM_PERMISSION_ERROR", fallbackError.message, fallbackError)
            }
        }
    }

    @ReactMethod
    fun schedulePrayerAlarm(
        prayerName: String,
        timestampMs: Double,
        isFajr: Boolean,
        promise: Promise
    ) {
        val targetMs = timestampMs.toLong()
        val now = System.currentTimeMillis()

        if (targetMs <= now) {
            promise.resolve(false)
            return
        }

        try {
            scheduleExactAlarm(reactApplicationContext, prayerName, targetMs, isFajr)
            persistSchedule(prayerName, targetMs, isFajr)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SCHEDULE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelAllPrayerAlarms(promise: Promise) {
        try {
            val prayers = listOf("Fajr", "Dhuhr", "Asr", "Maghrib", "Isha")
            for (prayer in prayers) {
                cancelAlarm(reactApplicationContext, prayer)
            }

            val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().clear().apply()

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isAdhanPlaying(promise: Promise) {
        val map = Arguments.createMap().apply {
            putBoolean("isPlaying", AdhanPlaybackService.isPlaying)
            putString("prayerName", AdhanPlaybackService.currentPrayerName ?: "")
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun stopCurrentAdhan(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, AdhanPlaybackService::class.java).apply {
                action = AdhanPlaybackService.ACTION_STOP
            }
            reactApplicationContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isBatteryOptimizationIgnored(promise: Promise) {
        try {
            val powerManager =
                reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val packageName = reactApplicationContext.packageName
            val isIgnored = powerManager.isIgnoringBatteryOptimizations(packageName)
            promise.resolve(isIgnored)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @SuppressLint("BatteryLife")
    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            val packageName = reactApplicationContext.packageName
            val intent = Intent().apply {
                action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                data = Uri.parse("package:$packageName")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            try {
                // Fallback to general settings screen
                val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactApplicationContext.startActivity(fallbackIntent)
                promise.resolve(true)
            } catch (fallbackError: Exception) {
                promise.reject("BATTERY_OPTI_ERROR", fallbackError.message, fallbackError)
            }
        }
    }

    private fun persistSchedule(prayerName: String, timestampMs: Long, isFajr: Boolean) {
        val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val jsonString = prefs.getString(PREF_KEY_SCHEDULES, "[]")
        val array = JSONArray(jsonString)

        val updatedArray = JSONArray()
        for (i in 0 until array.length()) {
            val obj = array.getJSONObject(i)
            if (obj.getString("prayerName") != prayerName) {
                updatedArray.put(obj)
            }
        }

        val newObj = JSONObject().apply {
            put("prayerName", prayerName)
            put("timestamp", timestampMs)
            put("isFajr", isFajr)
        }
        updatedArray.put(newObj)

        prefs.edit().putString(PREF_KEY_SCHEDULES, updatedArray.toString()).apply()
    }
}
