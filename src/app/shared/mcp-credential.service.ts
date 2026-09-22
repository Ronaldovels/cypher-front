import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { McpCredential, McpCredentialCriada, McpCredentialPayload } from './mcp-credential.models';

@Injectable({ providedIn: 'root' })
export class McpCredentialService {
  private http = inject(HttpClient);

  private readonly _credenciais = signal<McpCredential[]>([]);
  readonly credenciais = this._credenciais.asReadonly();

  load(): void {
    this.http.get<McpCredential[]>(`${environment.apiUrl}/mcp-credentials`, { withCredentials: true })
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
