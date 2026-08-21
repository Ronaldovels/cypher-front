import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OnboardingService } from './onboarding.service';
import { ThemeService } from '../shared/theme.service';
import { STEPS } from './models/onboarding.models';

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

describe('OnboardingService — passo de estações', () => {
  let service: OnboardingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    service = TestBed.inject(OnboardingService);
  });

  it('o wizard tem cinco passos, com estações em segundo', () => {
    expect(STEPS.map(s => s.key))
      .toEqual(['identity', 'stations', 'epis', 'cas', 'launch']);
  });

  it('valida por chave, nao por posicao', () => {
    // EPIs agora estão no índice 2. Se a validação fosse posicional, este
    // passo cairia na regra de identidade e passaria com EPIs vazios.
    service.updateData({ company: 'Acme', sector: 'Metalurgia', epis: [] });

    const indiceEpis = STEPS.findIndex(s => s.key === 'epis');
    expect(service.validateStep(indiceEpis)).toBe(false);
    expect(service.errors()['epis']).toBeTruthy();
  });

  it('identidade continua validada na sua nova posicao', () => {
    const indiceIdentidade = STEPS.findIndex(s => s.key === 'identity');

    expect(service.validateStep(indiceIdentidade)).toBe(false);
    expect(service.errors()['company']).toBeTruthy();
  });

  it('o passo de estacoes nao bloqueia o avanco', () => {
    // Bloquear tornaria o onboarding um beco sem saída quando a API está
    // fora: o gestor não conseguiria nem chegar ao dashboard para descobrir
    // por quê. O aviso fica na tela do passo.
    const indiceEstacoes = STEPS.findIndex(s => s.key === 'stations');

    expect(service.validateStep(indiceEstacoes)).toBe(true);
  });

  it('avanca ate o ultimo passo', () => {
    service.updateData({ company: 'Acme', sector: 'Metalurgia', epis: ['capacete'] });

    for (let i = 0; i < STEPS.length - 1; i++) {
      service.next();
    }

    expect(service.step()).toBe(STEPS.length - 1);
  });

  it('nao passa do ultimo passo', () => {
    service.updateData({ company: 'Acme', sector: 'Metalurgia', epis: ['capacete'] });
    for (let i = 0; i < STEPS.length + 3; i++) {
      service.next();
    }

    expect(service.step()).toBe(STEPS.length - 1);
  });
});
