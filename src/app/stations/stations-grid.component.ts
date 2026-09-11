import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../shared/auth/auth.service';
import { CatalogService } from '../shared/catalog.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { DockComponent } from '../shared/dock/dock.component';
import { LiveFeedComponent } from '../shared/live-feed/live-feed.component';
import { Camera, Station } from '../shared/incident.models';

@Component({
  selector: 'app-stations-grid',
  imports: [ChromeTopbarComponent, DockComponent, RouterLink, LiveFeedComponent],
  templateUrl: './stations-grid.component.html',
})
export class StationsGridComponent implements OnInit {
  private catalogService = inject(CatalogService);
  private cfgService = inject(ConfigService);
  private authService = inject(AuthService);
  readonly auth = this.authService;

  cfg = this.cfgService.config;
  readonly stations = this.catalogService.stations;

  ngOnInit(): void {
    this.catalogService.load();
  }

  /** Miniatura representativa: a primeira câmera. Todas aparecem no kiosk da estação. */
  primeiraCamera(station: Station): Camera | null {
    return station.cameras[0] ?? null;
  }

  /** Agrupa as estações por setor para reforçar visualmente a segmentação já existente
   *  (cada card já é uma estação — isto só organiza a grid em seções, sem mudar dado
   *  nem navegação). Setores em ordem de primeira aparição; sem setor vai por último. */
  readonly grupos = computed(() => {
    const porSetor = new Map<string | null, Station[]>();
    for (const station of this.stations()) {
      const chave = station.setor;
      if (!porSetor.has(chave)) porSetor.set(chave, []);
      porSetor.get(chave)!.push(station);
    }
    const comSetor = [...porSetor.entries()].filter(([setor]) => setor !== null);
    const semSetor = porSetor.get(null);
    const grupos = comSetor.map(([setor, stations]) => ({ setor, label: setor as string, stations }));
    if (semSetor?.length) {
      grupos.push({ setor: null, label: 'Sem setor', stations: semSetor });
    }
    return grupos;
  });
}
