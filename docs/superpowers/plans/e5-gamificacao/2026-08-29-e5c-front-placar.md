# E5-C — Frontend: Placar e Camada Educativa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **✅ EXECUÇÃO LIBERADA (2026-09-07).** Pré-requisito da spec §7 (GTQ) resolvido, PR #10 mergeado. **Parte depois que `e5a` estiver rodando localmente.** A revisão pré-execução mudou o contrato de `PlacarEquipeResponse`: campo novo `dadosSuficientes: boolean`, e `conformidade`/`deltaConformidadeSemana` passam a ser anuláveis (`number | null`) — a Tarefa 1 abaixo já reflete isso. **Commits sem `Co-Authored-By`.** Branch local `feat/e5-front-placar` a partir de `dev` — **não** usar worktrees.

**Goal:** `PlacarComponent` (`/placar`), campos de meta em `/config/equipe`, e o card de incidente do kiosk exibindo a norma aplicável — consumindo o backend do plano `e5a`.

**Architecture:** Três peças independentes entre si. Tarefa 1 entrega `PlacarService` + `PlacarComponent` (ranking por melhora, barras de progresso simples, badge de sequência). Tarefa 2 estende o formulário de equipe já existente (`equipes-config.component`) com os três campos de meta. Tarefa 3 estende o card de incidente do kiosk (`StationKioskComponent`) com a norma aplicável e a dica estática — não é tela nova, é campo a mais num card que já existe (spec §4).

**Tech Stack:** Angular (standalone components, signals), Vitest + `HttpTestingController`. Sem biblioteca de gráfico — barras de progresso são `div` com largura proporcional (spec §5).

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-gamificacao-e5-design.md` (repo `cypher-front`), §4 (camada educativa), §5 (front).

**Repositório:** `/home/asaas/projects/challenge/cypher-front`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-front`. Branch, quando a execução for liberada: `feat/e5-front-placar`, a partir de `dev`.
- **Depende do plano `e5a-backend-gamificacao.md`** rodando localmente para teste manual; os specs automatizados usam `HttpTestingController`/mock.
- **Nota de design:** toda peça nova reaproveita 100% os primitivos globais já existentes em `src/styles.scss` (`.panel`, `.chip`, `.list-row`, `.field`, `.input`, `.btn`, `.vazio`) — mesmo princípio de todas as specs anteriores desta rodada. Nenhum componente de gráfico é introduzido; barra de progresso é um `div` com `[style.width.%]` proporcional.
- **Sequência interrompida nunca vira alerta vermelho** (spec §5, E1 §16.3) — o badge sempre mostra "melhor sequência: N · atual: M", nunca uma cor de erro quando `atual` cai a zero.
- **Ranking é a ordem que o backend já devolve** (`GET /placar` já ordena por delta, spec E5-A) — o front nunca reordena por conta própria.
- **`deltaConformidadeSemana` pode ser `null` mesmo com `dadosSuficientes === true`** — a revisão do `e5a` (cerimonias §3.8) travou o delta quando a semana anterior não tem `MonitoramentoDiario` suficiente, o que é o caso normal nas 2 primeiras semanas de operação. Renderizar isso como "sem histórico suficiente para ranquear" ao lado da conformidade, **não** como 0% ou seta neutra. O mesmo vale para `conformidade === null` (aí a linha já cai na seção "dados insuficientes").
- **`metaTempoReconhecimentoSegundos` não tem par `...Atingida`** no DTO (as outras duas metas têm) — exibir só como valor informativo, sem badge de atingida/não-atingida, até E6.
- Run: `npx vitest run <arquivo>` para um arquivo; `npx vitest run` para a suíte inteira.

---

### Task 1: `PlacarService` e `PlacarComponent`

**Files:**
- Create: `src/app/shared/placar.models.ts`
- Create: `src/app/shared/placar.service.ts`
- Create: `src/app/placar/placar.component.ts`
- Create: `src/app/placar/placar.component.html`
- Test: `src/app/shared/placar.service.spec.ts`
- Test: `src/app/placar/placar.component.spec.ts`
- Modify: `src/app/app.routes.ts`

**Interfaces:**
- Produces: `PlacarEquipe` (interface), `PlacarService.buscar(since?, until?)`, rota `/placar` → `PlacarComponent`, GESTOR-only (`canActivateGestor`, já existente)

- [ ] **Step 1: Escrever o teste do serviço**

Criar `src/app/shared/placar.models.ts`:

```typescript
/** `GET /api/v1/placar` — design doc de gamificação E5, §3.2. */

import { Turno } from './team.models';

export interface PlacarEquipe {
  equipeId: string;
  nome: string;
  turno: Turno;
  dadosSuficientes: boolean;              // false quando cobertura < 0,5 (spec §3.2)
  conformidade: number | null;            // null quando !dadosSuficientes
  cobertura: number;
  sequenciaAtual: number;
  melhorSequencia: number;
  metaConformidade: number | null;
  metaConformidadeAtingida: boolean;
  metaZeroSeveridade4Ativa: boolean | null;
  metaZeroSeveridade4Atingida: boolean;
  metaTempoReconhecimentoSegundos: number | null;
  deltaConformidadeSemana: number | null; // null quando !dadosSuficientes
}
```

Criar `src/app/shared/placar.service.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { PlacarService } from './placar.service';

describe('PlacarService (design doc de gamificação E5, §5)', () => {
  let service: PlacarService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlacarService);
    http = TestBed.inject(HttpTestingController);
  });

  it('buscar() sem período faz GET sem query string', () => {
    service.buscar().subscribe();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/placar`);
    expect(req.request.params.keys()).toHaveLength(0);
    req.flush([]);
  });

  it('buscar(since, until) inclui os dois parâmetros', () => {
    service.buscar('2026-08-01T00:00:00Z', '2026-08-08T00:00:00Z').subscribe();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/placar`);
    expect(req.request.params.get('since')).toBe('2026-08-01T00:00:00Z');
    expect(req.request.params.get('until')).toBe('2026-08-08T00:00:00Z');
    req.flush([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/shared/placar.service.spec.ts`
Expected: FAIL na compilação — `PlacarService` não existe.

- [ ] **Step 3: Criar `PlacarService`**

Criar `src/app/shared/placar.service.ts`:

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { PlacarEquipe } from './placar.models';

@Injectable({ providedIn: 'root' })
export class PlacarService {
  private http = inject(HttpClient);

  buscar(since?: string, until?: string): Observable<PlacarEquipe[]> {
    const params: Record<string, string> = {};
    if (since) params['since'] = since;
    if (until) params['until'] = until;
    return this.http.get<PlacarEquipe[]>(`${environment.apiUrl}/placar`, { params, withCredentials: true });
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/shared/placar.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Escrever o teste do componente**

Criar `src/app/placar/placar.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { PlacarComponent } from './placar.component';

const EQUIPE_A = {
  equipeId: 'EQ-01', nome: 'Equipe A', turno: 'MANHA', dadosSuficientes: true,
  conformidade: 0.97, cobertura: 0.9,
  sequenciaAtual: 0, melhorSequencia: 14, metaConformidade: 0.98, metaConformidadeAtingida: false,
  metaZeroSeveridade4Ativa: true, metaZeroSeveridade4Atingida: true,
  metaTempoReconhecimentoSegundos: null, deltaConformidadeSemana: 0.03,
};

const EQUIPE_SEM_DADOS = {
  equipeId: 'EQ-02', nome: 'Equipe B', turno: 'TARDE', dadosSuficientes: false,
  conformidade: null, cobertura: 0.2, sequenciaAtual: 3, melhorSequencia: 3,
  metaConformidade: null, metaConformidadeAtingida: false, metaZeroSeveridade4Ativa: null,
  metaZeroSeveridade4Atingida: false, metaTempoReconhecimentoSegundos: null,
  deltaConformidadeSemana: null,
};

describe('PlacarComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<PlacarComponent>>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PlacarComponent);
    http = TestBed.inject(HttpTestingController);
  });

  it('renderiza o ranking na ordem devolvida pelo backend', () => {
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/placar`).flush([EQUIPE_A]);
    fixture.detectChanges();

    expect(fixture.componentInstance.equipes()).toEqual([EQUIPE_A]);
  });

  it('sequência interrompida (atual=0) não usa classe de alerta', () => {
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/placar`).flush([EQUIPE_A]);
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('[data-test="sequencia"]');
    expect(badge?.className).not.toContain('crit');
    expect(badge?.textContent).toContain('melhor sequência: 14');
    expect(badge?.textContent).toContain('atual: 0');
  });

  it('equipe com dadosSuficientes=false fica fora do ranking, em seção própria', () => {
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/placar`).flush([EQUIPE_A, EQUIPE_SEM_DADOS]);
    fixture.detectChanges();

    expect(fixture.componentInstance.ranqueadas()).toEqual([EQUIPE_A]);
    expect(fixture.componentInstance.semDados()).toEqual([EQUIPE_SEM_DADOS]);
    expect(fixture.nativeElement.textContent).toContain('Dados insuficientes');
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npx vitest run src/app/placar/placar.component.spec.ts`
Expected: FAIL na compilação — `PlacarComponent` não existe.

- [ ] **Step 7: Criar `PlacarComponent`**

Criar `src/app/placar/placar.component.ts`:

```typescript
import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { PlacarEquipe } from '../shared/placar.models';
import { PlacarService } from '../shared/placar.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { DockComponent } from '../shared/dock/dock.component';

/**
 * Ranking de equipes por melhora de conformidade (design doc de
 * gamificação E5, §3.2/§5) — nunca por conformidade absoluta, e nunca
 * reordenado no front: a ordem já vem certa do backend.
 */
@Component({
  selector: 'app-placar',
  imports: [ChromeTopbarComponent, DockComponent],
  templateUrl: './placar.component.html',
})
export class PlacarComponent implements OnInit {
  private placarService = inject(PlacarService);

  readonly equipes = signal<PlacarEquipe[]>([]);
  readonly carregando = signal(true);

  ngOnInit(): void {
    this.placarService.buscar().subscribe({
      next: e => { this.equipes.set(e); this.carregando.set(false); },
      error: () => this.carregando.set(false),
    });
  }

  progressoConformidade(equipe: PlacarEquipe): number {
    return Math.round((equipe.conformidade ?? 0) * 100);
  }

  progressoCobertura(equipe: PlacarEquipe): number {
    return Math.round(equipe.cobertura * 100);
  }

  readonly ranqueadas = computed(() => this.equipes().filter(e => e.dadosSuficientes));
  readonly semDados = computed(() => this.equipes().filter(e => !e.dadosSuficientes));
}
```

Criar `src/app/placar/placar.component.html`:

```html
<app-chrome-topbar page="Placar" subtitle="Ranking por melhora" />

<main style="padding:40px 48px 120px;max-width:1100px">
  <div class="panel">
    @if (carregando()) {
      <p class="vazio">carregando…</p>
    } @else if (equipes().length === 0) {
      <p class="vazio">nenhuma equipe ativa ainda</p>
    } @else {
      @for (eq of ranqueadas(); track eq.equipeId) {
        <div class="list-row" style="flex-direction:column;align-items:stretch;gap:8px">
          <div style="display:flex;gap:12px;align-items:center">
            <span class="a-station">{{ eq.equipeId }}</span>
            <span>{{ eq.nome }}</span>
            <span class="chip">{{ eq.turno }}</span>
            <span class="chip" data-test="sequencia">melhor sequência: {{ eq.melhorSequencia }} · atual: {{ eq.sequenciaAtual }}</span>
          </div>
          <div>
            <span class="ph-meta">Conformidade {{ progressoConformidade(eq) }}%</span>
            <div style="height:6px;background:var(--panel-2,#222);border-radius:4px;overflow:hidden">
              <div style="height:100%;background:var(--accent)" [style.width.%]="progressoConformidade(eq)"></div>
            </div>
          </div>
          <div>
            <span class="ph-meta">Cobertura {{ progressoCobertura(eq) }}%</span>
            <div style="height:6px;background:var(--panel-2,#222);border-radius:4px;overflow:hidden">
              <div style="height:100%;background:var(--accent)" [style.width.%]="progressoCobertura(eq)"></div>
            </div>
          </div>
          <div style="display:flex;gap:8px">
            @if (eq.metaConformidade != null) {
              <span class="status" [class.on]="eq.metaConformidadeAtingida">
                meta conformidade {{ eq.metaConformidade * 100 | number:'1.0-0' }}%
              </span>
            }
            @if (eq.metaZeroSeveridade4Ativa) {
              <span class="status" [class.on]="eq.metaZeroSeveridade4Atingida">zero severidade 4</span>
            }
          </div>
        </div>
      }
      @if (semDados().length > 0) {
        <div class="list-row" style="opacity:.6;margin-top:16px">
          <span class="ph-meta">Dados insuficientes (cobertura &lt; 50% do turno) — fora do ranking:</span>
        </div>
        @for (eq of semDados(); track eq.equipeId) {
          <div class="list-row">
            <span class="a-station">{{ eq.equipeId }}</span>
            <span>{{ eq.nome }}</span>
            <span class="chip">{{ eq.turno }}</span>
            <span class="ph-meta">cobertura {{ progressoCobertura(eq) }}%</span>
          </div>
        }
      }
    }
  </div>
</main>

<app-dock activeKey="placar" />
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npx vitest run src/app/placar/placar.component.spec.ts`
Expected: PASS

- [ ] **Step 9: Adicionar a rota**

Em `app.routes.ts`, importar `PlacarComponent` e adicionar, junto às demais rotas GESTOR-only:

```typescript
  { path: 'placar', component: PlacarComponent, canActivate: [canActivateGestor] },
```

- [ ] **Step 10: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/app/shared/placar.models.ts src/app/shared/placar.service.ts \
        src/app/shared/placar.service.spec.ts src/app/placar src/app/app.routes.ts
git commit -m "feat: adiciona PlacarComponent e rota /placar"
```

---

### Task 2: Campos de meta em `/config/equipe`

**Files:**
- Modify: `src/app/shared/team.models.ts`
- Modify: `src/app/config/equipe/equipes-config.component.ts`
- Modify: `src/app/config/equipe/equipes-config.component.html`
- Test: `src/app/config/equipe/equipes-config.component.spec.ts`

**Interfaces:**
- Produces: `Equipe.metaConformidade`/`.metaZeroSeveridade4Ativa`/`.metaTempoReconhecimentoSegundos` (opcionais)

- [ ] **Step 1: Escrever o teste de envio dos campos de meta**

Adicionar em `equipes-config.component.spec.ts` (seguindo o padrão dos testes já existentes na classe):

```typescript
  it('envia os campos de meta no cadastro de equipe', () => {
    // ...montar o componente como os demais testes desta classe já fazem...
    comp.novaEquipe.set({
      id: 'EQ-09', nome: 'Equipe Meta', turno: 'MANHA', estacaoIds: ['EST-01'],
      metaConformidade: 0.98, metaZeroSeveridade4Ativa: true, metaTempoReconhecimentoSegundos: 120,
    });

    comp.salvar();

    const req = http.expectOne(`${environment.apiUrl}/teams`);
    expect(req.request.body.metaConformidade).toBe(0.98);
    expect(req.request.body.metaZeroSeveridade4Ativa).toBe(true);
    expect(req.request.body.metaTempoReconhecimentoSegundos).toBe(120);
    req.flush({ id: 'EQ-09', nome: 'Equipe Meta', turno: 'MANHA', estacaoIds: ['EST-01'], ativa: true,
      metaConformidade: 0.98, metaZeroSeveridade4Ativa: true, metaTempoReconhecimentoSegundos: 120 });
    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/config/equipe/equipes-config.component.spec.ts`
Expected: FAIL — `FormEquipe`/`novaEquipe` ainda não têm os três campos.

- [ ] **Step 3: Adicionar os campos aos modelos e ao componente**

Em `team.models.ts`:

```typescript
export interface Equipe {
  id: string;
  nome: string;
  turno: Turno;
  estacaoIds: string[];
  ativa: boolean;
  metaConformidade: number | null;
  metaZeroSeveridade4Ativa: boolean | null;
  metaTempoReconhecimentoSegundos: number | null;
}

export interface EquipePayload {
  id: string;
  nome: string;
  turno: Turno;
  estacaoIds: string[];
  ativa?: boolean;
  metaConformidade?: number | null;
  metaZeroSeveridade4Ativa?: boolean | null;
  metaTempoReconhecimentoSegundos?: number | null;
}
```

Em `equipes-config.component.ts`:

```typescript
interface FormEquipe {
  id: string; nome: string; turno: Turno; estacaoIds: string[];
  metaConformidade: number | null; metaZeroSeveridade4Ativa: boolean;
  metaTempoReconhecimentoSegundos: number | null;
}

const EQUIPE_VAZIA: FormEquipe = {
  id: '', nome: '', turno: 'MANHA', estacaoIds: [],
  metaConformidade: null, metaZeroSeveridade4Ativa: false, metaTempoReconhecimentoSegundos: null,
};
```

Em `salvar()`, incluir os três campos no `payload`:

```typescript
    const payload: EquipePayload = {
      id: form.id, nome: form.nome.trim(), turno: form.turno, estacaoIds: form.estacaoIds,
      metaConformidade: form.metaConformidade,
      metaZeroSeveridade4Ativa: form.metaZeroSeveridade4Ativa,
      metaTempoReconhecimentoSegundos: form.metaTempoReconhecimentoSegundos,
    };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/config/equipe/equipes-config.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Adicionar os campos ao formulário**

Em `equipes-config.component.html`, logo após o bloco de "Estações cobertas":

```html
    <div class="field">
      <label>Meta de conformidade (0–1, opcional)</label>
      <input class="input" type="number" min="0" max="1" step="0.01"
             [value]="novaEquipe().metaConformidade"
             (input)="novaEquipe.set({ ...novaEquipe(), metaConformidade: $any($event.target).value ? +($any($event.target).value) : null })" />
    </div>
    <div class="field">
      <label>
        <input type="checkbox" [checked]="novaEquipe().metaZeroSeveridade4Ativa"
               (change)="novaEquipe.set({ ...novaEquipe(), metaZeroSeveridade4Ativa: $any($event.target).checked })" />
        Acompanhar meta de zero incidentes severidade 4
      </label>
    </div>
    <div class="field">
      <label>Meta de tempo de reconhecimento (segundos, opcional)</label>
      <input class="input" type="number" min="0"
             [value]="novaEquipe().metaTempoReconhecimentoSegundos"
             (input)="novaEquipe.set({ ...novaEquipe(), metaTempoReconhecimentoSegundos: $any($event.target).value ? +($any($event.target).value) : null })" />
    </div>
```

- [ ] **Step 6: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/team.models.ts src/app/config/equipe
git commit -m "feat: adiciona campos de meta ao cadastro de equipe"
```

---

### Task 3: Norma aplicável no card de incidente do kiosk

**Files:**
- Modify: `src/app/shared/incident.models.ts`
- Modify: `src/app/stations/station-kiosk.component.html`
- Test: `src/app/stations/station-kiosk.component.spec.ts`

**Interfaces:**
- Consumes: `IncidentResponse.normaAplicavel` (backend, plano `e5a`)

- [ ] **Step 1: Escrever o teste**

Adicionar em `station-kiosk.component.spec.ts` (seguindo o padrão de fixture já usado nos testes existentes da classe):

```typescript
  it('mostra a norma aplicável e a dica no card de evento recente', () => {
    // ...montar o componente e popular eventos() com um incidente FALL_RISK
    // incluindo normaAplicavel: 'NR-35', como os demais testes desta classe já fazem...

    expect(fixture.nativeElement.textContent).toContain('NR-35');
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/stations/station-kiosk.component.spec.ts`
Expected: FAIL — o template ainda não exibe `normaAplicavel`.

- [ ] **Step 3: Adicionar o campo ao modelo e a dica estática**

Em `incident.models.ts`, acrescentar ao final da interface `Incident`:

```typescript
  normaAplicavel: string | null;
```

E, ao lado de `incidentLabel`:

```typescript
export function dicaDe(type: IncidentType): string {
  switch (type) {
    case 'FALL_RISK': return 'Isolar a área e verificar pontos de ancoragem antes de liberar o acesso.';
    case 'ERGONOMIC_RISK': return 'Reforçar pausa e postura na estação; revisar rodízio se recorrente.';
    case 'ZONE_VIOLATION': return 'Confirmar sinalização da zona e treinamento de quem entrou nela.';
    case 'EPI_VIOLATION': return 'Verificar disponibilidade do EPI no posto antes de liberar a operação.';
  }
}
```

- [ ] **Step 4: Estender o card no template do kiosk**

Em `station-kiosk.component.html`, dentro do `@for (inc of eventos(); ...)`:

```html
              <div [class]="'alert-row ' + (inc.nivel === 'ALTO' ? 'crit' : inc.nivel === 'MEDIO' ? 'high' : '')">
                <span class="a-time">{{ hora(inc.detectedAt) }}</span>
                <span class="a-station">{{ inc.cameraId }}</span>
                <span class="a-type">{{ rotulo(inc.type) }}</span>
                <span class="a-sev">{{ inc.nivel }}</span>
                @if (inc.normaAplicavel) {
                  <span class="chip">{{ inc.normaAplicavel }}</span>
                }
              </div>
              @if (inc.normaAplicavel) {
                <p class="ph-meta" style="padding-left:8px">{{ dica(inc.type) }}</p>
              }
```

Em `station-kiosk.component.ts`, importar e expor `dicaDe`:

```typescript
  dica = dicaDe;
```

(adicionar `dicaDe` ao import já existente de `incidentLabel`/`incident.models`.)

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/app/stations/station-kiosk.component.spec.ts`
Expected: PASS

- [ ] **Step 6: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/incident.models.ts src/app/stations/station-kiosk.component.ts \
        src/app/stations/station-kiosk.component.html
git commit -m "feat: exibe norma aplicavel e dica estatica no card de evento do kiosk"
```

---

## Self-Review

**Cobertura da spec:** §3.2 (placar) → Tarefa 1. §3.1 (metas em `Equipe`) → Tarefa 2, lado front do que o plano `e5a` já fez no backend. §4 (camada educativa, card do kiosk) → Tarefa 3. §5 (nota de design, sem biblioteca de gráfico) → barras de progresso são `div`s simples em todas as tarefas.

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** `PlacarEquipe` (Tarefa 1) espelha exatamente `PlacarEquipeResponse` do plano `e5a` pós-revisão, campo a campo — incluindo `dadosSuficientes` e os anuláveis `conformidade`/`deltaConformidadeSemana`; `Equipe`/`EquipePayload` (Tarefa 2) ganham os três campos sem renomear nenhum já existente.

**Revisão pré-execução (2026-09-07) incorporada:** ranking só lista `dadosSuficientes === true` (`ranqueadas()`); equipes sem dados vão pra seção separada (`semDados()`), nunca no ranking (spec §3.2). `progressoConformidade` tolera `conformidade` `null`.

---

**Plan complete and saved to `docs/superpowers/plans/e5-gamificacao/2026-08-29-e5c-front-placar.md`.**
