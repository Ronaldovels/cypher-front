import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import { AlertaStatus, Incident, Page } from './incident.models';

/**
 * Store de incidentes.
 *
 * A deduplicação por incidentKey não é zelo: quando o SSE cai e reconecta, o
 * serviço rebusca por `since` e recebe de novo o que já tem.
 */
@Injectable({ providedIn: 'root' })
export class IncidentService {
  static readonly MAX_IN_MEMORY = 100;

  private http = inject(HttpClient);
  private readonly _incidents = signal<Incident[]>([]);

  readonly incidents = this._incidents.asReadonly();

  /** Instante do mais recente conhecido, usado para cobrir a lacuna do SSE. */
  readonly lastSeenAt = computed(() => this._incidents()[0]?.detectedAt ?? null);

  loadHistory(since?: string): void {
    const params: Record<string, string> = { size: String(IncidentService.MAX_IN_MEMORY) };
    if (since) {
      params['since'] = since;
    }

    this.http
      .get<Page<Incident>>(`${environment.apiUrl}/incidents`, {
        params,
        withCredentials: true,
      })
      .subscribe({
        next: page => page.content.forEach(incident => this.upsert(incident)),
        error: () => { /* o badge de conexão já comunica a falha */ },
      });
  }

  /** Insere ou atualiza, mantendo a lista ordenada e limitada. */
  upsert(incident: Incident): void {
    this._incidents.update(atual => {
      const semDuplicata = atual.filter(i => i.incidentKey !== incident.incidentKey);
      const lista = [incident, ...semDuplicata];
      lista.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
      return lista.slice(0, IncidentService.MAX_IN_MEMORY);
    });
  }

  acknowledge(id: number, status: AlertaStatus): void {
    this.http
      .put<Incident>(`${environment.apiUrl}/incidents/${id}/status`, { status },
        { withCredentials: true })
      .subscribe({
        next: atualizado => this.upsert(atualizado),
        error: () => { /* mantém o estado anterior; nada é inventado na tela */ },
      });
  }
}
