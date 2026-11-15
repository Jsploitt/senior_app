import { StyleSheet, View } from 'react-native';
import { Icon, Pill, Text, type IconName } from '../../components';
import type { LogEntry, LogKind } from '../../transport/types';
import { useTheme } from '../../theme/ThemeProvider';
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

/** Same semantics as the barrier hero: motion = tint, lowered/done = positive, stopped/rejected = warning, fault = critical. */
export function resultTone(result: string): ChipTone {
  if (result === 'FAULT') return 'critical';
  if (result === 'REJECTED_FORMAT') return 'critical';
  if (result.startsWith('REJECTED_') || result === 'STOPPED') return 'warning';
  if (result === 'ACCEPTED') return 'tint';
  if (result === 'COMPLETED') return 'positive';
  return 'neutral';
}

/** Result-style chips only; counter and latency go to the subtitle (see entryMeta). */
export function entryChips(e: LogEntry): { label: string; tone: ChipTone }[] {
  const chips: { label: string; tone: ChipTone }[] = [];
  const title = humanizeMessage(e.message).toLowerCase();
  // A chip is kept only when it adds information the row title does not already say.
  const adds = (label: string) => !title.includes(label.toLowerCase());
  if (e.result && e.kind !== 'status') {
    const label = resultTitleFromName(e.result);
    if (adds(label)) chips.push({ label, tone: resultTone(e.result) });
  }
  if (e.guardFailMask && adds('Safety check blocked'))
    chips.push({ label: 'Safety check blocked', tone: 'warning' });
  if (e.fault && e.fault !== 'NONE') {
    const label = faultTitleFromName(e.fault);
    if (adds(label)) chips.push({ label, tone: 'critical' });
  }
  return chips;
}

/** Plain-text details in tabular digits: command, counter, latency. */
export function entryMeta(e: LogEntry): string {
  const parts = [clockTime(e.t)];
  if (e.opcode) parts.push(opcodeLabel(e.opcode));
  if (e.counter !== undefined) parts.push(`#${e.counter}`);
  if (e.latencyMs !== undefined) parts.push(`${e.latencyMs} ms`);
  parts.push(e.transport === 'sim' ? 'simulated' : 'Bluetooth');
  return parts.join(' \u00B7 ');
}

export function EventRow({ entry, inset = false }: { entry: LogEntry; inset?: boolean }) {
  const t = useTheme();
  const k = KIND_ICON[entry.kind];
  const tone =
    entry.kind === 'error' || entry.kind === 'disconnect'
      ? 'critical'
      : entry.kind === 'command'
        ? 'tint'
        : 'secondaryLabel';
  const chips = entryChips(entry);
  return (
    <View
      testID={`event-${entry.id}`}
      accessible
      accessibilityLabel={[k.label, entryMeta(entry), entry.message, ...chips.map((c) => c.label)].join(', ')}
      style={{ flexDirection: 'row', gap: space.m, paddingLeft: space.l }}
    >
      <View style={{ width: 22, alignItems: 'center', paddingTop: space.s + 4 }}>
        <Icon name={k.icon} size={18} color={tone} />
      </View>
      <View
        style={[
          { flex: 1, paddingVertical: space.s + 2, paddingRight: space.l },
          inset && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.c.separator },
        ]}
      >
        <Text variant="body">{humanizeMessage(entry.message)}</Text>
        <Text variant="caption1" color="secondaryLabel" tabular style={{ marginTop: space.xxs }}>
          {entryMeta(entry)}
        </Text>
        {chips.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs }}>
            {chips.map((c) => (
              <Pill key={c.label} label={c.label} tone={c.tone} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
