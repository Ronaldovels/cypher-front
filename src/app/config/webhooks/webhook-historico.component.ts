import { Component, effect, inject, input, signal } from '@angular/core';

import { Page, mensagemDeErro } from '../../shared/incident.models';
import { WebhookDelivery } from '../../shared/webhook.models';
import { WebhookService } from '../../shared/webhook.service';

/**
 * Histórico de entregas do assinante selecionado — sub-aba "Histórico" de
 * `/config/webhooks` (design doc de cadastro de webhook, §3.2/§3.3).
 *
 * Paginação sob demanda: cada troca de página/assinante dispara uma nova
 * busca, sem manter estado "ao vivo" — mesmo motivo do `search()` de
 * incidentes (E3 §4).
 */
@Component({
  selector: 'app-webhook-historico',
  templateUrl: './webhook-historico.component.html',
})
export class WebhookHistoricoComponent {
  private webhook = inject(WebhookService);

  readonly webhookId = input.required<number | null>();

  readonly pagina = signal<Page<WebhookDelivery> | null>(null);
  readonly pageIndex = signal(0);
  readonly erro = signal('');
  readonly tamanhoPagina = 20;

  private ultimoId: number | null | undefined = undefined;

  constructor() {
    effect(() => {
      const id = this.webhookId();
      if (id !== this.ultimoId) {
        this.ultimoId = id;
        this.pageIndex.set(0);
      }
      const page = this.pageIndex();
      if (id == null) {
        this.pagina.set(null);
        return;
      }
      this.erro.set('');
      this.webhook.deliveries(id, page, this.tamanhoPagina).subscribe({
        next: p => this.pagina.set(p),
        error: e => this.erro.set(mensagemDeErro(e)),
      });
    });
  }

  proximaPagina(): void {
    const p = this.pagina();
    if (p && this.pageIndex() < p.totalPages - 1) {
      this.pageIndex.update(n => n + 1);
    }
  }

  paginaAnterior(): void {
    if (this.pageIndex() > 0) {
      this.pageIndex.update(n => n - 1);
    }
  }

  statusLabel(status: WebhookDelivery['status']): string {
    switch (status) {
      case 'ENTREGUE': return 'entregue';
      case 'FALHA': return 'falha';
      default: return 'pendente';
    }
  }

  tentativasLabel(n: number): string {
    return n === 1 ? '1 tentativa' : `${n} tentativas`;
  }

  formatarData(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
