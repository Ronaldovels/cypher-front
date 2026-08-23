import { Component } from '@angular/core';

import { StationsConfigComponent } from './stations-config.component';

/**
 * Aba "Estações e câmeras" da página de configurações.
 *
 * Sem topbar nem dock próprios: quem monta a moldura do produto é
 * `SettingsPageComponent`, compartilhada com as outras abas.
 */
@Component({
  selector: 'app-stations-tab',
  imports: [StationsConfigComponent],
  template: `
    <div class="tab-head">
      <div>
        <div class="eyebrow-accent">Estações e câmeras</div>
        <h2 class="tab-title">O que o Cypher vai <em style="color:var(--accent);font-style:normal">monitorar.</em></h2>
        <p class="sub" style="font-size:14px;margin-top:6px">Cada célula do mapa de calor é uma estação. Mudanças aqui já valem na hora — não há rascunho para salvar.</p>
      </div>
    </div>
    <div style="margin-top:32px">
      <app-stations-config />
    </div>
  `,
})
export class StationsTabComponent {
}
