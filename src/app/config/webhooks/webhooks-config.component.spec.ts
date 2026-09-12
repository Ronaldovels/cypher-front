import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { WebhooksConfigComponent } from './webhooks-config.component';
import { WebhookService } from '../../shared/webhook.service';

describe('WebhooksConfigComponent — sub-aba Assinantes', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<WebhooksConfigComponent>>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(WebhooksConfigComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/webhooks`).flush([]);
  });

  it('cadastra um assinante com dados validos', () => {
    fixture.componentInstance.novoAssinante.set({ url: 'https://exemplo.com', secret: 'segredo', minSeverity: 3, ativo: true });
    fixture.componentInstance.salvar();

    const req = http.expectOne(`${environment.apiUrl}/webhooks`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 1, url: 'https://exemplo.com', secret: 'segredo', minSeverity: 3, ativo: true });
    http.expectOne(`${environment.apiUrl}/webhooks`).flush([
      { id: 1, url: 'https://exemplo.com', secret: 'segredo', minSeverity: 3, ativo: true },
    ]);

    expect(fixture.componentInstance.erro()).toBe('');
  });

  it('rejeita URL vazia sem chamar o backend', () => {
    fixture.componentInstance.novoAssinante.set({ url: '', secret: 'segredo', minSeverity: 3, ativo: true });
    fixture.componentInstance.salvar();

    http.expectNone(`${environment.apiUrl}/webhooks`);
    expect(fixture.componentInstance.erro()).toBeTruthy();
  });

  it('mostra a severidade padrao (3) selecionada no select assim que renderiza', () => {
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select.select');

    expect(fixture.componentInstance.novoAssinante().minSeverity).toBe(3);
    expect(select.value).toBe('3');
    const selecionada = Array.from(select.options).find(o => o.selected);
    expect(selecionada?.value).toBe('3');
  });

  it('desativar chama DELETE e recarrega', () => {
    fixture.componentInstance.desativar(1);

    const req = http.expectOne(`${environment.apiUrl}/webhooks/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    http.expectOne(`${environment.apiUrl}/webhooks`).flush([]);
  });

  it('webhook inativo mostra o status com a classe binária "off"', () => {
    TestBed.inject(WebhookService).load();
    http.expectOne(`${environment.apiUrl}/webhooks`).flush([
      { id: 1, url: 'https://x.test/hook', secret: 's', minSeverity: 3, ativo: false },
    ]);
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('.status');
    expect(status.classList.contains('off')).toBe(true);
  });
});
