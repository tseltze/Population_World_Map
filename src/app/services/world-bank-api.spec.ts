import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { WorldBankApi } from './world-bank-api';

describe('WorldBankApi', () => {
  let service: WorldBankApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WorldBankApi);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
