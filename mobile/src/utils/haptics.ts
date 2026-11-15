import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { settingsStore } from '../store/settings';

const enabled = () => Platform.OS !== 'web' && settingsStore.get().haptics;

export function tap() {
  if (enabled()) void Haptics.selectionAsync().catch(() => undefined);
}
export function impact(style: 'light' | 'medium' | 'heavy' = 'medium') {
  if (!enabled()) return;
  const s =
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : style === 'heavy'
        ? Haptics.ImpactFeedbackStyle.Heavy
        : Haptics.ImpactFeedbackStyle.Medium;
  void Haptics.impactAsync(s).catch(() => undefined);
}
export function notify(kind: 'success' | 'warning' | 'error') {
  if (!enabled()) return;
  const k =
    kind === 'success'
      ? Haptics.NotificationFeedbackType.Success
      : kind === 'warning'
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error;
  void Haptics.notificationAsync(k).catch(() => undefined);
}
