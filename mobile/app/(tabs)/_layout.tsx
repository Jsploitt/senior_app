import { Redirect, Tabs } from 'expo-router';
import { Icon } from '@/components';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const t = useTheme();
  const { onboarded } = useSettings();
  if (!onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.c.tint,
        tabBarInactiveTintColor: t.c.secondaryLabel,
        tabBarStyle: { backgroundColor: t.c.surface, borderTopColor: t.c.separator },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Barrier',
          tabBarIcon: ({ focused }) => (
            <Icon name={focused ? 'car' : 'car-outline'} color={focused ? 'tint' : 'secondaryLabel'} />
          ),
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: 'Health',
          tabBarIcon: ({ focused }) => (
            <Icon name={focused ? 'pulse' : 'pulse-outline'} color={focused ? 'tint' : 'secondaryLabel'} />
          ),
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ focused }) => (
            <Icon name={focused ? 'list' : 'list-outline'} color={focused ? 'tint' : 'secondaryLabel'} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => (
            <Icon
              name={focused ? 'settings' : 'settings-outline'}
              color={focused ? 'tint' : 'secondaryLabel'}
            />
          ),
        }}
      />
    </Tabs>
  );
}
