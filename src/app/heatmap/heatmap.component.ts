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

/**
 * Soma `historicoAnual` (uma linha por dia do ano) numa matriz mês × dia da
 * semana — mesmo formato de agregação de `matrizTemporal` (dia da semana ×
 * faixa horária), só que no grão do ano inteiro em vez da semana. Todas as
 * segundas de março somam na mesma célula `[2][0]`, independente de qual
 * segunda do mês cada incidente aconteceu. Essa é a segunda versão da grade
 * Anual: a primeira (calendário estilo GitHub, uma célula por dia) media a
 * segmentação por mês em blocos separados, mas isso deixava a tela com um
 * padrão visual diferente do card Temporal ao lado — esta versão adota
 * exatamente o mesmo desenho (mesma grade 12×7, mesmos eixos completos,
 * mesmo rodapé de pico+legenda), trocando "hora" por "mês" no eixo.
 */
export function matrizAnualPorMes(historico: { dia: string; incidentes: number }[]): number[][] {
  const matriz: number[][] = Array.from({ length: 12 }, () => Array(7).fill(0));
  for (const d of historico) {
    const data = new Date(d.dia + 'T00:00:00');
    const diaSemana = (data.getDay() + 6) % 7; // Date.getDay(): 0=Dom..6=Sab -> 0=Seg..6=Dom
    matriz[data.getMonth()][diaSemana] += d.incidentes;
  }
  return matriz;
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

  /**
   * Maior valor em matrizTemporal(), usado para destacar o pico real (em vez
   * do "quarta-feira sempre pica" da matriz fabricada). 0 quando o máximo não
   * é único — com dado real esparso, empatar o topo em várias células tornaria
   * o rótulo "Pico da semana" enganoso ao aparecer em várias delas.
   */
  readonly tempMax = computed(() => {
    const valores = this.matrizTemporal().flat();
    const max = valores.reduce((m, v) => Math.max(m, v), 0);
    if (max === 0) return 0;
    return valores.filter(v => v === max).length === 1 ? max : 0;
  });

  /** Dia/faixa do pico real, para a barra de insight abaixo da grade Temporal. `null` sem pico único (matriz vazia ou empate). */
  readonly picoTemporal = computed<{ dia: string; faixa: string; valor: number } | null>(() => {
    const max = this.tempMax();
    if (max === 0) return null;
    const matriz = this.matrizTemporal();
    for (let faixa2h = 0; faixa2h < matriz.length; faixa2h++) {
      const diaSemana = matriz[faixa2h].indexOf(max);
      if (diaSemana !== -1) {
        return { dia: TEMP_DAYS[diaSemana], faixa: `${TEMP_HOURS[faixa2h]}–${TEMP_HOURS[(faixa2h + 1) % 12]}`, valor: max };
      }
    }
    return null;
  });

  /** historicoAnual (lista de dias) → matriz [mês][diaSemana], mesma forma de matrizTemporal. */
  readonly matrizAnual = computed<number[][]>(() =>
    matrizAnualPorMes(this.incidentService.summary()?.historicoAnual ?? []));

  /** Maior valor em matrizAnual(), mesmo critério de tempMax (0 se o máximo empatar). */
  readonly annualMax = computed(() => {
    const valores = this.matrizAnual().flat();
    const max = valores.reduce((m, v) => Math.max(m, v), 0);
    if (max === 0) return 0;
    return valores.filter(v => v === max).length === 1 ? max : 0;
  });

  /** Mês/dia da semana do pico real, para a barra de insight abaixo da grade Anual. */
  readonly picoAnual = computed<{ mes: string; dia: string; valor: number } | null>(() => {
    const max = this.annualMax();
    if (max === 0) return null;
    const matriz = this.matrizAnual();
    for (let mes = 0; mes < matriz.length; mes++) {
      const diaSemana = matriz[mes].indexOf(max);
      if (diaSemana !== -1) {
        return { mes: MONTHS[mes], dia: TEMP_DAYS[diaSemana], valor: max };
      }
    }
    return null;
  });

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

  // Limiares herdados da matriz fabricada (escala 0-14) removida nesta correção
  // de branch. Não recalibrados aqui de propósito — decidir a escala real de
  // incidentes é escopo de produto, não desta correção. Revisar quando houver
  // volume real de demonstração.
  tempTier(n: number): string {
    if (n === 0) return 'h0'; if (n <= 3) return 'h1';
    if (n <= 7) return 'h2'; if (n <= 12) return 'h3';
    return 'h4';
  }

  // Escala maior que tempTier porque cada célula soma ~4-5 ocorrências (todas
  // as segundas de um mês, por ex.) em vez de uma única faixa de 2h numa
  // semana — mesmo aviso: não calibrado a volume real de demonstração.
  annualTier(n: number): string {
    if (n === 0) return 'h0'; if (n <= 6) return 'h1';
    if (n <= 14) return 'h2'; if (n <= 24) return 'h3';
    return 'h4';
  }
}
