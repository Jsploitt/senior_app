import { ENROLL_WINDOW_MS } from '../../protocol/constants';

export const ENROLL_RING_MS = ENROLL_WINDOW_MS;

/** Milliseconds left; full window before start, never negative. */
export function remainingMs(totalMs: number, startedAt: number | null, now: number): number {
  if (startedAt === null) return totalMs;
  return Math.max(0, Math.min(totalMs, totalMs - (now - startedAt)));
}

/** 1 -> full, 0 -> empty. */
export function ringFraction(totalMs: number, startedAt: number | null, now: number): number {
  return totalMs <= 0 ? 0 : remainingMs(totalMs, startedAt, now) / totalMs;
}

/** m:ss with ceiling, so the display reaches 0:00 exactly when time is up. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** Spoken form for VoiceOver. */
export function spokenCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${total} ${total === 1 ? 'second' : 'seconds'} left`;
}

export type EnrollTimerPhase = 'idle' | 'running' | 'expired';

export function timerPhase(totalMs: number, startedAt: number | null, now: number): EnrollTimerPhase {
  if (startedAt === null) return 'idle';
  return remainingMs(totalMs, startedAt, now) > 0 ? 'running' : 'expired';
}
