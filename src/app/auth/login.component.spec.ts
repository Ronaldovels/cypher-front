import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import { GESTOR_DEMO } from '../shared/mock/fixtures';
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
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
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    return fixture;
  }

  it('sem usuario/senha, nao envia e mostra erro', () => {
    const fixture = montar();

    fixture.componentInstance.entrar();

    expect(fixture.componentInstance.erro()).toContain('Informe usuário e senha');
    http.expectNone(`${environment.apiUrl}/auth/login`);
  });

  it('login com sucesso navega para /dashboard', async () => {
    const fixture = montar();
    const navegar = vi.spyOn(router, 'navigate');
    fixture.componentInstance.patch({ username: 'gestor1', password: 'senha123' });

    fixture.componentInstance.entrar();

    const req = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.body).toEqual({ username: 'gestor1', password: 'senha123' });
    req.flush({ papel: 'GESTOR', username: 'gestor1' });

    expect(navegar).toHaveBeenCalledWith(['/dashboard']);
  });

  it('login de operador por credencial navega para /estacao/:id', async () => {
    const fixture = montar();
    const navegar = vi.spyOn(router, 'navigate');
    fixture.componentInstance.patch({ username: 'op1', password: 'senha123' });

    fixture.componentInstance.entrar();

    http.expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01', username: 'op1' });

    expect(navegar).toHaveBeenCalledWith(['/estacao', 'EST-01']);
  });

  it('alternarTema chama o ThemeService.toggle', () => {
    const fixture = montar();
    const antes = fixture.componentInstance.temaEscuro();

    fixture.componentInstance.alternarTema();

    expect(fixture.componentInstance.temaEscuro()).toBe(!antes);
  });

  it('credencial invalida mostra a mensagem do backend, sem navegar', () => {
    const fixture = montar();
    const navegar = vi.spyOn(router, 'navigate');
    fixture.componentInstance.patch({ username: 'gestor1', password: 'errada' });

    fixture.componentInstance.entrar();

    http.expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ erro: 'Usuário ou senha inválidos' }, { status: 401, statusText: 'Unauthorized' });

    expect(fixture.componentInstance.erro()).toBe('Usuário ou senha inválidos');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('sem modo de exemplo, nao mostra a dica de credencial', () => {
    const fixture = montar();

    expect(fixture.nativeElement.textContent).not.toContain(GESTOR_DEMO.username);
  });
});

describe('LoginComponent — modo de exemplo', () => {
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

  it('mostra a credencial de demonstracao', async () => {
    const { environment: env } = await import('../../environments/environment');
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${env.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(GESTOR_DEMO.username);
    expect(fixture.nativeElement.textContent).toContain(GESTOR_DEMO.password);
  });
});
