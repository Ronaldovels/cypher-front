import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../shared/auth/auth.service';
import { CatalogService } from '../shared/catalog.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { ConnectionBadgeComponent } from '../shared/connection-badge/connection-badge.component';
import { DockComponent } from '../shared/dock/dock.component';
import { IncidentService } from '../shared/incident.service';
import { LiveFeedComponent } from '../shared/live-feed/live-feed.component';
import { formatTime, incidentLabel, severityClass } from '../shared/incident.models';

@Component({
  selector: 'app-dashboard',
  imports: [
    ChromeTopbarComponent, DockComponent, RouterLink,
    ConnectionBadgeComponent, LiveFeedComponent,
  ],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  readonly auth = this.authService;
  private cfgService = inject(ConfigService);
  private incidentService = inject(IncidentService);
  private catalogService = inject(CatalogService);

  cfg = this.cfgService.config;

  readonly conexao = this.incidentService.connection;
  readonly cameras = this.catalogService.cameras;

  /** Câmera exibida no feed. Sem seleção explícita, a primeira do catálogo. */
  readonly cameraAtual = computed(() => this.cameras()[0] ?? null);

  readonly resumo = this.incidentService.summary;

  readonly incidentesHoje = computed(() => this.resumo()?.incidentesHoje ?? 0);
  readonly criticosHoje = computed(() => this.resumo()?.criticosHoje ?? 0);
  readonly pendentes = computed(() => this.resumo()?.pendentes ?? 0);

  readonly variacaoVsOntem = computed(() => {
    const resumo = this.resumo();
    if (!resumo) {
      return 'sem dados';
    }
    const delta = resumo.incidentesHoje - resumo.incidentesOntem;
    if (delta === 0) {
      return 'igual a ontem';
    }
    return `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)} vs ontem`;
  });

  readonly heatData = computed(() => this.resumo()?.heatmap ?? []);
  readonly barData = computed(() => this.resumo()?.ultimosSeteDias ?? []);

  readonly maxV = computed(() =>
    Math.max(1, ...this.barData().map(d => d.incidentes)));

  /** Média diária real do período, para o rótulo não afirmar número fixo. */
  readonly mediaDiaria = computed(() => {
    const dados = this.barData();
    if (!dados.length) {
      return 0;
    }
    return dados.reduce((a, b) => a + b.incidentes, 0) / dados.length;
  });

  /** Os cinco mais recentes, para a lista lateral. */
  readonly recentes = computed(() => this.incidentService.incidents().slice(0, 5));

  today = computed(() => {
    const now = new Date();
    return now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  });

  plantName = computed(() => this.cfg()?.company || 'sua planta');

  ngOnInit(): void {
    this.catalogService.load();
    this.incidentService.loadHistory();
    this.incidentService.loadSummary();
    this.incidentService.connect();
  }

  ngOnDestroy(): void {
    this.incidentService.disconnect();
  }

  // Helpers de apresentação, reexportados para o template.
  hora = formatTime;
  rotulo = incidentLabel;

  heatClass(incidentes: number): string {
    return severityClass(Math.min(incidentes, 4));
  }

  heatLabel(incidentes: number): string {
    return incidentes === 0 ? 'ok' : `${incidentes} inf`;
  }

  barPct(v: number): number {
    return (v / this.maxV()) * 100;
  }

  meanPct(): number {
    const dados = this.barData();
    if (!dados.length) {
      return 0;
    }
    const soma = dados.reduce((a, b) => a + b.incidentes, 0);
    return (soma / dados.length / this.maxV()) * 100;
  }

  kpiRingDash(r: number): number {
    return 2 * Math.PI * r;
  }

  kpiRingOffset(r: number, pct: number): number {
    return 2 * Math.PI * r * (1 - pct / 100);
  }

  diaCurto(iso: string): string {
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return dias[new Date(`${iso}T12:00:00`).getDay()];
  }
}
