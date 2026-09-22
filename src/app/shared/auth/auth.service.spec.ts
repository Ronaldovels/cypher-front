import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { CatalogService } from '../catalog.service';
import { EpiChecklistService } from '../epi-checklist.service';
import { Incident } from '../incident.models';
import { IncidentService } from '../incident.service';
import { McpCredentialService } from '../mcp-credential.service';
import { TeamService } from '../team.service';
import { WebhookService } from '../webhook.service';
import { ZoneService } from '../zone.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  it('checa a sessão no boot; sessão válida define role e estacaoId', () => {
    const req = http.expectOne(`${environment.apiUrl}/auth/me`);
    expect(req.request.withCredentials).toBe(true);
    req.flush({ papel: 'OPERADOR', estacaoId: 'EST-01', empresaId: 'demo' });

    expect(service.role()).toBe('OPERADOR');
    expect(service.estacaoId()).toBe('EST-01');
    expect(service.empresaId()).toBe('demo');
    expect(service.empresaNome()).toBeNull();
  });

  it('checkSession popula empresaNome quando o /auth/me traz o nome da empresa', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ papel: 'GESTOR', username: 'g1', empresaId: 'acme', empresaNome: 'Acme Industrial' });

    expect(service.empresaId()).toBe('acme');
    expect(service.empresaNome()).toBe('Acme Industrial');
  });

  it('401 no boot vira role null, nao erro', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(service.role()).toBeNull();
    expect(service.estacaoId()).toBeNull();
  });

  it('checkSession chamado de novo nao refaz a requisicao', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    service.checkSession().subscribe();

    http.expectNone(`${environment.apiUrl}/auth/me`);
  });

  it('login define role GESTOR e limpa estacaoId', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    service.login('gestor1', 'senha123').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.body).toEqual({ username: 'gestor1', password: 'senha123' });
    expect(req.request.withCredentials).toBe(true);
    req.flush({ papel: 'GESTOR', username: 'gestor1', empresaId: 'demo' });

    expect(service.role()).toBe('GESTOR');
    expect(service.estacaoId()).toBeNull();
  });

  it('login com credencial invalida propaga o erro para quem chamou', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    let falhou = false;
    service.login('gestor1', 'errada').subscribe({ error: () => { falhou = true; } });

    http.expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ erro: 'Usuário ou senha inválidos' }, { status: 401, statusText: 'Unauthorized' });

    expect(falhou).toBe(true);
    expect(service.role()).toBeNull();
  });

  it('loginEstacao define role OPERADOR e a estacaoId recebida', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    service.loginEstacao('est-tok-01').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/auth/login-estacao`);
    expect(req.request.body).toEqual({ token: 'est-tok-01' });
    req.flush({ papel: 'OPERADOR', estacaoId: 'EST-01', empresaId: 'demo' });

    expect(service.role()).toBe('OPERADOR');
    expect(service.estacaoId()).toBe('EST-01');
  });

  it('logout limpa a sessao local de imediato, sem esperar a resposta do servidor', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'gestor1', empresaId: 'demo' });
    expect(service.role()).toBe('GESTOR');

    service.logout();

    expect(service.role()).toBeNull();
    expect(service.estacaoId()).toBeNull();
    const req = http.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.withCredentials).toBe(true);
    req.flush(null);
  });

  it('bootstrap envia empresaId/empresaNome e atualiza os signals a partir da resposta', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    service.bootstrap('gestor', 'senha123', 'acme', 'Acme Industrial').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/setup`);
    expect(req.request.body).toEqual({
      username: 'gestor', password: 'senha123', empresaId: 'acme', empresaNome: 'Acme Industrial',
    });
    req.flush({ papel: 'GESTOR', username: 'gestor@acme', empresaId: 'acme', empresaNome: 'Acme Industrial' });

    expect(service.role()).toBe('GESTOR');
    expect(service.empresaId()).toBe('acme');
    expect(service.empresaNome()).toBe('Acme Industrial');
  });

  it('bootstrap cria o gestor mestre e autentica a sessao, igual ao login', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    service.bootstrap('admin', 'senhaAdmin1', 'acme', 'Acme').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/setup`);
    expect(req.request.body).toEqual({
      username: 'admin', password: 'senhaAdmin1', empresaId: 'acme', empresaNome: 'Acme',
    });
    expect(req.request.withCredentials).toBe(true);
    req.flush({ papel: 'GESTOR', username: 'admin', empresaId: 'acme' });

    expect(service.role()).toBe('GESTOR');
    expect(service.estacaoId()).toBeNull();
  });

  it('bootstrap com setup ja concluido (409) propaga o erro para quem chamou', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    let falhou = false;
    service.bootstrap('admin', 'senhaAdmin1', 'acme', 'Acme').subscribe({ error: () => { falhou = true; } });

    http.expectOne(`${environment.apiUrl}/setup`)
      .flush({ erro: 'Setup já concluído' }, { status: 409, statusText: 'Conflict' });

    expect(falhou).toBe(true);
    expect(service.role()).toBeNull();
  });

  describe('troca de sessão limpa os dados de quem saiu', () => {
    // Stores são singletons de raiz: sem a limpeza, quem entrasse depois na
    // mesma aba (outra empresa, ou um operador no kiosk) via os dados do anterior.
    // Store novo com dado da empresa/usuário entra aqui (ver TrocaDeSessao).
    const api = environment.apiUrl;

    function popularStores() {
      const stores = {
        incidents: TestBed.inject(IncidentService),
        catalog: TestBed.inject(CatalogService),
        epis: TestBed.inject(EpiChecklistService),
        team: TestBed.inject(TeamService),
        webhooks: TestBed.inject(WebhookService),
        zonas: TestBed.inject(ZoneService),
        mcp: TestBed.inject(McpCredentialService),
      };
      stores.incidents.upsert({ incidentKey: 'k-antigo', detectedAt: '2026-09-22T10:00:00Z' } as Incident);
      stores.incidents.loadSummary();
      http.expectOne(r => r.url === `${api}/summary`).flush({ incidentesHoje: 1 });
      stores.incidents.loadNaoLidas();
      http.expectOne(`${api}/notificacoes/contagem-nao-lidas`).flush({ naoLidas: 3 });
      stores.catalog.load();
      http.expectOne(`${api}/cameras`).flush([{ id: 'CAM-01' }]);
      http.expectOne(r => r.url === `${api}/stations`).flush([{ id: 'EST-01', cameras: [] }]);
      stores.epis.load();
      http.expectOne(`${api}/config/epis`).flush({ epis: ['capacete'] });
      stores.team.load();
      http.expectOne(`${api}/teams`).flush([{ id: 'EQ-1' }]);
      http.expectOne(`${api}/users`).flush([{ username: 'u1' }]);
      stores.webhooks.load();
      http.expectOne(`${api}/webhooks`).flush([{ id: 1 }]);
      stores.zonas.load('CAM-01');
      http.expectOne(`${api}/cameras/CAM-01/zones`).flush([{ id: 1 }]);
      stores.mcp.load();
      http.expectOne(`${api}/mcp-credentials`).flush([{ id: 1 }]);
      return stores;
    }

    type Stores = ReturnType<typeof popularStores>;

    /** Um valor por dado de sessão; vazio em todos depois da troca. */
    function retrato(s: Stores) {
      return {
        incidents: s.incidents.incidents().length,
        summary: s.incidents.summary() !== null,
        naoLidas: s.incidents.naoLidas(),
        cameras: s.catalog.cameras().length,
        stations: s.catalog.stations().length,
        epis: s.epis.epis().length,
        equipes: s.team.equipes().length,
        usuarios: s.team.usuarios().length,
        webhooks: s.webhooks.assinantes().length,
        zonas: s.zonas.zonas().length,
        mcp: s.mcp.credenciais().length,
      };
    }

    const vazio = {
      incidents: 0, summary: false, naoLidas: 0, cameras: 0, stations: 0, epis: 0,
      equipes: 0, usuarios: 0, webhooks: 0, zonas: 0, mcp: 0,
    };

    beforeEach(() => {
      http.expectOne(`${api}/auth/me`).flush({ papel: 'GESTOR', username: 'g1', empresaId: 'demo' });
    });

    it('controle: sem troca de sessão, todos os stores ficam populados', () => {
      expect(retrato(popularStores())).toEqual({
        incidents: 1, summary: true, naoLidas: 3, cameras: 1, stations: 1, epis: 1,
        equipes: 1, usuarios: 1, webhooks: 1, zonas: 1, mcp: 1,
      });
    });

    const fluxos: { nome: string; trocar: () => void }[] = [
      {
        nome: 'logout',
        trocar: () => {
          service.logout();
          http.expectOne(`${api}/auth/logout`).flush(null);
        },
      },
      {
        nome: 'login de outro usuário na mesma aba (ex.: sessão expirada, sem logout)',
        trocar: () => {
          service.login('outro@acme', 'senha').subscribe();
          http.expectOne(`${api}/auth/login`)
            .flush({ papel: 'GESTOR', username: 'outro@acme', empresaId: 'acme' });
        },
      },
      {
        nome: 'login do kiosk',
        trocar: () => {
          service.loginEstacao('token-est').subscribe();
          http.expectOne(`${api}/auth/login-estacao`)
            .flush({ papel: 'OPERADOR', estacaoId: 'EST-02', empresaId: 'demo' });
        },
      },
      {
        nome: 'setup (bootstrap do gestor mestre)',
        trocar: () => {
          service.bootstrap('admin', 'senhaAdmin1', 'acme', 'Acme').subscribe();
          http.expectOne(`${api}/setup`).flush({ papel: 'GESTOR', username: 'admin@acme', empresaId: 'acme' });
        },
      },
    ];

    for (const { nome, trocar } of fluxos) {
      it(`${nome} limpa todos os stores`, () => {
        const stores = popularStores();

        trocar();

        expect(retrato(stores)).toEqual(vazio);
      });
    }

    it('resposta da sessão anterior ainda em voo é cancelada, não repovoa o store', () => {
      const catalog = TestBed.inject(CatalogService);
      const incidents = TestBed.inject(IncidentService);
      catalog.load();
      incidents.loadSummary();
      const cameras = http.expectOne(`${api}/cameras`);
      const stations = http.expectOne(r => r.url === `${api}/stations`);
      const summary = http.expectOne(r => r.url === `${api}/summary`);

      service.logout();
      http.expectOne(`${api}/auth/logout`).flush(null);

      expect(cameras.cancelled).toBe(true);
      expect(stations.cancelled).toBe(true);
      expect(summary.cancelled).toBe(true);
      expect(catalog.cameras()).toEqual([]);
      expect(incidents.summary()).toBeNull();
    });

    it('depois da troca, leituras da sessão nova voltam a preencher o store', () => {
      const catalog = TestBed.inject(CatalogService);
      service.logout();
      http.expectOne(`${api}/auth/logout`).flush(null);

      catalog.load();
      http.expectOne(`${api}/cameras`).flush([{ id: 'CAM-02' }]);
      http.expectOne(r => r.url === `${api}/stations`).flush([]);

      expect(catalog.cameras().map(c => c.id)).toEqual(['CAM-02']);
    });
  });
});
