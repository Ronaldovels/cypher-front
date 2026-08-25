import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ChromeTopbarComponent } from './chrome-topbar.component';
import { ThemeService } from '../theme.service';

describe('ChromeTopbarComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
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

  function montarComo(papel: 'GESTOR' | 'OPERADOR' | null) {
    const fixture = TestBed.createComponent(ChromeTopbarComponent);
    fixture.detectChanges();
    const req = http.expectOne(`${environment.apiUrl}/auth/me`);
    if (papel === 'GESTOR') {
      req.flush({ papel: 'GESTOR', username: 'g1' });
    } else if (papel === 'OPERADOR') {
      req.flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
    } else {
      req.flush(null, { status: 401, statusText: 'Unauthorized' });
    }
    fixture.detectChanges();
    return fixture;
  }

  it('tem um botão que troca o tema', () => {
    const fixture = montarComo('GESTOR');
    const theme = TestBed.inject(ThemeService);
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="theme-toggle"]');

    expect(botao).not.toBeNull();
    botao.click();

    expect(theme.theme()).toBe('light');
  });

  it('o botão diz para onde vai, não onde está', () => {
    const fixture = montarComo('GESTOR');
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="theme-toggle"]');

    expect(botao.getAttribute('aria-label')).toBe('Mudar para tema claro');

    botao.click();
    fixture.detectChanges();

    expect(botao.getAttribute('aria-label')).toBe('Mudar para tema escuro');
  });

  it('para GESTOR, a engrenagem leva para a pagina de configuracoes', () => {
    const fixture = montarComo('GESTOR');
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('[data-test="open-settings"]');

    expect(link.getAttribute('href')).toBe('/config/identidade');
    expect(link.getAttribute('aria-label')).toBe('Configurações');
  });

  it('para GESTOR, o logotipo leva para o dashboard', () => {
    const fixture = montarComo('GESTOR');
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('[data-test="brand-logo"]');

    expect(link.getAttribute('href')).toBe('/dashboard');
    expect(link.getAttribute('title')).toBe('Dashboard');
  });

  it('para OPERADOR, nao mostra a engrenagem nem o link do dashboard (nao tem acesso a /config nem a /dashboard)', () => {
    const fixture = montarComo('OPERADOR');

    expect(fixture.nativeElement.querySelector('[data-test="open-settings"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[data-test="brand-logo"]')).toBeNull();
  });

  it('botao de sair chama logout e navega para /login quando GESTOR', () => {
    const fixture = montarComo('GESTOR');
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate');
    const logout = vi.spyOn(auth, 'logout');
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="logout"]');

    botao.click();
    http.expectOne(`${environment.apiUrl}/auth/logout`).flush(null);

    expect(logout).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith(['/login']);
  });

  it('botao de sair navega para /login-estacao quando OPERADOR', () => {
    const fixture = montarComo('OPERADOR');
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate');
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="logout"]');

    botao.click();
    http.expectOne(`${environment.apiUrl}/auth/logout`).flush(null);

    expect(navegar).toHaveBeenCalledWith(['/login-estacao']);
  });
});
