/**
 * Android runtime BLE permissions (iOS: the system prompt appears on first BleManager use and is
 * reported through manager state 'Unauthorized', handled in BleLinkProvider).
 * Status: untested on hardware (no board/phone available on 2026-11-15).
 *
 * docs/STACK.md section 5: API >= 31 needs BLUETOOTH_SCAN + BLUETOOTH_CONNECT (plugin sets
 * neverForLocation, so no location prompt); API <= 30 needs ACCESS_FINE_LOCATION.
 * Exported for onboarding screens to call before the first scan.
 */
import { PermissionsAndroid, Platform, type Permission } from 'react-native';
import { TransportError } from '../types';

function androidApiLevel(): number {
  const v = Platform.Version;
  return typeof v === 'number' ? v : parseInt(String(v), 10) || 0;
}

/** Permissions required on this device (empty on iOS/web). */
export function requiredBlePermissions(): Permission[] {
  if (Platform.OS !== 'android') return [];
  const P = PermissionsAndroid.PERMISSIONS;
  return androidApiLevel() >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] : [P.ACCESS_FINE_LOCATION];
}

/** Non-prompting check. */
export async function hasBlePermissions(): Promise<boolean> {
  const perms = requiredBlePermissions();
  for (const p of perms) {
    if (!(await PermissionsAndroid.check(p))) return false;
  }
  return true;
}

/** Prompt if needed. Throws TransportError('PERMISSION_DENIED') when any permission is refused. */
export async function ensureBlePermissions(): Promise<void> {
  const perms = requiredBlePermissions();
  if (perms.length === 0) return;
  const res = await PermissionsAndroid.requestMultiple(perms);
  const denied = perms.filter((p) => res[p] !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied.length === 0) return;
  const blocked = denied.some((p) => res[p] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
  throw new TransportError(
    'PERMISSION_DENIED',
    blocked
      ? 'Bluetooth permission was denied permanently. Enable it for this app in system Settings > Apps > Permissions.'
      : 'Bluetooth permission is required to find and connect to the barrier.',
  );
}
