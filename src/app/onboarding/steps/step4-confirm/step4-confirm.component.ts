import { Component, inject, computed } from '@angular/core';
import { OnboardingService } from '../../onboarding.service';
import { EPI_LIST } from '../../models/onboarding.models';

@Component({
  selector: 'app-step4-confirm',
  templateUrl: './step4-confirm.component.html',
})
export class Step4ConfirmComponent {
  state = inject(OnboardingService);

  selected = computed(() => EPI_LIST.filter(e => this.state.data().epis.includes(e.key)));
  casCount = computed(() => Object.values(this.state.data().cas).filter(v => v && v.ca).length);
  pending = computed(() => this.selected().length - this.casCount());
}
