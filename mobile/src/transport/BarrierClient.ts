/**
 * BarrierClient: transport-independent owner session logic.
 * INTERFACES.md:32-33 phone flow: connect -> (pair) -> read Session ->
 * subscribe Status -> write Command frames with counter = last + 1.
 */
import { decodeSession, decodeStatus, encodeCommand, type BarrierStatus } from '../protocol/codec';
import {
  CmdResult,
  FAULT_NAMES,
  OPCODE_NAMES,
  Opcode,
  RESULT_NAMES,
  STATE_NAMES,
  STATUS_POLL_MS,
} from '../protocol/constants';
import { nextCounter, type CounterStore } from './counter';
import type { DeviceLink, LinkProvider } from './link';
import {
  TransportError,
  type BarrierTransport,
  type CommandOutcome,
  type DiscoveredDevice,
  type Listener,
  type LogEntry,
  type SessionInfo,
  type TransportKind,
  type TransportSnapshot,
} from './types';

export interface ClientOptions {
  kind: TransportKind;
  provider: LinkProvider;
  counters: CounterStore;
  now?: () => number;
  /** Max time to wait for the user to finish OS passkey entry. */
  pairingTimeoutMs?: number;
  /** Max time from write to the Status notification carrying the result. */
  commandTimeoutMs?: number;
  /** After the first matching notification, keep listening this long and use the latest. */
  settleMs?: number;
}

const REJECT_BEFORE_COUNTER = new Set([
  CmdResult.REJECTED_STALE,
  CmdResult.REJECTED_AUTH,
  CmdResult.REJECTED_FORMAT,
]);

export function withTimeout<T>(p: Promise<T>, ms: number, code: 'TIMEOUT', what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TransportError(code, `${what} timed out after ${ms} ms`)), ms);
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

export class BarrierClient implements BarrierTransport {
  readonly kind: TransportKind;
  private readonly provider: LinkProvider;
  private readonly counters: CounterStore;
  private readonly now: () => number;
  private readonly pairingTimeoutMs: number;
  private readonly commandTimeoutMs: number;
  private readonly settleMs: number;

  private snap: TransportSnapshot;
  private listeners = new Set<Listener>();
  private logListeners = new Set<(e: Omit<LogEntry, 'id'>) => void>();
  private statusWaiters = new Set<(s: BarrierStatus) => void>();
  private link: DeviceLink | null = null;
  private unsubs: (() => void)[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(o: ClientOptions) {
    this.kind = o.kind;
    this.provider = o.provider;
    this.counters = o.counters;
    this.now = o.now ?? Date.now;
    this.pairingTimeoutMs = o.pairingTimeoutMs ?? 60_000;
    this.commandTimeoutMs = o.commandTimeoutMs ?? 1500;
    this.settleMs = o.settleMs ?? STATUS_POLL_MS * 4;
    this.snap = {
      kind: o.kind,
      phase: 'idle',
      status: null,
      session: null,
      error: null,
      nextCounter: null,
      busy: false,
    };
  }

  /* ---------- observable ---------- */
  getSnapshot = (): TransportSnapshot => this.snap;
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  onLog(l: (e: Omit<LogEntry, 'id'>) => void) {
    this.logListeners.add(l);
    return () => {
      this.logListeners.delete(l);
    };
  }
  private set(p: Partial<TransportSnapshot>) {
    this.snap = { ...this.snap, ...p };
    this.listeners.forEach((l) => l());
  }
  private log(e: Omit<LogEntry, 'id' | 't' | 'transport'>) {
    const full = { ...e, t: this.now(), transport: this.kind };
    this.logListeners.forEach((l) => l(full));
  }

  /* ---------- discovery ---------- */
  async scan(timeoutMs = 8000): Promise<DiscoveredDevice[]> {
    const found = new Map<string, DiscoveredDevice>();
    this.set({ phase: 'scanning', error: null });
    try {
      await this.provider.scan((d) => {
        found.set(d.id, d);
      }, timeoutMs);
    } catch (e) {
      this.fail(e);
      throw e;
    }
    if (this.snap.phase === 'scanning') this.set({ phase: this.link ? 'ready' : 'idle' });
    return [...found.values()];
  }
  stopScan() {
    this.provider.stopScan();
    if (this.snap.phase === 'scanning') this.set({ phase: 'idle' });
  }

  /* ---------- session ---------- */
  async connect(deviceId: string): Promise<SessionInfo> {
    if (this.link) await this.disconnect();
    const t0 = this.now();
    this.set({ phase: 'connecting', error: null, session: null, status: null, nextCounter: null });
    this.log({ kind: 'connect', message: `Connecting to ${deviceId}` });
    try {
      const link = await this.provider.connect(deviceId);
      this.link = link;
      this.unsubs.push(link.onDisconnected((reason) => this.handleLinkLost(reason)));

      this.set({ phase: 'pairing' });
      const nonce = decodeSession(
        await withTimeout(link.readSession(), this.pairingTimeoutMs, 'TIMEOUT', 'Pairing / Session read'),
      );

      this.set({ phase: 'authorizing' });
      this.unsubs.push(link.onStatus((b) => this.handleStatusBytes(b)));
      const status = decodeStatus(await link.readStatus());
      const stored = await this.counters.get(deviceId);
      const next = nextCounter(stored, status.lastCounter);
      const authLatencyMs = this.now() - t0;
      const session: SessionInfo = {
        deviceId,
        deviceName: link.deviceName,
        nonce,
        authLatencyMs,
        connectedAt: this.now(),
      };
      this.set({ phase: 'ready', session, status, nextCounter: next });
      this.log({
        kind: 'auth',
        message: `Owner authorized in ${authLatencyMs} ms`,
        latencyMs: authLatencyMs,
        counter: next,
        state: STATE_NAMES[status.state],
      });
      return session;
    } catch (e) {
      await this.teardown();
      this.fail(e);
      throw e instanceof TransportError ? e : new TransportError('CONNECT_FAILED', String(e));
    }
  }

  async disconnect(): Promise<void> {
    const had = this.link !== null;
    await this.teardown();
    if (had) this.log({ kind: 'disconnect', message: 'Disconnected by user' });
    this.set({ phase: 'idle', session: null, busy: false });
  }

  async forget(deviceId: string): Promise<void> {
    if (this.snap.session?.deviceId === deviceId) await this.disconnect();
    await this.counters.clear(deviceId);
    this.log({ kind: 'connect', message: `Forgot ${deviceId}; counter reset` });
    this.set({ nextCounter: null });
  }

  async refreshStatus(): Promise<BarrierStatus> {
    const link = this.requireLink();
    const s = decodeStatus(await link.readStatus());
    this.set({ status: s });
    return s;
  }

  destroy() {
    void this.teardown();
    this.provider.destroy();
    this.listeners.clear();
    this.logListeners.clear();
  }

  /* ---------- commands ---------- */
  sendCommand(opcode: Opcode): Promise<CommandOutcome> {
    // Serialize: counters must be strictly increasing on the wire.
    // STOP is not queued behind a pending RAISE/LOWER result wait beyond the write itself.
    const run = this.queue.then(() => this.runCommand(opcode));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async runCommand(opcode: Opcode): Promise<CommandOutcome> {
    this.requireLink();
    const session = this.snap.session;
    if (!session || this.snap.phase !== 'ready')
      throw new TransportError('NOT_CONNECTED', 'Not connected to a barrier');
    this.set({ busy: true });
    try {
      let outcome = await this.attempt(opcode, session);
      if (outcome.result === CmdResult.REJECTED_STALE) {
        // REPLAY / COUNTER_JUMP / EXPIRED (main.c:205-208): resync from Status once and retry once.
        // The phone cannot tell REPLAY (ours too low) from COUNTER_JUMP (ours too far ahead,
        // e.g. after an on-site revoke reset the device counter). In both cases the device's
        // last_counter is authoritative: retry with last_counter + 1.
        const fresh = await this.refreshStatus();
        this.set({ nextCounter: (fresh.lastCounter + 1) >>> 0 });
        this.log({
          kind: 'command',
          message: 'Counter resync after REJECTED_STALE',
          counter: this.snap.nextCounter ?? 0,
        });
        outcome = { ...(await this.attempt(opcode, session)), retried: true };
      }
      return outcome;
    } finally {
      this.set({ busy: false });
    }
  }

  private async attempt(opcode: Opcode, session: SessionInfo): Promise<CommandOutcome> {
    const link = this.requireLink();
    const counter = this.snap.nextCounter ?? 1;
    const frame = encodeCommand({ opcode, counter, nonce: session.nonce });
    const t0 = this.now();
    const matches = (s: BarrierStatus) =>
      s.lastCounter === counter || REJECT_BEFORE_COUNTER.has(s.lastResult);
    const result = this.waitForStatus(matches);
    try {
      await link.writeCommand(frame);
    } catch (e) {
      result.cancel();
      const err =
        e instanceof TransportError ? e : new TransportError('PROTOCOL', `Write failed: ${String(e)}`);
      this.log({ kind: 'error', message: err.message, opcode: OPCODE_NAMES[opcode], counter });
      throw err;
    }
    let status: BarrierStatus;
    let latencyMs: number;
    try {
      ({ status, latencyMs } = await result.promise.then((r) => ({
        status: r.status,
        latencyMs: r.at - t0,
      })));
    } catch (e) {
      this.log({ kind: 'error', message: 'No status after command', opcode: OPCODE_NAMES[opcode], counter });
      throw e;
    }
    if (status.lastCounter === counter) {
      // Accepted by freshness rules: device persisted it; mirror that (INTERFACES.md:29).
      await this.counters.set(session.deviceId, counter);
      this.set({ nextCounter: (counter + 1) >>> 0 });
    }
    const outcome: CommandOutcome = {
      opcode,
      counter,
      result: status.lastResult,
      guardFailMask: status.lastResult === CmdResult.REJECTED_GUARD ? status.guardFailMask : 0,
      status,
      latencyMs,
      retried: false,
    };
    this.log({
      kind: 'command',
      message: `${OPCODE_NAMES[opcode]} -> ${RESULT_NAMES[status.lastResult]}`,
      opcode: OPCODE_NAMES[opcode],
      counter,
      result: RESULT_NAMES[status.lastResult],
      guardFailMask: outcome.guardFailMask,
      latencyMs,
      state: STATE_NAMES[status.state],
      fault: FAULT_NAMES[status.fault],
      batteryMv: status.batteryMv,
    });
    return outcome;
  }

  /** Resolve with the latest status seen within settleMs after the first match. */
  private waitForStatus(pred: (s: BarrierStatus) => boolean) {
    let cancel = () => {};
    const promise = new Promise<{ status: BarrierStatus; at: number }>((resolve, reject) => {
      let first: { status: BarrierStatus; at: number } | null = null;
      let settle: ReturnType<typeof setTimeout> | null = null;
      const done = () => {
        this.statusWaiters.delete(waiter);
        clearTimeout(timeout);
        if (settle) clearTimeout(settle);
      };
      const waiter = (s: BarrierStatus) => {
        if (first === null) {
          if (!pred(s)) return;
          first = { status: s, at: this.now() };
          settle = setTimeout(() => {
            done();
            resolve(first!);
          }, this.settleMs);
        } else {
          first = { status: s, at: first.at };
        }
      };
      const timeout = setTimeout(() => {
        done();
        reject(new TransportError('TIMEOUT', `No status within ${this.commandTimeoutMs} ms`));
      }, this.commandTimeoutMs);
      this.statusWaiters.add(waiter);
      cancel = () => {
        done();
        reject(new TransportError('PROTOCOL', 'cancelled'));
      };
    });
    promise.catch(() => undefined);
    return { promise, cancel };
  }

  /* ---------- internals ---------- */
  private handleStatusBytes(bytes: Uint8Array) {
    let s: BarrierStatus;
    try {
      s = decodeStatus(bytes);
    } catch (e) {
      this.log({ kind: 'error', message: `Bad status: ${String(e)}` });
      return;
    }
    const prev = this.snap.status;
    this.set({ status: s });
    if (!prev || prev.state !== s.state || prev.fault !== s.fault) {
      this.log({
        kind: 'status',
        message: `State ${STATE_NAMES[s.state]}`,
        state: STATE_NAMES[s.state],
        fault: FAULT_NAMES[s.fault],
        result: RESULT_NAMES[s.lastResult],
        batteryMv: s.batteryMv,
      });
    }
    [...this.statusWaiters].forEach((w) => w(s));
  }

  private handleLinkLost(reason: string) {
    if (!this.link) return;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.link = null;
    this.log({ kind: 'disconnect', message: `Link lost: ${reason}` });
    this.set({
      phase: 'disconnected',
      session: null,
      busy: false,
      error: {
        code: 'LINK_LOST',
        message: 'Connection to the barrier was lost. Motion stops automatically.',
      },
    });
  }

  private async teardown() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    const l = this.link;
    this.link = null;
    if (l) {
      try {
        await l.disconnect();
      } catch {
        /* already gone */
      }
    }
  }

  private requireLink(): DeviceLink {
    if (!this.link) throw new TransportError('NOT_CONNECTED', 'Not connected to a barrier');
    return this.link;
  }

  private fail(e: unknown) {
    const err =
      e instanceof TransportError
        ? e
        : new TransportError('CONNECT_FAILED', e instanceof Error ? e.message : String(e));
    this.log({ kind: 'error', message: `${err.code}: ${err.message}` });
    this.set({ phase: 'error', error: { code: err.code, message: err.message }, busy: false });
  }
}
