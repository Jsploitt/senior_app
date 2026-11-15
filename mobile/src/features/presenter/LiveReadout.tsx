import { StyleSheet, View } from 'react-native';
import { Card } from '../../components/Layout';
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
import { radius, space, type Palette } from '../../theme/tokens';
import { BarrierHero } from '../driver/BarrierHero';
import { useDeviceTick, useNow } from './hooks';

const hex2 = (n: number) => `0x${n.toString(16).padStart(2, '0')}`;

function Tile({
  label,
  value,
  detail,
  tone = 'label',
  testID,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: keyof Palette;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={styles.tile}
      accessible
      accessibilityLabel={[label, value, detail].filter(Boolean).join(', ')}
    >
      <Card style={styles.tileCard}>
        <Text variant="footnote" color="secondaryLabel" style={styles.upper}>
          {label}
        </Text>
        <Text variant="title3" color={tone} style={styles.tileValue}>
          {value}
        </Text>
        {detail ? (
          <Text variant="footnote" color="secondaryLabel" style={styles.tileDetail}>
            {detail}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

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

/** Control-like readout driven by the phone's decoded Status (never by what was requested). */
export function LiveReadout({ snap, device }: LiveReadoutProps) {
  useDeviceTick(device);
  const live = snap.phase === 'ready' ? snap.status : null;
  const s = snap.status;
  const heroState: BarrierState | null = live ? live.state : null;
  const fault = live ? live.fault : FaultReason.NONE;

  const stateText = live ? STATE_TEXT[live.state].label : s ? 'Link down' : 'Not connected';
  const stateDetail = live
    ? STATE_NAMES[live.state]
    : s
      ? `Last known: ${STATE_NAMES[s.state]}`
      : snap.phase === 'error' && snap.error
        ? snap.error.code
        : snap.phase;
  const result = s ? s.lastResult : CmdResult.NONE;
  const resultIsReject = result >= CmdResult.REJECTED_AUTH && result <= CmdResult.REJECTED_FORMAT;
  const guardReasons = s && result === CmdResult.REJECTED_GUARD ? explainGuardMask(s.guardFailMask) : [];
  const faultText = s && s.fault !== FaultReason.NONE ? FAULT_TEXT[s.fault].title : 'None';

  return (
    <View testID="live-readout">
      <BarrierHero state={heroState} fault={fault} compact testID="presenter-hero" />
      <MotionClock device={device} />
      <View style={styles.grid}>
        <Tile testID="tile-state" label="State" value={stateText} detail={stateDetail} />
        <Tile
          testID="tile-result"
          label="Last result"
          value={RESULT_TEXT[result].title}
          detail={RESULT_NAMES[result]}
          tone={resultIsReject ? 'warning' : result === CmdResult.FAULT ? 'critical' : 'label'}
        />
        <Tile
          testID="tile-fault"
          label="Fault"
          value={faultText}
          detail={s ? FAULT_NAMES[s.fault] : 'NONE'}
          tone={s && s.fault !== FaultReason.NONE ? 'critical' : 'label'}
        />
        <Tile
          testID="tile-guard"
          label="Guard"
          value={s && result === CmdResult.REJECTED_GUARD ? hex2(s.guardFailMask) : 'No rejection'}
          detail={guardReasons.length ? guardReasons.map((g) => g.title).join(' / ') : undefined}
          tone={guardReasons.length ? 'warning' : 'label'}
        />
      </View>
      <View style={styles.chips} accessible accessibilityLabel={chipsLabel(snap)}>
        <Chip label="Zone" value={s ? (s.zoneClear ? 'clear' : 'blocked') : '--'} bad={!!s && !s.zoneClear} />
        <Chip
          label="Sensors"
          value={s ? (s.sensorsValid ? 'valid' : 'invalid') : '--'}
          bad={!!s && !s.sensorsValid}
        />
        <Chip
          label="Battery"
          value={s ? formatBattery(s.batteryMv) : '--'}
          bad={!!s && s.batteryMv < 11800}
        />
        <Chip label="Next counter" value={snap.nextCounter === null ? '--' : String(snap.nextCounter)} />
        <Chip label="Link" value={snap.phase} bad={snap.phase === 'disconnected' || snap.phase === 'error'} />
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

function Chip({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: bad ? t.c.warningWash : t.c.fill }]}>
      <Text variant="caption1" color="secondaryLabel">
        {label}
      </Text>
      <Text variant="footnote" weight="700" color={bad ? 'warning' : 'label'} tabular>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m, marginTop: space.m },
  tile: { flexGrow: 1, flexBasis: 160, minWidth: 140 },
  tileCard: { padding: space.m, minHeight: 92 },
  upper: { textTransform: 'uppercase', letterSpacing: 0.4 },
  tileValue: { marginTop: space.xs },
  tileDetail: { marginTop: space.xxs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.m },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.m,
    minHeight: 32,
    borderRadius: radius.pill,
  },
  ground: { marginTop: space.m },
  clock: { marginTop: space.m },
  clockTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 12, borderRadius: 6, marginTop: space.s, overflow: 'hidden' },
  fill: { height: 12, borderRadius: 6 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  clockLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
});
