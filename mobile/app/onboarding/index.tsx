import { View } from 'react-native';
import { Icon, Text, type IconName } from '@/components';
import { Illustration, OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { useOnboardingNav } from '@/features/onboarding/useOnboardingNav';
import { space } from '@/theme/tokens';

const POINTS: { icon: IconName; text: string }[] = [
  { icon: 'swap-vertical', text: 'Lower, raise or stop your barrier' },
  { icon: 'shield-checkmark-outline', text: 'Only owner phones can move it' },
  { icon: 'cloud-offline-outline', text: 'No internet, no cloud, no account' },
];

export default function Welcome() {
  const nav = useOnboardingNav('welcome');
  return (
    <OnboardingPage
      testID="onboarding-welcome"
      title="M010 Barrier"
      body="Control your parking barrier from your phone. Everything stays between your phone and the barrier: no internet, no cloud."
      illustration={<Illustration icon="car-sport" badge="bluetooth" />}
      step={nav.step}
      primary={{ title: 'Get started', onPress: nav.next }}
    >
      <View style={{ gap: space.m, alignSelf: 'stretch' }}>
        {POINTS.map((p) => (
          <View
            key={p.text}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}
            accessible
            accessibilityLabel={p.text}
          >
            <Icon name={p.icon} size={24} color="tint" />
            <Text variant="callout" style={{ flex: 1 }}>
              {p.text}
            </Text>
          </View>
        ))}
      </View>
    </OnboardingPage>
  );
}
