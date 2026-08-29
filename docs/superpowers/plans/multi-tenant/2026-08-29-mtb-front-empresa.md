# MT-B — Frontend: Empresa (multi-tenant) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adaptar `cypher-front` ao backend multi-tenant do plano MT-A: onboarding cria uma `Empresa` de verdade (com slug), a rota `''` deixa de depender de um booleano global e vira uma tela de duas ações, e a sessão exibe o nome da empresa logada.

**Architecture:** Três mudanças independentes que não se bloqueiam entre si: (1) o passo de identidade do onboarding ganha o campo de slug e `OnboardingService.launch()` passa a mandá-lo a `POST /setup`; (2) `canActivateOnboarding`/`checkSetupStatus`/`GET /setup/status` são removidos e a rota `''` vira um componente novo, simples, com dois botões; (3) `AuthService` passa a guardar `empresaId`/`empresaNome` vindos de `/auth/me`/`/auth/login`, exibidos na topbar. Nenhuma mudança em `IncidentService`/`CatalogService`/`TeamService` — o escopo por empresa é 100% do backend (spec §5).

**Tech Stack:** Angular (standalone components, signals), Vitest + `RouterTestingHarness` + `HttpTestingController` (mesmo padrão de `app.routes.spec.ts`), sem `ReactiveFormsModule` — segue o padrão de formulário do onboarding já existente ("signal de rascunho + `patch()`").

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-multi-tenant-design.md` (§5, `cypher-front`), `docs/superpowers/specs/planejadas/2026-08-29-multi-tenant-design.md` §3.1 (formato de username).

**Repositório:** `/home/asaas/projects/challenge/cypher-front`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-front`. Branch atual: `dev` — criar `feat/mt-front-empresa` a partir de `dev` via `git checkout -b`.
- **Depende do plano MT-A já mergeado** (ou rodando localmente) — os testes desta entrega batem contra `POST /api/v1/setup` com o novo corpo (`empresaId`/`empresaNome`) e `AuthResponse`/`MeResponse` com os campos novos. Rodar `cypher` localmente com a branch `feat/mt-backend-empresa` (ou já mergeada) antes de testar manualmente no browser.
- **Nota de design:** toda peça nova desta entrega reaproveita 100% os primitivos globais já existentes em `src/styles.scss` (`.field`, `.input`, `.btn`, `.panel`, `.vazio`, `.field-error`) e o padrão de formulário "signal de rascunho + `patch()`" já usado em todo o onboarding e em `identity-tab.component.ts` — mesmo princípio de E3 §0/E4 §4, reafirmado na spec de multi-tenant §5. Nenhuma tela desta entrega introduz CSS solto, biblioteca de UI nova ou `ReactiveFormsModule`.
- `OnboardingData`/`STEPS`/`DEFAULT_DATA` vivem em `src/app/onboarding/models/onboarding.models.ts` — qualquer campo novo do formulário de identidade entra ali, nunca como estado solto no componente.
- `AuthService` já cacheia a checagem de sessão em `sessaoVerificada$` (um único GET `/auth/me` por boot) — os novos signals (`empresaId`/`empresaNome`) são atualizados nos mesmos três pontos que já atualizam `role`/`estacaoId` (`checkSession`, `login`, `loginEstacao`, `bootstrap`), nunca um quarto lugar.
- Run: `npx vitest run <arquivo>` para um arquivo; `npx vitest run` para a suíte inteira.

---

### Task 1: Onboarding — campo de slug no passo de identidade

**Files:**
- Modify: `src/app/onboarding/models/onboarding.models.ts`
- Modify: `src/app/onboarding/onboarding.service.ts`
- Modify: `src/app/onboarding/steps/step1-identity/step1-identity.component.ts`
- Modify: `src/app/onboarding/steps/step1-identity/step1-identity.component.html`
- Test: `src/app/onboarding/onboarding.service.spec.ts`

**Interfaces:**
- Produces: `OnboardingData.empresaSlug: string` — consumido pela Tarefa 2 (`OnboardingService.launch()`)

- [ ] **Step 1: Escrever o teste de validação do slug**

Em `onboarding.service.spec.ts`, adicionar (seguindo o padrão dos testes de `validateStep` já existentes na classe):

```typescript
  it('valida o passo "identity" exigindo empresaSlug em formato valido', () => {
    service.step.set(0);
    service.updateData({ company: 'Acme', empresaSlug: '' });
    expect(service.validateStep(0)).toBe(false);
    expect(service.errors()['empresaSlug']).toBeTruthy();

    service.updateData({ empresaSlug: 'Acme Com Espaco' });
    expect(service.validateStep(0)).toBe(false);

    service.updateData({ empresaSlug: 'acme' });
    expect(service.validateStep(0)).toBe(true);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/onboarding/onboarding.service.spec.ts`
Expected: FAIL — `empresaSlug` não existe em `OnboardingData`, `validateStep` não valida esse campo.

- [ ] **Step 3: Adicionar `empresaSlug` a `OnboardingData`/`DEFAULT_DATA` e validar em `validateStep`**

Em `onboarding.models.ts`:

```typescript
export interface OnboardingData {
  company: string;
  empresaSlug: string;
  cnpj: string;
  sector: string;
  logoUrl: string;
  logoName: string;
  accent: string;
  masterUsername: string;
  masterPassword: string;
  epis: string[];
  cas: Record<string, CaEntry>;
  picks: Record<string, string>;
  rolePreset?: string;
}
```

```typescript
export const DEFAULT_DATA: OnboardingData = {
  company: '', empresaSlug: '', cnpj: '', sector: '', logoUrl: '', logoName: '',
  accent: '#F4622A', masterUsername: '', masterPassword: '', epis: [], cas: {}, picks: {},
};
```

Em `onboarding.service.ts`, dentro de `validateStep`, no bloco `if (key === 'identity')`:

```typescript
    if (key === 'identity') {
      if (!d.company.trim()) e['company'] = 'Nome obrigatório';
      if (!/^[a-z0-9-]{2,30}$/.test(d.empresaSlug)) {
        e['empresaSlug'] = 'Use apenas minúsculas, números e hífen, 2 a 30 caracteres';
      }
      if (d.cnpj && d.cnpj.replace(/\D/g, '').length < 14) e['cnpj'] = 'CNPJ incompleto';
      if (!d.sector) e['sector'] = 'Selecione um setor';
    }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/onboarding/onboarding.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Adicionar o campo ao formulário do passo 1**

Em `step1-identity.component.ts`, adicionar o handler:

```typescript
  onEmpresaSlug(e: Event) {
    const v = (e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    this.state.updateData({ empresaSlug: v });
  }
```

Em `step1-identity.component.html`, adicionar o campo logo após o de nome da empresa (mesmo padrão de `.field`/`.field-error` já usado nesse template):

```html
<div class="field">
  <label>Identificador da empresa</label>
  <input class="input" placeholder="acme" autocomplete="off"
         [value]="state.data().empresaSlug"
         (input)="onEmpresaSlug($event)" />
  <p class="vazio">Usado no seu usuário de acesso (ex.: <code>gestor&#64;{{ state.data().empresaSlug || 'acme' }}</code>) — não pode ser alterado depois.</p>
  @if (state.errors()['empresaSlug']) {
    <div class="field-error">{{ state.errors()['empresaSlug'] }}</div>
  }
</div>
```

- [ ] **Step 6: Rodar a suíte do onboarding e confirmar que passa**

Run: `npx vitest run src/app/onboarding`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/onboarding
git commit -m "feat: adiciona campo de slug da empresa ao passo de identidade do onboarding"
```

---

### Task 2: `AuthService`/`launch()` — sign-up cria `Empresa` de verdade

**Files:**
- Modify: `src/app/shared/auth/auth.models.ts`
- Modify: `src/app/shared/auth/auth.service.ts`
- Modify: `src/app/onboarding/onboarding.service.ts`
- Test: `src/app/shared/auth/auth.service.spec.ts`
- Test: `src/app/onboarding/onboarding.service.spec.ts`

**Interfaces:**
- Consumes: `OnboardingData.empresaSlug`/`company` (Tarefa 1)
- Produces: `AuthService.bootstrap(username, password, empresaId, empresaNome)`; `AuthService.empresaId`/`.empresaNome` signals — consumidos pela Tarefa 4 (topbar)

- [ ] **Step 1: Escrever o teste de `bootstrap` com os campos novos**

Em `auth.service.spec.ts`, adicionar (seguindo o padrão dos testes de `login`/`bootstrap` já existentes, que usam `HttpTestingController`):

```typescript
  it('bootstrap envia empresaId/empresaNome e atualiza os signals a partir da resposta', () => {
    service.bootstrap('gestor', 'senha123', 'acme', 'Acme Industrial').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/setup`);
    expect(req.request.body).toEqual({
      username: 'gestor', password: 'senha123', empresaId: 'acme', empresaNome: 'Acme Industrial',
    });
    req.flush({ papel: 'GESTOR', username: 'gestor@acme', empresaId: 'acme', empresaNome: 'Acme Industrial' });

    expect(service.role()).toBe('GESTOR');
    expect(service.empresaId()).toBe('acme');
    expect(service.empresaNome()).toBe('Acme Industrial');
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/shared/auth/auth.service.spec.ts`
Expected: FAIL — `bootstrap` ainda tem assinatura de 2 argumentos, `empresaId()`/`empresaNome()` não existem.

- [ ] **Step 3: Atualizar os modelos e o serviço**

Em `auth.models.ts`:

```typescript
export type Papel = 'GESTOR' | 'OPERADOR';

export interface LoginResponse {
  papel: Papel;
  username?: string;
  estacaoId?: string;
  empresaId: string;
  empresaNome?: string;
}

export interface LoginEstacaoResponse {
  papel: 'OPERADOR';
  estacaoId: string;
  empresaId: string;
  empresaNome?: string;
}

export interface MeResponse {
  papel: Papel;
  username?: string;
  estacaoId?: string;
  empresaId: string;
  empresaNome?: string;
}
```

(Remover `SetupStatusResponse` — usado só por `checkSetupStatus`, removido na Tarefa 3.)

Em `auth.service.ts`:

```typescript
  private readonly _role = signal<Papel | null>(null);
  private readonly _estacaoId = signal<string | null>(null);
  private readonly _empresaId = signal<string | null>(null);
  private readonly _empresaNome = signal<string | null>(null);

  readonly role = this._role.asReadonly();
  readonly estacaoId = this._estacaoId.asReadonly();
  readonly empresaId = this._empresaId.asReadonly();
  readonly empresaNome = this._empresaNome.asReadonly();
```

```typescript
  checkSession(): Observable<void> {
    if (!this.sessaoVerificada$) {
      this.sessaoVerificada$ = this.http
        .get<MeResponse>(`${environment.apiUrl}/auth/me`, { withCredentials: true })
        .pipe(
          tap(resp => {
            this._role.set(resp.papel);
            this._estacaoId.set(resp.estacaoId ?? null);
            this._empresaId.set(resp.empresaId);
            this._empresaNome.set(resp.empresaNome ?? null);
          }),
          map(() => undefined),
          catchError(() => {
            this._role.set(null);
            this._estacaoId.set(null);
            this._empresaId.set(null);
            this._empresaNome.set(null);
            return of(undefined);
          }),
          shareReplay(1),
        );
    }
    return this.sessaoVerificada$;
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { username, password },
        { withCredentials: true })
      .pipe(tap(resp => {
        this._role.set(resp.papel);
        this._estacaoId.set(resp.estacaoId ?? null);
        this._empresaId.set(resp.empresaId);
        this._empresaNome.set(resp.empresaNome ?? null);
      }));
  }

  loginEstacao(token: string): Observable<LoginEstacaoResponse> {
    return this.http
      .post<LoginEstacaoResponse>(`${environment.apiUrl}/auth/login-estacao`, { token },
        { withCredentials: true })
      .pipe(tap(resp => {
        this._role.set(resp.papel);
        this._estacaoId.set(resp.estacaoId);
        this._empresaId.set(resp.empresaId);
        this._empresaNome.set(resp.empresaNome ?? null);
      }));
  }

  logout(): void {
    this._role.set(null);
    this._estacaoId.set(null);
    this._empresaId.set(null);
    this._empresaNome.set(null);
    this.http.post(`${environment.apiUrl}/auth/logout`, {}, { withCredentials: true })
      .subscribe({ error: () => { /* sessão local já foi limpa */ } });
  }

  /**
   * `POST /setup` (design doc de multi-tenant, §3/§5) — cria a `Empresa` e o
   * gestor mestre dela, autenticando a sessão de resposta. `username` aqui é
   * só o "nome" (sem "@empresa") — o backend compõe o username completo.
   */
  bootstrap(username: string, password: string, empresaId: string, empresaNome: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/setup`, { username, password, empresaId, empresaNome },
        { withCredentials: true })
      .pipe(tap(resp => {
        this._role.set(resp.papel);
        this._estacaoId.set(null);
        this._empresaId.set(resp.empresaId);
        this._empresaNome.set(resp.empresaNome ?? null);
      }));
  }
```

Remover o método `checkSetupStatus` (movido/removido na Tarefa 3, junto com o guard que o consome).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/shared/auth/auth.service.spec.ts`
Expected: PASS (corrigir qualquer teste existente de `login`/`checkSession` que ainda faça `flush` sem `empresaId` — adicionar `empresaId: 'demo'` ou equivalente ao corpo simulado em cada um).

- [ ] **Step 5: Atualizar `OnboardingService.launch()` para passar o slug**

```typescript
  launch(): void {
    this.launching.set(true);
    this.setupError.set(null);
    const { masterUsername, masterPassword, empresaSlug, company } = this.data();
    this.auth.bootstrap(masterUsername, masterPassword, empresaSlug, company).subscribe({
      next: () => {
        setTimeout(() => {
          this.launched.set(true);
          this.persistConfig();
          setTimeout(() => this.router.navigate(['/dashboard']), 2400);
        }, 900);
      },
      error: e => {
        this.launching.set(false);
        this.setupError.set(mensagemDeErro(e));
      },
    });
  }
```

- [ ] **Step 6: Rodar a suíte do onboarding e confirmar que passa**

Run: `npx vitest run src/app/onboarding/onboarding.service.spec.ts`
Expected: PASS (corrigir o mock de `auth.bootstrap` no spec de `launch()`, se houver um, para aceitar 4 argumentos).

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/auth src/app/onboarding/onboarding.service.ts
git commit -m "feat: AuthService expoe empresaId/empresaNome e bootstrap envia o slug ao sign-up"
```

---

### Task 3: Rota `''` — remove o guard de setup global, vira tela de duas ações

**Files:**
- Create: `src/app/landing/landing.component.ts`
- Create: `src/app/landing/landing.component.html`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/shared/auth/auth.guards.ts`
- Test: `src/app/app.routes.spec.ts`
- Test: `src/app/shared/auth/auth.guards.spec.ts`

**Interfaces:**
- Produces: rota `''` → `LandingComponent`, sem `canActivate`

- [ ] **Step 1: Escrever o teste de rota atualizado**

Em `app.routes.spec.ts`, substituir o teste `'/ (onboarding) usa canActivateOnboarding'` por:

```typescript
  it('/ nao tem guard (tela de duas acoes, nao depende de estado global)', () => {
    expect(routes.find(r => r.path === '')?.canActivate).toBeUndefined();
  });

  it('/onboarding usa o wizard, sem guard', () => {
    expect(routes.find(r => r.path === 'onboarding')).toBeDefined();
    expect(routes.find(r => r.path === 'onboarding')?.canActivate).toBeUndefined();
  });
```

E remover os dois testes do segundo `describe` que dependiam de `GET /setup/status` (`'/ mostra o onboarding quando o setup ainda nao rodou'`, `'/ redireciona para /login quando o setup ja rodou'`) — não fazem mais sentido sem o booleano global.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/app.routes.spec.ts`
Expected: FAIL — rota `''` ainda aponta para `OnboardingComponent` com `canActivateOnboarding`, rota `'onboarding'` não existe.

- [ ] **Step 3: Criar `LandingComponent`**

Criar `src/app/landing/landing.component.ts`:

```typescript
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Tela de entrada (design doc de multi-tenant, §5): duas ações lado a lado,
 * sem depender de nenhum estado global — substitui o guard `canActivateOnboarding`,
 * que checava um booleano que deixou de fazer sentido com várias empresas coexistindo.
 */
@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  templateUrl: './landing.component.html',
})
export class LandingComponent {
}
```

Criar `src/app/landing/landing.component.html`:

```html
<div class="auth-shell">
  <div class="panel auth-panel">
    <div class="panel-head">
      <div class="ph-left">
        <span class="ph-title">Cypher</span>
        <span class="ph-meta">monitoramento de segurança industrial</span>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:16px;margin-top:24px">
      <a class="btn primary" routerLink="/onboarding">Criar empresa</a>
      <a class="btn" routerLink="/login">Entrar</a>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Atualizar as rotas**

Em `app.routes.ts`:

```typescript
import { Routes } from '@angular/router';
import { LandingComponent } from './landing/landing.component';
import { OnboardingComponent } from './onboarding/onboarding.component';
import { LoginComponent } from './auth/login.component';
import { LoginEstacaoComponent } from './auth/login-estacao.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { HeatmapComponent } from './heatmap/heatmap.component';
import { IncidentTimelineComponent } from './incidents/incident-timeline.component';
import { IncidentDetailComponent } from './incidents/incident-detail.component';
import { StationsGridComponent } from './stations/stations-grid.component';
import { StationKioskComponent } from './stations/station-kiosk.component';
import { CasTabComponent } from './config/settings/cas-tab.component';
import { EpisTabComponent } from './config/settings/epis-tab.component';
import { IdentityTabComponent } from './config/settings/identity-tab.component';
import { SettingsPageComponent } from './config/settings/settings-page.component';
import { StationsTabComponent } from './config/stations/stations-tab.component';
import { EquipeUsuariosTabComponent } from './config/equipe/equipe-usuarios-tab.component';
import {
  canActivateGestor, canActivateOperadorOuGestor,
} from './shared/auth/auth.guards';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'onboarding', component: OnboardingComponent },
  { path: 'login', component: LoginComponent },
  { path: 'login-estacao', component: LoginEstacaoComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [canActivateGestor] },
  { path: 'heatmap', component: HeatmapComponent, canActivate: [canActivateGestor] },
  { path: 'incidentes', component: IncidentTimelineComponent },
  { path: 'incidentes/:id', component: IncidentDetailComponent },
  { path: 'estacoes', component: StationsGridComponent },
  { path: 'estacao/:id', component: StationKioskComponent, canActivate: [canActivateOperadorOuGestor] },
  {
    path: 'config',
    component: SettingsPageComponent,
    canActivate: [canActivateGestor],
    children: [
      { path: '', redirectTo: 'estacoes', pathMatch: 'full' },
      { path: 'estacoes', component: StationsTabComponent },
      { path: 'identidade', component: IdentityTabComponent },
      { path: 'epis', component: EpisTabComponent },
      { path: 'cas', component: CasTabComponent },
      { path: 'equipe', component: EquipeUsuariosTabComponent },
    ],
  },
];
```

Em `auth.guards.ts`, remover a função `canActivateOnboarding` inteira (o import de `AuthService.checkSetupStatus` que ela usava também some).

- [ ] **Step 5: Remover os testes de `canActivateOnboarding` em `auth.guards.spec.ts`**

Remover todo teste que exercita `canActivateOnboarding` (a função não existe mais).

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npx vitest run src/app/app.routes.spec.ts src/app/shared/auth/auth.guards.spec.ts`
Expected: PASS

- [ ] **Step 7: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS (corrigir qualquer outro spec que ainda referencie `canActivateOnboarding`/`checkSetupStatus`/a rota `''` apontando para `OnboardingComponent`).

- [ ] **Step 8: Commit**

```bash
git add src/app/landing src/app/app.routes.ts src/app/shared/auth/auth.guards.ts \
        src/app/app.routes.spec.ts src/app/shared/auth/auth.guards.spec.ts
git commit -m "feat: rota raiz vira tela de duas acoes, remove guard de setup global"
```

---

### Task 4: Topbar exibe o nome da empresa

**Files:**
- Modify: `src/app/shared/chrome-topbar/chrome-topbar.component.ts`

**Interfaces:**
- Consumes: `AuthService.empresaNome` (Tarefa 2)

- [ ] **Step 1: Escrever o teste de exibição**

Se não existir um spec para `ChromeTopbarComponent`, criar `src/app/shared/chrome-topbar/chrome-topbar.component.spec.ts` com um teste mínimo (seguindo o padrão de outros specs de componente da base — `TestBed`, `provideZonelessChangeDetection`):

```typescript
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { ChromeTopbarComponent } from './chrome-topbar.component';
import { AuthService } from '../auth/auth.service';

describe('ChromeTopbarComponent — nome da empresa (design doc de multi-tenant, §5)', () => {
  it('mostra empresaNome do AuthService quando nao ha config local', () => {
    const authStub = { role: signal('GESTOR'), empresaNome: signal('Acme Industrial') };
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]),
        { provide: AuthService, useValue: authStub }],
    });
    const fixture = TestBed.createComponent(ChromeTopbarComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.company()).toBe('ACME INDUSTRIAL');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/shared/chrome-topbar/chrome-topbar.component.spec.ts`
Expected: FAIL — `company()` ainda só olha `cfg()?.company`, ignorando `auth.empresaNome()`.

- [ ] **Step 3: Preferir `empresaNome` da sessão, com fallback para a config local**

Em `chrome-topbar.component.ts`:

```typescript
  company = computed(() => (this.auth.empresaNome() || this.cfg()?.company || 'CYPHER').toUpperCase());
  initial = computed(() => (this.auth.empresaNome() || this.cfg()?.company || 'C').trim()[0].toUpperCase());
```

(`cfg()?.company` continua existindo como fallback — vem do `localStorage.cypher.config` que o onboarding já grava via `persistConfig()`; útil enquanto a sessão ainda não respondeu no primeiro paint.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/shared/chrome-topbar/chrome-topbar.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/shared/chrome-topbar
git commit -m "feat: topbar exibe o nome da empresa vindo da sessao"
```

---

## Self-Review

**Cobertura da spec:** §5 "Onboarding — passo Identidade da empresa" → Tarefa 1. §5 "Rota ''" → Tarefa 3. §5 "AuthService/GET /auth/me" → Tarefas 2 e 4. §5 "IncidentService/CatalogService/TeamService não mudam" → nenhuma tarefa deste plano toca esses três serviços, confirmando a decisão da spec.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todo passo tem código completo.

**Consistência de tipos:** `AuthService.bootstrap` muda de 2 para 4 argumentos numa única tarefa (Tarefa 2) e todo call site (`OnboardingService.launch`) é atualizado na mesma tarefa; `LoginResponse`/`MeResponse`/`LoginEstacaoResponse` ganham `empresaId`/`empresaNome` de forma consistente entre si.

---

**Plan complete and saved to `docs/superpowers/plans/multi-tenant/2026-08-29-mtb-front-empresa.md`.**

## Execution Handoff

Os dois planos desta entrega (`2026-08-29-mta-backend-empresa.md` e `2026-08-29-mtb-front-empresa.md`) estão prontos. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — dispatch de um subagente por tarefa, revisão entre tarefas, iteração rápida.

**2. Inline Execution** — execução em lote nesta sessão via `executing-plans`, com checkpoints para revisão.

Qual abordagem?
