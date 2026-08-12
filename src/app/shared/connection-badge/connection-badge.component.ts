import { Component, inject } from '@angular/core';

import { IncidentService } from '../incident.service';
import { USE_MOCK_DATA } from '../mock/use-mock-data.token';

/**
 * Estado da conexão — ou o aviso de que o painel está mostrando exemplos.
 *
 * A constraint do plano diz que dado fabricado precisa estar rotulado em tela.
 * Este é o lugar onde a pessoa já olha para saber se pode confiar no que está
 * vendo, então o aviso mora aqui em vez de num banner à parte.
 */
@Component({
  selector: 'app-connection-badge',
  template: `
    @if (exemplo) {
      <span class="conn mock"><i class="dot"></i>dados de exemplo</span>
    } @else {
      <span class="conn" [class.live]="estado() === 'ao vivo'"
            [class.off]="estado() === 'offline'">
        <i class="dot"></i>{{ estado() }}
      </span>
    }
  `,
  styles: [`
    .conn { display: inline-flex; align-items: center; gap: 6px;
            font-size: 12px; text-transform: lowercase; opacity: .8; }
    .dot  { width: 7px; height: 7px; border-radius: 50%; background: #FFCE38; }
    .live .dot, .conn.live .dot { background: #34D07E; }
    .off  .dot, .conn.off  .dot { background: #EE4242; }
    .mock { border: 1px dashed #FFCE38; border-radius: 999px;
            padding: 2px 10px; color: #FFCE38; opacity: 1; }
  `],
})
export class ConnectionBadgeComponent {
  private service = inject(IncidentService);

  /** Não muda em runtime: a flag é de build. */
  readonly exemplo = inject(USE_MOCK_DATA);

  estado = this.service.connection;
}
