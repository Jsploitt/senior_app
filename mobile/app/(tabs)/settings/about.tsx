import { router } from 'expo-router';
import { Row, Screen, Section, Text } from '@/components';
import { StackHeader } from '@/components/StackHeader';
import { APP_NAME, appVersionInfo, CONTRACT_VERSION, TEAM_LINE } from '@/features/settings/appInfo';
import { LogoTile } from '@/features/settings/LogoTile';
import { useSecretTap } from '@/features/settings/secretTap';
import { updateSettings, useSettings } from '@/store/settings';
import { space } from '@/theme/tokens';
import { useCallback } from 'react';

export default function About() {
  const { presenterUnlocked } = useSettings();
  const { version, build } = appVersionInfo();
  const unlock = useCallback(() => {
    updateSettings({ presenterUnlocked: true });
    router.push('/presenter');
  }, []);
  const onLogo = useSecretTap(unlock);
  return (
    <Screen testID="about-screen">
      <StackHeader backLabel="Settings" title="About" />
      <LogoTile onPress={onLogo} />
      <Text variant="title2" align="center" style={{ marginTop: space.m }}>
        {APP_NAME}
      </Text>
      <Text variant="subheadline" color="secondaryLabel" align="center">
        {TEAM_LINE}
      </Text>

      <Section>
        <Row title="Version" value={`${version} (${build})`} />
        <Row title="Firmware interface" value={CONTRACT_VERSION} last />
      </Section>

      <Section
        title="Privacy"
        footer="No analytics, no cloud, no account, no software updates over the internet."
      >
        <Row title="100% local" subtitle="This app makes no network requests." last />
      </Section>

      <Section
        title="What this app is"
        footer="The registered, distance-aware vehicle authentication in the project's final design review (slide 15) is a separate part of the system. This app does not provide it."
      >
        <Row
          title="Phone authorization"
          subtitle="Any owner phone enrolled on the barrier can lower, raise or stop it."
          last
        />
      </Section>

      <Section
        title="Known limits"
        footer="The barrier has no Bluetooth command to list or remove owner phones, so this app cannot show or revoke them."
      >
        <Row title="Owners" value="Up to 2 phones" last />
      </Section>

      {presenterUnlocked ? (
        <Section>
          <Row
            testID="row-presenter-about"
            icon="easel-outline"
            iconBg="tintFill"
            title="Presenter mode"
            chevron
            last
            onPress={() => router.push('/presenter')}
          />
        </Section>
      ) : null}
    </Screen>
  );
}
