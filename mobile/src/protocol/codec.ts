/**
 * Pure byte codec for the M010 GATT contract. Port of tools/ble_client.py
 * (pack_command: struct "<BII", parse_status: struct "<BBBBBBHI").
 * No React, no BLE: safe to unit test and to share with SimTransport.
 */
import {
  BarrierState,
  CMD_FRAME_LEN,
  CmdResult,
  FaultReason,
  FLAG_OWNER_CONNECTED,
  FLAG_SENSORS_VALID,
  FLAG_ZONE_CLEAR,
  Opcode,
  SESSION_LEN,
  STATUS_LEN,
} from './constants';

export interface CommandFrame {
  opcode: Opcode;
  counter: number;
  nonce: number;
}

export interface BarrierStatus {
  state: BarrierState;
  lastResult: CmdResult;
  fault: FaultReason;
  guardFailMask: number;
  zoneClear: boolean;
  sensorsValid: boolean;
  ownerConnected: boolean;
  batteryMv: number;
  lastCounter: number;
}

export class CodecError extends Error {}

const u32 = (n: number) => n >>> 0;

/** ble_client.pack_command: counter and nonce masked to uint32, little-endian. */
export function encodeCommand(f: CommandFrame): Uint8Array {
  const out = new Uint8Array(CMD_FRAME_LEN);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, f.opcode & 0xff);
  dv.setUint32(1, u32(f.counter), true);
  dv.setUint32(5, u32(f.nonce), true);
  return out;
}

export function decodeCommand(bytes: Uint8Array): CommandFrame {
  if (bytes.length !== CMD_FRAME_LEN) {
    throw new CodecError(`command frame is ${bytes.length} bytes, expected ${CMD_FRAME_LEN}`);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { opcode: dv.getUint8(0) as Opcode, counter: dv.getUint32(1, true), nonce: dv.getUint32(5, true) };
}

/** ble_client.parse_status; throws on wrong length like the reference client. */
export function decodeStatus(bytes: Uint8Array): BarrierStatus {
  if (bytes.length !== STATUS_LEN) {
    throw new CodecError(`status payload is ${bytes.length} bytes, expected ${STATUS_LEN}`);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = dv.getUint8(4);
  return {
    state: dv.getUint8(0) as BarrierState,
    lastResult: dv.getUint8(1) as CmdResult,
    fault: dv.getUint8(2) as FaultReason,
    guardFailMask: dv.getUint8(3),
    zoneClear: (flags & FLAG_ZONE_CLEAR) !== 0,
    sensorsValid: (flags & FLAG_SENSORS_VALID) !== 0,
    ownerConnected: (flags & FLAG_OWNER_CONNECTED) !== 0,
    batteryMv: dv.getUint16(6, true),
    lastCounter: dv.getUint32(8, true),
  };
}

/** Inverse of decodeStatus (used by SimTransport and tests). reserved byte = 0. */
export function encodeStatus(s: BarrierStatus): Uint8Array {
  const out = new Uint8Array(STATUS_LEN);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, s.state);
  dv.setUint8(1, s.lastResult);
  dv.setUint8(2, s.fault);
  dv.setUint8(3, s.guardFailMask & 0xff);
  dv.setUint8(
    4,
    (s.zoneClear ? FLAG_ZONE_CLEAR : 0) |
      (s.sensorsValid ? FLAG_SENSORS_VALID : 0) |
      (s.ownerConnected ? FLAG_OWNER_CONNECTED : 0),
  );
  dv.setUint8(5, 0);
  dv.setUint16(6, s.batteryMv & 0xffff, true);
  dv.setUint32(8, u32(s.lastCounter), true);
  return out;
}

/** Session characteristic: 4-byte LE uint32 (ble_auth_gatt.c:134-137). */
export function decodeSession(bytes: Uint8Array): number {
  if (bytes.length !== SESSION_LEN) {
    throw new CodecError(`session payload is ${bytes.length} bytes, expected ${SESSION_LEN}`);
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
}

export function encodeSession(nonce: number): Uint8Array {
  const out = new Uint8Array(SESSION_LEN);
  new DataView(out.buffer).setUint32(0, u32(nonce), true);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new CodecError(`bad hex: ${hex}`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/* Base64 (ble-plx transports characteristic values as base64). No Buffer dependency. */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += b === undefined ? '=' : B64[(n >> 6) & 63]!;
    out += c === undefined ? '=' : B64[n & 63]!;
  }
  return out;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    const n = chunk.split('').reduce((acc, ch, j) => acc | (B64.indexOf(ch) << (18 - 6 * j)), 0);
    bytes.push((n >> 16) & 0xff);
    if (chunk.length > 2) bytes.push((n >> 8) & 0xff);
    if (chunk.length > 3) bytes.push(n & 0xff);
  }
  return Uint8Array.from(bytes);
}
