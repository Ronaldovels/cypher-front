import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ThemeService } from './theme.service';

/** O serviço lê o localStorage na construção, então cada caso monta o seu. */
function criar(): ThemeService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(ThemeService);
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  afterEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  it('sem nada gravado, começa no escuro', () => {
    const service = criar();

    expect(service.theme()).toBe('dark');
    expect(document.body.classList.contains('theme-dark')).toBe(true);
  });

  it('troca a classe do body sem deixar a antiga para trás', () => {
    const service = criar();

    service.set('light');

    expect(document.body.classList.contains('theme-light')).toBe(true);
    expect(document.body.classList.contains('theme-dark')).toBe(false);
  });

  it('preserva outras classes do body', () => {
    document.body.classList.add('impressao');
    const service = criar();

    service.set('light');

    // Este é o teste que a atribuição direta de className não passaria.
    expect(document.body.classList.contains('impressao')).toBe(true);
  });

  it('toggle alterna e persiste na hora, não ao concluir o wizard', () => {
    const service = criar();

    service.toggle();

    expect(service.theme()).toBe('light');
    expect(localStorage.getItem('cypher.theme')).toBe('light');
  });

  it('hidrata de cypher.theme', () => {
    localStorage.setItem('cypher.theme', 'light');

    expect(criar().theme()).toBe('light');
  });

  it('sem cypher.theme, migra do cypher.config legado', () => {
    localStorage.setItem('cypher.config', JSON.stringify({ company: 'Acme', theme: 'light' }));

    expect(criar().theme()).toBe('light');
  });

  it('cypher.theme ganha do legado', () => {
    localStorage.setItem('cypher.theme', 'dark');
    localStorage.setItem('cypher.config', JSON.stringify({ theme: 'light' }));

    expect(criar().theme()).toBe('dark');
  });

  it('cypher.config corrompido não derruba o serviço', () => {
    localStorage.setItem('cypher.config', '{isso nao e json');

    expect(criar().theme()).toBe('dark');
  });
});
