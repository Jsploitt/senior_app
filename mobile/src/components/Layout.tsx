import type { ReactNode } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { hit, radius, shadow, space, type Palette } from '../theme/tokens';
import { tap } from '../utils/haptics';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Scrollable screen with an iOS large title header. */
export function Screen({
  title,
  subtitle,
  right,
  children,
  onRefresh,
  refreshing,
  scroll = true,
  footer,
  testID,
  onTitlePress,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  footer?: ReactNode;
  testID?: string;
  onTitlePress?: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Pressable
          onPress={onTitlePress}
          disabled={!onTitlePress}
          accessible={!!onTitlePress}
          accessibilityRole="header"
          accessibilityLabel={title}
        >
          <Text variant="largeTitle" accessibilityRole="header">
            {title}
          </Text>
        </Pressable>
        {subtitle ? (
          <Text variant="subheadline" color="secondaryLabel" style={{ marginTop: space.xxs }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  ) : null;
  const pad = { paddingTop: insets.top + space.s, paddingBottom: space.huge };
  return (
    <View style={[styles.flex, { backgroundColor: t.c.background }]} testID={testID}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, pad]}
          contentInsetAdjustmentBehavior="never"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                tintColor={t.c.secondaryLabel}
              />
            ) : undefined
          }
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.content, pad]}>
          {header}
          {children}
        </View>
      )}
      {footer ? <View style={{ paddingBottom: insets.bottom }}>{footer}</View> : null}
    </View>
  );
}

export function Card({
  children,
  style,
  padded = true,
  tone,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  tone?: 'positive' | 'warning' | 'critical' | 'tint';
  testID?: string;
}) {
  const t = useTheme();
  const bg = tone ? t.c[`${tone}Wash` as keyof Palette] : t.c.surface;
  return (
    <View
      testID={testID}
      style={[
        { backgroundColor: bg, borderRadius: radius.l, padding: padded ? space.l : 0, overflow: 'hidden' },
        shadow(t.dark),
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Grouped inset section (iOS Settings style). */
export function Section({
  title,
  footer,
  children,
  style,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ marginTop: space.xxl }, style]}>
      {title ? (
        <Text
          variant="footnote"
          color="secondaryLabel"
          style={{ textTransform: 'uppercase', marginLeft: space.l, marginBottom: space.s }}
          accessibilityRole="header"
        >
          {title}
        </Text>
      ) : null}
      <Card padded={false}>{children}</Card>
      {footer ? (
        <Text
          variant="footnote"
          color="secondaryLabel"
          style={{ marginHorizontal: space.l, marginTop: space.s }}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  value,
  icon,
  iconBg,
  onPress,
  chevron,
  right,
  destructive,
  last,
  testID,
  accessibilityHint,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: IconName;
  iconBg?: keyof Palette;
  onPress?: () => void;
  chevron?: boolean;
  right?: ReactNode;
  destructive?: boolean;
  last?: boolean;
  testID?: string;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const content = (
    <View style={[styles.row, { minHeight: hit + 8 }]}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: t.c[iconBg ?? 'tintFill'] }]}>
          <Icon name={icon} size={17} color="onTint" />
        </View>
      ) : null}
      <View
        style={[
          styles.rowBody,
          !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.c.separator },
        ]}
      >
        <View style={{ flex: 1, paddingVertical: space.m }}>
          <Text variant="body" color={destructive ? 'critical' : 'label'}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="footnote" color="secondaryLabel" style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text
            variant="body"
            color="secondaryLabel"
            tabular
            style={{ marginLeft: space.s, flexShrink: 1 }}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {right}
        {chevron ? <Icon name="chevron-forward" size={18} color="tertiaryLabel" /> : null}
      </View>
    </View>
  );
  if (!onPress) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={[title, value, subtitle].filter(Boolean).join(', ')}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={[title, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.c.fill : 'transparent' })}
    >
      {content}
    </Pressable>
  );
}

export function Banner({
  tone,
  icon,
  title,
  detail,
  action,
  testID,
}: {
  tone: 'positive' | 'warning' | 'critical' | 'tint';
  icon: IconName;
  title: string;
  detail?: string;
  action?: ReactNode;
  testID?: string;
}) {
  return (
    <Card tone={tone} testID={testID} style={{ marginTop: space.m }}>
      <View
        style={{ flexDirection: 'row', gap: space.m }}
        accessible
        accessibilityRole="alert"
        accessibilityLabel={[title, detail].filter(Boolean).join('. ')}
      >
        <Icon name={icon} size={22} color={tone} />
        <View style={{ flex: 1 }}>
          <Text variant="headline" color={tone}>
            {title}
          </Text>
          {detail ? (
            <Text variant="subheadline" color="label" style={{ marginTop: space.xxs }}>
              {detail}
            </Text>
          ) : null}
        </View>
      </View>
      {action ? <View style={{ marginTop: space.m }}>{action}</View> : null}
    </Card>
  );
}

export function Pill({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'critical' | 'tint';
  icon?: IconName;
}) {
  const t = useTheme();
  const bg = tone === 'neutral' ? t.c.fill : t.c[`${tone}Wash` as keyof Palette];
  const fg: keyof Palette = tone === 'neutral' ? 'secondaryLabel' : tone;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={13} color={fg} /> : null}
      <Text variant="footnote" weight="600" color={fg}>
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon: IconName;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty} accessible accessibilityLabel={`${title}. ${detail}`}>
      <Icon name={icon} size={44} color="tertiaryLabel" />
      <Text variant="title3" align="center" style={{ marginTop: space.m }}>
        {title}
      </Text>
      <Text
        variant="subheadline"
        color="secondaryLabel"
        align="center"
        style={{ marginTop: space.xs, maxWidth: 300 }}
      >
        {detail}
      </Text>
      {action ? <View style={{ marginTop: space.l }}>{action}</View> : null}
    </View>
  );
}

export function Gap({ h = space.l }: { h?: number }) {
  return <View style={{ height: h }} />;
}

/** Segmented control (iOS UISegmentedControl look). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  accessibilityLabel: string;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.seg, { backgroundColor: t.c.fill }]}
    >
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: sel }}
            accessibilityLabel={o.label}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[styles.segItem, sel && [{ backgroundColor: t.c.surface }, shadow(t.dark)]]}
          >
            <Text variant="subheadline" weight={sel ? '600' : '400'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space.l },
  header: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: space.l, gap: space.m },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.l },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.m,
  },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: space.l, gap: space.xs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  empty: { alignItems: 'center', paddingVertical: space.huge, paddingHorizontal: space.xl },
  seg: { flexDirection: 'row', borderRadius: radius.s + 1, padding: 2, minHeight: 36 },
  segItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.s - 1,
    minHeight: 32,
    paddingHorizontal: space.s,
  },
});
