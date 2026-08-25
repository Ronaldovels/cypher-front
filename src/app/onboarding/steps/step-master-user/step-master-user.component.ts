import { Component, inject } from '@angular/core';
import { OnboardingService } from '../../onboarding.service';

/** Passo "Usuário mestre" (design doc de E4, §4.2.1) — mesmo padrão de `Step1IdentityComponent`. */
@Component({
  selector: 'app-step-master-user',
  imports: [],
  templateUrl: './step-master-user.component.html',
})
export class StepMasterUserComponent {
  state = inject(OnboardingService);

  onUsername(e: Event): void {
    this.state.updateData({ masterUsername: (e.target as HTMLInputElement).value });
  }
  onPassword(e: Event): void {
    this.state.updateData({ masterPassword: (e.target as HTMLInputElement).value });
  }
}
