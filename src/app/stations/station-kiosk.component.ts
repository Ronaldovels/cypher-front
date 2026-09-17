import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../shared/auth/auth.service';
import { CatalogService } from '../shared/catalog.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { DockComponent } from '../shared/dock/dock.component';
import { IncidentService } from '../shared/incident.service';
import { LiveFeedComponent } from '../shared/live-feed/live-feed.component';
import { SoundAlertService } from '../shared/sound-alert.service';
import { Incident, dicaDe, formatTime, incidentLabel } from '../shared/incident.models';

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
export class StationKioskComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private catalogService = inject(CatalogService);
  private incidentService = inject(IncidentService);
  private cfgService = inject(ConfigService);
  private authService = inject(AuthService);
  private soundAlertService = inject(SoundAlertService);
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
  dica = dicaDe;

  private eventosBuscados = false;

  /**
   * Chave do incidente mais recente já visto pelo alerta sonoro, lida de
   * forma síncrona na construção (não dentro do `effect` — se lida lá, um
   * store vazio no primeiro run faria o próprio primeiro incidente real
   * virar "base" em vez de tocar). `null` cobre tanto "nada no store ainda"
   * quanto qualquer item pré-existente (ex.: dashboard visitado antes de
   * abrir este kiosk) — em ambos os casos, só um incidente novo *depois*
   * deste ponto deve disparar o bipe.
   */
  private ultimaChaveVista: string | null = this.incidentService.incidents()[0]?.incidentKey ?? null;

  constructor() {
    effect(() => {
      const estacao = this.station();
      if (!estacao || estacao.cameras.length === 0 || this.eventosBuscados) {
        return;
      }
      this.eventosBuscados = true;
      this.buscarEventosRecentes(estacao.cameras.map(c => c.id));
    });

    /**
     * Alerta sonoro (achado SPI 2026-09-17): quem está com o kiosk de uma
     * estação aberto na tela precisa notar uma infração sem depender de
     * estar lendo o texto — som toca só para incidentes das câmeras desta
     * estação, não de qualquer câmera do sistema.
     */
    effect(() => {
      const estacao = this.station();
      const maisRecente = this.incidentService.incidents()[0];
      if (!estacao || !maisRecente || maisRecente.incidentKey === this.ultimaChaveVista) {
        return;
      }
      this.ultimaChaveVista = maisRecente.incidentKey;
      const cameraIds = new Set(estacao.cameras.map(c => c.id));
      if (cameraIds.has(maisRecente.cameraId)) {
        this.soundAlertService.tocar(maisRecente.severity);
      }
    });
  }

  ngOnInit(): void {
    this.catalogService.load();
    this.incidentService.connect();
  }

  ngOnDestroy(): void {
    this.incidentService.disconnect();
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
