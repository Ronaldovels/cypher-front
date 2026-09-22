import { Component, OnInit, inject } from '@angular/core';

import { McpCredentialService } from '../../shared/mcp-credential.service';
import { McpConfigComponent } from './mcp-config.component';

/**
 * Aba "Credenciais MCP" de /config/mcp — sem sub-abas (diferente de
 * WebhooksTabComponent), vai direto pro conteúdo. Mesmo papel estrutural
 * de WebhooksTabComponent: só a casca (.tab-head), delega o conteúdo pro
 * componente de configuração.
 */
@Component({
  selector: 'app-mcp-tab',
  imports: [McpConfigComponent],
  templateUrl: './mcp-tab.component.html',
})
export class McpTabComponent implements OnInit {
  private mcp = inject(McpCredentialService);

  ngOnInit(): void {
    this.mcp.load();
  }
}
