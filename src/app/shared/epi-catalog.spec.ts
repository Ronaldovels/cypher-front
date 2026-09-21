import { describe, expect, it } from 'vitest';

import { epiFieldLabel, epiTipoLabel, fromEpiChecklist, toEpiChecklist } from './epi-catalog';

describe('epi-catalog', () => {
  it('toEpiChecklist traduz as chaves PT reconhecidas pro enum canônico, sem duplicar', () => {
    expect(toEpiChecklist(['capacete', 'luvas', 'capacete'])).toEqual(['HELMET', 'GLOVE']);
  });

  it('toEpiChecklist descarta auricular e cinto (sem classe de deteccao)', () => {
    expect(toEpiChecklist(['auricular', 'cinto', 'botas'])).toEqual(['BOOTS']);
  });

  it('fromEpiChecklist é o inverso de toEpiChecklist pros 6 itens canônicos', () => {
    expect(fromEpiChecklist(['HELMET', 'BOOTS'])).toEqual(['capacete', 'botas']);
  });

  it('epiTipoLabel devolve o nome em PT; chave desconhecida cai para o valor original', () => {
    expect(epiTipoLabel('VEST')).toBe('Colete refletivo');
    expect(epiTipoLabel('ALGO_DESCONHECIDO')).toBe('ALGO_DESCONHECIDO');
  });

  it('epiFieldLabel reconhece tanto violation_label quanto o rotulo cru do detector', () => {
    expect(epiFieldLabel('no_helmet')).toBe('Capacete');
    expect(epiFieldLabel('no_gloves')).toBe('Luvas');
    expect(epiFieldLabel('VEST')).toBe('Colete refletivo');
    expect(epiFieldLabel('boots')).toBe('Bota de segurança');
    expect(epiFieldLabel('Goggles')).toBe('Óculos de proteção');
  });

  it('epiFieldLabel mantém o valor original quando não reconhece', () => {
    expect(epiFieldLabel('algo-novo')).toBe('algo-novo');
  });
});
