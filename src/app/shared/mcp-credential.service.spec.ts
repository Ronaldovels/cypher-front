import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { McpCredentialService } from './mcp-credential.service';

describe('McpCredentialService', () => {
  let service: McpCredentialService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(McpCredentialService);
    http = TestBed.inject(HttpTestingController);
  });

  it('load() popula o signal de credenciais', () => {
    service.load();
    const req = http.expectOne(`${environment.apiUrl}/mcp-credentials`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, nome: 'Teste', criadaEm: '2026-09-21T00:00:00Z', ultimoUsoEm: null, ativa: true }]);

    expect(service.credenciais()).toHaveLength(1);
    expect(service.credenciais()[0].nome).toBe('Teste');
  });

  it('create() faz POST e recarrega a lista', () => {
    service.create({ nome: 'Nova' }).subscribe();
    const post = http.expectOne(`${environment.apiUrl}/mcp-credentials`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ nome: 'Nova' });
    post.flush({ id: 2, nome: 'Nova', criadaEm: '2026-09-21T00:00:00Z', ativa: true, apiKey: '2.segredo' });

    const reload = http.expectOne(`${environment.apiUrl}/mcp-credentials`);
    expect(reload.request.method).toBe('GET');
    reload.flush([]);
  });

  it('revoke() faz DELETE e recarrega a lista', () => {
    service.revoke(5).subscribe();
    const del = http.expectOne(`${environment.apiUrl}/mcp-credentials/5`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);

    const reload = http.expectOne(`${environment.apiUrl}/mcp-credentials`);
    reload.flush([]);
  });
});
