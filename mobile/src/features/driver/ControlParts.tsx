/** Presentational parts of the Control screen. Colors come from useTheme() tokens only. */
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { ReactNode } from 'react';
import { Button, Card, Icon, Pill, Text, type IconName } from '@/components';
import {
  BATTERY_CRITICAL_MV,
  BATTERY_HEALTHY_MIN_MV,
  FaultReason,
  Opcode,
  SPEC5_AUTH_MAX_MS,
  BarrierState,
} from '@/protocol/constants';
import { FAULT_TEXT, formatBattery } from '@/protocol/messages';
import { useTheme } from '@/theme/ThemeProvider';
import { hit, radius, space, type Palette } from '@/theme/tokens';
import {
  controlEnablement,
  formatLatency,
  latencyFill,
  latencyLabel,
  latencySpecTick,
  type ButtonRule,
  type PillSpec,
  type ResultNotice,
} from './logic';

/* ---------------- header chips ---------------- */

export { LocalOnlyChip, SimulatedBadge } from '../../components/Badges';

export function ConnectionPill({ spec, onPress }: { spec: PillSpec; onPress?: () => void }) {
  const inner = <Pill label={spec.label} tone={spec.tone} />;
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`Connection: ${spec.label}`} testID="connection-pill">
        {inner}
      </View>
    );
  }
  return (
    <Pressable
      testID="connection-pill"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Connection: ${spec.label}`}
      accessibilityHint="Opens the barrier finder"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {inner}
    </Pressable>
  );
}

/* ---------------- guard chips ---------------- */

function Chip({
  icon,
  label,
  tone,
  onPress,
  testID,
  a11yLabel,
}: {
  icon: IconName;
  label: string;
  a11yLabel?: string;
  tone: 'positive' | 'warning' | 'critical';
  onPress?: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const wash = t.c[`${tone}Wash` as keyof Palette];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityHint="Shows all safety checks"
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [styles.chip, { backgroundColor: wash, opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={15} color={tone} />
      <Text variant="footnote" weight="600" color={tone}>
        {label}
      </Text>
    </Pressable>
  );
}

export function GuardChips({
  zoneClear,
  sensorsValid,
  batteryMv,
  onPress,
}: {
  zoneClear: boolean;
  sensorsValid: boolean;
  batteryMv: number;
  onPress: () => void;
}) {
  const battTone =
    batteryMv < BATTERY_CRITICAL_MV
      ? 'critical'
      : batteryMv < BATTERY_HEALTHY_MIN_MV
        ? 'warning'
        : 'positive';
  return (
    <View style={styles.chipRow} testID="guard-chips">
      <Chip
        testID="chip-zone"
        icon={zoneClear ? 'checkmark-circle' : 'alert-circle'}
        label={zoneClear ? 'Zone clear' : 'Zone blocked'}
        tone={zoneClear ? 'positive' : 'warning'}
        onPress={onPress}
      />
      <Chip
        testID="chip-sensors"
        icon={sensorsValid ? 'checkmark-circle' : 'alert-circle'}
        label={sensorsValid ? 'Sensors OK' : 'Sensors invalid'}
        tone={sensorsValid ? 'positive' : 'warning'}
        onPress={onPress}
      />
      <Chip
        testID="chip-battery"
        icon={battTone === 'positive' ? 'battery-full' : 'battery-dead'}
        label={formatBattery(batteryMv)}
        a11yLabel={`Battery ${formatBattery(batteryMv)}`}
        tone={battTone}
        onPress={onPress}
      />
    </View>
  );
}

/* ---------------- control pad ---------------- */

/** STOP: filled danger while moving, tinted danger otherwise, one neutral style when disabled. */
function StopButton({
  rule,
  prominent,
  onPress,
}: {
  rule: ButtonRule;
  prominent?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const on = rule.enabled;
  const bg = !on ? t.c.fill : prominent ? t.c.criticalFill : t.c.criticalWash;
  const fg: keyof Palette = !on ? 'secondaryLabel' : prominent ? 'onCritical' : 'critical';
  return (
    <Pressable
      testID="btn-stop"
      onPress={onPress}
      disabled={!on}
      accessibilityRole="button"
      accessibilityLabel="Stop barrier"
      accessibilityHint={on ? undefined : rule.reason}
      accessibilityState={{ disabled: !on }}
      style={({ pressed }) => [
        styles.ctl,
        {
          backgroundColor: bg,
          minHeight: 60,
          opacity: pressed && on ? 0.8 : 1,
          transform: [{ scale: pressed && on ? 0.98 : 1 }],
        },
      ]}
    >
      <Icon name="stop" size={22} color={fg} />
      <Text variant="headline" color={fg} weight="700" numberOfLines={1}>
        STOP
      </Text>
    </Pressable>
  );
}

/** One-line reason shown above the pad whenever a command is unavailable. */
export function padCaption(en: ReturnType<typeof controlEnablement>, connected: boolean): string | undefined {
  if (!connected) return en.lower.reason;
  return en.lower.reason ?? en.raise.reason;
}

export function ControlPad({
  state,
  connected,
  onCommand,
  banner,
  onHeight,
}: {
  state: BarrierState | null;
  connected: boolean;
  onCommand: (op: Opcode) => void;
  /** transient result (guard-reject reasons, Done, ...) pinned directly above the buttons */
  banner?: ReactNode;
  /** measured height, so the scroll content can reserve exactly this much bottom space */
  onHeight?: (h: number) => void;
}) {
  const t = useTheme();
  const { fontScale } = useWindowDimensions();
  const en = controlEnablement(state, connected);
  const stacked = fontScale >= 1.4;
  const hint = padCaption(en, connected);
  return (
    <View
      testID="control-pad"
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
      style={[styles.pad, { backgroundColor: t.c.background, borderTopColor: t.c.separator }]}
    >
      {banner}
      {hint ? (
        <Text
          variant="footnote"
          color="secondaryLabel"
          align="center"
          style={{ marginBottom: space.s, marginTop: banner ? space.s : 0 }}
          testID="pad-hint"
        >
          {hint}
        </Text>
      ) : null}
      <View style={{ flexDirection: stacked ? 'column' : 'row', gap: space.m }}>
        <View style={stacked ? undefined : { flex: 1 }}>
          <Button
            title="Lower"
            icon="arrow-down"
            size="hero"
            variant="positive"
            haptic={false}
            disabled={!en.lower.enabled}
            accessibilityLabel="Lower barrier"
            accessibilityHint={en.lower.enabled ? undefined : en.lower.reason}
            onPress={() => void onCommand(Opcode.LOWER)}
            testID="btn-lower"
          />
        </View>
        <View style={stacked ? undefined : { flex: 1 }}>
          <Button
            title="Raise"
            icon="arrow-up"
            size="hero"
            variant="filled"
            haptic={false}
            disabled={!en.raise.enabled}
            accessibilityLabel="Raise barrier"
            accessibilityHint={en.raise.enabled ? undefined : en.raise.reason}
            onPress={() => void onCommand(Opcode.RAISE)}
            testID="btn-raise"
          />
        </View>
      </View>
      <View style={{ marginTop: space.m }}>
        <StopButton rule={en.stop} prominent={en.stopProminent} onPress={() => void onCommand(Opcode.STOP)} />
      </View>
    </View>
  );
}

/* ---------------- result banner ---------------- */

export function ResultBanner({ notice, onDismiss }: { notice: ResultNotice; onDismiss: () => void }) {
  const t = useTheme();
  const label = [notice.title, notice.detail, ...(notice.rows ?? []).map((r) => r.title)]
    .filter(Boolean)
    .join('. ');
  return (
    <Card tone={notice.tone} testID="result-banner" style={{ marginBottom: space.s }}>
      <View style={{ flexDirection: 'row', gap: space.m }}>
        <View
          style={{ flex: 1, flexDirection: 'row', gap: space.m }}
          accessible
          accessibilityRole="alert"
          accessibilityLabel={label}
        >
          <Icon name={notice.icon} size={22} color={notice.tone} />
          <View style={{ flex: 1 }}>
            <Text variant="headline" color={notice.tone}>
              {notice.title}
            </Text>
            {notice.detail ? (
              <Text variant="subheadline" style={{ marginTop: space.xxs }}>
                {notice.detail}
              </Text>
            ) : null}
          </View>
        </View>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          testID="banner-dismiss"
          hitSlop={8}
          style={styles.dismiss}
        >
          <Icon name="close" size={20} color="secondaryLabel" />
        </Pressable>
      </View>
      {notice.rows?.length ? (
        <View style={{ marginTop: space.m, gap: space.m }} testID="guard-rows">
          {notice.rows.map((r) => (
            <View
              key={r.bit}
              accessible
              accessibilityLabel={[r.title, r.detail, r.action].filter(Boolean).join('. ')}
              style={{ flexDirection: 'row', gap: space.m }}
              testID={`guard-row-${r.bit}`}
            >
              <View style={[styles.dot, { backgroundColor: t.c[notice.tone as 'warning'] }]} />
              <View style={{ flex: 1 }}>
                <Text variant="subheadline" weight="600">
                  {r.title}
                </Text>
                <Text variant="footnote" color="secondaryLabel">
                  {[r.detail, r.action].filter(Boolean).join(' ')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/* ---------------- fault card ---------------- */

export function FaultCard({
  fault,
  heading,
  compact,
}: {
  fault: FaultReason;
  heading?: string;
  /** Control screen: heading + cause + one reset line (the hero already names the fault) */
  compact?: boolean;
}) {
  const text = FAULT_TEXT[fault === FaultReason.NONE ? FaultReason.INTERNAL : fault];
  return (
    <Card tone="critical" testID="fault-card" style={{ marginTop: space.m }}>
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLabel={`${text.title}. ${text.detail} ${text.action ?? ''} Hold the unit button for 8 seconds to reset.`}
        style={{ flexDirection: 'row', gap: space.m }}
      >
        <Icon name="warning" size={24} color="critical" />
        <View style={{ flex: 1 }}>
          <Text variant="headline" color="critical">
            {heading ?? text.title}
          </Text>
          <Text variant="subheadline" style={{ marginTop: space.xxs }}>
            {text.detail}
          </Text>
          {text.action && !compact ? (
            <Text variant="subheadline" style={{ marginTop: space.xs }}>
              {text.action}
            </Text>
          ) : null}
          <Text variant="footnote" color="secondaryLabel" style={{ marginTop: space.s }}>
            {compact
              ? 'Hold the unit button for 8 seconds. The app cannot clear a fault.'
              : 'On-site reset: hold the unit button for 8 seconds. The app cannot clear a fault.'}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/* ---------------- auth latency ---------------- */

export function AuthLatencyBadge({ ms, source }: { ms: number | null; source: 'ble' | 'sim' }) {
  const t = useTheme();
  if (ms === null) return null;
  const fill = latencyFill(ms);
  const tick = latencySpecTick();
  const over = ms > SPEC5_AUTH_MAX_MS;
  const caption = `Phone-measured${source === 'sim' ? ', simulated' : ''}. Reference: ${formatLatency(SPEC5_AUTH_MAX_MS)}`;
  return (
    <View
      testID="auth-latency"
      accessible
      accessibilityLabel={`${latencyLabel(ms)}. ${caption}`}
      style={{ marginTop: space.l }}
    >
      <Text variant="subheadline" weight="600" tabular>
        {latencyLabel(ms)}
      </Text>
      <View style={[styles.track, { backgroundColor: t.c.fill }]}>
        <View
          style={{
            width: `${fill * 100}%`,
            height: '100%',
            borderRadius: radius.pill,
            backgroundColor: over ? t.c.warning : t.c.tint,
          }}
        />
        <View style={[styles.tick, { left: `${tick * 100}%`, backgroundColor: t.c.label }]} />
      </View>
      <Text variant="caption1" color="secondaryLabel" style={{ marginTop: space.xs }}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', gap: space.s },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.s + 2,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    minHeight: 32,
  },
  ctl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    borderRadius: radius.xl,
    paddingHorizontal: space.l,
  },
  pad: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.l,
    paddingTop: space.m,
    paddingBottom: space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dismiss: {
    width: hit - 8,
    height: hit - 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    marginRight: -8,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  track: {
    height: 8,
    borderRadius: radius.pill,
    marginTop: space.s,
    overflow: 'visible',
    justifyContent: 'center',
  },
  tick: { position: 'absolute', width: 2, height: 16, top: -4, borderRadius: 1 },
});
