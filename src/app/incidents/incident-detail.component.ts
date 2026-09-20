import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../shared/auth/auth.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { epiFieldLabel } from '../shared/epi-catalog';
import { DockComponent } from '../shared/dock/dock.component';
import { IncidentService } from '../shared/incident.service';
import {
  AlertaStatus, Incident, formatDateTime, incidentLabel, mensagemDeErro,
} from '../shared/incident.models';
import { LlmAnalysisService } from '../shared/llm-analysis.service';
import { RiskAnalysisResponse } from '../shared/llm-analysis.models';

@Component({
  selector: 'app-incident-detail',
  imports: [ChromeTopbarComponent, DockComponent, RouterLink],
  templateUrl: './incident-detail.component.html',
})
export class IncidentDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private incidentService = inject(IncidentService);
  private cfgService = inject(ConfigService);
  private authService = inject(AuthService);
  private llmService = inject(LlmAnalysisService);
  readonly auth = this.authService;

  cfg = this.cfgService.config;
  private readonly id = Number(this.route.snapshot.paramMap.get('id'));

  private readonly buscado = signal<Incident | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  readonly analisando = signal(false);
  readonly analiseResultado = signal<RiskAnalysisResponse | null>(null);
  readonly analiseErro = signal<string | null>(null);

  /**
   * Prefere o store global (fresco via SSE); cai para o resultado do GET
   * inicial se o item saiu da janela de 100 em memória (spec §4).
   */
  readonly incidente = computed(() =>
    this.incidentService.incidents().find(i => i.id === this.id) ?? this.buscado());

  hora = formatDateTime;
  rotulo = incidentLabel;

  epiLista(itens: string[]): string {
    return itens.map(epiFieldLabel).join(', ') || '—';
  }

  ngOnInit(): void {
    this.incidentService.getById(this.id).subscribe({
      next: inc => {
        this.buscado.set(inc);
        this.carregando.set(false);
      },
      error: erro => {
        this.erro.set(mensagemDeErro(erro));
        this.carregando.set(false);
      },
    });

    // Carrega a ultima analise ja feita, se existir — evita reanalisar
    // (e gastar chamada de API) so por reabrir a mesma tela. 404 (nunca
    // analisado) ou 403 (operador) sao esperados e ficam silenciosos.
    this.llmService.ultimaAnalise(this.id).subscribe({
      next: resultado => this.analiseResultado.set(resultado),
      error: () => { /* nada a mostrar ainda; botao permanece "Analisar com IA" */ },
    });
  }

  mudarStatus(status: AlertaStatus): void {
    this.incidentService.acknowledge(this.id, status);
  }

  analisarComIa(): void {
    this.analisando.set(true);
    this.analiseErro.set(null);
    this.analiseResultado.set(null);
    this.llmService.analisar(this.id).subscribe({
      next: resultado => {
        this.analiseResultado.set(resultado);
        this.analisando.set(false);
      },
      error: () => {
        this.analiseErro.set('Não foi possível analisar agora. Tente novamente.');
        this.analisando.set(false);
      },
    });
  }
}
