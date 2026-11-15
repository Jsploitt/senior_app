import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Icon, Pill, Screen, Text } from '@/components';
import { StackHeader } from '@/components/StackHeader';
import { SCENARIO_GROUPS, SCENARIOS } from '@/features/presenter/scenarios';
import { exitPresenter } from '@/features/presenter/exit';
import { SimulatedBadge } from '@/features/presenter/SimulatedBadge';
import { useTheme } from '@/theme/ThemeProvider';
import { hit, space } from '@/theme/tokens';
import { tap } from '@/utils/haptics';

export default function PresenterIndex() {
  const t = useTheme();
  return (
    <Screen
      testID="presenter-index"
      footer={
        <View style={[styles.footer, { backgroundColor: t.c.background, borderTopColor: t.c.separator }]}>
          <Button
            testID="presenter-exit"
            title="Exit presenter"
            icon="close"
            variant="gray"
            onPress={exitPresenter}
            accessibilityHint="Restores the previous transport and returns to the app"
          />
        </View>
      }
    >
      <View style={styles.column}>
        <StackHeader
          backLabel="Settings"
          title="Presenter"
          subtitle="FPR scenarios on a simulated barrier"
          right={<SimulatedBadge />}
          onBack={exitPresenter}
        />
        {SCENARIO_GROUPS.map((g) => (
          <View key={g.id} style={styles.group}>
            <Text
              variant="footnote"
              color="secondaryLabel"
              style={styles.groupTitle}
              accessibilityRole="header"
            >
              {g.title}
            </Text>
            <Card padded={false}>
              {SCENARIOS.filter((s) => s.group === g.id).map((s, i, arr) => (
                <Pressable
                  key={s.id}
                  testID={`scenario-${s.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.title}. ${s.summary}. ${s.steps.length} steps.`}
                  onPress={() => {
                    tap();
                    router.push(`/presenter/${s.id}` as Href);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: pressed ? t.c.fill : 'transparent' },
                    i < arr.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: t.c.separator,
                    },
                  ]}
                >
                  <View style={styles.flex}>
                    <Text variant="title3">{s.title}</Text>
                    <Text variant="subheadline" color="secondaryLabel" style={styles.summary}>
                      {s.summary}
                    </Text>
                    <View style={styles.pills}>
                      <Pill label={`${s.steps.length} steps`} />
                      {rowsOf(s.steps).length ? (
                        <Pill label={`FSM rows ${rowsOf(s.steps).join(', ')}`} />
                      ) : null}
                    </View>
                  </View>
                  <Icon name="chevron-forward" size={20} color="tertiaryLabel" />
                </Pressable>
              ))}
            </Card>
          </View>
        ))}
        <Text variant="footnote" color="secondaryLabel" style={styles.note}>
          Everything here runs on a simulated barrier through the same app code as the real one. Stop timing
          is measured on the barrier itself (UART log), not by this app.
        </Text>
      </View>
    </Screen>
  );
}

function rowsOf(steps: { fsmRows: number[] }[]): number[] {
  return [...new Set(steps.flatMap((s) => s.fsmRows))].sort((a, b) => a - b);
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  group: { marginTop: space.l },
  groupTitle: { textTransform: 'uppercase', marginLeft: space.l, marginBottom: space.s },
  row: {
    minHeight: hit + 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingVertical: space.m,
    paddingHorizontal: space.l,
  },
  flex: { flex: 1 },
  summary: { marginTop: space.xxs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.s },
  note: { marginTop: space.xl, marginHorizontal: space.l },
  footer: { paddingHorizontal: space.l, paddingVertical: space.m, borderTopWidth: StyleSheet.hairlineWidth },
});
