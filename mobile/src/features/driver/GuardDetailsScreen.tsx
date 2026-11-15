/** Guard details sheet: every movement-guard bit with its live evaluation, plus the fault explanation. */
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, EmptyState, Icon, Text } from '@/components';
import { BATTERY_HEALTHY_MIN_MV, BarrierState, CmdResult, FaultReason, GuardBit } from '@/protocol/constants';
import type { BarrierStatus } from '@/protocol/codec';
import { GUARD_TEXT, formatBattery } from '@/protocol/messages';
import { useTransportSnapshot } from '@/store/transport';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { FaultCard } from './ControlParts';
import { controlEnablement, GUARD_PRIORITY } from './logic';

interface Check {
  bit: GuardBit;
  name: string;
  /** row title when the check fails (states the failure, never the passing name) */
  failName: string;
  ok: boolean;
  value: string;
}

/** Live evaluation of each guard bit from the latest Status (the firmware has the final say). */
export function evaluateChecks(s: BarrierStatus): Check[] {
  const en = controlEnablement(s.state, true);
  const posOk = en.raise.enabled || en.lower.enabled;
  const byBit: Record<GuardBit, Omit<Check, 'bit'>> = {
    [GuardBit.FAULT_LATCHED]: {
      name: 'No fault latched',
      failName: 'Fault latched',
      ok: s.state !== BarrierState.FAULT,
      value: s.state === BarrierState.FAULT ? 'Fault latched' : 'No fault',
    },
    [GuardBit.ZONE_NOT_CLEAR]: {
      name: 'Zone clear',
      failName: 'Zone blocked',
      ok: s.zoneClear,
      value: s.zoneClear ? 'Clear' : 'Something is in the way',
    },
    [GuardBit.SENSORS_INVALID]: {
      name: 'Sensors valid',
      failName: 'Sensors invalid',
      ok: s.sensorsValid,
      value: s.sensorsValid ? 'Valid' : 'Not valid',
    },
    [GuardBit.POWER_UNHEALTHY]: {
      name: 'Battery healthy',
      failName: 'Battery low',
      ok: s.batteryMv >= BATTERY_HEALTHY_MIN_MV,
      value: `${formatBattery(s.batteryMv)} (needs ${formatBattery(BATTERY_HEALTHY_MIN_MV)})`,
    },
    [GuardBit.INVALID_POSITION]: {
      name: 'Position allows the move',
      failName: 'Position blocks the move',
      ok: posOk,
      value: posOk
        ? [en.raise.enabled ? 'Raise' : null, en.lower.enabled ? 'Lower' : null]
            .filter(Boolean)
            .join(' and ') + ' allowed'
        : 'No move from here',
    },
    [GuardBit.NOT_AUTHORIZED]: {
      name: 'Owner phone connected',
      failName: 'Not an owner',
      ok: s.ownerConnected,
      value: s.ownerConnected ? 'Owner' : 'Not an owner',
    },
    [GuardBit.STALE_COMMAND]: {
      name: 'Command fresh',
      failName: 'Command stale',
      ok: true,
      value: 'Checked on every command',
    },
  };
  return GUARD_PRIORITY.map((bit) => ({ bit, ...byBit[bit] }));
}

export default function GuardDetailsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { status } = useTransportSnapshot();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const blockedBits = status && status.lastResult === CmdResult.REJECTED_GUARD ? status.guardFailMask : 0;

  return (
    <View style={[styles.flex, { backgroundColor: t.c.background }]} testID="guard-details">
      <ScrollView
        contentContainerStyle={{
          paddingTop: space.m,
          paddingHorizontal: space.l,
          paddingBottom: insets.bottom + space.xxxl,
        }}
      >
        <View style={styles.header}>
          <Text variant="title2" accessibilityRole="header" style={{ flex: 1 }}>
            Safety checks
          </Text>
          <Button title="Done" variant="plain" size="small" onPress={close} testID="btn-done" />
        </View>
        {!status ? (
          <EmptyState
            icon="shield-outline"
            title="No live data"
            detail="Connect to the barrier to see its safety checks."
          />
        ) : (
          <>
            <Text variant="subheadline" color="secondaryLabel">
              The barrier only moves when every check below passes. It makes the final decision; this list
              shows what it last reported.
            </Text>
            {status.state === BarrierState.FAULT || status.fault !== FaultReason.NONE ? (
              <FaultCard fault={status.fault} />
            ) : null}
            <Card padded={false} style={{ marginTop: space.l }}>
              {evaluateChecks(status).map((c, i, arr) => {
                const blockedLast = (blockedBits & c.bit) !== 0;
                const text = GUARD_TEXT[c.bit];
                return (
                  <View
                    key={c.bit}
                    testID={`check-${c.bit}`}
                    accessible
                    accessibilityLabel={[
                      c.ok ? c.name : c.failName,
                      c.ok ? 'passing' : 'blocking',
                      c.value,
                      blockedLast ? 'Blocked your last command' : null,
                      c.ok ? null : `${text.detail} ${text.action ?? ''}`,
                    ]
                      .filter(Boolean)
                      .join('. ')}
                    style={styles.check}
                  >
                    <Icon
                      name={c.ok ? 'checkmark-circle' : 'alert-circle'}
                      size={24}
                      color={c.ok ? 'positive' : 'warning'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text variant="body" weight="600">
                        {c.ok ? c.name : c.failName}
                      </Text>
                      <Text variant="subheadline" color="secondaryLabel" tabular>
                        {c.value}
                      </Text>
                      {!c.ok ? (
                        <Text variant="footnote" style={{ marginTop: space.xs }}>
                          {text.detail} {text.action}
                        </Text>
                      ) : null}
                      {blockedLast ? (
                        <Text variant="footnote" color="warning" weight="600" style={{ marginTop: space.xs }}>
                          Blocked your last command
                        </Text>
                      ) : null}
                    </View>
                    {i < arr.length - 1 ? (
                      <View
                        style={[styles.sep, { backgroundColor: t.c.separator }]}
                        importantForAccessibility="no"
                      />
                    ) : null}
                  </View>
                );
              })}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.m, gap: space.m },
  check: { flexDirection: 'row', gap: space.m, padding: space.l },
  // inset hairline starting at the text column (padding 16 + icon 24 + gap 12)
  sep: { position: 'absolute', left: 52, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
