# MCE — Tela de gestão de credenciais MCP (front) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova aba "Credenciais MCP" em `/config/mcp`, dentro da área de configuração da empresa já onboardada, replicando 1:1 o padrão estrutural/visual/de testes da aba de webhooks já existente — listar credenciais, criar uma (mostrando o secret uma única vez) e revogar.

**Architecture:** `McpCredentialService` (signal + HttpClient, mesmo padrão de `WebhookService`) consumido por `McpTabComponent` (casca da aba, sem sub-abas) e `McpConfigComponent` (formulário + lista + bloco de exibição única do secret). Registrado como nova rota filha de `/config` e nova entrada em `SettingsPageComponent.TABS`.

**Tech Stack:** Angular 21 (standalone components, signals), HttpClient, vitest.

**Spec:** `docs/superpowers/specs/planejadas/2026-09-20-mcp-server-design.md`

## Global Constraints

- Endpoint consumido: `${environment.apiUrl}/mcp-credentials` (backend de MCB), sempre com `withCredentials: true`.
- Nenhum CSS novo — reaproveitar exclusivamente as classes utilitárias já existentes em `src/styles.scss` (`field`, `input`, `btn primary`, `btn ghost sm`, `list-row`, `status`/`status.on`/`status.off`, `chip`, `vazio`, `field-error`, `auth-form`).
- O secret retornado pelo `POST` (`apiKey`) só existe na resposta daquela chamada — nunca é persistido no signal da lista (`McpCredential` não tem campo `secret`), e some da tela ao recarregar a lista ou navegar para outra aba.
- Sem sub-abas (diferente de webhooks, que tem "Assinantes"/"Histórico") — `McpTabComponent` é só a casca com `.tab-head` e inclui `McpConfigComponent` diretamente.

---

### Task 1: Models — `mcp-credential.models.ts`

**Files:**
- Create: `/home/asaas/projects/challenge/cypher-front/src/app/shared/mcp-credential.models.ts`

**Interfaces:**
- Produces: `McpCredential` (id, nome, criadaEm, ultimoUsoEm, ativa), `McpCredentialPayload` (nome), `McpCredentialCriada` (McpCredential + apiKey).

- [ ] **Step 1: Criar o arquivo de models**

```ts
/** McpCredential — espelha o model McpCredential do backend (spec MCB). */

export interface McpCredential {
  id: number;
  nome: string;
  criadaEm: string;
  ultimoUsoEm: string | null;
  ativa: boolean;
}

export interface McpCredentialPayload {
  nome: string;
}

/** Resposta do POST de criação — único momento em que `apiKey` (texto puro) existe. */
export interface McpCredentialCriada extends McpCredential {
  apiKey: string;
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/mcp-credential.models.ts
git commit -m "feat: adiciona models de McpCredential"
```

---

### Task 2: Service — `mcp-credential.service.ts`

**Files:**
- Create: `/home/asaas/projects/challenge/cypher-front/src/app/shared/mcp-credential.service.ts`
- Test: `/home/asaas/projects/challenge/cypher-front/src/app/shared/mcp-credential.service.spec.ts`

**Interfaces:**
- Consumes: `McpCredential`, `McpCredentialPayload`, `McpCredentialCriada` (Task 1).
- Produces: `McpCredentialService.credenciais` (signal readonly), `.load()`, `.create(payload)` → `Observable<McpCredentialCriada>`, `.revoke(id)` → `Observable<void>`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { McpCredentialService } from './mcp-credential.service';

describe('McpCredentialService', () => {
  let service: McpCredentialService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(McpCredentialService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('load() popula o signal de credenciais', () => {
    service.load();
    const req = http.expectOne(`${environment.apiUrl}/mcp-credentials`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, nome: 'Teste', criadaEm: '2026-09-21T00:00:00Z', ultimoUsoEm: null, ativa: true }]);

    expect(service.credenciais()).toHaveLength(1);
    expect(service.credenciais()[0].nome).toBe('Teste');
  });

  it('create() faz POST e recarrega a lista', () => {
    service.create({ nome: 'Nova' }).subscribe();
    const post = http.expectOne(`${environment.apiUrl}/mcp-credentials`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ nome: 'Nova' });
    post.flush({ id: 2, nome: 'Nova', criadaEm: '2026-09-21T00:00:00Z', ativa: true, apiKey: '2.segredo' });

    const reload = http.expectOne(`${environment.apiUrl}/mcp-credentials`);
    expect(reload.request.method).toBe('GET');
    reload.flush([]);
  });

  it('revoke() faz DELETE e recarrega a lista', () => {
    service.revoke(5).subscribe();
    const del = http.expectOne(`${environment.apiUrl}/mcp-credentials/5`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);

    const reload = http.expectOne(`${environment.apiUrl}/mcp-credentials`);
    reload.flush([]);
  });
});
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --include=src/app/shared/mcp-credential.service.spec.ts --watch=false`
Expected: FAIL (`mcp-credential.service.ts` ainda não existe)

- [ ] **Step 3: Implementar o service**

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { McpCredential, McpCredentialCriada, McpCredentialPayload } from './mcp-credential.models';

@Injectable({ providedIn: 'root' })
export class McpCredentialService {
  private http = inject(HttpClient);

  private readonly _credenciais = signal<McpCredential[]>([]);
  readonly credenciais = this._credenciais.asReadonly();

  load(): void {
    this.http.get<McpCredential[]>(`${environment.apiUrl}/mcp-credentials`, { withCredentials: true })
      .subscribe({ next: c => this._credenciais.set(c), error: () => { } });
  }

  create(payload: McpCredentialPayload): Observable<McpCredentialCriada> {
    return this.http.post<McpCredentialCriada>(`${environment.apiUrl}/mcp-credentials`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  revoke(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/mcp-credentials/${id}`,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }
}
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --include=src/app/shared/mcp-credential.service.spec.ts --watch=false`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/mcp-credential.service.ts src/app/shared/mcp-credential.service.spec.ts
git commit -m "feat: adiciona McpCredentialService"
```

---

### Task 3: Casca da aba — `McpTabComponent` + registro de rota

**Files:**
- Create: `/home/asaas/projects/challenge/cypher-front/src/app/config/mcp/mcp-tab.component.ts`
- Create: `/home/asaas/projects/challenge/cypher-front/src/app/config/mcp/mcp-tab.component.html`
- Modify: `/home/asaas/projects/challenge/cypher-front/src/app/app.routes.ts`
- Modify: `/home/asaas/projects/challenge/cypher-front/src/app/config/settings/settings-page.component.ts`
- Modify: `/home/asaas/projects/challenge/cypher-front/src/app/config/settings/settings-page.component.html`

**Interfaces:**
- Consumes: `McpConfigComponent` (Task 4 — este componente é criado depois, mas referenciado aqui; se implementando em ordem estrita, adicione o `import`/uso desta tag só depois de completar a Task 4, ou crie um placeholder mínimo de `McpConfigComponent` nesta task e complete a lógica na Task 4).
- Produces: rota `/config/mcp` navegável, aba "Credenciais MCP" visível na trilha lateral de configuração.

- [ ] **Step 1: Criar a casca da aba (sem sub-abas, diferente de webhooks)**

`mcp-tab.component.ts`:

```ts
import { Component, OnInit, inject } from '@angular/core';

import { McpCredentialService } from '../../shared/mcp-credential.service';
import { McpConfigComponent } from './mcp-config.component';

/**
 * Aba "Credenciais MCP" de /config/mcp — sem sub-abas (diferente de
 * WebhooksTabComponent), vai direto pro conteúdo. Mesmo papel estrutural
 * de WebhooksTabComponent: só a casca (.tab-head), delega o conteúdo pro
 * componente de configuração.
 */
@Component({
  selector: 'app-mcp-tab',
  imports: [McpConfigComponent],
  templateUrl: './mcp-tab.component.html',
})
export class McpTabComponent implements OnInit {
  private mcp = inject(McpCredentialService);

  ngOnInit(): void {
    this.mcp.load();
  }
}
```

`mcp-tab.component.html`:

```html
<div class="tab-head">
  <div>
    <div class="eyebrow-accent">Credenciais MCP</div>
    <h2 class="tab-title">Quem <em style="color:var(--accent);font-style:normal">acessa via agente de IA.</em></h2>
    <p class="sub" style="font-size:14px;margin-top:6px">Credenciais para agentes de IA (Claude e outros) consultarem incidentes, câmeras e dashboard via MCP.</p>
  </div>
</div>

<div style="margin-top:24px">
  <app-mcp-config />
</div>
```

- [ ] **Step 2: Registrar a rota em `app.routes.ts`**

Adicionar o import, logo após a linha `import { WebhooksTabComponent } from './config/webhooks/webhooks-tab.component';`:

```ts
import { McpTabComponent } from './config/mcp/mcp-tab.component';
```

E, na lista `children` do path `'config'`, logo após `{ path: 'webhooks', component: WebhooksTabComponent },`:

```ts
        { path: 'mcp', component: McpTabComponent },
```

- [ ] **Step 3: Adicionar a entrada na trilha lateral (`settings-page.component.ts`)**

Em `TABS` (array constante), logo após a entrada de `webhooks`:

```ts
  { path: 'mcp', label: 'Credenciais MCP', hint: 'Acesso de agentes de IA' },
```

- [ ] **Step 4: Adicionar o ícone no `@switch` de `settings-page.component.html`**

Primeiro, localizar o bloco exato:

Run: `cd /home/asaas/projects/challenge/cypher-front && grep -n "@case" src/app/config/settings/settings-page.component.html`

Dentro do mesmo `@switch (t.path) { ... }`, adicionar um novo `@case ('mcp') { ... }` (mesmo estilo dos demais: SVG 24x24, `stroke="currentColor"` `stroke-width="1.5"` `fill="none"`), por exemplo um ícone de chave/plugue representando acesso por API:

```html
    @case ('mcp') {
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="15" r="4" />
        <path d="M11 12 20 3" />
        <path d="M16 7 19 10" />
        <path d="M13 10 16 13" />
      </svg>
    }
```

Inserir esse bloco dentro do mesmo `@switch` já existente, na mesma posição relativa em que as outras `@case` aparecem (não altera nenhuma `@case` existente).

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/config/mcp/mcp-tab.component.ts src/app/config/mcp/mcp-tab.component.html \
        src/app/app.routes.ts \
        src/app/config/settings/settings-page.component.ts \
        src/app/config/settings/settings-page.component.html
git commit -m "feat: registra rota e aba de Credenciais MCP"
```

(Este commit só compila depois da Task 4 criar `McpConfigComponent` — combine as duas tasks num commit se preferir manter cada commit compilável.)

---

### Task 4: `McpConfigComponent` — listar, criar (secret uma vez), revogar

**Files:**
- Create: `/home/asaas/projects/challenge/cypher-front/src/app/config/mcp/mcp-config.component.ts`
- Create: `/home/asaas/projects/challenge/cypher-front/src/app/config/mcp/mcp-config.component.html`
- Test: `/home/asaas/projects/challenge/cypher-front/src/app/config/mcp/mcp-config.component.spec.ts`

**Interfaces:**
- Consumes: `McpCredentialService` (Task 2).
- Produces: componente standalone `app-mcp-config`, usado por `McpTabComponent` (Task 3).

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { McpConfigComponent } from './mcp-config.component';

describe('McpConfigComponent', () => {
  let fixture: ComponentFixture<McpConfigComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [McpConfigComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(McpConfigComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/mcp-credentials`).flush([]);
  });

  afterEach(() => http.verify());

  it('exige nome antes de criar', () => {
    fixture.componentInstance.novoNome.set('');
    fixture.componentInstance.criar();

    expect(fixture.componentInstance.erro()).toContain('nome');
    http.expectNone(`${environment.apiUrl}/mcp-credentials`);
  });

  it('criar() mostra o apiKey uma vez e limpa o formulário', () => {
    fixture.componentInstance.novoNome.set('Claude Desktop');
    fixture.componentInstance.criar();

    const post = http.expectOne({ url: `${environment.apiUrl}/mcp-credentials`, method: 'POST' });
    post.flush({ id: 1, nome: 'Claude Desktop', criadaEm: '2026-09-21T00:00:00Z', ativa: true, apiKey: '1.segredo-abc' });
    http.expectOne(`${environment.apiUrl}/mcp-credentials`).flush([
      { id: 1, nome: 'Claude Desktop', criadaEm: '2026-09-21T00:00:00Z', ultimoUsoEm: null, ativa: true },
    ]);

    expect(fixture.componentInstance.apiKeyRecemCriada()).toBe('1.segredo-abc');
    expect(fixture.componentInstance.novoNome()).toBe('');
  });

  it('fecharAlertaDeSecret() limpa o apiKey exibido', () => {
    fixture.componentInstance.apiKeyRecemCriada.set('1.segredo-abc');
    fixture.componentInstance.fecharAlertaDeSecret();

    expect(fixture.componentInstance.apiKeyRecemCriada()).toBeNull();
  });

  it('revogar() chama o service e recarrega', () => {
    fixture.componentInstance.revogar(1);

    const del = http.expectOne({ url: `${environment.apiUrl}/mcp-credentials/1`, method: 'DELETE' });
    del.flush(null);
    http.expectOne(`${environment.apiUrl}/mcp-credentials`).flush([]);
  });
});
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --include=src/app/config/mcp/mcp-config.component.spec.ts --watch=false`
Expected: FAIL (`mcp-config.component.ts` ainda não existe)

- [ ] **Step 3: Implementar o componente**

`mcp-config.component.ts`:

```ts
import { Component, OnInit, inject, signal } from '@angular/core';

import { mensagemDeErro } from '../../shared/incident.models';
import { McpCredentialService } from '../../shared/mcp-credential.service';

/**
 * CRUD de credenciais MCP — sub-aba única de /config/mcp. Mesmo padrão de
 * WebhooksConfigComponent (rascunho local + lista, sem FormGroup), com uma
 * diferença: o secret é gerado pelo servidor e só existe uma vez, logo
 * após a criação — guardado num signal separado da lista, nunca persistido.
 */
@Component({
  selector: 'app-mcp-config',
  templateUrl: './mcp-config.component.html',
})
export class McpConfigComponent implements OnInit {
  private mcp = inject(McpCredentialService);

  readonly credenciais = this.mcp.credenciais;

  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly novoNome = signal('');
  readonly apiKeyRecemCriada = signal<string | null>(null);

  ngOnInit(): void {
    this.mcp.load();
  }

  criar(): void {
    if (!this.novoNome().trim()) {
      this.erro.set('Informe o nome da credencial.');
      return;
    }

    this.erro.set('');
    this.salvando.set(true);
    this.mcp.create({ nome: this.novoNome() }).subscribe({
      next: criada => {
        this.apiKeyRecemCriada.set(criada.apiKey);
        this.novoNome.set('');
        this.salvando.set(false);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  fecharAlertaDeSecret(): void {
    this.apiKeyRecemCriada.set(null);
  }

  revogar(id: number): void {
    this.mcp.revoke(id).subscribe({ error: e => this.erro.set(mensagemDeErro(e)) });
  }
}
```

`mcp-config.component.html`:

```html
<section>
  @if (erro()) {
    <p class="vazio" role="alert">{{ erro() }}</p>
  }

  @if (apiKeyRecemCriada(); as chave) {
    <div class="field" style="border:1px solid var(--accent);padding:16px;border-radius:8px;margin-bottom:20px">
      <label>Copie a chave agora — ela não será exibida novamente</label>
      <input class="input" readonly [value]="chave" onclick="this.select()" />
      <button type="button" class="btn ghost sm" style="margin-top:8px" (click)="fecharAlertaDeSecret()">entendi, fechar</button>
    </div>
  }

  <form class="auth-form" style="max-width:560px" (submit)="$event.preventDefault(); criar()">
    <div class="field">
      <label>Nome da credencial</label>
      <input class="input" [value]="novoNome()" placeholder="ex.: Claude Desktop do Lucas"
             (input)="novoNome.set($any($event.target).value)" />
    </div>
    <button type="submit" class="btn primary" [disabled]="salvando()">Gerar credencial</button>
  </form>

  <div style="margin-top:28px">
    @for (c of credenciais(); track c.id) {
      <div class="list-row">
        <span>{{ c.nome }}</span>
        <span class="status" [class.on]="c.ativa" [class.off]="!c.ativa">{{ c.ativa ? 'ativa' : 'revogada' }}</span>
        @if (c.ativa) {
          <button type="button" class="btn ghost sm" (click)="revogar(c.id)">revogar</button>
        }
      </div>
    } @empty {
      <p class="vazio">nenhuma credencial cadastrada ainda</p>
    }
  </div>
</section>
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --include=src/app/config/mcp/mcp-config.component.spec.ts --watch=false`
Expected: PASS (4 testes)

- [ ] **Step 5: Rodar a suíte completa do front**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --watch=false`
Expected: PASS (nenhuma regressão)

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/config/mcp/mcp-config.component.ts src/app/config/mcp/mcp-config.component.html \
        src/app/config/mcp/mcp-config.component.spec.ts
git commit -m "feat: adiciona McpConfigComponent (criar/listar/revogar credencial MCP)"
```

## Self-Review

- **Cobertura da spec:** rota/aba na área de configuração pós-onboarding (Task 3), CRUD com exibição única do secret (Task 4), service seguindo 1:1 o padrão de `WebhookService` (Task 2) — cobre o sub-projeto MCE por completo.
- **Placeholders:** o Step 4 da Task 3 (ícone SVG) é uma inserção real e completa de markup, não um placeholder — a única parte "descoberta em runtime" é a localização exata da linha via `grep`, uma ação legítima já que o conteúdo completo do arquivo não foi lido byte a byte na exploração.
- **Consistência de tipos:** `McpCredentialCriada.apiKey` (Task 1) é o único campo com o secret, consumido exatamente assim em `McpConfigComponent.criar()` (Task 4); `McpCredentialService.credenciais`/`.load()`/`.create()`/`.revoke()` (Task 2) usados com a mesma assinatura em `McpTabComponent` e `McpConfigComponent`.
