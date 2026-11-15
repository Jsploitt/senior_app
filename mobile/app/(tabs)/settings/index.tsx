import { router } from 'expo-router';
import { Row, Screen, Section } from '@/components';
import { chooseTransport } from '@/features/settings/actions';
import { Pad, SegmentedPicker, SwitchRow } from '@/features/settings/controls';
import { type ThemePref, updateSettings, useSettings } from '@/store/settings';
import { bleSupported } from '@/store/transport';
import type { TransportKind } from '@/transport/types';

export default function SettingsHome() {
  const s = useSettings();
  const connectionFooter = !bleSupported
    ? 'Bluetooth needs the iPhone or Android app. In a web browser only the simulator is available.'
    : s.transport === 'sim'
      ? 'The simulator is a virtual barrier inside the app. Nothing is sent over Bluetooth.'
      : 'Talks to a real M010 barrier over Bluetooth. Switching disconnects the current barrier first.';
  return (
    <Screen title="Settings" testID="settings-screen">
      <Section title="Connection" footer={connectionFooter}>
        <Pad>
          <SegmentedPicker<TransportKind>
            testID="transport"
            accessibilityLabel="Transport"
            value={s.transport}
            onChange={(k) => chooseTransport(k)}
            options={[
              { value: 'sim', label: 'Simulated' },
              { value: 'ble', label: 'Bluetooth', disabled: !bleSupported },
            ]}
          />
        </Pad>
      </Section>

      <Section title="This barrier">
        <Row
          testID="row-device"
          icon="car-outline"
          title="Barrier"
          value={s.lastDeviceName ?? 'None yet'}
          chevron
          last
          onPress={() => router.push('/settings/device')}
          accessibilityHint="Shows counters and lets you forget this barrier"
        />
      </Section>

      <Section title="Appearance">
        <Pad>
          <SegmentedPicker<ThemePref>
            testID="theme"
            accessibilityLabel="Appearance"
            value={s.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Pad>
        <SwitchRow
          testID="haptics-switch"
          title="Haptics"
          subtitle="Taps and result feedback"
          value={s.haptics}
          onChange={(haptics) => updateSettings({ haptics })}
          last
        />
      </Section>

      <Section title="General">
        <Row
          testID="row-replay"
          icon="refresh-outline"
          iconBg="warningFill"
          title="Replay onboarding"
          chevron
          onPress={() => {
            updateSettings({ onboarded: false });
            router.replace('/onboarding');
          }}
        />
        {s.presenterUnlocked ? (
          <Row
            testID="row-presenter"
            icon="easel-outline"
            iconBg="positiveFill"
            title="Presenter mode"
            chevron
            onPress={() => router.push('/presenter')}
          />
        ) : null}
        <Row
          testID="row-about"
          icon="information-circle-outline"
          title="About"
          chevron
          last
          onPress={() => router.push('/settings/about')}
        />
      </Section>
    </Screen>
  );
}
