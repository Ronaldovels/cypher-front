import { Component, computed, inject, signal } from '@angular/core';

import { ConfigService } from '../../shared/config.service';
import { EpiIconComponent } from '../../onboarding/components/epi-icon/epi-icon.component';
import { MannequinComponent } from '../../onboarding/components/mannequin/mannequin.component';
import { EPI_LIST } from '../../onboarding/models/onboarding.models';

/**
 * Aba "EPIs monitorados" — mesma grade e prévia do manequim do Step 2 do
 * onboarding, com rascunho local e Salvar explícito.
 */
@Component({
  selector: 'app-epis-tab',
  imports: [EpiIconComponent, MannequinComponent],
  templateUrl: './epis-tab.component.html',
  styles: [`
    /* Mais espaço aqui do que dentro do onboarding (sem trilho lateral) —
       mais colunas em vez de cartões esticados. */
    .epi-grid { grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); max-width: 1100px; }
  `],
})
export class EpisTabComponent {
  private cfgService = inject(ConfigService);
  epiList = EPI_LIST;

  readonly draft = signal<string[]>([...(this.cfgService.config()?.epis ?? [])]);
  readonly salvo = signal(false);

  readonly sujo = computed(() => {
    const atual = [...this.draft()].sort();
    const salvo = [...(this.cfgService.config()?.epis ?? [])].sort();
    return JSON.stringify(atual) !== JSON.stringify(salvo);
  });

  mannequinPicks = computed<Record<string, string>>(() => {
    const epiToCat: Record<string, string> = {
      capacete: 'cabeca', oculos: 'olhos', auricular: 'audicao',
      mascara: 'respiracao', luvas: 'maos', colete: 'corpo', botas: 'pes', cinto: 'altura',
    };
    return this.draft().reduce<Record<string, string>>((acc, e) => {
      const c = epiToCat[e];
      if (c) acc[c] = 'on';
      return acc;
    }, {});
  });

  count = computed(() => this.draft().length);
  kitStatus = computed(() => {
    const n = this.count();
    if (n === 0) return 'vazio';
    if (n >= 5) return 'kit robusto';
    return 'parcial';
  });

  accent = computed(() => this.cfgService.config()?.accent ?? '#F4622A');

  toggle(key: string): void {
    const epis = [...this.draft()];
    const idx = epis.indexOf(key);
    if (idx >= 0) epis.splice(idx, 1);
    else epis.push(key);
    this.draft.set(epis);
    this.salvo.set(false);
  }

  isOn(key: string): boolean { return this.draft().includes(key); }

  salvar(): void {
    this.cfgService.update({ epis: this.draft() });
    this.salvo.set(true);
  }
}
