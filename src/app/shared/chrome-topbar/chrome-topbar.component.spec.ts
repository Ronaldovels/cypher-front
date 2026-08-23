import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChromeTopbarComponent } from './chrome-topbar.component';
import { ThemeService } from '../theme.service';

describe('ChromeTopbarComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
  });

  afterEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  function montar() {
    const fixture = TestBed.createComponent(ChromeTopbarComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('tem um botão que troca o tema', () => {
    const fixture = montar();
    const theme = TestBed.inject(ThemeService);
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="theme-toggle"]');

    expect(botao).not.toBeNull();
    botao.click();

    expect(theme.theme()).toBe('light');
  });

  it('o botão diz para onde vai, não onde está', () => {
    const fixture = montar();
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="theme-toggle"]');

    expect(botao.getAttribute('aria-label')).toBe('Mudar para tema claro');

    botao.click();
    fixture.detectChanges();

    expect(botao.getAttribute('aria-label')).toBe('Mudar para tema escuro');
  });

  it('a engrenagem leva para a pagina de configuracoes', () => {
    const fixture = montar();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('[data-test="open-settings"]');

    expect(link.getAttribute('href')).toBe('/config/identidade');
    expect(link.getAttribute('aria-label')).toBe('Configurações');
  });

  it('o logotipo leva para o dashboard, não para o onboarding', () => {
    const fixture = montar();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('[data-test="brand-logo"]');

    expect(link.getAttribute('href')).toBe('/dashboard');
    expect(link.getAttribute('title')).toBe('Dashboard');
  });
});
