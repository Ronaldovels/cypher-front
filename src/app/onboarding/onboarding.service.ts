import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { OnboardingData, DEFAULT_DATA, STEPS, deriveEpis, accentRgba, accentShade } from './models/onboarding.models';
import { AuthService } from '../shared/auth/auth.service';
import { mensagemDeErro } from '../shared/incident.models';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly data = signal<OnboardingData>({ ...DEFAULT_DATA });
  readonly step = signal(0);
  readonly direction = signal<'forward' | 'back'>('forward');
  readonly launching = signal(false);
  readonly launched = signal(false);
  readonly errors = signal<Record<string, string>>({});
  /** Erro do bootstrap (`POST /setup`) — separado de `errors` porque não é validação de campo, é falha de rede/409 (design doc de E4, §4.2.1). */
  readonly setupError = signal<string | null>(null);

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
    });
  }

  updateData(patch: Partial<OnboardingData>): void {
    this.data.update(d => ({ ...d, ...patch }));
  }

  updatePicks(picks: Record<string, string>): void {
    const epis = deriveEpis(picks);
    this.data.update(d => ({ ...d, picks, epis }));
  }

  /**
   * Valida por **chave**, nunca por índice.
   *
   * A versão anterior decidia por posição (`s === 1` validava EPIs). Inserir
   * um passo no meio fazia a regra errada rodar no passo errado, sem nenhum
   * erro aparecer — exatamente o tipo de defeito que só aparece na demo.
   */
  validateStep(s: number): boolean {
    const key = STEPS[s]?.key;
    const d = this.data();
    const e: Record<string, string> = {};

    if (key === 'identity') {
      if (!d.company.trim()) e['company'] = 'Nome obrigatório';
      if (!/^[a-z0-9-]{2,30}$/.test(d.empresaSlug)) {
        e['empresaSlug'] = 'Use apenas minúsculas, números e hífen, 2 a 30 caracteres';
      }
      if (d.cnpj && d.cnpj.replace(/\D/g, '').length < 14) e['cnpj'] = 'CNPJ incompleto';
      if (!d.sector) e['sector'] = 'Selecione um setor';
    }

    if (key === 'master-user') {
      if (!d.masterUsername.trim()) e['masterUsername'] = 'Usuário obrigatório';
      if (!d.masterPassword) e['masterPassword'] = 'Senha obrigatória';
    }

    if (key === 'epis') {
      if (d.epis.length === 0) e['epis'] = 'Selecione pelo menos 1 EPI';
    }

    // 'stations' não bloqueia: bloquear tornaria o onboarding um beco sem
    // saída quando a API está fora. O aviso vive na tela do passo.

    this.errors.set(e);
    return Object.keys(e).length === 0;
  }

  next(): void {
    if (!this.validateStep(this.step())) return;
    if (this.step() < STEPS.length - 1) {
      this.direction.set('forward');
      this.step.update(s => s + 1);
    }
  }

  back(): void {
    if (this.step() > 0) {
      this.direction.set('back');
      this.step.update(s => s - 1);
      this.errors.set({});
      this.setupError.set(null);
    }
  }

  skip(): void {
    this.direction.set('forward');
    this.step.update(s => s + 1);
  }

  persistConfig(): void {
    const d = this.data();
    try {
      localStorage.setItem('cypher.config', JSON.stringify({
        company: d.company, cnpj: d.cnpj, sector: d.sector,
        logoUrl: d.logoUrl, logoName: d.logoName,
        accent: d.accent, epis: d.epis, cas: d.cas,
      }));
    } catch {}
  }

  openDashboard(): void {
    this.persistConfig();
    this.router.navigate(['/dashboard']);
  }

  launch(): void {
    this.launching.set(true);
    this.setupError.set(null);
    const { masterUsername, masterPassword, empresaSlug, company } = this.data();
    this.auth.bootstrap(masterUsername, masterPassword, empresaSlug, company).subscribe({
      next: () => {
        setTimeout(() => {
          this.launched.set(true);
          this.persistConfig();
          setTimeout(() => this.router.navigate(['/dashboard']), 2400);
        }, 900);
      },
      error: e => {
        this.launching.set(false);
        this.setupError.set(mensagemDeErro(e));
      },
    });
  }

  reset(): void {
    this.launched.set(false);
    this.launching.set(false);
    this.step.set(0);
    this.direction.set('forward');
    this.setupError.set(null);
  }
}
