/**
 * STUB from Phase 1 so other workstreams can import a stable interface.
 * Workstream A owns this file and replaces the body (reanimated arm, 60 fps).
 */
import { View } from 'react-native';
import { Text } from '@/components';
import { STATE_TEXT } from '@/protocol/messages';
import type { BarrierState, FaultReason } from '@/protocol/constants';

export interface BarrierHeroProps {
  state: BarrierState | null;
  fault: FaultReason;
  /** compact variant for presenter / small layouts */
  compact?: boolean;
  testID?: string;
}

export function BarrierHero({ state, compact, testID }: BarrierHeroProps) {
  return (
    <View
      testID={testID}
      style={{ height: compact ? 160 : 240, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text variant="title1">{state === null ? 'Not connected' : STATE_TEXT[state].label}</Text>
    </View>
  );
}
