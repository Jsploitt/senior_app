/**
 * Presenter-mode scenario model. Pure TypeScript (no React), so every scenario
 * can run headless in jest against the real SimDevice + BarrierClient.
 */
import type { BarrierStatus } from '../../protocol/codec';
import type { BarrierState, CmdResult, FaultReason, Opcode } from '../../protocol/constants';
import type { SimDevice } from '../../sim/SimDevice';
import type { SimTransportHandle } from '../../transport/SimTransport';
import type { BarrierTransport, CommandOutcome, SessionInfo } from '../../transport/types';

export type ScenarioGroup = 'motion' | 'safety' | 'link';

/** One asserted expectation. The UI shows pass / unexpected per check. */
export interface Check {
  label: string;
  expected: string;
  actual: string;
  ok: boolean;
}

/** Extra facts shown under a step (frame hex, guard copy, measured timings). */
export interface Evidence {
  label: string;
  value: string;
  mono?: boolean;
}

export type StepStatus = 'pass' | 'unexpected' | 'error';

export interface StepResult {
  status: StepStatus;
  checks: Check[];
  evidence: Evidence[];
  /** wall-clock (sim clock under jest fake timers) duration of run() */
  durationMs: number;
  error?: string;
}

/** What a command is expected to produce (all given fields are asserted). */
export interface CommandExpect {
  result: CmdResult;
  state?: BarrierState;
  fault?: FaultReason;
  /** exact guard-fail mask */
  mask?: number;
  /** guard-fail mask must contain all these bits */
  maskHas?: number;
}

export interface ScenarioParams {
  /** auth-latency: number of simulated connects */
  connects: number;
  /** auth-latency: median auth latency in ms */
  latencyMedianMs: number;
  /** auth-latency: log-normal sigma (0.15 tight, 0.35 typical, 0.7 wide) */
  latencySigma: number;
}

export const DEFAULT_PARAMS: ScenarioParams = { connects: 20, latencyMedianMs: 650, latencySigma: 0.35 };

export interface ScenarioCtx {
  readonly handle: SimTransportHandle;
  readonly device: SimDevice;
  readonly transport: BarrierTransport;
  readonly params: ScenarioParams;
  /** values that survive across the steps of one run */
  readonly memo: Record<string, unknown>;

  /** abortable sleep (rejects if the run is reset/disposed) */
  wait(ms: number): Promise<void>;
  /** phone-measured auth latencies recorded so far in this run */
  samples(): number[];
  /** the phone's last decoded Status (throws if none yet) */
  status(): BarrierStatus;
  connect(): Promise<SessionInfo>;
  /** connect and assert it is refused with this TransportError code */
  expectConnectError(code: string): Promise<void>;
  disconnect(): Promise<void>;
  /** send through the real BarrierClient and assert the outcome */
  command(op: Opcode, expect: CommandExpect): Promise<CommandOutcome>;
  /** poll the phone's Status until pred holds; records a check; returns the status or null on timeout */
  until(
    label: string,
    pred: (s: BarrierStatus) => boolean,
    timeoutMs?: number,
  ): Promise<BarrierStatus | null>;
  /** assert expected === actual (compared as strings) */
  check(label: string, expected: string | number, actual: string | number): boolean;
  checkTrue(label: string, cond: boolean, detail?: string): boolean;
  evidence(label: string, value: string, mono?: boolean): void;
  /** build a 9-byte command frame (counter/nonce default to the session's next values) */
  frame(op: Opcode, counter?: number, nonce?: number): Uint8Array;
  /** hand a raw frame to the device (injected / replayed) and wait for the next Status notification */
  inject(label: string, frame: Uint8Array): Promise<BarrierStatus | null>;
  /** last EVT_CMD_RESULT from the device UART-style log: [CmdResult, CmdvResult|guardMask] */
  lastCmdEvt(): { result: number; detail: number } | null;
}

export interface ScenarioStep {
  title: string;
  /** what the audience sees, in FDR terms */
  narration: string;
  /** STATE_MACHINE.md transition rows exercised */
  fsmRows: number[];
  run(ctx: ScenarioCtx): Promise<void>;
}

export interface Scenario {
  id: string;
  title: string;
  summary: string;
  group: ScenarioGroup;
  /** device is boot-configured before the phone connects */
  setup?: (device: SimDevice) => void;
  /** connect the (bonded) phone during boot. default true */
  autoConnect?: boolean;
  /** phone already bonded as owner. default true */
  prebonded?: boolean;
  steps: ScenarioStep[];
}
