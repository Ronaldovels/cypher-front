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

// ─── DADOS DE EXEMPLO ──────────────────────────────────
// O histórico anual não tem endpoint em E1 (spec do parceiro humano). Fica
// com dado fabricado, mas rotulado em tela com o selo "dado de exemplo" e
// opacidade reduzida — não removido.
export const TEMP_HOURS = ['12AM', '2AM', '4AM', '6AM', '8AM', '10AM', '12PM', '2PM', '4PM', '6PM', '8PM', '10PM'];
export const TEMP_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MONTH_STARTS = [0, 5, 9, 13, 17, 22, 26, 31, 35, 40, 44, 48];

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

function buildAnnual(): { w: number; d: number; v: number; peak: boolean }[] {
  const weekBase = (w: number): number => {
    if (w === 11) return 9;
    if (w >= 8 && w <= 13) return 5;
    if (w >= 0 && w <= 7) return 4;
    if (w >= 14 && w <= 24) return 1.6;
    if (w >= 25 && w <= 34) return 5;
    if (w >= 35 && w <= 43) return 3;
    return 1;
  };
  const cells: { w: number; d: number; v: number; peak: boolean }[] = [];
  let seed = 7;
  const rng = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let w = 0; w < 52; w++) {
    for (let d = 0; d < 7; d++) {
      const dayMul = (d === 5 || d === 6) ? 0.35 : 1;
      const wedBoost = d === 2 ? 1.4 : 1;
      const raw = weekBase(w) * dayMul * wedBoost * (0.5 + rng());
      const v = Math.round(Math.max(0, raw));
      cells.push({ w, d, v, peak: w === 11 && v > 6 });
    }
  }
  return cells;
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

  // ─── Dado de exemplo (painéis rotulados, ver constantes acima) ───
  tempHours = TEMP_HOURS;
  tempDays = TEMP_DAYS;
  months = MONTHS;
  monthStarts = MONTH_STARTS;
  annualCells = buildAnnual();
  annualTotal = this.annualCells.reduce((a, c) => a + c.v, 0);

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

  monthLeft(i: number): string { return `calc(${this.monthStarts[i]} * (100% / 52))`; }

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
  annualCellTitle(c: { w: number; d: number; v: number }): string {
    return `Semana ${c.w + 1} · ${TEMP_DAYS[c.d] || ''} · ${c.v} incidente${c.v === 1 ? '' : 's'}`;
  }
}
