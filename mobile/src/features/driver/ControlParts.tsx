/** Presentational parts of the Control screen. Colors come from useTheme() tokens only. */
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { ReactNode } from 'react';
import { Button, Card, Icon, Pill, Text, type IconName } from '@/components';
import {
  BATTERY_CRITICAL_MV,
  CmdResult,
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
  tone: 'positive' | 'warning' | 'critical' | 'neutral';
  onPress?: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const wash = tone === 'neutral' ? t.c.fill : t.c[`${tone}Wash` as keyof Palette];
  const fg: keyof Palette = tone === 'neutral' ? 'secondaryLabel' : tone;
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
      <Icon name={icon} size={15} color={fg} />
      <Text variant="footnote" weight="600" color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Interlock health chips. Live values keep positive/warning semantics; when the link is down the
 * values are last-known only (neutral, clock glyph, never a green check), and while a fault is
 * latched the sensor chip defers to the fault card instead of claiming "OK".
 */
export function GuardChips({
  zoneClear,
  sensorsValid,
  batteryMv,
  onPress,
  live = true,
  faulted = false,
}: {
  zoneClear: boolean;
  sensorsValid: boolean;
  batteryMv: number;
  onPress: () => void;
  /** false = link lost / disconnected: show last-known values in a neutral style */
  live?: boolean;
  /** true = FAULT latched: sensor health is untrusted */
  faulted?: boolean;
}) {
  const battTone =
    batteryMv < BATTERY_CRITICAL_MV
      ? 'critical'
      : batteryMv < BATTERY_HEALTHY_MIN_MV
        ? 'warning'
        : 'positive';
  const zoneLabel = zoneClear ? 'Zone clear' : 'Zone blocked';
  const sensorsLabel = faulted ? 'Sensors: see fault' : sensorsValid ? 'Sensors OK' : 'Sensors invalid';
  const batt = formatBattery(batteryMv);
  const stale = (label: string) => `${label}, last known, not live`;
  return (
    <View style={styles.chipRow} testID="guard-chips">
      <Chip
        testID="chip-zone"
        icon={!live ? 'time-outline' : zoneClear ? 'checkmark-circle' : 'alert-circle'}
        label={zoneLabel}
        a11yLabel={live ? undefined : stale(zoneLabel)}
        tone={!live ? 'neutral' : zoneClear ? 'positive' : 'warning'}
        onPress={onPress}
      />
      <Chip
        testID="chip-sensors"
        icon={
          !live ? 'time-outline' : faulted ? 'warning' : sensorsValid ? 'checkmark-circle' : 'alert-circle'
        }
        label={sensorsLabel}
        a11yLabel={live ? undefined : stale(sensorsLabel)}
        tone={!live ? 'neutral' : faulted ? 'critical' : sensorsValid ? 'positive' : 'warning'}
        onPress={onPress}
      />
      <Chip
        testID="chip-battery"
        icon={!live ? 'time-outline' : battTone === 'positive' ? 'battery-full' : 'battery-dead'}
        label={batt}
        a11yLabel={live ? `Battery ${batt}` : stale(`Battery ${batt}`)}
        tone={!live ? 'neutral' : battTone}
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
export function padCaption(
  en: ReturnType<typeof controlEnablement>,
  connected: boolean,
  state?: BarrierState | null,
): string | undefined {
  if (!connected) return 'Controls are off while offline.';
  if (state === BarrierState.FAULT) return 'Controls locked.';
  return en.lower.reason ?? en.raise.reason;
}

export function ControlPad({
  state,
  connected,
  onCommand,
  banner,
  onHeight,
  guardBlocked = false,
}: {
  /** a guard rejection is the latest result and its cause is still live: moves render tinted */
  guardBlocked?: boolean;
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
  // the banner already says why nothing moves: no second reason line above the buttons
  const hint = banner ? undefined : padCaption(en, connected, state);
  // enabled (the firmware decides) but quiet while a live guard block was just reported
  const quiet = guardBlocked ? ('tinted' as const) : undefined;
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
            variant={quiet ?? 'positive'}
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
            variant={quiet ?? 'filled'}
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

export function ResultBanner({
  notice,
  onDismiss,
  onDetails,
}: {
  notice: ResultNotice;
  onDismiss: () => void;
  /** guard rejections: opens the Safety checks sheet */
  onDetails?: () => void;
}) {
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
      {notice.result === CmdResult.REJECTED_GUARD && onDetails ? (
        <Pressable
          onPress={onDetails}
          accessibilityRole="button"
          accessibilityLabel="Safety checks"
          testID="banner-safety-checks"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.details}
        >
          <Text variant="subheadline" color="tint" weight="600">
            Safety checks
          </Text>
          <Icon name="chevron-forward" size={16} color="tint" />
        </Pressable>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
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
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    marginTop: space.m,
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
