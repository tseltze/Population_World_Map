import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CountryPanel } from './country-panel';
import { CountryInfo } from '../services/world-bank-api';

const country = (code: string, popValue: number | null, name = code): CountryInfo => ({
  code,
  name,
  capital: '',
  region: '',
  income: '',
  pop: '',
  gdp: '',
  popValue,
  gdpValue: popValue,
  popYear: null,
  gdpYear: null,
});

describe('CountryPanel', () => {
  let fixture: ComponentFixture<CountryPanel>;
  let component: CountryPanel;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CountryPanel] });
    fixture = TestBed.createComponent(CountryPanel);
    component = fixture.componentInstance;
  });

  it('is created', () => {
    expect(component).toBeTruthy();
  });

  it('sorts by population in both directions, nulls last/first', () => {
    fixture.componentRef.setInput('countries', [
      country('jp', 124),
      country('us', 340),
      country('va', null),
    ]);
    component.sortKey.set('population');

    component.sortDesc.set(true);
    expect(component.sortedCountries().map((c) => c.code)).toEqual(['us', 'jp', 'va']);

    component.sortDesc.set(false);
    expect(component.sortedCountries().map((c) => c.code)).toEqual(['va', 'jp', 'us']);
  });

  it('keeps insertion order for the "recent" sort', () => {
    fixture.componentRef.setInput('countries', [country('us', 340), country('jp', 124)]);
    component.sortKey.set('recent');
    component.sortDesc.set(true);
    expect(component.sortedCountries().map((c) => c.code)).toEqual(['us', 'jp']);
  });

  it('shows the empty state when there are no countries', () => {
    fixture.componentRef.setInput('countries', []);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Click on a country to get started');
  });

  it('emits remove with the country code when × is clicked', () => {
    fixture.componentRef.setInput('countries', [country('us', 1, 'United States')]);
    fixture.detectChanges();
    const spy = jasmine.createSpy('remove');
    component.remove.subscribe(spy);

    (fixture.nativeElement.querySelector('.remove-btn') as HTMLButtonElement).click();

    expect(spy).toHaveBeenCalledWith('us');
  });

  it('toggleSortDir flips direction', () => {
    expect(component.sortDesc()).toBeTrue();
    component.toggleSortDir();
    expect(component.sortDesc()).toBeFalse();
  });
});
