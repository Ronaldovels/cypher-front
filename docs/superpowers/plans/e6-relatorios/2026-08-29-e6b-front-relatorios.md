# E6-B — Frontend: Relatórios e Exportação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Três ações de exportação (CSV de incidentes, CSV de placar, PDF de resumo), cada uma um link `<a href>` direto para o backend — sem código de download customizado (spec §2), sem rota nova (spec §9).

**Architecture:** Três tarefas, todas liberadas e sem ordem de dependência entre si. **Tarefa 1** (link de CSV de incidentes) vive dentro de `IncidentTimelineComponent`, reaproveitando os filtros que a tela já mantém (`camera`/`severityMin`/`status`/`since`). **Tarefa 2** (PDF de resumo) liga um botão que **já existe** em `HeatmapComponent` — "Exportar PDF", hoje decorativo — reaproveitando o `period()` que também já existe ali (spec §9: a revisão de design achou essa UI depois que a primeira versão da spec desenhou uma rota `/relatorios` nova sem saber que ela já existia). **Tarefa 3** (CSV de placar) é um link simples no cabeçalho do painel de `PlacarComponent` (`/placar`, já existe desde a E5), sem seletor de período. Nenhuma das três depende de contrato de resposta do backend `2026-08-29-e6a-backend-relatorios.md` — todas só montam strings de URL — então podem rodar em paralelo à execução do `e6a` (só o teste manual ponta a ponta, baixando o arquivo de verdade, precisa do backend rodando).

**Tech Stack:** Angular (standalone components, signals), Vitest.

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-relatorios-e6-design.md` (repo `cypher-front`), §2 (front) e §9 (reconciliação de UI, 2026-09-08).

**Repositório:** `/home/asaas/projects/challenge/cypher-front`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-front`. Branch: `feat/e6-front-relatorios`, a partir de `dev`.
- **Depende do plano `2026-08-29-e6a-backend-relatorios.md`** rodando localmente para teste manual (baixar e abrir o CSV/PDF de verdade); os specs automatizados só verificam a URL/query string montada — download em si não é testável em unit test (spec §4 "Angular").
- **Sem rota `/relatorios`, sem componente novo, sem item de dock novo** (spec §9) — decisão revisada em 2026-09-08 depois que a revisão de design achou que o Heatmap já tem o botão "Exportar PDF" (`.fb-export`, hoje sem `href`/handler) e um seletor de período (`period()` — `hoje`/`7d`/`30d`/`90d`/`custom`) ao lado dele, nenhum dos dois ligado a nada real. A versão anterior deste plano criava `RelatoriosComponent`/rota `/relatorios`/`DockItem` — descartada em favor de ligar o que já existe.
- **`period()`/`shift()` do Heatmap são decorativos desde antes da E6** (só `celulas()`/`top5()` são ligados a dado real) — esta entrega só passa a consumir o valor de `period()` para montar a URL do PDF; não torna o resto da barra de filtros funcional, isso é fora de escopo (spec §5).
- **`custom` não tem UI de intervalo por trás** (é só um rótulo de chip, nunca teve date-range picker) — ao selecionar `custom`, a Tarefa 2 omite `since`, caindo no default do backend (últimos 7 dias). Não é uma regressão: `custom` já não filtrava nada antes desta entrega.
- **Download via `<a href>` direto, cookie `SameSite=Lax` já cobre a sessão cross-origin-mesmo-site** (spec §2, mesmo padrão de `LiveFeedComponent` com MJPEG) — nenhum `fetch`/blob/`(click)` customizado em nenhuma das três tarefas.
- **`environment.apiUrl` é `/api/v1` (caminho relativo)** — funciona bem num `<a href>` real (o browser resolve contra a origem atual), mas `new URL(url)` sem um segundo argumento (`base`) lança `Invalid URL` para caminho relativo (confirmado com `node -e "new URL('/api/v1/x')"`, achado da revisão de design de 2026-09-08). Todo teste que faz `new URL(comp.algumaUrl())` precisa passar uma base, ex.: `new URL(comp.urlExportacaoCsv(), 'http://localhost')` — não é uma mudança no componente, só nos testes.
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

    // environment.apiUrl e relativo ('/api/v1') -- new URL() sem base lanca
    // Invalid URL; a base so ancora a resolucao no teste, o href real do link
    // continua relativo (achado da revisao de design, 2026-09-08).
    const url = new URL(comp.urlExportacaoCsv(), 'http://localhost');
    expect(url.pathname).toBe('/api/v1/reports/incidents.csv');
    expect(url.searchParams.get('camera')).toBe('CAM-01');
    expect(url.searchParams.get('severityMin')).toBe('3');
    expect(url.searchParams.get('status')).toBe('PENDENTE');
  });

  it('urlExportacaoCsv omite parametros nao preenchidos', () => {
    const fixture = montar(/* ...mesma fabrica... */);
    const comp = fixture.componentInstance;

    const url = new URL(comp.urlExportacaoCsv(), 'http://localhost');
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

### Task 2: PDF de resumo executivo — liga o botão que já existe no Heatmap

> **Pré-requisito:** `2026-08-29-e6a-backend-relatorios.md` Tarefa 2 implementada (`GET /api/v1/reports/summary.pdf` precisa existir e responder 200 para teste manual ponta a ponta) — o spec automatizado desta tarefa não faz request real, pode ser escrito/rodado mesmo antes do backend.

**Files:**
- Modify: `src/app/heatmap/heatmap.component.ts`
- Modify: `src/app/heatmap/heatmap.component.html`
- Test: `src/app/heatmap/heatmap.component.spec.ts`

**Interfaces:**
- Produces: `HeatmapComponent.urlResumoPdf` (computed) — link `href` do botão "Exportar PDF" já existente no template
- Produces: `inicioDoPeriodo(period, agora)` — função pura exportada, separada do computed para ser testável sem mockar relógio

- [ ] **Step 1: Escrever os testes**

Adicionar em `heatmap.component.spec.ts` (seguindo o padrão de montagem já usado pelos outros testes desta classe):

```typescript
import { inicioDoPeriodo } from './heatmap.component';

// ...

describe('inicioDoPeriodo', () => {
  const agora = new Date('2026-09-08T15:00:00.000Z');

  it('hoje volta para 00:00 do dia corrente', () => {
    const inicio = inicioDoPeriodo('hoje', agora);
    expect(inicio?.toISOString().slice(0, 10)).toBe('2026-09-08');
  });

  it('7d/30d/90d voltam N dias a partir de agora', () => {
    expect(inicioDoPeriodo('7d', agora)?.getTime()).toBe(agora.getTime() - 7 * 86400000);
    expect(inicioDoPeriodo('30d', agora)?.getTime()).toBe(agora.getTime() - 30 * 86400000);
    expect(inicioDoPeriodo('90d', agora)?.getTime()).toBe(agora.getTime() - 90 * 86400000);
  });

  it('custom nao tem intervalo por tras — retorna null (cai no default do backend)', () => {
    expect(inicioDoPeriodo('custom', agora)).toBeNull();
  });
});

// dentro do describe('HeatmapComponent', ...) existente:
  it('urlResumoPdf usa o periodo selecionado', () => {
    const fixture = montar(/* ...mesma fabrica ja usada nos outros testes... */);
    const comp = fixture.componentInstance;

    comp.setPeriod('30d');
    const url = new URL(comp.urlResumoPdf(), 'http://localhost');
    expect(url.pathname).toBe('/api/v1/reports/summary.pdf');
    expect(url.searchParams.has('since')).toBe(true);
  });

  it('urlResumoPdf omite since quando o periodo e custom', () => {
    const fixture = montar(/* ...mesma fabrica... */);
    const comp = fixture.componentInstance;

    comp.setPeriod('custom');
    const url = new URL(comp.urlResumoPdf(), 'http://localhost');
    expect(url.searchParams.has('since')).toBe(false);
  });
```

(`montar(...)` é a mesma fábrica de fixture que os testes existentes de `HeatmapComponent` já usam para os mocks de `AuthService`/`ConfigService`/`IncidentService`/`CatalogService` — seguir o padrão do arquivo, não recriar.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/heatmap/heatmap.component.spec.ts`
Expected: FAIL na compilação — `inicioDoPeriodo`/`urlResumoPdf` não existem.

- [ ] **Step 3: Adicionar a função pura e o computed ao componente**

Em `heatmap.component.ts`, importar `computed` (se ainda não importado) e `environment`, e adicionar, fora da classe (função pura, testável sem mockar relógio):

```typescript
/**
 * Mapeia o chip de período (decorativo até esta entrega) para o `since` da
 * URL de exportação do PDF. `custom` nunca teve um seletor de intervalo por
 * trás — é só um rótulo — então retorna `null` e a URL final omite `since`,
 * caindo no default do backend (últimos 7 dias). Spec E6 §9.
 */
export function inicioDoPeriodo(period: string, agora: Date): Date | null {
  switch (period) {
    case 'hoje': {
      const inicio = new Date(agora);
      inicio.setHours(0, 0, 0, 0);
      return inicio;
    }
    case '7d': return new Date(agora.getTime() - 7 * 86400000);
    case '30d': return new Date(agora.getTime() - 30 * 86400000);
    case '90d': return new Date(agora.getTime() - 90 * 86400000);
    default: return null;
  }
}
```

E, dentro da classe `HeatmapComponent`:

```typescript
  readonly urlResumoPdf = computed(() => {
    const inicio = inicioDoPeriodo(this.period(), new Date());
    const params = new URLSearchParams();
    if (inicio) params.set('since', inicio.toISOString());
    const query = params.toString();
    return `${environment.apiUrl}/reports/summary.pdf${query ? '?' + query : ''}`;
  });
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/heatmap/heatmap.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Ligar o botão já existente no template**

Em `heatmap.component.html`, o botão já existe (decorativo) — trocar `<button class="fb-export">` por `<a class="fb-export">` com o `href` (a classe `.fb-export` já estiliza qualquer elemento inline-flex, não é específica de `<button>` — confirmado em `src/styles.scss`):

```html
<a class="fb-export" [href]="urlResumoPdf()" target="_blank" rel="noopener">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 12l5 5 5-5M5 20h14"/></svg>
  Exportar PDF
</a>
```

- [ ] **Step 6: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/heatmap/heatmap.component.ts src/app/heatmap/heatmap.component.html
git commit -m "feat: liga exportar PDF de resumo executivo ao botao existente do heatmap"
```

---

### Task 3: Exportar CSV de placar — link em `/placar`

> **Pré-requisito:** `2026-08-29-e6a-backend-relatorios.md` Tarefa 2 implementada (`GET /api/v1/reports/placar.csv` precisa existir e responder 200 para teste manual ponta a ponta) — o spec automatizado desta tarefa não faz request real, pode ser escrito/rodado mesmo antes do backend.

**Files:**
- Modify: `src/app/placar/placar.component.ts`
- Modify: `src/app/placar/placar.component.html`
- Test: `src/app/placar/placar.component.spec.ts`

**Interfaces:**
- Produces: `PlacarComponent.urlPlacarCsv` (propriedade simples, não signal — a URL não tem parâmetro nenhum, spec §2: sem seletor de período nesta tela)

- [ ] **Step 1: Escrever o teste**

Adicionar em `placar.component.spec.ts` (seguindo o padrão de montagem já usado pelos outros testes desta classe):

```typescript
  it('urlPlacarCsv aponta para o endpoint de exportacao, sem parametro de periodo', () => {
    const fixture = montar(/* ...mesma fabrica ja usada nos outros testes... */);
    const comp = fixture.componentInstance;

    expect(comp.urlPlacarCsv).toBe('/api/v1/reports/placar.csv');
  });
```

(`environment.apiUrl` é `/api/v1` — a comparação é direta com `toBe`, sem precisar de `new URL()`/base: não há query string pra montar.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/placar/placar.component.spec.ts`
Expected: FAIL na compilação — `urlPlacarCsv` não existe.

- [ ] **Step 3: Adicionar a propriedade ao componente**

Em `placar.component.ts`, importar `environment` e adicionar à classe:

```typescript
  readonly urlPlacarCsv = `${environment.apiUrl}/reports/placar.csv`;
```

(Sem `since`/`until`: o backend usa o default de últimos 7 dias — spec §2, mesma janela que o resto da tela já assume implicitamente. Sem período pra selecionar, não há estado pra tornar um `computed`.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/placar/placar.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Adicionar o link ao cabeçalho do painel**

Em `placar.component.html`, no `panel-head` já existente:

```html
    <div class="panel-head">
      <div class="ph-left">
        <span class="ph-title">Equipes por melhora na semana</span>
        <span class="ph-meta">a ordem vem do backend — melhora de conformidade, não valor absoluto</span>
      </div>
      <div class="ph-right">
        <a class="btn ghost" [href]="urlPlacarCsv" target="_blank" rel="noopener">exportar CSV</a>
      </div>
    </div>
```

- [ ] **Step 6: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/placar/placar.component.ts src/app/placar/placar.component.html
git commit -m "feat: adiciona exportar CSV do placar ao cabecalho do painel"
```

---

## Self-Review

**Cobertura da spec:** §2 (três ações, download via `<a href>`, sem rota nova) → Tarefas 1–3, cada uma na tela que já mostra o dado equivalente. §9 (reconciliação de UI: botão do Heatmap, período decorativo, `custom` sem intervalo) → Tarefa 2 por inteiro. §4 "Angular" (URL/query string testável, download em si não) → todos os testes verificam só a URL montada.

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** nenhum tipo novo introduzido — as três tarefas só montam strings de URL a partir de signals já existentes (`camera`/`severityMin`/`status`/`since` da Tarefa 1, `period()` da Tarefa 2) ou uma constante simples sem estado (Tarefa 3). `inicioDoPeriodo` é uma função pura nova, exportada para ser testável sem mockar relógio.

**Revisão de design (2026-09-08):** duas rodadas. Primeira (spec §8) corrigiu `new URL()` sem base nos testes (`environment.apiUrl` é relativo). Segunda (spec §9), depois que o usuário perguntou sobre um botão "Exportar PDF" já visível no Heatmap: a Tarefa 2 original deste plano (`RelatoriosComponent`, rota `/relatorios`, `DockItem`) foi **descartada por inteiro** e substituída pelas Tarefas 2 e 3 atuais — liga o botão que já existe no Heatmap e adiciona um link simples em `/placar`. Resultado: nenhuma rota nova, nenhum item de dock novo, zero estado de filtro duplicado.

---

**Plan complete and saved to `docs/superpowers/plans/e6-relatorios/2026-08-29-e6b-front-relatorios.md`.**

## Execution Handoff

**Atualizado em 2026-09-08 (duas revisões no mesmo dia):** E5 (`e5a`/`e5b`/`e5c`) mergeada em 2026-09-08 — ver `docs/scrum/sprint-3/cerimonias.md` §3.11. Os dois planos de E6 estão **totalmente liberados**:

- `e6-relatorios/2026-08-29-e6a-backend-relatorios.md` — Tarefa 1 e Tarefa 2 liberadas (Tarefa 2 ganhou a seção de série de 7 dias no PDF, restaurada na revisão de §9).
- `e6b-front-relatorios.md` (este arquivo) — **reestruturado de 2 para 3 tarefas** na revisão de §9: Tarefa 1 inalterada (CSV de incidentes na timeline); Tarefa 2 antiga (`RelatoriosComponent`/rota/dock) foi **removida** e virou a nova Tarefa 2 (ligar o botão já existente no Heatmap); Tarefa 3 é nova (CSV de placar em `/placar`). As três não dependem de contrato de resposta do backend — podem rodar em paralelo à execução do `e6a` e entre si.

Duas revisões de design pré-execução em 2026-09-08: a primeira (spec §8) corrigiu bugs encontrados comparando os planos com o estado real do código; a segunda (spec §9) reconciliou a spec com uma tela existente que a primeira versão do documento não tinha mapeado, eliminando a rota `/relatorios` do escopo. Opções para a execução:

**1. Subagent-Driven (recomendado)** — dispatch de um subagente por tarefa, revisão entre tarefas, iteração rápida.

**2. Inline Execution** — execução em lote nesta sessão via `executing-plans`, com checkpoints para revisão.
