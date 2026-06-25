import { Component, AfterViewInit, ElementRef, ViewChild, ViewEncapsulation } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { WdbApi, CountryInfo } from './services/wdb-api';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
  encapsulation: ViewEncapsulation.None,
})
export class App implements AfterViewInit {
  // The map SVG is injected imperatively, so we hold a direct reference to its host.
  @ViewChild('worldMap', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private parsedSvg?: SVGElement;
  isLoadingSvg = true;
  svgError = '';

  countries: CountryInfo[] = [];
  selectedCountry = '';
  isLoadingData = false;
  dataError = '';

  constructor(
    private http: HttpClient,
    private wdbApi: WdbApi,
  ) {}

  // Lifecycle Hooks
  ngAfterViewInit(): void {
    // The host div is static in the template, so it is already available here.
    this.loadSvg();
  }

  // Loading and Rendering Map
  private async loadSvg(): Promise<void> {
    this.isLoadingSvg = true;
    this.svgError = '';
    try {
      const svgContent = await firstValueFrom(
        this.http.get('assets/map-image.svg', { responseType: 'text' }),
      );
      this.renderSvg(svgContent);
    } catch (error) {
      console.error('Error loading SVG:', error);
      this.svgError = 'The map could not be loaded. Please refresh the page.';
    } finally {
      this.isLoadingSvg = false;
    }
  }

  private renderSvg(svgContent: string): void {
    const container = this.mapContainer.nativeElement;
    container.innerHTML = '';
    const doc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
    const svg = doc.documentElement as unknown as SVGElement;
    container.appendChild(svg);
    this.parsedSvg = svg;
    this.setupMap();
  }

  // Setting Up Map
  private setupMap(): void {
    const paths = this.parsedSvg!.querySelectorAll<SVGPathElement>('path');

    paths.forEach((path) => {
      const name = path.getAttribute('name');

      // Make each country focusable and announce its name to screen readers.
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      if (name) {
        path.setAttribute('aria-label', name);
      }

      // Hover styling is handled in CSS; here we only wire selection.
      path.addEventListener('click', () => this.selectCountry(path.id, name));
      path.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.selectCountry(path.id, name);
        }
      });
    });
  }

  // Selection
  private selectCountry(id: string, name: string | null): void {
    this.selectedCountry = id;
    this.updateSelection();
    this.loadInfo(id, name);
  }

  private updateSelection(): void {
    this.parsedSvg?.querySelectorAll('path').forEach((path) => {
      path.classList.toggle('selected', path.id === this.selectedCountry);
    });
  }

  // Data loading
  private async loadInfo(countryId: string, name: string | null): Promise<void> {
    const label = name ?? 'this territory';
    this.isLoadingData = true;
    this.dataError = '';
    try {
      const info = await this.wdbApi.getCountryInfo(countryId);
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
    const existingIndex = this.countries.findIndex((c) => c.name === country.name);
    if (existingIndex >= 0) {
      this.countries[existingIndex] = country;
    } else {
      this.countries.unshift(country);
    }
  }

  removeCountry(name: string): void {
    this.countries = this.countries.filter((c) => c.name !== name);
  }
}
