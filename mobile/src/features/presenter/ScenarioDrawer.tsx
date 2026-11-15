import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
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

export type Panel = 'interlocks' | 'latency';
const SPREADS: { value: string; label: string; sigma: number }[] = [
  { value: 'tight', label: 'Tight', sigma: 0.15 },
  { value: 'typical', label: 'Typical', sigma: 0.35 },
  { value: 'wide', label: 'Wide', sigma: 0.7 },
];

export interface ScenarioDrawerProps {
  onNext(): void;
  onPrev(): void;
  onAuto(): void;
  onReset(): void;
  auto: boolean;
  busy: boolean;
  canPrev: boolean;
  /** a next step (or a review step) is available */
  canNext: boolean;
  /** the interlocks / latency sheet is showing */
  panelOpen: boolean;
  onTogglePanel(): void;
}

/** Compact bottom dock, one row: Back / Next step / Auto / Reset / panel toggle. */
export function ScenarioDrawer(p: ScenarioDrawerProps) {
  const t = useTheme();
  return (
    <View
      testID="scenario-drawer"
      style={[styles.drawer, { backgroundColor: t.c.surface, borderTopColor: t.c.separator }]}
    >
      <View style={styles.controls}>
        <IconButton
          testID="btn-prev"
          icon="play-skip-back"
          label="Back"
          hint="Review the previous step"
          disabled={!p.canPrev || p.busy}
          onPress={p.onPrev}
        />
        <Button
          testID="btn-next"
          title="Next step"
          size="small"
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
          size="small"
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
        <IconButton
          testID="drawer-toggle"
          icon="options-outline"
          label={p.panelOpen ? 'Hide interlocks and latency' : 'Show interlocks and latency'}
          selected={p.panelOpen}
          onPress={p.onTogglePanel}
        />
      </View>
    </View>
  );
}

export interface ScenarioSheetProps {
  scenario: Scenario;
  /** dock height: the sheet sits directly above it */
  bottomOffset: number;
  onClose(): void;
  toggles: InterlockToggles;
  onToggle(k: InterlockKey, v: boolean): void;
  samples: number[];
  params: ScenarioParams;
  onParams(p: Partial<ScenarioParams>): void;
}

/** Interlock toggles and the auth-latency meter, shown over the content only when requested. */
export function ScenarioSheet(p: ScenarioSheetProps) {
  const t = useTheme();
  const { height } = useWindowDimensions();
  const isLatency = p.scenario.id === 'auth-latency';
  const [panel, setPanel] = useState<Panel>('interlocks');
  const shown: Panel = isLatency ? 'interlocks' : panel;
  return (
    <View style={styles.overlay} testID="scenario-sheet">
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: t.c.overlay }]}
        onPress={p.onClose}
        accessibilityRole="button"
        accessibilityLabel="Close panel"
      />
      <View
        style={[
          styles.sheet,
          { bottom: p.bottomOffset, backgroundColor: t.c.surface, maxHeight: Math.max(240, height * 0.6) },
        ]}
      >
        {isLatency ? null : (
          <Segmented<Panel>
            accessibilityLabel="Panel"
            value={panel}
            onChange={setPanel}
            options={[
              { value: 'interlocks', label: 'Interlocks' },
              { value: 'latency', label: 'Auth latency' },
            ]}
          />
        )}
        <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator>
          {shown === 'interlocks' ? (
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
            <LatencyPanel samples={p.samples} params={p.params} onParams={p.onParams} editable={false} />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

/** Latency meter, plus the simulated-median controls when the scenario is the latency one. */
export function LatencyPanel({
  samples,
  params,
  onParams,
  editable,
}: {
  samples: number[];
  params: ScenarioParams;
  onParams(p: Partial<ScenarioParams>): void;
  editable: boolean;
}) {
  const spread = SPREADS.find((s) => s.sigma === params.latencySigma)?.value ?? 'typical';
  return (
    <View style={styles.latency}>
      <LatencyMeter samples={samples} specMs={SPEC5_AUTH_MAX_MS} label="Phone-measured, simulated" />
      {editable ? (
        <View style={styles.params}>
          <View style={styles.stepper}>
            <Button
              title="-100 ms"
              accessibilityLabel="Decrease median latency by 100 milliseconds"
              variant="gray"
              size="small"
              style={styles.step}
              onPress={() => onParams({ latencyMedianMs: Math.max(200, params.latencyMedianMs - 100) })}
            />
            <View style={styles.flex}>
              <Text variant="footnote" color="secondaryLabel" align="center">
                Next run median
              </Text>
              <Text variant="title3" align="center" tabular>
                {(params.latencyMedianMs / 1000).toFixed(2)} s
              </Text>
            </View>
            <Button
              title="+100 ms"
              accessibilityLabel="Increase median latency by 100 milliseconds"
              variant="gray"
              size="small"
              style={styles.step}
              onPress={() => onParams({ latencyMedianMs: Math.min(3000, params.latencyMedianMs + 100) })}
            />
          </View>
          <Segmented
            accessibilityLabel="Latency spread"
            value={spread}
            onChange={(v) => onParams({ latencySigma: SPREADS.find((s) => s.value === v)!.sigma })}
            options={SPREADS.map((s) => ({ value: s.value, label: s.label }))}
          />
          <Text variant="footnote" color="secondaryLabel">
            Applies to the next run of &quot;Repeated connects&quot;. Reset to start over.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function IconButton({
  icon,
  label,
  hint,
  onPress,
  disabled,
  selected,
  testID,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress(): void;
  disabled?: boolean;
  selected?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconBtn,
        { backgroundColor: selected ? t.c.tintWash : t.c.fill, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}
    >
      <Icon name={icon} size={22} color={selected ? 'tint' : 'label'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: hit,
    height: hit,
    borderRadius: radius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawer: {
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    padding: space.l,
    gap: space.m,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
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
  panel: { gap: space.m },
  step: { minWidth: 88, minHeight: hit },
  latency: { gap: space.m },
  params: { gap: space.s },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  controls: { flexDirection: 'row', gap: space.s, alignItems: 'center' },
  next: { flex: 1, minWidth: 0 },
});
