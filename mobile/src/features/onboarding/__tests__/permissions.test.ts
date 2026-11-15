import { PermissionsAndroid } from 'react-native';
import {
  androidPermissionsFor,
  checkBluetoothPermission,
  combineResults,
  permissionAction,
  permissionCopy,
  permissionReducer,
  requestBluetoothPermission,
  type PermissionEnv,
} from '../permissions';

const G = PermissionsAndroid.RESULTS.GRANTED;
const D = PermissionsAndroid.RESULTS.DENIED;
const N = PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

const env = (over: Partial<PermissionEnv>): PermissionEnv => ({
  os: 'android',
  apiLevel: 34,
  check: async () => false,
  requestMultiple: async (ps) => Object.fromEntries(ps.map((p) => [p, G])),
  ...over,
});

describe('permission state machine', () => {
  it('walks request -> granted', () => {
    let s = permissionReducer('unknown', { type: 'request' });
    expect(s).toBe('requesting');
    s = permissionReducer(s, { type: 'result', result: 'granted' });
    expect(s).toBe('granted');
    expect(permissionAction(s)).toBe('continue');
  });
  it('denied can retry, blocked goes to Settings', () => {
    const denied = permissionReducer('requesting', { type: 'result', result: 'denied' });
    expect(permissionAction(denied)).toBe('request');
    expect(permissionReducer(denied, { type: 'request' })).toBe('requesting');
    const blocked = permissionReducer('requesting', { type: 'result', result: 'blocked' });
    expect(permissionAction(blocked)).toBe('openSettings');
    expect(permissionReducer(blocked, { type: 'request' })).toBe('blocked');
    expect(permissionReducer(blocked, { type: 'reset' })).toBe('unknown');
  });
  it('ignores stray results and double requests', () => {
    expect(permissionReducer('granted', { type: 'result', result: 'denied' })).toBe('granted');
    expect(permissionReducer('requesting', { type: 'request' })).toBe('requesting');
    expect(permissionAction('requesting')).toBe('wait');
  });
  it('copy matches platform', () => {
    expect(permissionCopy('unknown', 'android', 30).body).toMatch(/Location/);
    expect(permissionCopy('unknown', 'android', 33).body).not.toMatch(/Location/);
    expect(permissionCopy('unknown', 'ios', 0).body).toMatch(/first time you connect/);
    expect(permissionCopy('blocked', 'android', 33).button).toBe('Open Settings');
  });
});

describe('requestBluetoothPermission', () => {
  it('returns granted on ios and web without prompting', async () => {
    const requestMultiple = jest.fn();
    expect(await requestBluetoothPermission(env({ os: 'ios', requestMultiple }))).toBe('granted');
    expect(await requestBluetoothPermission(env({ os: 'web', requestMultiple }))).toBe('granted');
    expect(requestMultiple).not.toHaveBeenCalled();
  });
  it('asks SCAN + CONNECT on Android 12+ and location on <= 11', () => {
    expect(androidPermissionsFor(31)).toHaveLength(2);
    expect(androidPermissionsFor(30)).toEqual([PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]);
  });
  it('maps Android answers', async () => {
    expect(await requestBluetoothPermission(env({}))).toBe('granted');
    const mixed = (v: string) => async (ps: string[]) =>
      Object.fromEntries(ps.map((p, i) => [p, i === 0 ? v : G]));
    expect(await requestBluetoothPermission(env({ requestMultiple: mixed(D) as never }))).toBe('denied');
    expect(await requestBluetoothPermission(env({ requestMultiple: mixed(N) as never }))).toBe('blocked');
    expect(
      await requestBluetoothPermission(
        env({
          requestMultiple: async () => {
            throw new Error('x');
          },
        }),
      ),
    ).toBe('denied');
    expect(combineResults([G, D, N])).toBe('blocked');
  });
  it('check reports granted only when all are held', async () => {
    expect(await checkBluetoothPermission(env({ check: async () => true }))).toBe('granted');
    expect(await checkBluetoothPermission(env({ check: async () => false }))).toBe('unknown');
    expect(await checkBluetoothPermission(env({ os: 'ios' }))).toBe('unknown');
  });
});
