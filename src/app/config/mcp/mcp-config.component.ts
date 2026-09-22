import { Component, OnInit, inject, signal } from '@angular/core';

import { mensagemDeErro } from '../../shared/incident.models';
import { McpCredentialService } from '../../shared/mcp-credential.service';

/**
 * CRUD de credenciais MCP — sub-aba única de /config/mcp. Mesmo padrão de
 * WebhooksConfigComponent (rascunho local + lista, sem FormGroup), com uma
 * diferença: o secret é gerado pelo servidor e só existe uma vez, logo
 * após a criação — guardado num signal separado da lista, nunca persistido.
 */
@Component({
  selector: 'app-mcp-config',
  templateUrl: './mcp-config.component.html',
})
export class McpConfigComponent implements OnInit {
  private mcp = inject(McpCredentialService);

  readonly credenciais = this.mcp.credenciais;

  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly novoNome = signal('');
  readonly apiKeyRecemCriada = signal<string | null>(null);

  ngOnInit(): void {
    this.mcp.load();
  }

  criar(): void {
    if (!this.novoNome().trim()) {
      this.erro.set('Informe o nome da credencial.');
      return;
    }

    this.erro.set('');
    this.salvando.set(true);
    this.mcp.create({ nome: this.novoNome() }).subscribe({
      next: criada => {
        this.apiKeyRecemCriada.set(criada.apiKey);
        this.novoNome.set('');
        this.salvando.set(false);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  fecharAlertaDeSecret(): void {
    this.apiKeyRecemCriada.set(null);
  }

  revogar(id: number): void {
    this.mcp.revoke(id).subscribe({ error: e => this.erro.set(mensagemDeErro(e)) });
  }
}
