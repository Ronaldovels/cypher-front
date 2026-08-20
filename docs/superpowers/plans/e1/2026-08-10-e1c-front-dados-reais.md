# E1-C · cypher-front, do mock aos dados reais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir as constantes mockadas do dashboard por incidentes reais vindos da API, com push por SSE, estado de conexão visível e vídeo ao vivo — e, no caminho, dar ao app um dono único de tema, um modo de dados de exemplo e o sistema tipográfico Cypher Sans.

**Architecture:** Um `IncidentService` baseado em signals concentra o estado: carrega o histórico por HTTP, abre o `EventSource` e faz *prepend* deduplicando por `incidentKey`. O `EventSource` é criado por uma fábrica injetável, o que torna o serviço testável sem depender de o ambiente de teste implementar a API. Componentes deixam de ter dados próprios e passam a ler `computed()` do serviço. O modo de dados de exemplo troca o **transporte**, não os serviços: um `HttpInterceptor` e uma fábrica de `EventSource` falsa, de modo que serviços, componentes e templates sejam idênticos nos dois modos.

**Tech Stack:** Angular 21.2 **zoneless** (o projeto não tem `zone.js`; todo `TestBed` de componente precisa de `provideZonelessChangeDetection()`), TypeScript 5.9, signals, `provideHttpClient(withFetch())`, Vitest + jsdom (a serem ligados na Task 1).

**Specs:**
- `docs/superpowers/specs/2026-08-10-notificacao-de-incidentes-design.md` §6, §7, §8, §15 (apenas a restrição sobre credenciais) — Tasks 4–7 e 9–12.
- `docs/superpowers/specs/2026-08-12-tema-flag-mock-tipografia-design.md` §1, §2, §3 — Tasks 2, 3 e 8.

**Depende de:** plano E1-A, Tasks 1–13 (a API precisa responder), para as Tasks 5–7 e 9–12. O vídeo ao vivo da Task 9 depende do plano E1-B, Tasks 6–7. **As Tasks 2 e 3 não dependem de nada além do runner de testes** — são as primeiras justamente por isso, e a Task 3 nem disso.

## Global Constraints

- **Repositório:** `/home/asaas/projects/challenge/cypher-front`. Todos os caminhos são relativos a essa raiz.
- **Requisições com `withCredentials: true` desde já.** `EventSource` não aceita cabeçalho `Authorization`, então a autenticação de E4 será por cookie de sessão; conviver com dois mecanismos depois seria retrabalho (spec §15).
- **Standalone components e signals**, seguindo o padrão do código existente (`ConfigService`, `DashboardComponent`). Nenhum NgModule novo.
- **Estilos em SCSS**, `inlineStyleLanguage` já configurado. `src/styles.scss` é alterado pela Task 3 (tipografia, deliberada) e pelos estados novos de conexão e vazio das demais — nada além disso.
- **Nada de dados fabricados.** Toda constante mockada que sobreviver a este plano precisa estar rotulada em tela como dado de exemplo. Isso vale também para o modo mock da Task 8: quando `useMockData` está ligado, o badge de conexão diz **"dados de exemplo"**.
- **Modo mock é opt-in no teste, nunca herdado do ambiente.** O alvo de teste usa a configuração `development`, onde `useMockData` é `true`. Todo `TestBed` que renderize o `ConnectionBadgeComponent` — direta ou indiretamente — declara `{ provide: USE_MOCK_DATA, useValue: false }`.
- **Nada de `font-variation-settings` global.** É propriedade herdada e sobrepõe `font-weight` no mesmo eixo (CSS Fonts 4 §6.9); no `html` ela achataria as 25 declarações `font-weight: 700` e as 7 de `800` do app. Peso se controla por `font-weight`.
- **Um dono só para o `<body>`.** Depois da Task 2, apenas o `ThemeService` escreve classe no `<body>`, e sempre por `classList`, nunca por atribuição de `className`.
- **Commits:** um por tarefa, em português, no formato do repo (`feat:`, `fix:`, `chore:`), **sem linha de coautoria**.
- **A API base em desenvolvimento é `http://localhost:8080/api/v1`.**

---

## Estrutura de arquivos

```
src/environments/
├── environment.ts                       CRIAR  produção        (useMockData: false)
└── environment.development.ts           CRIAR  desenvolvimento (useMockData: true)

src/app/shared/
├── theme.service.ts                     CRIAR  dono único do tema (Task 2)
├── theme.service.spec.ts                CRIAR
├── incident.models.ts                   CRIAR  tipos do contrato + helpers de severidade
├── incident.service.ts                  CRIAR  store de incidentes (HTTP + SSE)
├── incident.service.spec.ts             CRIAR
├── catalog.service.ts                   CRIAR  câmeras e estações
├── event-source.factory.ts              CRIAR  token injetável do EventSource
├── mock/                                 CRIAR  modo dados de exemplo (Task 8)
│   ├── fixtures.ts                              incidentes, summary, cameras, stations
│   ├── mock-api.interceptor.ts                  responde os endpoints sem rede
│   ├── mock-api.interceptor.spec.ts
│   └── mock-event-source.ts                     EventSourceLike que emite num timer
├── chrome-topbar/
│   ├── chrome-topbar.component.ts       MODIFICAR  engrenagem no lugar do sol + toggle de tema
│   └── chrome-topbar.component.spec.ts  CRIAR
├── connection-badge/                     CRIAR  badge de estado da conexão
│   ├── connection-badge.component.ts
│   └── connection-badge.component.spec.ts
└── live-feed/                            CRIAR  vídeo ao vivo
    ├── live-feed.component.ts
    └── live-feed.component.spec.ts

src/app/onboarding/
├── onboarding.service.ts                MODIFICAR  para de escrever no <body>; theme sai de persistConfig
├── onboarding.service.spec.ts           CRIAR
├── models/onboarding.models.ts          MODIFICAR  theme sai de OnboardingData
├── steps/step1-identity/*.ts|.html      MODIFICAR  toggle fala com ThemeService
└── steps/step4-confirm/*.html           MODIFICAR  lê o tema do ThemeService

src/app/dashboard/
├── dashboard.component.ts               MODIFICAR  remove KPI_DATA, ALERTS, BAR_DATA, HEAT_DATA
├── dashboard.component.html             MODIFICAR  badge, feed, dados reais
└── dashboard.component.spec.ts          CRIAR

src/app/heatmap/
├── heatmap.component.ts                 MODIFICAR  célula = estação
├── heatmap.component.html               MODIFICAR
└── heatmap.component.spec.ts            CRIAR

src/app/shared/config.service.ts         MODIFICAR  para de escrever no <body>; theme sai de CypherConfig
src/app/app.config.ts                    MODIFICAR  provideHttpClient + interceptor e SSE de mock
src/styles.scss                          MODIFICAR  tipografia (Task 3), estados novos
angular.json                             MODIFICAR  builder de testes, fileReplacements
package.json                             MODIFICAR  vitest, jsdom
```

**Por que essa divisão.** `incident.models.ts` não tem dependência de Angular — são tipos e funções puras, testáveis sem TestBed. `event-source.factory.ts` existe para que o serviço não construa um `EventSource` diretamente: sem essa costura, testar reconexão exigiria um ambiente de teste que implemente a API, o que nem todos implementam — e é a mesma costura que a Task 8 reaproveita para o modo mock. `catalog.service.ts` é separado porque câmeras e estações mudam raramente e por motivos diferentes dos incidentes. `theme.service.ts` não tem dependência nenhuma, de propósito: `ConfigService` e `OnboardingService` precisam injetá-lo sem criar ciclo. A pasta `mock/` fica isolada para que apagá-la inteira, no dia em que o modo sair, não deixe rastro nos serviços.

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

## Task 2: Tema — dono único, toggle e ícone honesto

**Files:**
- Create: `src/app/shared/theme.service.ts`
- Create: `src/app/shared/theme.service.spec.ts`
- Create: `src/app/onboarding/onboarding.service.spec.ts`
- Create: `src/app/shared/chrome-topbar/chrome-topbar.component.spec.ts`
- Modify: `src/app/shared/config.service.ts`
- Modify: `src/app/onboarding/onboarding.service.ts`
- Modify: `src/app/onboarding/models/onboarding.models.ts`
- Modify: `src/app/onboarding/steps/step1-identity/step1-identity.component.ts`
- Modify: `src/app/onboarding/steps/step1-identity/step1-identity.component.html`
- Modify: `src/app/onboarding/steps/step4-confirm/step4-confirm.component.ts`
- Modify: `src/app/onboarding/steps/step4-confirm/step4-confirm.component.html`
- Modify: `src/app/shared/chrome-topbar/chrome-topbar.component.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `Theme = 'dark' | 'light'`.
  - `ThemeService.theme: Signal<Theme>`, `.set(theme: Theme): void`, `.toggle(): void`.
  - `CypherConfig` **sem** o campo `theme`.
  - `OnboardingData` **sem** o campo `theme`.

O botão da topbar que parece um toggle de tema não é um: o SVG em `chrome-topbar.component.ts` é um círculo com oito raios — um sol — dentro de um `<a routerLink="/">`. Quem quer trocar o tema clica nele e cai no wizard de onboarding. Não é bug de estado (os botões Claro/Escuro do step 1 não estão dentro de um `<form>`, então não há reload); é bug de affordance.

Consertar a affordance esbarra num problema estrutural que precisa sair junto. Hoje `config.service.ts` e `onboarding.service.ts` escrevem `document.body.className` cada um por conta própria, por atribuição direta, e o tema só persiste ao concluir o wizard. Um toggle novo no dashboard que não passe por um dono único volta sozinho no próximo reload e entra em disputa com o `effect` do wizard.

**`cypher.theme` passa a ser a única fonte de verdade, e o campo `theme` sai de `CypherConfig` e de `OnboardingData`.** Sem isso o tema mora em duas chaves de `localStorage` sem regra de escrita: concluir o wizard sobrescreveria um toggle feito no dashboard.

**O `ThemeService` não usa `effect()`.** O app é zoneless, e um `effect` de construtor só rodaria depois de um `TestBed.tick()`. Escrever no `<body>` é um comando, não uma reação: `set()` faz na hora.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/shared/theme.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ThemeService } from './theme.service';

/** O serviço lê o localStorage na construção, então cada caso monta o seu. */
function criar(): ThemeService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(ThemeService);
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  afterEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  it('sem nada gravado, começa no escuro', () => {
    const service = criar();

    expect(service.theme()).toBe('dark');
    expect(document.body.classList.contains('theme-dark')).toBe(true);
  });

  it('troca a classe do body sem deixar a antiga para trás', () => {
    const service = criar();

    service.set('light');

    expect(document.body.classList.contains('theme-light')).toBe(true);
    expect(document.body.classList.contains('theme-dark')).toBe(false);
  });

  it('preserva outras classes do body', () => {
    document.body.classList.add('impressao');
    const service = criar();

    service.set('light');

    // Este é o teste que a atribuição direta de className não passaria.
    expect(document.body.classList.contains('impressao')).toBe(true);
  });

  it('toggle alterna e persiste na hora, não ao concluir o wizard', () => {
    const service = criar();

    service.toggle();

    expect(service.theme()).toBe('light');
    expect(localStorage.getItem('cypher.theme')).toBe('light');
  });

  it('hidrata de cypher.theme', () => {
    localStorage.setItem('cypher.theme', 'light');

    expect(criar().theme()).toBe('light');
  });

  it('sem cypher.theme, migra do cypher.config legado', () => {
    localStorage.setItem('cypher.config', JSON.stringify({ company: 'Acme', theme: 'light' }));

    expect(criar().theme()).toBe('light');
  });

  it('cypher.theme ganha do legado', () => {
    localStorage.setItem('cypher.theme', 'dark');
    localStorage.setItem('cypher.config', JSON.stringify({ theme: 'light' }));

    expect(criar().theme()).toBe('dark');
  });

  it('cypher.config corrompido não derruba o serviço', () => {
    localStorage.setItem('cypher.config', '{isso nao e json');

    expect(criar().theme()).toBe('dark');
  });
});
```

Criar `src/app/onboarding/onboarding.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OnboardingService } from './onboarding.service';
import { ThemeService } from '../shared/theme.service';

describe('OnboardingService e o tema', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  it('o wizard enxerga o tema trocado fora dele', () => {
    const theme = TestBed.inject(ThemeService);
    const state = TestBed.inject(OnboardingService);

    // Simula o toggle da topbar do dashboard, depois de o wizard já existir.
    theme.set('light');

    // Guardar uma cópia em data() não passaria aqui: o effect do serviço só
    // reage a mudanças de data(), e data() não mudou.
    expect(theme.theme()).toBe('light');
    expect(state.data()).not.toHaveProperty('theme');
  });

  it('persistConfig não grava mais o tema em cypher.config', () => {
    const state = TestBed.inject(OnboardingService);
    state.updateData({ company: 'Acme' });

    state.persistConfig();

    const gravado = JSON.parse(localStorage.getItem('cypher.config')!);
    expect(gravado.company).toBe('Acme');
    expect(gravado).not.toHaveProperty('theme');
  });
});
```

Criar `src/app/shared/chrome-topbar/chrome-topbar.component.spec.ts`:

```typescript
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChromeTopbarComponent } from './chrome-topbar.component';
import { ThemeService } from '../theme.service';

describe('ChromeTopbarComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
  });

  afterEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  function montar() {
    const fixture = TestBed.createComponent(ChromeTopbarComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('tem um botão que troca o tema', () => {
    const fixture = montar();
    const theme = TestBed.inject(ThemeService);
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="theme-toggle"]');

    expect(botao).not.toBeNull();
    botao.click();

    expect(theme.theme()).toBe('light');
  });

  it('o botão diz para onde vai, não onde está', () => {
    const fixture = montar();
    const botao: HTMLButtonElement = fixture.nativeElement.querySelector('[data-test="theme-toggle"]');

    expect(botao.getAttribute('aria-label')).toBe('Mudar para tema claro');

    botao.click();
    fixture.detectChanges();

    expect(botao.getAttribute('aria-label')).toBe('Mudar para tema escuro');
  });

  it('o link de reabrir onboarding não se apresenta mais como Configurações', () => {
    const fixture = montar();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('[data-test="reopen-onboarding"]');

    expect(link.getAttribute('href')).toBe('/');
    expect(link.getAttribute('aria-label')).toBe('Reabrir configuração inicial');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — não resolve `./theme.service`, e `[data-test="theme-toggle"]` não existe.

- [ ] **Step 3: Criar o `ThemeService`**

Criar `src/app/shared/theme.service.ts`:

```typescript
import { Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

/**
 * Dono único do tema.
 *
 * Antes disso, ConfigService e OnboardingService escreviam
 * `document.body.className` cada um por conta própria — e o tema só persistia
 * ao concluir o wizard, então trocá-lo e recarregar perdia a escolha.
 *
 * Sem dependências, de propósito: ConfigService e OnboardingService precisam
 * injetá-lo sem criar ciclo.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private static readonly KEY = 'cypher.theme';
  private static readonly LEGACY_KEY = 'cypher.config';

  private readonly _theme = signal<Theme>(ThemeService.hydrate());

  readonly theme = this._theme.asReadonly();

  constructor() {
    this.apply(this._theme());
  }

  set(theme: Theme): void {
    this._theme.set(theme);
    this.apply(theme);
    try {
      localStorage.setItem(ThemeService.KEY, theme);
    } catch {
      // Modo privativo ou storage cheio: o tema vale para esta sessão.
    }
  }

  toggle(): void {
    this.set(this._theme() === 'dark' ? 'light' : 'dark');
  }

  /**
   * Escrever no body é comando, não reação: nada de effect().
   *
   * classList em vez de className porque atribuir className apagaria qualquer
   * outra classe que alguém venha a pôr no body.
   */
  private apply(theme: Theme): void {
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${theme}`);
  }

  private static hydrate(): Theme {
    try {
      const direto = localStorage.getItem(ThemeService.KEY);
      if (direto === 'dark' || direto === 'light') {
        return direto;
      }

      // Migração de leitura: quem concluiu o onboarding antes desta mudança
      // guardou o tema dentro de cypher.config. Ninguém volta a escrever lá.
      const legado = localStorage.getItem(ThemeService.LEGACY_KEY);
      const tema = legado ? (JSON.parse(legado) as { theme?: unknown }).theme : null;
      if (tema === 'dark' || tema === 'light') {
        return tema;
      }
    } catch {
      // Storage indisponível ou config corrompida: cai no padrão.
    }

    return 'dark';
  }
}
```

- [ ] **Step 4: Tirar o tema do `ConfigService`**

Em `src/app/shared/config.service.ts`, remover o campo da interface e a escrita no `<body>`. A interface passa a ser:

```typescript
export interface CypherConfig {
  company: string;
  cnpj: string;
  sector: string;
  logoUrl: string | null;
  logoName: string;
  accent: string;
  epis: string[];
  cas: Record<string, any>;
}
```

e a linha `document.body.className = \`theme-${cfg.theme}\`;` sai do `effect`. O serviço continua dono do accent e não precisa injetar o `ThemeService` — com `theme` fora de `CypherConfig`, não sobra nada a delegar.

- [ ] **Step 5: Tirar o tema do `OnboardingData`**

Em `src/app/onboarding/models/onboarding.models.ts`, remover `theme: 'dark' | 'light';` da interface `OnboardingData` e `theme: 'dark',` de `DEFAULT_DATA`.

Em `src/app/onboarding/onboarding.service.ts`, remover a linha `document.body.className = \`theme-${d.theme}\`;` do `effect` (o resto do `effect`, que cuida do accent, fica) e tirar `theme: d.theme,` do objeto gravado em `persistConfig()`.

- [ ] **Step 6: Fazer o step 1 falar com o `ThemeService`**

Em `src/app/onboarding/steps/step1-identity/step1-identity.component.ts`:

```typescript
import { Component, inject } from '@angular/core';
import { OnboardingService } from '../../onboarding.service';
import { ThemeService } from '../../../shared/theme.service';
import { SECTORS, PRESET_COLORS, cnpjMask } from '../../models/onboarding.models';

@Component({
  selector: 'app-step1-identity',
  imports: [],
  templateUrl: './step1-identity.component.html',
})
export class Step1IdentityComponent {
  state = inject(OnboardingService);
  private themeService = inject(ThemeService);

  /** Lido direto do serviço: uma cópia em data() ficaria velha. */
  theme = this.themeService.theme;

  sectors = SECTORS;
  presetColors = PRESET_COLORS;

  onCnpj(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    this.state.updateData({ cnpj: cnpjMask(v) });
  }
  onLogo(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    this.state.updateData({ logoUrl: url, logoName: f.name });
  }
  setTheme(t: 'dark' | 'light') { this.themeService.set(t); }
  setAccent(c: string) { this.state.updateData({ accent: c }); }
}
```

Em `src/app/onboarding/steps/step1-identity/step1-identity.component.html`, as duas linhas do toggle:

```html
      <button [class.on]="theme() === 'light'" (click)="setTheme('light')">Claro</button>
      <button [class.on]="theme() === 'dark'" (click)="setTheme('dark')">Escuro</button>
```

- [ ] **Step 7: Fazer o step 4 ler o tema do serviço**

Em `src/app/onboarding/steps/step4-confirm/step4-confirm.component.ts`, acrescentar aos imports e à classe:

```typescript
import { ThemeService } from '../../../shared/theme.service';
```

```typescript
  theme = inject(ThemeService).theme;
```

Em `src/app/onboarding/steps/step4-confirm/step4-confirm.component.html`, trocar a linha do accent:

```html
      <div class="kicker" style="font-size:11px">{{ state.data().accent.toUpperCase() }} · tema {{ theme() }}</div>
```

- [ ] **Step 8: Trocar o sol por uma engrenagem e acrescentar o toggle**

Em `src/app/shared/chrome-topbar/chrome-topbar.component.ts`, substituir o bloco `<div class="tools">` inteiro:

```html
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
            <!-- Sol: o destino do clique, não o estado atual. -->
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

        <a routerLink="/" class="icon-btn" data-test="reopen-onboarding"
           aria-label="Reabrir configuração inicial" title="Reabrir configuração inicial">
          <!-- Engrenagem de verdade. O ícone anterior era um sol, e mandava
               para o onboarding quem só queria trocar o tema. -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </a>

        <div class="avatar">AG</div>
      </div>
```

e, na classe:

```typescript
import { Component, input, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeService } from '../theme.service';
```

```typescript
  private themeService = inject(ThemeService);

  temaEscuro = computed(() => this.themeService.theme() === 'dark');

  alternarTema(): void {
    this.themeService.toggle();
  }
```

- [ ] **Step 9: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 13 testes novos.

- [ ] **Step 10: Confirmar que a build ainda funciona**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm run build
```

Esperado: build conclui.

Confirmar que não sobrou referência ao campo removido:

```bash
cd /home/asaas/projects/challenge/cypher-front && grep -rn "\.theme" src/app
```

Esperado: só os acessos ao **serviço** (`themeService.theme`, `theme()`), nenhum a `data().theme` ou `cfg.theme`. Os três lugares que liam o campo eram `step1-identity.component.html` (linhas do toggle), `step4-confirm.component.html` (linha do accent) e `onboarding.service.ts` (o objeto de `persistConfig`) — todos tratados nos Steps 5 a 7. Se aparecer um quarto, é um template que este plano não listou: trocar por `themeService.theme()` do mesmo jeito.

- [ ] **Step 11: Conferir na mão**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm start
```

Em `http://localhost:4200/dashboard`, confirmar em ordem:

1. Existem dois ícones distintos na topbar: um sol/lua (troca o tema) e uma engrenagem (vai para o onboarding).
2. Clicar no sol troca o tema na hora, **sem sair da página**.
3. Recarregar mantém o tema escolhido.
4. Ir ao onboarding pela engrenagem: os botões Claro/Escuro do step 1 mostram o tema atual selecionado, não sempre "Escuro".

- [ ] **Step 12: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/theme.service.ts src/app/shared/theme.service.spec.ts \
        src/app/shared/config.service.ts src/app/shared/chrome-topbar/ \
        src/app/onboarding/
git commit -m "fix: dono unico do tema, toggle no dashboard e engrenagem no lugar do sol"
```

---

## Task 3: Tipografia Cypher Sans

**Files:**
- Modify: `src/styles.scss`

**Interfaces:**
- Consumes: nada.
- Produces: tokens `--display`, `--ui` (novo), `--mono` e `--tracking-*` em `src/styles.scss`.

Esta tarefa não tem teste unitário — tipografia se verifica olhando. Ela também não depende de nenhuma outra, nem do runner.

Inventário do que existe hoje em `src/styles.scss` (690 linhas): **~70 declarações `var(--mono)` contra ~8 de `var(--display)`**, com tamanhos dominantes de 9px, 10px e 11px. A identidade real do app é JetBrains Mono em caixa alta com tracking largo. Inter Tight aparece em oito lugares e no `html, body` herdado.

O arquivo `cypher-sans.css` de referência não pode ser aplicado literal. Três defeitos:

1. **`html { font-variation-settings: 'wght' 420 }` no bloco de dark mode achataria todos os pesos.** A propriedade é herdada e sobrepõe `font-weight` no mesmo eixo (CSS Fonts 4 §6.9). O app tem 25 declarações `font-weight: 700` e 7 de `800`, e o tema padrão é o escuro.
2. **O `@import` pede JetBrains Mono `400;600;700`, derrubando o peso 500** usado em `.kicker`, `.eyebrow-accent`, `.field label` e outros. E o import atual do app já está incompleto: carrega só `400;500;600` enquanto há ~15 classes em mono 700 e uma em 800 (`.station .sn`) — tudo sintetizado hoje. Verificado em 2026-08-12: a variable do JetBrains Mono cobre 100–800 (`wght@100..900` devolve HTTP 400).
3. **O `@font-face` começa com `local('Montserrat')`**, então quem tiver Montserrat estático instalado ganha esse arquivo para a faixa 100–900 inteira e o navegador fabrica os pesos que faltam. A URL também está fixada em `v30`; o Google serve `v31`.

**A decisão: três vozes.** Montserrat vem dos letreiros pintados do bairro Montserrat, em Buenos Aires — é fonte de sinalização, forte onde o painel *declara* e fraca onde ele *explica* (geométrica, larga, x-height menor que a do Inter Tight). Então: Cypher Sans no display, Inter Tight na UI, JetBrains Mono nos dados.

- [ ] **Step 1: Trocar o `@import` e declarar a fonte**

Em `src/styles.scss`, substituir o `@import url('https://fonts.googleapis.com/…')` do topo e o bloco `:root { … }` que vem logo depois — juntos, do `@import` até o `}` que fecha o `:root` — por:

```scss
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@100..900&family=Inter+Tight:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');

/* Cypher Sans é o nome de marca da Montserrat variable.
   Sem local(): um Montserrat estático instalado na máquina venceria o arquivo
   variable e o navegador fabricaria os pesos que faltassem — fake bold numa
   manchete de 64px é visível. URL v31, conferida em 2026-08-12. */
@font-face {
  font-family: 'Cypher Sans';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('https://fonts.gstatic.com/s/montserrat/v31/JTUSjIg1_i6t8kCHKm459Wlhyw.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

:root {
  --accent: #F4622A;
  --accent-soft: rgba(244, 98, 42, 0.14);
  --accent-deep: #C84A18;

  /* Três vozes:
     display  o painel declara  — manchetes e os números grandes
     ui       o painel explica  — texto corrido, formulários, chips
     mono     o painel mede     — labels, badges, IDs, eixos */
  --display: 'Cypher Sans', 'Montserrat', system-ui, sans-serif;
  --ui: 'Inter Tight', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --mono: 'JetBrains Mono', 'Fira Code', ui-monospace, Menlo, Consolas, monospace;

  --tracking-tighter: -0.045em;
  --tracking-tight: -0.035em;
  --tracking-normal: 0;
  --tracking-wide: 0.04em;
  --tracking-wider: 0.12em;
  --tracking-widest: 0.22em;
}
```

- [ ] **Step 2: Passar o corpo do app para a voz de UI**

Na linha do `html, body`, trocar `font-family: var(--display)` por `font-family: var(--ui)`. O resto da declaração (incluindo `letter-spacing: -0.005em`, que é do Inter Tight) fica.

Acrescentar logo abaixo, temporariamente:

```scss
/* CANÁRIO — remover no Step 6.
   Faz um peso não carregado aparecer errado em vez de ser fabricado em
   silêncio. Não vai para produção: numa rede de planta com o gstatic
   bloqueado, degradar visivelmente é pior que degradar de leve. */
html { font-synthesis-weight: none; }
```

- [ ] **Step 3: Trocar as três classes que continuam em Inter Tight**

Como `html, body` agora resolve para `--ui`, quem tinha `var(--display)` e pertence à voz de UI precisa dizer isso explicitamente. Em `.sub`, `.dock-label` e `.dock-tooltip`, trocar `var(--display)` por `var(--ui)`.

`.brand`, `.q`, `.summary-card .big` e `.stage-meta-tl/-tr/-bl/-br .big` mantêm `var(--display)` — agora resolvendo para Montserrat.

- [ ] **Step 4: Dar a voz de display aos dois números grandes**

`.kpi .kpi-val` e `.greeting .gtext .hi` herdavam a fonte do `body`, então a mudança do Step 2 os levaria para Inter Tight. São os dois números que o painel declara mais alto (48/800 e 28/800) e pertencem ao display. Acrescentar `font-family: var(--display);` às duas regras.

`.station .sn` **fica em mono**: apesar dos 20px/800, o nome da estação pertence à voz de dados, junto do `.sid` logo acima dele.

- [ ] **Step 5: Retocar os call-sites de display e ligar os números tabulares**

Montserrat, com x-height menor e conjunto mais largo, não aceita os mesmos valores do Inter Tight. Valores de partida, a confirmar no Step 6:

| Classe | Hoje | Partida |
|---|---|---|
| `.q` | `64px / 700 / -0.035em` | `66px / 700 / -0.04em` |
| `.kpi .kpi-val` | `48px / 800 / -0.04em` | `48px / 800 / -0.045em` |
| `.greeting .gtext .hi` | `28px / 800 / -0.03em` | `28px / 800 / -0.035em` |
| `.brand` | `22px / 700 / -0.03em` | `22px / 700 / -0.035em` |

E acrescentar ao fim do arquivo:

```scss
/* Números do painel: tabulares para não dançarem a cada atualização,
   zero cortado e lining. font-variant-numeric é a propriedade de alto
   nível — usar font-feature-settings aqui clobberia o que já existe. */
.kpi .kpi-val,
.bar-val,
.rk-row .nm,
.station .sn,
.summary-card .big,
.tkpi .tkpi-val {
  font-variant-numeric: tabular-nums slashed-zero lining-nums;
}
```

- [ ] **Step 6: Passe visual, nos dois temas**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm start
```

Percorrer, em `theme-dark` e `theme-light`:

1. **Nenhum peso sintetizado.** DevTools › Elements › Computed › Rendered Fonts, sobre `.q` e `.kpi-val`: precisa dizer `Montserrat` com o peso pedido, e **não** "Synthetic bold".
2. **Todos os pesos de mono carregaram.** `.kicker` continua distinto de `.rail-title` (500 vs 400), e os badges e IDs em 700 deixam de ser borrados.
3. **Onboarding step 1** (`http://localhost:4200/`) — o herói `.q` não quebra em três linhas nem estoura a coluna de `1fr 1fr`.
4. **Linha de KPIs** (`/dashboard`) — os quatro cartões cabem, o `48px` não estoura e "94.2 %" alinha na baseline com o denominador.
5. **Heatmap** (`/heatmap`) — `.station .sn` legível dentro do tile de 76px. É o peso que mais muda: hoje é fabricado, passa a ser o 800 real do JetBrains Mono. Se ficar pesado demais, cair para 700.
6. **Zero cortado.** Se o Montserrat não implementar a feature `zero`, `slashed-zero` é no-op silencioso e inofensivo — anotar o que se observou.

Ajustar os valores do Step 5 conforme o que a tela mostrar. Depois, **remover o bloco canário do Step 2**.

- [ ] **Step 7: Confirmar a build**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm run build
```

Esperado: build conclui. O orçamento de `anyComponentStyle` (4kB de aviso) não é afetado — a mudança inteira é em `styles.scss`, que entra no orçamento `initial` de 500kB.

- [ ] **Step 8: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/styles.scss
git commit -m "feat: sistema tipografico Cypher Sans em tres vozes"
```

---

## Task 4: Ambientes, cliente HTTP e tipos do contrato

**Files:**
- Create: `src/environments/environment.ts`
- Create: `src/environments/environment.development.ts`
- Modify: `angular.json`
- Modify: `src/app/app.config.ts`
- Create: `src/app/shared/incident.models.ts`
- Create: `src/app/shared/mock/use-mock-data.token.ts`
- Test: `src/app/shared/incident.models.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `environment: { production: boolean; apiUrl: string; useMockData: boolean }`.
  - `USE_MOCK_DATA` — `InjectionToken<boolean>`.
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
  /** Nunca ligado em produção. O modo de exemplo existe para desenvolver sem backend. */
  useMockData: false,
};
```

Criar `src/environments/environment.development.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080/api/v1',
  /**
   * Nasce ligado porque hoje não há backend rodando — é o motivo de a flag
   * existir. Vira false quando o plano E1-A estiver de pé; a Task 12 faz
   * essa virada como parte da verificação.
   */
  useMockData: true,
};
```

Criar `src/app/shared/mock/use-mock-data.token.ts`:

```typescript
import { InjectionToken } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * Se o app está servindo dados de exemplo.
 *
 * Existe como token, e não como leitura direta de `environment`, por dois
 * motivos: nenhum componente precisa conhecer o módulo de ambiente, e os
 * testes conseguem forçar os dois modos.
 *
 * Atenção: o alvo de teste usa a configuração `development`, onde a flag é
 * true. Toda spec que renderize o badge de conexão declara
 * `{ provide: USE_MOCK_DATA, useValue: false }` — mock é opt-in no teste.
 */
export const USE_MOCK_DATA = new InjectionToken<boolean>('USE_MOCK_DATA', {
  providedIn: 'root',
  factory: () => environment.useMockData,
});
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
        src/app/shared/incident.models.spec.ts src/app/shared/mock/ angular.json
git commit -m "feat: ambientes, cliente HTTP e tipos do contrato de incidente"
```

---

## Task 5: Store de incidentes por HTTP

**Files:**
- Create: `src/app/shared/incident.service.ts`
- Create: `src/app/shared/incident.service.spec.ts`

**Interfaces:**
- Consumes: `Incident`, `Page` (Task 4).
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

## Task 6: Push por SSE e estado de conexão

**Files:**
- Create: `src/app/shared/event-source.factory.ts`
- Modify: `src/app/shared/incident.service.ts`
- Modify: `src/app/shared/incident.service.spec.ts`
- Create: `src/app/shared/connection-badge/connection-badge.component.ts`
- Create: `src/app/shared/connection-badge/connection-badge.component.spec.ts`

**Interfaces:**
- Consumes: `IncidentService` (Task 5), `USE_MOCK_DATA` (Task 4).
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
import { USE_MOCK_DATA } from '../mock/use-mock-data.token';

/**
 * Estado da conexão — ou o aviso de que o painel está mostrando exemplos.
 *
 * A constraint do plano diz que dado fabricado precisa estar rotulado em tela.
 * Este é o lugar onde a pessoa já olha para saber se pode confiar no que está
 * vendo, então o aviso mora aqui em vez de num banner à parte.
 */
@Component({
  selector: 'app-connection-badge',
  template: `
    @if (exemplo) {
      <span class="conn mock"><i class="dot"></i>dados de exemplo</span>
    } @else {
      <span class="conn" [class.live]="estado() === 'ao vivo'"
            [class.off]="estado() === 'offline'">
        <i class="dot"></i>{{ estado() }}
      </span>
    }
  `,
  styles: [`
    .conn { display: inline-flex; align-items: center; gap: 6px;
            font-size: 12px; text-transform: lowercase; opacity: .8; }
    .dot  { width: 7px; height: 7px; border-radius: 50%; background: #FFCE38; }
    .live .dot, .conn.live .dot { background: #34D07E; }
    .off  .dot, .conn.off  .dot { background: #EE4242; }
    .mock { border: 1px dashed #FFCE38; border-radius: 999px;
            padding: 2px 10px; color: #FFCE38; opacity: 1; }
  `],
})
export class ConnectionBadgeComponent {
  private service = inject(IncidentService);

  /** Não muda em runtime: a flag é de build. */
  readonly exemplo = inject(USE_MOCK_DATA);

  estado = this.service.connection;
}
```

Criar `src/app/shared/connection-badge/connection-badge.component.spec.ts`:

```typescript
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { EVENT_SOURCE_FACTORY, EventSourceLike } from '../event-source.factory';
import { USE_MOCK_DATA } from '../mock/use-mock-data.token';
import { ConnectionBadgeComponent } from './connection-badge.component';

const SSE_INERTE: EventSourceLike = {
  addEventListener: () => { }, close: () => { }, onopen: null, onerror: null,
};

function configurar(exemplo: boolean) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withFetch()),
      provideHttpClientTesting(),
      { provide: EVENT_SOURCE_FACTORY, useValue: () => SSE_INERTE },
      { provide: USE_MOCK_DATA, useValue: exemplo },
    ],
  });
  const fixture = TestBed.createComponent(ConnectionBadgeComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ConnectionBadgeComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('em modo real, mostra o estado da conexão', () => {
    const fixture = configurar(false);

    expect(fixture.nativeElement.textContent).toContain('offline');
    expect(fixture.nativeElement.textContent).not.toContain('dados de exemplo');
  });

  it('em modo de exemplo, avisa em tela em vez de fingir estar ao vivo', () => {
    const fixture = configurar(true);

    expect(fixture.nativeElement.textContent).toContain('dados de exemplo');
    expect(fixture.nativeElement.textContent).not.toContain('ao vivo');
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 11 testes novos (9 de SSE + 2 do badge).

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/event-source.factory.ts src/app/shared/incident.service.ts \
        src/app/shared/incident.service.spec.ts \
        src/app/shared/connection-badge/
git commit -m "feat: push por SSE com estado de conexao visivel e cobertura de lacuna"
```

---

## Task 7: Catálogo e agregados

**Files:**
- Create: `src/app/shared/catalog.service.ts`
- Create: `src/app/shared/catalog.service.spec.ts`
- Modify: `src/app/shared/incident.service.ts`
- Modify: `src/app/shared/incident.service.spec.ts`

**Interfaces:**
- Consumes: `Camera`, `Station`, `Summary` (Task 4); `IncidentService` (Task 6).
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

## Task 8: Modo de dados de exemplo

**Files:**
- Create: `src/app/shared/mock/fixtures.ts`
- Create: `src/app/shared/mock/mock-api.interceptor.ts`
- Create: `src/app/shared/mock/mock-api.interceptor.spec.ts`
- Create: `src/app/shared/mock/mock-event-source.ts`
- Modify: `src/app/app.config.ts`

**Interfaces:**
- Consumes: `Incident`, `Page`, `Camera`, `Station`, `Summary`, `USE_MOCK_DATA` (Task 4); `EventSourceLike`, `EVENT_SOURCE_FACTORY` (Task 6); os endpoints modelados nas Tasks 5–7.
- Produces:
  - `INCIDENTS: Incident[]`, `CAMERAS: Camera[]`, `STATIONS: Station[]`, `resumo(): Summary`, `agoraNaPlanta(): string`.
  - `mockApiInterceptor: HttpInterceptorFn`.
  - `mockEventSourceFactory: () => EventSourceLike`.

**A costura é o transporte, não o serviço.** Duas implementações paralelas de `IncidentService` atrás de um token divergiriam: a de mock deixaria de exercitar o `upsert`, a deduplicação por `incidentKey`, o limite de 100 em memória e a cobertura de lacuna por `since`. Trocando o transporte, serviços, componentes e templates ficam idênticos nos dois modos — o modo de exemplo exercita o código real.

Esta tarefa vem só agora, e não junto do `environment`, porque precisa dos contratos das Tasks 5–7 já modelados. Antes disso ela mockaria endpoints que ainda não existem.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/shared/mock/mock-api.interceptor.spec.ts`:

```typescript
import { HttpClient, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { Camera, Incident, Page } from '../incident.models';
import { INCIDENTS } from './fixtures';
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

  it('deixa passar o que não conhece', () => {
    http.get(`${environment.apiUrl}/desconhecido`).subscribe();

    rede.expectOne(`${environment.apiUrl}/desconhecido`);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: FALHA — não resolve `./fixtures` nem `./mock-api.interceptor`.

- [ ] **Step 3: Escrever as fixtures**

Criar `src/app/shared/mock/fixtures.ts`:

```typescript
import { Camera, Incident, Station, Summary } from '../incident.models';

/**
 * Dados de exemplo do modo `useMockData`.
 *
 * Os instantes são de hoje para que os agregados façam sentido, e trazem o
 * offset -03:00 como o backend real traz — `formatTime` lê a hora do próprio
 * instante, então usar Z aqui mostraria o horário errado na tela.
 */

/** Agora, escrito no fuso da planta. */
export function agoraNaPlanta(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${d.toISOString().slice(0, 19)}.000-03:00`;
}

function hoje(hhmm: string): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}T${hhmm}:00.000-03:00`;
}

type Molde = Omit<Incident,
  'id' | 'incidentKey' | 'cameraId' | 'type' | 'severity' | 'nivel' | 'descricao' | 'detectedAt'>;

const MOLDE: Molde = {
  runId: 'run-exemplo',
  trackId: 1,
  reason: 'exemplo',
  postureCategory: 'neutral',
  rebaScore: 3,
  actionLevel: 1,
  zoneName: null,
  zoneStatus: 'outside',
  epiPresent: [],
  epiMissing: [],
  snapshotUrl: null,
  endedAt: null,
  durationSeconds: null,
  peakSeverity: null,
  closedReason: null,
  status: 'PENDENTE',
};

export const CAMERAS: Camera[] = [
  { id: 'CAM-01', nome: 'Esteira · frontal', estacaoId: 'EST-01', streamUrl: null },
  { id: 'CAM-02', nome: 'Prensa · lateral', estacaoId: 'EST-02', streamUrl: null },
  { id: 'CAM-03', nome: 'Expedição · alto', estacaoId: 'EST-03', streamUrl: null },
];

export const STATIONS: Station[] = [
  { id: 'EST-01', nome: 'Esteira de montagem', setor: 'montagem', ativa: true, cameras: [] },
  { id: 'EST-02', nome: 'Prensa hidráulica', setor: 'estamparia', ativa: true, cameras: [] },
  { id: 'EST-03', nome: 'Doca de expedição', setor: 'logística', ativa: true, cameras: [] },
];

export const INCIDENTS: Incident[] = [
  { ...MOLDE, id: 5, incidentKey: 'exemplo-5', cameraId: 'CAM-02', type: 'FALL_RISK',
    severity: 4, nivel: 'ALTO', descricao: 'Queda detectada', detectedAt: hoje('14:31'),
    reason: 'fallen_sustained', postureCategory: 'immediate_risk', rebaScore: 11,
    actionLevel: 4, peakSeverity: 4 },
  { ...MOLDE, id: 4, incidentKey: 'exemplo-4', cameraId: 'CAM-01', type: 'EPI_VIOLATION',
    severity: 3, nivel: 'ALTO', descricao: 'Capacete ausente', detectedAt: hoje('13:45'),
    epiMissing: ['HELMET'], epiPresent: ['VEST'], peakSeverity: 3 },
  { ...MOLDE, id: 3, incidentKey: 'exemplo-3', cameraId: 'CAM-03', type: 'ZONE_VIOLATION',
    severity: 2, nivel: 'MEDIO', descricao: 'Entrada em zona de risco',
    detectedAt: hoje('12:10'), zoneName: 'Zona 3 · empilhadeiras', zoneStatus: 'inside',
    status: 'REVISADO', peakSeverity: 2 },
  { ...MOLDE, id: 2, incidentKey: 'exemplo-2', cameraId: 'CAM-01', type: 'ERGONOMIC_RISK',
    severity: 1, nivel: 'BAIXO', descricao: 'Postura inadequada sustentada',
    detectedAt: hoje('10:22'), postureCategory: 'bent_over', rebaScore: 7,
    actionLevel: 2, durationSeconds: 42, endedAt: hoje('10:23'),
    closedReason: 'STATE_EXIT', status: 'RESOLVIDO', peakSeverity: 1 },
  { ...MOLDE, id: 1, incidentKey: 'exemplo-1', cameraId: 'CAM-02', type: 'EPI_VIOLATION',
    severity: 2, nivel: 'MEDIO', descricao: 'Luvas ausentes', detectedAt: hoje('08:05'),
    epiMissing: ['GLOVES'], status: 'RESOLVIDO', peakSeverity: 2 },
];

/** Calculado das fixtures, para os KPIs não contradizerem a lista de incidentes. */
export function resumo(): Summary {
  const estacaoDe = (cameraId: string) =>
    CAMERAS.find(c => c.id === cameraId)?.estacaoId ?? null;

  return {
    incidentesHoje: INCIDENTS.length,
    incidentesOntem: 4,
    criticosHoje: INCIDENTS.filter(i => i.severity >= 3).length,
    pendentes: INCIDENTS.filter(i => i.status === 'PENDENTE').length,
    heatmap: STATIONS.map(s => ({
      estacaoId: s.id,
      nome: s.nome,
      setor: s.setor,
      incidentes: INCIDENTS.filter(i => estacaoDe(i.cameraId) === s.id).length,
    })),
    ultimosSeteDias: Array.from({ length: 7 }, (_, k) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - k));
      const anteriores = [8, 5, 12, 4, 9, 3];
      return {
        dia: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        incidentes: k === 6 ? INCIDENTS.length : anteriores[k],
      };
    }),
  };
}
```

- [ ] **Step 4: Escrever o interceptor**

Criar `src/app/shared/mock/mock-api.interceptor.ts`:

```typescript
import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, delay, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CAMERAS, INCIDENTS, STATIONS, resumo } from './fixtures';

/** Atraso curto, para que os estados de carregamento sejam exercitados. */
const ATRASO_MS = 150;

/**
 * Responde os endpoints do painel a partir de fixtures, sem rede.
 *
 * Trocar o transporte em vez do serviço é o que mantém `IncidentService`,
 * componentes e templates idênticos nos dois modos: o modo de exemplo
 * exercita o código de verdade, inclusive deduplicação e limite em memória.
 */
export const mockApiInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const corpo = responder(req);
  if (corpo === undefined) {
    return next(req);
  }
  return of(new HttpResponse({ status: 200, body: corpo })).pipe(delay(ATRASO_MS));
};

function responder(req: HttpRequest<unknown>): unknown | undefined {
  const base = environment.apiUrl;

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

  if (req.method === 'GET' && req.url === `${base}/summary`) return resumo();
  if (req.method === 'GET' && req.url === `${base}/cameras`) return CAMERAS;
  if (req.method === 'GET' && req.url === `${base}/stations`) return STATIONS;

  const prefixo = `${base}/incidents/`;
  const sufixo = '/status';
  if (req.method === 'PUT' && req.url.startsWith(prefixo) && req.url.endsWith(sufixo)) {
    const id = Number(req.url.slice(prefixo.length, -sufixo.length));
    const alvo = INCIDENTS.find(i => i.id === id);
    return alvo ? { ...alvo, status: (req.body as { status: string }).status } : undefined;
  }

  return undefined;
}
```

- [ ] **Step 5: Escrever o `EventSource` falso**

Criar `src/app/shared/mock/mock-event-source.ts`:

```typescript
import { EventSourceLike } from '../event-source.factory';
import { Incident } from '../incident.models';
import { INCIDENTS, agoraNaPlanta } from './fixtures';

const INTERVALO_MS = 8000;

/**
 * EventSource falso.
 *
 * Emite um incidente novo de tempos em tempos para que o push por SSE seja
 * visível sem backend. Implementa o mesmo `EventSourceLike` que a Task 6
 * definiu, então nada muda no `IncidentService`.
 */
export class MockEventSource implements EventSourceLike {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private listeners = new Map<string, (event: MessageEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private contador = 0;

  constructor() {
    // No próximo tick: quem nos criou ainda está registrando os listeners.
    setTimeout(() => {
      this.onopen?.(new Event('open'));
      this.timer = setInterval(() => this.emitir(), INTERVALO_MS);
    });
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private emitir(): void {
    this.contador++;
    const molde = INCIDENTS[this.contador % INCIDENTS.length];
    const incidente: Incident = {
      ...molde,
      id: 1000 + this.contador,
      incidentKey: `exemplo-vivo-${this.contador}`,
      detectedAt: agoraNaPlanta(),
      status: 'PENDENTE',
    };
    this.listeners.get('incident')?.({ data: JSON.stringify(incidente) } as MessageEvent);
  }
}

export const mockEventSourceFactory = (): EventSourceLike => new MockEventSource();
```

- [ ] **Step 6: Ligar os dois no `app.config.ts`**

Substituir `src/app/app.config.ts`:

```typescript
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { EVENT_SOURCE_FACTORY } from './shared/event-source.factory';
import { mockApiInterceptor } from './shared/mock/mock-api.interceptor';
import { mockEventSourceFactory } from './shared/mock/mock-event-source';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors(environment.useMockData ? [mockApiInterceptor] : []),
    ),
    ...(environment.useMockData
      ? [{ provide: EVENT_SOURCE_FACTORY, useValue: mockEventSourceFactory }]
      : []),
  ],
};
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm test -- --watch=false
```

Esperado: PASSA, 4 testes novos, e **a suíte inteira continua verde**. Se alguma spec de componente começar a falhar mostrando "dados de exemplo", falta o `{ provide: USE_MOCK_DATA, useValue: false }` — o alvo de teste usa a configuração `development`, onde a flag é `true`.

- [ ] **Step 8: Conferir na mão**

```bash
cd /home/asaas/projects/challenge/cypher-front && npm start
```

Com `useMockData: true` em `environment.development.ts`, em `http://localhost:4200/dashboard`:

1. O badge de conexão diz **"dados de exemplo"**, em âmbar tracejado — não "ao vivo".
2. A lista de recentes traz os cinco incidentes de exemplo, com as horas do dia de hoje.
3. Um incidente novo aparece no topo a cada ~8 s, sem refresh.
4. Os KPIs batem com a lista: "Incidentes hoje" cresce junto.

- [ ] **Step 9: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/mock/ src/app/app.config.ts
git commit -m "feat: modo de dados de exemplo por interceptor e EventSource falso"
```

---

## Task 9: Vídeo ao vivo

**Files:**
- Create: `src/app/shared/live-feed/live-feed.component.ts`
- Create: `src/app/shared/live-feed/live-feed.component.spec.ts`

**Interfaces:**
- Consumes: `Camera` (Task 4), `CatalogService` (Task 7).
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

## Task 10: Dashboard sem dados fabricados

**Files:**
- Modify: `src/app/dashboard/dashboard.component.ts`
- Modify: `src/app/dashboard/dashboard.component.html`
- Create: `src/app/dashboard/dashboard.component.spec.ts`

**Interfaces:**
- Consumes: `IncidentService` (Tasks 5–7), `CatalogService` (Task 7), `ConnectionBadgeComponent` (Task 6), `LiveFeedComponent` (Task 9), `USE_MOCK_DATA` (Task 4).
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
import { USE_MOCK_DATA } from '../shared/mock/use-mock-data.token';
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
        // O alvo de teste usa a configuração development, onde useMockData é
        // true. Sem esta linha o badge diria "dados de exemplo".
        { provide: USE_MOCK_DATA, useValue: false },
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

## Task 11: Heatmap por estação

**Files:**
- Modify: `src/app/heatmap/heatmap.component.ts`
- Modify: `src/app/heatmap/heatmap.component.html`
- Create: `src/app/heatmap/heatmap.component.spec.ts`

**Interfaces:**
- Consumes: `IncidentService.summary` (Task 7), `CatalogService` (Task 7).
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

## Task 12: Verificação de ponta a ponta

**Files:**
- Modify: `src/environments/environment.development.ts`
- Create: `docs/e1c-verificacao.md`

**Interfaces:**
- Consumes: planos E1-A (Tasks 1–13) e E1-B (Tasks 1–8) concluídos.
- Produces: confirmação de que a funcionalidade vital funciona ponta a ponta.

- [ ] **Step 0: Desligar o modo de exemplo**

Até aqui `environment.development.ts` está com `useMockData: true`. A verificação é contra a API real, então:

```bash
cd /home/asaas/projects/challenge/cypher-front
sed -i 's/useMockData: true/useMockData: false/' src/environments/environment.development.ts
git add src/environments/environment.development.ts
git commit -m "chore: desliga o modo de dados de exemplo agora que a API responde"
```

Confirmar o resultado antes de seguir:

```bash
grep useMockData src/environments/environment.development.ts
```

Esperado: `useMockData: false,`.

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

Além disso, três coisas que não eram de E1 e ficaram resolvidas no caminho:

- **O tema tem um dono só.** `ThemeService` é o único que escreve no `<body>`, `cypher.theme` é a única fonte de verdade, e o toggle vive na topbar do dashboard — onde a pessoa já tentava clicar. A engrenagem faz o que o ícone diz.
- **Dá para rodar o front sem backend.** `useMockData` liga um interceptor e um `EventSource` falso; serviços e componentes não sabem a diferença. Quando está ligado, o badge diz "dados de exemplo" — dado fabricado nunca passa por real.
- **O app tem sistema tipográfico.** Cypher Sans declara, Inter Tight explica, JetBrains Mono mede. E os pesos 700/800 de mono, que eram sintetizados desde sempre, passam a ser os de verdade.

O que continua mockado e **precisa estar rotulado em tela como dado de exemplo**, se sobreviver: qualquer painel do onboarding que ainda use `OPTIONS` e `ROLE_PRESETS` fixos — esses são catálogo de EPIs, não dados operacionais, e viram cadastro real em E2.

Fica registrado como dívida conhecida, fora do escopo deste plano: `ConfigService` e `OnboardingService` ainda escrevem `--accent` cada um por conta própria. Hoje não produz bug, porque os `effect` só reagem às próprias fontes e o wizard não está montado no dashboard — mas é o mesmo padrão do problema do tema. Se o accent ganhar um controle fora do wizard, vira o mesmo trabalho da Task 2.

Próximo: E2 (cadastro de estações e câmeras, hardening de RTSP).
