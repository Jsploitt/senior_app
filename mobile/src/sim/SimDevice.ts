/**
 * Deterministic simulation of the M010 unit at the GATT byte level.
 * Runs the ported firmware model (src/fsm/firmwareModel.ts) and mirrors
 * firmware/main/main.c handle_frame() and the status task, so the app sees
 * the same bytes, results and timings shape as from the real unit.
 *
 * Timers use setTimeout so tests drive it with jest fake timers.
 */
import { encodeSession, encodeStatus, type BarrierStatus } from '../protocol/codec';
import {
  BATTERY_CRITICAL_MV,
  BATTERY_HEALTHY_MIN_MV,
  BATTERY_PLAUSIBLE_MAX_MV,
  BATTERY_PLAUSIBLE_MIN_MV,
  BarrierState,
  CmdResult,
  CmdvResult,
  DEVICE_NAME,
  ENROLL_WINDOW_MS,
  FaultReason,
  MAX_OWNERS,
  MOTION_TIMEOUT_MS,
  Opcode,
  STATUS_HEARTBEAT_MS,
} from '../protocol/constants';
import {
  cmdValidate,
  cmdValidatorInit,
  cmdvToResult,
  FsmAction,
  FsmEvent,
  fsmInit,
  fsmStep,
  StopCause,
  type FsmEventInput,
  type FsmOutput,
  type FsmState,
  type GuardInputs,
  type ValidatorState,
} from '../fsm/firmwareModel';

export interface SimTimings {
  /** arm travel between limits (not specified by firmware; demo value) */
  travelMs: number;
  /** GATT connect + discovery */
  connectMs: number;
  /** Session read on an already-bonded phone (encryption restore) */
  sessionMs: number;
  /** first-time pairing (user types passkey in OS prompt) */
  pairingMs: number;
  /** BLE notify latency (status task poll 20 ms + connection interval) */
  notifyMs: number;
  /** ATT write response latency */
  writeMs: number;
}

export const DEFAULT_TIMINGS: SimTimings = {
  travelMs: 2600,
  connectMs: 280,
  sessionMs: 220,
  pairingMs: 1100,
  notifyMs: 35,
  writeMs: 25,
};

export interface SimSensors {
  obstructionValid: boolean;
  zoneClear: boolean;
  limitsValid: boolean;
  powerValid: boolean;
  batteryMv: number;
}

export type SimMotionFault = 'none' | 'jam' | 'wrong_limit';

export interface SimDeviceEvent {
  t: number;
  name: string;
  a: number;
  b: number;
}

export class SimDevice {
  readonly id = 'sim-m010-barrier';
  readonly name = DEVICE_NAME;
  timings: SimTimings;
  passkey = '246810';

  fsm: FsmState;
  validator: ValidatorState;
  sensors: SimSensors = {
    obstructionValid: true,
    zoneClear: true,
    limitsValid: true,
    powerValid: true,
    batteryMv: 12900,
  };
  status: BarrierStatus;
  owners: string[] = [];
  enrollmentOpenUntil = 0;
  nextMotionFault: SimMotionFault = 'none';
  /** UART-style evidence log (EVT,<t>,<NAME>,a,b) */
  evt: SimDeviceEvent[] = [];

  private ownerConn: string | null = null;
  private dirty = false;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private motionTimer: ReturnType<typeof setTimeout> | null = null;
  private limitTimer: ReturnType<typeof setTimeout> | null = null;
  private seed: number;
  private statusSubs = new Set<(b: Uint8Array) => void>();
  private dropSubs = new Set<(reason: string) => void>();
  private changeSubs = new Set<() => void>();
  /** motion bookkeeping for UI/animation helpers */
  motion: { dir: 'up' | 'down'; startedAt: number } | null = null;

  constructor(opts: { timings?: Partial<SimTimings>; seed?: number; prebondedOwner?: string } = {}) {
    this.timings = { ...DEFAULT_TIMINGS, ...opts.timings };
    this.seed = opts.seed ?? 0x5eed1234;
    this.fsm = fsmInit(false, true); // boots at the lowered limit
    this.validator = cmdValidatorInit(0);
    if (opts.prebondedOwner) this.owners.push(opts.prebondedOwner);
    this.status = {
      state: this.fsm.state,
      lastResult: CmdResult.NONE,
      fault: FaultReason.NONE,
      guardFailMask: 0,
      zoneClear: true,
      sensorsValid: true,
      ownerConnected: false,
      batteryMv: this.sensors.batteryMv,
      lastCounter: 0,
    };
  }

  /* ------------ observers (for presenter UI) ------------ */
  onChange(cb: () => void) {
    this.changeSubs.add(cb);
    return () => {
      this.changeSubs.delete(cb);
    };
  }
  private changed() {
    this.changeSubs.forEach((c) => c());
  }

  /* ------------ helpers ------------ */
  private rand(): number {
    // xorshift32, deterministic nonces
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed;
  }
  private log(name: string, a = 0, b = 0) {
    this.evt.push({ t: Date.now(), name, a, b });
    if (this.evt.length > 500) this.evt.shift();
  }
  get powerHealthy() {
    return this.sensors.powerValid && this.sensors.batteryMv >= BATTERY_HEALTHY_MIN_MV;
  }
  private interlockView() {
    const s = this.sensors;
    const powerValid =
      s.powerValid && s.batteryMv >= BATTERY_PLAUSIBLE_MIN_MV && s.batteryMv <= BATTERY_PLAUSIBLE_MAX_MV;
    return {
      sensorsValid: s.obstructionValid && s.limitsValid && powerValid,
      zoneClear: s.obstructionValid && s.zoneClear,
      powerHealthy: powerValid && s.batteryMv >= BATTERY_HEALTHY_MIN_MV,
    };
  }
  private updateSensorsInStatus() {
    const v = this.interlockView();
    this.status.zoneClear = v.zoneClear;
    this.status.sensorsValid = v.sensorsValid;
    this.status.batteryMv = this.sensors.batteryMv;
    this.markDirty();
  }
  private markDirty() {
    this.dirty = true;
    if (this.notifyTimer === null) {
      this.notifyTimer = setTimeout(() => {
        this.notifyTimer = null;
        this.flush();
      }, this.timings.notifyMs);
    }
    this.changed();
  }
  private flush() {
    if (!this.dirty) return;
    this.dirty = false;
    if (this.ownerConn) {
      const bytes = encodeStatus(this.status);
      this.statusSubs.forEach((s) => s(bytes.slice()));
    }
  }

  /** main.c apply_fsm_output */
  private apply(out: FsmOutput) {
    switch (out.action) {
      case FsmAction.DRIVE_UP:
      case FsmAction.DRIVE_DOWN:
        this.startMotion(out.action === FsmAction.DRIVE_UP ? 'up' : 'down');
        break;
      case FsmAction.STOP:
        this.stopMotion();
        break;
      default:
        break;
    }
    if (out.cancelMotionTimer && this.motionTimer) {
      clearTimeout(this.motionTimer);
      this.motionTimer = null;
    }
    if (out.armMotionTimer) {
      if (this.motionTimer) clearTimeout(this.motionTimer);
      this.motionTimer = setTimeout(() => {
        this.motionTimer = null;
        this.event({ type: FsmEvent.MOTION_TIMEOUT });
      }, MOTION_TIMEOUT_MS);
    }
    if (out.prevState !== out.newState) this.log('EVT_STATE', out.prevState, out.newState);
    this.status.state = out.newState;
    this.status.lastResult = out.result;
    if (out.result === CmdResult.REJECTED_GUARD) this.status.guardFailMask = out.guardFailMask;
    this.status.fault = this.fsm.fault;
    this.markDirty();
  }

  private startMotion(dir: 'up' | 'down') {
    this.motion = { dir, startedAt: Date.now() };
    this.log('EVT_ACT_DRIVE', dir === 'up' ? 1 : 2, 0);
    if (this.limitTimer) clearTimeout(this.limitTimer);
    const fault = this.nextMotionFault;
    this.nextMotionFault = 'none';
    if (fault === 'jam') return; // no limit ever arrives -> MOTION_TIMEOUT after 7 s
    const wrong = fault === 'wrong_limit';
    const delay = wrong ? Math.round(this.timings.travelMs * 0.45) : this.timings.travelMs;
    this.limitTimer = setTimeout(() => {
      this.limitTimer = null;
      const raisedLimit = dir === 'up' ? !wrong : wrong;
      this.event({ type: raisedLimit ? FsmEvent.LIMIT_RAISED : FsmEvent.LIMIT_LOWERED });
    }, delay);
  }
  private stopMotion() {
    if (this.motion) this.log('EVT_ACT_STOP_ISSUED', 0, 0);
    this.motion = null;
    if (this.limitTimer) {
      clearTimeout(this.limitTimer);
      this.limitTimer = null;
    }
  }

  /** Post an FSM event (limit, interlock, link lost, fault, fault clear). */
  event(ev: FsmEventInput) {
    const out = fsmStep(this.fsm, ev, null);
    this.apply(out);
    return out;
  }

  /* ------------ GATT-level behaviour ------------ */
  isBonded(phoneId: string) {
    return this.owners.includes(phoneId);
  }
  get enrollmentOpen() {
    return Date.now() < this.enrollmentOpenUntil;
  }
  /** Owner holds the enrollment button 3 s (ENROLL_BUTTON_HOLD_MS). */
  openEnrollment(windowMs = ENROLL_WINDOW_MS) {
    this.enrollmentOpenUntil = Date.now() + windowMs;
    this.log('EVT_ENROLL_OPEN', windowMs, 0);
    this.changed();
  }
  revokeAll() {
    this.owners = [];
    this.validator = cmdValidatorInit(0);
    this.status.lastCounter = 0;
    this.markDirty();
  }

  /** Called when a phone's link reaches the encrypted stage (Session read). */
  beginOwnerSession(phoneId: string): { ok: true; nonce: Uint8Array; pairedNow: boolean } | { ok: false } {
    let pairedNow = false;
    if (!this.isBonded(phoneId)) {
      if (!this.enrollmentOpen || this.owners.length >= MAX_OWNERS) return { ok: false };
      this.owners.push(phoneId);
      pairedNow = true;
      this.log('EVT_ENROLL_CLOSE', 1, 0);
    }
    const nonce = this.rand();
    this.validator.sessionActive = true;
    this.validator.sessionNonce = nonce;
    this.ownerConn = phoneId;
    this.status.ownerConnected = true;
    this.updateSensorsInStatus();
    this.startHeartbeat();
    this.log('EVT_OWNER_CONNECTED', 0, 0);
    return { ok: true, nonce: encodeSession(nonce), pairedNow };
  }

  get sessionActive() {
    return this.ownerConn !== null;
  }

  readStatusBytes(): Uint8Array {
    return encodeStatus(this.status);
  }

  subscribeStatus(cb: (b: Uint8Array) => void) {
    this.statusSubs.add(cb);
    return () => {
      this.statusSubs.delete(cb);
    };
  }
  subscribeDrop(cb: (reason: string) => void) {
    this.dropSubs.add(cb);
    return () => {
      this.dropSubs.delete(cb);
    };
  }

  /** main.c handle_frame. rxMs = arrival time; processing happens "now". */
  handleFrame(frame: Uint8Array, rxMs: number = Date.now()) {
    const parsed = cmdValidate(this.validator, frame, rxMs, Date.now());
    const r = parsed.result;
    if (r === CmdvResult.BAD_LENGTH || r === CmdvResult.BAD_OPCODE) {
      this.log('EVT_CMD_RX', frame.length >= 1 ? frame[0]! : -1, 0);
      this.log('EVT_CMD_RESULT', CmdResult.REJECTED_FORMAT, r);
      this.setResultOnly(CmdResult.REJECTED_FORMAT);
      return;
    }
    this.log('EVT_CMD_RX', parsed.opcode ?? 0, parsed.counter ?? 0);
    if (r === CmdvResult.OK) {
      this.status.lastCounter = parsed.counter!;
      this.markDirty();
    }
    const ownerOk = this.ownerConn !== null;
    if (parsed.opcode === Opcode.STOP) {
      if (r !== CmdvResult.OK || !ownerOk) {
        const rej = ownerOk ? cmdvToResult(r) : CmdResult.REJECTED_AUTH;
        this.log('EVT_CMD_RESULT', rej, r);
        this.setResultOnly(rej);
        return;
      }
      const out = fsmStep(this.fsm, { type: FsmEvent.CMD_STOP, stopCause: StopCause.COMMAND }, null);
      this.log('EVT_CMD_RESULT', out.result, r);
      this.apply(out);
      return;
    }
    if (r !== CmdvResult.OK) {
      const rej = cmdvToResult(r);
      this.log('EVT_CMD_RESULT', rej, r);
      this.setResultOnly(rej);
      return;
    }
    const v = this.interlockView();
    const guard: GuardInputs = {
      ownerAuthorized: ownerOk,
      commandFresh: true,
      positionValid: false,
      sensorsValid: v.sensorsValid,
      zoneClear: v.zoneClear,
      powerHealthy: v.powerHealthy,
      faultLatched: false,
    };
    this.updateSensorsInStatus();
    const out = fsmStep(
      this.fsm,
      { type: parsed.opcode === Opcode.RAISE ? FsmEvent.CMD_RAISE : FsmEvent.CMD_LOWER },
      guard,
    );
    this.log('EVT_CMD_RESULT', out.result, out.guardFailMask);
    this.apply(out);
  }

  private setResultOnly(result: CmdResult) {
    this.status.lastResult = result;
    this.markDirty();
  }

  /** Owner link dropped (any reason). main.c on_owner_disconnected. */
  dropOwner(reason = 'link lost') {
    if (!this.ownerConn) return;
    this.ownerConn = null;
    this.validator.sessionActive = false;
    this.status.ownerConnected = false;
    this.stopHeartbeat();
    this.event({ type: FsmEvent.LINK_LOST });
    this.log('EVT_OWNER_DISCONNECTED', 0, 0);
    this.dropSubs.forEach((d) => d(reason));
  }

  /** Clean disconnect initiated by the phone (still a link loss for the firmware). */
  phoneDisconnect() {
    if (!this.ownerConn) return;
    this.ownerConn = null;
    this.validator.sessionActive = false;
    this.status.ownerConnected = false;
    this.stopHeartbeat();
    this.event({ type: FsmEvent.LINK_LOST });
  }

  /* ------------ scenario knobs (presenter mode) ------------ */
  setSensors(p: Partial<SimSensors>) {
    const before = this.interlockView();
    this.sensors = { ...this.sensors, ...p };
    const after = this.interlockView();
    this.updateSensorsInStatus();
    const becameUnsafe =
      (before.zoneClear && !after.zoneClear) || (before.sensorsValid && !after.sensorsValid);
    if (becameUnsafe) {
      const cause = !after.zoneClear ? StopCause.OBSTRUCTION : StopCause.SENSOR_INVALID;
      this.log('EVT_UNSAFE_DETECTED', cause, 0);
      this.event({ type: FsmEvent.INTERLOCK_UNSAFE, stopCause: cause });
    }
    if (this.sensors.batteryMv < BATTERY_CRITICAL_MV && this.sensors.powerValid) {
      this.event({ type: FsmEvent.FAULT, fault: FaultReason.POWER_CRITICAL });
    }
  }
  injectFault(fault: FaultReason) {
    this.event({ type: FsmEvent.FAULT, fault });
  }
  /** On-site long press of the enrollment button (EV_FAULT_CLEAR). */
  clearFault() {
    // -> UNKNOWN; firmware then allows LOWER only (homing), INTERFACES.md:110
    this.event({ type: FsmEvent.FAULT_CLEAR });
  }

  get state(): BarrierState {
    return this.fsm.state;
  }
  /** Put the sim into UNKNOWN (e.g. after a power cut between limits). */
  rebootBetweenLimits() {
    this.stopMotion();
    if (this.motionTimer) clearTimeout(this.motionTimer);
    this.motionTimer = null;
    this.fsm = fsmInit(false, false);
    this.status.state = this.fsm.state;
    this.status.fault = FaultReason.NONE;
    this.status.lastResult = CmdResult.NONE;
    this.markDirty();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      this.dirty = true;
      this.flush();
    }, STATUS_HEARTBEAT_MS);
  }
  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  dispose() {
    this.stopHeartbeat();
    this.stopMotion();
    if (this.motionTimer) clearTimeout(this.motionTimer);
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    this.statusSubs.clear();
    this.dropSubs.clear();
    this.changeSubs.clear();
  }
}
