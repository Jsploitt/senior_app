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
import { BarrierState, MOTION_NOMINAL_MS, type FaultReason } from '@/protocol/constants';
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
  /** @deprecated the hero has one constant size in every state; kept so callers still compile */
  compact?: boolean;
  testID?: string;
  /** link lost: show the last known state dimmed, neutral and frozen (never as live motion) */
  stale?: boolean;
  /** override the one-line detail (defaults to STATE_TEXT) */
  detail?: string;
  /** live guard block (e.g. "Movement blocked: something is in the way"): small amber line */
  warning?: string;
}

/* Canvas geometry (units = pt at scale 1). */
// Tall enough that the arm at ARM_MAX_DEG (80 deg) stays inside the canvas:
// PIVOT_Y - ARM_LEN * sin(80 deg) - ARM_H / 2 = 182 - 167 - 9 = 6 > 0.
const W = 320;
const H = 216;
const GROUND_Y = 202;
const PIVOT_X = 58;
const PIVOT_Y = 182;
/** the scene is drawn at 320x216 and shown at this fraction (~198x134 pt) */
const SCENE_SCALE = 0.62;
const ARM_LEN = 170;
const ARM_H = 18;
const HOUSING = { x: 28, y: PIVOT_Y - 12, w: 60, h: GROUND_Y - (PIVOT_Y - 12) };

function ArmArt({
  ghost,
  fg,
  stripeA,
  stripeB,
  post,
  outline,
}: {
  /** hairline edge so the white segments stay visible on a white (stale) card */
  outline?: string;
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
      {!ghost && outline ? (
        <Rect
          x={0.75}
          y={0.75}
          width={ARM_LEN - 1.5}
          height={ARM_H - 1.5}
          rx={(ARM_H - 1.5) / 2}
          fill="none"
          stroke={outline}
          strokeWidth={1.5}
        />
      ) : null}
    </Svg>
  );
}

function ElapsedLine({ startedAt, color }: { startedAt: number; color: 'secondaryLabel' | 'warning' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setTimeout(() => setNow(Date.now()), 200);
    return () => clearTimeout(id);
  }, [now]);
  const t = useTheme();
  const elapsed = Math.max(0, now - startedAt);
  const e = elapsedText(elapsed);
  const frac = Math.min(0.95, elapsed / MOTION_NOMINAL_MS);
  return (
    <View style={{ alignItems: 'center', marginTop: space.xs }}>
      <Text variant="footnote" color={e.slow ? 'warning' : color} tabular align="center">
        {e.text}
      </Text>
      <View
        style={{
          width: 160,
          height: 4,
          borderRadius: 2,
          marginTop: space.xs,
          backgroundColor: t.c.fill,
          overflow: 'hidden',
        }}
        testID="motion-progress"
      >
        <View
          style={{
            width: `${frac * 100}%`,
            height: '100%',
            backgroundColor: e.slow ? t.c.warning : t.c.moving,
          }}
        />
      </View>
    </View>
  );
}

export function BarrierHero({ state, fault, testID, stale, detail, warning }: BarrierHeroProps) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const { width: winW } = useWindowDimensions();
  const role = stale ? 'neutral' : colorRole(state);
  const fg = ROLE_FG[role];
  const wash = state === null || role === 'neutral' ? t.c.surface : t.c[ROLE_WASH[role]];

  const scale = Math.min(SCENE_SCALE, (winW - 4 * space.l) / W);
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
    if (stale) {
      // link lost: the arm freezes where it is; a moving state is only the last known one
      if (before === null) progress.value = dir ? 0.5 : restProgress(state);
    } else if (dir) {
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
  }, [state, reduce, progress, stale]);

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
  const base = state === null ? 'Not connected' : text!.label;
  const label = stale && state !== null ? `Last known: ${base}` : base;
  // FAULT: the title is the word "Fault", the cause is the subtitle; the on-site reset lives in the
  // fault card only.
  const sub =
    detail ??
    (state === null
      ? 'Connect to see the arm.'
      : stale
        ? 'Not live.'
        : state === BarrierState.FAULT
          ? faultTitle
          : text!.detail);
  // FAULT: the arm position is untrusted, so draw it like UNKNOWN (dashed outline) in the fault tone
  const ghost = state === null || state === BarrierState.UNKNOWN || state === BarrierState.FAULT;

  const washStyle = useAnimatedStyle(
    () => ({ backgroundColor: withTiming(wash, { duration: 300 }) }),
    [wash],
  );

  return (
    <Animated.View
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={
        stale && state !== null
          ? `Barrier, last known ${(text?.label ?? '').toLowerCase()}, not live`
          : heroAccessibilityLabel(state, text?.label ?? '', faultTitle)
      }
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        { borderRadius: radius.xxl, paddingTop: space.m, paddingBottom: space.m },
        washStyle,
      ]}
    >
      <View style={{ width: cw, height: ch }}>
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
            <Rect x={150} y={GROUND_Y + 5} width={4} height={7} rx={2} fill={t.c.separator} />
            <Rect x={290} y={GROUND_Y + 5} width={4} height={7} rx={2} fill={t.c.separator} />
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
                opacity: stale ? 0.55 : 1,
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
              outline={stale ? t.c.secondaryLabel : undefined}
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
              style={[styles.glyph, { left: 146, top: 12 }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Icon name="help-circle-outline" size={34} color={fg} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.textSlot}>
        <View style={styles.labelRow}>
          {state === BarrierState.FAULT && !stale ? <Icon name="warning" size={24} color="critical" /> : null}
          <Text
            variant="title2"
            color={fg}
            align="center"
            style={{ flexShrink: 1 }}
            testID={testID ? `${testID}-label` : undefined}
          >
            {label}
          </Text>
        </View>
        {sub ? (
          <Text variant="subheadline" color="secondaryLabel" align="center" style={{ marginTop: space.xs }}>
            {sub}
          </Text>
        ) : null}
        {isMoving(state) && !stale && !reduce && movingSince !== null ? (
          <ElapsedLine startedAt={movingSince} color="secondaryLabel" />
        ) : warning && !stale ? (
          <View style={styles.warnRow} testID={testID ? `${testID}-warning` : undefined}>
            <Icon name="alert-circle" size={16} color="warning" />
            <Text variant="footnote" color="warning" weight="600" style={{ flexShrink: 1 }}>
              {warning}
            </Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', overflow: 'hidden' },
  /* constant text slot: title + subtitle + one extra line (progress / warning) in every state */
  textSlot: { marginTop: space.s, paddingHorizontal: space.l, alignItems: 'center', minHeight: 88 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  glyph: { position: 'absolute', width: 34, alignItems: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s },
});
