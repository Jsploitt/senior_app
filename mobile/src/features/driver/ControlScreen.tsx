/** Control tab: hero, guard chips, control pad, result banner, fault card, auth latency. */
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Button, EmptyState, Text } from '@/components';
import { BarrierState, CmdResult, Opcode } from '@/protocol/constants';
import { useSettings } from '@/store/settings';
import { useTransport, useTransportSnapshot } from '@/store/transport';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { TransportError } from '@/transport/types';
import { impact, notify } from '@/utils/haptics';
import { BarrierHero } from './BarrierHero';
import {
  ConnectionPill,
  ControlPad,
  FaultCard,
  GuardChips,
  LocalOnlyChip,
  ResultBanner,
  SimulatedBadge,
} from './ControlParts';
import {
  connectFailureCopy,
  connectionPill,
  FEED_RESULTS,
  authLine,
  guardBlockWarning,
  resultHaptic,
  resultNotice,
  statusKey,
  type ResultNotice,
} from './logic';

const AUTO_DISMISS_MS = 4000;

function fireHaptic(result: CmdResult) {
  const h = resultHaptic(result);
  if (!h) return;
  if (h.type === 'impact') impact(h.style);
  else notify(h.kind);
}

export default function ControlScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const transport = useTransport();
  const snap = useTransportSnapshot();
  const settings = useSettings();
  const status = snap.status;

  const connected = snap.phase === 'ready' && status !== null;
  const linkLost = snap.phase === 'disconnected' && snap.error?.code === 'LINK_LOST';
  const showDevice = status !== null && (connected || snap.phase === 'disconnected');
  const connecting = snap.phase === 'connecting' || snap.phase === 'pairing' || snap.phase === 'authorizing';
  const deviceName = snap.session?.deviceName ?? settings.lastDeviceName ?? null;
  const latency = snap.session?.authLatencyMs ?? null;
  const [padH, setPadH] = useState(0);

  /* ---------- result notices ---------- */
  const [notice, setNotice] = useState<ResultNotice | null>(null);
  const seq = useRef(0);
  const lastStopAt = useRef(0);
  const inFlight = useRef(false);

  const show = useCallback((n: ResultNotice | null) => {
    setNotice(n);
    if (n) {
      try {
        AccessibilityInfo.announceForAccessibility(n.announce);
      } catch {
        /* not available on this platform */
      }
    }
  }, []);

  useEffect(() => {
    if (!notice || notice.sticky) return;
    const id = setTimeout(() => setNotice((cur) => (cur?.id === notice.id ? null : cur)), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [notice]);

  // Status feed: device-originated results (COMPLETED, STOPPED, guard rejects, FAULT).
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!status) {
      lastKey.current = null;
      return;
    }
    const key = statusKey(status);
    if (lastKey.current === null) {
      lastKey.current = key; // baseline on connect: no banner for history
      return;
    }
    if (key === lastKey.current) return;
    lastKey.current = key;
    if (!FEED_RESULTS.has(status.lastResult)) return;
    fireHaptic(status.lastResult);
    // the hero already shows Raised / Lowered / Stopped: no second confirmation toast for those
    if (status.lastResult === CmdResult.COMPLETED || status.lastResult === CmdResult.STOPPED) return;
    show(
      resultNotice({
        id: ++seq.current,
        result: status.lastResult,
        state: status.state,
        mask: status.guardFailMask,
        zoneClear: status.zoneClear,
        sensorsValid: status.sensorsValid,
        userStopped: Date.now() - lastStopAt.current < 3000,
      }),
    );
  }, [status, show]);

  const onCommand = useCallback(
    async (op: Opcode) => {
      const isStop = op === Opcode.STOP;
      if (!isStop && inFlight.current) return;
      impact('medium');
      if (isStop) lastStopAt.current = Date.now();
      setNotice((cur) => (cur?.sticky ? null : cur));
      if (!isStop) inFlight.current = true;
      try {
        const out = await transport.sendCommand(op);
        if (
          out.result === CmdResult.REJECTED_AUTH ||
          out.result === CmdResult.REJECTED_STALE ||
          out.result === CmdResult.REJECTED_FORMAT
        ) {
          fireHaptic(out.result);
          show(
            resultNotice({
              id: ++seq.current,
              result: out.result,
              state: out.status.state,
              mask: 0,
              zoneClear: out.status.zoneClear,
              sensorsValid: out.status.sensorsValid,
              userStopped: false,
            }),
          );
        }
      } catch (e) {
        notify('error');
        const msg =
          e instanceof TransportError ? connectFailureCopy(e.code).detail : 'The command was not sent.';
        show({
          id: ++seq.current,
          result: CmdResult.NONE,
          tone: 'critical',
          icon: 'alert-circle',
          title: 'Command not sent',
          detail: msg,
          sticky: false,
          announce: `Command not sent. ${msg}`,
        });
      } finally {
        inFlight.current = false;
      }
    },
    [transport, show],
  );

  /* ---------- reconnect / refresh ---------- */
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const reconnect = useCallback(async () => {
    const id = settings.lastDeviceId;
    if (!id) {
      router.push('/connect');
      return;
    }
    setReconnectError(null);
    try {
      await transport.connect(id);
    } catch (e) {
      setReconnectError(connectFailureCopy(e instanceof TransportError ? e.code : 'CONNECT_FAILED').detail);
    }
  }, [settings.lastDeviceId, transport]);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (!connected) return;
    setRefreshing(true);
    try {
      await transport.refreshStatus();
    } catch {
      /* the connection pill shows the failure */
    } finally {
      setRefreshing(false);
    }
  }, [connected, transport]);

  /* ---------- render ---------- */
  const pill = connectionPill(snap.phase, status?.ownerConnected ?? null, linkLost);
  const faulted = status?.state === BarrierState.FAULT;
  const guardWarning = guardBlockWarning(notice, status);
  const openFinder = () => router.push('/connect');

  return (
    <View style={[styles.flex, { backgroundColor: t.c.background }]} testID="control-screen">
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + space.s,
          paddingHorizontal: space.l,
          paddingBottom: showDevice ? padH + space.l : space.xl,
        }}
        refreshControl={
          connected ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.c.secondaryLabel} />
          ) : undefined
        }
      >
        <Text variant="largeTitle" accessibilityRole="header" numberOfLines={1} testID="control-title">
          Barrier
        </Text>
        {deviceName ? (
          <View style={styles.sub}>
            <Text variant="subheadline" color="secondaryLabel" numberOfLines={1} testID="control-device">
              {deviceName}
            </Text>
            {latency !== null && connected ? (
              <Text variant="subheadline" color="tertiaryLabel" accessibilityElementsHidden>
                ·
              </Text>
            ) : null}
            {latency !== null && connected ? (
              <Text variant="footnote" color="secondaryLabel" tabular testID="auth-latency">
                {authLine(latency)}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.chips}>
          <ConnectionPill spec={pill} onPress={connected ? undefined : openFinder} />
          <LocalOnlyChip />
          {snap.kind === 'sim' ? <SimulatedBadge /> : null}
        </View>

        {linkLost ? (
          <Banner
            tone="critical"
            icon="cloud-offline"
            title="Connection lost"
            detail={reconnectError ?? 'The barrier stops automatically if it was moving.'}
            testID="link-lost-banner"
            action={
              <Button
                title="Reconnect"
                icon="refresh"
                variant="filled"
                onPress={reconnect}
                testID="btn-reconnect"
              />
            }
          />
        ) : null}

        {showDevice && status ? (
          <>
            <View style={{ marginTop: space.m }}>
              <BarrierHero
                state={status.state}
                fault={status.fault}
                warning={guardWarning}
                stale={!connected}
                testID="hero"
              />
            </View>
            <View style={{ marginTop: space.m }}>
              <GuardChips
                zoneClear={status.zoneClear}
                sensorsValid={status.sensorsValid}
                batteryMv={status.batteryMv}
                live={connected}
                faulted={faulted}
                onPress={() => router.push('/guard-details')}
              />
            </View>
            {status.state === BarrierState.FAULT ? (
              <FaultCard fault={status.fault} heading="Needs on-site reset" compact />
            ) : null}
          </>
        ) : (
          <View style={styles.empty}>
            <EmptyState
              icon="bluetooth-outline"
              title={connecting ? 'Connecting to your barrier' : 'No barrier connected'}
              detail={
                connecting
                  ? 'Hang on while your phone connects and checks that you are an owner.'
                  : 'Connect your phone to the barrier over Bluetooth. Everything stays between your phone and the barrier.'
              }
            />
            <Button
              title={connecting ? 'View progress' : 'Connect to barrier'}
              icon="bluetooth"
              size="large"
              onPress={openFinder}
              testID="btn-find"
              style={{ alignSelf: 'stretch', marginTop: space.l }}
            />
            {snap.phase === 'error' && snap.error ? (
              <Banner
                tone="critical"
                icon="alert-circle"
                title={connectFailureCopy(snap.error.code).title}
                detail={connectFailureCopy(snap.error.code).detail}
                testID="error-banner"
              />
            ) : null}
          </View>
        )}
      </ScrollView>
      {showDevice ? (
        <ControlPad
          state={status?.state ?? null}
          connected={connected}
          onCommand={onCommand}
          onHeight={setPadH}
          guardBlocked={guardWarning !== undefined}
          banner={
            notice && notice.result !== CmdResult.FAULT ? (
              <ResultBanner
                notice={notice}
                onDismiss={() => setNotice(null)}
                onDetails={() => router.push('/guard-details')}
              />
            ) : null
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s, marginTop: space.s },
  empty: { flex: 1, justifyContent: 'center', paddingBottom: space.huge },
});
