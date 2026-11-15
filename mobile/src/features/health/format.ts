import {
  BATTERY_CRITICAL_MV,
  BATTERY_HEALTHY_MIN_MV,
  BATTERY_PLAUSIBLE_MAX_MV,
  BarrierState,
  CmdResult,
  FaultReason,
  FAULT_NAMES,
  RESULT_NAMES,
  STATE_NAMES,
} from '../../protocol/constants';

export const volts = (mv: number) => `${(mv / 1000).toFixed(2)} V`;
export const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
export const percent = (f: number) => `${Math.round(f * 100)}%`;

/** CONTRACT.md 4.1 UI titles */
export const FAULT_TITLES: Record<FaultReason, string> = {
  [FaultReason.NONE]: 'No fault',
  [FaultReason.MOTION_TIMEOUT]: "Arm didn't finish moving",
  [FaultReason.LIMIT_CONFLICT]: 'Position sensors disagree',
  [FaultReason.SENSOR_PERSISTENT]: 'Sensor failure',
  [FaultReason.POWER_CRITICAL]: 'Battery critically low',
  [FaultReason.INTERNAL]: 'Internal error',
};

export const RESULT_TITLES: Record<CmdResult, string> = {
  [CmdResult.NONE]: 'None',
  [CmdResult.ACCEPTED]: 'Moving',
  [CmdResult.COMPLETED]: 'Done',
  [CmdResult.STOPPED]: 'Stopped',
  [CmdResult.REJECTED_AUTH]: 'Not authorized',
  [CmdResult.REJECTED_STALE]: 'Command expired',
  [CmdResult.REJECTED_GUARD]: "Can't move right now",
  [CmdResult.REJECTED_FORMAT]: 'App error',
  [CmdResult.FAULT]: 'Barrier fault',
};

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export const stateLabel = (s: BarrierState) => (STATE_NAMES[s] ? title(STATE_NAMES[s]) : 'Unknown status');
/** Plain-language result; the firmware enum name stays in the CSV export only. */
export const resultLabel = (r: CmdResult) => RESULT_TITLES[r] ?? `Unknown (${r})`;
export const faultLabel = (f: FaultReason) => FAULT_TITLES[f] ?? `Unknown (${f})`;

const TITLE_BY_NAME: Record<string, string> = {};
for (const k of Object.keys(RESULT_NAMES)) {
  const r = Number(k) as CmdResult;
  TITLE_BY_NAME[RESULT_NAMES[r]] = RESULT_TITLES[r];
}
const FAULT_BY_NAME: Record<string, string> = {};
for (const k of Object.keys(FAULT_NAMES)) {
  const f = Number(k) as FaultReason;
  FAULT_BY_NAME[FAULT_NAMES[f]] = FAULT_TITLES[f];
}

/** Plain title for a firmware result name such as "REJECTED_GUARD"; unknown names pass through. */
export const resultTitleFromName = (name: string) => TITLE_BY_NAME[name] ?? name;
export const faultTitleFromName = (name: string) => FAULT_BY_NAME[name] ?? name;

const OPCODE_WORDS: Record<string, string> = { RAISE: 'Raise', LOWER: 'Lower', STOP: 'Stop' };

const stateWord = (w: string) => ((Object.values(STATE_NAMES) as string[]).includes(w) ? title(w) : w);

/** Replace raw enum names inside a log message with plain words. */
export function humanizeMessage(msg: string): string {
  return msg
    .replace(' -> ', ': ')
    .replace(
      /\b[A-Z][A-Z_]{3,}\b/g,
      (w) => TITLE_BY_NAME[w] ?? FAULT_BY_NAME[w] ?? OPCODE_WORDS[w] ?? stateWord(w),
    );
}
export const opcodeLabel = (op: string) => OPCODE_WORDS[op] ?? op;

export type BatteryBand = 'critical' | 'low' | 'healthy' | 'implausible';
export function batteryBand(mv: number): BatteryBand {
  if (mv > BATTERY_PLAUSIBLE_MAX_MV) return 'implausible';
  if (mv < BATTERY_CRITICAL_MV) return 'critical';
  if (mv < BATTERY_HEALTHY_MIN_MV) return 'low';
  return 'healthy';
}

/** Human age: "0.4 s", "12 s", "3 min". */
export function ageLabel(ms: number): string {
  if (ms < 10_000) return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
  if (ms < 120_000) return `${Math.round(ms / 1000)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

export function clockTime(t: number): string {
  const d = new Date(t);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** Label shared by Health and This barrier so both read the same field the same way. */
export const BARRIER_LAST_COUNTER_LABEL = "Barrier's last counter";
/** The newest Status.last_counter from the transport snapshot, or a placeholder when none is known. */
export const barrierLastCounter = (status: { lastCounter: number } | null | undefined): string =>
  status ? String(status.lastCounter) : 'Not connected';
