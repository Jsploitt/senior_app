import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useSettings } from '../store/settings';
import { makeTheme, type Theme } from './tokens';

const Ctx = createContext<Theme>(makeTheme(false));

export function ThemeProvider({ children, forceDark }: { children: ReactNode; forceDark?: boolean }) {
  const system = useColorScheme();
  const { theme } = useSettings();
  const isDark = forceDark ?? (theme === 'system' ? system === 'dark' : theme === 'dark');
  const value = useMemo(() => makeTheme(isDark), [isDark]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
