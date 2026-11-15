import { BarrierState, CmdResult, GuardBit, Opcode, SPEC5_AUTH_MAX_MS } from '@/protocol/constants';
import {
  authLine,
  guardBlockWarning,
  colorRole,
  connectFailureCopy,
  connectionPill,
  connectSteps,
  controlEnablement,
  elapsedText,
  formatLatency,
  guardRows,
  holdTarget,
  latencyFill,
  latencyLabel,
  resultHaptic,
  resultNotice,
  restProgress,
  rssiBars,
  travelDuration,
} from '../logic';

const S = BarrierState;

describe('controlEnablement (STATE_MACHINE.md 3.1)', () => {
  // state -> [lower, raise, stop, stopProminent]
  const table: [BarrierState, boolean, boolean, boolean, boolean][] = [
    [S.UNKNOWN, true, false, true, false],
    [S.RAISED, true, false, true, false],
    [S.LOWERED, false, true, true, false],
    [S.RAISING, false, false, true, true],
    [S.LOWERING, false, false, true, true],
    [S.STOPPED, true, true, true, false],
    [S.FAULT, false, false, true, false],
  ];
  it.each(table)('state %i', (state, lower, raise, stop, prominent) => {
    const e = controlEnablement(state, true);
    expect(e.lower.enabled).toBe(lower);
    expect(e.raise.enabled).toBe(raise);
    expect(e.stop.enabled).toBe(stop);
    expect(e.stopProminent).toBe(prominent);
    if (!lower) expect(e.lower.reason).toBeTruthy();
    if (!raise) expect(e.raise.reason).toBeTruthy();
  });

  it('UNKNOWN explains the homing rule', () => {
    expect(controlEnablement(S.UNKNOWN, true).raise.reason).toBe('Lower first to confirm position');
  });

  it('disables everything, STOP included, when not connected', () => {
    for (const st of [null, S.LOWERED, S.RAISING]) {
      const e = controlEnablement(st, false);
      expect([e.lower.enabled, e.raise.enabled, e.stop.enabled]).toEqual([false, false, false]);
    }
    expect(controlEnablement(null, true).stop.enabled).toBe(false);
  });
});

describe('state presentation', () => {
  it('colour roles per STATE_MACHINE.md', () => {
    expect(colorRole(S.UNKNOWN)).toBe('neutral');
    expect(colorRole(S.RAISED)).toBe('accent');
    expect(colorRole(S.LOWERED)).toBe('success');
    expect(colorRole(S.RAISING)).toBe('motion');
    expect(colorRole(S.LOWERING)).toBe('motion');
    expect(colorRole(S.STOPPED)).toBe('warning');
    expect(colorRole(S.FAULT)).toBe('danger');
  });
  it('rest angles: lowered flat, raised up, others mid', () => {
    expect(restProgress(S.LOWERED)).toBe(0);
    expect(restProgress(S.RAISED)).toBe(1);
    expect(restProgress(S.STOPPED)).toBe(0.5);
    expect(restProgress(S.UNKNOWN)).toBe(0.5);
  });
  it('travel eases toward 95 % and scales the duration by remaining distance', () => {
    expect(holdTarget('up')).toBeCloseTo(0.95);
    expect(holdTarget('down')).toBeCloseTo(0.05);
    expect(travelDuration(0, 'up', 4000)).toBe(3800);
    expect(travelDuration(0.5, 'up', 4000)).toBe(1800);
    expect(travelDuration(1, 'down', 4000)).toBe(3800);
    expect(travelDuration(0.95, 'up', 4000)).toBe(120); // never zero
  });
  it('elapsed text flags overrun past the nominal travel', () => {
    expect(elapsedText(1200)).toEqual({ text: '1.2 s of about 4.0 s', slow: false });
    expect(elapsedText(5200).slow).toBe(true);
    expect(elapsedText(9000).text).toContain('7.0 s'); // capped at the firmware timeout
  });
});

describe('latency formatting', () => {
  it('formats seconds with two decimals', () => {
    expect(formatLatency(840)).toBe('0.84 s');
    expect(latencyLabel(840)).toBe('Authenticated in 0.84 s');
    expect(authLine(540)).toBe('Signed in 0.54 s · phone-measured');
    const rej = { result: CmdResult.REJECTED_GUARD };
    expect(guardBlockWarning(rej, { zoneClear: false, sensorsValid: true })).toMatch(/^Movement blocked/);
    expect(guardBlockWarning(rej, { zoneClear: true, sensorsValid: true })).toBeUndefined();
    expect(
      guardBlockWarning({ result: CmdResult.COMPLETED }, { zoneClear: false, sensorsValid: true }),
    ).toBeUndefined();
    expect(guardBlockWarning(null, { zoneClear: false, sensorsValid: true })).toBeUndefined();
    expect(formatLatency(2000)).toBe('2.00 s');
  });
  it('bar fill is relative to 1.5x the Spec 5 reference and clamped', () => {
    expect(latencyFill(0)).toBe(0);
    expect(latencyFill(SPEC5_AUTH_MAX_MS)).toBeCloseTo(2 / 3);
    expect(latencyFill(10_000)).toBe(1);
  });
});

describe('connection pill', () => {
  it('maps phases', () => {
    expect(connectionPill('idle', null, false).label).toBe('Not connected');
    expect(connectionPill('connecting', null, false).label).toBe('Connecting');
    expect(connectionPill('pairing', null, false).label).toBe('Pairing');
    expect(connectionPill('ready', true, false)).toEqual({ label: 'Connected', tone: 'positive' });
    expect(connectionPill('ready', false, false).label).toBe('Not an owner');
    expect(connectionPill('disconnected', null, true)).toEqual({
      label: 'Offline',
      tone: 'critical',
    });
  });
});

describe('guardRows', () => {
  it('one row per set bit, safety priority first', () => {
    const rows = guardRows(GuardBit.INVALID_POSITION | GuardBit.FAULT_LATCHED | GuardBit.ZONE_NOT_CLEAR);
    expect(rows.map((r) => r.bit)).toEqual([
      GuardBit.FAULT_LATCHED,
      GuardBit.ZONE_NOT_CLEAR,
      GuardBit.INVALID_POSITION,
    ]);
    expect(rows[1]!.title).toBe('Something is in the way');
  });
  it('adds a generic row for unknown bits and none for an empty mask', () => {
    expect(guardRows(0x80).map((r) => r.title)).toEqual(['Unknown reason']);
    expect(guardRows(0)).toEqual([]);
  });
});

describe('resultNotice / resultHaptic (STATE_MACHINE.md 3.2)', () => {
  const base = { id: 1, state: S.LOWERED, mask: 0, zoneClear: true, sensorsValid: true, userStopped: false };
  it('COMPLETED names the direction', () => {
    expect(resultNotice({ ...base, result: CmdResult.COMPLETED, state: S.RAISED })!.title).toBe(
      'Barrier is up',
    );
    expect(resultNotice({ ...base, result: CmdResult.COMPLETED })!.title).toBe('Barrier is down');
  });
  it('STOPPED adds the zone / sensor reason', () => {
    const n = resultNotice({ ...base, result: CmdResult.STOPPED, zoneClear: false })!;
    expect(n.title).toBe('Stopped for safety');
    expect(n.detail).toBe("Something's in the way");
    expect(resultNotice({ ...base, result: CmdResult.STOPPED, userStopped: true })!.title).toBe('Stopped');
  });
  it('REJECTED_GUARD expands rows and is sticky', () => {
    const n = resultNotice({ ...base, result: CmdResult.REJECTED_GUARD, mask: 0x44 })!;
    expect(n.title).toBe("Can't move right now");
    expect(n.rows).toHaveLength(2);
    expect(n.sticky).toBe(true);
  });
  it('stale / auth / format copy', () => {
    expect(resultNotice({ ...base, result: CmdResult.REJECTED_STALE })!.title).toBe(
      'Command expired: try again',
    );
    expect(resultNotice({ ...base, result: CmdResult.REJECTED_AUTH })!.title).toBe(
      'Not authorized: reconnecting',
    );
    expect(resultNotice({ ...base, result: CmdResult.REJECTED_FORMAT })!.title).toBe('App error');
  });
  it('no banner for NONE, ACCEPTED, FAULT', () => {
    for (const r of [CmdResult.NONE, CmdResult.ACCEPTED, CmdResult.FAULT]) {
      expect(resultNotice({ ...base, result: r })).toBeNull();
    }
  });
  it('haptics', () => {
    expect(resultHaptic(CmdResult.COMPLETED)).toEqual({ type: 'notify', kind: 'success' });
    expect(resultHaptic(CmdResult.REJECTED_GUARD)).toEqual({ type: 'notify', kind: 'warning' });
    expect(resultHaptic(CmdResult.FAULT)).toEqual({ type: 'notify', kind: 'error' });
    expect(resultHaptic(CmdResult.STOPPED)).toEqual({ type: 'impact', style: 'heavy' });
    expect(resultHaptic(CmdResult.ACCEPTED)).toBeNull();
    expect(Opcode.STOP).toBe(3);
  });
});

describe('connect steps and failure copy', () => {
  it('maps phases to the four steps', () => {
    const st = (p: Parameters<typeof connectSteps>[0], f?: number | null) =>
      connectSteps(p, f ?? null).map((s) => s.state);
    expect(st('idle')).toEqual(['todo', 'todo', 'todo', 'todo']);
    expect(st('connecting')).toEqual(['active', 'todo', 'todo', 'todo']);
    expect(st('pairing')).toEqual(['done', 'active', 'todo', 'todo']);
    expect(st('authorizing')).toEqual(['done', 'done', 'active', 'todo']);
    expect(st('ready')).toEqual(['done', 'done', 'done', 'done']);
    expect(st('error', 1)).toEqual(['done', 'error', 'todo', 'todo']);
  });
  it('step labels follow the design', () => {
    expect(connectSteps('idle').map((s) => s.label)).toEqual([
      'Connecting',
      'Securing (pairing)',
      'Checking owner',
      'Ready',
    ]);
  });
  it('has copy for every transport error code the connect flow can see', () => {
    expect(connectFailureCopy('PAIRING_FAILED').detail).toContain('6-digit code');
    expect(connectFailureCopy('NOT_AUTHORIZED').detail).toContain("isn't an owner");
    expect(connectFailureCopy('NOT_AUTHORIZED').action).toContain('3 seconds');
    expect(connectFailureCopy('TIMEOUT').detail).toBe(
      "Couldn't reach the barrier. Move closer and try again.",
    );
    for (const c of ['NOT_FOUND', 'BLUETOOTH_OFF', 'PERMISSION_DENIED', 'CONNECT_FAILED'] as const) {
      expect(connectFailureCopy(c).title.length).toBeGreaterThan(0);
    }
  });
  it('rssi bars', () => {
    expect(rssiBars(null)).toBe(0);
    expect(rssiBars(-54)).toBe(4);
    expect(rssiBars(-70)).toBe(2);
    expect(rssiBars(-95)).toBe(1);
  });
});
