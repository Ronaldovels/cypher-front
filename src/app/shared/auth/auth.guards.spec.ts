import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter,
} from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import {
  canActivateAutenticado, canActivateGestor, canActivateOperador,
  canActivateOperadorOuGestor,
} from './auth.guards';

function rotaCom(id: string | null): ActivatedRouteSnapshot {
  return { paramMap: convertToParamMap(id ? { id } : {}) } as ActivatedRouteSnapshot;
}

async function resultadoDe(
  guarda: () => import('@angular/router').MaybeAsync<import('@angular/router').GuardResult>,
): Promise<boolean | UrlTree> {
  const valor = TestBed.runInInjectionContext(guarda);
  return firstValueFrom(valor as import('rxjs').Observable<boolean | UrlTree>);
}

describe('auth.guards', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  it('canActivateGestor libera GESTOR', async () => {
    const promessa = resultadoDe(() =>
      canActivateGestor(rotaCom(null), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });

    expect(await promessa).toBe(true);
  });

  it('canActivateGestor redireciona OPERADOR e anônimo para /login', async () => {
    const promessa = resultadoDe(() =>
      canActivateGestor(rotaCom(null), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    const resultado = await promessa;
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login');
  });

  it('canActivateOperador libera OPERADOR só quando :id bate com a propria estacaoId', async () => {
    const promessa = resultadoDe(() =>
      canActivateOperador(rotaCom('EST-01'), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });

    expect(await promessa).toBe(true);
  });

  it('canActivateOperador redireciona OPERADOR tentando entrar na estacao de outro', async () => {
    const promessa = resultadoDe(() =>
      canActivateOperador(rotaCom('EST-02'), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });

    const resultado = await promessa;
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login-estacao');
  });

  it('canActivateOperador redireciona GESTOR para /login-estacao (sem bypass)', async () => {
    const promessa = resultadoDe(() =>
      canActivateOperador(rotaCom('EST-01'), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });

    const resultado = await promessa;
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login-estacao');
  });

  it('canActivateOperadorOuGestor libera GESTOR em qualquer estacao', async () => {
    const promessa = resultadoDe(() =>
      canActivateOperadorOuGestor(rotaCom('EST-03'), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });

    expect(await promessa).toBe(true);
  });

  it('canActivateOperadorOuGestor libera OPERADOR só na propria estacao', async () => {
    const promessa = resultadoDe(() =>
      canActivateOperadorOuGestor(rotaCom('EST-02'), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });

    const resultado = await promessa;
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login-estacao');
  });

  it('canActivateAutenticado libera qualquer papel, redireciona anonimo', async () => {
    const liberado = resultadoDe(() =>
      canActivateAutenticado(rotaCom(null), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
    expect(await liberado).toBe(true);
  });
});
