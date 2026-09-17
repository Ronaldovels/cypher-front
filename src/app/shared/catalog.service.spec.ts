import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { CameraAdmin, mensagemDeErro } from './incident.models';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  it('carrega câmeras e estações', () => {
    service.load();

    http.expectOne(`${environment.apiUrl}/cameras`).flush([
      { id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x/stream' },
    ]);
    http.expectOne(`${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] },
    ]);

    expect(service.cameras().length).toBe(1);
    expect(service.stations()[0].nome).toBe('Esteira');
  });

  it('resolve a estação de uma câmera', () => {
    service.load();
    http.expectOne(`${environment.apiUrl}/cameras`).flush([
      { id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: null },
    ]);
    http.expectOne(`${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] },
    ]);

    expect(service.stationOfCamera('CAM-01')?.nome).toBe('Esteira');
    expect(service.stationOfCamera('CAM-99')).toBeNull();
  });

  it('câmera de estação desconhecida não quebra a resolução', () => {
    service.load();
    http.expectOne(`${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(`${environment.apiUrl}/stations`).flush([]);

    expect(service.stationOfCamera('CAM-01')).toBeNull();
  });
});

describe('mensagemDeErro', () => {
  it('extrai a mensagem que o backend enviou', () => {
    expect(mensagemDeErro({ error: { erro: 'Estacao inexistente: EST-99' } }))
      .toBe('Estacao inexistente: EST-99');
  });

  it('cai para um texto util quando o corpo nao tem mensagem', () => {
    expect(mensagemDeErro({ status: 500 })).toContain('500');
  });

  it('nao devolve string vazia', () => {
    expect(mensagemDeErro(null).length).toBeGreaterThan(0);
    expect(mensagemDeErro({}).length).toBeGreaterThan(0);
  });
});

describe('CatalogService — escrita', () => {
  let service: CatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  it('cadastra estacao', () => {
    let criada: unknown = null;
    service.createStation({ id: 'EST-01', nome: 'Esteira', setor: 'montagem' })
      .subscribe(s => (criada = s));

    const req = http.expectOne(`${environment.apiUrl}/stations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ id: 'EST-01', nome: 'Esteira', setor: 'montagem' });
    req.flush({ id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] });

    expect(criada).not.toBeNull();
  });

  it('recarrega o catalogo depois de cadastrar', () => {
    service.createStation({ id: 'EST-01', nome: 'Esteira', setor: null }).subscribe();
    http.expectOne(`${environment.apiUrl}/stations`)
        .flush({ id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [] });

    // O recarregamento é o que faz o heatmap refletir o cadastro sem código
    // de sincronização entre telas.
    http.expectOne(r => r.method === 'GET' && r.url === `${environment.apiUrl}/cameras`)
        .flush([]);
    http.expectOne(r => r.method === 'GET' && r.url === `${environment.apiUrl}/stations`)
        .flush([{ id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [] }]);

    expect(service.stations().length).toBe(1);
  });

  it('edita estacao no endpoint do codigo', () => {
    service.updateStation('EST-01', { id: 'EST-01', nome: 'Esteira 1', setor: null })
      .subscribe();

    const req = http.expectOne(`${environment.apiUrl}/stations/EST-01`);
    expect(req.request.method).toBe('PUT');
    req.flush({ id: 'EST-01', nome: 'Esteira 1', setor: null, ativa: true, cameras: [] });
  });

  it('desativa estacao', () => {
    service.deactivateStation('EST-01').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/stations/EST-01`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('cadastra camera com a fonte em placeholder', () => {
    service.createCamera({
      id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01',
      streamUrl: 'http://127.0.0.1:8090/stream',
      fonte: 'rtsp://${CAM01_USER}:${CAM01_PASS}@10.0.0.7/stream',
      rotacao: 0, anguloCameraGraus: 0,
    }).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/cameras`);
    expect(req.request.method).toBe('POST');
    expect((req.request.body as { fonte: string }).fonte).toContain('${CAM01_USER}');
    req.flush({});
  });

  it('busca o item individual, que traz a fonte', () => {
    let camera: CameraAdmin | null = null;
    service.camera('CAM-01').subscribe(c => (camera = c));

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01`);
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01',
      streamUrl: 'http://127.0.0.1:8090/stream',
      fonte: 'rtsp://${CAM01_USER}@10.0.0.7/stream', ativa: true,
    });

    expect(camera!.fonte).toContain('${CAM01_USER}');
    expect(camera!.ativa).toBe(true);
  });

  it('carrega tambem as inativas quando pedido', () => {
    service.load(true);

    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    const req = http.expectOne(
      r => r.url === `${environment.apiUrl}/stations`
        && r.params.get('incluirInativas') === 'true');
    req.flush([]);
  });

  it('propaga o erro para quem chamou, em vez de engolir', () => {
    let erro: unknown = null;
    service.createStation({ id: 'EST-01', nome: 'X', setor: null })
      .subscribe({ error: e => (erro = e) });

    http.expectOne(`${environment.apiUrl}/stations`)
        .flush({ erro: 'Estacao ja cadastrada: EST-01' },
                { status: 409, statusText: 'Conflict' });

    expect(mensagemDeErro(erro)).toBe('Estacao ja cadastrada: EST-01');
  });
});
