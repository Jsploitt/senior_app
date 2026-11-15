import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadSettings, useSettings } from '@/store/settings';
import { setTransportKind } from '@/store/transport';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { installQaHook } from '@/utils/qaHook';

installQaHook();

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Root() {
  const t = useTheme();
  const s = useSettings();
  useEffect(() => {
    void loadSettings();
  }, []);
  useEffect(() => {
    if (s.loaded) {
      setTransportKind(s.transport);
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [s.loaded, s.transport]);
  if (!s.loaded) return null;
  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.c.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="connect" options={{ presentation: 'modal' }} />
        <Stack.Screen name="presenter" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Root />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
