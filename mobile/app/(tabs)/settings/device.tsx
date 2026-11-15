import { useState } from 'react';
import { Banner, Button, Row, Screen, Section } from '@/components';
import { StackHeader } from '@/components/StackHeader';
import { BARRIER_LAST_COUNTER_LABEL, barrierLastCounter } from '@/features/health/format';
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
    <Screen testID="device-screen">
      <StackHeader backLabel="Settings" title="This barrier" />
      <Section
        title="Details"
        footer="Counters stop replayed commands. The local counter is stored on this phone; the barrier reports its own when connected."
      >
        <Row title="Name" value={name ?? 'None yet'} />
        <Row title="Device ID" value={id ?? 'None yet'} />
        <Row
          title={BARRIER_LAST_COUNTER_LABEL}
          testID="device-counter"
          value={barrierLastCounter(snap.status)}
        />
        <Row title="Phone's next counter" testID="local-counter" value={num(snap.nextCounter)} last />
      </Section>

      {phase === 'idle' ? (
        <Section
          footer={
            id
              ? 'Clears the saved barrier and its command counter on this phone. You will have to enroll again to control it.'
              : 'No barrier is saved on this phone yet.'
          }
        >
          <Row
            testID="forget-button"
            title="Forget this barrier"
            destructive={!!id}
            last
            onPress={id ? () => setPhase('confirm') : undefined}
            accessibilityHint="Asks for confirmation first"
          />
        </Section>
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
