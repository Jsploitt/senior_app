import { Linking, Platform } from 'react-native';
import { useCallback, useEffect, useReducer } from 'react';
import { Banner } from '@/components';
import { Illustration, OnboardingPage } from '@/features/onboarding/OnboardingPage';
import {
  checkBluetoothPermission,
  permissionAction,
  permissionCopy,
  permissionReducer,
  requestBluetoothPermission,
} from '@/features/onboarding/permissions';
import { useOnboardingNav } from '@/features/onboarding/useOnboardingNav';

export default function BluetoothPermission() {
  const nav = useOnboardingNav('bluetooth');
  const [state, dispatch] = useReducer(permissionReducer, 'unknown');
  const copy = permissionCopy(state);
  const action = permissionAction(state);

  useEffect(() => {
    let live = true;
    void checkBluetoothPermission().then((s) => {
      if (live && s === 'granted') dispatch({ type: 'result', result: 'granted' });
    });
    return () => {
      live = false;
    };
  }, []);

  const onPrimary = useCallback(async () => {
    if (action === 'continue') return nav.next();
    if (action === 'openSettings') {
      void Linking.openSettings().catch(() => undefined);
      dispatch({ type: 'reset' });
      return;
    }
    if (action === 'request') {
      dispatch({ type: 'request' });
      const result = await requestBluetoothPermission();
      dispatch({ type: 'result', result });
      // iOS has no pre-prompt: the system asks on first connection, so move on.
      if (Platform.OS !== 'android' && result === 'granted') nav.next();
    }
  }, [action, nav]);

  return (
    <OnboardingPage
      testID="onboarding-bluetooth"
      title={copy.title}
      body={copy.body}
      illustration={<Illustration icon="bluetooth" />}
      step={nav.step}
      onBack={nav.back}
      primary={{ title: copy.button, onPress: () => void onPrimary(), loading: state === 'requesting' }}
      secondary={state === 'granted' ? undefined : { title: 'Not now', onPress: nav.next }}
    >
      {copy.status ? (
        <Banner
          tone={state === 'granted' ? 'positive' : 'warning'}
          icon={state === 'granted' ? 'checkmark-circle' : 'alert-circle'}
          title={copy.status}
        />
      ) : null}
    </OnboardingPage>
  );
}
