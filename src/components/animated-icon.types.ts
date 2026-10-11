/**
 * @file animated-icon.types.ts
 * @description Shared SOLID interface contracts and immutable configuration tokens
 * for AnimatedIcon and AnimatedSplashOverlay across Native and Web platforms.
 */

import type { ImageProps, ImageStyle } from 'expo-image';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Image source prop value compatible with expo-image.
 */
export type ImageSourceValue = ImageProps['source'];

/**
 * Default animation and geometry configuration tokens.
 * Immutable / frozen to prevent accidental mutation.
 */
export const ANIMATED_ICON_CONFIG = Object.freeze({
  defaultDurationMs: 600,
  defaultGlowDurationMs: 240000, // 4-minute continuous rotation cycle
  defaultIconSize: 128,
  defaultGlowSize: 201,
  defaultLogoWidth: 76,
  defaultLogoHeight: 71,
  defaultBorderRadius: 40,
  defaultScaleFactorDenominator: 90,
  defaultElasticity: 0.7,
  gradientColors: ['#3C9FFE', '#0274DF'] as const,
  splashBackgroundColor: '#208AEF',
  safetyTimeoutMs: 3500,
});

/**
 * Props contract for the foreground animated logo layer.
 */
export interface AnimatedIconLogoProps {
  /** Source image for the logo. Defaults to expo-logo.png. */
  source?: ImageSourceValue;
  /** Duration of the entrance animation in milliseconds. */
  durationMs?: number;
  /** Width of the logo icon. */
  width?: number;
  /** Height of the logo icon. */
  height?: number;
  /** Optional custom image style overrides. */
  style?: StyleProp<ImageStyle>;
  /** Test identifier for AI and automated testing. */
  testID?: string;
}

/**
 * Props contract for the rotating glow atmospheric layer.
 */
export interface AnimatedIconGlowProps {
  /** Source image for the glow aura. Defaults to logo-glow.png. */
  source?: ImageSourceValue;
  /** Full duration of rotation cycle in milliseconds. */
  durationMs?: number;
  /** Size (width & height) of the glow layer. */
  size?: number;
  /** Optional custom image style overrides. */
  style?: StyleProp<ImageStyle>;
  /** Test identifier for AI and automated testing. */
  testID?: string;
}

/**
 * Props contract for the badge background container layer.
 */
export interface AnimatedIconBackgroundProps {
  /** Initial scale factor to animate down from. */
  initialScaleFactor: number;
  /** Duration of the scale animation in milliseconds. */
  durationMs?: number;
  /** Size (width & height) of the background surface. */
  size?: number;
  /** Border radius of the surface container. */
  borderRadius?: number;
  /** Optional custom container style. */
  style?: StyleProp<ViewStyle>;
  /** Test identifier for AI and automated testing. */
  testID?: string;
}

/**
 * Composite props for the main AnimatedIcon component (Open/Closed Principle).
 */
export interface AnimatedIconProps {
  /** Entrance scale/fade duration in milliseconds (default: 600ms). */
  duration?: number;
  /** Glow rotation cycle duration in milliseconds (default: 240,000ms). */
  glowDuration?: number;
  /** Dimensions (width & height) of the icon container (default: 128). */
  size?: number;
  /** Initial scale factor for the background entry keyframe. Calculated dynamically if omitted. */
  scaleFactor?: number;
  /** Custom logo source override (defaults to expo-logo.png). */
  logoSource?: ImageSourceValue;
  /** Custom glow source override (defaults to logo-glow.png). */
  glowSource?: ImageSourceValue;
  /** Additional container style overrides. */
  style?: StyleProp<ViewStyle>;
  /** Test identifier for automated testing and AI debugging. */
  testID?: string;
}

/**
 * Lifecycle phase states for the splash overlay state machine.
 */
export type SplashOverlayPhase = 'mounting' | 'animating' | 'dismissed';

/**
 * Props contract for the AnimatedSplashOverlay component (Dependency Inversion Principle).
 */
export interface AnimatedSplashOverlayProps {
  /** Duration of the exit fade-out animation in milliseconds (default: 600ms). */
  duration?: number;
  /** Background fill color for the splash overlay (default: #208AEF). */
  backgroundColor?: string;
  /** Image source displayed in the splash center (defaults to expo-logo.png). */
  imageSource?: ImageSourceValue;
  /** Maximum milliseconds to wait for dismissal before forcing overlay cleanup (safety watchdog). */
  safetyTimeoutMs?: number;
  /** Injected splash screen hiding handler (defaults to SplashScreen.hideAsync for DIP). */
  hideSplashScreen?: () => Promise<void | boolean | unknown>;
  /** Callback fired once the native splash screen hide signal is acknowledged. */
  onSplashHidden?: () => void;
  /** Callback fired once the Reanimated dismissal animation has completed. */
  onAnimationComplete?: () => void;
  /** Additional container style overrides. */
  style?: StyleProp<ViewStyle>;
  /** Test identifier for automated testing and AI debugging. */
  testID?: string;
}
