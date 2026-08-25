import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import { TOKENS_ESTACAO } from '../shared/mock/fixtures';
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';
import { LoginEstacaoComponent } from './login-estacao.component';

describe('LoginEstacaoComponent', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: USE_MOCK_DATA, useValue: false },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  function montar() {
    const fixture = TestBed.createComponent(LoginEstacaoComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    return fixture;
  }

  it('sem token, nao envia e mostra erro', () => {
    const fixture = montar();

    fixture.componentInstance.entrar();

    expect(fixture.componentInstance.erro()).toContain('Cole o token');
    http.expectNone(`${environment.apiUrl}/auth/login-estacao`);
  });

  it('token valido navega para /estacao/:estacaoId da resposta', () => {
    const fixture = montar();
    const navegar = vi.spyOn(router, 'navigate');
    fixture.componentInstance.patch('est-tok-01');

    fixture.componentInstance.entrar();

    const req = http.expectOne(`${environment.apiUrl}/auth/login-estacao`);
    expect(req.request.body).toEqual({ token: 'est-tok-01' });
    req.flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });

    expect(navegar).toHaveBeenCalledWith(['/estacao', 'EST-01']);
  });

  it('token invalido mostra a mensagem do backend, sem navegar', () => {
    const fixture = montar();
    const navegar = vi.spyOn(router, 'navigate');
    fixture.componentInstance.patch('token-errado');

    fixture.componentInstance.entrar();

    http.expectOne(`${environment.apiUrl}/auth/login-estacao`)
      .flush({ erro: 'Token inválido' }, { status: 401, statusText: 'Unauthorized' });

    expect(fixture.componentInstance.erro()).toBe('Token inválido');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('alternarTema chama o ThemeService.toggle', () => {
    const fixture = montar();
    const antes = fixture.componentInstance.temaEscuro();

    fixture.componentInstance.alternarTema();

    expect(fixture.componentInstance.temaEscuro()).toBe(!antes);
  });

  it('link de volta leva ao login do gestor', () => {
    const fixture = montar();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.auth-alt-link');
    expect(link.getAttribute('href')).toBe('/login');
  });
});

describe('LoginEstacaoComponent — modo de exemplo', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: USE_MOCK_DATA, useValue: true },
      ],
    });
  });

  it('mostra um token de demonstracao', async () => {
    const { environment: env } = await import('../../environments/environment');
    const fixture = TestBed.createComponent(LoginEstacaoComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${env.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(TOKENS_ESTACAO['EST-01']);
  });
});
