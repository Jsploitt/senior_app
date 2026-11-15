import type { BarrierStatus } from '../protocol/codec';
import type { CmdResult, Opcode } from '../protocol/constants';

export type TransportKind = 'sim' | 'ble';

export type ConnectionPhase =
  | 'idle'
  | 'scanning'
  | 'connecting'
  /** Session read issued; OS pairing prompt may be showing (passkey entry). */
  | 'pairing'
  /** Encrypted link up, reading Status / subscribing. */
  | 'authorizing'
  | 'ready'
  | 'disconnected'
  | 'error';

export interface DiscoveredDevice {
  id: string;
  name: string;
  rssi: number | null;
}

export interface SessionInfo {
  deviceId: string;
  deviceName: string;
  nonce: number;
  /** ms from connect() call to owner-authorized (Session read + Status read OK). Spec 5. */
  authLatencyMs: number;
  connectedAt: number;
}

export type TransportErrorCode =
  | 'BLUETOOTH_OFF'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'CONNECT_FAILED'
  | 'PAIRING_FAILED'
  | 'NOT_AUTHORIZED'
  | 'TIMEOUT'
  | 'LINK_LOST'
  | 'NOT_CONNECTED'
  | 'PROTOCOL'
  | 'UNSUPPORTED';

export class TransportError extends Error {
  constructor(
    public readonly code: TransportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

export interface TransportSnapshot {
  kind: TransportKind;
  phase: ConnectionPhase;
  status: BarrierStatus | null;
  session: SessionInfo | null;
  error: { code: TransportErrorCode; message: string } | null;
  /** next counter value the client will send (debug/health). */
  nextCounter: number | null;
  /** true while a command is in flight */
  busy: boolean;
}

export interface CommandOutcome {
  opcode: Opcode;
  counter: number;
  result: CmdResult;
  guardFailMask: number;
  status: BarrierStatus;
  /** ms from write start to the Status notification carrying the result. */
  latencyMs: number;
  /** true if a REJECTED_STALE triggered one resync + retry */
  retried: boolean;
}

export type LogKind = 'connect' | 'auth' | 'command' | 'status' | 'disconnect' | 'error' | 'scenario';

export interface LogEntry {
  id: number;
  t: number; // epoch ms
  kind: LogKind;
  transport: TransportKind;
  message: string;
  opcode?: string;
  counter?: number;
  result?: string;
  guardFailMask?: number;
  latencyMs?: number;
  state?: string;
  fault?: string;
  batteryMv?: number;
}

export type Listener = () => void;

export interface BarrierTransport {
  readonly kind: TransportKind;
  getSnapshot(): TransportSnapshot;
  subscribe(listener: Listener): () => void;
  onLog(listener: (e: Omit<LogEntry, 'id'>) => void): () => void;

  scan(timeoutMs?: number): Promise<DiscoveredDevice[]>;
  stopScan(): void;
  connect(deviceId: string): Promise<SessionInfo>;
  disconnect(): Promise<void>;
  sendCommand(opcode: Opcode): Promise<CommandOutcome>;
  /** Re-read Status (pull-to-refresh). */
  refreshStatus(): Promise<BarrierStatus>;
  /** Delete persisted counter for a device and drop the connection. */
  forget(deviceId: string): Promise<void>;
  destroy(): void;
}
