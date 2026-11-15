import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, type Palette, type TypeVariant } from '../theme/tokens';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: keyof Palette;
  weight?: TextStyle['fontWeight'];
  align?: TextStyle['textAlign'];
  mono?: boolean;
  /** tabular numbers for live readouts */
  tabular?: boolean;
}

/** Typography wrapper. Dynamic Type: font scaling stays enabled (capped at 2x for layout safety). */
export function Text({
  variant = 'body',
  color = 'label',
  weight,
  align,
  mono,
  tabular,
  style,
  maxFontSizeMultiplier = 2,
  ...rest
}: AppTextProps) {
  const t = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        t.type[variant],
        { color: t.c[color], fontFamily: mono ? fonts.mono : fonts.family },
        weight ? { fontWeight: weight } : null,
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
      {...rest}
    />
  );
}
