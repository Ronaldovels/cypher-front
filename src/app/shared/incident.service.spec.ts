import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { EVENT_SOURCE_FACTORY, EventSourceLike } from './event-source.factory';
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

class EventSourceFake implements EventSourceLike {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  fechado = false;
  private listeners = new Map<string, (event: MessageEvent) => void>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.fechado = true;
  }

  emitir(type: string, data: unknown): void {
    this.emitirBruto(type, JSON.stringify(data));
  }

  /** Entrega o corpo cru, para exercitar payload malformado. */
  emitirBruto(type: string, raw: string): void {
    this.listeners.get(type)?.({ data: raw } as MessageEvent);
  }

  abrir(): void {
    this.onopen?.(new Event('open'));
  }

  falhar(): void {
    this.onerror?.(new Event('error'));
  }
}

describe('IncidentService — SSE', () => {
  let service: IncidentService;
  let http: HttpTestingController;
  let criados: EventSourceFake[];

  beforeEach(() => {
    criados = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        {
          provide: EVENT_SOURCE_FACTORY,
          useValue: (url: string) => {
            const fake = new EventSourceFake(url);
            criados.push(fake);
            return fake;
          },
        },
      ],
    });
    service = TestBed.inject(IncidentService);
    http = TestBed.inject(HttpTestingController);
  });

  it('começa desconectado', () => {
    expect(service.connection()).toBe('offline');
  });

  it('conecta no endpoint de stream', () => {
    service.connect();

    expect(criados[0].url).toBe(`${environment.apiUrl}/incidents/stream`);
    expect(service.connection()).toBe('conectando');
  });

  it('marca ao vivo quando a conexão abre', () => {
    service.connect();
    criados[0].abrir();

    expect(service.connection()).toBe('ao vivo');
  });

  it('insere o incidente recebido no store', () => {
    service.connect();
    criados[0].abrir();

    criados[0].emitir('incident', incidente({ id: 9, incidentKey: 'k9' }));

    expect(service.incidents()[0].incidentKey).toBe('k9');
  });

  it('atualiza o incidente quando ele muda', () => {
    service.connect();
    criados[0].abrir();
    criados[0].emitir('incident', incidente({ id: 9, incidentKey: 'k9', status: 'PENDENTE' }));

    criados[0].emitir('incident-changed',
      incidente({ id: 9, incidentKey: 'k9', status: 'RESOLVIDO' }));

    expect(service.incidents().length).toBe(1);
    expect(service.incidents()[0].status).toBe('RESOLVIDO');
  });

  it('marca offline quando a conexão cai', () => {
    service.connect();
    criados[0].abrir();

    criados[0].falhar();

    expect(service.connection()).toBe('offline');
  });

  it('cobre a lacuna rebuscando por since ao reconectar', () => {
    service.connect();
    criados[0].abrir();
    criados[0].emitir('incident',
      incidente({ incidentKey: 'k1', detectedAt: '2026-08-10T12:00:00-03:00' }));
    criados[0].falhar();

    criados[0].abrir();

    const req = http.expectOne(r =>
      r.url === `${environment.apiUrl}/incidents` &&
      r.params.get('since') === '2026-08-10T12:00:00-03:00');
    req.flush(pagina([]));
  });

  it('fecha a conexão ao desconectar', () => {
    service.connect();

    service.disconnect();

    expect(criados[0].fechado).toBe(true);
    expect(service.connection()).toBe('offline');
  });

  it('ignora payload malformado sem derrubar o store', () => {
    service.connect();
    criados[0].abrir();
    criados[0].emitir('incident', incidente({ incidentKey: 'k-bom' }));

    expect(() => criados[0].emitirBruto('incident', '{isso nao e json')).not.toThrow();

    // O incidente válido continua lá; o lixo não entrou.
    expect(service.incidents().length).toBe(1);
    expect(service.incidents()[0].incidentKey).toBe('k-bom');
    expect(service.connection()).toBe('ao vivo');
  });
});
