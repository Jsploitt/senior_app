/**
 * Bluetooth permission helper + pure state machine (DESIGN 3.4, STACK permissions table).
 *
 * `requestBluetoothPermission()` is the single entry point; workstream E's BleTransport can
 * call it before scanning. Platform behaviour:
 *  - Android 12+ (API 31+): BLUETOOTH_SCAN + BLUETOOTH_CONNECT runtime request.
 *  - Android <= 11 (API <= 30): ACCESS_FINE_LOCATION (Android requires it for BLE scans).
 *  - iOS: no programmatic request exists; the system prompt appears on first BLE use, so
 *    this returns 'granted' (a real denial surfaces later as BluetoothUnauthorized).
 *  - web / simulator: nothing to ask, returns 'granted'.
 */
import { PermissionsAndroid, Platform, type Permission } from 'react-native';

export type PermissionResult = 'granted' | 'denied' | 'blocked';

export type PermissionState = 'unknown' | 'requesting' | 'granted' | 'denied' | 'blocked';
export type PermissionEvent =
  { type: 'request' } | { type: 'result'; result: PermissionResult } | { type: 'reset' };

/** Pure transition function. 'blocked' = the OS will no longer show the prompt. */
export function permissionReducer(state: PermissionState, event: PermissionEvent): PermissionState {
  switch (event.type) {
    case 'request':
      // Already granted or in flight: nothing to do. Blocked needs Settings, not a prompt.
      return state === 'granted' || state === 'blocked' || state === 'requesting' ? state : 'requesting';
    case 'result':
      return state === 'requesting' || state === 'unknown' ? event.result : state;
    case 'reset':
      return 'unknown';
  }
}

export type PermissionAction = 'request' | 'continue' | 'openSettings' | 'wait';

/** What the primary button does in each state. */
export function permissionAction(state: PermissionState): PermissionAction {
  switch (state) {
    case 'granted':
      return 'continue';
    case 'blocked':
      return 'openSettings';
    case 'requesting':
      return 'wait';
    default:
      return 'request';
  }
}

export interface PermissionCopy {
  title: string;
  body: string;
  button: string;
  status?: string;
}

/** Copy for the Bluetooth page. Android <= 11 gets the location explanation (DESIGN 3.4). */
export function permissionCopy(
  state: PermissionState,
  os: string = Platform.OS,
  apiLevel: number = typeof Platform.Version === 'number' ? Platform.Version : 0,
): PermissionCopy {
  const legacyAndroid = os === 'android' && apiLevel < 31;
  const body =
    os === 'ios'
      ? 'Your iPhone will ask for Bluetooth access the first time you connect to the barrier. Tap Allow so the app can find it.'
      : legacyAndroid
        ? 'Android requires Location access to scan for Bluetooth devices. The app never reads your location.'
        : 'The app uses Bluetooth to find and talk to your barrier, nothing else. Nearby devices access is used only for this.';
  const base = { title: 'Allow Bluetooth', body };
  switch (state) {
    case 'granted':
      return { ...base, button: 'Continue', status: 'Bluetooth access is allowed.' };
    case 'blocked':
      return {
        ...base,
        button: 'Open Settings',
        status: 'Bluetooth access is turned off for this app. Turn it on in Settings, then come back.',
      };
    case 'denied':
      return {
        ...base,
        button: 'Try again',
        status: 'Without Bluetooth access the app cannot find your barrier.',
      };
    case 'requesting':
      return { ...base, button: 'Waiting for permission' };
    default:
      return { ...base, button: os === 'ios' ? 'Continue' : 'Allow Bluetooth' };
  }
}

/** Runtime permissions needed for a given Android API level. */
export function androidPermissionsFor(apiLevel: number): Permission[] {
  if (apiLevel >= 31) {
    return [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ] as Permission[];
  }
  return [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] as Permission[];
}

/** Injectable platform surface so the helper is unit-testable. */
export interface PermissionEnv {
  os: string;
  apiLevel: number;
  check(p: Permission): Promise<boolean>;
  requestMultiple(ps: Permission[]): Promise<Record<string, string>>;
}

const realEnv = (): PermissionEnv => ({
  os: Platform.OS,
  apiLevel: typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version) || 0,
  check: (p) => PermissionsAndroid.check(p),
  requestMultiple: (ps) => PermissionsAndroid.requestMultiple(ps) as Promise<Record<string, string>>,
});

/** Fold per-permission answers into one result (any never_ask_again -> blocked). */
export function combineResults(answers: string[]): PermissionResult {
  if (answers.every((a) => a === PermissionsAndroid.RESULTS.GRANTED)) return 'granted';
  if (answers.some((a) => a === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) return 'blocked';
  return 'denied';
}

/** Ask for Bluetooth access. Never throws. Safe to call from BleTransport before scanning. */
export async function requestBluetoothPermission(env: PermissionEnv = realEnv()): Promise<PermissionResult> {
  if (env.os !== 'android') return 'granted';
  try {
    const wanted = androidPermissionsFor(env.apiLevel);
    const answers = await env.requestMultiple(wanted);
    return combineResults(wanted.map((p) => answers[p] ?? 'denied'));
  } catch {
    return 'denied';
  }
}

/** Current state without prompting. iOS/web report 'unknown' -> treated as grantable. */
export async function checkBluetoothPermission(env: PermissionEnv = realEnv()): Promise<PermissionState> {
  if (env.os !== 'android') return 'unknown';
  try {
    const wanted = androidPermissionsFor(env.apiLevel);
    const have = await Promise.all(wanted.map((p) => env.check(p)));
    return have.every(Boolean) ? 'granted' : 'unknown';
  } catch {
    return 'unknown';
  }
}
