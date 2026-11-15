import { router } from 'expo-router';
import { useSettings } from '../../store/settings';
import { nextStep, prevStep, progressFor, SKIP_TARGET, STEP_ROUTE, type OnboardingStep } from './flow';

export function useOnboardingNav(step: OnboardingStep) {
  const { transport } = useSettings();
  const next = nextStep(step, transport);
  const prev = prevStep(step, transport);
  return {
    step: progressFor(step, transport),
    next: () => {
      if (next) router.push(STEP_ROUTE[next] as never);
    },
    back: prev ? () => router.back() : undefined,
    skip: () => router.push(STEP_ROUTE[SKIP_TARGET] as never),
  };
}
