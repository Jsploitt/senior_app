import { View } from 'react-native';
import { Text } from '../../components';
import {
  BATTERY_CRITICAL_MV,
  BATTERY_HEALTHY_MIN_MV,
  BATTERY_PLAUSIBLE_MAX_MV,
  BATTERY_PLAUSIBLE_MIN_MV,
} from '../../protocol/constants';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { batteryBand, volts } from './format';

const SPAN = BATTERY_PLAUSIBLE_MAX_MV - BATTERY_PLAUSIBLE_MIN_MV;
/** position (0..100) of a millivolt value on the gauge */
export const gaugePct = (mv: number) =>
  Math.max(0, Math.min(100, ((mv - BATTERY_PLAUSIBLE_MIN_MV) / SPAN) * 100));

const BAND_TEXT = {
  critical: 'Critical, below 11.0 V',
  low: 'Below healthy floor (11.8 V)',
  healthy: 'Healthy',
  implausible: 'Above plausible maximum',
} as const;

/** Horizontal gauge: fill to the reading, ticks at 11.0 V critical / 11.8 V healthy / 15.5 V max. */
export function BatteryGauge({ mv }: { mv: number }) {
  const t = useTheme();
  const band = batteryBand(mv);
  const tone = band === 'healthy' ? 'positive' : band === 'low' ? 'warning' : 'critical';
  const ticks = [
    { mv: BATTERY_CRITICAL_MV, label: `${volts(BATTERY_CRITICAL_MV)} critical` },
    { mv: BATTERY_HEALTHY_MIN_MV, label: `${volts(BATTERY_HEALTHY_MIN_MV)} healthy` },
    { mv: BATTERY_PLAUSIBLE_MAX_MV, label: `${volts(BATTERY_PLAUSIBLE_MAX_MV)} plausible max` },
  ];
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Battery ${volts(mv)}. ${BAND_TEXT[band]}. Thresholds: ${ticks
        .map((x) => x.label)
        .join(', ')}.`}
      accessibilityValue={{
        min: BATTERY_PLAUSIBLE_MIN_MV,
        max: BATTERY_PLAUSIBLE_MAX_MV,
        now: Math.max(BATTERY_PLAUSIBLE_MIN_MV, Math.min(BATTERY_PLAUSIBLE_MAX_MV, mv)),
      }}
      testID="battery-gauge"
    >
      <View style={{ height: 14, justifyContent: 'center' }}>
        <View
          style={{ height: 10, borderRadius: radius.pill, backgroundColor: t.c.fill, overflow: 'hidden' }}
        >
          <View
            style={{
              width: `${gaugePct(mv)}%`,
              height: '100%',
              backgroundColor: t.c[tone],
              borderRadius: radius.pill,
            }}
          />
        </View>
        {ticks.map((x) => (
          <View
            key={x.mv}
            style={{
              position: 'absolute',
              left: `${gaugePct(x.mv)}%`,
              marginLeft: x.mv === BATTERY_PLAUSIBLE_MAX_MV ? -2 : -1,
              width: 2,
              height: 14,
              borderRadius: 1,
              backgroundColor: t.c.label,
              opacity: 0.55,
            }}
          />
        ))}
      </View>
      <View style={{ marginTop: space.s, gap: space.xxs }}>
        {ticks.map((x) => (
          <Text key={x.mv} variant="caption1" color="secondaryLabel" tabular>
            {'| '}
            {x.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
