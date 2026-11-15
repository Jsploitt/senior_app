import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '../../components/Icon';
import { Card, Pill } from '../../components/Layout';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme/ThemeProvider';
import { hit, radius, space, type Palette } from '../../theme/tokens';
import type { Scenario, StepResult } from './types';

type Tone = 'neutral' | 'positive' | 'warning' | 'critical' | 'tint';

function statusPill(
  result: StepResult | null,
  running: boolean,
): { label: string; tone: Tone; icon: IconName } {
  if (running) return { label: 'Running', tone: 'tint', icon: 'hourglass-outline' };
  if (!result) return { label: 'Ready', tone: 'neutral', icon: 'ellipse-outline' };
  if (result.status === 'pass') return { label: 'As expected', tone: 'positive', icon: 'checkmark-circle' };
  if (result.status === 'error') return { label: 'Error', tone: 'critical', icon: 'alert-circle' };
  return { label: 'Unexpected', tone: 'critical', icon: 'alert-circle' };
}

export interface StepCardProps {
  scenario: Scenario;
  index: number;
  result: StepResult | null;
  running: boolean;
  /** viewing a step that is behind the live frontier */
  reviewing: boolean;
  booting?: boolean;
}

export function StepCard({ scenario, index, result, running, reviewing, booting }: StepCardProps) {
  const step = scenario.steps[index];
  if (!step) return null;
  const pill = statusPill(result, running);
  const next = scenario.steps[index + 1];
  return (
    <Card testID="step-card">
      <View style={styles.head}>
        <Text variant="footnote" color="secondaryLabel" style={styles.upper} accessibilityRole="header">
          Step {index + 1} of {scenario.steps.length}
        </Text>
        <Pill
          label={booting ? 'Connecting' : pill.label}
          tone={booting ? 'neutral' : pill.tone}
          icon={pill.icon}
        />
      </View>
      <Text variant="title2" style={styles.title}>
        {step.title}
      </Text>
      <Text variant="body" color="secondaryLabel" style={styles.narration}>
        {step.narration}
      </Text>
      {reviewing ? (
        <Text variant="footnote" color="warning" style={styles.review}>
          Reviewing an earlier step. The barrier has already moved on; Next steps forward.
        </Text>
      ) : null}
      {result ? <Outcome result={result} /> : null}
      <View style={styles.rows}>
        <Pill label={step.fsmRows.length ? `FSM rows ${step.fsmRows.join(', ')}` : 'Before the FSM table'} />
      </View>
      <Text variant="footnote" color="secondaryLabel" style={styles.next}>
        {next ? `Up next: ${next.title}` : 'Last step'}
      </Text>
    </Card>
  );
}

function Outcome({ result }: { result: StepResult }) {
  const t = useTheme();
  return (
    <View style={[styles.outcome, { borderTopColor: t.c.separator }]}>
      {result.error ? (
        <Text variant="subheadline" color="critical" style={styles.line}>
          {result.error}
        </Text>
      ) : null}
      {result.checks.map((c, i) => (
        <View
          key={`${c.label}-${i}`}
          style={styles.check}
          accessible
          accessibilityLabel={`${c.label}: ${c.ok ? 'as expected' : 'unexpected'}. Expected ${c.expected}, actual ${c.actual}`}
        >
          <Icon
            name={c.ok ? 'checkmark-circle' : 'close-circle'}
            size={22}
            color={c.ok ? 'positive' : 'critical'}
          />
          <View style={styles.flex}>
            <Text variant="callout" weight="600">
              {c.label}
            </Text>
            <Text variant="subheadline" color={c.ok ? 'secondaryLabel' : 'critical'} tabular>
              {c.ok ? c.actual : `expected ${c.expected}, got ${c.actual}`}
            </Text>
          </View>
        </View>
      ))}
      {result.evidence.map((e, i) => (
        <View key={`${e.label}-${i}`} style={styles.evidence}>
          <Text variant="footnote" color="secondaryLabel" style={styles.upper}>
            {e.label}
          </Text>
          <Text variant={e.mono ? 'footnote' : 'subheadline'} mono={e.mono} selectable style={styles.evValue}>
            {e.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Numbered chips: tap a finished step to review it. */
export function StepProgress({
  scenario,
  results,
  view,
  frontier,
  runningIndex,
  onSelect,
}: {
  scenario: Scenario;
  results: (StepResult | null)[];
  view: number;
  frontier: number;
  runningIndex: number | null;
  onSelect(i: number): void;
}) {
  const t = useTheme();
  return (
    <View style={styles.progress} accessibilityRole="tablist" accessibilityLabel="Steps">
      {scenario.steps.map((s, i) => {
        const r = results[i] ?? null;
        const done = i < frontier;
        const bg: keyof Palette = !r ? 'fill' : r.status === 'pass' ? 'positiveWash' : 'criticalWash';
        const fg: keyof Palette = !r ? 'secondaryLabel' : r.status === 'pass' ? 'positive' : 'critical';
        const selected = i === view;
        return (
          <Pressable
            key={i}
            disabled={!done}
            onPress={() => onSelect(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled: !done }}
            accessibilityLabel={`Step ${i + 1}, ${s.title}, ${r ? (r.status === 'pass' ? 'as expected' : 'unexpected') : runningIndex === i ? 'running' : 'not run'}`}
            style={[
              styles.dot,
              {
                backgroundColor: t.c[bg],
                borderColor: selected ? t.c.tint : 'transparent',
              },
            ]}
          >
            <Text variant="footnote" weight="700" color={fg} tabular>
              {i + 1}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.s },
  upper: { textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { marginTop: space.s },
  narration: { marginTop: space.s },
  rows: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.l },
  review: { marginTop: space.m },
  outcome: {
    marginTop: space.m,
    paddingTop: space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space.m,
  },
  line: { marginBottom: space.xs },
  check: { flexDirection: 'row', gap: space.m, alignItems: 'flex-start' },
  flex: { flex: 1 },
  evidence: { gap: 2 },
  evValue: { flexShrink: 1 },
  next: { marginTop: space.s },
  progress: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  dot: {
    minWidth: hit,
    minHeight: hit,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
