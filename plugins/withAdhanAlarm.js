const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin for Sambayang Reminder True Alarm Clock & Background Adhan Playback.
 * Configures:
 * 1. AndroidManifest permissions: REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, RECEIVE_BOOT_COMPLETED, etc.
 * 2. ForegroundService (mediaPlayback), AlarmReceiver, BootReceiver.
 * 3. Registers native AdhanAlarmPackage in MainApplication.kt.
 * 4. Ensures native Kotlin sources are copied into android/app/src/main/java/com/ben/adhanprayerreminder/adhan/.
 */
const withAdhanAlarm = (config) => {
  // 1. AndroidManifest.xml modifications
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure permissions
    const requiredPermissions = [
      'android.permission.SCHEDULE_EXACT_ALARM',
      'android.permission.USE_EXACT_ALARM',
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
      const hasBootReceiver = application.receiver.some(
        (r) => r.$['android:name'] === '.adhan.AdhanBootReceiver'
      );
      if (!hasBootReceiver) {
        application.receiver.push({
          $: {
            'android:name': '.adhan.AdhanBootReceiver',
            'android:exported': 'true',
          },
          'intent-filter': [
            {
              action: [
                { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
                { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
              ],
            },
          ],
        });
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

  // 3. Ensure native Kotlin source files exist
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
