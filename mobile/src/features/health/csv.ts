/** RFC 4180 CSV for the on-phone event log (Spec 5 / Spec 6 evidence). */
import type { LogEntry } from '../../transport/types';

export const CSV_COLUMNS = [
  't_iso',
  't_ms',
  'kind',
  'transport',
  'message',
  'opcode',
  'counter',
  'result',
  'guard_fail_mask',
  'latency_ms',
  'state',
  'fault',
  'battery_mv',
] as const;

export function csvField(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function isoOf(t: number): string {
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Header + one row per entry, oldest first, CRLF separated, trailing CRLF. */
export function toCsv(entries: readonly LogEntry[]): string {
  const rows: string[] = [CSV_COLUMNS.join(',')];
  const ordered = [...entries].sort((a, b) => a.t - b.t || a.id - b.id);
  for (const e of ordered) {
    rows.push(
      [
        isoOf(e.t),
        e.t,
        e.kind,
        e.transport,
        e.message,
        e.opcode,
        e.counter,
        e.result,
        e.guardFailMask,
        e.latencyMs,
        e.state,
        e.fault,
        e.batteryMv,
      ]
        .map(csvField)
        .join(','),
    );
  }
  return rows.join('\r\n') + '\r\n';
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** m010-log-YYYYMMDD-HHMMSS.csv in local time. */
export function csvFilename(d: Date = new Date()): string {
  return (
    `m010-log-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}` +
    `-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.csv`
  );
}
