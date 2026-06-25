import { buildLogScale, incomeColor, rampGradient, NO_DATA_COLOR, INCOME_LEVELS } from './color-scale';

// The chosen sequential ramp endpoints — the public visual contract.
const RAMP_START = '#deebf7';
const RAMP_END = '#08519c';

describe('color-scale', () => {
  describe('buildLogScale', () => {
    it('exposes the raw min and max of the domain', () => {
      const scale = buildLogScale([1000, 10, 100]);
      expect(scale.min).toBe(10);
      expect(scale.max).toBe(1000);
    });

    it('maps the smallest value to the ramp start and the largest to the end', () => {
      const scale = buildLogScale([10, 1000]);
      expect(scale.color(10)).toBe(RAMP_START);
      expect(scale.color(1000)).toBe(RAMP_END);
    });

    it('places a mid-domain value strictly between the endpoints', () => {
      const mid = buildLogScale([10, 1000]).color(100);
      expect(mid).toMatch(/^#[0-9a-f]{6}$/);
      expect(mid).not.toBe(RAMP_START);
      expect(mid).not.toBe(RAMP_END);
    });

    it('returns the no-data color for null or non-positive values', () => {
      const scale = buildLogScale([1, 100]);
      expect(scale.color(null)).toBe(NO_DATA_COLOR);
      expect(scale.color(0)).toBe(NO_DATA_COLOR);
      expect(scale.color(-5)).toBe(NO_DATA_COLOR);
    });

    it('handles an empty domain without throwing', () => {
      const scale = buildLogScale([]);
      expect(scale.min).toBe(0);
      expect(scale.max).toBe(0);
      expect(scale.color(50)).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe('incomeColor', () => {
    it('maps a known level to its palette color', () => {
      expect(incomeColor('High income')).toBe(INCOME_LEVELS[0].color);
    });

    it('falls back to the no-data color for unknown levels', () => {
      expect(incomeColor('Unknown')).toBe(NO_DATA_COLOR);
    });
  });

  describe('rampGradient', () => {
    it('is a linear gradient spanning the ramp endpoints', () => {
      const gradient = rampGradient();
      expect(gradient).toContain('linear-gradient');
      expect(gradient).toContain(RAMP_START);
      expect(gradient).toContain(RAMP_END);
    });
  });
});
