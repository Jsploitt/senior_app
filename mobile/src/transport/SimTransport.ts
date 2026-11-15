/**
 * SimTransport: BarrierClient over a simulated GATT link to SimDevice.
 * Same codec, counter, resync and latency code path as BleTransport.
 */
import { SimDevice } from '../sim/SimDevice';
import { BarrierClient } from './BarrierClient';
import { memoryCounterStore, type CounterStore } from './counter';
import type { DeviceLink, LinkProvider } from './link';
import { TransportError, type DiscoveredDevice } from './types';

export const SIM_PHONE_ID = 'this-phone';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class SimLinkProvider implements LinkProvider {
  private scanning: ReturnType<typeof setTimeout> | null = null;
  /** test/presenter hook: make the next connect fail */
  failNextConnect = false;
  /** presenter hook: unit out of range (scan finds nothing) */
  outOfRange = false;

  constructor(
    public readonly device: SimDevice,
    private readonly phoneId = SIM_PHONE_ID,
  ) {}

  async scan(onDevice: (d: DiscoveredDevice) => void, timeoutMs: number) {
    await new Promise<void>((resolve) => {
      const found = setTimeout(
        () => {
          if (!this.outOfRange) onDevice({ id: this.device.id, name: this.device.name, rssi: -54 });
        },
        Math.min(450, timeoutMs),
      );
      this.scanning = setTimeout(
        () => {
          clearTimeout(found);
          this.scanning = null;
          resolve();
        },
        Math.min(timeoutMs, 900),
      );
    });
  }

  stopScan() {
    if (this.scanning) clearTimeout(this.scanning);
    this.scanning = null;
  }

  async connect(deviceId: string): Promise<DeviceLink> {
    const dev = this.device;
    await delay(dev.timings.connectMs);
    if (deviceId !== dev.id || this.outOfRange) throw new TransportError('NOT_FOUND', 'Barrier not in range');
    if (this.failNextConnect) {
      this.failNextConnect = false;
      throw new TransportError('CONNECT_FAILED', 'GATT connection failed (simulated)');
    }
    let open = true;
    const phoneId = this.phoneId;
    const drops = new Set<(r: string) => void>();
    const unsubDrop = dev.subscribeDrop((r) => {
      if (!open) return;
      open = false;
      drops.forEach((d) => d(r));
    });
    const guard = () => {
      if (!open) throw new TransportError('LINK_LOST', 'Link closed');
    };
    return {
      deviceId: dev.id,
      deviceName: dev.name,
      async readSession() {
        guard();
        const bonded = dev.isBonded(phoneId);
        await delay(bonded ? dev.timings.sessionMs : dev.timings.pairingMs);
        guard();
        const r = dev.beginOwnerSession(phoneId);
        if (!r.ok) {
          throw new TransportError(
            'NOT_AUTHORIZED',
            'Pairing rejected: enrollment window closed or owner list full (ATT insufficient authorization)',
          );
        }
        return r.nonce;
      },
      async readStatus() {
        guard();
        await delay(dev.timings.writeMs);
        guard();
        return dev.readStatusBytes();
      },
      async writeCommand(frame) {
        guard();
        await delay(dev.timings.writeMs);
        guard();
        dev.handleFrame(frame, Date.now());
      },
      onStatus(cb) {
        return dev.subscribeStatus((b) => {
          if (open) cb(b);
        });
      },
      onDisconnected(cb) {
        drops.add(cb);
        return () => {
          drops.delete(cb);
        };
      },
      async disconnect() {
        if (!open) return;
        open = false;
        unsubDrop();
        dev.phoneDisconnect();
      },
    };
  }

  destroy() {
    this.stopScan();
  }
}

export interface SimTransportHandle {
  transport: BarrierClient;
  device: SimDevice;
  provider: SimLinkProvider;
}

export function createSimTransport(
  opts: { counters?: CounterStore; prebonded?: boolean; device?: SimDevice } = {},
): SimTransportHandle {
  const device =
    opts.device ?? new SimDevice({ prebondedOwner: opts.prebonded === false ? undefined : SIM_PHONE_ID });
  const provider = new SimLinkProvider(device);
  const transport = new BarrierClient({
    kind: 'sim',
    provider,
    counters: opts.counters ?? memoryCounterStore(),
  });
  return { transport, device, provider };
}
