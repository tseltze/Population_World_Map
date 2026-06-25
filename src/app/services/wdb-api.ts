import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface CountryInfo {
  name: string;
  capital: string;
  region: string;
  income: string;
  pop: string;
  gdp: string;
}

@Injectable({
  providedIn: 'root'
})
export class WdbApi {
  private readonly baseUrl = 'https://api.worldbank.org/v2';

  constructor(private http: HttpClient) {}

  /**
   * Returns combined World Bank data for a map country id, or null when the id
   * has no matching country (e.g. a composite territory like "um-fq").
   */
  async getCountryInfo(countryId: string): Promise<CountryInfo | null> {
    const code = this.getCountryCode(countryId);
    if (!code) {
      return null;
    }

    // Independent requests — run them in parallel rather than one after another.
    const [basic, population, gdp] = await Promise.all([
      this.fetchCountryBasic(code),
      this.fetchLatestIndicator(code, 'SP.POP.TOTL'),
      this.fetchLatestIndicator(code, 'NY.GDP.PCAP.CD'),
    ]);

    return this.parseCountryData(basic, population, gdp);
  }

  private async fetchCountryBasic(code: string): Promise<any> {
    const url = `${this.baseUrl}/country/${code}?format=json&per_page=1`;
    const response = await firstValueFrom(this.http.get<any[]>(url));
    return response?.[1]?.[0] ?? null;
  }

  /**
   * Fetches an indicator over a range and returns the most recent non-null
   * value. The API returns results newest-first, so the first populated entry
   * is the latest available data point.
   */
  private async fetchLatestIndicator(code: string, indicator: string): Promise<number | null> {
    const url = `${this.baseUrl}/country/${code}/indicator/${indicator}?format=json&date=2010:2023&per_page=100`;
    const response = await firstValueFrom(this.http.get<any[]>(url));
    const series = response?.[1] as Array<{ value: number | null }> | undefined;
    const latest = series?.find((entry) => entry.value != null);
    return latest?.value ?? null;
  }

  private parseCountryData(basic: any, population: number | null, gdp: number | null): CountryInfo | null {
    // The country endpoint returns aggregate/region placeholders for codes that
    // are not real countries; treat those as "no data".
    if (!basic || !basic.name || basic.region?.value === 'Aggregates') {
      return null;
    }
    return {
      name: basic.name,
      capital: basic.capitalCity || 'Unknown',
      region: basic.region?.value || 'Unknown',
      income: basic.incomeLevel?.value || 'Unknown',
      pop: this.formatNumber(population, 'population'),
      gdp: this.formatNumber(gdp, 'currency'),
    };
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

  private formatNumber(value: number | null, type: 'currency' | 'population'): string {
    if (value == null) {
      return 'No data';
    }
    const rounded = Math.round(value).toLocaleString();
    return type === 'currency' ? `$${rounded}` : rounded;
  }
}
