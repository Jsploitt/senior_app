import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { hit, radius, space, type Palette } from '../theme/tokens';
import { tap } from '../utils/haptics';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'filled' | 'tinted' | 'plain' | 'destructive' | 'positive' | 'warning' | 'gray';
export type ButtonSize = 'small' | 'medium' | 'large' | 'hero';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  haptic?: boolean;
}

const SIZES: Record<ButtonSize, { h: number; px: number; text: 'subheadline' | 'headline' | 'title3' }> = {
  small: { h: hit, px: space.m, text: 'subheadline' },
  medium: { h: 50, px: space.l, text: 'headline' },
  large: { h: 56, px: space.xl, text: 'headline' },
  hero: { h: 72, px: space.xl, text: 'title3' },
};

function colors(v: ButtonVariant, c: Palette): { bg: string; fg: keyof Palette } {
  switch (v) {
    case 'filled':
      return { bg: c.tintFill, fg: 'onTint' };
    case 'destructive':
      return { bg: c.criticalFill, fg: 'onCritical' };
    case 'positive':
      return { bg: c.positiveFill, fg: 'onPositive' };
    case 'warning':
      return { bg: c.warningFill, fg: 'onWarning' };
    case 'tinted':
      return { bg: c.tintWash, fg: 'tint' };
    case 'gray':
      return { bg: c.fill, fg: 'label' };
    case 'plain':
    default:
      return { bg: 'transparent', fg: 'tint' };
  }
}

export function Button({
  title,
  onPress,
  variant = 'filled',
  size = 'medium',
  icon,
  disabled,
  loading,
  accessibilityHint,
  accessibilityLabel,
  style,
  testID,
  haptic = true,
}: ButtonProps) {
  const t = useTheme();
  const s = SIZES[size];
  const inactive = disabled || loading;
  // One neutral disabled style everywhere (label >= 4.5:1 on fill), never a faded copy of the color.
  const col =
    disabled && variant !== 'plain' ? { bg: t.c.fill, fg: 'secondaryLabel' as const } : colors(variant, t.c);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (haptic) tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: s.h,
          paddingHorizontal: s.px,
          backgroundColor: col.bg,
          borderRadius: size === 'hero' ? radius.xl : radius.m,
          opacity: disabled && variant === 'plain' ? 0.4 : loading ? 0.7 : pressed ? 0.75 : 1,
          transform: [{ scale: pressed && !inactive ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={t.c[col.fg]} />
        ) : icon ? (
          <Icon name={icon} size={size === 'hero' ? 26 : 20} color={col.fg} />
        ) : null}
        <Text variant={s.text} color={col.fg} weight="600" numberOfLines={1}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s },
});
