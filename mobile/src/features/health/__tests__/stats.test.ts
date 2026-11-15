import type { LogEntry } from '../../../transport/types';
import { authStats, commandTallies, matchesFilter, percentile, sinceSession, visibleEntries } from '../stats';

let id = 0;
const e = (p: Partial<LogEntry>): LogEntry => ({
  id: ++id,
  t: 1000 + id,
  kind: 'status',
  transport: 'sim',
  message: 'm',
  ...p,
});
const auth = (ms: number) => e({ kind: 'auth', latencyMs: ms });
const cmd = (result: string, opcode = 'RAISE') => e({ kind: 'command', opcode, result, counter: id });

describe('percentile', () => {
  it('nearest rank', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    const v = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    expect(percentile(v, 50)).toBe(1000);
    expect(percentile(v, 95)).toBe(1900);
    expect(percentile([300, 100, 200], 50)).toBe(200);
  });
});

describe('authStats', () => {
  it('p50/p95 and share within 2 s, ignoring non-auth and entries without latency', () => {
    const entries = [
      auth(500),
      auth(900),
      auth(1500),
      auth(2000),
      auth(2600),
      e({ kind: 'auth' }),
      cmd('ACCEPTED'),
    ];
    const s = authStats(entries);
    expect(s.count).toBe(5);
    expect(s.p50).toBe(1500);
    expect(s.p95).toBe(2600);
    expect(s.withinSpec).toBeCloseTo(0.8);
    expect(s.latest).toBe(2600);
  });
  it('is empty-safe', () => {
    expect(authStats([])).toEqual({ count: 0, p50: null, p95: null, withinSpec: null, latest: null });
  });
});

describe('commandTallies', () => {
  it('splits accepted / rejected / other and counts by result', () => {
    const t = commandTallies([
      cmd('ACCEPTED'),
      cmd('COMPLETED'),
      cmd('STOPPED', 'STOP'),
      cmd('REJECTED_GUARD'),
      cmd('REJECTED_GUARD'),
      cmd('REJECTED_STALE'),
      cmd('FAULT'),
      e({ kind: 'error', opcode: 'RAISE', message: 'No status after command' }),
      e({ kind: 'command', message: 'Counter resync after REJECTED_STALE', counter: 3 }),
      e({ kind: 'error', message: 'unrelated' }),
    ]);
    expect(t.sent).toBe(8);
    expect(t.accepted).toBe(3);
    expect(t.rejected).toBe(3);
    expect(t.other).toBe(2);
    expect(t.byResult).toEqual({
      ACCEPTED: 1,
      COMPLETED: 1,
      STOPPED: 1,
      REJECTED_GUARD: 2,
      REJECTED_STALE: 1,
      FAULT: 1,
    });
  });
});

describe('filters', () => {
  const list = [
    e({ kind: 'connect' }),
    e({ kind: 'auth', latencyMs: 700 }),
    cmd('ACCEPTED'),
    e({ kind: 'status', fault: 'NONE' }),
    e({ kind: 'status', fault: 'MOTION_TIMEOUT' }),
    e({ kind: 'error' }),
    e({ kind: 'disconnect' }),
  ];
  it('all keeps everything, newest first', () => {
    const v = visibleEntries(list, 'all');
    expect(v).toHaveLength(7);
    expect(v[0]).toBe(list[6]);
    expect(list[0]!.kind).toBe('connect'); // input not mutated
  });
  it('commands / auth / faults', () => {
    expect(visibleEntries(list, 'commands').map((x) => x.kind)).toEqual(['command']);
    expect(visibleEntries(list, 'auth').map((x) => x.kind)).toEqual(['disconnect', 'auth', 'connect']);
    expect(visibleEntries(list, 'faults').map((x) => x.kind)).toEqual(['error', 'status']);
    expect(matchesFilter(e({ kind: 'command', result: 'FAULT', opcode: 'LOWER' }), 'faults')).toBe(true);
  });
});

describe('sinceSession', () => {
  it('keeps entries at or after the connection start', () => {
    const l = [e({ t: 10 }), e({ t: 20 }), e({ t: 30 })];
    expect(sinceSession(l, 20)).toHaveLength(2);
    expect(sinceSession(l, null)).toHaveLength(3);
  });
});
