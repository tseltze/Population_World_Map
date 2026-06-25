import { Component, AfterViewInit, ElementRef, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, retry, timeout } from 'rxjs';
import {
  WorldBankApi,
  CountryInfo,
  MetricPoint,
  POP_INDICATOR,
  GDP_INDICATOR,
} from './services/world-bank-api';
import {
  buildLogScale,
  incomeColor,
  rampGradient,
  INCOME_LEVELS,
  NO_DATA_COLOR,
} from './services/color-scale';
import { MapZoomPan } from './map-zoom-pan';
import { AppStorage, ColorMode } from './app-storage';

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

// The painted map state as a single value: invalid combinations (e.g. a legend
// with no data) can't be represented.
type Choropleth =
  | { kind: 'none' }
  | {
      kind: 'continuous';
      label: string;
      min: string;
      max: string;
      metricType: 'currency' | 'population';
      data: Map<string, MetricPoint>;
    }
  | { kind: 'income'; label: string; data: Map<string, string> };

const PREFETCH_DELAY_MS = 150;
const SVG_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 500;
const TOOLTIP_OFFSET_PX = 14;

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
  choropleth: Choropleth = { kind: 'none' };
  readonly legendGradient = rampGradient();
  readonly incomeLegend = INCOME_LEVELS;

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
    private worldBank: WorldBankApi,
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
          timeout({ each: SVG_TIMEOUT_MS }),
          retry({ count: 1, delay: RETRY_DELAY_MS }),
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
      const info = await this.worldBank.getCountryInfo(countryId);
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
    const existingIndex = this.countries.findIndex((c) => c.code === country.code);
    if (existingIndex >= 0) {
      this.countries[existingIndex] = country;
    } else {
      this.countries.unshift(country);
    }
    AppStorage.setCountries(this.countries);
  }

  removeCountry(code: string): void {
    this.countries = this.countries.filter((c) => c.code !== code);
    AppStorage.setCountries(this.countries);
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
      this.selectCountry(match.id, match.name);
      input.value = '';
    }
  }

  // Choropleth
  onMetricChange(event: Event): void {
    const mode = (event.target as HTMLSelectElement).value as ColorMode;
    this.colorMode = mode;
    AppStorage.setMetric(mode);
    this.applyColorMode(mode);
  }

  retryMetric(): void {
    this.applyColorMode(this.colorMode);
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
        this.paintIncome(await this.worldBank.getIncomeByCountry());
      } else {
        const indicator = mode === 'population' ? POP_INDICATOR : GDP_INDICATOR;
        this.paintContinuous(await this.worldBank.getMetricByCountry(indicator), mode);
      }
    } catch (error) {
      console.error('Error loading metric data:', error);
      this.metricError = 'Could not load map data. Please try again.';
    } finally {
      this.isLoadingMetric = false;
    }
  }

  private paintContinuous(data: Map<string, MetricPoint>, mode: 'population' | 'gdp'): void {
    const scale = buildLogScale([...data.values()].map((p) => p.value));
    this.eachPath((path) => {
      const point = data.get(path.id);
      path.style.setProperty('--country-fill', point ? scale.color(point.value) : NO_DATA_COLOR);
    });

    const metricType = mode === 'gdp' ? 'currency' : 'population';
    this.choropleth = {
      kind: 'continuous',
      label: mode === 'gdp' ? 'GDP per capita' : 'Population',
      min: this.compact(scale.min, metricType),
      max: this.compact(scale.max, metricType),
      metricType,
      data,
    };
  }

  private paintIncome(data: Map<string, string>): void {
    this.eachPath((path) => {
      const level = data.get(path.id);
      path.style.setProperty('--country-fill', level ? incomeColor(level) : NO_DATA_COLOR);
    });
    this.choropleth = { kind: 'income', label: 'Income level', data };
  }

  private clearChoropleth(): void {
    this.eachPath((path) => path.style.removeProperty('--country-fill'));
    this.choropleth = { kind: 'none' };
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

  // Warm the cache after the cursor settles on a country, so a click usually
  // finds the data already loaded.
  private queuePrefetch(id: string): void {
    if (id === this.hoveredId) {
      return;
    }
    this.hoveredId = id;
    this.cancelPrefetch();
    this.prefetchTimer = setTimeout(() => {
      this.worldBank.getCountryInfo(id).catch(() => {});
    }, PREFETCH_DELAY_MS);
  }

  private cancelPrefetch(): void {
    this.hoveredId = '';
    clearTimeout(this.prefetchTimer);
  }

  private showTooltip(path: SVGPathElement, x: number, y: number): void {
    const name = path.getAttribute('name') ?? path.id;
    this.tooltip = {
      visible: true,
      x: x + TOOLTIP_OFFSET_PX,
      y: y + TOOLTIP_OFFSET_PX,
      name,
      detail: this.tooltipDetail(path.id),
    };
  }

  private tooltipDetail(id: string): string {
    const ch = this.choropleth;
    if (ch.kind === 'income') {
      return `Income: ${ch.data.get(id) ?? 'No data'}`;
    }
    if (ch.kind === 'continuous') {
      const point = ch.data.get(id);
      if (!point) {
        return `${ch.label}: No data`;
      }
      return `${ch.label}: ${this.worldBank.formatNumber(point.value, ch.metricType)} (${point.year})`;
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
    AppStorage.setDark(this.darkMode);
  }

  // Persistence
  private restoreState(): void {
    this.darkMode = AppStorage.getDark();
    document.documentElement.classList.toggle('dark-theme', this.darkMode);
    this.colorMode = AppStorage.getMetric();
    this.countries = AppStorage.getCountries();
  }

  private compact(value: number, metricType: 'currency' | 'population'): string {
    const options: Intl.NumberFormatOptions =
      metricType === 'currency'
        ? { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }
        : { notation: 'compact', maximumFractionDigits: 1 };
    return new Intl.NumberFormat('en-US', options).format(value);
  }
}
