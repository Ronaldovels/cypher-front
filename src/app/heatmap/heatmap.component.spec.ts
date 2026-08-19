import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { EVENT_SOURCE_FACTORY, EventSourceLike } from '../shared/event-source.factory';
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';
import { HeatmapComponent } from './heatmap.component';

const SSE_INERTE: EventSourceLike = {
  addEventListener: () => { }, close: () => { }, onopen: null, onerror: null,
};

describe('HeatmapComponent', () => {
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
        // true. Sem esta linha o badge de conexão diria "dados de exemplo".
        { provide: USE_MOCK_DATA, useValue: false },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function montarCom(heatmap: unknown[]) {
    const fixture = TestBed.createComponent(HeatmapComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap, ultimosSeteDias: [],
    });
    fixture.detectChanges();
    return fixture;
  }

  it('a célula é a estação, com o nome amigável', () => {
    const fixture = montarCom([
      { estacaoId: 'EST-01', nome: 'Esteira de montagem', setor: 'montagem', incidentes: 2 },
    ]);

    expect(fixture.componentInstance.celulas()[0].nome).toBe('Esteira de montagem');
    expect(fixture.nativeElement.textContent).toContain('Esteira de montagem');
  });

  it('estação sem incidente aparece zerada, não some', () => {
    const fixture = montarCom([
      { estacaoId: 'EST-01', nome: 'Esteira', setor: 'montagem', incidentes: 0 },
      { estacaoId: 'EST-02', nome: 'Prensa', setor: 'estamparia', incidentes: 3 },
    ]);

    expect(fixture.componentInstance.celulas().length).toBe(2);
  });

  it('sem estação cadastrada, diz que não há dados em vez de inventar células', () => {
    const fixture = montarCom([]);

    expect(fixture.componentInstance.celulas()).toEqual([]);
    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('nenhuma esta');
  });

  it('classifica a intensidade pela contagem', () => {
    const fixture = montarCom([]);
    const componente = fixture.componentInstance;

    expect(componente.classeDe(0)).toBe('ok');
    expect(componente.classeDe(1)).toBe('low');
    expect(componente.classeDe(2)).toBe('mid');
    expect(componente.classeDe(7)).toBe('hi');
  });

  it('a contagem de estações no cabeçalho vem de celulas(), e diz "cadastradas" (nem tudo que está no catálogo está monitorado)', () => {
    const fixture = montarCom([
      { estacaoId: 'EST-01', nome: 'Esteira', setor: 'montagem', incidentes: 0 },
      { estacaoId: 'EST-02', nome: 'Prensa', setor: 'estamparia', incidentes: 3 },
    ]);

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('2 estações cadastradas');
    expect(texto).not.toContain('monitoradas');
  });

  it('o Top 5 vem das próprias células reais, ordenado por incidentes', () => {
    const fixture = montarCom([
      { estacaoId: 'EST-01', nome: 'A', setor: 's', incidentes: 1 },
      { estacaoId: 'EST-02', nome: 'B', setor: 's', incidentes: 9 },
      { estacaoId: 'EST-03', nome: 'C', setor: 's', incidentes: 4 },
    ]);

    expect(fixture.componentInstance.top5().map(c => c.estacaoId))
      .toEqual(['EST-02', 'EST-03', 'EST-01']);
  });

  it('renderiza o badge de conexão em vez de um relógio fabricado', () => {
    const fixture = montarCom([]);

    expect(fixture.nativeElement.querySelector('app-connection-badge')).not.toBeNull();
  });

  it('a matriz temporal e o histórico anual carregam o selo de dado de exemplo, com opacidade reduzida', () => {
    const fixture = montarCom([]);
    const selos = fixture.nativeElement.querySelectorAll('.sample-seal');

    expect(selos.length).toBe(2);
    selos.forEach((selo: HTMLElement) => {
      expect(selo.textContent?.toLowerCase()).toContain('dado de exemplo');
    });

    const conteudosAmostra = fixture.nativeElement.querySelectorAll('.sample-content');
    expect(conteudosAmostra.length).toBeGreaterThanOrEqual(2);
  });

  it('não exporta mais constantes de dados fabricados para o grid de estações', async () => {
    const modulo: Record<string, unknown> = await import('./heatmap.component');

    expect(modulo['ZONES']).toBeUndefined();
  });

  it('guarda — nenhum resquício de dado fabricado que a correção deveria ter eliminado', () => {
    const fixture = montarCom([
      { estacaoId: 'EST-01', nome: 'Esteira', setor: 'montagem', incidentes: 0 },
    ]);
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).not.toContain('atualizado há 3s');
    expect(texto).not.toContain('17 estações');
    expect(texto).not.toContain('Capacete ausente');
  });
});
