/** Connect modal: scan, device list, progress steps, pairing guidance, failure copy. */
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Button, Card, EmptyState, Text } from '@/components';
import { updateSettings, useSettings } from '@/store/settings';
import { useTransport, useTransportSnapshot } from '@/store/transport';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { TransportError, type DiscoveredDevice, type TransportErrorCode } from '@/transport/types';
import { notify } from '@/utils/haptics';
import { AuthLatencyBadge } from './ControlParts';
import { DeviceRow, ListHeader, PairingCard, StepList } from './ConnectParts';
import { connectFailureCopy, connectSteps, stepIndexOf } from './logic';

const SUCCESS_HOLD_MS = 1400;

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function ConnectScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const transport = useTransport();
  const snap = useTransportSnapshot();
  const settings = useSettings();

  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [scanning, setScanning] = useState(snap.phase !== 'ready');
  const [scanError, setScanError] = useState<TransportErrorCode | null>(null);
  const [selected, setSelected] = useState<DiscoveredDevice | null>(null);
  const [failure, setFailure] = useState<TransportErrorCode | null>(null);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const reached = useRef(-1);
  const alive = useRef(true);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [already, setAlready] = useState(snap.phase === 'ready');

  useEffect(() => {
    const i = stepIndexOf(snap.phase);
    if (i > reached.current) reached.current = i;
  }, [snap.phase]);

  /** Scan and publish the result (setState only inside promise callbacks). */
  const runScan = useCallback(() => {
    transport.scan().then(
      (found) => {
        if (!alive.current) return;
        setDevices(found);
        setScanning(false);
      },
      (e: unknown) => {
        if (!alive.current) return;
        setScanError(e instanceof TransportError ? e.code : 'CONNECT_FAILED');
        setScanning(false);
      },
    );
  }, [transport]);

  const startScan = useCallback(() => {
    setScanning(true);
    setScanError(null);
    setDevices([]);
    runScan();
  }, [runScan]);

  useEffect(() => {
    alive.current = true;
    if (!already) runScan();
    return () => {
      alive.current = false;
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      if (!already) transport.stopScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const connect = useCallback(
    async (d: DiscoveredDevice) => {
      transport.stopScan();
      setSelected(d);
      setFailure(null);
      setFailedAt(null);
      setDone(false);
      reached.current = -1;
      try {
        await transport.connect(d.id);
        if (!alive.current) return;
        updateSettings({ lastDeviceId: d.id, lastDeviceName: d.name });
        notify('success');
        setDone(true);
        leaveTimer.current = setTimeout(leave, SUCCESS_HOLD_MS);
      } catch (e) {
        if (!alive.current) return;
        notify('error');
        setFailedAt(Math.max(reached.current, 0));
        setFailure(e instanceof TransportError ? e.code : 'CONNECT_FAILED');
      }
    },
    [transport],
  );

  const retry = () => {
    setSelected(null);
    setFailure(null);
    setFailedAt(null);
    void startScan();
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.closeRow}>
        <Button title="Close" variant="plain" size="small" onPress={leave} testID="btn-close" />
      </View>
      <Text variant="largeTitle" accessibilityRole="header">
        Find barrier
      </Text>
    </View>
  );

  let body: React.ReactNode;
  if (selected) {
    const steps = connectSteps(snap.phase, failedAt);
    const copy = failure ? connectFailureCopy(failure) : null;
    const active = steps.find((s) => s.state === 'active');
    const status = failure
      ? 'Could not connect'
      : done
        ? 'Connected'
        : active
          ? `${active.label}...`
          : 'Starting...';
    body = (
      <View testID="connect-progress">
        <Card>
          <View style={styles.selHead} accessible accessibilityLabel={`${selected.name}. ${status}`}>
            <View style={{ flex: 1 }}>
              <Text variant="title3">{selected.name}</Text>
              <Text
                variant="subheadline"
                color={failure ? 'critical' : done ? 'positive' : 'secondaryLabel'}
                testID="connect-status"
              >
                {status}
              </Text>
            </View>
            {!failure && !done ? <ActivityIndicator color={t.c.tint} /> : null}
          </View>
          <StepList steps={steps} />
        </Card>
        {snap.phase === 'pairing' && !failure ? <PairingCard /> : null}
        {copy ? (
          <>
            <Banner
              tone="critical"
              icon="alert-circle"
              title={copy.title}
              detail={[copy.detail, copy.action].filter(Boolean).join(' ')}
              testID="connect-failure"
            />
            <View style={{ marginTop: space.l }}>
              <Button title="Try again" icon="refresh" size="large" onPress={retry} testID="btn-retry" />
            </View>
          </>
        ) : null}
        {done ? (
          <Card tone="positive" testID="connect-success" style={{ marginTop: space.l }}>
            <View accessible accessibilityLabel={`Connected to ${selected.name}`} style={{ gap: space.xs }}>
              <Text variant="headline" color="positive">
                Connected
              </Text>
              <Text variant="subheadline">You are an owner of this barrier.</Text>
            </View>
            <AuthLatencyBadge ms={snap.session?.authLatencyMs ?? null} source={snap.kind} />
            <View style={{ marginTop: space.l }}>
              <Button title="Done" size="large" onPress={leave} testID="btn-done" />
            </View>
          </Card>
        ) : null}
      </View>
    );
  } else if (already && snap.session) {
    body = (
      <Card testID="already-connected">
        <Text variant="headline">{snap.session.deviceName}</Text>
        <Text variant="subheadline" color="secondaryLabel" style={{ marginTop: space.xs }}>
          Connected as owner.
        </Text>
        <AuthLatencyBadge ms={snap.session.authLatencyMs} source={snap.kind} />
        <View style={{ marginTop: space.l, gap: space.s }}>
          <Button title="Done" onPress={leave} testID="btn-done" />
          <Button
            title="Disconnect"
            variant="gray"
            onPress={() => {
              void transport.disconnect().then(() => {
                setAlready(false);
                void startScan();
              });
            }}
            testID="btn-disconnect"
          />
        </View>
      </Card>
    );
  } else if (scanError) {
    const copy = connectFailureCopy(scanError);
    body = (
      <>
        <Banner
          tone="critical"
          icon="alert-circle"
          title={copy.title}
          detail={copy.detail}
          testID="scan-error"
        />
        <View style={{ marginTop: space.l }}>
          <Button title="Try again" icon="refresh" size="large" onPress={retry} testID="btn-retry" />
        </View>
      </>
    );
  } else if (scanning && devices.length === 0) {
    body = (
      <View testID="scanning">
        <ListHeader title="Nearby barriers" busy />
        <Card>
          <View
            style={styles.scanning}
            accessible
            accessibilityLabel="Searching for your barrier"
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator color={t.c.tint} size="large" />
            <Text variant="headline">Searching for your barrier...</Text>
            <Text variant="subheadline" color="secondaryLabel" align="center">
              Keep your phone close to the barrier. This takes a few seconds.
            </Text>
          </View>
        </Card>
      </View>
    );
  } else if (devices.length === 0) {
    body = (
      <EmptyState
        icon="bluetooth-outline"
        title="No barrier found"
        detail="Move closer, check that the barrier has power, and scan again."
        action={<Button title="Scan again" icon="refresh" onPress={retry} testID="btn-scan-again" />}
      />
    );
  } else {
    body = (
      <View testID="device-list">
        <ListHeader title="Nearby barriers" busy={scanning} />
        <View style={{ gap: space.m }}>
          {devices.map((d) => (
            <DeviceRow
              key={d.id}
              testID={`device-${d.id}`}
              name={d.name}
              rssi={d.rssi}
              known={settings.lastDeviceId === d.id}
              onPress={() => void connect(d)}
            />
          ))}
        </View>
        <View style={{ marginTop: space.s, alignItems: 'center' }}>
          <Button
            title={scanning ? 'Scanning...' : 'Scan again'}
            variant="plain"
            size="small"
            disabled={scanning}
            onPress={retry}
            testID="btn-scan-again"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.c.background }]} testID="connect-screen">
      <ScrollView
        contentContainerStyle={{
          paddingTop: space.l,
          paddingHorizontal: space.l,
          paddingBottom: insets.bottom + space.xxxl,
        }}
      >
        {header}
        {body}
        <Text variant="footnote" color="secondaryLabel" style={{ marginTop: space.xl }}>
          Local only: the app talks to the barrier over Bluetooth and uses no internet.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { marginBottom: space.l },
  closeRow: { flexDirection: 'row', justifyContent: 'flex-end', minHeight: 44, alignItems: 'center' },
  selHead: { flexDirection: 'row', alignItems: 'center', gap: space.m, marginBottom: space.l },
  scanning: { alignItems: 'center', gap: space.s, paddingVertical: space.xl },
});
