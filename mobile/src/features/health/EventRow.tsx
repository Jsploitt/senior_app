import { View } from 'react-native';
import { Icon, Pill, Text, type IconName } from '../../components';
import type { LogEntry, LogKind } from '../../transport/types';
import { space } from '../../theme/tokens';
import { clockTime, faultTitleFromName, humanizeMessage, opcodeLabel, resultTitleFromName } from './format';

const KIND_ICON: Record<LogKind, { icon: IconName; label: string }> = {
  connect: { icon: 'link', label: 'Connection' },
  auth: { icon: 'shield-checkmark', label: 'Authorization' },
  command: { icon: 'swap-vertical', label: 'Command' },
  status: { icon: 'pulse', label: 'Status' },
  disconnect: { icon: 'unlink', label: 'Disconnect' },
  error: { icon: 'warning', label: 'Error' },
  scenario: { icon: 'film-outline', label: 'Scenario' },
};

type ChipTone = 'neutral' | 'positive' | 'warning' | 'critical' | 'tint';

function resultTone(result: string): ChipTone {
  if (result === 'FAULT') return 'critical';
  if (result.startsWith('REJECTED_')) return 'warning';
  if (result === 'ACCEPTED' || result === 'COMPLETED') return 'positive';
  return 'neutral';
}

export function entryChips(e: LogEntry): { label: string; tone: ChipTone }[] {
  const chips: { label: string; tone: ChipTone }[] = [];
  if (e.opcode) chips.push({ label: opcodeLabel(e.opcode), tone: 'tint' });
  if (e.counter !== undefined) chips.push({ label: `#${e.counter}`, tone: 'neutral' });
  if (e.result) chips.push({ label: resultTitleFromName(e.result), tone: resultTone(e.result) });
  if (e.guardFailMask) chips.push({ label: 'Safety check blocked', tone: 'warning' });
  if (e.latencyMs !== undefined) chips.push({ label: `${e.latencyMs} ms`, tone: 'neutral' });
  if (e.fault && e.fault !== 'NONE') chips.push({ label: faultTitleFromName(e.fault), tone: 'critical' });
  return chips;
}

export function EventRow({ entry }: { entry: LogEntry }) {
  const k = KIND_ICON[entry.kind];
  const tone = entry.kind === 'error' || entry.kind === 'disconnect' ? 'critical' : 'tint';
  const chips = entryChips(entry);
  return (
    <View
      testID={`event-${entry.id}`}
      accessible
      accessibilityLabel={[k.label, clockTime(entry.t), entry.message, ...chips.map((c) => c.label)].join(
        ', ',
      )}
      style={{ flexDirection: 'row', gap: space.m, paddingVertical: space.m, paddingHorizontal: space.l }}
    >
      <View style={{ width: 22, alignItems: 'center', paddingTop: 1 }}>
        <Icon name={k.icon} size={18} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="body">{humanizeMessage(entry.message)}</Text>
        <Text variant="caption1" color="secondaryLabel" tabular style={{ marginTop: space.xxs }}>
          {clockTime(entry.t)} {entry.transport === 'sim' ? 'simulated' : 'Bluetooth'}
        </Text>
        {chips.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.s }}>
            {chips.map((c) => (
              <Pill key={c.label} label={c.label} tone={c.tone} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
