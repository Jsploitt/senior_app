import { router } from 'expo-router';
import { View } from 'react-native';
import { Button } from '../../components';
import { space } from '../../theme/tokens';

/** In-page back control (the settings stack hides native headers to keep large titles). */
export function BackBar({ label = 'Settings' }: { label?: string }) {
  return (
    <View style={{ marginLeft: -space.s, marginBottom: space.xs, alignItems: 'flex-start' }}>
      <Button
        title={label}
        variant="plain"
        size="small"
        icon="chevron-back"
        onPress={() => router.back()}
        accessibilityHint={`Back to ${label}`}
      />
    </View>
  );
}
