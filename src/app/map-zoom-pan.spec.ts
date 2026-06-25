import { MapZoomPan } from './map-zoom-pan';

describe('MapZoomPan', () => {
  let container: HTMLDivElement;
  let svg: SVGSVGElement;
  let zoomPan: MapZoomPan;

  const wheel = (deltaY: number) =>
    container.dispatchEvent(
      new WheelEvent('wheel', { deltaY, clientX: 100, clientY: 50, cancelable: true, bubbles: true }),
    );

  beforeEach(() => {
    container = document.createElement('div');
    // jsdom/headless gives a zero rect; provide a stable one for the zoom math.
    spyOn(container, 'getBoundingClientRect').and.returnValue({
      left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(container);
    zoomPan = new MapZoomPan(container, svg);
  });

  afterEach(() => {
    zoomPan.destroy();
    container.remove();
  });

  it('starts un-zoomed with grab cursor', () => {
    expect(zoomPan.isZoomed).toBeFalse();
    expect(container.style.cursor).toBe('grab');
  });

  it('zooms in on wheel-up and applies a transform', () => {
    wheel(-100);
    expect(zoomPan.isZoomed).toBeTrue();
    expect(svg.style.transform).toContain('scale(');
  });

  it('does not zoom below the minimum scale', () => {
    wheel(100);
    expect(zoomPan.isZoomed).toBeFalse();
  });

  it('reset returns to the identity transform', () => {
    wheel(-100);
    zoomPan.reset();
    expect(zoomPan.isZoomed).toBeFalse();
    expect(svg.style.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('destroy detaches window listeners so later pointer events are harmless', () => {
    zoomPan.destroy();
    expect(() => window.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }))).not.toThrow();
    // A second destroy must be safe too.
    expect(() => zoomPan.destroy()).not.toThrow();
  });
});
