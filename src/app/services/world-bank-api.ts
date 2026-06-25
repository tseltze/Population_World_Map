import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, retry, timeout } from 'rxjs';
import { formatCurrency, formatCount } from '../format';

export interface CountryInfo {
  code: string;
  name: string;
  capital: string;
  region: string;
  income: string;
  pop: string;
  gdp: string;
  popValue: number | null;
  gdpValue: number | null;
  popYear: string | null;
  gdpYear: string | null;
}

export interface MetricPoint {
  value: number;
  year: string;
}

export type Metric = 'population' | 'gdp';

// World Bank indicator codes are an implementation detail: callers ask for a
// Metric, not a code.
const INDICATORS: Record<Metric, string> = {
  population: 'SP.POP.TOTL',
  gdp: 'NY.GDP.PCAP.CD',
};

interface WbNamedValue {
  id: string;
  value: string;
}

interface WbCountry {
  id: string;
  iso2Code: string;
  name: string;
  capitalCity: string;
  region: WbNamedValue;
  incomeLevel: WbNamedValue;
}

interface WbIndicatorEntry {
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
}

// The API always responds with [metadata, data[] | null].
type WbResponse<T> = [unknown, T[] | null];

interface StoreEntry<T> {
  ts: number;
  data: T;
}

const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

@Injectable({
  providedIn: 'root'
})
export class WorldBankApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://api.worldbank.org/v2';

  // Promise caches double as in-memory caches and de-duplicate in-flight
  // requests: a pending promise is reused until it resolves.
  private readonly infoCache = new Map<string, Promise<CountryInfo | null>>();
  private readonly metricCache = new Map<string, Promise<Map<string, MetricPoint>>>();
  private incomeCache?: Promise<Map<string, string>>;

  /**
   * Returns combined World Bank data for a single map country id, or null when
   * the id has no matching country (e.g. a composite territory like "um-fq").
   * Results are de-duplicated and cached (memory + localStorage).
   */
  getCountryInfo(countryId: string): Promise<CountryInfo | null> {
    const code = this.getCountryCode(countryId);
    if (!code) {
      return Promise.resolve(null);
    }
    const key = code.toLowerCase();

    const inflight = this.infoCache.get(key);
    if (inflight) {
      return inflight;
    }

    const stored = this.readStore<CountryInfo | null>(`wm-info-${key}`);
    if (stored) {
      const resolved = Promise.resolve(stored.data);
      this.infoCache.set(key, resolved);
      return resolved;
    }

    const request = this.fetchCountryInfo(code, key).catch((error) => {
      this.infoCache.delete(key); // allow a later retry
      const stale = this.readStale<CountryInfo | null>(`wm-info-${key}`);
      if (stale) {
        return stale.data; // prefer stale data over surfacing the error
      }
      throw error;
    });
    this.infoCache.set(key, request);
    return request;
  }

  private async fetchCountryInfo(code: string, key: string): Promise<CountryInfo | null> {
    const [basic, population, gdp] = await Promise.all([
      this.fetchCountryBasic(code),
      this.fetchLatestIndicator(code, INDICATORS.population),
      this.fetchLatestIndicator(code, INDICATORS.gdp),
    ]);
    const info = this.parseCountryData(key, basic, population, gdp);
    this.writeStore(`wm-info-${key}`, info);
    return info;
  }

  private async fetchCountryBasic(code: string): Promise<WbCountry | null> {
    const url = `${this.baseUrl}/country/${code}?format=json&per_page=1`;
    const res = await this.get<WbResponse<WbCountry>>(url);
    return res?.[1]?.[0] ?? null;
  }

  /**
   * Returns the most recent non-empty value for an indicator. `mrnev=1` makes
   * the API return just that single row, keeping payloads tiny.
   */
  private async fetchLatestIndicator(code: string, indicator: string): Promise<MetricPoint | null> {
    const url = `${this.baseUrl}/country/${code}/indicator/${indicator}?format=json&mrnev=1`;
    const res = await this.get<WbResponse<WbIndicatorEntry>>(url);
    const entry = res?.[1]?.find((e) => e.value != null);
    return entry ? { value: entry.value as number, year: entry.date } : null;
  }

  private parseCountryData(
    code: string,
    basic: WbCountry | null,
    population: MetricPoint | null,
    gdp: MetricPoint | null,
  ): CountryInfo | null {
    // The country endpoint returns aggregate/region placeholders for codes that
    // are not real countries; treat those as "no data".
    if (!basic || !basic.name || basic.region?.value === 'Aggregates') {
      return null;
    }
    return {
      code,
      name: basic.name,
      capital: basic.capitalCity || 'Unknown',
      region: basic.region?.value || 'Unknown',
      income: basic.incomeLevel?.value || 'Unknown',
      pop: formatCount(population?.value ?? null),
      gdp: formatCurrency(gdp?.value ?? null),
      popValue: population?.value ?? null,
      gdpValue: gdp?.value ?? null,
      popYear: population?.year ?? null,
      gdpYear: gdp?.year ?? null,
    };
  }

  // --- Bulk data for the choropleth (one request per metric, then cached) ---

  /** Latest value per country (iso2, lowercase) for a supported metric. */
  getMetric(metric: Metric): Promise<Map<string, MetricPoint>> {
    const indicator = INDICATORS[metric];
    const inflight = this.metricCache.get(indicator);
    if (inflight) {
      return inflight;
    }

    const stored = this.readStore<Record<string, MetricPoint>>(`wm-metric-${indicator}`);
    if (stored) {
      const resolved = Promise.resolve(new Map(Object.entries(stored.data)));
      this.metricCache.set(indicator, resolved);
      return resolved;
    }

    const request = this.fetchMetric(indicator).catch((error) => {
      this.metricCache.delete(indicator);
      const stale = this.readStale<Record<string, MetricPoint>>(`wm-metric-${indicator}`);
      if (stale) {
        return new Map(Object.entries(stale.data));
      }
      throw error;
    });
    this.metricCache.set(indicator, request);
    return request;
  }

  private async fetchMetric(indicator: string): Promise<Map<string, MetricPoint>> {
    // mrnev=1 returns the most-recent non-empty value per country in a single
    // page, so there is no pagination to handle and the data is current.
    const url = `${this.baseUrl}/country/all/indicator/${indicator}?format=json&per_page=400&mrnev=1`;
    const res = await this.get<WbResponse<WbIndicatorEntry>>(url);
    const rows = res?.[1] ?? [];

    const map = new Map<string, MetricPoint>();
    const serializable: Record<string, MetricPoint> = {};
    for (const row of rows) {
      if (row.value == null) {
        continue;
      }
      const key = row.country.id.toLowerCase();
      const point: MetricPoint = { value: row.value, year: row.date };
      map.set(key, point);
      serializable[key] = point;
    }

    this.writeStore(`wm-metric-${indicator}`, serializable);
    return map;
  }

  /** Map of iso2 (lowercase) -> income-level label for every country. */
  getIncomeByCountry(): Promise<Map<string, string>> {
    if (this.incomeCache) {
      return this.incomeCache;
    }

    const stored = this.readStore<Record<string, string>>('wm-income');
    if (stored) {
      this.incomeCache = Promise.resolve(new Map(Object.entries(stored.data)));
      return this.incomeCache;
    }

    const request = this.fetchIncome().catch((error) => {
      this.incomeCache = undefined;
      const stale = this.readStale<Record<string, string>>('wm-income');
      if (stale) {
        return new Map(Object.entries(stale.data));
      }
      throw error;
    });
    this.incomeCache = request;
    return request;
  }

  private async fetchIncome(): Promise<Map<string, string>> {
    const url = `${this.baseUrl}/country?format=json&per_page=400`;
    const res = await this.get<WbResponse<WbCountry>>(url);
    const rows = res?.[1] ?? [];

    const map = new Map<string, string>();
    const serializable: Record<string, string> = {};
    for (const c of rows) {
      if (c.region?.value === 'Aggregates' || !c.iso2Code) {
        continue;
      }
      const level = c.incomeLevel?.value ?? 'Unknown';
      map.set(c.iso2Code.toLowerCase(), level);
      serializable[c.iso2Code.toLowerCase()] = level;
    }

    this.writeStore('wm-income', serializable);
    return map;
  }

  /** HTTP GET with a request timeout and one retry for transient failures. */
  private get<T>(url: string): Promise<T> {
    return firstValueFrom(
      this.http.get<T>(url).pipe(
        timeout({ each: REQUEST_TIMEOUT_MS }),
        retry({ count: 1, delay: 500 }),
      ),
    );
  }

  // --- localStorage cache with a TTL (survives reloads) ---

  private readStore<T>(key: string): { data: T } | null {
    const entry = this.readStale<T>(key);
    if (!entry) {
      return null;
    }
    // Expired entries are kept on disk as a stale fallback for failed fetches.
    return Date.now() - entry.ts > CACHE_TTL_MS ? null : { data: entry.data };
  }

  /** Reads cached data ignoring its age — the fallback when a fetch fails. */
  private readStale<T>(key: string): (StoreEntry<T>) | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as StoreEntry<T>) : null;
    } catch {
      return null;
    }
  }

  private writeStore<T>(key: string, data: T): void {
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data } as StoreEntry<T>));
    } catch {
      // Storage may be full or unavailable (private mode); caching is best-effort.
    }
  }

  /**
   * Maps an SVG path id to a World Bank country code, or null if unsupported.
   * The map uses ISO 3166-1 alpha-2 ids (which the API accepts) plus composite
   * territory ids such as "um-fq" that have no country entry.
   */
  private getCountryCode(id: string): string | null {
    const code = id.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
  }
}
