/**
 * BleTransport: BarrierClient over react-native-ble-plx (see BleLinkProvider for the policies).
 * Status: untested on hardware (no board/phone available on 2026-11-15).
 */
import { BarrierClient } from '../BarrierClient';
import { persistentCounterStore, type CounterStore } from '../counter';
import type { LinkProvider } from '../link';
import { BleLinkProvider } from './BleLinkProvider';

export { BleLinkProvider, type BleLinkOptions } from './BleLinkProvider';
export { ensureBlePermissions, hasBlePermissions } from './permissions';

export function createBleTransport(opts: { counters?: CounterStore; provider?: LinkProvider } = {}) {
  return new BarrierClient({
    kind: 'ble',
    provider: opts.provider ?? new BleLinkProvider(),
    counters: opts.counters ?? persistentCounterStore,
  });
}
