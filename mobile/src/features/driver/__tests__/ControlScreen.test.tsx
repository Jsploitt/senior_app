import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BarrierState, FaultReason, GuardBit, Opcode } from '@/protocol/constants';
import { updateSettings } from '@/store/settings';
import type { SimTransportHandle } from '@/transport/SimTransport';
import * as haptics from '@/utils/haptics';
import ControlScreen from '../ControlScreen';
import { advance, connectedSim, drive, putInState } from '../testHarness';

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
  getSim: () => mockHandle,
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
// expo-asset (peer of expo-font) is not installed in this workspace; icons are not under test
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../reanimatedMock'));
jest.mock('@/utils/haptics', () => ({ tap: jest.fn(), impact: jest.fn(), notify: jest.fn() }));

jest.useFakeTimers();

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function mount() {
  return await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ControlScreen />
    </SafeAreaProvider>,
  );
}

const enabled = (id: string) => screen.getByTestId(id).props.accessibilityState?.disabled === false;

beforeEach(() => {
  jest.clearAllMocks();
  updateSettings({ lastDeviceId: null, lastDeviceName: null });
});
afterEach(() => {
  mockHandle?.device.dispose();
});

describe('Control screen: disconnected', () => {
  it('shows the empty state and opens /connect', async () => {
    const { createSimTransport } = jest.requireActual('@/transport/SimTransport');
    mockHandle = createSimTransport();
    await mount();
    expect(screen.getByText('No barrier connected')).toBeTruthy();
    expect(screen.getByTestId('control-title').props.children).toBe('Barrier');
    expect(screen.getByTestId('local-only-chip')).toBeTruthy();
    expect(screen.getByTestId('simulated-badge')).toBeTruthy();
    expect(screen.queryByTestId('control-pad')).toBeNull();
    await fireEvent.press(screen.getByTestId('btn-find'));
    expect(router.push).toHaveBeenCalledWith('/connect');
  });
});

describe('Control screen: button enablement per state', () => {
  // state -> [lower, raise, stop]
  const table: [string, BarrierState, boolean, boolean, boolean][] = [
    ['UNKNOWN', BarrierState.UNKNOWN, true, false, true],
    ['RAISED', BarrierState.RAISED, true, false, true],
    ['LOWERED', BarrierState.LOWERED, false, true, true],
    ['RAISING', BarrierState.RAISING, false, false, true],
    ['LOWERING', BarrierState.LOWERING, false, false, true],
    ['STOPPED', BarrierState.STOPPED, true, true, true],
    ['FAULT', BarrierState.FAULT, false, false, true],
  ];
  it.each(table)('%s', async (_n, state, lower, raise, stop) => {
    mockHandle = await connectedSim();
    await putInState(mockHandle, state);
    await mount();
    expect(mockHandle.transport.getSnapshot().status?.state).toBe(state);
    expect(enabled('btn-lower')).toBe(lower);
    expect(enabled('btn-raise')).toBe(raise);
    expect(enabled('btn-stop')).toBe(stop);
    expect(screen.getByTestId('hero')).toBeTruthy();
    expect(screen.queryByTestId('footnote')).toBeNull(); // no monitored-movement footnote
    // disabled buttons carry the reason as an accessibility hint
    // a one-line reason caption is always shown above the pad when a command is disabled
    if (!raise || !lower) expect(screen.getByTestId('pad-hint')).toBeTruthy();
    else expect(screen.queryByTestId('pad-hint')).toBeNull();
    if (!raise) expect(screen.getByTestId('btn-raise').props.accessibilityHint).toBeTruthy();
    if (!lower) expect(screen.getByTestId('btn-lower').props.accessibilityHint).toBeTruthy();
    if (state === BarrierState.FAULT) expect(screen.getByTestId('fault-card')).toBeTruthy();
    else expect(screen.queryByTestId('fault-card')).toBeNull();
  });

  it('hero is one accessible element labelled "Barrier, <state>"', async () => {
    mockHandle = await connectedSim();
    await putInState(mockHandle, BarrierState.RAISING);
    await mount();
    expect(screen.getByTestId('hero').props.accessibilityLabel).toBe('Barrier, Raising');
    expect(screen.getByTestId('hero').props.accessible).toBe(true);
  });
});

describe('Control screen: commands and banners', () => {
  it('LOWERED -> RAISE -> hero moves, then COMPLETED banner + success haptic', async () => {
    mockHandle = await connectedSim();
    await mount();
    expect(screen.getByTestId('hero').props.accessibilityLabel).toBe('Barrier, Lowered');
    await fireEvent.press(screen.getByTestId('btn-raise'));
    await advance(600);
    expect(haptics.impact).toHaveBeenCalledWith('medium');
    expect(screen.getByTestId('hero').props.accessibilityLabel).toBe('Barrier, Raising');
    expect(enabled('btn-raise')).toBe(false);
    await advance(mockHandle.device.timings.travelMs + 500);
    expect(screen.getByTestId('hero').props.accessibilityLabel).toBe('Barrier, Raised');
    // the hero is the one confirmation: no extra "Barrier is up" toast
    expect(screen.queryByTestId('result-banner')).toBeNull();
    expect(haptics.notify).toHaveBeenCalledWith('success');
  });

  it('guard reject expands one row per set bit and fires the warning haptic', async () => {
    mockHandle = await connectedSim();
    mockHandle.device.setSensors({ zoneClear: false });
    await advance(300);
    await mount();
    // device is LOWERED + zone blocked: RAISE is enabled client-side, the firmware rejects it
    expect(screen.getByText('Zone blocked')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('btn-raise'));
    await advance(400);
    expect(screen.getByText("Can't move right now")).toBeTruthy();
    expect(screen.getByTestId(`guard-row-${GuardBit.ZONE_NOT_CLEAR}`)).toBeTruthy();
    expect(screen.getByText('Something is in the way')).toBeTruthy();
    expect(screen.getAllByTestId(/^guard-row-/)).toHaveLength(1);
    // live block: hero warning line, tinted (not filled) moves, Safety checks link, no pad hint
    expect(screen.getByText('Movement blocked: something is in the way')).toBeTruthy();
    expect(enabled('btn-raise')).toBe(true);
    expect(screen.queryByTestId('pad-hint')).toBeNull();
    await fireEvent.press(screen.getByTestId('banner-safety-checks'));
    expect(router.push).toHaveBeenCalledWith('/guard-details');
    expect(haptics.notify).toHaveBeenCalledWith('warning');
    // guard banners stay until dismissed
    await advance(10_000);
    expect(screen.getByTestId('result-banner')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('banner-dismiss'));
    expect(screen.queryByTestId('result-banner')).toBeNull();
    expect(screen.queryByText('Movement blocked: something is in the way')).toBeNull();
  });

  it('FAULT shows the fault card with the on-site reset instruction and an error haptic', async () => {
    mockHandle = await connectedSim();
    await mount();
    await act(async () => {
      mockHandle.device.injectFault(FaultReason.LIMIT_CONFLICT);
    });
    await advance(300);
    expect(screen.getByTestId('hero-label').props.children).toBe('Fault');
    expect(screen.getByText('Position sensors disagree')).toBeTruthy();
    expect(screen.getByText(/Hold the unit button for 8 seconds/)).toBeTruthy();
    expect(haptics.notify).toHaveBeenCalledWith('error');
    expect(enabled('btn-stop')).toBe(true);
    // the sensor chip never claims "OK" while a fault is latched; "on-site reset" is said once
    expect(screen.queryByText('Sensors OK')).toBeNull();
    expect(screen.getByText('Sensors: see fault')).toBeTruthy();
    expect(screen.getAllByText(/on-site reset/i)).toHaveLength(1);
  });

  it('STOP while moving sends STOP and reports "Stopped"', async () => {
    mockHandle = await connectedSim();
    await putInState(mockHandle, BarrierState.RAISING);
    await mount();
    const send = jest.spyOn(mockHandle.transport, 'sendCommand');
    await fireEvent.press(screen.getByTestId('btn-stop'));
    await advance(400);
    expect(send).toHaveBeenCalledWith(Opcode.STOP);
    expect(screen.queryByTestId('result-banner')).toBeNull(); // the hero says Stopped
    expect(screen.getByTestId('hero').props.accessibilityLabel).toBe('Barrier, Stopped');
    expect(haptics.impact).toHaveBeenCalledWith('heavy');
    expect(enabled('btn-raise')).toBe(true);
    expect(enabled('btn-lower')).toBe(true);
  });

  it('shows one compact auth line', async () => {
    mockHandle = await connectedSim();
    await mount();
    expect(screen.getByText(/^Signed in \d\.\d\d s · phone-measured$/)).toBeTruthy();
    expect(screen.queryByTestId('auth-latency-note')).toBeNull();
  });

  it('guard chips open the guard details sheet', async () => {
    mockHandle = await connectedSim();
    await mount();
    await fireEvent.press(screen.getByTestId('chip-zone'));
    expect(router.push).toHaveBeenCalledWith('/guard-details');
  });
});

describe('Control screen: link lost', () => {
  it('shows the banner, disables the pad, and Reconnect restores control', async () => {
    mockHandle = await connectedSim();
    updateSettings({ lastDeviceId: mockHandle.device.id, lastDeviceName: mockHandle.device.name });
    await mount();
    await act(async () => {
      mockHandle.device.dropOwner('test drop');
    });
    await advance(100);
    expect(screen.getByTestId('link-lost-banner')).toBeTruthy();
    expect(enabled('btn-stop')).toBe(false);
    expect(enabled('btn-raise')).toBe(false);
    // stale hero: last known state, neutral, with a reason caption above the pad
    expect(screen.getByTestId('hero-label').props.children).toMatch(/^Last known: /);
    expect(screen.getByTestId('hero').props.accessibilityLabel).toMatch(/not live/);
    expect(screen.getByTestId('pad-hint').props.children).toMatch(/offline/);
    // last-known chips are neutral and flagged as not live
    expect(screen.getByTestId('chip-zone').props.accessibilityLabel).toMatch(/last known/);
    await fireEvent.press(screen.getByTestId('btn-reconnect'));
    await drive(Promise.resolve(), 10, 10);
    await advance(3000);
    expect(screen.queryByTestId('link-lost-banner')).toBeNull();
    expect(enabled('btn-stop')).toBe(true);
  });
});
