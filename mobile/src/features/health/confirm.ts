import { Alert, Platform } from 'react-native';

/** Destructive confirmation: Alert on native, window.confirm on web. */
export function confirmDestructive(
  title: string,
  message: string,
  actionLabel: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    const ok =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(`${title}\n\n${message}`)
        : false;
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
