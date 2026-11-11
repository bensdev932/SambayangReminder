package com.ben.adhanprayerreminder.adhan

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.ben.adhanprayerreminder.MainActivity
import org.json.JSONArray
import org.json.JSONObject

data class PrayerQueueEntry(
    val prayerName: String,
    val timestamps: List<Long>,
    val isFajr: Boolean
) {
    val nextTimestamp: Long?
        get() = timestamps.firstOrNull()
}

data class PlannedAlarm(
    val prayerName: String,
    val timestampMs: Long,
    val isFajr: Boolean,
    val isTest: Boolean = false
)

data class TransitionPlan(
    val newEntries: List<PrayerQueueEntry>,
    val alarmsToSet: List<PlannedAlarm>
)

object PrayerQueueEngine {

    fun normalizeEntry(
        prayerName: String,
        rawTimestamps: List<Long>,
        isFajr: Boolean,
        nowMs: Long
    ): PrayerQueueEntry? {
        val trimmed = rawTimestamps.filter { it > nowMs }.distinct().sorted()
        if (trimmed.isEmpty()) return null
        return PrayerQueueEntry(
            prayerName = prayerName.trim(),
            timestamps = trimmed,
            isFajr = isFajr
        )
    }

    fun planBatchReplace(
        rawEntries: List<PrayerQueueEntry>,
        nowMs: Long
    ): TransitionPlan {
        val grouped = mutableMapOf<String, Pair<String, Pair<Boolean, MutableList<Long>>>>()
        for (entry in rawEntries) {
            val key = entry.prayerName.trim().lowercase()
            val existing = grouped.getOrPut(key) {
                entry.prayerName.trim() to (entry.isFajr to mutableListOf())
            }
            existing.second.second.addAll(entry.timestamps)
        }

        val normalized = mutableListOf<PrayerQueueEntry>()
        val alarms = mutableListOf<PlannedAlarm>()

        for ((_, pair) in grouped) {
            val (displayName, data) = pair
            val (isFajr, timestamps) = data
            val entry = normalizeEntry(displayName, timestamps, isFajr, nowMs) ?: continue
            normalized.add(entry)
            alarms.add(
                PlannedAlarm(
                    prayerName = entry.prayerName,
                    timestampMs = entry.timestamps.first(),
                    isFajr = entry.isFajr
                )
            )
        }

        return TransitionPlan(
            newEntries = normalized,
            alarmsToSet = alarms
        )
    }

    fun planChainNext(
        currentEntries: List<PrayerQueueEntry>,
        triggeredPrayer: String,
        nowMs: Long,
        minGraceMs: Long = 5_000L
    ): TransitionPlan {
        val updated = mutableListOf<PrayerQueueEntry>()
        val alarms = mutableListOf<PlannedAlarm>()
        val targetNameLower = triggeredPrayer.trim().lowercase()
        val minTimestamp = nowMs + minGraceMs

        for (entry in currentEntries) {
            val matches = entry.prayerName.trim().lowercase() == targetNameLower
            val cutoff = if (matches) minTimestamp else nowMs
            val remaining = entry.timestamps.filter { it > cutoff }

            if (remaining.isNotEmpty()) {
                val newEntry = entry.copy(timestamps = remaining)
                updated.add(newEntry)
                if (matches) {
                    alarms.add(
                        PlannedAlarm(
                            prayerName = newEntry.prayerName,
                            timestampMs = remaining.first(),
                            isFajr = newEntry.isFajr
                        )
                    )
                }
            }
        }

        return TransitionPlan(
            newEntries = updated,
            alarmsToSet = alarms
        )
    }

    fun planRestoreAll(
        currentEntries: List<PrayerQueueEntry>,
        nowMs: Long
    ): TransitionPlan {
        val updated = mutableListOf<PrayerQueueEntry>()
        val alarms = mutableListOf<PlannedAlarm>()

        for (entry in currentEntries) {
            val remaining = entry.timestamps.filter { it > nowMs }
            if (remaining.isNotEmpty()) {
                val newEntry = entry.copy(timestamps = remaining)
                updated.add(newEntry)
                alarms.add(
                    PlannedAlarm(
                        prayerName = newEntry.prayerName,
                        timestampMs = remaining.first(),
                        isFajr = newEntry.isFajr
                    )
                )
            }
        }

        return TransitionPlan(
            newEntries = updated,
            alarmsToSet = alarms
        )
    }

    fun toJson(entries: List<PrayerQueueEntry>): String {
        val arr = JSONArray()
        for (entry in entries) {
            val obj = JSONObject().apply {
                put("prayerName", entry.prayerName)
                put("timestamp", entry.timestamps.firstOrNull() ?: 0L)
                val tsArr = JSONArray()
                for (ts in entry.timestamps) {
                    tsArr.put(ts)
                }
                put("timestamps", tsArr)
                put("isFajr", entry.isFajr)
            }
            arr.put(obj)
        }
        return arr.toString()
    }

    fun fromJson(jsonString: String?): List<PrayerQueueEntry> {
        if (jsonString.isNullOrBlank()) return emptyList()
        val result = mutableListOf<PrayerQueueEntry>()
        try {
            val arr = JSONArray(jsonString)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val prayerName = obj.optString("prayerName", "").trim()
                if (prayerName.isEmpty()) continue
                val isFajr = obj.optBoolean("isFajr", false)

                val tsList = mutableListOf<Long>()
                val timestampsArr = obj.optJSONArray("timestamps")
                if (timestampsArr != null) {
                    for (j in 0 until timestampsArr.length()) {
                        tsList.add(timestampsArr.getLong(j))
                    }
                } else if (obj.has("timestamp")) {
                    tsList.add(obj.getLong("timestamp"))
                }

                if (tsList.isNotEmpty()) {
                    result.add(
                        PrayerQueueEntry(
                            prayerName = prayerName,
                            timestamps = tsList.distinct().sorted(),
                            isFajr = isFajr
                        )
                    )
                }
            }
        } catch (_: Exception) {
            return emptyList()
        }
        return result
    }
}

object AdhanAlarmScheduler {
    private const val TAG = "AdhanAlarmScheduler"
    const val REQUEST_CODE_TEST = 999

    fun getRequestCodeForPrayer(prayerName: String, isTest: Boolean = false): Int {
        if (isTest) return REQUEST_CODE_TEST
        return when (prayerName.trim().lowercase()) {
            "fajr" -> 101
            "dhuhr" -> 102
            "asr" -> 103
            "maghrib" -> 104
            "isha" -> 105
            else -> prayerName.hashCode() and 0xFFFF
        }
    }

    @SuppressLint("ScheduleExactAlarm")
    fun scheduleExactAlarm(
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
                val alarmClockInfo = AlarmManager.AlarmClockInfo(timestampMs, showPendingIntent)
                alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)
                Log.d(TAG, "Scheduled alarm clock for $prayerName at $timestampMs (code $requestCode)")
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
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
            Log.w(TAG, "SecurityException scheduling exact alarm for $prayerName. Falling back: ${e.message}")
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

    fun cancelAlarm(context: Context, prayerName: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, AdhanAlarmReceiver::class.java)
        val requestCode = getRequestCodeForPrayer(prayerName)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        try {
            alarmManager.cancel(pendingIntent)
            pendingIntent.cancel()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to cancel alarm for $prayerName: ${e.message}")
        }
    }

    fun cancelAllPendingAlarms(context: Context) {
        val standardPrayers = listOf("Fajr", "Dhuhr", "Asr", "Maghrib", "Isha")
        for (prayer in standardPrayers) {
            cancelAlarm(context, prayer)
        }
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val testIntent = Intent(context, AdhanAlarmReceiver::class.java)
        val testPendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_TEST,
            testIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        try {
            alarmManager.cancel(testPendingIntent)
            testPendingIntent.cancel()
        } catch (_: Exception) {}
    }
}

class PrayerQueueStore(private val context: Context) {

    companion object {
        private const val TAG = "PrayerQueueStore"
        const val PREFS_NAME = "adhan_alarm_schedules"
        const val LEGACY_PREFS_NAME = "AdhanAlarmPrefs"
        const val PREF_KEY_SCHEDULES = "schedules"
        private val lock = Any()
    }

    fun readQueue(): List<PrayerQueueEntry> {
        synchronized(lock) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            var json = prefs.getString(PREF_KEY_SCHEDULES, null)
            if (json.isNullOrBlank()) {
                val legacyPrefs = context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
                json = legacyPrefs.getString(PREF_KEY_SCHEDULES, null)
            }
            return PrayerQueueEngine.fromJson(json)
        }
    }

    fun saveQueue(entries: List<PrayerQueueEntry>) {
        synchronized(lock) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val json = PrayerQueueEngine.toJson(entries)
            prefs.edit().putString(PREF_KEY_SCHEDULES, json).apply()
        }
    }

    fun clear() {
        synchronized(lock) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().clear().apply()
        }
    }

    fun replaceQueue(entries: List<PrayerQueueEntry>): Int {
        synchronized(lock) {
            val nowMs = System.currentTimeMillis()
            val plan = PrayerQueueEngine.planBatchReplace(entries, nowMs)

            AdhanAlarmScheduler.cancelAllPendingAlarms(context)

            var count = 0
            for (alarm in plan.alarmsToSet) {
                AdhanAlarmScheduler.scheduleExactAlarm(
                    context,
                    alarm.prayerName,
                    alarm.timestampMs,
                    alarm.isFajr,
                    alarm.isTest
                )
                count++
            }

            saveQueue(plan.newEntries)
            Log.d(TAG, "Batch replaced queue with ${plan.newEntries.size} entries, scheduled $count alarms.")
            return count
        }
    }

    fun chainNext(prayerName: String): Long? {
        synchronized(lock) {
            val current = readQueue()
            val nowMs = System.currentTimeMillis()
            val plan = PrayerQueueEngine.planChainNext(current, prayerName, nowMs)

            saveQueue(plan.newEntries)

            val nextAlarm = plan.alarmsToSet.firstOrNull()
            if (nextAlarm != null) {
                AdhanAlarmScheduler.scheduleExactAlarm(
                    context,
                    nextAlarm.prayerName,
                    nextAlarm.timestampMs,
                    nextAlarm.isFajr,
                    nextAlarm.isTest
                )
                Log.d(TAG, "Chained next alarm for ${nextAlarm.prayerName} at ${nextAlarm.timestampMs}")
                return nextAlarm.timestampMs
            }
            return null
        }
    }

    fun restoreAll(): Int {
        synchronized(lock) {
            val current = readQueue()
            val nowMs = System.currentTimeMillis()
            val plan = PrayerQueueEngine.planRestoreAll(current, nowMs)

            saveQueue(plan.newEntries)

            var count = 0
            for (alarm in plan.alarmsToSet) {
                AdhanAlarmScheduler.scheduleExactAlarm(
                    context,
                    alarm.prayerName,
                    alarm.timestampMs,
                    alarm.isFajr,
                    alarm.isTest
                )
                count++
            }
            Log.d(TAG, "Restored $count alarms on boot/clock change.")
            return count
        }
    }
}
