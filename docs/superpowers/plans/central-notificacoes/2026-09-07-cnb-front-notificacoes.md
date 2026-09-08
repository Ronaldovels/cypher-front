# Central de Notificações — Front (cnb) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o sino de notificações (hoje um stub morto, badge sempre 0 fora do Dashboard) numa central real: offcanvas com as últimas 30 notificações, badge global reativo em tempo real, marcação automática como lida ao abrir.

**Architecture:** Três fatias. A Tarefa 1 é plumbing puro (tipos + métodos novos em `IncidentService`, sem UI) — pré-requisito de todo o resto. A Tarefa 2 cria o `NotificationCenterComponent` (offcanvas) e liga `ChromeTopbarComponent` a ele e ao signal `naoLidas` do serviço, substituindo o `notifBadge` que hoje é um `input()` alimentado manualmente por cada página (e hardcodado a `0` em quatro delas). A Tarefa 3, ao final, é uma revisão de design guiada pela skill `frontend-design` sobre o resultado combinado — mesmo padrão já usado no plano `hfb` (Heatmap funcional) — porque este é o único ponto do front onde o projeto introduz um primitivo visual novo (offcanvas + backdrop) em vez de reaproveitar um já existente, como a §4 do roteiro de entregas exige registrar.

**Tech Stack:** Angular standalone components + signals, Vitest + `HttpTestingController`, `EVENT_SOURCE_FACTORY`/`EventSourceLike` (SSE já existente).

**Spec:** `docs/superpowers/specs/planejadas/2026-09-07-central-notificacoes-design.md`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-front`. **Branch local (não worktree):** `git checkout -b feat/cn-front-notificacoes` a partir de `dev`, dentro do próprio diretório do repo.
- **Depende do plano `2026-09-07-cna-backend-notificacoes.md`** rodando localmente para teste manual — os specs automatizados usam `HttpTestingController` (mock de rede), então podem ser escritos/rodados mesmo antes do backend.
- **Só GESTOR recebe notificações** (spec §1) — o sino, o badge e o offcanvas só existem quando `auth.role() === 'GESTOR'`, mesmo padrão já usado em `chrome-topbar.component.ts` para a engrenagem de configurações e o link do dashboard. OPERADOR (`station-kiosk`) nunca dispara as chamadas novas.
- **Reaproveita `formatDateTime` já existente** (`incident.models.ts:210`, usado hoje por `incident-timeline.component.ts:95`) para formatar `detectedAt` na lista — não há `DatePipe` em uso em nenhum outro lugar do projeto; não introduzir um novo padrão de formatação de data.
- **Style guide do front (roteiro §4):** a lista de notificações reaproveita `.list-row`/`.chip` já existentes em `src/styles.scss`. O offcanvas em si (painel deslizante + backdrop) é primitivo novo — não há equivalente hoje (grep por `offcanvas`/`drawer`/`backdrop` em `styles.scss` não encontra nada reaproveitável) — mesma exceção já registrada para o canvas de zonas de risco (`2026-08-29-zonas-de-risco-design.md` §4.3). A Tarefa 3 (skill `frontend-design`) revisa esse primitivo novo antes do PR.
- Run: `npx vitest run <arquivo>` para um arquivo; `npx vitest run` para a suíte inteira.

---

### Task 1: Plumbing — tipo `Notificacao` e métodos novos em `IncidentService`

**Files:**
- Modify: `src/app/shared/incident.models.ts` (novo `interface Notificacao`)
- Modify: `src/app/shared/incident.service.ts` (`naoLidas` signal, `loadNaoLidas()`, `loadNotificacoes()`, `marcarLidas()`, `receber()` passa a diferenciar evento novo de evento atualizado)
- Test: `src/app/shared/incident.service.spec.ts`

**Interfaces:**
- Produces: `Notificacao { id: number; cameraId: string; type: IncidentType; severity: number; nivel: AlertaNivel; descricao: string; detectedAt: string; lida: boolean }`; `IncidentService.naoLidas: Signal<number>` (readonly); `IncidentService.loadNaoLidas(): void`; `IncidentService.loadNotificacoes(): Observable<Notificacao[]>`; `IncidentService.marcarLidas(alertaIds: number[]): void` — todos consumidos pela Task 2.

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar ao final de `src/app/shared/incident.service.spec.ts`, dentro do describe principal (mesmo bloco que já tem o teste `'carrega os agregados do dashboard'`):

```ts
  it('naoLidas comeca em zero e loadNaoLidas atualiza a partir do backend', () => {
    expect(service.naoLidas()).toBe(0);

    service.loadNaoLidas();

    const req = http.expectOne(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`);
    req.flush({ naoLidas: 5 });

    expect(service.naoLidas()).toBe(5);
  });

  it('loadNotificacoes busca a lista sem alterar o store de incidentes', () => {
    let recebidas: Notificacao[] = [];
    service.loadNotificacoes().subscribe(lista => (recebidas = lista));

    const req = http.expectOne(`${environment.apiUrl}/notificacoes`);
    req.flush([
      { id: 1, cameraId: 'CAM-01', type: 'FALL_RISK', severity: 4, nivel: 'ALTO',
        descricao: 'Queda detectada', detectedAt: '2026-09-07T10:00:00Z', lida: false },
    ]);

    expect(recebidas).toHaveLength(1);
    expect(recebidas[0].cameraId).toBe('CAM-01');
    expect(service.incidents()).toHaveLength(0);
  });

  it('marcarLidas envia os ids e resincroniza a contagem depois', () => {
    service.marcarLidas([1, 2]);

    const post = http.expectOne(`${environment.apiUrl}/notificacoes/marcar-lidas`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ alertaIds: [1, 2] });
    post.flush(null);

    const contagem = http.expectOne(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`);
    contagem.flush({ naoLidas: 0 });

    expect(service.naoLidas()).toBe(0);
  });
```

Adicionar ao describe `'IncidentService — SSE'`, depois do teste `'atualiza o incidente quando ele muda'`:

```ts
  it('incrementa naoLidas so em incidente novo, nao em atualizacao', () => {
    service.connect();
    criados[0].abrir();

    criados[0].emitir('incident', incidente({ id: 9, incidentKey: 'k9' }));
    expect(service.naoLidas()).toBe(1);

    criados[0].emitir('incident-changed',
      incidente({ id: 9, incidentKey: 'k9', status: 'RESOLVIDO' }));
    expect(service.naoLidas()).toBe(1);
  });
```

Adicionar o import de `Notificacao` ao topo do arquivo:

```ts
import { Incident, Notificacao, Page } from './incident.models';
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `npx vitest run src/app/shared/incident.service.spec.ts`
Expected: FALHA — `Notificacao`, `naoLidas`, `loadNaoLidas`, `loadNotificacoes`, `marcarLidas` não existem ainda.

- [ ] **Step 3: Adicionar `Notificacao` a `incident.models.ts`**

Adicionar perto da `interface Summary` (`incident.models.ts:150`):

```ts
/** Uma notificação = um Alerta com estado de leitura, para o GESTOR autenticado (spec central-notificacoes §2). */
export interface Notificacao {
  id: number;
  cameraId: string;
  type: IncidentType;
  severity: number;
  nivel: AlertaNivel;
  descricao: string;
  detectedAt: string;
  lida: boolean;
}
```

- [ ] **Step 4: Adicionar os métodos a `IncidentService`**

Adicionar o import de `Notificacao` (`incident.service.ts:7`):

```ts
import { AlertaStatus, ConnectionState, Incident, IncidentSearchFilters, Notificacao, Page, Summary } from './incident.models';
```

Adicionar logo após o bloco de `summary` (depois de `loadSummary()`, antes de `scheduleSummaryRefresh`):

```ts
  private readonly _naoLidas = signal<number>(0);

  /** Contagem de notificações não lidas — badge global do sino (spec central-notificacoes §3/§4). */
  readonly naoLidas = this._naoLidas.asReadonly();

  loadNaoLidas(): void {
    this.http.get<{ naoLidas: number }>(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`, { withCredentials: true })
      .subscribe({ next: r => this._naoLidas.set(r.naoLidas), error: () => { } });
  }

  /** Últimas 30 notificações; quem chama decide o que fazer com o resultado (não entra em nenhum store). */
  loadNotificacoes(): Observable<Notificacao[]> {
    return this.http.get<Notificacao[]>(`${environment.apiUrl}/notificacoes`, { withCredentials: true });
  }

  /** Idempotente no backend — resincroniza naoLidas ao final em vez de decrementar otimista, cobrindo qualquer divergência com o SSE. */
  marcarLidas(alertaIds: number[]): void {
    this.http.post<void>(`${environment.apiUrl}/notificacoes/marcar-lidas`, { alertaIds }, { withCredentials: true })
      .subscribe({ next: () => this.loadNaoLidas(), error: () => { } });
  }
```

- [ ] **Step 5: Diferenciar evento novo de evento atualizado em `receber()`**

Modificar o final da classe (`incident.service.ts`, método `connect()` e `receber()`):

```ts
    stream.addEventListener('incident', event => this.receber(event, true));
    stream.addEventListener('incident-changed', event => this.receber(event, false));

    this.stream = stream;
  }

  disconnect(): void {
    this.stream?.close();
    this.stream = null;
    this._connection.set('offline');
  }

  private receber(event: MessageEvent, novo: boolean): void {
    let incidente: Incident;
    try {
      incidente = JSON.parse(event.data) as Incident;
    } catch {
      // Payload malformado não pode derrubar o painel.
      return;
    }
    // Fora do try de propósito: um erro aqui é bug do store, não payload ruim,
    // e engoli-lo junto com o parse deixaria esse bug invisível.
    this.upsert(incidente);
    this.scheduleSummaryRefresh();
    if (novo) {
      this._naoLidas.update(n => n + 1);
    }
  }
```

- [ ] **Step 6: Rodar os testes para confirmar que passam**

Run: `npx vitest run src/app/shared/incident.service.spec.ts`
Expected: PASS (todos, incluindo os 4 novos)

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/incident.models.ts src/app/shared/incident.service.ts src/app/shared/incident.service.spec.ts
git commit -m "feat: adiciona Notificacao e metodos de notificacao a IncidentService"
```

---

### Task 2: `NotificationCenterComponent` (offcanvas) e wiring global no `ChromeTopbarComponent`

**Files:**
- Create: `src/app/shared/notification-center/notification-center.component.ts`
- Create: `src/app/shared/notification-center/notification-center.component.spec.ts`
- Modify: `src/app/shared/chrome-topbar/chrome-topbar.component.ts`
- Modify: `src/app/shared/chrome-topbar/chrome-topbar.component.spec.ts`
- Modify: `src/app/dashboard/dashboard.component.html` (remove `[notifBadge]="pendentes()"`)
- Modify: `src/app/incidents/incident-timeline.component.html`, `src/app/incidents/incident-detail.component.html`, `src/app/stations/stations-grid.component.html`, `src/app/stations/station-kiosk.component.html` (remove `[notifBadge]="0"`)
- Modify: `src/styles.scss` (novas classes `.notif-*`)

**Interfaces:**
- Consumes: `IncidentService.naoLidas`/`loadNaoLidas()`/`loadNotificacoes()`/`marcarLidas()` (Task 1).
- Produces: `NotificationCenterComponent` com `open = input<boolean>(false)` e `closed = output<void>()` — usado só por `ChromeTopbarComponent` nesta entrega.

- [ ] **Step 1: Escrever o teste (falhando) do `NotificationCenterComponent`**

```ts
// src/app/shared/notification-center/notification-center.component.spec.ts
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { NotificationCenterComponent } from './notification-center.component';

describe('NotificationCenterComponent', () => {
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

  function notificacao(overrides: Partial<{ id: number; lida: boolean }> = {}) {
    return {
      id: 1, cameraId: 'CAM-01', type: 'FALL_RISK', severity: 4, nivel: 'ALTO',
      descricao: 'Queda detectada', detectedAt: '2026-09-07T10:00:00Z', lida: false,
      ...overrides,
    };
  }

  it('nao busca nada enquanto fechado', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.detectChanges();

    http.expectNone(`${environment.apiUrl}/notificacoes`);
  });

  it('ao abrir, busca a lista e marca como lidas as que vieram nao-lidas', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([notificacao({ id: 1, lida: false })]);

    const marcar = http.expectOne(`${environment.apiUrl}/notificacoes/marcar-lidas`);
    expect(marcar.request.body).toEqual({ alertaIds: [1] });
    marcar.flush(null);
    http.expectOne(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`).flush({ naoLidas: 0 });

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notif-row')).not.toBeNull();
  });

  it('nao chama marcar-lidas quando a lista ja vem toda lida', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([notificacao({ id: 1, lida: true })]);

    http.expectNone(`${environment.apiUrl}/notificacoes/marcar-lidas`);
  });

  it('mostra estado vazio quando nao ha notificacao', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nenhuma notificação por aqui');
  });

  it('clicar numa notificacao navega para o incidente e fecha', () => {
    const fixture = TestBed.createComponent(NotificationCenterComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([notificacao({ id: 7, lida: true })]);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate');
    let fechou = false;
    fixture.componentRef.setInput('open', true);
    fixture.componentInstance.closed.subscribe(() => (fechou = true));

    (fixture.nativeElement.querySelector('.notif-row') as HTMLButtonElement).click();

    expect(navegar).toHaveBeenCalledWith(['/incidentes', 7]);
    expect(fechou).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx vitest run src/app/shared/notification-center/notification-center.component.spec.ts`
Expected: FALHA — arquivo `notification-center.component.ts` não existe.

- [ ] **Step 3: Criar `NotificationCenterComponent`**

```ts
// src/app/shared/notification-center/notification-center.component.ts
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';

import { formatDateTime, Notificacao } from '../incident.models';
import { IncidentService } from '../incident.service';

@Component({
  selector: 'app-notification-center',
  template: `
    @if (open()) {
      <div class="notif-backdrop" (click)="fechar()"></div>
      <aside class="notif-offcanvas" role="dialog" aria-label="Notificações">
        <header class="notif-head">
          <h2>Notificações</h2>
          <button class="icon-btn" aria-label="Fechar notificações" (click)="fechar()">×</button>
        </header>
        <div class="notif-body">
          @if (notificacoes().length === 0) {
            <p class="notif-empty">Nenhuma notificação por aqui.</p>
          } @else {
            @for (n of notificacoes(); track n.id) {
              <button class="list-row notif-row" [class.unread]="!n.lida" (click)="abrir(n)">
                <span class="chip">{{ n.type }}</span>
                <span class="notif-desc">{{ n.descricao }}</span>
                <span class="notif-meta">{{ n.cameraId }} · {{ formatDateTime(n.detectedAt) }}</span>
              </button>
            }
          }
        </div>
      </aside>
    }
  `,
})
export class NotificationCenterComponent {
  open = input<boolean>(false);
  closed = output<void>();

  private incidentService = inject(IncidentService);
  private router = inject(Router);

  readonly notificacoes = signal<Notificacao[]>([]);
  readonly formatDateTime = formatDateTime;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.carregar();
      }
    });
  }

  private carregar(): void {
    this.incidentService.loadNotificacoes().subscribe(lista => {
      this.notificacoes.set(lista);
      const naoLidas = lista.filter(n => !n.lida).map(n => n.id);
      if (naoLidas.length > 0) {
        this.incidentService.marcarLidas(naoLidas);
      }
    });
  }

  abrir(n: Notificacao): void {
    this.router.navigate(['/incidentes', n.id]);
    this.fechar();
  }

  fechar(): void {
    this.closed.emit();
  }
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `npx vitest run src/app/shared/notification-center/notification-center.component.spec.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Adicionar as classes novas a `src/styles.scss`**

Adicionar perto de `.list-row` (`styles.scss:812`):

```scss
.notif-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 40; }
.notif-offcanvas { position: fixed; top: 0; right: 0; bottom: 0; width: 360px; max-width: 92vw; background: var(--surface); border-left: 1px solid var(--line-2); box-shadow: -12px 0 32px rgba(0,0,0,0.28); z-index: 41; display: flex; flex-direction: column; }
.notif-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--line); }
.notif-head h2 { font-size: 15px; margin: 0; }
.notif-body { flex: 1; overflow-y: auto; padding: 12px; }
.notif-empty { color: var(--ink-mute); font-size: 13px; padding: 24px 12px; text-align: center; }
.notif-row { width: 100%; text-align: left; border: none; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.notif-row.unread { border-left: 3px solid var(--accent); }
.notif-desc { font-size: 13px; color: var(--ink); }
.notif-meta { font-size: 11px; color: var(--ink-mute); font-family: var(--mono); }
```

- [ ] **Step 6: Atualizar `ChromeTopbarComponent`**

Remover `notifBadge = input<number>(0);` e adicionar, no lugar (junto dos outros `inject`):

```ts
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { IncidentService } from '../incident.service';
import { NotificationCenterComponent } from '../notification-center/notification-center.component';
import { ThemeService } from '../theme.service';
```

Trocar `imports: [RouterLink],` por `imports: [RouterLink, NotificationCenterComponent],`.

Trocar o botão de sino:

```html
        @if (auth.role() === 'GESTOR') {
          <button class="icon-btn" aria-label="Notificações" data-test="open-notifications"
                  (click)="notifOpen.set(true)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 16c0-7 1.5-10 6-10s6 3 6 10"/><path d="M4.5 16h15"/><path d="M10.5 19a1.5 1.5 0 0 0 3 0"/>
            </svg>
            @if (notifBadge() > 0) {
              <span class="bdg">{{ notifBadge() }}</span>
            }
          </button>
        }
```

Adicionar ao final do template, depois de `</header>`:

```html
    <app-notification-center [open]="notifOpen()" (closed)="notifOpen.set(false)" />
```

No corpo da classe, remover `notifBadge = input<number>(0);` e adicionar:

```ts
  private incidentService = inject(IncidentService);

  notifOpen = signal(false);
  notifBadge = computed(() => this.incidentService.naoLidas());
```

E no `constructor` (criar um, se não existir — hoje a classe não tem):

```ts
  constructor() {
    effect(() => {
      if (this.auth.role() === 'GESTOR') {
        this.incidentService.loadNaoLidas();
      }
    });
  }
```

- [ ] **Step 7: Remover os bindings de `notifBadge` das páginas que o alimentavam manualmente**

`dashboard.component.html:3` — remover só `[notifBadge]="pendentes()"` (a linha continua com os outros atributos); `pendentes` continua em uso no resto do template (KPI e mensagem de topo), não remover o `computed` de `dashboard.component.ts`.

`incident-timeline.component.html:2`, `incident-detail.component.html:2`, `stations-grid.component.html:2`, `station-kiosk.component.html:2` — remover `[notifBadge]="0"` de cada um.

- [ ] **Step 8: Corrigir `chrome-topbar.component.spec.ts`**

O primeiro `describe` já provê `provideHttpClient(withFetch())`/`provideHttpClientTesting()` — só precisa passar a esperar e liberar a nova requisição de contagem sempre que monta como GESTOR. Atualizar `montarComo`:

```ts
  function montarComo(papel: 'GESTOR' | 'OPERADOR' | null) {
    const fixture = TestBed.createComponent(ChromeTopbarComponent);
    fixture.detectChanges();
    const req = http.expectOne(`${environment.apiUrl}/auth/me`);
    if (papel === 'GESTOR') {
      req.flush({ papel: 'GESTOR', username: 'g1' });
      fixture.detectChanges();
      http.expectOne(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`).flush({ naoLidas: 0 });
    } else if (papel === 'OPERADOR') {
      req.flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
    } else {
      req.flush(null, { status: 401, statusText: 'Unauthorized' });
    }
    fixture.detectChanges();
    return fixture;
  }
```

O segundo `describe` ("nome da empresa") cria `ChromeTopbarComponent` sem `provideHttpClient`/`provideHttpClientTesting` — agora que a classe injeta `IncidentService` (que injeta `HttpClient`), isso quebra a criação do componente. Adicionar os dois providers às duas chamadas de `TestBed.configureTestingModule` desse describe:

```ts
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]),
        provideHttpClient(withFetch()), provideHttpClientTesting(),
        { provide: AuthService, useValue: authStub }],
    });
```

(nas duas ocorrências desse describe). Como `authStub.role` é `'GESTOR'` fixo nesses dois testes, `loadNaoLidas()` dispara — adicionar, logo após o primeiro `fixture.detectChanges()` de cada teste, a liberação da requisição:

```ts
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`).flush({ naoLidas: 0 });
```

Adicionar também o teste que faltava para o novo comportamento (no primeiro describe, junto dos outros `it`):

```ts
  it('para OPERADOR, nao aparece o sino de notificacoes nem chama a contagem', () => {
    const fixture = montarComo('OPERADOR');

    expect(fixture.nativeElement.querySelector('[data-test="open-notifications"]')).toBeNull();
    http.expectNone(`${environment.apiUrl}/notificacoes/contagem-nao-lidas`);
  });

  it('clicar no sino abre a central de notificacoes', () => {
    const fixture = montarComo('GESTOR');
    const sino: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="open-notifications"]');

    sino.click();
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/notificacoes`).flush([]);
    expect(fixture.nativeElement.querySelector('.notif-offcanvas')).not.toBeNull();
  });
```

- [ ] **Step 9: Rodar os testes do chrome-topbar e da suíte inteira**

Run: `npx vitest run src/app/shared/chrome-topbar/chrome-topbar.component.spec.ts`
Expected: PASS (todos, incluindo os 2 novos)

Run: `npx vitest run`
Expected: PASS, nenhuma regressão nas páginas que tiveram o binding `[notifBadge]` removido

- [ ] **Step 10: Commit**

```bash
git add src/app/shared/notification-center/ src/app/shared/chrome-topbar/ \
        src/app/dashboard/dashboard.component.html \
        src/app/incidents/incident-timeline.component.html src/app/incidents/incident-detail.component.html \
        src/app/stations/stations-grid.component.html src/app/stations/station-kiosk.component.html \
        src/styles.scss
git commit -m "feat: liga o sino de notificacoes a uma central real (offcanvas + badge global)"
```

---

### Task 3: Revisão de design e arquitetura de informação (skill `frontend-design`)

**Files:**
- Modify (se a revisão encontrar ajustes): `src/app/shared/notification-center/notification-center.component.ts`, `src/app/shared/chrome-topbar/chrome-topbar.component.ts`, `src/styles.scss`

**Interfaces:**
- Consumes: o resultado combinado das Tasks 1–2 (offcanvas funcional, badge global).

- [ ] **Step 1: Rodar a aplicação localmente com o backend do plano `cna` no ar**

Abrir a central em pelo menos duas larguras de tela (desktop e uma mais estreita), com a lista vazia e com notificações reais, para avaliar o offcanvas como primitivo visual novo.

- [ ] **Step 2: Invocar a skill `frontend-design` para revisar a tela como um todo**

Peça uma revisão de design guiada pela skill `frontend-design`, cobrindo especificamente:
- Se `.notif-offcanvas`/`.notif-backdrop` (primitivo novo, sem equivalente anterior) se encaixam visualmente com o resto do chrome escuro/claro (`--surface`, `--line-2`, `--accent` já usados em outros painéis) nos dois temas.
- Se `.notif-row.unread` (borda de 3px como único sinal de não-lido) é suficiente ou precisa de reforço (ex: peso de fonte, ponto indicador).
- Hierarquia dentro de cada linha: `.chip` do tipo, descrição, `cameraId`/hora — está lendo na ordem certa?
- Comportamento em telas estreitas (largura fixa de 360px pode estourar em mobile — `max-width: 92vw` já mitiga, mas vale conferir visualmente).
- Estado vazio (`Nenhuma notificação por aqui`) — está visualmente consistente com outros estados vazios do projeto (ex: Timeline sem resultado)?

- [ ] **Step 3: Aplicar os ajustes encontrados**

Para cada ajuste, editar o arquivo apontado pela skill e rodar `npx vitest run` depois de cada mudança, confirmando que nenhum teste quebrou.

- [ ] **Step 4: Commit**

Mesmo que a revisão não encontre nenhum ajuste, registrar isso explicitamente — "sem achados" é um resultado válido e deve ser commitado como tal (mesmo padrão já usado nas entregas `e6b`/`hfb`):

```bash
git add -A
git commit -m "fix: revisao de design da central de notificacoes (frontend-design)"
```

Se não houver nenhuma mudança de arquivo, criar um commit vazio documentando a revisão:

```bash
git commit --allow-empty -m "chore: revisao de design da central de notificacoes (frontend-design) - sem achados"
```

---

## Self-Review

**Cobertura da spec:** §1 (toda notificação = todo alerta, só GESTOR) → Task 2, guard `auth.role() === 'GESTOR'` no sino e no `constructor` do topbar. §2/§3 (modelo e endpoints do backend) → consumidos pela Task 1 (`IncidentService`), não reimplementados no front. §4 (offcanvas global, badge reativo ao SSE, marcar-lidas automático ao abrir, item linka pro alerta) → Tasks 1–2 por completo. §5 (falha de marcar-lidas não quebra nada — o item soubesse não lido de novo na próxima abertura; múltiplas abas não sincronizam em tempo real) → comportamento natural de `marcarLidas`/`loadNotificacoes` não terem estado otimista de "já marquei", apenas dependerem do que o backend confirma na próxima chamada; nenhuma implementação extra necessária, mas vale documentado aqui para quem revisar não achar que faltou algo. §6 (fora de escopo) → nenhuma task implementa nada disso. §7 (janela fixa de 30) → responsabilidade do backend (`cna`), o front só renderiza o que vier.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todo step tem código completo.

**Type consistency:** `Notificacao` definido na Task 1 é usado sem alteração de forma em `NotificationCenterComponent` (Task 2); `IncidentService.loadNotificacoes()`/`marcarLidas()`/`naoLidas` mantêm a mesma assinatura entre a task que os cria e a que os consome.

## Execution Handoff

Plano completo e salvo em `docs/superpowers/plans/central-notificacoes/2026-09-07-cnb-front-notificacoes.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — dispatch de um subagente por tarefa, revisão entre tarefas, iteração rápida.

**2. Inline Execution** — execução em lote nesta sessão via `executing-plans`, com checkpoints de revisão.

Qual abordagem?
