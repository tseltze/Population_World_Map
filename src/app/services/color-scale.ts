// Color helpers for the choropleth map.

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function rgbToHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

/** Linear interpolation between two hex colors. t is clamped to [0, 1]. */
export function lerpColor(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const k = Math.min(1, Math.max(0, t));
  return rgbToHex([
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ]);
}

export const NO_DATA_COLOR = '#d9d9d9';

// Sequential ramp endpoints (light -> dark blue).
const RAMP_FROM = '#deebf7';
const RAMP_TO = '#08519c';

export function sequentialColor(t: number): string {
  return lerpColor(RAMP_FROM, RAMP_TO, t);
}

/** A CSS gradient string matching the sequential ramp, for the legend bar. */
export function rampGradient(): string {
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => sequentialColor(t));
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

export interface LogScale {
  color: (value: number | null) => string;
  min: number;
  max: number;
}

/** Builds a log-scaled color function over the given values (handles skew). */
export function buildLogScale(values: number[]): LogScale {
  const positive = values.filter((v) => v > 0);
  const logs = positive.map((v) => Math.log10(v));
  const lo = logs.length ? Math.min(...logs) : 0;
  const hi = logs.length ? Math.max(...logs) : 1;
  const span = hi - lo || 1;
  return {
    min: positive.length ? Math.min(...positive) : 0,
    max: positive.length ? Math.max(...positive) : 0,
    color: (value) => {
      if (value == null || value <= 0) {
        return NO_DATA_COLOR;
      }
      return sequentialColor((Math.log10(value) - lo) / span);
    },
  };
}

// Income-level categorical palette, ordered high -> low.
export const INCOME_LEVELS: ReadonlyArray<{ label: string; color: string }> = [
  { label: 'High income', color: '#08519c' },
  { label: 'Upper middle income', color: '#3182bd' },
  { label: 'Lower middle income', color: '#6baed6' },
  { label: 'Low income', color: '#bdd7e7' },
];

export function incomeColor(level: string): string {
  return INCOME_LEVELS.find((l) => l.label === level)?.color ?? NO_DATA_COLOR;
}
