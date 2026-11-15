/**
 * BleLinkProvider: LinkProvider / DeviceLink over react-native-ble-plx 3.5.1.
 * Status: untested on hardware (no board/phone available on 2026-11-15).
 *
 * Policies (see docs/CONTRACT.md and docs/STACK.md 6):
 * - No auto-reconnect here. A dropped link fires onDisconnected once; BarrierClient turns that into
 *   LINK_LOST and the UI offers Reconnect (a new connect() with a new nonce and a counter resync).
 *   Reconnecting silently could mask that the arm was stopped by the firmware on link loss.
 * - No artificial delays on the happy path. Time spent before the first Session read (permission,
 *   state wait, connect, discovery) is inside BarrierClient's authLatencyMs; the Android pairing
 *   retry delay is only taken after an authentication error, i.e. only while pairing.
 * - Every ble-plx call has its own timeout (STACK 6.3); ble-plx's own `timeout` covers connect only.
 * - A write timeout does NOT mean the frame was not delivered (CONTRACT 3): the counter logic in
 *   BarrierClient resyncs from Status.
 */
import { Platform } from 'react-native';
import {
  BleManager,
  State,
  type BleError,
  type Characteristic,
  type Device,
  type Subscription,
} from 'react-native-ble-plx';
import { fromBase64, toBase64 } from '../../protocol/codec';
import {
  CMD_FRAME_LEN,
  COMMAND_UUID,
  DEVICE_NAME,
  SERVICE_UUID,
  SESSION_UUID,
  STATUS_UUID,
} from '../../protocol/constants';
import type { DeviceLink, LinkProvider } from '../link';
import { TransportError, type DiscoveredDevice } from '../types';
import {
  ENROLLMENT_HINT,
  PAIRING_HINT,
  isAuthRequired,
  isBleErrorLike,
  isCancelled,
  isDisconnected,
  mapBleError,
  type ErrorContext,
} from './errors';
import { ensureBlePermissions } from './permissions';

export interface BleLinkOptions {
  /** Max wait for adapter PoweredOn once the state is known (e.g. PoweredOff). */
  powerOnTimeoutMs?: number;
  /** Max wait while the state is Unknown/Resetting (iOS shows its permission prompt here). */
  stateUnknownTimeoutMs?: number;
  connectTimeoutMs?: number;
  discoverTimeoutMs?: number;
  /** Timeout for each Status read / Command write / CCCD subscribe. */
  opTimeoutMs?: number;
  /** Total budget for the Session read incl. OS passkey entry (STACK 6.3: 45 s). */
  pairingDeadlineMs?: number;
  /** Android only: delay between Session read retries while bonding (STACK 6.2). */
  androidPairRetryMs?: number;
  log?: (message: string) => void;
}

const DEFAULTS = {
  powerOnTimeoutMs: 3000,
  stateUnknownTimeoutMs: 30_000,
  connectTimeoutMs: 10_000,
  discoverTimeoutMs: 8000,
  opTimeoutMs: 4000,
  pairingDeadlineMs: 45_000,
  androidPairRetryMs: 1000,
};

type Cfg = typeof DEFAULTS & { log: (m: string) => void };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class BleLinkProvider implements LinkProvider {
  private readonly cfg: Cfg;
  private manager: BleManager | null = null;
  private stateSub: Subscription | null = null;
  private adapterState: State = State.Unknown;
  private stateListeners = new Set<(s: State) => void>();
  private stopCurrentScan: (() => void) | null = null;
  private activeLink: BleDeviceLink | null = null;
  private txSeq = 0;

  constructor(opts: BleLinkOptions = {}) {
    this.cfg = { ...DEFAULTS, log: () => {}, ...stripUndefined(opts) };
  }

  /** Lazy single manager; the state subscription lives as long as the manager. */
  private mgr(): BleManager {
    if (!this.manager) {
      const m = new BleManager();
      this.manager = m;
      this.stateSub = m.onStateChange((s) => {
        this.adapterState = s;
        this.stateListeners.forEach((l) => l(s));
      }, true);
    }
    return this.manager;
  }

  /** Permissions, then wait for PoweredOn. Immediate when the state is already known to be on. */
  private async ensureReady(): Promise<BleManager> {
    await ensureBlePermissions();
    const m = this.mgr();
    await this.waitPoweredOn();
    return m;
  }

  private waitPoweredOn(): Promise<void> {
    const { powerOnTimeoutMs, stateUnknownTimeoutMs } = this.cfg;
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (err?: TransportError) => {
        if (timer) clearTimeout(timer);
        this.stateListeners.delete(onState);
        if (err) reject(err);
        else resolve();
      };
      const onState = (s: State) => {
        if (timer) clearTimeout(timer);
        timer = null;
        if (s === State.PoweredOn) return finish();
        if (s === State.Unauthorized)
          return finish(new TransportError('PERMISSION_DENIED', 'Bluetooth permission is not granted'));
        if (s === State.Unsupported)
          return finish(new TransportError('UNSUPPORTED', 'Bluetooth LE is not supported on this device'));
        const unknown = s === State.Unknown || s === State.Resetting;
        timer = setTimeout(
          () =>
            finish(
              new TransportError(
                'BLUETOOTH_OFF',
                unknown ? `Bluetooth did not become ready (state ${s})` : 'Bluetooth is turned off',
              ),
            ),
          unknown ? stateUnknownTimeoutMs : powerOnTimeoutMs,
        );
      };
      this.stateListeners.add(onState);
      onState(this.adapterState);
    });
  }

  async scan(onDevice: (d: DiscoveredDevice) => void, timeoutMs: number): Promise<void> {
    this.stopScan();
    const m = await this.ensureReady();
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (err?: TransportError) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.stopCurrentScan = null;
        void Promise.resolve(m.stopDeviceScan()).catch(() => undefined);
        if (err) reject(err);
        else resolve();
      };
      const timer = setTimeout(() => finish(), timeoutMs);
      this.stopCurrentScan = () => finish();
      // Service UUID is in the advertisement; the name is only in the scan response (CONTRACT 1, K8),
      // so filter by service UUID and never by name.
      Promise.resolve(
        m.startDeviceScan(
          [SERVICE_UUID],
          { allowDuplicates: false },
          (error: BleError | null, device: Device | null) => {
            if (error) return finish(mapBleError(error, 'scan'));
            if (!device) return;
            onDevice({
              id: device.id,
              name: device.name ?? device.localName ?? DEVICE_NAME,
              rssi: device.rssi,
            });
          },
        ),
      ).catch((e: unknown) => finish(mapBleError(e, 'scan')));
    });
  }

  stopScan(): void {
    this.stopCurrentScan?.();
  }

  async connect(deviceId: string): Promise<DeviceLink> {
    this.stopScan();
    if (this.activeLink) await this.activeLink.disconnect();
    const m = await this.ensureReady();
    const { connectTimeoutMs, discoverTimeoutMs } = this.cfg;
    let link: BleDeviceLink | null = null;
    try {
      const device = await raceTimeout(
        m.connectToDevice(deviceId, { timeout: connectTimeoutMs }),
        connectTimeoutMs + 2000,
        'Connect',
        () => void m.cancelDeviceConnection(deviceId).catch(() => undefined),
      );
      // Subscribe to disconnects before any other operation (STACK 4, issue #1323 mitigation).
      link = new BleDeviceLink(m, device, this.cfg, () => `m010-${++this.txSeq}`);
      this.activeLink = link;
      await raceTimeout(
        m.discoverAllServicesAndCharacteristicsForDevice(deviceId),
        discoverTimeoutMs,
        'Service discovery',
      );
      const chars = await m.characteristicsForDevice(deviceId, SERVICE_UUID);
      const missing = [COMMAND_UUID, STATUS_UUID, SESSION_UUID].filter(
        (u) => !chars.some((c: Characteristic) => same(c.uuid, u)),
      );
      if (missing.length > 0)
        throw new TransportError(
          'PROTOCOL',
          `Barrier service is missing characteristics: ${missing.join(', ')}`,
        );
      return link;
    } catch (e) {
      if (link) await link.disconnect();
      else await m.cancelDeviceConnection(deviceId).catch(() => undefined);
      throw mapBleError(e, 'connect');
    }
  }

  destroy(): void {
    this.stopScan();
    void this.activeLink?.disconnect();
    this.activeLink = null;
    this.stateSub?.remove();
    this.stateSub = null;
    this.stateListeners.clear();
    const m = this.manager;
    this.manager = null;
    this.adapterState = State.Unknown;
    if (m) void Promise.resolve(m.destroy()).catch(() => undefined);
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Reject with TIMEOUT after ms; run onTimeout to cancel the underlying operation. */
function raceTimeout<T>(p: Promise<T>, ms: number, what: string, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      onTimeout?.();
      reject(new TransportError('TIMEOUT', `${what} timed out after ${ms} ms`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export class BleDeviceLink implements DeviceLink {
  readonly deviceId: string;
  readonly deviceName: string;
  private closed = false; // we called disconnect()
  private lostReason: string | null = null; // link dropped without us asking
  private disconnectCbs = new Set<(reason: string) => void>();
  private statusCbs = new Set<(b: Uint8Array) => void>();
  private disconnectSub: Subscription | null = null;
  private monitorSub: Subscription | null = null;

  constructor(
    private readonly m: BleManager,
    device: Device,
    private readonly cfg: Cfg,
    private readonly nextTx: () => string,
  ) {
    this.deviceId = device.id;
    this.deviceName = device.name ?? device.localName ?? DEVICE_NAME;
    this.disconnectSub = m.onDeviceDisconnected(device.id, (error) => {
      if (this.closed) return;
      this.declareLost(error ? error.message : 'disconnected by peer or OS');
    });
  }

  /* ---------- operations ---------- */

  async readSession(): Promise<Uint8Array> {
    const { pairingDeadlineMs, androidPairRetryMs } = this.cfg;
    const deadline = Date.now() + pairingDeadlineMs;
    for (;;) {
      if (this.closed || this.lostReason !== null)
        throw new TransportError('PAIRING_FAILED', ENROLLMENT_HINT);
      const remaining = deadline - Date.now();
      try {
        const ch = await this.op(
          'Pairing / Session read',
          remaining,
          'session',
          (tx) => this.m.readCharacteristicForDevice(this.deviceId, SERVICE_UUID, SESSION_UUID, tx),
          true,
        );
        return this.valueOf(ch);
      } catch (e) {
        if (this.lostReason !== null || isDisconnected(e))
          throw new TransportError('PAIRING_FAILED', ENROLLMENT_HINT);
        if (
          isAuthRequired(e) &&
          Platform.OS === 'android' &&
          !this.closed &&
          deadline - Date.now() > androidPairRetryMs
        ) {
          // Android starts bonding by itself on ATT 5 and the first read can fail while the passkey
          // dialog is still up; retry until the bond completes or the deadline passes (STACK 6.2).
          this.cfg.log(
            `Session read needs authentication (${describe(e)}); retrying in ${androidPairRetryMs} ms`,
          );
          await sleep(androidPairRetryMs);
          continue;
        }
        throw e instanceof TransportError ? e : mapBleError(e, 'session');
      }
    }
  }

  async readStatus(): Promise<Uint8Array> {
    const ch = await this.op('Status read', this.cfg.opTimeoutMs, 'status', (tx) =>
      this.m.readCharacteristicForDevice(this.deviceId, SERVICE_UUID, STATUS_UUID, tx),
    );
    return this.valueOf(ch);
  }

  async writeCommand(frame: Uint8Array): Promise<void> {
    if (frame.length !== CMD_FRAME_LEN)
      throw new TransportError(
        'PROTOCOL',
        `Command frame is ${frame.length} bytes, expected ${CMD_FRAME_LEN}`,
      );
    const b64 = toBase64(frame);
    await this.op('Command write', this.cfg.opTimeoutMs, 'write', (tx) =>
      this.m.writeCharacteristicWithResponseForDevice(this.deviceId, SERVICE_UUID, COMMAND_UUID, b64, tx),
    );
  }

  onStatus(cb: (bytes: Uint8Array) => void): () => void {
    this.statusCbs.add(cb);
    if (!this.monitorSub && !this.closed && this.lostReason === null) this.startMonitor();
    return () => {
      this.statusCbs.delete(cb);
      if (this.statusCbs.size === 0) this.stopMonitor();
    };
  }

  onDisconnected(cb: (reason: string) => void): () => void {
    if (this.lostReason !== null) {
      const reason = this.lostReason;
      void Promise.resolve().then(() => cb(reason));
      return () => {};
    }
    this.disconnectCbs.add(cb);
    return () => {
      this.disconnectCbs.delete(cb);
    };
  }

  async disconnect(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.disconnectCbs.clear();
    this.statusCbs.clear();
    this.stopMonitor();
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    if (this.lostReason !== null) return; // already gone
    try {
      await this.m.cancelDeviceConnection(this.deviceId);
    } catch (e) {
      this.cfg.log(`cancelDeviceConnection: ${describe(e)} (ignored)`);
    }
  }

  /* ---------- internals ---------- */

  private valueOf(ch: Characteristic): Uint8Array {
    if (!ch.value) throw new TransportError('PROTOCOL', 'Characteristic returned no value');
    return fromBase64(ch.value);
  }

  /**
   * One ble-plx call with its own timeout and a cancellable transaction. With `raw` the original
   * BleError is rethrown so the caller can classify it (Session read retry logic).
   */
  private async op<T>(
    what: string,
    ms: number,
    ctx: ErrorContext,
    fn: (tx: string) => Promise<T>,
    raw = false,
  ): Promise<T> {
    if (this.closed) throw new TransportError('NOT_CONNECTED', 'Not connected to a barrier');
    if (this.lostReason !== null) throw new TransportError('LINK_LOST', `Link lost: ${this.lostReason}`);
    const tx = this.nextTx();
    try {
      return await raceTimeout(
        fn(tx),
        Math.max(ms, 1),
        what,
        () => void this.m.cancelTransaction(tx).catch(() => undefined),
      );
    } catch (e) {
      if (raw) throw e;
      throw mapBleError(e, ctx);
    }
  }

  private startMonitor() {
    this.monitorSub = this.m.monitorCharacteristicForDevice(
      this.deviceId,
      SERVICE_UUID,
      STATUS_UUID,
      (error: BleError | null, ch: Characteristic | null) => {
        if (error) {
          if (this.closed || this.lostReason !== null || isCancelled(error) || isDisconnected(error)) {
            this.cfg.log(`status monitor ended: ${describe(error)}`);
            return;
          }
          // A failed subscription is dead for good in ble-plx: commands would silently never get a
          // result. Treat as link loss so the UI reconnects instead of timing out command by command.
          this.cfg.log(`status monitor failed: ${describe(error)}`);
          this.declareLost(`Status notifications failed: ${describe(error)}`);
          void this.m.cancelDeviceConnection(this.deviceId).catch(() => undefined);
          return;
        }
        if (this.closed || !ch?.value) return;
        let bytes: Uint8Array;
        try {
          bytes = fromBase64(ch.value);
        } catch (e) {
          this.cfg.log(`undecodable notification: ${describe(e)}`);
          return;
        }
        for (const cb of [...this.statusCbs]) {
          try {
            cb(bytes);
          } catch (e) {
            this.cfg.log(`status callback threw: ${describe(e)}`);
          }
        }
      },
      this.nextTx(),
    );
  }

  private stopMonitor() {
    const s = this.monitorSub;
    this.monitorSub = null;
    try {
      s?.remove();
    } catch {
      /* already removed by ble-plx on disconnect */
    }
  }

  private declareLost(reason: string) {
    if (this.closed || this.lostReason !== null) return;
    this.lostReason = reason;
    this.stopMonitor();
    const cbs = [...this.disconnectCbs];
    this.disconnectCbs.clear();
    this.cfg.log(`link lost: ${reason}`);
    for (const cb of cbs) {
      try {
        cb(reason);
      } catch (e) {
        this.cfg.log(`disconnect callback threw: ${describe(e)}`);
      }
    }
  }
}

function describe(e: unknown): string {
  if (isBleErrorLike(e))
    return `code=${e.errorCode} att=${e.attErrorCode ?? '-'} android=${e.androidErrorCode ?? '-'} ${e.message ?? ''}`;
  return e instanceof Error ? e.message : String(e);
}

export { PAIRING_HINT };
