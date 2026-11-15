/**
 * Web-only QA hook for Playwright screenshots (docs/PROGRESS.md, Phase 3).
 * The web build is never shipped; native builds never attach this.
 */
import { Platform } from 'react-native';
import { getSim, getTransport, setTransportKind } from '../store/transport';
import { settingsStore, updateSettings } from '../store/settings';
import { appendLog, clearLog } from '../store/eventLog';

export function installQaHook() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  (window as unknown as { __m010: unknown }).__m010 = {
    getSim,
    getTransport,
    setTransportKind,
    updateSettings,
    settings: () => settingsStore.get(),
    appendLog,
    clearLog,
  };
}
