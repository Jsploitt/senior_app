import type { ReactElement } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HealthScreen } from '../HealthScreen';
import { LogScreen } from '../LogScreen';
import { Opcode } from '../../../protocol/constants';
import { appendLog, clearLog } from '../../../store/eventLog';
import { getTransport } from '../../../store/transport';

jest.mock('../logPersistence', () => ({
  initLogPersistence: jest.fn(() => Promise.resolve()),
  flushLogPersistence: jest.fn(() => Promise.resolve()),
}));

// expo-asset (peer of expo-font) is not installed in this checkout; icons are irrelevant here.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

jest.useFakeTimers();

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const wrap = (ui: ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

async function drive<T>(p: Promise<T>, maxMs = 60_000): Promise<T> {
  let done = false;
  let val: T | undefined;
  let err: unknown;
  p.then(
    (v) => {
      done = true;
      val = v;
    },
    (e) => {
      done = true;
      err = e;
    },
  );
  for (let t = 0; t < maxMs && !done; t += 10) await act(() => jest.advanceTimersByTimeAsync(10));
  if (!done) throw new Error('never settled');
  if (err) throw err;
  return val as T;
}

describe('HealthScreen', () => {
  beforeEach(() => clearLog());

  it('shows the empty state with a connect button when disconnected', async () => {
    const onConnect = jest.fn();
    await render(wrap(<HealthScreen onConnect={onConnect} />));
    expect(screen.getByText('Health')).toBeTruthy();
    expect(screen.getByText('Local only')).toBeTruthy();
    expect(screen.getByText('Not connected')).toBeTruthy();
    expect(screen.queryByText('Power')).toBeNull();
    // requirements stay visible, with honest wording
    expect(screen.getByText(/Measured on the board from UART logs, not by the phone/)).toBeTruthy();
    expect(screen.getByText(/tools\/log_parser.py s6/)).toBeTruthy();
    expect(screen.queryByText(/passed/i)).toBeNull();
    await fireEvent.press(screen.getByTestId('health-connect'));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('renders live status against a connected SimTransport', async () => {
    const transport = getTransport();
    const devices = await drive(transport.scan(1000));
    const session = await drive(transport.connect(devices[0]!.id));
    await render(wrap(<HealthScreen onConnect={jest.fn()} />));

    for (const s of ['Barrier', 'Safety interlocks', 'Power', 'Link', 'This session', 'Requirements']) {
      expect(screen.getByText(s)).toBeTruthy();
    }
    expect(screen.getByText('Zone clear')).toBeTruthy();
    expect(screen.getByText('Sensors valid')).toBeTruthy();
    expect(screen.getByText(/MotionAllowed = OwnerAuthorized AND FreshCommand/)).toBeTruthy();
    expect(screen.getByText('LiFePO4 4S, thresholds TBD-EE')).toBeTruthy();
    expect(screen.getByTestId('battery-gauge')).toBeTruthy();
    expect(screen.getByTestId('battery-volts').props.children).toMatch(/^\d+\.\d\d V$/);
    expect(screen.getByText('Owner connected')).toBeTruthy();
    expect(screen.getByText('Simulated')).toBeTruthy();
    expect(screen.getByText(/Phone-measured\. Spec 5 reference is 2\.00 s/)).toBeTruthy();
    expect(screen.getByText((session.authLatencyMs / 1000).toFixed(2) + ' s')).toBeTruthy();
    expect(screen.queryByText(/passed/i)).toBeNull();
    expect(screen.queryByText('Not connected')).toBeNull();

    // heartbeat age ticks up
    expect(screen.getByText(/s ago$/)).toBeTruthy();
    await act(() => jest.advanceTimersByTimeAsync(2500));
    expect(screen.getByText(/s ago$/)).toBeTruthy();
    await act(() => transport.disconnect());
  });

  it('counts commands for this session from the event log', async () => {
    const transport = getTransport();
    const devices = await drive(transport.scan(1000));
    await drive(transport.connect(devices[0]!.id));
    await drive(transport.sendCommand(Opcode.RAISE));
    await render(wrap(<HealthScreen onConnect={jest.fn()} />));
    expect(screen.getByTestId('session-sent').props.accessibilityLabel).toContain('1');
    expect(screen.getByTestId('session-accepted').props.accessibilityLabel).toContain('1');
    expect(screen.getByTestId('session-rejected').props.accessibilityLabel).toContain('0');
    await act(() => transport.disconnect());
  });
});

describe('LogScreen', () => {
  beforeEach(() => clearLog());

  it('shows the empty state and disables actions', async () => {
    await render(wrap(<LogScreen />));
    expect(screen.getByText('No events yet')).toBeTruthy();
    expect(screen.getByTestId('share-csv').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('S5 summary')).toBeTruthy();
    expect(screen.getByText('S6 tallies')).toBeTruthy();
    expect(screen.getByText(/Phone-observed; official S6 score from log_parser\.py s6\./)).toBeTruthy();
  });

  it('lists entries newest first, filters, and shows summaries', async () => {
    const t = Date.now();
    appendLog({ t, kind: 'auth', transport: 'sim', message: 'Owner authorized in 700 ms', latencyMs: 700 });
    appendLog({
      t: t + 1,
      kind: 'command',
      transport: 'sim',
      message: 'RAISE -> ACCEPTED',
      opcode: 'RAISE',
      counter: 3,
      result: 'ACCEPTED',
      latencyMs: 90,
    });
    appendLog({
      t: t + 2,
      kind: 'command',
      transport: 'sim',
      message: 'LOWER -> REJECTED_GUARD',
      opcode: 'LOWER',
      counter: 4,
      result: 'REJECTED_GUARD',
      guardFailMask: 0x10,
    });
    await render(wrap(<LogScreen />));

    expect(screen.getByText('Owner authorized in 700 ms')).toBeTruthy();
    expect(screen.getByText('mask 0x10')).toBeTruthy();
    expect(screen.getByTestId('s5-count').props.accessibilityLabel).toContain('1');
    expect(screen.getByTestId('s5-p50').props.accessibilityLabel).toContain('0.70 s');
    expect(screen.getByTestId('s5-within').props.accessibilityLabel).toContain('100%');
    expect(screen.getByTestId('s6-accepted').props.accessibilityLabel).toContain('1');
    expect(screen.getByTestId('s6-rejected').props.accessibilityLabel).toContain('1');

    await fireEvent.press(screen.getByRole('radio', { name: 'Auth' }));
    expect(screen.getByText('Owner authorized in 700 ms')).toBeTruthy();
    expect(screen.queryByText('RAISE -> ACCEPTED')).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Faults' }));
    expect(screen.getByText('No matching events')).toBeTruthy();
  });
});
