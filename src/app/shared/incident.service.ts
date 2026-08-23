import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { EVENT_SOURCE_FACTORY, EventSourceLike } from './event-source.factory';
import { AlertaStatus, ConnectionState, Incident, IncidentSearchFilters, Page, Summary } from './incident.models';

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

  private eventSourceFactory = inject(EVENT_SOURCE_FACTORY);
  private stream: EventSourceLike | null = null;
  private readonly _connection = signal<ConnectionState>('offline');

  /**
   * Estado da conexão, renderizado como badge.
   *
   * Num painel de segurança, silêncio não pode parecer calmaria: com o SSE
   * caído a tela fica idêntica a "nenhum incidente hoje".
   */
  readonly connection = this._connection.asReadonly();

  private readonly _summary = signal<Summary | null>(null);
  private summaryTimer: ReturnType<typeof setTimeout> | null = null;

  readonly summary = this._summary.asReadonly();

  loadSummary(): void {
    this.http.get<Summary>(`${environment.apiUrl}/summary`, { withCredentials: true })
      .subscribe({ next: s => this._summary.set(s), error: () => { } });
  }

  /**
   * Reagenda o recálculo dos agregados.
   *
   * Debounce de 2 s: durante um episódio ativo chegam vários eventos em
   * sequência, e uma requisição por evento viraria rajada.
   */
  private scheduleSummaryRefresh(): void {
    if (this.summaryTimer !== null) {
      clearTimeout(this.summaryTimer);
    }
    this.summaryTimer = setTimeout(() => {
      this.summaryTimer = null;
      this.loadSummary();
    }, 2000);
  }

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

  /** Busca um incidente por id; também insere no store, para refletir mudanças via SSE enquanto a tela de detalhe está aberta. */
  getById(id: number): Observable<Incident> {
    return this.http
      .get<Incident>(`${environment.apiUrl}/incidents/${id}`, { withCredentials: true })
      .pipe(tap(incident => this.upsert(incident)));
  }

  /**
   * Busca paginada com filtros. Mantém estado próprio no chamador — não entra
   * no store de 100 itens em memória, que cobre só o "ao vivo" do dashboard.
   */
  search(filters: IncidentSearchFilters, page: number, size: number): Observable<Page<Incident>> {
    const params: Record<string, string> = { page: String(page), size: String(size) };
    if (filters.camera) {
      params['camera'] = filters.camera;
    }
    if (filters.severityMin !== undefined) {
      params['severityMin'] = String(filters.severityMin);
    }
    if (filters.status) {
      params['status'] = filters.status;
    }
    if (filters.since) {
      params['since'] = filters.since;
    }
    return this.http.get<Page<Incident>>(`${environment.apiUrl}/incidents`, {
      params,
      withCredentials: true,
    });
  }

  connect(): void {
    if (this.stream) {
      return;
    }
    this._connection.set('conectando');
    const stream = this.eventSourceFactory(`${environment.apiUrl}/incidents/stream`);

    stream.onopen = () => {
      const estavaOffline = this._connection() === 'offline';
      this._connection.set('ao vivo');
      if (estavaOffline) {
        // Reconexão: cobre o que aconteceu enquanto a conexão esteve fora.
        this.loadHistory(this.lastSeenAt() ?? undefined);
      }
    };
    stream.onerror = () => this._connection.set('offline');

    stream.addEventListener('incident', event => this.receber(event));
    stream.addEventListener('incident-changed', event => this.receber(event));

    this.stream = stream;
  }

  disconnect(): void {
    this.stream?.close();
    this.stream = null;
    this._connection.set('offline');
  }

  private receber(event: MessageEvent): void {
    let incidente: Incident;
    try {
      incidente = JSON.parse(event.data) as Incident;
    } catch {
      // Payload malformado não pode derrubar o painel.
      return;
    }
    // Fora do try de propósito: um erro aqui é bug do store, não payload ruim,
    // e engoli-lo junto com o parse deixaria esse bug invisível.
    this.upsert(incidente);
    this.scheduleSummaryRefresh();
  }
}
