import { router } from 'expo-router';
import { Button, EmptyState, Screen } from '@/components';
import { updateSettings } from '@/store/settings';

// Placeholder: workstream D (onboarding + enrollment walkthrough).
export default function Onboarding() {
  return (
    <Screen title="Welcome">
      <EmptyState
        icon="car-outline"
        title="M010 Barrier"
        detail="Workstream D builds onboarding."
        action={
          <Button
            title="Continue"
            onPress={() => {
              updateSettings({ onboarded: true });
              router.replace('/');
            }}
          />
        }
      />
    </Screen>
  );
}
