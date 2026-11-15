import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { settingsStore, updateSettings } from '@/store/settings';
import { createSimTransport, type SimTransportHandle } from '@/transport/SimTransport';
import ConnectScreen from '../ConnectScreen';
import GuardDetailsScreen from '../GuardDetailsScreen';
import { advance, connectedSim } from '../testHarness';

let mockHandle: SimTransportHandle;

jest.mock('@/store/transport', () => ({
  useTransport: () => mockHandle.transport,
  useTransportSnapshot: () =>
    jest
      .requireActual<typeof import('react')>('react')
      .useSyncExternalStore(
        mockHandle.transport.subscribe,
        mockHandle.transport.getSnapshot,
        mockHandle.transport.getSnapshot,
      ),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');
jest.mock('@/utils/haptics', () => ({ tap: jest.fn(), impact: jest.fn(), notify: jest.fn() }));

jest.useFakeTimers();

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const wrap = (el: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  updateSettings({ lastDeviceId: null, lastDeviceName: null });
});
afterEach(() => mockHandle?.device.dispose());

describe('Connect modal', () => {
  it('scans, lists the device, connects through the steps and leaves on success', async () => {
    mockHandle = createSimTransport();
    await render(wrap(<ConnectScreen />));
    expect(screen.getByTestId('scanning')).toBeTruthy();
    await advance(1000);
    const row = screen.getByTestId(`device-${mockHandle.device.id}`);
    expect(screen.queryByText('Previously paired')).toBeNull();

    await fireEvent.press(row);
    expect(screen.getByTestId('connect-progress')).toBeTruthy();
    await advance(100); // mid-connect (280 ms connect)
    expect(mockHandle.transport.getSnapshot().phase).toBe('connecting');
    expect(screen.getByTestId('step-connecting').props.accessibilityLabel).toBe('Connecting, in progress');
    await advance(250); // connected, reading Session (pairing phase)
    expect(mockHandle.transport.getSnapshot().phase).toBe('pairing');
    expect(screen.getByTestId('pairing-card')).toBeTruthy();
    expect(screen.getByText(/Your phone will ask for a 6-digit code/)).toBeTruthy();
    expect(screen.getByTestId('step-connecting').props.accessibilityLabel).toBe('Connected, done');
    await advance(600);

    expect(mockHandle.transport.getSnapshot().phase).toBe('ready');
    expect(screen.getByTestId('connect-success')).toBeTruthy();
    expect(screen.getByText(/^Authenticated in \d\.\d\d s$/)).toBeTruthy();
    expect(screen.getByTestId('step-ready').props.accessibilityLabel).toBe('Ready, done');
    expect(settingsStore.get().lastDeviceId).toBe(mockHandle.device.id);
    expect(settingsStore.get().lastDeviceName).toBe('M010-Barrier');

    expect(router.back).not.toHaveBeenCalled();
    await advance(1500);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('tags a previously paired device', async () => {
    mockHandle = createSimTransport();
    updateSettings({ lastDeviceId: mockHandle.device.id });
    await render(wrap(<ConnectScreen />));
    await advance(1000);
    expect(screen.getByText('Previously paired')).toBeTruthy();
  });

  it('maps NOT_AUTHORIZED to the owner copy and offers retry', async () => {
    mockHandle = createSimTransport({ prebonded: false });
    await render(wrap(<ConnectScreen />));
    await advance(1000);
    await fireEvent.press(screen.getByTestId(`device-${mockHandle.device.id}`));
    await advance(3000);
    expect(screen.getByTestId('connect-failure')).toBeTruthy();
    expect(screen.getByText(/paired but isn't an owner/)).toBeTruthy();
    expect(screen.getByTestId('step-owner').props.accessibilityLabel).toBe('Checking owner, waiting');
    expect(screen.getByTestId('step-securing').props.accessibilityLabel).toBe('Securing (pairing), failed');
    expect(settingsStore.get().lastDeviceId).toBeNull();
    expect(router.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('btn-retry'));
    await advance(1000);
    expect(screen.getByTestId('device-list')).toBeTruthy();
  });

  it('maps a failed GATT connect to CONNECT_FAILED copy', async () => {
    mockHandle = createSimTransport();
    await render(wrap(<ConnectScreen />));
    await advance(1000);
    mockHandle.provider.failNextConnect = true;
    await fireEvent.press(screen.getByTestId(`device-${mockHandle.device.id}`));
    await advance(1000);
    expect(screen.getByText(/Couldn't connect to the barrier/)).toBeTruthy();
  });
});

describe('Guard details sheet', () => {
  it('lists every guard bit and highlights the failing ones', async () => {
    mockHandle = await connectedSim();
    mockHandle.device.setSensors({ zoneClear: false });
    await advance(300);
    await render(wrap(<GuardDetailsScreen />));
    for (const bit of [1, 2, 4, 8, 16, 32, 64]) expect(screen.getByTestId(`check-${bit}`)).toBeTruthy();
    expect(screen.getByTestId('check-16').props.accessibilityLabel).toContain('blocking');
    expect(screen.getByTestId('check-8').props.accessibilityLabel).toContain('passing');
  });
});
