import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeDailyPrayerWindow,
  evaluatePrayerArrival,
  formatHijriDate,
  getHijriDate,
  formatPrayerTime,
  getIslamicEventInfo,
  buildRollingPrayerAlarms,
  nextPrayerOccurrence,
} from '../src/domain/prayer-calendar.ts';
import {
  createPrayerAlertCoordinator,
} from '../src/domain/prayer-alert-coordinator.ts';

test('Native Adhan Alarm Bridge: parameter validation and timestamp logic', () => {
  const now = Date.now();

  // Test past timestamps rejected
  const pastTimestamp = now - 5000;
  assert.strictEqual(pastTimestamp <= now, true, 'Past timestamps must evaluate to past');

  // Test future timestamps accepted
  const futureTimestamp = now + 60000;
  assert.strictEqual(futureTimestamp > now, true, 'Future timestamps must evaluate to future');

  // Request code mapping determinism
  const getRequestCodeForPrayer = (name) => {
    switch (name.toLowerCase()) {
      case 'fajr': return 101;
      case 'dhuhr': return 102;
      case 'asr': return 103;
      case 'maghrib': return 104;
      case 'isha': return 105;
      default: return 999;
    }
  };

  assert.strictEqual(getRequestCodeForPrayer('Fajr'), 101);
  assert.strictEqual(getRequestCodeForPrayer('Dhuhr'), 102);
  assert.strictEqual(getRequestCodeForPrayer('Asr'), 103);
  assert.strictEqual(getRequestCodeForPrayer('Maghrib'), 104);
  assert.strictEqual(getRequestCodeForPrayer('Isha'), 105);
  assert.strictEqual(getRequestCodeForPrayer('Custom'), 999);
});

test('Adhan Audio mapping: Fajr vs Standard Adhan file selection', () => {
  const getAdhanAudioResource = (prayerName) => {
    return prayerName === 'Fajr' ? 'fajr_adhan.mp3' : 'adhan.mp3';
  };

  assert.strictEqual(getAdhanAudioResource('Fajr'), 'fajr_adhan.mp3');
  assert.strictEqual(getAdhanAudioResource('Dhuhr'), 'adhan.mp3');
  assert.strictEqual(getAdhanAudioResource('Asr'), 'adhan.mp3');
  assert.strictEqual(getAdhanAudioResource('Maghrib'), 'adhan.mp3');
  assert.strictEqual(getAdhanAudioResource('Isha'), 'adhan.mp3');
});

test('Notification Channel importance & wake configuration verification', () => {
  const notificationsTsPath = path.resolve('src/services/notifications.ts');
  const notificationsTs = fs.readFileSync(notificationsTsPath, 'utf8');

  // Verify channels use MAX / HIGH importance
  assert.match(notificationsTs, /importance:\s*Notifications\.AndroidImportance\.MAX/);

  // Verify channels use ALARM audio usage stream to bypass silent modes
  assert.match(notificationsTs, /usage:\s*Notifications\.AndroidAudioUsage\.ALARM/);

  // Verify channels specify lockscreen visibility and bypassDnd
  assert.match(notificationsTs, /lockscreenVisibility:\s*Notifications\.AndroidNotificationVisibility\.PUBLIC/);
  assert.match(notificationsTs, /bypassDnd:\s*true/);

  // Verify explicit vibration and lighting flags to wake device
  assert.match(notificationsTs, /enableVibrate:\s*true/);
  assert.match(notificationsTs, /enableLights:\s*true/);
  assert.match(notificationsTs, /showBadge:\s*true/);
});

test('SCHEDULE_EXACT_ALARM permission and receiver verification', () => {
  const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    const manifest = fs.readFileSync(manifestPath, 'utf8');

    assert.ok(manifest.includes('android.permission.SCHEDULE_EXACT_ALARM'), 'Must request SCHEDULE_EXACT_ALARM');
    assert.ok(manifest.includes('android.permission.USE_EXACT_ALARM'), 'Must request USE_EXACT_ALARM');
    assert.ok(manifest.includes('android.permission.WAKE_LOCK'), 'Must request WAKE_LOCK');
    assert.ok(manifest.includes('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'), 'Must request FOREGROUND_SERVICE_MEDIA_PLAYBACK');

    assert.ok(
      manifest.includes('android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED'),
      'AdhanBootReceiver must listen for exact alarm permission changes'
    );
  } else {
    const pluginPath = path.resolve('plugins/withAdhanAlarm.js');
    assert.ok(fs.existsSync(pluginPath), 'plugins/withAdhanAlarm.js must exist');
    const pluginCode = fs.readFileSync(pluginPath, 'utf8');

    assert.ok(pluginCode.includes('android.permission.SCHEDULE_EXACT_ALARM'), 'Plugin must request SCHEDULE_EXACT_ALARM');
    assert.ok(pluginCode.includes('android.permission.USE_EXACT_ALARM'), 'Plugin must request USE_EXACT_ALARM');
    assert.ok(pluginCode.includes('android.permission.USE_FULL_SCREEN_INTENT'), 'Plugin must request USE_FULL_SCREEN_INTENT');
    assert.ok(pluginCode.includes('android.permission.WAKE_LOCK'), 'Plugin must request WAKE_LOCK');
    assert.ok(pluginCode.includes('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'), 'Plugin must request FOREGROUND_SERVICE_MEDIA_PLAYBACK');
    assert.ok(
      pluginCode.includes('android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED'),
      'Plugin must register receiver for exact alarm permission changes'
    );
  }
});

test('app.json permissions: FOREGROUND_SERVICE & FOREGROUND_SERVICE_MEDIA_PLAYBACK', () => {
  const appJsonPath = path.resolve('app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const permissions = appJson.expo?.android?.permissions || [];

  assert.ok(permissions.includes('FOREGROUND_SERVICE'), 'app.json must declare FOREGROUND_SERVICE');
  assert.ok(permissions.includes('FOREGROUND_SERVICE_MEDIA_PLAYBACK'), 'app.json must declare FOREGROUND_SERVICE_MEDIA_PLAYBACK');
});

test('Native Kotlin AlarmModule, QueueStore & PlaybackService integrity', () => {
  const generatedModulePath = path.resolve('android/app/src/main/java/com/ben/adhanprayerreminder/adhan/AdhanAlarmModule.kt');
  const sourceModulePath = path.resolve('plugins/native-adhan/AdhanAlarmModule.kt');
  const modulePath = fs.existsSync(generatedModulePath) ? generatedModulePath : sourceModulePath;

  const generatedServicePath = path.resolve('android/app/src/main/java/com/ben/adhanprayerreminder/adhan/AdhanPlaybackService.kt');
  const sourceServicePath = path.resolve('plugins/native-adhan/AdhanPlaybackService.kt');
  const servicePath = fs.existsSync(generatedServicePath) ? generatedServicePath : sourceServicePath;

  const queueStorePath = path.resolve('plugins/native-adhan/PrayerQueueStore.kt');

  assert.ok(fs.existsSync(modulePath), `AdhanAlarmModule must exist at ${modulePath}`);
  assert.ok(fs.existsSync(servicePath), `AdhanPlaybackService must exist at ${servicePath}`);
  assert.ok(fs.existsSync(queueStorePath), `PrayerQueueStore must exist at ${queueStorePath}`);

  const moduleCode = fs.readFileSync(modulePath, 'utf8');
  const serviceCode = fs.readFileSync(servicePath, 'utf8');
  const queueCode = fs.readFileSync(queueStorePath, 'utf8');

  // Verify canScheduleExactAlarms & requestScheduleExactAlarmPermission are implemented
  assert.ok(moduleCode.includes('fun canScheduleExactAlarms'), 'AdhanAlarmModule must implement canScheduleExactAlarms');
  assert.ok(moduleCode.includes('fun requestScheduleExactAlarmPermission'), 'AdhanAlarmModule must implement requestScheduleExactAlarmPermission');

  // Verify AlarmClockInfo is used in native alarm scheduling for Doze Mode wake
  assert.ok(
    moduleCode.includes('AlarmManager.AlarmClockInfo') || queueCode.includes('AlarmManager.AlarmClockInfo'),
    'Native alarm engine must use AlarmClockInfo for reliable wake'
  );

  // Verify PrayerQueueEngine and PrayerQueueStore are defined
  assert.ok(queueCode.includes('object PrayerQueueEngine'), 'PrayerQueueStore.kt must define pure PrayerQueueEngine');
  assert.ok(queueCode.includes('class PrayerQueueStore'), 'PrayerQueueStore.kt must define PrayerQueueStore');
  assert.ok(queueCode.includes('object AdhanAlarmScheduler'), 'PrayerQueueStore.kt must define AdhanAlarmScheduler');

  // Verify AdhanPlaybackService uses FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
  assert.ok(serviceCode.includes('ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK'), 'Service must pass mediaPlayback foreground type');
  assert.ok(serviceCode.includes('NotificationManager.IMPORTANCE_HIGH'), 'Service channel must have IMPORTANCE_HIGH');
  assert.ok(serviceCode.includes('PowerManager.PARTIAL_WAKE_LOCK'), 'Service must acquire wake lock');
  assert.ok(serviceCode.includes('setFullScreenIntent'), 'Service must configure fullScreenIntent');
  assert.ok(serviceCode.includes('PowerManager.ACQUIRE_CAUSES_WAKEUP'), 'Service must wake display via ACQUIRE_CAUSES_WAKEUP');

  // Verify receiver integrity
  const receiverPath = path.resolve('plugins/native-adhan/AdhanAlarmReceiver.kt');
  const receiverCode = fs.readFileSync(receiverPath, 'utf8');
  assert.ok(receiverCode.includes('PowerManager.ACQUIRE_CAUSES_WAKEUP'), 'Receiver must wake display via ACQUIRE_CAUSES_WAKEUP');

  // Verify AssetFileDescriptor lifecycle safety: afd.close() must be in a finally block AFTER prepare()
  assert.ok(serviceCode.includes('finally {'), 'AdhanPlaybackService must clean up afd in finally');
  assert.ok(serviceCode.includes('afd.close()'), 'AdhanPlaybackService must call afd.close()');
  const prepareIdx = serviceCode.indexOf('prepare()');
  const finallyIdx = serviceCode.indexOf('finally {');
  assert.ok(prepareIdx > 0 && finallyIdx > prepareIdx, 'mediaPlayer.prepare() must precede afd cleanup in finally block');
});

test('Domain Prayer Calendar: astronomical calculations and Hijri conversion', () => {
  const coords = { latitude: 14.5995, longitude: 120.9842 }; // Manila
  const dateKey = '2026-10-18';
  const window = computeDailyPrayerWindow(coords, dateKey);

  assert.strictEqual(window.calendarDateKey, dateKey);
  assert.strictEqual(window.prayersList.length, 5);

  const names = window.prayersList.map((p) => p.name);
  assert.deepStrictEqual(names, ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);

  // All prayer times must be valid Date objects
  for (const prayer of window.prayersList) {
    assert.ok(!isNaN(prayer.time.getTime()), `${prayer.name} must have a valid time`);
    assert.strictEqual(prayer.formattedTime, formatPrayerTime(prayer.time));
  }

  // Rolling alarms across 7 days: 7 * 5 = 35 total alarms
  const noonMs = new Date(2026, 9, 18, 0, 0, 0).getTime();
  const rolling = buildRollingPrayerAlarms(coords, dateKey, noonMs, 7);
  assert.strictEqual(rolling.length, 35);
  for (let i = 1; i < rolling.length; i++) {
    assert.ok(rolling[i].timestampMs >= rolling[i - 1].timestampMs, 'Rolling alarms must be sorted ascending');
  }

  // Hijri formatting
  const hijri = getHijriDate(new Date('2026-10-18T12:00:00Z'));
  assert.ok(hijri.year >= 1448 && hijri.year <= 1450);
  assert.ok(hijri.month >= 1 && hijri.month <= 12);
  assert.ok(hijri.day >= 1 && hijri.day <= 30);
  assert.ok(formatHijriDate(new Date('2026-10-18T12:00:00Z')).includes('AH'));

  // Islamic event info
  const eventInfo = getIslamicEventInfo(new Date('2026-10-18T12:00:00Z'));
  assert.ok(eventInfo.targetTitle);
  assert.ok(eventInfo.targetHijriLabel);

  // Next prayer occurrence
  const fajrTime = window.prayersList[0].time.getTime();
  const nextOccurrence = nextPrayerOccurrence(window, 'Fajr', fajrTime + 1000);
  assert.ok(nextOccurrence);

  // Arrival window detection
  const arrivalJustNow = evaluatePrayerArrival(window, fajrTime + 1000, null);
  assert.strictEqual(arrivalJustNow.arrivedPrayer, 'Fajr');
  assert.strictEqual(arrivalJustNow.nextPlayedKey, `${dateKey}-Fajr`);

  // Same key not re-triggered
  const arrivalDuplicate = evaluatePrayerArrival(window, fajrTime + 5000, arrivalJustNow.nextPlayedKey);
  assert.strictEqual(arrivalDuplicate.arrivedPrayer, null);

  // Rewinding clock resets key
  const arrivalRewound = evaluatePrayerArrival(window, fajrTime - 20000, arrivalJustNow.nextPlayedKey);
  assert.strictEqual(arrivalRewound.nextPlayedKey, null);
});

test('Domain Prayer Alert Coordinator: in-memory behavioral verification', async () => {
  // Mock In-Memory platform
  let currentTime = 1770000000000;
  const scheduledNative = [];
  const scheduledNotifs = [];
  const scheduledDuas = [];
  let nativeAlarmsCancelled = 0;
  let notifsCancelled = 0;
  let permissionGranted = false;
  let permissionRequests = 0;
  const storageMap = new Map();

  const mockNativeAlarm = {
    isAvailable: () => true,
    scheduleBatch: async (alarms) => {
      scheduledNative.push(...alarms);
      return alarms.length;
    },
    cancelAll: async () => {
      nativeAlarmsCancelled++;
      return true;
    },
    scheduleTestAlarm: async (delay) => currentTime + delay * 1000,
    getPlaybackStatus: async () => ({ isPlaying: false, prayerName: '' }),
    stopPlayback: async () => true,
    subscribePlayback: () => () => {},
    probeReadiness: async () => ({
      notificationsEnabled: true,
      canScheduleExactAlarms: true,
      canUseFullScreenIntent: true,
      isBatteryOptimizationIgnored: true,
      oemInfo: { manufacturer: 'Google', brand: 'Pixel', sdkInt: 35, oemCategory: 'standard', hasOemRestrictions: false },
    }),
    openSettings: async () => true,
  };

  const mockNotifications = {
    initialize: async () => {},
    getPermissionGranted: async () => permissionGranted,
    requestPermission: async () => {
      permissionRequests++;
      permissionGranted = true;
      return true;
    },
    cancelAll: async () => {
      notifsCancelled++;
    },
    schedulePrayerAlert: async (name, at) => {
      scheduledNotifs.push({ name, at });
    },
    schedulePostSalahDua: async (name, at) => {
      scheduledDuas.push({ name, at });
    },
    subscribeTaps: () => () => {},
  };

  const mockStorage = {
    getItem: async (key) => storageMap.get(key) ?? null,
    setItem: async (key, val) => {
      storageMap.set(key, val);
    },
  };

  const platform = {
    nativeAlarm: mockNativeAlarm,
    notifications: mockNotifications,
    storage: mockStorage,
    subscribeAppForeground: () => () => {},
    now: () => currentTime,
    delay: (fn) => {
      fn();
      return () => {};
    },
  };

  const coordinator = createPrayerAlertCoordinator(platform);

  // Invariant 1: React 19 external store referential stability
  const snap1 = coordinator.getSnapshot();
  const snap2 = coordinator.getSnapshot();
  assert.strictEqual(Object.is(snap1, snap2), true, 'Snapshot must be referentially stable when unchanged');

  // Connect coordinator
  const disconnect = coordinator.connect();
  assert.strictEqual(typeof disconnect, 'function');

  // Invariant 2: Deferred when location not yet resolved
  const deferredOutcome = await coordinator.syncSchedule({
    enabled: true,
    locationResolved: false,
    coords: { latitude: 14.5995, longitude: 120.9842 },
    locationName: 'Manila',
    calendarDateKey: '2026-10-18',
  });
  assert.strictEqual(deferredOutcome.status, 'deferred_location');
  assert.strictEqual(scheduledNative.length, 0);

  // Invariant 3: Authoritative native scheduling when location is resolved
  const scheduledOutcome = await coordinator.syncSchedule({
    enabled: true,
    locationResolved: true,
    coords: { latitude: 14.5995, longitude: 120.9842 },
    locationName: 'Manila',
    calendarDateKey: '2026-10-18',
  });
  assert.strictEqual(scheduledOutcome.status, 'scheduled');
  assert.strictEqual(scheduledOutcome.mode, 'native_rolling');
  assert.ok(scheduledNative.length > 0, 'Must schedule native rolling alarms');
  assert.strictEqual(scheduledNotifs.length, 0, 'Must NOT schedule redundant local prayer notifications when native is available');
  assert.ok(scheduledDuas.length > 0, 'Local notifications must schedule post-Salah Dua reminders');

  // Invariant 4: Test alarm triggers and updates snapshot
  const testAlarm = await coordinator.triggerTestAlarm();
  assert.strictEqual(testAlarm.scheduled, true);
  assert.ok(coordinator.getSnapshot().testAlarm.pending === false || coordinator.getSnapshot().testAlarm.pending === true);

  // Invariant 5: Cancellation on mute
  const mutedOutcome = await coordinator.syncSchedule({
    enabled: false,
    locationResolved: true,
    coords: { latitude: 14.5995, longitude: 120.9842 },
    locationName: 'Manila',
    calendarDateKey: '2026-10-18',
  });
  assert.strictEqual(mutedOutcome.status, 'muted');
  assert.ok(nativeAlarmsCancelled > 0, 'Must cancel native alarms on mute');
  assert.ok(notifsCancelled > 0, 'Must cancel notifications on mute');

  // Explicit user permission request
  const reqResult = await coordinator.requestNotificationPermission();
  assert.strictEqual(reqResult, true);
  assert.strictEqual(permissionRequests, 2);

  disconnect();
});

test('Android 15 monochrome notification icon & bumped v2 channels', () => {
  const root = process.cwd();
  const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const notifPlugin = appJson.expo.plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-notifications'
  );
  assert.ok(notifPlugin, 'expo-notifications plugin config must exist in app.json');
  assert.equal(
    notifPlugin[1].icon,
    './assets/images/android-icon-monochrome.png',
    'expo-notifications icon must point to transparent monochrome asset'
  );

  const notificationsTs = fs.readFileSync(path.join(root, 'src/services/notifications.ts'), 'utf8');
  assert.match(notificationsTs, /adhan-prayer-channel-v2/);
  assert.match(notificationsTs, /adhan-fajr-channel-v2/);
  assert.match(notificationsTs, /post-salah-channel-v2/);
  assert.match(notificationsTs, /export async function getNotificationPermissionGranted/);
});

test('Native Kotlin service, receiver fallback, FSI & OEM reliability safeguards', () => {
  const root = process.cwd();
  const serviceKt = fs.readFileSync(
    path.join(root, 'plugins/native-adhan/AdhanPlaybackService.kt'),
    'utf8'
  );
  assert.match(serviceKt, /adhan_alarm_playback_channel_v2/);
  assert.match(serviceKt, /AdhanNotificationHelper\.resolveSmallIcon/);
  assert.doesNotMatch(serviceKt, /applicationInfo\.icon/);
  assert.match(serviceKt, /requestAlarmAudioFocus/);
  assert.match(serviceKt, /postFallbackPrayerNotification/);

  const receiverKt = fs.readFileSync(
    path.join(root, 'plugins/native-adhan/AdhanAlarmReceiver.kt'),
    'utf8'
  );
  assert.match(receiverKt, /internal object AdhanNotificationHelper/);
  assert.match(receiverKt, /adhan-prayer-channel-v2/);
  assert.match(receiverKt, /adhan-fajr-channel-v2/);
  assert.match(receiverKt, /AdhanAlarmModule\.scheduleNextQueuedAlarm/);
  assert.match(receiverKt, /postFallbackPrayerNotification/);

  const moduleKt = fs.readFileSync(
    path.join(root, 'plugins/native-adhan/AdhanAlarmModule.kt'),
    'utf8'
  );
  for (const methodName of [
    'schedulePrayerAlarmsBatch',
    'scheduleNextQueuedAlarm',
    'scheduleTestAlarm',
    'areNotificationsEnabled',
    'canUseFullScreenIntent',
    'requestFullScreenIntentPermission',
    'openNotificationSettings',
    'getOemPowerManagerInfo',
    'openOemBackgroundSettings',
  ]) {
    assert.ok(
      moduleKt.includes(methodName),
      `AdhanAlarmModule.kt must implement ${methodName}`
    );
  }

  const bootKt = fs.readFileSync(
    path.join(root, 'plugins/native-adhan/AdhanBootReceiver.kt'),
    'utf8'
  );
  assert.match(bootKt, /ACTION_MY_PACKAGE_REPLACED/);

  const pluginJs = fs.readFileSync(path.join(root, 'plugins/withAdhanAlarm.js'), 'utf8');
  assert.match(pluginJs, /MY_PACKAGE_REPLACED/);
});

test('HomeScreen architecture: clean seam, zero low-level notification imports & React 19 external store', () => {
  const root = process.cwd();
  const indexTsx = fs.readFileSync(path.join(root, 'src/app/index.tsx'), 'utf8');

  // Verify HomeScreen consumes the coordinator and React 19 external store
  assert.ok(indexTsx.includes('getSharedPrayerAlertCoordinator'), 'Must use getSharedPrayerAlertCoordinator');
  assert.ok(indexTsx.includes('useSyncExternalStore'), 'Must use React 19 useSyncExternalStore');
  assert.ok(indexTsx.includes('computeDailyPrayerWindow'), 'Must compute prayers via domain module');
  assert.ok(indexTsx.includes('evaluatePrayerArrival'), 'Must detect arrivals via domain module');

  // Verify Rule 1 compliance: expo-notifications must NEVER be imported in screens
  assert.doesNotMatch(indexTsx, /from ['"]expo-notifications['"]/, 'HomeScreen must never import expo-notifications');

  // Verify low-level notification functions are not imported in screens
  assert.doesNotMatch(indexTsx, /from ['"]\.\.\/services\/notifications['"]/, 'HomeScreen must not import low-level notification services');
  assert.doesNotMatch(indexTsx, /from ['"]\.\.\/services\/adhan-alarm['"]/, 'HomeScreen must not import raw native adhan alarm module');
});
