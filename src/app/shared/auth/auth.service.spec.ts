import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { CatalogService } from '../catalog.service';
import { Incident } from '../incident.models';
import { IncidentService } from '../incident.service';
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
    const incidenteDaSessaoAnterior = { incidentKey: 'k-antigo', detectedAt: '2026-09-22T10:00:00Z' } as Incident;

    function popularStores(): { incidents: IncidentService; catalog: CatalogService } {
      const incidents = TestBed.inject(IncidentService);
      const catalog = TestBed.inject(CatalogService);
      incidents.upsert(incidenteDaSessaoAnterior);
      catalog.load();
      http.expectOne(`${environment.apiUrl}/cameras`).flush([{ id: 'CAM-01' }]);
      http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([{ id: 'EST-01', cameras: [] }]);
      expect(incidents.incidents().length).toBe(1);
      expect(catalog.cameras().length).toBe(1);
      return { incidents, catalog };
    }

    it('logout', () => {
      http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1', empresaId: 'demo' });
      const { incidents, catalog } = popularStores();

      service.logout();
      http.expectOne(`${environment.apiUrl}/auth/logout`).flush(null);

      expect(incidents.incidents()).toEqual([]);
      expect(catalog.cameras()).toEqual([]);
      expect(catalog.stations()).toEqual([]);
    });

    it('login de outro usuário na mesma aba (ex.: sessão expirada, sem logout)', () => {
      http.expectOne(`${environment.apiUrl}/auth/me`).flush(null, { status: 401, statusText: 'Unauthorized' });
      const { incidents, catalog } = popularStores();

      service.login('outro@acme', 'senha').subscribe();
      http.expectOne(`${environment.apiUrl}/auth/login`)
        .flush({ papel: 'GESTOR', username: 'outro@acme', empresaId: 'acme' });

      expect(incidents.incidents()).toEqual([]);
      expect(catalog.cameras()).toEqual([]);
    });

    it('login do kiosk', () => {
      http.expectOne(`${environment.apiUrl}/auth/me`).flush(null, { status: 401, statusText: 'Unauthorized' });
      const { incidents } = popularStores();

      service.loginEstacao('token-est').subscribe();
      http.expectOne(`${environment.apiUrl}/auth/login-estacao`)
        .flush({ papel: 'OPERADOR', estacaoId: 'EST-02', empresaId: 'demo' });

      expect(incidents.incidents()).toEqual([]);
    });
  });
});
