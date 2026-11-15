import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import type { Palette } from '../theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({
  name,
  size = 22,
  color = 'label',
  accessibilityLabel,
}: {
  name: IconName;
  size?: number;
  color?: keyof Palette;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  return (
    <Ionicons
      name={name}
      size={size}
      color={t.c[color]}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
    />
  );
}
