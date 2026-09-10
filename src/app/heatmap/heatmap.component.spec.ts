import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { EVENT_SOURCE_FACTORY, EventSourceLike } from '../shared/event-source.factory';
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';
import { HeatmapComponent, inicioDoPeriodo, matrizAnualPorMes } from './heatmap.component';

const SSE_INERTE: EventSourceLike = {
  addEventListener: () => { }, close: () => { }, onopen: null, onerror: null,
};

describe('matrizAnualPorMes', () => {
  it('soma incidentes de dias do mesmo mes e dia da semana na mesma celula', () => {
    // 2026-03-02 e 2026-03-09 sao as duas primeiras segundas de marco.
    const historico = [
      { dia: '2026-03-02', incidentes: 2 }, // segunda
      { dia: '2026-03-09', incidentes: 3 }, // segunda seguinte, mesmo mes
      { dia: '2026-03-04', incidentes: 1 }, // quarta, nao soma na mesma celula
      { dia: '2026-04-06', incidentes: 5 }, // segunda de abril, mes diferente
    ];

    const matriz = matrizAnualPorMes(historico);

    expect(matriz[2][0]).toBe(5); // marco (indice 2) x segunda (indice 0) = 2+3
    expect(matriz[2][2]).toBe(1); // marco x quarta
    expect(matriz[3][0]).toBe(5); // abril x segunda
    expect(matriz.length).toBe(12);
    expect(matriz[0].length).toBe(7);
  });

  it('historico vazio devolve matriz 12x7 zerada', () => {
    const matriz = matrizAnualPorMes([]);
    expect(matriz.every(linha => linha.every(v => v === 0))).toBe(true);
  });
});

describe('inicioDoPeriodo', () => {
  const agora = new Date('2026-09-08T15:00:00.000Z');

  it('hoje volta para 00:00 do dia corrente', () => {
    const inicio = inicioDoPeriodo('hoje', agora);
    expect(inicio?.toISOString().slice(0, 10)).toBe('2026-09-08');
  });

  it('7d/30d/90d voltam N dias a partir de agora', () => {
    expect(inicioDoPeriodo('7d', agora)?.getTime()).toBe(agora.getTime() - 7 * 86400000);
    expect(inicioDoPeriodo('30d', agora)?.getTime()).toBe(agora.getTime() - 30 * 86400000);
    expect(inicioDoPeriodo('90d', agora)?.getTime()).toBe(agora.getTime() - 90 * 86400000);
  });

  it('custom nao tem intervalo por tras — retorna null (cai no default do backend)', () => {
    expect(inicioDoPeriodo('custom', agora)).toBeNull();
  });
});

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

  it('não sobra nenhum selo de dado de exemplo (Temporal e Anual já usam dado real)', () => {
    const fixture = montarCom([]);
    const selos = fixture.nativeElement.querySelectorAll('.sample-seal');

    expect(selos.length).toBe(0);
  });

  it('não sobra nenhum wrapper de opacidade de dado de exemplo (Temporal já usa dado real)', () => {
    const fixture = montarCom([]);
    const wrappers = fixture.nativeElement.querySelectorAll('.sample-content');

    expect(wrappers.length).toBe(0);
  });

  it('a grade anual reaproveita o mesmo desenho do card Temporal (mesmas classes .temporal/.temp-cell)', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);

    const grades = fixture.nativeElement.querySelectorAll('.temporal');
    expect(grades.length).toBe(2); // Temporal e Anual, mesmo componente de grade

    const grafAnual = grades[1];
    const rotulosDia = Array.from(grafAnual.querySelectorAll('.day-h')).map((el: any) => el.textContent.trim());
    expect(rotulosDia).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']); // todos os 7, nenhum escondido
    const rotulosLinha = Array.from(grafAnual.querySelectorAll('.hr-l')).map((el: any) => el.textContent.trim());
    expect(rotulosLinha).toEqual(['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']);
  });

  it('matrizAnual reflete o historicoAnual real, somado por mes x dia da semana', () => {
    const fixture = TestBed.createComponent(HeatmapComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap: [], ultimosSeteDias: [],
      // 2026-01-01 e 2026-01-08 sao as duas primeiras quintas de janeiro (diaSemana=3).
      historicoAnual: [{ dia: '2026-01-01', incidentes: 3 }, { dia: '2026-01-08', incidentes: 1 }],
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.matrizAnual()[0][3]).toBe(4); // Jan x quinta = 3+1
  });

  it('picoAnual aponta o mes/dia do valor maximo unico', () => {
    const fixture = TestBed.createComponent(HeatmapComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap: [], ultimosSeteDias: [],
      historicoAnual: [{ dia: '2026-03-02', incidentes: 5 }, { dia: '2026-07-04', incidentes: 2 }],
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.picoAnual()).toEqual({ mes: 'Mar', dia: 'Seg', valor: 5 });
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

  it('some sem sessao GESTOR', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/auth/me`)[0]
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-dock')).toBeNull();
  });

  it('mostra o dock para GESTOR', () => {
    const gestor = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/auth/me`)[0]
      .flush({ papel: 'GESTOR', username: 'g1' });
    gestor.detectChanges();
    expect(gestor.nativeElement.querySelector('app-dock')).not.toBeNull();
  });

  it('urlResumoPdf usa o periodo selecionado', () => {
    const fixture = montarCom([]);
    const comp = fixture.componentInstance;

    comp.setPeriod('30d');
    const url = new URL(comp.urlResumoPdf(), 'http://localhost');
    expect(url.pathname).toBe('/api/v1/reports/summary.pdf');
    expect(url.searchParams.has('since')).toBe(true);
  });

  it('urlResumoPdf omite since quando o periodo e custom', () => {
    const fixture = montarCom([]);
    const comp = fixture.componentInstance;

    comp.setPeriod('custom');
    const url = new URL(comp.urlResumoPdf(), 'http://localhost');
    expect(url.searchParams.has('since')).toBe(false);
  });

  function ultimaRequisicaoDeSummary() {
    const pendentes = http.match(r => r.url === `${environment.apiUrl}/summary`);
    return pendentes[pendentes.length - 1];
  }

  it('trocar o setor recarrega o summary com o filtro', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/summary`); // drena a carga inicial do ngOnInit

    fixture.componentInstance.setSetor('montagem');

    const req = ultimaRequisicaoDeSummary();
    expect(req.request.params.get('setor')).toBe('montagem');
    expect(req.request.params.get('detalhado')).toBe('true');
    req.flush({ incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0, heatmap: [], ultimosSeteDias: [] });
  });

  it('trocar o EPI recarrega o summary com o filtro', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);

    fixture.componentInstance.setEpi('capacete');

    const req = ultimaRequisicaoDeSummary();
    expect(req.request.params.get('epi')).toBe('capacete');
    req.flush({ incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0, heatmap: [], ultimosSeteDias: [] });
  });

  it('trocar o turno recarrega o summary com o filtro', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);

    fixture.componentInstance.setShift('A');

    const req = ultimaRequisicaoDeSummary();
    expect(req.request.params.get('turno')).toBe('A');
    req.flush({ incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0, heatmap: [], ultimosSeteDias: [] });
  });

  it('turno "all" nao manda o parametro turno', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);

    fixture.componentInstance.setShift('all');

    const req = ultimaRequisicaoDeSummary();
    expect(req.request.params.has('turno')).toBe(false);
    req.flush({ incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0, heatmap: [], ultimosSeteDias: [] });
  });

  it('trocar o periodo recarrega o summary com since', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);

    fixture.componentInstance.setPeriod('30d');

    const req = ultimaRequisicaoDeSummary();
    expect(req.request.params.has('since')).toBe(true);
    req.flush({ incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0, heatmap: [], ultimosSeteDias: [] });
  });

  it('ordenar por ranking lista as celulas por incidentes desc, sem agrupar', () => {
    const fixture = montarCom([
      { estacaoId: 'EST-01', nome: 'Esteira', setor: 'montagem', incidentes: 1 },
      { estacaoId: 'EST-02', nome: 'Prensa', setor: 'estamparia', incidentes: 5 },
    ]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);
    const comp = fixture.componentInstance;

    comp.setOrdenar('ranking');

    expect(comp.celulasOrdenadas().map(c => c.estacaoId)).toEqual(['EST-02', 'EST-01']);
  });

  it('ordenar por nome lista as celulas em ordem alfabetica, sem agrupar', () => {
    const fixture = montarCom([
      { estacaoId: 'EST-02', nome: 'Zebra', setor: 'estamparia', incidentes: 5 },
      { estacaoId: 'EST-01', nome: 'Alfa', setor: 'montagem', incidentes: 1 },
    ]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);
    const comp = fixture.componentInstance;

    comp.setOrdenar('nome');

    expect(comp.celulasOrdenadas().map(c => c.nome)).toEqual(['Alfa', 'Zebra']);
  });

  it('ordenar por zona (default) mantem o agrupamento por setor', () => {
    const fixture = montarCom([]);
    expect(fixture.componentInstance.ordenar()).toBe('zona');
  });

  it('matrizTemporal converte distribuicaoTemporal em linhas de faixa2h x colunas de diaSemana', () => {
    const fixture = TestBed.createComponent(HeatmapComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap: [], ultimosSeteDias: [],
      distribuicaoTemporal: [{ diaSemana: 2, faixa2h: 11, incidentes: 4 }],
    });
    fixture.detectChanges();

    const matriz = fixture.componentInstance.matrizTemporal();
    expect(matriz[11][2]).toBe(4);
    expect(matriz[0][0]).toBe(0);
    expect(matriz.length).toBe(12);
    expect(matriz[0].length).toBe(7);
  });

  it('picoTemporal aponta o dia/faixa do valor maximo unico', () => {
    const fixture = TestBed.createComponent(HeatmapComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap: [], ultimosSeteDias: [],
      distribuicaoTemporal: [
        { diaSemana: 2, faixa2h: 11, incidentes: 4 },
        { diaSemana: 5, faixa2h: 0, incidentes: 1 },
      ],
    });
    fixture.detectChanges();

    const pico = fixture.componentInstance.picoTemporal();
    expect(pico).toEqual({ dia: 'Qua', faixa: '10PM–12AM', valor: 4 });
  });

  it('picoTemporal e nulo quando o maximo empata em mais de uma celula', () => {
    const fixture = TestBed.createComponent(HeatmapComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap: [], ultimosSeteDias: [],
      distribuicaoTemporal: [
        { diaSemana: 2, faixa2h: 11, incidentes: 4 },
        { diaSemana: 5, faixa2h: 0, incidentes: 4 },
      ],
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.picoTemporal()).toBeNull();
  });

  it('urlResumoPdf inclui turno/setor/epi junto do since (spec §7)', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);
    const comp = fixture.componentInstance;

    comp.setShift('A');
    comp.setSetor('montagem');
    comp.setEpi('capacete');
    http.match(r => r.url === `${environment.apiUrl}/summary`); // drena as 3 recargas dos setters acima

    const url = new URL(comp.urlResumoPdf(), 'http://localhost');
    expect(url.searchParams.get('turno')).toBe('A');
    expect(url.searchParams.get('setor')).toBe('montagem');
    expect(url.searchParams.get('epi')).toBe('capacete');
  });
});
