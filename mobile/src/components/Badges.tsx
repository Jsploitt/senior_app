/**
 * Shared header badges. One style everywhere (QA review 1, cross-cutting "component inconsistency").
 */
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Icon } from './Icon';
import { Pill } from './Layout';

/** Constraint 5: the app never touches the network. `compact` = icon only (tight header rows). */
export function LocalOnlyChip({ compact }: { compact?: boolean }) {
  const t = useTheme();
  if (compact) {
    return (
      <View
        accessible
        accessibilityLabel="Local only. No internet."
        testID="local-only-chip"
        style={{
          width: 30,
          height: 30,
          borderRadius: radius.pill,
          backgroundColor: t.c.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="cloud-offline-outline" size={16} color="secondaryLabel" />
      </View>
    );
  }
  return (
    <View accessible accessibilityLabel="Local only. No internet." testID="local-only-chip">
      <Pill label="Local only" icon="cloud-offline-outline" />
    </View>
  );
}

/** Always-visible marker: a recording of the simulator must never pass as hardware evidence. */
export function SimulatedBadge() {
  return (
    <View
      accessible
      accessibilityLabel="Simulated. This is a simulation, not the real barrier."
      testID="simulated-badge"
      style={{ marginLeft: space.xxs }}
    >
      <Pill label="SIMULATED" tone="warning" icon="flask-outline" />
    </View>
  );
}
