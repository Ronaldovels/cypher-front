import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import { EVENT_SOURCE_FACTORY, EventSourceLike } from './event-source.factory';
import { Incident, Notificacao, Page } from './incident.models';
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
    normaAplicavel: null,
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

  it('busca um incidente por id e o insere no store', () => {
    service.getById(42).subscribe(incidenteRec => {
      expect(incidenteRec.id).toBe(42);
    });

    const req = http.expectOne(`${environment.apiUrl}/incidents/42`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(incidente({ id: 42, incidentKey: 'k42' }));

    expect(service.incidents().some(i => i.incidentKey === 'k42')).toBe(true);
  });

  it('busca com filtros envia os parâmetros esperados', () => {
    service.search(
      { camera: 'CAM-01', severityMin: 3, status: 'PENDENTE', since: '2026-08-10T00:00:00-03:00' },
      1, 20,
    ).subscribe();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/incidents`);
    expect(req.request.params.get('camera')).toBe('CAM-01');
    expect(req.request.params.get('severityMin')).toBe('3');
    expect(req.request.params.get('status')).toBe('PENDENTE');
    expect(req.request.params.get('since')).toBe('2026-08-10T00:00:00-03:00');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');
    expect(req.request.params.get('sort')).toBe('detectedAt,desc');
    req.flush(pagina([]));
  });

  it('busca sem filtros envia só paginação (e sort fixo, para paginação determinística)', () => {
    service.search({}, 0, 50).subscribe();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/incidents`);
    expect(req.request.params.get('camera')).toBeNull();
    expect(req.request.params.get('severityMin')).toBeNull();
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('sort')).toBe('detectedAt,desc');
    req.flush(pagina([]));
  });

  it('guarda o instante do mais recente para cobrir lacuna do SSE', () => {
    service.upsert(incidente({ incidentKey: 'k1', detectedAt: '2026-08-10T10:00:00-03:00' }));
    service.upsert(incidente({ incidentKey: 'k2', detectedAt: '2026-08-10T12:00:00-03:00' }));

    expect(service.lastSeenAt()).toBe('2026-08-10T12:00:00-03:00');
  });

  it('carrega os agregados do dashboard', () => {
    service.loadSummary();

    const req = http.expectOne(`${environment.apiUrl}/summary`);
    req.flush({
      incidentesHoje: 3, incidentesOntem: 1, criticosHoje: 2, pendentes: 4,
      heatmap: [{ estacaoId: 'EST-01', nome: 'Esteira', setor: 'montagem', incidentes: 2 }],
      ultimosSeteDias: [{ dia: '2026-08-10', incidentes: 3 }],
    });

    expect(service.summary()?.incidentesHoje).toBe(3);
    expect(service.summary()?.heatmap[0].estacaoId).toBe('EST-01');
  });

  it('loadSummary manda os filtros como query params quando informados', () => {
    service.loadSummary({ since: '2026-09-01T00:00:00.000Z', turno: 'A', setor: 'montagem', epi: 'capacete', detalhado: true });

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/summary`);
    expect(req.request.params.get('since')).toBe('2026-09-01T00:00:00.000Z');
    expect(req.request.params.get('turno')).toBe('A');
    expect(req.request.params.get('setor')).toBe('montagem');
    expect(req.request.params.get('epi')).toBe('capacete');
    expect(req.request.params.get('detalhado')).toBe('true');
    req.flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap: [], ultimosSeteDias: [],
      distribuicaoTemporal: [{ diaSemana: 2, faixa2h: 11, incidentes: 1 }],
      historicoAnual: [{ dia: '2026-01-01', incidentes: 0 }],
    });

    expect(service.summary()?.distribuicaoTemporal?.[0].incidentes).toBe(1);
    expect(service.summary()?.historicoAnual?.[0].dia).toBe('2026-01-01');
  });

  it('loadSummary sem filtros nao manda nenhum param novo (mesma URL de sempre)', () => {
    service.loadSummary();

    const req = http.expectOne(`${environment.apiUrl}/summary`);
    expect(req.request.params.keys().length).toBe(0);
    req.flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap: [], ultimosSeteDias: [],
    });
  });

  it('naoLidas comeca em zero e loadNaoLidas atualiza a partir do backend', () => {
    expect(service.naoLidas()).toBe(0);

    service.loadNaoLidas();

    const req = http.expectOne(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`);
    req.flush({ naoLidas: 5 });

    expect(service.naoLidas()).toBe(5);
  });

  it('loadNotificacoes busca a lista sem alterar o store de incidentes', () => {
    let recebidas: Notificacao[] = [];
    service.loadNotificacoes().subscribe(lista => (recebidas = lista));

    const req = http.expectOne(`${environment.apiUrl}/notificacoes`);
    req.flush([
      { id: 1, cameraId: 'CAM-01', type: 'FALL_RISK', severity: 4, nivel: 'ALTO',
        descricao: 'Queda detectada', detectedAt: '2026-09-07T10:00:00Z', lida: false },
    ]);

    expect(recebidas).toHaveLength(1);
    expect(recebidas[0].cameraId).toBe('CAM-01');
    expect(service.incidents()).toHaveLength(0);
  });

  it('marcarLidas envia os ids e resincroniza a contagem depois', () => {
    service.marcarLidas([1, 2]);

    const post = http.expectOne(`${environment.apiUrl}/notificacoes/marcar-lidas`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ alertaIds: [1, 2] });
    post.flush(null);

    const contagem = http.expectOne(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`);
    contagem.flush({ naoLidas: 0 });

    expect(service.naoLidas()).toBe(0);
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

  it('incrementa naoLidas so em incidente novo, nao em atualizacao', () => {
    service.connect();
    criados[0].abrir();

    criados[0].emitir('incident', incidente({ id: 9, incidentKey: 'k9' }));
    expect(service.naoLidas()).toBe(1);

    criados[0].emitir('incident-changed',
      incidente({ id: 9, incidentKey: 'k9', status: 'RESOLVIDO' }));
    expect(service.naoLidas()).toBe(1);
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

  it('reagenda o refresh do summary reaplicando o último filtro usado (não some ao vivo)', () => {
    vi.useFakeTimers();
    try {
      service.loadSummary({ setor: 'montagem' });
      http.expectOne(r => r.url === `${environment.apiUrl}/summary`)
        .flush({
          incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
          heatmap: [], ultimosSeteDias: [],
        });

      service.connect();
      criados[0].abrir();
      criados[0].emitir('incident', incidente({ incidentKey: 'k-ao-vivo' }));

      vi.advanceTimersByTime(2000);

      const refresh = http.expectOne(r => r.url === `${environment.apiUrl}/summary`);
      expect(refresh.request.params.get('setor')).toBe('montagem');
      refresh.flush({
        incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
        heatmap: [], ultimosSeteDias: [],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('erro do store não se disfarça de payload malformado', () => {
    service.connect();
    criados[0].abrir();
    // Precisa de um incidente já no store: com a lista vazia, o comparador do
    // sort nunca é chamado para um único elemento, e o TypeError não aparece.
    criados[0].emitir('incident', incidente({ incidentKey: 'k-existente' }));

    // JSON válido, forma errada: isto é bug de contrato, não payload corrompido,
    // e precisa aparecer em vez de sumir no catch do parse.
    expect(() => criados[0].emitirBruto('incident', '{"incidentKey":"k-torto"}')).toThrow();
  });

  it('reset esquece incidentes, resumo e não lidas da sessão anterior e fecha o stream', () => {
    service.connect();
    criados[0].abrir();
    http.match(() => true).forEach(r => r.flush(pagina([])));
    criados[0].emitir('incident', incidente({ id: 9, incidentKey: 'k9' }));
    service.loadSummary();
    http.expectOne(r => r.url === `${environment.apiUrl}/summary`).flush({ incidentesHoje: 1 });
    expect(service.incidents().length).toBe(1);
    expect(service.naoLidas()).toBe(1);
    expect(service.summary()).not.toBeNull();

    service.reset();

    expect(service.incidents()).toEqual([]);
    expect(service.naoLidas()).toBe(0);
    expect(service.summary()).toBeNull();
    expect(criados[0].fechado).toBe(true);
    expect(service.connection()).toBe('offline');
  });

  it('reset cancela o refresh agendado do resumo', () => {
    vi.useFakeTimers();
    try {
      service.connect();
      criados[0].abrir();
      http.match(() => true).forEach(r => r.flush(pagina([])));
      criados[0].emitir('incident', incidente({ id: 9, incidentKey: 'k9' }));

      service.reset();
      vi.advanceTimersByTime(5000);

      http.expectNone(r => r.url === `${environment.apiUrl}/summary`);
    } finally {
      vi.useRealTimers();
    }
  });
});
