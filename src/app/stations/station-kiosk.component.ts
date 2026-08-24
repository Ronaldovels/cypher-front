import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../shared/auth/auth.service';
import { CatalogService } from '../shared/catalog.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { DockComponent } from '../shared/dock/dock.component';
import { IncidentService } from '../shared/incident.service';
import { LiveFeedComponent } from '../shared/live-feed/live-feed.component';
import { Incident, formatTime, incidentLabel } from '../shared/incident.models';

const EVENTOS_POR_CAMERA = 10;
const EVENTOS_EXIBIDOS = 10;

/**
 * Dock por papel, não por rota (design doc de E4, §4.1): para o OPERADOR o
 * kiosk continua sem navegação (mapa de telas do doc de E1, §14.1); para um
 * GESTOR supervisionando a estação, o dock aparece — restrição descoberta em
 * E3 (nota de 2026-08-23 no fim de §15 da spec de E1).
 */
@Component({
  selector: 'app-station-kiosk',
  imports: [ChromeTopbarComponent, LiveFeedComponent, DockComponent],
  templateUrl: './station-kiosk.component.html',
})
export class StationKioskComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private catalogService = inject(CatalogService);
  private incidentService = inject(IncidentService);
  private cfgService = inject(ConfigService);
  private authService = inject(AuthService);
  readonly auth = this.authService;

  cfg = this.cfgService.config;
  private readonly stationId = this.route.snapshot.paramMap.get('id')!;

  readonly station = computed(() =>
    this.catalogService.stations().find(s => s.id === this.stationId) ?? null);

  readonly episRequeridos = computed(() => this.cfgService.config()?.epis ?? []);

  private readonly _eventos = signal<Incident[]>([]);
  readonly eventos = this._eventos.asReadonly();
  readonly carregandoEventos = signal(false);

  hora = formatTime;
  rotulo = incidentLabel;

  private eventosBuscados = false;

  constructor() {
    effect(() => {
      const estacao = this.station();
      if (!estacao || estacao.cameras.length === 0 || this.eventosBuscados) {
        return;
      }
      this.eventosBuscados = true;
      this.buscarEventosRecentes(estacao.cameras.map(c => c.id));
    });
  }

  ngOnInit(): void {
    this.catalogService.load();
  }

  private buscarEventosRecentes(cameraIds: string[]): void {
    this.carregandoEventos.set(true);
    forkJoin(cameraIds.map(id => this.incidentService.search({ camera: id }, 0, EVENTOS_POR_CAMERA)))
      .subscribe({
        next: paginas => {
          const todos = paginas.flatMap(p => p.content);
          todos.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
          this._eventos.set(todos.slice(0, EVENTOS_EXIBIDOS));
          this.carregandoEventos.set(false);
        },
        error: () => this.carregandoEventos.set(false),
      });
  }
}
