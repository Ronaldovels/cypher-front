import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OnboardingService } from './onboarding.service';
import { ThemeService } from '../shared/theme.service';

describe('OnboardingService e o tema', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  it('o wizard enxerga o tema trocado fora dele', () => {
    const theme = TestBed.inject(ThemeService);
    const state = TestBed.inject(OnboardingService);

    // Simula o toggle da topbar do dashboard, depois de o wizard já existir.
    theme.set('light');

    // Guardar uma cópia em data() não passaria aqui: o effect do serviço só
    // reage a mudanças de data(), e data() não mudou.
    expect(theme.theme()).toBe('light');
    expect(state.data()).not.toHaveProperty('theme');
  });

  it('persistConfig não grava mais o tema em cypher.config', () => {
    const state = TestBed.inject(OnboardingService);
    state.updateData({ company: 'Acme' });

    state.persistConfig();

    const gravado = JSON.parse(localStorage.getItem('cypher.config')!);
    expect(gravado.company).toBe('Acme');
    expect(gravado).not.toHaveProperty('theme');
  });
});
