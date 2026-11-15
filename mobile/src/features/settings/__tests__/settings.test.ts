import { chooseTransport, forgetBarrier } from '../actions';
import { registerTap, initialSecretTap } from '../secretTap';
import { appVersionInfo } from '../appInfo';
import { DEFAULT_SETTINGS, settingsStore } from '../../../store/settings';
import { getTransport } from '../../../store/transport';
import { memoryCounterStore } from '../../../transport/counter';
import { createSimTransport } from '../../../transport/SimTransport';
import { kv } from '../../../utils/kv';

jest.mock('../../../transport/ble/BleTransport', () => {
  const { createSimTransport: mk } = jest.requireActual('../../../transport/SimTransport');
  return {
    createBleTransport: () => {
      const t = mk().transport;
      Object.defineProperty(t, 'kind', { value: 'ble' });
      return t;
    },
  };
});

beforeEach(() => settingsStore.set({ ...DEFAULT_SETTINGS, loaded: true }));

describe('transport toggle', () => {
  it('persists and switches the active transport', async () => {
    expect(chooseTransport('ble', true)).toBe(true);
    expect(settingsStore.get().transport).toBe('ble');
    expect(getTransport().kind).toBe('ble');
    const raw = await kv.get('m010.settings.v1');
    expect(JSON.parse(raw ?? '{}').transport).toBe('ble');
    expect(chooseTransport('sim', true)).toBe(true);
    expect(getTransport().kind).toBe('sim');
    expect(settingsStore.get().transport).toBe('sim');
  });
  it('refuses Bluetooth where unsupported (web)', () => {
    expect(chooseTransport('ble', false)).toBe(false);
    expect(settingsStore.get().transport).toBe('sim');
  });
});

describe('forget barrier', () => {
  it('clears the stored counter and the remembered device', async () => {
    const counters = memoryCounterStore({ 'SIM-1': 42, other: 7 });
    const { transport } = createSimTransport({ counters });
    settingsStore.set({ lastDeviceId: 'SIM-1', lastDeviceName: 'M010-Barrier' });
    await forgetBarrier(transport, 'SIM-1');
    expect(counters.dump()).toEqual({ other: 7 });
    expect(settingsStore.get().lastDeviceId).toBeNull();
    expect(settingsStore.get().lastDeviceName).toBeNull();
  });
  it('still clears the remembered device when none is known', async () => {
    const { transport } = createSimTransport();
    settingsStore.set({ lastDeviceName: 'x' });
    await forgetBarrier(transport, null);
    expect(settingsStore.get().lastDeviceName).toBeNull();
  });
});

describe('secret tap', () => {
  const run = (times: number[]) => {
    let st = initialSecretTap;
    let fired = 0;
    for (const t of times) {
      const r = registerTap(st, t);
      st = r.state;
      if (r.fired) fired++;
    }
    return fired;
  };
  it('fires on the 5th tap inside 3 s', () => {
    expect(run([0, 500, 1000, 1500, 2000])).toBe(1);
    expect(run([0, 500, 1000, 1500])).toBe(0);
  });
  it('does not fire when taps are spread out', () => {
    expect(run([0, 1000, 2000, 3000, 4000, 5000, 6000])).toBe(0);
  });
  it('window is 3000 ms inclusive; 3001 ms misses', () => {
    expect(run([0, 100, 200, 300, 3000])).toBe(1);
    expect(run([0, 100, 200, 300, 3001])).toBe(0);
  });
  it('resets after firing', () => {
    expect(run([0, 1, 2, 3, 4, 5, 6, 7, 8])).toBe(1);
    expect(run([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(2);
  });
});

describe('app info', () => {
  it('reads version and build from config with fallbacks', () => {
    expect(appVersionInfo({ expoConfig: { version: '2.1.0', ios: { buildNumber: '9' } } })).toEqual({
      version: '2.1.0',
      build: '9',
    });
    expect(appVersionInfo({ expoConfig: { android: { versionCode: 4 } } })).toEqual({
      version: '1.0.0',
      build: '4',
    });
    expect(appVersionInfo({ expoConfig: null })).toEqual({ version: '1.0.0', build: '1' });
  });
});
