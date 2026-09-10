import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
