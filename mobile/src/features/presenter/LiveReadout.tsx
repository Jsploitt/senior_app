import { StyleSheet, View } from 'react-native';
import { Card, Pill } from '../../components/Layout';
import { Text } from '../../components/Text';
import {
  BarrierState,
  CmdResult,
  FAULT_NAMES,
  FaultReason,
  MOTION_NOMINAL_MS,
  MOTION_TIMEOUT_MS,
  RESULT_NAMES,
  STATE_NAMES,
} from '../../protocol/constants';
import {
  explainGuardMask,
  FAULT_TEXT,
  formatBattery,
  RESULT_TEXT,
  STATE_TEXT,
} from '../../protocol/messages';
import type { SimDevice } from '../../sim/SimDevice';
import type { TransportSnapshot } from '../../transport/types';
import { useTheme } from '../../theme/ThemeProvider';
import { space, type Palette } from '../../theme/tokens';
import { BarrierHero } from '../driver/BarrierHero';
import { useDeviceTick, useNow } from './hooks';

/** RAW_ENUM_NAME -> "Raw enum name" (hex codes stay as they are). */
const sentence = (raw: string) => {
  if (/^0x/i.test(raw)) return raw;
  const w = raw.replace(/_/g, ' ').toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
};

const hex2 = (n: number) => `0x${n.toString(16).padStart(2, '0')}`;

/** 7 s motion timer against the 4 s nominal travel, visible only while the arm is driven. */
export function MotionClock({ device }: { device: SimDevice | null }) {
  const t = useTheme();
  useDeviceTick(device);
  const motion = device?.motion ?? null;
  const now = useNow(motion !== null, 100);
  if (!motion) return null;
  const elapsed = Math.max(0, now - motion.startedAt);
  const pct = Math.min(1, elapsed / MOTION_TIMEOUT_MS);
  const past = elapsed > MOTION_NOMINAL_MS;
  const tone: keyof Palette = elapsed >= MOTION_TIMEOUT_MS ? 'critical' : past ? 'warning' : 'moving';
  const caption =
    elapsed >= MOTION_TIMEOUT_MS
      ? 'Timer expired'
      : past
        ? 'Past nominal travel: the controller is waiting for a limit switch'
        : 'Within nominal travel';
  const seconds = (elapsed / 1000).toFixed(1);
  return (
    <Card
      testID="motion-clock"
      style={styles.clock}
      tone={tone === 'critical' ? 'critical' : past ? 'warning' : undefined}
    >
      <View
        accessible
        accessibilityRole="timer"
        accessibilityLabel={`Motion timer ${seconds} seconds of ${MOTION_TIMEOUT_MS / 1000}. ${caption}`}
      >
        <View style={styles.clockTop}>
          <Text variant="footnote" color="secondaryLabel" style={styles.upper}>
            Motion timer
          </Text>
          <Text variant="title2" tabular color={tone}>
            {seconds} s / {(MOTION_TIMEOUT_MS / 1000).toFixed(0)} s
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: t.c.fill }]}>
          <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: t.c[tone] }]} />
          <View
            style={[
              styles.tick,
              { left: `${(MOTION_NOMINAL_MS / MOTION_TIMEOUT_MS) * 100}%`, backgroundColor: t.c.label },
            ]}
          />
        </View>
        <View style={styles.clockLabels}>
          <Text variant="caption1" color="secondaryLabel">
            0
          </Text>
          <Text variant="caption1" color="secondaryLabel">
            {MOTION_NOMINAL_MS / 1000} s nominal
          </Text>
          <Text variant="caption1" color="secondaryLabel">
            {MOTION_TIMEOUT_MS / 1000} s timeout
          </Text>
        </View>
        <Text variant="footnote" color={past ? tone : 'secondaryLabel'} style={styles.tileDetail}>
          {caption}
        </Text>
      </View>
    </Card>
  );
}

export interface LiveReadoutProps {
  snap: TransportSnapshot;
  device: SimDevice | null;
}

/** Hero detail line that follows the latest status (never contradicts a blocked zone or a dropped link). */
function heroDetail(snap: TransportSnapshot): string | undefined {
  const s = snap.status;
  if (!s) return undefined;
  if (snap.phase !== 'ready') return 'Link down. Showing the last known state, not live.';
  if (s.state === BarrierState.STOPPED) {
    return s.zoneClear
      ? 'Arm halted between positions. Raise or lower to continue.'
      : 'Arm halted and the zone is blocked. Clear the zone, then raise or lower.';
  }
  return undefined;
}

/** Barrier illustration driven by the phone's decoded Status (never by what was requested). */
export function LiveHero({ snap }: { snap: TransportSnapshot }) {
  const live = snap.phase === 'ready' ? snap.status : null;
  const s = snap.status;
  return (
    <BarrierHero
      state={live ? live.state : (s?.state ?? null)}
      fault={s ? s.fault : FaultReason.NONE}
      stale={!live && !!s}
      detail={heroDetail(snap)}
      compact
      testID="presenter-hero"
    />
  );
}

function ReadRow({
  label,
  value,
  raw,
  tone = 'label',
  testID,
  last,
}: {
  label: string;
  value: string;
  raw?: string;
  tone?: keyof Palette;
  testID?: string;
  last?: boolean;
}) {
  const t = useTheme();
  // The raw code is secondary: show it only when it adds something the plain value does not.
  const code = raw && sentence(raw).toLowerCase() !== value.toLowerCase() ? sentence(raw) : null;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value}${code ? `, code ${code}` : ''}`}
      style={[
        styles.readRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.c.separator },
      ]}
    >
      <Text variant="subheadline" color="secondaryLabel" style={styles.readLabel}>
        {label}
      </Text>
      <View style={styles.readValue}>
        <Text variant="callout" weight="600" color={tone}>
          {value}
        </Text>
        {code ? (
          <Text variant="caption1" color="secondaryLabel">
            {code}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Compact live readout: one dense card (state, last result, fault, guard) plus status pills. */
export function LiveReadout({ snap, device }: LiveReadoutProps) {
  useDeviceTick(device);
  const live = snap.phase === 'ready' ? snap.status : null;
  const s = snap.status;

  const stateText = live
    ? STATE_TEXT[live.state].label
    : s
      ? `${STATE_TEXT[s.state].label} (last known)`
      : 'Not connected';
  const stateRaw = live ? STATE_NAMES[live.state] : s ? STATE_NAMES[s.state] : snap.phase;
  const result = s ? s.lastResult : CmdResult.NONE;
  const resultIsReject = result >= CmdResult.REJECTED_AUTH && result <= CmdResult.REJECTED_FORMAT;
  const guardBlocked = !!s && result === CmdResult.REJECTED_GUARD;
  const guardReasons = guardBlocked ? explainGuardMask(s.guardFailMask) : [];
  const hasFault = !!s && s.fault !== FaultReason.NONE;
  const guardValue = guardBlocked
    ? guardReasons.length
      ? guardReasons.map((g) => g.title).join(' / ')
      : 'Blocked'
    : resultIsReject
      ? 'Not a safety-check block'
      : 'No block';

  return (
    <View testID="live-readout" style={styles.readout}>
      <MotionClock device={device} />
      <Text variant="headline" accessibilityRole="header" style={styles.sectionTitle}>
        Live status
      </Text>
      <Card style={styles.strip}>
        <ReadRow testID="tile-state" label="State" value={stateText} raw={stateRaw} />
        <ReadRow
          testID="tile-result"
          label="Last result"
          value={RESULT_TEXT[result].title}
          raw={RESULT_NAMES[result]}
          tone={resultIsReject ? 'warning' : result === CmdResult.FAULT ? 'critical' : 'label'}
        />
        <ReadRow
          testID="tile-fault"
          label="Fault"
          value={hasFault ? FAULT_TEXT[s.fault].title : 'No fault'}
          raw={s ? FAULT_NAMES[s.fault] : undefined}
          tone={hasFault ? 'critical' : 'label'}
        />
        <ReadRow
          testID="tile-guard"
          label="Guard"
          value={guardValue}
          raw={guardBlocked ? hex2(s.guardFailMask) : undefined}
          tone={guardBlocked ? 'warning' : 'label'}
          last
        />
      </Card>
      <View style={styles.chips} accessible accessibilityLabel={chipsLabel(snap)}>
        <StatusPill
          label={`Zone ${s ? (s.zoneClear ? 'clear' : 'blocked') : '--'}`}
          bad={!!s && !s.zoneClear}
          ok={!!s && s.zoneClear}
        />
        <StatusPill
          label={`Sensors ${s ? (s.sensorsValid ? 'valid' : 'invalid') : '--'}`}
          bad={!!s && !s.sensorsValid}
          ok={!!s && s.sensorsValid}
        />
        <StatusPill
          label={`Battery ${s ? formatBattery(s.batteryMv) : '--'}`}
          bad={!!s && s.batteryMv < 11800}
          ok={!!s && s.batteryMv >= 11800}
        />
        <StatusPill
          label={`Link ${snap.phase}`}
          bad={snap.phase === 'disconnected' || snap.phase === 'error'}
          ok={snap.phase === 'ready'}
        />
        <Pill label={`Next counter ${snap.nextCounter === null ? '--' : snap.nextCounter}`} />
      </View>
      {device ? (
        <Text variant="footnote" color="secondaryLabel" style={styles.ground} testID="controller-line">
          Barrier Controller (simulated): {STATE_NAMES[device.state]} /{' '}
          {RESULT_NAMES[device.status.lastResult]} /{' '}
          {device.fsm.fault === FaultReason.NONE ? 'no fault' : FAULT_NAMES[device.fsm.fault]}
        </Text>
      ) : null}
    </View>
  );
}

function chipsLabel(snap: TransportSnapshot) {
  const s = snap.status;
  if (!s) return `Link ${snap.phase}`;
  return `Zone ${s.zoneClear ? 'clear' : 'blocked'}, sensors ${s.sensorsValid ? 'valid' : 'invalid'}, battery ${formatBattery(s.batteryMv)}, link ${snap.phase}`;
}

/** Same Pill as the Control screen; the icon keeps pass / fail from being colour-only. */
function StatusPill({ label, bad, ok }: { label: string; bad?: boolean; ok?: boolean }) {
  if (bad) return <Pill label={label} tone="warning" icon="alert-circle" />;
  if (ok) return <Pill label={label} tone="positive" icon="checkmark-circle" />;
  return <Pill label={label} />;
}

const styles = StyleSheet.create({
  readout: { gap: space.m },
  strip: { paddingVertical: space.xs },
  readRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.m,
    minHeight: 44,
    paddingVertical: space.s,
  },
  readLabel: { width: 96, paddingTop: 2 },
  readValue: { flex: 1, gap: 1 },
  sectionTitle: { marginTop: space.s },
  upper: { textTransform: 'uppercase', letterSpacing: 0.4 },
  tileDetail: { marginTop: space.xxs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  ground: {},
  clock: {},
  clockTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 12, borderRadius: 6, marginTop: space.s, overflow: 'hidden' },
  fill: { height: 12, borderRadius: 6 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  clockLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
});
