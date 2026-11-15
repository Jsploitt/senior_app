import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, EmptyState, Icon, Pill, Row, Screen, Section, Text } from '../../components';
import {
  BarrierState,
  CmdResult,
  FaultReason,
  SPEC5_AUTH_MAX_MS,
  STATUS_HEARTBEAT_MS,
} from '../../protocol/constants';
import type { BarrierTransport } from '../../transport/types';
import { useEventLog } from '../../store/eventLog';
import { useTransport, useTransportSnapshot } from '../../store/transport';
import { space } from '../../theme/tokens';
import { BatteryGauge } from './BatteryGauge';
import { LocalOnlyChip } from './LocalOnlyChip';
import {
  ageLabel,
  batteryBand,
  faultLabel,
  percent,
  resultLabel,
  seconds,
  stateLabel,
  volts,
} from './format';
import { authStats, commandTallies, sinceSession } from './stats';

function YesNo({ ok }: { ok: boolean }) {
  return (
    <Icon name={ok ? 'checkmark-circle' : 'close-circle'} size={20} color={ok ? 'positive' : 'critical'} />
  );
}

/** Age of the newest Status notification, re-rendered twice a second. */
function useNotificationAge(transport: BarrierTransport): number | null {
  const [at, setAt] = useState<number | null>(() => (transport.getSnapshot().status ? Date.now() : null));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let last = transport.getSnapshot().status;
    return transport.subscribe(() => {
      const s = transport.getSnapshot().status;
      if (s === last) return;
      last = s;
      const n = Date.now();
      setAt(s ? n : null);
      setNow(n);
    });
  }, [transport]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return at === null ? null : Math.max(0, now - at);
}

export function HealthScreen({ onConnect }: { onConnect: () => void }) {
  const transport = useTransport();
  const snap = useTransportSnapshot();
  const { entries } = useEventLog();
  const status = snap.phase === 'ready' ? snap.status : null;
  const session = snap.phase === 'ready' ? snap.session : null;
  const [refreshing, setRefreshing] = useState(false);
  const age = useNotificationAge(transport);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await transport.refreshStatus();
    } catch {
      /* the error is logged by the transport */
    } finally {
      setRefreshing(false);
    }
  }, [transport]);

  const sessionEntries = useMemo(
    () => sinceSession(entries, session?.connectedAt ?? null),
    [entries, session],
  );
  const tallies = useMemo(() => commandTallies(sessionEntries), [sessionEntries]);
  const allAuth = useMemo(() => authStats(entries), [entries]);

  const authMs = session?.authLatencyMs ?? null;
  const band = status ? batteryBand(status.batteryMv) : null;
  const rejectedReasons = Object.entries(tallies.byResult).filter(([k]) => k.startsWith('REJECTED_'));

  return (
    <Screen
      title="Health"
      right={<LocalOnlyChip />}
      onRefresh={status ? refresh : undefined}
      refreshing={refreshing}
      testID="health-screen"
    >
      {status ? (
        <>
          <Section title="Barrier">
            <Row title="State" value={stateLabel(status.state)} />
            <Row title="Last result" value={resultLabel(status.lastResult)} />
            {status.lastResult === CmdResult.REJECTED_GUARD ? (
              <Row
                title="Guard mask"
                value={`0x${status.guardFailMask.toString(16).padStart(2, '0')}`}
                subtitle="Only meaningful while the last result is a guard rejection."
              />
            ) : null}
            <Row
              title="Fault"
              value={faultLabel(status.fault)}
              right={
                status.fault !== FaultReason.NONE || status.state === BarrierState.FAULT ? (
                  <Icon name="warning" size={20} color="critical" />
                ) : undefined
              }
            />
            <Row title="Last counter" value={String(status.lastCounter)} last />
          </Section>

          <Section
            title="Safety interlocks"
            footer="Read-only. The barrier decides; the phone only shows what it reports."
          >
            <Row
              title="Zone clear"
              value={status.zoneClear ? 'Clear' : 'Blocked'}
              right={<YesNo ok={status.zoneClear} />}
            />
            <Row
              title="Sensors valid"
              value={status.sensorsValid ? 'Valid' : 'Invalid'}
              right={<YesNo ok={status.sensorsValid} />}
            />
            <Row
              title="Movement guard"
              subtitle="MotionAllowed = OwnerAuthorized AND FreshCommand AND ValidPosition AND SensorsValid AND ZoneClear AND PowerHealthy AND NOT FaultLatched"
              last
            />
          </Section>

          <Section title="Power" footer="LiFePO4 4S, thresholds TBD-EE">
            <View style={{ padding: space.l }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text variant="display" tabular testID="battery-volts">
                  {volts(status.batteryMv)}
                </Text>
                {band ? (
                  <Pill
                    label={
                      band === 'healthy'
                        ? 'Healthy'
                        : band === 'low'
                          ? 'Low'
                          : band === 'critical'
                            ? 'Critical'
                            : 'Implausible'
                    }
                    tone={band === 'healthy' ? 'positive' : band === 'low' ? 'warning' : 'critical'}
                    icon={band === 'healthy' ? 'checkmark-circle' : 'warning'}
                  />
                ) : null}
              </View>
              <Text variant="footnote" color="secondaryLabel" tabular style={{ marginBottom: space.m }}>
                {status.batteryMv} mV
              </Text>
              <BatteryGauge mv={status.batteryMv} />
            </View>
          </Section>

          <Section title="Link">
            <Row
              title="Owner connected"
              value={status.ownerConnected ? 'Yes' : 'No'}
              right={<YesNo ok={status.ownerConnected} />}
            />
            <Row title="Transport" value={snap.kind === 'sim' ? 'Simulated' : 'Bluetooth LE'} />
            <Row
              title="Last notification"
              value={age === null ? 'n/a' : `${ageLabel(age)} ago`}
              subtitle={`The barrier sends a heartbeat every ${STATUS_HEARTBEAT_MS / 1000} s.`}
              last
            />
          </Section>

          <Section
            title="This session"
            footer="Counted from this phone's event log since this connection. Phone-observed."
          >
            <Row
              title="Auth latency"
              value={authMs === null ? 'n/a' : seconds(authMs)}
              subtitle={`Phone-measured. Spec 5 reference is ${seconds(SPEC5_AUTH_MAX_MS)}.`}
            />
            <Row title="Commands sent" value={String(tallies.sent)} testID="session-sent" />
            <Row title="Accepted" value={String(tallies.accepted)} testID="session-accepted" />
            <Row
              title="Rejected"
              value={String(tallies.rejected)}
              testID="session-rejected"
              last={rejectedReasons.length === 0}
            />
            {rejectedReasons.map(([reason, n], i) => (
              <Row key={reason} title={reason} value={String(n)} last={i === rejectedReasons.length - 1} />
            ))}
          </Section>
        </>
      ) : (
        <View style={{ marginTop: space.l }}>
          <EmptyState
            icon="pulse-outline"
            title="Not connected"
            detail="Connect to your barrier to see its live health. Nothing here is read without a connection."
            action={
              <Button
                title="Connect to barrier"
                icon="bluetooth"
                onPress={onConnect}
                testID="health-connect"
              />
            }
          />
        </View>
      )}

      <Section
        title="Requirements"
        footer="Nothing here is a verdict. Verification status is defined by the bench procedures, not by this app."
      >
        <Row
          title="C4 Control loop 150 ms"
          subtitle="Measured on the board from UART logs, not by the phone."
          value="Board"
        />
        <Row title="C5 Local only" subtitle="This app makes no network requests." value="By design" />
        <Row
          title="S5 Auth within 2 s"
          subtitle={
            allAuth.count
              ? `Phone proxy: ${allAuth.count} auth events, ${percent(allAuth.withinSpec ?? 0)} at or under 2.0 s.`
              : 'Phone proxy: no auth events recorded yet.'
          }
          value="Phone proxy"
        />
        <Row
          title="S6 Accuracy 90% or more"
          subtitle="Scored on the bench with tools/log_parser.py s6 from labelled trials."
          value="Bench"
          last
        />
      </Section>

      <Text
        variant="footnote"
        color="secondaryLabel"
        style={{ marginHorizontal: space.l, marginTop: space.l }}
      >
        Owner list and revoke are not available over Bluetooth. The barrier exposes none; removing an owner
        phone is done on-site only.
      </Text>
    </Screen>
  );
}
