# E3-B — Front: Operação (timeline, detalhe, feeds, kiosk) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir as quatro telas de operação do Cypher em `cypher-front`: timeline de incidentes com filtros (`/incidentes`), detalhe do incidente (`/incidentes/:id`), grade de feeds ao vivo por estação (`/estacoes`) e o kiosk do operador (`/estacao/:id`).

**Architecture:** Duas adições em `IncidentService` (`getById`, `search`) sobre a infraestrutura de dados já existente (`CatalogService`, `LiveFeedComponent`, `ConfigService`, `acknowledge`). Quatro componentes de página novos, um por rota, seguindo o padrão já estabelecido por `DashboardComponent`/`HeatmapComponent` (import de `ChromeTopbarComponent` + `DockComponent`, `templateUrl` separado, CSS no `src/styles.scss` global — não scoped por componente). O kiosk é a exceção: não inclui `DockComponent`, porque é a única tela sem navegação (abre numa estação e permanece nela).

**Tech Stack:** Angular 21 standalone components + signals, Vitest + `TestBed` + `HttpTestingController` para testes, `RouterTestingHarness` (`@angular/router/testing`) para componentes com parâmetro de rota, `provideZonelessChangeDetection()`.

**Spec:** `docs/superpowers/specs/2026-08-23-operacao-e3-design.md` (mesmo repo), §2–§8.

**Repositório:** `/home/asaas/projects/challenge/cypher-front`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-front`. Branch: `e3b-front-operacao`, criada a partir de `dev` — **não** usar worktree, apenas `git checkout -b`.
- Todo CSS novo vai em `src/styles.scss` (o design system global do app), nunca em folhas de estilo por componente — nenhum componente existente em `dashboard/`, `heatmap/` ou `config/` usa `styleUrl`, e a nota de design do spec (§0) exige reaproveitar os primitivos (`.field`, `.input`, `.select`, `.btn`, `.panel`, `.alert-row`, `.chip`) em vez de inventar CSS solto.
- O kiosk (`/estacao/:id`) **não** inclui `<app-dock>` — é a única tela sem navegação (mapa de telas do doc de E1, §14.1).
- `IncidentService.acknowledge` já existe e não muda de assinatura; nenhuma tela faz atualização otimista de status — todas leem o resultado real via o store global (`incidents()`), nunca inventam estado em tela.
- Toda `Run:` de teste usa `npx ng test --no-watch` (suíte inteira) a partir de `/home/asaas/projects/challenge/cypher-front` — o builder deste projeto não expõe um filtro de arquivo único confiável, então cada passo de verificação roda a suíte completa.
- Nenhuma task altera `CatalogService`, `LiveFeedComponent`, `ConfigService` ou `Station`/`Camera`/`Incident` além do que está explicitado nela.

---

### Task 1: `IncidentService.getById` e `search`

**Files:**
- Modify: `src/app/shared/incident.models.ts` — novo tipo `IncidentSearchFilters`
- Modify: `src/app/shared/incident.service.ts` — novos métodos `getById`, `search`
- Modify: `src/app/shared/mock/mock-api.interceptor.ts` — responde `GET /incidents/{id}`
- Test: `src/app/shared/incident.service.spec.ts`
- Test: `src/app/shared/mock/mock-api.interceptor.spec.ts`

**Interfaces:**
- Produces: `IncidentSearchFilters { camera?: string; severityMin?: number; status?: AlertaStatus; since?: string; }`
- Produces: `IncidentService.getById(id: number): Observable<Incident>`
- Produces: `IncidentService.search(filters: IncidentSearchFilters, page: number, size: number): Observable<Page<Incident>>`

- [ ] **Step 0: Criar a branch**

```bash
cd /home/asaas/projects/challenge/cypher-front
git checkout dev
git pull
git checkout -b e3b-front-operacao
```

- [ ] **Step 1: Adicionar o tipo de filtros**

Em `src/app/shared/incident.models.ts`, logo após a definição de `export type AlertaStatus = ...`:

```typescript
export interface IncidentSearchFilters {
  camera?: string;
  severityMin?: number;
  status?: AlertaStatus;
  since?: string;
}
```

- [ ] **Step 2: Escrever os testes de `getById` e `search` que falham**

Em `src/app/shared/incident.service.spec.ts`, adicionar depois do teste `'reconhece um incidente e atualiza a lista'` (dentro do primeiro `describe('IncidentService', ...)`):

```typescript
  it('busca um incidente por id e o insere no store', () => {
    service.getById(42).subscribe(incidente => {
      expect(incidente.id).toBe(42);
    });

    const req = http.expectOne(`${environment.apiUrl}/incidents/42`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(incidente({ id: 42, incidentKey: 'k42' }));

    expect(service.incidents().some(i => i.incidentKey === 'k42')).toBe(true);
  });

  it('busca com filtros envia os parâmetros esperados', () => {
    service.search(
      { camera: 'CAM-01', severityMin: 3, status: 'PENDENTE', since: '2026-08-10T00:00:00-03:00' },
      1, 20,
    ).subscribe();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/incidents`);
    expect(req.request.params.get('camera')).toBe('CAM-01');
    expect(req.request.params.get('severityMin')).toBe('3');
    expect(req.request.params.get('status')).toBe('PENDENTE');
    expect(req.request.params.get('since')).toBe('2026-08-10T00:00:00-03:00');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');
    req.flush(pagina([]));
  });

  it('busca sem filtros envia só paginação', () => {
    service.search({}, 0, 50).subscribe();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/incidents`);
    expect(req.request.params.get('camera')).toBeNull();
    expect(req.request.params.get('severityMin')).toBeNull();
    expect(req.request.params.get('page')).toBe('0');
    req.flush(pagina([]));
  });
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `service.getById is not a function` / `service.search is not a function`

- [ ] **Step 4: Implementar `getById` e `search`**

Em `src/app/shared/incident.service.ts`, trocar a linha de import de rxjs (hoje não existe import de rxjs nesse arquivo — adicionar) e adicionar os métodos depois de `acknowledge`:

```typescript
import { Observable, tap } from 'rxjs';
```

```typescript
  /** Busca um incidente por id; também insere no store, para refletir mudanças via SSE enquanto a tela de detalhe está aberta. */
  getById(id: number): Observable<Incident> {
    return this.http
      .get<Incident>(`${environment.apiUrl}/incidents/${id}`, { withCredentials: true })
      .pipe(tap(incident => this.upsert(incident)));
  }

  /**
   * Busca paginada com filtros. Mantém estado próprio no chamador — não entra
   * no store de 100 itens em memória, que cobre só o "ao vivo" do dashboard.
   */
  search(filters: IncidentSearchFilters, page: number, size: number): Observable<Page<Incident>> {
    const params: Record<string, string> = { page: String(page), size: String(size) };
    if (filters.camera) {
      params['camera'] = filters.camera;
    }
    if (filters.severityMin !== undefined) {
      params['severityMin'] = String(filters.severityMin);
    }
    if (filters.status) {
      params['status'] = filters.status;
    }
    if (filters.since) {
      params['since'] = filters.since;
    }
    return this.http.get<Page<Incident>>(`${environment.apiUrl}/incidents`, {
      params,
      withCredentials: true,
    });
  }
```

E atualizar o import de `incident.models` no topo do arquivo para incluir `IncidentSearchFilters`:

```typescript
import { AlertaStatus, ConnectionState, Incident, IncidentSearchFilters, Page, Summary } from './incident.models';
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — todos os testes de `incident.service.spec.ts`

- [ ] **Step 6: Escrever os testes do mock que falham**

Em `src/app/shared/mock/mock-api.interceptor.spec.ts`, adicionar ao primeiro `describe('mockApiInterceptor', ...)`, depois do teste `'deixa passar o que não conhece'`:

```typescript
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
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — os dois testes novos do interceptor devolvem a requisição sem resposta mockada (caem em `next(req)`, que a suíte de testes não resolve)

- [ ] **Step 8: Implementar o branch de `/incidents/{id}` no interceptor**

Em `src/app/shared/mock/mock-api.interceptor.ts`, adicionar logo depois do bloco `if (req.method === 'GET' && req.url === \`${base}/incidents\`) { ... }` (antes de `if (req.method === 'GET' && req.url === \`${base}/summary\`)`):

```typescript
  if (req.method === 'GET' && req.url.startsWith(`${base}/incidents/`)) {
    const id = Number(req.url.slice(`${base}/incidents/`.length));
    const alvo = [...INCIDENTS, ...EMITIDOS].find(i => i.id === id);
    return alvo ?? naoEncontrado(`Incidente inexistente: ${id}`);
  }
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — suíte inteira, sem regressão

- [ ] **Step 10: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/incident.models.ts src/app/shared/incident.service.ts \
        src/app/shared/incident.service.spec.ts \
        src/app/shared/mock/mock-api.interceptor.ts \
        src/app/shared/mock/mock-api.interceptor.spec.ts
git commit -m "feat(front): getById e search no IncidentService"
```

---

### Task 2: Timeline de incidentes com filtros (`/incidentes`)

**Files:**
- Create: `src/app/incidents/incident-timeline.component.ts`
- Create: `src/app/incidents/incident-timeline.component.html`
- Test: `src/app/incidents/incident-timeline.component.spec.ts`
- Modify: `src/app/app.routes.ts` — rota `/incidentes`
- Modify: `src/app/shared/mock/mock-api.interceptor.ts` — filtros e paginação reais em `GET /incidents`
- Modify: `src/app/shared/mock/mock-api.interceptor.spec.ts` — testes dos filtros novos
- Modify: `src/styles.scss` — classes `.tl-*`

**Interfaces:**
- Consumes: `IncidentService.search(filters: IncidentSearchFilters, page, size): Observable<Page<Incident>>` (Task 1), `IncidentService.acknowledge(id, status): void`, `CatalogService.cameras: Signal<Camera[]>`, `CatalogService.load(): void`
- Produces: `IncidentTimelineComponent` com campos públicos `camera`, `severityMin`, `status`, `since` (signals de filtro), `linhas: Signal<Incident[]>`, `page`, `totalPaginas`, `carregando`, `erro`, e métodos `aplicarFiltros()`, `limparFiltros()`, `proximaPagina()`, `paginaAnterior()`, `proximoStatus(status)`, `reconhecer(inc, event)`

- [ ] **Step 1: Escrever o spec do componente que falha**

Criar `src/app/incidents/incident-timeline.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { Incident, Page } from '../shared/incident.models';
import { IncidentTimelineComponent } from './incident-timeline.component';

function incidente(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 1, incidentKey: 'k1', cameraId: 'CAM-01', runId: 'run-a', trackId: 1,
    type: 'FALL_RISK', severity: 4, nivel: 'ALTO', descricao: 'Queda',
    reason: 'fallen_sustained', postureCategory: 'immediate_risk', rebaScore: 11,
    actionLevel: 4, zoneName: null, zoneStatus: 'outside', epiPresent: [], epiMissing: [],
    snapshotUrl: null, detectedAt: '2026-08-10T14:31:02.482-03:00', endedAt: null,
    durationSeconds: null, peakSeverity: 4, closedReason: null, status: 'PENDENTE',
    ...overrides,
  };
}

function pagina(content: Incident[], overrides: Partial<Page<Incident>> = {}): Page<Incident> {
  return { content, totalElements: content.length, totalPages: 1, number: 0, size: 20, ...overrides };
}

describe('IncidentTimelineComponent', () => {
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

  function montar() {
    const fixture = TestBed.createComponent(IncidentTimelineComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`)
      .flush(pagina([incidente({ id: 1, incidentKey: 'k1' })]));
    fixture.detectChanges();
    return fixture;
  }

  it('busca a primeira página ao iniciar', () => {
    const fixture = montar();

    expect(fixture.componentInstance.linhas().length).toBe(1);
  });

  it('reaplica a busca do zero ao aplicar filtros', () => {
    const fixture = montar();
    fixture.componentInstance.camera.set('CAM-02');

    fixture.componentInstance.aplicarFiltros();

    const req = http.expectOne(r =>
      r.url === `${environment.apiUrl}/incidents` && r.params.get('camera') === 'CAM-02');
    expect(req.request.params.get('page')).toBe('0');
    req.flush(pagina([]));
  });

  it('mostra estado vazio quando não há resultado', () => {
    const fixture = montar();
    fixture.componentInstance.aplicarFiltros();
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`).flush(pagina([]));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('nenhum incidente encontrado');
  });

  it('não avança de página quando não há próxima', () => {
    const fixture = montar();

    fixture.componentInstance.proximaPagina();

    http.expectNone(r => r.url === `${environment.apiUrl}/incidents` && r.params.get('page') === '1');
  });

  it('reconhecer avança para o próximo status natural, sem navegar', () => {
    const fixture = montar();
    const inc = fixture.componentInstance.linhas()[0];
    let propagou = true;
    const evento = { stopPropagation: () => { propagou = false; } } as unknown as Event;

    fixture.componentInstance.reconhecer(inc, evento);

    const req = http.expectOne(`${environment.apiUrl}/incidents/${inc.id}/status`);
    expect(req.request.body).toEqual({ status: 'REVISADO' });
    req.flush({ ...inc, status: 'REVISADO' });
    expect(propagou).toBe(false);
  });

  it('proximoStatus não avança incidente já resolvido', () => {
    const fixture = montar();

    expect(fixture.componentInstance.proximoStatus('RESOLVIDO')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `Cannot find module './incident-timeline.component'`

- [ ] **Step 3: Implementar o componente**

Criar `src/app/incidents/incident-timeline.component.ts`:

```typescript
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { CatalogService } from '../shared/catalog.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { DockComponent } from '../shared/dock/dock.component';
import { IncidentService } from '../shared/incident.service';
import {
  AlertaStatus, Incident, Page, formatTime, incidentLabel, mensagemDeErro,
} from '../shared/incident.models';

const TAMANHO_PAGINA = 20;

@Component({
  selector: 'app-incident-timeline',
  imports: [ChromeTopbarComponent, DockComponent, RouterLink, FormsModule],
  templateUrl: './incident-timeline.component.html',
})
export class IncidentTimelineComponent implements OnInit {
  private incidentService = inject(IncidentService);
  private catalogService = inject(CatalogService);
  private cfgService = inject(ConfigService);
  private router = inject(Router);

  cfg = this.cfgService.config;
  readonly cameras = this.catalogService.cameras;

  readonly camera = signal('');
  readonly severityMin = signal<number | null>(null);
  readonly status = signal<AlertaStatus | ''>('');
  readonly since = signal('');
  readonly page = signal(0);

  private readonly _resultado = signal<Page<Incident> | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  /**
   * Linhas com o status mais fresco conhecido: se um reconhecimento (aqui ou
   * na tela de detalhe) já atualizou o store global, a linha reflete isso sem
   * precisar rebuscar a página (spec §4).
   */
  readonly linhas = computed(() => {
    const globais = this.incidentService.incidents();
    return (this._resultado()?.content ?? []).map(i =>
      globais.find(g => g.incidentKey === i.incidentKey) ?? i);
  });

  readonly totalPaginas = computed(() => this._resultado()?.totalPages ?? 0);
  readonly totalElementos = computed(() => this._resultado()?.totalElements ?? 0);

  hora = formatTime;
  rotulo = incidentLabel;

  ngOnInit(): void {
    this.catalogService.load();
    this.buscar();
  }

  aplicarFiltros(): void {
    this.page.set(0);
    this.buscar();
  }

  limparFiltros(): void {
    this.camera.set('');
    this.severityMin.set(null);
    this.status.set('');
    this.since.set('');
    this.aplicarFiltros();
  }

  proximaPagina(): void {
    if (this.page() + 1 < this.totalPaginas()) {
      this.page.update(p => p + 1);
      this.buscar();
    }
  }

  paginaAnterior(): void {
    if (this.page() > 0) {
      this.page.update(p => p - 1);
      this.buscar();
    }
  }

  abrirDetalhe(inc: Incident): void {
    this.router.navigate(['/incidentes', inc.id]);
  }

  /** Ação rápida: só avança para o próximo passo natural. Transição livre completa fica no detalhe. */
  proximoStatus(status: AlertaStatus): AlertaStatus | null {
    if (status === 'PENDENTE') return 'REVISADO';
    if (status === 'REVISADO') return 'RESOLVIDO';
    return null;
  }

  reconhecer(inc: Incident, event: Event): void {
    event.stopPropagation();
    const proximo = this.proximoStatus(inc.status);
    if (proximo) {
      this.incidentService.acknowledge(inc.id, proximo);
    }
  }

  private buscar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.incidentService
      .search(
        {
          camera: this.camera() || undefined,
          severityMin: this.severityMin() ?? undefined,
          status: (this.status() || undefined) as AlertaStatus | undefined,
          since: this.since() || undefined,
        },
        this.page(),
        TAMANHO_PAGINA,
      )
      .subscribe({
        next: pagina => {
          this._resultado.set(pagina);
          this.carregando.set(false);
        },
        error: erro => {
          this.erro.set(mensagemDeErro(erro));
          this.carregando.set(false);
        },
      });
  }
}
```

Criar `src/app/incidents/incident-timeline.component.html`:

```html
<div class="dash">
  <app-chrome-topbar [cfg]="cfg()" page="Incidentes" subtitle="timeline com filtros" [live]="false" [notifBadge]="0" [shift]="null"/>

  <main class="dcontent">
    <div class="panel">
      <div class="panel-head">
        <div class="ph-left"><span class="ph-title">Filtros</span></div>
      </div>
      <form class="tl-filters" (ngSubmit)="aplicarFiltros()">
        <div class="field">
          <label for="tl-camera">Câmera</label>
          <select id="tl-camera" class="select" [(ngModel)]="camera" name="camera">
            <option value="">Todas</option>
            @for (cam of cameras(); track cam.id) {
              <option [value]="cam.id">{{ cam.nome }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="tl-severity">Severidade mínima</label>
          <select id="tl-severity" class="select" [ngModel]="severityMin()"
                  (ngModelChange)="severityMin.set($event === '' ? null : +$event)" name="severityMin">
            <option value="">Qualquer</option>
            @for (n of [1, 2, 3, 4]; track n) {
              <option [value]="n">{{ n }}+</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="tl-status">Status</label>
          <select id="tl-status" class="select" [(ngModel)]="status" name="status">
            <option value="">Todos</option>
            <option value="PENDENTE">Pendente</option>
            <option value="REVISADO">Revisado</option>
            <option value="RESOLVIDO">Resolvido</option>
          </select>
        </div>
        <div class="field">
          <label for="tl-since">A partir de</label>
          <input id="tl-since" class="input" type="datetime-local" [(ngModel)]="since" name="since"/>
        </div>
        <div class="tl-filter-actions">
          <button type="submit" class="btn primary">Filtrar</button>
          <button type="button" class="btn ghost" (click)="limparFiltros()">Limpar</button>
        </div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div class="ph-left">
          <span class="ph-title">Incidentes</span>
          <span class="ph-meta">{{ totalElementos() }} no total</span>
        </div>
      </div>
      <div class="alerts-list">
        @for (inc of linhas(); track inc.incidentKey) {
          <div [class]="'alert-row tl-row ' + (inc.nivel === 'ALTO' ? 'crit' : inc.nivel === 'MEDIO' ? 'high' : '')"
               (click)="abrirDetalhe(inc)">
            <span class="a-time">{{ hora(inc.detectedAt) }}</span>
            <span class="a-station">{{ inc.cameraId }}</span>
            <span class="a-type">{{ rotulo(inc.type) }}</span>
            <span class="tl-status" [attr.data-status]="inc.status">{{ inc.status }}</span>
            <span class="a-sev">{{ inc.nivel }}</span>
            @if (proximoStatus(inc.status); as proximo) {
              <button type="button" class="btn ghost tl-quick-action" (click)="reconhecer(inc, $event)">
                marcar {{ proximo === 'REVISADO' ? 'revisado' : 'resolvido' }}
              </button>
            }
          </div>
        } @empty {
          @if (carregando()) {
            <div class="vazio">carregando…</div>
          } @else if (erro()) {
            <div class="vazio">{{ erro() }}</div>
          } @else {
            <div class="vazio">nenhum incidente encontrado com esses filtros</div>
          }
        }
      </div>
      <div class="tl-pagination">
        <button type="button" class="btn ghost" [disabled]="page() === 0" (click)="paginaAnterior()">← anterior</button>
        <span class="ph-meta">página {{ page() + 1 }} de {{ totalPaginas() || 1 }}</span>
        <button type="button" class="btn ghost" [disabled]="page() + 1 >= totalPaginas()" (click)="proximaPagina()">próxima →</button>
      </div>
    </div>
  </main>

  <app-dock activeKey="alerts"/>
</div>
```

- [ ] **Step 4: Rodar e confirmar que os testes do componente passam**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — todos os testes de `incident-timeline.component.spec.ts`

- [ ] **Step 5: Adicionar a rota**

Em `src/app/app.routes.ts`, adicionar o import e a rota depois de `heatmap`:

```typescript
import { IncidentTimelineComponent } from './incidents/incident-timeline.component';
```

```typescript
  { path: 'heatmap', component: HeatmapComponent },
  { path: 'incidentes', component: IncidentTimelineComponent },
```

- [ ] **Step 6: Escrever os testes de filtro/paginação do mock que falham**

Em `src/app/shared/mock/mock-api.interceptor.spec.ts`, adicionar ao primeiro `describe`, depois dos testes de `/incidents/{id}` do Task 1:

```typescript
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
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — os quatro testes novos, porque o mock hoje ignora `camera`/`severityMin`/`status`/`page`/`size`

- [ ] **Step 8: Implementar filtros e paginação reais no mock**

Em `src/app/shared/mock/mock-api.interceptor.ts`, substituir o bloco:

```typescript
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
```

por:

```typescript
  if (req.method === 'GET' && req.url === `${base}/incidents`) {
    // Comparação de string funciona porque todas as fixtures trazem o mesmo
    // offset -03:00; com offsets misturados isto precisaria de Date.
    const since = req.params.get('since');
    const camera = req.params.get('camera');
    const severityMinStr = req.params.get('severityMin');
    const status = req.params.get('status');
    const page = Number(req.params.get('page') ?? '0');
    // Sem size explícito (ex.: loadHistory antigo em outro teste), devolve tudo
    // que sobrar do filtro — mesmo comportamento de antes desta mudança.
    const size = Number(req.params.get('size') ?? String(INCIDENTS.length || 1));

    let lista = INCIDENTS;
    if (since) lista = lista.filter(i => i.detectedAt > since);
    if (camera) lista = lista.filter(i => i.cameraId === camera);
    if (severityMinStr) lista = lista.filter(i => i.severity >= Number(severityMinStr));
    if (status) lista = lista.filter(i => i.status === status);

    const inicio = page * size;
    const paginaDeItens = lista.slice(inicio, inicio + size);
    return {
      content: paginaDeItens,
      totalElements: lista.length,
      totalPages: Math.max(1, Math.ceil(lista.length / size)),
      number: page,
      size,
    };
  }
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — suíte inteira, incluindo os testes antigos `listaMaisRecentesPrimeiro`/`filtraPorInstanteParaCobrirLacunaDoSse` do interceptor (que não passam `size` e continuam recebendo a lista inteira)

- [ ] **Step 10: Adicionar as classes CSS**

Em `src/styles.scss`, adicionar ao final do arquivo:

```scss
.tl-filters { display:grid; grid-template-columns:repeat(4, 1fr) auto; gap:16px; align-items:end; }
.tl-filter-actions { display:flex; gap:10px; }
.tl-row { grid-template-columns:44px 60px 1fr 90px auto auto; cursor:pointer; }
.tl-status { font-family:var(--mono); font-size:9px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink-mute); }
.tl-status[data-status="PENDENTE"] { color:#FFCE38; }
.tl-status[data-status="REVISADO"] { color:#3D88F6; }
.tl-status[data-status="RESOLVIDO"] { color:#34D07E; }
.tl-quick-action { padding:6px 12px; font-size:11px; white-space:nowrap; }
.tl-pagination { display:flex; align-items:center; justify-content:center; gap:16px; margin-top:16px; }
```

(`.tl-row` sobrescreve `grid-template-columns` de `.alert-row` por ordem de declaração no arquivo — mesma especificidade, a regra que vem depois vence.)

- [ ] **Step 11: Rodar a suíte completa e o build**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch && npx ng build`
Expected: testes PASS, build sem erro de compilação de template/estilo

- [ ] **Step 12: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/incidents/incident-timeline.component.ts \
        src/app/incidents/incident-timeline.component.html \
        src/app/incidents/incident-timeline.component.spec.ts \
        src/app/app.routes.ts \
        src/app/shared/mock/mock-api.interceptor.ts \
        src/app/shared/mock/mock-api.interceptor.spec.ts \
        src/styles.scss
git commit -m "feat(front): timeline de incidentes com filtros (/incidentes)"
```

---

### Task 3: Detalhe do incidente (`/incidentes/:id`)

**Files:**
- Create: `src/app/incidents/incident-detail.component.ts`
- Create: `src/app/incidents/incident-detail.component.html`
- Test: `src/app/incidents/incident-detail.component.spec.ts`
- Modify: `src/app/app.routes.ts` — rota `/incidentes/:id`
- Modify: `src/styles.scss` — classes `.detail-*`

**Interfaces:**
- Consumes: `IncidentService.getById(id): Observable<Incident>` (Task 1), `IncidentService.acknowledge(id, status): void`, `IncidentService.incidents: Signal<Incident[]>`
- Produces: `IncidentDetailComponent` com `incidente: Signal<Incident | null>`, `carregando`, `erro`, método `mudarStatus(status: AlertaStatus)`

- [ ] **Step 1: Escrever o spec que falha**

Criar `src/app/incidents/incident-detail.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { Incident } from '../shared/incident.models';
import { IncidentDetailComponent } from './incident-detail.component';

function incidente(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 42, incidentKey: 'k42', cameraId: 'CAM-01', runId: 'run-a', trackId: 1,
    type: 'FALL_RISK', severity: 4, nivel: 'ALTO', descricao: 'Queda',
    reason: 'fallen_sustained', postureCategory: 'immediate_risk', rebaScore: 11,
    actionLevel: 4, zoneName: null, zoneStatus: 'outside', epiPresent: ['HELMET'], epiMissing: [],
    snapshotUrl: null, detectedAt: '2026-08-10T14:31:02.482-03:00', endedAt: null,
    durationSeconds: null, peakSeverity: 4, closedReason: null, status: 'PENDENTE',
    ...overrides,
  };
}

describe('IncidentDetailComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'incidentes/:id', component: IncidentDetailComponent }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('busca o incidente pelo id da rota e mostra os campos', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    await promessa;
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Queda / risco imediato');
    expect(harness.routeNativeElement?.textContent).toContain('CAM-01');
  });

  it('id inexistente mostra erro e link de volta', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/incidentes/999999', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/999999`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    await promessa;
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent?.toLowerCase()).toContain('falhou');
    expect(harness.routeNativeElement?.querySelector('a[href="/incidentes"]')).not.toBeNull();
  });

  it('snapshot ausente mostra o placeholder', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente({ snapshotUrl: null }));
    await promessa;
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('processando imagem');
  });

  it('botão de status dispara o PUT correspondente', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente({ status: 'PENDENTE' }));
    await promessa;
    harness.detectChanges();

    const botaoResolvido = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Resolvido') as HTMLButtonElement;
    botaoResolvido.click();

    const req = http.expectOne(`${environment.apiUrl}/incidents/42/status`);
    expect(req.request.body).toEqual({ status: 'RESOLVIDO' });
    req.flush(incidente({ status: 'RESOLVIDO' }));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `Cannot find module './incident-detail.component'`

- [ ] **Step 3: Implementar o componente**

Criar `src/app/incidents/incident-detail.component.ts`:

```typescript
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { DockComponent } from '../shared/dock/dock.component';
import { IncidentService } from '../shared/incident.service';
import {
  AlertaStatus, Incident, formatTime, incidentLabel, mensagemDeErro,
} from '../shared/incident.models';

@Component({
  selector: 'app-incident-detail',
  imports: [ChromeTopbarComponent, DockComponent, RouterLink],
  templateUrl: './incident-detail.component.html',
})
export class IncidentDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private incidentService = inject(IncidentService);
  private cfgService = inject(ConfigService);

  cfg = this.cfgService.config;
  private readonly id = Number(this.route.snapshot.paramMap.get('id'));

  private readonly buscado = signal<Incident | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  /**
   * Prefere o store global (fresco via SSE); cai para o resultado do GET
   * inicial se o item saiu da janela de 100 em memória (spec §4).
   */
  readonly incidente = computed(() =>
    this.incidentService.incidents().find(i => i.id === this.id) ?? this.buscado());

  hora = formatTime;
  rotulo = incidentLabel;

  ngOnInit(): void {
    this.incidentService.getById(this.id).subscribe({
      next: inc => {
        this.buscado.set(inc);
        this.carregando.set(false);
      },
      error: erro => {
        this.erro.set(mensagemDeErro(erro));
        this.carregando.set(false);
      },
    });
  }

  mudarStatus(status: AlertaStatus): void {
    this.incidentService.acknowledge(this.id, status);
  }
}
```

Criar `src/app/incidents/incident-detail.component.html`:

```html
<div class="dash">
  <app-chrome-topbar [cfg]="cfg()" page="Detalhe do incidente" [subtitle]="incidente()?.incidentKey ?? ''" [live]="false" [notifBadge]="0" [shift]="null"/>

  <main class="dcontent">
    @if (carregando()) {
      <div class="panel"><div class="vazio">carregando…</div></div>
    } @else if (erro()) {
      <div class="panel">
        <div class="vazio">{{ erro() }}</div>
        <a routerLink="/incidentes" class="btn ghost">← voltar para incidentes</a>
      </div>
    } @else if (incidente(); as inc) {
      <div class="panel">
        <div class="panel-head">
          <div class="ph-left">
            <span class="ph-title">{{ rotulo(inc.type) }}</span>
            <span class="ph-meta">{{ inc.cameraId }} · {{ hora(inc.detectedAt) }}</span>
          </div>
        </div>

        <div class="detail-snapshot">
          @if (inc.snapshotUrl) {
            <img [src]="inc.snapshotUrl" alt="Snapshot do incidente"/>
          } @else {
            <div class="detail-snapshot-vazio">processando imagem…</div>
          }
        </div>

        <div class="detail-grid">
          <div class="detail-field"><span class="detail-label">Severidade</span><span class="detail-value">{{ inc.severity }} · {{ inc.nivel }}</span></div>
          <div class="detail-field"><span class="detail-label">REBA</span><span class="detail-value">{{ inc.rebaScore }} (ação {{ inc.actionLevel }})</span></div>
          <div class="detail-field"><span class="detail-label">Zona</span><span class="detail-value">{{ inc.zoneName ?? ('sem zona (' + inc.zoneStatus + ')') }}</span></div>
          <div class="detail-field"><span class="detail-label">EPIs presentes</span><span class="detail-value">{{ inc.epiPresent.join(', ') || '—' }}</span></div>
          <div class="detail-field"><span class="detail-label">EPIs ausentes</span><span class="detail-value">{{ inc.epiMissing.join(', ') || '—' }}</span></div>
          @if (inc.durationSeconds !== null) {
            <div class="detail-field"><span class="detail-label">Duração</span><span class="detail-value">{{ inc.durationSeconds }}s · pico {{ inc.peakSeverity }}</span></div>
          }
          @if (inc.closedReason) {
            <div class="detail-field"><span class="detail-label">Motivo de fechamento</span><span class="detail-value">{{ inc.closedReason }}</span></div>
          }
        </div>

        <div class="detail-status">
          <span class="detail-label">Status atual: {{ inc.status }}</span>
          <div class="detail-status-actions">
            <button type="button" class="btn ghost" [disabled]="inc.status === 'PENDENTE'" (click)="mudarStatus('PENDENTE')">Pendente</button>
            <button type="button" class="btn ghost" [disabled]="inc.status === 'REVISADO'" (click)="mudarStatus('REVISADO')">Revisado</button>
            <button type="button" class="btn primary" [disabled]="inc.status === 'RESOLVIDO'" (click)="mudarStatus('RESOLVIDO')">Resolvido</button>
          </div>
        </div>
      </div>
    }
  </main>

  <app-dock activeKey="alerts"/>
</div>
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — todos os testes de `incident-detail.component.spec.ts`

- [ ] **Step 5: Adicionar a rota**

Em `src/app/app.routes.ts`, adicionar o import e a rota logo depois de `incidentes`:

```typescript
import { IncidentDetailComponent } from './incidents/incident-detail.component';
```

```typescript
  { path: 'incidentes', component: IncidentTimelineComponent },
  { path: 'incidentes/:id', component: IncidentDetailComponent },
```

- [ ] **Step 6: Adicionar as classes CSS**

Em `src/styles.scss`, adicionar ao final do arquivo:

```scss
.detail-snapshot { width:100%; min-height:280px; border-radius:10px; overflow:hidden; background:var(--surface-2); display:flex; align-items:center; justify-content:center; margin-bottom:20px; }
.detail-snapshot img { width:100%; height:100%; object-fit:cover; display:block; }
.detail-snapshot-vazio { opacity:.55; font-size:13px; }
.detail-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin-bottom:20px; }
.detail-field { display:flex; flex-direction:column; gap:4px; }
.detail-label { font-family:var(--mono); font-size:10px; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink-mute); }
.detail-value { font-size:14px; color:var(--ink); }
.detail-status { display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--line-2); padding-top:16px; }
.detail-status-actions { display:flex; gap:10px; }
```

- [ ] **Step 7: Rodar a suíte completa e o build**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch && npx ng build`
Expected: testes PASS, build sem erro

- [ ] **Step 8: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/incidents/incident-detail.component.ts \
        src/app/incidents/incident-detail.component.html \
        src/app/incidents/incident-detail.component.spec.ts \
        src/app/app.routes.ts \
        src/styles.scss
git commit -m "feat(front): detalhe do incidente (/incidentes/:id)"
```

---

### Task 4: Grade de feeds por estação (`/estacoes`)

**Files:**
- Create: `src/app/stations/stations-grid.component.ts`
- Create: `src/app/stations/stations-grid.component.html`
- Test: `src/app/stations/stations-grid.component.spec.ts`
- Modify: `src/app/app.routes.ts` — rota `/estacoes`
- Modify: `src/styles.scss` — classes `.stations-grid`, `.station-*`

**Interfaces:**
- Consumes: `CatalogService.stations: Signal<Station[]>`, `CatalogService.load(): void`, `LiveFeedComponent` (`[camera]: Camera | null`)
- Produces: `StationsGridComponent` com `stations: Signal<Station[]>`, método `primeiraCamera(station: Station): Camera | null`

- [ ] **Step 1: Escrever o spec que falha**

Criar `src/app/stations/stations-grid.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { StationsGridComponent } from './stations-grid.component';

describe('StationsGridComponent', () => {
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

  function montarCom(stations: unknown[]) {
    const fixture = TestBed.createComponent(StationsGridComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush(stations);
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza um card por estação, com a primeira câmera', () => {
    const fixture = montarCom([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true,
        cameras: [{ id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x/stream' }] },
    ]);

    expect(fixture.nativeElement.textContent).toContain('Esteira');
    expect(fixture.componentInstance.primeiraCamera(fixture.componentInstance.stations()[0])?.id)
      .toBe('CAM-01');
  });

  it('estação sem câmera mostra o feed indisponível, não quebra', () => {
    const fixture = montarCom([
      { id: 'EST-02', nome: 'Doca', setor: null, ativa: true, cameras: [] },
    ]);

    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('câmera indisponível');
  });

  it('link do card leva ao kiosk da estação', () => {
    const fixture = montarCom([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] },
    ]);

    const link = fixture.nativeElement.querySelector('a.station-card');
    expect(link.getAttribute('href')).toBe('/estacao/EST-01');
  });

  it('sem estação cadastrada, diz isso em vez de mostrar grade vazia', () => {
    const fixture = montarCom([]);

    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('nenhuma esta');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `Cannot find module './stations-grid.component'`

- [ ] **Step 3: Implementar o componente**

Criar `src/app/stations/stations-grid.component.ts`:

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CatalogService } from '../shared/catalog.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { DockComponent } from '../shared/dock/dock.component';
import { LiveFeedComponent } from '../shared/live-feed/live-feed.component';
import { Camera, Station } from '../shared/incident.models';

@Component({
  selector: 'app-stations-grid',
  imports: [ChromeTopbarComponent, DockComponent, RouterLink, LiveFeedComponent],
  templateUrl: './stations-grid.component.html',
})
export class StationsGridComponent implements OnInit {
  private catalogService = inject(CatalogService);
  private cfgService = inject(ConfigService);

  cfg = this.cfgService.config;
  readonly stations = this.catalogService.stations;

  ngOnInit(): void {
    this.catalogService.load();
  }

  /** Miniatura representativa: a primeira câmera. Todas aparecem no kiosk da estação. */
  primeiraCamera(station: Station): Camera | null {
    return station.cameras[0] ?? null;
  }
}
```

Criar `src/app/stations/stations-grid.component.html`:

```html
<div class="dash">
  <app-chrome-topbar [cfg]="cfg()" page="Estações" subtitle="grade de feeds ao vivo" [live]="true" [notifBadge]="0" [shift]="null"/>

  <main class="dcontent">
    <div class="stations-grid">
      @for (station of stations(); track station.id) {
        <a class="panel station-card" [routerLink]="['/estacao', station.id]">
          <div class="panel-head">
            <div class="ph-left">
              <span class="ph-title">{{ station.nome }}</span>
              @if (station.setor) { <span class="ph-meta">{{ station.setor }}</span> }
            </div>
          </div>
          <div class="station-feed">
            <app-live-feed [camera]="primeiraCamera(station)" />
          </div>
          <span class="station-cam-count">{{ station.cameras.length }} câmera{{ station.cameras.length === 1 ? '' : 's' }}</span>
        </a>
      } @empty {
        <div class="panel"><div class="vazio">nenhuma estação cadastrada</div></div>
      }
    </div>
  </main>

  <app-dock activeKey="live"/>
</div>
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — todos os testes de `stations-grid.component.spec.ts`

- [ ] **Step 5: Adicionar a rota**

Em `src/app/app.routes.ts`, adicionar o import e a rota logo depois de `incidentes/:id`:

```typescript
import { StationsGridComponent } from './stations/stations-grid.component';
```

```typescript
  { path: 'incidentes/:id', component: IncidentDetailComponent },
  { path: 'estacoes', component: StationsGridComponent },
```

- [ ] **Step 6: Adicionar as classes CSS**

Em `src/styles.scss`, adicionar ao final do arquivo:

```scss
.stations-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:20px; }
.station-card { text-decoration:none; color:inherit; min-height:0; cursor:pointer; transition:transform 0.15s; }
.station-card:hover { transform:translateY(-2px); border-color:var(--line-3); }
.station-feed { min-height:180px; border-radius:10px; overflow:hidden; background:var(--surface-2); margin-bottom:10px; }
.station-cam-count { font-family:var(--mono); font-size:10px; color:var(--ink-mute); letter-spacing:0.06em; }
```

- [ ] **Step 7: Rodar a suíte completa e o build**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch && npx ng build`
Expected: testes PASS, build sem erro

- [ ] **Step 8: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/stations/stations-grid.component.ts \
        src/app/stations/stations-grid.component.html \
        src/app/stations/stations-grid.component.spec.ts \
        src/app/app.routes.ts \
        src/styles.scss
git commit -m "feat(front): grade de feeds por estação (/estacoes)"
```

---

### Task 5: Kiosk do operador (`/estacao/:id`)

**Files:**
- Create: `src/app/stations/station-kiosk.component.ts`
- Create: `src/app/stations/station-kiosk.component.html`
- Test: `src/app/stations/station-kiosk.component.spec.ts`
- Modify: `src/app/app.routes.ts` — rota `/estacao/:id`
- Modify: `src/styles.scss` — classes `.kiosk-*`

**Interfaces:**
- Consumes: `CatalogService.stations`, `CatalogService.load()`, `IncidentService.search(filters, page, size)` (Task 1), `ConfigService.config: Signal<CypherConfig | null>`, `LiveFeedComponent`
- Produces: `StationKioskComponent` com `station: Signal<Station | null>`, `episRequeridos: Signal<string[]>`, `eventos: Signal<Incident[]>`, `carregandoEventos: Signal<boolean>`

- [ ] **Step 1: Escrever o spec que falha**

Criar `src/app/stations/station-kiosk.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { ConfigService } from '../shared/config.service';
import { StationKioskComponent } from './station-kiosk.component';

describe('StationKioskComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'estacao/:id', component: StationKioskComponent }]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('mostra um feed por câmera da estação e busca eventos recentes de cada uma', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);

    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [
        { id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x/1' },
        { id: 'CAM-02', nome: 'Lateral', estacaoId: 'EST-01', streamUrl: 'http://x/2' },
      ] },
    ]);
    await promessa;
    harness.detectChanges();

    http.expectOne(r => r.url === `${environment.apiUrl}/incidents` && r.params.get('camera') === 'CAM-01')
      .flush({ content: [], totalElements: 0, totalPages: 1, number: 0, size: 10 });
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents` && r.params.get('camera') === 'CAM-02')
      .flush({ content: [], totalElements: 0, totalPages: 1, number: 0, size: 10 });
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelectorAll('app-live-feed').length).toBe(2);
  });

  it('não mostra o dock — o kiosk não tem navegação', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [] },
    ]);
    await promessa;
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelector('app-dock')).toBeNull();
  });

  it('checklist de EPIs vem do ConfigService, somente leitura', async () => {
    const cfgService = TestBed.inject(ConfigService);
    cfgService.save({
      company: 'X', cnpj: '', sector: '', logoUrl: null, logoName: '',
      accent: '#000', epis: ['HELMET', 'VEST'], cas: {},
    });

    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [] },
    ]);
    await promessa;
    harness.detectChanges();

    const itens = harness.routeNativeElement?.querySelectorAll('.kiosk-epi-list li');
    expect(itens?.length).toBe(2);
    expect(harness.routeNativeElement?.textContent).toContain('HELMET');
    expect(itens?.[0].querySelector('button, input')).toBeNull();
  });

  it('estação com câmeras vazias não busca eventos e não quebra', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [] },
    ]);
    await promessa;
    harness.detectChanges();

    http.expectNone(r => r.url === `${environment.apiUrl}/incidents`);
    expect(harness.routeNativeElement?.textContent).toContain('nenhuma câmera cadastrada');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `Cannot find module './station-kiosk.component'`

- [ ] **Step 3: Implementar o componente**

Criar `src/app/stations/station-kiosk.component.ts`:

```typescript
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';

import { CatalogService } from '../shared/catalog.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { IncidentService } from '../shared/incident.service';
import { LiveFeedComponent } from '../shared/live-feed/live-feed.component';
import { Incident, formatTime, incidentLabel } from '../shared/incident.models';

const EVENTOS_POR_CAMERA = 10;
const EVENTOS_EXIBIDOS = 10;

/** Sem <app-dock>: o kiosk é a única tela sem navegação — abre numa estação e permanece nela. */
@Component({
  selector: 'app-station-kiosk',
  imports: [ChromeTopbarComponent, LiveFeedComponent],
  templateUrl: './station-kiosk.component.html',
})
export class StationKioskComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private catalogService = inject(CatalogService);
  private incidentService = inject(IncidentService);
  private cfgService = inject(ConfigService);

  cfg = this.cfgService.config;
  private readonly stationId = this.route.snapshot.paramMap.get('id')!;

  readonly station = computed(() =>
    this.catalogService.stations().find(s => s.id === this.stationId) ?? null);

  readonly episRequeridos = computed(() => this.cfgService.config()?.epis ?? []);

  private readonly _eventos = signal<Incident[]>([]);
  readonly eventos = this._eventos.asReadonly();
  readonly carregandoEventos = signal(false);

  hora = formatTime;
  rotulo = incidentLabel;

  private eventosBuscados = false;

  constructor() {
    effect(() => {
      const estacao = this.station();
      if (!estacao || estacao.cameras.length === 0 || this.eventosBuscados) {
        return;
      }
      this.eventosBuscados = true;
      this.buscarEventosRecentes(estacao.cameras.map(c => c.id));
    });
  }

  ngOnInit(): void {
    this.catalogService.load();
  }

  private buscarEventosRecentes(cameraIds: string[]): void {
    this.carregandoEventos.set(true);
    forkJoin(cameraIds.map(id => this.incidentService.search({ camera: id }, 0, EVENTOS_POR_CAMERA)))
      .subscribe({
        next: paginas => {
          const todos = paginas.flatMap(p => p.content);
          todos.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
          this._eventos.set(todos.slice(0, EVENTOS_EXIBIDOS));
          this.carregandoEventos.set(false);
        },
        error: () => this.carregandoEventos.set(false),
      });
  }
}
```

Criar `src/app/stations/station-kiosk.component.html`:

```html
<div class="dash kiosk">
  <app-chrome-topbar [cfg]="cfg()" [page]="station()?.nome ?? 'Estação'" subtitle="kiosk do operador" [live]="true" [notifBadge]="0" [shift]="null"/>

  <main class="dcontent">
    @if (station(); as estacao) {
      <div class="kiosk-feeds">
        @for (cam of estacao.cameras; track cam.id) {
          <div class="panel">
            <div class="panel-head"><div class="ph-left"><span class="ph-title">{{ cam.nome }}</span></div></div>
            <div class="kiosk-feed"><app-live-feed [camera]="cam" /></div>
          </div>
        } @empty {
          <div class="panel"><div class="vazio">nenhuma câmera cadastrada nesta estação</div></div>
        }
      </div>

      <div class="kiosk-lower">
        <div class="panel">
          <div class="panel-head"><div class="ph-left"><span class="ph-title">Checklist de EPIs</span></div></div>
          <ul class="kiosk-epi-list">
            @for (epi of episRequeridos(); track epi) {
              <li>{{ epi }}</li>
            } @empty {
              <div class="vazio">nenhum EPI cadastrado no onboarding</div>
            }
          </ul>
        </div>

        <div class="panel">
          <div class="panel-head"><div class="ph-left"><span class="ph-title">Eventos recentes</span></div></div>
          <div class="alerts-list">
            @for (inc of eventos(); track inc.incidentKey) {
              <div [class]="'alert-row ' + (inc.nivel === 'ALTO' ? 'crit' : inc.nivel === 'MEDIO' ? 'high' : '')">
                <span class="a-time">{{ hora(inc.detectedAt) }}</span>
                <span class="a-station">{{ inc.cameraId }}</span>
                <span class="a-type">{{ rotulo(inc.type) }}</span>
                <span class="a-sev">{{ inc.nivel }}</span>
              </div>
            } @empty {
              @if (carregandoEventos()) {
                <div class="vazio">carregando…</div>
              } @else {
                <div class="vazio">nenhum evento recente</div>
              }
            }
          </div>
        </div>
      </div>
    } @else {
      <div class="panel"><div class="vazio">estação não encontrada</div></div>
    }
  </main>
</div>
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — todos os testes de `station-kiosk.component.spec.ts`

- [ ] **Step 5: Adicionar a rota**

Em `src/app/app.routes.ts`, adicionar o import e a rota logo depois de `estacoes`:

```typescript
import { StationKioskComponent } from './stations/station-kiosk.component';
```

```typescript
  { path: 'estacoes', component: StationsGridComponent },
  { path: 'estacao/:id', component: StationKioskComponent },
```

- [ ] **Step 6: Adicionar as classes CSS**

Em `src/styles.scss`, adicionar ao final do arquivo:

```scss
.dash.kiosk { padding-bottom:40px; } // sem dock nesta tela — não precisa da folga que o dock reserva
.kiosk-feeds { display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px; }
.kiosk-feed { min-height:220px; border-radius:10px; overflow:hidden; background:var(--surface-2); }
.kiosk-lower { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.kiosk-epi-list { list-style:none; display:flex; flex-direction:column; gap:8px; padding:0; margin:0; }
.kiosk-epi-list li { font-size:13px; color:var(--ink); padding:8px 12px; background:var(--bg-2); border-radius:8px; }
.kiosk-epi-list li::before { content:'✓ '; color:#34D07E; font-weight:700; }
```

- [ ] **Step 7: Rodar a suíte completa e o build**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch && npx ng build`
Expected: testes PASS, build sem erro

- [ ] **Step 8: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/stations/station-kiosk.component.ts \
        src/app/stations/station-kiosk.component.html \
        src/app/stations/station-kiosk.component.spec.ts \
        src/app/app.routes.ts \
        src/styles.scss
git commit -m "feat(front): kiosk do operador (/estacao/:id)"
```

---

### Task 6: Liga rotas de operação ao dock

**Files:**
- Modify: `src/app/shared/dock/dock.component.ts`
- Test: `src/app/shared/dock/dock.component.spec.ts`

**Interfaces:**
- Consumes: nenhuma nova — só dados (`ITEMS`) já existentes no próprio arquivo

- [ ] **Step 1: Escrever o spec que falha**

Criar `src/app/shared/dock/dock.component.spec.ts`:

```typescript
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { DockComponent } from './dock.component';

describe('DockComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
  });

  it('liga "Ao Vivo" à grade de estações', () => {
    const fixture = TestBed.createComponent(DockComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.items.find(i => i?.key === 'live')?.route).toBe('/estacoes');
  });

  it('liga "Alertas" e "Histórico" à timeline de incidentes', () => {
    const fixture = TestBed.createComponent(DockComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.items.find(i => i?.key === 'alerts')?.route).toBe('/incidentes');
    expect(fixture.componentInstance.items.find(i => i?.key === 'history')?.route).toBe('/incidentes');
  });

  it('itens com rota renderizam como link, não botão', () => {
    const fixture = TestBed.createComponent(DockComponent);
    fixture.detectChanges();

    const hrefs = Array.from(fixture.nativeElement.querySelectorAll('a.dock-item'))
      .map((a: any) => a.getAttribute('href'));
    expect(hrefs).toContain('/estacoes');
    expect(hrefs).toContain('/incidentes');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `route` é `undefined` para `'live'`, `'alerts'` e `'history'`; o terceiro teste não encontra `/estacoes`/`/incidentes` entre os hrefs (esses itens hoje renderizam como `<button>`, não `<a>`)

- [ ] **Step 3: Ligar as rotas**

Em `src/app/shared/dock/dock.component.ts`, trocar o array `ITEMS`:

```typescript
const ITEMS: (DockItem | null)[] = [
  { key: 'dashboard', label: 'Dashboard',     route: '/dashboard' },
  { key: 'live',      label: 'Ao Vivo',       route: '/estacoes' },
  { key: 'alerts',    label: 'Alertas',       route: '/incidentes' },
  null,
  { key: 'heatmap',   label: 'Heatmap',       route: '/heatmap' },
  { key: 'history',   label: 'Histórico',     route: '/incidentes' },
  null,
  { key: 'team',      label: 'Colaboradores' },
  { key: 'invite',    label: 'Cadastrar' },
  null,
  { key: 'config',    label: 'Configurações',   route: '/config/estacoes' },
];
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — suíte inteira, incluindo os specs de `dashboard`/`heatmap` (que também renderizam `<app-dock>` e não devem quebrar com os novos `route`)

- [ ] **Step 5: Rodar o build final**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng build`
Expected: build sem erro

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/dock/dock.component.ts src/app/shared/dock/dock.component.spec.ts
git commit -m "feat(front): liga rotas de operação ao dock"
```

---

## Self-Review

**Cobertura da spec:**
- §2.1 timeline com filtros → Task 2 (câmera, severidade mínima, status, período; ação rápida na linha)
- §2.2 detalhe do incidente → Task 3 (snapshot, REBA, zona, EPIs, duração, ações de status livres)
- §2.3 grade de feeds → Task 4 (primeira câmera por estação, sem seletor — decisão explícita da spec)
- §2.4 kiosk → Task 5 (todas as câmeras, checklist somente leitura via `ConfigService`, eventos mesclados por câmera, sem dock)
- §3 endpoint novo → coberto no plano irmão `2026-08-23-e3a-backend-incident-by-id.md`
- §4 camada de dados → Task 1 (`getById`, `search`)
- §5 tratamento de erros → `mensagemDeErro` reaproveitado em Task 2/3; placeholder de snapshot em Task 3; estado vazio em Task 2/4/5
- §6 testes → cada task tem spec próprio, seguindo o padrão Vitest/TestBed do repo
- §7 branches/commits → branch única `e3b-front-operacao`, 6 commits na ordem exata da spec
- §8 plano de validação E2E → fora deste plano de implementação; ver nota abaixo

**Placeholders:** nenhum — todo passo tem código completo, comandos reais e critério de PASS/FAIL explícito.

**Consistência de tipos:** `IncidentSearchFilters` (Task 1) é usado com os mesmos campos em Task 2 (filtros da timeline) e Task 5 (busca por câmera no kiosk). `IncidentService.getById`/`search` têm a mesma assinatura em Task 1, 3 e 5. `Station.cameras`/`Camera` usados sem alteração de forma em Task 4 e 5.

**Nota sobre §8 (prompt de validação E2E):** a spec pede a redação de `docs/e3-e2e-validacao-prompt.md`, mas esse documento só faz sentido depois que as branches `feat/e3a-backend-incident-by-id` (cypher) e `e3b-front-operacao` (cypher-front) estiverem prontas para rodar juntas — é o mesmo padrão de `docs/e2c-e2e-validacao-prompt.md`, escrito quando as três frentes de E2 puderam ser testadas em conjunto. Redigir esse prompt não é uma task de implementação de código; é o último passo do fluxo de integração, a ser feito depois que Task 6 deste plano e a Task 1 do plano `e3a` estiverem ambas commitadas. Ver seção "Depois da implementação" abaixo.

## Depois da implementação

Com as duas branches (`feat/e3a-backend-incident-by-id` em `cypher` e `e3b-front-operacao` em `cypher-front`) prontas, escrever `docs/e3-e2e-validacao-prompt.md` neste repositório, no mesmo formato de `docs/e2c-e2e-validacao-prompt.md`, cobrindo os 8 pontos do §8 do spec de E3 (subir os três lados, contrato do endpoint novo via `curl`, filtros da timeline, snapshot assíncrono no detalhe, propagação via SSE entre abas, grade de feeds e kiosk contra o pipeline real, checklist de EPIs, registro do resultado em `docs/e3-verificacao.md`). Isso não é uma task numerada deste plano porque depende de estado externo a ele (as duas branches mergeadas ou pelo menos ambas com push feito) — é trabalho de coordenação, não de implementação de código, e por isso não se encaixa no formato TDD das tasks acima.
