import { drawLogNormal, formatSeconds, histogram, percentile, seededRandom, summarize } from '../stats';

describe('percentile (nearest rank)', () => {
  it('returns null for no samples', () => {
    expect(percentile([], 50)).toBeNull();
  });
  it('matches hand-computed ranks', () => {
    const s = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(s, 50)).toBe(50); // ceil(0.5*10) = 5th
    expect(percentile(s, 95)).toBe(100); // ceil(9.5) = 10th
    expect(percentile(s, 90)).toBe(90);
    expect(percentile(s, 0)).toBe(10);
    expect(percentile(s, 100)).toBe(100);
  });
  it('does not need sorted input and does not mutate it', () => {
    const s = [300, 100, 200];
    expect(percentile(s, 50)).toBe(200);
    expect(s).toEqual([300, 100, 200]);
  });
  it('single sample is every percentile', () => {
    expect(percentile([42], 5)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
  });
  it('p95 of 20 samples is the 19th value', () => {
    const s = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    expect(percentile(s, 95)).toBe(1900);
    expect(percentile(s, 50)).toBe(1000);
  });
  it('clamps out-of-range p', () => {
    expect(percentile([1, 2, 3], 250)).toBe(3);
    expect(percentile([1, 2, 3], -5)).toBe(1);
  });
});

describe('summarize', () => {
  it('counts samples over the spec line', () => {
    const r = summarize([500, 1800, 2000, 2100, 3000], 2000);
    expect(r).toMatchObject({ count: 5, last: 3000, p50: 2000, max: 3000, overSpec: 2 });
    expect(r.p95).toBe(3000);
  });
  it('is empty-safe', () => {
    expect(summarize([], 2000)).toEqual({
      count: 0,
      last: null,
      p50: null,
      p95: null,
      max: null,
      overSpec: 0,
    });
  });
});

describe('histogram', () => {
  it('bins by width and puts the tail in the overflow bin', () => {
    const h = histogram([0, 249, 250, 999, 1000, 2400, 2500, 9000], 250, 10);
    expect(h).toHaveLength(11);
    expect(h[0]!.count).toBe(2); // 0, 249
    expect(h[1]!.count).toBe(1); // 250
    expect(h[3]!.count).toBe(1); // 999
    expect(h[4]!.count).toBe(1); // 1000
    expect(h[9]!.count).toBe(1); // 2400
    expect(h[10]).toMatchObject({ fromMs: 2500, toMs: Infinity, count: 2 });
    expect(h.reduce((n, b) => n + b.count, 0)).toBe(8);
  });
});

describe('distribution helpers', () => {
  it('seededRandom repeats and stays in [0,1)', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    for (let i = 0; i < 50; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('log-normal draws are centred on the median', () => {
    const r = seededRandom(1234);
    const xs = Array.from({ length: 2000 }, () => drawLogNormal(r, 650, 0.35));
    const med = percentile(xs, 50)!;
    expect(med).toBeGreaterThan(600);
    expect(med).toBeLessThan(700);
    expect(Math.min(...xs)).toBeGreaterThan(0);
  });
  it('formats seconds', () => {
    expect(formatSeconds(1234)).toBe('1.23 s');
    expect(formatSeconds(null)).toBe('--');
  });
});
