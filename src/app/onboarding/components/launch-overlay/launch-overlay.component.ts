import { Component, inject } from '@angular/core';
import { OnboardingService } from '../../onboarding.service';

@Component({
  selector: 'app-launch-overlay',
  template: `
    <div class="launch-overlay">
      <div class="lpulse">
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <div style="text-align:center;max-width:480px">
        <div class="eyebrow-accent" style="justify-content:center;display:inline-flex">Cypher · online</div>
        <h2 style="font-size:44px;font-weight:700;letter-spacing:-0.03em;margin:14px 0 8px">
          {{ state.data().company || 'Sua planta' }} está pronta.
        </h2>
        <p class="sub" style="margin:0 auto">Redirecionando para o dashboard em alguns segundos.</p>
      </div>
      <div style="display:flex;gap:12px;margin-top:8px">
        <button class="btn" (click)="state.reset()">Refazer onboarding</button>
        <button class="btn primary" (click)="state.openDashboard()">Abrir dashboard →</button>
      </div>
    </div>
  `,
})
export class LaunchOverlayComponent {
  state = inject(OnboardingService);
}
