/**
 * Scenario definitions (docs/DESIGN.md 3.3). Row numbers refer to the
 * transition table in docs/STATE_MACHINE.md. Every step asserts its expected
 * outcome through the ScenarioCtx, so the UI reports what the simulator really did.
 */
import { fsmInit } from '../../fsm/firmwareModel';
import { toHex } from '../../protocol/codec';
import {
  BATTERY_HEALTHY_MIN_MV,
  BarrierState,
  CmdResult,
  CmdvResult,
  FaultReason,
  GuardBit,
  MOTION_NOMINAL_MS,
  MOTION_TIMEOUT_MS,
  Opcode,
  RESULT_NAMES,
  SPEC5_AUTH_MAX_MS,
  STATE_NAMES,
} from '../../protocol/constants';
import { RESULT_TEXT } from '../../protocol/messages';
import type { SimDevice } from '../../sim/SimDevice';
import { SIM_PHONE_ID } from '../../transport/SimTransport';
import { drawLogNormal, formatSeconds, percentile, seededRandom } from './stats';
import type { Scenario, ScenarioCtx, ScenarioStep } from './types';

/* ---------------- helpers ---------------- */

type BootPos = 'RAISED' | 'LOWERED' | 'UNKNOWN';

/** Boot configuration before the phone connects (what the limit switches read at power-up). */
function bootAt(device: SimDevice, pos: BootPos) {
  if (pos === 'UNKNOWN') {
    device.rebootBetweenLimits();
    return;
  }
  device.fsm = fsmInit(pos === 'RAISED', pos === 'LOWERED');
  device.status.state = device.fsm.state;
}

const travelTimeout = (ctx: ScenarioCtx) => ctx.device.timings.travelMs + 3000;
const name = (s: BarrierState) => STATE_NAMES[s];

const BATTERY_OK_MV = 12900;
const BATTERY_LOW_MV = 11700;
const BATTERY_CRIT_MV = 10900;

function reaches(state: BarrierState, result?: CmdResult) {
  return (s: { state: BarrierState; lastResult: CmdResult }) =>
    s.state === state && (result === undefined || s.lastResult === result);
}

/** Wait for the travel to finish at an end limit and assert the COMPLETED result. */
async function arrives(ctx: ScenarioCtx, state: BarrierState) {
  await ctx.until(
    `Limit switch confirms ${name(state)}`,
    reaches(state, CmdResult.COMPLETED),
    travelTimeout(ctx),
  );
}

const connectStep = (): ScenarioStep => ({
  title: 'Owner phone connects',
  narration:
    'BLE and Authorization: the bonded owner phone connects, reads a fresh Session nonce and the barrier Status. Auth latency is measured on the phone.',
  fsmRows: [],
  async run(ctx) {
    const s = await ctx.connect();
    ctx.check('Link', 'ready', ctx.transport.getSnapshot().phase);
    ctx.checkTrue('Owner connected flag set', ctx.status().ownerConnected);
    ctx.evidence('Auth latency (phone-measured, simulated)', formatSeconds(s.authLatencyMs));
    ctx.evidence('Session nonce', `0x${s.nonce.toString(16).padStart(8, '0')}`, true);
  },
});

const onSiteClearStep = (): ScenarioStep => ({
  title: 'On-site fault clear',
  narration:
    'A technician holds the unit button for 8 s. The Barrier Controller leaves FAULT for UNKNOWN and requires LOWER to re-home. The phone cannot clear a fault.',
  fsmRows: [29],
  async run(ctx) {
    ctx.device.clearFault();
    const s = await ctx.until('State becomes UNKNOWN', reaches(BarrierState.UNKNOWN), 2000);
    if (s) ctx.check('Fault', 'NONE', FaultName(s.fault));
  },
});

const FaultName = (f: FaultReason) => FaultReason[f] ?? String(f);

/* ---------------- scenarios ---------------- */

const happyPath: Scenario = {
  id: 'happy-path',
  title: 'Happy path',
  summary: 'Boot with the position unknown, home the arm, then a full lower / raise / lower cycle.',
  group: 'motion',
  autoConnect: false,
  setup: (d) => bootAt(d, 'UNKNOWN'),
  steps: [
    connectStep(),
    {
      title: 'LOWER from UNKNOWN (homing)',
      narration:
        'Position is unknown after power-up, so only LOWER is allowed. The Barrier Controller accepts it and starts a monitored movement.',
      fsmRows: [1],
      async run(ctx) {
        ctx.check('Starting state', 'UNKNOWN', name(ctx.status().state));
        await ctx.command(Opcode.LOWER, { result: CmdResult.ACCEPTED, state: BarrierState.LOWERING });
      },
    },
    {
      title: 'Lowered limit reached',
      narration: 'The lowered limit switch closes. The status says COMPLETED, proof the arm arrived.',
      fsmRows: [16],
      run: (ctx) => arrives(ctx, BarrierState.LOWERED),
    },
    {
      title: 'RAISE',
      narration: 'From LOWERED the position guard allows RAISE. The arm starts up.',
      fsmRows: [5],
      async run(ctx) {
        await ctx.command(Opcode.RAISE, { result: CmdResult.ACCEPTED, state: BarrierState.RAISING });
      },
    },
    {
      title: 'Raised limit reached',
      narration:
        'The raised limit switch closes: Space reserved. COMPLETED comes from the limit, not from the command.',
      fsmRows: [14],
      run: (ctx) => arrives(ctx, BarrierState.RAISED),
    },
    {
      title: 'LOWER',
      narration: 'The owner releases the space. RAISED allows LOWER.',
      fsmRows: [7],
      async run(ctx) {
        await ctx.command(Opcode.LOWER, { result: CmdResult.ACCEPTED, state: BarrierState.LOWERING });
      },
    },
    {
      title: 'Lowered again',
      narration: 'Full cycle complete: Open to park.',
      fsmRows: [16],
      run: (ctx) => arrives(ctx, BarrierState.LOWERED),
    },
  ],
};

const homing: Scenario = {
  id: 'homing',
  title: 'Homing: lower first',
  summary: 'With the position unknown, RAISE is refused. LOWER re-homes the arm.',
  group: 'motion',
  setup: (d) => bootAt(d, 'UNKNOWN'),
  steps: [
    {
      title: 'RAISE is rejected',
      narration:
        'The Barrier Controller does not know where the arm is, so a RAISE fails the ValidPosition guard (mask 0x04). The app explains why instead of failing silently.',
      fsmRows: [2],
      async run(ctx) {
        ctx.check('Starting state', 'UNKNOWN', name(ctx.status().state));
        await ctx.command(Opcode.RAISE, {
          result: CmdResult.REJECTED_GUARD,
          state: BarrierState.UNKNOWN,
          mask: GuardBit.INVALID_POSITION,
        });
      },
    },
    {
      title: 'LOWER is accepted',
      narration:
        'LOWER is the only motion allowed from UNKNOWN: drive down until a limit confirms the position.',
      fsmRows: [1],
      async run(ctx) {
        await ctx.command(Opcode.LOWER, { result: CmdResult.ACCEPTED, state: BarrierState.LOWERING });
      },
    },
    {
      title: 'Position confirmed',
      narration: 'The lowered limit closes. The position is known again and RAISE is allowed.',
      fsmRows: [16],
      run: (ctx) => arrives(ctx, BarrierState.LOWERED),
    },
  ],
};

const stopMidTravel: Scenario = {
  id: 'stop-mid-travel',
  title: 'Stop mid-travel',
  summary: 'STOP is always reachable. Resume from STOPPED in either direction.',
  group: 'motion',
  steps: [
    {
      title: 'RAISE',
      narration: 'Start raising from LOWERED.',
      fsmRows: [5],
      async run(ctx) {
        await ctx.command(Opcode.RAISE, { result: CmdResult.ACCEPTED, state: BarrierState.RAISING });
      },
    },
    {
      title: 'STOP',
      narration:
        'The owner presses STOP while the arm is moving. STOP is never guard-checked: the actuator stops and the state is STOPPED.',
      fsmRows: [18],
      async run(ctx) {
        await ctx.wait(1200);
        await ctx.command(Opcode.STOP, { result: CmdResult.STOPPED, state: BarrierState.STOPPED });
        ctx.checkTrue('Actuator is idle', ctx.device.motion === null);
      },
    },
    {
      title: 'RAISE from STOPPED',
      narration: 'Both directions are allowed from STOPPED. The arm continues up.',
      fsmRows: [9],
      async run(ctx) {
        await ctx.command(Opcode.RAISE, { result: CmdResult.ACCEPTED, state: BarrierState.RAISING });
      },
    },
    {
      title: 'Raised limit reached',
      narration: 'The raised limit closes and the move completes.',
      fsmRows: [14],
      run: (ctx) => arrives(ctx, BarrierState.RAISED),
    },
  ],
};

const obstruction: Scenario = {
  id: 'obstruction',
  title: 'Obstruction',
  summary:
    'Something enters the zone mid-travel: the arm stops, and motion is refused until the zone clears.',
  group: 'safety',
  setup: (d) => bootAt(d, 'RAISED'),
  steps: [
    {
      title: 'LOWER',
      narration: 'The arm starts down from RAISED.',
      fsmRows: [7],
      async run(ctx) {
        await ctx.command(Opcode.LOWER, { result: CmdResult.ACCEPTED, state: BarrierState.LOWERING });
      },
    },
    {
      title: 'Zone no longer clear',
      narration:
        'Safety Interlocks: the obstruction sensor reports an object. The controller stops the actuator on its own, without waiting for the phone.',
      fsmRows: [19],
      async run(ctx) {
        await ctx.wait(1200);
        ctx.device.setSensors({ zoneClear: false });
        const s = await ctx.until(
          'State becomes STOPPED',
          (x) => x.state === BarrierState.STOPPED && !x.zoneClear,
          2000,
        );
        if (s) ctx.check('Result', RESULT_NAMES[CmdResult.STOPPED], RESULT_NAMES[s.lastResult]);
        ctx.checkTrue('Actuator is idle', ctx.device.motion === null);
      },
    },
    {
      title: 'LOWER is rejected',
      narration:
        'While the zone is not clear the guard refuses motion (mask 0x10). The driver sees "Something is in the way".',
      fsmRows: [11],
      async run(ctx) {
        await ctx.command(Opcode.LOWER, {
          result: CmdResult.REJECTED_GUARD,
          state: BarrierState.STOPPED,
          mask: GuardBit.ZONE_NOT_CLEAR,
        });
      },
    },
    {
      title: 'Zone clears',
      narration:
        'The object leaves. The status shows the zone clear again; the arm stays STOPPED until told to move.',
      fsmRows: [],
      async run(ctx) {
        ctx.device.setSensors({ zoneClear: true });
        await ctx.until('Zone clear again', (x) => x.zoneClear && x.state === BarrierState.STOPPED, 2000);
      },
    },
    {
      title: 'LOWER from STOPPED',
      narration: 'With the guard satisfied, LOWER is accepted again.',
      fsmRows: [10],
      async run(ctx) {
        await ctx.command(Opcode.LOWER, { result: CmdResult.ACCEPTED, state: BarrierState.LOWERING });
      },
    },
    {
      title: 'Lowered limit reached',
      narration: 'The arm finishes the move.',
      fsmRows: [16],
      run: (ctx) => arrives(ctx, BarrierState.LOWERED),
    },
  ],
};

const interlockSensor: Scenario = {
  id: 'interlock-unsafe-sensor',
  title: 'Sensor failure',
  summary: 'A safety sensor goes invalid: stop, refuse, then latch a fault if it stays invalid for 2 s.',
  group: 'safety',
  steps: [
    {
      title: 'RAISE',
      narration: 'The arm starts up from LOWERED.',
      fsmRows: [5],
      async run(ctx) {
        await ctx.command(Opcode.RAISE, { result: CmdResult.ACCEPTED, state: BarrierState.RAISING });
      },
    },
    {
      title: 'Sensor becomes invalid',
      narration:
        'A limit-sensor reading goes invalid. Safety Interlocks stop the arm: an unreadable sensor is treated as unsafe.',
      fsmRows: [19],
      async run(ctx) {
        await ctx.wait(1000);
        ctx.device.setSensors({ limitsValid: false });
        const s = await ctx.until(
          'State becomes STOPPED',
          (x) => x.state === BarrierState.STOPPED && !x.sensorsValid,
          2000,
        );
        if (s) ctx.check('Result', RESULT_NAMES[CmdResult.STOPPED], RESULT_NAMES[s.lastResult]);
      },
    },
    {
      title: 'RAISE is rejected',
      narration: 'The guard refuses motion while sensors are invalid (mask 0x08): "Sensors not ready".',
      fsmRows: [11],
      async run(ctx) {
        await ctx.command(Opcode.RAISE, {
          result: CmdResult.REJECTED_GUARD,
          state: BarrierState.STOPPED,
          mask: GuardBit.SENSORS_INVALID,
        });
      },
    },
    {
      title: 'Invalid for 2 s: fault latches',
      narration:
        'The safety task declares SENSOR_PERSISTENT after 2 s of invalid input (FAULT_SENSOR_MS). The sim device does not run that timer, so the presenter waits 2 s and raises the same device event.',
      fsmRows: [26],
      async run(ctx) {
        await ctx.wait(2000);
        ctx.device.injectFault(FaultReason.SENSOR_PERSISTENT);
        const s = await ctx.until('State becomes FAULT', reaches(BarrierState.FAULT), 2000);
        if (s) ctx.check('Fault', 'SENSOR_PERSISTENT', FaultName(s.fault));
      },
    },
  ],
};

const limitConflict: Scenario = {
  id: 'limit-conflict',
  title: 'Limit conflict',
  summary: 'The wrong end-limit fires: fault latches, motion is locked, only an on-site clear recovers.',
  group: 'safety',
  steps: [
    {
      title: 'RAISE with a miswired limit',
      narration: 'The bench arms a limit-switch fault: while raising, the LOWERED limit will close.',
      fsmRows: [5],
      async run(ctx) {
        ctx.device.nextMotionFault = 'wrong_limit';
        await ctx.command(Opcode.RAISE, { result: CmdResult.ACCEPTED, state: BarrierState.RAISING });
      },
    },
    {
      title: 'Wrong limit: FAULT',
      narration:
        'Raising but the LOWERED limit closed: the position sensors disagree. The controller stops and latches LIMIT_CONFLICT.',
      fsmRows: [15],
      async run(ctx) {
        const s = await ctx.until('State becomes FAULT', reaches(BarrierState.FAULT), travelTimeout(ctx));
        if (s) {
          ctx.check('Fault', 'LIMIT_CONFLICT', FaultName(s.fault));
          ctx.check('Result', RESULT_NAMES[CmdResult.FAULT], RESULT_NAMES[s.lastResult]);
        }
      },
    },
    {
      title: 'RAISE is locked out',
      narration: 'Motion is refused while a fault is latched: mask 0x44 (position invalid + fault latched).',
      fsmRows: [28],
      async run(ctx) {
        await ctx.command(Opcode.RAISE, {
          result: CmdResult.REJECTED_GUARD,
          state: BarrierState.FAULT,
          maskHas: GuardBit.FAULT_LATCHED | GuardBit.INVALID_POSITION,
        });
      },
    },
    {
      title: 'STOP still works in FAULT',
      narration:
        'STOP is the only command allowed in every state. The result is STOPPED; the state stays FAULT.',
      fsmRows: [27],
      async run(ctx) {
        await ctx.command(Opcode.STOP, {
          result: CmdResult.STOPPED,
          state: BarrierState.FAULT,
          fault: FaultReason.LIMIT_CONFLICT,
        });
      },
    },
    onSiteClearStep(),
  ],
};

const motionTimeout: Scenario = {
  id: 'motion-timeout',
  title: 'Motion timeout',
  summary: 'The arm never reaches a limit. The 7 s motion timer expires and latches a fault.',
  group: 'safety',
  setup: (d) => bootAt(d, 'RAISED'),
  steps: [
    {
      title: 'LOWER into a jam',
      narration: `Nominal travel is ${MOTION_NOMINAL_MS / 1000} s. The bench arms a jam: no limit switch will ever close. Watch the motion timer.`,
      fsmRows: [7],
      async run(ctx) {
        ctx.device.nextMotionFault = 'jam';
        await ctx.command(Opcode.LOWER, { result: CmdResult.ACCEPTED, state: BarrierState.LOWERING });
        ctx.memo.motionStart = ctx.device.motion?.startedAt ?? Date.now();
      },
    },
    {
      title: 'Timer expires: FAULT',
      narration: `Past the ${MOTION_NOMINAL_MS / 1000} s nominal travel the app warns; at ${MOTION_TIMEOUT_MS / 1000} s the controller stops the motor and latches MOTION_TIMEOUT.`,
      fsmRows: [21],
      async run(ctx) {
        const s = await ctx.until(
          'State becomes FAULT',
          reaches(BarrierState.FAULT),
          MOTION_TIMEOUT_MS + 2500,
        );
        if (s) {
          ctx.check('Fault', 'MOTION_TIMEOUT', FaultName(s.fault));
          const start = typeof ctx.memo.motionStart === 'number' ? ctx.memo.motionStart : Date.now();
          const took = Date.now() - start;
          ctx.checkTrue(
            'Fault arrives at the 7 s timeout',
            took >= MOTION_TIMEOUT_MS - 100 && took <= MOTION_TIMEOUT_MS + 600,
            `${(took / 1000).toFixed(2)} s`,
          );
          ctx.evidence('Time from ACCEPTED to FAULT', `${(took / 1000).toFixed(2)} s`);
          ctx.checkTrue('Actuator is idle', ctx.device.motion === null);
        }
      },
    },
    onSiteClearStep(),
  ],
};

const lowBattery: Scenario = {
  id: 'low-battery',
  title: 'Low battery',
  summary: 'Battery below 11.8 V refuses motion; below 11.0 V it latches POWER_CRITICAL.',
  group: 'safety',
  steps: [
    {
      title: 'Battery sags to 11.7 V',
      narration: `Power health needs at least ${(BATTERY_HEALTHY_MIN_MV / 1000).toFixed(1)} V. The arm is idle, so nothing moves yet.`,
      fsmRows: [24],
      async run(ctx) {
        ctx.device.setSensors({ batteryMv: BATTERY_LOW_MV });
        const s = await ctx.until('Status reports 11.7 V', (x) => x.batteryMv === BATTERY_LOW_MV, 2000);
        if (s) ctx.check('State unchanged', 'LOWERED', name(s.state));
      },
    },
    {
      title: 'RAISE is rejected',
      narration: 'The guard refuses motion on unhealthy power (mask 0x20): "Battery too low".',
      fsmRows: [6],
      async run(ctx) {
        await ctx.command(Opcode.RAISE, {
          result: CmdResult.REJECTED_GUARD,
          state: BarrierState.LOWERED,
          mask: GuardBit.POWER_UNHEALTHY,
        });
      },
    },
    {
      title: 'Battery falls to 10.9 V',
      narration: 'Below the critical threshold the safety task latches POWER_CRITICAL.',
      fsmRows: [26],
      async run(ctx) {
        ctx.device.setSensors({ batteryMv: BATTERY_CRIT_MV });
        const s = await ctx.until('State becomes FAULT', reaches(BarrierState.FAULT), 2000);
        if (s) ctx.check('Fault', 'POWER_CRITICAL', FaultName(s.fault));
      },
    },
    {
      title: 'Solar recovers, on-site clear',
      narration:
        'The panel recharges the battery to 12.9 V. A technician still has to clear the latched fault on the unit.',
      fsmRows: [29],
      async run(ctx) {
        ctx.device.setSensors({ batteryMv: BATTERY_OK_MV });
        ctx.device.clearFault();
        const s = await ctx.until(
          'State becomes UNKNOWN',
          (x) => x.state === BarrierState.UNKNOWN && x.batteryMv === BATTERY_OK_MV,
          2000,
        );
        if (s) ctx.check('Fault', 'NONE', FaultName(s.fault));
      },
    },
  ],
};

const linkLost: Scenario = {
  id: 'link-lost',
  title: 'Link lost mid-travel',
  summary: 'The phone drops while the arm moves. The barrier stops by itself; reconnect gets a new nonce.',
  group: 'link',
  setup: (d) => bootAt(d, 'RAISED'),
  steps: [
    {
      title: 'LOWER',
      narration: 'The arm starts down.',
      fsmRows: [7],
      async run(ctx) {
        ctx.memo.nonce = ctx.transport.getSnapshot().session?.nonce ?? 0;
        await ctx.command(Opcode.LOWER, { result: CmdResult.ACCEPTED, state: BarrierState.LOWERING });
      },
    },
    {
      title: 'Phone link drops',
      narration:
        'Local protection does not depend on the phone: the Barrier Controller stops the actuator the moment the owner link is gone.',
      fsmRows: [20],
      async run(ctx) {
        await ctx.wait(1200);
        ctx.device.dropOwner('radio lost');
        ctx.check('Phone sees', 'disconnected', ctx.transport.getSnapshot().phase);
        ctx.check('Barrier Controller state', 'STOPPED', name(ctx.device.state));
        ctx.checkTrue('Actuator is idle', ctx.device.motion === null);
      },
    },
    {
      title: 'Reconnect with a new nonce',
      narration:
        'On reconnect the phone gets a fresh Session nonce and reads STOPPED. The old session is dead.',
      fsmRows: [20],
      async run(ctx) {
        const s = await ctx.connect();
        ctx.checkTrue('New nonce', s.nonce !== ctx.memo.nonce, 'same nonce reused');
        ctx.check('State read on reconnect', 'STOPPED', name(ctx.status().state));
        ctx.evidence('Old nonce', `0x${Number(ctx.memo.nonce).toString(16).padStart(8, '0')}`, true);
        ctx.evidence('New nonce', `0x${s.nonce.toString(16).padStart(8, '0')}`, true);
      },
    },
  ],
};

const replayedCommand: Scenario = {
  id: 'replayed-command',
  title: 'Replayed command',
  summary: 'Resent frames, counter jumps and old-session nonces are all rejected. Frame hex is shown.',
  group: 'link',
  steps: [
    {
      title: 'Accepted command',
      narration:
        'A normal RAISE with counter n and the session nonce is accepted. This is the frame an attacker would capture.',
      fsmRows: [5, 14],
      async run(ctx) {
        const nonce = ctx.transport.getSnapshot().session?.nonce ?? 0;
        const out = await ctx.command(Opcode.RAISE, {
          result: CmdResult.ACCEPTED,
          state: BarrierState.RAISING,
        });
        const frame = ctx.frame(Opcode.RAISE, out.counter, nonce);
        ctx.memo.frame = frame;
        ctx.memo.counter = out.counter;
        ctx.memo.nonce = nonce;
        ctx.evidence(`Accepted frame, counter ${out.counter}`, toHex(frame), true);
        await arrives(ctx, BarrierState.RAISED);
      },
    },
    {
      title: 'Same frame sent again',
      narration:
        'A replay of the captured bytes. The counter is not higher than the last accepted one: REJECTED_STALE (REPLAY). The arm does not move.',
      fsmRows: [],
      async run(ctx) {
        const s = await ctx.inject('Replayed frame', ctx.memo.frame as Uint8Array);
        ctx.check('Result', 'REJECTED_STALE', s ? RESULT_NAMES[s.lastResult] : 'no status');
        ctx.check('Device reason', 'REPLAY', cmdvName(ctx));
        ctx.check('State unchanged', 'RAISED', s ? name(s.state) : 'no status');
      },
    },
    {
      title: 'Counter jumps by 65',
      narration:
        'Counters may advance by at most 64. Counter + 65 is outside the window: REJECTED_STALE (COUNTER_JUMP).',
      fsmRows: [],
      async run(ctx) {
        const counter = Number(ctx.memo.counter) + 65;
        const s = await ctx.inject(
          `Counter ${counter}`,
          ctx.frame(Opcode.LOWER, counter, Number(ctx.memo.nonce)),
        );
        ctx.check('Result', 'REJECTED_STALE', s ? RESULT_NAMES[s.lastResult] : 'no status');
        ctx.check('Device reason', 'COUNTER_JUMP', cmdvName(ctx));
        ctx.check('State unchanged', 'RAISED', s ? name(s.state) : 'no status');
      },
    },
    {
      title: 'Reconnect: new session',
      narration:
        'The owner reconnects. The Session nonce changes, so nothing captured earlier is valid any more.',
      fsmRows: [24],
      async run(ctx) {
        await ctx.disconnect();
        const s = await ctx.connect();
        ctx.checkTrue('New nonce', s.nonce !== ctx.memo.nonce, 'same nonce reused');
        ctx.check('Link', 'ready', ctx.transport.getSnapshot().phase);
      },
    },
    {
      title: 'Old-session nonce',
      narration:
        'A fresh counter but the previous session nonce: REJECTED_AUTH (BAD_NONCE). Only the live session can command the barrier.',
      fsmRows: [],
      async run(ctx) {
        const counter = ctx.device.validator.lastCounter + 1;
        const s = await ctx.inject(
          'Old-nonce frame',
          ctx.frame(Opcode.LOWER, counter, Number(ctx.memo.nonce)),
        );
        ctx.check('Result', 'REJECTED_AUTH', s ? RESULT_NAMES[s.lastResult] : 'no status');
        ctx.check('Device reason', 'BAD_NONCE', cmdvName(ctx));
        ctx.check('State unchanged', 'RAISED', s ? name(s.state) : 'no status');
      },
    },
    {
      title: 'A genuine command still works',
      narration:
        'The legitimate phone sends LOWER with the new session. Accepted: rejection of attacks does not block the owner.',
      fsmRows: [7],
      async run(ctx) {
        await ctx.command(Opcode.LOWER, { result: CmdResult.ACCEPTED, state: BarrierState.LOWERING });
      },
    },
  ],
};

const guardRejects: Scenario = {
  id: 'guard-rejects',
  title: 'Every guard reason',
  summary: 'Cycles each guard bit and shows the exact copy the driver reads.',
  group: 'safety',
  steps: [
    {
      title: 'Invalid position',
      narration: 'LOWER while already LOWERED: not possible from this position (mask 0x04).',
      fsmRows: [6],
      async run(ctx) {
        await ctx.command(Opcode.LOWER, {
          result: CmdResult.REJECTED_GUARD,
          state: BarrierState.LOWERED,
          mask: GuardBit.INVALID_POSITION,
        });
      },
    },
    {
      title: 'Zone not clear',
      narration: 'An object over the arm (mask 0x10): "Something is in the way".',
      fsmRows: [6],
      async run(ctx) {
        ctx.device.setSensors({ zoneClear: false });
        await ctx.until('Zone reported not clear', (s) => !s.zoneClear, 2000);
        await ctx.command(Opcode.RAISE, {
          result: CmdResult.REJECTED_GUARD,
          state: BarrierState.LOWERED,
          mask: GuardBit.ZONE_NOT_CLEAR,
        });
        ctx.device.setSensors({ zoneClear: true });
        await ctx.until('Zone clear again', (s) => s.zoneClear, 2000);
      },
    },
    {
      title: 'Sensors invalid',
      narration: 'A safety sensor reading is missing (mask 0x08): "Sensors not ready".',
      fsmRows: [6],
      async run(ctx) {
        ctx.device.setSensors({ limitsValid: false });
        await ctx.until('Sensors reported invalid', (s) => !s.sensorsValid, 2000);
        await ctx.command(Opcode.RAISE, {
          result: CmdResult.REJECTED_GUARD,
          state: BarrierState.LOWERED,
          mask: GuardBit.SENSORS_INVALID,
        });
        ctx.device.setSensors({ limitsValid: true });
        await ctx.until('Sensors valid again', (s) => s.sensorsValid, 2000);
      },
    },
    {
      title: 'Power unhealthy',
      narration: 'Battery at 11.7 V, below the 11.8 V motion threshold (mask 0x20): "Battery too low".',
      fsmRows: [6],
      async run(ctx) {
        ctx.device.setSensors({ batteryMv: BATTERY_LOW_MV });
        await ctx.until('Battery reads 11.7 V', (s) => s.batteryMv === BATTERY_LOW_MV, 2000);
        await ctx.command(Opcode.RAISE, {
          result: CmdResult.REJECTED_GUARD,
          state: BarrierState.LOWERED,
          mask: GuardBit.POWER_UNHEALTHY,
        });
        ctx.device.setSensors({ batteryMv: BATTERY_OK_MV });
        await ctx.until('Battery healthy again', (s) => s.batteryMv === BATTERY_OK_MV, 2000);
      },
    },
    {
      title: 'Several reasons at once',
      narration: 'Zone blocked and battery low together: the mask is 0x30 and the app lists both reasons.',
      fsmRows: [6],
      async run(ctx) {
        ctx.device.setSensors({ zoneClear: false, batteryMv: BATTERY_LOW_MV });
        await ctx.until(
          'Both conditions reported',
          (s) => !s.zoneClear && s.batteryMv === BATTERY_LOW_MV,
          2000,
        );
        await ctx.command(Opcode.RAISE, {
          result: CmdResult.REJECTED_GUARD,
          state: BarrierState.LOWERED,
          mask: GuardBit.ZONE_NOT_CLEAR | GuardBit.POWER_UNHEALTHY,
        });
        ctx.device.setSensors({ zoneClear: true, batteryMv: BATTERY_OK_MV });
        await ctx.until('Healthy again', (s) => s.zoneClear && s.batteryMv === BATTERY_OK_MV, 2000);
      },
    },
    {
      title: 'Fault latched',
      narration:
        'After any fault the controller refuses motion (mask 0x44 = fault latched + position invalid).',
      fsmRows: [26, 28],
      async run(ctx) {
        ctx.device.injectFault(FaultReason.INTERNAL);
        await ctx.until('State becomes FAULT', reaches(BarrierState.FAULT), 2000);
        await ctx.command(Opcode.RAISE, {
          result: CmdResult.REJECTED_GUARD,
          state: BarrierState.FAULT,
          maskHas: GuardBit.FAULT_LATCHED | GuardBit.INVALID_POSITION,
        });
      },
    },
    {
      title: 'Not authorized / stale',
      narration:
        'The two remaining guard bits are enforced before the table, by the command validation: a bad nonce is REJECTED_AUTH and an old counter is REJECTED_STALE.',
      fsmRows: [],
      async run(ctx) {
        const nonce = ctx.transport.getSnapshot().session?.nonce ?? 0;
        const next = ctx.device.validator.lastCounter + 1;
        const a = await ctx.inject('Wrong nonce', ctx.frame(Opcode.RAISE, next, nonce ^ 0x1));
        ctx.check('Wrong nonce result', 'REJECTED_AUTH', a ? RESULT_NAMES[a.lastResult] : 'no status');
        ctx.evidence('App tells the driver', RESULT_TEXT[CmdResult.REJECTED_AUTH].title);
        const b = await ctx.inject(
          'Old counter',
          ctx.frame(Opcode.RAISE, ctx.device.validator.lastCounter, nonce),
        );
        ctx.check('Old counter result', 'REJECTED_STALE', b ? RESULT_NAMES[b.lastResult] : 'no status');
        ctx.evidence('App tells the driver', RESULT_TEXT[CmdResult.REJECTED_STALE].title);
      },
    },
  ],
};

const notOwner: Scenario = {
  id: 'not-owner',
  title: 'Not the owner',
  summary: 'An unbonded phone is refused while enrollment is closed. Opening the window enrolls it.',
  group: 'link',
  autoConnect: false,
  prebonded: false,
  steps: [
    {
      title: 'Unbonded phone connects',
      narration:
        'Pairing completes but the Session read is refused by BLE & Authorization (ATT insufficient authorization): this phone is not a bonded owner.',
      fsmRows: [],
      async run(ctx) {
        await ctx.expectConnectError('NOT_AUTHORIZED');
        ctx.check('Phone link', 'error', ctx.transport.getSnapshot().phase);
        ctx.check('Owners enrolled', 0, ctx.device.owners.length);
      },
    },
    {
      title: 'Forged command, no session',
      narration:
        'Even a well-formed frame sent without a session is dropped with REJECTED_AUTH. The arm does not move.',
      fsmRows: [],
      async run(ctx) {
        await ctx.inject('Forged frame', ctx.frame(Opcode.RAISE, 1, 0x1234));
        ctx.check('Controller result', 'REJECTED_AUTH', RESULT_NAMES[ctx.device.status.lastResult]);
        ctx.check('Barrier state', 'LOWERED', name(ctx.device.state));
        ctx.check('Device reason', 'NO_SESSION', cmdvName(ctx));
      },
    },
    {
      title: 'Owner opens enrollment',
      narration:
        'The owner holds the unit button for 3 s to open the 60 s enrollment window. Now the same phone pairs and is bonded.',
      fsmRows: [],
      async run(ctx) {
        ctx.device.openEnrollment();
        await ctx.connect();
        ctx.check('Phone link', 'ready', ctx.transport.getSnapshot().phase);
        ctx.checkTrue('Phone enrolled as owner', ctx.device.owners.includes(SIM_PHONE_ID));
        ctx.checkTrue('Owner connected flag set', ctx.status().ownerConnected);
      },
    },
  ],
};

const authLatency: Scenario = {
  id: 'auth-latency',
  title: 'Auth latency',
  summary: 'Repeated simulated connects with a configurable latency distribution, against the 2 s line.',
  group: 'link',
  autoConnect: false,
  steps: [
    {
      title: 'One owner connect',
      narration:
        'Auth latency: time from connect() to owner-authorized, measured on the phone. Default simulated timings.',
      fsmRows: [],
      async run(ctx) {
        const s = await ctx.connect();
        ctx.checkTrue('Owner authorized', ctx.transport.getSnapshot().phase === 'ready');
        ctx.evidence('Auth latency (phone-measured, simulated)', formatSeconds(s.authLatencyMs));
      },
    },
    {
      title: 'Repeated connects',
      narration:
        'Each connect draws its latency from a log-normal distribution (median and spread are adjustable in the drawer). The histogram fills live against the 2.0 s spec line.',
      fsmRows: [],
      async run(ctx) {
        const { connects, latencyMedianMs, latencySigma } = ctx.params;
        const rand = seededRandom(0x5eed + latencyMedianMs);
        const base = ctx.device.timings;
        let ok = 0;
        try {
          for (let i = 0; i < connects; i++) {
            const total = Math.max(60, Math.round(drawLogNormal(rand, latencyMedianMs, latencySigma)));
            ctx.device.timings = {
              ...base,
              connectMs: Math.round(total * 0.45),
              sessionMs: Math.round(total * 0.4),
              writeMs: Math.max(1, Math.round(total * 0.15)),
            };
            await ctx.disconnect();
            await ctx.connect();
            ok++;
          }
        } finally {
          ctx.device.timings = base;
        }
        ctx.check('Connects authorized', connects, ok);
        const p50 = percentile(ctx.samples(), 50);
        const p95 = percentile(ctx.samples(), 95);
        ctx.evidence(
          'Median / p95 (phone-measured, simulated)',
          `${formatSeconds(p50)} / ${formatSeconds(p95)}`,
        );
        ctx.evidence(
          'Against the spec line',
          p95 === null ? '--' : p95 <= SPEC5_AUTH_MAX_MS ? 'p95 is under 2.0 s' : 'p95 is over 2.0 s',
        );
      },
    },
  ],
};

function cmdvName(ctx: ScenarioCtx): string {
  const e = ctx.lastCmdEvt();
  return e ? (CmdvResult[e.detail] ?? String(e.detail)) : 'none';
}

export const SCENARIOS: Scenario[] = [
  happyPath,
  homing,
  stopMidTravel,
  obstruction,
  interlockSensor,
  limitConflict,
  motionTimeout,
  lowBattery,
  linkLost,
  replayedCommand,
  guardRejects,
  notOwner,
  authLatency,
];

export const SCENARIO_GROUPS: { id: Scenario['group']; title: string }[] = [
  { id: 'motion', title: 'Motion' },
  { id: 'safety', title: 'Safety interlocks' },
  { id: 'link', title: 'Link and authorization' },
];

export function findScenario(id: string | undefined): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
