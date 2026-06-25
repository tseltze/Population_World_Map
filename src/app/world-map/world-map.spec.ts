import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WorldMap } from './world-map';

describe('WorldMap', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorldMap],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('is created', () => {
    expect(TestBed.createComponent(WorldMap).componentInstance).toBeTruthy();
  });

  it('ngOnDestroy disposes the zoom/pan controller and does not throw', () => {
    const component = TestBed.createComponent(WorldMap).componentInstance;
    const destroy = jasmine.createSpy('destroy');
    (component as unknown as { zoomPan: { destroy: () => void } }).zoomPan = { destroy };

    expect(() => component.ngOnDestroy()).not.toThrow();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
