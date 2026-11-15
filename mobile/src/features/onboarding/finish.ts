import { updateSettings } from '../../store/settings';

/** Marks onboarding complete (the tabs layout stops redirecting). */
export function finishOnboarding() {
  updateSettings({ onboarded: true });
}

/** "Authenticated in X.XX s" (phone-measured) when a session exists. */
export function formatAuthSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`;
}

export function doneCopy(
  authLatencyMs: number | null,
  transport: 'ble' | 'sim' = 'ble',
): { title: string; body: string } {
  if (authLatencyMs !== null) {
    return {
      title: "You're the owner.",
      body: `Authenticated in ${formatAuthSeconds(authLatencyMs)}, measured by this phone. You can now lower, raise or stop the barrier.`,
    };
  }
  if (transport === 'sim') {
    return {
      title: "You're all set.",
      body: 'The simulator is ready. On the Barrier tab, tap Connect to start the virtual barrier.',
    };
  }
  return {
    title: "You're all set.",
    body: 'When you are next to the barrier, open the Barrier tab and tap Connect.',
  };
}
