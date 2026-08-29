# E6-B — Frontend: Relatórios e Exportação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Três ações de exportação (CSV de incidentes, CSV de placar, PDF de resumo), cada uma um link `<a href>` direto para o backend — sem código de download customizado (spec §2).

**Architecture:** Duas peças. **Tarefa 1 (link de CSV de incidentes) é independente de E5** — vive dentro de `IncidentTimelineComponent`, reaproveitando os filtros que a tela já mantém (`camera`/`severityMin`/`status`/`since`), em vez de duplicar esse estado numa tela nova (spec §2: "reaproveitando o estado de filtro já existente... em vez de duplicá-lo"). **Tarefa 2 (`RelatoriosComponent` em `/relatorios`, com CSV de placar e PDF de resumo) depende do plano `2026-08-29-e5a-backend-gamificacao.md` e do backend `2026-08-29-e6a-backend-relatorios.md` Tarefa 2** — ambos endpoints só existem depois de E5.

**Tech Stack:** Angular (standalone components, signals), Vitest.

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-relatorios-e6-design.md` (repo `cypher-front`), §2 (front).

**Repositório:** `/home/asaas/projects/challenge/cypher-front`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-front`. Branch: `feat/e6-front-relatorios`, a partir de `dev`.
- **Depende do plano `2026-08-29-e6a-backend-relatorios.md`** rodando localmente para teste manual (baixar e abrir o CSV/PDF de verdade); os specs automatizados só verificam a URL/query string montada — download em si não é testável em unit test (spec §4 "Angular").
- **Decisão de onde cada ação vive, tomada ao escrever este plano** (a spec §2 diz "reaproveitando o estado de filtro... em vez de duplicá-lo", sem apontar o componente exato): o link de CSV de incidentes fica **dentro de `IncidentTimelineComponent`** (Tarefa 1), ao lado dos filtros que já existem ali — não em `/relatorios`. A rota `/relatorios` (Tarefa 2) hospeda só as duas ações que não têm filtro de tela nenhum para reaproveitar (placar e resumo, cada uma com seu próprio seletor de período simples).
- **Download via `<a href>` direto, cookie `SameSite=Lax` já cobre a sessão cross-origin-mesmo-site** (spec §2, mesmo padrão de `LiveFeedComponent` com MJPEG) — nenhum `fetch`/blob/`(click)` customizado em nenhuma das duas tarefas.
- Run: `npx vitest run <arquivo>` para um arquivo; `npx vitest run` para a suíte inteira.

---

### Task 1: Exportar CSV de incidentes (independente de E5)

**Files:**
- Modify: `src/app/incidents/incident-timeline.component.ts`
- Modify: `src/app/incidents/incident-timeline.component.html`
- Test: `src/app/incidents/incident-timeline.component.spec.ts`

**Interfaces:**
- Produces: `IncidentTimelineComponent.urlExportacaoCsv` (computed) — link `href` do template

- [ ] **Step 1: Escrever o teste da URL de exportação**

Adicionar em `incident-timeline.component.spec.ts` (seguindo o padrão de montagem já usado pelos outros testes desta classe):

```typescript
  it('urlExportacaoCsv reflete os filtros atuais', () => {
    const fixture = montar(/* ...mesma fabrica de fixture ja usada nos outros testes... */);
    const comp = fixture.componentInstance;

    comp.camera.set('CAM-01');
    comp.severityMin.set(3);
    comp.status.set('PENDENTE');

    const url = new URL(comp.urlExportacaoCsv());
    expect(url.pathname).toBe('/api/v1/reports/incidents.csv');
    expect(url.searchParams.get('camera')).toBe('CAM-01');
    expect(url.searchParams.get('severityMin')).toBe('3');
    expect(url.searchParams.get('status')).toBe('PENDENTE');
  });

  it('urlExportacaoCsv omite parametros nao preenchidos', () => {
    const fixture = montar(/* ...mesma fabrica... */);
    const comp = fixture.componentInstance;

    const url = new URL(comp.urlExportacaoCsv());
    expect(url.searchParams.has('camera')).toBe(false);
    expect(url.searchParams.has('severityMin')).toBe(false);
    expect(url.searchParams.has('status')).toBe(false);
    expect(url.searchParams.has('since')).toBe(false);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/incidents/incident-timeline.component.spec.ts`
Expected: FAIL na compilação — `urlExportacaoCsv` não existe.

- [ ] **Step 3: Adicionar o computed ao componente**

Em `incident-timeline.component.ts`, importar `computed` (se ainda não importado) e `environment`, e adicionar:

```typescript
  readonly urlExportacaoCsv = computed(() => {
    const params = new URLSearchParams();
    if (this.camera()) params.set('camera', this.camera());
    if (this.severityMin() != null) params.set('severityMin', String(this.severityMin()));
    if (this.status()) params.set('status', this.status());
    if (this.since()) params.set('since', new Date(this.since()).toISOString());
    const query = params.toString();
    return `${environment.apiUrl}/reports/incidents.csv${query ? '?' + query : ''}`;
  });
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/incidents/incident-timeline.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Adicionar o link ao template**

Em `incident-timeline.component.html`, junto aos demais controles de filtro:

```html
<a class="btn ghost" [href]="urlExportacaoCsv()" target="_blank" rel="noopener">
  exportar CSV
</a>
```

- [ ] **Step 6: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/incidents/incident-timeline.component.ts src/app/incidents/incident-timeline.component.html
git commit -m "feat: adiciona exportar CSV a timeline de incidentes, reaproveitando os filtros da tela"
```

---

### Task 2: `RelatoriosComponent` — placar e resumo executivo

> **Pré-requisito:** `2026-08-29-e6a-backend-relatorios.md` Tarefa 2 implementada (`GET /api/v1/reports/placar.csv` e `.../summary.pdf` precisam existir). Não iniciar esta tarefa antes disso.

**Files:**
- Create: `src/app/relatorios/relatorios.component.ts`
- Create: `src/app/relatorios/relatorios.component.html`
- Test: `src/app/relatorios/relatorios.component.spec.ts`
- Modify: `src/app/app.routes.ts`

**Interfaces:**
- Produces: rota `/relatorios` → `RelatoriosComponent`, GESTOR-only

- [ ] **Step 1: Escrever o teste**

Criar `src/app/relatorios/relatorios.component.spec.ts`:

```typescript
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { RelatoriosComponent } from './relatorios.component';

describe('RelatoriosComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<RelatoriosComponent>>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(RelatoriosComponent);
    fixture.detectChanges();
  });

  it('urlPlacarCsv inclui o periodo selecionado', () => {
    const comp = fixture.componentInstance;
    comp.since.set('2026-08-01');
    comp.until.set('2026-08-08');

    const url = new URL(comp.urlPlacarCsv());
    expect(url.pathname).toBe('/api/v1/reports/placar.csv');
    expect(url.searchParams.get('since')).toContain('2026-08-01');
    expect(url.searchParams.get('until')).toContain('2026-08-08');
  });

  it('urlResumoPdf inclui o periodo selecionado', () => {
    const comp = fixture.componentInstance;
    comp.since.set('2026-08-01');
    comp.until.set('2026-08-08');

    const url = new URL(comp.urlResumoPdf());
    expect(url.pathname).toBe('/api/v1/reports/summary.pdf');
  });

  it('sem periodo selecionado, as urls nao incluem since/until', () => {
    const comp = fixture.componentInstance;

    const url = new URL(comp.urlPlacarCsv());
    expect(url.searchParams.has('since')).toBe(false);
    expect(url.searchParams.has('until')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/relatorios/relatorios.component.spec.ts`
Expected: FAIL na compilação — `RelatoriosComponent` não existe.

- [ ] **Step 3: Criar o componente**

Criar `src/app/relatorios/relatorios.component.ts`:

```typescript
import { Component, computed, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { DockComponent } from '../shared/dock/dock.component';

/**
 * Exportações de placar e resumo executivo (design doc de relatórios E6,
 * §2) — CSV de incidentes fica na própria timeline (design doc §2,
 * reaproveitando o filtro de lá); aqui só as duas ações sem tela de origem
 * com filtro próprio.
 */
@Component({
  selector: 'app-relatorios',
  imports: [ChromeTopbarComponent, DockComponent],
  templateUrl: './relatorios.component.html',
})
export class RelatoriosComponent {
  readonly since = signal('');
  readonly until = signal('');

  readonly urlPlacarCsv = computed(() => this.montarUrl('/reports/placar.csv'));
  readonly urlResumoPdf = computed(() => this.montarUrl('/reports/summary.pdf'));

  private montarUrl(caminho: string): string {
    const params = new URLSearchParams();
    if (this.since()) params.set('since', new Date(this.since()).toISOString());
    if (this.until()) params.set('until', new Date(this.until()).toISOString());
    const query = params.toString();
    return `${environment.apiUrl}${caminho}${query ? '?' + query : ''}`;
  }
}
```

Criar `src/app/relatorios/relatorios.component.html`:

```html
<app-chrome-topbar page="Relatórios" subtitle="Exportação" />

<main style="padding:40px 48px 120px;max-width:720px">
  <div class="panel">
    <div class="field">
      <label>De</label>
      <input class="input" type="date" [value]="since()" (input)="since.set($any($event.target).value)" />
    </div>
    <div class="field">
      <label>Até</label>
      <input class="input" type="date" [value]="until()" (input)="until.set($any($event.target).value)" />
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;margin-top:20px">
      <a class="btn" [href]="urlPlacarCsv()" target="_blank" rel="noopener">Exportar placar (CSV)</a>
      <a class="btn" [href]="urlResumoPdf()" target="_blank" rel="noopener">Exportar resumo executivo (PDF)</a>
    </div>
  </div>
</main>

<app-dock activeKey="relatorios" />
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/relatorios/relatorios.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Adicionar a rota**

Em `app.routes.ts`, importar `RelatoriosComponent` e adicionar:

```typescript
  { path: 'relatorios', component: RelatoriosComponent, canActivate: [canActivateGestor] },
```

- [ ] **Step 6: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/relatorios src/app/app.routes.ts
git commit -m "feat: adiciona RelatoriosComponent com exportacao de placar e resumo executivo"
```

---

## Self-Review

**Cobertura da spec:** §2 (rota `/relatorios`, três ações, download via `<a href>`) → Tarefas 1 e 2, com a divisão de onde cada ação vive explicitada em Global Constraints (decisão tomada ao escrever este plano, já que a spec não aponta o componente exato para o CSV de incidentes). §4 "Angular" (URL/query string testável, download em si não) → todos os testes verificam só a URL montada.

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** nenhum tipo novo introduzido — as duas tarefas só montam strings de URL a partir de signals já existentes (`camera`/`severityMin`/`status`/`since` da Tarefa 1) ou novos e simples (`since`/`until` da Tarefa 2).

---

**Plan complete and saved to `docs/superpowers/plans/e6-relatorios/2026-08-29-e6b-front-relatorios.md`.**

## Execution Handoff

Todos os planos desta rodada de E5/E6 estão prontos:

- `e5-gamificacao/2026-08-29-e5a-backend-gamificacao.md`, `e5b-capture-heartbeat.md`, `e5c-front-placar.md` — **bloqueados**, aguardando o pré-requisito da spec E5 §7.
- `e6-relatorios/2026-08-29-e6a-backend-relatorios.md` (Tarefa 1 liberada, Tarefa 2 depende de E5), `e6b-front-relatorios.md` (mesma divisão).

Nada aqui está pronto para execução imediata exceto a Tarefa 1 dos dois planos de E6 (CSV de incidentes, backend e front) — o resto aguarda o pré-requisito de E5. Duas opções, quando chegar a hora:

**1. Subagent-Driven (recomendado)** — dispatch de um subagente por tarefa, revisão entre tarefas, iteração rápida.

**2. Inline Execution** — execução em lote nesta sessão via `executing-plans`, com checkpoints para revisão.
