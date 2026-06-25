import {
  Component,
  AfterViewInit,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, retry, timeout } from 'rxjs';
import { WorldBankApi, MetricPoint } from '../services/world-bank-api';
import {
  buildLogScale,
  incomeColor,
  rampGradient,
  INCOME_LEVELS,
  NO_DATA_COLOR,
} from '../services/color-scale';
import { MapZoomPan } from '../map-zoom-pan';
import { ColorMode } from '../app-storage';
import { formatCurrency, formatCount } from '../format';

export interface CountryOption {
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
      format: (value: number) => string;
      data: Map<string, MetricPoint>;
    }
  | { kind: 'income'; label: string; data: Map<string, string> };

const PREFETCH_DELAY_MS = 150;
const SVG_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 500;
const TOOLTIP_OFFSET_PX = 14;

@Component({
  selector: 'app-world-map',
  standalone: true,
  imports: [],
  templateUrl: './world-map.html',
  styleUrl: './world-map.css',
  // The SVG is injected imperatively (no scoping attribute), so its styles are
  // global.
  encapsulation: ViewEncapsulation.None,
})
export class WorldMap implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('worldMap', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  @Input() colorMode: ColorMode = 'none';
  @Input() selectedCode = '';

  @Output() countrySelect = new EventEmitter<{ id: string; name: string | null }>();
  @Output() optionsLoaded = new EventEmitter<CountryOption[]>();

  private parsedSvg?: SVGElement;
  private zoomPan?: MapZoomPan;
  private ready = false;

  isLoadingSvg = true;
  svgError = '';

  isLoadingMetric = false;
  metricError = '';
  choropleth: Choropleth = { kind: 'none' };
  readonly legendGradient = rampGradient();
  readonly incomeLegend = INCOME_LEVELS;

  tooltip: Tooltip = { visible: false, x: 0, y: 0, name: '', detail: '' };

  // Hover-intent prefetch: warm a country's data before the click.
  private hoveredId = '';
  private prefetchTimer?: ReturnType<typeof setTimeout>;

  private readonly http = inject(HttpClient);
  private readonly worldBank = inject(WorldBankApi);

  ngAfterViewInit(): void {
    this.loadSvg();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.ready) {
      return; // renderSvg applies the current inputs once the SVG exists
    }
    if (changes['colorMode']) {
      this.applyColorMode(this.colorMode);
    }
    if (changes['selectedCode']) {
      this.updateSelection();
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.prefetchTimer);
    this.zoomPan?.destroy();
    const container = this.mapContainer?.nativeElement;
    container?.removeEventListener('mousemove', this.onMapMouseMove);
    container?.removeEventListener('mouseleave', this.onMapMouseLeave);
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
    this.ready = true;

    this.setupMap();
    this.zoomPan = new MapZoomPan(container, svg);

    // Apply the inputs that arrived before the SVG existed.
    this.updateSelection();
    if (this.colorMode !== 'none') {
      this.applyColorMode(this.colorMode);
    }
  }

  private setupMap(): void {
    const paths = this.parsedSvg!.querySelectorAll<SVGPathElement>('path');
    const options = new Map<string, string>();

    paths.forEach((path) => {
      const name = path.getAttribute('name');

      // The map is a mouse affordance. Keyboard and screen-reader users select
      // countries through the search box, so the 256 paths stay out of the tab
      // order rather than becoming 256 tab stops.
      path.addEventListener('click', () => this.emitSelect(path.id, name));

      if (name && /^[a-z]{2}$/.test(path.id) && !options.has(path.id)) {
        options.set(path.id, name);
      }
    });

    // Tooltip is wired once on the container rather than per path.
    const container = this.mapContainer.nativeElement;
    container.addEventListener('mousemove', this.onMapMouseMove);
    container.addEventListener('mouseleave', this.onMapMouseLeave);

    this.optionsLoaded.emit(
      [...options.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  private emitSelect(id: string, name: string | null): void {
    this.countrySelect.emit({ id, name });
  }

  private updateSelection(): void {
    this.parsedSvg?.querySelectorAll('path').forEach((path) => {
      path.classList.toggle('selected', path.id === this.selectedCode);
    });
  }

  // Choropleth
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
        this.paintContinuous(await this.worldBank.getMetric(mode), mode);
      }
    } catch (error) {
      console.error('Error loading metric data:', error);
      this.metricError = 'Could not load map data. Please try again.';
    } finally {
      this.isLoadingMetric = false;
    }
  }

  private paintContinuous(data: Map<string, MetricPoint>, metric: 'population' | 'gdp'): void {
    const scale = buildLogScale([...data.values()].map((p) => p.value));
    this.eachPath((path) => {
      const point = data.get(path.id);
      path.style.setProperty('--country-fill', point ? scale.color(point.value) : NO_DATA_COLOR);
    });

    const isCurrency = metric === 'gdp';
    const format = isCurrency ? formatCurrency : formatCount;
    this.choropleth = {
      kind: 'continuous',
      label: isCurrency ? 'GDP per capita' : 'Population',
      min: this.compact(scale.min, isCurrency),
      max: this.compact(scale.max, isCurrency),
      format,
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

  // Tooltip + hover prefetch
  private onMapMouseLeave = (): void => this.hideTooltip();

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

  private queuePrefetch(id: string): void {
    if (id === this.hoveredId) {
      return;
    }
    this.hoveredId = id;
    this.cancelPrefetch();
    this.prefetchTimer = setTimeout(() => {
      // Prefetch is best-effort; a failure here just means no warm cache.
      this.worldBank.getCountryInfo(id).catch(() => undefined);
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
      return `${ch.label}: ${ch.format(point.value)} (${point.year})`;
    }
    return '';
  }

  private hideTooltip(): void {
    if (this.tooltip.visible) {
      this.tooltip = { ...this.tooltip, visible: false };
    }
  }

  private compact(value: number, isCurrency: boolean): string {
    const options: Intl.NumberFormatOptions = isCurrency
      ? { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }
      : { notation: 'compact', maximumFractionDigits: 1 };
    return new Intl.NumberFormat('en-US', options).format(value);
  }
}
