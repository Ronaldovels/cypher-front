import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import { OnboardingService } from './onboarding.service';
import { ThemeService } from '../shared/theme.service';
import { STEPS } from './models/onboarding.models';

describe('OnboardingService e o tema', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  it('o wizard enxerga o tema trocado fora dele', () => {
    const theme = TestBed.inject(ThemeService);
    const state = TestBed.inject(OnboardingService);
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    // Simula o toggle da topbar do dashboard, depois de o wizard já existir.
    theme.set('light');

    // Guardar uma cópia em data() não passaria aqui: o effect do serviço só
    // reage a mudanças de data(), e data() não mudou.
    expect(theme.theme()).toBe('light');
    expect(state.data()).not.toHaveProperty('theme');
  });

  it('persistConfig não grava mais o tema em cypher.config, nem a credencial do gestor mestre', () => {
    const state = TestBed.inject(OnboardingService);
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    state.updateData({ company: 'Acme', masterUsername: 'admin', masterPassword: 'senhaAdmin1' });

    state.persistConfig();

    const gravado = JSON.parse(localStorage.getItem('cypher.config')!);
    expect(gravado.company).toBe('Acme');
    expect(gravado).not.toHaveProperty('theme');
    expect(gravado).not.toHaveProperty('masterUsername');
    expect(gravado).not.toHaveProperty('masterPassword');
  });
});

describe('OnboardingService — passo de estações e usuário mestre', () => {
  let service: OnboardingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        provideHttpClient(withFetch()), provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(OnboardingService);
    http = TestBed.inject(HttpTestingController);
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
  });

  it('o wizard tem seis passos, com o usuario mestre logo apos a identidade', () => {
    expect(STEPS.map(s => s.key))
      .toEqual(['identity', 'master-user', 'stations', 'epis', 'cas', 'launch']);
  });

  it('valida por chave, nao por posicao', () => {
    // EPIs agora estão no índice 3. Se a validação fosse posicional, este
    // passo cairia na regra de identidade e passaria com EPIs vazios.
    service.updateData({ company: 'Acme', sector: 'Metalurgia', epis: [] });

    const indiceEpis = STEPS.findIndex(s => s.key === 'epis');
    expect(service.validateStep(indiceEpis)).toBe(false);
    expect(service.errors()['epis']).toBeTruthy();
  });

  it('identidade continua validada na sua nova posicao', () => {
    const indiceIdentidade = STEPS.findIndex(s => s.key === 'identity');

    expect(service.validateStep(indiceIdentidade)).toBe(false);
    expect(service.errors()['company']).toBeTruthy();
  });

  it('valida o passo "identity" exigindo empresaSlug em formato valido', () => {
    service.step.set(0);
    service.updateData({ company: 'Acme', sector: 'Metalurgia', empresaSlug: '' });
    expect(service.validateStep(0)).toBe(false);
    expect(service.errors()['empresaSlug']).toBeTruthy();

    service.updateData({ empresaSlug: 'Acme Com Espaco' });
    expect(service.validateStep(0)).toBe(false);

    service.updateData({ empresaSlug: 'acme' });
    expect(service.validateStep(0)).toBe(true);
  });

  it('valida o usuario mestre por chave, nao por posicao', () => {
    service.updateData({ masterUsername: '', masterPassword: '' });

    const indiceMasterUser = STEPS.findIndex(s => s.key === 'master-user');
    expect(service.validateStep(indiceMasterUser)).toBe(false);
    expect(service.errors()['masterUsername']).toBeTruthy();
    expect(service.errors()['masterPassword']).toBeTruthy();

    service.updateData({ masterUsername: 'admin', masterPassword: 'senhaAdmin1' });
    expect(service.validateStep(indiceMasterUser)).toBe(true);
  });

  it('o passo de estacoes nao bloqueia o avanco', () => {
    // Bloquear tornaria o onboarding um beco sem saída quando a API está
    // fora: o gestor não conseguiria nem chegar ao dashboard para descobrir
    // por quê. O aviso fica na tela do passo.
    const indiceEstacoes = STEPS.findIndex(s => s.key === 'stations');

    expect(service.validateStep(indiceEstacoes)).toBe(true);
  });

  it('avanca ate o ultimo passo', () => {
    service.updateData({
      company: 'Acme', empresaSlug: 'acme', sector: 'Metalurgia', epis: ['capacete'],
      masterUsername: 'admin', masterPassword: 'senhaAdmin1',
    });

    for (let i = 0; i < STEPS.length - 1; i++) {
      service.next();
    }

    expect(service.step()).toBe(STEPS.length - 1);
  });

  it('nao passa do ultimo passo', () => {
    service.updateData({
      company: 'Acme', empresaSlug: 'acme', sector: 'Metalurgia', epis: ['capacete'],
      masterUsername: 'admin', masterPassword: 'senhaAdmin1',
    });
    for (let i = 0; i < STEPS.length + 3; i++) {
      service.next();
    }

    expect(service.step()).toBe(STEPS.length - 1);
  });
});

describe('OnboardingService — bootstrap do gestor mestre no launch() (design doc de E4, §2.5/§4.2.1)', () => {
  let service: OnboardingService;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        provideHttpClient(withFetch()), provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(OnboardingService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    // Fake timers só depois do setup do TestBed/AuthService: launch() é o
    // único código deste describe que usa setTimeout, e nada na construção
    // do injector precisa de um relógio real fake para resolver.
    vi.useFakeTimers();
    service.updateData({
      company: 'Acme', empresaSlug: 'acme', sector: 'Metalurgia', epis: ['capacete'],
      masterUsername: 'admin', masterPassword: 'senhaAdmin1',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('launch chama POST /setup antes de persistConfig, autentica a sessao e navega ao sucesso', () => {
    const navegar = vi.spyOn(router, 'navigate');

    service.launch();

    const req = http.expectOne(`${environment.apiUrl}/setup`);
    expect(req.request.body).toEqual({ username: 'admin', password: 'senhaAdmin1' });
    expect(req.request.withCredentials).toBe(true);
    req.flush({ papel: 'GESTOR', username: 'admin' });

    vi.advanceTimersByTime(900);
    expect(service.launched()).toBe(true);
    expect(JSON.parse(localStorage.getItem('cypher.config')!).company).toBe('Acme');

    vi.advanceTimersByTime(2400);
    expect(navegar).toHaveBeenCalledWith(['/dashboard']);
  });

  it('bootstrap com 409 (setup ja concluido) mantem no passo de confirmacao, com erro visivel, sem navegar', () => {
    const navegar = vi.spyOn(router, 'navigate');

    service.launch();

    http.expectOne(`${environment.apiUrl}/setup`)
      .flush({ erro: 'Setup já concluído' }, { status: 409, statusText: 'Conflict' });

    expect(service.launching()).toBe(false);
    expect(service.launched()).toBe(false);
    expect(service.setupError()).toBe('Setup já concluído');
    expect(localStorage.getItem('cypher.config')).toBeNull();

    vi.advanceTimersByTime(3300);
    expect(navegar).not.toHaveBeenCalled();
  });

  it('erro de rede no bootstrap tambem mantem no passo de confirmacao, com mensagem visivel', () => {
    service.launch();

    http.expectOne(`${environment.apiUrl}/setup`).error(new ProgressEvent('network error'));

    expect(service.launching()).toBe(false);
    expect(service.launched()).toBe(false);
    expect(service.setupError()).toBeTruthy();
  });
});
