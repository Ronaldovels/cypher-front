import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { IncidentService } from '../shared/incident.service';
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
    normaAplicavel: null,
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
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'GESTOR', username: 'g1' });
    fixture.detectChanges();
    return fixture;
  }

  it('busca a primeira página ao iniciar', () => {
    const fixture = montar();

    expect(fixture.componentInstance.linhas().length).toBe(1);
  });

  it('mostra a data além da hora de cada linha (timeline cobre vários dias)', () => {
    const fixture = montar();

    expect(fixture.nativeElement.textContent).toContain('10/08 14:31');
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

  it('mostra erro de uma nova busca mesmo com linhas de uma busca anterior na tela', () => {
    const fixture = montar();
    expect(fixture.componentInstance.linhas().length).toBe(1);

    fixture.componentInstance.aplicarFiltros();
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`)
      .flush(null, { status: 500, statusText: 'Erro' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('falhou');
  });

  it('não mostra "nenhum incidente" junto com carregando no carregamento inicial', () => {
    const fixture = TestBed.createComponent(IncidentTimelineComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([]);
    // Ainda não flushou /incidents: carregando() é true e linhas() está vazio.

    const texto = fixture.nativeElement.textContent.toLowerCase();
    expect(texto).toContain('carregando');
    expect(texto).not.toContain('nenhum incidente encontrado');

    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`).flush(pagina([]));
  });

  it('mostra carregando de uma nova busca mesmo com linhas de uma busca anterior na tela', () => {
    const fixture = montar();

    fixture.componentInstance.aplicarFiltros();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('carregando');
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`).flush(pagina([]));
  });

  it('envia o filtro since como ISO com offset, não o valor cru do datetime-local', () => {
    const fixture = montar();
    fixture.componentInstance.since.set('2026-08-10T14:30');

    fixture.componentInstance.aplicarFiltros();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/incidents`);
    const enviado = req.request.params.get('since');
    expect(enviado).toBe(new Date('2026-08-10T14:30').toISOString());
    expect(enviado).toMatch(/Z$/);
    req.flush(pagina([]));
  });

  it('resultado fresco da busca não é sobrescrito por dado velho no store global', () => {
    const incidentService = TestBed.inject(IncidentService);
    incidentService.upsert(incidente({ id: 1, incidentKey: 'k1', status: 'PENDENTE' }));

    const fixture = TestBed.createComponent(IncidentTimelineComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`)
      .flush(pagina([incidente({ id: 1, incidentKey: 'k1', status: 'RESOLVIDO' })]));
    fixture.detectChanges();

    expect(fixture.componentInstance.linhas()[0].status).toBe('RESOLVIDO');
  });

  it('reconhecer atualiza a linha localmente sem esperar rebusca', () => {
    const fixture = montar();
    const inc = fixture.componentInstance.linhas()[0];
    const evento = { stopPropagation: () => { } } as unknown as Event;

    fixture.componentInstance.reconhecer(inc, evento);

    const req = http.expectOne(`${environment.apiUrl}/incidents/${inc.id}/status`);
    req.flush({ ...inc, status: 'REVISADO' });

    expect(fixture.componentInstance.linhas()[0].status).toBe('REVISADO');
  });

  it('reconhecer com PUT que falha não deixa a linha vulnerável a dado velho do store', () => {
    const fixture = montar();
    const incidentService = TestBed.inject(IncidentService);
    const inc = fixture.componentInstance.linhas()[0];
    const evento = { stopPropagation: () => { } } as unknown as Event;

    fixture.componentInstance.reconhecer(inc, evento);
    const req = http.expectOne(`${environment.apiUrl}/incidents/${inc.id}/status`);
    req.flush(null, { status: 500, statusText: 'Erro' });

    // Depois do PUT falhar, algo (ex.: outra tela) deixa o store com um valor
    // qualquer para essa chave — a linha não pode passar a mostrar isso.
    incidentService.upsert({ ...inc, status: 'RESOLVIDO' });

    expect(fixture.componentInstance.linhas()[0].status).toBe(inc.status);
  });

  it('acompanhamento de reconhecimento não sobrevive a uma nova busca', () => {
    const fixture = montar();
    const inc = fixture.componentInstance.linhas()[0];
    const evento = { stopPropagation: () => { } } as unknown as Event;

    fixture.componentInstance.reconhecer(inc, evento);
    const reqAck = http.expectOne(`${environment.apiUrl}/incidents/${inc.id}/status`);
    reqAck.flush({ ...inc, status: 'REVISADO' });
    expect(fixture.componentInstance.linhas()[0].status).toBe('REVISADO');

    fixture.componentInstance.aplicarFiltros();
    const reqBusca = http.expectOne(r => r.url === `${environment.apiUrl}/incidents`);
    reqBusca.flush(pagina([incidente({ id: inc.id, incidentKey: inc.incidentKey, status: 'PENDENTE' })]));

    expect(fixture.componentInstance.linhas()[0].status).toBe('PENDENTE');
  });

  it('sem sessao GESTOR, nao mostra o dock', () => {
    const fixture = TestBed.createComponent(IncidentTimelineComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`).flush(pagina([]));
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-dock')).toBeNull();
  });

  it('urlExportacaoCsv reflete os filtros atuais', () => {
    const fixture = montar();
    const comp = fixture.componentInstance;

    comp.camera.set('CAM-01');
    comp.severityMin.set(3);
    comp.status.set('PENDENTE');
    comp.since.set('2026-09-01T08:00');

    const url = new URL(comp.urlExportacaoCsv(), 'http://localhost');
    expect(url.pathname).toBe('/api/v1/reports/incidents.csv');
    expect(url.searchParams.get('camera')).toBe('CAM-01');
    expect(url.searchParams.get('severityMin')).toBe('3');
    expect(url.searchParams.get('status')).toBe('PENDENTE');
    expect(url.searchParams.get('since')).toBe(new Date('2026-09-01T08:00').toISOString());
  });

  it('filtros ficam dentro da filterbar, nao mais do panel vertical antigo', () => {
    const fixture = montar();

    const filterbar = fixture.nativeElement.querySelector('form.filterbar');
    expect(filterbar).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.tl-filters')).toBeNull();

    // os campos continuam existindo, com os mesmos ids
    expect(filterbar.querySelector('#tl-camera')).not.toBeNull();
    expect(filterbar.querySelector('#tl-severity')).not.toBeNull();
    expect(filterbar.querySelector('#tl-status')).not.toBeNull();
    expect(filterbar.querySelector('#tl-since')).not.toBeNull();
  });

  it('urlExportacaoCsv omite parametros nao preenchidos', () => {
    const fixture = montar();
    const comp = fixture.componentInstance;

    const url = new URL(comp.urlExportacaoCsv(), 'http://localhost');
    expect(url.searchParams.has('camera')).toBe(false);
    expect(url.searchParams.has('severityMin')).toBe(false);
    expect(url.searchParams.has('status')).toBe(false);
    expect(url.searchParams.has('since')).toBe(false);
  });
});
