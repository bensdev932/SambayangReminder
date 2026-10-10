const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to copy Adhan audio assets into native Android res/raw and iOS bundle
 * so they can be played as custom high-priority notification sounds in standalone/dev builds.
 */
const withNotificationSounds = (config) => {
  // Android: copy to android/app/src/main/res/raw/
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const resRawDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'raw'
      );

      if (!fs.existsSync(resRawDir)) {
        fs.mkdirSync(resRawDir, { recursive: true });
      }

      const soundFiles = [
        { src: 'assets/audio/adhan.mp3', dest: 'adhan.mp3' },
        { src: 'assets/audio/fajr_adhan.mp3', dest: 'fajr_adhan.mp3' },
      ];

      for (const { src, dest } of soundFiles) {
        const sourcePath = path.join(projectRoot, src);
        const destPath = path.join(resRawDir, dest);
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, destPath);
          console.log(`[withNotificationSounds] Copied ${src} -> android/app/src/main/res/raw/${dest}`);
        } else {
          console.warn(`[withNotificationSounds] Warning: Audio file not found: ${sourcePath}`);
        }
      }

      return config;
    },
  ]);

  // iOS: copy to iOS project root
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const iosDir = config.modRequest.platformProjectRoot;

      const soundFiles = ['assets/audio/adhan.mp3', 'assets/audio/fajr_adhan.mp3'];
      for (const file of soundFiles) {
        const sourcePath = path.join(projectRoot, file);
        const destPath = path.join(iosDir, path.basename(file));
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, destPath);
          console.log(`[withNotificationSounds] Copied ${file} -> ios/${path.basename(file)}`);
        }
      }

      return config;
    },
  ]);

  return config;
};

module.exports = withNotificationSounds;
