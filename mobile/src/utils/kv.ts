/**
 * Tiny key/value store: expo-secure-store on device, localStorage on web
 * (web is only used for visual QA), in-memory fallback for tests.
 */
import { Platform } from 'react-native';

interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

const memory = new Map<string, string>();

const memoryKv: KV = {
  async get(k) {
    return memory.get(k) ?? null;
  },
  async set(k, v) {
    memory.set(k, v);
  },
  async del(k) {
    memory.delete(k);
  },
};

function webKv(): KV {
  const ls = (globalThis as { localStorage?: Storage }).localStorage;
  if (!ls) return memoryKv;
  return {
    async get(k) {
      try {
        return ls.getItem(k);
      } catch {
        return memory.get(k) ?? null;
      }
    },
    async set(k, v) {
      try {
        ls.setItem(k, v);
      } catch {
        memory.set(k, v);
      }
    },
    async del(k) {
      try {
        ls.removeItem(k);
      } catch {
        memory.delete(k);
      }
    },
  };
}

function nativeKv(): KV {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
  return {
    get: (k) => SecureStore.getItemAsync(k),
    set: (k, v) => SecureStore.setItemAsync(k, v),
    del: (k) => SecureStore.deleteItemAsync(k),
  };
}

function pick(): KV {
  if (process.env.NODE_ENV === 'test') return memoryKv;
  return Platform.OS === 'web' ? webKv() : nativeKv();
}

export const kv: KV = pick();

/** test helper */
export function __resetMemoryKv() {
  memory.clear();
}
