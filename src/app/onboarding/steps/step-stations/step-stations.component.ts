import { Component, computed, inject } from '@angular/core';

import { CatalogService } from '../../../shared/catalog.service';
import { StationsConfigComponent } from '../../../config/stations/stations-config.component';

/**
 * Encaixa o cadastro no wizard.
 *
 * Adaptador de propósito: o componente de cadastro não conhece onboarding, e
 * este não conhece formulário. Sem essa separação, o cadastro acabaria com um
 * `@Input() modoOnboarding` e dois caminhos de renderização — que é como
 * formulários duplicados nascem.
 */
@Component({
  selector: 'app-step-stations',
  imports: [StationsConfigComponent],
  template: `
    <div class="passo">
      <h2>O que o Cypher vai monitorar</h2>
      <p class="sub">
        Cadastre pelo menos uma estação e uma câmera. Você pode ajustar isso
        depois em Configurações · Estações.
      </p>

      <app-stations-config />

      @if (!completo()) {
        <p class="aviso">
          Sem câmera cadastrada, o painel abre vazio. Você pode seguir agora e
          voltar depois.
        </p>
      }
    </div>
  `,
  styles: [`
    .passo { display: flex; flex-direction: column; gap: 12px; }
    h2 { font-size: 18px; margin: 0; }
    .sub { margin: 0; font-size: 13px; opacity: .7; }
    .aviso {
      margin: 4px 0 0; padding: 9px 12px; border-radius: 6px; font-size: 12px;
      border: 1px solid #FFCE38; color: #FFCE38; background: rgba(255, 206, 56, .08);
    }
  `],
})
export class StepStationsComponent {
  private catalog = inject(CatalogService);

  /**
   * Lê o mesmo signal do catálogo que o cadastro alimenta, em vez de consultar
   * o componente filho por `viewChild`: uma query de view não está resolvida
   * quando o template é avaliado pela primeira vez, e `viewChild.required`
   * lançaria nessa passagem.
   */
  readonly completo = computed(() =>
    this.catalog.stations().some(e => e.ativa && e.cameras.length > 0));
}
