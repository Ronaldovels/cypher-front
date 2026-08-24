# E4-C — Front: Acesso e Equipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir login, papéis e proteção de rotas em `cypher-front`: `AuthService`, guards funcionais, as telas `/login` e `/login-estacao`, a migração do dock de "escondido por rota" para "escondido por papel de sessão" em todas as páginas existentes, e a tela `/config/equipe` (equipes + usuários).

**Architecture:** Um `AuthService` novo (`providedIn: 'root'`, store de signals — mesmo padrão de `IncidentService`/`ConfigService`) cujo construtor dispara `GET /api/v1/auth/me` uma vez e cacheia o resultado (`shareReplay(1)`); guards funcionais (`CanActivateFn`) reusam esse cache mas sempre leem `role()`/`estacaoId()` como signals no momento da decisão, nunca o corpo da resposta cacheada — é isso que faz login/logout refletirem na próxima navegação sem recriar o serviço. Dock por papel é um `@if (auth.role() === 'GESTOR')` acrescentado ao redor de cada `<app-dock>` já existente (nenhuma tela muda de layout por si; só a condição ao redor do dock muda) mais uma inclusão nova no kiosk, que ganha dock só para `GESTOR`. `/config/equipe` reaproveita a casca de abas de `SettingsPageComponent` como uma 5ª aba, cujo componente roteado hospeda duas sub-abas locais (sem rota própria para cada uma) através de um `signal` de alternância — mesmo padrão que `stations-tab.component.ts` usa para embrulhar `StationsConfigComponent`, mas trocando o painel inteiro em vez de um valor.

**Tech Stack:** Angular 21 standalone components + signals, Vitest + `TestBed` + `HttpTestingController` para testes, `RouterTestingHarness` (`@angular/router/testing`) e `TestBed.runInInjectionContext` para guards, `provideZonelessChangeDetection()`.

**Spec:** `docs/superpowers/specs/2026-08-23-acesso-e-equipes-e4-design.md` (mesmo repo), §2 (modelo de acesso), §3 (`Equipe`), §4 (`cypher-front` — o que muda), §6 (fora de escopo), §7 (ordem de implementação — este plano é o passo 3).

**Repositório:** `/home/asaas/projects/challenge/cypher-front`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-front`. Branch: `e4c-front-acesso-equipes`, criada a partir de `dev` (que já tem `e3b-front-operacao` mergeada via PR #3) — **não** usar worktree, apenas `git checkout -b`.
- Todo CSS novo vai em `src/styles.scss`, nunca em folha de estilo por componente. `.field`, `.input`, `.select`, `.btn`, `.panel`, `.alert-row`, `.chip` (incluindo o estado `.chip.on`, já existente) são os primitivos a reaproveitar; novos wrappers de layout (`.auth-shell`, `.subtabs` etc.) são as únicas classes genuinamente novas deste plano.
- Toda `Run:` de teste usa `npx ng test --no-watch` (suíte inteira) a partir de `/home/asaas/projects/challenge/cypher-front` — o builder deste projeto não expõe um filtro de arquivo único confiável.
- **Este plano substitui a Global Constraint de `e3b-front-operacao` que dizia "o kiosk não inclui `<app-dock>`".** A partir daqui isso vale só para sessão `OPERADOR`; uma sessão `GESTOR` no kiosk mantém o dock (restrição de E3, nota de 2026-08-23 no fim de §15 da spec de E1, formalizada em §4.3 da spec de E4).
- Guards aplicados nesta entrega, exatamente como o design doc especifica: `canActivateGestor` em `/dashboard`, `/heatmap` e `/config` (`GET /summary` e todo o CRUD de câmeras/estações/equipes/usuários são `GESTOR`-only, §2.6); o guard combinado `canActivateOperadorOuGestor` em `/estacao/:id`; `canActivateOnboarding` na rota `''` (Task 2, ligado à rota em Task 6), que consulta `GET /api/v1/setup/status` — não exige sessão nenhuma, só decide entre mostrar o wizard (`configured: false`) e redirecionar para `/login` (`configured: true`), design doc §2.5/§4.2. `/incidentes`, `/incidentes/:id` e `/estacoes` **ficam sem guard nesta entrega** — o design doc é explícito (§4.3): `canActivateAutenticado` existe "por simetria", mas não é ligado a nenhuma rota agora. `/login`/`/login-estacao` continuam públicas, sem guard nenhum.
- Sem `returnUrl`: um guard que redireciona sempre manda para `/login` ou `/login-estacao` fixo, nunca round-tripa a URL de destino em query param — o design doc não pede isso, e login bem-sucedido sempre cai em `/dashboard` (gestor) ou `/estacao/:estacaoId` (operador, da própria resposta do login).
- `AuthService.logout()` limpa a sessão local (`role`/`estacaoId`) imediatamente, sem esperar a resposta do `POST /auth/logout` — a chamada ao servidor é best-effort; a navegação não pode ficar presa por causa de uma rede lenta numa ação de saída.
- Modo de exemplo (`useMockData: true`) passa a exigir login de verdade: com os guards ligados, `/dashboard` sem sessão redireciona para `/login`. Credencial semeada no mock: usuário `gestor.demo`, senha `demo123` (constante `GESTOR_DEMO` em `fixtures.ts`); tokens de estação semeados: `EST-01`→`est-tok-01`, `EST-02`→`est-tok-02`, `EST-03`→`est-tok-03` (constante `TOKENS_ESTACAO`). `LoginComponent` mostra essas credenciais em tela quando `USE_MOCK_DATA` é verdadeiro (mesmo token/padrão que `ConnectionBadgeComponent` já usa para o selo "dados de exemplo" — nunca lê `environment` diretamente).
- **Revisado em 2026-08-23, segunda rodada de design (§2.5/§4.2.1 do design doc):** `OnboardingService.launch()` não é mais só `localStorage`. Antes de `persistConfig()`, `launch()` chama `POST /api/v1/setup` com o usuário/senha coletados num passo novo do wizard ("Usuário mestre", Task 3) — sucesso autentica a sessão de resposta (mesmo formato de `POST /auth/login`) e só então a sequência de sempre continua (`persistConfig()`, navegação para `/dashboard`). Com o guard `canActivateGestor` novo em `/dashboard`, isso importa: sem essa autenticação a navegação do onboarding bateria em `/login` como qualquer outra sem sessão — é exatamente para evitar isso que `launch()` autentica antes de navegar. Falha do bootstrap (409 se o setup já rodou, ou erro de rede) mantém o usuário no passo de confirmação com um erro visível, sem navegar. No modo de exemplo, o mock replica o mesmo efeito: o handler de `POST /api/v1/setup` (Task 1) autentica `SESSAO_MOCK.atual` no sucesso, exatamente como `POST /auth/login` já fazia.
- `UsuarioPayload` (`{ username: string; papel: 'GESTOR' | 'OPERADOR'; password?: string }`, Task 10) é o contrato que este plano fixa para `POST`/`PUT /api/v1/users` do lado do front — o plano irmão do backend precisa bater com esse formato exato (`password` ausente em edição sem redefinição, presente e obrigatório na criação).
- Nenhuma task altera `CatalogService`, `IncidentService`, `ConfigService` ou os tipos de `incident.models.ts` além do que está explicitado nela. Nenhuma task deste plano toca o backend (`cypher`) nem o `cypher-capture` — são os planos irmãos dos passos 1, 2 e 4 de §7 do design doc.

---

### Task 1: `AuthService` + handlers de autenticação no mock

**Files:**
- Create: `src/app/shared/auth/auth.models.ts`
- Create: `src/app/shared/auth/auth.service.ts`
- Test: `src/app/shared/auth/auth.service.spec.ts`
- Modify: `src/app/shared/mock/fixtures.ts` — `GESTOR_DEMO`, `TOKENS_ESTACAO`, `SessaoMock`, `SESSAO_MOCK`, `resetMockSessao`
- Modify: `src/app/shared/mock/mock-api.interceptor.ts` — handlers de `/auth/login`, `/auth/login-estacao`, `/auth/logout`, `/auth/me`
- Modify: `src/app/shared/mock/mock-api.interceptor.spec.ts` — testes dos handlers novos

**Interfaces:**
- Produces: `Papel = 'GESTOR' | 'OPERADOR'` (`auth.models.ts`) — reusado por `auth.service.ts` (Task 1), `auth.guards.ts` (Task 2) e `team.models.ts` (Task 10).
- Produces: `AuthService.role: Signal<Papel | null>`, `AuthService.estacaoId: Signal<string | null>`, `AuthService.checkSession(): Observable<void>`, `AuthService.login(username, password): Observable<LoginResponse>`, `AuthService.loginEstacao(token): Observable<LoginEstacaoResponse>`, `AuthService.logout(): void`.
- Produces: `AuthService.checkSetupStatus(): Observable<boolean>`, `AuthService.bootstrap(username, password): Observable<LoginResponse>` (design doc de E4, §2.5) — o mesmo `tap` que `login()` já faz (seta `role`/`estacaoId`), reaproveitado em vez de duplicado; `checkSetupStatus()` consumido por `canActivateOnboarding` (Task 2), `bootstrap()` consumido por `OnboardingService.launch()` (Task 3).
- Produces (mock): `GESTOR_DEMO: { username: string; password: string }`, `TOKENS_ESTACAO: Record<string, string>`, `resetMockSessao(): void` — consumidos por `LoginComponent`/`LoginEstacaoComponent` (Tasks 4–5, hint de demo) e por `Task 10` (login passa a validar contra `USUARIOS_MUTAVEL`, semeado a partir de `GESTOR_DEMO`).
- Produces (mock): `SETUP_MOCK: { concluido: boolean }`, `resetMockSetup(): void` — estado independente de `USUARIOS_MUTAVEL` (que só existe a partir de Task 10; ver comentário no handler de `POST /setup`), consumido só pelos handlers de `/setup/status`/`/setup` deste próprio Task 1.

- [ ] **Step 0: Criar a branch**

```bash
cd /home/asaas/projects/challenge/cypher-front
git checkout dev
git pull
git checkout -b e4c-front-acesso-equipes
```

- [ ] **Step 1: Modelos de auth**

Criar `src/app/shared/auth/auth.models.ts`:

```typescript
/** Espelho do contrato de `/api/v1/auth/*` (design doc de E4, §2.2). */

export type Papel = 'GESTOR' | 'OPERADOR';

export interface LoginResponse {
  papel: 'GESTOR';
  username: string;
}

export interface LoginEstacaoResponse {
  papel: 'OPERADOR';
  estacaoId: string;
}

export interface MeResponse {
  papel: Papel;
  username?: string;
  estacaoId?: string;
}

/** `GET /api/v1/setup/status` (design doc de E4, §2.5) — público, sem sessão. */
export interface SetupStatusResponse {
  configured: boolean;
}
```

- [ ] **Step 2: Escrever o spec do `AuthService` que falha**

Criar `src/app/shared/auth/auth.service.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  it('checa a sessão no boot; sessão válida define role e estacaoId', () => {
    const req = http.expectOne(`${environment.apiUrl}/auth/me`);
    expect(req.request.withCredentials).toBe(true);
    req.flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });

    expect(service.role()).toBe('OPERADOR');
    expect(service.estacaoId()).toBe('EST-01');
  });

  it('401 no boot vira role null, nao erro', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(service.role()).toBeNull();
    expect(service.estacaoId()).toBeNull();
  });

  it('checkSession chamado de novo nao refaz a requisicao', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    service.checkSession().subscribe();

    http.expectNone(`${environment.apiUrl}/auth/me`);
  });

  it('login define role GESTOR e limpa estacaoId', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    service.login('gestor1', 'senha123').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.body).toEqual({ username: 'gestor1', password: 'senha123' });
    expect(req.request.withCredentials).toBe(true);
    req.flush({ papel: 'GESTOR', username: 'gestor1' });

    expect(service.role()).toBe('GESTOR');
    expect(service.estacaoId()).toBeNull();
  });

  it('login com credencial invalida propaga o erro para quem chamou', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    let falhou = false;
    service.login('gestor1', 'errada').subscribe({ error: () => { falhou = true; } });

    http.expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ erro: 'Usuário ou senha inválidos' }, { status: 401, statusText: 'Unauthorized' });

    expect(falhou).toBe(true);
    expect(service.role()).toBeNull();
  });

  it('loginEstacao define role OPERADOR e a estacaoId recebida', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    service.loginEstacao('est-tok-01').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/auth/login-estacao`);
    expect(req.request.body).toEqual({ token: 'est-tok-01' });
    req.flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });

    expect(service.role()).toBe('OPERADOR');
    expect(service.estacaoId()).toBe('EST-01');
  });

  it('logout limpa a sessao local de imediato, sem esperar a resposta do servidor', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'gestor1' });
    expect(service.role()).toBe('GESTOR');

    service.logout();

    expect(service.role()).toBeNull();
    expect(service.estacaoId()).toBeNull();
    const req = http.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.withCredentials).toBe(true);
    req.flush(null);
  });

  it('checkSetupStatus reflete o campo configured da resposta (design doc de E4, §2.5)', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    let configurado: boolean | undefined;
    service.checkSetupStatus().subscribe(v => { configurado = v; });

    const req = http.expectOne(`${environment.apiUrl}/setup/status`);
    expect(req.request.withCredentials).toBe(true);
    req.flush({ configured: true });

    expect(configurado).toBe(true);
  });

  it('bootstrap cria o gestor mestre e autentica a sessao, igual ao login', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    service.bootstrap('admin', 'senhaAdmin1').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/setup`);
    expect(req.request.body).toEqual({ username: 'admin', password: 'senhaAdmin1' });
    expect(req.request.withCredentials).toBe(true);
    req.flush({ papel: 'GESTOR', username: 'admin' });

    expect(service.role()).toBe('GESTOR');
    expect(service.estacaoId()).toBeNull();
  });

  it('bootstrap com setup ja concluido (409) propaga o erro para quem chamou', () => {
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    let falhou = false;
    service.bootstrap('admin', 'senhaAdmin1').subscribe({ error: () => { falhou = true; } });

    http.expectOne(`${environment.apiUrl}/setup`)
      .flush({ erro: 'Setup já concluído' }, { status: 409, statusText: 'Conflict' });

    expect(falhou).toBe(true);
    expect(service.role()).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `Cannot find module './auth.service'`

- [ ] **Step 4: Implementar `AuthService`**

Criar `src/app/shared/auth/auth.service.ts`:

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { LoginEstacaoResponse, LoginResponse, MeResponse, Papel, SetupStatusResponse } from './auth.models';

/**
 * Sessão do usuário (cookie `JSESSIONID`, `HttpOnly` — este serviço nunca vê
 * nem guarda o cookie em si, só o que `/auth/me` responde a partir dele).
 *
 * Segue o padrão de `IncidentService`/`ConfigService`: store de signals,
 * `withCredentials: true` em toda chamada.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private readonly _role = signal<Papel | null>(null);
  private readonly _estacaoId = signal<string | null>(null);

  readonly role = this._role.asReadonly();
  readonly estacaoId = this._estacaoId.asReadonly();

  /**
   * Cacheia a checagem inicial: guards e componentes podem chamar
   * `checkSession()` quantas vezes quiserem — só o primeiro dispara o GET.
   * Chamadas depois de `login`/`loginEstacao`/`logout` continuam corretas
   * porque quem decide é sempre `role()`/`estacaoId()`, lidos no momento da
   * decisão — nunca o corpo desta resposta cacheada.
   */
  private sessaoVerificada$: Observable<void> | null = null;

  constructor() {
    this.checkSession().subscribe();
  }

  /** GET /auth/me no boot; 401 vira role null, silenciosamente — ainda não logado não é falha. */
  checkSession(): Observable<void> {
    if (!this.sessaoVerificada$) {
      this.sessaoVerificada$ = this.http
        .get<MeResponse>(`${environment.apiUrl}/auth/me`, { withCredentials: true })
        .pipe(
          tap(resp => {
            this._role.set(resp.papel);
            this._estacaoId.set(resp.estacaoId ?? null);
          }),
          map(() => undefined),
          catchError(() => {
            this._role.set(null);
            this._estacaoId.set(null);
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
        this._estacaoId.set(null);
      }));
  }

  loginEstacao(token: string): Observable<LoginEstacaoResponse> {
    return this.http
      .post<LoginEstacaoResponse>(`${environment.apiUrl}/auth/login-estacao`, { token },
        { withCredentials: true })
      .pipe(tap(resp => {
        this._role.set(resp.papel);
        this._estacaoId.set(resp.estacaoId);
      }));
  }

  /** Limpa a sessão local de imediato — não trava a navegação numa rede lenta numa ação de saída. */
  logout(): void {
    this._role.set(null);
    this._estacaoId.set(null);
    this.http.post(`${environment.apiUrl}/auth/logout`, {}, { withCredentials: true })
      .subscribe({ error: () => { /* sessão local já foi limpa */ } });
  }

  /** `GET /setup/status` (design doc §2.5) — não toca `role`/`estacaoId`, só informa se o onboarding já rodou. Usado por `canActivateOnboarding` (Task 2). */
  checkSetupStatus(): Observable<boolean> {
    return this.http
      .get<SetupStatusResponse>(`${environment.apiUrl}/setup/status`, { withCredentials: true })
      .pipe(map(resp => resp.configured));
  }

  /**
   * `POST /setup` (design doc §2.5) — cria o gestor mestre e autentica a
   * sessão de resposta, mesmo formato de `login()`. Mesmo `tap`, porque o
   * efeito colateral em `role`/`estacaoId` é idêntico: só a pré-condição do
   * lado do servidor muda (tabela vazia vs. credencial existente). Usado por
   * `OnboardingService.launch()` (Task 3).
   */
  bootstrap(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/setup`, { username, password },
        { withCredentials: true })
      .pipe(tap(resp => {
        this._role.set(resp.papel);
        this._estacaoId.set(null);
      }));
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — todos os testes de `auth.service.spec.ts`

- [ ] **Step 6: Escrever os testes dos handlers de auth do mock que falham**

Em `src/app/shared/mock/mock-api.interceptor.spec.ts`, adicionar ao import de `./fixtures`:

```typescript
import {
  EMITIDOS, GESTOR_DEMO, INCIDENTS, TOKENS_ESTACAO, agoraNaPlanta, resetMockCatalog,
  resetMockSessao, resetMockSetup, resumo,
} from './fixtures';
```

E adicionar `resetMockSessao(); resetMockSetup();` dentro do `beforeEach` do primeiro `describe('mockApiInterceptor', ...)` (a partir da linha 16), logo após `TestBed.resetTestingModule();`. Depois, adicionar estes testes ao final do mesmo `describe`, depois dos testes de `/incidents/{id}` do plano de E3:

```typescript
  it('GET /setup/status comeca configured:false', async () => {
    const resp = await firstValueFrom(
      http.get<{ configured: boolean }>(`${environment.apiUrl}/setup/status`));

    expect(resp).toEqual({ configured: false });
  });

  it('POST /setup cria o gestor mestre, autentica a sessao e fecha o setup', async () => {
    const resp = await firstValueFrom(
      http.post<{ papel: string; username: string }>(`${environment.apiUrl}/setup`,
        { username: 'admin', password: 'senhaAdmin1' }));

    expect(resp).toEqual({ papel: 'GESTOR', username: 'admin' });

    const status = await firstValueFrom(
      http.get<{ configured: boolean }>(`${environment.apiUrl}/setup/status`));
    expect(status).toEqual({ configured: true });

    const me = await firstValueFrom(http.get(`${environment.apiUrl}/auth/me`));
    expect(me).toEqual({ papel: 'GESTOR', username: 'admin' });
  });

  it('POST /setup depois de concluido devolve 409 (execucao unica)', async () => {
    await firstValueFrom(http.post(`${environment.apiUrl}/setup`,
      { username: 'admin', password: 'senhaAdmin1' }));

    await expect(firstValueFrom(http.post(`${environment.apiUrl}/setup`,
      { username: 'outro', password: 'outrasenha' })))
      .rejects.toMatchObject({ status: 409 });
  });

  it('responde POST /auth/login com credencial correta e mantem a sessao', async () => {
    const resp = await firstValueFrom(
      http.post<{ papel: string; username: string }>(`${environment.apiUrl}/auth/login`,
        { username: GESTOR_DEMO.username, password: GESTOR_DEMO.password }));

    expect(resp).toEqual({ papel: 'GESTOR', username: GESTOR_DEMO.username });

    const me = await firstValueFrom(http.get(`${environment.apiUrl}/auth/me`));
    expect(me).toEqual({ papel: 'GESTOR', username: GESTOR_DEMO.username });
  });

  it('POST /auth/login com senha errada devolve 401', async () => {
    await expect(firstValueFrom(
      http.post(`${environment.apiUrl}/auth/login`,
        { username: GESTOR_DEMO.username, password: 'errada' })))
      .rejects.toMatchObject({ status: 401 });
  });

  it('responde POST /auth/login-estacao com token valido', async () => {
    const resp = await firstValueFrom(
      http.post<{ papel: string; estacaoId: string }>(`${environment.apiUrl}/auth/login-estacao`,
        { token: TOKENS_ESTACAO['EST-01'] }));

    expect(resp).toEqual({ papel: 'OPERADOR', estacaoId: 'EST-01' });
  });

  it('POST /auth/login-estacao com token invalido devolve 401', async () => {
    await expect(firstValueFrom(
      http.post(`${environment.apiUrl}/auth/login-estacao`, { token: 'token-que-nao-existe' })))
      .rejects.toMatchObject({ status: 401 });
  });

  it('GET /auth/me sem sessao devolve 401', async () => {
    await expect(firstValueFrom(http.get(`${environment.apiUrl}/auth/me`)))
      .rejects.toMatchObject({ status: 401 });
  });

  it('POST /auth/logout encerra a sessao — /auth/me volta a 401', async () => {
    await firstValueFrom(
      http.post(`${environment.apiUrl}/auth/login`,
        { username: GESTOR_DEMO.username, password: GESTOR_DEMO.password }));

    await firstValueFrom(http.post(`${environment.apiUrl}/auth/logout`, {}));

    await expect(firstValueFrom(http.get(`${environment.apiUrl}/auth/me`)))
      .rejects.toMatchObject({ status: 401 });
  });
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `GESTOR_DEMO`/`TOKENS_ESTACAO`/`resetMockSessao`/`resetMockSetup` não existem ainda em `fixtures.ts`, e nenhum handler responde `/auth/*` nem `/setup*`

- [ ] **Step 8: Semear as fixtures de auth**

Em `src/app/shared/mock/fixtures.ts`, adicionar ao final do arquivo (depois de `resetMockCatalog();`):

```typescript
// ---------------- autenticação (mock) ----------------

/** Credencial única do modo de exemplo — mostrada em tela por `LoginComponent` quando `USE_MOCK_DATA` é true. */
export const GESTOR_DEMO = { username: 'gestor.demo', password: 'demo123' };

/** Token de estação por id — só existe no mock; no backend real fica em `Estacao.token`, nunca exposto ao dashboard (design doc de E4, §2.4). */
export const TOKENS_ESTACAO: Record<string, string> = {
  'EST-01': 'est-tok-01',
  'EST-02': 'est-tok-02',
  'EST-03': 'est-tok-03',
};

export type SessaoMock =
  | { papel: 'GESTOR'; username: string }
  | { papel: 'OPERADOR'; estacaoId: string };

/**
 * Sessão atual do mock.
 *
 * Objeto com propriedade mutável, não `let` exportado: um módulo importador
 * (o interceptor) não pode reatribuir um `let` importado, só mutar o que ele
 * referencia — a mesma razão de `STATIONS_MUTAVEL` ser um array mutado via
 * `.push()`, nunca reatribuído fora deste arquivo.
 */
export const SESSAO_MOCK: { atual: SessaoMock | null } = { atual: null };

export function resetMockSessao(): void {
  SESSAO_MOCK.atual = null;
}

/**
 * Se o onboarding (o "setup de execução única", design doc de E4 §2.5) já
 * rodou no mock. Independente de `USUARIOS_MUTAVEL` (Task 10) de propósito:
 * esse array ainda não existe neste ponto do plano, e o mock aqui só precisa
 * provar o contrato request/response de `/setup*` e a autenticação da sessão
 * — não uma réplica fiel de "existe ≥1 Usuario" (ver comentário no handler
 * de `POST /setup`, no interceptor).
 */
export const SETUP_MOCK: { concluido: boolean } = { concluido: false };

export function resetMockSetup(): void {
  SETUP_MOCK.concluido = false;
}
```

- [ ] **Step 9: Implementar os handlers de `/auth/*` no interceptor**

Em `src/app/shared/mock/mock-api.interceptor.ts`, atualizar o import de `./fixtures`:

```typescript
import {
  CAMERAS_MUTAVEL, EMITIDOS, GESTOR_DEMO, INCIDENTS, SESSAO_MOCK, SETUP_MOCK, STATIONS_MUTAVEL,
  TOKENS_ESTACAO, resumo,
} from './fixtures';
```

E adicionar, logo depois de `const base = environment.apiUrl;` dentro de `responder()` (antes da seção `// ---------------- escrita de estação ----------------`):

```typescript
  // ---------------- setup (execução única, design doc de E4 §2.5) ----------------

  if (req.method === 'GET' && req.url === `${base}/setup/status`) {
    return { configured: SETUP_MOCK.concluido };
  }

  if (req.method === 'POST' && req.url === `${base}/setup`) {
    if (SETUP_MOCK.concluido) {
      return conflito('Setup já concluído — o gestor mestre já existe.');
    }
    // SETUP_MOCK é intencionalmente independente de USUARIOS_MUTAVEL: esse
    // array só passa a existir em Task 10. O único efeito que este mock
    // precisa provar aqui é o contrato request/response e a autenticação da
    // sessão de resposta, igual a POST /auth/login — não uma persistência
    // real do usuário criado no catálogo de usuários do mock.
    const { username } = req.body as { username: string; password: string };
    SETUP_MOCK.concluido = true;
    SESSAO_MOCK.atual = { papel: 'GESTOR', username };
    return { papel: 'GESTOR', username };
  }

  // ---------------- autenticação ----------------

  if (req.method === 'POST' && req.url === `${base}/auth/login`) {
    const { username, password } = req.body as { username: string; password: string };
    if (username !== GESTOR_DEMO.username || password !== GESTOR_DEMO.password) {
      return new HttpErrorResponse({ status: 401, error: { erro: 'Usuário ou senha inválidos' } });
    }
    SESSAO_MOCK.atual = { papel: 'GESTOR', username };
    return { papel: 'GESTOR', username };
  }

  if (req.method === 'POST' && req.url === `${base}/auth/login-estacao`) {
    const { token } = req.body as { token: string };
    const estacaoId = Object.entries(TOKENS_ESTACAO).find(([, t]) => t === token)?.[0];
    if (!estacaoId) {
      return new HttpErrorResponse({ status: 401, error: { erro: 'Token inválido' } });
    }
    SESSAO_MOCK.atual = { papel: 'OPERADOR', estacaoId };
    return { papel: 'OPERADOR', estacaoId };
  }

  if (req.method === 'POST' && req.url === `${base}/auth/logout`) {
    SESSAO_MOCK.atual = null;
    return null;
  }

  if (req.method === 'GET' && req.url === `${base}/auth/me`) {
    return SESSAO_MOCK.atual
      ?? new HttpErrorResponse({ status: 401, error: { erro: 'Não autenticado' } });
  }
```

- [ ] **Step 10: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — suíte inteira, sem regressão

- [ ] **Step 11: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/auth/auth.models.ts src/app/shared/auth/auth.service.ts \
        src/app/shared/auth/auth.service.spec.ts \
        src/app/shared/mock/fixtures.ts \
        src/app/shared/mock/mock-api.interceptor.ts \
        src/app/shared/mock/mock-api.interceptor.spec.ts
git commit -m "feat(front): AuthService e endpoints de autenticacao no mock"
```

---

### Task 2: Guards funcionais

**Files:**
- Create: `src/app/shared/auth/auth.guards.ts`
- Test: `src/app/shared/auth/auth.guards.spec.ts`

**Interfaces:**
- Consumes: `AuthService.role`, `AuthService.estacaoId`, `AuthService.checkSession()`, `AuthService.checkSetupStatus()` (Task 1)
- Produces: `canActivateGestor: CanActivateFn`, `canActivateOperador: CanActivateFn`, `canActivateAutenticado: CanActivateFn`, `canActivateOperadorOuGestor: CanActivateFn`, `canActivateOnboarding: CanActivateFn` — os cinco consumidos por `app.routes.ts` (Task 6), exceto `canActivateOperador`/`canActivateAutenticado`, que existem por simetria com o contrato do design doc (§4.3) mas não são ligados a nenhuma rota nesta entrega.

- [ ] **Step 1: Escrever o spec dos guards que falha**

Criar `src/app/shared/auth/auth.guards.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter,
} from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import {
  canActivateAutenticado, canActivateGestor, canActivateOnboarding, canActivateOperador,
  canActivateOperadorOuGestor,
} from './auth.guards';

function rotaCom(id: string | null): ActivatedRouteSnapshot {
  return { paramMap: convertToParamMap(id ? { id } : {}) } as ActivatedRouteSnapshot;
}

async function resultadoDe(
  guarda: () => import('@angular/router').MaybeAsync<boolean | UrlTree>,
): Promise<boolean | UrlTree> {
  const valor = TestBed.runInInjectionContext(guarda);
  return firstValueFrom(valor as import('rxjs').Observable<boolean | UrlTree>);
}

describe('auth.guards', () => {
  let http: HttpTestingController;
  let router: Router;

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
    router = TestBed.inject(Router);
  });

  it('canActivateGestor libera GESTOR', async () => {
    const promessa = resultadoDe(() =>
      canActivateGestor(rotaCom(null), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });

    expect(await promessa).toBe(true);
  });

  it('canActivateGestor redireciona OPERADOR e anônimo para /login', async () => {
    const promessa = resultadoDe(() =>
      canActivateGestor(rotaCom(null), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    const resultado = await promessa;
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login');
  });

  it('canActivateOperador libera OPERADOR só quando :id bate com a propria estacaoId', async () => {
    const promessa = resultadoDe(() =>
      canActivateOperador(rotaCom('EST-01'), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });

    expect(await promessa).toBe(true);
  });

  it('canActivateOperador redireciona OPERADOR tentando entrar na estacao de outro', async () => {
    const promessa = resultadoDe(() =>
      canActivateOperador(rotaCom('EST-02'), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });

    const resultado = await promessa;
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login-estacao');
  });

  it('canActivateOperador redireciona GESTOR para /login-estacao (sem bypass)', async () => {
    const promessa = resultadoDe(() =>
      canActivateOperador(rotaCom('EST-01'), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });

    const resultado = await promessa;
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login-estacao');
  });

  it('canActivateOperadorOuGestor libera GESTOR em qualquer estacao', async () => {
    const promessa = resultadoDe(() =>
      canActivateOperadorOuGestor(rotaCom('EST-03'), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });

    expect(await promessa).toBe(true);
  });

  it('canActivateOperadorOuGestor libera OPERADOR só na propria estacao', async () => {
    const promessa = resultadoDe(() =>
      canActivateOperadorOuGestor(rotaCom('EST-02'), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });

    const resultado = await promessa;
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login-estacao');
  });

  it('canActivateAutenticado libera qualquer papel, redireciona anonimo', async () => {
    const liberado = resultadoDe(() =>
      canActivateAutenticado(rotaCom(null), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
    expect(await liberado).toBe(true);
  });

  it('canActivateOnboarding libera quando o setup ainda nao rodou', async () => {
    // A instanciação de AuthService (via inject) dispara GET /auth/me sozinha,
    // mas canActivateOnboarding não depende dela — só de checkSetupStatus().
    // Não flushar /auth/me aqui é deliberado: este spec não chama http.verify(),
    // então a requisição pendente é inofensiva.
    const promessa = resultadoDe(() =>
      canActivateOnboarding(rotaCom(null), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/setup/status`).flush({ configured: false });

    expect(await promessa).toBe(true);
  });

  it('canActivateOnboarding redireciona para /login quando o setup ja rodou', async () => {
    const promessa = resultadoDe(() =>
      canActivateOnboarding(rotaCom(null), {} as RouterStateSnapshot));
    http.expectOne(`${environment.apiUrl}/setup/status`).flush({ configured: true });

    const resultado = await promessa;
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `Cannot find module './auth.guards'`

- [ ] **Step 3: Implementar os guards**

Criar `src/app/shared/auth/auth.guards.ts`:

```typescript
import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from './auth.service';

/** Redireciona para /login se `auth.role() !== 'GESTOR'` (design doc de E4, §4.3). */
export const canActivateGestor: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.checkSession().pipe(
    map(() => (auth.role() === 'GESTOR' ? true : router.parseUrl('/login'))),
  );
};

/** Redireciona para /login-estacao se `auth.role() !== 'OPERADOR'`, e valida `:id` contra `auth.estacaoId()`. */
export const canActivateOperador: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.checkSession().pipe(
    map(() => {
      if (auth.role() !== 'OPERADOR') {
        return router.parseUrl('/login-estacao');
      }
      const id = route.paramMap.get('id');
      return id === auth.estacaoId() ? true : router.parseUrl('/login-estacao');
    }),
  );
};

/** Qualquer papel autenticado — não ligada a nenhuma rota nesta entrega, existe por simetria (design doc §4.3). */
export const canActivateAutenticado: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.checkSession().pipe(
    map(() => (auth.role() !== null ? true : router.parseUrl('/login'))),
  );
};

/**
 * `/estacao/:id`: um OPERADOR só entra na própria estação; um GESTOR entra em
 * qualquer uma, mantendo o dock (restrição de E3, nota de 2026-08-23 na spec
 * de E1 §15). Não existe combinador "ou" nativo para `CanActivateFn` — a
 * regra fica numa função própria em vez de duas guardas encadeadas.
 */
export const canActivateOperadorOuGestor: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.checkSession().pipe(
    map(() => {
      const papel = auth.role();
      if (papel === 'GESTOR') {
        return true;
      }
      if (papel === 'OPERADOR') {
        const id = route.paramMap.get('id');
        return id === auth.estacaoId() ? true : router.parseUrl('/login-estacao');
      }
      return router.parseUrl('/login-estacao');
    }),
  );
};

/**
 * `''` (onboarding, design doc de E4 §2.5/§4.2): consulta `GET /setup/status`,
 * não `checkSession()` — mostrar o wizard ou redirecionar não depende de quem
 * está logado, só de o primeiro `Usuario` já existir. Público por natureza:
 * não exige sessão nenhuma para responder.
 */
export const canActivateOnboarding: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.checkSetupStatus().pipe(
    map(configured => (configured ? router.parseUrl('/login') : true)),
  );
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — todos os testes de `auth.guards.spec.ts`

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/auth/auth.guards.ts src/app/shared/auth/auth.guards.spec.ts
git commit -m "feat(front): guards de autenticacao (canActivateGestor, canActivateOperador, canActivateOperadorOuGestor, canActivateOnboarding)"
```

---

### Task 3: Onboarding — passo "Usuário mestre" e bootstrap do gestor mestre

**Files:**
- Modify: `src/app/onboarding/models/onboarding.models.ts` — `STEPS`, `OnboardingData`, `DEFAULT_DATA`
- Modify: `src/app/onboarding/onboarding.service.ts` — `validateStep`, `launch()`, `setupError`
- Modify: `src/app/onboarding/onboarding.service.spec.ts`
- Create: `src/app/onboarding/steps/step-master-user/step-master-user.component.ts`, `.html`
- Modify: `src/app/onboarding/onboarding.component.ts`, `.html`
- Modify: `src/app/onboarding/steps/step2-epis/step2-epis.component.html` — eyebrow "Etapa 02" → "Etapa 03"
- Modify: `src/app/onboarding/steps/step3-cas/step3-cas.component.html` — eyebrow "Etapa 03" → "Etapa 04"
- Modify: `src/app/onboarding/steps/step4-confirm/step4-confirm.component.html` — eyebrow "Etapa 04" → "Etapa 05", exibição do erro de bootstrap

**Interfaces:**
- Consumes: `AuthService.bootstrap(username, password): Observable<LoginResponse>` (Task 1), `mensagemDeErro` (`incident.models.ts`)
- Produces: `StepMasterUserComponent`; `OnboardingData.masterUsername: string`/`masterPassword: string`; `STEPS` ganha a chave `'master-user'` no índice 1 (entre `'identity'` e `'stations'`); `OnboardingService.setupError: Signal<string | null>` — nenhum consumidor fora deste task, existe só para o template do passo de confirmação exibir a falha do bootstrap.

- [ ] **Step 1: Modelos — nova etapa e campos de credencial**

Em `src/app/onboarding/models/onboarding.models.ts`, adicionar os dois campos novos à interface (depois de `accent`) e ao `DEFAULT_DATA`:

```typescript
export interface OnboardingData {
  company: string;
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
  company: '', cnpj: '', sector: '', logoUrl: '', logoName: '',
  accent: '#F4622A', masterUsername: '', masterPassword: '', epis: [], cas: {}, picks: {},
};
```

E inserir a nova etapa em `STEPS`, logo após `'identity'` (design doc de E4, §4.2.1 — "logo após 'Identidade da empresa' e antes de 'Estações e câmeras'"):

```typescript
export const STEPS: Step[] = [
  { key: 'identity', name: 'Identidade da empresa', hint: 'Marca · CNPJ · cor' },
  { key: 'master-user', name: 'Usuário mestre', hint: 'Acesso do gestor' },
  // Antes dos EPIs de propósito: sem câmera cadastrada o sistema não vê nada.
  { key: 'stations', name: 'Estações e câmeras', hint: 'O que será monitorado' },
  { key: 'epis', name: 'EPIs monitorados', hint: 'Seleção dos equipamentos' },
  { key: 'cas', name: 'CAs e validades', hint: 'Opcional · certificados' },
  { key: 'launch', name: 'Confirmação', hint: 'Revisar e iniciar' },
];
```

`topbar.component.ts`/`step-indicator.component.ts`/`checklist.component.ts` leem `steps.length`/`state.step()` dinamicamente (nenhum hardcoda a contagem) — inserir aqui não exige tocar nesses três arquivos.

- [ ] **Step 2: Atualizar `onboarding.service.spec.ts` — passos existentes que agora quebram, e os testes novos que falham**

`OnboardingService` passa a injetar `AuthService` (Step 4 abaixo), que por sua vez injeta `HttpClient` — o spec de hoje não provê nenhum dos dois. Como `OnboardingService` é `providedIn: 'root'`, isso poderia quebrar qualquer outro spec que a instancie direta ou transitivamente; `grep -rln "OnboardingService" src/app --include="*.ts"` confirma que só os próprios arquivos de `onboarding/` a consomem (nenhum deles tem `.spec.ts` próprio hoje, exceto este), e não existe `app.component.spec.ts` nem nenhum outro spec fora de `onboarding/` que renderize `OnboardingComponent` ou qualquer um de seus steps — o blast radius desta mudança é só este arquivo. Substituir `src/app/onboarding/onboarding.service.spec.ts` inteiro por:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import { OnboardingService } from './onboarding.service';
import { ThemeService } from '../shared/theme.service';
import { STEPS } from './models/onboarding.models';

describe('OnboardingService e o tema', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  it('o wizard enxerga o tema trocado fora dele', () => {
    const theme = TestBed.inject(ThemeService);
    const state = TestBed.inject(OnboardingService);
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    // Simula o toggle da topbar do dashboard, depois de o wizard já existir.
    theme.set('light');

    // Guardar uma cópia em data() não passaria aqui: o effect do serviço só
    // reage a mudanças de data(), e data() não mudou.
    expect(theme.theme()).toBe('light');
    expect(state.data()).not.toHaveProperty('theme');
  });

  it('persistConfig não grava mais o tema em cypher.config, nem a credencial do gestor mestre', () => {
    const state = TestBed.inject(OnboardingService);
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    state.updateData({ company: 'Acme', masterUsername: 'admin', masterPassword: 'senhaAdmin1' });

    state.persistConfig();

    const gravado = JSON.parse(localStorage.getItem('cypher.config')!);
    expect(gravado.company).toBe('Acme');
    expect(gravado).not.toHaveProperty('theme');
    expect(gravado).not.toHaveProperty('masterUsername');
    expect(gravado).not.toHaveProperty('masterPassword');
  });
});

describe('OnboardingService — passo de estações e usuário mestre', () => {
  let service: OnboardingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        provideHttpClient(withFetch()), provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(OnboardingService);
    http = TestBed.inject(HttpTestingController);
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
  });

  it('o wizard tem seis passos, com o usuario mestre logo apos a identidade', () => {
    expect(STEPS.map(s => s.key))
      .toEqual(['identity', 'master-user', 'stations', 'epis', 'cas', 'launch']);
  });

  it('valida por chave, nao por posicao', () => {
    // EPIs agora estão no índice 3. Se a validação fosse posicional, este
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

  it('valida o usuario mestre por chave, nao por posicao', () => {
    service.updateData({ masterUsername: '', masterPassword: '' });

    const indiceMasterUser = STEPS.findIndex(s => s.key === 'master-user');
    expect(service.validateStep(indiceMasterUser)).toBe(false);
    expect(service.errors()['masterUsername']).toBeTruthy();
    expect(service.errors()['masterPassword']).toBeTruthy();

    service.updateData({ masterUsername: 'admin', masterPassword: 'senhaAdmin1' });
    expect(service.validateStep(indiceMasterUser)).toBe(true);
  });

  it('o passo de estacoes nao bloqueia o avanco', () => {
    // Bloquear tornaria o onboarding um beco sem saída quando a API está
    // fora: o gestor não conseguiria nem chegar ao dashboard para descobrir
    // por quê. O aviso fica na tela do passo.
    const indiceEstacoes = STEPS.findIndex(s => s.key === 'stations');

    expect(service.validateStep(indiceEstacoes)).toBe(true);
  });

  it('avanca ate o ultimo passo', () => {
    service.updateData({
      company: 'Acme', sector: 'Metalurgia', epis: ['capacete'],
      masterUsername: 'admin', masterPassword: 'senhaAdmin1',
    });

    for (let i = 0; i < STEPS.length - 1; i++) {
      service.next();
    }

    expect(service.step()).toBe(STEPS.length - 1);
  });

  it('nao passa do ultimo passo', () => {
    service.updateData({
      company: 'Acme', sector: 'Metalurgia', epis: ['capacete'],
      masterUsername: 'admin', masterPassword: 'senhaAdmin1',
    });
    for (let i = 0; i < STEPS.length + 3; i++) {
      service.next();
    }

    expect(service.step()).toBe(STEPS.length - 1);
  });
});

describe('OnboardingService — bootstrap do gestor mestre no launch() (design doc de E4, §2.5/§4.2.1)', () => {
  let service: OnboardingService;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        provideHttpClient(withFetch()), provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(OnboardingService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    // Fake timers só depois do setup do TestBed/AuthService: launch() é o
    // único código deste describe que usa setTimeout, e nada na construção
    // do injector precisa de um relógio real fake para resolver.
    vi.useFakeTimers();
    service.updateData({
      company: 'Acme', sector: 'Metalurgia', epis: ['capacete'],
      masterUsername: 'admin', masterPassword: 'senhaAdmin1',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('launch chama POST /setup antes de persistConfig, autentica a sessao e navega ao sucesso', () => {
    const navegar = vi.spyOn(router, 'navigate');

    service.launch();

    const req = http.expectOne(`${environment.apiUrl}/setup`);
    expect(req.request.body).toEqual({ username: 'admin', password: 'senhaAdmin1' });
    expect(req.request.withCredentials).toBe(true);
    req.flush({ papel: 'GESTOR', username: 'admin' });

    vi.advanceTimersByTime(900);
    expect(service.launched()).toBe(true);
    expect(JSON.parse(localStorage.getItem('cypher.config')!).company).toBe('Acme');

    vi.advanceTimersByTime(2400);
    expect(navegar).toHaveBeenCalledWith(['/dashboard']);
  });

  it('bootstrap com 409 (setup ja concluido) mantem no passo de confirmacao, com erro visivel, sem navegar', () => {
    const navegar = vi.spyOn(router, 'navigate');

    service.launch();

    http.expectOne(`${environment.apiUrl}/setup`)
      .flush({ erro: 'Setup já concluído' }, { status: 409, statusText: 'Conflict' });

    expect(service.launching()).toBe(false);
    expect(service.launched()).toBe(false);
    expect(service.setupError()).toBe('Setup já concluído');
    expect(localStorage.getItem('cypher.config')).toBeNull();

    vi.advanceTimersByTime(3300);
    expect(navegar).not.toHaveBeenCalled();
  });

  it('erro de rede no bootstrap tambem mantem no passo de confirmacao, com mensagem visivel', () => {
    service.launch();

    http.expectOne(`${environment.apiUrl}/setup`).error(new ProgressEvent('network error'));

    expect(service.launching()).toBe(false);
    expect(service.launched()).toBe(false);
    expect(service.setupError()).toBeTruthy();
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `service.setupError` não existe, `AuthService`/`HttpClient` não resolvem (serviço ainda não os injeta), `STEPS` ainda tem cinco passos e não `'master-user'`

- [ ] **Step 4: Implementar as mudanças em `OnboardingService`**

Em `src/app/onboarding/onboarding.service.ts`, trocar os imports do topo e adicionar `setupError`:

```typescript
import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { OnboardingData, DEFAULT_DATA, STEPS, deriveEpis, accentRgba, accentShade } from './models/onboarding.models';
import { AuthService } from '../shared/auth/auth.service';
import { mensagemDeErro } from '../shared/incident.models';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly data = signal<OnboardingData>({ ...DEFAULT_DATA });
  readonly step = signal(0);
  readonly direction = signal<'forward' | 'back'>('forward');
  readonly launching = signal(false);
  readonly launched = signal(false);
  readonly errors = signal<Record<string, string>>({});
  /** Erro do bootstrap (`POST /setup`) — separado de `errors` porque não é validação de campo, é falha de rede/409 (design doc de E4, §4.2.1). */
  readonly setupError = signal<string | null>(null);
```

Em `validateStep`, adicionar o caso `'master-user'` (entre `'identity'` e `'epis'`, mesma ordem de `STEPS`):

```typescript
    if (key === 'identity') {
      if (!d.company.trim()) e['company'] = 'Nome obrigatório';
      if (d.cnpj && d.cnpj.replace(/\D/g, '').length < 14) e['cnpj'] = 'CNPJ incompleto';
      if (!d.sector) e['sector'] = 'Selecione um setor';
    }

    if (key === 'master-user') {
      if (!d.masterUsername.trim()) e['masterUsername'] = 'Usuário obrigatório';
      if (!d.masterPassword) e['masterPassword'] = 'Senha obrigatória';
    }

    if (key === 'epis') {
      if (d.epis.length === 0) e['epis'] = 'Selecione pelo menos 1 EPI';
    }
```

E substituir `launch()` inteiro:

```typescript
  launch(): void {
    this.launching.set(true);
    this.setupError.set(null);
    const { masterUsername, masterPassword } = this.data();
    this.auth.bootstrap(masterUsername, masterPassword).subscribe({
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

(`persistConfig()` não muda — continua com a mesma lista explícita de campos, então `masterUsername`/`masterPassword` nunca são gravados em `localStorage`, sem precisar de um filtro novo.)

`back()` e `reset()` também não mudam de estrutura, mas ambos ganham a mesma limpeza que já fazem para `errors`: sem isso, um bootstrap que falhou e depois um "Voltar" deixariam o erro antigo visível ao retornar para a confirmação, antes até de tentar de novo.

```typescript
  back(): void {
    if (this.step() > 0) {
      this.direction.set('back');
      this.step.update(s => s - 1);
      this.errors.set({});
      this.setupError.set(null);
    }
  }
```

```typescript
  reset(): void {
    this.launched.set(false);
    this.launching.set(false);
    this.step.set(0);
    this.direction.set('forward');
    this.setupError.set(null);
  }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — `onboarding.service.spec.ts`

- [ ] **Step 6: Criar `StepMasterUserComponent`**

Criar `src/app/onboarding/steps/step-master-user/step-master-user.component.ts`:

```typescript
import { Component, inject } from '@angular/core';
import { OnboardingService } from '../../onboarding.service';

/** Passo "Usuário mestre" (design doc de E4, §4.2.1) — mesmo padrão de `Step1IdentityComponent`. */
@Component({
  selector: 'app-step-master-user',
  imports: [],
  templateUrl: './step-master-user.component.html',
})
export class StepMasterUserComponent {
  state = inject(OnboardingService);

  onUsername(e: Event): void {
    this.state.updateData({ masterUsername: (e.target as HTMLInputElement).value });
  }
  onPassword(e: Event): void {
    this.state.updateData({ masterPassword: (e.target as HTMLInputElement).value });
  }
}
```

Criar `src/app/onboarding/steps/step-master-user/step-master-user.component.html`:

```html
<div class="eyebrow-accent">Etapa 02 · Usuário mestre</div>
<h1 class="q">Crie o <em>acesso do gestor.</em></h1>
<p class="sub">Essa credencial autentica agora mesmo, ao final do setup — é o único jeito de criar o primeiro usuário do Cypher. Gestores seguintes são cadastrados por este, já em Definições · Equipes.</p>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:44px;max-width:640px">
  <div class="field">
    <label>Usuário</label>
    <input class="input" placeholder="nome.sobrenome" autocomplete="username"
           [value]="state.data().masterUsername"
           (input)="onUsername($event)" />
    @if (state.errors()['masterUsername']) {
      <div class="field-error">{{ state.errors()['masterUsername'] }}</div>
    }
  </div>

  <div class="field">
    <label>Senha</label>
    <input class="input" type="password" autocomplete="new-password"
           [value]="state.data().masterPassword"
           (input)="onPassword($event)" />
    @if (state.errors()['masterPassword']) {
      <div class="field-error">{{ state.errors()['masterPassword'] }}</div>
    }
  </div>
</div>
```

- [ ] **Step 7: Ligar o passo novo em `OnboardingComponent`**

Em `src/app/onboarding/onboarding.component.ts`, adicionar o import e registrar no `imports`:

```typescript
import { StepMasterUserComponent } from './steps/step-master-user/step-master-user.component';
```

```typescript
@Component({
  selector: 'app-onboarding',
  imports: [
    TopbarComponent, ChecklistComponent, LaunchOverlayComponent,
    Step1IdentityComponent, StepMasterUserComponent, StepStationsComponent, Step2EpisComponent,
    Step3CasComponent, Step4ConfirmComponent,
  ],
  templateUrl: './onboarding.component.html',
})
```

Em `src/app/onboarding/onboarding.component.html`, adicionar o `@case` entre `'identity'` e `'stations'`:

```html
          @switch (steps[state.step()].key) {
            @case ('identity') { <app-step1-identity/> }
            @case ('master-user') { <app-step-master-user/> }
            @case ('stations') { <app-step-stations/> }
            @case ('epis') { <app-step2-epis/> }
            @case ('cas') { <app-step3-cas/> }
            @case ('launch') { <app-step4-confirm/> }
          }
```

- [ ] **Step 8: Renumerar as etiquetas "Etapa NN" dos passos seguintes**

Inserir `'master-user'` no índice 1 empurra `epis`/`cas`/`launch` uma posição. `step-stations` não tem etiqueta "Etapa NN" (usa outro cabeçalho) — não muda. Trocar:

Em `src/app/onboarding/steps/step2-epis/step2-epis.component.html`, linha 1:
```html
<div class="eyebrow-accent">Etapa 03 · EPIs monitorados</div>
```

Em `src/app/onboarding/steps/step3-cas/step3-cas.component.html`, linha 1:
```html
<div class="eyebrow-accent">Etapa 04 · CAs e validades</div>
```

Em `src/app/onboarding/steps/step4-confirm/step4-confirm.component.html`, linha 1:
```html
<div class="eyebrow-accent">Etapa 05 · Confirmação</div>
```

(Os cartões "— 01"/"— 02"/"— 03" mais abaixo no mesmo arquivo numeram as três seções do resumo — identidade, EPIs, CAs —, não os passos do wizard; não mudam.)

- [ ] **Step 9: Exibir o erro de bootstrap no passo de confirmação**

Em `src/app/onboarding/steps/step4-confirm/step4-confirm.component.html`, adicionar o bloco de erro logo depois do fechamento da `div` de lançamento (o painel é uma linha flex; o erro vai abaixo dela, não dentro):

```html
  <button class="btn primary lg pulsing" (click)="state.launch()" [disabled]="state.launching()">
    {{ state.launching() ? 'Iniciando…' : 'Iniciar Cypher' }}
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7"/>
    </svg>
  </button>
</div>

@if (state.setupError()) {
  <div class="field-error" role="alert" style="margin-top:16px">{{ state.setupError() }}</div>
}
```

`.field-error` já é global desde antes desta entrega (`src/styles.scss:96`) — esta task não toca `styles.scss`.

- [ ] **Step 10: Rodar a suíte completa e o build**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch && npx ng build`
Expected: testes PASS, build sem erro

- [ ] **Step 11: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/onboarding/models/onboarding.models.ts \
        src/app/onboarding/onboarding.service.ts \
        src/app/onboarding/onboarding.service.spec.ts \
        src/app/onboarding/steps/step-master-user/ \
        src/app/onboarding/onboarding.component.ts \
        src/app/onboarding/onboarding.component.html \
        src/app/onboarding/steps/step2-epis/step2-epis.component.html \
        src/app/onboarding/steps/step3-cas/step3-cas.component.html \
        src/app/onboarding/steps/step4-confirm/step4-confirm.component.html
git commit -m "feat(front): onboarding vira setup de execucao unica — passo Usuario mestre e bootstrap via POST /setup"
```

---

### Task 4: `/login` — login do gestor

**Files:**
- Create: `src/app/auth/login.component.ts`
- Create: `src/app/auth/login.component.html`
- Test: `src/app/auth/login.component.spec.ts`
- Modify: `src/styles.scss` — `.auth-shell`, `.auth-panel`, `.auth-form`, `.auth-alt-link`, e a classe global `.vazio` (hoje só existe escopada em `stations-config.component.scss`; várias telas de operação já a usam sem definição global — hoisting necessário para que os estados vazio/erro das telas novas deste plano fiquem visíveis)

**Interfaces:**
- Consumes: `AuthService.login(username, password): Observable<LoginResponse>` (Task 1), `mensagemDeErro` (`incident.models.ts`), `USE_MOCK_DATA` (`shared/mock/use-mock-data.token.ts`), `GESTOR_DEMO` (`shared/mock/fixtures.ts`, Task 1)
- Produces: `LoginComponent` com `draft: Signal<{ username: string; password: string }>`, `erro: Signal<string | null>`, `enviando: Signal<boolean>`, métodos `patch(p)`, `entrar()`

- [ ] **Step 1: Escrever o spec que falha**

Criar `src/app/auth/login.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import { GESTOR_DEMO } from '../shared/mock/fixtures';
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: USE_MOCK_DATA, useValue: false },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  function montar() {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    return fixture;
  }

  it('sem usuario/senha, nao envia e mostra erro', () => {
    const fixture = montar();

    fixture.componentInstance.entrar();

    expect(fixture.componentInstance.erro()).toContain('Informe usuário e senha');
    http.expectNone(`${environment.apiUrl}/auth/login`);
  });

  it('login com sucesso navega para /dashboard', async () => {
    const fixture = montar();
    const navegar = vi.spyOn(router, 'navigate');
    fixture.componentInstance.patch({ username: 'gestor1', password: 'senha123' });

    fixture.componentInstance.entrar();

    const req = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.body).toEqual({ username: 'gestor1', password: 'senha123' });
    req.flush({ papel: 'GESTOR', username: 'gestor1' });

    expect(navegar).toHaveBeenCalledWith(['/dashboard']);
  });

  it('credencial invalida mostra a mensagem do backend, sem navegar', () => {
    const fixture = montar();
    const navegar = vi.spyOn(router, 'navigate');
    fixture.componentInstance.patch({ username: 'gestor1', password: 'errada' });

    fixture.componentInstance.entrar();

    http.expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ erro: 'Usuário ou senha inválidos' }, { status: 401, statusText: 'Unauthorized' });

    expect(fixture.componentInstance.erro()).toBe('Usuário ou senha inválidos');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('sem modo de exemplo, nao mostra a dica de credencial', () => {
    const fixture = montar();

    expect(fixture.nativeElement.textContent).not.toContain(GESTOR_DEMO.username);
  });
});

describe('LoginComponent — modo de exemplo', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: USE_MOCK_DATA, useValue: true },
      ],
    });
  });

  it('mostra a credencial de demonstracao', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${(TestBed.inject as any)}`);
  });
});
```

Corrigir o último teste — `HttpTestingController` precisa flushar `/auth/me` antes da asserção. Substituir o bloco `it('mostra a credencial de demonstracao', ...)` acima por:

```typescript
  it('mostra a credencial de demonstracao', async () => {
    const { environment: env } = await import('../../environments/environment');
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${env.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(GESTOR_DEMO.username);
    expect(fixture.nativeElement.textContent).toContain(GESTOR_DEMO.password);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `Cannot find module './login.component'`

- [ ] **Step 3: Implementar o componente**

Criar `src/app/auth/login.component.ts`:

```typescript
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../shared/auth/auth.service';
import { mensagemDeErro } from '../shared/incident.models';
import { GESTOR_DEMO } from '../shared/mock/fixtures';
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';

interface LoginDraft { username: string; password: string; }

const DRAFT_VAZIO: LoginDraft = { username: '', password: '' };

/** Login do gestor (usuário/senha) — design doc de E4 §4.2. Rota pública, sem topbar/dock. */
@Component({
  selector: 'app-login',
  imports: [RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly exemplo = inject(USE_MOCK_DATA);
  readonly credencialDemo = GESTOR_DEMO;

  readonly draft = signal<LoginDraft>({ ...DRAFT_VAZIO });
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);

  patch(p: Partial<LoginDraft>): void {
    this.draft.update(d => ({ ...d, ...p }));
    this.erro.set(null);
  }

  entrar(): void {
    const { username, password } = this.draft();
    if (!username || !password) {
      this.erro.set('Informe usuário e senha.');
      return;
    }
    this.enviando.set(true);
    this.erro.set(null);
    this.auth.login(username, password).subscribe({
      next: () => {
        this.enviando.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: e => {
        this.enviando.set(false);
        this.erro.set(mensagemDeErro(e));
      },
    });
  }
}
```

Criar `src/app/auth/login.component.html`:

```html
<div class="auth-shell">
  <div class="panel auth-panel">
    <div class="panel-head">
      <div class="ph-left">
        <span class="ph-title">Entrar</span>
        <span class="ph-meta">acesso do gestor</span>
      </div>
    </div>

    <form class="auth-form" (submit)="$event.preventDefault(); entrar()">
      <div class="field">
        <label for="login-username">Usuário</label>
        <input id="login-username" class="input" type="text" autocomplete="username"
               [value]="draft().username" (input)="patch({ username: $any($event.target).value })" />
      </div>
      <div class="field">
        <label for="login-password">Senha</label>
        <input id="login-password" class="input" type="password" autocomplete="current-password"
               [value]="draft().password" (input)="patch({ password: $any($event.target).value })" />
      </div>

      @if (erro()) {
        <p class="vazio" role="alert">{{ erro() }}</p>
      }

      @if (exemplo) {
        <p class="vazio">Modo de exemplo: <code>{{ credencialDemo.username }}</code> / <code>{{ credencialDemo.password }}</code></p>
      }

      <button type="submit" class="btn primary" [disabled]="enviando()">
        {{ enviando() ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>

    <a class="auth-alt-link" routerLink="/login-estacao">Entrar como operador de estação →</a>
  </div>
</div>
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — todos os testes de `login.component.spec.ts`

- [ ] **Step 5: Adicionar as classes CSS**

Em `src/styles.scss`, adicionar ao final do arquivo:

```scss
.auth-shell { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.auth-panel { width: 100%; max-width: 400px; min-height: unset; }
.auth-form { display: flex; flex-direction: column; gap: 18px; margin-top: 20px; }
.auth-alt-link { display: block; text-align: center; margin-top: 20px; font-size: 13px; color: var(--ink-mute); text-decoration: none; }
.auth-alt-link:hover { color: var(--accent); }
// `.vazio` (usada por dashboard/heatmap/incidentes/estacoes/kiosk desde E3, e agora
// por login/estacao-login/equipe-usuarios) nunca tinha sido definida globalmente —
// só existia escopada em stations-config.component.scss.
.vazio { font-size: 13px; color: var(--ink-mute); }
```

- [ ] **Step 6: Rodar a suíte completa e o build**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch && npx ng build`
Expected: testes PASS, build sem erro

- [ ] **Step 7: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/auth/login.component.ts src/app/auth/login.component.html \
        src/app/auth/login.component.spec.ts src/styles.scss
git commit -m "feat(front): tela de login do gestor (/login)"
```

---

### Task 5: `/login-estacao` — login do kiosk por token

**Files:**
- Create: `src/app/auth/login-estacao.component.ts`
- Create: `src/app/auth/login-estacao.component.html`
- Test: `src/app/auth/login-estacao.component.spec.ts`

**Interfaces:**
- Consumes: `AuthService.loginEstacao(token): Observable<LoginEstacaoResponse>` (Task 1), `mensagemDeErro`, `USE_MOCK_DATA`, `TOKENS_ESTACAO` (Task 1)
- Produces: `LoginEstacaoComponent` com `token: Signal<string>`, `erro: Signal<string | null>`, `enviando: Signal<boolean>`, métodos `patch(valor)`, `entrar()`

- [ ] **Step 1: Escrever o spec que falha**

Criar `src/app/auth/login-estacao.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import { TOKENS_ESTACAO } from '../shared/mock/fixtures';
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';
import { LoginEstacaoComponent } from './login-estacao.component';

describe('LoginEstacaoComponent', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: USE_MOCK_DATA, useValue: false },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  function montar() {
    const fixture = TestBed.createComponent(LoginEstacaoComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    return fixture;
  }

  it('sem token, nao envia e mostra erro', () => {
    const fixture = montar();

    fixture.componentInstance.entrar();

    expect(fixture.componentInstance.erro()).toContain('Cole o token');
    http.expectNone(`${environment.apiUrl}/auth/login-estacao`);
  });

  it('token valido navega para /estacao/:estacaoId da resposta', () => {
    const fixture = montar();
    const navegar = vi.spyOn(router, 'navigate');
    fixture.componentInstance.patch('est-tok-01');

    fixture.componentInstance.entrar();

    const req = http.expectOne(`${environment.apiUrl}/auth/login-estacao`);
    expect(req.request.body).toEqual({ token: 'est-tok-01' });
    req.flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });

    expect(navegar).toHaveBeenCalledWith(['/estacao', 'EST-01']);
  });

  it('token invalido mostra a mensagem do backend, sem navegar', () => {
    const fixture = montar();
    const navegar = vi.spyOn(router, 'navigate');
    fixture.componentInstance.patch('token-errado');

    fixture.componentInstance.entrar();

    http.expectOne(`${environment.apiUrl}/auth/login-estacao`)
      .flush({ erro: 'Token inválido' }, { status: 401, statusText: 'Unauthorized' });

    expect(fixture.componentInstance.erro()).toBe('Token inválido');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('link de volta leva ao login do gestor', () => {
    const fixture = montar();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.auth-alt-link');
    expect(link.getAttribute('href')).toBe('/login');
  });
});

describe('LoginEstacaoComponent — modo de exemplo', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        { provide: USE_MOCK_DATA, useValue: true },
      ],
    });
  });

  it('mostra um token de demonstracao', async () => {
    const { environment: env } = await import('../../environments/environment');
    const fixture = TestBed.createComponent(LoginEstacaoComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${env.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(TOKENS_ESTACAO['EST-01']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `Cannot find module './login-estacao.component'`

- [ ] **Step 3: Implementar o componente**

Criar `src/app/auth/login-estacao.component.ts`:

```typescript
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../shared/auth/auth.service';
import { mensagemDeErro } from '../shared/incident.models';
import { TOKENS_ESTACAO } from '../shared/mock/fixtures';
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';

/** Login do kiosk (token de estação) — design doc de E4 §4.2. Rota pública, sem topbar/dock, sem campo de senha. */
@Component({
  selector: 'app-login-estacao',
  imports: [RouterLink],
  templateUrl: './login-estacao.component.html',
})
export class LoginEstacaoComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly exemplo = inject(USE_MOCK_DATA);
  readonly tokenDemo = TOKENS_ESTACAO['EST-01'];

  readonly token = signal('');
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);

  patch(valor: string): void {
    this.token.set(valor);
    this.erro.set(null);
  }

  entrar(): void {
    const token = this.token().trim();
    if (!token) {
      this.erro.set('Cole o token da estação.');
      return;
    }
    this.enviando.set(true);
    this.erro.set(null);
    this.auth.loginEstacao(token).subscribe({
      next: resp => {
        this.enviando.set(false);
        this.router.navigate(['/estacao', resp.estacaoId]);
      },
      error: e => {
        this.enviando.set(false);
        this.erro.set(mensagemDeErro(e));
      },
    });
  }
}
```

Criar `src/app/auth/login-estacao.component.html`:

```html
<div class="auth-shell">
  <div class="panel auth-panel">
    <div class="panel-head">
      <div class="ph-left">
        <span class="ph-title">Entrar</span>
        <span class="ph-meta">kiosk da estação</span>
      </div>
    </div>

    <form class="auth-form" (submit)="$event.preventDefault(); entrar()">
      <div class="field">
        <label for="login-token">Token da estação</label>
        <input id="login-token" class="input" type="text" autocomplete="off"
               [value]="token()" (input)="patch($any($event.target).value)" />
      </div>

      @if (erro()) {
        <p class="vazio" role="alert">{{ erro() }}</p>
      }

      @if (exemplo) {
        <p class="vazio">Modo de exemplo: <code>{{ tokenDemo }}</code> (estação EST-01)</p>
      }

      <button type="submit" class="btn primary" [disabled]="enviando()">
        {{ enviando() ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>

    <a class="auth-alt-link" routerLink="/login">Entrar como gestor →</a>
  </div>
</div>
```

- [ ] **Step 4: Rodar a suíte completa e o build**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch && npx ng build`
Expected: testes PASS, build sem erro

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/auth/login-estacao.component.ts src/app/auth/login-estacao.component.html \
        src/app/auth/login-estacao.component.spec.ts
git commit -m "feat(front): tela de login do kiosk por token (/login-estacao)"
```

---

### Task 6: Ligar guards e rotas de login em `app.routes.ts`

**Files:**
- Modify: `src/app/app.routes.ts`
- Create: `src/app/app.routes.spec.ts`

**Interfaces:**
- Consumes: `LoginComponent` (Task 4), `LoginEstacaoComponent` (Task 5), `canActivateGestor`, `canActivateOperadorOuGestor`, `canActivateOnboarding` (Task 2)

- [ ] **Step 1: Escrever o spec de rotas que falha**

Criar `src/app/app.routes.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import {
  canActivateGestor, canActivateOnboarding, canActivateOperadorOuGestor,
} from './shared/auth/auth.guards';

describe('routes — guards de acesso (design doc de E4, §4.3)', () => {
  it('/ (onboarding) usa canActivateOnboarding', () => {
    expect(routes.find(r => r.path === '')?.canActivate).toEqual([canActivateOnboarding]);
  });

  it('/dashboard e /heatmap exigem GESTOR', () => {
    expect(routes.find(r => r.path === 'dashboard')?.canActivate).toEqual([canActivateGestor]);
    expect(routes.find(r => r.path === 'heatmap')?.canActivate).toEqual([canActivateGestor]);
  });

  it('/config exige GESTOR', () => {
    expect(routes.find(r => r.path === 'config')?.canActivate).toEqual([canActivateGestor]);
  });

  it('/estacao/:id usa o guard combinado operador-ou-gestor', () => {
    expect(routes.find(r => r.path === 'estacao/:id')?.canActivate)
      .toEqual([canActivateOperadorOuGestor]);
  });

  it('/incidentes, /incidentes/:id e /estacoes continuam sem guard nesta entrega', () => {
    expect(routes.find(r => r.path === 'incidentes')?.canActivate).toBeUndefined();
    expect(routes.find(r => r.path === 'incidentes/:id')?.canActivate).toBeUndefined();
    expect(routes.find(r => r.path === 'estacoes')?.canActivate).toBeUndefined();
  });

  it('/login e /login-estacao existem e nao tem guard', () => {
    expect(routes.find(r => r.path === 'login')).toBeDefined();
    expect(routes.find(r => r.path === 'login')?.canActivate).toBeUndefined();
    expect(routes.find(r => r.path === 'login-estacao')).toBeDefined();
    expect(routes.find(r => r.path === 'login-estacao')?.canActivate).toBeUndefined();
  });
});

describe('routes — redirecionamento de ponta a ponta sem sessao', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  it('/dashboard sem sessao redireciona para /login', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/dashboard');
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await promessa;

    expect(router.url).toBe('/login');
  });

  it('/estacao/EST-01 sem sessao redireciona para /login-estacao', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/estacao/EST-01');
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await promessa;

    expect(router.url).toBe('/login-estacao');
  });

  it('/config sem sessao redireciona para /login', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/config');
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await promessa;

    expect(router.url).toBe('/login');
  });

  it('/ mostra o onboarding quando o setup ainda nao rodou', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/');
    http.expectOne(r => r.url === `${environment.apiUrl}/setup/status`).flush({ configured: false });
    // `AuthService` (injetado pelo guard) dispara `/auth/me` no construtor,
    // sem relação com `canActivateOnboarding` — este spec não chama
    // `http.verify()`, então deixá-la pendente é inofensivo.
    await promessa;

    expect(router.url).toBe('/');
  });

  it('/ redireciona para /login quando o setup ja rodou', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/');
    http.expectOne(r => r.url === `${environment.apiUrl}/setup/status`).flush({ configured: true });
    await promessa;

    expect(router.url).toBe('/login');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — rotas `login`/`login-estacao` não existem, `dashboard`/`heatmap`/`config`/`estacao/:id` não têm `canActivate`, e `''` ainda não tem `canActivateOnboarding`

- [ ] **Step 3: Wire as rotas**

Substituir `src/app/app.routes.ts` por:

```typescript
import { Routes } from '@angular/router';
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
import {
  canActivateGestor, canActivateOnboarding, canActivateOperadorOuGestor,
} from './shared/auth/auth.guards';

export const routes: Routes = [
  { path: '', component: OnboardingComponent, canActivate: [canActivateOnboarding] },
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
    ],
  },
];
```

(A aba `equipe` de `/config` é adicionada em Task 11, quando `EquipeUsuariosTabComponent` existir.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — `app.routes.spec.ts` e suíte inteira, sem regressão em `settings-page.component.spec.ts` (o teste `'a rota /config/estacoes ainda resolve'` continua batendo, `canActivate` novo não afeta a estrutura de `children`)

- [ ] **Step 5: Rodar o build**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng build`
Expected: build sem erro

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/app.routes.ts src/app/app.routes.spec.ts
git commit -m "feat(front): liga guards e rotas de login em app.routes, incluindo canActivateOnboarding em '/'"
```

---

### Task 7: Dock por papel — dashboard, heatmap, `/config`

**Files:**
- Modify: `src/app/dashboard/dashboard.component.ts`, `src/app/dashboard/dashboard.component.html`
- Modify: `src/app/dashboard/dashboard.component.spec.ts`
- Modify: `src/app/heatmap/heatmap.component.ts`, `src/app/heatmap/heatmap.component.html`
- Modify: `src/app/heatmap/heatmap.component.spec.ts`
- Modify: `src/app/config/settings/settings-page.component.ts`, `src/app/config/settings/settings-page.component.html`
- Modify: `src/app/config/settings/settings-page.component.spec.ts`

**Interfaces:**
- Consumes: `AuthService.role` (Task 1)

- [ ] **Step 1: Dashboard — injetar `AuthService` e gatear o dock**

Em `src/app/dashboard/dashboard.component.ts`, adicionar o import e o campo:

```typescript
import { AuthService } from '../shared/auth/auth.service';
```

```typescript
  private authService = inject(AuthService);
  readonly auth = this.authService;
```

Em `src/app/dashboard/dashboard.component.html`, trocar a linha final `<app-dock activeKey="dashboard"/>` por:

```html
  @if (auth.role() === 'GESTOR') {
    <app-dock activeKey="dashboard"/>
  }
```

- [ ] **Step 2: Escrever o teste do dashboard que falha**

Em `src/app/dashboard/dashboard.component.spec.ts`, adicionar `provideHttpClient`/`provideHttpClientTesting` já existem — só falta flushar `/auth/me`. Trocar a primeira linha de cada `it()` que chama `TestBed.createComponent(DashboardComponent); fixture.detectChanges();` **não é necessário reescrever cada teste**: como nenhum teste hoje afirma a presença do dock, os testes existentes continuam passando com `/auth/me` pendente e sem verify(). Adicionar só os dois testes novos, ao final do primeiro `describe('DashboardComponent', ...)`:

```typescript
  it('mostra o dock para GESTOR', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-dock')).not.toBeNull();
  });

  it('nao mostra o dock sem sessao GESTOR', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-dock')).toBeNull();
  });
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `dashboard.component.ts` ainda não conhece `AuthService`, `auth` é `undefined`

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — depois do Step 1 aplicado

- [ ] **Step 5: Heatmap — mesmo tratamento**

Em `src/app/heatmap/heatmap.component.ts`:

```typescript
import { AuthService } from '../shared/auth/auth.service';
```

```typescript
  private authService = inject(AuthService);
  readonly auth = this.authService;
```

Em `src/app/heatmap/heatmap.component.html`, trocar `<app-dock activeKey="heatmap"/>` por:

```html
  @if (auth.role() === 'GESTOR') {
    <app-dock activeKey="heatmap"/>
  }
```

Em `src/app/heatmap/heatmap.component.spec.ts`, adicionar ao final do `describe('HeatmapComponent', ...)`:

```typescript
  it('mostra o dock para GESTOR, some sem sessao', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/auth/me`)[0]
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-dock')).toBeNull();

    const gestor = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/auth/me`)[0]
      .flush({ papel: 'GESTOR', username: 'g1' });
    gestor.detectChanges();
    expect(gestor.nativeElement.querySelector('app-dock')).not.toBeNull();
  });
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — `heatmap.component.spec.ts`

- [ ] **Step 7: `SettingsPageComponent` — gatear o dock e corrigir o spec sem HttpClientTesting**

Em `src/app/config/settings/settings-page.component.ts`, adicionar:

```typescript
import { AuthService } from '../../shared/auth/auth.service';
```

```typescript
  private authService = inject(AuthService);
  readonly auth = this.authService;
```

Em `src/app/config/settings/settings-page.component.html`, trocar a última linha `<app-dock activeKey="config" />` por:

```html
@if (auth.role() === 'GESTOR') {
  <app-dock activeKey="config" />
}
```

Em `src/app/config/settings/settings-page.component.spec.ts`, o arquivo hoje **não** provê `HttpClient` — como `SettingsPageComponent` (via `AuthService`) agora depende dele, isso quebra `TestBed.createComponent` com "No provider for HttpClient". Substituir o arquivo inteiro por:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { routes } from '../../app.routes';
import { SettingsPageComponent } from './settings-page.component';

describe('SettingsPageComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function montarGestor() {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza a topbar e o dock para GESTOR', () => {
    const fixture = montarGestor();

    expect(fixture.nativeElement.querySelector('app-chrome-topbar')).not.toBeNull();
    const dock: HTMLElement = fixture.nativeElement.querySelector('app-dock');
    expect(dock).not.toBeNull();
  });

  it('sem sessao GESTOR, nao mostra o dock', () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-dock')).toBeNull();
  });

  it('tem uma aba para cada secao do onboarding editavel', () => {
    const fixture = montarGestor();

    const links: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('.cat-item'));

    expect(links.length).toBe(4);
    expect(fixture.nativeElement.textContent).toContain('Identidade da empresa');
    expect(fixture.nativeElement.textContent).toContain('Estações e câmeras');
    expect(fixture.nativeElement.textContent).toContain('EPIs monitorados');
    expect(fixture.nativeElement.textContent).toContain('CAs e validades');
  });

  it('a rota /config/estacoes ainda resolve (link do dock nao muda)', () => {
    const configRoute = routes.find(r => r.path === 'config');
    expect(configRoute).toBeDefined();
    expect(configRoute!.children!.some(c => c.path === 'estacoes')).toBe(true);
  });
});
```

(A troca de `provideRouter([])` para `provideRouter(routes)` é o que faz `AuthService`/o guard de `/config` resolverem de verdade nos testes que navegam por link; os testes aqui só criam o componente diretamente, então o guard da própria rota `config` não roda — é `app.routes.spec.ts`, Task 6, que já cobre isso.)

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — suíte inteira

- [ ] **Step 9: Rodar o build**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng build`
Expected: build sem erro

- [ ] **Step 10: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/dashboard/dashboard.component.ts src/app/dashboard/dashboard.component.html \
        src/app/dashboard/dashboard.component.spec.ts \
        src/app/heatmap/heatmap.component.ts src/app/heatmap/heatmap.component.html \
        src/app/heatmap/heatmap.component.spec.ts \
        src/app/config/settings/settings-page.component.ts \
        src/app/config/settings/settings-page.component.html \
        src/app/config/settings/settings-page.component.spec.ts
git commit -m "feat(front): dock por papel em dashboard, heatmap e config"
```

---

### Task 8: Dock por papel — incidentes, estações, kiosk

**Files:**
- Modify: `src/app/incidents/incident-timeline.component.ts`, `.html`, `.spec.ts`
- Modify: `src/app/incidents/incident-detail.component.ts`, `.html`, `.spec.ts`
- Modify: `src/app/stations/stations-grid.component.ts`, `.html`, `.spec.ts`
- Modify: `src/app/stations/station-kiosk.component.ts`, `.html`, `.spec.ts`

**Interfaces:**
- Consumes: `AuthService.role` (Task 1)

- [ ] **Step 1: Timeline de incidentes**

Em `src/app/incidents/incident-timeline.component.ts`:

```typescript
import { AuthService } from '../shared/auth/auth.service';
```

```typescript
  private authService = inject(AuthService);
  readonly auth = this.authService;
```

Em `src/app/incidents/incident-timeline.component.html`, trocar `<app-dock activeKey="alerts"/>` por:

```html
  @if (auth.role() === 'GESTOR') {
    <app-dock activeKey="alerts"/>
  }
```

Em `src/app/incidents/incident-timeline.component.spec.ts`, na função `montar()`, adicionar o flush de `/auth/me` logo depois do flush de `/incidents` (mantendo a assinatura de retorno):

```typescript
  function montar() {
    const fixture = TestBed.createComponent(IncidentTimelineComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`)
      .flush(pagina([incidente({ id: 1, incidentKey: 'k1' })]));
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'GESTOR', username: 'g1' });
    fixture.detectChanges();
    return fixture;
  }
```

E adicionar, ao final do `describe`:

```typescript
  it('sem sessao GESTOR, nao mostra o dock', () => {
    const fixture = TestBed.createComponent(IncidentTimelineComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/incidents`).flush(pagina([]));
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-dock')).toBeNull();
  });
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — `incident-timeline.component.spec.ts`

- [ ] **Step 3: Detalhe do incidente**

Em `src/app/incidents/incident-detail.component.ts`:

```typescript
import { AuthService } from '../shared/auth/auth.service';
```

```typescript
  private authService = inject(AuthService);
  readonly auth = this.authService;
```

Em `src/app/incidents/incident-detail.component.html`, trocar `<app-dock activeKey="alerts"/>` por:

```html
  @if (auth.role() === 'GESTOR') {
    <app-dock activeKey="alerts"/>
  }
```

Em `src/app/incidents/incident-detail.component.spec.ts`, cada teste que hoje faz `http.expectOne('.../incidents/42').flush(...)` precisa flushar `/auth/me` logo em seguida, antes de `await promessa;`. No primeiro teste (`'busca o incidente pelo id da rota e mostra os campos'`), por exemplo:

```typescript
  it('busca o incidente pelo id da rota e mostra os campos, com dock para GESTOR', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    await promessa;
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Queda / risco imediato');
    expect(harness.routeNativeElement?.textContent).toContain('CAM-01');
    expect(harness.routeNativeElement?.querySelector('app-dock')).not.toBeNull();
  });
```

Aplicar o mesmo padrão (`http.expectOne('.../auth/me').flush(...)` antes de `await promessa;`) nos outros três testes existentes (`'id inexistente...'`, `'snapshot ausente...'`, `'botão de status...'`), usando `{ papel: 'GESTOR', username: 'g1' }`. Adicionar, ao final do `describe`:

```typescript
  it('sem sessao GESTOR, nao mostra o dock', async () => {
    const harness = await RouterTestingHarness.create();
    const promessa = harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await promessa;
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelector('app-dock')).toBeNull();
  });
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — `incident-detail.component.spec.ts`

- [ ] **Step 5: Grade de estações**

Em `src/app/stations/stations-grid.component.ts`:

```typescript
import { AuthService } from '../shared/auth/auth.service';
```

```typescript
  private authService = inject(AuthService);
  readonly auth = this.authService;
```

Em `src/app/stations/stations-grid.component.html`, trocar `<app-dock activeKey="live"/>` por:

```html
  @if (auth.role() === 'GESTOR') {
    <app-dock activeKey="live"/>
  }
```

Em `src/app/stations/stations-grid.component.spec.ts`, na função `montarCom()`, adicionar o flush de `/auth/me` depois do flush de `/stations`:

```typescript
  function montarCom(stations: unknown[]) {
    const fixture = TestBed.createComponent(StationsGridComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush(stations);
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'GESTOR', username: 'g1' });
    fixture.detectChanges();
    return fixture;
  }
```

E adicionar, ao final do `describe`:

```typescript
  it('sem sessao GESTOR, nao mostra o dock', () => {
    const fixture = TestBed.createComponent(StationsGridComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-dock')).toBeNull();
  });
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — `stations-grid.component.spec.ts`

- [ ] **Step 7: Kiosk — dock só para GESTOR (reversão da constraint de e3b)**

Em `src/app/stations/station-kiosk.component.ts`, trocar o comentário do topo e o `imports`:

```typescript
/**
 * Dock por papel, não por rota (design doc de E4, §4.1): para o OPERADOR o
 * kiosk continua sem navegação (mapa de telas do doc de E1, §14.1); para um
 * GESTOR supervisionando a estação, o dock aparece — restrição descoberta em
 * E3 (nota de 2026-08-23 no fim de §15 da spec de E1).
 */
@Component({
  selector: 'app-station-kiosk',
  imports: [ChromeTopbarComponent, LiveFeedComponent, DockComponent],
  templateUrl: './station-kiosk.component.html',
})
```

E adicionar os imports e o campo:

```typescript
import { AuthService } from '../shared/auth/auth.service';
import { DockComponent } from '../shared/dock/dock.component';
```

```typescript
  private authService = inject(AuthService);
  readonly auth = this.authService;
```

Em `src/app/stations/station-kiosk.component.html`, adicionar antes da tag de fechamento `</div>` final:

```html
  @if (auth.role() === 'GESTOR') {
    <app-dock activeKey="live"/>
  }
</div>
```

- [ ] **Step 8: Atualizar o spec do kiosk que quebrou**

Em `src/app/stations/station-kiosk.component.spec.ts`, todos os quatro testes existentes precisam de um flush de `/auth/me` (o componente agora injeta `AuthService`). Adicionar, em cada teste, logo após o `harness.detectChanges();` que segue o flush de `/stations`, a linha:

```typescript
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
    harness.detectChanges();
```

(No primeiro teste, que já tem dois `harness.detectChanges()` — um logo após o flush de `/stations`, outro depois dos dois flushes de `/incidents` — inserir o flush de `/auth/me` e o `detectChanges()` adicional entre os dois blocos existentes, antes do `expect(...querySelectorAll('app-live-feed')...)`.)

Substituir o teste `'não mostra o dock — o kiosk não tem navegação'` (que agora só descreve o caso OPERADOR) por dois testes:

```typescript
  it('OPERADOR nao ve o dock — o kiosk continua sem navegacao para o operador', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [] },
    ]);
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelector('app-dock')).toBeNull();
  });

  it('GESTOR ve o dock, mantendo a navegacao (restricao de E3)', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/estacao/EST-01', StationKioskComponent);
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: null, ativa: true, cameras: [] },
    ]);
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'GESTOR', username: 'g1' });
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelector('app-dock')).not.toBeNull();
  });
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — `station-kiosk.component.spec.ts`

- [ ] **Step 10: Rodar a suíte completa e o build**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch && npx ng build`
Expected: testes PASS, build sem erro

- [ ] **Step 11: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/incidents/incident-timeline.component.ts \
        src/app/incidents/incident-timeline.component.html \
        src/app/incidents/incident-timeline.component.spec.ts \
        src/app/incidents/incident-detail.component.ts \
        src/app/incidents/incident-detail.component.html \
        src/app/incidents/incident-detail.component.spec.ts \
        src/app/stations/stations-grid.component.ts \
        src/app/stations/stations-grid.component.html \
        src/app/stations/stations-grid.component.spec.ts \
        src/app/stations/station-kiosk.component.ts \
        src/app/stations/station-kiosk.component.html \
        src/app/stations/station-kiosk.component.spec.ts
git commit -m "feat(front): dock por papel em incidentes, estacoes e kiosk (kiosk ganha dock so para GESTOR)"
```

---

### Task 9: Logout e links por papel em `ChromeTopbarComponent`

**Files:**
- Modify: `src/app/shared/chrome-topbar/chrome-topbar.component.ts`
- Modify: `src/app/shared/chrome-topbar/chrome-topbar.component.spec.ts`

**Interfaces:**
- Consumes: `AuthService.role`, `AuthService.logout()` (Task 1)

- [ ] **Step 1: Escrever os testes que falham**

Em `src/app/shared/chrome-topbar/chrome-topbar.component.spec.ts`, substituir o arquivo inteiro por:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ChromeTopbarComponent } from './chrome-topbar.component';
import { ThemeService } from '../theme.service';

describe('ChromeTopbarComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    TestBed.resetTestingModule();
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

  afterEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  function montarComo(papel: 'GESTOR' | 'OPERADOR' | null) {
    const fixture = TestBed.createComponent(ChromeTopbarComponent);
    fixture.detectChanges();
    const req = http.expectOne(`${environment.apiUrl}/auth/me`);
    if (papel === 'GESTOR') {
      req.flush({ papel: 'GESTOR', username: 'g1' });
    } else if (papel === 'OPERADOR') {
      req.flush({ papel: 'OPERADOR', estacaoId: 'EST-01' });
    } else {
      req.flush(null, { status: 401, statusText: 'Unauthorized' });
    }
    fixture.detectChanges();
    return fixture;
  }

  it('tem um botão que troca o tema', () => {
    const fixture = montarComo('GESTOR');
    const theme = TestBed.inject(ThemeService);
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="theme-toggle"]');

    expect(botao).not.toBeNull();
    botao.click();

    expect(theme.theme()).toBe('light');
  });

  it('o botão diz para onde vai, não onde está', () => {
    const fixture = montarComo('GESTOR');
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="theme-toggle"]');

    expect(botao.getAttribute('aria-label')).toBe('Mudar para tema claro');

    botao.click();
    fixture.detectChanges();

    expect(botao.getAttribute('aria-label')).toBe('Mudar para tema escuro');
  });

  it('para GESTOR, a engrenagem leva para a pagina de configuracoes', () => {
    const fixture = montarComo('GESTOR');
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('[data-test="open-settings"]');

    expect(link.getAttribute('href')).toBe('/config/identidade');
    expect(link.getAttribute('aria-label')).toBe('Configurações');
  });

  it('para GESTOR, o logotipo leva para o dashboard', () => {
    const fixture = montarComo('GESTOR');
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('[data-test="brand-logo"]');

    expect(link.getAttribute('href')).toBe('/dashboard');
    expect(link.getAttribute('title')).toBe('Dashboard');
  });

  it('para OPERADOR, nao mostra a engrenagem nem o link do dashboard (nao tem acesso a /config nem a /dashboard)', () => {
    const fixture = montarComo('OPERADOR');

    expect(fixture.nativeElement.querySelector('[data-test="open-settings"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[data-test="brand-logo"]')).toBeNull();
  });

  it('botao de sair chama logout e navega para /login quando GESTOR', () => {
    const fixture = montarComo('GESTOR');
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate');
    const logout = vi.spyOn(auth, 'logout');
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="logout"]');

    botao.click();
    http.expectOne(`${environment.apiUrl}/auth/logout`).flush(null);

    expect(logout).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith(['/login']);
  });

  it('botao de sair navega para /login-estacao quando OPERADOR', () => {
    const fixture = montarComo('OPERADOR');
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate');
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="logout"]');

    botao.click();
    http.expectOne(`${environment.apiUrl}/auth/logout`).flush(null);

    expect(navegar).toHaveBeenCalledWith(['/login-estacao']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `No provider for HttpClient` (spec antigo não provia), links renderizam incondicionalmente, `[data-test="logout"]` não existe

- [ ] **Step 3: Implementar logout e links por papel**

Em `src/app/shared/chrome-topbar/chrome-topbar.component.ts`, trocar o import e o template:

```typescript
import { Component, input, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { ThemeService } from '../theme.service';

@Component({
  selector: 'app-chrome-topbar',
  imports: [RouterLink],
  template: `
    <header class="dtop">
      @if (auth.role() === 'GESTOR') {
        <a routerLink="/dashboard" data-test="brand-logo" class="brand-mini" title="Dashboard" style="text-decoration:none;color:inherit">
          <div class="brand-logo" [style.background]="cfg()?.accent || 'var(--accent)'">
            @if (cfg()?.logoUrl) {
              <img [src]="cfg()!.logoUrl!" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:8px"/>
            } @else {
              {{ initial() }}
            }
          </div>
          <div>
            <div class="brand-text">{{ company() }}</div>
            <div class="brand-tag">Industrial Vision AI</div>
          </div>
        </a>
      } @else {
        <div class="brand-mini">
          <div class="brand-logo" [style.background]="cfg()?.accent || 'var(--accent)'">
            @if (cfg()?.logoUrl) {
              <img [src]="cfg()!.logoUrl!" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:8px"/>
            } @else {
              {{ initial() }}
            }
          </div>
          <div>
            <div class="brand-text">{{ company() }}</div>
            <div class="brand-tag">Industrial Vision AI</div>
          </div>
        </div>
      }

      <div class="pgtitle">
        <span class="h">{{ page() }}</span>
        @if (subtitle()) {
          <span class="sep">·</span>
          <span class="meta">{{ subtitle() }}</span>
        }
        @if (shift()) {
          <span class="sep">·</span>
          <span class="shift">{{ shift() }}</span>
        }
        @if (live()) {
          <span class="live">ao vivo</span>
        }
      </div>

      <div class="tools">
        <button class="icon-btn" aria-label="Notificações">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 16c0-7 1.5-10 6-10s6 3 6 10"/><path d="M4.5 16h15"/><path d="M10.5 19a1.5 1.5 0 0 0 3 0"/>
          </svg>
          @if (notifBadge() > 0) {
            <span class="bdg">{{ notifBadge() }}</span>
          }
        </button>

        <button class="icon-btn" data-test="theme-toggle"
                [attr.aria-label]="temaEscuro() ? 'Mudar para tema claro' : 'Mudar para tema escuro'"
                (click)="alternarTema()">
          @if (temaEscuro()) {
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
            </svg>
          } @else {
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5z"/>
            </svg>
          }
        </button>

        @if (auth.role() === 'GESTOR') {
          <a routerLink="/config/identidade" class="icon-btn" data-test="open-settings"
             aria-label="Configurações" title="Configurações">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </a>
        }

        <button class="icon-btn" data-test="logout" aria-label="Sair" title="Sair" (click)="sair()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>
          </svg>
        </button>
      </div>
    </header>
  `,
})
export class ChromeTopbarComponent {
  cfg    = input<any>(null);
  page   = input<string>('Dashboard');
  subtitle = input<string>('');
  shift  = input<string | null>(null);
  live   = input<boolean>(true);
  notifBadge = input<number>(0);

  private themeService = inject(ThemeService);
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly auth = this.authService;

  temaEscuro = computed(() => this.themeService.theme() === 'dark');

  alternarTema(): void {
    this.themeService.toggle();
  }

  /** Rota de saída depende de quem estava logado — captura antes de `logout()` limpar `role()`. */
  sair(): void {
    const eraOperador = this.auth.role() === 'OPERADOR';
    this.authService.logout();
    this.router.navigate([eraOperador ? '/login-estacao' : '/login']);
  }

  company = computed(() => (this.cfg()?.company || 'CYPHER').toUpperCase());
  initial = computed(() => (this.cfg()?.company?.trim() || 'C')[0].toUpperCase());
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — `chrome-topbar.component.spec.ts`

- [ ] **Step 5: Rodar a suíte completa e o build**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch && npx ng build`
Expected: testes PASS (nenhuma outra spec afirma `a[data-test="brand-logo"]`/`[data-test="open-settings"]` incondicionalmente fora deste arquivo), build sem erro

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/chrome-topbar/chrome-topbar.component.ts \
        src/app/shared/chrome-topbar/chrome-topbar.component.spec.ts
git commit -m "feat(front): logout e links por papel na topbar"
```

---

### Task 10: `Equipe`/`Usuario` — modelos, `TeamService`, CRUD no mock

**Files:**
- Create: `src/app/shared/team.models.ts`
- Create: `src/app/shared/team.service.ts`
- Test: `src/app/shared/team.service.spec.ts`
- Modify: `src/app/shared/mock/fixtures.ts` — `EQUIPES`, `USUARIOS`, `EQUIPES_MUTAVEL`, `USUARIOS_MUTAVEL`, `resetMockTeams`
- Modify: `src/app/shared/mock/mock-api.interceptor.ts` — CRUD de `/teams` e `/users`; `/auth/login` passa a validar contra `USUARIOS_MUTAVEL`
- Modify: `src/app/shared/mock/mock-api.interceptor.spec.ts`

**Interfaces:**
- Consumes: `Papel` (`auth.models.ts`, Task 1), `CODIGO_PADRAO`, `mensagemDeErro` (`incident.models.ts`)
- Produces: `Equipe { id, nome, turno: Turno, estacaoIds: string[], ativa }`, `EquipePayload`, `Usuario { username, papel: Papel }`, `UsuarioPayload { username, papel, password? }`, `TeamService.equipes: Signal<Equipe[]>`, `TeamService.usuarios: Signal<Usuario[]>`, `TeamService.load()`, `.createEquipe/updateEquipe/deleteEquipe`, `.createUsuario/updateUsuario/deleteUsuario` — todos consumidos por `EquipesConfigComponent`/`UsuariosConfigComponent` (Task 11)

- [ ] **Step 1: Modelos de equipe/usuário**

Criar `src/app/shared/team.models.ts`:

```typescript
/** `Equipe`/`Usuario` — design doc de E4, §2.5 e §3. */

import { Papel } from './auth/auth.models';

export type Turno = 'MANHA' | 'TARDE' | 'NOITE';

export interface Equipe {
  id: string;
  nome: string;
  turno: Turno;
  /** Uma equipe cobre uma ou mais estações, dentro de um único turno (design doc §3). */
  estacaoIds: string[];
  ativa: boolean;
}

export interface EquipePayload {
  id: string;
  nome: string;
  turno: Turno;
  estacaoIds: string[];
  ativa?: boolean;
}

export interface Usuario {
  username: string;
  papel: Papel;
}

export interface UsuarioPayload {
  username: string;
  papel: Papel;
  /** Só em criação (obrigatório) ou redefinição (opcional); nunca volta do backend — design doc §4.2: sem "esqueci minha senha" nesta entrega, a única ação sensível é o gestor redefinir. */
  password?: string;
}
```

- [ ] **Step 2: Escrever o spec do `TeamService` que falha**

Criar `src/app/shared/team.service.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { Equipe, Usuario } from './team.models';
import { TeamService } from './team.service';

describe('TeamService', () => {
  let service: TeamService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(TeamService);
    http = TestBed.inject(HttpTestingController);
  });

  it('load busca equipes e usuarios, com credenciais', () => {
    service.load();

    const reqEquipes = http.expectOne(`${environment.apiUrl}/teams`);
    expect(reqEquipes.request.withCredentials).toBe(true);
    reqEquipes.flush([{ id: 'EQ-01', nome: 'Equipe A', turno: 'MANHA', estacaoIds: ['EST-01'], ativa: true }] as Equipe[]);

    const reqUsuarios = http.expectOne(`${environment.apiUrl}/users`);
    reqUsuarios.flush([{ username: 'gestor.demo', papel: 'GESTOR' }] as Usuario[]);

    expect(service.equipes().length).toBe(1);
    expect(service.usuarios().length).toBe(1);
  });

  it('createEquipe posta o payload e recarrega', () => {
    const payload = { id: 'EQ-02', nome: 'Equipe B', turno: 'TARDE' as const, estacaoIds: ['EST-02'] };
    service.createEquipe(payload).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/teams`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ ...payload, ativa: true });

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });

  it('deleteEquipe manda DELETE e recarrega', () => {
    service.deleteEquipe('EQ-01').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/teams/EQ-01`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });

  it('createUsuario posta o payload com senha', () => {
    const payload = { username: 'novo', papel: 'OPERADOR' as const, password: 'senha123' };
    service.createUsuario(payload).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ username: 'novo', papel: 'OPERADOR' });

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });

  it('updateUsuario sem senha nao a inclui no payload', () => {
    const payload = { username: 'gestor.demo', papel: 'GESTOR' as const };
    service.updateUsuario('gestor.demo', payload).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/users/gestor.demo`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush({ username: 'gestor.demo', papel: 'GESTOR' });

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });

  it('deleteUsuario manda DELETE pelo username', () => {
    service.deleteUsuario('gestor.demo').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/users/gestor.demo`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `Cannot find module './team.service'`

- [ ] **Step 4: Implementar `TeamService`**

Criar `src/app/shared/team.service.ts`:

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { Equipe, EquipePayload, Usuario, UsuarioPayload } from './team.models';

/**
 * Equipes e usuários (design doc de E4, §3 e §2.5).
 *
 * Mesmo padrão de `CatalogService`: duas entidades relacionadas, uma fonte
 * única de leitura, escrita que recarrega em vez de atualizar item a item.
 */
@Injectable({ providedIn: 'root' })
export class TeamService {
  private http = inject(HttpClient);

  private readonly _equipes = signal<Equipe[]>([]);
  private readonly _usuarios = signal<Usuario[]>([]);

  readonly equipes = this._equipes.asReadonly();
  readonly usuarios = this._usuarios.asReadonly();

  load(): void {
    this.http.get<Equipe[]>(`${environment.apiUrl}/teams`, { withCredentials: true })
      .subscribe({ next: e => this._equipes.set(e), error: () => { } });
    this.http.get<Usuario[]>(`${environment.apiUrl}/users`, { withCredentials: true })
      .subscribe({ next: u => this._usuarios.set(u), error: () => { } });
  }

  createEquipe(payload: EquipePayload): Observable<Equipe> {
    return this.http.post<Equipe>(`${environment.apiUrl}/teams`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  updateEquipe(id: string, payload: EquipePayload): Observable<Equipe> {
    return this.http.put<Equipe>(`${environment.apiUrl}/teams/${id}`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  deleteEquipe(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/teams/${id}`,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  createUsuario(payload: UsuarioPayload): Observable<Usuario> {
    return this.http.post<Usuario>(`${environment.apiUrl}/users`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  updateUsuario(username: string, payload: UsuarioPayload): Observable<Usuario> {
    return this.http.put<Usuario>(`${environment.apiUrl}/users/${username}`, payload,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }

  deleteUsuario(username: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/users/${username}`,
      { withCredentials: true }).pipe(tap(() => this.load()));
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — `team.service.spec.ts`

- [ ] **Step 6: Escrever os testes do CRUD de `/teams`/`/users` no mock que falham**

Em `src/app/shared/mock/mock-api.interceptor.spec.ts`, atualizar o import de tipos e de fixtures:

```typescript
import { Camera, Incident, Page } from '../incident.models';
import { Equipe, Usuario } from '../team.models';
import {
  EMITIDOS, GESTOR_DEMO, INCIDENTS, TOKENS_ESTACAO, agoraNaPlanta, resetMockCatalog,
  resetMockSessao, resetMockSetup, resetMockTeams, resumo,
} from './fixtures';
```

(`resetMockSetup` já estava importado desde Task 1 — este bloco é o estado acumulado do import depois desta task, não substitui a entrada de Task 1.)

E adicionar `resetMockTeams();` ao `beforeEach` do primeiro `describe`, ao lado de `resetMockSessao();`/`resetMockSetup();` (Task 1). Adicionar estes testes ao final do mesmo `describe`:

```typescript
  it('GET /teams lista as equipes semeadas', async () => {
    const equipes = await firstValueFrom(http.get<Equipe[]>(`${environment.apiUrl}/teams`));

    expect(equipes.length).toBeGreaterThan(0);
    expect(equipes[0].id).toBe('EQ-01');
  });

  it('POST /teams cadastra e GET reflete', async () => {
    const nova = await firstValueFrom(http.post<Equipe>(`${environment.apiUrl}/teams`,
      { id: 'EQ-03', nome: 'Equipe C', turno: 'NOITE', estacaoIds: ['EST-03'] }));

    expect(nova.ativa).toBe(true);
    const equipes = await firstValueFrom(http.get<Equipe[]>(`${environment.apiUrl}/teams`));
    expect(equipes.some(e => e.id === 'EQ-03')).toBe(true);
  });

  it('POST /teams com id repetido devolve 409', async () => {
    await expect(firstValueFrom(http.post(`${environment.apiUrl}/teams`,
      { id: 'EQ-01', nome: 'Duplicada', turno: 'MANHA', estacaoIds: [] })))
      .rejects.toMatchObject({ status: 409 });
  });

  it('DELETE /teams/{id} desativa em vez de remover', async () => {
    await firstValueFrom(http.delete(`${environment.apiUrl}/teams/EQ-01`));

    const equipes = await firstValueFrom(http.get<Equipe[]>(`${environment.apiUrl}/teams`));
    expect(equipes.find(e => e.id === 'EQ-01')?.ativa).toBe(false);
  });

  it('GET /users nunca traz senha', async () => {
    const usuarios = await firstValueFrom(http.get<Record<string, unknown>[]>(`${environment.apiUrl}/users`));

    expect(usuarios.length).toBeGreaterThan(0);
    usuarios.forEach(u => expect(u['password']).toBeUndefined());
  });

  it('POST /users sem senha devolve 422', async () => {
    await expect(firstValueFrom(http.post(`${environment.apiUrl}/users`,
      { username: 'sem-senha', papel: 'OPERADOR' })))
      .rejects.toMatchObject({ status: 422 });
  });

  it('POST /users cadastra e a nova credencial loga', async () => {
    await firstValueFrom(http.post<Usuario>(`${environment.apiUrl}/users`,
      { username: 'gestor2', papel: 'GESTOR', password: 'senha456' }));

    const resp = await firstValueFrom(http.post<{ papel: string }>(`${environment.apiUrl}/auth/login`,
      { username: 'gestor2', password: 'senha456' }));
    expect(resp.papel).toBe('GESTOR');
  });

  it('DELETE /users/{username} remove de verdade', async () => {
    await firstValueFrom(http.delete(`${environment.apiUrl}/users/${GESTOR_DEMO.username}`));

    const usuarios = await firstValueFrom(http.get<Usuario[]>(`${environment.apiUrl}/users`));
    expect(usuarios.some(u => u.username === GESTOR_DEMO.username)).toBe(false);
  });
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `/teams`/`/users` caem em `next(req)` (sem resposta mockada), `EQUIPES_MUTAVEL`/`USUARIOS_MUTAVEL`/`resetMockTeams` não existem

- [ ] **Step 8: Semear `EQUIPES_MUTAVEL`/`USUARIOS_MUTAVEL`**

Em `src/app/shared/mock/fixtures.ts`, adicionar o import de tipos no topo:

```typescript
import { Equipe, Usuario } from '../team.models';
```

E adicionar ao final do arquivo, depois de `resetMockSessao`/`SESSAO_MOCK`:

```typescript
// ---------------- equipes e usuários (mock) ----------------

export const EQUIPES: Equipe[] = [
  { id: 'EQ-01', nome: 'Equipe A', turno: 'MANHA', estacaoIds: ['EST-01', 'EST-02'], ativa: true },
  { id: 'EQ-02', nome: 'Equipe B', turno: 'TARDE', estacaoIds: ['EST-03'], ativa: true },
];

/** Senha guardada só no mock — nunca no tipo público `Usuario`. Semeada a partir de `GESTOR_DEMO`, fonte única da credencial de demonstração. */
export const USUARIOS: (Usuario & { password: string })[] = [
  { username: GESTOR_DEMO.username, papel: 'GESTOR', password: GESTOR_DEMO.password },
];

export let EQUIPES_MUTAVEL: Equipe[] = [];
export let USUARIOS_MUTAVEL: (Usuario & { password: string })[] = [];

export function resetMockTeams(): void {
  EQUIPES_MUTAVEL = EQUIPES.map(e => ({ ...e, estacaoIds: [...e.estacaoIds] }));
  USUARIOS_MUTAVEL = USUARIOS.map(u => ({ ...u }));
}

resetMockTeams();
```

- [ ] **Step 9: Implementar o CRUD de `/teams`/`/users` no interceptor, e migrar `/auth/login` para `USUARIOS_MUTAVEL`**

Em `src/app/shared/mock/mock-api.interceptor.ts`, atualizar o import de `./fixtures` e de tipos:

```typescript
import { CameraAdmin, Station } from '../incident.models';
import { Equipe, Usuario } from '../team.models';
import {
  CAMERAS_MUTAVEL, EMITIDOS, EQUIPES_MUTAVEL, INCIDENTS, SESSAO_MOCK, SETUP_MOCK,
  STATIONS_MUTAVEL, TOKENS_ESTACAO, USUARIOS_MUTAVEL, resumo,
} from './fixtures';
```

(`GESTOR_DEMO` sai do import — a validação de login passa a olhar `USUARIOS_MUTAVEL`, semeado a partir dela. `SETUP_MOCK` continua importado: o handler de `POST /setup`, de Task 1, ainda o usa e não muda nesta task.)

Substituir o handler de `/auth/login` (Task 1) por:

```typescript
  if (req.method === 'POST' && req.url === `${base}/auth/login`) {
    const { username, password } = req.body as { username: string; password: string };
    const usuario = USUARIOS_MUTAVEL.find(u =>
      u.username === username && u.password === password && u.papel === 'GESTOR');
    if (!usuario) {
      return new HttpErrorResponse({ status: 401, error: { erro: 'Usuário ou senha inválidos' } });
    }
    SESSAO_MOCK.atual = { papel: 'GESTOR', username };
    return { papel: 'GESTOR', username };
  }
```

E adicionar, depois da seção `// ---------------- autenticação ----------------` (antes de `// ---------------- escrita de estação ----------------`):

```typescript
  // ---------------- equipes ----------------

  if (req.method === 'GET' && req.url === `${base}/teams`) {
    return EQUIPES_MUTAVEL;
  }

  if (req.method === 'POST' && req.url === `${base}/teams`) {
    const corpo = req.body as Equipe;
    if (EQUIPES_MUTAVEL.some(e => e.id === corpo.id)) {
      return conflito(`Equipe ja cadastrada: ${corpo.id}`);
    }
    const nova: Equipe = { ...corpo, ativa: corpo.ativa ?? true };
    EQUIPES_MUTAVEL.push(nova);
    return nova;
  }

  if (req.method === 'PUT' && req.url.startsWith(`${base}/teams/`)) {
    const id = req.url.slice(`${base}/teams/`.length);
    const corpo = req.body as Equipe;
    const atual = EQUIPES_MUTAVEL.find(e => e.id === id);
    if (!atual) {
      return naoEncontrado(`Equipe inexistente: ${id}`);
    }
    Object.assign(atual, corpo, { id, ativa: corpo.ativa ?? atual.ativa });
    return atual;
  }

  if (req.method === 'DELETE' && req.url.startsWith(`${base}/teams/`)) {
    const id = req.url.slice(`${base}/teams/`.length);
    const atual = EQUIPES_MUTAVEL.find(e => e.id === id);
    if (!atual) {
      return naoEncontrado(`Equipe inexistente: ${id}`);
    }
    atual.ativa = false;
    return null;
  }

  // ---------------- usuários ----------------

  if (req.method === 'GET' && req.url === `${base}/users`) {
    return USUARIOS_MUTAVEL.map(({ password, ...resto }) => resto);
  }

  if (req.method === 'POST' && req.url === `${base}/users`) {
    const corpo = req.body as Usuario & { password?: string };
    if (USUARIOS_MUTAVEL.some(u => u.username === corpo.username)) {
      return conflito(`Usuario ja cadastrado: ${corpo.username}`);
    }
    if (!corpo.password) {
      return naoProcessavel('Senha obrigatória no cadastro');
    }
    const novo = { username: corpo.username, papel: corpo.papel, password: corpo.password };
    USUARIOS_MUTAVEL.push(novo);
    const { password, ...resto } = novo;
    return resto;
  }

  if (req.method === 'PUT' && req.url.startsWith(`${base}/users/`)) {
    const username = req.url.slice(`${base}/users/`.length);
    const corpo = req.body as Usuario & { password?: string };
    const atual = USUARIOS_MUTAVEL.find(u => u.username === username);
    if (!atual) {
      return naoEncontrado(`Usuario inexistente: ${username}`);
    }
    atual.papel = corpo.papel;
    if (corpo.password) {
      atual.password = corpo.password;
    }
    const { password, ...resto } = atual;
    return resto;
  }

  if (req.method === 'DELETE' && req.url.startsWith(`${base}/users/`)) {
    const username = req.url.slice(`${base}/users/`.length);
    const idx = USUARIOS_MUTAVEL.findIndex(u => u.username === username);
    if (idx === -1) {
      return naoEncontrado(`Usuario inexistente: ${username}`);
    }
    USUARIOS_MUTAVEL.splice(idx, 1);
    return null;
  }
```

(`DELETE /teams/{id}` desativa — `Equipe.ativa` já existe no modelo, mesmo padrão de `desativarEstacao`. `DELETE /users/{username}` remove de verdade via `.splice()`, que muta o array sem reatribuir o `let` importado — `Usuario` não tem campo `ativa` no design doc.)

- [ ] **Step 10: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — suíte inteira, incluindo os testes de `/auth/login` do Task 1 (que agora passam por `USUARIOS_MUTAVEL`, semeado com a mesma `GESTOR_DEMO`)

- [ ] **Step 11: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/team.models.ts src/app/shared/team.service.ts \
        src/app/shared/team.service.spec.ts \
        src/app/shared/mock/fixtures.ts \
        src/app/shared/mock/mock-api.interceptor.ts \
        src/app/shared/mock/mock-api.interceptor.spec.ts
git commit -m "feat(front): modelos e TeamService para equipes e usuarios, com CRUD no mock"
```

---

### Task 11: `/config/equipe` — abas "Equipes" e "Usuários"

**Files:**
- Create: `src/app/config/equipe/equipes-config.component.ts`, `.html`, `.spec.ts`
- Create: `src/app/config/equipe/usuarios-config.component.ts`, `.html`, `.spec.ts`
- Create: `src/app/config/equipe/equipe-usuarios-tab.component.ts`, `.html`, `.spec.ts`
- Modify: `src/app/config/settings/settings-page.component.ts`, `.html`, `.spec.ts` — 5ª aba
- Modify: `src/app/app.routes.ts` — rota `equipe` em `/config`
- Modify: `src/app/shared/dock/dock.component.ts`, `.spec.ts` — item "Colaboradores" ganha rota
- Modify: `src/styles.scss` — `.subtabs`, `.list-row`

**Interfaces:**
- Consumes: `TeamService` (Task 10), `CatalogService.stations` (existente), `CODIGO_PADRAO`/`mensagemDeErro` (`incident.models.ts`)
- Produces: `EquipesConfigComponent`, `UsuariosConfigComponent`, `EquipeUsuariosTabComponent`

- [ ] **Step 1: `EquipesConfigComponent` — spec que falha**

Criar `src/app/config/equipe/equipes-config.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { EquipesConfigComponent } from './equipes-config.component';

describe('EquipesConfigComponent', () => {
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
    const fixture = TestBed.createComponent(EquipesConfigComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/teams`).flush([
      { id: 'EQ-01', nome: 'Equipe A', turno: 'MANHA', estacaoIds: ['EST-01'], ativa: true },
    ]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
    http.expectOne(`${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] },
      { id: 'EST-02', nome: 'Prensa', setor: 'estamparia', ativa: true, cameras: [] },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  it('lista as equipes cadastradas', () => {
    const fixture = montar();

    expect(fixture.nativeElement.textContent).toContain('Equipe A');
  });

  it('codigo fora do padrao mostra erro e nao envia', () => {
    const fixture = montar();
    fixture.componentInstance.novaEquipe.set({ id: 'invalido', nome: 'X', turno: 'MANHA', estacaoIds: [] });

    fixture.componentInstance.salvar();

    expect(fixture.componentInstance.erro()).toContain('inválido');
    http.expectNone(`${environment.apiUrl}/teams`);
  });

  it('alternarEstacao adiciona e remove do rascunho', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.alternarEstacao('EST-01');
    expect(componente.novaEquipe().estacaoIds).toEqual(['EST-01']);

    componente.alternarEstacao('EST-01');
    expect(componente.novaEquipe().estacaoIds).toEqual([]);
  });

  it('salvar com dados validos cadastra e limpa o rascunho', () => {
    const fixture = montar();
    fixture.componentInstance.novaEquipe.set({ id: 'EQ-02', nome: 'Equipe B', turno: 'TARDE', estacaoIds: ['EST-02'] });

    fixture.componentInstance.salvar();

    const req = http.expectOne(`${environment.apiUrl}/teams`);
    expect(req.request.body).toEqual({ id: 'EQ-02', nome: 'Equipe B', turno: 'TARDE', estacaoIds: ['EST-02'] });
    req.flush({ id: 'EQ-02', nome: 'Equipe B', turno: 'TARDE', estacaoIds: ['EST-02'], ativa: true });

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);

    expect(fixture.componentInstance.novaEquipe().id).toBe('');
  });

  it('desativar chama deleteEquipe', () => {
    const fixture = montar();

    fixture.componentInstance.desativar('EQ-01');

    http.expectOne(`${environment.apiUrl}/teams/EQ-01`).flush(null);
    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `Cannot find module './equipes-config.component'`

- [ ] **Step 3: Implementar `EquipesConfigComponent`**

Criar `src/app/config/equipe/equipes-config.component.ts`:

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';

import { CatalogService } from '../../shared/catalog.service';
import { CODIGO_PADRAO, mensagemDeErro } from '../../shared/incident.models';
import { EquipePayload, Turno } from '../../shared/team.models';
import { TeamService } from '../../shared/team.service';

interface FormEquipe { id: string; nome: string; turno: Turno; estacaoIds: string[]; }

const EQUIPE_VAZIA: FormEquipe = { id: '', nome: '', turno: 'MANHA', estacaoIds: [] };

/**
 * Cadastro de equipes — sub-aba "Equipes" de `/config/equipe`.
 *
 * Mesmo padrão de `StationsConfigComponent`: rascunho local + lista, sem
 * FormGroup. A alocação de estações é um toggle de chips, não um `<select
 * multiple>` — mais fácil de operar com o mouse numa tela de cadastro.
 */
@Component({
  selector: 'app-equipes-config',
  templateUrl: './equipes-config.component.html',
})
export class EquipesConfigComponent implements OnInit {
  private team = inject(TeamService);
  private catalog = inject(CatalogService);

  readonly equipes = this.team.equipes;
  readonly estacoes = this.catalog.stations;
  readonly turnos: Turno[] = ['MANHA', 'TARDE', 'NOITE'];

  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly novaEquipe = signal<FormEquipe>({ ...EQUIPE_VAZIA });

  ngOnInit(): void {
    this.team.load();
    this.catalog.load();
  }

  alternarEstacao(estacaoId: string): void {
    this.novaEquipe.update(f => ({
      ...f,
      estacaoIds: f.estacaoIds.includes(estacaoId)
        ? f.estacaoIds.filter(id => id !== estacaoId)
        : [...f.estacaoIds, estacaoId],
    }));
  }

  salvar(): void {
    const form = this.novaEquipe();
    if (!CODIGO_PADRAO.test(form.id)) {
      this.erro.set('Código inválido. Use letras maiúsculas e números com um hífen, como EQ-01.');
      return;
    }
    if (!form.nome.trim()) {
      this.erro.set('Informe um nome.');
      return;
    }

    this.erro.set('');
    this.salvando.set(true);
    const payload: EquipePayload = {
      id: form.id, nome: form.nome.trim(), turno: form.turno, estacaoIds: form.estacaoIds,
    };
    this.team.createEquipe(payload).subscribe({
      next: () => {
        this.novaEquipe.set({ ...EQUIPE_VAZIA });
        this.salvando.set(false);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  desativar(id: string): void {
    this.team.deleteEquipe(id).subscribe({ error: e => this.erro.set(mensagemDeErro(e)) });
  }

  nomeEstacao(id: string): string {
    return this.estacoes().find(e => e.id === id)?.nome ?? id;
  }
}
```

Criar `src/app/config/equipe/equipes-config.component.html`:

```html
<section>
  @if (erro()) {
    <p class="vazio" role="alert">{{ erro() }}</p>
  }

  <form class="auth-form" style="max-width:560px" (submit)="$event.preventDefault(); salvar()">
    <div class="field">
      <label>Código</label>
      <input class="input" [value]="novaEquipe().id" placeholder="EQ-01"
             (input)="novaEquipe.set({ ...novaEquipe(), id: ($any($event.target).value || '').toUpperCase() })" />
    </div>
    <div class="field">
      <label>Nome</label>
      <input class="input" [value]="novaEquipe().nome" placeholder="Equipe A"
             (input)="novaEquipe.set({ ...novaEquipe(), nome: $any($event.target).value })" />
    </div>
    <div class="field">
      <label>Turno</label>
      <select class="select" [value]="novaEquipe().turno"
              (change)="novaEquipe.set({ ...novaEquipe(), turno: $any($event.target).value })">
        @for (t of turnos; track t) {
          <option [value]="t">{{ t }}</option>
        }
      </select>
    </div>
    <div class="field">
      <label>Estações cobertas</label>
      <div class="subtabs">
        @for (e of estacoes(); track e.id) {
          @if (e.ativa) {
            <button type="button" class="chip" [class.on]="novaEquipe().estacaoIds.includes(e.id)"
                    (click)="alternarEstacao(e.id)">{{ e.id }} · {{ e.nome }}</button>
          }
        }
      </div>
    </div>
    <button type="submit" class="btn primary" [disabled]="salvando()">Cadastrar equipe</button>
  </form>

  <div style="margin-top:28px">
    @for (eq of equipes(); track eq.id) {
      <div class="list-row">
        <span class="a-station">{{ eq.id }}</span>
        <span>{{ eq.nome }}</span>
        <span class="chip">{{ eq.turno }}</span>
        <span class="ph-meta">{{ eq.estacaoIds.length ? eq.estacaoIds.map(nomeEstacao).join(', ') : 'sem estação' }}</span>
        <span class="status" [class.on]="eq.ativa">{{ eq.ativa ? 'ativa' : 'inativa' }}</span>
        @if (eq.ativa) {
          <button type="button" class="btn ghost sm" (click)="desativar(eq.id)">desativar</button>
        }
      </div>
    } @empty {
      <p class="vazio">nenhuma equipe cadastrada ainda</p>
    }
  </div>
</section>
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — `equipes-config.component.spec.ts`

- [ ] **Step 5: `UsuariosConfigComponent` — spec que falha**

Criar `src/app/config/equipe/usuarios-config.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { UsuariosConfigComponent } from './usuarios-config.component';

describe('UsuariosConfigComponent', () => {
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
    const fixture = TestBed.createComponent(UsuariosConfigComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([
      { username: 'gestor.demo', papel: 'GESTOR' },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  it('lista os usuarios cadastrados, sem senha em tela', () => {
    const fixture = montar();

    expect(fixture.nativeElement.textContent).toContain('gestor.demo');
  });

  it('cadastro sem senha mostra erro e nao envia', () => {
    const fixture = montar();
    fixture.componentInstance.novoUsuario.set({ username: 'novo', papel: 'OPERADOR', password: '' });

    fixture.componentInstance.salvar();

    expect(fixture.componentInstance.erro()).toContain('senha');
    http.expectNone((r) => r.method === 'POST' && r.url === `${environment.apiUrl}/users`);
  });

  it('salvar com senha cadastra e limpa o rascunho', () => {
    const fixture = montar();
    fixture.componentInstance.novoUsuario.set({ username: 'novo', papel: 'OPERADOR', password: 'senha123' });

    fixture.componentInstance.salvar();

    const req = http.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.body).toEqual({ username: 'novo', papel: 'OPERADOR', password: 'senha123' });
    req.flush({ username: 'novo', papel: 'OPERADOR' });

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);

    expect(fixture.componentInstance.novoUsuario().username).toBe('');
  });

  it('remover chama deleteUsuario', () => {
    const fixture = montar();

    fixture.componentInstance.remover('gestor.demo');

    http.expectOne(`${environment.apiUrl}/users/gestor.demo`).flush(null);
    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `Cannot find module './usuarios-config.component'`

- [ ] **Step 7: Implementar `UsuariosConfigComponent`**

Criar `src/app/config/equipe/usuarios-config.component.ts`:

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';

import { mensagemDeErro } from '../../shared/incident.models';
import { Papel } from '../../shared/auth/auth.models';
import { TeamService } from '../../shared/team.service';

interface FormUsuario { username: string; papel: Papel; password: string; }

const USUARIO_VAZIO: FormUsuario = { username: '', papel: 'OPERADOR', password: '' };

/**
 * Cadastro de usuários — sub-aba "Usuários" de `/config/equipe`.
 *
 * Só username/papel/senha (design doc de E4, §4.2): sem tela de "esqueci
 * minha senha" nesta entrega, redefinir é a única ação sensível de edição.
 */
@Component({
  selector: 'app-usuarios-config',
  templateUrl: './usuarios-config.component.html',
})
export class UsuariosConfigComponent implements OnInit {
  private team = inject(TeamService);

  readonly usuarios = this.team.usuarios;
  readonly papeis: Papel[] = ['GESTOR', 'OPERADOR'];

  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly novoUsuario = signal<FormUsuario>({ ...USUARIO_VAZIO });

  ngOnInit(): void {
    this.team.load();
  }

  salvar(): void {
    const form = this.novoUsuario();
    if (!form.username.trim()) {
      this.erro.set('Informe um usuário.');
      return;
    }
    if (!form.password) {
      this.erro.set('Informe uma senha para o cadastro.');
      return;
    }

    this.erro.set('');
    this.salvando.set(true);
    this.team.createUsuario({
      username: form.username.trim(), papel: form.papel, password: form.password,
    }).subscribe({
      next: () => {
        this.novoUsuario.set({ ...USUARIO_VAZIO });
        this.salvando.set(false);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  remover(username: string): void {
    this.team.deleteUsuario(username).subscribe({ error: e => this.erro.set(mensagemDeErro(e)) });
  }
}
```

Criar `src/app/config/equipe/usuarios-config.component.html`:

```html
<section>
  @if (erro()) {
    <p class="vazio" role="alert">{{ erro() }}</p>
  }

  <form class="auth-form" style="max-width:480px" (submit)="$event.preventDefault(); salvar()">
    <div class="field">
      <label>Usuário</label>
      <input class="input" [value]="novoUsuario().username" placeholder="nome.sobrenome"
             (input)="novoUsuario.set({ ...novoUsuario(), username: $any($event.target).value })" />
    </div>
    <div class="field">
      <label>Papel</label>
      <select class="select" [value]="novoUsuario().papel"
              (change)="novoUsuario.set({ ...novoUsuario(), papel: $any($event.target).value })">
        @for (p of papeis; track p) {
          <option [value]="p">{{ p }}</option>
        }
      </select>
    </div>
    <div class="field">
      <label>Senha</label>
      <input class="input" type="password" [value]="novoUsuario().password"
             (input)="novoUsuario.set({ ...novoUsuario(), password: $any($event.target).value })" />
    </div>
    <button type="submit" class="btn primary" [disabled]="salvando()">Cadastrar usuário</button>
  </form>

  <div style="margin-top:28px">
    @for (u of usuarios(); track u.username) {
      <div class="list-row">
        <span class="a-station">{{ u.username }}</span>
        <span class="chip">{{ u.papel }}</span>
        <button type="button" class="btn ghost sm" (click)="remover(u.username)">remover</button>
      </div>
    } @empty {
      <p class="vazio">nenhum usuário cadastrado ainda</p>
    }
  </div>
</section>
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — `usuarios-config.component.spec.ts`

- [ ] **Step 9: `EquipeUsuariosTabComponent` — spec que falha**

Criar `src/app/config/equipe/equipe-usuarios-tab.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { EquipeUsuariosTabComponent } from './equipe-usuarios-tab.component';

describe('EquipeUsuariosTabComponent', () => {
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
    const fixture = TestBed.createComponent(EquipeUsuariosTabComponent);
    fixture.detectChanges();
    // 2 GETs de app-equipes-config (teams, users) + 1 de CatalogService.load (stations)
    // + 2 GETs de app-usuarios-config nunca chegam a existir juntos: só o painel
    // ativo (subaba 'equipes' por padrão) está montado.
    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
    http.expectOne(`${environment.apiUrl}/stations`).flush([]);
    fixture.detectChanges();
    return fixture;
  }

  it('comeca na sub-aba Equipes', () => {
    const fixture = montar();

    expect(fixture.nativeElement.querySelector('app-equipes-config')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-usuarios-config')).toBeNull();
  });

  it('irPara troca para Usuarios', () => {
    const fixture = montar();

    fixture.componentInstance.irPara('usuarios');
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);

    expect(fixture.nativeElement.querySelector('app-usuarios-config')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-equipes-config')).toBeNull();
  });
});
```

- [ ] **Step 10: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: FAIL — `Cannot find module './equipe-usuarios-tab.component'`

- [ ] **Step 11: Implementar `EquipeUsuariosTabComponent`**

Criar `src/app/config/equipe/equipe-usuarios-tab.component.ts`:

```typescript
import { Component, signal } from '@angular/core';

import { EquipesConfigComponent } from './equipes-config.component';
import { UsuariosConfigComponent } from './usuarios-config.component';

type SubAba = 'equipes' | 'usuarios';

/**
 * Aba "Equipes e usuários" de `/config/equipe` — hospeda duas sub-abas
 * internas (design doc de E4, §4.2), sem rota própria para cada uma: mesmo
 * padrão de alternância local que `IdentityTabComponent` usa para o tema, só
 * que trocando o painel inteiro em vez de um valor.
 */
@Component({
  selector: 'app-equipe-usuarios-tab',
  imports: [EquipesConfigComponent, UsuariosConfigComponent],
  templateUrl: './equipe-usuarios-tab.component.html',
})
export class EquipeUsuariosTabComponent {
  readonly subaba = signal<SubAba>('equipes');

  irPara(s: SubAba): void {
    this.subaba.set(s);
  }
}
```

Criar `src/app/config/equipe/equipe-usuarios-tab.component.html`:

```html
<div class="tab-head">
  <div>
    <div class="eyebrow-accent">Equipes e usuários</div>
    <h2 class="tab-title">Quem <em style="color:var(--accent);font-style:normal">cobre cada estação.</em></h2>
    <p class="sub" style="font-size:14px;margin-top:6px">Alocação estática por turno — sem escala por data nesta versão.</p>
  </div>
</div>

<div class="subtabs" style="margin-top:24px">
  <button type="button" class="chip" [class.on]="subaba() === 'equipes'" (click)="irPara('equipes')">Equipes</button>
  <button type="button" class="chip" [class.on]="subaba() === 'usuarios'" (click)="irPara('usuarios')">Usuários</button>
</div>

<div style="margin-top:24px">
  @if (subaba() === 'equipes') {
    <app-equipes-config />
  } @else {
    <app-usuarios-config />
  }
</div>
```

- [ ] **Step 12: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch`
Expected: PASS — `equipe-usuarios-tab.component.spec.ts`

- [ ] **Step 13: Ligar a 5ª aba em `SettingsPageComponent`**

Em `src/app/config/settings/settings-page.component.ts`, adicionar à constante `TABS`:

```typescript
const TABS: SettingsTab[] = [
  { path: 'identidade', label: 'Identidade da empresa', hint: 'Marca · CNPJ · cor' },
  { path: 'estacoes', label: 'Estações e câmeras', hint: 'O que será monitorado' },
  { path: 'epis', label: 'EPIs monitorados', hint: 'Seleção dos equipamentos' },
  { path: 'cas', label: 'CAs e validades', hint: 'Certificados de aprovação' },
  { path: 'equipe', label: 'Equipes e usuários', hint: 'Alocação e acesso' },
];
```

Em `src/app/config/settings/settings-page.component.html`, adicionar um `@case` ao `@switch (t.path)` (depois de `@case ('cas') { ... }`), reaproveitando o ícone de "Colaboradores" do dock:

```html
            @case ('equipe') {
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="9" cy="8" r="3"/><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
                <circle cx="17" cy="9" r="2.5"/><path d="M15.5 20c0-2.4 1.8-4.4 4-5"/>
              </svg>
            }
```

Em `src/app/config/settings/settings-page.component.spec.ts`, atualizar o teste `'tem uma aba para cada secao do onboarding editavel'`:

```typescript
  it('tem uma aba para cada secao do onboarding editavel, mais equipes e usuarios', () => {
    const fixture = montarGestor();

    const links: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('.cat-item'));

    expect(links.length).toBe(5);
    expect(fixture.nativeElement.textContent).toContain('Identidade da empresa');
    expect(fixture.nativeElement.textContent).toContain('Estações e câmeras');
    expect(fixture.nativeElement.textContent).toContain('EPIs monitorados');
    expect(fixture.nativeElement.textContent).toContain('CAs e validades');
    expect(fixture.nativeElement.textContent).toContain('Equipes e usuários');
  });
```

- [ ] **Step 14: Wire a rota `equipe` e o item "Colaboradores" do dock**

Em `src/app/app.routes.ts`, adicionar o import e o child route:

```typescript
import { EquipeUsuariosTabComponent } from './config/equipe/equipe-usuarios-tab.component';
```

```typescript
      { path: 'cas', component: CasTabComponent },
      { path: 'equipe', component: EquipeUsuariosTabComponent },
```

Em `src/app/shared/dock/dock.component.ts`, trocar a linha `{ key: 'team', label: 'Colaboradores' },` por:

```typescript
  { key: 'team',      label: 'Colaboradores', route: '/config/equipe' },
```

Em `src/app/shared/dock/dock.component.spec.ts`, adicionar:

```typescript
  it('liga "Colaboradores" a /config/equipe', () => {
    const fixture = TestBed.createComponent(DockComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.items.find(i => i?.key === 'team')?.route).toBe('/config/equipe');
  });
```

- [ ] **Step 15: Adicionar as classes CSS**

Em `src/styles.scss`, adicionar ao final do arquivo:

```scss
.subtabs { display: flex; gap: 10px; flex-wrap: wrap; }
.list-row { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 8px; background: var(--bg-2); margin-bottom: 8px; flex-wrap: wrap; }
```

- [ ] **Step 16: Rodar a suíte completa e o build**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng test --no-watch && npx ng build`
Expected: testes PASS, build sem erro

- [ ] **Step 17: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/config/equipe/ \
        src/app/config/settings/settings-page.component.ts \
        src/app/config/settings/settings-page.component.html \
        src/app/config/settings/settings-page.component.spec.ts \
        src/app/app.routes.ts \
        src/app/shared/dock/dock.component.ts \
        src/app/shared/dock/dock.component.spec.ts \
        src/styles.scss
git commit -m "feat(front): tela /config/equipe com abas Equipes e Usuarios"
```

---

## Self-Review

**Cobertura da spec (design doc de E4):**
- §2.1/§2.2 sessão por cookie, dois fluxos de login → Task 1 (`AuthService`), Task 4/5 (`/login`, `/login-estacao`) — `withCredentials: true` em toda chamada, igual a `IncidentService`.
- §2.5 primeiro acesso / bootstrap do gestor mestre (revisado em 2026-08-23, segunda rodada de design) → Task 1 (`AuthService.checkSetupStatus()`/`bootstrap()`, e os handlers de mock `GET /setup/status`/`POST /setup`), Task 2 (`canActivateOnboarding`, consultando `GET /setup/status` na rota `''`) e Task 3 (o passo novo "Usuário mestre" no wizard, e `OnboardingService.launch()` chamando `POST /setup` antes de `persistConfig()` — sucesso autentica a sessão e a navegação para `/dashboard` já sai autenticada; falha mantém o usuário no passo de confirmação com erro visível). O usuário criado pelo mock em Task 1 é intencionalmente independente de `USUARIOS_MUTAVEL` (que só existe a partir de Task 10) — decisão documentada no próprio handler de `POST /setup`, não uma omissão.
- §2.6 tabela de endpoints/proteção → guards mapeados em Global Constraints e Task 6 (`canActivateGestor` em `/dashboard`/`/heatmap`/`/config`, guard combinado em `/estacao/:id`, `canActivateOnboarding` em `''`, `/incidentes`/`/incidentes/:id`/`/estacoes` conscientemente sem guard nesta entrega).
- §3 modelo de `Equipe` → Task 10 (`team.models.ts`, mesmos campos: `id`, `nome`, `turno`, `estacaoIds`, `ativa`).
- §4.1 dock por papel → Tasks 7 e 8 (dashboard/heatmap/config, depois incidentes/estações/kiosk), com o kiosk ganhando dock só para `GESTOR` (Task 8, Step 7–8) — a reversão exata da constraint de e3b, registrada em Global Constraints.
- §4.2 rotas novas e abas de `/config/equipe` → Tasks 4, 5 e 11. A consequência de §4.2 para a rota `''` (consultar `GET /setup/status` antes de renderizar) → Task 2 (`canActivateOnboarding`) e Task 6 (wiring na rota).
- §4.2.1 novo passo "Usuário mestre" no onboarding → Task 3 inteira: `STEPS` ganha a chave `'master-user'` logo após `'identity'` (via chave, não índice — mesmo mecanismo que `validateStep` já usava, verificado explicitamente para essa inserção), `StepMasterUserComponent` segue o padrão exato de `Step1IdentityComponent` (`.field`/`.input`/`.field-error`, sem `styleUrl`), e `launch()` passa a autenticar antes de navegar.
- §4.3 guards → Task 2 (as cinco funções, incluindo `canActivateOnboarding`) e Task 6 (wiring, incluindo a decisão explícita de não ligar `canActivateAutenticado` a nada).
- §4.4 `AuthService` → Task 1, incluindo o comportamento de 401 "silencioso" no boot.
- §6 fora de escopo → nada implementado aqui contradiz a lista (sem "esqueci minha senha", sem auto-registro além do bootstrap único de `POST /setup`, sem escala por data, sem rotação automática de token, sem rate limiting, sem papel novo).
- §7 ordem de implementação → este plano é o passo 3; nenhuma task toca `cypher` nem `cypher-capture`.
- Padrão de design (callout no topo de §4 do design doc) → verificado tarefa a tarefa: nenhuma task deste plano introduz `styleUrl`, `ReactiveFormsModule` ou biblioteca de UI nova. A Task 3 em particular (o novo passo de onboarding) não toca `styles.scss` nenhuma vez — reaproveita só `.field`/`.input`/`.field-error`, já globais antes desta entrega.

**Placeholders:** nenhum — todo passo tem código completo, comandos reais e critério de PASS/FAIL explícito.

**Consistência de tipos:** `Papel` definido uma única vez em `auth.models.ts` (Task 1) e reusado por `auth.guards.ts` (Task 2), `team.models.ts` (Task 10, via `Usuario.papel`) e `usuarios-config.component.ts` (Task 11) — nenhuma redefinição paralela. `AuthService.role()`/`estacaoId()` têm a mesma assinatura em Task 1, nos guards (Task 2), em todas as páginas com dock (Tasks 7–8) e em `ChromeTopbarComponent` (Task 9). `LoginResponse`/`LoginEstacaoResponse`/`MeResponse` são usados sem alteração de forma entre Task 1 e Tasks 4–5; `AuthService.bootstrap()` (Task 1) devolve o mesmo `LoginResponse` que `login()` — mesmo formato de resposta que o design doc fixa em §2.5, e é o tipo que `OnboardingService.launch()` (Task 3) consome. `SetupStatusResponse` (Task 1) é usado sem alteração de forma por `checkSetupStatus()` (Task 1) e por `canActivateOnboarding` (Task 2). `OnboardingData.masterUsername`/`masterPassword` (Task 3) são lidos e escritos só por `StepMasterUserComponent` e `OnboardingService` — `persistConfig()` continua com a mesma lista explícita de campos que já tinha antes de Task 3, então a senha nunca é gravada em `localStorage` (nem precisou de um filtro novo: a lista já era um allowlist, não um blocklist). `TeamService.equipes()`/`usuarios()` e os métodos `create*/update*/delete*` têm a mesma assinatura em Task 10 e nos dois componentes de Task 11. `GESTOR_DEMO`/`TOKENS_ESTACAO` (Task 1) são a fonte única da credencial/token de demonstração, reusada sem duplicação de valor em Task 4, Task 5 e Task 10 (`USUARIOS` semeado a partir de `GESTOR_DEMO`).

**Riscos que este plano assume conscientemente:**
- A mudança de `/auth/login` de comparar contra `GESTOR_DEMO` (Task 1) para validar contra `USUARIOS_MUTAVEL` (Task 10) é uma evolução incremental do mesmo handler — mesmo padrão que o plano de E3 usou para os filtros de `/incidents` (Task 1 simples, Task 2 evolui). O teste de Task 1 que afirma `POST /auth/login` com `GESTOR_DEMO` continua válido depois de Task 10 porque `USUARIOS_MUTAVEL` é semeado com a mesma credencial — a suíte completa roda depois de cada task (Global Constraint), então uma regressão aqui apareceria imediatamente.
- `SETUP_MOCK` (Task 1) fica independente de `USUARIOS_MUTAVEL` (Task 10) por todo o plano, ao contrário de `/auth/login` acima — deliberado, não um esquecimento: o mock de `POST /setup` só precisa provar o contrato request/response e a autenticação da sessão de resposta (o que os testes de Task 1 e Task 3 cobrem), não uma réplica fiel de "existe ≥1 Usuario" contra o catálogo de usuários que só nasce em Task 10. A consequência aceita: no modo de exemplo, o usuário criado pelo onboarding não aparece depois na aba Usuários nem sobrevive a um `logout()` — aceitável porque o modo de exemplo já tem `GESTOR_DEMO` como caminho de login persistente e testado (Task 10), e essa não é a superfície que a demo precisa exercitar dessa forma.
