/** Presentational parts of the Connect modal. */
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Card, Icon, Pill, Text } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { rssiBars, type Step } from './logic';

export function SignalBars({ rssi }: { rssi: number | null }) {
  const t = useTheme();
  const n = rssiBars(rssi);
  const word = n >= 3 ? 'strong' : n === 2 ? 'fair' : n === 1 ? 'weak' : 'unknown';
  return (
    <View accessible accessibilityLabel={`Signal ${word}`} style={styles.bars} testID="signal-bars">
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            width: 4,
            height: 4 + i * 4,
            borderRadius: 2,
            backgroundColor: i <= n ? t.c.secondaryLabel : t.c.fill,
          }}
        />
      ))}
    </View>
  );
}

export function DeviceRow({
  name,
  rssi,
  known,
  onPress,
  testID,
}: {
  name: string;
  rssi: number | null;
  known: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}${known ? ', previously paired' : ''}`}
      accessibilityHint="Connects to this barrier"
      style={({ pressed }) => [
        styles.deviceRow,
        { backgroundColor: pressed ? t.c.fill : t.c.surface, borderRadius: radius.l },
      ]}
    >
      <View style={[styles.deviceIcon, { backgroundColor: t.c.tintWash }]}>
        <Icon name="bluetooth" size={20} color="tint" />
      </View>
      <View style={{ flex: 1, gap: space.xs }}>
        <Text variant="headline">{name}</Text>
        {known ? <Pill label="Previously paired" tone="tint" /> : null}
      </View>
      <SignalBars rssi={rssi} />
      <Icon name="chevron-forward" size={18} color="tertiaryLabel" />
    </Pressable>
  );
}

/** Section header over the device list: caption + live activity indicator while scanning. */
export function ListHeader({ title, busy, trailing }: { title: string; busy: boolean; trailing?: string }) {
  const t = useTheme();
  return (
    <View style={styles.listHeader} accessible accessibilityRole="header" accessibilityLabel={title}>
      <Text variant="footnote" weight="600" color="secondaryLabel" style={{ letterSpacing: 0.4 }}>
        {title.toUpperCase()}
      </Text>
      {busy ? <ActivityIndicator size="small" color={t.c.tint} testID="scan-spinner" /> : null}
      {trailing ? (
        <Text variant="footnote" color="secondaryLabel">
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}

export function StepList({ steps }: { steps: Step[] }) {
  const t = useTheme();
  return (
    <View accessibilityRole="list" style={{ gap: space.m }} testID="step-list">
      {steps.map((s) => (
        <View
          key={s.key}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${s.label}, ${s.state === 'done' ? 'done' : s.state === 'active' ? 'in progress' : s.state === 'error' ? 'failed' : 'waiting'}`}
          style={styles.step}
          testID={`step-${s.key}`}
        >
          <View style={styles.stepIcon}>
            {s.state === 'active' ? (
              <ActivityIndicator color={t.c.tint} />
            ) : s.state === 'done' ? (
              <Icon name="checkmark-circle" size={24} color="positive" />
            ) : s.state === 'error' ? (
              <Icon name="close-circle" size={24} color="critical" />
            ) : (
              <Icon name="ellipse-outline" size={24} color="tertiaryLabel" />
            )}
          </View>
          <Text
            variant="body"
            weight={s.state === 'active' ? '600' : '400'}
            color={s.state === 'error' ? 'critical' : s.state === 'todo' ? 'secondaryLabel' : 'label'}
          >
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Shown while the OS passkey prompt is expected (phase 'pairing'). */
export function PairingCard() {
  const t = useTheme();
  return (
    <Card tone="tint" testID="pairing-card" style={{ marginTop: space.l }}>
      <View
        accessible
        accessibilityLabel="Your phone will ask for a 6-digit code. Enter the passkey printed on the barrier's label."
        style={{ gap: space.m }}
      >
        <View style={{ flexDirection: 'row', gap: space.m }}>
          <Icon name="keypad" size={22} color="tint" />
          <Text variant="headline" color="tint">
            Enter the passkey
          </Text>
        </View>
        <Text variant="subheadline">
          Your phone will ask for a 6-digit code. Enter the passkey printed on the barrier&apos;s label in the
          Android pairing dialog.
        </Text>
        {/* static, muted illustration of the OS dialog: not an input */}
        <View
          style={styles.illustration}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="pairing-illustration"
        >
          <View style={[styles.prompt, { backgroundColor: t.c.fill, opacity: 0.75 }]}>
            <Text variant="caption1" weight="600" color="secondaryLabel" align="center">
              Bluetooth pairing request
            </Text>
            <View style={styles.dots}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={[styles.dot, { backgroundColor: t.c.tertiaryLabel }]} />
              ))}
            </View>
          </View>
          <Text variant="caption1" color="secondaryLabel" align="center" style={{ marginTop: space.xs }}>
            Example of the Android dialog
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 20, marginRight: space.xs },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
    minHeight: 64,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingHorizontal: space.xs,
    marginBottom: space.s,
  },
  deviceIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 32 },
  stepIcon: { width: 28, alignItems: 'center' },
  illustration: { alignItems: 'center' },
  prompt: {
    borderRadius: radius.m,
    paddingVertical: space.s,
    paddingHorizontal: space.l,
    gap: space.xs,
    width: 200,
  },
  dots: { flexDirection: 'row', gap: space.s, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
