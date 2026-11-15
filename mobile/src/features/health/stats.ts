/**
 * Pure statistics over the on-phone event log. Everything here is phone-observed:
 * it is a proxy for Spec 5 and Spec 6, never the official score (tools/log_parser.py s6).
 */
import { SPEC5_AUTH_MAX_MS } from '../../protocol/constants';
import type { LogEntry } from '../../transport/types';

export type LogFilter = 'all' | 'commands' | 'auth' | 'faults';

export const LOG_FILTERS: { value: LogFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'commands', label: 'Commands' },
  { value: 'auth', label: 'Auth' },
  { value: 'faults', label: 'Faults' },
];

const hasFault = (e: LogEntry) => !!e.fault && e.fault !== 'NONE';

export function matchesFilter(e: LogEntry, f: LogFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'commands':
      return e.kind === 'command' || e.opcode !== undefined;
    case 'auth':
      return e.kind === 'auth' || e.kind === 'connect' || e.kind === 'disconnect';
    case 'faults':
      return e.kind === 'error' || hasFault(e) || e.result === 'FAULT';
  }
}

/** Reverse-chronological (newest first), filtered. Does not mutate the input. */
export function visibleEntries(entries: readonly LogEntry[], f: LogFilter): LogEntry[] {
  const out: LogEntry[] = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    if (matchesFilter(e, f)) out.push(e);
  }
  return out;
}

/** Nearest-rank percentile (p in 0..100). Empty input -> null. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1]!;
}

export interface AuthStats {
  count: number;
  p50: number | null;
  p95: number | null;
  /** fraction 0..1 of auth latencies <= limit; null when no samples */
  withinSpec: number | null;
  latest: number | null;
}

export function authStats(entries: readonly LogEntry[], limitMs = SPEC5_AUTH_MAX_MS): AuthStats {
  const samples = entries
    .filter((e) => e.kind === 'auth' && typeof e.latencyMs === 'number')
    .map((e) => e.latencyMs as number);
  return {
    count: samples.length,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    withinSpec: samples.length ? samples.filter((s) => s <= limitMs).length / samples.length : null,
    latest: samples.length ? samples[samples.length - 1]! : null,
  };
}

const ACCEPTED_RESULTS = new Set(['ACCEPTED', 'COMPLETED', 'STOPPED']);

export interface CommandTallies {
  /** commands that reached the barrier, or failed in flight */
  sent: number;
  accepted: number;
  rejected: number;
  /** FAULT results and write/notification failures (neither accepted nor rejected) */
  other: number;
  byResult: Record<string, number>;
}

/** Count command attempts: one log entry with opcode + result per attempt (retries count). */
export function commandTallies(entries: readonly LogEntry[]): CommandTallies {
  const t: CommandTallies = { sent: 0, accepted: 0, rejected: 0, other: 0, byResult: {} };
  for (const e of entries) {
    if (e.opcode === undefined) continue;
    if (e.kind === 'command' && e.result) {
      t.sent++;
      t.byResult[e.result] = (t.byResult[e.result] ?? 0) + 1;
      if (ACCEPTED_RESULTS.has(e.result)) t.accepted++;
      else if (e.result.startsWith('REJECTED_')) t.rejected++;
      else t.other++;
    } else if (e.kind === 'error') {
      t.sent++;
      t.other++;
    }
  }
  return t;
}

/** Entries belonging to the connection that started at `sinceMs` (epoch ms). */
export function sinceSession(entries: readonly LogEntry[], sinceMs: number | null): LogEntry[] {
  return sinceMs === null ? [...entries] : entries.filter((e) => e.t >= sinceMs);
}
