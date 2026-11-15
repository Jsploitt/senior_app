/** Latency statistics for the presenter LatencyMeter (pure, unit-tested). */

/**
 * Nearest-rank percentile: the smallest sample such that at least p % of the
 * samples are <= it. Returns null for an empty set.
 */
export function percentile(samples: readonly number[], p: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const clamped = Math.min(100, Math.max(0, p));
  const rank = Math.max(1, Math.ceil((clamped / 100) * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1]!;
}

export interface LatencySummary {
  count: number;
  last: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
  overSpec: number;
}

export function summarize(samples: readonly number[], specMs: number): LatencySummary {
  return {
    count: samples.length,
    last: samples.length ? samples[samples.length - 1]! : null,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    max: samples.length ? Math.max(...samples) : null,
    overSpec: samples.filter((s) => s > specMs).length,
  };
}

export interface HistBin {
  fromMs: number;
  /** exclusive upper edge; Infinity for the overflow bin */
  toMs: number;
  count: number;
}

/** Fixed-width bins [0,w), [w,2w) ... plus one overflow bin >= bins*w. */
export function histogram(samples: readonly number[], binMs: number, bins: number): HistBin[] {
  const out: HistBin[] = [];
  for (let i = 0; i < bins; i++) out.push({ fromMs: i * binMs, toMs: (i + 1) * binMs, count: 0 });
  out.push({ fromMs: bins * binMs, toMs: Infinity, count: 0 });
  for (const s of samples) {
    const idx = Math.min(bins, Math.max(0, Math.floor(s / binMs)));
    out[idx]!.count++;
  }
  return out;
}

export function formatSeconds(ms: number | null, digits = 2): string {
  return ms === null ? '--' : `${(ms / 1000).toFixed(digits)} s`;
}

/** Small deterministic generator (mulberry32) so demos and tests repeat. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Log-normal draw: median * exp(sigma * z), z ~ N(0,1) by Box-Muller. */
export function drawLogNormal(rand: () => number, medianMs: number, sigma: number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return medianMs * Math.exp(sigma * z);
}
