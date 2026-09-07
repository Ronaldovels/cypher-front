import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { PlacarEquipe } from './placar.models';

@Injectable({ providedIn: 'root' })
export class PlacarService {
  private http = inject(HttpClient);

  buscar(since?: string, until?: string): Observable<PlacarEquipe[]> {
    const params: Record<string, string> = {};
    if (since) params['since'] = since;
    if (until) params['until'] = until;
    return this.http.get<PlacarEquipe[]>(`${environment.apiUrl}/placar`, { params, withCredentials: true });
  }
}
