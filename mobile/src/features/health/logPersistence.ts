/**
 * Event-log persistence (Spec 5 / Spec 6 evidence must survive an app restart).
 *
 * Ring buffer (LOG_CAP) stored as JSON: a file in the document directory on native,
 * localStorage on web. Local only, no network. Writes are debounced.
 *
 * app/_layout.tsx must call `initLogPersistence()` once at startup; the Log screen also calls it
 * (idempotent) so persistence works before that wiring lands.
 */
import { AppState, Platform } from 'react-native';
import { LOG_CAP, eventLogStore, replaceLog } from '../../store/eventLog';
import type { LogEntry, LogKind } from '../../transport/types';

export const LOG_STORAGE_KEY = 'm010.eventlog.v1';
export const LOG_FILE_NAME = 'm010-eventlog.json';
export const SAVE_DEBOUNCE_MS = 1000;

export interface LogStorage {
  read(): Promise<string | null>;
  write(json: string): Promise<void>;
}

const KINDS: readonly LogKind[] = ['connect', 'auth', 'command', 'status', 'disconnect', 'error', 'scenario'];

/** Parse stored JSON defensively; drops malformed entries. Exported for tests. */
export function parseStoredLog(raw: string | null): LogEntry[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    const list = Array.isArray(data) ? data : (data as { entries?: unknown } | null)?.entries;
    if (!Array.isArray(list)) return [];
    const out: LogEntry[] = [];
    for (const item of list as Record<string, unknown>[]) {
      if (
        item &&
        typeof item.id === 'number' &&
        typeof item.t === 'number' &&
        typeof item.message === 'string' &&
        typeof item.kind === 'string' &&
        (KINDS as readonly string[]).includes(item.kind) &&
        (item.transport === 'sim' || item.transport === 'ble')
      ) {
        out.push(item as unknown as LogEntry);
      }
    }
    return out.slice(-LOG_CAP);
  } catch {
    return [];
  }
}

export function serializeLog(entries: readonly LogEntry[]): string {
  return JSON.stringify({ v: 1, entries: entries.slice(-LOG_CAP) });
}

/** Entries recorded before the load finished are kept, renumbered after the stored ones. */
export function mergeLoaded(stored: LogEntry[], live: readonly LogEntry[]): LogEntry[] {
  if (live.length === 0) return stored;
  let next = stored.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  const merged = [...stored, ...live.map((e) => ({ ...e, id: next++ }))];
  return merged.slice(-LOG_CAP);
}

function webStorage(): LogStorage | null {
  const ls = (globalThis as { localStorage?: Storage }).localStorage;
  if (!ls) return null;
  return {
    async read() {
      return ls.getItem(LOG_STORAGE_KEY);
    },
    async write(json) {
      ls.setItem(LOG_STORAGE_KEY, json);
    },
  };
}

function nativeStorage(): LogStorage {
  // Lazy: keep the native module out of web bundles.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('expo-file-system') as typeof import('expo-file-system');
  const file = () => new fs.File(fs.Paths.document, LOG_FILE_NAME);
  return {
    async read() {
      const f = file();
      return f.exists ? await f.text() : null;
    },
    async write(json) {
      const f = file();
      if (!f.exists) f.create();
      await f.write(json);
    },
  };
}

function defaultStorage(): LogStorage | null {
  return Platform.OS === 'web' ? webStorage() : nativeStorage();
}

let initPromise: Promise<void> | null = null;
let activeStorage: LogStorage | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let writing: Promise<void> = Promise.resolve();
let unsubscribe: (() => void) | null = null;
let appStateSub: { remove(): void } | null = null;

async function save() {
  const storage = activeStorage;
  if (!storage) return;
  dirty = false;
  const json = serializeLog(eventLogStore.get().entries);
  writing = writing.then(() => storage.write(json)).catch(() => undefined);
  await writing;
}

function schedule() {
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void save();
  }, SAVE_DEBOUNCE_MS);
}

/** Write any pending change now (app going to background, tests). */
export async function flushLogPersistence(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (dirty) await save();
  await writing;
}

/**
 * Load the persisted log into the store, then start saving changes. Idempotent: every call
 * returns the same promise. Never rejects (storage problems degrade to an in-memory log).
 */
export function initLogPersistence(storage?: LogStorage | null): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      activeStorage = storage === undefined ? defaultStorage() : storage;
    } catch {
      activeStorage = null;
    }
    if (!activeStorage) return;
    try {
      const stored = parseStoredLog(await activeStorage.read());
      const live = eventLogStore.get().entries;
      if (stored.length > 0) replaceLog(mergeLoaded(stored, live));
    } catch {
      /* unreadable store: start fresh, it is overwritten on the next save */
    }
    let last = eventLogStore.get().entries;
    unsubscribe = eventLogStore.subscribe(() => {
      const cur = eventLogStore.get().entries;
      if (cur !== last) {
        last = cur;
        schedule();
      }
    });
    appStateSub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void flushLogPersistence();
    });
  })();
  return initPromise;
}

/** test helper */
export function __resetLogPersistence() {
  if (timer) clearTimeout(timer);
  timer = null;
  dirty = false;
  unsubscribe?.();
  unsubscribe = null;
  appStateSub?.remove();
  appStateSub = null;
  activeStorage = null;
  initPromise = null;
  writing = Promise.resolve();
}
