import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, takeUntil, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { TrocaDeSessao } from './auth/troca-de-sessao';
import { EpiTipo } from './epi-catalog';

interface EpiChecklistResponse {
  epis: EpiTipo[];
}

/**
 * Checklist global de EPI da empresa (achado de campo 2026-09-20): antes só
 * vivia no `localStorage` do front, então o pipeline — rodando numa máquina
 * separada — não tinha como lê-lo. Agora é a fonte usada como fallback
 * quando a pessoa não está numa zona com EPI obrigatório próprio.
 */
@Injectable({ providedIn: 'root' })
export class EpiChecklistService {
  private http = inject(HttpClient);
  /** Leituras passam `takeUntil` aqui: resposta da sessão anterior não repovoa o store (ver `TrocaDeSessao`). */
  private trocaDeSessao$ = inject(TrocaDeSessao).troca$;

  private readonly _epis = signal<EpiTipo[]>([]);
  readonly epis = this._epis.asReadonly();

  constructor() {
    this.trocaDeSessao$.subscribe(() => this.reset());
  }

  /** Esquece os dados da sessão — chamado a cada troca de sessão. */
  reset(): void {
    this._epis.set([]);
  }

  load(): void {
    this.http.get<EpiChecklistResponse>(`${environment.apiUrl}/config/epis`, { withCredentials: true })
      .pipe(takeUntil(this.trocaDeSessao$))
      .subscribe({ next: r => this._epis.set(r.epis), error: () => this._epis.set([]) });
  }

  update(epis: EpiTipo[]): Observable<EpiChecklistResponse> {
    return this.http.put<EpiChecklistResponse>(`${environment.apiUrl}/config/epis`, { epis },
      { withCredentials: true }).pipe(tap(r => this._epis.set(r.epis)));
  }
}
