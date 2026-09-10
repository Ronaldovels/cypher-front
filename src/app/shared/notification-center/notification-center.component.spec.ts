import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { NotificationCenterComponent } from './notification-center.component';

describe('NotificationCenterComponent', () => {
  let http: HttpTestingController;

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
  });

  afterEach(() => {
    // O componente reparenta seu próprio elemento hospedeiro para
    // `document.body` (ver ngOnInit) — sem limpar, um fixture de um teste
    // anterior deixaria um `.notif-offcanvas` órfão em `document.body` que
    // poderia satisfazer indevidamente a asserção de um teste seguinte.
    document.querySelectorAll('app-notification-center').forEach(el => el.remove());
  });

  function notificacao(overrides: Partial<{ id: number; lida: boolean }> = {}) {
    return {
      id: 1, cameraId: 'CAM-01', type: 'FALL_RISK', severity: 4, nivel: 'ALTO',
      descricao: 'Queda detectada', detectedAt: '2026-09-07T10:00:00Z', lida: false,
      ...overrides,
    };
  }

  it('nao busca nada enquanto fechado', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.detectChanges();

    http.expectNone(`${environment.apiUrl}/notificacoes`);
  });

  it('ao abrir, busca a lista e marca como lidas as que vieram nao-lidas', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([notificacao({ id: 1, lida: false })]);

    const marcar = http.expectOne(`${environment.apiUrl}/notificacoes/marcar-lidas`);
    expect(marcar.request.body).toEqual({ alertaIds: [1] });
    marcar.flush(null);
    http.expectOne(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`).flush({ naoLidas: 0 });

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notif-row')).not.toBeNull();
  });

  it('nao chama marcar-lidas quando a lista ja vem toda lida', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([notificacao({ id: 1, lida: true })]);

    http.expectNone(`${environment.apiUrl}/notificacoes/marcar-lidas`);
  });

  it('mostra estado vazio quando nao ha notificacao', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nenhuma notificação por aqui');
  });

  it('mostra o rotulo do tipo de incidente, nao o enum cru', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([notificacao({ id: 1, lida: true })]);
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector('.chip') as HTMLElement;
    expect(chip.textContent).toContain('Queda / risco imediato');
    expect(chip.textContent).not.toContain('FALL_RISK');
  });

  it('mostra estado de carregamento enquanto a busca esta pendente, sem piscar o vazio', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/notificacoes`);
    expect(fixture.nativeElement.textContent).toContain('carregando');
    expect(fixture.nativeElement.textContent).not.toContain('Nenhuma notificação por aqui');
  });

  it('mostra mensagem de erro distinta do vazio quando a busca falha', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/notificacoes`)
      .flush({ erro: 'Falha ao buscar notificacoes' }, { status: 500, statusText: 'Erro' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Falha ao buscar notificacoes');
    expect(fixture.nativeElement.textContent).not.toContain('Nenhuma notificação por aqui');
  });

  it('clicar numa notificacao navega para o incidente e fecha', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([notificacao({ id: 7, lida: true })]);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate');
    let fechou = false;
    fixture.componentRef.setInput('open', true);
    fixture.componentInstance.closed.subscribe(() => (fechou = true));

    (fixture.nativeElement.querySelector('.notif-row') as HTMLButtonElement).click();

    expect(navegar).toHaveBeenCalledWith(['/incidentes', 7]);
    expect(fechou).toBe(true);
  });

  it('a aside tem aria-modal="true" para semantica correta de modal', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([]);
    fixture.detectChanges();

    const aside = fixture.nativeElement.querySelector('.notif-offcanvas') as HTMLElement;
    expect(aside.getAttribute('aria-modal')).toBe('true');
  });

  it('fecha ao pressionar Escape quando esta aberto', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([]);
    fixture.detectChanges();

    let fechou = false;
    fixture.componentInstance.closed.subscribe(() => (fechou = true));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(fechou).toBe(true);
  });

  it('nao emite fechar ao pressionar Escape quando ja esta fechado', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.detectChanges();

    let fechou = false;
    fixture.componentInstance.closed.subscribe(() => (fechou = true));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(fechou).toBe(false);
  });

  it('move o proprio elemento hospedeiro para document.body (fora do contexto de empilhamento do topbar)', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.parentElement).toBe(document.body);
  });
});
