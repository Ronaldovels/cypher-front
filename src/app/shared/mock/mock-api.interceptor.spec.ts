import { HttpClient, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { Camera, Incident, Page } from '../incident.models';
import { EMITIDOS, INCIDENTS, agoraNaPlanta, resumo } from './fixtures';
import { mockApiInterceptor } from './mock-api.interceptor';

describe('mockApiInterceptor', () => {
  let http: HttpClient;
  let rede: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch(), withInterceptors([mockApiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    rede = TestBed.inject(HttpTestingController);
  });

  it('responde /incidents sem chegar na rede', async () => {
    const page = await firstValueFrom(
      http.get<Page<Incident>>(`${environment.apiUrl}/incidents`));

    expect(page.content.length).toBe(INCIDENTS.length);
    rede.expectNone(() => true);
  });

  it('responde /cameras', async () => {
    const cameras = await firstValueFrom(
      http.get<Camera[]>(`${environment.apiUrl}/cameras`));

    expect(cameras.length).toBeGreaterThan(0);
  });

  it('filtra por since, para a rebusca de reconexão ser testável à mão', async () => {
    const maisAntigo = INCIDENTS.reduce((a, b) => a.detectedAt < b.detectedAt ? a : b);

    const page = await firstValueFrom(
      http.get<Page<Incident>>(`${environment.apiUrl}/incidents`,
        { params: { since: maisAntigo.detectedAt } }));

    expect(page.content.length).toBeLessThan(INCIDENTS.length);
    expect(page.content.every(i => i.detectedAt > maisAntigo.detectedAt)).toBe(true);
  });

  it('deixa passar o que não conhece', () => {
    http.get(`${environment.apiUrl}/desconhecido`).subscribe();

    rede.expectOne(`${environment.apiUrl}/desconhecido`);
  });

  it('responde PUT de status de um incidente emitido ao vivo sem chegar na rede, preservando o incidentKey', async () => {
    const vivo: Incident = {
      ...INCIDENTS[0],
      id: 9001,
      incidentKey: 'exemplo-vivo-teste',
      status: 'PENDENTE',
    };
    EMITIDOS.push(vivo);

    const atualizado = await firstValueFrom(
      http.put<Incident>(`${environment.apiUrl}/incidents/9001/status`, { status: 'REVISADO' }));

    expect(atualizado.incidentKey).toBe('exemplo-vivo-teste');
    expect(atualizado.status).toBe('REVISADO');
    rede.expectNone(() => true);
  });

  it('resumo().incidentesOntem bate com o dia de ontem em ultimosSeteDias', () => {
    const r = resumo();
    const ontem = r.ultimosSeteDias[r.ultimosSeteDias.length - 2];

    expect(r.incidentesOntem).toBe(ontem.incidentes);
  });

  it('todo detectedAt de INCIDENTS é anterior a agoraNaPlanta()', () => {
    const agora = agoraNaPlanta();

    expect(INCIDENTS.every(i => i.detectedAt < agora)).toBe(true);
  });
});
