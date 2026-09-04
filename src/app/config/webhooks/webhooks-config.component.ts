import { Component, OnInit, inject, signal } from '@angular/core';

import { mensagemDeErro } from '../../shared/incident.models';
import { WebhookPayload } from '../../shared/webhook.models';
import { WebhookService } from '../../shared/webhook.service';

const ASSINANTE_VAZIO: WebhookPayload = { url: '', secret: '', minSeverity: 3, ativo: true };

/**
 * Cadastro de assinantes de webhook — sub-aba "Assinantes" de `/config/webhooks`.
 *
 * Mesmo padrão de `EquipesConfigComponent`: rascunho local + lista, sem
 * `FormGroup`, validação mínima no cliente (o backend é a fonte da verdade —
 * URL duplicada e faixa de `minSeverity` só o servidor confirma).
 */
@Component({
  selector: 'app-webhooks-config',
  templateUrl: './webhooks-config.component.html',
})
export class WebhooksConfigComponent implements OnInit {
  private webhook = inject(WebhookService);

  readonly assinantes = this.webhook.assinantes;

  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly novoAssinante = signal<WebhookPayload>({ ...ASSINANTE_VAZIO });

  ngOnInit(): void {
    this.webhook.load();
  }

  salvar(): void {
    const form = this.novoAssinante();
    if (!form.url.trim()) {
      this.erro.set('Informe a URL do assinante.');
      return;
    }
    if (!form.secret.trim()) {
      this.erro.set('Informe o segredo combinado com o assinante.');
      return;
    }
    if (form.minSeverity < 0 || form.minSeverity > 4) {
      this.erro.set('Severidade mínima deve estar entre 0 e 4.');
      return;
    }

    this.erro.set('');
    this.salvando.set(true);
    this.webhook.create(form).subscribe({
      next: () => {
        this.novoAssinante.set({ ...ASSINANTE_VAZIO });
        this.salvando.set(false);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  desativar(id: number): void {
    this.webhook.deactivate(id).subscribe({ error: e => this.erro.set(mensagemDeErro(e)) });
  }
}
