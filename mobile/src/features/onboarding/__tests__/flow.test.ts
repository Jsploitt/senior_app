import { nextStep, prevStep, progressFor, stepsFor, modeOptions, STEP_ROUTE } from '../flow';
import { doneCopy, finishOnboarding } from '../finish';
import { settingsStore } from '../../../store/settings';
import { formatCountdown, remainingMs, ringFraction, timerPhase, spokenCountdown } from '../countdown';
import { ENROLL_WINDOW_MS } from '../../../protocol/constants';

describe('onboarding flow', () => {
  it('skips the Bluetooth page in simulator mode', () => {
    expect(stepsFor('sim')).toEqual(['welcome', 'mode', 'enroll', 'done']);
    expect(nextStep('mode', 'sim')).toBe('enroll');
    expect(prevStep('enroll', 'sim')).toBe('mode');
  });
  it('includes the Bluetooth page for BLE', () => {
    expect(stepsFor('ble')).toHaveLength(5);
    expect(nextStep('mode', 'ble')).toBe('bluetooth');
    expect(nextStep('bluetooth', 'ble')).toBe('enroll');
    expect(nextStep('done', 'ble')).toBeNull();
    expect(prevStep('welcome', 'ble')).toBeNull();
  });
  it('progress dots track position and total', () => {
    expect(progressFor('enroll', 'ble')).toEqual({ index: 3, total: 5 });
    expect(progressFor('enroll', 'sim')).toEqual({ index: 2, total: 4 });
  });
  it('every step has a route', () => {
    for (const s of stepsFor('ble')) expect(STEP_ROUTE[s]).toMatch(/^\/onboarding/);
  });
  it('disables Bluetooth where unsupported', () => {
    expect(modeOptions(false).find((o) => o.kind === 'ble')?.enabled).toBe(false);
    expect(modeOptions(false).find((o) => o.kind === 'sim')?.enabled).toBe(true);
    expect(modeOptions(true).every((o) => o.enabled)).toBe(true);
  });
  it('finishing onboarding sets the flag', () => {
    settingsStore.set({ onboarded: false });
    finishOnboarding();
    expect(settingsStore.get().onboarded).toBe(true);
  });
  it('done copy shows phone-measured auth time when known', () => {
    expect(doneCopy(1234).body).toContain('1.23 s');
    expect(doneCopy(null).title).toBe("You're all set.");
    expect(doneCopy(null, 'sim').body).toContain('simulator');
  });
});

describe('countdown helpers', () => {
  it('formats m:ss with ceiling', () => {
    expect(formatCountdown(60000)).toBe('1:00');
    expect(formatCountdown(59001)).toBe('1:00');
    expect(formatCountdown(59000)).toBe('0:59');
    expect(formatCountdown(1)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5)).toBe('0:00');
  });
  it('tracks remaining time and phase', () => {
    expect(remainingMs(ENROLL_WINDOW_MS, null, 5)).toBe(ENROLL_WINDOW_MS);
    expect(remainingMs(ENROLL_WINDOW_MS, 1000, 31000)).toBe(30000);
    expect(remainingMs(ENROLL_WINDOW_MS, 0, 999999)).toBe(0);
    expect(ringFraction(ENROLL_WINDOW_MS, 0, 30000)).toBe(0.5);
    expect(timerPhase(ENROLL_WINDOW_MS, null, 0)).toBe('idle');
    expect(timerPhase(ENROLL_WINDOW_MS, 0, 59999)).toBe('running');
    expect(timerPhase(ENROLL_WINDOW_MS, 0, 60000)).toBe('expired');
  });
  it('speaks seconds', () => {
    expect(spokenCountdown(1000)).toBe('1 second left');
    expect(spokenCountdown(42000)).toBe('42 seconds left');
  });
});
