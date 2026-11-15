/**
 * Command counter handling (INTERFACES.md 1.1: strictly increasing per bond,
 * persisted on both sides; section 2 rules 5-6: REPLAY / COUNTER_JUMP).
 *
 * The phone only sees RESULT_REJECTED_STALE for REPLAY, COUNTER_JUMP and
 * EXPIRED (main.c:205-208), so "resync" is triggered by REJECTED_STALE.
 */
import { CMD_COUNTER_WINDOW } from '../protocol/constants';
import { kv } from '../utils/kv';

export interface CounterStore {
  get(deviceId: string): Promise<number>;
  set(deviceId: string, counter: number): Promise<void>;
  clear(deviceId: string): Promise<void>;
}

const keyFor = (deviceId: string) => `m010.counter.${deviceId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export const persistentCounterStore: CounterStore = {
  async get(deviceId) {
    const raw = await kv.get(keyFor(deviceId));
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n >>> 0 : 0;
  },
  async set(deviceId, counter) {
    await kv.set(keyFor(deviceId), String(counter >>> 0));
  },
  async clear(deviceId) {
    await kv.del(keyFor(deviceId));
  },
};

export function memoryCounterStore(initial: Record<string, number> = {}): CounterStore & {
  dump(): Record<string, number>;
} {
  const m = new Map(Object.entries(initial));
  return {
    async get(id) {
      return m.get(id) ?? 0;
    },
    async set(id, c) {
      m.set(id, c >>> 0);
    },
    async clear(id) {
      m.delete(id);
    },
    dump: () => Object.fromEntries(m),
  };
}

/** next = max(stored, status.last_counter) + 1, as uint32. */
export function nextCounter(stored: number, statusLastCounter: number): number {
  return (Math.max(stored >>> 0, statusLastCounter >>> 0) + 1) >>> 0;
}

/** True if `candidate` is inside the firmware acceptance window relative to last. */
export function withinWindow(last: number, candidate: number): boolean {
  return candidate > last && candidate - last <= CMD_COUNTER_WINDOW;
}
