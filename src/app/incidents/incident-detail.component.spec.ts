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

  it('busca o incidente pelo id da rota e mostra os campos', async () => {
    const harness = await RouterTestingHarness.create();
    // navigateByUrl só resolve depois que o componente é ativado e ngOnInit
    // roda; é só depois disso que a requisição HTTP existe para o backend
    // de teste flushar.
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Queda / risco imediato');
    expect(harness.routeNativeElement?.textContent).toContain('CAM-01');
  });

  it('id inexistente mostra erro e link de volta', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/999999', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/999999`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent?.toLowerCase()).toContain('falhou');
    expect(harness.routeNativeElement?.querySelector('a[href="/incidentes"]')).not.toBeNull();
  });

  it('snapshot ausente mostra o placeholder', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente({ snapshotUrl: null }));
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('processando imagem');
  });

  it('botão de status dispara o PUT correspondente', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente({ status: 'PENDENTE' }));
    harness.detectChanges();

    const botaoResolvido = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Resolvido') as HTMLButtonElement;
    botaoResolvido.click();

    const req = http.expectOne(`${environment.apiUrl}/incidents/42/status`);
    expect(req.request.body).toEqual({ status: 'RESOLVIDO' });
    req.flush(incidente({ status: 'RESOLVIDO' }));
  });
});
