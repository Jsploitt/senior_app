import { useState } from 'react';
import { Banner, Button, Gap, Row, Screen, Section } from '@/components';
import { BackBar } from '@/features/settings/BackBar';
import { FORGET_INSTRUCTIONS, forgetBarrier } from '@/features/settings/actions';
import { useSettings } from '@/store/settings';
import { useTransport, useTransportSnapshot } from '@/store/transport';
import { space } from '@/theme/tokens';
import { View } from 'react-native';

type ForgetPhase = 'idle' | 'confirm' | 'done';

export default function DevicePage() {
  const s = useSettings();
  const transport = useTransport();
  const snap = useTransportSnapshot();
  const [phase, setPhase] = useState<ForgetPhase>('idle');
  const id = s.lastDeviceId ?? snap.session?.deviceId ?? null;
  const name = s.lastDeviceName ?? snap.session?.deviceName ?? null;
  const num = (n: number | null | undefined) => (n == null ? 'Not available' : String(n));

  return (
    <Screen title="Barrier" testID="device-screen">
      <BackBar />
      <Section
        title="This barrier"
        footer="Counters stop replayed commands. The local counter is stored on this phone; the barrier reports its own when connected."
      >
        <Row title="Name" value={name ?? 'None yet'} />
        <Row title="Device ID" value={id ?? 'None yet'} />
        <Row title="Next command counter (this phone)" testID="local-counter" value={num(snap.nextCounter)} />
        <Row
          title="Last counter (reported by barrier)"
          testID="device-counter"
          value={snap.status ? String(snap.status.lastCounter) : 'Not connected'}
          last
        />
      </Section>

      <Gap h={space.xxl} />
      {phase === 'idle' ? (
        <Button
          testID="forget-button"
          title="Forget this barrier"
          variant="destructive"
          disabled={!id}
          onPress={() => setPhase('confirm')}
          accessibilityHint="Asks for confirmation first"
        />
      ) : null}
      {phase === 'confirm' ? (
        <Banner
          tone="critical"
          icon="warning"
          title="Forget this barrier?"
          detail="This phone will clear the saved barrier and its command counter. You will have to enroll again to control it."
          action={
            <View style={{ flexDirection: 'row', gap: space.m }}>
              <Button
                testID="forget-cancel"
                title="Cancel"
                variant="gray"
                style={{ flex: 1 }}
                onPress={() => setPhase('idle')}
              />
              <Button
                testID="forget-confirm"
                title="Forget"
                variant="destructive"
                style={{ flex: 1 }}
                onPress={() => {
                  void forgetBarrier(transport, id).then(() => setPhase('done'));
                }}
              />
            </View>
          }
        />
      ) : null}
      {phase === 'done' ? (
        <Banner
          tone="warning"
          icon="information-circle"
          title="Barrier forgotten on this phone"
          detail={FORGET_INSTRUCTIONS}
          testID="forget-done"
        />
      ) : null}
    </Screen>
  );
}
