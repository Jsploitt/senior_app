/** Control tab: hero, guard chips, control pad, result banner, fault card, auth latency. */
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
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
  AuthLatencyBadge,
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
  const { fontScale, height } = useWindowDimensions();
  const transport = useTransport();
  const snap = useTransportSnapshot();
  const settings = useSettings();
  const status = snap.status;

  const connected = snap.phase === 'ready' && status !== null;
  const linkLost = snap.phase === 'disconnected' && snap.error?.code === 'LINK_LOST';
  const showDevice = status !== null && (connected || snap.phase === 'disconnected');
  const connecting = snap.phase === 'connecting' || snap.phase === 'pairing' || snap.phase === 'authorizing';
  const title = snap.session?.deviceName ?? settings.lastDeviceName ?? 'Barrier';

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
  const compact = fontScale >= 1.3 || height < 700;
  const openFinder = () => router.push('/connect');

  return (
    <View style={[styles.flex, { backgroundColor: t.c.background }]} testID="control-screen">
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          paddingTop: insets.top + space.s,
          paddingHorizontal: space.l,
          paddingBottom: space.xl,
        }}
        refreshControl={
          connected ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.c.secondaryLabel} />
          ) : undefined
        }
      >
        <View style={styles.header}>
          <Text
            variant="largeTitle"
            accessibilityRole="header"
            style={{ flex: 1 }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            testID="control-title"
          >
            {title}
          </Text>
        </View>
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
            detail={
              reconnectError ??
              'The barrier stops automatically if it was moving. Reconnect to keep controlling it.'
            }
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
            <View style={{ marginTop: space.l }}>
              <BarrierHero
                state={status.state}
                fault={status.fault}
                compact={compact}
                stale={!connected}
                testID="hero"
              />
            </View>
            <View style={{ marginTop: space.l }}>
              <GuardChips
                zoneClear={status.zoneClear}
                sensorsValid={status.sensorsValid}
                batteryMv={status.batteryMv}
                onPress={() => router.push('/guard-details')}
              />
            </View>
            {status.state === BarrierState.FAULT ? (
              <FaultCard fault={status.fault} heading="Needs on-site reset" />
            ) : null}
            {notice && !(notice.result === CmdResult.FAULT) ? (
              <ResultBanner notice={notice} onDismiss={() => setNotice(null)} />
            ) : null}
            <AuthLatencyBadge ms={snap.session?.authLatencyMs ?? null} source={snap.kind} />
            <Text variant="caption1" color="secondaryLabel" style={{ marginTop: space.l }} testID="footnote">
              An accepted command starts a monitored movement; the barrier confirms arrival with its end-limit
              switch.
            </Text>
          </>
        ) : (
          <>
            <EmptyState
              icon="bluetooth-outline"
              title={connecting ? 'Connecting to your barrier' : 'Find your barrier'}
              detail={
                connecting
                  ? 'Hang on while your phone connects and checks that you are an owner.'
                  : 'Connect your phone to the barrier over Bluetooth. Everything stays between your phone and the barrier.'
              }
              action={
                <Button
                  title={connecting ? 'View progress' : 'Find barrier'}
                  icon="search"
                  size="large"
                  onPress={openFinder}
                  testID="btn-find"
                />
              }
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
          </>
        )}
      </ScrollView>
      {showDevice ? (
        <ControlPad state={status?.state ?? null} connected={connected} onCommand={onCommand} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.s },
});
