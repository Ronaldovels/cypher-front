import { describe, expect, it } from 'vitest';

import { CATEGORIES, CATEGORIA_EPI, EPI_CATEGORIA, EPI_LIST, OPTIONS, ROLE_PRESETS, deriveEpis, sanitizeEpiState } from './onboarding.models';

const REMOVIDOS = ['auricular', 'cinto', 'audicao', 'altura'];

describe('onboarding.models — só os 6 EPIs detectáveis', () => {
  it('EPI_LIST, CATEGORIES, OPTIONS e ROLE_PRESETS não têm auricular/cinto/audicao/altura', () => {
    expect(EPI_LIST.map(e => e.key)).toEqual(['capacete', 'colete', 'luvas', 'oculos', 'mascara', 'botas']);
    for (const removido of REMOVIDOS) {
      expect(CATEGORIES.map(c => c.key)).not.toContain(removido);
      expect(CATEGORIES.map(c => c.slot)).not.toContain(removido);
      expect(Object.keys(OPTIONS)).not.toContain(removido);
      for (const preset of ROLE_PRESETS) expect(Object.keys(preset.picks)).not.toContain(removido);
    }
  });

  it('o preset "Trabalho em altura" continua existindo, com as demais escolhas', () => {
    const preset = ROLE_PRESETS.find(p => p.id === 'height');
    expect(preset?.picks).toEqual({ cabeca: 'cap-j', olhos: 'oc-a', maos: 'lv-vq', corpo: 'co-cv', pes: 'bo-bk' });
  });

  it('EPI_CATEGORIA cobre a EPI_LIST e bate com o slot de cada categoria', () => {
    expect(Object.keys(EPI_CATEGORIA).sort()).toEqual(EPI_LIST.map(e => e.key).sort());
    for (const c of CATEGORIES) expect(CATEGORIA_EPI[c.key]).toBe(c.slot);
  });

  it('deriveEpis ignora categoria que não existe mais', () => {
    expect(deriveEpis({ cabeca: 'cap-a', audicao: 'au-p', altura: 'al-c5' })).toEqual(['capacete']);
  });

  it('sanitizeEpiState descarta epis, picks e CAs que ficaram de versões antigas', () => {
    const limpo = sanitizeEpiState({
      epis: ['capacete', 'auricular', 'cinto'],
      picks: { cabeca: 'cap-a', audicao: 'au-p', altura: 'al-c5' },
      cas: { capacete: { ca: '31469' }, auricular: { ca: '11222' } },
    });
    expect(limpo).toEqual({
      epis: ['capacete'],
      picks: { cabeca: 'cap-a' },
      cas: { capacete: { ca: '31469' } },
    });
  });
});
