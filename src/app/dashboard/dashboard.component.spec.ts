import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { EVENT_SOURCE_FACTORY, EventSourceLike } from '../shared/event-source.factory';
import { IncidentService } from '../shared/incident.service';
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';
import { DashboardComponent } from './dashboard.component';

const SSE_INERTE: EventSourceLike = {
  addEventListener: () => { },
  close: () => { },
  onopen: null,
  onerror: null,
};

describe('DashboardComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: EVENT_SOURCE_FACTORY, useValue: () => SSE_INERTE },
        // O alvo de teste usa a configuração development, onde useMockData é
        // true. Sem esta linha o badge diria "dados de exemplo".
        { provide: USE_MOCK_DATA, useValue: false },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('não exporta mais constantes de dados fabricados', async () => {
    const modulo: Record<string, unknown> = await import('./dashboard.component');

    expect(modulo['KPI_DATA']).toBeUndefined();
    expect(modulo['ALERTS']).toBeUndefined();
    expect(modulo['BAR_DATA']).toBeUndefined();
    expect(modulo['HEAT_DATA']).toBeUndefined();
  });

  it('mostra os KPIs vindos do endpoint de agregados', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 6, incidentesOntem: 4, criticosHoje: 2, pendentes: 5,
      heatmap: [], ultimosSeteDias: [],
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.incidentesHoje()).toBe(6);
    expect(fixture.componentInstance.variacaoVsOntem()).toBe('↑ 2 vs ontem');
  });

  it('lista os incidentes recentes do store', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const service = TestBed.inject(IncidentService);
    fixture.detectChanges();

    service.upsert({
      id: 1, incidentKey: 'k1', cameraId: 'CAM-01', runId: 'r', trackId: 1,
      type: 'FALL_RISK', severity: 4, nivel: 'ALTO', descricao: 'Queda',
      reason: 'fallen_sustained', postureCategory: 'immediate_risk',
      rebaScore: 11, actionLevel: 4, zoneName: null, zoneStatus: 'outside',
      epiPresent: [], epiMissing: [], snapshotUrl: null,
      detectedAt: '2026-08-10T14:31:00-03:00', endedAt: null,
      durationSeconds: null, peakSeverity: 4, closedReason: null, status: 'PENDENTE',
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.recentes().length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('14:31');
  });

  it('sem dados, mostra zero em vez de número inventado', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.incidentesHoje()).toBe(0);
    expect(fixture.componentInstance.recentes()).toEqual([]);
  });

  it('renderiza o badge de conexão', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-connection-badge')).not.toBeNull();
  });

  it('não renderiza os literais fabricados que o mock antigo escrevia na tela', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const texto = (fixture.nativeElement.textContent as string) ?? '';
    for (const literal of ['Ana', '17 câmeras', '94.2', 'média 6.1', 'Turno A']) {
      expect(texto).not.toContain(literal);
    }
  });
});
