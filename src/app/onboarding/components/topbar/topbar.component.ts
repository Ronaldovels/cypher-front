import { Component, inject } from '@angular/core';
import { OnboardingService } from '../../onboarding.service';
import { StepIndicatorComponent } from '../step-indicator/step-indicator.component';
import { STEPS } from '../../models/onboarding.models';

@Component({
  selector: 'app-topbar',
  imports: [StepIndicatorComponent],
  template: `
    <div class="topbar">
      <div class="brand">
        <span class="brand-dot"></span>
        <span>Cypher</span>
        @if (state.data().company) {
          <span class="brand-meta">por · {{ state.data().company }}</span>
        }
      </div>
      <app-step-indicator [current]="state.step()" [total]="steps.length"/>
      <div style="display:flex;gap:14px;align-items:center">
        <span class="kicker">Onboarding</span>
        <button class="btn ghost" style="padding:8px 14px">Salvar &amp; sair</button>
      </div>
    </div>
  `,
})
export class TopbarComponent {
  state = inject(OnboardingService);
  steps = STEPS;
}
