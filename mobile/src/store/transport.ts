/**
 * Active transport registry. One BarrierTransport at a time; switching
 * (Settings toggle / presenter mode) disconnects and destroys the old one.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { createSimTransport, type SimTransportHandle } from '../transport/SimTransport';
import type { BarrierTransport, TransportKind, TransportSnapshot } from '../transport/types';
import { persistentCounterStore } from '../transport/counter';
import { appendLog } from './eventLog';

let current: BarrierTransport | null = null;
let sim: SimTransportHandle | null = null;
let unlog: (() => void) | null = null;
const ls = new Set<() => void>();

function build(kind: TransportKind): BarrierTransport {
  if (kind === 'sim' || Platform.OS === 'web') {
    sim = createSimTransport({ counters: persistentCounterStore });
    return sim.transport;
  }
  sim = null;
  // Lazy: keep ble-plx (native module) out of web/test bundles.
  const { createBleTransport } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../transport/ble/BleTransport') as typeof import('../transport/ble/BleTransport');
  return createBleTransport();
}

export function getTransport(): BarrierTransport {
  if (!current) {
    // first use: create silently (no listener notification during render)
    current = build('sim');
    unlog = current.onLog(appendLog);
  }
  return current;
}

export function setTransportKind(kind: TransportKind) {
  if (current?.kind === kind) return;
  if (current) {
    void current.disconnect().catch(() => undefined);
    current.destroy();
    unlog?.();
  }
  current = build(kind);
  unlog = current.onLog(appendLog);
  ls.forEach((l) => l());
}

/** Simulation handle (device knobs) - only when the sim transport is active. */
export function getSim(): SimTransportHandle | null {
  return current?.kind === 'sim' ? sim : null;
}

const subscribeRegistry = (l: () => void) => {
  ls.add(l);
  return () => {
    ls.delete(l);
  };
};

export function useTransport(): BarrierTransport {
  return useSyncExternalStore(
    subscribeRegistry,
    () => getTransport(),
    () => getTransport(),
  );
}

export function useTransportSnapshot(): TransportSnapshot {
  const t = useTransport();
  return useSyncExternalStore(t.subscribe, t.getSnapshot, t.getSnapshot);
}

/** BLE is only available in a native dev/production build. */
export const bleSupported = Platform.OS === 'ios' || Platform.OS === 'android';
