import type { LogEntry } from '../../../transport/types';
import { appendLog, clearLog, eventLogStore, LOG_CAP, replaceLog } from '../../../store/eventLog';
import {
  SAVE_DEBOUNCE_MS,
  __resetLogPersistence,
  flushLogPersistence,
  initLogPersistence,
  mergeLoaded,
  parseStoredLog,
  serializeLog,
  type LogStorage,
} from '../logPersistence';

jest.useFakeTimers();

function memStorage(initial: string | null = null) {
  const s = { data: initial, writes: 0 };
  const storage: LogStorage = {
    read: async () => s.data,
    write: async (j) => {
      s.data = j;
      s.writes++;
    },
  };
  return { s, storage };
}
const add = (message: string) => appendLog({ t: Date.now(), kind: 'connect', transport: 'sim', message });

beforeEach(() => {
  __resetLogPersistence();
  clearLog();
});

describe('parse / serialize', () => {
  it('round-trips and drops malformed entries', () => {
    const good: LogEntry = { id: 1, t: 5, kind: 'auth', transport: 'ble', message: 'ok', latencyMs: 10 };
    const raw = JSON.stringify({ v: 1, entries: [good, { id: 'x' }, null, { ...good, kind: 'nope' }] });
    expect(parseStoredLog(raw)).toEqual([good]);
    expect(parseStoredLog(serializeLog([good]))).toEqual([good]);
    expect(parseStoredLog('not json')).toEqual([]);
    expect(parseStoredLog(null)).toEqual([]);
  });
  it('respects the ring-buffer cap', () => {
    const many = Array.from({ length: LOG_CAP + 5 }, (_, i) => ({
      id: i + 1,
      t: i,
      kind: 'status' as const,
      transport: 'sim' as const,
      message: String(i),
    }));
    const back = parseStoredLog(serializeLog(many));
    expect(back).toHaveLength(LOG_CAP);
    expect(back[back.length - 1]!.id).toBe(LOG_CAP + 5);
  });
  it('mergeLoaded renumbers live entries after stored ones', () => {
    const stored = [{ id: 9, t: 1, kind: 'auth' as const, transport: 'sim' as const, message: 'old' }];
    const live = [{ id: 1, t: 2, kind: 'auth' as const, transport: 'sim' as const, message: 'new' }];
    expect(mergeLoaded(stored, live).map((x) => x.id)).toEqual([9, 10]);
  });
});

describe('initLogPersistence', () => {
  it('loads the stored log, then saves changes debounced', async () => {
    const stored = [{ id: 4, t: 1, kind: 'auth', transport: 'sim', message: 'from disk' }];
    const { s, storage } = memStorage(serializeLog(stored as never));
    await initLogPersistence(storage);
    expect(eventLogStore.get().entries.map((x) => x.message)).toEqual(['from disk']);
    expect(eventLogStore.get().nextId).toBe(5);

    add('a');
    add('b');
    expect(s.writes).toBe(0);
    await jest.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);
    expect(s.writes).toBe(1);
    expect(parseStoredLog(s.data).map((x) => x.message)).toEqual(['from disk', 'a', 'b']);
  });

  it('is idempotent', async () => {
    const { storage } = memStorage();
    const p1 = initLogPersistence(storage);
    const p2 = initLogPersistence(memStorage().storage);
    expect(p2).toBe(p1);
    await p1;
  });

  it('keeps entries logged before the load finished', async () => {
    const stored = [{ id: 1, t: 1, kind: 'auth', transport: 'sim', message: 'disk' }];
    const { storage } = memStorage(serializeLog(stored as never));
    add('early');
    await initLogPersistence(storage);
    expect(eventLogStore.get().entries.map((x) => x.message)).toEqual(['disk', 'early']);
  });

  it('persists a clear and supports flush', async () => {
    const { s, storage } = memStorage();
    await initLogPersistence(storage);
    add('x');
    await flushLogPersistence();
    expect(parseStoredLog(s.data)).toHaveLength(1);
    clearLog();
    await flushLogPersistence();
    expect(parseStoredLog(s.data)).toHaveLength(0);
  });

  it('survives unreadable storage', async () => {
    await initLogPersistence({
      read: async () => {
        throw new Error('disk');
      },
      write: async () => undefined,
    });
    replaceLog([]);
    expect(eventLogStore.get().entries).toEqual([]);
  });
});
