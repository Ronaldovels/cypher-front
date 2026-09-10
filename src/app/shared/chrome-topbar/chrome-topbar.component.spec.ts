import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
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
    // `app-notification-center` reparenta seu proprio host para
    // `document.body`; sem limpar, um fixture de teste anterior deixaria
    // um `.notif-offcanvas` orfao que poderia satisfazer indevidamente a
    // asercao de um teste seguinte.
    document.querySelectorAll('app-notification-center').forEach(el => el.remove());
  });

  function montarComo(papel: 'GESTOR' | 'OPERADOR' | null) {
    const fixture = TestBed.createComponent(ChromeTopbarComponent);
    fixture.detectChanges();
    const req = http.expectOne(`${environment.apiUrl}/auth/me`);
    if (papel === 'GESTOR') {
      req.flush({ papel: 'GESTOR', username: 'g1' });
      fixture.detectChanges();
      http.expectOne(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`).flush({ naoLidas: 0 });
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

  it('para OPERADOR, nao aparece o sino de notificacoes nem chama a contagem', () => {
    const fixture = montarComo('OPERADOR');

    expect(fixture.nativeElement.querySelector('[data-test="open-notifications"]')).toBeNull();
    http.expectNone(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`);
  });

  it('clicar no sino abre a central de notificacoes', () => {
    const fixture = montarComo('GESTOR');
    const sino: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="open-notifications"]');

    sino.click();
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([]);
    // O offcanvas reparenta seu host para `document.body` (fora do contexto
    // de empilhamento do topbar — ver notification-center.component.ts),
    // entao ele nao aparece mais dentro de `fixture.nativeElement`.
    expect(document.body.querySelector('.notif-offcanvas')).not.toBeNull();
  });
});

describe('ChromeTopbarComponent — nome da empresa (design doc de multi-tenant, §5)', () => {
  it('mostra empresaNome do AuthService quando nao ha config local', () => {
    const authStub = { role: signal('GESTOR'), empresaNome: signal('Acme Industrial') };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]),
        provideHttpClient(withFetch()), provideHttpClientTesting(),
        { provide: AuthService, useValue: authStub }],
    });
    const fixture = TestBed.createComponent(ChromeTopbarComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`).flush({ naoLidas: 0 });

    expect(fixture.componentInstance.company()).toBe('ACME INDUSTRIAL');
    expect(fixture.componentInstance.initial()).toBe('A');
  });

  it('empresaNome so com espaco em branco nao quebra o computed e cai no proximo fallback', () => {
    const authStub = { role: signal('GESTOR'), empresaNome: signal('   ') };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]),
        provideHttpClient(withFetch()), provideHttpClientTesting(),
        { provide: AuthService, useValue: authStub }],
    });
    const fixture = TestBed.createComponent(ChromeTopbarComponent);

    // empresaNome em branco + cfg.company presente -> usa cfg.company
    fixture.componentRef.setInput('cfg', { company: 'Acme' });
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`).flush({ naoLidas: 0 });
    expect(() => fixture.componentInstance.initial()).not.toThrow();
    expect(fixture.componentInstance.initial()).toBe('A');
    expect(fixture.componentInstance.company()).toBe('ACME');

    // empresaNome em branco + cfg.company tambem em branco -> literal 'C'/'CYPHER'
    fixture.componentRef.setInput('cfg', { company: '   ' });
    fixture.detectChanges();
    expect(fixture.componentInstance.initial()).toBe('C');
    expect(fixture.componentInstance.company()).toBe('CYPHER');
  });
});
