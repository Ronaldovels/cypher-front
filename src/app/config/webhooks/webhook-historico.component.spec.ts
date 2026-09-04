import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { WebhookHistoricoComponent } from './webhook-historico.component';

describe('WebhookHistoricoComponent — sub-aba Histórico', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<WebhookHistoricoComponent>>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(WebhookHistoricoComponent);
    http = TestBed.inject(HttpTestingController);
  });

  it('carrega entregas do assinante selecionado', () => {
    fixture.componentRef.setInput('webhookId', 1);
    fixture.detectChanges();

    http.expectOne(r => r.url === `${environment.apiUrl}/webhooks/1/deliveries`).flush({
      content: [{ id: 1, incidentKey: 'inc-1', status: 'ENTREGUE', tentativas: 1, ultimoErro: null, proximaTentativa: null }],
      totalElements: 1, totalPages: 1, number: 0, size: 20,
    });

    expect(fixture.componentInstance.pagina()?.content).toHaveLength(1);
  });

  it('mostra estado vazio explicito sem entregas', () => {
    fixture.componentRef.setInput('webhookId', 2);
    fixture.detectChanges();

    http.expectOne(r => r.url === `${environment.apiUrl}/webhooks/2/deliveries`)
      .flush({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });

    expect(fixture.componentInstance.pagina()?.content).toHaveLength(0);
  });

  it('reseta pageIndex para 0 ao trocar de assinante', () => {
    fixture.componentRef.setInput('webhookId', 1);
    fixture.detectChanges();

    http.expectOne(r => r.url === `${environment.apiUrl}/webhooks/1/deliveries`).flush({
      content: [{ id: 1, incidentKey: 'inc-1', status: 'ENTREGUE', tentativas: 1, ultimoErro: null, proximaTentativa: null }],
      totalElements: 40, totalPages: 2, number: 0, size: 20,
    });

    fixture.componentInstance.proximaPagina();
    fixture.detectChanges();
    expect(fixture.componentInstance.pageIndex()).toBe(1);

    http.expectOne(r => r.url === `${environment.apiUrl}/webhooks/1/deliveries` && r.params.get('page') === '1').flush({
      content: [{ id: 2, incidentKey: 'inc-2', status: 'ENTREGUE', tentativas: 1, ultimoErro: null, proximaTentativa: null }],
      totalElements: 40, totalPages: 2, number: 1, size: 20,
    });

    fixture.componentRef.setInput('webhookId', 2);
    fixture.detectChanges();

    expect(fixture.componentInstance.pageIndex()).toBe(0);
    http.expectOne(r => r.url === `${environment.apiUrl}/webhooks/2/deliveries` && r.params.get('page') === '0')
      .flush({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
  });

  it('mostra mensagem de erro e sai do estado de carregando quando a busca falha', () => {
    fixture.componentRef.setInput('webhookId', 1);
    fixture.detectChanges();

    http.expectOne(r => r.url === `${environment.apiUrl}/webhooks/1/deliveries`)
      .flush({ message: 'falha ao buscar historico' }, { status: 500, statusText: 'Erro' });

    expect(fixture.componentInstance.pagina()).toBeNull();
    expect(fixture.componentInstance.erro()).not.toBe('');
  });
});
