import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { getTransport, setTransportKind } from '@/store/transport';
import { useTheme } from '@/theme/ThemeProvider';

/** Presenter mode runs on the simulated transport only; the previous transport is restored on exit. */
export default function PresenterLayout() {
  const t = useTheme();
  useEffect(() => {
    const previous = getTransport().kind;
    setTransportKind('sim');
    return () => setTransportKind(previous);
  }, []);
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: t.c.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
