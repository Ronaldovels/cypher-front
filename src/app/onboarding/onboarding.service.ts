import { Injectable, signal, computed, effect } from '@angular/core';
import { OnboardingData, DEFAULT_DATA, deriveEpis, accentRgba, accentShade } from './models/onboarding.models';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  readonly data = signal<OnboardingData>({ ...DEFAULT_DATA });
  readonly step = signal(0);
  readonly direction = signal<'forward' | 'back'>('forward');
  readonly launching = signal(false);
  readonly launched = signal(false);
  readonly errors = signal<Record<string, string>>({});

  readonly stepKey = computed(() => `${this.step()}-${this.direction()}`);
  readonly selectedEpis = computed(() => {
    const epis = this.data().epis;
    return epis;
  });

  constructor() {
    effect(() => {
      const d = this.data();
      document.documentElement.style.setProperty('--accent', d.accent);
      document.documentElement.style.setProperty('--accent-soft', accentRgba(d.accent, 0.14));
      document.documentElement.style.setProperty('--accent-deep', accentShade(d.accent, -0.2));
      document.body.className = `theme-${d.theme}`;
    });
  }

  updateData(patch: Partial<OnboardingData>): void {
    this.data.update(d => ({ ...d, ...patch }));
  }

  updatePicks(picks: Record<string, string>): void {
    const epis = deriveEpis(picks);
    this.data.update(d => ({ ...d, picks, epis }));
  }

  validateStep(s: number): boolean {
    const d = this.data();
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!d.company.trim()) e['company'] = 'Nome obrigatório';
      if (d.cnpj && d.cnpj.replace(/\D/g, '').length < 14) e['cnpj'] = 'CNPJ incompleto';
      if (!d.sector) e['sector'] = 'Selecione um setor';
    }
    if (s === 1) {
      if (d.epis.length === 0) e['epis'] = 'Selecione pelo menos 1 EPI';
    }
    this.errors.set(e);
    return Object.keys(e).length === 0;
  }

  next(): void {
    if (!this.validateStep(this.step())) return;
    if (this.step() < 3) {
      this.direction.set('forward');
      this.step.update(s => s + 1);
    }
  }

  back(): void {
    if (this.step() > 0) {
      this.direction.set('back');
      this.step.update(s => s - 1);
      this.errors.set({});
    }
  }

  skip(): void {
    this.direction.set('forward');
    this.step.update(s => s + 1);
  }

  launch(): void {
    this.launching.set(true);
    setTimeout(() => this.launched.set(true), 900);
  }

  reset(): void {
    this.launched.set(false);
    this.launching.set(false);
    this.step.set(0);
    this.direction.set('forward');
  }
}
