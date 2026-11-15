import {
  BarrierState,
  CmdResult,
  FaultReason,
  GuardBit,
  MOTION_TIMEOUT_MS,
  Opcode,
} from '../protocol/constants';
import { encodeCommand } from '../protocol/codec';
import { memoryCounterStore, nextCounter, withinWindow } from '../transport/counter';
import { createSimTransport } from '../transport/SimTransport';
import { SimDevice } from '../sim/SimDevice';
import { TransportError } from '../transport/types';

jest.useFakeTimers();

/** run a promise while advancing fake timers */
async function drive<T>(p: Promise<T>, stepMs = 10, maxMs = 120_000): Promise<T> {
  let done = false;
  let val: T | undefined;
  let err: unknown;
  p.then(
    (v) => {
      done = true;
      val = v;
    },
    (e) => {
      done = true;
      err = e;
    },
  );
  for (let t = 0; t < maxMs && !done; t += stepMs) await jest.advanceTimersByTimeAsync(stepMs);
  if (!done) throw new Error('promise never settled');
  if (err) throw err;
  return val as T;
}
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

async function connected(opts: Parameters<typeof createSimTransport>[0] = {}) {
  const h = createSimTransport(opts);
  const devices = await drive(h.transport.scan(1000));
  expect(devices.map((d) => d.name)).toEqual(['M010-Barrier']);
  const session = await drive(h.transport.connect(devices[0]!.id));
  return { ...h, session };
}

describe('counter helpers', () => {
  it('next = max(stored, status.last_counter) + 1', () => {
    expect(nextCounter(0, 0)).toBe(1);
    expect(nextCounter(10, 3)).toBe(11);
    expect(nextCounter(3, 10)).toBe(11);
    expect(nextCounter(0xffffffff, 0)).toBe(0); // uint32 wrap, firmware would then REPLAY -> resync
  });
  it('window check mirrors CMD_COUNTER_WINDOW=64', () => {
    expect(withinWindow(10, 74)).toBe(true);
    expect(withinWindow(10, 75)).toBe(false);
    expect(withinWindow(10, 10)).toBe(false);
  });
});

describe('SimTransport session', () => {
  it('connects, reads Session and Status, reports auth latency under Spec 5 (2 s)', async () => {
    const { transport, session } = await connected();
    const snap = transport.getSnapshot();
    expect(snap.phase).toBe('ready');
    expect(snap.status?.state).toBe(BarrierState.LOWERED);
    expect(snap.status?.ownerConnected).toBe(true);
    expect(session.authLatencyMs).toBeGreaterThan(0);
    expect(session.authLatencyMs).toBeLessThanOrEqual(2000);
    expect(snap.nextCounter).toBe(1);
  });

  it('rejects an unbonded phone when enrollment is closed', async () => {
    const h = createSimTransport({ prebonded: false });
    await expect(drive(h.transport.connect(h.device.id))).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
    expect(h.transport.getSnapshot().phase).toBe('error');
  });

  it('pairs during the 60 s enrollment window, max 2 owners', async () => {
    const h = createSimTransport({ prebonded: false });
    h.device.openEnrollment();
    await drive(h.transport.connect(h.device.id));
    expect(h.device.owners).toEqual(['this-phone']);
    await drive(h.transport.disconnect());
    // enrollment window expires
    await advance(61_000);
    expect(h.device.enrollmentOpen).toBe(false);
    // already bonded: reconnect works outside the window
    await drive(h.transport.connect(h.device.id));
    expect(h.transport.getSnapshot().phase).toBe('ready');
  });

  it('owner list full rejects a third phone', () => {
    const d = new SimDevice({ prebondedOwner: 'a' });
    d.owners.push('b');
    d.openEnrollment();
    expect(d.beginOwnerSession('c')).toEqual({ ok: false });
  });
});

describe('SimTransport commands follow the firmware FSM', () => {
  it('RAISE from LOWERED -> ACCEPTED, RAISING, then COMPLETED at RAISED', async () => {
    const { transport, device } = await connected();
    const out = await drive(transport.sendCommand(Opcode.RAISE));
    expect(out.result).toBe(CmdResult.ACCEPTED);
    expect(out.status.state).toBe(BarrierState.RAISING);
    expect(out.counter).toBe(1);
    expect(out.latencyMs).toBeLessThan(150);
    await advance(device.timings.travelMs + 100);
    expect(transport.getSnapshot().status).toMatchObject({
      state: BarrierState.RAISED,
      lastResult: CmdResult.COMPLETED,
    });
    expect(transport.getSnapshot().nextCounter).toBe(2);
  });

  it('LOWER from LOWERED -> REJECTED_GUARD with INVALID_POSITION', async () => {
    const { transport } = await connected();
    const out = await drive(transport.sendCommand(Opcode.LOWER));
    expect(out.result).toBe(CmdResult.REJECTED_GUARD);
    expect(out.guardFailMask).toBe(GuardBit.INVALID_POSITION);
    // guard-rejected frames still pass freshness, so the counter advanced (main.c:271-274)
    expect(out.status.lastCounter).toBe(1);
  });

  it('STOP while moving -> STOPPED, then RAISE/LOWER allowed from STOPPED', async () => {
    const { transport } = await connected();
    await drive(transport.sendCommand(Opcode.RAISE));
    await advance(500);
    const stop = await drive(transport.sendCommand(Opcode.STOP));
    expect(stop.result).toBe(CmdResult.STOPPED);
    expect(stop.status.state).toBe(BarrierState.STOPPED);
    const low = await drive(transport.sendCommand(Opcode.LOWER));
    expect(low.result).toBe(CmdResult.ACCEPTED);
    expect(low.status.state).toBe(BarrierState.LOWERING);
  });

  it('obstruction blocks motion (ZONE_NOT_CLEAR) and stops a moving arm (INTERLOCK_UNSAFE)', async () => {
    const { transport, device } = await connected();
    await drive(transport.sendCommand(Opcode.RAISE));
    await advance(300);
    device.setSensors({ zoneClear: false });
    await advance(100);
    expect(transport.getSnapshot().status).toMatchObject({ state: BarrierState.STOPPED, zoneClear: false });
    const out = await drive(transport.sendCommand(Opcode.RAISE));
    expect(out.result).toBe(CmdResult.REJECTED_GUARD);
    expect(out.guardFailMask & GuardBit.ZONE_NOT_CLEAR).toBeTruthy();
  });

  it('jammed arm -> FAULT(MOTION_TIMEOUT) after 7 s; commands rejected FAULT_LATCHED; fault clear -> UNKNOWN', async () => {
    const { transport, device } = await connected();
    device.nextMotionFault = 'jam';
    await drive(transport.sendCommand(Opcode.RAISE));
    await advance(MOTION_TIMEOUT_MS + 100);
    expect(transport.getSnapshot().status).toMatchObject({
      state: BarrierState.FAULT,
      fault: FaultReason.MOTION_TIMEOUT,
      lastResult: CmdResult.FAULT,
    });
    const rej = await drive(transport.sendCommand(Opcode.LOWER));
    expect(rej.guardFailMask).toBe(GuardBit.INVALID_POSITION | GuardBit.FAULT_LATCHED);
    device.clearFault();
    await advance(100);
    expect(transport.getSnapshot().status?.state).toBe(BarrierState.UNKNOWN);
    expect((await drive(transport.sendCommand(Opcode.RAISE))).guardFailMask).toBe(GuardBit.INVALID_POSITION);
    expect((await drive(transport.sendCommand(Opcode.LOWER))).result).toBe(CmdResult.ACCEPTED);
  });

  it('wrong limit while moving -> FAULT(LIMIT_CONFLICT)', async () => {
    const { transport, device } = await connected();
    device.nextMotionFault = 'wrong_limit';
    await drive(transport.sendCommand(Opcode.RAISE));
    await advance(device.timings.travelMs);
    expect(transport.getSnapshot().status).toMatchObject({
      state: BarrierState.FAULT,
      fault: FaultReason.LIMIT_CONFLICT,
    });
  });

  it('link loss while moving stops the arm and surfaces LINK_LOST', async () => {
    const { transport, device } = await connected();
    await drive(transport.sendCommand(Opcode.LOWER).catch(() => null));
    await drive(transport.sendCommand(Opcode.RAISE));
    await advance(300);
    device.dropOwner();
    await advance(50);
    expect(device.state).toBe(BarrierState.STOPPED);
    expect(transport.getSnapshot()).toMatchObject({ phase: 'disconnected', error: { code: 'LINK_LOST' } });
    await expect(transport.sendCommand(Opcode.STOP)).rejects.toBeInstanceOf(TransportError);
  });
});

describe('counter persistence and resync', () => {
  it('persists the accepted counter per device and resumes from it', async () => {
    const counters = memoryCounterStore();
    const device = new SimDevice({ prebondedOwner: 'this-phone' });
    const a = await connected({ counters, device });
    await drive(a.transport.sendCommand(Opcode.RAISE));
    await drive(a.transport.sendCommand(Opcode.STOP));
    expect(counters.dump()).toEqual({ [device.id]: 2 });
    await drive(a.transport.disconnect());
    const b = await drive(a.transport.connect(device.id));
    expect(b).toBeTruthy();
    expect(a.transport.getSnapshot().nextCounter).toBe(3);
  });

  it('uses status.last_counter when the device is ahead (other owner phone)', async () => {
    const device = new SimDevice({ prebondedOwner: 'this-phone' });
    device.validator.lastCounter = 40;
    device.status.lastCounter = 40;
    const { transport } = await connected({ device, counters: memoryCounterStore({ [device.id]: 7 }) });
    expect(transport.getSnapshot().nextCounter).toBe(41);
    expect((await drive(transport.sendCommand(Opcode.RAISE))).counter).toBe(41);
  });

  it('REPLAY: device moved ahead after connect -> REJECTED_STALE, resync once, retry succeeds', async () => {
    const counters = memoryCounterStore();
    const { transport, device } = await connected({ counters });
    device.validator.lastCounter = 20; // e.g. second owner phone used the unit meanwhile
    device.status.lastCounter = 20;
    const out = await drive(transport.sendCommand(Opcode.RAISE));
    expect(out.retried).toBe(true);
    expect(out.result).toBe(CmdResult.ACCEPTED);
    expect(out.counter).toBe(21);
    expect(counters.dump()[device.id]).toBe(21);
  });

  it('COUNTER_JUMP: stored counter far ahead (device bonds reset) -> resync to device last+1', async () => {
    const device = new SimDevice({ prebondedOwner: 'this-phone' });
    const counters = memoryCounterStore({ [device.id]: 500 });
    const { transport } = await connected({ device, counters });
    expect(transport.getSnapshot().nextCounter).toBe(501);
    const out = await drive(transport.sendCommand(Opcode.RAISE));
    expect(out.retried).toBe(true);
    expect(out.counter).toBe(1);
    expect(out.result).toBe(CmdResult.ACCEPTED);
  });

  it('second consecutive REJECTED_STALE is surfaced, not retried again', async () => {
    const { transport, device } = await connected();
    const realHandle = device.handleFrame.bind(device);
    // device rejects every frame as replay (simulated stuck validator)
    device.handleFrame = (f: Uint8Array) => {
      device.validator.lastCounter = 0xffffffff;
      realHandle(f);
    };
    const out = await drive(transport.sendCommand(Opcode.RAISE));
    expect(out.retried).toBe(true);
    expect(out.result).toBe(CmdResult.REJECTED_STALE);
  });

  it('a replayed frame injected by an attacker is rejected and does not move the arm', async () => {
    const { transport, device, session } = await connected();
    await drive(transport.sendCommand(Opcode.RAISE));
    await advance(device.timings.travelMs + 100);
    device.handleFrame(encodeCommand({ opcode: Opcode.LOWER, counter: 1, nonce: session.nonce }));
    await advance(100);
    expect(transport.getSnapshot().status).toMatchObject({
      state: BarrierState.RAISED,
      lastResult: CmdResult.REJECTED_STALE,
    });
  });

  it('a frame from an old session (stale nonce) is REJECTED_AUTH', async () => {
    const { transport, device, session } = await connected();
    await drive(transport.disconnect());
    await drive(transport.connect(device.id));
    device.handleFrame(encodeCommand({ opcode: Opcode.RAISE, counter: 99, nonce: session.nonce }));
    await advance(100);
    expect(transport.getSnapshot().status?.lastResult).toBe(CmdResult.REJECTED_AUTH);
    expect(device.state).toBe(BarrierState.LOWERED);
  });

  it('forget() clears the stored counter', async () => {
    const counters = memoryCounterStore();
    const { transport, device } = await connected({ counters });
    await drive(transport.sendCommand(Opcode.RAISE));
    await drive(transport.forget(device.id));
    expect(counters.dump()).toEqual({});
    expect(transport.getSnapshot().phase).toBe('idle');
  });
});
