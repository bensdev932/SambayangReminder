/**
 * Automatic patch for expo-notifications to ensure compatibility with Expo Go on Android (SDK 53+).
 * 
 * In Expo SDK 53+, remote push notifications were removed from Android Expo Go.
 * This script ensures that:
 * 1. warnOfExpoGoPushUsage logs a warning instead of throwing an unhandled fatal error on Android Expo Go.
 * 2. TopicSubscriptionModule.android.js gracefully falls back when ExpoTopicSubscriptionModule native module is not linked.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const notificationsPkgDir = path.join(projectRoot, 'node_modules', 'expo-notifications');

if (!fs.existsSync(notificationsPkgDir)) {
  process.exit(0);
}

// 1. Patch warnOfExpoGoPushUsage.js
const warnFile = path.join(notificationsPkgDir, 'build', 'warnOfExpoGoPushUsage.js');
if (fs.existsSync(warnFile)) {
  let content = fs.readFileSync(warnFile, 'utf8');
  if (content.includes("if (Platform.OS === 'android')") && content.includes("throw new Error(message)")) {
    content = content.replace(
      /if \(Platform\.OS === 'android'\) \{\s*throw new Error\(message\);\s*\}\s*else if \(__DEV__\) \{/g,
      'if (__DEV__) {'
    );
    fs.writeFileSync(warnFile, content, 'utf8');
    console.log('[patch-expo-notifications] Patched warnOfExpoGoPushUsage.js successfully.');
  }
}

// 2. Patch TopicSubscriptionModule.android.js
const topicModuleFile = path.join(notificationsPkgDir, 'build', 'TopicSubscriptionModule.android.js');
if (fs.existsSync(topicModuleFile)) {
  let content = fs.readFileSync(topicModuleFile, 'utf8');
  const targetPattern = "export default requireNativeModule('ExpoTopicSubscriptionModule');";
  if (content.includes(targetPattern)) {
    const replacement = `let nativeModule = null;
try {
  nativeModule = requireNativeModule('ExpoTopicSubscriptionModule');
} catch (e) {
  // Fallback for Expo Go where ExpoTopicSubscriptionModule is absent
}

export default nativeModule || {
  addListener: () => {},
  removeListeners: () => {},
  subscribeToTopicAsync: () => Promise.resolve(null),
  unsubscribeFromTopicAsync: () => Promise.resolve(null),
};`;
    content = content.replace(targetPattern, replacement);
    fs.writeFileSync(topicModuleFile, content, 'utf8');
    console.log('[patch-expo-notifications] Patched TopicSubscriptionModule.android.js successfully.');
  }
}

// 3. Create expo-module-scripts stub to satisfy internal package tsconfig.json references
const moduleScriptsDir = path.join(projectRoot, 'node_modules', 'expo-module-scripts');
if (!fs.existsSync(moduleScriptsDir)) {
  fs.mkdirSync(moduleScriptsDir, { recursive: true });
}
const stubPackageJson = path.join(moduleScriptsDir, 'package.json');
if (!fs.existsSync(stubPackageJson)) {
  fs.writeFileSync(stubPackageJson, JSON.stringify({ name: 'expo-module-scripts', version: '1.0.0', main: 'tsconfig.base.json' }, null, 2));
}
const stubTsconfig = path.join(moduleScriptsDir, 'tsconfig.base.json');
if (!fs.existsSync(stubTsconfig)) {
  fs.writeFileSync(stubTsconfig, JSON.stringify({ compilerOptions: { target: 'esnext', module: 'esnext', skipLibCheck: true } }, null, 2));
}

