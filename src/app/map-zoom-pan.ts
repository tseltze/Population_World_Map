/**
 * Lightweight pan/zoom for an injected SVG element using CSS transforms.
 * Wheel zooms toward the cursor; dragging pans once zoomed in.
 */
export class MapZoomPan {
  private readonly state: {
    scale: number;
    tx: number;
    ty: number;
    dragging: boolean;
    lastX: number;
    lastY: number;
  } = {
    scale: 1,
    tx: 0,
    ty: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  private readonly minScale = 1;
  private readonly maxScale = 12;

  constructor(
    private readonly container: HTMLElement,
    private readonly target: SVGElement,
  ) {
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
    this.state.scale = 1;
    this.state.tx = 0;
    this.state.ty = 0;
    this.apply();
  }

  get isZoomed(): boolean {
    return this.state.scale > this.minScale;
  }

  private apply(): void {
    this.target.style.transform = `translate(${this.state.tx}px, ${this.state.ty}px) scale(${this.state.scale})`;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = this.clamp(
      this.state.scale * factor,
      this.minScale,
      this.maxScale,
    );
    if (newScale === this.state.scale) {
      return;
    }

    // Keep the point under the cursor fixed as we scale.
    this.state.tx = cx - (cx - this.state.tx) * (newScale / this.state.scale);
    this.state.ty = cy - (cy - this.state.ty) * (newScale / this.state.scale);
    this.state.scale = newScale;

    if (this.state.scale === this.minScale) {
      this.state.tx = 0;
      this.state.ty = 0;
    }
    this.apply();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.isZoomed) {
      return; // nothing to pan at default zoom
    }
    this.state.dragging = true;
    this.state.lastX = event.clientX;
    this.state.lastY = event.clientY;
    this.container.style.cursor = 'grabbing';
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.state.dragging) {
      return;
    }
    this.state.tx += event.clientX - this.state.lastX;
    this.state.ty += event.clientY - this.state.lastY;
    this.state.lastX = event.clientX;
    this.state.lastY = event.clientY;
    this.apply();
  };

  private readonly onPointerUp = (): void => {
    if (!this.state.dragging) {
      return;
    }
    this.state.dragging = false;
    this.container.style.cursor = 'grab';
  };
}
