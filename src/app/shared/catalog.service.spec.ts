import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  it('carrega câmeras e estações', () => {
    service.load();

    http.expectOne(`${environment.apiUrl}/cameras`).flush([
      { id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x/stream' },
    ]);
    http.expectOne(`${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] },
    ]);

    expect(service.cameras().length).toBe(1);
    expect(service.stations()[0].nome).toBe('Esteira');
  });

  it('resolve a estação de uma câmera', () => {
    service.load();
    http.expectOne(`${environment.apiUrl}/cameras`).flush([
      { id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: null },
    ]);
    http.expectOne(`${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] },
    ]);

    expect(service.stationOfCamera('CAM-01')?.nome).toBe('Esteira');
    expect(service.stationOfCamera('CAM-99')).toBeNull();
  });

  it('câmera de estação desconhecida não quebra a resolução', () => {
    service.load();
    http.expectOne(`${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(`${environment.apiUrl}/stations`).flush([]);

    expect(service.stationOfCamera('CAM-01')).toBeNull();
  });
});
