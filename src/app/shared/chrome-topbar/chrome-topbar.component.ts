import { Component, input, computed } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-chrome-topbar',
  imports: [RouterLink],
  template: `
    <header class="dtop">
      <a routerLink="/" class="brand-mini" title="Voltar ao onboarding" style="text-decoration:none;color:inherit">
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
        <a routerLink="/" class="icon-btn" aria-label="Configurações" title="Reabrir onboarding">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>
          </svg>
        </a>
        <div class="avatar">AG</div>
      </div>
    </header>
  `,
})
export class ChromeTopbarComponent {
  cfg    = input<any>(null);
  page   = input<string>('Dashboard');
  subtitle = input<string>('');
  shift  = input<string | null>('Turno A · 06:00–14:00');
  live   = input<boolean>(true);
  notifBadge = input<number>(6);

  company = computed(() => (this.cfg()?.company || 'CYPHER').toUpperCase());
  initial = computed(() => (this.cfg()?.company?.trim() || 'C')[0].toUpperCase());
}
