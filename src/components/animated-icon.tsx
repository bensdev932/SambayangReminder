/**
 * @file animated-icon.tsx
 * @description SOLID-architected animated icon and splash screen overlay components for React Native / Expo.
 *
 * ARCHITECTURAL DESIGN (SOLID Principles):
 * 1. Single Responsibility Principle (SRP):
 *    - Pure Keyframe Factories: `createSplashKeyframe`, `createBackgroundKeyframe`, `createLogoKeyframe`, `createGlowKeyframe`.
 *    - Atomic Visual Layers:
 *      - `AnimatedIconGlow`: Atmospheric rotating glow
 *      - `AnimatedIconBackground`: Scaled rounded container surface
 *      - `AnimatedIconLogo`: Scaled & bounced foreground branding
 *    - Coordinated Orchestrators:
 *      - `AnimatedIcon`: Composes visual layers with responsive geometry
 *      - `AnimatedSplashOverlay`: Encapsulates splash-to-app lifecycle transitions
 *
 * 2. Open/Closed Principle (OCP):
 *    - Fully configurable via props with immutable default presets (`ANIMATED_ICON_CONFIG`).
 *    - Supports custom durations, images, dimensions, easings, callbacks, and native splash interceptors.
 *
 * 3. Liskov Substitution Principle (LSP):
 *    - Strict typing contracts (`AnimatedIconProps`, `AnimatedSplashOverlayProps`) shared across platforms.
 *
 * 4. Interface Segregation Principle (ISP):
 *    - Granular, decoupled interfaces per layer (`AnimatedIconGlowProps`, `AnimatedIconBackgroundProps`, etc.).
 *
 * 5. Dependency Inversion Principle (DIP):
 *    - Inverted splash screen dismissal (`hideSplashScreen` prop defaulting to `SplashScreen.hideAsync`).
 *    - Dynamic window dimensions hook (`useWindowDimensions`) instead of static module-level evaluation.
 *
 * 6. AI & Automated Debuggability:
 *    - `testID` on every visual layer for deterministic automated assertions.
 *    - Structured state machine (`SplashOverlayPhase`) and fail-safe watchdog timer preventing stuck splash screens.
 */

import { Image, type ImageStyle } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  ANIMATED_ICON_CONFIG,
  type AnimatedIconBackgroundProps,
  type AnimatedIconGlowProps,
  type AnimatedIconLogoProps,
  type AnimatedIconProps,
  type AnimatedSplashOverlayProps,
  type SplashOverlayPhase,
} from './animated-icon.types';

// Re-export shared contracts and configuration for consumers
export * from './animated-icon.types';

/**
 * ============================================================================
 * KEYFRAME FACTORIES (Single Responsibility Principle - Pure Animation Math)
 * ============================================================================
 */

/**
 * Creates the Keyframe for the splash dismissal exit animation.
 */
export function createSplashKeyframe() {
  return new Keyframe({
    0: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    20: {
      opacity: 1,
    },
    70: {
      opacity: 0,
      easing: Easing.elastic(ANIMATED_ICON_CONFIG.defaultElasticity),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(ANIMATED_ICON_CONFIG.defaultElasticity),
    },
  });
}

/**
 * Creates the Keyframe for the icon background scale entrance.
 */
export function createBackgroundKeyframe(initialScaleFactor: number) {
  return new Keyframe({
    0: {
      transform: [{ scale: Math.max(1, initialScaleFactor) }],
    },
    100: {
      transform: [{ scale: 1 }],
      easing: Easing.elastic(ANIMATED_ICON_CONFIG.defaultElasticity),
    },
  });
}

/**
 * Creates the Keyframe for the logo foreground bounce and fade-in entrance.
 */
export function createLogoKeyframe() {
  return new Keyframe({
    0: {
      transform: [{ scale: 1.3 }],
      opacity: 0,
    },
    40: {
      transform: [{ scale: 1.3 }],
      opacity: 0,
      easing: Easing.elastic(ANIMATED_ICON_CONFIG.defaultElasticity),
    },
    100: {
      opacity: 1,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(ANIMATED_ICON_CONFIG.defaultElasticity),
    },
  });
}

/**
 * Creates the Keyframe for the continuous 360-degree glow rotation.
 */
export function createGlowKeyframe() {
  return new Keyframe({
    0: {
      transform: [{ rotateZ: '0deg' }],
    },
    100: {
      transform: [{ rotateZ: '7200deg' }],
    },
  });
}

// Static immutable keyframe instances for zero-allocation renders
const STATIC_SPLASH_KEYFRAME = createSplashKeyframe();
const STATIC_LOGO_KEYFRAME = createLogoKeyframe();
const STATIC_GLOW_KEYFRAME = createGlowKeyframe();

/**
 * ============================================================================
 * ATOMIC SUBCOMPONENTS (SRP - Focused Presentation Units)
 * ============================================================================
 */

/**
 * Renders the rotating ambient glow effect behind the icon.
 */
export function AnimatedIconGlow({
  source = require('@/assets/images/logo-glow.png'),
  durationMs = ANIMATED_ICON_CONFIG.defaultGlowDurationMs,
  size = ANIMATED_ICON_CONFIG.defaultGlowSize,
  style,
  testID = 'animated-icon-glow',
}: AnimatedIconGlowProps) {
  const containerStyle = useMemo<ViewStyle>(
    () => ({
      width: size,
      height: size,
      position: 'absolute',
    }),
    [size]
  );

  const imageStyle = useMemo<ImageStyle>(
    () => ({
      width: size,
      height: size,
    }),
    [size]
  );

  return (
    <Animated.View
      testID={testID}
      entering={STATIC_GLOW_KEYFRAME.duration(durationMs)}
      style={containerStyle}>
      <Image
        style={[imageStyle, style]}
        source={source}
        contentFit="contain"
        accessibilityRole="image"
        accessibilityLabel="Icon ambient glow"
      />
    </Animated.View>
  );
}

/**
 * Renders the rounded badge background container.
 */
export function AnimatedIconBackground({
  initialScaleFactor,
  durationMs = ANIMATED_ICON_CONFIG.defaultDurationMs,
  size = ANIMATED_ICON_CONFIG.defaultIconSize,
  borderRadius = ANIMATED_ICON_CONFIG.defaultBorderRadius,
  style,
  testID = 'animated-icon-background',
}: AnimatedIconBackgroundProps) {
  const enteringKeyframe = useMemo(
    () => createBackgroundKeyframe(initialScaleFactor).duration(durationMs),
    [initialScaleFactor, durationMs]
  );

  const containerStyle = useMemo<ViewStyle>(
    () => ({
      width: size,
      height: size,
      borderRadius,
      backgroundColor: '#208AEF',
      position: 'absolute',
    }),
    [size, borderRadius]
  );

  return (
    <Animated.View
      testID={testID}
      entering={enteringKeyframe}
      style={[containerStyle, style]}
    />
  );
}

/**
 * Renders the foreground logo image with bounce and fade entrance.
 */
export function AnimatedIconLogo({
  source = require('@/assets/images/expo-logo.png'),
  durationMs = ANIMATED_ICON_CONFIG.defaultDurationMs,
  width = ANIMATED_ICON_CONFIG.defaultLogoWidth,
  height = ANIMATED_ICON_CONFIG.defaultLogoHeight,
  style,
  testID = 'animated-icon-logo',
}: AnimatedIconLogoProps) {
  const logoImageStyle = useMemo<ImageStyle>(
    () => ({
      width,
      height,
    }),
    [width, height]
  );

  return (
    <Animated.View
      testID={testID}
      style={styles.centeredContainer}
      entering={STATIC_LOGO_KEYFRAME.duration(durationMs)}>
      <Image
        style={[logoImageStyle, style]}
        source={source}
        contentFit="contain"
        accessibilityRole="image"
        accessibilityLabel="Application Logo"
      />
    </Animated.View>
  );
}

/**
 * ============================================================================
 * COMPOSITE ORCHESTRATORS (SRP, OCP, DIP)
 * ============================================================================
 */

/**
 * Composite animated icon component that coordinates the glow, background badge,
 * and foreground logo layers.
 */
export function AnimatedIcon({
  duration = ANIMATED_ICON_CONFIG.defaultDurationMs,
  glowDuration = ANIMATED_ICON_CONFIG.defaultGlowDurationMs,
  size = ANIMATED_ICON_CONFIG.defaultIconSize,
  scaleFactor,
  logoSource,
  glowSource,
  style,
  testID = 'animated-icon-container',
}: AnimatedIconProps) {
  const { height: screenHeight } = useWindowDimensions();

  // Dynamic scale factor computation with fallback guard
  const calculatedScaleFactor = useMemo(() => {
    if (typeof scaleFactor === 'number' && scaleFactor > 0) {
      return scaleFactor;
    }
    const safeHeight = screenHeight > 0 ? screenHeight : 800;
    return safeHeight / ANIMATED_ICON_CONFIG.defaultScaleFactorDenominator;
  }, [scaleFactor, screenHeight]);

  const containerStyle = useMemo<ViewStyle>(
    () => ({
      width: size,
      height: size,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 100,
    }),
    [size]
  );

  const scaleRatio = size / ANIMATED_ICON_CONFIG.defaultIconSize;

  return (
    <View testID={testID} style={[containerStyle, style]}>
      <AnimatedIconGlow
        source={glowSource}
        durationMs={glowDuration}
        size={ANIMATED_ICON_CONFIG.defaultGlowSize * scaleRatio}
      />
      <AnimatedIconBackground
        initialScaleFactor={calculatedScaleFactor}
        durationMs={duration}
        size={size}
      />
      <AnimatedIconLogo
        source={logoSource}
        durationMs={duration}
        width={ANIMATED_ICON_CONFIG.defaultLogoWidth * scaleRatio}
        height={ANIMATED_ICON_CONFIG.defaultLogoHeight * scaleRatio}
      />
    </View>
  );
}

/**
 * Splash screen dismissal overlay that synchronizes native splash hiding
 * with an elastic Reanimated fade-out entrance.
 */
export function AnimatedSplashOverlay({
  duration = ANIMATED_ICON_CONFIG.defaultDurationMs,
  backgroundColor = ANIMATED_ICON_CONFIG.splashBackgroundColor,
  imageSource = require('@/assets/images/expo-logo.png'),
  safetyTimeoutMs = ANIMATED_ICON_CONFIG.safetyTimeoutMs,
  hideSplashScreen = SplashScreen.hideAsync,
  onSplashHidden,
  onAnimationComplete,
  testID = 'animated-splash-overlay',
  style,
}: AnimatedSplashOverlayProps) {
  const [phase, setPhase] = useState<SplashOverlayPhase>('mounting');
  const hasTriggeredHideRef = useRef(false);

  // Invoked on the JS thread when the Reanimated worklet signals completion
  const handleAnimationFinished = useCallback(
    (finished: boolean) => {
      if (finished) {
        setPhase('dismissed');
        onAnimationComplete?.();
      }
    },
    [onAnimationComplete]
  );

  // Fail-safe watchdog: prevents frozen screen bugs if native or worklet fails
  useEffect(() => {
    if (phase === 'dismissed') return;

    const timer = setTimeout(() => {
      setPhase((currentPhase) => {
        if (currentPhase !== 'dismissed') {
          onAnimationComplete?.();
          return 'dismissed';
        }
        return currentPhase;
      });
    }, safetyTimeoutMs);

    return () => clearTimeout(timer);
  }, [phase, safetyTimeoutMs, onAnimationComplete]);

  // Invoked on initial layout to transition from native splash to animated overlay
  const handleLayout = useCallback(() => {
    if (hasTriggeredHideRef.current) return;
    hasTriggeredHideRef.current = true;

    hideSplashScreen()
      .catch((err) => {
        console.warn('[AnimatedSplashOverlay] hideSplashScreen warning:', err);
      })
      .finally(() => {
        onSplashHidden?.();
        setPhase('animating');
      });
  }, [hideSplashScreen, onSplashHidden]);

  if (phase === 'dismissed') {
    return null;
  }

  const overlayContainerStyle: StyleProp<ViewStyle> = [
    styles.splashOverlay,
    { backgroundColor },
    style,
  ];

  const splashImageElement = (
    <Image
      testID={`${testID}-image`}
      style={styles.splashImage}
      source={imageSource}
      contentFit="contain"
      accessibilityRole="image"
      accessibilityLabel="Splash branding"
    />
  );

  if (phase === 'animating') {
    return (
      <Animated.View
        testID={`${testID}-animating`}
        entering={STATIC_SPLASH_KEYFRAME.duration(duration).withCallback((finished: boolean | undefined) => {
          'worklet';
          if (finished) {
            scheduleOnRN(handleAnimationFinished, true);
          }
        })}
        style={overlayContainerStyle}>
        {splashImageElement}
      </Animated.View>
    );
  }

  return (
    <View
      testID={`${testID}-mounting`}
      onLayout={handleLayout}
      style={overlayContainerStyle}>
      {splashImageElement}
    </View>
  );
}

/**
 * ============================================================================
 * STYLES
 * ============================================================================
 */

const styles = StyleSheet.create({
  centeredContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashImage: {
    width: 76,
    height: 71,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
