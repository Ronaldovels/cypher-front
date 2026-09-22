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
  canActivateAutenticado, canActivateGestor, canActivateOperadorOuGestor,
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

  it('/incidentes, /incidentes/:id e /estacoes exigem qualquer papel autenticado', () => {
    expect(routes.find(r => r.path === 'incidentes')?.canActivate).toEqual([canActivateAutenticado]);
    expect(routes.find(r => r.path === 'incidentes/:id')?.canActivate).toEqual([canActivateAutenticado]);
    expect(routes.find(r => r.path === 'estacoes')?.canActivate).toEqual([canActivateAutenticado]);
  });

  it('/login e /login-estacao existem e nao tem guard', () => {
    expect(routes.find(r => r.path === 'login')).toBeDefined();
    expect(routes.find(r => r.path === 'login')?.canActivate).toBeUndefined();
    expect(routes.find(r => r.path === 'login-estacao')).toBeDefined();
    expect(routes.find(r => r.path === 'login-estacao')?.canActivate).toBeUndefined();
  });
});

describe('routes — filhas de /config', () => {
  it('/config/webhooks existe como filha de /config', () => {
    const config = routes.find(r => r.path === 'config');
    expect(config?.children?.find(c => c.path === 'webhooks')).toBeDefined();
  });

  it('as demais abas de /config continuam presentes', () => {
    const config = routes.find(r => r.path === 'config');
    expect(config?.children?.find(c => c.path === 'estacoes')).toBeDefined();
    expect(config?.children?.find(c => c.path === 'identidade')).toBeDefined();
    expect(config?.children?.find(c => c.path === 'epis')).toBeDefined();
    expect(config?.children?.find(c => c.path === 'cas')).toBeDefined();
    expect(config?.children?.find(c => c.path === 'equipe')).toBeDefined();
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

    expect(router.url).toBe('/login?returnUrl=%2Fdashboard');
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

    expect(router.url).toBe('/login?returnUrl=%2Fconfig%2Festacoes');
  });

  for (const url of ['/incidentes', '/incidentes/1', '/estacoes']) {
    it(`${url} sem sessao redireciona para /login, guardando a URL pedida`, async () => {
      const harness = await RouterTestingHarness.create();
      const promessa = harness.navigateByUrl(url);
      await new Promise(resolve => setTimeout(resolve));
      http.expectOne(`${environment.apiUrl}/auth/me`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      await promessa;

      expect(router.url).toBe(`/login?returnUrl=${encodeURIComponent(url)}`);
    });
  }

  // O backend serve incidentes e câmeras/estações aos dois papéis.
  const sessoes = {
    GESTOR: { papel: 'GESTOR', username: 'g1', empresaId: 'demo' },
    OPERADOR: { papel: 'OPERADOR', estacaoId: 'EST-01', empresaId: 'demo' },
  };
  for (const url of ['/incidentes', '/incidentes/1', '/estacoes']) {
    for (const [papel, sessao] of Object.entries(sessoes)) {
      it(`${url} continua aberto para ${papel}`, async () => {
        const harness = await RouterTestingHarness.create();
        const promessa = harness.navigateByUrl(url);
        await new Promise(resolve => setTimeout(resolve));
        http.expectOne(`${environment.apiUrl}/auth/me`).flush(sessao);
        await promessa;

        expect(router.url).toBe(url);
      });
    }
  }
});
