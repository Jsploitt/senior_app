import { useCallback, useEffect, useState } from 'react';
import { ENROLL_RING_MS, timerPhase } from './countdown';

/** App-side enrollment countdown. The phone cannot read the device's own window. */
export function useEnrollTimer(totalMs: number = ENROLL_RING_MS, onStart?: () => void) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const phase = timerPhase(totalMs, startedAt, now);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [phase]);

  const start = useCallback(() => {
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    onStart?.();
  }, [onStart]);

  return { startedAt, now, phase, start, totalMs };
}
