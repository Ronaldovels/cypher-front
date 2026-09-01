# Análise de Risco com LLM Multimodal — Frontend (`cypher-front`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** adicionar o botão "Analisar com IA" na tela de detalhe do incidente, que chama o novo endpoint do backend e exibe a análise de risco estruturada.

**Architecture:** um serviço fino (`LlmAnalysisService`) sem signal/store compartilhado — é uma ação pontual por incidente, não dado "ao vivo"; o estado (carregando/resultado/erro) vive como signals locais em `IncidentDetailComponent`, renderizado logo abaixo do snapshot.

**Tech Stack:** Angular standalone components, signals, `HttpClient`, Vitest + `HttpTestingController` + `RouterTestingHarness` (mesmo padrão já usado em `incident-detail.component.spec.ts`).

**Spec:** `docs/superpowers/specs/planejadas/2026-09-01-analise-llm-multimodal-design.md`

## Global Constraints

- Reaproveita 100% os primitivos globais já existentes em `src/styles.scss` (`.panel`, `.detail-field`, `.detail-label`, `.detail-value`, `.status`, `.btn`, `.vazio`) — nenhum CSS novo, nenhuma biblioteca de UI, nenhum `styleUrl` por componente (spec §3, nota de design do roteiro §4).
- Toda chamada HTTP usa `withCredentials: true` (convenção de todo o projeto).
- Ação é GESTOR-only — gated pela mesma condição já usada nesta tela (`auth.role() === 'GESTOR'`).
- Falha de rede/parse no backend sempre volta como `200 OK` com um campo `status` (`OK`/`ERRO_PARSE`/`ERRO_API`) — o front nunca trata a chamada de análise como erro HTTP quando o backend respondeu; só trata como erro de fato se a própria requisição falhar (rede, 403, etc).
- `cypher-capture` não é tocado por este plano.

---

### Task 1: `LlmAnalysisService`

**Files:**
- Create: `src/app/shared/llm-analysis.models.ts`
- Create: `src/app/shared/llm-analysis.service.ts`
- Test: `src/app/shared/llm-analysis.service.spec.ts`

**Interfaces:**
- Produces: `AnalysisStatus = 'OK' | 'ERRO_PARSE' | 'ERRO_API'`; `RiskAnalysisResponse` interface espelhando o DTO Java (`situacao`, `episIdentificados`, `episAusentes`, `riscoIdentificado`, `tipoRisco`, `nivelRisco`, `justificativa`, `acaoRecomendada`, `provider`, `promptVersion`, `status`, `geradoEm`); `LlmAnalysisService.analisar(id: number): Observable<RiskAnalysisResponse>`.

- [ ] **Step 1: Escrever o teste (falho)**

```ts
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { RiskAnalysisResponse } from './llm-analysis.models';
import { LlmAnalysisService } from './llm-analysis.service';

describe('LlmAnalysisService', () => {
  let service: LlmAnalysisService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(LlmAnalysisService);
    http = TestBed.inject(HttpTestingController);
  });

  it('analisar posta no endpoint de analise, com credenciais', () => {
    const resposta: RiskAnalysisResponse = {
      situacao: 'trabalhador proximo a maquina',
      episIdentificados: ['capacete'],
      episAusentes: ['luvas'],
      riscoIdentificado: true,
      tipoRisco: 'aproximacao de zona perigosa',
      nivelRisco: 'alto',
      justificativa: 'muito perto da area de movimentacao',
      acaoRecomendada: 'interromper a operacao',
      provider: 'claude',
      promptVersion: 'v2',
      status: 'OK',
      geradoEm: '2026-09-01T10:00:00-03:00',
    };
    let recebido: RiskAnalysisResponse | undefined;
    service.analisar(42).subscribe(r => (recebido = r));

    const req = http.expectOne(`${environment.apiUrl}/incidents/42/analyze`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush(resposta);

    expect(recebido).toEqual(resposta);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/app/shared/llm-analysis.service.spec.ts`
Expected: FAIL — `./llm-analysis.models` e `./llm-analysis.service` não existem.

- [ ] **Step 3: Criar o model**

```ts
export type AnalysisStatus = 'OK' | 'ERRO_PARSE' | 'ERRO_API';

/** Espelho do contrato da API (spec §2.2). */
export interface RiskAnalysisResponse {
  situacao: string | null;
  episIdentificados: string[];
  episAusentes: string[];
  riscoIdentificado: boolean;
  tipoRisco: string | null;
  nivelRisco: string | null;
  justificativa: string | null;
  acaoRecomendada: string | null;
  provider: string;
  promptVersion: string;
  status: AnalysisStatus;
  geradoEm: string;
}
```

- [ ] **Step 4: Criar o serviço**

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { RiskAnalysisResponse } from './llm-analysis.models';

/**
 * Aciona a analise de risco por LLM multimodal para um incidente (spec §3.3).
 * Sem signal/store: e uma acao pontual por incidente, nao dado "ao vivo".
 */
@Injectable({ providedIn: 'root' })
export class LlmAnalysisService {
  private http = inject(HttpClient);

  analisar(id: number): Observable<RiskAnalysisResponse> {
    return this.http.post<RiskAnalysisResponse>(
      `${environment.apiUrl}/incidents/${id}/analyze`, {}, { withCredentials: true });
  }
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/app/shared/llm-analysis.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/shared/llm-analysis.models.ts src/app/shared/llm-analysis.service.ts src/app/shared/llm-analysis.service.spec.ts
git commit -m "feat: LlmAnalysisService e modelo de resposta da analise de risco"
```

---

### Task 2: Botão e painel de resultado em `IncidentDetailComponent`

**Files:**
- Modify: `src/app/incidents/incident-detail.component.ts`
- Modify: `src/app/incidents/incident-detail.component.html`
- Modify: `src/app/incidents/incident-detail.component.spec.ts`

**Interfaces:**
- Consumes: `LlmAnalysisService.analisar(id: number): Observable<RiskAnalysisResponse>` (Task 1), `RiskAnalysisResponse`/`AnalysisStatus` (Task 1).
- Produces: `IncidentDetailComponent.analisarComIa(): void`, signals `analisando: Signal<boolean>`, `analiseResultado: Signal<RiskAnalysisResponse | null>`, `analiseErro: Signal<string | null>`.

- [ ] **Step 1: Escrever os testes (falhos)**

Adicionar ao final de `src/app/incidents/incident-detail.component.spec.ts` (dentro do `describe` existente, depois do último `it`):

```ts
  it('gestor clica em Analisar com IA e ve o resultado estruturado', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    harness.detectChanges();

    const botao = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Analisar com IA') as HTMLButtonElement;
    botao.click();

    const req = http.expectOne(`${environment.apiUrl}/incidents/42/analyze`);
    expect(req.request.method).toBe('POST');
    req.flush({
      situacao: 'trabalhador proximo a maquina', episIdentificados: ['capacete'],
      episAusentes: ['luvas'], riscoIdentificado: true, tipoRisco: 'aproximacao de zona perigosa',
      nivelRisco: 'alto', justificativa: 'muito perto da area de movimentacao',
      acaoRecomendada: 'interromper a operacao', provider: 'claude', promptVersion: 'v2',
      status: 'OK', geradoEm: '2026-09-01T10:00:00-03:00',
    });
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('trabalhador proximo a maquina');
    expect(harness.routeNativeElement?.textContent).toContain('interromper a operacao');
  });

  it('resposta com status ERRO_PARSE mostra aviso em vez de campos vazios', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    harness.detectChanges();

    const botao = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Analisar com IA') as HTMLButtonElement;
    botao.click();

    http.expectOne(`${environment.apiUrl}/incidents/42/analyze`).flush({
      situacao: null, episIdentificados: [], episAusentes: [], riscoIdentificado: false,
      tipoRisco: null, nivelRisco: null, justificativa: null, acaoRecomendada: null,
      provider: 'claude', promptVersion: 'v2', status: 'ERRO_PARSE', geradoEm: '2026-09-01T10:00:00-03:00',
    });
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent?.toLowerCase())
      .toContain('não no formato esperado');
  });

  it('falha na requisicao mostra mensagem e reabilita o botao', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    harness.detectChanges();

    const botao = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Analisar com IA') as HTMLButtonElement;
    botao.click();

    http.expectOne(`${environment.apiUrl}/incidents/42/analyze`)
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent?.toLowerCase()).toContain('não foi possível analisar');
    expect(botao.disabled).toBe(false);
  });

  it('operador nao ve o botao Analisar com IA', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/incidentes/42', IncidentDetailComponent);
    http.expectOne(`${environment.apiUrl}/incidents/42`).flush(incidente());
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ papel: 'OPERADOR', username: 'op1' });
    harness.detectChanges();

    const botao = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? [])
      .find(b => b.textContent?.trim() === 'Analisar com IA');
    expect(botao).toBeUndefined();
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/app/incidents/incident-detail.component.spec.ts`
Expected: FAIL — o botão "Analisar com IA" ainda não existe no template.

- [ ] **Step 3: Atualizar `incident-detail.component.ts`**

```ts
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../shared/auth/auth.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { ConfigService } from '../shared/config.service';
import { DockComponent } from '../shared/dock/dock.component';
import { IncidentService } from '../shared/incident.service';
import {
  AlertaStatus, Incident, formatDateTime, incidentLabel, mensagemDeErro,
} from '../shared/incident.models';
import { LlmAnalysisService } from '../shared/llm-analysis.service';
import { RiskAnalysisResponse } from '../shared/llm-analysis.models';

@Component({
  selector: 'app-incident-detail',
  imports: [ChromeTopbarComponent, DockComponent, RouterLink],
  templateUrl: './incident-detail.component.html',
})
export class IncidentDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private incidentService = inject(IncidentService);
  private cfgService = inject(ConfigService);
  private authService = inject(AuthService);
  private llmService = inject(LlmAnalysisService);
  readonly auth = this.authService;

  cfg = this.cfgService.config;
  private readonly id = Number(this.route.snapshot.paramMap.get('id'));

  private readonly buscado = signal<Incident | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  readonly analisando = signal(false);
  readonly analiseResultado = signal<RiskAnalysisResponse | null>(null);
  readonly analiseErro = signal<string | null>(null);

  /**
   * Prefere o store global (fresco via SSE); cai para o resultado do GET
   * inicial se o item saiu da janela de 100 em memória (spec §4).
   */
  readonly incidente = computed(() =>
    this.incidentService.incidents().find(i => i.id === this.id) ?? this.buscado());

  hora = formatDateTime;
  rotulo = incidentLabel;

  ngOnInit(): void {
    this.incidentService.getById(this.id).subscribe({
      next: inc => {
        this.buscado.set(inc);
        this.carregando.set(false);
      },
      error: erro => {
        this.erro.set(mensagemDeErro(erro));
        this.carregando.set(false);
      },
    });
  }

  mudarStatus(status: AlertaStatus): void {
    this.incidentService.acknowledge(this.id, status);
  }

  analisarComIa(): void {
    this.analisando.set(true);
    this.analiseErro.set(null);
    this.llmService.analisar(this.id).subscribe({
      next: resultado => {
        this.analiseResultado.set(resultado);
        this.analisando.set(false);
      },
      error: () => {
        this.analiseErro.set('Não foi possível analisar agora. Tente novamente.');
        this.analisando.set(false);
      },
    });
  }
}
```

- [ ] **Step 4: Atualizar `incident-detail.component.html`**

Inserir, logo após o bloco `.detail-snapshot` (depois do `</div>` que fecha ele) e antes de `.detail-grid`:

```html
        @if (auth.role() === 'GESTOR') {
          <div class="detail-llm">
            <button type="button" class="btn ghost" [disabled]="analisando()" (click)="analisarComIa()">
              {{ analisando() ? 'Analisando…' : 'Analisar com IA' }}
            </button>

            @if (analiseErro()) {
              <div class="vazio">{{ analiseErro() }}</div>
            }

            @if (analiseResultado(); as resultado) {
              @if (resultado.status === 'ERRO_PARSE') {
                <div class="vazio">O modelo respondeu, mas não no formato esperado.</div>
              } @else {
                <div class="panel">
                  <div class="detail-field"><span class="detail-label">Situação</span><span class="detail-value">{{ resultado.situacao }}</span></div>
                  <div class="detail-field"><span class="detail-label">EPIs identificados</span><span class="detail-value">{{ resultado.episIdentificados.join(', ') || '—' }}</span></div>
                  <div class="detail-field"><span class="detail-label">EPIs ausentes</span><span class="detail-value">{{ resultado.episAusentes.join(', ') || '—' }}</span></div>
                  <div class="detail-field"><span class="detail-label">Risco</span><span class="status">{{ resultado.riscoIdentificado ? resultado.nivelRisco : 'nenhum' }}</span></div>
                  <div class="detail-field"><span class="detail-label">Justificativa</span><span class="detail-value">{{ resultado.justificativa }}</span></div>
                  <div class="detail-field"><span class="detail-label">Ação recomendada</span><span class="detail-value">{{ resultado.acaoRecomendada }}</span></div>
                </div>
              }
            }
          </div>
        }
```

O arquivo completo fica assim (linhas 21-42 substituem as antigas 21-27):

```html
        <div class="detail-snapshot">
          @if (inc.snapshotUrl) {
            <img [src]="inc.snapshotUrl" alt="Snapshot do incidente"/>
          } @else {
            <div class="detail-snapshot-vazio">processando imagem…</div>
          }
        </div>

        @if (auth.role() === 'GESTOR') {
          <div class="detail-llm">
            <button type="button" class="btn ghost" [disabled]="analisando()" (click)="analisarComIa()">
              {{ analisando() ? 'Analisando…' : 'Analisar com IA' }}
            </button>

            @if (analiseErro()) {
              <div class="vazio">{{ analiseErro() }}</div>
            }

            @if (analiseResultado(); as resultado) {
              @if (resultado.status === 'ERRO_PARSE') {
                <div class="vazio">O modelo respondeu, mas não no formato esperado.</div>
              } @else {
                <div class="panel">
                  <div class="detail-field"><span class="detail-label">Situação</span><span class="detail-value">{{ resultado.situacao }}</span></div>
                  <div class="detail-field"><span class="detail-label">EPIs identificados</span><span class="detail-value">{{ resultado.episIdentificados.join(', ') || '—' }}</span></div>
                  <div class="detail-field"><span class="detail-label">EPIs ausentes</span><span class="detail-value">{{ resultado.episAusentes.join(', ') || '—' }}</span></div>
                  <div class="detail-field"><span class="detail-label">Risco</span><span class="status">{{ resultado.riscoIdentificado ? resultado.nivelRisco : 'nenhum' }}</span></div>
                  <div class="detail-field"><span class="detail-label">Justificativa</span><span class="detail-value">{{ resultado.justificativa }}</span></div>
                  <div class="detail-field"><span class="detail-label">Ação recomendada</span><span class="detail-value">{{ resultado.acaoRecomendada }}</span></div>
                </div>
              }
            }
          </div>
        }

        <div class="detail-grid">
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/app/incidents/incident-detail.component.spec.ts`
Expected: PASS — inclusive os testes já existentes antes desta tarefa (nenhuma regressão).

- [ ] **Step 6: Commit**

```bash
git add src/app/incidents/incident-detail.component.ts src/app/incidents/incident-detail.component.html src/app/incidents/incident-detail.component.spec.ts
git commit -m "feat: botao Analisar com IA e painel de resultado no detalhe do incidente"
```

---

### Task 3: Modo mock

**Files:**
- Modify: `src/app/shared/mock/mock-api.interceptor.ts`

**Interfaces:**
- Consumes: `RiskAnalysisResponse` (Task 1), arrays `INCIDENTS`/`EMITIDOS` já existentes no interceptor.
- Produces: handler mock para `POST /api/v1/incidents/{id}/analyze`.

- [ ] **Step 1: Adicionar o handler**

Em `src/app/shared/mock/mock-api.interceptor.ts`, logo depois do bloco existente de `PUT .../status` (antes do `return undefined;` final), adicionar:

```ts
  const prefixoAnalyze = `${base}/incidents/`;
  const sufixoAnalyze = '/analyze';
  if (req.method === 'POST' && req.url.startsWith(prefixoAnalyze) && req.url.endsWith(sufixoAnalyze)) {
    const id = Number(req.url.slice(prefixoAnalyze.length, -sufixoAnalyze.length));
    const alvo = [...INCIDENTS, ...EMITIDOS].find(i => i.id === id);
    if (!alvo) {
      return naoEncontrado(`Incidente inexistente: ${id}`);
    }
    if (!alvo.snapshotUrl) {
      return naoProcessavel('Nenhuma imagem disponível para análise deste incidente');
    }
    const risco = alvo.severity >= 3;
    return {
      situacao: risco
        ? `Trabalhador próximo a ${alvo.cameraId}, sinais de risco visíveis na cena`
        : 'Cena sem sinais de risco aparentes',
      episIdentificados: alvo.epiPresent,
      episAusentes: alvo.epiMissing,
      riscoIdentificado: risco,
      tipoRisco: risco ? 'aproximação de zona perigosa' : null,
      nivelRisco: risco ? 'alto' : 'baixo',
      justificativa: risco
        ? 'A postura observada e a proximidade da máquina indicam risco elevado.'
        : 'Nenhuma condição de risco identificada na imagem.',
      acaoRecomendada: risco ? 'Interromper a operação e alertar o supervisor' : 'Nenhuma ação necessária',
      provider: 'claude',
      promptVersion: 'v2',
      status: 'OK',
      geradoEm: new Date().toISOString(),
    };
  }

  return undefined;
}
```

Import necessário no topo do arquivo (junto aos demais imports de fixtures/helpers já existentes): nenhum novo — `naoEncontrado`/`naoProcessavel` já existem no próprio arquivo (linhas 39-41, 64-66).

- [ ] **Step 2: Verificar manualmente em modo mock**

Run: `npm start` (com a flag de mock ativada, conforme já documentado em `implementadas/2026-08-12-tema-flag-mock-tipografia-design.md`), abrir um incidente com `severity >= 3`, clicar em "Analisar com IA" e confirmar que o painel mostra `nivelRisco: alto`; abrir um incidente com `severity < 3` e confirmar `nivelRisco: baixo`.

Expected: painel renderiza os dois casos sem erro no console.

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/mock/mock-api.interceptor.ts
git commit -m "feat: mock do endpoint de analise de risco por LLM"
```

---

## Self-Review

**1. Cobertura do spec:** §3.1 (posição do botão, gated por GESTOR) → Task 2. §3.2 (novo estado no componente) → Task 2. §3.3 (`LlmAnalysisService`) → Task 1. §3.4 (painel de resultado, tratamento de `ERRO_PARSE`) → Task 2. §3.5 (modelo TS e modo mock) → Tasks 1 e 3. §4 (tabela de falha, caso "falha na requisição") → Task 2, teste de erro de rede.

**2. Varredura de placeholder:** nenhum "TBD"/"implementar depois" — toda etapa tem código completo, incluindo o handler mock com dados derivados do próprio incidente (não um placeholder estático).

**3. Consistência de tipos:** `RiskAnalysisResponse` (Task 1) é usado sem alteração de campo em Task 2 (template e testes) e Task 3 (handler mock). `LlmAnalysisService.analisar(id: number)` (Task 1) é chamado com a mesma assinatura em Task 2.
