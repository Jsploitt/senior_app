import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Button, Text } from '@/components';
import { CountdownRing } from '@/features/onboarding/CountdownRing';
import { EnrollStep } from '@/features/onboarding/EnrollSteps';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { useEnrollTimer } from '@/features/onboarding/useEnrollTimer';
import { useOnboardingNav } from '@/features/onboarding/useOnboardingNav';
import { ENROLL_BUTTON_HOLD_MS, ENROLL_WINDOW_MS, MAX_OWNERS } from '@/protocol/constants';
import { getSim, useTransportSnapshot } from '@/store/transport';
import { space } from '@/theme/tokens';

const HOLD_S = ENROLL_BUTTON_HOLD_MS / 1000;
const WINDOW_S = ENROLL_WINDOW_MS / 1000;

const openSimEnrollment = () => {
  // Simulator only: do what holding the button would do, so the flow works end to end.
  getSim()?.device.openEnrollment();
};

export default function Enroll() {
  const nav = useOnboardingNav('enroll');
  const snap = useTransportSnapshot();
  const timer = useEnrollTimer(ENROLL_WINDOW_MS, openSimEnrollment);

  // Connected (e.g. via /connect): finish.
  useEffect(() => {
    if (snap.phase === 'ready') router.replace('/onboarding/done');
  }, [snap.phase]);

  const running = timer.phase === 'running';
  const expired = timer.phase === 'expired';
  return (
    <OnboardingPage
      testID="onboarding-enroll"
      title="Pair your phone"
      body={`A barrier accepts new owners only for ${WINDOW_S} seconds after you press its button.`}
      step={nav.step}
      onBack={nav.back}
      primary={{
        title: 'Connect',
        onPress: () => router.push('/connect'),
        hint: 'Opens the screen that finds your barrier',
      }}
      secondary={{ title: 'Skip for now', onPress: nav.skip }}
    >
      <View style={{ gap: space.m, alignSelf: 'stretch' }}>
        <EnrollStep
          n={1}
          icon="hand-left-outline"
          title={`On the barrier, hold the enrollment button for ${HOLD_S} seconds.`}
        />
        <EnrollStep n={2} icon="timer-outline" title={`You now have ${WINDOW_S} seconds.`} active={running}>
          <CountdownRing
            totalMs={timer.totalMs}
            startedAt={timer.startedAt}
            now={timer.now}
            label={expired ? 'Window closed' : 'to pair'}
          />
          <Button
            testID="enroll-start"
            title={running ? 'Restart timer' : expired ? 'Start timer again' : `Start ${WINDOW_S} s timer`}
            variant={running ? 'gray' : 'tinted'}
            onPress={timer.start}
            accessibilityHint="Starts this app's own countdown. Press it right after the barrier's button hold."
          />
          <Text variant="footnote" color="secondaryLabel" align="center">
            This is the app&apos;s own countdown. The phone cannot read the barrier&apos;s window, so hold the
            button again if the barrier stops accepting.
          </Text>
        </EnrollStep>
        <EnrollStep
          n={3}
          icon="keypad-outline"
          title="Tap Connect, then enter the 6-digit passkey from the barrier's label when your phone asks."
        />
        <Text variant="footnote" color="secondaryLabel" align="center">
          A barrier can have up to {MAX_OWNERS} owner phones.
        </Text>
      </View>
    </OnboardingPage>
  );
}
