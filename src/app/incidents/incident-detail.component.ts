import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { DockComponent } from '../shared/dock/dock.component';
import { IncidentService } from '../shared/incident.service';
import {
  AlertaStatus, Incident, formatDateTime, incidentLabel, mensagemDeErro,
} from '../shared/incident.models';

@Component({
  selector: 'app-incident-detail',
  imports: [ChromeTopbarComponent, DockComponent, RouterLink],
  templateUrl: './incident-detail.component.html',
})
export class IncidentDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private incidentService = inject(IncidentService);
  private cfgService = inject(ConfigService);

  cfg = this.cfgService.config;
  private readonly id = Number(this.route.snapshot.paramMap.get('id'));

  private readonly buscado = signal<Incident | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  /**
   * Prefere o store global (fresco via SSE); cai para o resultado do GET
   * inicial se o item saiu da janela de 100 em memória (spec §4).
   */
  readonly incidente = computed(() =>
    this.incidentService.incidents().find(i => i.id === this.id) ?? this.buscado());

  hora = formatDateTime;
  rotulo = incidentLabel;

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
  }

  mudarStatus(status: AlertaStatus): void {
    this.incidentService.acknowledge(this.id, status);
  }
}
