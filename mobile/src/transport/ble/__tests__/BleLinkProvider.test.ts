/**
 * BleLinkProvider tests against a hand-written fake BleManager (../testing/fakeBle).
 * Status: untested on hardware (no board/phone available on 2026-11-15). Passing here proves the
 * mapping/flow logic only, not behaviour of ble-plx, Core Bluetooth, Android or the firmware.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import vectors from '../../../../docs/vectors.json';
import { decodeCommand, encodeCommand, encodeStatus, decodeStatus, toBase64 } from '../../../protocol/codec';
import {
  CmdResult,
  COMMAND_UUID,
  Opcode,
  SERVICE_UUID,
  SESSION_UUID,
  STATUS_UUID,
} from '../../../protocol/constants';
import { BarrierClient } from '../../BarrierClient';
import { memoryCounterStore } from '../../counter';
import { TransportError, type TransportErrorCode } from '../../types';
import { BleLinkProvider, type BleLinkOptions } from '../BleLinkProvider';
import { ATT, BLE_ERR, ANDROID_GATT, mapBleError } from '../errors';
import { bleError, FakeBleManager, type FakeConfig } from '../testing/fakeBle';

jest.mock('react-native-ble-plx', () => {
  const { FakeBleManager: Fake } = jest.requireActual('../testing/fakeBle');
  return {
    BleManager: Fake,
    State: jest.requireActual('react-native-ble-plx/src/TypeDefinition').State,
  };
});

const hexToBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));
const b64OfHex = (h: string) => toBase64(hexToBytes(h));

const nonceVec = vectors.session_nonces.find((v) => v.nonce !== 0)!;
const statusVec =
  vectors.statuses.find((s) => s.decoded.last_counter === 0 && s.decoded.state === 2) ?? vectors.statuses[0]!;

const FAST: BleLinkOptions = {
  powerOnTimeoutMs: 30,
  stateUnknownTimeoutMs: 100,
  opTimeoutMs: 40,
  pairingDeadlineMs: 400,
  androidPairRetryMs: 5,
  connectTimeoutMs: 100,
  discoverTimeoutMs: 100,
};

function setup(cfg: Partial<FakeConfig> = {}, opts: BleLinkOptions = {}) {
  FakeBleManager.reset({
    sessionReads: [{ value: b64OfHex(nonceVec.hex) }],
    statusRead: { value: b64OfHex(statusVec.hex) },
    ...cfg,
  });
  const provider = new BleLinkProvider({ ...FAST, ...opts });
  const client = new BarrierClient({
    kind: 'ble',
    provider,
    counters: memoryCounterStore(),
    commandTimeoutMs: 500,
    settleMs: 5,
  });
  const fake = () => FakeBleManager.last!;
  return { provider, client, fake };
}

async function codeOf(p: Promise<unknown>): Promise<TransportErrorCode> {
  try {
    await p;
  } catch (e) {
    if (e instanceof TransportError) return e.code;
    throw e;
  }
  throw new Error('expected rejection');
}

const setPlatform = (os: 'ios' | 'android', version: number | string = 34) => {
  jest.replaceProperty(Platform, 'OS', os);
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version as never);
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('scan', () => {
  it('filters by the service UUID (not the name) without duplicates, and reports names with fallback', async () => {
    const { provider, fake } = setup();
    const found: unknown[] = [];
    const p = provider.scan((d) => found.push(d), 30);
    await new Promise((r) => setTimeout(r, 5));
    fake().emitScan('AA:01', null, null, -60);
    fake().emitScan('AA:02', 'M010-Barrier', null, -70);
    fake().emitScan('AA:03', null, 'Local', null);
    await p;
    expect(fake().scanArgs).toEqual({ uuids: [SERVICE_UUID], options: { allowDuplicates: false } });
    expect(found).toEqual([
      { id: 'AA:01', name: 'M010-Barrier', rssi: -60 },
      { id: 'AA:02', name: 'M010-Barrier', rssi: -70 },
      { id: 'AA:03', name: 'Local', rssi: null },
    ]);
    expect(fake().calls).toContain('stopDeviceScan');
  });

  it('stopScan() ends a running scan early', async () => {
    const { provider, fake } = setup();
    const p = provider.scan(() => {}, 5000);
    await new Promise((r) => setTimeout(r, 5));
    provider.stopScan();
    await p;
    expect(fake().calls.filter((c) => c === 'stopDeviceScan')).toHaveLength(1);
  });

  it('maps a scan error from the listener', async () => {
    const { provider, fake } = setup();
    const p = provider.scan(() => {}, 5000);
    await new Promise((r) => setTimeout(r, 5));
    fake().scanListener!(bleError(BLE_ERR.ScanStartFailed), null);
    expect(await codeOf(p)).toBe('CONNECT_FAILED');
  });
});

describe('adapter state and permissions', () => {
  it('BLUETOOTH_OFF when the adapter stays off', async () => {
    const { provider } = setup({ state: 'PoweredOff' });
    expect(await codeOf(provider.scan(() => {}, 100))).toBe('BLUETOOTH_OFF');
  });

  it('recovers when the adapter powers on while waiting', async () => {
    const { provider, fake } = setup({ state: 'PoweredOff' }, { powerOnTimeoutMs: 500 });
    const p = provider.scan(() => {}, 20);
    await new Promise((r) => setTimeout(r, 10));
    fake().emitState('PoweredOn');
    await p;
    expect(fake().scanArgs).not.toBeNull();
  });

  it('iOS Unauthorized state -> PERMISSION_DENIED; Unsupported -> UNSUPPORTED', async () => {
    expect(await codeOf(setup({ state: 'Unauthorized' }).provider.scan(() => {}, 50))).toBe(
      'PERMISSION_DENIED',
    );
    expect(await codeOf(setup({ state: 'Unsupported' }).provider.scan(() => {}, 50))).toBe('UNSUPPORTED');
  });

  it('Android 12+ requests BLUETOOTH_SCAN + BLUETOOTH_CONNECT; denied -> PERMISSION_DENIED, no manager used', async () => {
    setPlatform('android', 34);
    const req = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      'android.permission.BLUETOOTH_SCAN': 'granted',
      'android.permission.BLUETOOTH_CONNECT': 'denied',
    } as never);
    const { provider } = setup();
    expect(await codeOf(provider.scan(() => {}, 50))).toBe('PERMISSION_DENIED');
    expect(req).toHaveBeenCalledWith([
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
    ]);
    expect(FakeBleManager.last).toBeNull();
  });

  it('Android 11 and below requests ACCESS_FINE_LOCATION; never_ask_again says so', async () => {
    setPlatform('android', 30);
    const req = jest
      .spyOn(PermissionsAndroid, 'requestMultiple')
      .mockResolvedValue({ 'android.permission.ACCESS_FINE_LOCATION': 'never_ask_again' } as never);
    const { provider } = setup();
    const err = await provider.scan(() => {}, 50).catch((e: TransportError) => e);
    expect(req).toHaveBeenCalledWith(['android.permission.ACCESS_FINE_LOCATION']);
    expect((err as TransportError).code).toBe('PERMISSION_DENIED');
    expect((err as TransportError).message).toMatch(/permanently/);
  });

  it('Android granted -> scan proceeds', async () => {
    setPlatform('android', 33);
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      'android.permission.BLUETOOTH_SCAN': 'granted',
      'android.permission.BLUETOOTH_CONNECT': 'granted',
    } as never);
    const { provider, fake } = setup();
    await provider.scan(() => {}, 10);
    expect(fake().scanArgs).not.toBeNull();
  });
});

describe('connect through BarrierClient', () => {
  it('happy path: Session + Status vectors -> ready; subscribes to disconnects before any GATT op', async () => {
    const { client, fake } = setup();
    const s = await client.connect('AA:01');
    const snap = client.getSnapshot();
    expect(snap.phase).toBe('ready');
    expect(s.nonce).toBe(nonceVec.nonce);
    expect(snap.status).toEqual(decodeStatus(hexToBytes(statusVec.hex)));
    expect(s.deviceName).toBe('M010-Barrier');
    expect(s.authLatencyMs).toBeGreaterThanOrEqual(0);
    const calls = fake().calls;
    const idx = (prefix: string) => calls.findIndex((c) => c.startsWith(prefix));
    expect(idx('onDeviceDisconnected')).toBeGreaterThan(idx('connectToDevice'));
    expect(idx('onDeviceDisconnected')).toBeLessThan(idx('discover'));
    expect(idx('read:' + SESSION_UUID)).toBeGreaterThan(idx('characteristicsForDevice'));
    expect(idx('monitor:')).toBeGreaterThan(idx('read:' + SESSION_UUID));
    expect(idx('read:' + STATUS_UUID)).toBeGreaterThan(idx('read:' + SESSION_UUID));
    expect(calls.find((c) => c.startsWith('connectToDevice'))).toContain('"timeout":100');
    await client.disconnect();
  });

  it('command write is base64 of the exact frame; Status notification is decoded and resolves the command', async () => {
    const { client, fake } = setup();
    const sess = await client.connect('AA:01');
    const lastCounter = client.getSnapshot().status!.lastCounter;
    const expectedCounter = lastCounter + 1;
    fake().onWrite = (b64) => {
      const frame = decodeCommand(Uint8Array.from(atobBytes(b64)));
      const st = {
        ...client.getSnapshot().status!,
        lastResult: CmdResult.COMPLETED,
        lastCounter: frame.counter,
      };
      fake().emitNotification(toBase64(encodeStatus(st)));
    };
    const out = await client.sendCommand(Opcode.RAISE);
    const expectedFrame = encodeCommand({
      opcode: Opcode.RAISE,
      counter: expectedCounter,
      nonce: sess.nonce,
    });
    expect(fake().writes).toEqual([
      { service: SERVICE_UUID, char: COMMAND_UUID, b64: toBase64(expectedFrame) },
    ]);
    expect(out.result).toBe(CmdResult.COMPLETED);
    expect(out.counter).toBe(expectedCounter);
    await client.disconnect();
  });

  it('status notification bytes reach onStatus subscribers; bad base64 payloads do not throw', async () => {
    const { provider, fake } = setup();
    const link = await provider.connect('AA:01');
    const got: Uint8Array[] = [];
    link.onStatus((b) => got.push(b));
    fake().emitNotification(b64OfHex(statusVec.hex));
    fake().monitorListener!(null, { value: '' });
    expect(got).toHaveLength(1);
    expect(Array.from(got[0]!)).toEqual(Array.from(hexToBytes(statusVec.hex)));
    await link.disconnect();
  });

  it('missing characteristic -> PROTOCOL and the connection is cancelled', async () => {
    const { provider, fake } = setup({ chars: [COMMAND_UUID, STATUS_UUID] });
    expect(await codeOf(provider.connect('AA:01'))).toBe('PROTOCOL');
    expect(fake().cancelledConnections).toEqual(['AA:01']);
  });

  it('matches characteristic UUIDs case-insensitively', async () => {
    const { provider } = setup({
      chars: [COMMAND_UUID.toUpperCase(), STATUS_UUID.toUpperCase(), SESSION_UUID],
    });
    const link = await provider.connect('AA:01');
    await link.disconnect();
  });

  it('connect failure maps to CONNECT_FAILED / NOT_FOUND', async () => {
    expect(
      await codeOf(
        setup({ connect: { error: bleError(BLE_ERR.DeviceConnectionFailed) } }).provider.connect('x'),
      ),
    ).toBe('CONNECT_FAILED');
    expect(
      await codeOf(setup({ connect: { error: bleError(BLE_ERR.DeviceNotFound) } }).provider.connect('x')),
    ).toBe('NOT_FOUND');
  });

  it('connect that never resolves -> TIMEOUT and cancels the connection', async () => {
    const { provider, fake } = setup({ connect: 'hang' }, { connectTimeoutMs: 20 });
    expect(await codeOf(provider.connect('AA:01'))).toBe('TIMEOUT');
    expect(fake().cancelledConnections).toContain('AA:01');
  });
});

describe('pairing / authorization mapping (Session read)', () => {
  it.each([
    ['ATT 0x05 (iOS CBATTError 5)', { attErrorCode: ATT.InsufficientAuthentication }],
    ['ATT 0x0F (iOS CBATTError 15)', { attErrorCode: ATT.InsufficientEncryption }],
  ])('iOS %s -> PAIRING_FAILED without retry', async (_n, extra) => {
    setPlatform('ios', '18.0');
    const { client, fake } = setup({
      sessionReads: [{ error: bleError(BLE_ERR.CharacteristicReadFailed, extra) }],
    });
    expect(await codeOf(client.connect('AA:01'))).toBe('PAIRING_FAILED');
    expect(client.getSnapshot().error?.code).toBe('PAIRING_FAILED');
    expect(fake().calls.filter((c) => c.startsWith('read:' + SESSION_UUID))).toHaveLength(1);
    expect(fake().cancelledConnections).toEqual(['AA:01']);
  });

  it('ATT 0x08 -> NOT_AUTHORIZED (paired but not owner)', async () => {
    const { client } = setup({
      sessionReads: [
        {
          error: bleError(BLE_ERR.CharacteristicReadFailed, { attErrorCode: ATT.InsufficientAuthorization }),
        },
      ],
    });
    expect(await codeOf(client.connect('AA:01'))).toBe('NOT_AUTHORIZED');
    expect(client.getSnapshot().phase).toBe('error');
  });

  it('Android: auth error while bonding is retried until the bond completes', async () => {
    setPlatform('android', 34);
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      'android.permission.BLUETOOTH_SCAN': 'granted',
      'android.permission.BLUETOOTH_CONNECT': 'granted',
    } as never);
    const auth = {
      error: bleError(BLE_ERR.CharacteristicReadFailed, { androidErrorCode: ANDROID_GATT.AuthFail }),
    };
    const { client, fake } = setup({ sessionReads: [auth, auth, { value: b64OfHex(nonceVec.hex) }] });
    await client.connect('AA:01');
    expect(client.getSnapshot().phase).toBe('ready');
    expect(fake().calls.filter((c) => c.startsWith('read:' + SESSION_UUID))).toHaveLength(3);
    await client.disconnect();
  });

  it('Android: persistent auth error until the deadline -> PAIRING_FAILED', async () => {
    setPlatform('android', 34);
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      'android.permission.BLUETOOTH_SCAN': 'granted',
      'android.permission.BLUETOOTH_CONNECT': 'granted',
    } as never);
    const auth = {
      error: bleError(BLE_ERR.CharacteristicReadFailed, { attErrorCode: ATT.InsufficientAuthentication }),
    };
    const { client, fake } = setup({ sessionReads: [auth] }, { pairingDeadlineMs: 60 });
    expect(await codeOf(client.connect('AA:01'))).toBe('PAIRING_FAILED');
    expect(fake().calls.filter((c) => c.startsWith('read:' + SESSION_UUID)).length).toBeGreaterThan(1);
  });

  it('Android: ATT 0x08 is never retried', async () => {
    setPlatform('android', 34);
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      'android.permission.BLUETOOTH_SCAN': 'granted',
      'android.permission.BLUETOOTH_CONNECT': 'granted',
    } as never);
    const { client, fake } = setup({
      sessionReads: [
        {
          error: bleError(BLE_ERR.CharacteristicReadFailed, { attErrorCode: ATT.InsufficientAuthorization }),
        },
      ],
    });
    expect(await codeOf(client.connect('AA:01'))).toBe('NOT_AUTHORIZED');
    expect(fake().calls.filter((c) => c.startsWith('read:' + SESSION_UUID))).toHaveLength(1);
  });

  it('disconnect during pairing -> PAIRING_FAILED with the enrollment-window message', async () => {
    const { client, fake } = setup({ sessionReads: ['hang'] });
    const p = client.connect('AA:01').catch((e: TransportError) => e);
    await new Promise((r) => setTimeout(r, 10));
    fake().emitDisconnect(bleError(BLE_ERR.DeviceDisconnected));
    const err = (await p) as TransportError;
    expect(err.code).toBe('PAIRING_FAILED');
    expect(err.message).toMatch(/enrollment/i);
    expect(err.message).toMatch(/3 seconds/);
  });

  it('read rejecting with DeviceDisconnected (before the disconnect event) -> PAIRING_FAILED', async () => {
    const { client } = setup({ sessionReads: [{ error: bleError(BLE_ERR.DeviceDisconnected) }] });
    expect(await codeOf(client.connect('AA:01'))).toBe('PAIRING_FAILED');
  });

  it('Session read that never completes -> TIMEOUT after the pairing deadline and cancels the transaction', async () => {
    const { client, fake } = setup({ sessionReads: ['hang'] }, { pairingDeadlineMs: 30 });
    expect(await codeOf(client.connect('AA:01'))).toBe('TIMEOUT');
    expect(fake().cancelledTransactions.length).toBe(1);
  });
});

describe('link loss', () => {
  it('unexpected disconnect after ready -> BarrierClient phase disconnected + LINK_LOST', async () => {
    const { client, fake } = setup();
    await client.connect('AA:01');
    fake().emitDisconnect(bleError(BLE_ERR.DeviceDisconnected));
    const snap = client.getSnapshot();
    expect(snap.phase).toBe('disconnected');
    expect(snap.error?.code).toBe('LINK_LOST');
    expect(snap.session).toBeNull();
  });

  it('our own disconnect() does not report LINK_LOST, is idempotent, and cancels the connection once', async () => {
    const { client, fake } = setup();
    await client.connect('AA:01');
    await client.disconnect();
    fake().disconnectListener?.(null, null); // ble-plx reports null error for cancelDeviceConnection
    await client.disconnect();
    const snap = client.getSnapshot();
    expect(snap.phase).toBe('idle');
    expect(snap.error).toBeNull();
    expect(fake().cancelledConnections).toEqual(['AA:01']);
    expect(fake().monitorRemoved).toBe(true);
  });

  it('onDisconnected fires once per subscriber; late subscriber is told asynchronously', async () => {
    const { provider, fake } = setup();
    const link = await provider.connect('AA:01');
    const cb = jest.fn();
    link.onDisconnected(cb);
    fake().disconnectListener!(bleError(BLE_ERR.DeviceDisconnected), null);
    fake().disconnectListener?.(bleError(BLE_ERR.DeviceDisconnected), null);
    expect(cb).toHaveBeenCalledTimes(1);
    const late = jest.fn();
    link.onDisconnected(late);
    await Promise.resolve();
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('operations after loss fail with LINK_LOST; after our disconnect with NOT_CONNECTED', async () => {
    const { provider, fake } = setup();
    const link = await provider.connect('AA:01');
    fake().emitDisconnect();
    expect(await codeOf(link.readStatus())).toBe('LINK_LOST');
    const l2 = await setup().provider.connect('AA:02');
    await l2.disconnect();
    expect(await codeOf(l2.readStatus())).toBe('NOT_CONNECTED');
  });

  it('status monitor failure (not a disconnect) is surfaced as link loss and cancels the connection', async () => {
    const { client, fake } = setup({ monitorError: bleError(BLE_ERR.CharacteristicNotifyChangeFailed) });
    await client.connect('AA:01').catch(() => undefined);
    await new Promise((r) => setTimeout(r, 10));
    expect(fake().cancelledConnections).toContain('AA:01');
  });

  it('monitor errors after our own disconnect are ignored', async () => {
    const { provider, fake } = setup();
    const link = await provider.connect('AA:01');
    const lost = jest.fn();
    link.onDisconnected(lost);
    link.onStatus(() => {});
    const monitor = fake().monitorListener!;
    await link.disconnect();
    monitor(bleError(BLE_ERR.CharacteristicNotifyChangeFailed), null);
    monitor(bleError(BLE_ERR.OperationCancelled), null);
    expect(lost).not.toHaveBeenCalled();
  });
});

describe('per-operation timeouts', () => {
  it('Status read that hangs -> TIMEOUT, transaction cancelled', async () => {
    const { client, fake } = setup({ statusRead: 'hang' });
    expect(await codeOf(client.connect('AA:01'))).toBe('TIMEOUT');
    expect(fake().cancelledTransactions.length).toBe(1);
  });

  it('Command write that hangs -> TIMEOUT', async () => {
    const { provider } = setup({ write: 'hang' });
    const link = await provider.connect('AA:01');
    expect(
      await codeOf(link.writeCommand(encodeCommand({ opcode: Opcode.STOP, counter: 1, nonce: 1 }))),
    ).toBe('TIMEOUT');
    await link.disconnect();
  });

  it('write rejected with ATT 0x08 -> NOT_AUTHORIZED; wrong frame length -> PROTOCOL', async () => {
    const { provider } = setup({
      write: {
        error: bleError(BLE_ERR.CharacteristicWriteFailed, { attErrorCode: ATT.InsufficientAuthorization }),
      },
    });
    const link = await provider.connect('AA:01');
    const frame = encodeCommand({ opcode: Opcode.RAISE, counter: 1, nonce: 1 });
    expect(await codeOf(link.writeCommand(frame))).toBe('NOT_AUTHORIZED');
    expect(await codeOf(link.writeCommand(new Uint8Array(3)))).toBe('PROTOCOL');
    await link.disconnect();
  });
});

describe('provider lifecycle', () => {
  it('destroy() releases the manager and state subscription', async () => {
    const { provider, fake } = setup();
    await provider.scan(() => {}, 5);
    const m = fake();
    provider.destroy();
    expect(m.destroyed).toBe(true);
    expect(m.stateSubRemoved).toBe(true);
  });

  it('creates a single manager lazily', async () => {
    const { provider } = setup();
    expect(FakeBleManager.last).toBeNull();
    await provider.scan(() => {}, 5);
    const first = FakeBleManager.last;
    await provider.scan(() => {}, 5);
    expect(FakeBleManager.last).toBe(first);
  });
});

describe('mapBleError', () => {
  const cases: [string, object, 'session' | 'status' | 'connect' | 'write', TransportErrorCode][] = [
    ['powered off', { errorCode: BLE_ERR.BluetoothPoweredOff }, 'connect', 'BLUETOOTH_OFF'],
    ['unauthorized', { errorCode: BLE_ERR.BluetoothUnauthorized }, 'connect', 'PERMISSION_DENIED'],
    ['location off', { errorCode: BLE_ERR.LocationServicesDisabled }, 'connect', 'PERMISSION_DENIED'],
    ['ble timeout', { errorCode: BLE_ERR.OperationTimedOut }, 'status', 'TIMEOUT'],
    ['disconnected (status)', { errorCode: BLE_ERR.DeviceDisconnected }, 'status', 'LINK_LOST'],
    ['disconnected (session)', { errorCode: BLE_ERR.DeviceDisconnected }, 'session', 'PAIRING_FAILED'],
    ['disconnected (connect)', { errorCode: BLE_ERR.DeviceDisconnected }, 'connect', 'CONNECT_FAILED'],
    [
      'android 0x8d',
      { errorCode: 402, androidErrorCode: ANDROID_GATT.EncryptedNoMitm },
      'session',
      'PAIRING_FAILED',
    ],
    [
      'android 0x8e',
      { errorCode: 402, androidErrorCode: ANDROID_GATT.NotEncrypted },
      'session',
      'PAIRING_FAILED',
    ],
    ['unknown read error', { errorCode: 402 }, 'status', 'PROTOCOL'],
  ];
  it.each(cases)('%s', (_n, e, ctx, code) => {
    expect(mapBleError(e, ctx).code).toBe(code);
  });

  it('passes TransportError through and wraps plain errors', () => {
    const t = new TransportError('TIMEOUT', 'x');
    expect(mapBleError(t, 'status')).toBe(t);
    expect(mapBleError(new Error('boom'), 'connect').code).toBe('CONNECT_FAILED');
  });

  it('numeric constants match the installed react-native-ble-plx', () => {
    const real = jest.requireActual('react-native-ble-plx/src/BleError');
    const C = real.BleErrorCode;
    expect(BLE_ERR.OperationTimedOut).toBe(C.OperationTimedOut);
    expect(BLE_ERR.OperationCancelled).toBe(C.OperationCancelled);
    expect(BLE_ERR.BluetoothUnsupported).toBe(C.BluetoothUnsupported);
    expect(BLE_ERR.BluetoothUnauthorized).toBe(C.BluetoothUnauthorized);
    expect(BLE_ERR.BluetoothPoweredOff).toBe(C.BluetoothPoweredOff);
    expect(BLE_ERR.DeviceConnectionFailed).toBe(C.DeviceConnectionFailed);
    expect(BLE_ERR.DeviceDisconnected).toBe(C.DeviceDisconnected);
    expect(BLE_ERR.DeviceNotFound).toBe(C.DeviceNotFound);
    expect(BLE_ERR.DeviceNotConnected).toBe(C.DeviceNotConnected);
    expect(BLE_ERR.ServicesDiscoveryFailed).toBe(C.ServicesDiscoveryFailed);
    expect(BLE_ERR.ServiceNotFound).toBe(C.ServiceNotFound);
    expect(BLE_ERR.CharacteristicWriteFailed).toBe(C.CharacteristicWriteFailed);
    expect(BLE_ERR.CharacteristicReadFailed).toBe(C.CharacteristicReadFailed);
    expect(BLE_ERR.CharacteristicNotifyChangeFailed).toBe(C.CharacteristicNotifyChangeFailed);
    expect(BLE_ERR.CharacteristicNotFound).toBe(C.CharacteristicNotFound);
    expect(BLE_ERR.ScanStartFailed).toBe(C.ScanStartFailed);
    expect(BLE_ERR.LocationServicesDisabled).toBe(C.LocationServicesDisabled);
    expect(ATT.InsufficientAuthentication).toBe(real.BleATTErrorCode.InsufficientAuthentication);
    expect(ATT.InsufficientAuthorization).toBe(real.BleATTErrorCode.InsufficientAuthorization);
    expect(ATT.InsufficientEncryption).toBe(real.BleATTErrorCode.InsufficientEncryption);
    expect(ANDROID_GATT.AuthFail).toBe(real.BleAndroidErrorCode.AuthFail);
    expect(ANDROID_GATT.EncryptedNoMitm).toBe(real.BleAndroidErrorCode.EncrypedNoMitm);
    expect(ANDROID_GATT.NotEncrypted).toBe(real.BleAndroidErrorCode.NotEncrypted);
  });
});

function atobBytes(b64: string): number[] {
  return Array.from(Buffer.from(b64, 'base64'));
}
