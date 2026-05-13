import { Component, inject } from '@angular/core';
import { OnboardingService } from '../../onboarding.service';
import { SECTORS, PRESET_COLORS, cnpjMask } from '../../models/onboarding.models';

@Component({
  selector: 'app-step1-identity',
  imports: [],
  templateUrl: './step1-identity.component.html',
})
export class Step1IdentityComponent {
  state = inject(OnboardingService);
  sectors = SECTORS;
  presetColors = PRESET_COLORS;

  onCnpj(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    this.state.updateData({ cnpj: cnpjMask(v) });
  }
  onLogo(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    this.state.updateData({ logoUrl: url, logoName: f.name });
  }
  setTheme(t: 'dark' | 'light') { this.state.updateData({ theme: t }); }
  setAccent(c: string) { this.state.updateData({ accent: c }); }
}
