import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { RiskAnalysisResponse } from './llm-analysis.models';

/**
 * Aciona a analise de risco por LLM multimodal para um incidente (spec §3.3).
 * Sem signal/store: e uma acao pontual por incidente, nao dado "ao vivo".
 */
@Injectable({ providedIn: 'root' })
export class LlmAnalysisService {
  private http = inject(HttpClient);

  analisar(id: number): Observable<RiskAnalysisResponse> {
    return this.http.post<RiskAnalysisResponse>(
      `${environment.apiUrl}/incidents/${id}/analyze`, {}, { withCredentials: true });
  }

  /** Ultima analise ja feita para este incidente — 404 (erro) se nunca foi analisado. */
  ultimaAnalise(id: number): Observable<RiskAnalysisResponse> {
    return this.http.get<RiskAnalysisResponse>(
      `${environment.apiUrl}/incidents/${id}/analyze`, { withCredentials: true });
  }
}
