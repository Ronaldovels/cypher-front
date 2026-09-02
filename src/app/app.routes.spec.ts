import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import {
  canActivateGestor, canActivateOperadorOuGestor,
} from './shared/auth/auth.guards';

describe('routes — guards de acesso (design doc de E4, §4.3)', () => {
  it('/ nao tem guard (tela de duas acoes, nao depende de estado global)', () => {
    expect(routes.find(r => r.path === '')?.canActivate).toBeUndefined();
  });

  it('/onboarding usa o wizard, sem guard', () => {
    expect(routes.find(r => r.path === 'onboarding')).toBeDefined();
    expect(routes.find(r => r.path === 'onboarding')?.canActivate).toBeUndefined();
  });

  it('/dashboard e /heatmap exigem GESTOR', () => {
    expect(routes.find(r => r.path === 'dashboard')?.canActivate).toEqual([canActivateGestor]);
    expect(routes.find(r => r.path === 'heatmap')?.canActivate).toEqual([canActivateGestor]);
  });

  it('/config exige GESTOR', () => {
    expect(routes.find(r => r.path === 'config')?.canActivate).toEqual([canActivateGestor]);
  });

  it('/estacao/:id usa o guard combinado operador-ou-gestor', () => {
    expect(routes.find(r => r.path === 'estacao/:id')?.canActivate)
      .toEqual([canActivateOperadorOuGestor]);
  });

  it('/incidentes, /incidentes/:id e /estacoes continuam sem guard nesta entrega', () => {
    expect(routes.find(r => r.path === 'incidentes')?.canActivate).toBeUndefined();
    expect(routes.find(r => r.path === 'incidentes/:id')?.canActivate).toBeUndefined();
    expect(routes.find(r => r.path === 'estacoes')?.canActivate).toBeUndefined();
  });

  it('/login e /login-estacao existem e nao tem guard', () => {
    expect(routes.find(r => r.path === 'login')).toBeDefined();
    expect(routes.find(r => r.path === 'login')?.canActivate).toBeUndefined();
    expect(routes.find(r => r.path === 'login-estacao')).toBeDefined();
    expect(routes.find(r => r.path === 'login-estacao')?.canActivate).toBeUndefined();
  });
});

describe('routes — redirecionamento de ponta a ponta sem sessao', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  it('/dashboard sem sessao redireciona para /login', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/dashboard');
    // O Router só assina o Observable de canActivate depois de um tick de
    // macrotask; sem isso a requisição do guard ainda não existe quando
    // expectOne roda (canActivateGestor dispara GET /auth/me de forma
    // assíncrona dentro do pipeline de guards do Router).
    await new Promise(resolve => setTimeout(resolve));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await promessa;

    expect(router.url).toBe('/login');
  });

  it('/estacao/EST-01 sem sessao redireciona para /login-estacao', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/estacao/EST-01');
    await new Promise(resolve => setTimeout(resolve));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await promessa;

    expect(router.url).toBe('/login-estacao');
  });

  it('/config sem sessao redireciona para /login', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/config');
    await new Promise(resolve => setTimeout(resolve));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await promessa;

    expect(router.url).toBe('/login');
  });
});
