import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { PlacarService } from './placar.service';

describe('PlacarService (design doc de gamificação E5, §5)', () => {
  let service: PlacarService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlacarService);
    http = TestBed.inject(HttpTestingController);
  });

  it('buscar() sem período faz GET sem query string', () => {
    service.buscar().subscribe();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/placar`);
    expect(req.request.params.keys()).toHaveLength(0);
    req.flush([]);
  });

  it('buscar(since, until) inclui os dois parâmetros', () => {
    service.buscar('2026-08-01T00:00:00Z', '2026-08-08T00:00:00Z').subscribe();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/placar`);
    expect(req.request.params.get('since')).toBe('2026-08-01T00:00:00Z');
    expect(req.request.params.get('until')).toBe('2026-08-08T00:00:00Z');
    req.flush([]);
  });
});
