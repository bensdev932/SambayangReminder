/**
 * @file animated-icon.web.tsx
 * @description Web implementation of AnimatedIcon and AnimatedSplashOverlay adhering to SOLID principles.
 */

import { Image, type ImageStyle } from 'expo-image';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';

import classes from './animated-icon.module.css';
import {
  ANIMATED_ICON_CONFIG,
  type AnimatedIconProps,
  type AnimatedSplashOverlayProps,
} from './animated-icon.types';

// Re-export shared contracts and configuration
export * from './animated-icon.types';

/**
 * Web implementation of the splash dismissal overlay.
 * On web platforms, no native splash screen exists, so it immediately invokes
 * completion callbacks and renders null.
 */
export function AnimatedSplashOverlay({
  onSplashHidden,
  onAnimationComplete,
}: AnimatedSplashOverlayProps) {
  useEffect(() => {
    onSplashHidden?.();
    onAnimationComplete?.();
  }, [onSplashHidden, onAnimationComplete]);

  return null;
}

const webKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 0 }],
  },
  60: {
    transform: [{ scale: 1.2 }],
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(1.2),
  },
});

const webLogoKeyframe = new Keyframe({
  0: {
    opacity: 0,
  },
  60: {
    transform: [{ scale: 1.2 }],
    opacity: 0,
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(1.2),
  },
});

const webGlowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '-180deg' }, { scale: 0.8 }],
    opacity: 0,
  },
  0.3: {
    transform: [{ rotateZ: '0deg' }, { scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(0.7),
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

/**
 * Web implementation of the composite AnimatedIcon component.
 */
export function AnimatedIcon({
  duration = 300,
  glowDuration = ANIMATED_ICON_CONFIG.defaultGlowDurationMs,
  size = ANIMATED_ICON_CONFIG.defaultIconSize,
  logoSource = require('@/assets/images/expo-logo.png'),
  glowSource = require('@/assets/images/logo-glow.png'),
  style,
  testID = 'animated-icon-container',
}: AnimatedIconProps) {
  const scaleRatio = size / ANIMATED_ICON_CONFIG.defaultIconSize;

  const containerStyle = useMemo<ViewStyle>(
    () => ({
      width: size,
      height: size,
      justifyContent: 'center',
      alignItems: 'center',
    }),
    [size]
  );

  const glowStyle = useMemo<ImageStyle>(
    () => ({
      width: ANIMATED_ICON_CONFIG.defaultGlowSize * scaleRatio,
      height: ANIMATED_ICON_CONFIG.defaultGlowSize * scaleRatio,
      position: 'absolute',
    }),
    [scaleRatio]
  );

  const logoStyle = useMemo<ImageStyle>(
    () => ({
      width: ANIMATED_ICON_CONFIG.defaultLogoWidth * scaleRatio,
      height: ANIMATED_ICON_CONFIG.defaultLogoHeight * scaleRatio,
      position: 'absolute',
    }),
    [scaleRatio]
  );

  return (
    <View testID={testID} style={[containerStyle, style]}>
      <Animated.View
        testID={`${testID}-glow`}
        entering={webGlowKeyframe.duration(glowDuration)}
        style={glowStyle}>
        <Image
          style={glowStyle}
          source={glowSource}
          contentFit="contain"
          accessibilityRole="image"
          accessibilityLabel="Icon ambient glow"
        />
      </Animated.View>

      <Animated.View
        testID={`${testID}-background`}
        style={styles.background}
        entering={webKeyframe.duration(duration)}>
        <div className={classes.expoLogoBackground} />
      </Animated.View>

      <Animated.View
        testID={`${testID}-logo`}
        style={styles.imageContainer}
        entering={webLogoKeyframe.duration(duration)}>
        <Image
          style={logoStyle}
          source={logoSource}
          contentFit="contain"
          accessibilityRole="image"
          accessibilityLabel="Application Logo"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  background: {
    width: 128,
    height: 128,
    position: 'absolute',
  },
});
