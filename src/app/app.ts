import { Component } from '@angular/core';
import { OnboardingComponent } from './onboarding/onboarding.component';

@Component({
  selector: 'app-root',
  imports: [OnboardingComponent],
  template: `<app-onboarding/>`,
  styles: [],
})
export class App {}
