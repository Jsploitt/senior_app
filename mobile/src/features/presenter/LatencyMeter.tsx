import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { formatSeconds, histogram, summarize } from './stats';

export interface LatencyMeterProps {
  /** auth latencies in ms, oldest first */
  samples: number[];
  /** spec line in ms (Spec 5: 2000) */
  specMs: number;
  /** provenance caption, e.g. "Phone-measured, simulated" */
  label: string;
}

const BIN_MS = 250;
const BINS = 10; // 0 .. 2.5 s, plus one overflow bin
const BAR_H = 72;

/** Last value, p50 / p95, and a histogram against the spec line. */
export function LatencyMeter({ samples, specMs, label }: LatencyMeterProps) {
  const t = useTheme();
  const sum = summarize(samples, specMs);
  const bins = histogram(samples, BIN_MS, BINS);
  const slots = bins.length;
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const specPct = Math.min(100, (specMs / BIN_MS / slots) * 100);
  const a11y =
    sum.count === 0
      ? `Auth latency. No connections yet. Spec ${formatSeconds(specMs, 1)}. ${label}.`
      : `Auth latency. Last ${formatSeconds(sum.last)}. Median ${formatSeconds(sum.p50)}. 95th percentile ${formatSeconds(sum.p95)}. ${sum.overSpec} of ${sum.count} over the ${formatSeconds(specMs, 1)} line. ${label}.`;
  return (
    <View testID="latency-meter" accessible accessibilityLabel={a11y} style={styles.wrap}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text variant="caption1" color="secondaryLabel">
            Auth latency, last
          </Text>
          <Text variant="display" tabular style={styles.big}>
            {formatSeconds(sum.last)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="caption1" color="secondaryLabel">
            p50
          </Text>
          <Text variant="title3" tabular>
            {formatSeconds(sum.p50)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="caption1" color="secondaryLabel">
            p95
          </Text>
          <Text variant="title3" tabular color={sum.p95 !== null && sum.p95 > specMs ? 'critical' : 'label'}>
            {formatSeconds(sum.p95)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="caption1" color="secondaryLabel">
            n
          </Text>
          <Text variant="title3" tabular>
            {sum.count}
          </Text>
        </View>
      </View>

      <View style={[styles.chart, { height: BAR_H + 4 }]}>
        <View style={styles.bars}>
          {bins.map((b) => {
            const over = b.fromMs >= specMs;
            return (
              <View key={b.fromMs} style={styles.slot}>
                <View
                  style={{
                    height: b.count === 0 ? 2 : Math.max(6, (b.count / maxCount) * BAR_H),
                    borderRadius: radius.s / 2,
                    backgroundColor: b.count === 0 ? t.c.fill : over ? t.c.critical : t.c.tint,
                  }}
                />
              </View>
            );
          })}
        </View>
        <View
          pointerEvents="none"
          style={[styles.spec, { left: `${specPct}%`, backgroundColor: t.c.critical, height: BAR_H + 4 }]}
        />
      </View>
      <View style={styles.axis}>
        <View style={[styles.axisLeft, { flex: specMs / BIN_MS }]}>
          <Text variant="caption2" color="secondaryLabel">
            0
          </Text>
          <Text variant="caption2" color="critical" weight="700">
            {formatSeconds(specMs, 1)} spec
          </Text>
        </View>
        <View style={[styles.axisRight, { flex: Math.max(1, slots - specMs / BIN_MS) }]}>
          <Text variant="caption2" color="secondaryLabel">
            2.5 s+
          </Text>
        </View>
      </View>
      <Text variant="footnote" color="secondaryLabel" style={styles.caption}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-end', gap: space.l },
  big: { marginTop: -2 },
  stat: { alignItems: 'flex-start', minWidth: 52 },
  chart: { position: 'relative' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: BAR_H + 4 },
  slot: { flex: 1, justifyContent: 'flex-end' },
  spec: { position: 'absolute', top: 0, width: 2, borderRadius: 1 },
  axis: { flexDirection: 'row' },
  axisLeft: { flexDirection: 'row', justifyContent: 'space-between' },
  axisRight: { alignItems: 'flex-end' },
  caption: { marginTop: space.xxs },
});
