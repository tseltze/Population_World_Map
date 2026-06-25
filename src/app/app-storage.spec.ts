import { AppStorage } from './app-storage';
import { CountryInfo } from './services/world-bank-api';

const sample = (over: Partial<CountryInfo> = {}): CountryInfo => ({
  code: 'us',
  name: 'United States',
  capital: 'Washington D.C.',
  region: 'North America',
  income: 'High income',
  pop: '340,000,000',
  gdp: '$80,000',
  popValue: 340_000_000,
  gdpValue: 80_000,
  popYear: '2024',
  gdpYear: '2024',
  ...over,
});

describe('AppStorage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('round-trips the selected countries', () => {
    const countries = [sample(), sample({ code: 'jp', name: 'Japan' })];
    AppStorage.setCountries(countries);
    expect(AppStorage.getCountries()).toEqual(countries);
  });

  it('defaults countries to an empty array', () => {
    expect(AppStorage.getCountries()).toEqual([]);
  });

  it('round-trips dark mode as a boolean', () => {
    AppStorage.setDark(true);
    expect(AppStorage.getDark()).toBeTrue();
    AppStorage.setDark(false);
    expect(AppStorage.getDark()).toBeFalse();
  });

  it('defaults dark mode to false', () => {
    expect(AppStorage.getDark()).toBeFalse();
  });

  it('round-trips the selected metric', () => {
    AppStorage.setMetric('gdp');
    expect(AppStorage.getMetric()).toBe('gdp');
  });

  it('defaults the metric to none', () => {
    expect(AppStorage.getMetric()).toBe('none');
  });

  it('falls back to the default when stored JSON is corrupt', () => {
    localStorage.setItem('wm-countries', '{not valid json');
    expect(AppStorage.getCountries()).toEqual([]);
  });
});
