import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Live "Remove animations" (Android) / reduce-motion setting; false where unsupported. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    try {
      void Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
        .then((v) => {
          if (alive) setReduce(!!v);
        })
        .catch(() => undefined);
      const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => setReduce(!!v));
      return () => {
        alive = false;
        sub?.remove?.();
      };
    } catch {
      return () => {
        alive = false;
      };
    }
  }, []);
  return reduce;
}
