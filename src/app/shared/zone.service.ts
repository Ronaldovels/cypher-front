import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, takeUntil, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { TrocaDeSessao } from './auth/troca-de-sessao';
import { Zone, ZonePayload } from './zone.models';

/**
 * Zonas de risco de uma câmera (design doc de zonas de risco, §4.4).
 *
 * Mesmo padrão de `TeamService`/`WebhookService`: signal privado, escrita
 * que recarrega a lista inteira. `load` é sempre por câmera — não existe
 * "listar todas as zonas do sistema" nesta entrega.
 */
@Injectable({ providedIn: 'root' })
export class ZoneService {
  private http = inject(HttpClient);
  /** Leituras passam `takeUntil` aqui: resposta da sessão anterior não repovoa o store (ver `TrocaDeSessao`). */
  private trocaDeSessao$ = inject(TrocaDeSessao).troca$;

  private readonly _zonas = signal<Zone[]>([]);
  readonly zonas = this._zonas.asReadonly();

  constructor() {
    this.trocaDeSessao$.subscribe(() => this.reset());
  }

  /** Esquece os dados da sessão — chamado a cada troca de sessão. */
  reset(): void {
    this._zonas.set([]);
  }

  load(cameraId: string): void {
    this.http.get<Zone[]>(`${environment.apiUrl}/cameras/${cameraId}/zones`, { withCredentials: true })
      .pipe(takeUntil(this.trocaDeSessao$))
      .subscribe({ next: z => this._zonas.set(z), error: () => this._zonas.set([]) });
  }

  create(cameraId: string, payload: ZonePayload): Observable<Zone> {
    return this.http.post<Zone>(`${environment.apiUrl}/cameras/${cameraId}/zones`, payload,
      { withCredentials: true }).pipe(tap(() => this.load(cameraId)));
  }

  update(cameraId: string, id: number, payload: ZonePayload): Observable<Zone> {
    return this.http.put<Zone>(`${environment.apiUrl}/cameras/${cameraId}/zones/${id}`, payload,
      { withCredentials: true }).pipe(tap(() => this.load(cameraId)));
  }

  deactivate(cameraId: string, id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/cameras/${cameraId}/zones/${id}`,
      { withCredentials: true }).pipe(tap(() => this.load(cameraId)));
  }
}
