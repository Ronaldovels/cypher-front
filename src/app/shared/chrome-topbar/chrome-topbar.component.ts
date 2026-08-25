import { Component, input, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { ThemeService } from '../theme.service';

@Component({
  selector: 'app-chrome-topbar',
  imports: [RouterLink],
  template: `
    <header class="dtop">
      @if (auth.role() === 'GESTOR') {
        <a routerLink="/dashboard" data-test="brand-logo" class="brand-mini" title="Dashboard" style="text-decoration:none;color:inherit">
          <div class="brand-logo" [style.background]="cfg()?.accent || 'var(--accent)'">
            @if (cfg()?.logoUrl) {
              <img [src]="cfg()!.logoUrl!" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:8px"/>
            } @else {
              {{ initial() }}
            }
          </div>
          <div>
            <div class="brand-text">{{ company() }}</div>
            <div class="brand-tag">Industrial Vision AI</div>
          </div>
        </a>
      } @else {
        <div class="brand-mini">
          <div class="brand-logo" [style.background]="cfg()?.accent || 'var(--accent)'">
            @if (cfg()?.logoUrl) {
              <img [src]="cfg()!.logoUrl!" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:8px"/>
            } @else {
              {{ initial() }}
            }
          </div>
          <div>
            <div class="brand-text">{{ company() }}</div>
            <div class="brand-tag">Industrial Vision AI</div>
          </div>
        </div>
      }

      <div class="pgtitle">
        <span class="h">{{ page() }}</span>
        @if (subtitle()) {
          <span class="sep">·</span>
          <span class="meta">{{ subtitle() }}</span>
        }
        @if (shift()) {
          <span class="sep">·</span>
          <span class="shift">{{ shift() }}</span>
        }
        @if (live()) {
          <span class="live">ao vivo</span>
        }
      </div>

      <div class="tools">
        <button class="icon-btn" aria-label="Notificações">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 16c0-7 1.5-10 6-10s6 3 6 10"/><path d="M4.5 16h15"/><path d="M10.5 19a1.5 1.5 0 0 0 3 0"/>
          </svg>
          @if (notifBadge() > 0) {
            <span class="bdg">{{ notifBadge() }}</span>
          }
        </button>

        <button class="icon-btn" data-test="theme-toggle"
                [attr.aria-label]="temaEscuro() ? 'Mudar para tema claro' : 'Mudar para tema escuro'"
                (click)="alternarTema()">
          @if (temaEscuro()) {
            <!-- Sol: o destino do clique, não o estado atual. -->
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
            </svg>
          } @else {
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5z"/>
            </svg>
          }
        </button>

        @if (auth.role() === 'GESTOR') {
          <a routerLink="/config/identidade" class="icon-btn" data-test="open-settings"
             aria-label="Configurações" title="Configurações">
            <!-- Engrenagem de verdade. Antes levava de volta ao onboarding — agora
                 que existe uma página de configurações de verdade, é para lá que vai. -->
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </a>
        }

        <button class="icon-btn" data-test="logout" aria-label="Sair" title="Sair" (click)="sair()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>
          </svg>
        </button>
      </div>
    </header>
  `,
})
export class ChromeTopbarComponent {
  cfg    = input<any>(null);
  page   = input<string>('Dashboard');
  subtitle = input<string>('');
  shift  = input<string | null>(null);
  live   = input<boolean>(true);
  notifBadge = input<number>(0);

  private themeService = inject(ThemeService);
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly auth = this.authService;

  temaEscuro = computed(() => this.themeService.theme() === 'dark');

  alternarTema(): void {
    this.themeService.toggle();
  }

  /** Rota de saída depende de quem estava logado — captura antes de `logout()` limpar `role()`. */
  sair(): void {
    const eraOperador = this.auth.role() === 'OPERADOR';
    this.authService.logout();
    this.router.navigate([eraOperador ? '/login-estacao' : '/login']);
  }

  company = computed(() => (this.cfg()?.company || 'CYPHER').toUpperCase());
  initial = computed(() => (this.cfg()?.company?.trim() || 'C')[0].toUpperCase());
}
