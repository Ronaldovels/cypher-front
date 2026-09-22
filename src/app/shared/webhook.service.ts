import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { Page } from './incident.models';
import { Webhook, WebhookDelivery, WebhookPayload } from './webhook.models';

/**
 * Assinantes de webhook (design doc de cadastro de webhook, §3.3).
 *
 * Mesmo padrão de `TeamService`: signal privado, escrita que recarrega a
 * lista inteira em vez de atualizar item a item. `deliveries()` fica fora do
 * store — é consulta paginada sob demanda, não estado "ao vivo" (§3.3).
 */
@Injectable({ providedIn: 'root' })
export class WebhookService {
  private http = inject(HttpClient);

  private readonly _assinantes = signal<Webhook[]>([]);
  readonly assinantes = this._assinantes.asReadonly();

  /** Esquece os dados da sessão — chamado pelo AuthService ao trocar de usuário. */
  reset(): void {
    this._assinantes.set([]);
  }

  load(): void {
    this.http.get<Webhook[]>(`${environment.apiUrl}/webhooks`, { withCredentials: true })
      .subscribe({ next: w => this._assinantes.set(w), error: () => { } });
  }

  create(payload: WebhookPayload): Observable<Webhook> {
    return this.http.post<Webhook>(`${environment.apiUrl}/webhooks`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  update(id: number, payload: WebhookPayload): Observable<Webhook> {
    return this.http.put<Webhook>(`${environment.apiUrl}/webhooks/${id}`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  deactivate(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/webhooks/${id}`,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  deliveries(id: number, page: number, size: number): Observable<Page<WebhookDelivery>> {
    return this.http.get<Page<WebhookDelivery>>(`${environment.apiUrl}/webhooks/${id}/deliveries`, {
      params: { page: String(page), size: String(size) },
      withCredentials: true,
    });
  }
}
