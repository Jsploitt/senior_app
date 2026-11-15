import { router } from 'expo-router';
import { Illustration, OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { useOnboardingNav } from '@/features/onboarding/useOnboardingNav';
import { doneCopy, finishOnboarding } from '@/features/onboarding/finish';
import { useSettings } from '@/store/settings';
import { useTransportSnapshot } from '@/store/transport';

export default function Done() {
  const nav = useOnboardingNav('done');
  const snap = useTransportSnapshot();
  const { transport } = useSettings();
  const copy = doneCopy(snap.phase === 'ready' ? (snap.session?.authLatencyMs ?? null) : null, transport);
  return (
    <OnboardingPage
      testID="onboarding-done"
      title={copy.title}
      body={copy.body}
      illustration={<Illustration icon="checkmark-circle" />}
      step={nav.step}
      primary={{
        title: 'Go to controls',
        onPress: () => {
          finishOnboarding();
          router.replace('/');
        },
      }}
    />
  );
}
