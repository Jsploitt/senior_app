import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Icon, Text } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import { hit, radius, shadow, space } from '../../theme/tokens';
import { tap } from '../../utils/haptics';

/** Segmented control with per-option disabled state. */
export function SegmentedPicker<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
  testID,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean; note?: string }[];
  onChange: (v: T) => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.seg, { backgroundColor: t.c.fill }]}
    >
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`${testID ?? 'seg'}-${o.value}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: sel, disabled: !!o.disabled }}
            accessibilityLabel={o.disabled && o.note ? `${o.label}, unavailable. ${o.note}` : o.label}
            disabled={o.disabled}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[styles.segItem, sel && [{ backgroundColor: t.c.segmentThumb }, shadow(t.dark)]]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              {o.disabled ? <Icon name="lock-closed" size={13} color="secondaryLabel" /> : null}
              <Text
                variant="subheadline"
                weight={sel ? '600' : '400'}
                color={o.disabled ? 'secondaryLabel' : 'label'}
              >
                {o.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Row with a trailing switch. The whole row is one accessible switch. */
export function SwitchRow({
  title,
  subtitle,
  value,
  onChange,
  last,
  testID,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[
        styles.switchRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.c.separator },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text variant="body">{title}</Text>
        {subtitle ? (
          <Text variant="footnote" color="secondaryLabel">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch
          value={value}
          trackColor={{ true: t.c.tintFill, false: t.c.fill }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={t.c.fill}
          // react-native-web paints the "on" thumb teal unless told otherwise
          {...({ activeThumbColor: '#FFFFFF' } as object)}
        />
      </View>
    </Pressable>
  );
}

/** Padding wrapper for custom content inside a Section card. */
export function Pad({ children }: { children: React.ReactNode }) {
  return <View style={{ padding: space.l, gap: space.m }}>{children}</View>;
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', borderRadius: radius.s + 1, padding: 2, minHeight: hit },
  segItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.s - 1,
    minHeight: hit - 4,
    paddingHorizontal: space.s,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    minHeight: hit + 8,
    paddingLeft: space.l,
    paddingRight: space.l,
    paddingVertical: space.s,
  },
});
