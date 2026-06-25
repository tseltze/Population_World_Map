import { Component, OnInit } from '@angular/core';
import { WorldBankApi, CountryInfo } from './services/world-bank-api';
import { AppStorage, ColorMode } from './app-storage';
import { ThemeService } from './theme';
import { WorldMap, CountryOption } from './world-map/world-map';
import { CountryPanel } from './country-panel/country-panel';

/**
 * Shell container: owns app-level state and orchestration, and composes the
 * map and country-panel presentational components.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [WorldMap, CountryPanel],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  colorMode: ColorMode = 'none';
  selectedCode = '';
  countryOptions: CountryOption[] = [];

  countries: CountryInfo[] = [];
  isLoadingData = false;
  dataError = '';
  private lastSelection?: { id: string; name: string | null };

  constructor(
    private worldBank: WorldBankApi,
    private theme: ThemeService,
  ) {}

  ngOnInit(): void {
    this.theme.init();
    this.colorMode = AppStorage.getMetric();
    this.countries = AppStorage.getCountries();
  }

  get darkMode(): boolean {
    return this.theme.isDark;
  }

  onMetricChange(event: Event): void {
    this.colorMode = (event.target as HTMLSelectElement).value as ColorMode;
    AppStorage.setMetric(this.colorMode);
  }

  onOptionsLoaded(options: CountryOption[]): void {
    this.countryOptions = options;
  }

  onCountrySelected(selection: { id: string; name: string | null }): void {
    this.selectedCode = selection.id;
    this.lastSelection = selection;
    this.loadInfo(selection.id, selection.name);
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    const query = input.value.trim().toLowerCase();
    const match = this.countryOptions.find((o) => o.name.toLowerCase() === query);
    if (match) {
      this.onCountrySelected({ id: match.id, name: match.name });
      input.value = '';
    }
  }

  retry(): void {
    if (this.lastSelection) {
      this.loadInfo(this.lastSelection.id, this.lastSelection.name);
    }
  }

  removeCountry(code: string): void {
    this.countries = this.countries.filter((c) => c.code !== code);
    AppStorage.setCountries(this.countries);
  }

  toggleDark(): void {
    this.theme.toggle();
  }

  private async loadInfo(id: string, name: string | null): Promise<void> {
    const label = name ?? 'this territory';
    this.isLoadingData = true;
    this.dataError = '';
    try {
      const info = await this.worldBank.getCountryInfo(id);
      if (info) {
        this.updateCountryList(info);
      } else {
        this.dataError = `No World Bank data is available for ${label}.`;
      }
    } catch (error) {
      console.error('Error fetching country data:', error);
      this.dataError = `Could not load data for ${label}. Please try again.`;
    } finally {
      this.isLoadingData = false;
    }
  }

  private updateCountryList(country: CountryInfo): void {
    // Replace the array reference so the panel's signal input picks up the change.
    const exists = this.countries.some((c) => c.code === country.code);
    this.countries = exists
      ? this.countries.map((c) => (c.code === country.code ? country : c))
      : [country, ...this.countries];
    AppStorage.setCountries(this.countries);
  }
}
