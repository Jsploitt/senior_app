/**
 * ble-plx BleError -> TransportError mapping (pure, no native imports).
 * Status: untested on hardware (no board/phone available on 2026-11-15).
 *
 * Numeric codes are copied from react-native-ble-plx 3.5.1 src/BleError.js
 * (BleErrorCode / BleATTErrorCode / BleAndroidErrorCode); a test compares them to the
 * installed package so drift is caught. ATT numbers: docs/CONTRACT.md 7.4.
 */
import { TransportError, type TransportErrorCode } from '../types';

export const BLE_ERR = {
  OperationCancelled: 2,
  OperationTimedOut: 3,
  BluetoothUnsupported: 100,
  BluetoothUnauthorized: 101,
  BluetoothPoweredOff: 102,
  DeviceConnectionFailed: 200,
  DeviceDisconnected: 201,
  DeviceNotFound: 204,
  DeviceNotConnected: 205,
  ServicesDiscoveryFailed: 300,
  ServiceNotFound: 302,
  CharacteristicWriteFailed: 401,
  CharacteristicReadFailed: 402,
  CharacteristicNotifyChangeFailed: 403,
  CharacteristicNotFound: 404,
  ScanStartFailed: 600,
  LocationServicesDisabled: 601,
} as const;

/** ATT error codes (Bluetooth Core spec; BleATTErrorCode). */
export const ATT = {
  InsufficientAuthentication: 0x05,
  InsufficientAuthorization: 0x08,
  InsufficientEncryption: 0x0f,
} as const;

/** Android GATT stack statuses (BleAndroidErrorCode). */
export const ANDROID_GATT = {
  AuthFail: 0x89,
  EncryptedNoMitm: 0x8d,
  NotEncrypted: 0x8e,
} as const;

export type ErrorContext = 'scan' | 'connect' | 'session' | 'status' | 'write' | 'monitor';

interface BleErrorLike {
  errorCode: number;
  attErrorCode?: number | null;
  iosErrorCode?: number | null;
  androidErrorCode?: number | null;
  reason?: string | null;
  message?: string;
}

export function isBleErrorLike(e: unknown): e is BleErrorLike {
  return typeof e === 'object' && e !== null && typeof (e as { errorCode?: unknown }).errorCode === 'number';
}

const detail = (e: BleErrorLike) =>
  [
    e.message,
    e.reason ? `reason=${e.reason}` : null,
    e.attErrorCode != null ? `att=${e.attErrorCode}` : null,
    e.androidErrorCode != null ? `android=${e.androidErrorCode}` : null,
    e.iosErrorCode != null ? `ios=${e.iosErrorCode}` : null,
  ]
    .filter(Boolean)
    .join(' ');

/** Link not encrypted/authenticated yet (pairing needed, cancelled, failed, or stale bond). */
export function isAuthRequired(e: unknown): boolean {
  if (!isBleErrorLike(e)) return false;
  const a = e.attErrorCode;
  const d = e.androidErrorCode;
  return (
    a === ATT.InsufficientAuthentication ||
    a === ATT.InsufficientEncryption ||
    d === ATT.InsufficientAuthentication ||
    d === ATT.InsufficientEncryption ||
    d === ANDROID_GATT.AuthFail ||
    d === ANDROID_GATT.EncryptedNoMitm ||
    d === ANDROID_GATT.NotEncrypted
  );
}

/** Encrypted but the peer is not an owner (CONTRACT 7.3 / 7.4: ATT 0x08). */
export function isNotAuthorized(e: unknown): boolean {
  return (
    isBleErrorLike(e) &&
    (e.attErrorCode === ATT.InsufficientAuthorization || e.androidErrorCode === ATT.InsufficientAuthorization)
  );
}

export function isDisconnected(e: unknown): boolean {
  return isBleErrorLike(e) && e.errorCode === BLE_ERR.DeviceDisconnected;
}

export function isCancelled(e: unknown): boolean {
  return isBleErrorLike(e) && e.errorCode === BLE_ERR.OperationCancelled;
}

export const ENROLLMENT_HINT =
  'The barrier dropped the connection during pairing. It only accepts a new phone while the enrollment ' +
  'window is open: hold the enrollment button for 3 seconds, then retry within 60 seconds. ' +
  'On iPhone also remove "M010-Barrier" under Settings > Bluetooth (Forget This Device) before retrying.';

export const PAIRING_HINT =
  'Pairing did not complete (wrong or cancelled passkey, or a stale bond on this phone). ' +
  'Check the 6-digit passkey on the unit label; on iPhone use Forget This Device in Settings > Bluetooth, ' +
  'on Android remove the bond in Bluetooth settings, then retry.';

export const NOT_OWNER_HINT =
  'Paired, but this phone is not an owner of the barrier (owner list full, or the bond is not in the owner list). ' +
  'An existing owner must be revoked on site, then retry within the enrollment window.';

/** Map any thrown value to a TransportError for the given operation context. */
export function mapBleError(e: unknown, ctx: ErrorContext): TransportError {
  if (e instanceof TransportError) return e;
  if (!isBleErrorLike(e)) {
    const msg = e instanceof Error ? e.message : String(e);
    return new TransportError(ctx === 'connect' || ctx === 'scan' ? 'CONNECT_FAILED' : 'PROTOCOL', msg);
  }
  const t = (code: TransportErrorCode, msg: string) => new TransportError(code, `${msg} (${detail(e)})`);

  if (isNotAuthorized(e)) return t('NOT_AUTHORIZED', NOT_OWNER_HINT);
  if (isAuthRequired(e)) return t('PAIRING_FAILED', PAIRING_HINT);

  switch (e.errorCode) {
    case BLE_ERR.BluetoothPoweredOff:
      return t('BLUETOOTH_OFF', 'Bluetooth is turned off');
    case BLE_ERR.BluetoothUnauthorized:
      return t('PERMISSION_DENIED', 'Bluetooth permission is not granted');
    case BLE_ERR.LocationServicesDisabled:
      return t(
        'PERMISSION_DENIED',
        'Location services must be on to scan for Bluetooth devices on this Android version',
      );
    case BLE_ERR.BluetoothUnsupported:
      return t('UNSUPPORTED', 'Bluetooth LE is not supported on this device');
    case BLE_ERR.OperationTimedOut:
      return t('TIMEOUT', 'Bluetooth operation timed out');
    case BLE_ERR.DeviceDisconnected:
      return ctx === 'session'
        ? t('PAIRING_FAILED', ENROLLMENT_HINT)
        : ctx === 'connect'
          ? t('CONNECT_FAILED', 'Disconnected while connecting')
          : t('LINK_LOST', 'Connection to the barrier was lost');
    case BLE_ERR.DeviceNotConnected:
      return t('NOT_CONNECTED', 'Not connected to the barrier');
    case BLE_ERR.DeviceNotFound:
      return t('NOT_FOUND', 'Barrier not found');
    case BLE_ERR.DeviceConnectionFailed:
      return t('CONNECT_FAILED', 'Could not connect to the barrier');
    case BLE_ERR.ScanStartFailed:
      return t('CONNECT_FAILED', 'Bluetooth scan could not be started');
    case BLE_ERR.ServiceNotFound:
    case BLE_ERR.CharacteristicNotFound:
    case BLE_ERR.ServicesDiscoveryFailed:
      return t('PROTOCOL', 'Barrier GATT service is missing or could not be discovered');
    case BLE_ERR.OperationCancelled:
      return t(ctx === 'connect' ? 'CONNECT_FAILED' : 'LINK_LOST', 'Operation cancelled');
    default:
      return t(ctx === 'connect' || ctx === 'scan' ? 'CONNECT_FAILED' : 'PROTOCOL', 'Bluetooth error');
  }
}
