/**
 * On-phone event log (Spec 5 / Spec 6 evidence). In memory, capped.
 * Persistence and CSV export: src/features/health (workstream B).
 */
import type { LogEntry } from '../transport/types';
import { createStore, useStore } from './createStore';

export const LOG_CAP = 2000;

export interface EventLogState {
  entries: LogEntry[];
  nextId: number;
}

export const eventLogStore = createStore<EventLogState>({ entries: [], nextId: 1 });

export function appendLog(e: Omit<LogEntry, 'id'>) {
  eventLogStore.set((s) => {
    const entry: LogEntry = { ...e, id: s.nextId };
    const entries = [...s.entries, entry];
    if (entries.length > LOG_CAP) entries.splice(0, entries.length - LOG_CAP);
    return { entries, nextId: s.nextId + 1 };
  });
}

export function replaceLog(entries: LogEntry[]) {
  const nextId = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  eventLogStore.set({ entries: entries.slice(-LOG_CAP), nextId });
}

export function clearLog() {
  eventLogStore.set({ entries: [], nextId: 1 });
}

export const useEventLog = () => useStore(eventLogStore);
