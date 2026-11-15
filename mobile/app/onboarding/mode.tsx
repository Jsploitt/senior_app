import { View } from 'react-native';
import { Text } from '@/components';
import { modeOptions } from '@/features/onboarding/flow';
import { ModeCard } from '@/features/onboarding/ModeCard';
import { Illustration, OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { useOnboardingNav } from '@/features/onboarding/useOnboardingNav';
import { chooseTransport } from '@/features/settings/actions';
import { useSettings } from '@/store/settings';
import { bleSupported } from '@/store/transport';
import { space } from '@/theme/tokens';

export default function Mode() {
  const nav = useOnboardingNav('mode');
  const { transport } = useSettings();
  const opts = modeOptions(bleSupported);
  const bleOff = !opts.find((o) => o.kind === 'ble')?.enabled;
  return (
    <OnboardingPage
      testID="onboarding-mode"
      title="How will you use it?"
      body="You can change this any time in Settings."
      illustration={<Illustration icon="options-outline" />}
      step={nav.step}
      onBack={nav.back}
      primary={{ title: 'Continue', onPress: nav.next }}
    >
      <View style={{ gap: space.m, alignSelf: 'stretch' }} accessibilityRole="radiogroup">
        <ModeCard
          testID="mode-ble"
          icon="bluetooth"
          title="I have the barrier here"
          detail="Connect over Bluetooth to a real M010 barrier."
          selected={transport === 'ble'}
          disabled={bleOff}
          onPress={() => chooseTransport('ble')}
        />
        <ModeCard
          testID="mode-sim"
          icon="flask-outline"
          title="Try the simulator"
          detail="No board needed. A virtual barrier runs inside the app."
          selected={transport === 'sim'}
          onPress={() => chooseTransport('sim')}
        />
        {bleOff ? (
          <Text variant="footnote" color="secondaryLabel" testID="mode-ble-unavailable">
            Bluetooth needs the iPhone or Android app. In a web browser only the simulator is available.
          </Text>
        ) : null}
      </View>
    </OnboardingPage>
  );
}
