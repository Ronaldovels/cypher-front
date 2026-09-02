import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { Incident } from '../shared/incident.models';
import { IncidentDetailComponent } from './incident-detail.component';

function incidente(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 42, incidentKey: 'k42', cameraId: 'CAM-01', runId: 'run-a', trackId: 1,
    type: 'FALL_RISK', severity: 4, nivel: 'ALTO', descricao: 'Queda',
    reason: 'fallen_sustained', postureCategory: 'immediate_risk', rebaScore: 11,
    actionLevel: 4, zoneName: null, zoneStatus: 'outside', epiPresent: ['HELMET'], epiMissing: [],
    snapshotUrl: null, detectedAt: '2026-08-10T14:31:02.482-03:00', endedAt: null,
    durationSeconds: null, peakSeverity: 4, closedReason: null, status: 'PENDENTE',
    ...overrides,
  };
}

describe('IncidentDetailComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'incidentes/:id', component: IncidentDetailComponent }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  /** Sem análise prévia — resposta padrão pro GET automático do ngOnInit. */
  function semAnaliseAnterior(): void {
    http.expectOne(`${environment.apiUrl}/incidents/42/analyze`)
      .flush(null, { status: 404, statusText: 'Not Found' });
  }

  it('busca o incidente pelo id da rota e mostra os campos, com dock para GESTOR', async () => {
    const harness = await RouterTestingHarness.create();
    // navigateByUrl só resolve depois que o componente é ativado e ngOnInit
    // roda; é só depois disso que as requisições HTTP (incidente, /auth/me e
    // a última análise) existem para o backend de teste flushar.
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    semAnaliseAnterior();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Queda / risco imediato');
    expect(harness.routeNativeElement?.textContent).toContain('CAM-01');
    // Tela de um incidente específico do passado: precisa da data, não só da hora.
    expect(harness.routeNativeElement?.textContent).toContain('10/08 14:31');
    expect(harness.routeNativeElement?.querySelector('app-dock')).not.toBeNull();
  });

  it('id inexistente mostra erro e link de volta', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/999999', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/999999`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    http.expectOne(`${environment.apiUrl}/incidents/999999/analyze`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent?.toLowerCase()).toContain('falhou');
    expect(harness.routeNativeElement?.querySelector('a[href="/incidentes"]')).not.toBeNull();
  });

  it('snapshot ausente mostra o placeholder', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente({ snapshotUrl: null }));
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    semAnaliseAnterior();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('processando imagem');
  });

  it('botão de status dispara o PUT correspondente', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente({ status: 'PENDENTE' }));
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    semAnaliseAnterior();
    harness.detectChanges();

    const botaoResolvido = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Resolvido') as HTMLButtonElement;
    botaoResolvido.click();

    const req = http.expectOne(`${environment.apiUrl}/incidents/42/status`);
    expect(req.request.body).toEqual({ status: 'RESOLVIDO' });
    req.flush(incidente({ status: 'RESOLVIDO' }));
  });

  it('sem sessao GESTOR, nao mostra o dock', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${environment.apiUrl}/incidents/42/analyze`)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelector('app-dock')).toBeNull();
  });

  it('carrega a analise anterior automaticamente, sem precisar clicar', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    http.expectOne(`${environment.apiUrl}/incidents/42/analyze`).flush({
      situacao: 'ja analisado antes', episIdentificados: [], episAusentes: ['luvas'],
      riscoIdentificado: true, tipoRisco: 'aproximacao de zona perigosa', nivelRisco: 'alto',
      justificativa: 'muito perto da area de movimentacao', acaoRecomendada: 'interromper a operacao',
      provider: 'gemini', promptVersion: 'v2', status: 'OK', geradoEm: '2026-09-01T10:00:00-03:00',
    });
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('ja analisado antes');
    const botao = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Analisar novamente');
    expect(botao).not.toBeUndefined();
  });

  it('gestor clica em Analisar com IA e ve o resultado estruturado', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    semAnaliseAnterior();
    harness.detectChanges();

    const botao = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Analisar com IA') as HTMLButtonElement;
    botao.click();

    const req = http.expectOne(`${environment.apiUrl}/incidents/42/analyze`);
    expect(req.request.method).toBe('POST');
    req.flush({
      situacao: 'trabalhador proximo a maquina', episIdentificados: ['capacete'],
      episAusentes: ['luvas'], riscoIdentificado: true, tipoRisco: 'aproximacao de zona perigosa',
      nivelRisco: 'alto', justificativa: 'muito perto da area de movimentacao',
      acaoRecomendada: 'interromper a operacao', provider: 'claude', promptVersion: 'v2',
      status: 'OK', geradoEm: '2026-09-01T10:00:00-03:00',
    });
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('trabalhador proximo a maquina');
    expect(harness.routeNativeElement?.textContent).toContain('interromper a operacao');
  });

  it('resposta com status ERRO_PARSE mostra aviso em vez de campos vazios', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    semAnaliseAnterior();
    harness.detectChanges();

    const botao = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Analisar com IA') as HTMLButtonElement;
    botao.click();

    http.expectOne(`${environment.apiUrl}/incidents/42/analyze`).flush({
      situacao: null, episIdentificados: [], episAusentes: [], riscoIdentificado: false,
      tipoRisco: null, nivelRisco: null, justificativa: null, acaoRecomendada: null,
      provider: 'claude', promptVersion: 'v2', status: 'ERRO_PARSE', geradoEm: '2026-09-01T10:00:00-03:00',
    });
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent?.toLowerCase())
      .toContain('não no formato esperado');
  });

  it('resposta com status ERRO_API mostra aviso em vez de campos vazios', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    semAnaliseAnterior();
    harness.detectChanges();

    const botao = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Analisar com IA') as HTMLButtonElement;
    botao.click();

    http.expectOne(`${environment.apiUrl}/incidents/42/analyze`).flush({
      situacao: null, episIdentificados: [], episAusentes: [], riscoIdentificado: false,
      tipoRisco: null, nivelRisco: null, justificativa: null, acaoRecomendada: null,
      provider: 'claude', promptVersion: 'v2', status: 'ERRO_API', geradoEm: '2026-09-01T10:00:00-03:00',
    });
    harness.detectChanges();

    const texto = harness.routeNativeElement?.textContent?.toLowerCase() ?? '';
    expect(texto).toContain('não foi possível analisar');
    expect(texto).not.toContain('situação');
  });

  it('falha na requisicao mostra mensagem e reabilita o botao', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    semAnaliseAnterior();
    harness.detectChanges();

    const botao = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Analisar com IA') as HTMLButtonElement;
    botao.click();

    http.expectOne(`${environment.apiUrl}/incidents/42/analyze`)
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent?.toLowerCase()).toContain('não foi possível analisar');
    expect(botao.disabled).toBe(false);
  });

  it('operador nao ve o botao Analisar com IA', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', username: 'op1' });
    http.expectOne(`${environment.apiUrl}/incidents/42/analyze`)
      .flush(null, { status: 403, statusText: 'Forbidden' });
    harness.detectChanges();

    const botao = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Analisar com IA');
    expect(botao).toBeUndefined();
  });
});
