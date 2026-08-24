import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { Equipe, EquipePayload, Usuario, UsuarioPayload } from './team.models';

/**
 * Equipes e usuários (design doc de E4, §3 e §2.5).
 *
 * Mesmo padrão de `CatalogService`: duas entidades relacionadas, uma fonte
 * única de leitura, escrita que recarrega em vez de atualizar item a item.
 */
@Injectable({ providedIn: 'root' })
export class TeamService {
  private http = inject(HttpClient);

  private readonly _equipes = signal<Equipe[]>([]);
  private readonly _usuarios = signal<Usuario[]>([]);

  readonly equipes = this._equipes.asReadonly();
  readonly usuarios = this._usuarios.asReadonly();

  load(): void {
    this.http.get<Equipe[]>(`${environment.apiUrl}/teams`, { withCredentials: true })
      .subscribe({ next: e => this._equipes.set(e), error: () => { } });
    this.http.get<Usuario[]>(`${environment.apiUrl}/users`, { withCredentials: true })
      .subscribe({ next: u => this._usuarios.set(u), error: () => { } });
  }

  createEquipe(payload: EquipePayload): Observable<Equipe> {
    return this.http.post<Equipe>(`${environment.apiUrl}/teams`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  updateEquipe(id: string, payload: EquipePayload): Observable<Equipe> {
    return this.http.put<Equipe>(`${environment.apiUrl}/teams/${id}`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  deleteEquipe(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/teams/${id}`,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  createUsuario(payload: UsuarioPayload): Observable<Usuario> {
    return this.http.post<Usuario>(`${environment.apiUrl}/users`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  updateUsuario(username: string, payload: UsuarioPayload): Observable<Usuario> {
    return this.http.put<Usuario>(`${environment.apiUrl}/users/${username}`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  deleteUsuario(username: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/users/${username}`,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }
}
