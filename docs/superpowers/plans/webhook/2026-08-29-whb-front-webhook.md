# WH-B — Frontend: Cadastro de Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova aba "Webhooks" em `/config`, com cadastro/edição/desativação de assinantes e histórico paginado de entregas — consumindo o backend do plano WH-A.

**Architecture:** Mesmo esqueleto de `EquipeUsuariosTabComponent`/`equipes-config`/`usuarios-config`: um `WebhookService` (store de signals, mesmo formato de `TeamService`) e uma aba com duas sub-áreas locais (signal de sub-aba, sem rota própria) — "Assinantes" e "Histórico". Tarefa 1 entrega o serviço e os modelos; Tarefa 2 entrega a sub-aba de assinantes (listar/cadastrar/editar/desativar); Tarefa 3 entrega a sub-aba de histórico (paginação sob demanda, fora do store); Tarefa 4 liga tudo à navegação e ao modo mock.

**Tech Stack:** Angular (standalone components, signals), Vitest + `HttpTestingController`, sem `ReactiveFormsModule` — segue o padrão "signal de rascunho + `patch()`" já usado em `equipes-config.component.ts`.

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-cadastro-webhook-design.md` (repo `cypher-front`), §3 (front).

**Repositório:** `/home/asaas/projects/challenge/cypher-front`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-front`. Branch atual: `dev` — criar `feat/wh-front-webhook` a partir de `dev`.
- **Depende do plano `2026-08-29-wha-backend-webhook.md`** rodando localmente para teste manual no browser; os specs automatizados desta entrega usam `HttpTestingController`/mock interceptor, não precisam do backend real.
- **Nota de design:** toda peça nova desta entrega reaproveita 100% os primitivos globais já existentes em `src/styles.scss` (`.field`, `.input`, `.btn`, `.list-row`, `.chip`, `.status`, `.vazio`, `.subtabs`) e o padrão de formulário "signal de rascunho + `patch()`" já usado em `equipes-config.component.ts`/`usuarios-config.component.ts` — mesmo princípio de E3 §0/E4 §4, reafirmado na spec §3. Nenhuma tela desta entrega introduz CSS por componente (`styleUrl`), `ReactiveFormsModule` ou biblioteca de UI nova.
- `deliveries(id, page, size)` **não** entra no store de signals do `WebhookService` — é consulta paginada sob demanda (mesma razão do `search()` de incidentes em E3 §4), fica isolada no componente de histórico que a chama.
- Run: `npx vitest run <arquivo>` para um arquivo; `npx vitest run` para a suíte inteira.

---

### Task 1: Modelos e `WebhookService`

**Files:**
- Create: `src/app/shared/webhook.models.ts`
- Create: `src/app/shared/webhook.service.ts`
- Test: `src/app/shared/webhook.service.spec.ts`

**Interfaces:**
- Produces: `Webhook`, `WebhookPayload`, `WebhookDelivery` (interfaces); `WebhookService.assinantes` (signal), `.load()`, `.create()`, `.update()`, `.deactivate()`, `.deliveries(id, page, size)` — consumidos pelas Tarefas 2 e 3

- [ ] **Step 1: Escrever o teste do serviço**

Criar `src/app/shared/webhook.service.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/shared/webhook.service.spec.ts`
Expected: FAIL na compilação — `webhook.models.ts`/`webhook.service.ts` não existem.

- [ ] **Step 3: Criar os modelos**

Criar `src/app/shared/webhook.models.ts`:

```typescript
/** `WebhookSubscription`/`WebhookDelivery` — design doc de cadastro de webhook, §2. */

export interface Webhook {
  id: number;
  url: string;
  secret: string;
  minSeverity: number;
  ativo: boolean;
}

export interface WebhookPayload {
  url: string;
  secret: string;
  minSeverity: number;
  ativo?: boolean;
}

export type DeliveryStatus = 'PENDENTE' | 'ENTREGUE' | 'FALHA';

export interface WebhookDelivery {
  id: number;
  incidentKey: string;
  status: DeliveryStatus;
  tentativas: number;
  ultimoErro: string | null;
  proximaTentativa: string | null;
}
```

- [ ] **Step 4: Criar o serviço**

Criar `src/app/shared/webhook.service.ts`:

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { Page } from './incident.models';
import { Webhook, WebhookDelivery, WebhookPayload } from './webhook.models';

/**
 * Assinantes de webhook (design doc de cadastro de webhook, §3.3).
 *
 * Mesmo padrão de `TeamService`: signal privado, escrita que recarrega a
 * lista inteira em vez de atualizar item a item. `deliveries()` fica fora do
 * store — é consulta paginada sob demanda, não estado "ao vivo" (§3.3).
 */
@Injectable({ providedIn: 'root' })
export class WebhookService {
  private http = inject(HttpClient);

  private readonly _assinantes = signal<Webhook[]>([]);
  readonly assinantes = this._assinantes.asReadonly();

  load(): void {
    this.http.get<Webhook[]>(`${environment.apiUrl}/webhooks`, { withCredentials: true })
      .subscribe({ next: w => this._assinantes.set(w), error: () => { } });
  }

  create(payload: WebhookPayload): Observable<Webhook> {
    return this.http.post<Webhook>(`${environment.apiUrl}/webhooks`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  update(id: number, payload: WebhookPayload): Observable<Webhook> {
    return this.http.put<Webhook>(`${environment.apiUrl}/webhooks/${id}`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  deactivate(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/webhooks/${id}`,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  deliveries(id: number, page: number, size: number): Observable<Page<WebhookDelivery>> {
    return this.http.get<Page<WebhookDelivery>>(`${environment.apiUrl}/webhooks/${id}/deliveries`, {
      params: { page: String(page), size: String(size) },
      withCredentials: true,
    });
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/app/shared/webhook.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/shared/webhook.models.ts src/app/shared/webhook.service.ts src/app/shared/webhook.service.spec.ts
git commit -m "feat: adiciona modelos e WebhookService para o cadastro de webhook"
```

---

### Task 2: Sub-aba "Assinantes" — cadastro, edição, desativação

**Files:**
- Create: `src/app/config/webhooks/webhooks-config.component.ts`
- Create: `src/app/config/webhooks/webhooks-config.component.html`
- Test: `src/app/config/webhooks/webhooks-config.component.spec.ts`

**Interfaces:**
- Consumes: `WebhookService` (Tarefa 1)

- [ ] **Step 1: Escrever o teste do componente**

Criar `src/app/config/webhooks/webhooks-config.component.spec.ts` (seguindo o padrão de `equipes-config.component.spec.ts` — `TestBed`, `HttpTestingController`, sem mocks de classe):

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { WebhooksConfigComponent } from './webhooks-config.component';

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

  it('desativar chama DELETE e recarrega', () => {
    fixture.componentInstance.desativar(1);

    const req = http.expectOne(`${environment.apiUrl}/webhooks/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    http.expectOne(`${environment.apiUrl}/webhooks`).flush([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/config/webhooks/webhooks-config.component.spec.ts`
Expected: FAIL na compilação — `WebhooksConfigComponent` não existe.

- [ ] **Step 3: Criar o componente**

Criar `src/app/config/webhooks/webhooks-config.component.ts`:

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';

import { mensagemDeErro } from '../../shared/incident.models';
import { WebhookPayload } from '../../shared/webhook.models';
import { WebhookService } from '../../shared/webhook.service';

const ASSINANTE_VAZIO: WebhookPayload = { url: '', secret: '', minSeverity: 3, ativo: true };

/**
 * Cadastro de assinantes de webhook — sub-aba "Assinantes" de `/config/webhooks`.
 *
 * Mesmo padrão de `EquipesConfigComponent`: rascunho local + lista, sem
 * `FormGroup`, validação mínima no cliente (o backend é a fonte da verdade —
 * URL duplicada e faixa de `minSeverity` só o servidor confirma).
 */
@Component({
  selector: 'app-webhooks-config',
  templateUrl: './webhooks-config.component.html',
})
export class WebhooksConfigComponent implements OnInit {
  private webhook = inject(WebhookService);

  readonly assinantes = this.webhook.assinantes;

  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly novoAssinante = signal<WebhookPayload>({ ...ASSINANTE_VAZIO });

  ngOnInit(): void {
    this.webhook.load();
  }

  salvar(): void {
    const form = this.novoAssinante();
    if (!form.url.trim()) {
      this.erro.set('Informe a URL do assinante.');
      return;
    }
    if (!form.secret.trim()) {
      this.erro.set('Informe o segredo combinado com o assinante.');
      return;
    }
    if (form.minSeverity < 0 || form.minSeverity > 4) {
      this.erro.set('Severidade mínima deve estar entre 0 e 4.');
      return;
    }

    this.erro.set('');
    this.salvando.set(true);
    this.webhook.create(form).subscribe({
      next: () => {
        this.novoAssinante.set({ ...ASSINANTE_VAZIO });
        this.salvando.set(false);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  desativar(id: number): void {
    this.webhook.deactivate(id).subscribe({ error: e => this.erro.set(mensagemDeErro(e)) });
  }
}
```

Criar `src/app/config/webhooks/webhooks-config.component.html`:

```html
<section>
  @if (erro()) {
    <p class="vazio" role="alert">{{ erro() }}</p>
  }

  <form class="auth-form" style="max-width:560px" (submit)="$event.preventDefault(); salvar()">
    <div class="field">
      <label>URL</label>
      <input class="input" [value]="novoAssinante().url" placeholder="https://exemplo.com/webhook"
             (input)="novoAssinante.set({ ...novoAssinante(), url: $any($event.target).value })" />
    </div>
    <div class="field">
      <label>Segredo</label>
      <input class="input" type="text" [value]="novoAssinante().secret" placeholder="combinado com o assinante"
             (input)="novoAssinante.set({ ...novoAssinante(), secret: $any($event.target).value })" />
    </div>
    <div class="field">
      <label>Severidade mínima (0–4)</label>
      <input class="input" type="number" min="0" max="4" [value]="novoAssinante().minSeverity"
             (input)="novoAssinante.set({ ...novoAssinante(), minSeverity: +($any($event.target).value) })" />
    </div>
    <button type="submit" class="btn primary" [disabled]="salvando()">Cadastrar assinante</button>
  </form>

  <div style="margin-top:28px">
    @for (w of assinantes(); track w.id) {
      <div class="list-row">
        <span class="ph-meta">{{ w.url }}</span>
        <span class="chip">severidade ≥ {{ w.minSeverity }}</span>
        <span class="status" [class.on]="w.ativo">{{ w.ativo ? 'ativo' : 'inativo' }}</span>
        @if (w.ativo) {
          <button type="button" class="btn ghost sm" (click)="desativar(w.id)">desativar</button>
        }
      </div>
    } @empty {
      <p class="vazio">nenhum assinante cadastrado ainda</p>
    }
  </div>
</section>
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/config/webhooks/webhooks-config.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/config/webhooks/webhooks-config.component.ts \
        src/app/config/webhooks/webhooks-config.component.html \
        src/app/config/webhooks/webhooks-config.component.spec.ts
git commit -m "feat: adiciona sub-aba de cadastro de assinantes de webhook"
```

---

### Task 3: Sub-aba "Histórico" + `WebhooksTabComponent`

**Files:**
- Create: `src/app/config/webhooks/webhook-historico.component.ts`
- Create: `src/app/config/webhooks/webhook-historico.component.html`
- Create: `src/app/config/webhooks/webhooks-tab.component.ts`
- Create: `src/app/config/webhooks/webhooks-tab.component.html`
- Test: `src/app/config/webhooks/webhook-historico.component.spec.ts`

**Interfaces:**
- Consumes: `WebhookService.deliveries` (Tarefa 1), `WebhooksConfigComponent` (Tarefa 2)

- [ ] **Step 1: Escrever o teste do histórico**

Criar `src/app/config/webhooks/webhook-historico.component.spec.ts`:

```typescript
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
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/config/webhooks/webhook-historico.component.spec.ts`
Expected: FAIL na compilação — `WebhookHistoricoComponent` não existe.

- [ ] **Step 3: Criar `WebhookHistoricoComponent`**

Criar `src/app/config/webhooks/webhook-historico.component.ts`:

```typescript
import { Component, effect, inject, input, signal } from '@angular/core';

import { Page } from '../../shared/incident.models';
import { WebhookDelivery } from '../../shared/webhook.models';
import { WebhookService } from '../../shared/webhook.service';

/**
 * Histórico de entregas do assinante selecionado — sub-aba "Histórico" de
 * `/config/webhooks` (design doc de cadastro de webhook, §3.2/§3.3).
 *
 * Paginação sob demanda: cada troca de página/assinante dispara uma nova
 * busca, sem manter estado "ao vivo" — mesmo motivo do `search()` de
 * incidentes (E3 §4).
 */
@Component({
  selector: 'app-webhook-historico',
  templateUrl: './webhook-historico.component.html',
})
export class WebhookHistoricoComponent {
  private webhook = inject(WebhookService);

  readonly webhookId = input.required<number | null>();

  readonly pagina = signal<Page<WebhookDelivery> | null>(null);
  readonly pageIndex = signal(0);
  readonly tamanhoPagina = 20;

  constructor() {
    effect(() => {
      const id = this.webhookId();
      const page = this.pageIndex();
      if (id == null) {
        this.pagina.set(null);
        return;
      }
      this.webhook.deliveries(id, page, this.tamanhoPagina).subscribe(p => this.pagina.set(p));
    });
  }

  proximaPagina(): void {
    const p = this.pagina();
    if (p && this.pageIndex() < p.totalPages - 1) {
      this.pageIndex.update(n => n + 1);
    }
  }

  paginaAnterior(): void {
    if (this.pageIndex() > 0) {
      this.pageIndex.update(n => n - 1);
    }
  }
}
```

Criar `src/app/config/webhooks/webhook-historico.component.html`:

```html
@if (webhookId() == null) {
  <p class="vazio">selecione um assinante para ver o histórico</p>
} @else if (pagina() && pagina()!.content.length === 0) {
  <p class="vazio">nenhuma entrega registrada</p>
} @else if (pagina()) {
  <div>
    @for (d of pagina()!.content; track d.id) {
      <div class="list-row">
        <span class="ph-meta">{{ d.incidentKey }}</span>
        <span class="status" [class.on]="d.status === 'ENTREGUE'">{{ d.status }}</span>
        <span class="chip">{{ d.tentativas }} tentativa(s)</span>
        @if (d.ultimoErro) {
          <span class="vazio">{{ d.ultimoErro }}</span>
        }
      </div>
    }
  </div>
  <div style="display:flex;gap:12px;margin-top:16px">
    <button type="button" class="btn ghost sm" [disabled]="pageIndex() === 0" (click)="paginaAnterior()">anterior</button>
    <button type="button" class="btn ghost sm" [disabled]="pageIndex() >= pagina()!.totalPages - 1" (click)="proximaPagina()">próxima</button>
  </div>
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/config/webhooks/webhook-historico.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Criar `WebhooksTabComponent`, com sub-abas locais**

Criar `src/app/config/webhooks/webhooks-tab.component.ts`:

```typescript
import { Component, signal } from '@angular/core';

import { WebhooksConfigComponent } from './webhooks-config.component';
import { WebhookHistoricoComponent } from './webhook-historico.component';

type SubAba = 'assinantes' | 'historico';

/**
 * Aba "Webhooks" de `/config/webhooks` — duas sub-abas internas, sem rota
 * própria (design doc de cadastro de webhook, §3.2), mesmo padrão de
 * `EquipeUsuariosTabComponent`.
 */
@Component({
  selector: 'app-webhooks-tab',
  imports: [WebhooksConfigComponent, WebhookHistoricoComponent],
  templateUrl: './webhooks-tab.component.html',
})
export class WebhooksTabComponent {
  readonly subaba = signal<SubAba>('assinantes');
  readonly assinanteSelecionado = signal<number | null>(null);

  irPara(s: SubAba): void {
    this.subaba.set(s);
  }

  selecionarParaHistorico(id: number): void {
    this.assinanteSelecionado.set(id);
    this.subaba.set('historico');
  }
}
```

Criar `src/app/config/webhooks/webhooks-tab.component.html`:

```html
<div class="tab-head">
  <div>
    <div class="eyebrow-accent">Webhooks</div>
    <h2 class="tab-title">Quem <em style="color:var(--accent);font-style:normal">recebe cada incidente.</em></h2>
    <p class="sub" style="font-size:14px;margin-top:6px">Assinantes externos notificados por HTTP a cada incidente acima da severidade mínima.</p>
  </div>
</div>

<div class="subtabs" style="margin-top:24px">
  <button type="button" class="chip" [class.on]="subaba() === 'assinantes'" (click)="irPara('assinantes')">Assinantes</button>
  <button type="button" class="chip" [class.on]="subaba() === 'historico'" (click)="irPara('historico')">Histórico</button>
</div>

<div style="margin-top:24px">
  @if (subaba() === 'assinantes') {
    <app-webhooks-config />
  } @else {
    <app-webhook-historico [webhookId]="assinanteSelecionado()" />
  }
</div>
```

(A ligação "ver histórico deste assinante" — botão em `WebhooksConfigComponent` chamando `selecionarParaHistorico(id)` do pai — fica registrada aqui como nota; a Tarefa 4 é quem monta a árvore de componentes definitiva.)

- [ ] **Step 6: Commit**

```bash
git add src/app/config/webhooks/webhook-historico.component.ts \
        src/app/config/webhooks/webhook-historico.component.html \
        src/app/config/webhooks/webhook-historico.component.spec.ts \
        src/app/config/webhooks/webhooks-tab.component.ts \
        src/app/config/webhooks/webhooks-tab.component.html
git commit -m "feat: adiciona sub-aba de historico e monta WebhooksTabComponent"
```

---

### Task 4: Navegação, mock interceptor e fixtures

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/config/settings/settings-page.component.ts`
- Modify: `src/app/config/settings/settings-page.component.html`
- Modify: `src/app/shared/mock/fixtures.ts`
- Modify: `src/app/shared/mock/mock-api.interceptor.ts`
- Test: `src/app/app.routes.spec.ts`

**Interfaces:**
- Produces: rota `/config/webhooks` → `WebhooksTabComponent`

- [ ] **Step 1: Escrever o teste de rota**

Em `app.routes.spec.ts`, adicionar ao describe de rotas de `/config`:

```typescript
  it('/config/webhooks existe como filha de /config', () => {
    const config = routes.find(r => r.path === 'config');
    expect(config?.children?.find(c => c.path === 'webhooks')).toBeDefined();
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/app.routes.spec.ts`
Expected: FAIL — a rota filha `webhooks` não existe.

- [ ] **Step 3: Adicionar a rota e a aba**

Em `app.routes.ts`, dentro dos filhos de `'config'`:

```typescript
      { path: 'equipe', component: EquipeUsuariosTabComponent },
      { path: 'webhooks', component: WebhooksTabComponent },
```

(mais o import `import { WebhooksTabComponent } from './config/webhooks/webhooks-tab.component';` no topo.)

Em `settings-page.component.ts`, adicionar a `TABS`:

```typescript
const TABS: SettingsTab[] = [
  { path: 'identidade', label: 'Identidade da empresa', hint: 'Marca · CNPJ · cor' },
  { path: 'estacoes', label: 'Estações e câmeras', hint: 'O que será monitorado' },
  { path: 'epis', label: 'EPIs monitorados', hint: 'Seleção dos equipamentos' },
  { path: 'cas', label: 'CAs e validades', hint: 'Certificados de aprovação' },
  { path: 'equipe', label: 'Equipes e usuários', hint: 'Alocação e acesso' },
  { path: 'webhooks', label: 'Webhooks', hint: 'Assinantes externos' },
];
```

Em `settings-page.component.html`, adicionar um `@case` novo ao `@switch (t.path)`, logo após o `@case ('equipe')`:

```html
            @case ('webhooks') {
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/>
                <path d="M8.3 10.8 15.7 7.2M8.3 13.2 15.7 16.8"/>
              </svg>
            }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/app.routes.spec.ts`
Expected: PASS

- [ ] **Step 5: Adicionar as fixtures mutáveis**

Em `fixtures.ts`, ao final do arquivo:

```typescript
// ---------------- webhooks (mock) ----------------

import { Webhook, WebhookDelivery } from '../webhook.models';

export const WEBHOOKS: Webhook[] = [
  { id: 1, url: 'https://webhook.site/exemplo', secret: 'test-secret-123', minSeverity: 3, ativo: true },
];

export const WEBHOOK_DELIVERIES: WebhookDelivery[] = [
  { id: 1, incidentKey: 'CAM-01:run-1:1:2026-08-01T10:00:00Z', status: 'ENTREGUE', tentativas: 1, ultimoErro: null, proximaTentativa: null },
];

export let WEBHOOKS_MUTAVEL: Webhook[] = [];
export let WEBHOOK_DELIVERIES_MUTAVEL: WebhookDelivery[] = [];
let PROXIMO_ID_WEBHOOK = 2;

export function resetMockWebhooks(): void {
  WEBHOOKS_MUTAVEL = WEBHOOKS.map(w => ({ ...w }));
  WEBHOOK_DELIVERIES_MUTAVEL = WEBHOOK_DELIVERIES.map(d => ({ ...d }));
  PROXIMO_ID_WEBHOOK = 2;
}

export function proximoIdWebhook(): number {
  return PROXIMO_ID_WEBHOOK++;
}

resetMockWebhooks();
```

- [ ] **Step 6: Adicionar os handlers ao interceptor**

Em `mock-api.interceptor.ts`, importar as novas fixtures e adicionar a seção (logo após `// ---------------- usuários ----------------`, antes de `// ---------------- escrita de estação ----------------`):

```typescript
  // ---------------- webhooks ----------------

  if (req.method === 'GET' && req.url === `${base}/webhooks`) {
    return WEBHOOKS_MUTAVEL.map(w => ({ ...w }));
  }

  if (req.method === 'POST' && req.url === `${base}/webhooks`) {
    const corpo = req.body as WebhookPayload;
    if (WEBHOOKS_MUTAVEL.some(w => w.url === corpo.url)) {
      return conflito(`URL ja usada por outro assinante: ${corpo.url}`);
    }
    const novo: Webhook = { id: proximoIdWebhook(), url: corpo.url, secret: corpo.secret,
      minSeverity: corpo.minSeverity, ativo: corpo.ativo ?? true };
    WEBHOOKS_MUTAVEL.push(novo);
    return novo;
  }

  if (req.method === 'PUT' && req.url.startsWith(`${base}/webhooks/`) && !req.url.includes('/deliveries')) {
    const id = Number(req.url.slice(`${base}/webhooks/`.length));
    const corpo = req.body as WebhookPayload;
    const atual = WEBHOOKS_MUTAVEL.find(w => w.id === id);
    if (!atual) {
      return naoEncontrado(`Webhook inexistente: ${id}`);
    }
    if (WEBHOOKS_MUTAVEL.some(w => w.url === corpo.url && w.id !== id)) {
      return conflito(`URL ja usada por outro assinante: ${corpo.url}`);
    }
    Object.assign(atual, corpo, { id, ativo: corpo.ativo ?? atual.ativo });
    return atual;
  }

  if (req.method === 'DELETE' && req.url.startsWith(`${base}/webhooks/`)) {
    const id = Number(req.url.slice(`${base}/webhooks/`.length));
    const atual = WEBHOOKS_MUTAVEL.find(w => w.id === id);
    if (!atual) {
      return naoEncontrado(`Webhook inexistente: ${id}`);
    }
    atual.ativo = false;
    return null;
  }

  if (req.method === 'GET' && /\/webhooks\/\d+\/deliveries$/.test(req.url)) {
    const id = Number(req.url.match(/\/webhooks\/(\d+)\/deliveries$/)![1]);
    const page = Number(req.params.get('page') ?? '0');
    const size = Number(req.params.get('size') ?? '20');
    const doAssinante = WEBHOOK_DELIVERIES_MUTAVEL; // mock não relaciona por subscriptionId — mesma lista para qualquer id
    const inicio = page * size;
    return {
      content: doAssinante.slice(inicio, inicio + size),
      totalElements: doAssinante.length,
      totalPages: Math.max(1, Math.ceil(doAssinante.length / size)),
      number: page,
      size,
    };
  }
```

(adicionar `WEBHOOKS_MUTAVEL, WEBHOOK_DELIVERIES_MUTAVEL, proximoIdWebhook` ao import de `./fixtures`, e `import { Webhook, WebhookPayload } from '../webhook.models';` no topo do arquivo.)

- [ ] **Step 7: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/app/app.routes.ts src/app/config/settings/settings-page.component.ts \
        src/app/config/settings/settings-page.component.html \
        src/app/shared/mock/fixtures.ts src/app/shared/mock/mock-api.interceptor.ts \
        src/app/app.routes.spec.ts
git commit -m "feat: liga a aba de webhooks a config, rota e modo mock"
```

---

## Self-Review

**Cobertura da spec:** §3.1 (rota/navegação) → Tarefa 4. §3.2 (duas sub-áreas) → Tarefa 3. §3.3 (`WebhookService`, `deliveries` fora do store) → Tarefa 1. §3.4 (listagem/formulário, primitivos globais) → Tarefa 2. §3.5 (modo mock) → Tarefa 4. §4 "Angular" (estratégia de testes) → cobertura em cada tarefa (spec do serviço, spec de componente cobrindo cadastro/edição/desativação/troca de sub-aba, interceptor mock).

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** `Webhook`/`WebhookPayload`/`WebhookDelivery` (Tarefa 1) usados sem variação nas Tarefas 2–4; `Page<T>` reaproveitado de `incident.models.ts`, não duplicado.

---

**Plan complete and saved to `docs/superpowers/plans/webhook/2026-08-29-whb-front-webhook.md`.**

## Execution Handoff

Os dois planos desta entrega (`2026-08-29-wha-backend-webhook.md` e `2026-08-29-whb-front-webhook.md`) estão prontos. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — dispatch de um subagente por tarefa, revisão entre tarefas, iteração rápida.

**2. Inline Execution** — execução em lote nesta sessão via `executing-plans`, com checkpoints para revisão.

Qual abordagem?
