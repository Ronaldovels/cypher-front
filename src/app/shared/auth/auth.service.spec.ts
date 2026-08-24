import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
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
    req.flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });

    expect(service.role()).toBe('OPERADOR');
    expect(service.estacaoId()).toBe('EST-01');
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
    req.flush({ papel: 'GESTOR', username: 'gestor1' });

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
    req.flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });

    expect(service.role()).toBe('OPERADOR');
    expect(service.estacaoId()).toBe('EST-01');
  });

  it('logout limpa a sessao local de imediato, sem esperar a resposta do servidor', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'gestor1' });
    expect(service.role()).toBe('GESTOR');

    service.logout();

    expect(service.role()).toBeNull();
    expect(service.estacaoId()).toBeNull();
    const req = http.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.withCredentials).toBe(true);
    req.flush(null);
  });

  it('checkSetupStatus reflete o campo configured da resposta (design doc de E4, §2.5)', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    let configurado: boolean | undefined;
    service.checkSetupStatus().subscribe(v => { configurado = v; });

    const req = http.expectOne(`${environment.apiUrl}/setup/status`);
    expect(req.request.withCredentials).toBe(true);
    req.flush({ configured: true });

    expect(configurado).toBe(true);
  });

  it('bootstrap cria o gestor mestre e autentica a sessao, igual ao login', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    service.bootstrap('admin', 'senhaAdmin1').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/setup`);
    expect(req.request.body).toEqual({ username: 'admin', password: 'senhaAdmin1' });
    expect(req.request.withCredentials).toBe(true);
    req.flush({ papel: 'GESTOR', username: 'admin' });

    expect(service.role()).toBe('GESTOR');
    expect(service.estacaoId()).toBeNull();
  });

  it('bootstrap com setup ja concluido (409) propaga o erro para quem chamou', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    let falhou = false;
    service.bootstrap('admin', 'senhaAdmin1').subscribe({ error: () => { falhou = true; } });

    http.expectOne(`${environment.apiUrl}/setup`)
      .flush({ erro: 'Setup já concluído' }, { status: 409, statusText: 'Conflict' });

    expect(falhou).toBe(true);
    expect(service.role()).toBeNull();
  });
});
