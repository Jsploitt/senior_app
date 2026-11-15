/**
 * BarrierHero: ground-mounted parking-lock arm. The arm angle is a reanimated shared value
 * (UI thread, 60 fps) driven by the FSM state:
 *   LOWERED 0 deg, RAISED ~80 deg, RAISING/LOWERING ease toward ~95 % of travel over
 *   MOTION_NOMINAL_MS and hold until the Status confirms, STOPPED/FAULT freeze, UNKNOWN ghosted.
 * Reduce Motion: no looping or travel animation; the arm jumps to its target.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Polygon, Rect, Circle } from 'react-native-svg';
import { Icon, Text } from '@/components';
import { BarrierState, type FaultReason } from '@/protocol/constants';
import { FAULT_TEXT, STATE_TEXT } from '@/protocol/messages';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import {
  ARM_MAX_DEG,
  colorRole,
  elapsedText,
  heroAccessibilityLabel,
  holdTarget,
  isMoving,
  restProgress,
  ROLE_FG,
  ROLE_WASH,
  travelDuration,
} from './logic';
import { useReduceMotion } from './useReduceMotion';

export interface BarrierHeroProps {
  state: BarrierState | null;
  fault: FaultReason;
  /** compact variant for presenter / small layouts */
  compact?: boolean;
  testID?: string;
  /** dim the illustration (e.g. link lost: last known state) */
  stale?: boolean;
  /** override the one-line detail (defaults to STATE_TEXT) */
  detail?: string;
}

/* Canvas geometry (units = pt at scale 1). */
const W = 320;
const H = 168;
const GROUND_Y = 148;
const PIVOT_X = 58;
const PIVOT_Y = 112;
const ARM_LEN = 220;
const ARM_H = 18;
const HOUSING = { x: 28, y: 100, w: 60, h: GROUND_Y - 100 };

function ArmArt({
  ghost,
  fg,
  stripeA,
  stripeB,
  post,
}: {
  ghost: boolean;
  fg: string;
  stripeA: string;
  stripeB: string;
  post: string;
}) {
  const stripes: number[] = [];
  for (let x = 30; x < ARM_LEN; x += 36) stripes.push(x);
  return (
    <Svg width={ARM_LEN} height={ARM_H} viewBox={`0 0 ${ARM_LEN} ${ARM_H}`}>
      <Defs>
        <ClipPath id="armClip">
          <Rect x={0} y={0} width={ARM_LEN} height={ARM_H} rx={ARM_H / 2} />
        </ClipPath>
      </Defs>
      {ghost ? (
        <Rect
          x={1.5}
          y={1.5}
          width={ARM_LEN - 3}
          height={ARM_H - 3}
          rx={(ARM_H - 3) / 2}
          fill="none"
          stroke={fg}
          strokeWidth={2}
          strokeDasharray="7 6"
        />
      ) : (
        <G clipPath="url(#armClip)">
          <Rect x={0} y={0} width={ARM_LEN} height={ARM_H} fill={stripeA} />
          {stripes.map((x) => (
            <Polygon
              key={x}
              points={`${x},0 ${x + 18},0 ${x + 18 - 10},${ARM_H} ${x - 10},${ARM_H}`}
              fill={stripeB}
            />
          ))}
          <Circle cx={ARM_H / 2} cy={ARM_H / 2} r={ARM_H / 2 - 3} fill={post} />
        </G>
      )}
    </Svg>
  );
}

function ElapsedLine({ startedAt, color }: { startedAt: number; color: 'secondaryLabel' | 'warning' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  const e = elapsedText(Math.max(0, now - startedAt));
  return (
    <Text
      variant="footnote"
      color={e.slow ? 'warning' : color}
      tabular
      align="center"
      style={{ marginTop: space.xs }}
    >
      {e.text}
    </Text>
  );
}

export function BarrierHero({ state, fault, compact, testID, stale, detail }: BarrierHeroProps) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const { width: winW } = useWindowDimensions();
  const role = colorRole(state);
  const fg = ROLE_FG[role];
  const wash = state === null || role === 'neutral' ? t.c.surface : t.c[ROLE_WASH[role]];

  const scale = Math.min(1, (winW - 2 * space.l - 2 * space.l) / W) * (compact ? 0.72 : 1);
  const cw = W * scale;
  const ch = H * scale;

  /* ---------- arm animation ---------- */
  const progress = useSharedValue(restProgress(state));
  const prev = useRef<BarrierState | null>(state);
  const [movingSince, setMovingSince] = useState<number | null>(() => (isMoving(state) ? Date.now() : null));

  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    const dir = state === BarrierState.RAISING ? 'up' : state === BarrierState.LOWERING ? 'down' : null;
    if (before !== state) setMovingSince(dir ? Date.now() : null);

    cancelAnimation(progress);
    if (dir) {
      if (reduce) {
        progress.value = 0.5; // static mid-travel arm, no looping
      } else {
        progress.value = withTiming(holdTarget(dir), {
          duration: travelDuration(progress.value, dir),
          easing: Easing.out(Easing.quad),
        });
      }
    } else if (state === BarrierState.STOPPED || state === BarrierState.FAULT) {
      // freeze at the current angle; with no history (first status) show mid-travel
      if (before === null) progress.value = 0.5;
    } else if (reduce) {
      progress.value = restProgress(state);
    } else {
      progress.value = withTiming(restProgress(state), { duration: 320, easing: Easing.out(Easing.cubic) });
    }
  }, [state, reduce, progress]);

  const armStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-progress.value * ARM_MAX_DEG}deg` }],
  }));

  /* ---------- announcements ---------- */
  const announced = useRef<BarrierState | null>(state);
  useEffect(() => {
    if (announced.current === state) return;
    announced.current = state;
    if (state !== null) {
      try {
        AccessibilityInfo.announceForAccessibility(`Barrier ${STATE_TEXT[state].label.toLowerCase()}`);
      } catch {
        /* not available on this platform */
      }
    }
  }, [state]);

  const text = state === null ? null : STATE_TEXT[state];
  const faultTitle = state === BarrierState.FAULT && fault ? FAULT_TEXT[fault].title : undefined;
  const label = state === null ? 'Not connected' : (faultTitle ?? text!.label);
  const sub =
    detail ??
    (state === null
      ? 'Connect to see the arm.'
      : state === BarrierState.FAULT
        ? 'Needs on-site reset: hold the unit button for 8 seconds.'
        : text!.detail);
  const ghost = state === null || state === BarrierState.UNKNOWN;

  const washStyle = useAnimatedStyle(
    () => ({ backgroundColor: withTiming(wash, { duration: 300 }) }),
    [wash],
  );

  return (
    <Animated.View
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={heroAccessibilityLabel(state, text?.label ?? '', faultTitle)}
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        { borderRadius: radius.xxl, paddingVertical: compact ? space.m : space.xl },
        washStyle,
      ]}
    >
      <View style={{ width: cw, height: ch, opacity: stale ? 0.45 : 1 }}>
        {/* scene: everything drawn at scale 1 then scaled from the top-left corner */}
        <View
          style={{
            width: W,
            height: H,
            transform: [{ scale }],
            transformOrigin: 'top left',
          }}
        >
          <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
            {/* ground */}
            <Rect x={0} y={GROUND_Y} width={W} height={H - GROUND_Y} rx={6} fill={t.c.ground} />
            <Rect x={0} y={GROUND_Y} width={W} height={3} fill={t.c.separator} />
            {/* parking space lines */}
            <Rect x={150} y={GROUND_Y + 8} width={4} height={12} rx={2} fill={t.c.separator} />
            <Rect x={290} y={GROUND_Y + 8} width={4} height={12} rx={2} fill={t.c.separator} />
            {/* housing */}
            <Rect x={HOUSING.x} y={HOUSING.y} width={HOUSING.w} height={HOUSING.h} rx={12} fill={t.c.post} />
            <Rect
              x={HOUSING.x + 8}
              y={HOUSING.y + 8}
              width={HOUSING.w - 16}
              height={6}
              rx={3}
              fill={t.c[fg]}
              opacity={0.9}
            />
          </Svg>
          {/* arm (native-driven rotation about its left end) */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: PIVOT_X - ARM_H / 2,
                top: PIVOT_Y - ARM_H / 2,
                width: ARM_LEN,
                height: ARM_H,
                transformOrigin: `${ARM_H / 2}px ${ARM_H / 2}px`,
              },
              armStyle,
            ]}
          >
            <ArmArt
              ghost={ghost}
              fg={t.c[fg]}
              stripeA={t.c.armStripeA}
              stripeB={t.c.armStripeB}
              post={t.c.post}
            />
          </Animated.View>
          {/* pivot cap */}
          <Svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Circle cx={PIVOT_X} cy={PIVOT_Y} r={9} fill={t.c.post} stroke={t.c.surface} strokeWidth={3} />
          </Svg>
          {/* glyphs */}
          {state === BarrierState.UNKNOWN ? (
            <View
              style={[styles.glyph, { left: 150, top: 18 }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text variant="title1" color={fg} weight="700">
                ?
              </Text>
            </View>
          ) : null}
          {state === BarrierState.FAULT ? (
            <View
              style={[styles.glyph, { left: 146, top: 16 }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Icon name="warning" size={34} color="critical" />
            </View>
          ) : null}
        </View>
      </View>

      <View
        style={{ marginTop: compact ? space.s : space.l, paddingHorizontal: space.l, alignItems: 'center' }}
      >
        <Text
          variant={compact ? 'title2' : 'title1'}
          color={fg}
          align="center"
          testID={testID ? `${testID}-label` : undefined}
        >
          {label}
        </Text>
        <Text variant="subheadline" color="secondaryLabel" align="center" style={{ marginTop: space.xs }}>
          {sub}
        </Text>
        {isMoving(state) && !reduce && movingSince !== null ? (
          <ElapsedLine startedAt={movingSince} color="secondaryLabel" />
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', overflow: 'hidden' },
  glyph: { position: 'absolute', width: 28, alignItems: 'center' },
});
