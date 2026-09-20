import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
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

  private readonly _epis = signal<EpiTipo[]>([]);
  readonly epis = this._epis.asReadonly();

  load(): void {
    this.http.get<EpiChecklistResponse>(`${environment.apiUrl}/config/epis`, { withCredentials: true })
      .subscribe({ next: r => this._epis.set(r.epis), error: () => this._epis.set([]) });
  }

  update(epis: EpiTipo[]): Observable<EpiChecklistResponse> {
    return this.http.put<EpiChecklistResponse>(`${environment.apiUrl}/config/epis`, { epis },
      { withCredentials: true }).pipe(tap(r => this._epis.set(r.epis)));
  }
}
