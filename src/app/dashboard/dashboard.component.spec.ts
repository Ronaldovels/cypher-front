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
      normaAplicavel: null,
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

  it('"Ver todos" e "Resolver pendências" levam para a timeline de incidentes', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const links = (Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[])
      .filter(a => a.textContent?.includes('Ver todos') || a.textContent?.includes('Resolver pendências'));

    expect(links.length).toBe(2);
    links.forEach(a => expect(a.getAttribute('href')).toBe('/incidentes'));
  });

  it('mostra o dock para GESTOR', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-dock')).not.toBeNull();
  });

  it('nao mostra o dock sem sessao GESTOR', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-dock')).toBeNull();
  });
});

/**
 * Fake controlável do EventSource, para exercitar abertura e queda de conexão
 * nos testes de guarda abaixo. `SSE_INERTE` (usado no describe acima) nunca
 * dispara `onopen`/`onerror`, então não serve para esses casos.
 */
class EventSourceFake implements EventSourceLike {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  addEventListener(_type: string, _listener: (event: MessageEvent) => void): void { }
  close(): void { }

  abrir(): void {
    this.onopen?.(new Event('open'));
  }

  falhar(): void {
    this.onerror?.(new Event('error'));
  }
}

/**
 * Rede de segurança para as correções de dado fabricado desta task. Cada
 * asserção aqui precisa falhar se a correção correspondente for revertida —
 * a primeira versão desta rede (um único teste de `textContent.not.toContain`
 * com uma lista de strings) não cumpria isso: `'17 câmeras'` nunca aparece no
 * template (que sempre disse "câmeras cadastradas"), e o teste passava com
 * qualquer uma das oito correções desfeita. Esta versão prende cada item na
 * condição real que a correção estabeleceu.
 */
describe('DashboardComponent — guardas contra dado fabricado', () => {
  let http: HttpTestingController;
  let stream: EventSourceFake;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        {
          provide: EVENT_SOURCE_FACTORY,
          useValue: () => {
            stream = new EventSourceFake();
            return stream;
          },
        },
        { provide: USE_MOCK_DATA, useValue: false },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('item 2 — dock não renderiza badge nem bolinha de alerta fabricados', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.dock-badge')).toBeNull();
    expect(fixture.nativeElement.querySelector('.dock-dot')).toBeNull();
  });

  it('item 6 — topbar não renderiza avatar fabricado', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.avatar')).toBeNull();
  });

  it('item 3 — pendentes não é apresentado como recorte de "hoje"', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 4, incidentesOntem: 2, criticosHoje: 1, pendentes: 3,
      heatmap: [], ultimosSeteDias: [],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Hoje você tem');
  });

  it('item 4 — SSE aberto não é apresentado como planta operando normalmente', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    stream.abrir();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Sistema operando normalmente');
  });

  it('item 5 — conexão caída avisa que a lista pode estar incompleta, em vez de "nenhum incidente"', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    stream.falhar();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('sem conexão');
  });

  it('item 8 — status da saudação conta câmeras sem alegar que estão sendo monitoradas', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const status = (fixture.nativeElement.querySelector('.gstatus') as HTMLElement | null)
      ?.textContent ?? '';
    expect(status).not.toContain('monitorada');
  });

  it('item 1 — linha de média some sem dados, e o título traz o valor real quando há dados', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.mean')).toBeNull();

    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap: [],
      ultimosSeteDias: [
        { dia: '2026-08-10', incidentes: 4 },
        { dia: '2026-08-11', incidentes: 8 },
      ],
    });
    fixture.detectChanges();

    const mean = fixture.nativeElement.querySelector('.mean') as HTMLElement | null;
    expect(mean).not.toBeNull();
    expect(mean!.getAttribute('title'))
      .toBe(`média ${fixture.componentInstance.mediaDiaria().toFixed(1)}`);
  });
});
