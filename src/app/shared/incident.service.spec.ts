import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { Incident, Page } from './incident.models';
import { IncidentService } from './incident.service';

function incidente(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 1,
    incidentKey: 'CAM-01:run-a:track-7:20260810T173102482Z',
    cameraId: 'CAM-01',
    runId: 'run-a',
    trackId: 7,
    type: 'FALL_RISK',
    severity: 4,
    nivel: 'ALTO',
    descricao: 'Queda detectada',
    reason: 'fallen_sustained',
    postureCategory: 'immediate_risk',
    rebaScore: 11,
    actionLevel: 4,
    zoneName: null,
    zoneStatus: 'outside',
    epiPresent: ['HELMET'],
    epiMissing: [],
    snapshotUrl: null,
    detectedAt: '2026-08-10T14:31:02.482-03:00',
    endedAt: null,
    durationSeconds: null,
    peakSeverity: 4,
    closedReason: null,
    status: 'PENDENTE',
    ...overrides,
  };
}

function pagina(content: Incident[]): Page<Incident> {
  return { content, totalElements: content.length, totalPages: 1, number: 0, size: 50 };
}

describe('IncidentService', () => {
  let service: IncidentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(IncidentService);
    http = TestBed.inject(HttpTestingController);
  });

  it('começa vazio', () => {
    expect(service.incidents()).toEqual([]);
  });

  it('carrega o histórico da API', () => {
    service.loadHistory();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/incidents`);
    expect(req.request.method).toBe('GET');
    req.flush(pagina([incidente({ id: 1 }), incidente({ id: 2, incidentKey: 'k2' })]));

    expect(service.incidents().length).toBe(2);
  });

  it('envia credenciais, porque a autenticação será por cookie', () => {
    service.loadHistory();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/incidents`);
    expect(req.request.withCredentials).toBe(true);
    req.flush(pagina([]));
  });

  it('deduplica por incidentKey', () => {
    service.loadHistory();
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`)
        .flush(pagina([incidente({ id: 1, incidentKey: 'k1' })]));

    service.upsert(incidente({ id: 1, incidentKey: 'k1', status: 'REVISADO' }));

    expect(service.incidents().length).toBe(1);
    expect(service.incidents()[0].status).toBe('REVISADO');
  });

  it('coloca o mais recente no topo', () => {
    service.upsert(incidente({ id: 1, incidentKey: 'k1' }));
    service.upsert(incidente({ id: 2, incidentKey: 'k2' }));

    expect(service.incidents()[0].incidentKey).toBe('k2');
  });

  it('mantém no máximo 100 em memória', () => {
    for (let i = 0; i < 130; i++) {
      service.upsert(incidente({ id: i, incidentKey: `k${i}` }));
    }

    expect(service.incidents().length).toBe(IncidentService.MAX_IN_MEMORY);
    expect(service.incidents()[0].incidentKey).toBe('k129');
  });

  it('reconhece um incidente e atualiza a lista', () => {
    service.upsert(incidente({ id: 7, incidentKey: 'k7', status: 'PENDENTE' }));

    service.acknowledge(7, 'REVISADO');

    const req = http.expectOne(`${environment.apiUrl}/incidents/7/status`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'REVISADO' });
    req.flush(incidente({ id: 7, incidentKey: 'k7', status: 'REVISADO' }));

    expect(service.incidents()[0].status).toBe('REVISADO');
  });

  it('guarda o instante do mais recente para cobrir lacuna do SSE', () => {
    service.upsert(incidente({ incidentKey: 'k1', detectedAt: '2026-08-10T10:00:00-03:00' }));
    service.upsert(incidente({ incidentKey: 'k2', detectedAt: '2026-08-10T12:00:00-03:00' }));

    expect(service.lastSeenAt()).toBe('2026-08-10T12:00:00-03:00');
  });
});
