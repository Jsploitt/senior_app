import { updateSettings } from '../../store/settings';

/** Marks onboarding complete (the tabs layout stops redirecting). */
export function finishOnboarding() {
  updateSettings({ onboarded: true });
}

/** "Authenticated in X.XX s" (phone-measured) when a session exists. */
export function formatAuthSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`;
}

export function doneCopy(authLatencyMs: number | null): { title: string; body: string } {
  if (authLatencyMs !== null) {
    return {
      title: "You're the owner.",
      body: `Authenticated in ${formatAuthSeconds(authLatencyMs)}, measured by this phone. You can now lower, raise or stop the barrier.`,
    };
  }
  return {
    title: "You're all set.",
    body: 'Open the Barrier tab and tap Connect whenever you are next to the barrier.',
  };
}
