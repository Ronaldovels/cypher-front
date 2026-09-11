# Ajustes Visuais pós-review da SPI (avs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver os 6 achados de review da SPI que são puramente visuais/IA no `cypher-front` — restringir `--accent` a elementos interativos, dar cores binárias a Ativo/Inativo, reaproveitar a filterbar do Heatmap nos filtros de Incidentes, reforçar visualmente a segmentação por setor em "Ao Vivo", remover o link morto "Cadastrar" da dock, e reconciliar `.fb-select` com o `.select` global.

**Architecture:** Nenhum primitivo visual novo — só reconciliação e reforço do que já existe (`.select`, `.status`, `.filterbar`, cabeçalhos de seção). Sete tarefas, cada uma um recorte independente e testável: 3 tarefas de CSS/token puro, 2 de template+lógica leve, 1 de remoção de item morto, e uma revisão de design final cobrindo o resultado combinado.

**Tech Stack:** Angular standalone components + signals, Vitest + `TestBed`, SCSS.

**Spec:** `docs/superpowers/specs/planejadas/2026-09-10-ajustes-visuais-spi-design.md`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-front`. **Branch local (não worktree):** `git checkout -b feat/avs-front-ajustes-visuais` a partir de `dev`, dentro do próprio diretório do repo.
- **`--accent` (`#F4622A`) fica restrito a elementos interativos/marca** (botão primário, link, foco de input, navegação ativa, onboarding) — nenhuma task desta spec pode introduzir um novo uso decorativo de `--accent` fora disso.
- **Fora de escopo, não tocar:** `.notif-row.unread` (indicador funcional de não lido), qualquer CSS dentro de `src/app/onboarding/` (fluxo interativo, fora do achado da SPI), dado/navegação de "Ao Vivo" (só reforço visual).
- Run: `npx ng test --watch=false` para a suíte inteira; `npx ng test --watch=false --include='**/<arquivo>.spec.ts'` para um arquivo focado (confirmado funcionando antes da execução deste plano — `--include` é uma opção real do builder `@angular/build:unit-test`).
- Cor para o KPI "Críticos hoje": `#EE4242` (mesmo tier `ALTO`/crítico da escala de severidade já usada em `.alert-row.crit`) — valor fechado na spec, não é uma escolha da implementação.

---

### Task 1: Cores binárias para status Ativo/Inativo

**Files:**
- Modify: `src/styles.scss` (`.status.on` em `styles.scss:828`)
- Modify: `src/app/config/stations/stations-config.component.html:76`
- Modify: `src/app/config/equipe/equipes-config.component.html:66`
- Modify: `src/app/config/webhooks/webhooks-config.component.html:36`
- Test: `src/app/config/stations/stations-config.component.spec.ts`
- Test: `src/app/config/equipe/equipes-config.component.spec.ts`
- Test: `src/app/config/webhooks/webhooks-config.component.spec.ts`

**Interfaces:**
- Nenhuma nova — só adiciona o binding `[class.off]` ao lado do `[class.on]` já existente em cada um dos 3 templates, e as duas classes CSS `.status.on`/`.status.off`.

**Nota importante:** `webhook-historico.component.html:14` (`<span class="status" [class.on]="d.status === 'ENTREGUE'">`) também usa a classe `.status`, mas para um estado de 3 valores (ENTREGUE/FALHA/PENDENTE), não um binário ativo/inativo — **não adicionar `[class.off]` lá**. Como esse template nunca aplica `.off`, ele continua renderizando o estado "não entregue" em cinza neutro (`.status` sem modificador), sem mudança de comportamento.

- [ ] **Step 1: Escrever o teste (falhando) para `stations-config`**

Adicionar ao `stations-config.component.spec.ts`, junto dos outros testes de listagem (o helper `montar()` já existente no arquivo sempre flush uma lista vazia, então este teste monta o componente diretamente, seguindo o mesmo padrão do teste "cadastrar estacao mostra o token devolvido pelo backend" já existente no arquivo):

```typescript
  it('estação inativa mostra o status com a classe binária "off", não só neutra', () => {
    const fixture = TestBed.createComponent(StationsConfigComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/cameras`).forEach(r => r.flush([]));
    http.match(r => r.url === `${environment.apiUrl}/stations`).forEach(r => r.flush([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: false, cameras: [] },
    ]));
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('.status');
    expect(status.classList.contains('off')).toBe(true);
    expect(status.classList.contains('on')).toBe(false);
  });
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx ng test --watch=false --include='**/stations-config.component.spec.ts'`
Expected: FALHA — `classList.contains('off')` é `false` porque o template ainda não tem `[class.off]`.

- [ ] **Step 3: Adicionar `[class.off]` ao template de `stations-config`**

Em `stations-config.component.html:76`, trocar:
```html
<span class="status" [class.on]="e.ativa">{{ e.ativa ? 'ativa' : 'inativa' }}</span>
```
por:
```html
<span class="status" [class.on]="e.ativa" [class.off]="!e.ativa">{{ e.ativa ? 'ativa' : 'inativa' }}</span>
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `npx ng test --watch=false --include='**/stations-config.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Repetir o mesmo padrão para `equipes-config` e `webhooks-config`**

Escrever o teste equivalente em `equipes-config.component.spec.ts` (o helper `montar()` já existente sempre flush uma equipe com `ativa: true`, então este teste monta o componente diretamente para controlar o valor):

```typescript
  it('equipe inativa mostra o status com a classe binária "off"', () => {
    const fixture = TestBed.createComponent(EquipesConfigComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/teams`).flush([
      { id: 'EQ-01', nome: 'Equipe A', turno: 'MANHA', estacaoIds: [], ativa: false },
    ]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
    http.expectOne(`${environment.apiUrl}/stations`).flush([]);
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('.status');
    expect(status.classList.contains('off')).toBe(true);
  });
```

E em `webhooks-config.component.spec.ts` — o `beforeEach` deste arquivo já monta o componente e flush `/webhooks` com `[]`; para popular um assinante inativo, chame `WebhookService.load()` de novo (o mesmo método que o serviço usa internamente após criar/atualizar um assinante) e flush a segunda requisição:

```typescript
  it('webhook inativo mostra o status com a classe binária "off"', () => {
    TestBed.inject(WebhookService).load();
    http.expectOne(`${environment.apiUrl}/webhooks`).flush([
      { id: 1, url: 'https://x.test/hook', secret: 's', minSeverity: 3, ativo: false },
    ]);
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('.status');
    expect(status.classList.contains('off')).toBe(true);
  });
```

Adicionar o import `import { WebhookService } from '../../shared/webhook.service';` ao topo de `webhooks-config.component.spec.ts` se ainda não existir.

Rodar cada teste, confirmar que falha (`npx ng test --watch=false --include='**/equipes-config.component.spec.ts'`, depois `webhooks-config.component.spec.ts`), então aplicar a mesma mudança de template:

`equipes-config.component.html:66`:
```html
<span class="status" [class.on]="eq.ativa" [class.off]="!eq.ativa">{{ eq.ativa ? 'ativa' : 'inativa' }}</span>
```

`webhooks-config.component.html:36`:
```html
<span class="status" [class.on]="w.ativo" [class.off]="!w.ativo">{{ w.ativo ? 'ativo' : 'inativo' }}</span>
```

Rodar os dois testes de novo para confirmar que passam.

- [ ] **Step 6: Trocar a cor do CSS em `styles.scss`**

Em `styles.scss:828`, trocar:
```scss
.status.on { background:var(--accent-soft); border-color:var(--accent); color:var(--accent); }
```
por:
```scss
.status.on  { background: rgba(52,208,126,0.14); border-color: #34D07E; color: #34D07E; }
.status.off { background: rgba(238,66,66,0.14); border-color: #EE4242; color: #EE4242; }
```

- [ ] **Step 7: Rodar a suíte inteira**

Run: `npx ng test --watch=false`
Expected: PASS, nenhuma regressão (em especial nos 3 arquivos de config e em `webhook-historico.component.spec.ts`, que não deve ter sido tocado nem quebrado).

- [ ] **Step 8: Commit**

```bash
git add src/styles.scss \
        src/app/config/stations/stations-config.component.html \
        src/app/config/stations/stations-config.component.spec.ts \
        src/app/config/equipe/equipes-config.component.html \
        src/app/config/equipe/equipes-config.component.spec.ts \
        src/app/config/webhooks/webhooks-config.component.html \
        src/app/config/webhooks/webhooks-config.component.spec.ts
git commit -m "fix: cores binarias verde/vermelho para status ativo/inativo"
```

---

### Task 2: Remover destaque decorativo de `--accent` em KPIs, cards e CSS morto

**Files:**
- Modify: `src/app/dashboard/dashboard.component.html:56`
- Modify: `src/styles.scss` (linhas 376/380/381 — fallback de `.kpi`; linha 454-455 — `.ai-badge`; linhas 467-469 — `.insight`; linha 683 — `.temp-insight svg`)
- Test: `src/app/dashboard/dashboard.component.spec.ts`

**Interfaces:**
- Nenhuma nova. `--kpi-color` continua sendo a variável CSS que cada card de KPI já define inline — só o valor do card "Críticos hoje" e o fallback global mudam.

- [ ] **Step 1: Escrever o teste (falhando) para o KPI "Críticos hoje"**

Adicionar a `dashboard.component.spec.ts`, seguindo exatamente o mesmo padrão do teste "mostra os KPIs vindos do endpoint de agregados" já existente no arquivo:

```typescript
  it('KPI "Críticos hoje" usa a cor de severidade critica, nao a cor de marca', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 10, incidentesOntem: 4, criticosHoje: 3, pendentes: 2,
      heatmap: [], ultimosSeteDias: [],
    });
    fixture.detectChanges();

    const cards = Array.from(fixture.nativeElement.querySelectorAll('.kpi')) as HTMLElement[];
    const criticos = cards.find(c => c.textContent?.includes('Críticos hoje'));
    expect(criticos?.getAttribute('style')).toContain('--kpi-color: #EE4242');
  });
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx ng test --watch=false --include='**/dashboard.component.spec.ts'`
Expected: FALHA — o atributo `style` ainda contém `var(--accent)`, não `#EE4242`.

- [ ] **Step 3: Trocar a cor inline no template**

Em `dashboard.component.html:56`, trocar:
```html
<article class="kpi" style="--kpi-color: var(--accent)">
```
por:
```html
<article class="kpi" style="--kpi-color: #EE4242">
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `npx ng test --watch=false --include='**/dashboard.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Trocar o fallback decorativo em `styles.scss`**

Nas 3 ocorrências de `var(--kpi-color,var(--accent))` (linhas 376, 380, 381), trocar o fallback de `var(--accent)` para `var(--ink)` — isso é só o valor default para um KPI hipotético que esqueça de definir `--kpi-color`; hoje todos os 4 KPIs do Dashboard já definem a variável inline, então este fallback não é exercitado por nenhum teste existente, mas evita que um KPI futuro herde a cor de marca por acidente.

- [ ] **Step 6: Remover CSS morto — `.ai-badge` e `.insight`**

Confirmar antes de remover que nenhum template usa essas classes (já verificado na investigação da spec — nenhuma ocorrência em `src/app/`):

```bash
grep -rn "ai-badge\|class=\"insight\|class='insight" src/app/
```

Expected: nenhum resultado. Remover de `styles.scss`:
```scss
.ai-badge { display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); font-size:10px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:var(--accent); background:var(--accent-soft); border:1px solid color-mix(in srgb, var(--accent) 35%, transparent); border-radius:999px; padding:5px 10px; }
.ai-badge::before { content:''; width:6px; height:6px; border-radius:50%; background:var(--accent); box-shadow:0 0 8px var(--accent); }
```
e:
```scss
.insight { margin-top:22px; padding-top:18px; border-top:1px solid var(--line); display:flex; align-items:flex-start; gap:12px; font-size:13px; color:var(--ink-2); font-weight:500; letter-spacing:-0.005em; line-height:1.5; }
.insight .diam { color:var(--accent); font-size:12px; margin-top:4px; flex-shrink:0; }
.insight strong { color:var(--ink); font-weight:700; }
```

- [ ] **Step 7: Neutralizar o ícone de `.temp-insight` do Heatmap**

Em `styles.scss:683`, trocar:
```scss
.temp-insight svg { color:var(--accent); flex-shrink:0; }
```
por:
```scss
.temp-insight svg { color:var(--ink-2); flex-shrink:0; }
```
(mesma cor do texto ao lado, `.temp-insight { ... color:var(--ink-2); ... }` na linha anterior — o ícone deixa de chamar atenção sozinho.)

- [ ] **Step 8: Rodar a suíte inteira**

Run: `npx ng test --watch=false`
Expected: PASS, nenhuma regressão (em especial `heatmap.component.spec.ts`, que não deve quebrar por causa da mudança de cor do ícone).

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/dashboard.component.html \
        src/app/dashboard/dashboard.component.spec.ts \
        src/styles.scss
git commit -m "fix: kpi criticos hoje usa cor de severidade, remove ai-badge/insight mortos"
```

---

### Task 3: Remover o link morto "Cadastrar" da dock

**Files:**
- Modify: `src/app/shared/dock/dock.component.ts`
- Test: `src/app/shared/dock/dock.component.spec.ts`

**Interfaces:**
- Nenhuma nova. `items`/`ITEMS` continuam com a mesma forma (`DockItem | null`)[], só perdem uma entrada.

- [ ] **Step 1: Escrever o teste (falhando)**

Adicionar a `dock.component.spec.ts`, no mesmo describe dos outros testes:

```typescript
  it('nao tem mais o item morto "Cadastrar" (sem rota, nunca fez nada)', () => {
    const fixture = TestBed.createComponent(DockComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.items.find(i => i?.key === 'invite')).toBeUndefined();
  });
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx ng test --watch=false --include='**/dock.component.spec.ts'`
Expected: FALHA — o item `invite` ainda existe em `ITEMS`.

- [ ] **Step 3: Remover a entrada do array e o `@case` de ícone correspondente**

Em `dock.component.ts`, remover a linha 27 do array `ITEMS`:
```typescript
  { key: 'invite',    label: 'Cadastrar' },
```

E remover o bloco `@case ('invite')` inteiro do template de ícones (por volta da linha 145-149):
```html
        @case ('invite') {
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="10" cy="8" r="3.5"/><path d="M3 20c0-3.8 3-6.8 7-6.8"/>
            <path d="M18 14v6M15 17h6"/>
          </svg>
        }
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `npx ng test --watch=false --include='**/dock.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npx ng test --watch=false`
Expected: PASS, nenhuma regressão (nenhum outro teste em nenhuma outra tela deve depender do item `invite`).

- [ ] **Step 6: Commit**

```bash
git add src/app/shared/dock/dock.component.ts src/app/shared/dock/dock.component.spec.ts
git commit -m "fix: remove o link morto Cadastrar da dock"
```

---

### Task 4: Reconciliar `.fb-select` com o `.select` global

**Files:**
- Modify: `src/styles.scss:573` (`.fb-select`)

**Interfaces:**
- Nenhuma. Só muda os valores de cor/borda da classe já existente — nenhum template precisa mudar (Heatmap continua usando `class="fb-select"` do mesmo jeito).

**Nota:** esta task é pré-requisito da Task 5 (a filterbar de Incidentes vai reaproveitar `.fb-select` já reconciliado). Deve rodar antes dela.

- [ ] **Step 1: Ler os valores atuais de `.select` (o primitivo global) para copiar cor/borda**

```bash
grep -n "^\.input, \.select" src/styles.scss
```

Confirme os valores atuais (linha 92): `background:var(--surface); border:1px solid var(--line-2); color:var(--ink);` — estes são os tokens que `.fb-select` deve passar a usar, mantendo sua altura compacta (30px) e a seta customizada que o tornam uma variante, não uma cópia.

- [ ] **Step 2: Atualizar `.fb-select` em `styles.scss:573`**

Trocar:
```scss
.fb-select { display:inline-flex; align-items:center; height:30px; padding:0 30px 0 12px; border-radius:8px; background:var(--surface-2); border:1px solid var(--line-2); color:var(--ink-2); font-size:12px; font-weight:500; appearance:none; cursor:pointer; font-family:inherit; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2375787F' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 10px center; }
```
por:
```scss
.fb-select { display:inline-flex; align-items:center; height:30px; padding:0 30px 0 12px; border-radius:8px; background:var(--surface); border:1px solid var(--line-2); color:var(--ink); font-size:12px; font-weight:500; appearance:none; cursor:pointer; font-family:inherit; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2375787F' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 10px center; }
```
(a única mudança real é `background:var(--surface-2)` → `var(--surface)` e `color:var(--ink-2)` → `var(--ink)`, para herdar exatamente o par cor/fundo que `.select` usa — a altura de 30px e a seta customizada continuam, são o que justifica a variante existir.)

- [ ] **Step 3: Rodar a suíte inteira**

Run: `npx ng test --watch=false`
Expected: PASS — esta é uma mudança puramente visual, sem asserção de cor em nenhum teste existente (nenhum teste faz `getComputedStyle` neste projeto); a suíte deve passar sem nenhuma mudança de comportamento.

- [ ] **Step 4: Commit**

```bash
git add src/styles.scss
git commit -m "fix: fb-select herda cor/borda do select global, mantendo altura compacta"
```

---

### Task 5: Filtros de Incidentes usando o padrão filterbar

**Files:**
- Modify: `src/app/incidents/incident-timeline.component.html`
- Test: `src/app/incidents/incident-timeline.component.spec.ts`

**Interfaces:**
- Consumes: `.filterbar`/`.fb-label`/`.fb-sep` já existentes em `styles.scss` (usados hoje só pelo Heatmap); `.fb-select` já reconciliado pela Task 4.
- Nenhuma interface nova — os mesmos signals (`camera`, `severityMin`, `status`, `since`) e os mesmos métodos (`aplicarFiltros()`, `limparFiltros()`, `urlExportacaoCsv()`) continuam sendo usados, só a estrutura do HTML muda de um `.panel` com formulário vertical para uma `.filterbar` horizontal — nenhuma mudança de comportamento de filtro.

**Por que preservar o `<form (ngSubmit)>`:** o Heatmap aplica cada filtro imediatamente ao mudar o select (via `(ngModelChange)`), mas os filtros de Incidentes hoje exigem um clique em "Filtrar" antes de buscar — isso não é um detalhe estético, é o comportamento atual, e esta task só resolve a arquitetura de informação/layout (achado da SPI), não o modelo de interação. Por isso o `<form>`/`(ngSubmit)="aplicarFiltros()"`/botão "Filtrar" continuam existindo, só dentro do contêiner `.filterbar` em vez do `.panel` vertical.

- [ ] **Step 1: Escrever o teste (falhando) confirmando que o formulário de filtros usa o novo contêiner**

Adicionar a `incident-timeline.component.spec.ts`, reaproveitando o helper `montar()` já existente no arquivo:

```typescript
  it('filtros ficam dentro da filterbar, nao mais do panel vertical antigo', () => {
    const fixture = montar();

    const filterbar = fixture.nativeElement.querySelector('form.filterbar');
    expect(filterbar).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.tl-filters')).toBeNull();

    // os campos continuam existindo, com os mesmos ids
    expect(filterbar.querySelector('#tl-camera')).not.toBeNull();
    expect(filterbar.querySelector('#tl-severity')).not.toBeNull();
    expect(filterbar.querySelector('#tl-status')).not.toBeNull();
    expect(filterbar.querySelector('#tl-since')).not.toBeNull();
  });
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx ng test --watch=false --include='**/incident-timeline.component.spec.ts'`
Expected: FALHA — o template ainda usa `.tl-filters`/`.panel`, não `.filterbar`.

- [ ] **Step 3: Reescrever o bloco de filtros no template**

Em `incident-timeline.component.html`, trocar o bloco inteiro (linhas 5-50, do primeiro `<div class="panel">` até o `</div>` que fecha ele, ANTES do segundo `<div class="panel">` da lista de incidentes):

De:
```html
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
          <a class="btn ghost" [href]="urlExportacaoCsv()" target="_blank" rel="noopener">
            exportar CSV
          </a>
        </div>
      </form>
    </div>
```

Para:
```html
    <form class="filterbar" (ngSubmit)="aplicarFiltros()">
      <span class="fb-label">Câmera</span>
      <select id="tl-camera" class="fb-select" [(ngModel)]="camera" name="camera">
        <option value="">Todas</option>
        @for (cam of cameras(); track cam.id) {
          <option [value]="cam.id">{{ cam.nome }}</option>
        }
      </select>
      <div class="fb-sep"></div>
      <span class="fb-label">Severidade mínima</span>
      <select id="tl-severity" class="fb-select" [ngModel]="severityMin()"
              (ngModelChange)="severityMin.set($event === '' ? null : +$event)" name="severityMin">
        <option value="">Qualquer</option>
        @for (n of [1, 2, 3, 4]; track n) {
          <option [value]="n">{{ n }}+</option>
        }
      </select>
      <div class="fb-sep"></div>
      <span class="fb-label">Status</span>
      <select id="tl-status" class="fb-select" [(ngModel)]="status" name="status">
        <option value="">Todos</option>
        <option value="PENDENTE">Pendente</option>
        <option value="REVISADO">Revisado</option>
        <option value="RESOLVIDO">Resolvido</option>
      </select>
      <div class="fb-sep"></div>
      <span class="fb-label">A partir de</span>
      <input id="tl-since" class="input" type="datetime-local" [(ngModel)]="since" name="since"/>
      <div class="spacer"></div>
      <button type="submit" class="btn primary">Filtrar</button>
      <button type="button" class="btn ghost" (click)="limparFiltros()">Limpar</button>
      <a class="fb-export" [href]="urlExportacaoCsv()" target="_blank" rel="noopener">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 12l5 5 5-5M5 20h14"/></svg>
        exportar CSV
      </a>
    </form>
```

Note que o `<input id="tl-since" class="input" ...>` continua com `class="input"`, não `class="fb-select"` — `.fb-select` é só para `<select>` (a seta customizada não faz sentido num `datetime-local`). O ícone de exportação no `.fb-export` é o mesmo SVG já usado no botão de exportação do Heatmap (`heatmap.component.html:21`), reaproveitado por consistência.

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `npx ng test --watch=false --include='**/incident-timeline.component.spec.ts'`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npx ng test --watch=false`
Expected: PASS, nenhuma regressão — em particular, nenhum teste deve depender de `.tl-filters`/`.panel` envolvendo os filtros (a busca feita no início da Task 5 confirmou que nenhum teste existente faz essa asserção).

- [ ] **Step 6: Commit**

```bash
git add src/app/incidents/incident-timeline.component.html \
        src/app/incidents/incident-timeline.component.spec.ts
git commit -m "fix: filtros de incidentes reaproveitam a filterbar do heatmap"
```

---

### Task 6: "Ao Vivo" — reforço visual da segmentação por estação (agrupar por setor)

**Files:**
- Modify: `src/app/stations/stations-grid.component.ts`
- Modify: `src/app/stations/stations-grid.component.html`
- Modify: `src/styles.scss` (nova classe `.setor-heading`)
- Test: `src/app/stations/stations-grid.component.spec.ts`

**Interfaces:**
- Produces: `StationsGridComponent.grupos: Signal<{ setor: string | null; label: string; stations: Station[] }[]>` — computed a partir de `this.stations()`, consumido só pelo próprio template desta task.

**Ressalva (repetida da spec):** isto é reforço visual da segmentação que já existe (cada card já é uma estação com seu próprio feed) — não é uma feature de dado ou navegação nova. Se ao terminar esta task o resultado parecer insuficiente para o que a SPI pediu, pare e reporte como `DONE_WITH_CONCERNS` em vez de expandir o escopo.

- [ ] **Step 1: Escrever o teste (falhando) do agrupamento por setor**

Adicionar a `stations-grid.component.spec.ts`, junto dos outros testes (reaproveitar `montarCom` já existente no arquivo):

```typescript
  it('agrupa as estações por setor, com cabeçalho por grupo', () => {
    const fixture = montarCom([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] },
      { id: 'EST-02', nome: 'Prensa', setor: 'montagem', ativa: true, cameras: [] },
      { id: 'EST-03', nome: 'Expedição', setor: 'logistica', ativa: true, cameras: [] },
      { id: 'EST-04', nome: 'Doca', setor: null, ativa: true, cameras: [] },
    ]);

    const cabecalhos = Array.from(fixture.nativeElement.querySelectorAll('.setor-heading'))
      .map((h: any) => h.textContent.trim());
    expect(cabecalhos).toEqual(['montagem', 'logistica', 'Sem setor']);

    const grupos = fixture.componentInstance.grupos();
    expect(grupos.find(g => g.setor === 'montagem')?.stations.length).toBe(2);
    expect(grupos.find(g => g.setor === null)?.stations.length).toBe(1);
  });
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx ng test --watch=false --include='**/stations-grid.component.spec.ts'`
Expected: FALHA — `grupos` não existe no componente ainda, e não há `.setor-heading` no template.

- [ ] **Step 3: Adicionar o computed `grupos` ao componente**

Em `stations-grid.component.ts`, adicionar o import de `computed` e o novo membro:

```typescript
import { Component, OnInit, computed, inject } from '@angular/core';
```

```typescript
  /** Agrupa as estações por setor para reforçar visualmente a segmentação já existente
   *  (cada card já é uma estação — isto só organiza a grid em seções, sem mudar dado
   *  nem navegação). Setores em ordem de primeira aparição; sem setor vai por último. */
  readonly grupos = computed(() => {
    const porSetor = new Map<string | null, Station[]>();
    for (const station of this.stations()) {
      const chave = station.setor;
      if (!porSetor.has(chave)) porSetor.set(chave, []);
      porSetor.get(chave)!.push(station);
    }
    const comSetor = [...porSetor.entries()].filter(([setor]) => setor !== null);
    const semSetor = porSetor.get(null);
    const grupos = comSetor.map(([setor, stations]) => ({ setor, label: setor as string, stations }));
    if (semSetor?.length) {
      grupos.push({ setor: null, label: 'Sem setor', stations: semSetor });
    }
    return grupos;
  });
```

- [ ] **Step 4: Reescrever o template para renderizar por grupo**

Em `stations-grid.component.html`, trocar:
```html
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
```
por:
```html
    @for (grupo of grupos(); track grupo.label) {
      <h2 class="setor-heading">{{ grupo.label }}</h2>
      <div class="stations-grid">
        @for (station of grupo.stations; track station.id) {
          <a class="panel station-card" [routerLink]="['/estacao', station.id]">
            <div class="panel-head">
              <div class="ph-left">
                <span class="ph-title">{{ station.nome }}</span>
              </div>
            </div>
            <div class="station-feed">
              <app-live-feed [camera]="primeiraCamera(station)" />
            </div>
            <span class="station-cam-count">{{ station.cameras.length }} câmera{{ station.cameras.length === 1 ? '' : 's' }}</span>
          </a>
        }
      </div>
    } @empty {
      <div class="panel"><div class="vazio">nenhuma estação cadastrada</div></div>
    }
```

Note que o `<span class="ph-meta">{{ station.setor }}</span>` que existia dentro de cada card foi removido — o setor agora aparece uma vez só, no cabeçalho do grupo, em vez de repetido em cada card do mesmo grupo (essa era a duplicação que fazia a segmentação existir só "por baixo", sem reforço visual).

- [ ] **Step 5: Adicionar a classe `.setor-heading` a `styles.scss`**

Perto de `.stations-grid` (`styles.scss:775`):
```scss
.setor-heading { font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink-mute); margin:24px 0 12px; }
.setor-heading:first-child { margin-top:0; }
```

- [ ] **Step 6: Rodar o teste para confirmar que passa**

Run: `npx ng test --watch=false --include='**/stations-grid.component.spec.ts'`
Expected: PASS — incluindo os testes já existentes (o `@empty` continua funcionando para a lista vazia, e o teste "estação sem câmera" e "link do card leva ao kiosk" continuam válidos porque a estrutura do card em si não mudou, só o agrupamento ao redor).

- [ ] **Step 7: Rodar a suíte inteira**

Run: `npx ng test --watch=false`
Expected: PASS, nenhuma regressão.

- [ ] **Step 8: Commit**

```bash
git add src/app/stations/stations-grid.component.ts \
        src/app/stations/stations-grid.component.html \
        src/app/stations/stations-grid.component.spec.ts \
        src/styles.scss
git commit -m "fix: agrupa a grade de estacoes por setor, reforcando a segmentacao"
```

---

### Task 7: Revisão de design final (skill `frontend-design`)

**Files:**
- Modify (se a revisão encontrar ajustes): qualquer arquivo tocado pelas Tasks 1-6.

**Interfaces:**
- Consumes: o resultado combinado das Tasks 1-6.

- [ ] **Step 1: Rodar a aplicação localmente (se houver ambiente disponível) ou revisar por código/tokens**

Se um navegador/ferramenta de screenshot estiver disponível no ambiente de execução, suba `npx ng serve` e veja as 4 telas tocadas (Dashboard, Incidentes, Ao Vivo, e uma tela de config com o status ativo/inativo) nos dois temas (claro/escuro). Se não houver navegador disponível, faça uma revisão por leitura de código/tokens (mesmo padrão já usado nas revisões de `hfb`/`cnb`) — nunca simule ter visto uma tela que não foi vista.

- [ ] **Step 2: Invocar a skill `frontend-design` para revisar o conjunto**

Peça uma revisão cobrindo especificamente:
- Contraste de `.status.on`/`.status.off` (verde/vermelho novos) nos dois temas — os valores de fundo (`rgba(52,208,126,0.14)`/`rgba(238,66,66,0.14)`) foram copiados do padrão já usado em `--accent-soft`, mas nunca testados contra `--surface`/`--surface-2` dos dois temas.
- Se o KPI "Críticos hoje" (`#EE4242`) ficar visualmente idêntico ao KPI "Incidentes hoje" a ponto de confundir os dois — a spec aceitou essa coincidência como coerente com a escala de severidade, mas vale checar se algum outro elemento (ícone, label) já diferencia os dois o suficiente.
- Se a nova `.filterbar` de Incidentes (Task 5) tem campos demais para a largura de uma linha em telas menores — o Heatmap tem 3 grupos de filtro, Incidentes tem 4 campos + 3 ações.
- Se `.setor-heading` (Task 6) se encaixa visualmente com o resto da hierarquia de texto da tela "Ao Vivo" nos dois temas.

- [ ] **Step 3: Aplicar os ajustes encontrados**

Para cada ajuste, editar o arquivo apontado pela skill e rodar `npx ng test --watch=false` depois de cada mudança, confirmando que nenhum teste quebrou.

- [ ] **Step 4: Commit**

Mesmo que a revisão não encontre nenhum ajuste, registrar isso explicitamente — "sem achados" é um resultado válido (mesmo padrão já usado nas entregas `e6b`/`hfb`/`cnb`):

```bash
git add -A
git commit -m "fix: revisao de design dos ajustes visuais pos-spi (frontend-design)"
```

Se não houver nenhuma mudança de arquivo, criar um commit vazio documentando a revisão:

```bash
git commit --allow-empty -m "chore: revisao de design dos ajustes visuais pos-spi (frontend-design) - sem achados"
```

---

## Self-Review

**Cobertura da spec:** item 1 (cores binárias) → Task 1. Item 2 (remover destaque "IA" de cards/alertas) → Task 2. Item 3 (Ao Vivo segmentar por estação) → Task 6. Item 4 (filtros de Incidentes IA/layout) → Task 5. Item 5 (remover link Cadastrar) → Task 3. Item 6 (inputs/selects seguindo style guide) → Task 4 (e a nota de reconciliação dentro da Task 5). Cor do KPI Críticos hoje (`#EE4242`, fechada na spec) → Task 2, Step 3.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todo step tem código completo, incluindo os testes.

**Type consistency:** `StationsGridComponent.grupos` retorna `{ setor: string | null; label: string; stations: Station[] }[]` na Task 6, consumido pelo template criado na mesma task com os mesmos nomes de campo (`grupo.label`, `grupo.stations`). Nenhuma outra task introduz um tipo/interface novo compartilhado entre tasks.

## Execution Handoff

Plano completo e salvo em `docs/superpowers/plans/ajustes-visuais-spi/2026-09-10-avs-front-ajustes-visuais.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — dispatch de um subagente por tarefa, revisão entre tarefas, iteração rápida.

**2. Inline Execution** — execução em lote nesta sessão via `executing-plans`, com checkpoints de revisão.

Qual abordagem?
