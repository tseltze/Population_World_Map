import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { CountryInfo } from './services/world-bank-api';

const country = (over: Partial<CountryInfo>): CountryInfo => ({
  code: 'xx',
  name: 'Country',
  capital: '',
  region: '',
  income: '',
  pop: '',
  gdp: '',
  popValue: null,
  gdpValue: null,
  popYear: null,
  gdpYear: null,
  ...over,
});

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => localStorage.clear());

  it('should create the app', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('should render the page title and both panels', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('World Map and Statistics');
    expect(compiled.querySelector('app-world-map')).toBeTruthy();
    expect(compiled.querySelector('app-country-panel')).toBeTruthy();
  });

  it('removeCountry removes the matching code immutably', () => {
    const component = TestBed.createComponent(App).componentInstance;
    const before = [country({ code: 'us' }), country({ code: 'jp' })];
    component.countries = before;

    component.removeCountry('us');

    expect(component.countries.map((c) => c.code)).toEqual(['jp']);
    expect(component.countries).not.toBe(before);
  });

  it('onCountrySelected records the selected code', () => {
    const component = TestBed.createComponent(App).componentInstance;
    component.onCountrySelected({ id: 'br', name: 'Brazil' });
    expect(component.selectedCode).toBe('br');
  });
});
