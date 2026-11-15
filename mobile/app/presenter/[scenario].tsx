import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, EmptyState, Text } from '@/components';
import { StackHeader } from '@/components/StackHeader';
import { exitPresenter } from '@/features/presenter/exit';
import { useDeviceTick, useHandleSnapshot, useRunnerSnapshot } from '@/features/presenter/hooks';
import { LiveHero, LiveReadout } from '@/features/presenter/LiveReadout';
import { ScenarioRunner } from '@/features/presenter/runner';
import { LatencyPanel, ScenarioDrawer, ScenarioSheet } from '@/features/presenter/ScenarioDrawer';
import { findScenario } from '@/features/presenter/scenarios';
import { SimulatedBadge } from '@/features/presenter/SimulatedBadge';
import { StepCard, StepProgress } from '@/features/presenter/StepCard';
import type { Scenario } from '@/features/presenter/types';
import { appendLog } from '@/store/eventLog';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function ScenarioScreen() {
  const { scenario: id } = useLocalSearchParams<{ scenario: string }>();
  const sc = findScenario(id);
  if (!sc) {
    return (
      <View style={styles.missing}>
        <EmptyState
          icon="help-circle-outline"
          title="Unknown scenario"
          detail="This scenario id does not exist."
          action={<Button title="Back to scenarios" onPress={() => router.back()} />}
        />
      </View>
    );
  }
  return <RunnerScreen key={sc.id} scenario={sc} />;
}

function RunnerScreen({ scenario }: { scenario: Scenario }) {
  const [runner] = useState(() => new ScenarioRunner(scenario, { log: appendLog }));
  useEffect(() => {
    void runner.start();
    return () => runner.dispose();
  }, [runner]);
  return <RunnerView runner={runner} />;
}

function RunnerView({ runner }: { runner: ScenarioRunner }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= 900;
  const snap = useRunnerSnapshot(runner);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dockH, setDockH] = useState(96);
  const phone = useHandleSnapshot(snap.handle);
  useDeviceTick(snap.handle?.device ?? null);
  const sc = runner.scenario;
  const total = sc.steps.length;
  const done = snap.frontier >= total;
  const lastRun = snap.frontier - 1;
  const reviewing = snap.view < lastRun;
  const canNext = reviewing || !done;
  const passed = snap.results.filter((r) => r?.status === 'pass').length;
  const bad = snap.results.filter((r) => r && r.status !== 'pass').length;
  const hero = <LiveHero snap={phone} />;
  const isLatency = sc.id === 'auth-latency';
  const readout = (
    <View>
      <LiveReadout snap={phone} device={snap.handle?.device ?? null} />
      {snap.bootError ? (
        <Text variant="callout" color="critical" style={styles.summary}>
          Could not connect the simulated owner phone: {snap.bootError}
        </Text>
      ) : null}
    </View>
  );
  const stepArea = (
    <View style={styles.stack}>
      <StepProgress
        scenario={sc}
        results={snap.results}
        view={snap.view}
        frontier={snap.frontier}
        runningIndex={snap.runningIndex}
        onSelect={(i) => runner.goTo(i)}
      />
      <StepCard
        scenario={sc}
        index={snap.view}
        result={snap.results[snap.view] ?? null}
        running={snap.runningIndex === snap.view}
        reviewing={reviewing}
        booting={snap.booting}
      />
      {isLatency ? (
        <Card>
          <Text variant="headline" accessibilityRole="header" style={styles.cardTitle}>
            Auth latency
          </Text>
          <LatencyPanel
            samples={snap.samples}
            params={snap.params}
            onParams={(p) => runner.setParams(p)}
            editable
          />
        </Card>
      ) : null}
    </View>
  );
  return (
    <View style={[styles.flex, { backgroundColor: t.c.background }]} testID="presenter-runner">
      <Stack.Screen options={{ title: sc.title }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.s, paddingBottom: dockH + space.l },
        ]}
        contentInsetAdjustmentBehavior="never"
      >
        <View style={styles.column}>
          <StackHeader
            backLabel="Scenarios"
            title={sc.title}
            subtitle={sc.summary}
            right={<SimulatedBadge />}
            onBack={() => (router.canGoBack() ? router.back() : exitPresenter())}
          />
          {wide ? (
            <View style={styles.cols}>
              <View style={styles.col}>
                {hero}
                {readout}
              </View>
              <View style={styles.col}>{stepArea}</View>
            </View>
          ) : (
            <View style={styles.stack}>
              {/* Step card leads; the latency scenario keeps the hero first so its meter sits mid-scroll. */}
              {isLatency ? hero : null}
              {stepArea}
              {isLatency ? null : hero}
              {readout}
            </View>
          )}
          {done ? (
            <Text
              testID="run-summary"
              variant="callout"
              weight="600"
              color={bad === 0 ? 'positive' : 'critical'}
              style={styles.summary}
              accessibilityLiveRegion="polite"
            >
              {bad === 0
                ? `Scenario complete: ${passed} of ${total} steps behaved as expected.`
                : `Scenario complete: ${bad} step${bad === 1 ? '' : 's'} did not behave as expected.`}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      {panelOpen ? (
        <ScenarioSheet
          scenario={sc}
          bottomOffset={dockH}
          onClose={() => setPanelOpen(false)}
          toggles={runner.readInterlocks()}
          onToggle={(k, v) => void runner.setInterlock(k, v)}
          samples={snap.samples}
          params={snap.params}
          onParams={(p) => runner.setParams(p)}
        />
      ) : null}
      <View
        style={[styles.dock, { paddingBottom: insets.bottom, backgroundColor: t.c.surface }]}
        onLayout={(e) => setDockH(Math.round(e.nativeEvent.layout.height))}
      >
        <View style={styles.column}>
          <ScenarioDrawer
            onNext={() => void runner.next()}
            onPrev={() => runner.prev()}
            onAuto={() => (snap.auto ? runner.stopAuto() : void runner.autoPlay())}
            onReset={() => void runner.reset()}
            auto={snap.auto}
            busy={snap.busy || snap.booting}
            canPrev={snap.view > 0}
            canNext={canNext}
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((o) => !o)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  missing: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: space.l, gap: space.xs },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  column: { width: '100%', maxWidth: 1200, alignSelf: 'center' },
  cols: { flexDirection: 'row', gap: space.xl, alignItems: 'flex-start' },
  col: { flex: 1 },
  summary: { marginTop: space.xs, marginBottom: space.s },
  stack: { gap: space.m },
  cardTitle: { marginBottom: space.m },
});
