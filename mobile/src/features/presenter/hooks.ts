import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { SimDevice } from '../../sim/SimDevice';
import type { SimTransportHandle } from '../../transport/SimTransport';
import type { TransportSnapshot } from '../../transport/types';
import type { ScenarioRunner } from './runner';

export function useRunnerSnapshot(runner: ScenarioRunner) {
  return useSyncExternalStore(runner.subscribe, runner.getSnapshot, runner.getSnapshot);
}

const EMPTY: TransportSnapshot = {
  kind: 'sim',
  phase: 'idle',
  status: null,
  session: null,
  error: null,
  nextCounter: null,
  busy: false,
};
const noop = () => () => undefined;

/** Phone-side snapshot of the transport this run is using (the readout reflects it, not the global one). */
export function useHandleSnapshot(handle: SimTransportHandle | null): TransportSnapshot {
  const subscribe = useCallback(
    (l: () => void) => (handle ? handle.transport.subscribe(l) : noop()),
    [handle],
  );
  const get = useCallback(() => (handle ? handle.transport.getSnapshot() : EMPTY), [handle]);
  return useSyncExternalStore(subscribe, get, get);
}

/** Re-render whenever the simulated device changes (sensors, state, motion). */
export function useDeviceTick(device: SimDevice | null): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!device) return;
    return device.onChange(() => setN((x) => x + 1));
  }, [device]);
  return n;
}

/** Wall clock that ticks while `active`. */
export function useNow(active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, intervalMs]);
  return now;
}
