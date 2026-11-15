/**
 * Byte-level link to one barrier. Both the BLE implementation (ble-plx) and the
 * simulated device implement this, so BarrierClient runs the same codec,
 * counter and resync logic against either.
 */
import type { DiscoveredDevice } from './types';

export interface DeviceLink {
  readonly deviceId: string;
  readonly deviceName: string;
  /** Read Session (4 bytes). On BLE this is what triggers OS pairing. */
  readSession(): Promise<Uint8Array>;
  readStatus(): Promise<Uint8Array>;
  /** Write-with-response of a 9-byte frame. Resolves on ATT write response. */
  writeCommand(frame: Uint8Array): Promise<void>;
  onStatus(cb: (bytes: Uint8Array) => void): () => void;
  /** Fired once if the link drops (not when disconnect() was called). */
  onDisconnected(cb: (reason: string) => void): () => void;
  disconnect(): Promise<void>;
}

export interface LinkProvider {
  scan(onDevice: (d: DiscoveredDevice) => void, timeoutMs: number): Promise<void>;
  stopScan(): void;
  /** Connect + discover services. Resolves before any encrypted access. */
  connect(deviceId: string): Promise<DeviceLink>;
  destroy(): void;
}
