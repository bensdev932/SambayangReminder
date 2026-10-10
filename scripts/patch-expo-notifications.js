/**
 * Automatic patch for expo-notifications to ensure compatibility with Expo Go on Android (SDK 53+).
 * 
 * In Expo SDK 53+, remote push notifications were removed from Android Expo Go.
 * This script ensures that:
 * 1. warnOfExpoGoPushUsage is silenced to prevent noisy bundle warnings in development.
 * 2. TopicSubscriptionModule.android.js gracefully falls back when ExpoTopicSubscriptionModule native module is not linked.
 * 3. build/index.js top-level dev-client warning is suppressed for clean offline local-notification usage.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const notificationsPkgDir = path.join(projectRoot, 'node_modules', 'expo-notifications');

if (!fs.existsSync(notificationsPkgDir)) {
  process.exit(0);
}

// 1. Patch warnOfExpoGoPushUsage (both build JS and src TS to prevent IDE diagnostics)
const warnFileJs = path.join(notificationsPkgDir, 'build', 'warnOfExpoGoPushUsage.js');
if (fs.existsSync(warnFileJs)) {
  const content = `export const warnOfExpoGoPushUsage = () => {};\n`;
  fs.writeFileSync(warnFileJs, content, 'utf8');
  console.log('[patch-expo-notifications] Patched warnOfExpoGoPushUsage.js successfully.');
}

const warnFileTs = path.join(notificationsPkgDir, 'src', 'warnOfExpoGoPushUsage.ts');
if (fs.existsSync(warnFileTs)) {
  const content = `export const warnOfExpoGoPushUsage = (): void => {};\n`;
  fs.writeFileSync(warnFileTs, content, 'utf8');
  console.log('[patch-expo-notifications] Patched warnOfExpoGoPushUsage.ts successfully.');
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

// 3. Patch index.js to suppress the top-level dev-client warning in Expo Go
const indexFile = path.join(notificationsPkgDir, 'build', 'index.js');
if (fs.existsSync(indexFile)) {
  let content = fs.readFileSync(indexFile, 'utf8');
  if (content.includes("if (isRunningInExpoGo() && !areWeTestingWithJest())")) {
    content = content.replace(
      /if \(isRunningInExpoGo\(\) && !areWeTestingWithJest\(\)\) \{\s*const message = '`expo-notifications` functionality is not fully supported in Expo Go:[^;]*;\s*console\.warn\(message\);\s*\}/g,
      '// [Patched for clean Expo Go development] Warning suppressed for offline local notifications'
    );
    fs.writeFileSync(indexFile, content, 'utf8');
    console.log('[patch-expo-notifications] Patched build/index.js successfully.');
  }
}

// 4. Create expo-module-scripts stub to satisfy internal package tsconfig.json references
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
