import { Component, computed, inject, signal } from '@angular/core';

import { ConfigService } from '../../shared/config.service';
import { EpiIconComponent } from '../../onboarding/components/epi-icon/epi-icon.component';
import { CaEntry, EPI_LIST } from '../../onboarding/models/onboarding.models';

/**
 * Aba "CAs e validades" — mesma tabela do Step 3 do onboarding, mas para os
 * EPIs já salvos (não o rascunho não-salvo da aba de EPIs: trocar de aba sem
 * salvar não deve fazer esta lista mudar por baixo dos pés).
 */
@Component({
  selector: 'app-cas-tab',
  imports: [EpiIconComponent],
  templateUrl: './cas-tab.component.html',
})
export class CasTabComponent {
  private cfgService = inject(ConfigService);

  selected = computed(() => {
    const epis = this.cfgService.config()?.epis ?? [];
    return EPI_LIST.filter(e => epis.includes(e.key));
  });

  readonly draft = signal<Record<string, CaEntry>>({ ...(this.cfgService.config()?.cas ?? {}) });
  readonly salvo = signal(false);

  readonly sujo = computed(() =>
    JSON.stringify(this.draft()) !== JSON.stringify(this.cfgService.config()?.cas ?? {}));

  caCount = computed(() => Object.values(this.draft()).filter(v => v && v.ca).length);

  getCa(key: string): CaEntry { return this.draft()[key] || {}; }

  update(key: string, field: keyof CaEntry, val: string): void {
    const cas = { ...this.draft() };
    cas[key] = { ...(cas[key] || {}), [field]: val };
    this.draft.set(cas);
    this.salvo.set(false);
  }

  onCaNum(e: Event, key: string): void {
    const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8);
    this.update(key, 'ca', v);
  }

  salvar(): void {
    this.cfgService.update({ cas: this.draft() });
    this.salvo.set(true);
  }
}
