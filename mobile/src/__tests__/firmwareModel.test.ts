import vectors from '../../docs/vectors.json';
import { BarrierState, CmdResult, CmdvResult, FaultReason, Opcode, STATE_NAMES } from '../protocol/constants';
import { encodeCommand } from '../protocol/codec';
import {
  cmdValidate,
  cmdValidatorInit,
  cmdvToResult,
  FsmAction,
  FsmEvent,
  fsmInit,
  fsmPositionValid,
  fsmStep,
  motionGuardEvaluate,
  StopCause,
  type FsmState,
  type GuardInputs,
} from '../fsm/firmwareModel';

const stateByName = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([k, v]) => [v, Number(k) as BarrierState]),
) as Record<string, BarrierState>;
const evByName = FsmEvent as unknown as Record<string, FsmEvent>;
const actByName = FsmAction as unknown as Record<string, FsmAction>;
const resByName = CmdResult as unknown as Record<string, CmdResult>;
const faultByName = FaultReason as unknown as Record<string, FaultReason>;
const causeByName = StopCause as unknown as Record<string, StopCause>;

const guardOk = (): GuardInputs => ({
  ownerAuthorized: true,
  commandFresh: true,
  positionValid: true,
  sensorsValid: true,
  zoneClear: true,
  powerHealthy: true,
  faultLatched: false,
});

/**
 * vectors.fsm_matrix: every (state x event) pair, produced by fsm_step() from
 * firmware/components/barrier_fsm/barrier_fsm.c compiled on the host.
 * This covers every row of INTERFACES.md section 3 (docs/STATE_MACHINE.md maps rows to cases).
 */
describe('fsmStep matches compiled barrier_fsm.c for all 7 states x all events', () => {
  const rows = vectors.fsm_matrix.rows;
  it('matrix is complete (7 states x 12 cases)', () => {
    expect(rows).toHaveLength(84);
  });
  it.each(rows.map((r) => [r.from, r.event, r.guard ?? '-', r] as const))('%s + %s (%s)', (_f, _e, _g, r) => {
    const fsm: FsmState = {
      state: stateByName[r.from]!,
      fault: r.from === 'FAULT' ? FaultReason.LIMIT_CONFLICT : FaultReason.NONE,
      lastStopCause: StopCause.NONE,
    };
    let guard: GuardInputs | null = null;
    if (r.guard === 'guard_ok') guard = guardOk();
    if (r.guard === 'zone_blocked') guard = { ...guardOk(), zoneClear: false };
    const out = fsmStep(
      fsm,
      {
        type: evByName[r.event]!,
        fault: FaultReason.POWER_CRITICAL,
        stopCause: StopCause.OBSTRUCTION,
      },
      guard,
    );
    expect(STATE_NAMES[out.newState]).toBe(r.to);
    expect(STATE_NAMES[fsm.state]).toBe(r.to);
    expect(out.action).toBe(actByName[r.action]);
    expect(out.result).toBe(resByName[r.result]);
    expect(out.guardFailMask).toBe(r.guard_fail_mask);
    expect(out.armMotionTimer).toBe(r.arm_motion_timer);
    expect(out.cancelMotionTimer).toBe(r.cancel_motion_timer);
    expect(fsm.fault).toBe(faultByName[r.fault_after]);
    expect(fsm.lastStopCause).toBe(causeByName[r.last_stop_cause_after]);
  });
});

describe('fsmInit / fsmPositionValid', () => {
  it('boot positions', () => {
    expect(fsmInit(false, false).state).toBe(BarrierState.UNKNOWN);
    expect(fsmInit(true, false).state).toBe(BarrierState.RAISED);
    expect(fsmInit(false, true).state).toBe(BarrierState.LOWERED);
    expect(fsmInit(true, true)).toMatchObject({
      state: BarrierState.FAULT,
      fault: FaultReason.LIMIT_CONFLICT,
    });
  });
  it('UNKNOWN allows LOWER only (INTERFACES.md:110)', () => {
    expect(fsmPositionValid(BarrierState.UNKNOWN, Opcode.LOWER)).toBe(true);
    expect(fsmPositionValid(BarrierState.UNKNOWN, Opcode.RAISE)).toBe(false);
    expect(fsmPositionValid(BarrierState.RAISING, Opcode.STOP)).toBe(true);
  });
  it('null guard fails closed with every bit', () => {
    expect(motionGuardEvaluate(null)).toBe(0x7f);
  });
});

/** INTERFACES.md section 2 rules 1-8, mirroring vectors.freshness (host-compiled cmd_validator.c). */
describe('cmdValidate freshness rules (order and boundaries)', () => {
  const NONCE = 0xcafebabe;
  const mk = (last = 10) => {
    const v = cmdValidatorInit(last);
    v.sessionActive = true;
    v.sessionNonce = NONCE;
    return v;
  };
  const frame = (counter: number, nonce = NONCE, op = Opcode.RAISE) =>
    encodeCommand({ opcode: op, counter, nonce });
  const cases: [string, () => { r: CmdvResult; last: number }][] = [
    ['ok_next', () => run(mk(), frame(11))],
    ['replay_equal', () => run(mk(), frame(10))],
    ['replay_lower', () => run(mk(), frame(3))],
    ['window_edge_ok_+64', () => run(mk(), frame(74))],
    ['counter_jump_+65', () => run(mk(), frame(75))],
    ['bad_nonce', () => run(mk(), frame(11, 0x1234))],
    [
      'no_session',
      () => {
        const v = mk();
        v.sessionActive = false;
        return run(v, frame(11));
      },
    ],
    ['age_500ms_ok', () => run(mk(), frame(11), 0, 500)],
    ['age_500.001ms_expired', () => run(mk(), frame(11), 0, 500.001)],
    ['now_before_rx_expired', () => run(mk(), frame(11), 100, 99)],
    ['near_wrap_last_0xFFFFFFF0_ctr_0xFFFFFFFF_ok', () => run(mk(0xfffffff0), frame(0xffffffff))],
    ['nonce_checked_before_counter', () => run(mk(), frame(5, 0x1234))],
    ['parse_len10', () => run(mk(), new Uint8Array(10))],
    ['parse_opcode4', () => run(mk(), frame(11, NONCE, 4 as Opcode))],
    ['parse_opcode0', () => run(mk(), frame(11, NONCE, 0 as Opcode))],
  ];
  function run(v: ReturnType<typeof mk>, f: Uint8Array, rx = 0, now = 0) {
    const r = cmdValidate(v, f, rx, now).result;
    return { r, last: v.lastCounter };
  }
  it('covers every vector case', () => {
    expect(cases.map((c) => c[0]).sort()).toEqual(vectors.freshness.cases.map((c) => c.case).sort());
  });
  it.each(cases)('%s', (name, fn) => {
    const expected = vectors.freshness.cases.find((c) => c.case === name)!;
    const { r, last } = fn();
    expect(CmdvResult[r]).toBe(expected.cmdv_result);
    if ('last_counter_after' in expected) expect(last).toBe(expected.last_counter_after);
  });
  it('maps device-side codes to wire results like main.c:192-216', () => {
    expect(cmdvToResult(CmdvResult.REPLAY)).toBe(CmdResult.REJECTED_STALE);
    expect(cmdvToResult(CmdvResult.COUNTER_JUMP)).toBe(CmdResult.REJECTED_STALE);
    expect(cmdvToResult(CmdvResult.EXPIRED)).toBe(CmdResult.REJECTED_STALE);
    expect(cmdvToResult(CmdvResult.BAD_NONCE)).toBe(CmdResult.REJECTED_AUTH);
    expect(cmdvToResult(CmdvResult.NO_SESSION)).toBe(CmdResult.REJECTED_AUTH);
    expect(cmdvToResult(CmdvResult.BAD_LENGTH)).toBe(CmdResult.REJECTED_FORMAT);
    expect(cmdvToResult(CmdvResult.BAD_OPCODE)).toBe(CmdResult.REJECTED_FORMAT);
    expect(cmdvToResult(CmdvResult.OK)).toBe(CmdResult.NONE);
  });
});
