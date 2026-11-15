/**
 * BleTransport: BarrierClient over react-native-ble-plx.
 * SKELETON (Phase 1). Workstream E implements BleLinkProvider fully.
 * Status: untested on hardware.
 */
import { BarrierClient } from '../BarrierClient';
import { persistentCounterStore, type CounterStore } from '../counter';
import type { DeviceLink, LinkProvider } from '../link';
import { TransportError, type DiscoveredDevice } from '../types';

export class BleLinkProvider implements LinkProvider {
  async scan(_onDevice: (d: DiscoveredDevice) => void, _timeoutMs: number): Promise<void> {
    throw new TransportError('UNSUPPORTED', 'BLE transport not implemented yet');
  }
  stopScan() {}
  async connect(_deviceId: string): Promise<DeviceLink> {
    throw new TransportError('UNSUPPORTED', 'BLE transport not implemented yet');
  }
  destroy() {}
}

export function createBleTransport(opts: { counters?: CounterStore; provider?: LinkProvider } = {}) {
  return new BarrierClient({
    kind: 'ble',
    provider: opts.provider ?? new BleLinkProvider(),
    counters: opts.counters ?? persistentCounterStore,
  });
}
