import { StyleSheet, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';

/** Always-visible marker: a recording of presenter mode must never pass as hardware evidence. */
export function SimulatedBadge() {
  const t = useTheme();
  return (
    <View
      testID="simulated-badge"
      accessible
      accessibilityRole="text"
      accessibilityLabel="Simulated. This is a simulation, not the real barrier."
      style={[styles.badge, { backgroundColor: t.c.warningWash }]}
    >
      <Icon name="flask-outline" size={16} color="warning" />
      <Text variant="footnote" weight="700" color="warning" style={styles.text}>
        SIMULATED
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.m,
    minHeight: 32,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: { letterSpacing: 0.8 },
});
