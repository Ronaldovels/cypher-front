import { HttpClient, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { Camera, Incident, Page } from '../incident.models';
import { EMITIDOS, INCIDENTS, agoraNaPlanta, resetMockCatalog, resumo } from './fixtures';
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

  it('filtra por since expresso em UTC (Z) igual a quando expresso no offset original', async () => {
    // A timeline (/incidentes) converte o <input datetime-local> para ISO em
    // Z antes de mandar `since` — offset diferente do -03:00 das fixtures.
    // Comparação por string quebraria aqui (dígitos de hora diferentes para o
    // mesmo instante); precisa comparar o instante mesmo (Date.parse).
    const maisAntigo = INCIDENTS.reduce((a, b) => a.detectedAt < b.detectedAt ? a : b);
    const sinceLocal = maisAntigo.detectedAt;
    const sinceEmZ = new Date(sinceLocal).toISOString();

    const paginaLocal = await firstValueFrom(
      http.get<Page<Incident>>(`${environment.apiUrl}/incidents`, { params: { since: sinceLocal } }));
    const paginaZ = await firstValueFrom(
      http.get<Page<Incident>>(`${environment.apiUrl}/incidents`, { params: { since: sinceEmZ } }));

    expect(paginaZ.content.map(i => i.incidentKey).sort())
      .toEqual(paginaLocal.content.map(i => i.incidentKey).sort());
    expect(paginaLocal.content.length).toBeGreaterThan(0);
  });

  it('deixa passar o que não conhece', () => {
    http.get(`${environment.apiUrl}/desconhecido`).subscribe();

    rede.expectOne(`${environment.apiUrl}/desconhecido`);
  });

  it('responde /incidents/{id} com o incidente correspondente', async () => {
    const alvo = INCIDENTS[0];

    const incidente = await firstValueFrom(
      http.get<Incident>(`${environment.apiUrl}/incidents/${alvo.id}`));

    expect(incidente.incidentKey).toBe(alvo.incidentKey);
  });

  it('/incidents/{id} inexistente devolve 404', async () => {
    await expect(firstValueFrom(
      http.get(`${environment.apiUrl}/incidents/999999`)))
      .rejects.toMatchObject({ status: 404 });
  });

  it('filtra por camera', async () => {
    const alvo = INCIDENTS.find(i => i.cameraId === 'CAM-01')!;

    const page = await firstValueFrom(
      http.get<Page<Incident>>(`${environment.apiUrl}/incidents`,
        { params: { camera: alvo.cameraId } }));

    expect(page.content.length).toBeGreaterThan(0);
    expect(page.content.every(i => i.cameraId === alvo.cameraId)).toBe(true);
  });

  it('filtra por severityMin', async () => {
    const page = await firstValueFrom(
      http.get<Page<Incident>>(`${environment.apiUrl}/incidents`,
        { params: { severityMin: '3' } }));

    expect(page.content.every(i => i.severity >= 3)).toBe(true);
  });

  it('filtra por status', async () => {
    const page = await firstValueFrom(
      http.get<Page<Incident>>(`${environment.apiUrl}/incidents`,
        { params: { status: 'RESOLVIDO' } }));

    expect(page.content.length).toBeGreaterThan(0);
    expect(page.content.every(i => i.status === 'RESOLVIDO')).toBe(true);
  });

  it('pagina com page e size', async () => {
    const primeira = await firstValueFrom(
      http.get<Page<Incident>>(`${environment.apiUrl}/incidents`,
        { params: { page: '0', size: '2' } }));

    expect(primeira.content.length).toBe(2);
    expect(primeira.totalPages).toBe(Math.ceil(INCIDENTS.length / 2));

    const segunda = await firstValueFrom(
      http.get<Page<Incident>>(`${environment.apiUrl}/incidents`,
        { params: { page: '1', size: '2' } }));

    expect(segunda.content[0].incidentKey).not.toBe(primeira.content[0].incidentKey);
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

describe('mockApiInterceptor — escritas', () => {
  let cliente: HttpClient;

  beforeEach(() => {
    resetMockCatalog();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch(), withInterceptors([mockApiInterceptor])),
      ],
    });
    cliente = TestBed.inject(HttpClient);
  });

  function esperar<T>(obs: import('rxjs').Observable<T>): Promise<T> {
    return new Promise((resolve, reject) =>
      obs.subscribe({ next: resolve, error: reject }));
  }

  it('cadastra estacao e ela aparece na listagem', async () => {
    await esperar(cliente.post(`${environment.apiUrl}/stations`,
      { id: 'EST-90', nome: 'Nova', setor: 'teste' }));

    const lista = await esperar(
      cliente.get<{ id: string }[]>(`${environment.apiUrl}/stations`));

    expect(lista.some(s => s.id === 'EST-90')).toBe(true);
  });

  it('recusa codigo duplicado com 409 e mensagem', async () => {
    await esperar(cliente.post(`${environment.apiUrl}/stations`,
      { id: 'EST-90', nome: 'Nova', setor: null }));

    await expect(esperar(cliente.post(`${environment.apiUrl}/stations`,
      { id: 'EST-90', nome: 'Outra', setor: null })))
      .rejects.toMatchObject({ status: 409 });
  });

  it('recusa camera de estacao inexistente com 422', async () => {
    await expect(esperar(cliente.post(`${environment.apiUrl}/cameras`,
      {
        id: 'CAM-90', nome: 'X', estacaoId: 'EST-999',
        streamUrl: 'http://127.0.0.1:8190/stream', fonte: null,
      })))
      .rejects.toMatchObject({ status: 422 });
  });

  it('edita estacao', async () => {
    await esperar(cliente.post(`${environment.apiUrl}/stations`,
      { id: 'EST-90', nome: 'Nova', setor: null }));

    await esperar(cliente.put(`${environment.apiUrl}/stations/EST-90`,
      { id: 'EST-90', nome: 'Renomeada', setor: 'teste' }));

    const lista = await esperar(
      cliente.get<{ id: string; nome: string }[]>(`${environment.apiUrl}/stations`));

    expect(lista.find(s => s.id === 'EST-90')!.nome).toBe('Renomeada');
  });

  it('desativar tira da listagem padrao mas mantem com incluirInativas', async () => {
    await esperar(cliente.post(`${environment.apiUrl}/stations`,
      { id: 'EST-90', nome: 'Nova', setor: null }));

    await esperar(cliente.delete(`${environment.apiUrl}/stations/EST-90`));

    const padrao = await esperar(
      cliente.get<{ id: string }[]>(`${environment.apiUrl}/stations`));
    expect(padrao.some(s => s.id === 'EST-90')).toBe(false);

    const todas = await esperar(
      cliente.get<{ id: string; ativa: boolean }[]>(`${environment.apiUrl}/stations`,
        { params: { incluirInativas: 'true' } }));
    expect(todas.find(s => s.id === 'EST-90')!.ativa).toBe(false);
  });

  it('item individual de camera traz fonte', async () => {
    await esperar(cliente.post(`${environment.apiUrl}/stations`,
      { id: 'EST-90', nome: 'Nova', setor: null }));
    await esperar(cliente.post(`${environment.apiUrl}/cameras`, {
      id: 'CAM-90', nome: 'Frontal', estacaoId: 'EST-90',
      streamUrl: 'http://127.0.0.1:8190/stream',
      fonte: 'rtsp://${U}:${P}@10.0.0.7/stream',
    }));

    const camera = await esperar(
      cliente.get<{ fonte: string }>(`${environment.apiUrl}/cameras/CAM-90`));

    expect(camera.fonte).toContain('${U}');
  });

  it('resumo().heatmap reflete o catalogo mutavel: aparece ao cadastrar e some ao desativar', async () => {
    await esperar(cliente.post(`${environment.apiUrl}/stations`,
      { id: 'EST-90', nome: 'Nova', setor: null }));

    expect(resumo().heatmap.map(h => h.estacaoId)).toContain('EST-90');

    await esperar(cliente.delete(`${environment.apiUrl}/stations/EST-90`));

    expect(resumo().heatmap.map(h => h.estacaoId)).not.toContain('EST-90');
  });

  it('reset devolve as fixtures ao estado inicial', async () => {
    await esperar(cliente.post(`${environment.apiUrl}/stations`,
      { id: 'EST-90', nome: 'Nova', setor: null }));

    resetMockCatalog();

    const lista = await esperar(
      cliente.get<{ id: string }[]>(`${environment.apiUrl}/stations`));
    expect(lista.some(s => s.id === 'EST-90')).toBe(false);
  });
});
