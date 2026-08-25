import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../shared/auth/auth.service';
import { ChromeTopbarComponent } from '../../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../../shared/config.service';
import { DockComponent } from '../../shared/dock/dock.component';

interface SettingsTab { path: string; label: string; hint: string; }

const TABS: SettingsTab[] = [
  { path: 'identidade', label: 'Identidade da empresa', hint: 'Marca · CNPJ · cor' },
  { path: 'estacoes', label: 'Estações e câmeras', hint: 'O que será monitorado' },
  { path: 'epis', label: 'EPIs monitorados', hint: 'Seleção dos equipamentos' },
  { path: 'cas', label: 'CAs e validades', hint: 'Certificados de aprovação' },
  { path: 'equipe', label: 'Equipes e usuários', hint: 'Alocação e acesso' },
];

/**
 * Casca compartilhada das abas de configuração.
 *
 * Centraliza aqui o que o onboarding só deixava editar uma vez, no primeiro
 * setup: cada aba tem seu próprio rascunho e botão Salvar (ver *-tab.component.ts).
 * A trilha reaproveita `.cat-rail`/`.cat-item`, que já existiam no CSS global
 * para um recurso de categorias de EPI que nunca chegou a ser usado.
 */
@Component({
  selector: 'app-settings-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ChromeTopbarComponent, DockComponent],
  templateUrl: './settings-page.component.html',
  styles: [`
    .settings-shell { display: grid; grid-template-columns: minmax(220px, 260px) 1fr; min-height: calc(100vh - 81px); }
    .settings-content { padding: 40px 48px 120px; max-width: 1320px; }
  `],
})
export class SettingsPageComponent {
  tabs = TABS;

  private authService = inject(AuthService);
  readonly auth = this.authService;

  private cfgService = inject(ConfigService);
  cfg = this.cfgService.config;
}
