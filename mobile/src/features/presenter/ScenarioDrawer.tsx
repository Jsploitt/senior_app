import { useState } from 'react';
import { Pressable, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { Button } from '../../components/Button';
import { Icon, type IconName } from '../../components/Icon';
import { Segmented } from '../../components/Layout';
import { Text } from '../../components/Text';
import { SPEC5_AUTH_MAX_MS } from '../../protocol/constants';
import { useTheme } from '../../theme/ThemeProvider';
import { hit, radius, space } from '../../theme/tokens';
import { tap } from '../../utils/haptics';
import { LatencyMeter } from './LatencyMeter';
import type { InterlockKey, InterlockToggles } from './runner';
import type { Scenario, ScenarioParams } from './types';

export type { InterlockToggles };

const TOGGLES: { key: InterlockKey; label: string; hint: string }[] = [
  { key: 'zoneClear', label: 'Zone clear', hint: 'Off simulates an object under the arm' },
  { key: 'sensorsValid', label: 'Sensors valid', hint: 'Off simulates an invalid limit sensor' },
  { key: 'powerHealthy', label: 'Power healthy', hint: 'Off drops the battery to 11.7 V' },
  { key: 'link', label: 'Link', hint: 'Off drops the owner phone connection' },
];

type Panel = 'interlocks' | 'latency';
const SPREADS: { value: string; label: string; sigma: number }[] = [
  { value: 'tight', label: 'Tight', sigma: 0.15 },
  { value: 'typical', label: 'Typical', sigma: 0.35 },
  { value: 'wide', label: 'Wide', sigma: 0.7 },
];

export interface ScenarioDrawerProps {
  scenario: Scenario;
  /** number of steps already run */
  stepIndex: number;
  onNext(): void;
  onPrev(): void;
  onAuto(): void;
  onReset(): void;
  auto: boolean;
  busy: boolean;
  canPrev: boolean;
  /** a next step (or a review step) is available */
  canNext: boolean;
  toggles: InterlockToggles;
  onToggle(k: InterlockKey, v: boolean): void;
  samples: number[];
  params: ScenarioParams;
  onParams(p: Partial<ScenarioParams>): void;
}

/** Bottom controls: Back / Next / Auto-play / Reset, interlock toggles and the auth-latency meter. */
export function ScenarioDrawer(p: ScenarioDrawerProps) {
  const t = useTheme();
  const [panel, setPanel] = useState<Panel>(p.scenario.id === 'auth-latency' ? 'latency' : 'interlocks');
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(height >= 1000 || p.scenario.id === 'auth-latency');
  const spread = SPREADS.find((s) => s.sigma === p.params.latencySigma)?.value ?? 'typical';
  const isLatency = p.scenario.id === 'auth-latency';
  return (
    <View
      testID="scenario-drawer"
      style={[styles.drawer, { backgroundColor: t.c.surface, borderTopColor: t.c.separator }]}
    >
      <View style={styles.head}>
        <View style={styles.flex}>
          <Segmented<Panel>
            accessibilityLabel="Drawer panel"
            value={panel}
            onChange={(v) => {
              setPanel(v);
              setOpen(true);
            }}
            options={[
              { value: 'interlocks', label: 'Interlocks' },
              { value: 'latency', label: 'Auth latency' },
            ]}
          />
        </View>
        <IconButton
          testID="drawer-toggle"
          icon={open ? 'chevron-down' : 'chevron-up'}
          label={open ? 'Hide drawer panel' : 'Show drawer panel'}
          onPress={() => setOpen(!open)}
        />
      </View>

      {!open ? null : panel === 'interlocks' ? (
        <View style={styles.toggles}>
          {TOGGLES.map((tg) => {
            const on = p.toggles[tg.key];
            return (
              <Pressable
                key={tg.key}
                testID={`toggle-${tg.key}`}
                accessibilityRole="switch"
                accessibilityLabel={tg.label}
                accessibilityHint={tg.hint}
                accessibilityState={{ checked: on }}
                onPress={() => p.onToggle(tg.key, !on)}
                style={[styles.toggle, { backgroundColor: t.c.fill }]}
              >
                <Text variant="callout" weight="600" style={styles.flex} numberOfLines={2}>
                  {tg.label}
                </Text>
                <Switch
                  value={on}
                  onValueChange={(v) => p.onToggle(tg.key, v)}
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  trackColor={{ false: t.c.separator, true: t.c.positiveFill }}
                  thumbColor={t.c.onTint}
                />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.latency}>
          <LatencyMeter samples={p.samples} specMs={SPEC5_AUTH_MAX_MS} label="Phone-measured, simulated" />
          {isLatency ? (
            <View style={styles.params}>
              <View style={styles.stepper}>
                <Button
                  title="-100 ms"
                  accessibilityLabel="Decrease median latency by 100 milliseconds"
                  variant="gray"
                  size="small"
                  onPress={() =>
                    p.onParams({ latencyMedianMs: Math.max(200, p.params.latencyMedianMs - 100) })
                  }
                />
                <View style={styles.flex}>
                  <Text variant="caption1" color="secondaryLabel" align="center">
                    Median per connect
                  </Text>
                  <Text variant="title3" align="center" tabular>
                    {(p.params.latencyMedianMs / 1000).toFixed(2)} s
                  </Text>
                </View>
                <Button
                  title="+100 ms"
                  accessibilityLabel="Increase median latency by 100 milliseconds"
                  variant="gray"
                  size="small"
                  onPress={() =>
                    p.onParams({ latencyMedianMs: Math.min(3000, p.params.latencyMedianMs + 100) })
                  }
                />
              </View>
              <Segmented
                accessibilityLabel="Latency spread"
                value={spread}
                onChange={(v) => p.onParams({ latencySigma: SPREADS.find((s) => s.value === v)!.sigma })}
                options={SPREADS.map((s) => ({ value: s.value, label: s.label }))}
              />
              <Text variant="footnote" color="secondaryLabel">
                Applies to the next run of &quot;Repeated connects&quot;. Reset to start over.
              </Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.controls}>
        <IconButton
          testID="btn-prev"
          icon="chevron-back"
          label="Previous step"
          hint="Review the previous step"
          disabled={!p.canPrev || p.busy}
          onPress={p.onPrev}
        />
        <Button
          testID="btn-next"
          title="Next step"
          icon="play-skip-forward"
          style={styles.next}
          disabled={!p.canNext || p.auto}
          loading={p.busy && !p.auto}
          onPress={p.onNext}
          accessibilityHint="Runs the next step of the scenario"
        />
        <Button
          testID="btn-auto"
          title={p.auto ? 'Pause' : 'Auto'}
          icon={p.auto ? 'pause' : 'play'}
          variant="tinted"
          disabled={!p.auto && (!p.canNext || p.busy)}
          onPress={p.onAuto}
          accessibilityLabel={p.auto ? 'Pause auto-play' : 'Auto-play'}
          accessibilityHint="Runs the remaining steps and stops at the first unexpected result"
        />
        <IconButton
          testID="btn-reset"
          icon="refresh"
          label="Reset scenario"
          hint="Starts the scenario over with a fresh simulated barrier"
          onPress={p.onReset}
        />
      </View>
    </View>
  );
}

function IconButton({
  icon,
  label,
  hint,
  onPress,
  disabled,
  testID,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress(): void;
  disabled?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconBtn,
        { backgroundColor: t.c.fill, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}
    >
      <Icon name={icon} size={22} color="label" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  iconBtn: { width: 50, height: 50, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
  drawer: {
    paddingHorizontal: space.l,
    paddingTop: space.m,
    paddingBottom: space.m,
    gap: space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  toggle: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: hit + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingLeft: space.m,
    paddingRight: space.s,
    borderRadius: radius.m,
  },
  latency: { gap: space.m },
  params: { gap: space.s },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, alignItems: 'center' },
  next: { flexGrow: 1, flexBasis: 120 },
});
