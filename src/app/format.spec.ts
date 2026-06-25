import { formatCurrency, formatCount } from './format';

describe('format', () => {
  describe('formatCurrency', () => {
    it('renders a grouped USD amount', () => {
      expect(formatCurrency(1_234_567)).toBe('$1,234,567');
    });

    it('rounds to whole units', () => {
      expect(formatCurrency(1234.6)).toBe('$1,235');
    });

    it('renders "No data" for null', () => {
      expect(formatCurrency(null)).toBe('No data');
    });
  });

  describe('formatCount', () => {
    it('renders a grouped integer', () => {
      expect(formatCount(1_234_567)).toBe('1,234,567');
    });

    it('renders "No data" for null', () => {
      expect(formatCount(null)).toBe('No data');
    });
  });
});
