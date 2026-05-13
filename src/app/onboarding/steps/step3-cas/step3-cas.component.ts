import { Component, inject, computed } from '@angular/core';
import { OnboardingService } from '../../onboarding.service';
import { EpiIconComponent } from '../../components/epi-icon/epi-icon.component';
import { EPI_LIST, CaEntry } from '../../models/onboarding.models';

@Component({
  selector: 'app-step3-cas',
  imports: [EpiIconComponent],
  templateUrl: './step3-cas.component.html',
})
export class Step3CasComponent {
  state = inject(OnboardingService);

  selected = computed(() => EPI_LIST.filter(e => this.state.data().epis.includes(e.key)));

  caCount = computed(() => Object.values(this.state.data().cas).filter(v => v && v.ca).length);

  update(key: string, field: keyof CaEntry, val: string) {
    const cas = { ...this.state.data().cas };
    cas[key] = { ...(cas[key] || {}), [field]: val };
    this.state.updateData({ cas });
  }

  getCa(key: string): CaEntry { return this.state.data().cas[key] || {}; }

  onCaNum(e: Event, key: string) {
    const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8);
    this.update(key, 'ca', v);
  }
}
