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
import { useSettings } from '@/store/settings';
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
  const { transport } = useSettings();
  const timer = useEnrollTimer(ENROLL_WINDOW_MS, openSimEnrollment);

  // Connected (e.g. via /connect): finish.
  useEffect(() => {
    if (snap.phase === 'ready') router.replace('/onboarding/done');
  }, [snap.phase]);

  const running = timer.phase === 'running';
  const expired = timer.phase === 'expired';
  const idle = timer.phase === 'idle';
  const isSim = transport === 'sim';
  const startTitle = expired ? 'Start timer again' : `Start ${WINDOW_S} s timer`;
  return (
    <OnboardingPage
      testID="onboarding-enroll"
      title="Pair your phone"
      body={
        isSim
          ? `The virtual barrier accepts new owners for ${WINDOW_S} seconds after you start the timer.`
          : `A barrier accepts new owners for ${WINDOW_S} seconds after you hold its button.`
      }
      step={nav.step}
      onBack={nav.back}
      primary={
        running
          ? {
              title: 'Connect',
              onPress: () => router.push('/connect'),
              hint: 'Opens the screen that finds your barrier',
            }
          : {
              title: startTitle,
              onPress: timer.start,
              hint: isSim
                ? 'Starts the countdown and opens enrollment on the virtual barrier'
                : "Starts this app's own countdown. Press it right after the barrier's button hold.",
            }
      }
      secondary={{ title: 'Skip for now', onPress: nav.skip }}
    >
      <View style={{ gap: space.m, alignSelf: 'stretch' }}>
        {isSim ? (
          <EnrollStep
            n={1}
            icon="hand-left-outline"
            title={`In the simulator the enrollment button is virtual: tap Start to open the ${WINDOW_S} s window.`}
          />
        ) : (
          <EnrollStep n={1} icon="hand-left-outline" title={`Hold its button for ${HOLD_S} seconds.`} />
        )}
        <EnrollStep
          n={2}
          icon="timer-outline"
          title={
            running
              ? `You have ${WINDOW_S} seconds. Connect now.`
              : expired
                ? 'The window closed. Start the timer again.'
                : isSim
                  ? `Then you will have ${WINDOW_S} seconds to connect.`
                  : `Then tap Start: you will have ${WINDOW_S} seconds to connect.`
          }
          active={running}
        >
          <CountdownRing
            totalMs={timer.totalMs}
            startedAt={timer.startedAt}
            now={timer.now}
            size={96}
            label={expired ? 'Window closed' : idle ? 'not started' : 'to pair'}
          />
          {running ? (
            <Button
              testID="enroll-start"
              title="Restart timer"
              variant="plain"
              size="small"
              onPress={timer.start}
              accessibilityHint="Starts the countdown again"
            />
          ) : null}
          {isSim ? null : (
            <Text variant="footnote" color="secondaryLabel" align="center">
              This is the app&apos;s own countdown. The phone cannot read the barrier&apos;s window, so hold
              the button again if the barrier stops accepting.
            </Text>
          )}
        </EnrollStep>
        <EnrollStep
          n={3}
          icon="keypad-outline"
          title={
            isSim
              ? 'Tap Connect to pair with the virtual barrier.'
              : "Tap Connect, then enter the 6-digit passkey from the barrier's label when your phone asks."
          }
        />
        {running ? null : (
          <Text variant="footnote" color="secondaryLabel" align="center">
            Connect becomes available once the timer is running.
          </Text>
        )}
        <Text variant="footnote" color="secondaryLabel" align="center">
          A barrier can have up to {MAX_OWNERS} owner phones.
        </Text>
      </View>
    </OnboardingPage>
  );
}
