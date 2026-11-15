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

/** Every page that can appear in the flow; the dots always show all of them. */
export const DOT_STEPS: OnboardingStep[] = ['welcome', 'mode', 'bluetooth', 'enroll', 'done'];

/**
 * 0-based dot index and total for the progress dots. The total is fixed (5) so the dots never
 * change between pages or modes; the Bluetooth dot is reported as skipped in simulator mode.
 */
export function progressFor(
  step: OnboardingStep,
  kind: TransportKind,
): { index: number; total: number; skipped: number[] } {
  const skipped = stepsFor(kind).includes('bluetooth') ? [] : [DOT_STEPS.indexOf('bluetooth')];
  return { index: Math.max(0, DOT_STEPS.indexOf(step)), total: DOT_STEPS.length, skipped };
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
