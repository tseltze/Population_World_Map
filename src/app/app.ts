import { Component, AfterViewInit, ElementRef, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, retry, timeout } from 'rxjs';
import {
  WdbApi,
  CountryInfo,
  MetricPoint,
  POP_INDICATOR,
  GDP_INDICATOR,
} from './services/wdb-api';
import {
  buildLogScale,
  incomeColor,
  rampGradient,
  INCOME_LEVELS,
  NO_DATA_COLOR,
} from './services/color-scale';
import { MapZoomPan } from './map-zoom-pan';

type ColorMode = 'none' | 'income' | 'population' | 'gdp';
type SortKey = 'recent' | 'name' | 'population' | 'gdp';

interface CountryOption {
  id: string;
  name: string;
}

interface Tooltip {
  visible: boolean;
  x: number;
  y: number;
  name: string;
  detail: string;
}

const STORAGE = {
  countries: 'wm-countries',
  dark: 'wm-dark',
  metric: 'wm-metric',
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
  encapsulation: ViewEncapsulation.None,
})
export class App implements OnInit, AfterViewInit {
  // The map SVG is injected imperatively, so we hold a direct reference to its host.
  @ViewChild('worldMap', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private parsedSvg?: SVGElement;
  private zoomPan?: MapZoomPan;

  isLoadingSvg = true;
  svgError = '';

  // Selected country cards
  countries: CountryInfo[] = [];
  selectedCountry = '';
  isLoadingData = false;
  dataError = '';
  private lastSelection?: { id: string; name: string | null };

  // Choropleth
  colorMode: ColorMode = 'none';
  isLoadingMetric = false;
  metricError = '';
  legendType: 'none' | 'continuous' | 'income' = 'none';
  legendMin = '';
  legendMax = '';
  legendLabel = '';
  readonly legendGradient = rampGradient();
  readonly incomeLegend = INCOME_LEVELS;
  private activeMetric?: Map<string, MetricPoint>;
  private activeIncome?: Map<string, string>;

  // Search + sort
  countryOptions: CountryOption[] = [];
  sortKey: SortKey = 'recent';
  sortDesc = true;

  // Theme
  darkMode = false;

  tooltip: Tooltip = { visible: false, x: 0, y: 0, name: '', detail: '' };

  // Hover-intent prefetch: warm a country's data before the click.
  private hoveredId = '';
  private prefetchTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private http: HttpClient,
    private wdbApi: WdbApi,
  ) {}

  // Lifecycle
  ngOnInit(): void {
    this.restoreState();
  }

  ngAfterViewInit(): void {
    this.loadSvg();
  }

  // Loading and rendering the map
  private async loadSvg(): Promise<void> {
    this.isLoadingSvg = true;
    this.svgError = '';
    try {
      const svgContent = await firstValueFrom(
        this.http.get('assets/map-image.svg', { responseType: 'text' }).pipe(
          timeout({ each: 15000 }),
          retry({ count: 1, delay: 500 }),
        ),
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
    this.zoomPan = new MapZoomPan(container, svg);

    // Restore a previously chosen choropleth once the paths exist.
    if (this.colorMode !== 'none') {
      this.applyColorMode(this.colorMode);
    }
  }

  private setupMap(): void {
    const paths = this.parsedSvg!.querySelectorAll<SVGPathElement>('path');
    const options = new Map<string, string>();

    paths.forEach((path) => {
      const name = path.getAttribute('name');

      // Keyboard accessibility for every country.
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      if (name) {
        path.setAttribute('aria-label', name);
      }

      path.addEventListener('click', () => this.selectCountry(path.id, name));
      path.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.selectCountry(path.id, name);
        }
      });

      if (name && /^[a-z]{2}$/.test(path.id) && !options.has(path.id)) {
        options.set(path.id, name);
      }
    });

    // Tooltip is wired once on the container rather than per path.
    const container = this.mapContainer.nativeElement;
    container.addEventListener('mousemove', this.onMapMouseMove);
    container.addEventListener('mouseleave', () => this.hideTooltip());

    this.countryOptions = [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Selection + country cards
  private selectCountry(id: string, name: string | null): void {
    this.selectedCountry = id;
    this.lastSelection = { id, name };
    this.updateSelection();
    this.loadInfo(id, name);
  }

  private updateSelection(): void {
    this.parsedSvg?.querySelectorAll('path').forEach((path) => {
      path.classList.toggle('selected', path.id === this.selectedCountry);
    });
  }

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

  retry(): void {
    if (this.lastSelection) {
      this.loadInfo(this.lastSelection.id, this.lastSelection.name);
    }
  }

  private updateCountryList(country: CountryInfo): void {
    const existingIndex = this.countries.findIndex((c) => c.name === country.name);
    if (existingIndex >= 0) {
      this.countries[existingIndex] = country;
    } else {
      this.countries.unshift(country);
    }
    this.persistCountries();
  }

  removeCountry(name: string): void {
    this.countries = this.countries.filter((c) => c.name !== name);
    this.persistCountries();
  }

  get sortedCountries(): CountryInfo[] {
    const arr = [...this.countries];
    const dir = this.sortDesc ? -1 : 1;
    switch (this.sortKey) {
      case 'name':
        return arr.sort((a, b) => a.name.localeCompare(b.name) * dir);
      case 'population':
        return arr.sort((a, b) => ((a.popValue ?? -Infinity) - (b.popValue ?? -Infinity)) * dir);
      case 'gdp':
        return arr.sort((a, b) => ((a.gdpValue ?? -Infinity) - (b.gdpValue ?? -Infinity)) * dir);
      default:
        return this.sortDesc ? arr : arr.reverse();
    }
  }

  onSortKey(event: Event): void {
    this.sortKey = (event.target as HTMLSelectElement).value as SortKey;
  }

  toggleSortDir(): void {
    this.sortDesc = !this.sortDesc;
  }

  // Search
  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    const query = input.value.trim().toLowerCase();
    const match = this.countryOptions.find((o) => o.name.toLowerCase() === query);
    if (match) {
      this.selectCountry(match.id, this.countryOptions.find((o) => o.id === match.id)!.name);
      input.value = '';
    }
  }

  // Choropleth
  onMetricChange(event: Event): void {
    const mode = (event.target as HTMLSelectElement).value as ColorMode;
    this.colorMode = mode;
    localStorage.setItem(STORAGE.metric, mode);
    this.applyColorMode(mode);
  }

  private async applyColorMode(mode: ColorMode): Promise<void> {
    if (!this.parsedSvg) {
      return;
    }
    if (mode === 'none') {
      this.clearChoropleth();
      return;
    }

    this.isLoadingMetric = true;
    this.metricError = '';
    try {
      if (mode === 'income') {
        this.activeIncome = await this.wdbApi.getIncomeByCountry();
        this.activeMetric = undefined;
        this.paintIncome(this.activeIncome);
      } else {
        const indicator = mode === 'population' ? POP_INDICATOR : GDP_INDICATOR;
        this.activeMetric = await this.wdbApi.getMetricByCountry(indicator);
        this.activeIncome = undefined;
        this.paintContinuous(this.activeMetric, mode);
      }
    } catch (error) {
      console.error('Error loading metric data:', error);
      this.metricError = 'Could not load map data. Please try again.';
    } finally {
      this.isLoadingMetric = false;
    }
  }

  private paintContinuous(data: Map<string, MetricPoint>, mode: ColorMode): void {
    const scale = buildLogScale([...data.values()].map((p) => p.value));
    this.eachPath((path) => {
      const point = data.get(path.id);
      path.style.setProperty('--country-fill', point ? scale.color(point.value) : NO_DATA_COLOR);
    });

    this.legendType = 'continuous';
    this.legendLabel = mode === 'gdp' ? 'GDP per capita' : 'Population';
    this.legendMin = this.compact(scale.min, mode);
    this.legendMax = this.compact(scale.max, mode);
  }

  private paintIncome(data: Map<string, string>): void {
    this.eachPath((path) => {
      const level = data.get(path.id);
      path.style.setProperty('--country-fill', level ? incomeColor(level) : NO_DATA_COLOR);
    });
    this.legendType = 'income';
    this.legendLabel = 'Income level';
  }

  private clearChoropleth(): void {
    this.eachPath((path) => path.style.removeProperty('--country-fill'));
    this.legendType = 'none';
    this.activeMetric = undefined;
    this.activeIncome = undefined;
  }

  private eachPath(fn: (path: SVGPathElement) => void): void {
    this.parsedSvg?.querySelectorAll<SVGPathElement>('path').forEach(fn);
  }

  resetZoom(): void {
    this.zoomPan?.reset();
  }

  // Tooltip
  private onMapMouseMove = (event: MouseEvent): void => {
    const target = event.target as Element;
    if (target && target.tagName === 'path' && target.id) {
      this.showTooltip(target as SVGPathElement, event.clientX, event.clientY);
      this.queuePrefetch(target.id);
    } else {
      this.hideTooltip();
      this.cancelPrefetch();
    }
  };

  // Warm the cache ~150ms after the cursor settles on a country, so a click
  // usually finds the data already loaded.
  private queuePrefetch(id: string): void {
    if (id === this.hoveredId) {
      return;
    }
    this.hoveredId = id;
    this.cancelPrefetch();
    this.prefetchTimer = setTimeout(() => {
      this.wdbApi.getCountryInfo(id).catch(() => {});
    }, 150);
  }

  private cancelPrefetch(): void {
    this.hoveredId = '';
    clearTimeout(this.prefetchTimer);
  }

  private showTooltip(path: SVGPathElement, x: number, y: number): void {
    const name = path.getAttribute('name') ?? path.id;
    this.tooltip = {
      visible: true,
      x: x + 14,
      y: y + 14,
      name,
      detail: this.tooltipDetail(path.id),
    };
  }

  private tooltipDetail(id: string): string {
    if (this.colorMode === 'income' && this.activeIncome) {
      return `Income: ${this.activeIncome.get(id) ?? 'No data'}`;
    }
    if (this.activeMetric) {
      const point = this.activeMetric.get(id);
      const label = this.colorMode === 'gdp' ? 'GDP per capita' : 'Population';
      if (!point) {
        return `${label}: No data`;
      }
      const value = this.wdbApi.formatNumber(
        point.value,
        this.colorMode === 'gdp' ? 'currency' : 'population',
      );
      return `${label}: ${value} (${point.year})`;
    }
    return '';
  }

  private hideTooltip(): void {
    if (this.tooltip.visible) {
      this.tooltip = { ...this.tooltip, visible: false };
    }
  }

  // Theme
  toggleDark(): void {
    this.darkMode = !this.darkMode;
    document.documentElement.classList.toggle('dark-theme', this.darkMode);
    localStorage.setItem(STORAGE.dark, this.darkMode ? '1' : '0');
  }

  // Persistence
  private persistCountries(): void {
    try {
      localStorage.setItem(STORAGE.countries, JSON.stringify(this.countries));
    } catch {
      // Storage may be unavailable (private mode); ignore.
    }
  }

  private restoreState(): void {
    this.darkMode = localStorage.getItem(STORAGE.dark) === '1';
    document.documentElement.classList.toggle('dark-theme', this.darkMode);

    const savedMetric = localStorage.getItem(STORAGE.metric) as ColorMode | null;
    if (savedMetric) {
      this.colorMode = savedMetric;
    }

    try {
      const raw = localStorage.getItem(STORAGE.countries);
      if (raw) {
        this.countries = JSON.parse(raw) as CountryInfo[];
      }
    } catch {
      this.countries = [];
    }
  }

  private compact(value: number, mode: ColorMode): string {
    const options: Intl.NumberFormatOptions =
      mode === 'gdp'
        ? { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }
        : { notation: 'compact', maximumFractionDigits: 1 };
    return new Intl.NumberFormat('en-US', options).format(value);
  }
}
