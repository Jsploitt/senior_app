/** Presentational parts of the Control screen. Colors come from useTheme() tokens only. */
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Card, Icon, Pill, Text, type IconName } from '@/components';
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

export function LocalOnlyChip() {
  return (
    <View accessible accessibilityLabel="Local only. No internet." testID="local-only-chip">
      <Pill label="Local only" icon="cloud-offline-outline" />
    </View>
  );
}

export function SimulatedBadge() {
  return (
    <View accessible accessibilityLabel="Simulated barrier" testID="simulated-badge">
      <Pill label="SIMULATED" tone="warning" icon="flask-outline" />
    </View>
  );
}

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
}: {
  icon: IconName;
  label: string;
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
      accessibilityLabel={label}
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
        label={sensorsValid ? 'Sensors valid' : 'Sensors invalid'}
        tone={sensorsValid ? 'positive' : 'warning'}
        onPress={onPress}
      />
      <Chip
        testID="chip-battery"
        icon={battTone === 'positive' ? 'battery-full' : 'battery-dead'}
        label={`Battery ${formatBattery(batteryMv)}`}
        tone={battTone}
        onPress={onPress}
      />
    </View>
  );
}

/* ---------------- control pad ---------------- */

function ControlButton({
  kind,
  rule,
  prominent,
  onPress,
}: {
  kind: 'raise' | 'lower' | 'stop';
  rule: ButtonRule;
  prominent?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const title = kind === 'raise' ? 'Raise' : kind === 'lower' ? 'Lower' : 'Stop';
  const icon: IconName = kind === 'raise' ? 'arrow-up' : kind === 'lower' ? 'arrow-down' : 'stop';
  let bg: string;
  let fg: keyof Palette;
  if (kind === 'stop') {
    bg = prominent ? t.c.criticalFill : t.c.criticalWash;
    fg = prominent ? 'onCritical' : 'critical';
  } else if (kind === 'raise') {
    bg = t.c.tintFill;
    fg = 'onTint';
  } else {
    bg = t.c.positiveFill;
    fg = 'onPositive';
  }
  const tall = kind !== 'stop';
  return (
    <Pressable
      testID={`btn-${kind}`}
      onPress={onPress}
      disabled={!rule.enabled}
      accessibilityRole="button"
      accessibilityLabel={`${title} barrier`}
      accessibilityHint={rule.enabled ? undefined : rule.reason}
      accessibilityState={{ disabled: !rule.enabled }}
      style={({ pressed }) => [
        styles.ctl,
        {
          backgroundColor: bg,
          minHeight: tall ? 72 : 64,
          opacity: rule.enabled ? (pressed ? 0.8 : 1) : 0.4,
          transform: [{ scale: pressed && rule.enabled ? 0.98 : 1 }],
        },
      ]}
    >
      <Icon name={icon} size={tall ? 26 : 22} color={fg} />
      <Text variant={tall ? 'title3' : 'headline'} color={fg} weight="700" numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
    </Pressable>
  );
}

export function ControlPad({
  state,
  connected,
  onCommand,
}: {
  state: BarrierState | null;
  connected: boolean;
  onCommand: (op: Opcode) => void;
}) {
  const t = useTheme();
  const { fontScale } = useWindowDimensions();
  const en = controlEnablement(state, connected);
  const stacked = fontScale >= 1.4;
  // only explain rules the user cannot infer ("already raised" is obvious)
  const hint =
    connected && state !== null && (state === BarrierState.UNKNOWN || state === BarrierState.FAULT)
      ? state === 0
        ? en.raise.reason
        : en.lower.reason
      : undefined;
  return (
    <View
      testID="control-pad"
      style={[styles.pad, { backgroundColor: t.c.background, borderTopColor: t.c.separator }]}
    >
      {hint ? (
        <Text
          variant="footnote"
          color="secondaryLabel"
          align="center"
          style={{ marginBottom: space.s }}
          testID="pad-hint"
        >
          {hint}
        </Text>
      ) : null}
      <View style={{ flexDirection: stacked ? 'column' : 'row', gap: space.m }}>
        <View style={stacked ? undefined : { flex: 1 }}>
          <ControlButton kind="lower" rule={en.lower} onPress={() => void onCommand(Opcode.LOWER)} />
        </View>
        <View style={stacked ? undefined : { flex: 1 }}>
          <ControlButton kind="raise" rule={en.raise} onPress={() => void onCommand(Opcode.RAISE)} />
        </View>
      </View>
      <View style={{ marginTop: space.m }}>
        <ControlButton
          kind="stop"
          rule={en.stop}
          prominent={en.stopProminent}
          onPress={() => void onCommand(Opcode.STOP)}
        />
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
    <Card tone={notice.tone} testID="result-banner" style={{ marginTop: space.m }}>
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

export function FaultCard({ fault, heading }: { fault: FaultReason; heading?: string }) {
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
          {text.action ? (
            <Text variant="subheadline" style={{ marginTop: space.xs }}>
              {text.action}
            </Text>
          ) : null}
          <Text variant="footnote" color="secondaryLabel" style={{ marginTop: space.s }}>
            On-site reset: hold the unit button for 8 seconds. The app cannot clear a fault.
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.m,
    paddingVertical: space.s - 1,
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
