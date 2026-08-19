import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import { Camera, Station } from './incident.models';

/**
 * Câmeras e estações.
 *
 * Separado do store de incidentes porque muda raramente e por motivos
 * diferentes: o catálogo é configuração, o incidente é evento.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private http = inject(HttpClient);

  private readonly _cameras = signal<Camera[]>([]);
  private readonly _stations = signal<Station[]>([]);

  readonly cameras = this._cameras.asReadonly();
  readonly stations = this._stations.asReadonly();

  load(): void {
    this.http.get<Camera[]>(`${environment.apiUrl}/cameras`, { withCredentials: true })
      .subscribe({ next: c => this._cameras.set(c), error: () => { } });

    this.http.get<Station[]>(`${environment.apiUrl}/stations`, { withCredentials: true })
      .subscribe({ next: s => this._stations.set(s), error: () => { } });
  }

  /** Estação que uma câmera cobre, ou null se a câmera não estiver cadastrada. */
  stationOfCamera(cameraId: string): Station | null {
    const camera = this._cameras().find(c => c.id === cameraId);
    if (!camera) {
      return null;
    }
    return this._stations().find(s => s.id === camera.estacaoId) ?? null;
  }
}
