import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, Text, type IconName } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';

export function ProgressDots({ index, total }: { index: number; total: number }) {
  const t = useTheme();
  return (
    <View
      style={styles.dots}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${index + 1} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === index ? 20 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i === index ? t.c.tint : t.c.separator,
          }}
        />
      ))}
    </View>
  );
}

/** Big rounded illustration tile. */
export function Illustration({ icon, badge }: { icon: IconName; badge?: IconName }) {
  const t = useTheme();
  return (
    <View
      style={[styles.tile, { backgroundColor: t.c.tintWash, borderRadius: radius.xxl + 12 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon name={icon} size={84} color="tint" />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: t.c.positiveFill, borderColor: t.c.background }]}>
          <Icon name={badge} size={22} color="onPositive" />
        </View>
      ) : null}
    </View>
  );
}

export interface OnboardingPageProps {
  title: string;
  body?: string;
  illustration?: ReactNode;
  children?: ReactNode;
  step: { index: number; total: number };
  primary: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean; hint?: string };
  secondary?: { title: string; onPress: () => void };
  onBack?: () => void;
  testID?: string;
}

/** Apple setup-assistant page: illustration, title, body, dots, primary button. */
export function OnboardingPage({
  title,
  body,
  illustration,
  children,
  step,
  primary,
  secondary,
  onBack,
  testID,
}: OnboardingPageProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.flex, { backgroundColor: t.c.background }]} testID={testID}>
      <View style={[styles.top, { paddingTop: insets.top + space.s }]}>
        {onBack ? (
          <Button title="Back" variant="plain" size="small" icon="chevron-back" onPress={onBack} />
        ) : (
          <View style={{ height: 44 }} />
        )}
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {illustration ? <View style={{ marginBottom: space.xxl }}>{illustration}</View> : null}
        <Text variant="largeTitle" align="center" accessibilityRole="header">
          {title}
        </Text>
        {body ? (
          <Text
            variant="body"
            color="secondaryLabel"
            align="center"
            style={{ marginTop: space.m, maxWidth: 440 }}
          >
            {body}
          </Text>
        ) : null}
        {children ? <View style={styles.extra}>{children}</View> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.l }]}>
        <ProgressDots index={step.index} total={step.total} />
        <Button
          title={primary.title}
          size="large"
          onPress={primary.onPress}
          disabled={primary.disabled}
          loading={primary.loading}
          accessibilityHint={primary.hint}
          testID="onboarding-primary"
          style={styles.cta}
        />
        {secondary ? (
          <Button
            title={secondary.title}
            variant="plain"
            onPress={secondary.onPress}
            testID="onboarding-secondary"
            style={styles.cta}
          />
        ) : (
          <View style={{ height: 50 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { paddingHorizontal: space.s, alignItems: 'flex-start' },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    paddingVertical: space.l,
  },
  extra: { alignSelf: 'stretch', marginTop: space.xxl, maxWidth: 520, width: '100%', alignItems: 'center' },
  footer: { paddingHorizontal: space.xxl, alignItems: 'center', gap: space.s },
  cta: { alignSelf: 'stretch', maxWidth: 520, width: '100%' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center', height: 24, marginBottom: space.s },
  tile: { width: 168, height: 168, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
