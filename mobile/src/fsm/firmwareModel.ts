/**
 * Line-by-line TypeScript port of the firmware's pure components, used by
 * SimTransport so the demo behaves like the real unit:
 *   - motion_guard.c        motionGuardEvaluate
 *   - barrier_fsm.c         fsmStep / fsmPositionValid / fsmInit
 *   - cmd_validator (INTERFACES.md section 2)  cmdValidate
 *   - main.c:192-216        cmdvToResult
 */
import {
  BarrierState,
  CMD_COUNTER_WINDOW,
  CMD_FRAME_LEN,
  CMD_MAX_AGE_MS,
  CmdResult,
  CmdvResult,
  FaultReason,
  GuardBit,
  Opcode,
} from '../protocol/constants';

export interface GuardInputs {
  ownerAuthorized: boolean;
  commandFresh: boolean;
  positionValid: boolean;
  sensorsValid: boolean;
  zoneClear: boolean;
  powerHealthy: boolean;
  faultLatched: boolean;
}

export const GUARD_ALL_FAIL =
  GuardBit.NOT_AUTHORIZED |
  GuardBit.STALE_COMMAND |
  GuardBit.INVALID_POSITION |
  GuardBit.SENSORS_INVALID |
  GuardBit.ZONE_NOT_CLEAR |
  GuardBit.POWER_UNHEALTHY |
  GuardBit.FAULT_LATCHED;

/** motion_guard.c motion_guard_evaluate */
export function motionGuardEvaluate(g: GuardInputs | null): number {
  if (g === null) return GUARD_ALL_FAIL;
  let m = 0;
  if (!g.ownerAuthorized) m |= GuardBit.NOT_AUTHORIZED;
  if (!g.commandFresh) m |= GuardBit.STALE_COMMAND;
  if (!g.positionValid) m |= GuardBit.INVALID_POSITION;
  if (!g.sensorsValid) m |= GuardBit.SENSORS_INVALID;
  if (!g.zoneClear) m |= GuardBit.ZONE_NOT_CLEAR;
  if (!g.powerHealthy) m |= GuardBit.POWER_UNHEALTHY;
  if (g.faultLatched) m |= GuardBit.FAULT_LATCHED;
  return m;
}

export enum FsmEvent {
  CMD_RAISE = 0,
  CMD_LOWER,
  CMD_STOP,
  LIMIT_RAISED,
  LIMIT_LOWERED,
  INTERLOCK_UNSAFE,
  LINK_LOST,
  MOTION_TIMEOUT,
  FAULT,
  FAULT_CLEAR,
}

export enum FsmAction {
  NONE = 0,
  DRIVE_UP,
  DRIVE_DOWN,
  STOP,
}

export enum StopCause {
  NONE = 0,
  COMMAND,
  LINK_LOST,
  OBSTRUCTION,
  SENSOR_INVALID,
  POWER,
  TIMEOUT,
  LIMIT_CONFLICT,
}

export interface FsmState {
  state: BarrierState;
  fault: FaultReason;
  lastStopCause: StopCause;
}

export interface FsmOutput {
  prevState: BarrierState;
  newState: BarrierState;
  action: FsmAction;
  result: CmdResult;
  guardFailMask: number;
  armMotionTimer: boolean;
  cancelMotionTimer: boolean;
}

export interface FsmEventInput {
  type: FsmEvent;
  fault?: FaultReason;
  stopCause?: StopCause;
}

const isMoving = (s: BarrierState) => s === BarrierState.RAISING || s === BarrierState.LOWERING;

function blank(prev: BarrierState): FsmOutput {
  return {
    prevState: prev,
    newState: prev,
    action: FsmAction.NONE,
    result: CmdResult.NONE,
    guardFailMask: 0,
    armMotionTimer: false,
    cancelMotionTimer: false,
  };
}

/** barrier_fsm.c fsm_init */
export function fsmInit(atRaised: boolean, atLowered: boolean): FsmState {
  if (atRaised && atLowered)
    return { state: BarrierState.FAULT, fault: FaultReason.LIMIT_CONFLICT, lastStopCause: StopCause.NONE };
  if (atRaised) return { state: BarrierState.RAISED, fault: FaultReason.NONE, lastStopCause: StopCause.NONE };
  if (atLowered)
    return { state: BarrierState.LOWERED, fault: FaultReason.NONE, lastStopCause: StopCause.NONE };
  return { state: BarrierState.UNKNOWN, fault: FaultReason.NONE, lastStopCause: StopCause.NONE };
}

/** barrier_fsm.c fsm_position_valid */
export function fsmPositionValid(state: BarrierState, cmd: Opcode): boolean {
  if (cmd === Opcode.STOP) return true;
  if (cmd === Opcode.RAISE) return state === BarrierState.LOWERED || state === BarrierState.STOPPED;
  if (cmd === Opcode.LOWER)
    return state === BarrierState.RAISED || state === BarrierState.STOPPED || state === BarrierState.UNKNOWN;
  return false;
}

/** barrier_fsm.c fsm_step. Mutates fsm (like the C code) and returns the output. */
export function fsmStep(fsm: FsmState, ev: FsmEventInput, guard: GuardInputs | null): FsmOutput {
  const out = blank(fsm.state);
  switch (ev.type) {
    case FsmEvent.CMD_RAISE:
    case FsmEvent.CMD_LOWER: {
      const raise = ev.type === FsmEvent.CMD_RAISE;
      let mask: number;
      if (guard === null) {
        mask = motionGuardEvaluate(null);
      } else {
        guard.positionValid = fsmPositionValid(fsm.state, raise ? Opcode.RAISE : Opcode.LOWER);
        guard.faultLatched = fsm.state === BarrierState.FAULT;
        mask = motionGuardEvaluate(guard);
      }
      if (mask === 0) {
        fsm.state = raise ? BarrierState.RAISING : BarrierState.LOWERING;
        out.newState = fsm.state;
        out.action = raise ? FsmAction.DRIVE_UP : FsmAction.DRIVE_DOWN;
        out.result = CmdResult.ACCEPTED;
        out.armMotionTimer = true;
      } else {
        out.result = CmdResult.REJECTED_GUARD;
        out.guardFailMask = mask;
      }
      return out;
    }
    case FsmEvent.CMD_STOP:
      out.action = FsmAction.STOP;
      out.result = CmdResult.STOPPED;
      if (isMoving(fsm.state)) {
        fsm.state = BarrierState.STOPPED;
        fsm.lastStopCause = StopCause.COMMAND;
        out.newState = BarrierState.STOPPED;
        out.cancelMotionTimer = true;
      } else if (fsm.state === BarrierState.STOPPED) {
        fsm.lastStopCause = StopCause.COMMAND;
      }
      return out;
    case FsmEvent.LIMIT_RAISED:
    case FsmEvent.LIMIT_LOWERED: {
      const raisedLimit = ev.type === FsmEvent.LIMIT_RAISED;
      out.action = FsmAction.STOP;
      switch (fsm.state) {
        case BarrierState.UNKNOWN:
        case BarrierState.STOPPED:
          fsm.state = raisedLimit ? BarrierState.RAISED : BarrierState.LOWERED;
          out.newState = fsm.state;
          break;
        case BarrierState.RAISING:
        case BarrierState.LOWERING: {
          const matches = raisedLimit === (fsm.state === BarrierState.RAISING);
          if (matches) {
            fsm.state = raisedLimit ? BarrierState.RAISED : BarrierState.LOWERED;
            out.result = CmdResult.COMPLETED;
          } else {
            fsm.state = BarrierState.FAULT;
            fsm.fault = FaultReason.LIMIT_CONFLICT;
            out.result = CmdResult.FAULT;
          }
          out.newState = fsm.state;
          out.cancelMotionTimer = true;
          break;
        }
        case BarrierState.FAULT:
          out.action = FsmAction.NONE;
          break;
        default:
          break; // RAISED / LOWERED: no state change, ACT_STOP
      }
      return out;
    }
    case FsmEvent.INTERLOCK_UNSAFE:
    case FsmEvent.LINK_LOST:
      if (isMoving(fsm.state)) {
        fsm.state = BarrierState.STOPPED;
        fsm.lastStopCause =
          ev.type === FsmEvent.LINK_LOST ? StopCause.LINK_LOST : (ev.stopCause ?? StopCause.NONE);
        out.newState = BarrierState.STOPPED;
        out.action = FsmAction.STOP;
        out.result = CmdResult.STOPPED;
        out.cancelMotionTimer = true;
      }
      return out;
    case FsmEvent.MOTION_TIMEOUT:
      if (isMoving(fsm.state)) {
        fsm.state = BarrierState.FAULT;
        fsm.fault = FaultReason.MOTION_TIMEOUT;
        out.newState = BarrierState.FAULT;
        out.action = FsmAction.STOP;
        out.result = CmdResult.FAULT;
        out.cancelMotionTimer = true;
      }
      return out;
    case FsmEvent.FAULT:
      if (fsm.state !== BarrierState.FAULT) {
        fsm.state = BarrierState.FAULT;
        fsm.fault = ev.fault ?? FaultReason.INTERNAL;
        out.newState = BarrierState.FAULT;
        out.action = FsmAction.STOP;
        out.result = CmdResult.FAULT;
        out.cancelMotionTimer = true;
      }
      return out;
    case FsmEvent.FAULT_CLEAR:
      if (fsm.state === BarrierState.FAULT) {
        fsm.state = BarrierState.UNKNOWN;
        fsm.fault = FaultReason.NONE;
        out.newState = BarrierState.UNKNOWN;
        out.action = FsmAction.STOP;
      }
      return out;
    default:
      out.action = FsmAction.STOP;
      return out;
  }
}

/* ---------------- cmd_validator ---------------- */

export interface ValidatorState {
  sessionActive: boolean;
  sessionNonce: number;
  lastCounter: number;
}

export function cmdValidatorInit(persistedLastCounter: number): ValidatorState {
  return { sessionActive: false, sessionNonce: 0, lastCounter: persistedLastCounter >>> 0 };
}

/** INTERFACES.md section 2, rules evaluated in order; first failing rule wins. */
export function cmdValidate(
  v: ValidatorState,
  frame: Uint8Array,
  rxMs: number,
  nowMs: number,
): { result: CmdvResult; opcode?: number; counter?: number } {
  if (frame.length !== CMD_FRAME_LEN) return { result: CmdvResult.BAD_LENGTH };
  const dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const opcode = dv.getUint8(0);
  const counter = dv.getUint32(1, true);
  const nonce = dv.getUint32(5, true);
  if (opcode !== Opcode.RAISE && opcode !== Opcode.LOWER && opcode !== Opcode.STOP)
    return { result: CmdvResult.BAD_OPCODE, opcode };
  if (!v.sessionActive) return { result: CmdvResult.NO_SESSION, opcode, counter };
  if (nonce !== v.sessionNonce) return { result: CmdvResult.BAD_NONCE, opcode, counter };
  if (counter <= v.lastCounter) return { result: CmdvResult.REPLAY, opcode, counter };
  // computed without uint32 overflow: counter - last > window
  if (counter - v.lastCounter > CMD_COUNTER_WINDOW)
    return { result: CmdvResult.COUNTER_JUMP, opcode, counter };
  // cmd_validator.c:79-80 also treats now < rx as EXPIRED (not stated in INTERFACES.md)
  if (nowMs < rxMs) return { result: CmdvResult.EXPIRED, opcode, counter };
  if (nowMs - rxMs > CMD_MAX_AGE_MS) return { result: CmdvResult.EXPIRED, opcode, counter };
  v.lastCounter = counter;
  return { result: CmdvResult.OK, opcode, counter };
}

/** main.c:192-216 cmdv_to_cmd_result */
export function cmdvToResult(r: CmdvResult): CmdResult {
  switch (r) {
    case CmdvResult.BAD_LENGTH:
    case CmdvResult.BAD_OPCODE:
    case CmdvResult.NULL_ARG:
      return CmdResult.REJECTED_FORMAT;
    case CmdvResult.NO_SESSION:
    case CmdvResult.BAD_NONCE:
      return CmdResult.REJECTED_AUTH;
    case CmdvResult.REPLAY:
    case CmdvResult.COUNTER_JUMP:
    case CmdvResult.EXPIRED:
      return CmdResult.REJECTED_STALE;
    default:
      return CmdResult.NONE;
  }
}
