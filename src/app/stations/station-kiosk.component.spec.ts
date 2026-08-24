import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { ConfigService } from '../shared/config.service';
import { Incident } from '../shared/incident.models';
import { StationKioskComponent } from './station-kiosk.component';

function incidente(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 1, incidentKey: 'k1', cameraId: 'CAM-01', runId: 'run-a', trackId: 1,
    type: 'FALL_RISK', severity: 4, nivel: 'ALTO', descricao: 'Queda',
    reason: 'fallen_sustained', postureCategory: 'immediate_risk', rebaScore: 11,
    actionLevel: 4, zoneName: null, zoneStatus: 'outside', epiPresent: [], epiMissing: [],
    snapshotUrl: null, detectedAt: '2026-08-10T14:00:00.000-03:00', endedAt: null,
    durationSeconds: null, peakSeverity: 4, closedReason: null, status: 'PENDENTE',
    ...overrides,
  };
}

describe('StationKioskComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'estacao/:id', component: StationKioskComponent }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  // navigateByUrl só resolve depois que o componente é ativado e ngOnInit
  // roda (mesmo padrão de incident-detail.component.spec.ts); as chamadas do
  // effect() que busca os eventos recentes só existem depois que uma rodada
  // de change detection roda após o catálogo chegar, daí o detectChanges()
  // extra antes de flushar /incidents.
  it('mostra um feed por câmera, busca e mescla eventos de cada uma (mais recente primeiro), sem refazer a busca', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);

    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [
        { id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x/1' },
        { id: 'CAM-02', nome: 'Lateral', estacaoId: 'EST-01', streamUrl: 'http://x/2' },
      ] },
    ]);
    harness.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
    harness.detectChanges();

    // CAM-01 tem o evento mais antigo, CAM-02 o mais recente: a lista mesclada
    // precisa vir ordenada por detectedAt desc, não na ordem das câmeras.
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents` && r.params.get('camera') === 'CAM-01')
      .flush({
        content: [incidente({ id: 1, incidentKey: 'k1', cameraId: 'CAM-01', detectedAt: '2026-08-10T14:00:00.000-03:00' })],
        totalElements: 1, totalPages: 1, number: 0, size: 10,
      });
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents` && r.params.get('camera') === 'CAM-02')
      .flush({
        content: [incidente({ id: 2, incidentKey: 'k2', cameraId: 'CAM-02', detectedAt: '2026-08-10T15:30:00.000-03:00' })],
        totalElements: 1, totalPages: 1, number: 0, size: 10,
      });
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelectorAll('app-live-feed').length).toBe(2);

    const linhas = harness.routeNativeElement?.querySelectorAll('.alert-row');
    expect(linhas?.length).toBe(2);
    expect(linhas?.[0].querySelector('.a-station')?.textContent).toBe('CAM-02');
    expect(linhas?.[1].querySelector('.a-station')?.textContent).toBe('CAM-01');

    // A estação não muda depois disso: o effect não deve refazer a busca.
    harness.detectChanges();
    http.expectNone(r => r.url === `${environment.apiUrl}/incidents`);
  });

  it('OPERADOR nao ve o dock — o kiosk continua sem navegacao para o operador', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [] },
    ]);
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelector('app-dock')).toBeNull();
  });

  it('GESTOR ve o dock, mantendo a navegacao (restricao de E3)', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [] },
    ]);
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'GESTOR', username: 'g1' });
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelector('app-dock')).not.toBeNull();
  });

  it('checklist de EPIs vem do ConfigService, somente leitura', async () => {
    const cfgService = TestBed.inject(ConfigService);
    cfgService.save({
      company: 'X', cnpj: '', sector: '', logoUrl: null, logoName: '',
      accent: '#000', epis: ['HELMET', 'VEST'], cas: {},
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [] },
    ]);
    harness.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
    harness.detectChanges();

    const itens = harness.routeNativeElement?.querySelectorAll('.kiosk-epi-list li');
    expect(itens?.length).toBe(2);
    expect(harness.routeNativeElement?.textContent).toContain('HELMET');
    expect(itens?.[0].querySelector('button, input')).toBeNull();
  });

  it('estação com câmeras vazias não busca eventos e não quebra', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [] },
    ]);
    harness.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
    harness.detectChanges();

    http.expectNone(r => r.url === `${environment.apiUrl}/incidents`);
    expect(harness.routeNativeElement?.textContent).toContain('nenhuma câmera cadastrada');
  });
});
