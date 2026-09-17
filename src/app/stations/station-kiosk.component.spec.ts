import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { ConfigService } from '../shared/config.service';
import { AUDIO_CONTEXT_FACTORY, AudioContextLike } from '../shared/sound-alert.service';
import { EVENT_SOURCE_FACTORY, EventSourceLike } from '../shared/event-source.factory';
import { IncidentService } from '../shared/incident.service';
import { Incident } from '../shared/incident.models';
import { StationKioskComponent } from './station-kiosk.component';

/** EventSource falso que guarda os listeners e deixa o teste empurrar eventos. */
class SseFake implements EventSourceLike {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private listeners = new Map<string, (event: MessageEvent) => void>();

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, listener);
  }
  close(): void { }
  emitirIncidente(incidente: Incident): void {
    this.listeners.get('incident')?.({ data: JSON.stringify(incidente) } as MessageEvent);
  }
}

/** AudioContext falso que só conta quantas vezes um oscilador tocou. */
class AudioContextContadorFake implements AudioContextLike {
  currentTime = 0;
  state = 'running';
  destination = {} as AudioDestinationNode;
  vezesTocado = 0;

  createOscillator(): OscillatorNode {
    this.vezesTocado++;
    return {
      frequency: { value: 0 },
      connect: () => { },
      start: () => { },
      stop: () => { },
    } as unknown as OscillatorNode;
  }
  createGain(): GainNode {
    return { gain: { value: 0 }, connect: () => { } } as unknown as GainNode;
  }
  resume(): Promise<void> { return Promise.resolve(); }
  close(): Promise<void> { return Promise.resolve(); }
}

function incidente(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 1, incidentKey: 'k1', cameraId: 'CAM-01', runId: 'run-a', trackId: 1,
    type: 'FALL_RISK', severity: 4, nivel: 'ALTO', descricao: 'Queda',
    reason: 'fallen_sustained', postureCategory: 'immediate_risk', rebaScore: 11,
    actionLevel: 4, zoneName: null, zoneStatus: 'outside', epiPresent: [], epiMissing: [],
    snapshotUrl: null, detectedAt: '2026-08-10T14:00:00.000-03:00', endedAt: null,
    durationSeconds: null, peakSeverity: 4, closedReason: null, status: 'PENDENTE',
    normaAplicavel: null,
    ...overrides,
  };
}

describe('StationKioskComponent', () => {
  let http: HttpTestingController;
  let sse: SseFake;
  let audio: AudioContextContadorFake;

  beforeEach(() => {
    localStorage.clear();
    sse = new SseFake();
    audio = new AudioContextContadorFake();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'estacao/:id', component: StationKioskComponent }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: EVENT_SOURCE_FACTORY, useValue: () => sse },
        { provide: AUDIO_CONTEXT_FACTORY, useValue: () => audio },
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

  it('mostra a norma aplicável e a dica no card de evento recente; nada quando normaAplicavel é null', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);

    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [
        { id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x/1' },
      ] },
    ]);
    harness.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
    harness.detectChanges();

    http.expectOne(r => r.url === `${environment.apiUrl}/incidents` && r.params.get('camera') === 'CAM-01')
      .flush({
        content: [
          incidente({ id: 1, incidentKey: 'k1', cameraId: 'CAM-01', type: 'FALL_RISK',
            detectedAt: '2026-08-10T15:00:00.000-03:00', normaAplicavel: 'NR-35' }),
          incidente({ id: 2, incidentKey: 'k2', cameraId: 'CAM-01', type: 'EPI_VIOLATION',
            detectedAt: '2026-08-10T14:00:00.000-03:00', normaAplicavel: null }),
        ],
        totalElements: 2, totalPages: 1, number: 0, size: 10,
      });
    harness.detectChanges();

    const el = harness.routeNativeElement!;
    expect(el.textContent).toContain('NR-35');
    expect(el.textContent).toContain('Isolar a área e verificar pontos de ancoragem');

    const linhas = el.querySelectorAll('.alert-row');
    expect(linhas[0].querySelector('.chip')?.textContent).toBe('NR-35');
    expect(linhas[1].querySelector('.chip')).toBeNull();
    expect(el.querySelectorAll('.alerts-list .ph-meta').length).toBe(1);
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

  describe('alerta sonoro', () => {
    async function montarComCamera(): Promise<RouterTestingHarness> {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);
      http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
      http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
        { id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [
          { id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x/1' },
        ] },
      ]);
      harness.detectChanges();
      http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
        .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
      harness.detectChanges();
      http.expectOne(r => r.url === `${environment.apiUrl}/incidents` && r.params.get('camera') === 'CAM-01')
        .flush({ content: [], totalElements: 0, totalPages: 1, number: 0, size: 10 });
      harness.detectChanges();
      return harness;
    }

    it('incidente novo de uma camera desta estacao toca o alerta', async () => {
      const harness = await montarComCamera();

      sse.emitirIncidente(incidente({ id: 9, incidentKey: 'novo-1', cameraId: 'CAM-01' }));
      harness.detectChanges();

      expect(audio.vezesTocado).toBeGreaterThan(0);
    });

    it('incidente novo desta estacao tambem dispara o flash visual (complemento do som)', async () => {
      const harness = await montarComCamera();
      const componente = harness.routeDebugElement!.componentInstance as StationKioskComponent;

      sse.emitirIncidente(incidente({ id: 9, incidentKey: 'novo-3', cameraId: 'CAM-01' }));
      harness.detectChanges();

      expect(componente.flashVisual()).toBe(true);
      expect(harness.routeNativeElement?.querySelector('.dash.kiosk-alert-flash')).not.toBeNull();
    });

    it('incidente de camera de OUTRA estacao nao toca o alerta', async () => {
      const harness = await montarComCamera();

      sse.emitirIncidente(incidente({ id: 9, incidentKey: 'novo-2', cameraId: 'CAM-99' }));
      harness.detectChanges();

      expect(audio.vezesTocado).toBe(0);
    });

    it('nao toca para o historico que ja existia antes de montar o kiosk', async () => {
      // O primeiro incidente observado no signal compartilhado define a
      // base, sem tocar — só um incidente novo *depois* de montar dispara o
      // bipe. Conecta o SSE cedo (mesma instancia singleton do servico) e
      // empurra um incidente antes do kiosk sequer existir, simulando quem
      // visitou o dashboard antes de abrir o kiosk desta estacao.
      const incidentService = TestBed.inject(IncidentService);
      incidentService.connect();
      sse.emitirIncidente(incidente({ id: 1, incidentKey: 'ja-existia', cameraId: 'CAM-01' }));

      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);
      http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
      http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
        { id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [
          { id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x/1' },
        ] },
      ]);
      harness.detectChanges();
      http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
        .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
      harness.detectChanges();
      http.expectOne(r => r.url === `${environment.apiUrl}/incidents` && r.params.get('camera') === 'CAM-01')
        .flush({ content: [], totalElements: 0, totalPages: 1, number: 0, size: 10 });
      harness.detectChanges();

      expect(audio.vezesTocado).toBe(0);
    });
  });
});
