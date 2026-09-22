import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { McpConfigComponent } from './mcp-config.component';

describe('McpConfigComponent', () => {
  let fixture: ComponentFixture<McpConfigComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [McpConfigComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(McpConfigComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/mcp-credentials`).flush([]);
  });

  afterEach(() => http.verify());

  it('exige nome antes de criar', () => {
    fixture.componentInstance.novoNome.set('');
    fixture.componentInstance.criar();

    expect(fixture.componentInstance.erro()).toContain('nome');
    http.expectNone(`${environment.apiUrl}/mcp-credentials`);
  });

  it('criar() mostra o apiKey uma vez e limpa o formulário', () => {
    fixture.componentInstance.novoNome.set('Claude Desktop');
    fixture.componentInstance.criar();

    const post = http.expectOne({ url: `${environment.apiUrl}/mcp-credentials`, method: 'POST' });
    post.flush({ id: 1, nome: 'Claude Desktop', criadaEm: '2026-09-21T00:00:00Z', ativa: true, apiKey: '1.segredo-abc' });
    http.expectOne(`${environment.apiUrl}/mcp-credentials`).flush([
      { id: 1, nome: 'Claude Desktop', criadaEm: '2026-09-21T00:00:00Z', ultimoUsoEm: null, ativa: true },
    ]);

    expect(fixture.componentInstance.apiKeyRecemCriada()).toBe('1.segredo-abc');
    expect(fixture.componentInstance.novoNome()).toBe('');
  });

  it('fecharAlertaDeSecret() limpa o apiKey exibido', () => {
    fixture.componentInstance.apiKeyRecemCriada.set('1.segredo-abc');
    fixture.componentInstance.fecharAlertaDeSecret();

    expect(fixture.componentInstance.apiKeyRecemCriada()).toBeNull();
  });

  it('revogar() chama o service e recarrega', () => {
    fixture.componentInstance.revogar(1);

    const del = http.expectOne({ url: `${environment.apiUrl}/mcp-credentials/1`, method: 'DELETE' });
    del.flush(null);
    http.expectOne(`${environment.apiUrl}/mcp-credentials`).flush([]);
  });
});
