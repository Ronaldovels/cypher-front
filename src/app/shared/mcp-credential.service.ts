import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, takeUntil, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { TrocaDeSessao } from './auth/troca-de-sessao';
import { McpCredential, McpCredentialCriada, McpCredentialPayload } from './mcp-credential.models';

@Injectable({ providedIn: 'root' })
export class McpCredentialService {
  private http = inject(HttpClient);
  /** Leituras passam `takeUntil` aqui: resposta da sessão anterior não repovoa o store (ver `TrocaDeSessao`). */
  private trocaDeSessao$ = inject(TrocaDeSessao).troca$;

  private readonly _credenciais = signal<McpCredential[]>([]);
  readonly credenciais = this._credenciais.asReadonly();

  constructor() {
    this.trocaDeSessao$.subscribe(() => this.reset());
  }

  /** Esquece os dados da sessão — chamado a cada troca de sessão. */
  reset(): void {
    this._credenciais.set([]);
  }

  load(): void {
    this.http.get<McpCredential[]>(`${environment.apiUrl}/mcp-credentials`, { withCredentials: true })
      .pipe(takeUntil(this.trocaDeSessao$))
      .subscribe({ next: c => this._credenciais.set(c), error: () => { } });
  }

  create(payload: McpCredentialPayload): Observable<McpCredentialCriada> {
    return this.http.post<McpCredentialCriada>(`${environment.apiUrl}/mcp-credentials`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  revoke(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/mcp-credentials/${id}`,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }
}
