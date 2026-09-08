import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { environment } from '../../environments/environment';
import { AuthService } from '../shared/auth/auth.service';
import { CatalogService } from '../shared/catalog.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { DockComponent } from '../shared/dock/dock.component';
import { IncidentService } from '../shared/incident.service';
import {
  AlertaStatus, Incident, Page, formatDateTime, incidentLabel, mensagemDeErro,
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
  private authService = inject(AuthService);
  readonly auth = this.authService;

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
   * Chaves reconhecidas nesta própria tela (via `reconhecer`) → status pedido,
   * usadas para puxar o status atualizado do store global só para essas
   * linhas, e só quando o store realmente confirma o status pedido.
   *
   * O store global não é confiável como fonte geral aqui: `search()` não
   * insere nele (spec, Tarefa 1 — "não entra no store de 100 itens"), e esta
   * tela nunca chama `connect()`, então o store é só sobra de uma visita
   * anterior a outra página. Preferir o store para toda linha faria uma busca
   * nova (que já veio correta do backend) ser sobrescrita por dado velho.
   *
   * Guardar o status pedido (não só a chave) evita outro jeito de vazar dado
   * velho: `acknowledge` engole erro de HTTP sem sinalizar — sem essa checagem
   * um PUT que falhou deixaria a chave "acompanhada" para sempre, e a linha
   * passaria a mostrar o que quer que estivesse (ou viesse a estar) no store
   * para aquele id, em vez do resultado real da busca.
   */
  private readonly _acompanhados = signal<Map<string, AlertaStatus>>(new Map());

  /**
   * Linhas com o status mais fresco conhecido: para as linhas reconhecidas
   * nesta tela cujo status pedido já foi confirmado pelo store, reflete a
   * atualização sem precisar rebuscar a página; todas as outras — inclusive
   * as ainda pendentes ou cujo PUT falhou — vêm direto do resultado da busca.
   */
  readonly linhas = computed(() => {
    const acompanhados = this._acompanhados();
    const globais = this.incidentService.incidents();
    return (this._resultado()?.content ?? []).map(i => {
      const statusEsperado = acompanhados.get(i.incidentKey);
      if (!statusEsperado) {
        return i;
      }
      const doStore = globais.find(g => g.incidentKey === i.incidentKey);
      return doStore?.status === statusEsperado ? doStore : i;
    });
  });

  readonly totalPaginas = computed(() => this._resultado()?.totalPages ?? 0);
  readonly totalElementos = computed(() => this._resultado()?.totalElements ?? 0);

  readonly urlExportacaoCsv = computed(() => {
    const params = new URLSearchParams();
    if (this.camera()) params.set('camera', this.camera());
    if (this.severityMin() != null) params.set('severityMin', String(this.severityMin()));
    if (this.status()) params.set('status', this.status());
    if (this.since()) params.set('since', new Date(this.since()).toISOString());
    const query = params.toString();
    return `${environment.apiUrl}/reports/incidents.csv${query ? '?' + query : ''}`;
  });

  hora = formatDateTime;
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
      // Marcado antes de saber o resultado: assim que `acknowledge` resolver
      // e o store for atualizado, `linhas` já sabe puxar essa linha de lá —
      // mas só se o store confirmar exatamente este status (ver comentário
      // acima de `_acompanhados`).
      this._acompanhados.update(atual => new Map(atual).set(inc.incidentKey, proximo));
      this.incidentService.acknowledge(inc.id, proximo);
    }
  }

  private buscar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    // Busca nova é autoritativa: reconhecimentos de uma visualização/filtro
    // anterior não devem sobreviver e sobrescrever os resultados atuais.
    this._acompanhados.set(new Map());
    this.incidentService
      .search(
        {
          camera: this.camera() || undefined,
          severityMin: this.severityMin() ?? undefined,
          status: (this.status() || undefined) as AlertaStatus | undefined,
          // `datetime-local` não traz offset (spec do backend exige
          // OffsetDateTime); convertendo para ISO com `Z` via fuso do
          // navegador, que é parseável e suficiente numa planta única.
          since: this.since() ? new Date(this.since()).toISOString() : undefined,
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
