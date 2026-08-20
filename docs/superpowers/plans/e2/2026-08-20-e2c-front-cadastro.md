# E2-C · Cadastro de Estações e Câmeras no Front — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao gestor uma tela para cadastrar estações e câmeras, montada em duas superfícies — a rota `/config/estacoes` e um passo novo do onboarding — a partir de um único componente.

**Architecture:** `CatalogService` ganha escrita e passa a ser a fonte única do catálogo para dashboard, heatmap e cadastro. Um `StationsConfigComponent` standalone concentra formulário e lista, e é reaproveitado como passo do wizard em vez de duplicado. O interceptor de dados de exemplo passa a responder escritas sobre fixtures em memória, para que a tela seja desenvolvível antes do backend.

**Tech Stack:** Angular 21.2, TypeScript 5.9, signals, `provideHttpClient(withFetch())`, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-08-20-cadastro-e-cameras-design.md` §4, §5.1, §7, §8, §9.

**Depende de:** E2-A Tasks 1–7 (as escritas e o item individual precisam existir). As Tasks 1–5 deste plano são testáveis sem a API, porque o transporte HTTP é falso nos testes.

## Global Constraints

- **Repositório:** `/home/asaas/projects/challenge/cypher-front`. Caminhos relativos a essa raiz.
- **Branch de partida:** `dev` (E1-C já está mergeado nela).
- **Requisições com `withCredentials: true`** — mesma razão de E1-C: a autenticação de E4 será por cookie, porque `EventSource` não aceita cabeçalho `Authorization`.
- **Standalone components e signals**, seguindo `CatalogService`, `IncidentService` e `DashboardComponent`. Nenhum NgModule novo.
- **`id` é o nome do campo no fio** — o backend expõe `id`, não `codigo` (ver Global Constraints de E2-A). "Código" é o conceito na interface; `id` é o nome no payload.
- **Erro do servidor precisa chegar na tela.** `409` e `422` trazem `{"erro": "..."}`; exibir "algo deu errado" no lugar seria falha silenciosa com outra roupa.
- **Nada de dados fabricados fora do modo de exemplo.** Se um fixture aparecer em tela com `useMockData: false`, é defeito.
- **Testes:** `npm test -- --watch=false`. Specs que renderizem componentes declaram `provideZonelessChangeDetection()`; specs que toquem o badge de conexão declaram `{ provide: USE_MOCK_DATA, useValue: false }`, como o token já documenta.
- **Commits:** um por tarefa, em português, formato do repo (`feat:`, `fix:`, `chore:`).

---

## Estrutura de arquivos

```
src/app/shared/
├── incident.models.ts                     MODIFICAR  + CameraAdmin, requests, ApiError
├── catalog.service.ts                     MODIFICAR  + escrita, item, reload
├── catalog.service.spec.ts                MODIFICAR  + casos de escrita
└── mock/
    ├── fixtures.ts                        MODIFICAR  cópias mutáveis
    ├── mock-api.interceptor.ts            MODIFICAR  + POST/PUT/DELETE
    └── mock-api.interceptor.spec.ts       MODIFICAR  + casos de escrita

src/app/config/stations/
├── stations-config.component.ts           CRIAR
├── stations-config.component.html         CRIAR
├── stations-config.component.scss         CRIAR
└── stations-config.component.spec.ts      CRIAR

src/app/onboarding/
├── models/onboarding.models.ts            MODIFICAR  + passo stations
├── onboarding.service.ts                  MODIFICAR  validação por chave, não por índice
├── onboarding.service.spec.ts             MODIFICAR  + casos do passo novo
├── onboarding.component.ts                MODIFICAR  + import do passo
├── onboarding.component.html              MODIFICAR  + bloco do passo
└── steps/step-stations/
    └── step-stations.component.ts         CRIAR      embrulha o componente de config

src/app/app.routes.ts                      MODIFICAR  + /config/estacoes
```

**Por que um componente e um embrulho.** `StationsConfigComponent` não conhece onboarding nem rota: recebe e emite. `StepStationsComponent` é o adaptador de 20 linhas que o encaixa no wizard (título, texto de ajuda, botões do fluxo). Sem essa separação, o componente de cadastro acabaria com um `@Input() modoOnboarding` e dois caminhos de renderização — que é como formulários duplicados nascem.

---

## Task 1: Tipos e escrita no serviço de catálogo

**Files:**
- Modify: `src/app/shared/incident.models.ts`
- Modify: `src/app/shared/catalog.service.ts`
- Modify: `src/app/shared/catalog.service.spec.ts`

**Interfaces:**
- Consumes: `Camera`, `Station` (E1-C).
- Produces:
  - `CameraAdmin extends Camera { fonte: string | null; ativa: boolean }`.
  - `StationPayload { id: string; nome: string; setor: string | null; ativa?: boolean }`.
  - `CameraPayload { id: string; nome: string; estacaoId: string; streamUrl: string; fonte: string | null; ativa?: boolean }`.
  - `CODIGO_PADRAO = /^[A-Z0-9]{2,10}-[A-Z0-9]{1,8}$/`.
  - `mensagemDeErro(erro: unknown): string`.
  - `CatalogService.createStation/updateStation/deactivateStation(...) -> Observable<...>`
  - `CatalogService.createCamera/updateCamera/deactivateCamera(...)`, `camera(id) -> Observable<CameraAdmin>`
  - `CatalogService.load()` passa a aceitar `incluirInativas`.

`Station.ativa` já existe no tipo de E1-C. `CameraAdmin` é novo porque a lista não traz `fonte` e o item individual traz — a assimetria é deliberada no backend e o tipo precisa refleti-la, senão o componente lê `camera.fonte` da lista e recebe `undefined` em silêncio.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `src/app/shared/catalog.service.spec.ts`:

```typescript
import { CameraAdmin, mensagemDeErro } from './incident.models';

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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — `service.createStation is not a function` e `mensagemDeErro` não existe.

- [ ] **Step 3: Implementar o mínimo**

Acrescentar a `src/app/shared/incident.models.ts`:

```typescript
/** Câmera na superfície de administração: a lista não traz `fonte`, o item traz. */
export interface CameraAdmin extends Camera {
  fonte: string | null;
  ativa: boolean;
}

export interface StationPayload {
  id: string;
  nome: string;
  setor: string | null;
  ativa?: boolean;
}

export interface CameraPayload {
  id: string;
  nome: string;
  estacaoId: string;
  streamUrl: string;
  fonte: string | null;
  ativa?: boolean;
}

/** Mesmo padrão que o backend valida (spec §4): 4 a 19 caracteres. */
export const CODIGO_PADRAO = /^[A-Z0-9]{2,10}-[A-Z0-9]{1,8}$/;

/**
 * Texto que o gestor vai ler.
 *
 * O backend responde `{"erro": "..."}` em 409 e 422 justamente para que a
 * tela possa dizer o que aconteceu; trocar isso por "algo deu errado" seria
 * falha silenciosa com outra roupa.
 */
export function mensagemDeErro(erro: unknown): string {
  const e = erro as { error?: { erro?: string }; status?: number; message?: string } | null;
  if (e?.error?.erro) {
    return e.error.erro;
  }
  if (e?.status) {
    return `A operação falhou (HTTP ${e.status}). Tente novamente.`;
  }
  return 'A operação falhou. Verifique a conexão com a API.';
}
```

Substituir `src/app/shared/catalog.service.ts`:

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  Camera, CameraAdmin, CameraPayload, Station, StationPayload,
} from './incident.models';

/**
 * Câmeras e estações.
 *
 * Fonte única do catálogo para dashboard, heatmap e cadastro: recarregar aqui
 * atualiza as três telas, sem código de sincronização entre elas.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private http = inject(HttpClient);

  private readonly _cameras = signal<Camera[]>([]);
  private readonly _stations = signal<Station[]>([]);
  private incluirInativas = false;

  readonly cameras = this._cameras.asReadonly();
  readonly stations = this._stations.asReadonly();

  load(incluirInativas = false): void {
    this.incluirInativas = incluirInativas;

    this.http.get<Camera[]>(`${environment.apiUrl}/cameras`, { withCredentials: true })
      .subscribe({ next: c => this._cameras.set(c), error: () => { } });

    this.http.get<Station[]>(`${environment.apiUrl}/stations`, {
      params: incluirInativas ? { incluirInativas: 'true' } : {},
      withCredentials: true,
    }).subscribe({ next: s => this._stations.set(s), error: () => { } });
  }

  /** Estação que uma câmera cobre, ou null se a câmera não estiver cadastrada. */
  stationOfCamera(cameraId: string): Station | null {
    const camera = this._cameras().find(c => c.id === cameraId);
    if (!camera) {
      return null;
    }
    return this._stations().find(s => s.id === camera.estacaoId) ?? null;
  }

  /** Item individual: única leitura que traz `fonte`. */
  camera(id: string): Observable<CameraAdmin> {
    return this.http.get<CameraAdmin>(`${environment.apiUrl}/cameras/${id}`,
      { withCredentials: true });
  }

  createStation(payload: StationPayload): Observable<Station> {
    return this.http.post<Station>(`${environment.apiUrl}/stations`, payload,
      { withCredentials: true }).pipe(tap(() => this.reload()));
  }

  updateStation(id: string, payload: StationPayload): Observable<Station> {
    return this.http.put<Station>(`${environment.apiUrl}/stations/${id}`, payload,
      { withCredentials: true }).pipe(tap(() => this.reload()));
  }

  deactivateStation(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/stations/${id}`,
      { withCredentials: true }).pipe(tap(() => this.reload()));
  }

  createCamera(payload: CameraPayload): Observable<CameraAdmin> {
    return this.http.post<CameraAdmin>(`${environment.apiUrl}/cameras`, payload,
      { withCredentials: true }).pipe(tap(() => this.reload()));
  }

  updateCamera(id: string, payload: CameraPayload): Observable<CameraAdmin> {
    return this.http.put<CameraAdmin>(`${environment.apiUrl}/cameras/${id}`, payload,
      { withCredentials: true }).pipe(tap(() => this.reload()));
  }

  deactivateCamera(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/cameras/${id}`,
      { withCredentials: true }).pipe(tap(() => this.reload()));
  }

  private reload(): void {
    this.load(this.incluirInativas);
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 11 testes novos.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/incident.models.ts src/app/shared/catalog.service.ts \
        src/app/shared/catalog.service.spec.ts
git commit -m "feat: escrita de catalogo no servico, com erro do servidor propagado"
```

---

## Task 2: Modo de exemplo responde escritas

**Files:**
- Modify: `src/app/shared/mock/fixtures.ts`
- Modify: `src/app/shared/mock/mock-api.interceptor.ts`
- Modify: `src/app/shared/mock/mock-api.interceptor.spec.ts`

**Interfaces:**
- Consumes: fixtures existentes.
- Produces: o interceptor responde `POST`/`PUT`/`DELETE` de `stations` e `cameras`, mutando cópias em memória; `resetMockCatalog()` para isolar testes.

O interceptor hoje só responde `GET`. Sem escritas, a tela de cadastro não é desenvolvível sem backend — e o princípio que o time já adotou é trocar o transporte, não o serviço.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `src/app/shared/mock/mock-api.interceptor.spec.ts`:

```typescript
import { resetMockCatalog } from './fixtures';

describe('mockApiInterceptor — escritas', () => {
  let http: HttpTestingController;
  let cliente: HttpClient;

  beforeEach(() => {
    resetMockCatalog();
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

  it('reset devolve as fixtures ao estado inicial', async () => {
    await esperar(cliente.post(`${environment.apiUrl}/stations`,
      { id: 'EST-90', nome: 'Nova', setor: null }));

    resetMockCatalog();

    const lista = await esperar(
      cliente.get<{ id: string }[]>(`${environment.apiUrl}/stations`));
    expect(lista.some(s => s.id === 'EST-90')).toBe(false);
  });
});
```

Os imports que este bloco precisa, no topo do arquivo: `HttpClient`, `withInterceptors`, `provideHttpClient`, `withFetch` de `@angular/common/http`; `TestBed`; `environment`; `mockApiInterceptor`.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — `resetMockCatalog` não existe e o `POST` passa direto pelo interceptor.

- [ ] **Step 3: Implementar o mínimo**

Em `src/app/shared/mock/fixtures.ts`, acrescentar cópias mutáveis e o reset. As constantes originais permanecem como semente imutável:

```typescript
/**
 * Estado mutável do catálogo no modo de exemplo.
 *
 * O interceptor precisa de escrita para que as telas de cadastro sejam
 * desenvolvíveis sem backend. As constantes acima seguem sendo a semente;
 * estas são a cópia que muda.
 */
export let STATIONS_MUTAVEL: Station[] = [];
export let CAMERAS_MUTAVEL: CameraAdmin[] = [];

export function resetMockCatalog(): void {
  STATIONS_MUTAVEL = STATIONS.map(s => ({ ...s, cameras: [...s.cameras] }));
  CAMERAS_MUTAVEL = CAMERAS.map(c => ({
    ...c,
    fonte: `rtsp://\${${c.id.replace('-', '_')}_USER}@10.0.0.7/stream`,
    ativa: true,
  }));
}

resetMockCatalog();
```

Acrescentar os imports de `Station` e `CameraAdmin` de `../incident.models` no topo do arquivo.

Em `src/app/shared/mock/mock-api.interceptor.ts`, o interceptor passa a tratar escrita. Substituir o corpo do arquivo pela versão abaixo, mantendo as respostas de `GET` que já existiam para incidentes e resumo:

```typescript
import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CameraAdmin, Station } from '../incident.models';
import { CAMERAS_MUTAVEL, INCIDENTS, STATIONS_MUTAVEL, resumo } from './fixtures';

const ATRASO_MS = 150;

/**
 * Responde os endpoints do painel a partir de fixtures, sem rede.
 *
 * Trocar o transporte em vez do serviço é o que mantém serviços, componentes
 * e templates idênticos nos dois modos: o modo de exemplo exercita o código
 * de verdade, inclusive as validações de cadastro.
 */
export const mockApiInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const resultado = responder(req);
  if (resultado === undefined) {
    return next(req);
  }
  if (resultado instanceof HttpErrorResponse) {
    return throwError(() => resultado).pipe(delay(ATRASO_MS));
  }
  return of(new HttpResponse({ status: 200, body: resultado })).pipe(delay(ATRASO_MS));
};

function conflito(mensagem: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 409, error: { erro: mensagem } });
}

function naoProcessavel(mensagem: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 422, error: { erro: mensagem } });
}

function naoEncontrado(mensagem: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 404, error: { erro: mensagem } });
}

function comCameras(estacao: Station): Station {
  return {
    ...estacao,
    cameras: CAMERAS_MUTAVEL.filter(c => c.estacaoId === estacao.id && c.ativa)
      .map(({ id, nome, estacaoId, streamUrl }) => ({ id, nome, estacaoId, streamUrl })),
  };
}

function responder(req: HttpRequest<unknown>): unknown | HttpErrorResponse | undefined {
  const base = environment.apiUrl;

  // ---------------- escrita de estação ----------------

  if (req.method === 'POST' && req.url === `${base}/stations`) {
    const corpo = req.body as Station;
    if (STATIONS_MUTAVEL.some(s => s.id === corpo.id)) {
      return conflito(`Estacao ja cadastrada: ${corpo.id}`);
    }
    const nova: Station = { ...corpo, ativa: corpo.ativa ?? true, cameras: [] };
    STATIONS_MUTAVEL.push(nova);
    return nova;
  }

  if (req.method === 'PUT' && req.url.startsWith(`${base}/stations/`)) {
    const id = req.url.slice(`${base}/stations/`.length);
    const corpo = req.body as Station;
    if (corpo.id && corpo.id !== id) {
      return conflito(`O codigo de estacao e imutavel: ${id} nao pode virar ${corpo.id}`);
    }
    const atual = STATIONS_MUTAVEL.find(s => s.id === id);
    if (!atual) {
      return naoEncontrado(`Estacao inexistente: ${id}`);
    }
    atual.nome = corpo.nome;
    atual.setor = corpo.setor;
    if (corpo.ativa !== undefined) {
      atual.ativa = corpo.ativa;
    }
    return comCameras(atual);
  }

  if (req.method === 'DELETE' && req.url.startsWith(`${base}/stations/`)) {
    const id = req.url.slice(`${base}/stations/`.length);
    const atual = STATIONS_MUTAVEL.find(s => s.id === id);
    if (!atual) {
      return naoEncontrado(`Estacao inexistente: ${id}`);
    }
    atual.ativa = false;
    return null;
  }

  // ---------------- escrita de câmera ----------------

  if (req.method === 'POST' && req.url === `${base}/cameras`) {
    const corpo = req.body as CameraAdmin;
    if (CAMERAS_MUTAVEL.some(c => c.id === corpo.id)) {
      return conflito(`Camera ja cadastrada: ${corpo.id}`);
    }
    if (!STATIONS_MUTAVEL.some(s => s.id === corpo.estacaoId)) {
      return naoProcessavel(`Estacao inexistente: ${corpo.estacaoId}`);
    }
    if (CAMERAS_MUTAVEL.some(c => c.streamUrl === corpo.streamUrl)) {
      return conflito(`streamUrl ja usada`);
    }
    const nova: CameraAdmin = { ...corpo, ativa: corpo.ativa ?? true };
    CAMERAS_MUTAVEL.push(nova);
    return nova;
  }

  if (req.method === 'PUT' && req.url.startsWith(`${base}/cameras/`)) {
    const id = req.url.slice(`${base}/cameras/`.length);
    const corpo = req.body as CameraAdmin;
    if (corpo.id && corpo.id !== id) {
      return conflito(`O codigo de camera e imutavel: ${id} nao pode virar ${corpo.id}`);
    }
    const atual = CAMERAS_MUTAVEL.find(c => c.id === id);
    if (!atual) {
      return naoEncontrado(`Camera inexistente: ${id}`);
    }
    if (!STATIONS_MUTAVEL.some(s => s.id === corpo.estacaoId)) {
      return naoProcessavel(`Estacao inexistente: ${corpo.estacaoId}`);
    }
    Object.assign(atual, corpo, { ativa: corpo.ativa ?? atual.ativa });
    return atual;
  }

  if (req.method === 'DELETE' && req.url.startsWith(`${base}/cameras/`)) {
    const id = req.url.slice(`${base}/cameras/`.length);
    const atual = CAMERAS_MUTAVEL.find(c => c.id === id);
    if (!atual) {
      return naoEncontrado(`Camera inexistente: ${id}`);
    }
    atual.ativa = false;
    return null;
  }

  // ---------------- leitura ----------------

  if (req.method === 'GET' && req.url === `${base}/cameras`) {
    return CAMERAS_MUTAVEL.filter(c => c.ativa)
      .map(({ id, nome, estacaoId, streamUrl }) => ({ id, nome, estacaoId, streamUrl }));
  }

  if (req.method === 'GET' && req.url.startsWith(`${base}/cameras/`)) {
    const id = req.url.slice(`${base}/cameras/`.length);
    const camera = CAMERAS_MUTAVEL.find(c => c.id === id);
    return camera ?? naoEncontrado(`Camera inexistente: ${id}`);
  }

  if (req.method === 'GET' && req.url === `${base}/stations`) {
    const todas = req.params.get('incluirInativas') === 'true';
    return STATIONS_MUTAVEL.filter(s => todas || s.ativa).map(comCameras);
  }

  if (req.method === 'GET' && req.url === `${base}/incidents`) {
    // Comparação de string funciona porque todas as fixtures trazem o mesmo
    // offset -03:00; com offsets misturados isto precisaria de Date.
    const since = req.params.get('since');
    const lista = since ? INCIDENTS.filter(i => i.detectedAt > since) : INCIDENTS;
    return {
      content: lista, totalElements: lista.length,
      totalPages: 1, number: 0, size: lista.length,
    };
  }

  if (req.method === 'GET' && req.url === `${base}/summary`) {
    return resumo();
  }

  return undefined;
}
```

**Leia o arquivo inteiro antes de substituí-lo.** Ele pode ter ramos que este plano não conhece — `PUT /incidents/{id}/status`, por exemplo. Preservar todos: acrescentar, não remover. `EMITIDOS` sai da lista de imports porque é consumido por `mock-event-source.ts`, não pelo interceptor; se o arquivo atual o usar, mantenha o import.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 7 testes novos, e os testes de exemplo que já existiam continuam verdes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/mock/
git commit -m "feat: modo de exemplo responde escritas de catalogo em memoria"
```

---

## Task 3: Componente de cadastro

**Files:**
- Create: `src/app/config/stations/stations-config.component.ts`
- Create: `src/app/config/stations/stations-config.component.html`
- Create: `src/app/config/stations/stations-config.component.scss`
- Create: `src/app/config/stations/stations-config.component.spec.ts`

**Interfaces:**
- Consumes: `CatalogService` (Task 1), `CODIGO_PADRAO`, `mensagemDeErro`.
- Produces:
  - `StationsConfigComponent` — seletor `app-stations-config`.
  - Estado: `estacoes()`, `camerasDe(estacaoId)`, `erro()`, `salvando()`.
  - Formulários: `novaEstacao`, `novaCamera` (objetos de signal), `salvarEstacao()`, `salvarCamera()`, `desativarEstacao(id)`, `desativarCamera(id)`.
  - Saída: `cadastroCompleto` — `computed()` verdadeiro quando existe ao menos uma estação com ao menos uma câmera ativa.

`cadastroCompleto` existe para o passo do onboarding conseguir avisar sem bloquear (Task 5).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/config/stations/stations-config.component.spec.ts`:

```typescript
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { StationsConfigComponent } from './stations-config.component';

describe('StationsConfigComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function montar() {
    const fixture = TestBed.createComponent(StationsConfigComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/cameras`).forEach(r => r.flush([]));
    http.match(r => r.url === `${environment.apiUrl}/stations`).forEach(r => r.flush([]));
    fixture.detectChanges();
    return fixture;
  }

  it('carrega o catalogo incluindo inativas, para poder reativar', () => {
    const fixture = TestBed.createComponent(StationsConfigComponent);
    fixture.detectChanges();

    const req = http.expectOne(
      r => r.url === `${environment.apiUrl}/stations`
        && r.params.get('incluirInativas') === 'true');
    req.flush([]);
    http.match(r => r.url === `${environment.apiUrl}/cameras`).forEach(r => r.flush([]));
  });

  it('recusa codigo mal formado antes de chamar a API', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaEstacao.set({ id: 'est_01', nome: 'Esteira', setor: '' });
    componente.salvarEstacao();
    fixture.detectChanges();

    // Nenhuma requisição: a validação de forma acontece na tela.
    http.expectNone(`${environment.apiUrl}/stations`);
    expect(componente.erro()).toContain('EST-01');
  });

  it('exige nome', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaEstacao.set({ id: 'EST-01', nome: '  ', setor: '' });
    componente.salvarEstacao();

    http.expectNone(`${environment.apiUrl}/stations`);
    expect(componente.erro().length).toBeGreaterThan(0);
  });

  it('cadastra estacao e limpa o formulario', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaEstacao.set({ id: 'EST-01', nome: 'Esteira', setor: 'montagem' });
    componente.salvarEstacao();

    const req = http.expectOne(
      r => r.method === 'POST' && r.url === `${environment.apiUrl}/stations`);
    expect(req.request.body).toEqual({ id: 'EST-01', nome: 'Esteira', setor: 'montagem' });
    req.flush({ id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] });
    http.match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    expect(componente.novaEstacao().id).toBe('');
    expect(componente.erro()).toBe('');
  });

  it('mostra a mensagem do servidor quando o codigo ja existe', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaEstacao.set({ id: 'EST-01', nome: 'Esteira', setor: '' });
    componente.salvarEstacao();

    http.expectOne(r => r.method === 'POST' && r.url === `${environment.apiUrl}/stations`)
        .flush({ erro: 'Estacao ja cadastrada: EST-01' },
                { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(componente.erro()).toBe('Estacao ja cadastrada: EST-01');
    // O que foi digitado não é perdido: o gestor corrige em vez de redigitar.
    expect(componente.novaEstacao().id).toBe('EST-01');
    expect(fixture.nativeElement.textContent).toContain('Estacao ja cadastrada');
  });

  it('exige porta explicita na url de stream antes de chamar a API', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaCamera.set({
      id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01',
      streamUrl: 'http://127.0.0.1/stream', fonte: '',
    });
    componente.salvarCamera();

    http.expectNone(`${environment.apiUrl}/cameras`);
    expect(componente.erro()).toContain('porta');
  });

  it('cadastra camera enviando fonte nula quando o campo esta vazio', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaCamera.set({
      id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01',
      streamUrl: 'http://127.0.0.1:8090/stream', fonte: '',
    });
    componente.salvarCamera();

    const req = http.expectOne(
      r => r.method === 'POST' && r.url === `${environment.apiUrl}/cameras`);
    expect((req.request.body as { fonte: string | null }).fonte).toBeNull();
    req.flush({});
    http.match(() => true).forEach(r => r.flush([]));
  });

  it('desativa camera pelo endpoint de delete', () => {
    const fixture = montar();

    fixture.componentInstance.desativarCamera('CAM-01');

    const req = http.expectOne(
      r => r.method === 'DELETE' && r.url === `${environment.apiUrl}/cameras/CAM-01`);
    req.flush(null, { status: 204, statusText: 'No Content' });
    http.match(() => true).forEach(r => r.flush([]));
  });

  it('cadastroCompleto so e verdadeiro com estacao e camera ativa', () => {
    const fixture = TestBed.createComponent(StationsConfigComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/cameras`).forEach(r => r.flush([
      { id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x:1/s' },
    ]));
    http.match(r => r.url === `${environment.apiUrl}/stations`).forEach(r => r.flush([
      {
        id: 'EST-01', nome: 'Esteira', setor: null, ativa: true,
        cameras: [{ id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x:1/s' }],
      },
    ]));
    fixture.detectChanges();

    expect(fixture.componentInstance.cadastroCompleto()).toBe(true);
  });

  it('sem nada cadastrado, cadastroCompleto e falso e a tela diz isso', () => {
    const fixture = montar();

    expect(fixture.componentInstance.cadastroCompleto()).toBe(false);
    expect(fixture.nativeElement.textContent.toLowerCase())
      .toContain('nenhuma estação');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — não resolve `./stations-config.component`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/app/config/stations/stations-config.component.ts`:

```typescript
import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { CatalogService } from '../../shared/catalog.service';
import { CODIGO_PADRAO, mensagemDeErro } from '../../shared/incident.models';

interface FormEstacao { id: string; nome: string; setor: string; }
interface FormCamera {
  id: string; nome: string; estacaoId: string; streamUrl: string; fonte: string;
}

const ESTACAO_VAZIA: FormEstacao = { id: '', nome: '', setor: '' };
const CAMERA_VAZIA: FormCamera = {
  id: '', nome: '', estacaoId: '', streamUrl: '', fonte: '',
};

/**
 * Cadastro de estações e câmeras.
 *
 * Não conhece rota nem onboarding: recebe e emite. O encaixe no wizard é
 * feito por um embrulho, para que exista um formulário e não dois.
 */
@Component({
  selector: 'app-stations-config',
  templateUrl: './stations-config.component.html',
  styleUrl: './stations-config.component.scss',
})
export class StationsConfigComponent implements OnInit {
  private catalog = inject(CatalogService);

  readonly estacoes = this.catalog.stations;
  readonly erro = signal('');
  readonly salvando = signal(false);

  readonly novaEstacao = signal<FormEstacao>({ ...ESTACAO_VAZIA });
  readonly novaCamera = signal<FormCamera>({ ...CAMERA_VAZIA });

  /** Verdadeiro quando o sistema tem ao menos uma câmera ativa vendo algo. */
  readonly cadastroCompleto = computed(() =>
    this.estacoes().some(e => e.ativa && e.cameras.length > 0));

  ngOnInit(): void {
    // Inclui inativas: é preciso vê-las para poder reativá-las.
    this.catalog.load(true);
  }

  camerasDe(estacaoId: string) {
    return this.estacoes().find(e => e.id === estacaoId)?.cameras ?? [];
  }

  salvarEstacao(): void {
    const form = this.novaEstacao();
    const problema = this.validarCodigo(form.id, 'EST-01') ?? this.validarNome(form.nome);
    if (problema) {
      this.erro.set(problema);
      return;
    }

    this.erro.set('');
    this.salvando.set(true);
    this.catalog.createStation({
      id: form.id,
      nome: form.nome.trim(),
      setor: form.setor.trim() || null,
    }).subscribe({
      next: () => {
        this.novaEstacao.set({ ...ESTACAO_VAZIA });
        this.salvando.set(false);
      },
      error: e => {
        // Não limpa o formulário: o gestor corrige em vez de redigitar.
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  salvarCamera(): void {
    const form = this.novaCamera();
    const problema = this.validarCodigo(form.id, 'CAM-01')
      ?? this.validarNome(form.nome)
      ?? this.validarEstacao(form.estacaoId)
      ?? this.validarStreamUrl(form.streamUrl);
    if (problema) {
      this.erro.set(problema);
      return;
    }

    this.erro.set('');
    this.salvando.set(true);
    this.catalog.createCamera({
      id: form.id,
      nome: form.nome.trim(),
      estacaoId: form.estacaoId,
      streamUrl: form.streamUrl.trim(),
      fonte: form.fonte.trim() || null,
    }).subscribe({
      next: () => {
        this.novaCamera.set({ ...CAMERA_VAZIA });
        this.salvando.set(false);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  desativarEstacao(id: string): void {
    this.catalog.deactivateStation(id).subscribe({
      error: e => this.erro.set(mensagemDeErro(e)),
    });
  }

  desativarCamera(id: string): void {
    this.catalog.deactivateCamera(id).subscribe({
      error: e => this.erro.set(mensagemDeErro(e)),
    });
  }

  reativarEstacao(id: string): void {
    const atual = this.estacoes().find(e => e.id === id);
    if (!atual) {
      return;
    }
    this.catalog.updateStation(id, {
      id, nome: atual.nome, setor: atual.setor, ativa: true,
    }).subscribe({ error: e => this.erro.set(mensagemDeErro(e)) });
  }

  // ------------------------------------------------------------------
  // Validação de forma, feita aqui para não gastar ida à API
  // ------------------------------------------------------------------

  private validarCodigo(codigo: string, exemplo: string): string | null {
    if (!CODIGO_PADRAO.test(codigo)) {
      return `Código inválido. Use letras maiúsculas e números com um hífen, como ${exemplo}.`;
    }
    return null;
  }

  private validarNome(nome: string): string | null {
    return nome.trim() ? null : 'Informe um nome.';
  }

  private validarEstacao(estacaoId: string): string | null {
    return estacaoId ? null : 'Escolha a estação que esta câmera cobre.';
  }

  private validarStreamUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (!parsed.port) {
        // O MJPEG não serve em 80 nem 443, e o backend deriva a porta desta URL.
        return 'A URL do stream precisa de porta explícita, como http://127.0.0.1:8090/stream.';
      }
      return null;
    } catch {
      return 'URL do stream inválida.';
    }
  }
}
```

Criar `src/app/config/stations/stations-config.component.html`:

```html
<section class="cadastro">
  @if (erro()) {
    <p class="erro" role="alert">{{ erro() }}</p>
  }

  <div class="forms">
    <form class="card" (submit)="$event.preventDefault(); salvarEstacao()">
      <h3>Nova estação</h3>
      <label>Código
        <input [value]="novaEstacao().id" placeholder="EST-01"
               (input)="novaEstacao.set({ ...novaEstacao(), id: ($any($event.target).value || '').toUpperCase() })" />
      </label>
      <label>Nome
        <input [value]="novaEstacao().nome" placeholder="Esteira de montagem"
               (input)="novaEstacao.set({ ...novaEstacao(), nome: $any($event.target).value })" />
      </label>
      <label>Setor
        <input [value]="novaEstacao().setor" placeholder="montagem"
               (input)="novaEstacao.set({ ...novaEstacao(), setor: $any($event.target).value })" />
      </label>
      <button type="submit" [disabled]="salvando()">Cadastrar estação</button>
    </form>

    <form class="card" (submit)="$event.preventDefault(); salvarCamera()">
      <h3>Nova câmera</h3>
      <label>Código
        <input [value]="novaCamera().id" placeholder="CAM-01"
               (input)="novaCamera.set({ ...novaCamera(), id: ($any($event.target).value || '').toUpperCase() })" />
      </label>
      <label>Nome
        <input [value]="novaCamera().nome" placeholder="Esteira - frontal"
               (input)="novaCamera.set({ ...novaCamera(), nome: $any($event.target).value })" />
      </label>
      <label>Estação
        <select [value]="novaCamera().estacaoId"
                (change)="novaCamera.set({ ...novaCamera(), estacaoId: $any($event.target).value })">
          <option value="">Escolha…</option>
          @for (e of estacoes(); track e.id) {
            @if (e.ativa) { <option [value]="e.id">{{ e.id }} · {{ e.nome }}</option> }
          }
        </select>
      </label>
      <label>URL do stream
        <input [value]="novaCamera().streamUrl" placeholder="http://127.0.0.1:8090/stream"
               (input)="novaCamera.set({ ...novaCamera(), streamUrl: $any($event.target).value })" />
      </label>
      <label>Fonte de captura
        <input [value]="novaCamera().fonte"
               placeholder="rtsp://&#36;{CAM01_USER}:&#36;{CAM01_PASS}&#64;10.0.0.7/stream"
               (input)="novaCamera.set({ ...novaCamera(), fonte: $any($event.target).value })" />
      </label>
      <p class="ajuda">
        Use <code>&#36;{VARIAVEL}</code> para usuário e senha. O valor é lido do ambiente
        do computador que roda o pipeline — a senha nunca é gravada no servidor.
      </p>
      <button type="submit" [disabled]="salvando()">Cadastrar câmera</button>
    </form>
  </div>

  <div class="lista">
    <h3>Cadastrado</h3>
    @for (e of estacoes(); track e.id) {
      <div class="estacao" [class.inativa]="!e.ativa">
        <div class="linha">
          <strong>{{ e.id }}</strong>
          <span>{{ e.nome }}</span>
          <span class="setor">{{ e.setor || 'sem setor' }}</span>
          @if (e.ativa) {
            <button type="button" (click)="desativarEstacao(e.id)">desativar</button>
          } @else {
            <button type="button" (click)="reativarEstacao(e.id)">reativar</button>
          }
        </div>
        @for (c of e.cameras; track c.id) {
          <div class="camera">
            <span>{{ c.id }}</span>
            <span>{{ c.nome }}</span>
            <button type="button" (click)="desativarCamera(c.id)">desativar</button>
          </div>
        } @empty {
          <p class="vazio">nenhuma câmera nesta estação — o sistema não vê nada aqui</p>
        }
      </div>
    } @empty {
      <p class="vazio">nenhuma estação cadastrada ainda</p>
    }
  </div>
</section>
```

Criar `src/app/config/stations/stations-config.component.scss`:

```scss
.cadastro { display: flex; flex-direction: column; gap: 18px; }

.erro {
  padding: 10px 12px; border-radius: 6px;
  border: 1px solid #EE4242; color: #EE4242;
  background: rgba(238, 66, 66, 0.08); font-size: 13px;
}

.forms { display: flex; gap: 16px; flex-wrap: wrap; }

.card {
  flex: 1 1 280px; display: flex; flex-direction: column; gap: 8px;
  padding: 14px; border: 1px solid var(--border, #2a2a2a); border-radius: 8px;

  h3 { margin: 0 0 4px; font-size: 14px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  input, select { padding: 7px 9px; font-size: 13px; }
  button { margin-top: 6px; padding: 8px 12px; font-size: 13px; }
}

.ajuda { margin: 2px 0 0; font-size: 11px; opacity: .7; line-height: 1.4; }

.lista {
  h3 { font-size: 14px; margin: 0 0 8px; }
}

.estacao {
  padding: 10px 0; border-bottom: 1px solid var(--border, #2a2a2a);
  &.inativa { opacity: .45; }
}

.linha, .camera {
  display: flex; gap: 10px; align-items: center; font-size: 13px;
}
.camera { padding-left: 18px; font-size: 12px; opacity: .8; }
.setor { opacity: .6; font-size: 11px; }
.vazio { font-size: 12px; opacity: .55; padding-left: 18px; }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 11 testes novos.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/config/
git commit -m "feat: componente de cadastro de estacoes e cameras"
```

---

## Task 4: Rota de configuração

**Files:**
- Modify: `src/app/app.routes.ts`
- Create: `src/app/config/stations/stations-page.component.ts`
- Create: `src/app/config/stations/stations-page.component.spec.ts`

**Interfaces:**
- Consumes: `StationsConfigComponent` (Task 3), `ChromeTopbarComponent`, `DockComponent`.
- Produces: rota `/config/estacoes` renderizando `StationsPageComponent`.

A página é separada do componente porque ela carrega a moldura do produto — topbar e dock — que o passo do onboarding não deve ter.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/config/stations/stations-page.component.spec.ts`:

```typescript
import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { routes } from '../../app.routes';
import { StationsPageComponent } from './stations-page.component';

describe('StationsPageComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('renderiza o cadastro dentro da moldura do produto', () => {
    const fixture = TestBed.createComponent(StationsPageComponent);
    fixture.detectChanges();
    http.match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-stations-config')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-chrome-topbar')).not.toBeNull();
  });

  it('a rota /config/estacoes existe', () => {
    expect(routes.some(r => r.path === 'config/estacoes')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — não resolve `./stations-page.component`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/app/config/stations/stations-page.component.ts`:

```typescript
import { Component } from '@angular/core';

import { ChromeTopbarComponent } from '../../shared/chrome-topbar/chrome-topbar.component';
import { DockComponent } from '../../shared/dock/dock.component';
import { StationsConfigComponent } from './stations-config.component';

/**
 * Página de configuração de estações e câmeras.
 *
 * Existe separada do componente de cadastro porque carrega a moldura do
 * produto — topbar e dock — que o passo do onboarding não deve ter.
 */
@Component({
  selector: 'app-stations-page',
  imports: [ChromeTopbarComponent, DockComponent, StationsConfigComponent],
  template: `
    <app-chrome-topbar />
    <main class="pagina">
      <header>
        <h1>Estações e câmeras</h1>
        <p>O que o Cypher monitora. Cada célula do mapa de calor é uma estação.</p>
      </header>
      <app-stations-config />
    </main>
    <app-dock />
  `,
  styles: [`
    .pagina { padding: 24px 28px 96px; max-width: 1080px; margin: 0 auto; }
    header { margin-bottom: 20px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    header p { margin: 0; font-size: 13px; opacity: .65; }
  `],
})
export class StationsPageComponent {
}
```

Acrescentar a rota em `src/app/app.routes.ts`:

```typescript
import { StationsPageComponent } from './config/stations/stations-page.component';
```

```typescript
  { path: 'config/estacoes', component: StationsPageComponent },
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 2 testes novos.

- [ ] **Step 5: Confirmar que a build funciona**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm run build
```

Esperado: build de produção conclui sem erro de template.

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/config/ src/app/app.routes.ts
git commit -m "feat: rota /config/estacoes com a pagina de cadastro"
```

---

## Task 5: Passo do onboarding e validação por chave

**Files:**
- Modify: `src/app/onboarding/models/onboarding.models.ts`
- Modify: `src/app/onboarding/onboarding.service.ts`
- Modify: `src/app/onboarding/onboarding.service.spec.ts`
- Create: `src/app/onboarding/steps/step-stations/step-stations.component.ts`
- Modify: `src/app/onboarding/onboarding.component.ts`
- Modify: `src/app/onboarding/onboarding.component.html`

**Interfaces:**
- Consumes: `StationsConfigComponent` (Task 3).
- Produces:
  - `STEPS` com 5 entradas; a nova tem `key: 'stations'` na posição 1.
  - `OnboardingService.validateStep(s)` valida **por chave**, não por índice.
  - `OnboardingService.next()` limitado por `STEPS.length - 1`.
  - `StepStationsComponent` — seletor `app-step-stations`.

**Este é o risco silencioso desta entrega.** `validateStep` hoje decide por posição — `s === 0` valida identidade, `s === 1` valida EPIs — e `next()` tem `if (this.step() < 3)` fixo. Inserir o passo de estações na posição 1 faria a validação de EPI rodar no passo de estações e o wizard parar no quarto de cinco passos, **sem erro nenhum aparecer**. A conversão para chave é obrigatória, não estética.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `src/app/onboarding/onboarding.service.spec.ts`:

```typescript
import { STEPS } from './models/onboarding.models';

describe('OnboardingService — passo de estações', () => {
  let service: OnboardingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    service = TestBed.inject(OnboardingService);
  });

  it('o wizard tem cinco passos, com estações em segundo', () => {
    expect(STEPS.map(s => s.key))
      .toEqual(['identity', 'stations', 'epis', 'cas', 'launch']);
  });

  it('valida por chave, nao por posicao', () => {
    // EPIs agora estão no índice 2. Se a validação fosse posicional, este
    // passo cairia na regra de identidade e passaria com EPIs vazios.
    service.updateData({ company: 'Acme', sector: 'Metalurgia', epis: [] });

    const indiceEpis = STEPS.findIndex(s => s.key === 'epis');
    expect(service.validateStep(indiceEpis)).toBe(false);
    expect(service.errors()['epis']).toBeTruthy();
  });

  it('identidade continua validada na sua nova posicao', () => {
    const indiceIdentidade = STEPS.findIndex(s => s.key === 'identity');

    expect(service.validateStep(indiceIdentidade)).toBe(false);
    expect(service.errors()['company']).toBeTruthy();
  });

  it('o passo de estacoes nao bloqueia o avanco', () => {
    // Bloquear tornaria o onboarding um beco sem saída quando a API está
    // fora: o gestor não conseguiria nem chegar ao dashboard para descobrir
    // por quê. O aviso fica na tela do passo.
    const indiceEstacoes = STEPS.findIndex(s => s.key === 'stations');

    expect(service.validateStep(indiceEstacoes)).toBe(true);
  });

  it('avanca ate o ultimo passo', () => {
    service.updateData({ company: 'Acme', sector: 'Metalurgia', epis: ['capacete'] });

    for (let i = 0; i < STEPS.length - 1; i++) {
      service.next();
    }

    expect(service.step()).toBe(STEPS.length - 1);
  });

  it('nao passa do ultimo passo', () => {
    service.updateData({ company: 'Acme', sector: 'Metalurgia', epis: ['capacete'] });
    for (let i = 0; i < STEPS.length + 3; i++) {
      service.next();
    }

    expect(service.step()).toBe(STEPS.length - 1);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — `STEPS` tem 4 entradas e a validação é posicional.

- [ ] **Step 3: Implementar o mínimo**

Em `src/app/onboarding/models/onboarding.models.ts`, substituir `STEPS`:

```typescript
export const STEPS: Step[] = [
  { key: 'identity', name: 'Identidade da empresa', hint: 'Marca · CNPJ · cor' },
  // Antes dos EPIs de propósito: sem câmera cadastrada o sistema não vê nada.
  { key: 'stations', name: 'Estações e câmeras', hint: 'O que será monitorado' },
  { key: 'epis', name: 'EPIs monitorados', hint: 'Seleção dos equipamentos' },
  { key: 'cas', name: 'CAs e validades', hint: 'Opcional · certificados' },
  { key: 'launch', name: 'Confirmação', hint: 'Revisar e iniciar' },
];
```

Em `src/app/onboarding/onboarding.service.ts`, acrescentar `STEPS` ao import de models e substituir `validateStep` e `next`:

```typescript
  /**
   * Valida por **chave**, nunca por índice.
   *
   * A versão anterior decidia por posição (`s === 1` validava EPIs). Inserir
   * um passo no meio fazia a regra errada rodar no passo errado, sem nenhum
   * erro aparecer — exatamente o tipo de defeito que só aparece na demo.
   */
  validateStep(s: number): boolean {
    const key = STEPS[s]?.key;
    const d = this.data();
    const e: Record<string, string> = {};

    if (key === 'identity') {
      if (!d.company.trim()) e['company'] = 'Nome obrigatório';
      if (d.cnpj && d.cnpj.replace(/\D/g, '').length < 14) e['cnpj'] = 'CNPJ incompleto';
      if (!d.sector) e['sector'] = 'Selecione um setor';
    }

    if (key === 'epis') {
      if (d.epis.length === 0) e['epis'] = 'Selecione pelo menos 1 EPI';
    }

    // 'stations' não bloqueia: bloquear tornaria o onboarding um beco sem
    // saída quando a API está fora. O aviso vive na tela do passo.

    this.errors.set(e);
    return Object.keys(e).length === 0;
  }

  next(): void {
    if (!this.validateStep(this.step())) return;
    if (this.step() < STEPS.length - 1) {
      this.direction.set('forward');
      this.step.update(s => s + 1);
    }
  }
```

Criar `src/app/onboarding/steps/step-stations/step-stations.component.ts`:

```typescript
import { Component, computed, inject } from '@angular/core';

import { CatalogService } from '../../../shared/catalog.service';
import { StationsConfigComponent } from '../../../config/stations/stations-config.component';

/**
 * Encaixa o cadastro no wizard.
 *
 * Adaptador de propósito: o componente de cadastro não conhece onboarding, e
 * este não conhece formulário. Sem essa separação, o cadastro acabaria com um
 * `@Input() modoOnboarding` e dois caminhos de renderização — que é como
 * formulários duplicados nascem.
 */
@Component({
  selector: 'app-step-stations',
  imports: [StationsConfigComponent],
  template: `
    <div class="passo">
      <h2>O que o Cypher vai monitorar</h2>
      <p class="sub">
        Cadastre pelo menos uma estação e uma câmera. Você pode ajustar isso
        depois em Configurações · Estações.
      </p>

      <app-stations-config />

      @if (!completo()) {
        <p class="aviso">
          Sem câmera cadastrada, o painel abre vazio. Você pode seguir agora e
          voltar depois.
        </p>
      }
    </div>
  `,
  styles: [`
    .passo { display: flex; flex-direction: column; gap: 12px; }
    h2 { font-size: 18px; margin: 0; }
    .sub { margin: 0; font-size: 13px; opacity: .7; }
    .aviso {
      margin: 4px 0 0; padding: 9px 12px; border-radius: 6px; font-size: 12px;
      border: 1px solid #FFCE38; color: #FFCE38; background: rgba(255, 206, 56, .08);
    }
  `],
})
export class StepStationsComponent {
  private catalog = inject(CatalogService);

  /**
   * Lê o mesmo signal do catálogo que o cadastro alimenta, em vez de consultar
   * o componente filho por `viewChild`: uma query de view não está resolvida
   * quando o template é avaliado pela primeira vez, e `viewChild.required`
   * lançaria nessa passagem.
   */
  readonly completo = computed(() =>
    this.catalog.stations().some(e => e.ativa && e.cameras.length > 0));
}
```

Em `src/app/onboarding/onboarding.component.ts`, acrescentar o import e o componente à lista de `imports`:

```typescript
import { StepStationsComponent } from './steps/step-stations/step-stations.component';
```

Em `src/app/onboarding/onboarding.component.html`, acrescentar o bloco do passo novo. Os blocos existentes são condicionados ao índice do passo; **os índices dos passos seguintes mudam**, então a forma robusta é condicionar pela chave. Substituir as condições de `state.step()` por comparações com `steps[state.step()].key`:

```html
@switch (steps[state.step()].key) {
  @case ('identity') { <app-step1-identity /> }
  @case ('stations') { <app-step-stations /> }
  @case ('epis') { <app-step2-epis /> }
  @case ('cas') { <app-step3-cas /> }
  @case ('launch') { <app-step4-confirm /> }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 6 testes novos, e os testes existentes do onboarding continuam verdes.

- [ ] **Step 5: Confirmar a build e conferir o wizard no navegador**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm run build && npm start
```

Abrir `http://localhost:4200/` e percorrer os cinco passos. Confirmar que o indicador de passos mostra cinco, que o passo 2 é o cadastro, e que nenhum passo pula ou repete conteúdo.

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/onboarding/
git commit -m "feat: passo de estacoes no onboarding e validacao por chave"
```

---

## Task 6: Verificação de ponta a ponta

**Files:** nenhuma alteração de código. Esta tarefa é verificação.

**Interfaces:**
- Consumes: E2-A Tasks 1–8 e E2-B Tasks 1–7 concluídas.
- Produces: `docs/e2c-verificacao.md` com o observado.

- [ ] **Step 1: Verificar no modo de exemplo, sem backend**

```bash
cd /home/asaas/projects/challenge/cypher-front
# ligar temporariamente useMockData em src/environments/environment.development.ts
npm start
```

Abrir `http://localhost:4200/config/estacoes` e confirmar: cadastrar estação funciona, código duplicado mostra a mensagem do servidor falso, câmera de estação inexistente mostra `422`, e desativar tira da lista. Depois **desligar** `useMockData` de novo — e confirmar que desligou, porque deixar ligado publicaria dados fabricados.

- [ ] **Step 2: Subir os três lados**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o spring-boot:run
```

```bash
cd /home/asaas/projects/challenge/cypher-front && npm start
```

- [ ] **Step 3: Cadastrar pela interface e ver o efeito no painel**

Em `/config/estacoes`, cadastrar `EST-30 / Bancada` e `CAM-30` apontando `streamUrl` para `http://127.0.0.1:8130/stream` e `fonte` para `data/validation/cenario2.mp4`.

Ir ao `/heatmap` e confirmar que **a célula nova apareceu sem refresh manual** — é o `reload()` do `CatalogService` alimentando os mesmos signals.

- [ ] **Step 4: Fechar o ciclo com o pipeline**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python src/run_pipeline.py --camera-id CAM-30 \
  --api-url http://localhost:8080/api/v1 --device cuda --no-display
```

Confirmar, no dashboard: o feed ao vivo aparece na câmera nova (porta 8130, derivada do que foi cadastrado na tela), e incidentes chegam com a estação `EST-30` no heatmap. Este é o ciclo completo de E2 — cadastrado na interface, consumido pelo pipeline, de volta na tela.

- [ ] **Step 5: Confirmar o soft delete de ponta a ponta**

Desativar `CAM-30` na tela de cadastro. Confirmar que ela sai do seletor de feed e do heatmap, **e** que os incidentes dela continuam na lista de incidentes do dashboard. Reativar depois.

- [ ] **Step 6: Confirmar o reinício da API**

Reiniciar o backend e confirmar que `EST-30` e `CAM-30` continuam cadastradas com os valores da tela. Antes de E2, o seeder desfaria isso no boot.

- [ ] **Step 7: Registrar o resultado**

Escrever `docs/e2c-verificacao.md` com o observado — números e divergências reais. Se algo não funcionou, o documento registra; ele não é certificado.

```bash
cd /home/asaas/projects/challenge/cypher-front
git add docs/e2c-verificacao.md
git commit -m "docs: resultado da verificacao ponta a ponta de E2"
```

---

## Estado ao fim deste plano

E2 está completa: o gestor cadastra estações e câmeras na interface, o pipeline obtém a fonte do cadastro expandindo credencial do ambiente, e sobrevive a câmera que cai ou trava.

Fora do escopo, por decisão registrada na spec: `/config/epis` (adiado, condicionado ao retreino do detector com classes `no_*`), versionamento otimista em edição concorrente, autenticação e papéis (E4).

Próximo: E3 (timeline com filtros, detalhe do incidente, reconhecimento, kiosk do operador).
