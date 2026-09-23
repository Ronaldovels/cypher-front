import { Injectable, signal, effect } from '@angular/core';
import { accentRgba, accentShade, sanitizeEpiState } from '../onboarding/models/onboarding.models';

export interface CypherConfig {
  company: string;
  cnpj: string;
  sector: string;
  logoUrl: string | null;
  logoName: string;
  accent: string;
  epis: string[];
  cas: Record<string, any>;
}

/**
 * Identidade visual e EPIs do onboarding, guardados no `localStorage`.
 *
 * Fica de fora da limpeza por troca de sessão (`TrocaDeSessao`) de
 * propósito, como o `ThemeService`: é configuração do navegador, não dado da
 * sessão. O design doc de multi-tenant (§9) deixou o branding por empresa
 * fora de escopo — os campos do onboarding "continuam como estão", no
 * `localStorage`. Consequência conhecida: dois gestores de empresas
 * diferentes no mesmo navegador compartilham nome, logo e cor. Quando o
 * branding por empresa entrar, a chave passa a ser por `empresaId`.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly KEY = 'cypher.config';
  readonly config = signal<CypherConfig | null>(this.loadFromStorage());

  constructor() {
    effect(() => {
      const cfg = this.config();
      if (!cfg) return;
      document.documentElement.style.setProperty('--accent', cfg.accent);
      document.documentElement.style.setProperty('--accent-soft', accentRgba(cfg.accent, 0.14));
      document.documentElement.style.setProperty('--accent-deep', accentShade(cfg.accent, -0.12));
    });
  }

  private loadFromStorage(): CypherConfig | null {
    try {
      const raw = localStorage.getItem(this.KEY);
      // Config salvo por versões antigas pode trazer auricular/cinto — descarta.
      return raw ? sanitizeEpiState(JSON.parse(raw) as CypherConfig) : null;
    } catch { return null; }
  }

  save(cfg: CypherConfig): void {
    try { localStorage.setItem(this.KEY, JSON.stringify(cfg)); } catch {}
    this.config.set(cfg);
  }

  /** Mescla um patch no config atual (vazio quando ninguém terminou o onboarding ainda). */
  update(patch: Partial<CypherConfig>): void {
    this.save({ ...EMPTY_CONFIG, ...this.config(), ...patch });
  }
}

const EMPTY_CONFIG: CypherConfig = {
  company: '', cnpj: '', sector: '', logoUrl: null, logoName: '',
  accent: '#F4622A', epis: [], cas: {},
};
