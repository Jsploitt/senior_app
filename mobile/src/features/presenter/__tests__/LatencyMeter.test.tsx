import { render, screen } from '@testing-library/react-native';
import { LatencyMeter } from '../LatencyMeter';
import { SimulatedBadge } from '../SimulatedBadge';

// vector-icons pulls in expo-font/expo-asset native modules that jest does not need here
jest.mock('../../../components/Icon', () => ({ Icon: () => null }));

describe('LatencyMeter', () => {
  it('shows last value, p50, p95, count and the provenance caption', async () => {
    const samples = Array.from({ length: 20 }, (_, i) => (i + 1) * 100); // 0.1 .. 2.0 s
    await render(<LatencyMeter samples={samples} specMs={2000} label="Phone-measured, simulated" />);
    expect(screen.getByText('2.00 s', { exact: true })).toBeTruthy(); // last
    expect(screen.getByText('1.00 s')).toBeTruthy(); // p50
    expect(screen.getByText('1.90 s')).toBeTruthy(); // p95
    expect(screen.getByText('20')).toBeTruthy();
    expect(screen.getByText('Phone-measured, simulated')).toBeTruthy();
    expect(screen.getByText('2.0 s spec')).toBeTruthy();
    const meter = screen.getByTestId('latency-meter');
    expect(meter.props.accessibilityLabel).toContain('95th percentile 1.90 s');
    expect(meter.props.accessibilityLabel).toContain('0 of 20 over the 2.0 s line');
  });

  it('reports samples over the spec line', async () => {
    await render(<LatencyMeter samples={[500, 2500, 3000]} specMs={2000} label="x" />);
    expect(screen.getByTestId('latency-meter').props.accessibilityLabel).toContain(
      '2 of 3 over the 2.0 s line',
    );
  });

  it('handles no samples', async () => {
    await render(<LatencyMeter samples={[]} specMs={2000} label="Phone-measured, simulated" />);
    expect(screen.getByTestId('latency-meter').props.accessibilityLabel).toContain('No connections yet');
  });
});

describe('SimulatedBadge', () => {
  it('is labelled for assistive tech', async () => {
    await render(<SimulatedBadge />);
    expect(screen.getByText('SIMULATED')).toBeTruthy();
    expect(screen.getByTestId('simulated-badge').props.accessibilityLabel).toMatch(/simulation/i);
  });
});
