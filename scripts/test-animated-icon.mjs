import assert from 'node:assert/strict';
import test from 'node:test';

import { ANIMATED_ICON_CONFIG } from '../src/components/animated-icon.types.ts';

test('ANIMATED_ICON_CONFIG: should be immutable (frozen)', () => {
  assert.equal(Object.isFrozen(ANIMATED_ICON_CONFIG), true);
  assert.throws(
    () => {
      // @ts-expect-error mutating frozen object
      ANIMATED_ICON_CONFIG.defaultDurationMs = 9999;
    },
    {
      name: 'TypeError',
    }
  );
});

test('ANIMATED_ICON_CONFIG: should contain deterministic default constants', () => {
  assert.equal(ANIMATED_ICON_CONFIG.defaultDurationMs, 600);
  assert.equal(ANIMATED_ICON_CONFIG.defaultGlowDurationMs, 240000);
  assert.equal(ANIMATED_ICON_CONFIG.defaultIconSize, 128);
  assert.equal(ANIMATED_ICON_CONFIG.defaultGlowSize, 201);
  assert.equal(ANIMATED_ICON_CONFIG.defaultLogoWidth, 76);
  assert.equal(ANIMATED_ICON_CONFIG.defaultLogoHeight, 71);
  assert.equal(ANIMATED_ICON_CONFIG.defaultBorderRadius, 40);
  assert.equal(ANIMATED_ICON_CONFIG.defaultElasticity, 0.7);
  assert.equal(ANIMATED_ICON_CONFIG.safetyTimeoutMs, 3500);
  assert.equal(ANIMATED_ICON_CONFIG.splashBackgroundColor, '#208AEF');
  assert.deepEqual(ANIMATED_ICON_CONFIG.gradientColors, ['#3C9FFE', '#0274DF']);
});

test('Scale factor computation logic: handles standard and edge-case dimensions', () => {
  const calculateScaleFactor = (scaleFactor, screenHeight) => {
    if (typeof scaleFactor === 'number' && scaleFactor > 0) {
      return scaleFactor;
    }
    const safeHeight = screenHeight > 0 ? screenHeight : 800;
    return safeHeight / ANIMATED_ICON_CONFIG.defaultScaleFactorDenominator;
  };

  // Standard device height (e.g. 810px -> 810 / 90 = 9)
  assert.equal(calculateScaleFactor(undefined, 810), 9);

  // Custom injected scale factor (OCP / DIP)
  assert.equal(calculateScaleFactor(15, 810), 15);

  // Fallback when screenHeight is invalid or zero during early layout
  assert.equal(calculateScaleFactor(undefined, 0), 800 / 90);
  assert.equal(calculateScaleFactor(undefined, -100), 800 / 90);
});

test('Scale ratio geometry logic: scales glow and logo proportionally', () => {
  const computeGeometry = (size) => {
    const scaleRatio = size / ANIMATED_ICON_CONFIG.defaultIconSize;
    return {
      glowSize: ANIMATED_ICON_CONFIG.defaultGlowSize * scaleRatio,
      logoWidth: ANIMATED_ICON_CONFIG.defaultLogoWidth * scaleRatio,
      logoHeight: ANIMATED_ICON_CONFIG.defaultLogoHeight * scaleRatio,
    };
  };

  // Default size (128)
  const defaultGeometry = computeGeometry(128);
  assert.equal(defaultGeometry.glowSize, 201);
  assert.equal(defaultGeometry.logoWidth, 76);
  assert.equal(defaultGeometry.logoHeight, 71);

  // Double size (256)
  const doubleGeometry = computeGeometry(256);
  assert.equal(doubleGeometry.glowSize, 402);
  assert.equal(doubleGeometry.logoWidth, 152);
  assert.equal(doubleGeometry.logoHeight, 142);

  // Half size (64)
  const halfGeometry = computeGeometry(64);
  assert.equal(halfGeometry.glowSize, 100.5);
  assert.equal(halfGeometry.logoWidth, 38);
  assert.equal(halfGeometry.logoHeight, 35.5);
});
