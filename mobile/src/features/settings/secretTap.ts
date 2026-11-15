import { useCallback, useRef } from 'react';

export interface SecretTapState {
  taps: number[];
}
export const initialSecretTap: SecretTapState = { taps: [] };

/**
 * Pure reducer: record a tap at `now`, drop taps older than `windowMs`, and fire when `count`
 * taps fall inside the window. After firing the counter resets.
 */
export function registerTap(
  state: SecretTapState,
  now: number,
  count = 5,
  windowMs = 3000,
): { state: SecretTapState; fired: boolean } {
  const taps = [...state.taps.filter((t) => now - t <= windowMs), now];
  if (taps.length >= count) return { state: initialSecretTap, fired: true };
  return { state: { taps }, fired: false };
}

export function useSecretTap(onFire: () => void, count = 5, windowMs = 3000, clock: () => number = Date.now) {
  const ref = useRef<SecretTapState>(initialSecretTap);
  return useCallback(() => {
    const r = registerTap(ref.current, clock(), count, windowMs);
    ref.current = r.state;
    if (r.fired) onFire();
  }, [onFire, count, windowMs, clock]);
}
