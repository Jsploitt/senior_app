import { Pill } from '../../components';

/** Constraint 5: the app never touches the network. */
export function LocalOnlyChip() {
  return <Pill label="Local only" tone="tint" icon="cloud-offline-outline" />;
}
