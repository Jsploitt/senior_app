/**
 * Hand-written fake of the react-native-ble-plx BleManager surface used by BleLinkProvider.
 * Test support only (never imported by app code).
 * Status: untested on hardware (no board/phone available on 2026-11-15): this fake encodes OUR
 * reading of the ble-plx and firmware behaviour, it does not prove either.
 */
import { SERVICE_UUID, COMMAND_UUID, STATUS_UUID, SESSION_UUID } from '../../../protocol/constants';

export type Outcome = { value: string } | { error: object } | 'hang';

export interface FakeConfig {
  state: string;
  deviceName: string | null;
  chars: string[];
  /** Consumed in order; the last entry repeats. */
  sessionReads: Outcome[];
  statusRead: Outcome;
  write: Outcome;
  connect: Outcome;
  monitorError: object | null;
}

export const defaultConfig = (): FakeConfig => ({
  state: 'PoweredOn',
  deviceName: 'M010-Barrier',
  chars: [COMMAND_UUID, STATUS_UUID, SESSION_UUID],
  sessionReads: [{ value: 'AAAAAA==' }],
  statusRead: { value: 'AAAAAAcAADIAAAAA' },
  write: { value: '' },
  connect: { value: '' },
  monitorError: null,
});

export function bleError(errorCode: number, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`BleError ${errorCode}`), {
    name: 'BleError',
    errorCode,
    attErrorCode: null,
    iosErrorCode: null,
    androidErrorCode: null,
    reason: null,
    ...extra,
  });
}

type Sub = { remove: () => void };

export class FakeBleManager {
  static config: FakeConfig = defaultConfig();
  static last: FakeBleManager | null = null;
  static reset(patch: Partial<FakeConfig> = {}) {
    FakeBleManager.config = { ...defaultConfig(), ...patch };
    FakeBleManager.last = null;
  }

  /** Ordered log of calls, for ordering assertions. */
  calls: string[] = [];
  writes: { service: string; char: string; b64: string }[] = [];
  scanArgs: { uuids: string[] | null; options: unknown } | null = null;
  scanListener: ((e: object | null, d: object | null) => void) | null = null;
  stateListener: ((s: string) => void) | null = null;
  disconnectListener: ((e: object | null, d: object | null) => void) | null = null;
  monitorListener: ((e: object | null, c: { value: string } | null) => void) | null = null;
  monitorRemoved = false;
  cancelledTransactions: string[] = [];
  cancelledConnections: string[] = [];
  destroyed = false;
  stateSubRemoved = false;
  private sessionIdx = 0;
  /** Hook: called after a write resolves, to emit a notification like the firmware would. */
  onWrite: ((b64: string) => void) | null = null;

  constructor() {
    FakeBleManager.last = this;
  }

  private cfg = () => FakeBleManager.config;
  private run(o: Outcome): Promise<{ value: string }> {
    if (o === 'hang') return new Promise(() => {});
    if ('error' in o) return Promise.reject(o.error);
    return Promise.resolve(o);
  }

  onStateChange(cb: (s: string) => void, emitCurrent?: boolean): Sub {
    this.calls.push('onStateChange');
    this.stateListener = cb;
    if (emitCurrent) void Promise.resolve().then(() => cb(this.cfg().state));
    return {
      remove: () => {
        this.stateSubRemoved = true;
      },
    };
  }
  emitState(s: string) {
    this.stateListener?.(s);
  }

  startDeviceScan(
    uuids: string[] | null,
    options: unknown,
    listener: (e: object | null, d: object | null) => void,
  ): Promise<void> {
    this.calls.push('startDeviceScan');
    this.scanArgs = { uuids, options };
    this.scanListener = listener;
    return Promise.resolve();
  }
  emitScan(id: string, name: string | null, localName: string | null, rssi: number | null) {
    this.scanListener?.(null, { id, name, localName, rssi });
  }
  stopDeviceScan(): Promise<void> {
    this.calls.push('stopDeviceScan');
    return Promise.resolve();
  }

  async connectToDevice(id: string, options?: unknown) {
    this.calls.push(`connectToDevice:${JSON.stringify(options)}`);
    await this.run(this.cfg().connect);
    return { id, name: this.cfg().deviceName, localName: null };
  }
  async cancelDeviceConnection(id: string) {
    this.calls.push('cancelDeviceConnection');
    this.cancelledConnections.push(id);
    return { id };
  }
  onDeviceDisconnected(_id: string, listener: (e: object | null, d: object | null) => void): Sub {
    this.calls.push('onDeviceDisconnected');
    this.disconnectListener = listener;
    return { remove: () => (this.disconnectListener = null) };
  }
  emitDisconnect(error: object | null = bleError(201)) {
    this.disconnectListener?.(error, null);
  }
  async discoverAllServicesAndCharacteristicsForDevice(id: string) {
    this.calls.push('discover');
    return { id };
  }
  async characteristicsForDevice(_id: string, service: string) {
    this.calls.push('characteristicsForDevice');
    if (service !== SERVICE_UUID) throw bleError(302);
    return this.cfg().chars.map((uuid) => ({ uuid }));
  }

  readCharacteristicForDevice(_id: string, service: string, char: string, tx?: string) {
    this.calls.push(`read:${char}:${tx}`);
    expectService(service);
    if (char === SESSION_UUID) {
      const reads = this.cfg().sessionReads;
      const o = reads[Math.min(this.sessionIdx++, reads.length - 1)]!;
      return this.run(o);
    }
    if (char === STATUS_UUID) return this.run(this.cfg().statusRead);
    return Promise.reject(bleError(404));
  }
  async writeCharacteristicWithResponseForDevice(
    _id: string,
    service: string,
    char: string,
    b64: string,
    tx?: string,
  ) {
    this.calls.push(`write:${char}:${tx}`);
    expectService(service);
    this.writes.push({ service, char, b64 });
    const r = await this.run(this.cfg().write);
    this.onWrite?.(b64);
    return r;
  }
  monitorCharacteristicForDevice(
    _id: string,
    service: string,
    char: string,
    listener: (e: object | null, c: { value: string } | null) => void,
  ): Sub {
    this.calls.push(`monitor:${char}`);
    expectService(service);
    this.monitorListener = listener;
    this.monitorRemoved = false;
    const err = this.cfg().monitorError;
    if (err) void Promise.resolve().then(() => listener(err, null));
    return { remove: () => (this.monitorRemoved = true) };
  }
  emitNotification(b64: string) {
    this.monitorListener?.(null, { value: b64 });
  }
  async cancelTransaction(tx: string) {
    this.cancelledTransactions.push(tx);
  }
  async destroy() {
    this.destroyed = true;
  }
}

function expectService(s: string) {
  if (s !== SERVICE_UUID) throw new Error(`unexpected service ${s}`);
}
