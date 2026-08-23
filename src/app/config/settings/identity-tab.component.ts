import { Component, computed, inject, signal } from '@angular/core';

import { CypherConfig, ConfigService } from '../../shared/config.service';
import { PRESET_COLORS, SECTORS, cnpjMask } from '../../onboarding/models/onboarding.models';
import { ThemeService } from '../../shared/theme.service';

interface IdentityDraft {
  company: string; cnpj: string; sector: string;
  logoUrl: string | null; logoName: string; accent: string;
}

function toDraft(cfg: CypherConfig | null): IdentityDraft {
  return {
    company: cfg?.company ?? '', cnpj: cfg?.cnpj ?? '', sector: cfg?.sector ?? '',
    logoUrl: cfg?.logoUrl ?? null, logoName: cfg?.logoName ?? '', accent: cfg?.accent ?? '#F4622A',
  };
}

/**
 * Aba "Identidade da empresa" — mesmo formulário do Step 1 do onboarding,
 * mas com rascunho local e Salvar explícito em vez de escrita ao vivo.
 */
@Component({
  selector: 'app-identity-tab',
  templateUrl: './identity-tab.component.html',
})
export class IdentityTabComponent {
  private cfgService = inject(ConfigService);
  private themeService = inject(ThemeService);

  sectors = SECTORS;
  presetColors = PRESET_COLORS;

  readonly draft = signal<IdentityDraft>(toDraft(this.cfgService.config()));
  readonly salvo = signal(false);

  readonly sujo = computed(() =>
    JSON.stringify(this.draft()) !== JSON.stringify(toDraft(this.cfgService.config())));

  theme = this.themeService.theme;

  patch(p: Partial<IdentityDraft>): void {
    this.draft.update(d => ({ ...d, ...p }));
    this.salvo.set(false);
  }

  onCnpj(e: Event): void {
    this.patch({ cnpj: cnpjMask((e.target as HTMLInputElement).value) });
  }

  onLogo(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    this.patch({ logoUrl: url, logoName: f.name });
  }

  setTheme(t: 'dark' | 'light'): void {
    this.themeService.set(t);
  }

  salvar(): void {
    this.cfgService.update(this.draft());
    this.salvo.set(true);
  }
}
