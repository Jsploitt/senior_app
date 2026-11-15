import Constants from 'expo-constants';

export const CONTRACT_VERSION = 'INTERFACES.md as of 2026-11-15';
export const APP_NAME = 'M010 Barrier';
export const TEAM_LINE = 'TEAM M010 · KFUPM Senior Design';

export interface ConstantsLike {
  expoConfig?: {
    version?: string;
    ios?: { buildNumber?: string };
    android?: { versionCode?: number };
  } | null;
}

/** Version and build for the About page. */
export function appVersionInfo(c: ConstantsLike = Constants as ConstantsLike): {
  version: string;
  build: string;
} {
  const cfg = c.expoConfig;
  const build =
    cfg?.ios?.buildNumber ?? (cfg?.android?.versionCode != null ? String(cfg.android.versionCode) : '1');
  return { version: cfg?.version ?? '1.0.0', build };
}
