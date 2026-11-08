import fs from 'node:fs';
import path from 'node:path';

/**
 * Deterministic Manifest Synchronization Validator
 * Enforces Principle II (Manifest Synchronization Layer) of universal-release-and-ci-guard.
 * Verifies that package.json, app.json, and version.json are 100% synchronized in SemVer and versionCode.
 */

const projectRoot = path.resolve('.');

// 1. Read package.json
const pkgPath = path.join(projectRoot, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error('❌ Missing package.json');
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const pkgVersion = pkg.version;

// 2. Read app.json
const appJsonPath = path.join(projectRoot, 'app.json');
if (!fs.existsSync(appJsonPath)) {
  console.error('❌ Missing app.json');
  process.exit(1);
}
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const appVersion = appJson.expo?.version;
const appVersionCode = appJson.expo?.android?.versionCode;

// 3. Read version.json
const versionJsonPath = path.join(projectRoot, 'version.json');
if (!fs.existsSync(versionJsonPath)) {
  console.error('❌ Missing version.json');
  process.exit(1);
}
const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
const remoteVersion = versionJson.version;
const remoteVersionCode = versionJson.versionCode;

console.log('🔍 Auditing Version Manifest Synchronization:');
console.log(`  • package.json:       v${pkgVersion}`);
console.log(`  • app.json (version): v${appVersion}`);
console.log(`  • app.json (code):    ${appVersionCode}`);
console.log(`  • version.json (ver): v${remoteVersion}`);
console.log(`  • version.json (code):${remoteVersionCode}`);

const errors = [];

if (pkgVersion !== appVersion) {
  errors.push(`Version mismatch: package.json (${pkgVersion}) != app.json (${appVersion})`);
}

if (pkgVersion !== remoteVersion) {
  errors.push(`Version mismatch: package.json (${pkgVersion}) != version.json (${remoteVersion})`);
}

if (!appVersionCode || typeof appVersionCode !== 'number') {
  errors.push('app.json expo.android.versionCode must be a positive integer.');
}

if (!remoteVersionCode || typeof remoteVersionCode !== 'number') {
  errors.push('version.json versionCode must be a positive integer.');
}

if (appVersionCode !== remoteVersionCode) {
  errors.push(`VersionCode mismatch: app.json (${appVersionCode}) != version.json (${remoteVersionCode})`);
}

// Validate SemVer syntax (e.g. 1.0.6)
const semVerRegex = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
if (!semVerRegex.test(pkgVersion)) {
  errors.push(`Invalid SemVer format in package.json: ${pkgVersion}`);
}

if (errors.length > 0) {
  console.error('\n🚨 Manifest Synchronization Failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('\n✅ All version manifests and versionCodes are strictly synchronized!');
process.exit(0);

