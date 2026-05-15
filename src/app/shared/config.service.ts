import { Injectable, signal, effect } from '@angular/core';
import { accentRgba, accentShade } from '../onboarding/models/onboarding.models';

export interface CypherConfig {
  company: string;
  cnpj: string;
  sector: string;
  logoUrl: string | null;
  logoName: string;
  accent: string;
  theme: string;
  epis: string[];
  cas: Record<string, any>;
}

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
      document.body.className = `theme-${cfg.theme}`;
    });
  }

  private loadFromStorage(): CypherConfig | null {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  save(cfg: CypherConfig): void {
    try { localStorage.setItem(this.KEY, JSON.stringify(cfg)); } catch {}
    this.config.set(cfg);
  }
}
