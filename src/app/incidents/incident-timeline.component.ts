import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { CatalogService } from '../shared/catalog.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { DockComponent } from '../shared/dock/dock.component';
import { IncidentService } from '../shared/incident.service';
import {
  AlertaStatus, Incident, Page, formatTime, incidentLabel, mensagemDeErro,
} from '../shared/incident.models';

const TAMANHO_PAGINA = 20;

@Component({
  selector: 'app-incident-timeline',
  imports: [ChromeTopbarComponent, DockComponent, FormsModule],
  templateUrl: './incident-timeline.component.html',
})
export class IncidentTimelineComponent implements OnInit {
  private incidentService = inject(IncidentService);
  private catalogService = inject(CatalogService);
  private cfgService = inject(ConfigService);
  private router = inject(Router);

  cfg = this.cfgService.config;
  readonly cameras = this.catalogService.cameras;

  readonly camera = signal('');
  readonly severityMin = signal<number | null>(null);
  readonly status = signal<AlertaStatus | ''>('');
  readonly since = signal('');
  readonly page = signal(0);

  private readonly _resultado = signal<Page<Incident> | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  /**
   * Linhas com o status mais fresco conhecido: se um reconhecimento (aqui ou
   * na tela de detalhe) já atualizou o store global, a linha reflete isso sem
   * precisar rebuscar a página (spec §4).
   */
  readonly linhas = computed(() => {
    const globais = this.incidentService.incidents();
    return (this._resultado()?.content ?? []).map(i =>
      globais.find(g => g.incidentKey === i.incidentKey) ?? i);
  });

  readonly totalPaginas = computed(() => this._resultado()?.totalPages ?? 0);
  readonly totalElementos = computed(() => this._resultado()?.totalElements ?? 0);

  hora = formatTime;
  rotulo = incidentLabel;

  ngOnInit(): void {
    this.catalogService.load();
    this.buscar();
  }

  aplicarFiltros(): void {
    this.page.set(0);
    this.buscar();
  }

  limparFiltros(): void {
    this.camera.set('');
    this.severityMin.set(null);
    this.status.set('');
    this.since.set('');
    this.aplicarFiltros();
  }

  proximaPagina(): void {
    if (this.page() + 1 < this.totalPaginas()) {
      this.page.update(p => p + 1);
      this.buscar();
    }
  }

  paginaAnterior(): void {
    if (this.page() > 0) {
      this.page.update(p => p - 1);
      this.buscar();
    }
  }

  abrirDetalhe(inc: Incident): void {
    this.router.navigate(['/incidentes', inc.id]);
  }

  /** Ação rápida: só avança para o próximo passo natural. Transição livre completa fica no detalhe. */
  proximoStatus(status: AlertaStatus): AlertaStatus | null {
    if (status === 'PENDENTE') return 'REVISADO';
    if (status === 'REVISADO') return 'RESOLVIDO';
    return null;
  }

  reconhecer(inc: Incident, event: Event): void {
    event.stopPropagation();
    const proximo = this.proximoStatus(inc.status);
    if (proximo) {
      this.incidentService.acknowledge(inc.id, proximo);
    }
  }

  private buscar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.incidentService
      .search(
        {
          camera: this.camera() || undefined,
          severityMin: this.severityMin() ?? undefined,
          status: (this.status() || undefined) as AlertaStatus | undefined,
          since: this.since() || undefined,
        },
        this.page(),
        TAMANHO_PAGINA,
      )
      .subscribe({
        next: pagina => {
          this._resultado.set(pagina);
          this.carregando.set(false);
        },
        error: erro => {
          this.erro.set(mensagemDeErro(erro));
          this.carregando.set(false);
        },
      });
  }
}
