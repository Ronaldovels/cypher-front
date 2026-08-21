import { Component, inject, computed } from '@angular/core';
import { OnboardingService } from './onboarding.service';
import { STEPS, EPI_LIST } from './models/onboarding.models';
import { TopbarComponent } from './components/topbar/topbar.component';
import { ChecklistComponent } from './components/checklist/checklist.component';
import { LaunchOverlayComponent } from './components/launch-overlay/launch-overlay.component';
import { Step1IdentityComponent } from './steps/step1-identity/step1-identity.component';
import { StepStationsComponent } from './steps/step-stations/step-stations.component';
import { Step2EpisComponent } from './steps/step2-epis/step2-epis.component';
import { Step3CasComponent } from './steps/step3-cas/step3-cas.component';
import { Step4ConfirmComponent } from './steps/step4-confirm/step4-confirm.component';

@Component({
  selector: 'app-onboarding',
  imports: [
    TopbarComponent, ChecklistComponent, LaunchOverlayComponent,
    Step1IdentityComponent, StepStationsComponent, Step2EpisComponent, Step3CasComponent, Step4ConfirmComponent,
  ],
  templateUrl: './onboarding.component.html',
})
export class OnboardingComponent {
  state = inject(OnboardingService);
  steps = STEPS;

  previewEpis = computed(() => {
    const n = this.state.data().epis.length;
    return n > 0 ? `${n} epi${n === 1 ? '' : 's'} no escopo` : 'Sem EPIs selecionados ainda';
  });
}
