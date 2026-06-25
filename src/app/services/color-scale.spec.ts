import {
  lerpColor,
  buildLogScale,
  incomeColor,
  sequentialColor,
  rampGradient,
  NO_DATA_COLOR,
  INCOME_LEVELS,
} from './color-scale';

describe('color-scale', () => {
  describe('lerpColor', () => {
    it('returns the endpoints at t=0 and t=1', () => {
      expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000');
      expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff');
    });

    it('interpolates the midpoint', () => {
      expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    });

    it('clamps t outside [0, 1]', () => {
      expect(lerpColor('#000000', '#ffffff', -1)).toBe('#000000');
      expect(lerpColor('#000000', '#ffffff', 2)).toBe('#ffffff');
    });
  });

  describe('buildLogScale', () => {
    it('exposes the raw min and max of the domain', () => {
      const scale = buildLogScale([1000, 10, 100]);
      expect(scale.min).toBe(10);
      expect(scale.max).toBe(1000);
    });

    it('maps the smallest value to the ramp start and the largest to the end', () => {
      const scale = buildLogScale([10, 1000]);
      expect(scale.color(10)).toBe(sequentialColor(0));
      expect(scale.color(1000)).toBe(sequentialColor(1));
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
      expect(gradient).toContain(sequentialColor(0));
      expect(gradient).toContain(sequentialColor(1));
    });
  });
});
