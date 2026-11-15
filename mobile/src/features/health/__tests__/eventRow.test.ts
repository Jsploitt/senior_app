import { barrierLastCounter, BARRIER_LAST_COUNTER_LABEL } from '../format';
import { entryChips, entryMeta, resultTone } from '../EventRow';
import type { LogEntry } from '../../../transport/types';

describe('log chip semantics', () => {
  it('maps results to the hero state tones', () => {
    expect(resultTone('ACCEPTED')).toBe('tint');
    expect(resultTone('COMPLETED')).toBe('positive');
    expect(resultTone('STOPPED')).toBe('warning');
    expect(resultTone('REJECTED_GUARD')).toBe('warning');
    expect(resultTone('FAULT')).toBe('critical');
  });

  it('keeps counter and latency out of the chips', () => {
    const e = {
      id: 1,
      t: 0,
      kind: 'command',
      message: 'x',
      transport: 'sim',
      opcode: 'RAISE',
      counter: 7,
      latencyMs: 42,
      result: 'ACCEPTED',
    } as LogEntry;
    expect(entryChips(e).map((c) => c.label)).toEqual(['Moving']);
    expect(entryMeta(e)).toContain('#7');
    expect(entryMeta(e)).toContain('42 ms');
  });
});

describe('log chip dedupe', () => {
  const base = { id: 2, t: 0, kind: 'command', transport: 'sim', opcode: 'LOWER' } as const;
  it('drops a chip that repeats the row title or a status row result', () => {
    expect(entryChips({ ...base, message: 'LOWER -> ACCEPTED', result: 'ACCEPTED' } as LogEntry)).toEqual([]);
    expect(
      entryChips({ ...base, kind: 'status', message: 'State Lowering', result: 'ACCEPTED' } as LogEntry),
    ).toEqual([]);
  });
  it('keeps a chip that adds information', () => {
    const e = { ...base, message: 'Command sent', result: 'REJECTED_GUARD' } as LogEntry;
    expect(entryChips(e)).toHaveLength(1);
  });
});

describe('last counter', () => {
  it('reads the status value or a placeholder, with one label', () => {
    expect(barrierLastCounter({ lastCounter: 3 })).toBe('3');
    expect(barrierLastCounter(null)).toBe('Not connected');
    expect(BARRIER_LAST_COUNTER_LABEL).toBe("Barrier's last counter");
  });
});
