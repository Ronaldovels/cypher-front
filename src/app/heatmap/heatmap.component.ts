import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { environment } from '../../environments/environment';
import { AuthService } from '../shared/auth/auth.service';
import { CatalogService } from '../shared/catalog.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { ConnectionBadgeComponent } from '../shared/connection-badge/connection-badge.component';
import { DockComponent } from '../shared/dock/dock.component';
import { IncidentService } from '../shared/incident.service';
import { StationCell, SummaryFiltros, severityClass } from '../shared/incident.models';
import { EPI_LIST } from '../onboarding/models/onboarding.models';

export const TEMP_HOURS = ['12AM', '2AM', '4AM', '6AM', '8AM', '10AM', '12PM', '2PM', '4PM', '6PM', '8PM', '10PM'];
export const TEMP_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Mapeia o chip de período (decorativo até esta entrega) para o `since` da
 * URL de exportação do PDF. `custom` nunca teve um seletor de intervalo por
 * trás — é só um rótulo — então retorna `null` e a URL final omite `since`,
 * caindo no default do backend (últimos 7 dias). Spec E6 §9.
 */
export function inicioDoPeriodo(period: string, agora: Date): Date | null {
  switch (period) {
    case 'hoje': {
      const inicio = new Date(agora);
      inicio.setHours(0, 0, 0, 0);
      return inicio;
    }
    case '7d': return new Date(agora.getTime() - 7 * 86400000);
    case '30d': return new Date(agora.getTime() - 30 * 86400000);
    case '90d': return new Date(agora.getTime() - 90 * 86400000);
    default: return null;
  }
}

export interface CelulaAnual {
  dia: string;
  incidentes: number;
  semana: number;
  diaSemana: number;
}

/**
 * Converte a lista diária (Jan 1 .. Dez 31, sempre nessa ordem — vem assim
 * de `SummaryService.historicoAnual`) numa grade estilo GitHub: 7 linhas
 * (uma por dia da semana, 0=Seg) x N colunas (uma por semana). O offset do
 * primeiro dia alinha a coluna 0 corretamente mesmo quando o ano não começa
 * numa segunda-feira.
 */
export function celulasAnuais(historico: { dia: string; incidentes: number }[]): CelulaAnual[] {
  if (historico.length === 0) return [];
  const primeiro = new Date(historico[0].dia + 'T00:00:00');
  const offsetSegunda = (primeiro.getDay() + 6) % 7; // Date.getDay(): 0=Dom..6=Sab -> 0=Seg..6=Dom
  return historico.map((d, indice) => {
    const posicao = indice + offsetSegunda;
    return { dia: d.dia, incidentes: d.incidentes, semana: Math.floor(posicao / 7), diaSemana: posicao % 7 };
  });
}

/** Onde cada mês começa (índice de semana), pra posicionar os rótulos Jan..Dez sobre a grade real. */
export function inicioDasSemanasPorMes(celulas: CelulaAnual[]): number[] {
  const resultado: number[] = [];
  let mesAtual = -1;
  for (const c of celulas) {
    const mes = new Date(c.dia + 'T00:00:00').getMonth();
    if (mes !== mesAtual) {
      resultado.push(c.semana);
      mesAtual = mes;
    }
  }
  return resultado;
}

/**
 * Se o dia cai dentro da janela que o chip de período implica — usada pra
 * esmaecer o resto do calendário anual em vez de encolher a grade (spec §9
 * da E6 aplicada aqui: o Anual sempre mostra o ano inteiro). `custom` nunca
 * teve intervalo por trás (mesmo motivo de `inicioDoPeriodo`), então nada é
 * esmaecido.
 */
export function dentroDoPeriodo(dia: string, period: string, agora: Date): boolean {
  const inicio = inicioDoPeriodo(period, agora);
  if (!inicio) return true;
  return new Date(dia + 'T00:00:00').getTime() >= inicio.getTime();
}

/** Grupo de células do heatmap real, por setor (StationCell.setor). */
interface GrupoSetor {
  setor: string;
  celulas: StationCell[];
}

@Component({
  selector: 'app-heatmap',
  imports: [ChromeTopbarComponent, DockComponent, ConnectionBadgeComponent, FormsModule],
  templateUrl: './heatmap.component.html',
})
export class HeatmapComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  readonly auth = this.authService;
  private cfgService = inject(ConfigService);
  private incidentService = inject(IncidentService);
  private catalogService = inject(CatalogService);

  cfg = this.cfgService.config;

  // ─── Rótulos dos eixos (painéis Temporal e Anual usam dado real) ───
  tempHours = TEMP_HOURS;
  tempDays = TEMP_DAYS;
  months = MONTHS;

  period = signal('7d');
  shift = signal('all');
  readonly setor = signal('');
  readonly epi = signal('');
  readonly ordenar = signal<'ranking' | 'nome' | 'zona'>('zona');

  private readonly filtrosAtuais = computed((): SummaryFiltros => {
    const filtros: SummaryFiltros = { detalhado: true };
    const inicio = inicioDoPeriodo(this.period(), new Date());
    if (inicio) filtros.since = inicio.toISOString();
    if (this.shift() !== 'all') filtros.turno = this.shift();
    if (this.setor()) filtros.setor = this.setor();
    if (this.epi()) filtros.epi = this.epi();
    return filtros;
  });

  private recarregarSummary(): void {
    this.incidentService.loadSummary(this.filtrosAtuais());
  }

  /**
   * A célula do heatmap é a estação: ela agrega os incidentes de todas as
   * câmeras que a cobrem (spec §6.5).
   */
  readonly celulas = computed(() => this.incidentService.summary()?.heatmap ?? []);

  /** distribuicaoTemporal (lista de células) → matriz [faixa2h][diaSemana], mesmo formato que o template já espera. */
  readonly matrizTemporal = computed<number[][]>(() => {
    const celulas = this.incidentService.summary()?.distribuicaoTemporal ?? [];
    const matriz: number[][] = Array.from({ length: 12 }, () => Array(7).fill(0));
    for (const c of celulas) {
      matriz[c.faixa2h][c.diaSemana] = c.incidentes;
    }
    return matriz;
  });

  readonly celulasAno = computed(() =>
    celulasAnuais(this.incidentService.summary()?.historicoAnual ?? []));

  readonly inicioDosMeses = computed(() => inicioDasSemanasPorMes(this.celulasAno()));

  readonly totalSemanasNoAno = computed(() =>
    this.celulasAno().reduce((max, c) => Math.max(max, c.semana), 0) + 1);

  readonly annualTotal = computed(() =>
    this.celulasAno().reduce((soma, c) => soma + c.incidentes, 0));

  estaEsmaecido(dia: string): boolean {
    return !dentroDoPeriodo(dia, this.period(), new Date());
  }

  /**
   * Agrupamento por setor, só para organizar a grade visualmente — a API não
   * tem o conceito de "zona" das plantas fabricadas; usamos o `setor` de
   * `StationCell` quando existir.
   */
  readonly grupos = computed<GrupoSetor[]>(() => {
    const porSetor = new Map<string, StationCell[]>();
    for (const celula of this.celulas()) {
      const chave = celula.setor ?? 'sem setor';
      const lista = porSetor.get(chave) ?? [];
      lista.push(celula);
      porSetor.set(chave, lista);
    }
    return Array.from(porSetor.entries())
      .map(([setor, celulas]) => ({ setor, celulas }))
      .sort((a, b) => a.setor.localeCompare(b.setor));
  });

  /** Lista plana (sem agrupar por setor), usada quando ordenar() !== 'zona'. */
  readonly celulasOrdenadas = computed(() => {
    const modo = this.ordenar();
    const copia = [...this.celulas()];
    if (modo === 'ranking') return copia.sort((a, b) => b.incidentes - a.incidentes);
    if (modo === 'nome') return copia.sort((a, b) => a.nome.localeCompare(b.nome));
    return copia;
  });

  /** Top 5 estações por concentração de incidentes, derivado das células reais. */
  readonly top5 = computed(() =>
    [...this.celulas()].sort((a, b) => b.incidentes - a.incidentes).slice(0, 5));

  readonly top5Max = computed(() => this.top5()[0]?.incidentes || 1);

  /** Setores distintos das estações cadastradas, para popular o <select> — nunca mais "Setor A/B/C" fixo. */
  readonly setoresDisponiveis = computed(() => {
    const setores = new Set<string>();
    for (const s of this.catalogService.stations()) {
      if (s.setor) setores.add(s.setor);
    }
    return Array.from(setores).sort();
  });

  /** Só os 4 EPIs que o backend sabe filtrar (spec §1.4) — os outros 4 de EPI_LIST ficam de fora até o cypher-capture detectar essas violações. */
  readonly episDisponiveis = EPI_LIST.filter(e => ['capacete', 'oculos', 'luvas', 'botas'].includes(e.key));

  readonly urlResumoPdf = computed(() => {
    const filtros = this.filtrosAtuais();
    const params = new URLSearchParams();
    if (filtros.since) params.set('since', filtros.since);
    if (filtros.turno) params.set('turno', filtros.turno);
    if (filtros.setor) params.set('setor', filtros.setor);
    if (filtros.epi) params.set('epi', filtros.epi);
    const query = params.toString();
    return `${environment.apiUrl}/reports/summary.pdf${query ? '?' + query : ''}`;
  });

  ngOnInit(): void {
    this.catalogService.load();
    this.incidentService.loadSummary(this.filtrosAtuais());
    this.incidentService.connect();
  }

  ngOnDestroy(): void {
    this.incidentService.disconnect();
  }

  classeDe(incidentes: number): string {
    return severityClass(Math.min(incidentes, 4));
  }

  /** Rótulo textual da intensidade, consistente com a legenda em tela. */
  rotuloIntensidade(incidentes: number): string {
    return incidentes === 0 ? 'ok' : `${incidentes} inf`;
  }

  setPeriod(p: string) { this.period.set(p); this.recarregarSummary(); }
  setShift(s: string) { this.shift.set(s); this.recarregarSummary(); }
  setSetor(s: string) { this.setor.set(s); this.recarregarSummary(); }
  setEpi(e: string) { this.epi.set(e); this.recarregarSummary(); }
  setOrdenar(o: 'ranking' | 'nome' | 'zona') { this.ordenar.set(o); }

  monthLeft(indiceSemanaDoMes: number): string {
    return `calc(${indiceSemanaDoMes} * (100% / ${this.totalSemanasNoAno()}))`;
  }

  tempTier(n: number): string {
    if (n === 0) return 'h0'; if (n <= 3) return 'h1';
    if (n <= 7) return 'h2'; if (n <= 12) return 'h3';
    return 'h4';
  }
  annualTier(n: number): string {
    if (n === 0) return 'a0'; if (n <= 2) return 'a1';
    if (n <= 5) return 'a2'; if (n <= 9) return 'a3';
    return 'a4';
  }
}
