/**
 * Lightweight pan/zoom for an injected SVG element using CSS transforms.
 * Wheel zooms toward the cursor; dragging pans once zoomed in.
 */
export class MapZoomPan {
  private scale = 1;
  private tx = 0;
  private ty = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  private readonly minScale = 1;
  private readonly maxScale = 12;

  constructor(
    private readonly container: HTMLElement,
    private readonly target: SVGElement,
  ) {
    this.target.style.transformOrigin = '0 0';
    this.container.style.touchAction = 'none';
    this.container.style.cursor = 'grab';

    this.container.addEventListener('wheel', this.onWheel, { passive: false });
    this.container.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  destroy(): void {
    this.container.removeEventListener('wheel', this.onWheel);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  reset(): void {
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.apply();
  }

  get isZoomed(): boolean {
    return this.scale > this.minScale;
  }

  private apply(): void {
    this.target.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = this.clamp(this.scale * factor, this.minScale, this.maxScale);
    if (newScale === this.scale) {
      return;
    }

    // Keep the point under the cursor fixed as we scale.
    this.tx = cx - (cx - this.tx) * (newScale / this.scale);
    this.ty = cy - (cy - this.ty) * (newScale / this.scale);
    this.scale = newScale;

    if (this.scale === this.minScale) {
      this.tx = 0;
      this.ty = 0;
    }
    this.apply();
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.isZoomed) {
      return; // nothing to pan at default zoom
    }
    this.dragging = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.container.style.cursor = 'grabbing';
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) {
      return;
    }
    this.tx += event.clientX - this.lastX;
    this.ty += event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.apply();
  };

  private onPointerUp = (): void => {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    this.container.style.cursor = 'grab';
  };
}
