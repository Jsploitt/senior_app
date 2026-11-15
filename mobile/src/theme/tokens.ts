/**
 * Design tokens. Apple-native: iOS system palette tuned for WCAG AA
 * (text >= 4.5:1, large text / UI >= 3:1). Contrast ratios checked in
 * src/__tests__/tokens.test.ts.
 */
import { Platform, type TextStyle } from 'react-native';

export interface Palette {
  background: string; // grouped background
  surface: string; // cards / rows
  surfaceRaised: string; // nested elements on a card
  fill: string; // subtle control fill (segmented, chips)
  segmentThumb: string; // selected segment (lighter than the track in dark mode)
  label: string;
  secondaryLabel: string;
  tertiaryLabel: string; // only for non-essential text >= 15 pt or decorative
  separator: string;
  tint: string; // links, icons, tinted text
  tintFill: string; // filled button background
  onTint: string;
  positive: string;
  positiveFill: string;
  onPositive: string;
  warning: string;
  warningFill: string;
  onWarning: string;
  critical: string;
  criticalFill: string;
  onCritical: string;
  moving: string;
  /** soft background washes behind state badges */
  positiveWash: string;
  warningWash: string;
  criticalWash: string;
  tintWash: string;
  /** barrier illustration */
  armStripeA: string;
  armStripeB: string;
  ground: string;
  post: string;
  overlay: string;
}

export const light: Palette = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceRaised: '#F7F7FA',
  fill: '#E9E9EE',
  segmentThumb: '#FFFFFF',
  label: '#000000',
  secondaryLabel: '#5E5E66',
  tertiaryLabel: '#8A8A8E',
  separator: '#D1D1D6',
  tint: '#0061D5',
  tintFill: '#0066DD',
  onTint: '#FFFFFF',
  positive: '#17732F',
  positiveFill: '#1A7A35',
  onPositive: '#FFFFFF',
  warning: '#A64B00',
  warningFill: '#B35200',
  onWarning: '#FFFFFF',
  critical: '#C8102E',
  criticalFill: '#D11A2A',
  onCritical: '#FFFFFF',
  moving: '#0061D5',
  positiveWash: '#E3F4E7',
  warningWash: '#FDF0E1',
  criticalWash: '#FCE6E8',
  tintWash: '#E5F0FD',
  armStripeA: '#FFFFFF',
  armStripeB: '#D11A2A',
  ground: '#D9DCE1',
  post: '#3A3A3C',
  overlay: 'rgba(0,0,0,0.4)',
};

export const dark: Palette = {
  background: '#000000',
  surface: '#1C1C1E',
  surfaceRaised: '#2C2C2E',
  fill: '#2C2C2E',
  segmentThumb: '#636366',
  label: '#FFFFFF',
  secondaryLabel: '#AEAEB2',
  tertiaryLabel: '#8E8E93',
  separator: '#38383A',
  tint: '#4DA3FF',
  tintFill: '#1A73E8',
  onTint: '#FFFFFF',
  positive: '#32D74B',
  positiveFill: '#1A7A35',
  onPositive: '#FFFFFF',
  warning: '#FF9F0A',
  warningFill: '#B35200',
  onWarning: '#FFFFFF',
  critical: '#FF6961',
  criticalFill: '#D11A2A',
  onCritical: '#FFFFFF',
  moving: '#4DA3FF',
  positiveWash: '#0F2A17',
  warningWash: '#33220A',
  criticalWash: '#3A1215',
  tintWash: '#0D2440',
  armStripeA: '#F2F2F7',
  armStripeB: '#E5353F',
  ground: '#2C2C2E',
  post: '#8E8E93',
  overlay: 'rgba(0,0,0,0.6)',
};

const font = Platform.select({ ios: 'System', android: 'sans-serif', default: undefined });
const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, Menlo, monospace',
});

/** iOS HIG text styles (Large/default content size). */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.37 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0.36 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: 0.35 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: 0.38 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.41 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.41 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400', letterSpacing: -0.32 },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.24 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.08 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0 },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400', letterSpacing: 0.07 },
  /** big numeric readouts (latency, voltage) */
  display: { fontSize: 44, lineHeight: 50, fontWeight: '700', letterSpacing: -0.5 },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export const fonts = { family: font, mono };

/** 4-pt grid */
export const space = { xxs: 2, xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { s: 8, m: 12, l: 16, xl: 22, xxl: 28, pill: 999 } as const;
/** minimum hit target (HIG 44 pt) */
export const hit = 44;
export const motion = {
  fast: 150,
  base: 250,
  slow: 400,
  spring: { damping: 18, stiffness: 180, mass: 1 },
} as const;

export const shadow = (dark: boolean) =>
  dark
    ? {}
    : Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        },
        android: { elevation: 2 },
        default: { boxShadow: '0 4px 16px rgba(0,0,0,0.06)' },
      });

export interface Theme {
  dark: boolean;
  c: Palette;
  type: typeof type;
  space: typeof space;
  radius: typeof radius;
}

export const makeTheme = (isDark: boolean): Theme => ({
  dark: isDark,
  c: isDark ? dark : light,
  type,
  space,
  radius,
});
