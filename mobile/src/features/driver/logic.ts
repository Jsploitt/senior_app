/**
 * Pure helpers for the driver flow (no React). Unit-tested in __tests__/logic.test.ts.
 * Rules come from docs/STATE_MACHINE.md 3.1-3.3 and docs/DESIGN.md 3.1.
 */
import {
  BarrierState,
  CmdResult,
  GuardBit,
  MOTION_NOMINAL_MS,
  MOTION_TIMEOUT_MS,
  Opcode,
  SPEC5_AUTH_MAX_MS,
} from '@/protocol/constants';
import { GUARD_TEXT, type Explanation } from '@/protocol/messages';
import type { ConnectionPhase, TransportErrorCode } from '@/transport/types';
import type { Palette } from '@/theme/tokens';

/* ------------------------------------------------------------------ */
/* Button enablement (STATE_MACHINE.md 3.1, fsm_position_valid)        */
/* ------------------------------------------------------------------ */

export interface ButtonRule {
  enabled: boolean;
  /** why it is disabled; used as accessibilityHint and shown inline */
  reason?: string;
}

export interface Enablement {
  lower: ButtonRule;
  raise: ButtonRule;
  stop: ButtonRule;
  /** STOP is the primary (filled destructive) action */
  stopProminent: boolean;
}

export const isMoving = (s: BarrierState | null) => s === BarrierState.RAISING || s === BarrierState.LOWERING;

/**
 * The firmware decides; the app only mirrors the position rule (RAISE from LOWERED/STOPPED,
 * LOWER from RAISED/STOPPED/UNKNOWN, nothing while moving or in FAULT). STOP is enabled
 * whenever connected. Zone / sensor / battery are NOT used to disable buttons.
 */
export function controlEnablement(state: BarrierState | null, connected: boolean): Enablement {
  const off = (reason: string): ButtonRule => ({ enabled: false, reason });
  if (!connected || state === null) {
    const r = off('Not connected. Reconnect to control the barrier.');
    return { lower: r, raise: r, stop: r, stopProminent: false };
  }
  const stop: ButtonRule = { enabled: true };
  const moving = off('Arm is moving. Use Stop.');
  switch (state) {
    case BarrierState.UNKNOWN:
      return {
        lower: { enabled: true },
        raise: off('Lower first to confirm position'),
        stop,
        stopProminent: false,
      };
    case BarrierState.RAISED:
      return {
        lower: { enabled: true },
        raise: off('Already raised.'),
        stop,
        stopProminent: false,
      };
    case BarrierState.LOWERED:
      return {
        lower: off('Already lowered.'),
        raise: { enabled: true },
        stop,
        stopProminent: false,
      };
    case BarrierState.STOPPED:
      return { lower: { enabled: true }, raise: { enabled: true }, stop, stopProminent: false };
    case BarrierState.RAISING:
    case BarrierState.LOWERING:
      return { lower: moving, raise: moving, stop, stopProminent: true };
    case BarrierState.FAULT: {
      const r = off('Fault latched: needs on-site reset');
      return { lower: r, raise: r, stop, stopProminent: false };
    }
    default: {
      const r = off('Unknown status');
      return { lower: r, raise: r, stop, stopProminent: false };
    }
  }
}

/* ------------------------------------------------------------------ */
/* State presentation                                                  */
/* ------------------------------------------------------------------ */

export type ColorRole = 'neutral' | 'accent' | 'success' | 'motion' | 'warning' | 'danger';

/** STATE_MACHINE.md 3.1 colour roles. */
export function colorRole(state: BarrierState | null): ColorRole {
  switch (state) {
    case BarrierState.RAISED:
      return 'accent';
    case BarrierState.LOWERED:
      return 'success';
    case BarrierState.RAISING:
    case BarrierState.LOWERING:
      return 'motion';
    case BarrierState.STOPPED:
      return 'warning';
    case BarrierState.FAULT:
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Foreground (text / glyph) palette key and soft wash palette key per role. */
export const ROLE_FG: Record<ColorRole, keyof Palette> = {
  neutral: 'secondaryLabel',
  accent: 'tint',
  success: 'positive',
  motion: 'moving',
  warning: 'warning',
  danger: 'critical',
};
export const ROLE_WASH: Record<ColorRole, keyof Palette> = {
  neutral: 'fill',
  accent: 'tintWash',
  success: 'positiveWash',
  motion: 'tintWash',
  warning: 'warningWash',
  danger: 'criticalWash',
};

/** Arm opening 0 (flat, LOWERED) .. 1 (up, RAISED). */
export function restProgress(state: BarrierState | null): number {
  switch (state) {
    case BarrierState.RAISED:
      return 1;
    case BarrierState.LOWERED:
    case null:
      return 0;
    default:
      return 0.5; // UNKNOWN / STOPPED / FAULT with no history: mid angle
  }
}

export const ARM_MAX_DEG = 80;
/** RAISING / LOWERING eases toward, and holds at, this fraction until Status confirms. */
export const HOLD_FRACTION = 0.95;

/** Duration of the remaining travel from `current` (0..1) toward the hold point of `dir`. */
export function travelDuration(current: number, dir: 'up' | 'down', nominalMs = MOTION_NOMINAL_MS) {
  const target = dir === 'up' ? HOLD_FRACTION : 1 - HOLD_FRACTION;
  return Math.max(120, Math.round(Math.abs(target - current) * nominalMs));
}
export const holdTarget = (dir: 'up' | 'down') => (dir === 'up' ? HOLD_FRACTION : 1 - HOLD_FRACTION);

export function heroAccessibilityLabel(state: BarrierState | null, label: string, fault?: string) {
  if (state === null) return 'Barrier, not connected';
  return fault && state === BarrierState.FAULT ? `Barrier, ${label}, ${fault}` : `Barrier, ${label}`;
}

/** "1.2 s of about 4 s" while moving; flags overrun (firmware faults at 7 s). */
export function elapsedText(elapsedMs: number): { text: string; slow: boolean } {
  const sec = (ms: number) => (ms / 1000).toFixed(1);
  const slow = elapsedMs > MOTION_NOMINAL_MS;
  const shown = Math.min(elapsedMs, MOTION_TIMEOUT_MS);
  return {
    text: slow
      ? `${sec(shown)} s. Taking longer than usual`
      : `${sec(shown)} s of about ${sec(MOTION_NOMINAL_MS)} s`,
    slow,
  };
}

/* ------------------------------------------------------------------ */
/* Latency                                                             */
/* ------------------------------------------------------------------ */

export function formatLatency(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`;
}

export function latencyLabel(ms: number): string {
  return `Authenticated in ${formatLatency(ms)}`;
}

/** Fraction (0..1) of the bar scale; the scale ends at 1.5x the Spec 5 reference. */
export function latencyFill(ms: number, specMs = SPEC5_AUTH_MAX_MS) {
  const scale = specMs * 1.5;
  return Math.min(1, Math.max(0, ms / scale));
}
export const latencySpecTick = (specMs = SPEC5_AUTH_MAX_MS) => specMs / (specMs * 1.5);

/* ------------------------------------------------------------------ */
/* Connection pill                                                     */
/* ------------------------------------------------------------------ */

export interface PillSpec {
  label: string;
  tone: 'neutral' | 'positive' | 'warning' | 'critical' | 'tint';
}

export function connectionPill(
  phase: ConnectionPhase,
  ownerConnected: boolean | null,
  linkLost: boolean,
): PillSpec {
  switch (phase) {
    case 'scanning':
      return { label: 'Scanning', tone: 'tint' };
    case 'connecting':
      return { label: 'Connecting', tone: 'tint' };
    case 'pairing':
      return { label: 'Pairing', tone: 'tint' };
    case 'authorizing':
      return { label: 'Checking owner', tone: 'tint' };
    case 'ready':
      return ownerConnected === false
        ? { label: 'Not an owner', tone: 'warning' }
        : { label: 'Connected', tone: 'positive' };
    case 'disconnected':
      return {
        label: linkLost ? 'Connection lost' : 'Disconnected',
        tone: linkLost ? 'critical' : 'neutral',
      };
    default:
      return { label: 'Disconnected', tone: 'neutral' };
  }
}

/* ------------------------------------------------------------------ */
/* Guard reasons                                                       */
/* ------------------------------------------------------------------ */

/** CONTRACT.md 4.1: highest safety relevance first. */
export const GUARD_PRIORITY: GuardBit[] = [
  GuardBit.FAULT_LATCHED,
  GuardBit.ZONE_NOT_CLEAR,
  GuardBit.SENSORS_INVALID,
  GuardBit.POWER_UNHEALTHY,
  GuardBit.INVALID_POSITION,
  GuardBit.NOT_AUTHORIZED,
  GuardBit.STALE_COMMAND,
];

export interface GuardRow extends Explanation {
  bit: number;
}

/** One row per set bit in priority order; unknown bits (e.g. 0x80) get a generic row. */
export function guardRows(mask: number): GuardRow[] {
  const rows: GuardRow[] = GUARD_PRIORITY.filter((b) => (mask & b) !== 0).map((b) => ({
    bit: b,
    ...GUARD_TEXT[b],
  }));
  const known = GUARD_PRIORITY.reduce((a, b) => a | b, 0);
  if ((mask & ~known & 0xff) !== 0) {
    rows.push({
      bit: mask & ~known & 0xff,
      title: 'Unknown reason',
      detail: 'The barrier reported a reason this app does not recognise.',
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Connect flow                                                        */
/* ------------------------------------------------------------------ */

export type StepState = 'todo' | 'active' | 'done' | 'error';
export interface Step {
  key: 'connecting' | 'securing' | 'owner' | 'ready';
  label: string;
  state: StepState;
}

const STEP_DEFS: (Pick<Step, 'key' | 'label'> & { doneLabel: string })[] = [
  { key: 'connecting', label: 'Connecting', doneLabel: 'Connected' },
  { key: 'securing', label: 'Securing (pairing)', doneLabel: 'Secured' },
  { key: 'owner', label: 'Checking owner', doneLabel: 'Owner verified' },
  { key: 'ready', label: 'Ready', doneLabel: 'Ready' },
];

function makeStep(d: (typeof STEP_DEFS)[number], state: StepState): Step {
  return { key: d.key, label: state === 'done' ? d.doneLabel : d.label, state };
}

/** Index of the step a phase belongs to (-1 = not started). */
export function stepIndexOf(phase: ConnectionPhase): number {
  switch (phase) {
    case 'connecting':
      return 0;
    case 'pairing':
      return 1;
    case 'authorizing':
      return 2;
    case 'ready':
      return 3;
    default:
      return -1;
  }
}

/**
 * Map a transport phase to the four-step list. `failedAtIndex` marks the step that was active
 * when connect() rejected (the phase is then 'error', which carries no index itself).
 */
export function connectSteps(phase: ConnectionPhase, failedAtIndex: number | null = null): Step[] {
  if (failedAtIndex !== null) {
    return STEP_DEFS.map((d, i) =>
      makeStep(d, i < failedAtIndex ? 'done' : i === failedAtIndex ? 'error' : 'todo'),
    );
  }
  const idx = stepIndexOf(phase);
  return STEP_DEFS.map((d, i) =>
    // 'ready' is terminal: every step is done
    makeStep(d, idx === 3 ? 'done' : i < idx ? 'done' : i === idx ? 'active' : 'todo'),
  );
}

export interface FailureCopy {
  title: string;
  detail: string;
  action?: string;
}

/** DESIGN.md 3.1 failure copy, mapped from TransportError codes. */
export function connectFailureCopy(code: TransportErrorCode): FailureCopy {
  switch (code) {
    case 'PAIRING_FAILED':
      return {
        title: "Pairing didn't complete",
        detail: "Pairing didn't complete. Check the 6-digit code on the label and try again.",
        action:
          'If it keeps failing, remove the barrier in the phone Bluetooth settings (Forget), then retry.',
      };
    case 'NOT_AUTHORIZED':
      return {
        title: "This phone isn't an owner",
        detail:
          "This phone is paired but isn't an owner. The barrier already has 2 owners, or this phone was removed.",
        action:
          "The barrier isn't accepting new phones right now. Hold its button for 3 seconds, then try again within 60 seconds.",
      };
    case 'TIMEOUT':
      return {
        title: "Couldn't reach the barrier",
        detail: "Couldn't reach the barrier. Move closer and try again.",
      };
    case 'NOT_FOUND':
      return {
        title: 'Barrier not found',
        detail: 'No barrier answered. Move closer, check that it has power, and scan again.',
      };
    case 'BLUETOOTH_OFF':
      return {
        title: 'Bluetooth is off',
        detail: 'Turn on Bluetooth so this phone can find the barrier, then try again.',
      };
    case 'PERMISSION_DENIED':
      return {
        title: 'Bluetooth access needed',
        detail:
          'Allow Bluetooth for this app in Settings so it can find the barrier. It never uses the internet.',
      };
    case 'CONNECT_FAILED':
      return {
        title: "Couldn't connect",
        detail: "Couldn't connect to the barrier. Move closer and try again.",
      };
    case 'LINK_LOST':
      return {
        title: 'Connection lost',
        detail: 'The connection dropped. The barrier stops automatically if it was moving.',
      };
    default:
      return { title: 'Something went wrong', detail: 'The connection failed. Try again.' };
  }
}

/** 0-4 bars from RSSI (dBm). null = unknown -> 0 bars. */
export function rssiBars(rssi: number | null): 0 | 1 | 2 | 3 | 4 {
  if (rssi === null) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -67) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

/* ------------------------------------------------------------------ */
/* Result banner                                                       */
/* ------------------------------------------------------------------ */

export type HapticKind =
  | { type: 'impact'; style: 'light' | 'medium' | 'heavy' }
  | { type: 'notify'; kind: 'success' | 'warning' | 'error' }
  | null;

export interface ResultNotice {
  /** unique per event so identical results re-trigger */
  id: number;
  result: CmdResult;
  tone: 'positive' | 'warning' | 'critical' | 'tint';
  icon: 'checkmark-circle' | 'alert-circle' | 'warning' | 'stop-circle' | 'information-circle';
  title: string;
  detail?: string;
  /** one row per set guard bit (REJECTED_GUARD only) */
  rows?: GuardRow[];
  /** stays until dismissed / next command (GUARD); otherwise auto-dismiss */
  sticky: boolean;
  announce: string;
}

export interface NoticeInput {
  id: number;
  result: CmdResult;
  state: BarrierState;
  mask: number;
  zoneClear: boolean;
  sensorsValid: boolean;
  /** true if STOP was sent by this phone just before the result */
  userStopped: boolean;
  opcode?: Opcode;
}

/** STATE_MACHINE.md 3.2: the banner for a result. null = no banner. */
export function resultNotice(i: NoticeInput): ResultNotice | null {
  switch (i.result) {
    case CmdResult.COMPLETED: {
      const up = i.state === BarrierState.RAISED;
      const title = up ? 'Barrier is up' : 'Barrier is down';
      return {
        id: i.id,
        result: i.result,
        tone: 'positive',
        icon: 'checkmark-circle',
        title,
        sticky: false,
        announce: up ? 'Barrier raised' : 'Barrier lowered',
      };
    }
    case CmdResult.STOPPED: {
      const reasons: string[] = [];
      if (!i.zoneClear) reasons.push("Something's in the way");
      if (!i.sensorsValid) reasons.push('Sensor problem');
      return {
        id: i.id,
        result: i.result,
        tone: 'warning',
        icon: 'stop-circle',
        title: i.userStopped ? 'Stopped' : 'Stopped for safety',
        detail: reasons.length ? reasons.join('. ') : undefined,
        sticky: false,
        announce: reasons.length ? `Stopped. ${reasons.join('. ')}` : 'Barrier stopped',
      };
    }
    case CmdResult.REJECTED_AUTH:
      return {
        id: i.id,
        result: i.result,
        tone: 'critical',
        icon: 'alert-circle',
        title: 'Not authorized: reconnecting',
        detail: 'The barrier did not accept this session. The app will reconnect.',
        sticky: false,
        announce: 'Not authorized. Reconnecting.',
      };
    case CmdResult.REJECTED_STALE:
      return {
        id: i.id,
        result: i.result,
        tone: 'warning',
        icon: 'alert-circle',
        title: 'Command expired: try again',
        detail: 'The command arrived out of sequence. The app resynced; tap again.',
        sticky: false,
        announce: 'Command expired. Try again.',
      };
    case CmdResult.REJECTED_GUARD: {
      const rows = guardRows(i.mask);
      return {
        id: i.id,
        result: i.result,
        tone: 'warning',
        icon: 'alert-circle',
        title: "Can't move right now",
        rows,
        sticky: true,
        announce: rows.length ? `Can't move: ${rows[0]!.title}` : "Can't move right now",
      };
    }
    case CmdResult.REJECTED_FORMAT:
      return {
        id: i.id,
        result: i.result,
        tone: 'critical',
        icon: 'alert-circle',
        title: 'App error',
        detail: 'The barrier could not read the command. Update the app.',
        sticky: false,
        announce: 'App error',
      };
    default:
      return null; // NONE, ACCEPTED (hero animates), FAULT (FaultCard)
  }
}

/** STATE_MACHINE.md 3.2 haptic per result (the send tap is impact medium, handled at send). */
export function resultHaptic(result: CmdResult): HapticKind {
  switch (result) {
    case CmdResult.COMPLETED:
      return { type: 'notify', kind: 'success' };
    case CmdResult.STOPPED:
      return { type: 'impact', style: 'heavy' };
    case CmdResult.REJECTED_AUTH:
    case CmdResult.REJECTED_FORMAT:
    case CmdResult.FAULT:
      return { type: 'notify', kind: 'error' };
    case CmdResult.REJECTED_STALE:
    case CmdResult.REJECTED_GUARD:
      return { type: 'notify', kind: 'warning' };
    default:
      return null;
  }
}

/** Results the status feed reports; the other rejections come from the command outcome. */
export const FEED_RESULTS = new Set<CmdResult>([
  CmdResult.COMPLETED,
  CmdResult.STOPPED,
  CmdResult.REJECTED_GUARD,
  CmdResult.FAULT,
]);

export function statusKey(s: {
  lastCounter: number;
  lastResult: CmdResult;
  guardFailMask: number;
  state: BarrierState;
  fault: number;
}) {
  return `${s.lastCounter}|${s.lastResult}|${s.guardFailMask}|${s.state}|${s.fault}`;
}
