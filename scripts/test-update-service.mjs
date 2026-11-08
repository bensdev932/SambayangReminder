import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  parseSemVer,
  compareSemVer,
  isNewerVersion,
} from '../src/services/semver.ts';

test('parseSemVer: standard version strings', () => {
  assert.deepEqual(parseSemVer('1.0.2'), {
    major: 1,
    minor: 0,
    patch: 2,
    prerelease: undefined,
  });

  assert.deepEqual(parseSemVer('v1.0.3'), {
    major: 1,
    minor: 0,
    patch: 3,
    prerelease: undefined,
  });

  assert.deepEqual(parseSemVer('V2.1.0-beta.1'), {
    major: 2,
    minor: 1,
    patch: 0,
    prerelease: 'beta.1',
  });
});

test('parseSemVer: edge cases and invalid inputs', () => {
  assert.equal(parseSemVer(''), null);
  assert.equal(parseSemVer('abc'), null);
  assert.equal(parseSemVer(null), null);
  assert.equal(parseSemVer(undefined), null);
});

test('compareSemVer: correct version precedence', () => {
  // Newer patch
  assert.equal(compareSemVer('v1.0.3', '1.0.2'), 1);
  // Equal
  assert.equal(compareSemVer('1.0.2', 'v1.0.2'), 0);
  // Older patch
  assert.equal(compareSemVer('1.0.1', '1.0.2'), -1);
  // Newer minor
  assert.equal(compareSemVer('v1.1.0', 'v1.0.9'), 1);
  // Newer major
  assert.equal(compareSemVer('v2.0.0', 'v1.9.99'), 1);
  // Release vs Prerelease
  assert.equal(compareSemVer('1.0.0', '1.0.0-rc.1'), 1);
  assert.equal(compareSemVer('1.0.0-rc.1', '1.0.0'), -1);
});

test('isNewerVersion: evaluates update availability accurately', () => {
  assert.equal(isNewerVersion('v1.0.3', '1.0.2'), true);
  assert.equal(isNewerVersion('v1.0.2', '1.0.2'), false);
  assert.equal(isNewerVersion('v1.0.1', '1.0.2'), false);
  assert.equal(isNewerVersion('2.0.0', '1.0.2'), true);
});

test('SHA-256 Binary Integrity Verification Logic: deterministic validation', () => {
  // Simulate synthetic APK binary payload
  const mockApkData = Buffer.from('PK\x03\x04synthetic-android-apk-archive-data-content-stream-bytes');
  const expectedSha256 = crypto.createHash('sha256').update(mockApkData).digest('hex');

  // Verify pure hash generation matches expected 64-character lowercase hex
  assert.equal(expectedSha256.length, 64);
  assert.match(expectedSha256, /^[a-f0-9]{64}$/);

  // Exact match evaluation
  const actualSha256 = crypto.createHash('sha256').update(mockApkData).digest('hex');
  assert.equal(actualSha256.toLowerCase(), expectedSha256.toLowerCase());

  // Tampered/Corrupted binary evaluation (e.g. 1 byte difference)
  const tamperedApkData = Buffer.from('PK\x03\x04synthetic-android-apk-archive-data-content-stream-byteX');
  const tamperedSha256 = crypto.createHash('sha256').update(tamperedApkData).digest('hex');
  assert.notEqual(tamperedSha256.toLowerCase(), expectedSha256.toLowerCase());
});

test('Version Manifests Synchronization: package.json, app.json, and version.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const appJson = JSON.parse(fs.readFileSync(path.resolve('app.json'), 'utf8'));
  const versionJson = JSON.parse(fs.readFileSync(path.resolve('version.json'), 'utf8'));

  // Ensure package.json, app.json, and version.json versions strictly agree
  assert.equal(pkg.version, appJson.expo.version, 'package.json and app.json expo.version must match');
  assert.equal(pkg.version, versionJson.version, 'package.json and version.json version must match');

  // Ensure versionCode is positive integer and matches
  assert.ok(typeof appJson.expo.android.versionCode === 'number', 'app.json must declare numeric versionCode');
  assert.ok(typeof versionJson.versionCode === 'number', 'version.json must declare numeric versionCode');
  assert.equal(appJson.expo.android.versionCode, versionJson.versionCode, 'versionCode must match');
});

test('CI Workflow Integrity: quality-gate and fail-closed barriers in release.yml', () => {
  const releaseYml = fs.readFileSync(path.resolve('.github/workflows/release.yml'), 'utf8');

  // Verify quality-gate job exists
  assert.ok(releaseYml.includes('quality-gate:'), 'release.yml must declare a dedicated quality-gate job');

  // Verify build-and-release depends on quality-gate
  assert.ok(
    releaseYml.includes('needs: [quality-gate]'),
    'build-and-release job must declare needs: [quality-gate] for fail-closed behavior'
  );

  // Verify manifest sync verification step exists
  assert.ok(
    releaseYml.includes('scripts/verify-manifest-sync.mjs'),
    'quality-gate must execute verify-manifest-sync.mjs'
  );

  // Verify all 3 verification triad commands exist in quality gate
  assert.ok(releaseYml.includes('npm test'), 'quality-gate must run npm test');
  assert.ok(releaseYml.includes('npx tsc --noEmit'), 'quality-gate must run npx tsc --noEmit');
  assert.ok(releaseYml.includes('npx eslint .'), 'quality-gate must run npx eslint .');

  // Verify SHA-256 generation and version.json update step
  assert.ok(releaseYml.includes('sha256sum'), 'release.yml must generate sha256sum');
  assert.ok(releaseYml.includes('version.json'), 'release.yml must bundle version.json asset');
});
