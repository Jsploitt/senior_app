import { kv } from '../utils/kv';
import type { TransportKind } from '../transport/types';
import { createStore, useStore } from './createStore';

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  loaded: boolean;
  transport: TransportKind;
  theme: ThemePref;
  onboarded: boolean;
  haptics: boolean;
  lastDeviceId: string | null;
  lastDeviceName: string | null;
  presenterUnlocked: boolean;
}

const KEY = 'm010.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  loaded: false,
  // Simulation by default so the app demos with no board (FPR requirement).
  transport: 'sim',
  theme: 'system',
  onboarded: false,
  haptics: true,
  lastDeviceId: null,
  lastDeviceName: null,
  presenterUnlocked: false,
};

export const settingsStore = createStore<Settings>(DEFAULT_SETTINGS);

export async function loadSettings() {
  try {
    const raw = await kv.get(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    settingsStore.set({ ...DEFAULT_SETTINGS, ...parsed, loaded: true });
  } catch {
    settingsStore.set({ ...DEFAULT_SETTINGS, loaded: true });
  }
}

export function updateSettings(patch: Partial<Omit<Settings, 'loaded'>>) {
  settingsStore.set(patch);
  const { loaded: _l, ...persist } = settingsStore.get();
  void kv.set(KEY, JSON.stringify(persist));
}

export const useSettings = () => useStore(settingsStore);
