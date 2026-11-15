import { CSV_COLUMNS, csvField, csvFilename, toCsv } from '../csv';
import type { LogEntry } from '../../../transport/types';

const base: LogEntry = {
  id: 1,
  t: Date.UTC(2026, 10, 15, 8, 30, 0, 123),
  kind: 'auth',
  transport: 'sim',
  message: 'x',
};

describe('toCsv', () => {
  it('has the exact header', () => {
    expect(CSV_COLUMNS.join(',')).toBe(
      't_iso,t_ms,kind,transport,message,opcode,counter,result,guard_fail_mask,latency_ms,state,fault,battery_mv',
    );
    expect(toCsv([]).split('\r\n')[0]).toBe(CSV_COLUMNS.join(','));
  });

  it('uses CRLF and ends with CRLF', () => {
    const out = toCsv([base]);
    expect(out.endsWith('\r\n')).toBe(true);
    expect(out.split('\r\n')).toHaveLength(3);
  });

  it('writes a full row in column order, blanks for missing fields', () => {
    const e: LogEntry = {
      ...base,
      kind: 'command',
      message: 'RAISE -> ACCEPTED',
      opcode: 'RAISE',
      counter: 7,
      result: 'ACCEPTED',
      guardFailMask: 0,
      latencyMs: 84,
      state: 'RAISING',
      fault: 'NONE',
      batteryMv: 12800,
    };
    expect(toCsv([e]).split('\r\n')[1]).toBe(
      '2026-11-15T08:30:00.123Z,1794731400123,command,sim,RAISE -> ACCEPTED,RAISE,7,ACCEPTED,0,84,RAISING,NONE,12800',
    );
    expect(toCsv([base]).split('\r\n')[1]).toBe('2026-11-15T08:30:00.123Z,1794731400123,auth,sim,x,,,,,,,,');
  });

  it('quotes commas, quotes and newlines per RFC 4180', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('cr\rx')).toBe('"cr\rx"');
    expect(csvField(0)).toBe('0');
    expect(csvField(undefined)).toBe('');
    const out = toCsv([{ ...base, message: 'Link lost: "timeout", retry\nnow' }]);
    expect(out).toContain(',"Link lost: ""timeout"", retry\nnow",');
  });

  it('orders oldest first', () => {
    const out = toCsv([
      { ...base, id: 2, t: base.t + 10, message: 'second' },
      { ...base, id: 1, message: 'first' },
    ]).split('\r\n');
    expect(out[1]).toContain('first');
    expect(out[2]).toContain('second');
  });
});

describe('csvFilename', () => {
  it('formats m010-log-YYYYMMDD-HHMMSS.csv in local time', () => {
    expect(csvFilename(new Date(2026, 10, 5, 9, 4, 7))).toBe('m010-log-20261105-090407.csv');
  });
});
