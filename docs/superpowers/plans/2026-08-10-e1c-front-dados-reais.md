# E1-C · cypher-front, do mock aos dados reais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir as constantes mockadas do dashboard por incidentes reais vindos da API, com push por SSE, estado de conexão visível e vídeo ao vivo.

**Architecture:** Um `IncidentService` baseado em signals concentra o estado: carrega o histórico por HTTP, abre o `EventSource` e faz *prepend* deduplicando por `incidentKey`. O `EventSource` é criado por uma fábrica injetável, o que torna o serviço testável sem depender de o ambiente de teste implementar a API. Componentes deixam de ter dados próprios e passam a ler `computed()` do serviço.

**Tech Stack:** Angular 21.2, TypeScript 5.9, signals, `provideHttpClient(withFetch())`, Vitest + jsdom (a serem ligados na Task 1).

**Spec:** `docs/superpowers/specs/2026-08-10-notificacao-de-incidentes-design.md` §6, §7, §8, §15 (apenas a restrição sobre credenciais).

**Depende de:** plano E1-A, Tasks 1–13 (a API precisa responder). O vídeo ao vivo da Task 8 depende do plano E1-B, Tasks 6–7.

## Global Constraints

- **Repositório:** `/home/asaas/projects/challenge/cypher-front`. Todos os caminhos são relativos a essa raiz.
- **Requisições com `withCredentials: true` desde já.** `EventSource` não aceita cabeçalho `Authorization`, então a autenticação de E4 será por cookie de sessão; conviver com dois mecanismos depois seria retrabalho (spec §15).
- **Standalone components e signals**, seguindo o padrão do código existente (`ConfigService`, `DashboardComponent`). Nenhum NgModule novo.
- **Estilos em SCSS**, `inlineStyleLanguage` já configurado. Não alterar `src/styles.scss` além do necessário para os estados novos.
- **Nada de dados fabricados.** Toda constante mockada que sobreviver a este plano precisa estar rotulada em tela como dado de exemplo.
- **Commits:** um por tarefa, em português, no formato do repo (`feat:`, `fix:`, `chore:`).
- **A API base em desenvolvimento é `http://localhost:8080/api/v1`.**

---

## Estrutura de arquivos

```
src/environments/
├── environment.ts                       CRIAR  produção
└── environment.development.ts           CRIAR  desenvolvimento

src/app/shared/
├── incident.models.ts                   CRIAR  tipos do contrato + helpers de severidade
├── incident.service.ts                  CRIAR  store de incidentes (HTTP + SSE)
├── incident.service.spec.ts             CRIAR
├── catalog.service.ts                   CRIAR  câmeras e estações
├── event-source.factory.ts              CRIAR  token injetável do EventSource
├── connection-badge/                     CRIAR  badge de estado da conexão
│   └── connection-badge.component.ts
└── live-feed/                            CRIAR  vídeo ao vivo
    └── live-feed.component.ts

src/app/dashboard/
├── dashboard.component.ts               MODIFICAR  remove KPI_DATA, ALERTS, BAR_DATA, HEAT_DATA
├── dashboard.component.html             MODIFICAR  badge, feed, dados reais
└── dashboard.component.spec.ts          CRIAR

src/app/heatmap/
├── heatmap.component.ts                 MODIFICAR  célula = estação
└── heatmap.component.html               MODIFICAR

src/app/app.config.ts                    MODIFICAR  provideHttpClient
angular.json                             MODIFICAR  builder de testes
package.json                             MODIFICAR  vitest, jsdom
```

**Por que essa divisão.** `incident.models.ts` não tem dependência de Angular — são tipos e funções puras, testáveis sem TestBed. `event-source.factory.ts` existe para que o serviço não construa um `EventSource` diretamente: sem essa costura, testar reconexão exigiria um ambiente de teste que implemente a API, o que nem todos implementam. `catalog.service.ts` é separado porque câmeras e estações mudam raramente e por motivos diferentes dos incidentes.

---

## Task 1: Ligar o runner de testes

**Files:**
- Modify: `package.json`
- Modify: `angular.json`
- Test: `src/app/shared/smoke.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `npm test` executável.

O projeto **não tem runner de testes**: `angular.json` não declara o alvo `test` e nem `vitest` nem `jsdom` estão instalados. O `tsconfig.spec.json` já declara `"types": ["vitest/globals"]` e os schematics estão com `skipTests: true` — o scaffold esperava Vitest, que nunca foi ligado. Sem esta tarefa, nenhuma das seguintes pode seguir TDD.

- [ ] **Step 1: Instalar as dependências de teste**

```bash
cd /home/asaas/projects/challenge/cypher-front
npm install --save-dev vitest jsdom
```

- [ ] **Step 2: Declarar o alvo de teste**

Em `angular.json`, dentro de `projects.cypher-front.architect`, acrescentar ao lado de `build` e `serve`:

```json
        "test": {
          "builder": "@angular/build:unit-test",
          "options": {
            "buildTarget": "cypher-front:build:development",
            "tsConfig": "tsconfig.spec.json",
            "runner": "vitest"
          }
        }
```

- [ ] **Step 3: Escrever o teste de fumaça**

Criar `src/app/shared/smoke.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';

describe('runner de testes', () => {
  it('executa', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: 1 teste passa. Se o runner reclamar de ambiente de DOM, acrescentar `"browsers": []` às opções do alvo `test` para forçar o ambiente Node com jsdom.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add package.json package-lock.json angular.json src/app/shared/smoke.spec.ts
git commit -m "chore(test): liga o runner de testes com vitest e jsdom"
```

---

## Task 2: Ambientes, cliente HTTP e tipos do contrato

**Files:**
- Create: `src/environments/environment.ts`
- Create: `src/environments/environment.development.ts`
- Modify: `angular.json`
- Modify: `src/app/app.config.ts`
- Create: `src/app/shared/incident.models.ts`
- Test: `src/app/shared/incident.models.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `environment: { production: boolean; apiUrl: string }`.
  - `IncidentType = 'FALL_RISK' | 'ERGONOMIC_RISK' | 'ZONE_VIOLATION' | 'EPI_VIOLATION'`.
  - `AlertaNivel`, `AlertaStatus`, `ClosedReason`, `Incident`, `Page<T>`, `Camera`, `Station`, `Summary`.
  - `severityClass(severity: number): 'ok' | 'low' | 'mid' | 'hi'`.
  - `incidentLabel(type: IncidentType): string`.
  - `formatTime(iso: string): string`.

Os tipos espelham `IncidentResponse` do plano E1-A. Onde o backend devolve `null`, o tipo é `| null` — o dashboard precisa distinguir "sem zona" de "zona desconhecida".

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/shared/incident.models.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { formatTime, incidentLabel, severityClass } from './incident.models';

describe('severityClass', () => {
  it('mapeia a severidade crua para a classe visual do heatmap', () => {
    expect(severityClass(0)).toBe('ok');
    expect(severityClass(1)).toBe('low');
    expect(severityClass(2)).toBe('mid');
    expect(severityClass(3)).toBe('hi');
    expect(severityClass(4)).toBe('hi');
  });
});

describe('incidentLabel', () => {
  it('descreve cada tipo em português', () => {
    expect(incidentLabel('FALL_RISK')).toBe('Queda / risco imediato');
    expect(incidentLabel('ERGONOMIC_RISK')).toBe('Postura inadequada');
    expect(incidentLabel('ZONE_VIOLATION')).toBe('Zona de risco');
    expect(incidentLabel('EPI_VIOLATION')).toBe('EPI ausente');
  });
});

describe('formatTime', () => {
  it('extrai hora e minuto de um instante com offset', () => {
    expect(formatTime('2026-08-10T14:31:02.482-03:00')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('preserva o horário local do evento, não o do navegador', () => {
    // O offset vem no próprio instante; 14:31 em -03:00 é o que aconteceu na planta.
    expect(formatTime('2026-08-10T14:31:02.482-03:00')).toBe('14:31');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — não consegue resolver `./incident.models`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/environments/environment.ts`:

```typescript
export const environment = {
  production: true,
  apiUrl: '/api/v1',
};
```

Criar `src/environments/environment.development.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080/api/v1',
};
```

Em `angular.json`, dentro de `projects.cypher-front.architect.build.configurations.development`, acrescentar a substituição de arquivo:

```json
            "fileReplacements": [
              {
                "replace": "src/environments/environment.ts",
                "with": "src/environments/environment.development.ts"
              }
            ],
```

Substituir `src/app/app.config.ts`:

```typescript
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
  ]
};
```

Criar `src/app/shared/incident.models.ts`:

```typescript
/**
 * Espelho do contrato da API (spec §3.1).
 *
 * Onde o backend devolve null, o tipo carrega `| null`: o painel precisa
 * distinguir "sem zona" de "zona desconhecida".
 */

export type IncidentType =
  | 'FALL_RISK'
  | 'ERGONOMIC_RISK'
  | 'ZONE_VIOLATION'
  | 'EPI_VIOLATION';

export type AlertaNivel = 'BAIXO' | 'MEDIO' | 'ALTO';
export type AlertaStatus = 'PENDENTE' | 'REVISADO' | 'RESOLVIDO';
export type ClosedReason =
  | 'STATE_EXIT'
  | 'ESCALATED'
  | 'TRACK_LOST'
  | 'PIPELINE_STOPPED';

export interface Incident {
  id: number;
  incidentKey: string;
  cameraId: string;
  runId: string;
  trackId: number;
  type: IncidentType;
  severity: number;
  nivel: AlertaNivel;
  descricao: string;
  reason: string;
  postureCategory: string;
  rebaScore: number;
  actionLevel: number;
  zoneName: string | null;
  zoneStatus: string;
  epiPresent: string[];
  epiMissing: string[];
  snapshotUrl: string | null;
  detectedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  peakSeverity: number | null;
  closedReason: ClosedReason | null;
  status: AlertaStatus;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface Camera {
  id: string;
  nome: string;
  estacaoId: string;
  streamUrl: string | null;
}

export interface Station {
  id: string;
  nome: string;
  setor: string | null;
  ativa: boolean;
  cameras: Camera[];
}

export interface StationCell {
  estacaoId: string;
  nome: string;
  setor: string | null;
  incidentes: number;
}

export interface DayCount {
  dia: string;
  incidentes: number;
}

export interface Summary {
  incidentesHoje: number;
  incidentesOntem: number;
  criticosHoje: number;
  pendentes: number;
  heatmap: StationCell[];
  ultimosSeteDias: DayCount[];
}

export type ConnectionState = 'conectando' | 'ao vivo' | 'offline';

/** Classe visual da célula do heatmap, a partir da severidade crua 0–4. */
export function severityClass(severity: number): 'ok' | 'low' | 'mid' | 'hi' {
  if (severity <= 0) return 'ok';
  if (severity === 1) return 'low';
  if (severity === 2) return 'mid';
  return 'hi';
}

export function incidentLabel(type: IncidentType): string {
  switch (type) {
    case 'FALL_RISK': return 'Queda / risco imediato';
    case 'ERGONOMIC_RISK': return 'Postura inadequada';
    case 'ZONE_VIOLATION': return 'Zona de risco';
    case 'EPI_VIOLATION': return 'EPI ausente';
  }
}

/**
 * Hora e minuto do instante, no fuso em que o evento aconteceu.
 *
 * O offset vem no próprio ISO, então a leitura é a da planta — não a do
 * navegador de quem está olhando o painel.
 */
export function formatTime(iso: string): string {
  const match = iso.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '--:--';
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 5 testes (4 novos + o de fumaça).

- [ ] **Step 5: Confirmar que a build ainda funciona**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm run build
```

Esperado: build de produção conclui sem erro.

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/environments/ src/app/app.config.ts src/app/shared/incident.models.ts \
        src/app/shared/incident.models.spec.ts angular.json
git commit -m "feat: ambientes, cliente HTTP e tipos do contrato de incidente"
```

---

## Task 3: Store de incidentes por HTTP

**Files:**
- Create: `src/app/shared/incident.service.ts`
- Create: `src/app/shared/incident.service.spec.ts`

**Interfaces:**
- Consumes: `Incident`, `Page` (Task 2).
- Produces:
  - `IncidentService.incidents: Signal<Incident[]>` — os 100 mais recentes, mais novo primeiro.
  - `IncidentService.loadHistory(): void`.
  - `IncidentService.acknowledge(id: number, status: AlertaStatus): void`.
  - `IncidentService.MAX_IN_MEMORY = 100`.

A deduplicação por `incidentKey` não é zelo: quando o SSE cai e reconecta, o serviço rebusca por `since=<último>` e recebe de novo o que já tem (spec §6.2, §6.3).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/shared/incident.service.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { Incident, Page } from './incident.models';
import { IncidentService } from './incident.service';

function incidente(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 1,
    incidentKey: 'CAM-01:run-a:track-7:20260810T173102482Z',
    cameraId: 'CAM-01',
    runId: 'run-a',
    trackId: 7,
    type: 'FALL_RISK',
    severity: 4,
    nivel: 'ALTO',
    descricao: 'Queda detectada',
    reason: 'fallen_sustained',
    postureCategory: 'immediate_risk',
    rebaScore: 11,
    actionLevel: 4,
    zoneName: null,
    zoneStatus: 'outside',
    epiPresent: ['HELMET'],
    epiMissing: [],
    snapshotUrl: null,
    detectedAt: '2026-08-10T14:31:02.482-03:00',
    endedAt: null,
    durationSeconds: null,
    peakSeverity: 4,
    closedReason: null,
    status: 'PENDENTE',
    ...overrides,
  };
}

function pagina(content: Incident[]): Page<Incident> {
  return { content, totalElements: content.length, totalPages: 1, number: 0, size: 50 };
}

describe('IncidentService', () => {
  let service: IncidentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(IncidentService);
    http = TestBed.inject(HttpTestingController);
  });

  it('começa vazio', () => {
    expect(service.incidents()).toEqual([]);
  });

  it('carrega o histórico da API', () => {
    service.loadHistory();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/incidents`);
    expect(req.request.method).toBe('GET');
    req.flush(pagina([incidente({ id: 1 }), incidente({ id: 2, incidentKey: 'k2' })]));

    expect(service.incidents().length).toBe(2);
  });

  it('envia credenciais, porque a autenticação será por cookie', () => {
    service.loadHistory();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/incidents`);
    expect(req.request.withCredentials).toBe(true);
    req.flush(pagina([]));
  });

  it('deduplica por incidentKey', () => {
    service.loadHistory();
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`)
        .flush(pagina([incidente({ id: 1, incidentKey: 'k1' })]));

    service.upsert(incidente({ id: 1, incidentKey: 'k1', status: 'REVISADO' }));

    expect(service.incidents().length).toBe(1);
    expect(service.incidents()[0].status).toBe('REVISADO');
  });

  it('coloca o mais recente no topo', () => {
    service.upsert(incidente({ id: 1, incidentKey: 'k1' }));
    service.upsert(incidente({ id: 2, incidentKey: 'k2' }));

    expect(service.incidents()[0].incidentKey).toBe('k2');
  });

  it('mantém no máximo 100 em memória', () => {
    for (let i = 0; i < 130; i++) {
      service.upsert(incidente({ id: i, incidentKey: `k${i}` }));
    }

    expect(service.incidents().length).toBe(IncidentService.MAX_IN_MEMORY);
    expect(service.incidents()[0].incidentKey).toBe('k129');
  });

  it('reconhece um incidente e atualiza a lista', () => {
    service.upsert(incidente({ id: 7, incidentKey: 'k7', status: 'PENDENTE' }));

    service.acknowledge(7, 'REVISADO');

    const req = http.expectOne(`${environment.apiUrl}/incidents/7/status`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'REVISADO' });
    req.flush(incidente({ id: 7, incidentKey: 'k7', status: 'REVISADO' }));

    expect(service.incidents()[0].status).toBe('REVISADO');
  });

  it('guarda o instante do mais recente para cobrir lacuna do SSE', () => {
    service.upsert(incidente({ incidentKey: 'k1', detectedAt: '2026-08-10T10:00:00-03:00' }));
    service.upsert(incidente({ incidentKey: 'k2', detectedAt: '2026-08-10T12:00:00-03:00' }));

    expect(service.lastSeenAt()).toBe('2026-08-10T12:00:00-03:00');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — não resolve `./incident.service`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/app/shared/incident.service.ts`:

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import { AlertaStatus, Incident, Page } from './incident.models';

/**
 * Store de incidentes.
 *
 * A deduplicação por incidentKey não é zelo: quando o SSE cai e reconecta, o
 * serviço rebusca por `since` e recebe de novo o que já tem.
 */
@Injectable({ providedIn: 'root' })
export class IncidentService {
  static readonly MAX_IN_MEMORY = 100;

  private http = inject(HttpClient);
  private readonly _incidents = signal<Incident[]>([]);

  readonly incidents = this._incidents.asReadonly();

  /** Instante do mais recente conhecido, usado para cobrir a lacuna do SSE. */
  readonly lastSeenAt = computed(() => this._incidents()[0]?.detectedAt ?? null);

  loadHistory(since?: string): void {
    const params: Record<string, string> = { size: String(IncidentService.MAX_IN_MEMORY) };
    if (since) {
      params['since'] = since;
    }

    this.http
      .get<Page<Incident>>(`${environment.apiUrl}/incidents`, {
        params,
        withCredentials: true,
      })
      .subscribe({
        next: page => page.content.forEach(incident => this.upsert(incident)),
        error: () => { /* o badge de conexão já comunica a falha */ },
      });
  }

  /** Insere ou atualiza, mantendo a lista ordenada e limitada. */
  upsert(incident: Incident): void {
    this._incidents.update(atual => {
      const semDuplicata = atual.filter(i => i.incidentKey !== incident.incidentKey);
      const lista = [incident, ...semDuplicata];
      lista.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
      return lista.slice(0, IncidentService.MAX_IN_MEMORY);
    });
  }

  acknowledge(id: number, status: AlertaStatus): void {
    this.http
      .put<Incident>(`${environment.apiUrl}/incidents/${id}/status`, { status },
        { withCredentials: true })
      .subscribe({
        next: atualizado => this.upsert(atualizado),
        error: () => { /* mantém o estado anterior; nada é inventado na tela */ },
      });
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 8 testes novos.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/incident.service.ts src/app/shared/incident.service.spec.ts
git commit -m "feat: store de incidentes com deduplicacao e limite em memoria"
```

---

## Task 4: Push por SSE e estado de conexão

**Files:**
- Create: `src/app/shared/event-source.factory.ts`
- Modify: `src/app/shared/incident.service.ts`
- Modify: `src/app/shared/incident.service.spec.ts`
- Create: `src/app/shared/connection-badge/connection-badge.component.ts`

**Interfaces:**
- Consumes: `IncidentService` (Task 3).
- Produces:
  - `EVENT_SOURCE_FACTORY` — `InjectionToken<(url: string) => EventSourceLike>`.
  - `EventSourceLike` — `{ addEventListener, close, onerror, onopen }`.
  - `IncidentService.connection: Signal<ConnectionState>`.
  - `IncidentService.connect(): void`, `.disconnect(): void`.
  - `ConnectionBadgeComponent` — seletor `app-connection-badge`.

Num painel de segurança, silêncio não pode parecer calmaria: com o SSE caído, a tela fica indistinguível de "nenhum incidente hoje" — a falha mais perigosa possível neste dashboard (spec §6.3). O badge é a correção mais barata que existe.

O `EventSource` vem de uma fábrica injetável porque nem todo ambiente de teste implementa a API — e porque testar reconexão exige controlá-lo.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/shared/event-source.factory.ts` primeiro, já que o teste precisa do token:

```typescript
import { InjectionToken } from '@angular/core';

/** Subconjunto de EventSource que o serviço realmente usa. */
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
}

/**
 * Fábrica do EventSource.
 *
 * Injetável para que o serviço seja testável sem depender de o ambiente de
 * teste implementar a API — e para que a reconexão possa ser exercitada.
 */
export const EVENT_SOURCE_FACTORY = new InjectionToken<(url: string) => EventSourceLike>(
  'EVENT_SOURCE_FACTORY',
  {
    providedIn: 'root',
    // withCredentials: a autenticação de E4 será por cookie de sessão, porque
    // EventSource não aceita cabeçalho Authorization (spec §15).
    factory: () => (url: string) =>
      new EventSource(url, { withCredentials: true }) as unknown as EventSourceLike,
  },
);
```

Acrescentar a `src/app/shared/incident.service.spec.ts`:

```typescript
import { EVENT_SOURCE_FACTORY, EventSourceLike } from './event-source.factory';

class EventSourceFake implements EventSourceLike {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  fechado = false;
  private listeners = new Map<string, (event: MessageEvent) => void>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.fechado = true;
  }

  emitir(type: string, data: unknown): void {
    this.emitirBruto(type, JSON.stringify(data));
  }

  /** Entrega o corpo cru, para exercitar payload malformado. */
  emitirBruto(type: string, raw: string): void {
    this.listeners.get(type)?.({ data: raw } as MessageEvent);
  }

  abrir(): void {
    this.onopen?.(new Event('open'));
  }

  falhar(): void {
    this.onerror?.(new Event('error'));
  }
}

describe('IncidentService — SSE', () => {
  let service: IncidentService;
  let http: HttpTestingController;
  let criados: EventSourceFake[];

  beforeEach(() => {
    criados = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        {
          provide: EVENT_SOURCE_FACTORY,
          useValue: (url: string) => {
            const fake = new EventSourceFake(url);
            criados.push(fake);
            return fake;
          },
        },
      ],
    });
    service = TestBed.inject(IncidentService);
    http = TestBed.inject(HttpTestingController);
  });

  it('começa desconectado', () => {
    expect(service.connection()).toBe('offline');
  });

  it('conecta no endpoint de stream', () => {
    service.connect();

    expect(criados[0].url).toBe(`${environment.apiUrl}/incidents/stream`);
    expect(service.connection()).toBe('conectando');
  });

  it('marca ao vivo quando a conexão abre', () => {
    service.connect();
    criados[0].abrir();

    expect(service.connection()).toBe('ao vivo');
  });

  it('insere o incidente recebido no store', () => {
    service.connect();
    criados[0].abrir();

    criados[0].emitir('incident', incidente({ id: 9, incidentKey: 'k9' }));

    expect(service.incidents()[0].incidentKey).toBe('k9');
  });

  it('atualiza o incidente quando ele muda', () => {
    service.connect();
    criados[0].abrir();
    criados[0].emitir('incident', incidente({ id: 9, incidentKey: 'k9', status: 'PENDENTE' }));

    criados[0].emitir('incident-changed',
      incidente({ id: 9, incidentKey: 'k9', status: 'RESOLVIDO' }));

    expect(service.incidents().length).toBe(1);
    expect(service.incidents()[0].status).toBe('RESOLVIDO');
  });

  it('marca offline quando a conexão cai', () => {
    service.connect();
    criados[0].abrir();

    criados[0].falhar();

    expect(service.connection()).toBe('offline');
  });

  it('cobre a lacuna rebuscando por since ao reconectar', () => {
    service.connect();
    criados[0].abrir();
    criados[0].emitir('incident',
      incidente({ incidentKey: 'k1', detectedAt: '2026-08-10T12:00:00-03:00' }));
    criados[0].falhar();

    criados[0].abrir();

    const req = http.expectOne(r =>
      r.url === `${environment.apiUrl}/incidents` &&
      r.params.get('since') === '2026-08-10T12:00:00-03:00');
    req.flush(pagina([]));
  });

  it('fecha a conexão ao desconectar', () => {
    service.connect();

    service.disconnect();

    expect(criados[0].fechado).toBe(true);
    expect(service.connection()).toBe('offline');
  });

  it('ignora payload malformado sem derrubar o store', () => {
    service.connect();
    criados[0].abrir();
    criados[0].emitir('incident', incidente({ incidentKey: 'k-bom' }));

    expect(() => criados[0].emitirBruto('incident', '{isso nao e json')).not.toThrow();

    // O incidente válido continua lá; o lixo não entrou.
    expect(service.incidents().length).toBe(1);
    expect(service.incidents()[0].incidentKey).toBe('k-bom');
    expect(service.connection()).toBe('ao vivo');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — `service.connect is not a function`.

- [ ] **Step 3: Implementar o mínimo**

Acrescentar a `src/app/shared/incident.service.ts` os imports e os membros novos:

```typescript
import { ConnectionState } from './incident.models';
import { EVENT_SOURCE_FACTORY, EventSourceLike } from './event-source.factory';
```

Dentro da classe:

```typescript
  private eventSourceFactory = inject(EVENT_SOURCE_FACTORY);
  private stream: EventSourceLike | null = null;
  private readonly _connection = signal<ConnectionState>('offline');

  /**
   * Estado da conexão, renderizado como badge.
   *
   * Num painel de segurança, silêncio não pode parecer calmaria: com o SSE
   * caído a tela fica idêntica a "nenhum incidente hoje".
   */
  readonly connection = this._connection.asReadonly();

  connect(): void {
    if (this.stream) {
      return;
    }
    this._connection.set('conectando');
    const stream = this.eventSourceFactory(`${environment.apiUrl}/incidents/stream`);

    stream.onopen = () => {
      const jaEstavaConectado = this._connection() === 'offline';
      this._connection.set('ao vivo');
      if (jaEstavaConectado) {
        // Reconexão: cobre o que aconteceu enquanto a conexão esteve fora.
        this.loadHistory(this.lastSeenAt() ?? undefined);
      }
    };
    stream.onerror = () => this._connection.set('offline');

    stream.addEventListener('incident', event => this.receber(event));
    stream.addEventListener('incident-changed', event => this.receber(event));

    this.stream = stream;
  }

  disconnect(): void {
    this.stream?.close();
    this.stream = null;
    this._connection.set('offline');
  }

  private receber(event: MessageEvent): void {
    try {
      this.upsert(JSON.parse(event.data) as Incident);
    } catch {
      // Payload malformado não pode derrubar o painel.
    }
  }
```

Criar `src/app/shared/connection-badge/connection-badge.component.ts`:

```typescript
import { Component, inject } from '@angular/core';
import { IncidentService } from '../incident.service';

@Component({
  selector: 'app-connection-badge',
  template: `
    <span class="conn" [class.live]="estado() === 'ao vivo'"
          [class.off]="estado() === 'offline'">
      <i class="dot"></i>{{ estado() }}
    </span>
  `,
  styles: [`
    .conn { display: inline-flex; align-items: center; gap: 6px;
            font-size: 12px; text-transform: lowercase; opacity: .8; }
    .dot  { width: 7px; height: 7px; border-radius: 50%; background: #FFCE38; }
    .live .dot, .conn.live .dot { background: #34D07E; }
    .off  .dot, .conn.off  .dot { background: #EE4242; }
  `],
})
export class ConnectionBadgeComponent {
  private service = inject(IncidentService);
  estado = this.service.connection;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 9 testes novos.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/event-source.factory.ts src/app/shared/incident.service.ts \
        src/app/shared/incident.service.spec.ts \
        src/app/shared/connection-badge/connection-badge.component.ts
git commit -m "feat: push por SSE com estado de conexao visivel e cobertura de lacuna"
```

---

## Task 5: Catálogo e agregados

**Files:**
- Create: `src/app/shared/catalog.service.ts`
- Create: `src/app/shared/catalog.service.spec.ts`
- Modify: `src/app/shared/incident.service.ts`
- Modify: `src/app/shared/incident.service.spec.ts`

**Interfaces:**
- Consumes: `Camera`, `Station`, `Summary` (Task 2); `IncidentService` (Task 4).
- Produces:
  - `CatalogService.cameras: Signal<Camera[]>`, `.stations: Signal<Station[]>`, `.load(): void`.
  - `IncidentService.summary: Signal<Summary | null>`, `.loadSummary(): void`.

`/summary` é buscado na inicialização e refeito quando chega um incidente pelo SSE, com debounce de 2 s para não disparar uma rajada de requisições durante um episódio ativo (spec §6.2).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/shared/catalog.service.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
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
```

Acrescentar a `src/app/shared/incident.service.spec.ts`, dentro do primeiro `describe`:

```typescript
  it('carrega os agregados do dashboard', () => {
    service.loadSummary();

    const req = http.expectOne(`${environment.apiUrl}/summary`);
    req.flush({
      incidentesHoje: 3, incidentesOntem: 1, criticosHoje: 2, pendentes: 4,
      heatmap: [{ estacaoId: 'EST-01', nome: 'Esteira', setor: 'montagem', incidentes: 2 }],
      ultimosSeteDias: [{ dia: '2026-08-10', incidentes: 3 }],
    });

    expect(service.summary()?.incidentesHoje).toBe(3);
    expect(service.summary()?.heatmap[0].estacaoId).toBe('EST-01');
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — não resolve `./catalog.service`, e `service.loadSummary` não existe.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/app/shared/catalog.service.ts`:

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import { Camera, Station } from './incident.models';

/**
 * Câmeras e estações.
 *
 * Separado do store de incidentes porque muda raramente e por motivos
 * diferentes: o catálogo é configuração, o incidente é evento.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private http = inject(HttpClient);

  private readonly _cameras = signal<Camera[]>([]);
  private readonly _stations = signal<Station[]>([]);

  readonly cameras = this._cameras.asReadonly();
  readonly stations = this._stations.asReadonly();

  load(): void {
    this.http.get<Camera[]>(`${environment.apiUrl}/cameras`, { withCredentials: true })
      .subscribe({ next: c => this._cameras.set(c), error: () => { } });

    this.http.get<Station[]>(`${environment.apiUrl}/stations`, { withCredentials: true })
      .subscribe({ next: s => this._stations.set(s), error: () => { } });
  }

  /** Estação que uma câmera cobre, ou null se a câmera não estiver cadastrada. */
  stationOfCamera(cameraId: string): Station | null {
    const camera = this._cameras().find(c => c.id === cameraId);
    if (!camera) {
      return null;
    }
    return this._stations().find(s => s.id === camera.estacaoId) ?? null;
  }
}
```

Acrescentar a `src/app/shared/incident.service.ts`:

```typescript
import { Summary } from './incident.models';
```

e, dentro da classe:

```typescript
  private readonly _summary = signal<Summary | null>(null);
  private summaryTimer: ReturnType<typeof setTimeout> | null = null;

  readonly summary = this._summary.asReadonly();

  loadSummary(): void {
    this.http.get<Summary>(`${environment.apiUrl}/summary`, { withCredentials: true })
      .subscribe({ next: s => this._summary.set(s), error: () => { } });
  }

  /**
   * Reagenda o recálculo dos agregados.
   *
   * Debounce de 2 s: durante um episódio ativo chegam vários eventos em
   * sequência, e uma requisição por evento viraria rajada.
   */
  private scheduleSummaryRefresh(): void {
    if (this.summaryTimer !== null) {
      clearTimeout(this.summaryTimer);
    }
    this.summaryTimer = setTimeout(() => {
      this.summaryTimer = null;
      this.loadSummary();
    }, 2000);
  }
```

e, em `receber`, após o `upsert` bem-sucedido:

```typescript
  private receber(event: MessageEvent): void {
    try {
      this.upsert(JSON.parse(event.data) as Incident);
      this.scheduleSummaryRefresh();
    } catch {
      // Payload malformado não pode derrubar o painel.
    }
  }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 4 testes novos.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/catalog.service.ts src/app/shared/catalog.service.spec.ts \
        src/app/shared/incident.service.ts src/app/shared/incident.service.spec.ts
git commit -m "feat: catalogo de cameras e estacoes e agregados do dashboard"
```

---

## Task 6: Vídeo ao vivo

**Files:**
- Create: `src/app/shared/live-feed/live-feed.component.ts`
- Create: `src/app/shared/live-feed/live-feed.component.spec.ts`

**Interfaces:**
- Consumes: `Camera` (Task 2), `CatalogService` (Task 5).
- Produces: `LiveFeedComponent` — seletor `app-live-feed`, input `camera: Camera | null`.

O protocolo MJPEG dispensa qualquer biblioteca de player: um `<img [src]>` basta. O tratamento de `(error)` existe porque a câmera pode estar fora do ar e a tela precisa dizer isso, não mostrar um quadrado quebrado.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/shared/live-feed/live-feed.component.spec.ts`:

```typescript
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Camera } from '../incident.models';
import { LiveFeedComponent } from './live-feed.component';

const CAMERA: Camera = {
  id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01',
  streamUrl: 'http://127.0.0.1:8090/stream',
};

describe('LiveFeedComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  function montar(camera: Camera | null) {
    const fixture = TestBed.createComponent(LiveFeedComponent);
    fixture.componentRef.setInput('camera', camera);
    fixture.detectChanges();
    return fixture;
  }

  it('aponta a imagem para o stream da câmera', () => {
    const fixture = montar(CAMERA);

    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.getAttribute('src')).toBe('http://127.0.0.1:8090/stream');
  });

  it('sem câmera, mostra o estado indisponível em vez de imagem quebrada', () => {
    const fixture = montar(null);

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('indisponível');
  });

  it('câmera sem streamUrl também cai no estado indisponível', () => {
    const fixture = montar({ ...CAMERA, streamUrl: null });

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('indisponível');
  });

  it('erro de carregamento troca para o estado indisponível', () => {
    const fixture = montar(CAMERA);
    const componente = fixture.componentInstance;

    componente.onError();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('indisponível');
  });

  it('trocar de câmera limpa o erro anterior', () => {
    const fixture = montar(CAMERA);
    fixture.componentInstance.onError();
    fixture.detectChanges();

    fixture.componentRef.setInput('camera', { ...CAMERA, id: 'CAM-02' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — não resolve `./live-feed.component`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/app/shared/live-feed/live-feed.component.ts`:

```typescript
import { Component, computed, effect, input, signal } from '@angular/core';

import { Camera } from '../incident.models';

/**
 * Vídeo ao vivo por MJPEG.
 *
 * O stream vem direto do pipeline Python, sem passar pelo backend: o caminho
 * do vídeo é independente do caminho do incidente.
 */
@Component({
  selector: 'app-live-feed',
  template: `
    @if (mostrarImagem()) {
      <img [src]="camera()!.streamUrl" [alt]="'Câmera ' + camera()!.nome"
           (error)="onError()" />
    } @else {
      <div class="offline">
        <span class="ico">⛶</span>
        <span>câmera indisponível</span>
      </div>
    }
  `,
  styles: [`
    :host { display: block; position: relative; }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .offline { display: flex; flex-direction: column; align-items: center;
               justify-content: center; gap: 8px; height: 100%; min-height: 180px;
               opacity: .55; font-size: 13px; }
    .ico { font-size: 26px; }
  `],
})
export class LiveFeedComponent {
  readonly camera = input<Camera | null>(null);

  private readonly falhou = signal(false);

  readonly mostrarImagem = computed(() =>
    !this.falhou() && !!this.camera()?.streamUrl);

  constructor() {
    // Trocar de câmera é uma tentativa nova: o erro da anterior não vale.
    effect(() => {
      this.camera();
      this.falhou.set(false);
    });
  }

  onError(): void {
    this.falhou.set(true);
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 5 testes novos.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/live-feed/
git commit -m "feat: componente de video ao vivo por MJPEG com estado indisponivel"
```

---

## Task 7: Dashboard sem dados fabricados

**Files:**
- Modify: `src/app/dashboard/dashboard.component.ts`
- Modify: `src/app/dashboard/dashboard.component.html`
- Create: `src/app/dashboard/dashboard.component.spec.ts`

**Interfaces:**
- Consumes: `IncidentService` (Tasks 3–5), `CatalogService` (Task 5), `ConnectionBadgeComponent` (Task 4), `LiveFeedComponent` (Task 6).
- Produces: `DashboardComponent` sem nenhuma constante de dados.

Hoje `KPI_DATA`, `ALERTS`, `BAR_DATA` e `HEAT_DATA` são constantes exportadas do componente. Todas saem.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/dashboard/dashboard.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { EVENT_SOURCE_FACTORY, EventSourceLike } from '../shared/event-source.factory';
import { IncidentService } from '../shared/incident.service';
import { DashboardComponent } from './dashboard.component';

const SSE_INERTE: EventSourceLike = {
  addEventListener: () => { },
  close: () => { },
  onopen: null,
  onerror: null,
};

describe('DashboardComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: EVENT_SOURCE_FACTORY, useValue: () => SSE_INERTE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('não exporta mais constantes de dados fabricados', async () => {
    const modulo: Record<string, unknown> = await import('./dashboard.component');

    expect(modulo['KPI_DATA']).toBeUndefined();
    expect(modulo['ALERTS']).toBeUndefined();
    expect(modulo['BAR_DATA']).toBeUndefined();
    expect(modulo['HEAT_DATA']).toBeUndefined();
  });

  it('mostra os KPIs vindos do endpoint de agregados', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 6, incidentesOntem: 4, criticosHoje: 2, pendentes: 5,
      heatmap: [], ultimosSeteDias: [],
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.incidentesHoje()).toBe(6);
    expect(fixture.componentInstance.variacaoVsOntem()).toBe('↑ 2 vs ontem');
  });

  it('lista os incidentes recentes do store', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const service = TestBed.inject(IncidentService);
    fixture.detectChanges();

    service.upsert({
      id: 1, incidentKey: 'k1', cameraId: 'CAM-01', runId: 'r', trackId: 1,
      type: 'FALL_RISK', severity: 4, nivel: 'ALTO', descricao: 'Queda',
      reason: 'fallen_sustained', postureCategory: 'immediate_risk',
      rebaScore: 11, actionLevel: 4, zoneName: null, zoneStatus: 'outside',
      epiPresent: [], epiMissing: [], snapshotUrl: null,
      detectedAt: '2026-08-10T14:31:00-03:00', endedAt: null,
      durationSeconds: null, peakSeverity: 4, closedReason: null, status: 'PENDENTE',
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.recentes().length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('14:31');
  });

  it('sem dados, mostra zero em vez de número inventado', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.incidentesHoje()).toBe(0);
    expect(fixture.componentInstance.recentes()).toEqual([]);
  });

  it('renderiza o badge de conexão', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-connection-badge')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — `KPI_DATA` ainda é exportado e `incidentesHoje` não existe.

- [ ] **Step 3: Implementar o mínimo**

Substituir `src/app/dashboard/dashboard.component.ts`:

```typescript
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CatalogService } from '../shared/catalog.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { ConnectionBadgeComponent } from '../shared/connection-badge/connection-badge.component';
import { DockComponent } from '../shared/dock/dock.component';
import { IncidentService } from '../shared/incident.service';
import { LiveFeedComponent } from '../shared/live-feed/live-feed.component';
import { formatTime, incidentLabel, severityClass } from '../shared/incident.models';

@Component({
  selector: 'app-dashboard',
  imports: [
    ChromeTopbarComponent, DockComponent, RouterLink,
    ConnectionBadgeComponent, LiveFeedComponent,
  ],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private cfgService = inject(ConfigService);
  private incidentService = inject(IncidentService);
  private catalogService = inject(CatalogService);

  cfg = this.cfgService.config;

  readonly conexao = this.incidentService.connection;
  readonly cameras = this.catalogService.cameras;

  /** Câmera exibida no feed. Sem seleção explícita, a primeira do catálogo. */
  readonly cameraAtual = computed(() => this.cameras()[0] ?? null);

  readonly resumo = this.incidentService.summary;

  readonly incidentesHoje = computed(() => this.resumo()?.incidentesHoje ?? 0);
  readonly criticosHoje = computed(() => this.resumo()?.criticosHoje ?? 0);
  readonly pendentes = computed(() => this.resumo()?.pendentes ?? 0);

  readonly variacaoVsOntem = computed(() => {
    const resumo = this.resumo();
    if (!resumo) {
      return 'sem dados';
    }
    const delta = resumo.incidentesHoje - resumo.incidentesOntem;
    if (delta === 0) {
      return 'igual a ontem';
    }
    return `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)} vs ontem`;
  });

  readonly heatData = computed(() => this.resumo()?.heatmap ?? []);
  readonly barData = computed(() => this.resumo()?.ultimosSeteDias ?? []);

  readonly maxV = computed(() =>
    Math.max(1, ...this.barData().map(d => d.incidentes)));

  /** Os cinco mais recentes, para a lista lateral. */
  readonly recentes = computed(() => this.incidentService.incidents().slice(0, 5));

  today = computed(() => {
    const now = new Date();
    return now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  });

  plantName = computed(() => this.cfg()?.company || 'sua planta');

  ngOnInit(): void {
    this.catalogService.load();
    this.incidentService.loadHistory();
    this.incidentService.loadSummary();
    this.incidentService.connect();
  }

  ngOnDestroy(): void {
    this.incidentService.disconnect();
  }

  // Helpers de apresentação, reexportados para o template.
  hora = formatTime;
  rotulo = incidentLabel;

  heatClass(incidentes: number): string {
    return severityClass(Math.min(incidentes, 4));
  }

  heatLabel(incidentes: number): string {
    return incidentes === 0 ? 'ok' : `${incidentes} inf`;
  }

  barPct(v: number): number {
    return (v / this.maxV()) * 100;
  }

  meanPct(): number {
    const dados = this.barData();
    if (!dados.length) {
      return 0;
    }
    const soma = dados.reduce((a, b) => a + b.incidentes, 0);
    return (soma / dados.length / this.maxV()) * 100;
  }

  kpiRingDash(r: number): number {
    return 2 * Math.PI * r;
  }

  kpiRingOffset(r: number, pct: number): number {
    return 2 * Math.PI * r * (1 - pct / 100);
  }

  diaCurto(iso: string): string {
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return dias[new Date(`${iso}T12:00:00`).getDay()];
  }
}
```

Em `src/app/dashboard/dashboard.component.html`, aplicar quatro mudanças. Os seletores exatos dependem do markup atual, então o critério é: **nenhuma referência a `kpiData`, `alerts`, `heatData` como array literal deve sobrar**.

1. No cabeçalho, ao lado do título, acrescentar o badge:

```html
<app-connection-badge />
```

2. Onde hoje há o laço sobre `kpiData`, trocar por quatro blocos explícitos usando os signals — por exemplo, o primeiro cartão:

```html
<div class="kpi">
  <span class="kpi-label">Incidentes hoje</span>
  <span class="kpi-val">{{ incidentesHoje() }}</span>
  <span class="kpi-sub">{{ variacaoVsOntem() }}</span>
</div>
```

3. Onde hoje há o laço sobre `alerts`, usar `recentes()`:

```html
@for (inc of recentes(); track inc.incidentKey) {
  <div class="alert-row" [class.crit]="inc.severity >= 3">
    <span class="time">{{ hora(inc.detectedAt) }}</span>
    <span class="est">{{ inc.cameraId }}</span>
    <span class="type">{{ rotulo(inc.type) }}</span>
  </div>
} @empty {
  <div class="vazio">nenhum incidente no período</div>
}
```

4. Acrescentar o feed ao vivo num cartão próprio:

```html
<div class="card feed">
  <app-live-feed [camera]="cameraAtual()" />
</div>
```

E o heatmap compacto passa a iterar `heatData()`, usando `cell.incidentes` e `cell.nome`.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 5 testes novos.

- [ ] **Step 5: Confirmar que a build ainda funciona**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm run build
```

Esperado: build conclui sem erro de template.

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/dashboard/
git commit -m "feat: dashboard alimentado por incidentes reais em vez de constantes"
```

---

## Task 8: Heatmap por estação

**Files:**
- Modify: `src/app/heatmap/heatmap.component.ts`
- Modify: `src/app/heatmap/heatmap.component.html`
- Create: `src/app/heatmap/heatmap.component.spec.ts`

**Interfaces:**
- Consumes: `IncidentService.summary` (Task 5), `CatalogService` (Task 5).
- Produces: `HeatmapComponent` com `celulas: Signal<StationCell[]>`.

A célula do heatmap é a **estação**, agregando os incidentes de todas as câmeras que a cobrem (spec §6.5). As estações `EST-01`…`EST-17` do mock não eram ficção do dashboard — eram uma entidade desenhada e nunca modelada.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/heatmap/heatmap.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { EVENT_SOURCE_FACTORY, EventSourceLike } from '../shared/event-source.factory';
import { HeatmapComponent } from './heatmap.component';

const SSE_INERTE: EventSourceLike = {
  addEventListener: () => { }, close: () => { }, onopen: null, onerror: null,
};

describe('HeatmapComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: EVENT_SOURCE_FACTORY, useValue: () => SSE_INERTE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function montarCom(heatmap: unknown[]) {
    const fixture = TestBed.createComponent(HeatmapComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap, ultimosSeteDias: [],
    });
    fixture.detectChanges();
    return fixture;
  }

  it('a célula é a estação, com o nome amigável', () => {
    const fixture = montarCom([
      { estacaoId: 'EST-01', nome: 'Esteira de montagem', setor: 'montagem', incidentes: 2 },
    ]);

    expect(fixture.componentInstance.celulas()[0].nome).toBe('Esteira de montagem');
    expect(fixture.nativeElement.textContent).toContain('Esteira de montagem');
  });

  it('estação sem incidente aparece zerada, não some', () => {
    const fixture = montarCom([
      { estacaoId: 'EST-01', nome: 'Esteira', setor: 'montagem', incidentes: 0 },
      { estacaoId: 'EST-02', nome: 'Prensa', setor: 'estamparia', incidentes: 3 },
    ]);

    expect(fixture.componentInstance.celulas().length).toBe(2);
  });

  it('sem estação cadastrada, diz que não há dados em vez de inventar células', () => {
    const fixture = montarCom([]);

    expect(fixture.componentInstance.celulas()).toEqual([]);
    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('nenhuma esta');
  });

  it('classifica a intensidade pela contagem', () => {
    const fixture = montarCom([]);
    const componente = fixture.componentInstance;

    expect(componente.classeDe(0)).toBe('ok');
    expect(componente.classeDe(1)).toBe('low');
    expect(componente.classeDe(2)).toBe('mid');
    expect(componente.classeDe(7)).toBe('hi');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — `celulas` não existe no componente.

- [ ] **Step 3: Implementar o mínimo**

Em `src/app/heatmap/heatmap.component.ts`, remover quaisquer constantes de dados e acrescentar:

```typescript
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';

import { CatalogService } from '../shared/catalog.service';
import { IncidentService } from '../shared/incident.service';
import { severityClass } from '../shared/incident.models';
```

e, dentro da classe:

```typescript
  private incidentService = inject(IncidentService);
  private catalogService = inject(CatalogService);

  /**
   * A célula do heatmap é a estação: ela agrega os incidentes de todas as
   * câmeras que a cobrem (spec §6.5).
   */
  readonly celulas = computed(() => this.incidentService.summary()?.heatmap ?? []);

  ngOnInit(): void {
    this.catalogService.load();
    this.incidentService.loadSummary();
    this.incidentService.connect();
  }

  ngOnDestroy(): void {
    this.incidentService.disconnect();
  }

  classeDe(incidentes: number): string {
    return severityClass(Math.min(incidentes, 4));
  }
```

A classe passa a declarar `implements OnInit, OnDestroy`.

Em `src/app/heatmap/heatmap.component.html`, o laço sobre a grade passa a ser:

```html
@for (cell of celulas(); track cell.estacaoId) {
  <div class="cell" [class]="classeDe(cell.incidentes)"
       [title]="cell.nome + ' · ' + (cell.setor || 'sem setor')">
    <span class="cell-id">{{ cell.estacaoId }}</span>
    <span class="cell-nome">{{ cell.nome }}</span>
    <span class="cell-n">{{ cell.incidentes }}</span>
  </div>
} @empty {
  <div class="vazio">nenhuma estação cadastrada</div>
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 4 testes novos.

- [ ] **Step 5: Rodar a suíte inteira e confirmar a build**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false && npm run build
```

Esperado: todos os testes passam e a build conclui.

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/heatmap/
git commit -m "feat: heatmap com a estacao como celula, alimentado pelos agregados"
```

---

## Task 9: Verificação de ponta a ponta

**Files:** nenhuma alteração de código. Esta tarefa é verificação.

**Interfaces:**
- Consumes: planos E1-A (Tasks 1–13) e E1-B (Tasks 1–8) concluídos.
- Produces: confirmação de que a funcionalidade vital funciona ponta a ponta.

- [ ] **Step 1: Subir os três lados**

Terminal 1:

```bash
cd /home/asaas/projects/cypher && ./mvnw -o spring-boot:run
```

Terminal 2:

```bash
cd /home/asaas/projects/challenge/cypher-front && npm start
```

Terminal 3:

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python src/run_pipeline.py \
  --source data/validation/cenario2.mp4 --device cuda --no-display \
  --camera-id CAM-02 --api-url http://localhost:8080/api/v1 --stream-port 8091
```

- [ ] **Step 2: Confirmar o caminho do incidente**

Abrir `http://localhost:4200/dashboard` **antes** de o pipeline terminar e confirmar, em ordem:

1. O badge de conexão mostra **ao vivo**.
2. Um card de incidente aparece na lista de recentes **sem refresh**, enquanto o vídeo roda.
3. O KPI "Incidentes hoje" incrementa em até ~2 s depois (o debounce dos agregados).
4. O heatmap mostra a estação `EST-02` com a contagem, e as demais estações com zero.

- [ ] **Step 3: Confirmar o caminho do vídeo**

Confirmar que o cartão de feed mostra o esqueleto anotado em movimento, vindo de `http://127.0.0.1:8091/stream`. Encerrar o pipeline e confirmar que o cartão troca para "câmera indisponível" em vez de ficar com quadro congelado ou imagem quebrada.

- [ ] **Step 4: Confirmar o comportamento de queda da conexão**

Com o dashboard aberto, derrubar a API (Ctrl-C no terminal 1). Confirmar que:

1. O badge muda para **offline** — a tela não fica parecendo "nenhum incidente hoje".
2. Subir a API de novo faz o badge voltar a **ao vivo**.
3. Rodar o pipeline durante a queda e confirmar que, ao voltar, os incidentes do intervalo aparecem no painel — é a rebusca por `since` cobrindo a lacuna, alimentada pelo spill do lado do capture.

- [ ] **Step 5: Registrar o resultado**

Escrever `docs/e1c-verificacao.md` com o que foi observado — números reais, incluindo qualquer divergência. Se algo não funcionou, o documento registra isso; ele não é um certificado.

```bash
cd /home/asaas/projects/challenge/cypher-front
git add docs/e1c-verificacao.md
git commit -m "docs: resultado da verificacao ponta a ponta de E1"
```

---

## Estado ao fim deste plano

E1 está completa: o pipeline detecta, a API persiste e distribui, o dashboard mostra ao vivo, e o webhook entrega a assinantes externos.

O que continua mockado e **precisa estar rotulado em tela como dado de exemplo**, se sobreviver: qualquer painel do onboarding que ainda use `OPTIONS` e `ROLE_PRESETS` fixos — esses são catálogo de EPIs, não dados operacionais, e viram cadastro real em E2.

Próximo: E2 (cadastro de estações e câmeras, hardening de RTSP).
