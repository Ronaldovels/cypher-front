import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { RiskAnalysisResponse } from './llm-analysis.models';
import { LlmAnalysisService } from './llm-analysis.service';

describe('LlmAnalysisService', () => {
  let service: LlmAnalysisService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(LlmAnalysisService);
    http = TestBed.inject(HttpTestingController);
  });

  it('analisar posta no endpoint de analise, com credenciais', () => {
    const resposta: RiskAnalysisResponse = {
      situacao: 'trabalhador proximo a maquina',
      episIdentificados: ['capacete'],
      episAusentes: ['luvas'],
      riscoIdentificado: true,
      tipoRisco: 'aproximacao de zona perigosa',
      nivelRisco: 'alto',
      justificativa: 'muito perto da area de movimentacao',
      acaoRecomendada: 'interromper a operacao',
      provider: 'claude',
      promptVersion: 'v2',
      status: 'OK',
      geradoEm: '2026-09-01T10:00:00-03:00',
    };
    let recebido: RiskAnalysisResponse | undefined;
    service.analisar(42).subscribe(r => (recebido = r));

    const req = http.expectOne(`${environment.apiUrl}/incidents/42/analyze`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush(resposta);

    expect(recebido).toEqual(resposta);
  });

  it('ultimaAnalise busca a analise mais recente, com credenciais', () => {
    const resposta: RiskAnalysisResponse = {
      situacao: 'ja analisado antes', episIdentificados: [], episAusentes: [],
      riscoIdentificado: false, tipoRisco: null, nivelRisco: 'baixo',
      justificativa: 'nada de anormal', acaoRecomendada: 'nenhuma',
      provider: 'gemini', promptVersion: 'v2', status: 'OK',
      geradoEm: '2026-09-01T10:00:00-03:00',
    };
    let recebido: RiskAnalysisResponse | undefined;
    service.ultimaAnalise(42).subscribe(r => (recebido = r));

    const req = http.expectOne(`${environment.apiUrl}/incidents/42/analyze`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(resposta);

    expect(recebido).toEqual(resposta);
  });
});
