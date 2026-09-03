import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { WebhookService } from './webhook.service';

describe('WebhookService (design doc de cadastro de webhook, §3.3)', () => {
  let service: WebhookService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(WebhookService);
    http = TestBed.inject(HttpTestingController);
  });

  it('load() popula o signal assinantes', () => {
    service.load();
    http.expectOne(`${environment.apiUrl}/webhooks`)
      .flush([{ id: 1, url: 'https://exemplo.com', secret: 'x', minSeverity: 3, ativo: true }]);

    expect(service.assinantes()).toHaveLength(1);
    expect(service.assinantes()[0].url).toBe('https://exemplo.com');
  });

  it('create() envia o payload e recarrega a lista', () => {
    service.create({ url: 'https://exemplo.com', secret: 'x', minSeverity: 3, ativo: true }).subscribe();

    const reqCreate = http.expectOne(`${environment.apiUrl}/webhooks`);
    expect(reqCreate.request.method).toBe('POST');
    reqCreate.flush({ id: 1, url: 'https://exemplo.com', secret: 'x', minSeverity: 3, ativo: true });

    http.expectOne(`${environment.apiUrl}/webhooks`).flush([]);
  });

  it('update() faz PUT em /webhooks/:id', () => {
    service.update(1, { url: 'https://exemplo.com', secret: 'y', minSeverity: 2, ativo: true }).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/webhooks/1`);
    expect(req.request.method).toBe('PUT');
    req.flush({ id: 1, url: 'https://exemplo.com', secret: 'y', minSeverity: 2, ativo: true });
    http.expectOne(`${environment.apiUrl}/webhooks`).flush([]);
  });

  it('deactivate() faz DELETE em /webhooks/:id', () => {
    service.deactivate(1).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/webhooks/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    http.expectOne(`${environment.apiUrl}/webhooks`).flush([]);
  });

  it('deliveries() busca paginado sem tocar o signal assinantes', () => {
    service.deliveries(1, 0, 20).subscribe();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/webhooks/1/deliveries`);
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('20');
    req.flush({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
  });
});
