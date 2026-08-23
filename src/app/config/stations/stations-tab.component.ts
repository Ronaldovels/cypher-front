import { Component } from '@angular/core';

import { ChromeTopbarComponent } from '../../shared/chrome-topbar/chrome-topbar.component';
import { DockComponent } from '../../shared/dock/dock.component';
import { StationsConfigComponent } from './stations-config.component';

/**
 * Página de configuração de estações e câmeras.
 *
 * Existe separada do componente de cadastro porque carrega a moldura do
 * produto — topbar e dock — que o passo do onboarding não deve ter.
 */
@Component({
  selector: 'app-stations-page',
  imports: [ChromeTopbarComponent, DockComponent, StationsConfigComponent],
  template: `
    <app-chrome-topbar />
    <main class="pagina">
      <header>
        <h1>Estações e câmeras</h1>
        <p>O que o Cypher monitora. Cada célula do mapa de calor é uma estação.</p>
      </header>
      <app-stations-config />
    </main>
    <app-dock />
  `,
  styles: [`
    .pagina { padding: 24px 28px 96px; max-width: 1080px; margin: 0 auto; }
    header { margin-bottom: 20px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    header p { margin: 0; font-size: 13px; opacity: .65; }
  `],
})
export class StationsPageComponent {
}
