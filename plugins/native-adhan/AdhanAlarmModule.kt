package com.ben.adhanprayerreminder.adhan

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.ComponentName
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.ben.adhanprayerreminder.MainActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
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
        private const val REQUEST_CODE_TEST = 901
        private val STANDARD_PRAYERS = listOf("Fajr", "Dhuhr", "Asr", "Maghrib", "Isha")

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

        private fun extractFutureTimestamps(obj: JSONObject, minTimestamp: Long): List<Long> {
            val result = mutableListOf<Long>()
            val queueArray = obj.optJSONArray("timestamps")
            if (queueArray != null) {
                for (i in 0 until queueArray.length()) {
                    val ts = queueArray.optLong(i, -1L)
                    if (ts > minTimestamp) {
                        result.add(ts)
                    }
                }
            } else {
                val single = obj.optLong("timestamp", -1L)
                if (single > minTimestamp) {
                    result.add(single)
                }
            }
            return result.distinct().sorted()
        }

        private fun buildScheduleEntryJson(
            prayerName: String,
            timestamps: List<Long>,
            isFajr: Boolean
        ): JSONObject {
            val arr = JSONArray()
            for (ts in timestamps) {
                arr.put(ts)
            }
            return JSONObject().apply {
                put("prayerName", prayerName)
                put("timestamp", timestamps.first())
                put("timestamps", arr)
                put("isFajr", isFajr)
            }
        }

        fun scheduleNextQueuedAlarm(context: Context, prayerName: String) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val jsonString = prefs.getString(PREF_KEY_SCHEDULES, null) ?: return

            try {
                val array = JSONArray(jsonString)
                val minTimestamp = System.currentTimeMillis() + 5_000L
                val updatedArray = JSONArray()

                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    val entryPrayer = obj.optString("prayerName", "")
                    val isFajr = obj.optBoolean("isFajr", false)

                    if (entryPrayer.equals(prayerName, ignoreCase = true)) {
                        val remaining = extractFutureTimestamps(obj, minTimestamp)
                        if (remaining.isNotEmpty()) {
                            val nextTs = remaining.first()
                            scheduleExactAlarm(context, entryPrayer, nextTs, isFajr, false)
                            updatedArray.put(buildScheduleEntryJson(entryPrayer, remaining, isFajr))
                            Log.d(TAG, "Chained next queued alarm for $entryPrayer at $nextTs (${remaining.size} remaining)")
                        }
                    } else {
                        val remaining = extractFutureTimestamps(obj, System.currentTimeMillis())
                        if (remaining.isNotEmpty()) {
                            updatedArray.put(buildScheduleEntryJson(entryPrayer, remaining, isFajr))
                        }
                    }
                }

                prefs.edit().putString(PREF_KEY_SCHEDULES, updatedArray.toString()).apply()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to chain next queued alarm for $prayerName: ${e.message}", e)
            }
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
                    val isFajr = obj.optBoolean("isFajr", false)
                    val futureTimestamps = extractFutureTimestamps(obj, now)

                    if (futureTimestamps.isNotEmpty()) {
                        val nextTs = futureTimestamps.first()
                        scheduleExactAlarm(context, prayerName, nextTs, isFajr, false)
                        updatedArray.put(buildScheduleEntryJson(prayerName, futureTimestamps, isFajr))
                    }
                }

                prefs.edit().putString(PREF_KEY_SCHEDULES, updatedArray.toString()).apply()
                Log.d(TAG, "Restored ${updatedArray.length()} future prayer alarm queues upon boot/update.")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to restore scheduled alarms: ${e.message}", e)
            }
        }

        private fun getRequestCodeForPrayer(prayerName: String, isTest: Boolean = false): Int {
            if (isTest) return REQUEST_CODE_TEST
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
            isFajr: Boolean,
            isTest: Boolean = false
        ) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, AdhanAlarmReceiver::class.java).apply {
                putExtra(AdhanPlaybackService.EXTRA_PRAYER_NAME, prayerName)
                putExtra(AdhanPlaybackService.EXTRA_IS_FAJR, isFajr)
                putExtra(AdhanAlarmReceiver.EXTRA_IS_TEST, isTest)
            }

            val requestCode = getRequestCodeForPrayer(prayerName, isTest)
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
        private fun cancelAllPendingAlarms(context: Context) {
            for (prayer in STANDARD_PRAYERS) {
                cancelAlarm(context, prayer)
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
            cancelAllPendingAlarms(reactApplicationContext)

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
            val intent = Intent(reactApplicationContext, AdhanPlaybackService::class.java)
            reactApplicationContext.stopService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun schedulePrayerAlarmsBatch(alarms: ReadableArray, promise: Promise) {
        try {
            val now = System.currentTimeMillis()
            val grouped = mutableMapOf<String, Pair<Boolean, MutableList<Long>>>()

            for (i in 0 until alarms.size()) {
                val item = alarms.getMap(i) ?: continue
                val prayerName = item.getString("prayerName") ?: continue
                val timestampMs = item.getDouble("timestampMs").toLong()
                val isFajr = item.hasKey("isFajr") && item.getBoolean("isFajr")
                if (timestampMs <= now) continue

                val entry = grouped.getOrPut(prayerName) { isFajr to mutableListOf() }
                entry.second.add(timestampMs)
            }

            cancelAllPendingAlarms(reactApplicationContext)

            val schedulesArray = JSONArray()
            var scheduledCount = 0
            for ((prayerName, data) in grouped) {
                val (isFajr, rawTimestamps) = data
                val sortedTimestamps = rawTimestamps.distinct().sorted()
                if (sortedTimestamps.isEmpty()) continue

                val nextTs = sortedTimestamps.first()
                scheduleExactAlarm(reactApplicationContext, prayerName, nextTs, isFajr, false)
                scheduledCount++
                schedulesArray.put(buildScheduleEntryJson(prayerName, sortedTimestamps, isFajr))
            }

            val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putString(PREF_KEY_SCHEDULES, schedulesArray.toString()).apply()
            promise.resolve(scheduledCount)
        } catch (e: Exception) {
            promise.reject("BATCH_SCHEDULE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun scheduleTestAlarm(delaySeconds: Int, isFajr: Boolean, promise: Promise) {
        try {
            val clampedSeconds = delaySeconds.coerceIn(2, 300)
            val triggerAt = System.currentTimeMillis() + (clampedSeconds * 1000L)
            val label = if (isFajr) "Fajr (Test)" else "Prayer (Test)"
            scheduleExactAlarm(reactApplicationContext, label, triggerAt, isFajr, true)
            promise.resolve(triggerAt.toDouble())
        } catch (e: Exception) {
            promise.reject("TEST_ALARM_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun areNotificationsEnabled(promise: Promise) {
        try {
            val enabled = AdhanNotificationHelper.canPostNotifications(reactApplicationContext)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun canUseFullScreenIntent(promise: Promise) {
        try {
            promise.resolve(AdhanNotificationHelper.canUseFullScreenIntentCompat(reactApplicationContext))
        } catch (e: Exception) {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestFullScreenIntentPermission(promise: Promise) {
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                    data = Uri.parse("package:${reactApplicationContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            } else {
                createAppNotificationSettingsIntent()
            }
            val started = startActivitySafely(intent) || startActivitySafely(createAppNotificationSettingsIntent())
            promise.resolve(started)
        } catch (e: Exception) {
            promise.reject("FSI_SETTINGS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun openNotificationSettings(promise: Promise) {
        try {
            val started = startActivitySafely(createAppNotificationSettingsIntent()) ||
                startActivitySafely(createAppDetailsSettingsIntent())
            promise.resolve(started)
        } catch (e: Exception) {
            promise.reject("NOTIF_SETTINGS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getOemPowerManagerInfo(promise: Promise) {
        try {
            val manufacturer = (Build.MANUFACTURER ?: "").trim()
            val lower = manufacturer.lowercase()
            val oemCategory = when {
                lower.contains("xiaomi") || lower.contains("redmi") || lower.contains("poco") -> "xiaomi"
                lower.contains("samsung") -> "samsung"
                lower.contains("oppo") || lower.contains("realme") || lower.contains("oneplus") -> "coloros"
                lower.contains("vivo") || lower.contains("iqoo") -> "vivo"
                lower.contains("huawei") || lower.contains("honor") -> "huawei"
                else -> "standard"
            }
            val result = Arguments.createMap().apply {
                putString("manufacturer", manufacturer)
                putString("brand", Build.BRAND ?: "")
                putInt("sdkInt", Build.VERSION.SDK_INT)
                putString("oemCategory", oemCategory)
                putBoolean("hasOemRestrictions", oemCategory != "standard")
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("OEM_INFO_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun openOemBackgroundSettings(promise: Promise) {
        try {
            val candidates = getOemAutostartIntents()
            for (candidate in candidates) {
                if (startActivitySafely(candidate)) {
                    promise.resolve(true)
                    return
                }
            }
            val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val started = startActivitySafely(fallback) || startActivitySafely(createAppDetailsSettingsIntent())
            promise.resolve(started)
        } catch (e: Exception) {
            promise.reject("OEM_SETTINGS_ERROR", e.message, e)
        }
    }

    private fun createAppNotificationSettingsIntent(): Intent {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, reactApplicationContext.packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        } else {
            createAppDetailsSettingsIntent()
        }
    }

    private fun createAppDetailsSettingsIntent(): Intent {
        return Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${reactApplicationContext.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    private fun startActivitySafely(intent: Intent): Boolean {
        return try {
            reactApplicationContext.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun getOemAutostartIntents(): List<Intent> {
        val pkg = reactApplicationContext.packageName
        val lower = (Build.MANUFACTURER ?: "").lowercase()
        val list = mutableListOf<Intent>()

        if (lower.contains("xiaomi") || lower.contains("redmi") || lower.contains("poco")) {
            list.add(
                Intent().setComponent(
                    ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            list.add(
                Intent("miui.intent.action.APP_PERM_EDITOR").apply {
                    putExtra("extra_pkgname", pkg)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        } else if (lower.contains("samsung")) {
            list.add(
                Intent().setComponent(
                    ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            list.add(
                Intent().setComponent(
                    ComponentName("com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } else if (lower.contains("oppo") || lower.contains("realme") || lower.contains("oneplus")) {
            list.add(
                Intent().setComponent(
                    ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            list.add(
                Intent().setComponent(
                    ComponentName("com.oplus.battery", "com.oplus.powermanager.fuelgaue.PowerControlActivity")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            list.add(
                Intent().setComponent(
                    ComponentName("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } else if (lower.contains("vivo") || lower.contains("iqoo")) {
            list.add(
                Intent().setComponent(
                    ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            list.add(
                Intent().setComponent(
                    ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } else if (lower.contains("huawei") || lower.contains("honor")) {
            list.add(
                Intent().setComponent(
                    ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            list.add(
                Intent().setComponent(
                    ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }

        list.add(createAppDetailsSettingsIntent())
        return list
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

    /**
     * Computes the cryptographic SHA-256 checksum of a local file using native Java streams.
     * Guarantees zero-copy memory safety for large binary APK updates.
     */
    @ReactMethod
    fun getFileSha256(filePathString: String, promise: Promise) {
        try {
            val cleanPath = filePathString.removePrefix("file://")
            val file = java.io.File(cleanPath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "File does not exist at $cleanPath")
                return
            }

            val digest = java.security.MessageDigest.getInstance("SHA-256")
            java.io.FileInputStream(file).use { fis ->
                val buffer = ByteArray(16384)
                var bytesRead: Int
                while (fis.read(buffer).also { bytesRead = it } != -1) {
                    digest.update(buffer, 0, bytesRead)
                }
            }
            val hexString = digest.digest().joinToString("") { "%02x".format(it) }
            promise.resolve(hexString)
        } catch (e: Exception) {
            promise.reject("HASH_ERROR", e.message, e)
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

        val newObj = buildScheduleEntryJson(prayerName, listOf(timestampMs), isFajr)
        updatedArray.put(newObj)

        prefs.edit().putString(PREF_KEY_SCHEDULES, updatedArray.toString()).apply()
    }
}
