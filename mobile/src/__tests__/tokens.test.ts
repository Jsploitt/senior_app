import { dark, light, type Palette } from '../theme/tokens';

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

const TEXT_PAIRS: [keyof Palette, keyof Palette][] = [
  ['label', 'background'],
  ['label', 'surface'],
  ['secondaryLabel', 'surface'],
  ['secondaryLabel', 'background'],
  ['tint', 'surface'],
  ['tint', 'background'],
  ['onTint', 'tintFill'],
  ['onPositive', 'positiveFill'],
  ['onWarning', 'warningFill'],
  ['onCritical', 'criticalFill'],
  ['positive', 'positiveWash'],
  ['warning', 'warningWash'],
  ['critical', 'criticalWash'],
  ['tint', 'tintWash'],
  ['critical', 'surface'],
  ['positive', 'surface'],
  ['warning', 'surface'],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s palette meets WCAG AA', (_n, p) => {
  it.each(TEXT_PAIRS)('%s on %s >= 4.5:1', (fg, bg) => {
    expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it('tertiary label >= 3:1 (large/non-essential only)', () => {
    expect(contrast(p.tertiaryLabel, p.surface)).toBeGreaterThanOrEqual(3);
  });
});
