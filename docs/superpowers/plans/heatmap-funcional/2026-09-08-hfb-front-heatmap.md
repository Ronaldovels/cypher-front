# HF-B — Frontend: Heatmap funcional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `HeatmapComponent` ganha filtros reais (Setor/EPI/Turno/Período), ordenação real (ranking/nome/zona), e os dois painéis fabricados (Temporal, Anual) passam a consumir os campos novos de `GET /summary`.

**Architecture:** Cinco fatias. Tarefa 1 é plumbing puro (tipos + `IncidentService.loadSummary` aceitando filtros opcionais, sem UI) — pré-requisito de todo o resto. Tarefas 2–5 mexem só em `HeatmapComponent`/seu template, cada uma independente das outras depois da 1.

**Tech Stack:** Angular (standalone components, signals), `FormsModule` (`[(ngModel)]`, mesmo padrão de `IncidentTimelineComponent`), Vitest.

**Spec:** `docs/superpowers/specs/planejadas/2026-09-08-heatmap-funcional-design.md` (repo `cypher-front`), §2 (front).

**Repositório:** `/home/asaas/projects/challenge/cypher-front`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-front`. **Sem branch de feature dedicada** — trabalho direto em `dev` (decisão do usuário para esta entrega).
- **Depende do plano `2026-09-08-hfa-backend-heatmap.md`** rodando localmente para teste manual — os specs automatizados usam `HttpTestingController` (mock de rede), então podem ser escritos/rodados mesmo antes do backend.
- **`IncidentService.loadSummary()` sem argumento continua funcionando exatamente como hoje** — Dashboard (`dashboard.component.ts:83`) e o refresh interno por SSE (`incident.service.ts:61`) chamam sem filtro nenhum; `HttpParams` vazio não anexa `?` à URL, então o teste existente (`carrega os agregados do dashboard`, `incident.service.spec.ts:168`) não muda.
- **`[(ngModel)]` direto em signal** — mesmo padrão já usado em `camera`/`status` de `IncidentTimelineComponent` (`incident-timeline.component.html:12,31`); `severityMin` usa a forma separada (`[ngModel]`/`(ngModelChange)`) só porque precisa converter string→number. `setor`/`epi` são strings simples, então usam a forma direta.
- **EPI só mostra os 4 valores que o backend mapeia** (`capacete`, `oculos`, `luvas`, `botas` — spec §1.4/§2) — os outros quatro de `EPI_LIST` (`colete`, `mascara`, `auricular`, `cinto`) ficam fora do `<select>` até o `cypher-capture` detectar essas violações.
- Run: `npx vitest run <arquivo>` para um arquivo; `npx vitest run` para a suíte inteira.

---

### Task 1: Plumbing — tipos novos e `IncidentService.loadSummary(filtros?)`

**Files:**
- Modify: `src/app/shared/incident.models.ts`
- Modify: `src/app/shared/incident.service.ts`
- Test: `src/app/shared/incident.service.spec.ts`

**Interfaces:**
- Produces: `TemporalCell { diaSemana: number; faixa2h: number; incidentes: number }`, `SummaryFiltros { since?: string; until?: string; turno?: string; setor?: string; epi?: string; detalhado?: boolean }` (ambos em `incident.models.ts`)
- Produces: `Summary.distribuicaoTemporal: TemporalCell[] | null`, `Summary.historicoAnual: DayCount[] | null`
- Produces: `IncidentService.loadSummary(filtros?: SummaryFiltros): void`

- [ ] **Step 1: Escrever o teste**

Adicionar em `incident.service.spec.ts`, logo após o teste `'carrega os agregados do dashboard'` (linha 168 do arquivo atual):

```typescript
  it('loadSummary manda os filtros como query params quando informados', () => {
    service.loadSummary({ since: '2026-09-01T00:00:00.000Z', turno: 'A', setor: 'montagem', epi: 'capacete', detalhado: true });

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/summary`);
    expect(req.request.params.get('since')).toBe('2026-09-01T00:00:00.000Z');
    expect(req.request.params.get('turno')).toBe('A');
    expect(req.request.params.get('setor')).toBe('montagem');
    expect(req.request.params.get('epi')).toBe('capacete');
    expect(req.request.params.get('detalhado')).toBe('true');
    req.flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap: [], ultimosSeteDias: [],
      distribuicaoTemporal: [{ diaSemana: 2, faixa2h: 11, incidentes: 1 }],
      historicoAnual: [{ dia: '2026-01-01', incidentes: 0 }],
    });

    expect(service.summary()?.distribuicaoTemporal?.[0].incidentes).toBe(1);
    expect(service.summary()?.historicoAnual?.[0].dia).toBe('2026-01-01');
  });

  it('loadSummary sem filtros nao manda nenhum param novo (mesma URL de sempre)', () => {
    service.loadSummary();

    const req = http.expectOne(`${environment.apiUrl}/summary`);
    expect(req.request.params.keys().length).toBe(0);
    req.flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap: [], ultimosSeteDias: [],
    });
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/shared/incident.service.spec.ts`
Expected: FAIL na compilação — `loadSummary` não aceita argumento, `SummaryFiltros` não existe.

- [ ] **Step 3: Adicionar os tipos novos**

Em `src/app/shared/incident.models.ts`, logo após a interface `Summary` existente (linha 150–157 do arquivo atual):

```typescript
export interface TemporalCell {
  diaSemana: number;
  faixa2h: number;
  incidentes: number;
}

export interface SummaryFiltros {
  since?: string;
  until?: string;
  turno?: string;
  setor?: string;
  epi?: string;
  detalhado?: boolean;
}
```

E adicionar os dois campos novos à interface `Summary` já existente:

```typescript
export interface Summary {
  incidentesHoje: number;
  incidentesOntem: number;
  criticosHoje: number;
  pendentes: number;
  heatmap: StationCell[];
  ultimosSeteDias: DayCount[];
  distribuicaoTemporal: TemporalCell[] | null;
  historicoAnual: DayCount[] | null;
}
```

- [ ] **Step 4: Atualizar `IncidentService.loadSummary`**

Em `src/app/shared/incident.service.ts`, importar `HttpParams` e `SummaryFiltros`:

```typescript
import { HttpClient, HttpParams } from '@angular/common/http';
// ...
import { AlertaStatus, ConnectionState, Incident, IncidentSearchFilters, Page, Summary, SummaryFiltros } from './incident.models';
```

Substituir o método:

```typescript
  loadSummary(filtros?: SummaryFiltros): void {
    let params = new HttpParams();
    if (filtros) {
      for (const [chave, valor] of Object.entries(filtros)) {
        if (valor !== undefined && valor !== null && valor !== '') {
          params = params.set(chave, String(valor));
        }
      }
    }
    this.http.get<Summary>(`${environment.apiUrl}/summary`, { withCredentials: true, params })
      .subscribe({ next: s => this._summary.set(s), error: () => { } });
  }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/app/shared/incident.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Rodar a suíte inteira e confirmar que passa**

Run: `npx vitest run`
Expected: PASS (Dashboard e o resto do app continuam chamando `loadSummary()` sem filtro, comportamento idêntico)

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/incident.models.ts src/app/shared/incident.service.ts src/app/shared/incident.service.spec.ts
git commit -m "feat: loadSummary aceita filtros opcionais, Summary ganha campos de temporal/anual"
```

---

### Task 2: Setor, EPI, Turno e Período — filtros reais

**Files:**
- Modify: `src/app/heatmap/heatmap.component.ts`
- Modify: `src/app/heatmap/heatmap.component.html`
- Test: `src/app/heatmap/heatmap.component.spec.ts`

**Interfaces:**
- Consumes: `IncidentService.loadSummary(filtros?)` de Task 1
- Produces: `HeatmapComponent.setor`, `HeatmapComponent.epi` (signals novos); `setSetor(s)`, `setEpi(e)` (métodos novos); `setPeriod`/`setShift` passam a recarregar o summary

- [ ] **Step 1: Escrever os testes**

Adicionar em `heatmap.component.spec.ts`, dentro do `describe('HeatmapComponent', ...)` existente (usa a mesma `montarCom`/`http` já declaradas no arquivo):

```typescript
  function ultimaRequisicaoDeSummary() {
    const pendentes = http.match(r => r.url === `${environment.apiUrl}/summary`);
    return pendentes[pendentes.length - 1];
  }

  it('trocar o setor recarrega o summary com o filtro', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/summary`); // drena a carga inicial do ngOnInit

    fixture.componentInstance.setSetor('montagem');

    const req = ultimaRequisicaoDeSummary();
    expect(req.request.params.get('setor')).toBe('montagem');
    expect(req.request.params.get('detalhado')).toBe('true');
    req.flush({ incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0, heatmap: [], ultimosSeteDias: [] });
  });

  it('trocar o EPI recarrega o summary com o filtro', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);

    fixture.componentInstance.setEpi('capacete');

    const req = ultimaRequisicaoDeSummary();
    expect(req.request.params.get('epi')).toBe('capacete');
    req.flush({ incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0, heatmap: [], ultimosSeteDias: [] });
  });

  it('trocar o turno recarrega o summary com o filtro', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);

    fixture.componentInstance.setShift('A');

    const req = ultimaRequisicaoDeSummary();
    expect(req.request.params.get('turno')).toBe('A');
    req.flush({ incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0, heatmap: [], ultimosSeteDias: [] });
  });

  it('turno "all" nao manda o parametro turno', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);

    fixture.componentInstance.setShift('all');

    const req = ultimaRequisicaoDeSummary();
    expect(req.request.params.has('turno')).toBe(false);
    req.flush({ incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0, heatmap: [], ultimosSeteDias: [] });
  });

  it('trocar o periodo recarrega o summary com since', () => {
    const fixture = montarCom([]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);

    fixture.componentInstance.setPeriod('30d');

    const req = ultimaRequisicaoDeSummary();
    expect(req.request.params.has('since')).toBe(true);
    req.flush({ incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0, heatmap: [], ultimosSeteDias: [] });
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/heatmap/heatmap.component.spec.ts`
Expected: FAIL na compilação — `setSetor`/`setEpi` não existem; `setPeriod`/`setShift` ainda não recarregam nada.

- [ ] **Step 3: Adicionar os signals, o computed de filtros e o recarregamento**

Em `heatmap.component.ts`, importar `FormsModule`:

```typescript
import { FormsModule } from '@angular/forms';
```

E acrescentar ao array `imports` do `@Component`:

```typescript
  imports: [ChromeTopbarComponent, DockComponent, ConnectionBadgeComponent, FormsModule],
```

Adicionar os signals novos (perto de `period`/`shift`, linha 111–112 do arquivo atual) e o computed/método de recarga:

```typescript
  readonly setor = signal('');
  readonly epi = signal('');

  private readonly filtrosAtuais = computed((): SummaryFiltros => {
    const filtros: SummaryFiltros = { detalhado: true };
    const inicio = inicioDoPeriodo(this.period(), new Date());
    if (inicio) filtros.since = inicio.toISOString();
    if (this.shift() !== 'all') filtros.turno = this.shift();
    if (this.setor()) filtros.setor = this.setor();
    if (this.epi()) filtros.epi = this.epi();
    return filtros;
  });

  private recarregarSummary(): void {
    this.incidentService.loadSummary(this.filtrosAtuais());
  }
```

(importar `SummaryFiltros` de `../shared/incident.models`, junto de `StationCell`/`severityClass` já importados.)

Substituir `ngOnInit` (linha 150–154) pra usar os filtros desde a primeira carga:

```typescript
  ngOnInit(): void {
    this.catalogService.load();
    this.incidentService.loadSummary(this.filtrosAtuais());
    this.incidentService.connect();
  }
```

E os quatro setters (linha 169–170), pra recarregar a cada mudança:

```typescript
  setPeriod(p: string) { this.period.set(p); this.recarregarSummary(); }
  setShift(s: string) { this.shift.set(s); this.recarregarSummary(); }
  setSetor(s: string) { this.setor.set(s); this.recarregarSummary(); }
  setEpi(e: string) { this.epi.set(e); this.recarregarSummary(); }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/heatmap/heatmap.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Ligar os `<select>` no template**

Em `heatmap.component.html`, substituir os dois `<select>` estáticos de Setor/EPI (linhas 26 e 29 do arquivo atual):

```html
    <span class="fb-label">Setor</span>
    <select class="fb-select" [(ngModel)]="setor" name="heatmapSetor" (ngModelChange)="setSetor($event)">
      <option value="">Todos os setores</option>
      @for (s of setoresDisponiveis(); track s) {
        <option [value]="s">{{ s }}</option>
      }
    </select>
    <div class="fb-sep"></div>
    <span class="fb-label">EPI</span>
    <select class="fb-select" [(ngModel)]="epi" name="heatmapEpi" (ngModelChange)="setEpi($event)">
      <option value="">Todos os EPIs</option>
      @for (e of episDisponiveis; track e.key) {
        <option [value]="e.key">{{ e.name }}</option>
      }
    </select>
```

(`(ngModelChange)` chama `setSetor`/`setEpi` explicitamente em vez de depender só do `[(ngModel)]` porque o signal precisa disparar `recarregarSummary()` — o padrão de `severityMin` em `IncidentTimelineComponent` já faz a mesma coisa por um motivo diferente, mas a forma é a mesma.)

Adicionar ao componente, perto de `top5Max` (linha 140):

```typescript
  /** Setores distintos das estações cadastradas, para popular o <select> — nunca mais "Setor A/B/C" fixo. */
  readonly setoresDisponiveis = computed(() => {
    const setores = new Set<string>();
    for (const s of this.catalogService.stations()) {
      if (s.setor) setores.add(s.setor);
    }
    return Array.from(setores).sort();
  });

  /** Só os 4 EPIs que o backend sabe filtrar (spec §1.4) — os outros 4 de EPI_LIST ficam de fora até o cypher-capture detectar essas violações. */
  readonly episDisponiveis = EPI_LIST.filter(e => ['capacete', 'oculos', 'luvas', 'botas'].includes(e.key));
```

(importar `EPI_LIST` de `'../onboarding/models/onboarding.models'`.)

- [ ] **Step 6: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/heatmap/heatmap.component.ts src/app/heatmap/heatmap.component.html
git commit -m "feat: liga os filtros de setor, EPI, turno e periodo do heatmap ao backend"
```

---

### Task 3: Ordenar (ranking/nome/zona) — real

**Files:**
- Modify: `src/app/heatmap/heatmap.component.ts`
- Modify: `src/app/heatmap/heatmap.component.html`
- Test: `src/app/heatmap/heatmap.component.spec.ts`

**Interfaces:**
- Produces: `HeatmapComponent.ordenar` (signal, `'ranking' | 'nome' | 'zona'`, default `'zona'`); `setOrdenar(o)`; `celulasOrdenadas` (computed, lista plana usada quando `ordenar() !== 'zona'`)

- [ ] **Step 1: Escrever o teste**

```typescript
  it('ordenar por ranking lista as celulas por incidentes desc, sem agrupar', () => {
    const fixture = montarCom([
      { estacaoId: 'EST-01', nome: 'Esteira', setor: 'montagem', incidentes: 1 },
      { estacaoId: 'EST-02', nome: 'Prensa', setor: 'estamparia', incidentes: 5 },
    ]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);
    const comp = fixture.componentInstance;

    comp.setOrdenar('ranking');

    expect(comp.celulasOrdenadas().map(c => c.estacaoId)).toEqual(['EST-02', 'EST-01']);
  });

  it('ordenar por nome lista as celulas em ordem alfabetica, sem agrupar', () => {
    const fixture = montarCom([
      { estacaoId: 'EST-02', nome: 'Zebra', setor: 'estamparia', incidentes: 5 },
      { estacaoId: 'EST-01', nome: 'Alfa', setor: 'montagem', incidentes: 1 },
    ]);
    http.match(r => r.url === `${environment.apiUrl}/summary`);
    const comp = fixture.componentInstance;

    comp.setOrdenar('nome');

    expect(comp.celulasOrdenadas().map(c => c.nome)).toEqual(['Alfa', 'Zebra']);
  });

  it('ordenar por zona (default) mantem o agrupamento por setor', () => {
    const fixture = montarCom([]);
    expect(fixture.componentInstance.ordenar()).toBe('zona');
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/heatmap/heatmap.component.spec.ts`
Expected: FAIL na compilação — `ordenar`/`setOrdenar`/`celulasOrdenadas` não existem.

- [ ] **Step 3: Adicionar o signal e o computed**

Em `heatmap.component.ts`, perto de `setor`/`epi` (Task 2):

```typescript
  readonly ordenar = signal<'ranking' | 'nome' | 'zona'>('zona');

  setOrdenar(o: 'ranking' | 'nome' | 'zona') { this.ordenar.set(o); }

  /** Lista plana (sem agrupar por setor), usada quando ordenar() !== 'zona'. */
  readonly celulasOrdenadas = computed(() => {
    const modo = this.ordenar();
    const copia = [...this.celulas()];
    if (modo === 'ranking') return copia.sort((a, b) => b.incidentes - a.incidentes);
    if (modo === 'nome') return copia.sort((a, b) => a.nome.localeCompare(b.nome));
    return copia;
  });
```

Atualizar `grupos()` (linha 125–134 do arquivo atual) pra ordenar por setor alfabeticamente, em vez da ordem de inserção do `Map`:

```typescript
  readonly grupos = computed<GrupoSetor[]>(() => {
    const porSetor = new Map<string, StationCell[]>();
    for (const celula of this.celulas()) {
      const chave = celula.setor ?? 'sem setor';
      const lista = porSetor.get(chave) ?? [];
      lista.push(celula);
      porSetor.set(chave, lista);
    }
    return Array.from(porSetor.entries())
      .map(([setor, celulas]) => ({ setor, celulas }))
      .sort((a, b) => a.setor.localeCompare(b.setor));
  });
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/heatmap/heatmap.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Ligar o `<select>` e alternar o template entre agrupado e plano**

Em `heatmap.component.html`, o `<select>` de Ordenar (linhas 54–56 do arquivo atual):

```html
          <select class="fb-select" [(ngModel)]="ordenar" name="ordenar" (ngModelChange)="setOrdenar($event)">
            <option value="ranking">Ordenar: ranking</option>
            <option value="nome">Ordenar: nome</option>
            <option value="zona">Ordenar: zona</option>
          </select>
```

O bloco de renderização (linhas 68–89 do arquivo atual) passa a checar `ordenar()`:

```html
      @if (celulas().length === 0) {
        <div class="vazio">nenhuma estação cadastrada</div>
      } @else if (ordenar() === 'zona') {
        <div class="spatial-zones">
          @for (g of grupos(); track g.setor) {
            <div class="zone">
              <div class="zone-label">{{ g.setor }}</div>
              <div class="zone-grid" style="grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))">
                @for (c of g.celulas; track c.estacaoId) {
                  <div [class]="'heat-tile ' + classeDe(c.incidentes)"
                       role="button" [attr.aria-label]="c.estacaoId + ' · ' + c.nome + ': ' + c.incidentes + ' incidentes'"
                       [title]="c.nome + ' · ' + (c.setor || 'sem setor')">
                    <span class="tid">{{ c.estacaoId }} · {{ c.nome }}</span>
                    <span class="tst">{{ rotuloIntensidade(c.incidentes) }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="zone-grid" style="grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))">
          @for (c of celulasOrdenadas(); track c.estacaoId) {
            <div [class]="'heat-tile ' + classeDe(c.incidentes)"
                 role="button" [attr.aria-label]="c.estacaoId + ' · ' + c.nome + ': ' + c.incidentes + ' incidentes'"
                 [title]="c.nome + ' · ' + (c.setor || 'sem setor')">
              <span class="tid">{{ c.estacaoId }} · {{ c.nome }}</span>
              <span class="tst">{{ rotuloIntensidade(c.incidentes) }}</span>
            </div>
          }
        </div>
      }
```

- [ ] **Step 6: Rodar a suíte inteira e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/heatmap/heatmap.component.ts src/app/heatmap/heatmap.component.html
git commit -m "feat: adiciona ordenacao real (ranking/nome/zona) a planta baixa do heatmap"
```

---

### Task 4: Painel Temporal — dado real

**Files:**
- Modify: `src/app/heatmap/heatmap.component.ts`
- Modify: `src/app/heatmap/heatmap.component.html`
- Test: `src/app/heatmap/heatmap.component.spec.ts`

**Interfaces:**
- Consumes: `Summary.distribuicaoTemporal` de Task 1
- Produces: `HeatmapComponent.matrizTemporal` (computed, `number[][]` no mesmo formato que `TEMP_MATRIX` tinha — 12 linhas × 7 colunas — pra não precisar reescrever o template de grid)

- [ ] **Step 1: Escrever o teste**

```typescript
  it('matrizTemporal converte distribuicaoTemporal em linhas de faixa2h x colunas de diaSemana', () => {
    const fixture = TestBed.createComponent(HeatmapComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap: [], ultimosSeteDias: [],
      distribuicaoTemporal: [{ diaSemana: 2, faixa2h: 11, incidentes: 4 }],
    });
    fixture.detectChanges();

    const matriz = fixture.componentInstance.matrizTemporal();
    expect(matriz[11][2]).toBe(4);
    expect(matriz[0][0]).toBe(0);
    expect(matriz.length).toBe(12);
    expect(matriz[0].length).toBe(7);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/heatmap/heatmap.component.spec.ts`
Expected: FAIL na compilação — `matrizTemporal` não existe.

- [ ] **Step 3: Remover o dado fabricado e adicionar o computed**

Em `heatmap.component.ts`, remover a constante `TEMP_MATRIX` (linhas 19–32 do arquivo atual) e o campo `tempMatrix = TEMP_MATRIX` (linha 105) — `TEMP_HOURS`/`TEMP_DAYS` continuam (são rótulos de eixo, não dado fabricado). Adicionar:

```typescript
  /** distribuicaoTemporal (lista de células) → matriz [faixa2h][diaSemana], mesmo formato que o template já espera. */
  readonly matrizTemporal = computed<number[][]>(() => {
    const celulas = this.incidentService.summary()?.distribuicaoTemporal ?? [];
    const matriz: number[][] = Array.from({ length: 12 }, () => Array(7).fill(0));
    for (const c of celulas) {
      matriz[c.faixa2h][c.diaSemana] = c.incidentes;
    }
    return matriz;
  });
```

Remover o selo "dado de exemplo" do comentário de topo do arquivo (linhas 13–16) — só a parte que descreve o Temporal; a Task 5 remove a parte do Anual.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/heatmap/heatmap.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Trocar `tempMatrix` por `matrizTemporal()` no template e remover o selo**

Em `heatmap.component.html`, no card Temporal (linhas 107–157 do arquivo atual):

```html
        <div class="hch-r">
        </div>
```

(remove `<span class="sample-seal">dado de exemplo</span>`, linha 115 — a `div.hch-r` fica vazia; se isso deixar espaço em branco estranho no layout, remover a `div.hch-r` inteira do card Temporal.)

E trocar `tempMatrix` por `matrizTemporal()` (linha 125):

```html
          @for (row of matrizTemporal(); track $index; let ri = $index) {
```

- [ ] **Step 6: Rodar a suíte inteira e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/heatmap/heatmap.component.ts src/app/heatmap/heatmap.component.html
git commit -m "feat: painel Distribuicao Temporal do heatmap passa a usar dado real"
```

---

### Task 5: Painel Anual — dado real, com opacidade por período

**Files:**
- Modify: `src/app/heatmap/heatmap.component.ts`
- Modify: `src/app/heatmap/heatmap.component.html`
- Modify: `src/styles.scss`
- Test: `src/app/heatmap/heatmap.component.spec.ts`

**Interfaces:**
- Consumes: `Summary.historicoAnual` de Task 1, `inicioDoPeriodo` já existente (linha 43 do arquivo atual)
- Produces: `celulasAnuais(historico, ano)` (função pura exportada), `dentroDoPeriodo(dia, period, agora)` (função pura exportada), `HeatmapComponent.celulasAno` (computed)

- [ ] **Step 1: Escrever os testes**

Adicionar ao topo do arquivo de spec (fora do `describe`, mesmo padrão de `inicioDoPeriodo` já testado no arquivo):

```typescript
import { celulasAnuais, dentroDoPeriodo, HeatmapComponent, inicioDoPeriodo } from './heatmap.component';

describe('celulasAnuais', () => {
  it('alinha o primeiro dia do ano na linha certa da semana e incrementa semana a cada 7', () => {
    // 2026-01-01 é uma quinta-feira -> diaSemana ISO (0=Seg) = 3.
    const historico = [
      { dia: '2026-01-01', incidentes: 1 },
      { dia: '2026-01-02', incidentes: 0 },
      { dia: '2026-01-03', incidentes: 2 },
      { dia: '2026-01-04', incidentes: 0 },
    ];
    const celulas = celulasAnuais(historico);

    expect(celulas[0]).toEqual({ dia: '2026-01-01', incidentes: 1, semana: 0, diaSemana: 3 });
    expect(celulas[3]).toEqual({ dia: '2026-01-04', incidentes: 0, semana: 0, diaSemana: 6 });
  });

  it('semana incrementa ao cruzar o setimo slot', () => {
    // com offset 3 (quinta), o slot 4 (indice) cai na semana 1.
    const historico = Array.from({ length: 6 }, (_, i) => ({ dia: `2026-01-0${i + 1}`, incidentes: 0 }));
    const celulas = celulasAnuais(historico);

    expect(celulas[3].semana).toBe(1); // posicao 3+3=6 -> semana 0 ainda (0..6)
    expect(celulas[4].semana).toBe(1); // posicao 4+3=7 -> semana 1
  });
});

describe('dentroDoPeriodo', () => {
  const agora = new Date('2026-09-08T15:00:00.000Z');

  it('dia dentro dos ultimos 7 dias retorna true para period=7d', () => {
    expect(dentroDoPeriodo('2026-09-05', '7d', agora)).toBe(true);
  });

  it('dia fora dos ultimos 7 dias retorna false para period=7d', () => {
    expect(dentroDoPeriodo('2026-08-01', '7d', agora)).toBe(false);
  });

  it('period=custom nunca esmaece nada (sem intervalo por tras) — sempre true', () => {
    expect(dentroDoPeriodo('2020-01-01', 'custom', agora)).toBe(true);
  });
});
```

E dentro do `describe('HeatmapComponent', ...)`:

```typescript
  it('celulasAno reflete o historicoAnual real', () => {
    const fixture = TestBed.createComponent(HeatmapComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/summary`)[0].flush({
      incidentesHoje: 0, incidentesOntem: 0, criticosHoje: 0, pendentes: 0,
      heatmap: [], ultimosSeteDias: [],
      historicoAnual: [{ dia: '2026-01-01', incidentes: 3 }, { dia: '2026-01-02', incidentes: 0 }],
    });
    fixture.detectChanges();

    const celulas = fixture.componentInstance.celulasAno();
    expect(celulas.length).toBe(2);
    expect(celulas[0].incidentes).toBe(3);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/heatmap/heatmap.component.spec.ts`
Expected: FAIL na compilação — `celulasAnuais`/`dentroDoPeriodo`/`celulasAno` não existem.

- [ ] **Step 3: Remover o dado fabricado e adicionar as funções puras**

Em `heatmap.component.ts`, remover `buildAnnual()` (linhas 57–80 do arquivo atual) e os campos `annualCells`/`annualTotal` (linhas 108–109). `MONTHS`/`MONTH_STARTS` (linhas 34–35) saem também — a Step 5 abaixo recalcula os começos de mês a partir do dado real, não mais de um array fixo.

Adicionar, no lugar de `buildAnnual`:

```typescript
export interface CelulaAnual {
  dia: string;
  incidentes: number;
  semana: number;
  diaSemana: number;
}

/**
 * Converte a lista diária (Jan 1 .. Dez 31, sempre nessa ordem — vem assim
 * de `SummaryService.historicoAnual`) numa grade estilo GitHub: 7 linhas
 * (uma por dia da semana, 0=Seg) x N colunas (uma por semana). O offset do
 * primeiro dia alinha a coluna 0 corretamente mesmo quando o ano não começa
 * numa segunda-feira.
 */
export function celulasAnuais(historico: { dia: string; incidentes: number }[]): CelulaAnual[] {
  if (historico.length === 0) return [];
  const primeiro = new Date(historico[0].dia + 'T00:00:00');
  const offsetSegunda = (primeiro.getDay() + 6) % 7; // Date.getDay(): 0=Dom..6=Sab -> 0=Seg..6=Dom
  return historico.map((d, indice) => {
    const posicao = indice + offsetSegunda;
    return { dia: d.dia, incidentes: d.incidentes, semana: Math.floor(posicao / 7), diaSemana: posicao % 7 };
  });
}

/** Onde cada mês começa (índice de semana), pra posicionar os rótulos Jan..Dez sobre a grade real. */
export function inicioDasSemanasPorMes(celulas: CelulaAnual[]): number[] {
  const resultado: number[] = [];
  let mesAtual = -1;
  for (const c of celulas) {
    const mes = new Date(c.dia + 'T00:00:00').getMonth();
    if (mes !== mesAtual) {
      resultado.push(c.semana);
      mesAtual = mes;
    }
  }
  return resultado;
}

/**
 * Se o dia cai dentro da janela que o chip de período implica — usada pra
 * esmaecer o resto do calendário anual em vez de encolher a grade (spec §9
 * da E6 aplicada aqui: o Anual sempre mostra o ano inteiro). `custom` nunca
 * teve intervalo por trás (mesmo motivo de `inicioDoPeriodo`), então nada é
 * esmaecido.
 */
export function dentroDoPeriodo(dia: string, period: string, agora: Date): boolean {
  const inicio = inicioDoPeriodo(period, agora);
  if (!inicio) return true;
  return new Date(dia + 'T00:00:00').getTime() >= inicio.getTime();
}
```

Adicionar ao componente, perto de `matrizTemporal` (Task 4):

```typescript
  readonly celulasAno = computed(() =>
    celulasAnuais(this.incidentService.summary()?.historicoAnual ?? []));

  readonly inicioDosMeses = computed(() => inicioDasSemanasPorMes(this.celulasAno()));

  readonly totalSemanasNoAno = computed(() =>
    this.celulasAno().reduce((max, c) => Math.max(max, c.semana), 0) + 1);

  readonly annualTotal = computed(() =>
    this.celulasAno().reduce((soma, c) => soma + c.incidentes, 0));

  estaEsmaecido(dia: string): boolean {
    return !dentroDoPeriodo(dia, this.period(), new Date());
  }
```

Remover o método `monthLeft` antigo (linha 172, baseado em `MONTH_STARTS`/52 fixo) e substituir por uma versão que usa `totalSemanasNoAno()`:

```typescript
  monthLeft(indiceSemanaDoMes: number): string {
    return `calc(${indiceSemanaDoMes} * (100% / ${this.totalSemanasNoAno()}))`;
  }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/heatmap/heatmap.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Trocar o template do card Anual pro dado real**

Em `heatmap.component.html`, o card Anual (linhas 159–204 do arquivo atual):

```html
    <div class="hp-card annual">
      <div class="hc-head annual-head">
        <div class="hch-l">
          <div class="hch-title">Histórico Anual de Incidentes</div>
          <div class="hch-sub">Jan–Dez · {{ annualTotal() }} incidentes registrados</div>
        </div>
      </div>

      <div class="annual-wrap">
        <div class="annual-days">
          <span>Seg</span><span></span>
          <span>Qua</span><span></span>
          <span>Sex</span><span></span><span></span>
        </div>
        <div class="annual-months">
          @for (inicioSemana of inicioDosMeses(); track $index; let i = $index) {
            <span class="mlbl" [style.left]="monthLeft(inicioSemana)">{{ months[i] }}</span>
          }
        </div>
        <div class="annual-grid">
          @for (cell of celulasAno(); track cell.dia) {
            <div [class]="'acell ' + annualTier(cell.incidentes) + (estaEsmaecido(cell.dia) ? ' dimmed' : '')"
                 [title]="cell.dia + ' · ' + cell.incidentes + ' incidente' + (cell.incidentes === 1 ? '' : 's')">
            </div>
          }
        </div>
      </div>

      <div class="annual-foot">
        <span class="lg">
          Menos
          <span class="acell a0"></span>
          <span class="acell a1"></span>
          <span class="acell a2"></span>
          <span class="acell a3"></span>
          <span class="acell a4"></span>
          Mais
        </span>
      </div>
    </div>
```

(removidos o `sample-content`/`sample-seal` — o painel deixa de ser rotulado como exemplo; `months` continua sendo `MONTHS`, só que agora é uma constante de rótulo puro, sem `MONTH_STARTS` — declarar `months = MONTHS;` no componente como já era antes, com `export const MONTHS = [...]` mantido no arquivo.)

- [ ] **Step 6: Adicionar a classe `.dimmed`**

Em `src/styles.scss`, logo após `.acell.peak` (linha 710 do arquivo atual):

```scss
.acell.dimmed { opacity: .35; }
```

- [ ] **Step 7: Rodar a suíte inteira e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/app/heatmap/heatmap.component.ts src/app/heatmap/heatmap.component.html src/styles.scss
git commit -m "feat: painel Historico Anual do heatmap passa a usar dado real, com opacidade por periodo"
```

---

## Self-Review

**Cobertura da spec:** §2 (setor/EPI/turno/ordenar reais, painéis Temporal/Anual reais, opacidade do Anual por período) → Tasks 2–5. Plumbing (`SummaryFiltros`, `loadSummary` compatível) → Task 1. Vocabulário de EPI restrito aos 4 valores mapeados (spec §1.4) → Task 2, `episDisponiveis`.

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** `SummaryFiltros`/`TemporalCell` definidos na Task 1 e usados sem alteração nas Tasks 2 e 4; `celulasAnuais`/`dentroDoPeriodo`/`inicioDasSemanasPorMes` são funções puras novas da Task 5, cada uma testada isoladamente antes de entrar no `computed` que o template consome — mesmo padrão de `inicioDoPeriodo` (E6) que este plano reaproveita diretamente.

---

**Plan complete and saved to `docs/superpowers/plans/heatmap-funcional/2026-09-08-hfb-front-heatmap.md`.**

## Execution Handoff

Dois planos, sem dependência cruzada de execução (o front consome o shape final da resposta, já fechado nas duas specs juntas) — podem rodar em paralelo:

- `heatmap-funcional/2026-09-08-hfa-backend-heatmap.md` (5 tasks, `cypher`)
- `heatmap-funcional/2026-09-08-hfb-front-heatmap.md` (5 tasks, este arquivo, `cypher-front`)

Ambos direto em `main`/`dev`, sem branch de feature (decisão do usuário para esta entrega).

**1. Subagent-Driven (recomendado)** — dispatch de um subagente por tarefa, revisão entre tarefas, iteração rápida.

**2. Inline Execution** — execução em lote nesta sessão via `executing-plans`, com checkpoints para revisão.
