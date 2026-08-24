import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { UsuariosConfigComponent } from './usuarios-config.component';

describe('UsuariosConfigComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function montar() {
    const fixture = TestBed.createComponent(UsuariosConfigComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([
      { username: 'gestor.demo', papel: 'GESTOR' },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  it('lista os usuarios cadastrados, sem senha em tela', () => {
    const fixture = montar();

    expect(fixture.nativeElement.textContent).toContain('gestor.demo');
  });

  it('cadastro sem senha mostra erro e nao envia', () => {
    const fixture = montar();
    fixture.componentInstance.novoUsuario.set({ username: 'novo', papel: 'OPERADOR', password: '' });

    fixture.componentInstance.salvar();

    expect(fixture.componentInstance.erro()).toContain('senha');
    http.expectNone((r) => r.method === 'POST' && r.url === `${environment.apiUrl}/users`);
  });

  it('salvar com senha cadastra e limpa o rascunho', () => {
    const fixture = montar();
    fixture.componentInstance.novoUsuario.set({ username: 'novo', papel: 'OPERADOR', password: 'senha123' });

    fixture.componentInstance.salvar();

    const req = http.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.body).toEqual({ username: 'novo', papel: 'OPERADOR', password: 'senha123' });
    req.flush({ username: 'novo', papel: 'OPERADOR' });

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);

    expect(fixture.componentInstance.novoUsuario().username).toBe('');
  });

  it('remover chama deleteUsuario', () => {
    const fixture = montar();

    fixture.componentInstance.remover('gestor.demo');

    http.expectOne(`${environment.apiUrl}/users/gestor.demo`).flush(null);
    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });
});
