import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(l: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const ls = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      ls.forEach((l) => l());
    },
    subscribe(l) {
      ls.add(l);
      return () => {
        ls.delete(l);
      };
    },
  };
}

export function useStore<T extends object>(s: Store<T>): T {
  return useSyncExternalStore(s.subscribe, s.get, s.get);
}
