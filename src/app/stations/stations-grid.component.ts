import { Component, OnInit, inject } from '@angular/core';
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
}
