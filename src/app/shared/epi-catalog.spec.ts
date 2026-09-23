import { describe, expect, it } from 'vitest';

import { epiFieldLabel, epiTipoLabel, fromEpiChecklist, toEpiChecklist } from './epi-catalog';

describe('epi-catalog', () => {
  it('toEpiChecklist traduz as chaves PT reconhecidas pro enum canônico, sem duplicar', () => {
    expect(toEpiChecklist(['capacete', 'luvas', 'capacete'])).toEqual(['HELMET', 'GLOVE']);
  });

  it('toEpiChecklist descarta chaves que não são dos 6 EPIs canônicos', () => {
    expect(toEpiChecklist(['auricular', 'cinto', 'botas'])).toEqual(['BOOTS']);
  });

  it('fromEpiChecklist é o inverso de toEpiChecklist pros 6 itens canônicos', () => {
    expect(fromEpiChecklist(['HELMET', 'BOOTS'])).toEqual(['capacete', 'botas']);
  });

  it('epiTipoLabel devolve o nome em PT; chave desconhecida cai para o valor original', () => {
    expect(epiTipoLabel('VEST')).toBe('Colete refletivo');
    expect(epiTipoLabel('ALGO_DESCONHECIDO')).toBe('ALGO_DESCONHECIDO');
  });

  it('epiFieldLabel traduz o EpiTipo canônico de epiPresent/epiMissing pro rótulo em PT', () => {
    expect(epiFieldLabel('HELMET')).toBe('Capacete');
    expect(epiFieldLabel('GLOVE')).toBe('Luvas');
    expect(epiFieldLabel('VEST')).toBe('Colete refletivo');
  });

  it('epiFieldLabel mantém o valor original quando não reconhece', () => {
    expect(epiFieldLabel('algo-novo')).toBe('algo-novo');
    // rótulos crus antigos do detector não são mais traduzidos: a API já normaliza.
    expect(epiFieldLabel('no_helmet')).toBe('no_helmet');
  });
});
