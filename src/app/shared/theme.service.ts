import { Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

/**
 * Dono único do tema.
 *
 * Antes disso, ConfigService e OnboardingService escreviam
 * `document.body.className` cada um por conta própria — e o tema só persistia
 * ao concluir o wizard, então trocá-lo e recarregar perdia a escolha.
 *
 * Sem dependências, de propósito: ConfigService e OnboardingService precisam
 * injetá-lo sem criar ciclo.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private static readonly KEY = 'cypher.theme';
  private static readonly LEGACY_KEY = 'cypher.config';

  private readonly _theme = signal<Theme>(ThemeService.hydrate());

  readonly theme = this._theme.asReadonly();

  constructor() {
    this.apply(this._theme());
  }

  set(theme: Theme): void {
    this._theme.set(theme);
    this.apply(theme);
    try {
      localStorage.setItem(ThemeService.KEY, theme);
    } catch {
      // Modo privativo ou storage cheio: o tema vale para esta sessão.
    }
  }

  toggle(): void {
    this.set(this._theme() === 'dark' ? 'light' : 'dark');
  }

  /**
   * Escrever no body é comando, não reação: nada de effect().
   *
   * classList em vez de className porque atribuir className apagaria qualquer
   * outra classe que alguém venha a pôr no body.
   */
  private apply(theme: Theme): void {
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${theme}`);
  }

  private static hydrate(): Theme {
    try {
      const direto = localStorage.getItem(ThemeService.KEY);
      if (direto === 'dark' || direto === 'light') {
        return direto;
      }

      // Migração de leitura: quem concluiu o onboarding antes desta mudança
      // guardou o tema dentro de cypher.config. Ninguém volta a escrever lá.
      const legado = localStorage.getItem(ThemeService.LEGACY_KEY);
      const tema = legado ? (JSON.parse(legado) as { theme?: unknown }).theme : null;
      if (tema === 'dark' || tema === 'light') {
        return tema;
      }
    } catch {
      // Storage indisponível ou config corrompida: cai no padrão.
    }

    return 'dark';
  }
}
