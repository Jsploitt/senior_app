import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import { formatCountdown, remainingMs, ringFraction, spokenCountdown } from './countdown';

/** Enrollment window ring. The ring is the app's own timer; it is not read from the device. */
export function CountdownRing({
  totalMs,
  startedAt,
  now,
  label,
  size = 176,
}: {
  totalMs: number;
  startedAt: number | null;
  now: number;
  label: string;
  size?: number;
}) {
  const t = useTheme();
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const left = remainingMs(totalMs, startedAt, now);
  const frac = ringFraction(totalMs, startedAt, now);
  const expired = startedAt !== null && left === 0;
  const idle = startedAt === null;
  const color = expired ? t.c.critical : idle ? t.c.separator : t.c.tint;
  return (
    <View
      testID="countdown-ring"
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`${label}. ${startedAt === null ? 'Not started' : spokenCountdown(left)}`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.c.fill} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - frac)}
        />
      </Svg>
      <Text variant="display" tabular color={expired ? 'critical' : idle ? 'secondaryLabel' : 'label'}>
        {formatCountdown(left)}
      </Text>
      <Text variant="footnote" color="secondaryLabel">
        {label}
      </Text>
    </View>
  );
}
