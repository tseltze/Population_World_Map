import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { WdbApi } from './wdb-api';

describe('WdbApi', () => {
  let service: WdbApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WdbApi);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
