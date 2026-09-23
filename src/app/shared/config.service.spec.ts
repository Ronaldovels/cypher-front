import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigService } from './config.service';

/** O serviço lê o localStorage na construção, então cada caso monta o seu. */
function criar(): ConfigService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(ConfigService);
}

describe('ConfigService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('sem nada gravado, config comeca nulo', () => {
    const service = criar();
    expect(service.config()).toBeNull();
  });

  it('save grava no localStorage e atualiza o signal', () => {
    const service = criar();

    service.save({
      company: 'Acme', cnpj: '', sector: 'Metalurgia', logoUrl: null, logoName: '',
      accent: '#F4622A', epis: ['capacete'], cas: {},
    });

    expect(service.config()?.company).toBe('Acme');
    const outro = criar();
    expect(outro.config()?.company).toBe('Acme');
  });

  it('update mescla um patch sobre config vazio, sem apagar o resto', () => {
    const service = criar();

    service.update({ company: 'Acme' });
    expect(service.config()?.company).toBe('Acme');
    expect(service.config()?.epis).toEqual([]);

    service.update({ epis: ['capacete', 'luvas'] });
    expect(service.config()?.company).toBe('Acme');
    expect(service.config()?.epis).toEqual(['capacete', 'luvas']);
  });

  it('config antigo com auricular/cinto no localStorage e descartado na leitura', () => {
    localStorage.setItem('cypher.config', JSON.stringify({
      company: 'Acme', cnpj: '', sector: '', logoUrl: null, logoName: '', accent: '#F4622A',
      epis: ['capacete', 'auricular', 'cinto'],
      cas: { capacete: { ca: '31469' }, auricular: { ca: '11222' }, cinto: { ca: '33501' } },
    }));

    const service = criar();

    expect(service.config()?.company).toBe('Acme');
    expect(service.config()?.epis).toEqual(['capacete']);
    expect(Object.keys(service.config()?.cas ?? {})).toEqual(['capacete']);
  });
});
