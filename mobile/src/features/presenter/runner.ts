/**
 * ScenarioRunner: executes a Scenario step by step against its own SimDevice
 * through the real BarrierClient (same codec, counter and resync code as BLE).
 * Every step asserts its expected outcome; the UI shows pass / unexpected from
 * those assertions, so a live demo shows real simulator behaviour.
 */
import type { BarrierStatus } from '../../protocol/codec';
import { encodeCommand, toHex } from '../../protocol/codec';
import {
  CmdResult,
  FAULT_NAMES,
  OPCODE_NAMES,
  RESULT_NAMES,
  STATE_NAMES,
  type Opcode,
} from '../../protocol/constants';
import { explainGuardMask } from '../../protocol/messages';
import { SimDevice } from '../../sim/SimDevice';
import { createSimTransport, SIM_PHONE_ID, type SimTransportHandle } from '../../transport/SimTransport';
import {
  TransportError,
  type CommandOutcome,
  type LogEntry,
  type SessionInfo,
  type TransportSnapshot,
} from '../../transport/types';
import {
  DEFAULT_PARAMS,
  type Check,
  type CommandExpect,
  type Evidence,
  type Scenario,
  type ScenarioCtx,
  type ScenarioParams,
  type StepResult,
} from './types';

export type InterlockKey = 'zoneClear' | 'sensorsValid' | 'powerHealthy' | 'link';
export type InterlockToggles = Record<InterlockKey, boolean>;

/** Battery values the "Power healthy" toggle writes (healthy >= 11.8 V, critical < 11.0 V). */
export const BATTERY_OK_MV = 12900;
export const BATTERY_LOW_MV = 11700;

export interface RunnerSnapshot {
  scenario: Scenario;
  handle: SimTransportHandle | null;
  /** boot (device setup + owner connect) in progress */
  booting: boolean;
  bootError: string | null;
  /** step shown in the step card */
  view: number;
  /** number of steps already run */
  frontier: number;
  results: (StepResult | null)[];
  /** a step is executing right now */
  busy: boolean;
  /** index of the step currently executing, or null */
  runningIndex: number | null;
  auto: boolean;
  /** phone-measured auth latencies seen by this run's transport */
  samples: number[];
  params: ScenarioParams;
}

export interface RunnerOptions {
  /** pause between steps in auto-play (ms). default 1600 */
  autoDelayMs?: number;
  /** transport + scenario log sink (UI wires the on-phone event log here) */
  log?: (e: Omit<LogEntry, 'id'>) => void;
  params?: Partial<ScenarioParams>;
}

class Aborted extends Error {
  constructor() {
    super('scenario run aborted');
    this.name = 'Aborted';
  }
}

const hex2 = (n: number) => `0x${n.toString(16).padStart(2, '0')}`;
const POLL_MS = 25;

export class ScenarioRunner {
  private snap: RunnerSnapshot;
  private listeners = new Set<() => void>();
  private gen = 0;
  private unlogs: (() => void)[] = [];
  private ctx: ScenarioCtx | null = null;
  private cur: { checks: Check[]; evidence: Evidence[] } = { checks: [], evidence: [] };
  private memo: Record<string, unknown> = {};
  private readonly autoDelayMs: number;
  private readonly log?: (e: Omit<LogEntry, 'id'>) => void;
  private starting: Promise<void> | null = null;

  constructor(
    readonly scenario: Scenario,
    opts: RunnerOptions = {},
  ) {
    this.autoDelayMs = opts.autoDelayMs ?? 1600;
    this.log = opts.log;
    this.snap = {
      scenario,
      handle: null,
      booting: false,
      bootError: null,
      view: 0,
      frontier: 0,
      results: scenario.steps.map(() => null),
      busy: false,
      runningIndex: null,
      auto: false,
      samples: [],
      params: { ...DEFAULT_PARAMS, ...opts.params },
    };
  }

  /* ---------- observable ---------- */
  getSnapshot = (): RunnerSnapshot => this.snap;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  private set(p: Partial<RunnerSnapshot>) {
    this.snap = { ...this.snap, ...p };
    this.listeners.forEach((l) => l());
  }

  get handle(): SimTransportHandle | null {
    return this.snap.handle;
  }

  get finished(): boolean {
    return this.snap.frontier >= this.scenario.steps.length;
  }

  /** every executed step passed its assertions */
  get allPassed(): boolean {
    return this.snap.results.every((r) => r === null || r.status === 'pass');
  }

  /* ---------- lifecycle ---------- */
  /** Create a fresh SimDevice + transport (and connect the owner phone unless the scenario says not to). */
  start(): Promise<void> {
    this.starting = this.boot();
    return this.starting;
  }

  private async boot(): Promise<void> {
    const myGen = ++this.gen;
    this.teardown();
    this.memo = {};
    const sc = this.scenario;
    const device = new SimDevice({ prebondedOwner: sc.prebonded === false ? undefined : SIM_PHONE_ID });
    sc.setup?.(device);
    const handle = createSimTransport({ device });
    this.unlogs.push(
      handle.transport.onLog((e) => {
        this.log?.(e);
        if (e.kind === 'auth' && typeof e.latencyMs === 'number' && myGen === this.gen) {
          this.set({ samples: [...this.snap.samples, e.latencyMs] });
        }
      }),
    );
    this.ctx = this.makeCtx(handle, myGen);
    this.set({
      handle,
      booting: sc.autoConnect !== false,
      bootError: null,
      view: 0,
      frontier: 0,
      results: sc.steps.map(() => null),
      busy: false,
      runningIndex: null,
      auto: false,
      samples: [],
    });
    if (sc.autoConnect === false) return;
    try {
      await handle.transport.connect(device.id);
      if (myGen === this.gen) this.set({ booting: false });
    } catch (e) {
      if (myGen === this.gen)
        this.set({ booting: false, bootError: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Fresh device and transport; clears step results and latency samples. */
  reset(): Promise<void> {
    return this.start();
  }

  dispose() {
    this.gen++;
    this.teardown();
    this.set({ auto: false, busy: false, runningIndex: null, handle: null });
    this.listeners.clear();
  }

  private teardown() {
    this.unlogs.forEach((u) => u());
    this.unlogs = [];
    const h = this.snap.handle;
    if (h) {
      try {
        h.transport.destroy();
        h.device.dispose();
      } catch {
        /* already torn down */
      }
    }
  }

  setParams(patch: Partial<ScenarioParams>) {
    this.set({ params: { ...this.snap.params, ...patch } });
  }

  /* ---------- stepping ---------- */
  prev() {
    if (this.snap.view > 0) this.set({ view: this.snap.view - 1 });
  }

  /** Jump the step card to an already-run step (review only; the device is not rewound). */
  goTo(i: number) {
    if (i >= 0 && i < this.snap.frontier) this.set({ view: i });
  }

  /** Review a later, already-run step, otherwise run the next pending step. */
  async next(): Promise<StepResult | null> {
    const s = this.snap;
    if (s.busy || s.booting) return null;
    const lastRun = s.frontier - 1;
    if (s.view < lastRun) {
      this.set({ view: s.view + 1 });
      return s.results[s.view + 1] ?? null;
    }
    if (s.frontier >= this.scenario.steps.length) return null;
    return this.runStep(s.frontier);
  }

  async autoPlay(): Promise<void> {
    if (this.snap.auto || this.snap.busy) return;
    const myGen = this.gen;
    this.set({ auto: true });
    // continue from the live frontier, not from a reviewed step
    if (this.snap.view < this.snap.frontier - 1) this.set({ view: this.snap.frontier - 1 });
    try {
      while (this.snap.auto && myGen === this.gen && !this.finished) {
        if (this.snap.booting) {
          await this.sleep(50, myGen);
          continue;
        }
        const r = await this.runStep(this.snap.frontier);
        if (!r || r.status !== 'pass') break;
        if (!this.finished && this.autoDelayMs > 0) await this.sleep(this.autoDelayMs, myGen);
      }
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
    } finally {
      if (myGen === this.gen) this.set({ auto: false });
    }
  }

  stopAuto() {
    this.set({ auto: false });
  }

  private sleep(ms: number, myGen: number) {
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => (myGen === this.gen ? resolve() : reject(new Aborted())), ms);
    });
  }

  private async runStep(i: number): Promise<StepResult | null> {
    const step = this.scenario.steps[i];
    const ctx = this.ctx;
    if (!step || !ctx) return null;
    const myGen = this.gen;
    this.cur = { checks: [], evidence: [] };
    this.set({ busy: true, runningIndex: i, view: i });
    const t0 = Date.now();
    let error: string | undefined;
    try {
      await step.run(ctx);
    } catch (e) {
      if (e instanceof Aborted || myGen !== this.gen) return null;
      error = e instanceof Error ? e.message : String(e);
    }
    if (myGen !== this.gen) return null;
    const { checks, evidence } = this.cur;
    const status = error ? 'error' : checks.every((c) => c.ok) ? 'pass' : 'unexpected';
    const result: StepResult = { status, checks, evidence, durationMs: Date.now() - t0, error };
    const results = [...this.snap.results];
    results[i] = result;
    this.set({ results, frontier: i + 1, view: i, busy: false, runningIndex: null });
    this.log?.({
      t: Date.now(),
      kind: 'scenario',
      transport: 'sim',
      message: `[${this.scenario.id}] step ${i + 1}/${this.scenario.steps.length} ${step.title}: ${status}`,
    });
    return result;
  }

  /* ---------- interlock toggles (drawer) ---------- */
  readInterlocks(): InterlockToggles {
    const h = this.snap.handle;
    if (!h) return { zoneClear: true, sensorsValid: true, powerHealthy: true, link: false };
    return readInterlocks(h.device, h.transport.getSnapshot().phase === 'ready');
  }

  async setInterlock(key: InterlockKey, value: boolean): Promise<void> {
    const h = this.snap.handle;
    if (!h) return;
    const d = h.device;
    switch (key) {
      case 'zoneClear':
        d.setSensors({ zoneClear: value });
        break;
      case 'sensorsValid':
        d.setSensors({ limitsValid: value });
        break;
      case 'powerHealthy':
        d.setSensors({ batteryMv: value ? BATTERY_OK_MV : BATTERY_LOW_MV });
        break;
      case 'link':
        if (value) {
          if (h.transport.getSnapshot().phase !== 'ready') await h.transport.connect(d.id);
        } else {
          d.dropOwner('presenter: link toggled off');
        }
        break;
    }
  }

  /* ---------- step context ---------- */
  private makeCtx(handle: SimTransportHandle, myGen: number): ScenarioCtx {
    const runner = this;
    const { device, transport } = handle;
    const alive = () => {
      if (myGen !== runner.gen) throw new Aborted();
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        setTimeout(() => (myGen === runner.gen ? resolve() : reject(new Aborted())), ms);
      });
    const snapshot = (): TransportSnapshot => transport.getSnapshot();
    const push = (c: Check) => {
      runner.cur.checks.push(c);
      return c.ok;
    };
    const ctx: ScenarioCtx = {
      handle,
      device,
      transport,
      get params() {
        return runner.snap.params;
      },
      memo: runner.memo,
      wait,
      samples: () => runner.snap.samples,
      status(): BarrierStatus {
        const s = snapshot().status;
        if (!s) throw new Error('No Status received yet');
        return s;
      },
      connect(): Promise<SessionInfo> {
        return transport.connect(device.id);
      },
      async expectConnectError(code) {
        alive();
        let actual = 'connected';
        let message = '';
        try {
          await transport.connect(device.id);
        } catch (e) {
          actual = e instanceof TransportError ? e.code : String(e);
          message = e instanceof Error ? e.message : String(e);
        }
        alive();
        push({ label: 'Connect refused', expected: code, actual, ok: actual === code });
        if (message) runner.cur.evidence.push({ label: 'Barrier says', value: message });
      },
      disconnect() {
        return transport.disconnect();
      },
      async command(op: Opcode, e: CommandExpect): Promise<CommandOutcome> {
        alive();
        const name = OPCODE_NAMES[op];
        let out: CommandOutcome;
        try {
          out = await transport.sendCommand(op);
        } catch (err) {
          alive();
          const msg = err instanceof Error ? err.message : String(err);
          push({ label: `${name} delivered`, expected: RESULT_NAMES[e.result], actual: msg, ok: false });
          throw err;
        }
        alive();
        push({
          label: `${name} result`,
          expected: RESULT_NAMES[e.result],
          actual: RESULT_NAMES[out.result],
          ok: out.result === e.result,
        });
        if (e.state !== undefined) {
          push({
            label: 'State',
            expected: STATE_NAMES[e.state],
            actual: STATE_NAMES[out.status.state],
            ok: out.status.state === e.state,
          });
        }
        if (e.fault !== undefined) {
          push({
            label: 'Fault',
            expected: FAULT_NAMES[e.fault],
            actual: FAULT_NAMES[out.status.fault],
            ok: out.status.fault === e.fault,
          });
        }
        if (e.mask !== undefined) {
          push({
            label: 'Guard mask',
            expected: hex2(e.mask),
            actual: hex2(out.guardFailMask),
            ok: out.guardFailMask === e.mask,
          });
        }
        if (e.maskHas !== undefined) {
          push({
            label: 'Guard mask includes',
            expected: hex2(e.maskHas),
            actual: hex2(out.guardFailMask),
            ok: (out.guardFailMask & e.maskHas) === e.maskHas,
          });
        }
        runner.cur.evidence.push({
          label: `${name} frame`,
          value: `counter ${out.counter}, ${out.latencyMs} ms to Status${out.retried ? ', resynced once' : ''}`,
        });
        if (out.result === CmdResult.REJECTED_GUARD) {
          const reasons = explainGuardMask(out.guardFailMask).map((x) => x.title);
          runner.cur.evidence.push({ label: 'App tells the driver', value: reasons.join(' / ') });
        }
        return out;
      },
      async until(label, pred, timeoutMs = 8000) {
        const t0 = Date.now();
        for (let waited = 0; ; waited += POLL_MS) {
          alive();
          const s = snapshot().status;
          if (s && pred(s)) {
            const took = Date.now() - t0;
            push({
              label,
              expected: `within ${(timeoutMs / 1000).toFixed(1)} s`,
              actual: `${(took / 1000).toFixed(2)} s`,
              ok: true,
            });
            return s;
          }
          if (waited >= timeoutMs) break;
          await wait(POLL_MS);
        }
        push({
          label,
          expected: `within ${(timeoutMs / 1000).toFixed(1)} s`,
          actual: 'not reached',
          ok: false,
        });
        return null;
      },
      check(label, expected, actual) {
        return push({
          label,
          expected: String(expected),
          actual: String(actual),
          ok: String(expected) === String(actual),
        });
      },
      checkTrue(label, cond, detail) {
        return push({ label, expected: 'yes', actual: cond ? 'yes' : (detail ?? 'no'), ok: cond });
      },
      evidence(label, value, mono) {
        runner.cur.evidence.push({ label, value, mono });
      },
      frame(op, counter, nonce) {
        const snapN = snapshot();
        return encodeCommand({
          opcode: op,
          counter: counter ?? snapN.nextCounter ?? 1,
          nonce: nonce ?? snapN.session?.nonce ?? 0,
        });
      },
      async inject(label, frame) {
        alive();
        const prev = snapshot().status;
        runner.cur.evidence.push({ label: `${label} (hex)`, value: toHex(frame), mono: true });
        const online = snapshot().phase === 'ready';
        let next: Promise<BarrierStatus | null> = Promise.resolve(null);
        if (online) {
          next = new Promise<BarrierStatus | null>((resolve) => {
            let unsub: () => void = () => {};
            const timer = setTimeout(() => {
              unsub();
              resolve(null);
            }, 1500);
            unsub = transport.subscribe(() => {
              const s = snapshot().status;
              if (s && s !== prev) {
                clearTimeout(timer);
                unsub();
                resolve(s);
              }
            });
          });
        }
        device.handleFrame(frame, Date.now());
        const s = await next;
        alive();
        return s;
      },
      lastCmdEvt() {
        for (let i = device.evt.length - 1; i >= 0; i--) {
          const e = device.evt[i]!;
          if (e.name === 'EVT_CMD_RESULT') return { result: e.a, detail: e.b };
        }
        return null;
      },
    };
    return ctx;
  }
}

export function readInterlocks(device: SimDevice, linkUp: boolean): InterlockToggles {
  const s = device.sensors;
  return {
    zoneClear: s.obstructionValid && s.zoneClear,
    sensorsValid: s.obstructionValid && s.limitsValid && s.powerValid,
    powerHealthy: device.powerHealthy,
    link: linkUp,
  };
}
