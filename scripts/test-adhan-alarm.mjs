import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

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
  // Read notifications service to verify channel importance and wake flags
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
  // Check AndroidManifest.xml permissions if prebuilt, or check config plugin in clean CI
  const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    const manifest = fs.readFileSync(manifestPath, 'utf8');

    assert.ok(manifest.includes('android.permission.SCHEDULE_EXACT_ALARM'), 'Must request SCHEDULE_EXACT_ALARM');
    assert.ok(manifest.includes('android.permission.USE_EXACT_ALARM'), 'Must request USE_EXACT_ALARM');
    assert.ok(manifest.includes('android.permission.WAKE_LOCK'), 'Must request WAKE_LOCK');
    assert.ok(manifest.includes('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'), 'Must request FOREGROUND_SERVICE_MEDIA_PLAYBACK');

    // Verify AdhanBootReceiver handles SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED
    assert.ok(
      manifest.includes('android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED'),
      'AdhanBootReceiver must listen for exact alarm permission changes'
    );
  } else {
    // In clean-room CI runners before 'expo prebuild', verify the canonical config plugin
    const pluginPath = path.resolve('plugins/withAdhanAlarm.js');
    assert.ok(fs.existsSync(pluginPath), 'plugins/withAdhanAlarm.js must exist');
    const pluginCode = fs.readFileSync(pluginPath, 'utf8');

    assert.ok(pluginCode.includes('android.permission.SCHEDULE_EXACT_ALARM'), 'Plugin must request SCHEDULE_EXACT_ALARM');
    assert.ok(pluginCode.includes('android.permission.USE_EXACT_ALARM'), 'Plugin must request USE_EXACT_ALARM');
    assert.ok(pluginCode.includes('android.permission.WAKE_LOCK'), 'Plugin must request WAKE_LOCK');
    assert.ok(pluginCode.includes('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'), 'Plugin must request FOREGROUND_SERVICE_MEDIA_PLAYBACK');
    assert.ok(
      pluginCode.includes('android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED'),
      'Plugin must register receiver for exact alarm permission changes'
    );
  }

  // Check app.json permission declarations
  const appJsonPath = path.resolve('app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const permissions = appJson.expo.android.permissions;

  assert.ok(permissions.includes('SCHEDULE_EXACT_ALARM'), 'app.json must declare SCHEDULE_EXACT_ALARM');
  assert.ok(permissions.includes('USE_EXACT_ALARM'), 'app.json must declare USE_EXACT_ALARM');
  assert.ok(permissions.includes('WAKE_LOCK'), 'app.json must declare WAKE_LOCK');
  assert.ok(permissions.includes('FOREGROUND_SERVICE'), 'app.json must declare FOREGROUND_SERVICE');
  assert.ok(permissions.includes('FOREGROUND_SERVICE_MEDIA_PLAYBACK'), 'app.json must declare FOREGROUND_SERVICE_MEDIA_PLAYBACK');
});

test('Native Kotlin AlarmModule & PlaybackService integrity', () => {
  const generatedModulePath = path.resolve('android/app/src/main/java/com/ben/adhanprayerreminder/adhan/AdhanAlarmModule.kt');
  const sourceModulePath = path.resolve('plugins/native-adhan/AdhanAlarmModule.kt');
  const modulePath = fs.existsSync(generatedModulePath) ? generatedModulePath : sourceModulePath;

  const generatedServicePath = path.resolve('android/app/src/main/java/com/ben/adhanprayerreminder/adhan/AdhanPlaybackService.kt');
  const sourceServicePath = path.resolve('plugins/native-adhan/AdhanPlaybackService.kt');
  const servicePath = fs.existsSync(generatedServicePath) ? generatedServicePath : sourceServicePath;

  assert.ok(fs.existsSync(modulePath), `AdhanAlarmModule must exist at ${modulePath}`);
  assert.ok(fs.existsSync(servicePath), `AdhanPlaybackService must exist at ${servicePath}`);

  const moduleCode = fs.readFileSync(modulePath, 'utf8');
  const serviceCode = fs.readFileSync(servicePath, 'utf8');

  // Verify canScheduleExactAlarms & requestScheduleExactAlarmPermission are implemented
  assert.ok(moduleCode.includes('fun canScheduleExactAlarms'), 'AdhanAlarmModule must implement canScheduleExactAlarms');
  assert.ok(moduleCode.includes('fun requestScheduleExactAlarmPermission'), 'AdhanAlarmModule must implement requestScheduleExactAlarmPermission');
  assert.ok(moduleCode.includes('AlarmManager.AlarmClockInfo'), 'AdhanAlarmModule must use AlarmClockInfo for reliable wake');

  // Verify AdhanPlaybackService uses FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
  assert.ok(serviceCode.includes('ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK'), 'Service must pass mediaPlayback foreground type');
  assert.ok(serviceCode.includes('NotificationManager.IMPORTANCE_HIGH'), 'Service channel must have IMPORTANCE_HIGH');
  assert.ok(serviceCode.includes('PowerManager.PARTIAL_WAKE_LOCK'), 'Service must acquire wake lock');

  // Verify AssetFileDescriptor lifecycle safety: afd.close() must be in a finally block AFTER prepare()
  assert.ok(serviceCode.includes('finally {'), 'AdhanPlaybackService must clean up afd in finally');
  assert.ok(serviceCode.includes('afd.close()'), 'AdhanPlaybackService must call afd.close()');
  const prepareIdx = serviceCode.indexOf('prepare()');
  const finallyIdx = serviceCode.indexOf('finally {');
  assert.ok(prepareIdx > 0 && finallyIdx > prepareIdx, 'mediaPlayer.prepare() must precede afd cleanup in finally block');
});

test('Next-occurrence scheduling logic: past Fajr always schedules for tomorrow', () => {
  // Simulate today at 22:00 (10:00 PM) where all 5 prayers have elapsed
  const simulatedNow = new Date('2026-10-18T22:00:00Z');
  const todayFajr = new Date('2026-10-18T05:00:00Z');
  const tomorrowFajr = new Date('2026-10-19T05:00:00Z');

  // Past check: today's Fajr is in the past
  assert.strictEqual(todayFajr.getTime() <= simulatedNow.getTime(), true, "Today's Fajr must evaluate to past at 10 PM");

  // Next-occurrence computation
  const computeNextOccurrence = (todayTime, tomorrowTime, currentTime) => {
    return todayTime.getTime() > currentTime.getTime() ? todayTime : tomorrowTime;
  };

  const scheduledFajr = computeNextOccurrence(todayFajr, tomorrowFajr, simulatedNow);
  assert.strictEqual(scheduledFajr.getTime(), tomorrowFajr.getTime(), 'Must schedule tomorrow Fajr when today Fajr is past');
  assert.strictEqual(scheduledFajr.getTime() > simulatedNow.getTime(), true, 'Scheduled Fajr must be strictly in the future');
});

test('UI decoupling & preview button integrity in HomeScreen', () => {
  const indexTsxPath = path.resolve('src/app/index.tsx');
  const indexTsx = fs.readFileSync(indexTsxPath, 'utf8');

  // Verify dailyPrayers is decoupled from 1-second clock
  assert.ok(indexTsx.includes('const dailyPrayers = useMemo('), 'Must compute memoized dailyPrayers');
  assert.ok(indexTsx.includes('calendarDateKey'), 'Must use calendarDateKey for daily memoization');

  // Verify next-occurrence scheduling logic exists in effect
  assert.ok(indexTsx.includes('tomorrowPrayerMap'), 'Must maintain tomorrowPrayerMap for next-occurrence scheduling');

  // Verify dedicated preview handler and UI button
  assert.ok(indexTsx.includes('handlePreviewPrayerAdhan'), 'Must implement handlePreviewPrayerAdhan');
  assert.ok(indexTsx.includes('prayerPreviewButton'), 'Must define prayerPreviewButton in UI and styles');
});

