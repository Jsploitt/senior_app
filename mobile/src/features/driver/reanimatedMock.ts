/**
 * Minimal react-native-reanimated stand-in for jest: the native worklets runtime is not
 * available in the jest environment. Test-only; see __tests__ (jest.mock('react-native-reanimated', ...)).
 */
import { View } from 'react-native';

const easing = () => (t: number) => t;
export const Easing = { out: easing, in: easing, inOut: easing, quad: easing, cubic: easing, ease: easing };

export const useSharedValue = <T>(v: T) => ({ value: v });
export const useAnimatedStyle = (fn: () => object) => fn();
export const withTiming = <T>(v: T) => v;
export const cancelAnimation = () => undefined;

export default { View };
