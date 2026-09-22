import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  Camera, CameraAdmin, CameraPayload, EstacaoAdmin, Station, StationPayload,
} from './incident.models';

/**
 * Câmeras e estações.
 *
 * Fonte única do catálogo para dashboard e cadastro: recarregar aqui
 * atualiza as duas telas, sem código de sincronização entre elas. O heatmap
 * lê o resumo de `IncidentService`, atualizado à parte por navegação/polling.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private http = inject(HttpClient);

  private readonly _cameras = signal<Camera[]>([]);
  private readonly _stations = signal<Station[]>([]);
  private incluirInativas = false;

  readonly cameras = this._cameras.asReadonly();
  readonly stations = this._stations.asReadonly();

  /** Esquece os dados da sessão — chamado pelo AuthService ao trocar de usuário. */
  reset(): void {
    this._cameras.set([]);
    this._stations.set([]);
    this.incluirInativas = false;
  }

  load(incluirInativas = false): void {
    this.incluirInativas = incluirInativas;

    this.http.get<Camera[]>(`${environment.apiUrl}/cameras`, { withCredentials: true })
      .subscribe({ next: c => this._cameras.set(c), error: () => { } });

    this.http.get<Station[]>(`${environment.apiUrl}/stations`, {
      params: incluirInativas ? { incluirInativas: 'true' } : {},
      withCredentials: true,
    }).subscribe({ next: s => this._stations.set(s), error: () => { } });
  }

  /** Estação que uma câmera cobre, ou null se a câmera não estiver cadastrada. */
  stationOfCamera(cameraId: string): Station | null {
    const camera = this._cameras().find(c => c.id === cameraId);
    if (!camera) {
      return null;
    }
    return this._stations().find(s => s.id === camera.estacaoId) ?? null;
  }

  /** Item individual: única leitura que traz `fonte`. */
  camera(id: string): Observable<CameraAdmin> {
    return this.http.get<CameraAdmin>(`${environment.apiUrl}/cameras/${id}`,
      { withCredentials: true });
  }

  /** Devolve `EstacaoAdmin` (com `token`) — nunca `Station`: é a superfície de administração (design doc §2.4). */
  createStation(payload: StationPayload): Observable<EstacaoAdmin> {
    return this.http.post<EstacaoAdmin>(`${environment.apiUrl}/stations`, payload,
      { withCredentials: true }).pipe(tap(() => this.reload()));
  }

  updateStation(id: string, payload: StationPayload): Observable<EstacaoAdmin> {
    return this.http.put<EstacaoAdmin>(`${environment.apiUrl}/stations/${id}`, payload,
      { withCredentials: true }).pipe(tap(() => this.reload()));
  }

  deactivateStation(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/stations/${id}`,
      { withCredentials: true }).pipe(tap(() => this.reload()));
  }

  /**
   * Rotaciona o token da estação — provisionar o kiosk é copiar o valor
   * devolvido aqui uma vez (design doc §2.4). Sem leitura: é o único jeito de
   * ver o token depois do cadastro inicial.
   */
  regenerateStationToken(id: string): Observable<EstacaoAdmin> {
    return this.http.post<EstacaoAdmin>(`${environment.apiUrl}/stations/${id}/token/regenerate`, {},
      { withCredentials: true });
  }

  createCamera(payload: CameraPayload): Observable<CameraAdmin> {
    return this.http.post<CameraAdmin>(`${environment.apiUrl}/cameras`, payload,
      { withCredentials: true }).pipe(tap(() => this.reload()));
  }

  updateCamera(id: string, payload: CameraPayload): Observable<CameraAdmin> {
    return this.http.put<CameraAdmin>(`${environment.apiUrl}/cameras/${id}`, payload,
      { withCredentials: true }).pipe(tap(() => this.reload()));
  }

  deactivateCamera(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/cameras/${id}`,
      { withCredentials: true }).pipe(tap(() => this.reload()));
  }

  private reload(): void {
    this.load(this.incluirInativas);
  }
}
