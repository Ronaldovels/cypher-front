import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { Incident, Page } from '../shared/incident.models';
import { IncidentTimelineComponent } from './incident-timeline.component';

function incidente(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 1, incidentKey: 'k1', cameraId: 'CAM-01', runId: 'run-a', trackId: 1,
    type: 'FALL_RISK', severity: 4, nivel: 'ALTO', descricao: 'Queda',
    reason: 'fallen_sustained', postureCategory: 'immediate_risk', rebaScore: 11,
    actionLevel: 4, zoneName: null, zoneStatus: 'outside', epiPresent: [], epiMissing: [],
    snapshotUrl: null, detectedAt: '2026-08-10T14:31:02.482-03:00', endedAt: null,
    durationSeconds: null, peakSeverity: 4, closedReason: null, status: 'PENDENTE',
    ...overrides,
  };
}

function pagina(content: Incident[], overrides: Partial<Page<Incident>> = {}): Page<Incident> {
  return { content, totalElements: content.length, totalPages: 1, number: 0, size: 20, ...overrides };
}

describe('IncidentTimelineComponent', () => {
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

  function montar() {
    const fixture = TestBed.createComponent(IncidentTimelineComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`)
      .flush(pagina([incidente({ id: 1, incidentKey: 'k1' })]));
    fixture.detectChanges();
    return fixture;
  }

  it('busca a primeira página ao iniciar', () => {
    const fixture = montar();

    expect(fixture.componentInstance.linhas().length).toBe(1);
  });

  it('reaplica a busca do zero ao aplicar filtros', () => {
    const fixture = montar();
    fixture.componentInstance.camera.set('CAM-02');

    fixture.componentInstance.aplicarFiltros();

    const req = http.expectOne(r =>
      r.url === `${environment.apiUrl}/incidents` && r.params.get('camera') === 'CAM-02');
    expect(req.request.params.get('page')).toBe('0');
    req.flush(pagina([]));
  });

  it('mostra estado vazio quando não há resultado', () => {
    const fixture = montar();
    fixture.componentInstance.aplicarFiltros();
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`).flush(pagina([]));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('nenhum incidente encontrado');
  });

  it('não avança de página quando não há próxima', () => {
    const fixture = montar();

    fixture.componentInstance.proximaPagina();

    http.expectNone(r => r.url === `${environment.apiUrl}/incidents` && r.params.get('page') === '1');
  });

  it('reconhecer avança para o próximo status natural, sem navegar', () => {
    const fixture = montar();
    const inc = fixture.componentInstance.linhas()[0];
    let propagou = true;
    const evento = { stopPropagation: () => { propagou = false; } } as unknown as Event;

    fixture.componentInstance.reconhecer(inc, evento);

    const req = http.expectOne(`${environment.apiUrl}/incidents/${inc.id}/status`);
    expect(req.request.body).toEqual({ status: 'REVISADO' });
    req.flush({ ...inc, status: 'REVISADO' });
    expect(propagou).toBe(false);
  });

  it('proximoStatus não avança incidente já resolvido', () => {
    const fixture = montar();

    expect(fixture.componentInstance.proximoStatus('RESOLVIDO')).toBeNull();
  });
});
