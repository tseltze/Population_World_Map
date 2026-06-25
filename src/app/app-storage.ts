import { CountryInfo } from './services/world-bank-api';

export type ColorMode = 'none' | 'income' | 'population' | 'gdp';

const KEYS = {
  countries: 'wm-countries',
  dark: 'wm-dark',
  metric: 'wm-metric',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode / quota); persistence is best-effort.
  }
}

/** Single typed gateway for the UI preferences we persist across reloads. */
export const AppStorage = {
  getCountries: (): CountryInfo[] => read<CountryInfo[]>(KEYS.countries, []),
  setCountries: (countries: CountryInfo[]): void => write(KEYS.countries, countries),

  getDark: (): boolean => read<boolean>(KEYS.dark, false),
  setDark: (dark: boolean): void => write(KEYS.dark, dark),

  getMetric: (): ColorMode => read<ColorMode>(KEYS.metric, 'none'),
  setMetric: (metric: ColorMode): void => write(KEYS.metric, metric),
};
