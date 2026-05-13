import { Component, inject, computed } from '@angular/core';
import { OnboardingService } from '../../onboarding.service';
import { EpiIconComponent } from '../../components/epi-icon/epi-icon.component';
import { MannequinComponent } from '../../components/mannequin/mannequin.component';
import { EPI_LIST } from '../../models/onboarding.models';

@Component({
  selector: 'app-step2-epis',
  imports: [EpiIconComponent, MannequinComponent],
  templateUrl: './step2-epis.component.html',
})
export class Step2EpisComponent {
  state = inject(OnboardingService);
  epiList = EPI_LIST;

  // Derive picks for the mannequin from the epis array (category key → 'on')
  mannequinPicks = computed<Record<string, string>>(() => {
    const epiToCat: Record<string, string> = {
      capacete: 'cabeca', oculos: 'olhos', auricular: 'audicao',
      mascara: 'respiracao', luvas: 'maos', colete: 'corpo', botas: 'pes', cinto: 'altura',
    };
    return (this.state.data().epis || []).reduce<Record<string, string>>((acc, e) => {
      const c = epiToCat[e];
      if (c) acc[c] = 'on';
      return acc;
    }, {});
  });

  count = computed(() => this.state.data().epis.length);
  kitStatus = computed(() => {
    const n = this.count();
    if (n === 0) return 'vazio';
    if (n >= 5) return 'kit robusto';
    return 'parcial';
  });

  toggle(key: string) {
    const epis = [...this.state.data().epis];
    const idx = epis.indexOf(key);
    if (idx >= 0) epis.splice(idx, 1);
    else epis.push(key);
    this.state.updateData({ epis });
  }

  isOn(key: string) { return this.state.data().epis.includes(key); }
}
