import { Component, computed, effect, inject, signal } from '@angular/core';

import { ConfigService } from '../../shared/config.service';
import { EpiChecklistService } from '../../shared/epi-checklist.service';
import { fromEpiChecklist, toEpiChecklist } from '../../shared/epi-catalog';
import { mensagemDeErro } from '../../shared/incident.models';
import { EpiIconComponent } from '../../onboarding/components/epi-icon/epi-icon.component';
import { MannequinComponent } from '../../onboarding/components/mannequin/mannequin.component';
import { EPI_LIST } from '../../onboarding/models/onboarding.models';

const SEM_DETECCAO_AUTOMATICA = new Set(['auricular', 'cinto']);

/**
 * Aba "EPIs monitorados" — mesma grade e prévia do manequim do Step 2 do
 * onboarding, com rascunho local e Salvar explícito.
 *
 * O checklist em si (achado de campo 2026-09-20) mora no backend, não mais
 * só no `localStorage`: é o que o pipeline, rodando numa máquina separada,
 * usa como exigência padrão de EPI quando a pessoa não está numa zona com
 * `requiredPpe` próprio. `auricular` e `cinto` continuam na grade — o
 * mannequin/onboarding ainda os usa — mas nunca entram nesse envio: o
 * modelo de detecção não tem classe pra eles, então nunca seriam
 * confirmados como ausentes.
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
  private checklistService = inject(EpiChecklistService);
  epiList = EPI_LIST;
  semDeteccaoAutomatica = SEM_DETECCAO_AUTOMATICA;

  private readonly baseline = signal<string[]>([...(this.cfgService.config()?.epis ?? [])]);
  readonly draft = signal<string[]>([...this.baseline()]);
  readonly salvo = signal(false);
  readonly salvando = signal(false);
  readonly erro = signal('');

  readonly sujo = computed(() => {
    const atual = [...this.draft()].sort();
    const base = [...this.baseline()].sort();
    return JSON.stringify(atual) !== JSON.stringify(base);
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

  constructor() {
    this.checklistService.load();
    // O backend só conhece os 6 itens canônicos; auricular/cinto (locais,
    // sem classe de deteccao) sao preservados do que ja estava salvo aqui.
    effect(() => {
      const doBackend = fromEpiChecklist(this.checklistService.epis());
      const extrasLocais = (this.cfgService.config()?.epis ?? [])
        .filter(chave => SEM_DETECCAO_AUTOMATICA.has(chave));
      const base = [...new Set([...doBackend, ...extrasLocais])];
      this.baseline.set(base);
      this.draft.set(base);
    });
  }

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
    this.erro.set('');
    this.salvando.set(true);
    const draft = this.draft();
    this.checklistService.update(toEpiChecklist(draft)).subscribe({
      next: () => {
        this.cfgService.update({ epis: draft });
        this.baseline.set([...draft]);
        this.salvando.set(false);
        this.salvo.set(true);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }
}
