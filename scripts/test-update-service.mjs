import assert from 'node:assert/strict';
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
