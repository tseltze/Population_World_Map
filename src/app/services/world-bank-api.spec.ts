import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { WorldBankApi } from './world-bank-api';

// The World Bank indicator codes are an implementation detail of the service;
// the tests know them only to assert the outgoing request URLs.
const POP_CODE = 'SP.POP.TOTL';
const GDP_CODE = 'NY.GDP.PCAP.CD';

const country = (over: Record<string, unknown> = {}) => ({
  id: 'USA',
  iso2Code: 'US',
  name: 'United States',
  capitalCity: 'Washington D.C.',
  region: { id: 'NAC', value: 'North America' },
  incomeLevel: { id: 'HIC', value: 'High income' },
  ...over,
});

const point = (id: string, date: string, value: number | null) => ({
  country: { id, value: id },
  countryiso3code: id,
  date,
  value,
});

// The service embeds the query string in the request URL, so requests are
// matched by a substring of the path (the query is also part of req.url).
const hasPath = (fragment: string) => (req: { url: string }) => req.url.includes(fragment);
const basicCountry = (code: string) => hasPath(`/country/${code}?`);
const indicator = (id: string) => hasPath(`/indicator/${id}`);

describe('WorldBankApi', () => {
  let service: WorldBankApi;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WorldBankApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  describe('getCountryInfo', () => {
    it('returns null and makes no request for a non-ISO2 id', async () => {
      const result = await service.getCountryInfo('um-fq');
      expect(result).toBeNull();
      http.expectNone(() => true);
    });

    it('combines country, population and gdp into a CountryInfo', async () => {
      const promise = service.getCountryInfo('us');

      http.expectOne(basicCountry('US')).flush([{}, [country()]]);
      http.expectOne(indicator(POP_CODE)).flush([{}, [point('US', '2024', 340_000_000)]]);
      http.expectOne(indicator(GDP_CODE)).flush([{}, [point('US', '2024', 80_000)]]);

      const info = await promise;
      expect(info).toEqual(jasmine.objectContaining({
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
      }));
    });

    it('requests indicators with mrnev=1', async () => {
      const promise = service.getCountryInfo('us');
      http.expectOne(basicCountry('US')).flush([{}, [country()]]);
      const pop = http.expectOne(indicator(POP_CODE));
      expect(pop.request.url).toContain('mrnev=1');
      pop.flush([{}, [point('US', '2024', 1)]]);
      http.expectOne(indicator(GDP_CODE)).flush([{}, [point('US', '2024', 1)]]);
      await promise;
    });

    it('treats aggregate placeholders as no data', async () => {
      const promise = service.getCountryInfo('eu');
      http.expectOne(basicCountry('EU'))
        .flush([{}, [country({ name: 'European Union', region: { id: 'NA', value: 'Aggregates' } })]]);
      http.expectOne(indicator(POP_CODE)).flush([{}, []]);
      http.expectOne(indicator(GDP_CODE)).flush([{}, []]);
      expect(await promise).toBeNull();
    });

    it('renders missing indicator values as "No data"', async () => {
      const promise = service.getCountryInfo('br');
      http.expectOne(basicCountry('BR'))
        .flush([{}, [country({ id: 'BRA', iso2Code: 'BR', name: 'Brazil' })]]);
      http.expectOne(indicator(POP_CODE)).flush([{}, [point('BR', '2024', null)]]);
      http.expectOne(indicator(GDP_CODE)).flush([{}, null]);

      const info = await promise;
      expect(info?.pop).toBe('No data');
      expect(info?.gdp).toBe('No data');
      expect(info?.popValue).toBeNull();
    });

    it('de-duplicates concurrent requests for the same country', async () => {
      const p1 = service.getCountryInfo('jp');
      const p2 = service.getCountryInfo('jp');

      // If de-dup failed, expectOne below would throw on a second matching request.
      http.expectOne(basicCountry('JP'))
        .flush([{}, [country({ id: 'JPN', iso2Code: 'JP', name: 'Japan' })]]);
      http.expectOne(indicator(POP_CODE)).flush([{}, [point('JP', '2024', 124)]]);
      http.expectOne(indicator(GDP_CODE)).flush([{}, [point('JP', '2024', 33)]]);

      const [a, b] = await Promise.all([p1, p2]);
      expect(a).toBe(b);
    });

    it('serves a repeated call from cache with no further requests', async () => {
      const promise = service.getCountryInfo('jp');
      http.expectOne(basicCountry('JP'))
        .flush([{}, [country({ id: 'JPN', iso2Code: 'JP', name: 'Japan' })]]);
      http.expectOne(indicator(POP_CODE)).flush([{}, [point('JP', '2024', 1)]]);
      http.expectOne(indicator(GDP_CODE)).flush([{}, [point('JP', '2024', 1)]]);
      await promise;

      const again = await service.getCountryInfo('jp');
      http.expectNone(() => true);
      expect(again?.name).toBe('Japan');
    });
  });

  describe('getMetric', () => {
    it('maps the metric to the right indicator and keys values by lowercase iso2', async () => {
      const promise = service.getMetric('gdp');
      const req = http.expectOne(hasPath(`/country/all/indicator/${GDP_CODE}`));
      expect(req.request.url).toContain('mrnev=1');
      req.flush([{}, [
        point('US', '2024', 80_000),
        point('BR', '2023', null),
        point('JP', '2024', 33_000),
      ]]);

      const map = await promise;
      expect(map.get('us')).toEqual({ value: 80_000, year: '2024' });
      expect(map.has('br')).toBeFalse();
      expect(map.get('jp')?.value).toBe(33_000);
    });

    it('requests the population indicator for the population metric', async () => {
      const promise = service.getMetric('population');
      http.expectOne(hasPath(`/country/all/indicator/${POP_CODE}`)).flush([{}, [point('US', '2024', 340)]]);
      expect((await promise).get('us')?.value).toBe(340);
    });
  });

  describe('stale fallback on failure', () => {
    it('serves expired cached data when the network fails (after the retry)', fakeAsync(() => {
      // Seed an expired entry (ts = 0).
      localStorage.setItem(
        `wm-metric-${GDP_CODE}`,
        JSON.stringify({ ts: 0, data: { us: { value: 80_000, year: '2024' } } }),
      );

      let result: Map<string, { value: number; year: string }> | undefined;
      service.getMetric('gdp').then((map) => (result = map));

      const bulk = hasPath(`/country/all/indicator/${GDP_CODE}`);
      http.expectOne(bulk).error(new ProgressEvent('error')); // first attempt
      tick(500); // retry delay
      http.expectOne(bulk).error(new ProgressEvent('error')); // retry also fails
      flushMicrotasks();

      expect(result?.get('us')?.value).toBe(80_000);
    }));
  });

  describe('getIncomeByCountry', () => {
    it('builds an income map and excludes aggregates', async () => {
      const promise = service.getIncomeByCountry();
      http.expectOne(hasPath('/country?')).flush([{}, [
        country(),
        country({ iso2Code: '1A', name: 'Arab World', region: { id: 'NA', value: 'Aggregates' } }),
      ]]);

      const map = await promise;
      expect(map.get('us')).toBe('High income');
      expect(map.has('1a')).toBeFalse();
    });
  });
});
