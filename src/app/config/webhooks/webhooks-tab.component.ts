import { Component, OnInit, inject, signal } from '@angular/core';

import { WebhookService } from '../../shared/webhook.service';
import { WebhooksConfigComponent } from './webhooks-config.component';
import { WebhookHistoricoComponent } from './webhook-historico.component';

type SubAba = 'assinantes' | 'historico';

/**
 * Aba "Webhooks" de `/config/webhooks` — duas sub-abas internas, sem rota
 * própria (design doc de cadastro de webhook, §3.2), mesmo padrão de
 * `EquipeUsuariosTabComponent`.
 *
 * A sub-aba "Histórico" precisa de um assinante escolhido para consultar
 * `WebhookHistoricoComponent` (cujo `webhookId` é um input puro, sem seletor
 * embutido — ver spec do componente). O seletor mora aqui, e não em
 * `WebhooksConfigComponent`: nenhuma tarefa do plano liga um botão de lá a
 * este componente, então o carregamento de `WebhookService.assinantes()`
 * também é feito aqui, direto — mesmo padrão redundante de
 * `EquipesConfigComponent`/`UsuariosConfigComponent` chamando `load()` cada
 * um no seu próprio `ngOnInit()` sobre o mesmo `TeamService`.
 */
@Component({
  selector: 'app-webhooks-tab',
  imports: [WebhooksConfigComponent, WebhookHistoricoComponent],
  templateUrl: './webhooks-tab.component.html',
})
export class WebhooksTabComponent implements OnInit {
  private webhook = inject(WebhookService);

  readonly assinantes = this.webhook.assinantes;

  readonly subaba = signal<SubAba>('assinantes');
  readonly assinanteSelecionado = signal<number | null>(null);

  ngOnInit(): void {
    this.webhook.load();
  }

  irPara(s: SubAba): void {
    this.subaba.set(s);
  }

  selecionarAssinante(id: string): void {
    this.assinanteSelecionado.set(id ? Number(id) : null);
  }
}
