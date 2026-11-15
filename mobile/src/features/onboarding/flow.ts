/** Pure onboarding navigation logic. */
import type { TransportKind } from '../../transport/types';

export type OnboardingStep = 'welcome' | 'mode' | 'bluetooth' | 'enroll' | 'done';

export const STEP_ROUTE: Record<OnboardingStep, string> = {
  welcome: '/onboarding',
  mode: '/onboarding/mode',
  bluetooth: '/onboarding/bluetooth',
  enroll: '/onboarding/enroll',
  done: '/onboarding/done',
};

/** The simulator needs no Bluetooth permission, so that page is skipped. */
export function stepsFor(kind: TransportKind): OnboardingStep[] {
  return kind === 'sim'
    ? ['welcome', 'mode', 'enroll', 'done']
    : ['welcome', 'mode', 'bluetooth', 'enroll', 'done'];
}

export function nextStep(step: OnboardingStep, kind: TransportKind): OnboardingStep | null {
  const s = stepsFor(kind);
  return s[s.indexOf(step) + 1] ?? null;
}

export function prevStep(step: OnboardingStep, kind: TransportKind): OnboardingStep | null {
  const s = stepsFor(kind);
  const i = s.indexOf(step);
  return i > 0 ? (s[i - 1] ?? null) : null;
}

/** 0-based dot index and total for the progress dots. */
export function progressFor(step: OnboardingStep, kind: TransportKind): { index: number; total: number } {
  const s = stepsFor(kind);
  return { index: Math.max(0, s.indexOf(step)), total: s.length };
}

/** Where "Skip" goes: straight to the final page. */
export const SKIP_TARGET: OnboardingStep = 'done';

/** Mode choice availability: Bluetooth needs a native build. */
export function modeOptions(bleSupported: boolean): { kind: TransportKind; enabled: boolean }[] {
  return [
    { kind: 'ble', enabled: bleSupported },
    { kind: 'sim', enabled: true },
  ];
}
