/**
 * Wire contract constants. Source of truth: m010-barrier-firmware.
 * Citations are to that repo (see docs/CONTRACT.md for the full table).
 */

/** docs/INTERFACES.md:16 */
export const SERVICE_UUID = 'f5f61d53-97e4-4601-8204-81943dd7e865';
/** docs/INTERFACES.md:17 - write with response, 9-byte frame */
export const COMMAND_UUID = 'd6a1e91e-0067-4e39-b4b2-b9c0d3032d84';
/** docs/INTERFACES.md:18 - read + notify, 12 bytes */
export const STATUS_UUID = '40bad457-f09d-43a8-8ccf-fe7cf09786a1';
/** docs/INTERFACES.md:19 - read, 4-byte LE nonce */
export const SESSION_UUID = '1cd43f12-2ee3-472f-90c9-55907f75d50b';
/** firmware/components/barrier_types/include/app_config.h:73 */
export const DEVICE_NAME = 'M010-Barrier';

/** barrier_types.h:44 */
export const CMD_FRAME_LEN = 9;
/** docs/INTERFACES.md:35 */
export const STATUS_LEN = 12;
/** docs/INTERFACES.md:19 */
export const SESSION_LEN = 4;

/** app_config.h:65 - counter may jump ahead by at most this */
export const CMD_COUNTER_WINDOW = 64;
/** app_config.h:66 - frame must be consumed within this of arrival */
export const CMD_MAX_AGE_MS = 500;
/** app_config.h:52 */
export const MOTION_TIMEOUT_MS = 7000;
/** app_config.h:69 */
export const ENROLL_WINDOW_MS = 60000;
/** app_config.h:70 */
export const ENROLL_BUTTON_HOLD_MS = 3000;
/** ble_auth.h owner list; ble_auth/README.md - max 2 owner phones */
export const MAX_OWNERS = 2;

/** Requirements (FDR): Spec 5 auth <= 2 s, Spec 6 >= 90 %, Constraint 4 150 ms loop. */
export const SPEC5_AUTH_MAX_MS = 2000;
export const SPEC6_ACCURACY_MIN = 0.9;
export const C4_CONTROL_LOOP_MS = 150;

/** barrier_types.h:37-42 */
export enum Opcode {
  RAISE = 0x01,
  LOWER = 0x02,
  STOP = 0x03,
}

/** barrier_types.h:23-32 (note: RAISED = 1, LOWERED = 2) */
export enum BarrierState {
  UNKNOWN = 0,
  RAISED = 1,
  LOWERED = 2,
  RAISING = 3,
  LOWERING = 4,
  STOPPED = 5,
  FAULT = 6,
}

/** barrier_types.h:105-115 */
export enum CmdResult {
  NONE = 0,
  ACCEPTED = 1,
  COMPLETED = 2,
  STOPPED = 3,
  REJECTED_AUTH = 4,
  REJECTED_STALE = 5,
  REJECTED_GUARD = 6,
  REJECTED_FORMAT = 7,
  FAULT = 8,
}

/** barrier_types.h:117-124 */
export enum FaultReason {
  NONE = 0,
  MOTION_TIMEOUT = 1,
  LIMIT_CONFLICT = 2,
  SENSOR_PERSISTENT = 3,
  POWER_CRITICAL = 4,
  INTERNAL = 5,
}

/** barrier_types.h:88-97 */
export enum GuardBit {
  NOT_AUTHORIZED = 1 << 0,
  STALE_COMMAND = 1 << 1,
  INVALID_POSITION = 1 << 2,
  SENSORS_INVALID = 1 << 3,
  ZONE_NOT_CLEAR = 1 << 4,
  POWER_UNHEALTHY = 1 << 5,
  FAULT_LATCHED = 1 << 6,
}
export const GUARD_ALL_BITS: GuardBit[] = [
  GuardBit.NOT_AUTHORIZED,
  GuardBit.STALE_COMMAND,
  GuardBit.INVALID_POSITION,
  GuardBit.SENSORS_INVALID,
  GuardBit.ZONE_NOT_CLEAR,
  GuardBit.POWER_UNHEALTHY,
  GuardBit.FAULT_LATCHED,
];

/** docs/INTERFACES.md:43 */
export const FLAG_ZONE_CLEAR = 0x01;
export const FLAG_SENSORS_VALID = 0x02;
export const FLAG_OWNER_CONNECTED = 0x04;

/** cmd_validator.h:26-36 (device-internal; the phone only sees CmdResult, see main.c:192-216) */
export enum CmdvResult {
  OK = 0,
  BAD_LENGTH = 1,
  BAD_OPCODE = 2,
  NO_SESSION = 3,
  BAD_NONCE = 4,
  REPLAY = 5,
  COUNTER_JUMP = 6,
  EXPIRED = 7,
  NULL_ARG = 8,
}

export const STATE_NAMES: Record<BarrierState, string> = {
  [BarrierState.UNKNOWN]: 'UNKNOWN',
  [BarrierState.RAISED]: 'RAISED',
  [BarrierState.LOWERED]: 'LOWERED',
  [BarrierState.RAISING]: 'RAISING',
  [BarrierState.LOWERING]: 'LOWERING',
  [BarrierState.STOPPED]: 'STOPPED',
  [BarrierState.FAULT]: 'FAULT',
};
export const RESULT_NAMES: Record<CmdResult, string> = {
  [CmdResult.NONE]: 'NONE',
  [CmdResult.ACCEPTED]: 'ACCEPTED',
  [CmdResult.COMPLETED]: 'COMPLETED',
  [CmdResult.STOPPED]: 'STOPPED',
  [CmdResult.REJECTED_AUTH]: 'REJECTED_AUTH',
  [CmdResult.REJECTED_STALE]: 'REJECTED_STALE',
  [CmdResult.REJECTED_GUARD]: 'REJECTED_GUARD',
  [CmdResult.REJECTED_FORMAT]: 'REJECTED_FORMAT',
  [CmdResult.FAULT]: 'FAULT',
};
export const FAULT_NAMES: Record<FaultReason, string> = {
  [FaultReason.NONE]: 'NONE',
  [FaultReason.MOTION_TIMEOUT]: 'MOTION_TIMEOUT',
  [FaultReason.LIMIT_CONFLICT]: 'LIMIT_CONFLICT',
  [FaultReason.SENSOR_PERSISTENT]: 'SENSOR_PERSISTENT',
  [FaultReason.POWER_CRITICAL]: 'POWER_CRITICAL',
  [FaultReason.INTERNAL]: 'INTERNAL',
};
export const OPCODE_NAMES: Record<Opcode, 'RAISE' | 'LOWER' | 'STOP'> = {
  [Opcode.RAISE]: 'RAISE',
  [Opcode.LOWER]: 'LOWER',
  [Opcode.STOP]: 'STOP',
};

/** app_config.h:37-40 (LiFePO4 4S; values marked TBD-EE in firmware) */
export const BATTERY_PLAUSIBLE_MIN_MV = 8000;
export const BATTERY_PLAUSIBLE_MAX_MV = 15500;
export const BATTERY_HEALTHY_MIN_MV = 11800;
export const BATTERY_CRITICAL_MV = 11000;
/** main.c:378-379 - status task poll period (notifies when dirty) and heartbeat */
export const STATUS_POLL_MS = 20;
export const STATUS_HEARTBEAT_MS = 1000;

/** App-defined (not firmware): nominal arm travel used by SimDevice and the arm animation. */
export const MOTION_NOMINAL_MS = 4000;
