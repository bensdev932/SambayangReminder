const {
  withAndroidManifest,
  withMainApplication,
  withMainActivity,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin for Sambayang Reminder True Alarm Clock & Background Adhan Playback.
 * Configures:
 * 1. AndroidManifest permissions: REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, RECEIVE_BOOT_COMPLETED, USE_FULL_SCREEN_INTENT, etc.
 * 2. ForegroundService (mediaPlayback), AlarmReceiver, BootReceiver, and MainActivity lockscreen wake attributes.
 * 3. Registers native AdhanAlarmPackage in MainApplication.kt.
 * 4. Configures MainActivity.kt to wake screen and show over lockscreen.
 * 5. Ensures native Kotlin sources are copied into android/app/src/main/java/com/ben/adhanprayerreminder/adhan/.
 */
const withAdhanAlarm = (config) => {
  // 1. AndroidManifest.xml modifications
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure permissions
    const requiredPermissions = [
      'android.permission.SCHEDULE_EXACT_ALARM',
      'android.permission.USE_EXACT_ALARM',
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.WAKE_LOCK',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ];

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const existingPermissions = new Set(
      manifest['uses-permission'].map((p) => p.$['android:name'])
    );

    for (const permission of requiredPermissions) {
      if (!existingPermissions.has(permission)) {
        manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    }

    // Ensure application services and receivers
    const application = manifest.application?.[0];
    if (application) {
      if (!application.service) application.service = [];
      if (!application.receiver) application.receiver = [];

      // Configure MainActivity attributes to allow showing over lockscreen & waking display
      if (application.activity) {
        for (const act of application.activity) {
          if (
            act.$['android:name'] === '.MainActivity' ||
            act.$['android:name'] === 'com.ben.adhanprayerreminder.MainActivity'
          ) {
            act.$['android:showWhenLocked'] = 'true';
            act.$['android:turnScreenOn'] = 'true';
          }
        }
      }

      // Check if AdhanPlaybackService already exists
      const hasPlaybackService = application.service.some(
        (s) => s.$['android:name'] === '.adhan.AdhanPlaybackService'
      );
      if (!hasPlaybackService) {
        application.service.push({
          $: {
            'android:name': '.adhan.AdhanPlaybackService',
            'android:exported': 'false',
            'android:foregroundServiceType': 'mediaPlayback',
          },
        });
      }

      // Check if AdhanAlarmReceiver already exists
      const hasAlarmReceiver = application.receiver.some(
        (r) => r.$['android:name'] === '.adhan.AdhanAlarmReceiver'
      );
      if (!hasAlarmReceiver) {
        application.receiver.push({
          $: {
            'android:name': '.adhan.AdhanAlarmReceiver',
            'android:exported': 'false',
          },
        });
      }

      // Check if AdhanBootReceiver already exists
      const bootActions = [
        { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
        { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
        { $: { 'android:name': 'android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED' } },
        { $: { 'android:name': 'android.intent.action.TIME_SET' } },
        { $: { 'android:name': 'android.intent.action.TIMEZONE_CHANGED' } },
      ];

      const existingBootReceiver = application.receiver.find(
        (r) => r.$['android:name'] === '.adhan.AdhanBootReceiver'
      );
      if (!existingBootReceiver) {
        application.receiver.push({
          $: {
            'android:name': '.adhan.AdhanBootReceiver',
            'android:exported': 'true',
          },
          'intent-filter': [{ action: bootActions }],
        });
      } else {
        existingBootReceiver['intent-filter'] = [{ action: bootActions }];
      }
    }

    return config;
  });

  // 2. MainApplication.kt registration
  config = withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    const importStatement = 'import com.ben.adhanprayerreminder.adhan.AdhanAlarmPackage';
    if (!contents.includes(importStatement)) {
      contents = contents.replace(
        'import expo.modules.ExpoReactHostFactory',
        `import expo.modules.ExpoReactHostFactory\n${importStatement}`
      );
    }

    const packageRegistration = 'add(AdhanAlarmPackage())';
    if (!contents.includes(packageRegistration)) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        `PackageList(this).packages.apply {\n          ${packageRegistration}`
      );
    }

    config.modResults.contents = contents;
    return config;
  });

  // 3. MainActivity.kt lockscreen display and screen wake configuration
  config = withMainActivity(config, (config) => {
    let contents = config.modResults.contents;

    const buildImport = 'import android.os.Build\nimport android.view.WindowManager';
    if (!contents.includes('android.os.Build')) {
      if (contents.includes('import android.os.Bundle')) {
        contents = contents.replace(
          'import android.os.Bundle',
          `import android.os.Bundle\n${buildImport}`
        );
      } else {
        contents = `${buildImport}\n${contents}`;
      }
    }

    const wakeLockLogic = `
    // Enable lockscreen display and turn screen on for Adhan prayer alarms
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
      )
    }`;

    if (!contents.includes('setShowWhenLocked(true)')) {
      if (contents.includes('super.onCreate(null)')) {
        contents = contents.replace(
          'super.onCreate(null)',
          `super.onCreate(null)\n${wakeLockLogic}`
        );
      } else if (contents.includes('super.onCreate(savedInstanceState)')) {
        contents = contents.replace(
          'super.onCreate(savedInstanceState)',
          `super.onCreate(savedInstanceState)\n${wakeLockLogic}`
        );
      }
    }

    config.modResults.contents = contents;
    return config;
  });

  // 4. Ensure native Kotlin source files exist
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const targetDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'ben',
        'adhanprayerreminder',
        'adhan'
      );

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Copy native Kotlin source templates from tracked plugins/native-adhan directory
      const sourceDir = path.join(projectRoot, 'plugins', 'native-adhan');
      if (fs.existsSync(sourceDir)) {
        const files = fs.readdirSync(sourceDir);
        for (const file of files) {
          fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
        }
      }

      return config;
    },
  ]);

  return config;
};

module.exports = withAdhanAlarm;
