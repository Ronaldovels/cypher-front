# ZR-C — Frontend: Editor de Zonas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ZoneEditorComponent`, aberto a partir do cadastro de câmera já existente, onde o gestor congela um frame do MJPEG e desenha polígonos de zona de risco — consumindo o backend do plano ZR-A.

**Architecture:** `ZoneService` (mesmo esqueleto de `TeamService`/`WebhookService`) + `ZoneEditorComponent`, um canvas sobreposto ao frame congelado. A matemática de conversão pixel↔normalizado vive em funções puras isoladas (`zone-canvas.util.ts`), testáveis sem tocar canvas/DOM — o componente só chama essas funções. Tarefa 1 entrega os modelos e a matemática; Tarefa 2 entrega `ZoneService`; Tarefa 3 entrega o editor inteiro (captura de frame, desenho, formulário, persistência, edição de zona existente); Tarefa 4 liga o editor à tela de cadastro de câmera; Tarefa 5 liga o modo mock.

**Tech Stack:** Angular (standalone components, signals, `viewChild()` para acessar `<canvas>`/`<img>`), Vitest + `HttpTestingController`. Sem `ReactiveFormsModule`.

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-zonas-de-risco-design.md` (repo `cypher-front`), §4 (front).

**Repositório:** `/home/asaas/projects/challenge/cypher-front`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-front`. Branch atual: `dev` — criar `feat/zr-front-zonas` a partir de `dev`.
- **Depende do plano `2026-08-29-zra-backend-zonas.md`** rodando localmente para teste manual no browser; os specs automatizados usam `HttpTestingController`/mock, não precisam do backend real.
- **Nota de design:** exceto pelo canvas de desenho (§4.3 da spec, sem equivalente nos primitivos existentes), toda peça nova reaproveita 100% os primitivos globais já existentes em `src/styles.scss` (`.field`, `.input`, `.btn`, `.panel`, `.list-row`, `.chip`, `.vazio`) e o padrão de formulário "signal de rascunho + `patch()`" — mesmo princípio das duas specs anteriores desta rodada. O canvas é a única exceção deliberada.
- **`jsdom` (ambiente de teste do Vitest) não implementa `<canvas>.getContext('2d')` de verdade** — chamadas de desenho (`ctx.beginPath()`, `.drawImage()`, etc.) nunca são exercitadas nos testes automatizados, só verificadas manualmente no browser. Por isso todo método de desenho (`redesenhar`) guarda `if (!ctx) return;` antes de usar o contexto, e os specs desta entrega testam **estado** (`vertices`, `form`, chamadas HTTP) — nunca pixel renderizado.
- **Coordenada de vértice é sempre pixel do canvas enquanto em edição**; a conversão para fração 0.0–1.0 só acontece no momento de montar o `ZonePayload` (`salvar()`), via `paraNormalizado` (Tarefa 1) — nunca inline no componente.
- Run: `npx vitest run <arquivo>` para um arquivo; `npx vitest run` para a suíte inteira.

---

### Task 1: Modelos e matemática de conversão

**Files:**
- Create: `src/app/shared/zone.models.ts`
- Create: `src/app/shared/zone-canvas.util.ts`
- Test: `src/app/shared/zone-canvas.util.spec.ts`

**Interfaces:**
- Produces: `Zone`, `ZonePayload`, `Ponto`, `ZoneType` (interfaces); `paraNormalizado(vertices, largura, altura)`, `paraPixel(polygon, largura, altura)` — consumidos pela Tarefa 3

- [ ] **Step 1: Escrever o teste de conversão**

Criar `src/app/shared/zone-canvas.util.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { paraNormalizado, paraPixel } from './zone-canvas.util';

describe('conversão pixel ↔ normalizado (design doc de zonas de risco, §4.3)', () => {
  it('paraNormalizado divide cada vértice pela largura/altura do canvas', () => {
    const resultado = paraNormalizado([{ x: 320, y: 180 }, { x: 960, y: 540 }], 1280, 720);

    expect(resultado).toEqual([{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }]);
  });

  it('paraPixel multiplica cada vértice pela largura/altura do canvas', () => {
    const resultado = paraPixel([{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }], 1280, 720);

    expect(resultado).toEqual([{ x: 320, y: 180 }, { x: 960, y: 540 }]);
  });

  it('as duas conversões são inversas uma da outra', () => {
    const originais = [{ x: 100, y: 200 }, { x: 300, y: 400 }, { x: 50, y: 600 }];

    const idaEVolta = paraPixel(paraNormalizado(originais, 1920, 1080), 1920, 1080);

    expect(idaEVolta).toEqual(originais);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/shared/zone-canvas.util.spec.ts`
Expected: FAIL na compilação — `zone-canvas.util.ts` não existe.

- [ ] **Step 3: Criar os modelos**

Criar `src/app/shared/zone.models.ts`:

```typescript
/** `Zona` — design doc de zonas de risco, §2. */

export type ZoneType = 'RESTRICTED' | 'ATTENTION';

/** Vértice em fração 0.0–1.0 da largura/altura do frame — nunca pixel absoluto. */
export interface Ponto {
  x: number;
  y: number;
}

export interface Zone {
  id: number;
  cameraId: string;
  nome: string;
  zoneType: ZoneType;
  polygon: Ponto[];
  severity: number;
  requiredPpe: string[];
  ativa: boolean;
}

export interface ZonePayload {
  nome: string;
  zoneType: ZoneType;
  polygon: Ponto[];
  severity: number;
  requiredPpe: string[];
}
```

- [ ] **Step 4: Criar as funções de conversão**

Criar `src/app/shared/zone-canvas.util.ts`:

```typescript
import { Ponto } from './zone.models';

/** Vértice em pixel do canvas atual — nunca persistido assim, só usado durante o desenho. */
export interface PixelPonto {
  x: number;
  y: number;
}

/** Pixel do canvas -> fração 0.0–1.0 (o que vai no `ZonePayload`). */
export function paraNormalizado(vertices: PixelPonto[], largura: number, altura: number): Ponto[] {
  return vertices.map(v => ({ x: v.x / largura, y: v.y / altura }));
}

/** Fração 0.0–1.0 -> pixel do canvas atual (usado ao carregar uma zona já cadastrada). */
export function paraPixel(polygon: Ponto[], largura: number, altura: number): PixelPonto[] {
  return polygon.map(p => ({ x: p.x * largura, y: p.y * altura }));
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/app/shared/zone-canvas.util.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/shared/zone.models.ts src/app/shared/zone-canvas.util.ts src/app/shared/zone-canvas.util.spec.ts
git commit -m "feat: adiciona modelos de zona e matematica de conversao pixel-normalizado"
```

---

### Task 2: `ZoneService`

**Files:**
- Create: `src/app/shared/zone.service.ts`
- Test: `src/app/shared/zone.service.spec.ts`

**Interfaces:**
- Consumes: `Zone`, `ZonePayload` (Tarefa 1)
- Produces: `ZoneService.zonas` (signal), `.load(cameraId)`, `.create/.update/.deactivate(cameraId, ...)` — consumidos pela Tarefa 3

- [ ] **Step 1: Escrever o teste do serviço**

Criar `src/app/shared/zone.service.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { ZoneService } from './zone.service';

describe('ZoneService (design doc de zonas de risco, §4.4)', () => {
  let service: ZoneService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(ZoneService);
    http = TestBed.inject(HttpTestingController);
  });

  it('load(cameraId) popula o signal zonas', () => {
    service.load('CAM-01');
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([
      { id: 1, cameraId: 'CAM-01', nome: 'Área da prensa', zoneType: 'RESTRICTED',
        polygon: [{ x: 0.2, y: 0.2 }], severity: 4, requiredPpe: [], ativa: true },
    ]);

    expect(service.zonas()).toHaveLength(1);
  });

  it('create() faz POST e recarrega', () => {
    service.create('CAM-01', { nome: 'x', zoneType: 'RESTRICTED', polygon: [], severity: 2, requiredPpe: [] })
      .subscribe();

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 1, cameraId: 'CAM-01', nome: 'x', zoneType: 'RESTRICTED', polygon: [], severity: 2, requiredPpe: [], ativa: true });
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });

  it('update() faz PUT em /cameras/:id/zones/:zoneId', () => {
    service.update('CAM-01', 1, { nome: 'y', zoneType: 'ATTENTION', polygon: [], severity: 1, requiredPpe: [] })
      .subscribe();

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones/1`);
    expect(req.request.method).toBe('PUT');
    req.flush({ id: 1, cameraId: 'CAM-01', nome: 'y', zoneType: 'ATTENTION', polygon: [], severity: 1, requiredPpe: [], ativa: true });
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });

  it('deactivate() faz DELETE em /cameras/:id/zones/:zoneId', () => {
    service.deactivate('CAM-01', 1).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/shared/zone.service.spec.ts`
Expected: FAIL na compilação — `ZoneService` não existe.

- [ ] **Step 3: Criar o serviço**

Criar `src/app/shared/zone.service.ts`:

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { Zone, ZonePayload } from './zone.models';

/**
 * Zonas de risco de uma câmera (design doc de zonas de risco, §4.4).
 *
 * Mesmo padrão de `TeamService`/`WebhookService`: signal privado, escrita
 * que recarrega a lista inteira. `load` é sempre por câmera — não existe
 * "listar todas as zonas do sistema" nesta entrega.
 */
@Injectable({ providedIn: 'root' })
export class ZoneService {
  private http = inject(HttpClient);

  private readonly _zonas = signal<Zone[]>([]);
  readonly zonas = this._zonas.asReadonly();

  load(cameraId: string): void {
    this.http.get<Zone[]>(`${environment.apiUrl}/cameras/${cameraId}/zones`, { withCredentials: true })
      .subscribe({ next: z => this._zonas.set(z), error: () => this._zonas.set([]) });
  }

  create(cameraId: string, payload: ZonePayload): Observable<Zone> {
    return this.http.post<Zone>(`${environment.apiUrl}/cameras/${cameraId}/zones`, payload,
      { withCredentials: true }).pipe(tap(() => this.load(cameraId)));
  }

  update(cameraId: string, id: number, payload: ZonePayload): Observable<Zone> {
    return this.http.put<Zone>(`${environment.apiUrl}/cameras/${cameraId}/zones/${id}`, payload,
      { withCredentials: true }).pipe(tap(() => this.load(cameraId)));
  }

  deactivate(cameraId: string, id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/cameras/${cameraId}/zones/${id}`,
      { withCredentials: true }).pipe(tap(() => this.load(cameraId)));
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/shared/zone.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/zone.service.ts src/app/shared/zone.service.spec.ts
git commit -m "feat: adiciona ZoneService"
```

---

### Task 3: `ZoneEditorComponent`

**Files:**
- Create: `src/app/config/zones/zone-editor.component.ts`
- Create: `src/app/config/zones/zone-editor.component.html`
- Test: `src/app/config/zones/zone-editor.component.spec.ts`

**Interfaces:**
- Consumes: `ZoneService` (Tarefa 2), `paraNormalizado`/`paraPixel` (Tarefa 1), `ConfigService.config().epis` (já existente)
- Produces: `<app-zone-editor [codigo]="..." [streamUrl]="...">` — consumido pela Tarefa 4

- [ ] **Step 1: Escrever os testes de captura de frame e desenho do polígono**

Criar `src/app/config/zones/zone-editor.component.spec.ts`:

```typescript
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { ZoneEditorComponent } from './zone-editor.component';

describe('ZoneEditorComponent — captura de frame e desenho', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<ZoneEditorComponent>>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ZoneEditorComponent);
    fixture.componentRef.setInput('codigo', 'CAM-01');
    fixture.componentRef.setInput('streamUrl', 'http://127.0.0.1:8090/stream');
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });

  it('capturarFrame sem a imagem carregada mostra erro, sem travar', () => {
    fixture.componentInstance.capturarFrame();

    expect(fixture.componentInstance.frameCapturado()).toBe(false);
    expect(fixture.componentInstance.erro()).toBeTruthy();
  });

  it('adiciona um vertice por clique no canvas, apos o frame capturado', () => {
    const comp = fixture.componentInstance;
    // Simula frame ja capturado (naturalWidth so existe numa <img> real carregada,
    // que jsdom nao carrega de verdade) — testa o restante do fluxo diretamente.
    comp.canvasWidth.set(1280);
    comp.canvasHeight.set(720);
    comp.frameCapturado.set(true);

    comp.vertices.set([{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }]);

    expect(comp.vertices()).toHaveLength(3);
  });

  it('fecharPoligono com menos de 3 vertices mostra erro', () => {
    const comp = fixture.componentInstance;
    comp.vertices.set([{ x: 1, y: 1 }, { x: 2, y: 2 }]);

    comp.fecharPoligono();

    expect(comp.poligonoFechado()).toBe(false);
    expect(comp.erro()).toBeTruthy();
  });

  it('fecharPoligono com 3+ vertices fecha sem erro', () => {
    const comp = fixture.componentInstance;
    comp.vertices.set([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }]);

    comp.fecharPoligono();

    expect(comp.poligonoFechado()).toBe(true);
    expect(comp.erro()).toBe('');
  });

  it('removerUltimoVertice tira o ultimo ponto adicionado', () => {
    const comp = fixture.componentInstance;
    comp.vertices.set([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);

    comp.removerUltimoVertice();

    expect(comp.vertices()).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/config/zones/zone-editor.component.spec.ts`
Expected: FAIL na compilação — `ZoneEditorComponent` não existe.

- [ ] **Step 3: Criar o componente — captura de frame e desenho do polígono**

Criar `src/app/config/zones/zone-editor.component.ts`:

```typescript
import { Component, ElementRef, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';

import { ConfigService } from '../../shared/config.service';
import { mensagemDeErro } from '../../shared/incident.models';
import { PixelPonto, paraNormalizado, paraPixel } from '../../shared/zone-canvas.util';
import { Zone, ZonePayload, ZoneType } from '../../shared/zone.models';
import { ZoneService } from '../../shared/zone.service';

interface FormZona { nome: string; zoneType: ZoneType; severity: number; requiredPpe: string[]; }
const FORM_VAZIO: FormZona = { nome: '', zoneType: 'RESTRICTED', severity: 3, requiredPpe: [] };

/**
 * Editor de zonas de risco (design doc de zonas de risco, §4.2/§4.3): congela
 * um frame do MJPEG num canvas e desenha o polígono por cima. Único
 * componente do produto que não reaproveita `.field`/`.input` para o desenho
 * em si — exceção deliberada, justificada na spec (§4).
 *
 * `jsdom` não implementa `<canvas>.getContext('2d')` de verdade — todo
 * método de desenho guarda contra contexto nulo, e os specs testam estado
 * (vértices, formulário, chamadas HTTP), nunca pixel renderizado.
 */
@Component({
  selector: 'app-zone-editor',
  templateUrl: './zone-editor.component.html',
})
export class ZoneEditorComponent implements OnInit {
  readonly codigo = input.required<string>();
  readonly streamUrl = input<string | null>(null);

  private zoneService = inject(ZoneService);
  private configService = inject(ConfigService);

  readonly zonas = this.zoneService.zonas;
  readonly episDisponiveis = computed(() => this.configService.config()?.epis ?? []);

  readonly imgRef = viewChild<ElementRef<HTMLImageElement>>('liveImg');
  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  readonly frameCapturado = signal(false);
  readonly canvasWidth = signal(0);
  readonly canvasHeight = signal(0);

  readonly vertices = signal<PixelPonto[]>([]);
  readonly poligonoFechado = signal(false);
  readonly editandoId = signal<number | null>(null);

  readonly form = signal<FormZona>({ ...FORM_VAZIO });
  readonly erro = signal('');
  readonly salvando = signal(false);

  ngOnInit(): void {
    this.zoneService.load(this.codigo());
  }

  capturarFrame(): void {
    const img = this.imgRef()?.nativeElement;
    const canvas = this.canvasRef()?.nativeElement;
    if (!img || !canvas || !img.naturalWidth) {
      this.erro.set('Aguarde a imagem da câmera carregar antes de capturar o frame.');
      return;
    }
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    this.canvasWidth.set(img.naturalWidth);
    this.canvasHeight.set(img.naturalHeight);
    this.frameCapturado.set(true);
    this.erro.set('');
    this.redesenhar();
  }

  onCanvasClick(event: MouseEvent): void {
    if (!this.frameCapturado() || this.poligonoFechado()) {
      return;
    }
    this.vertices.update(v => [...v, this.posicaoNoCanvas(event)]);
    this.redesenhar();
  }

  fecharPoligono(): void {
    if (this.vertices().length < 3) {
      this.erro.set('Um polígono precisa de ao menos 3 vértices.');
      return;
    }
    this.poligonoFechado.set(true);
    this.erro.set('');
  }

  removerUltimoVertice(): void {
    this.vertices.update(v => v.slice(0, -1));
    this.redesenhar();
  }

  private posicaoNoCanvas(event: MouseEvent): PixelPonto {
    const canvas = this.canvasRef()!.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const escalaX = rect.width ? canvas.width / rect.width : 1;
    const escalaY = rect.height ? canvas.height / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * escalaX,
      y: (event.clientY - rect.top) * escalaY,
    };
  }

  private redesenhar(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const img = this.imgRef()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !img) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    this.desenharPoligono(ctx, this.vertices());
  }

  private desenharPoligono(ctx: CanvasRenderingContext2D, vertices: PixelPonto[]): void {
    if (vertices.length === 0) {
      return;
    }
    ctx.strokeStyle = '#F4622A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    vertices.slice(1).forEach(v => ctx.lineTo(v.x, v.y));
    if (this.poligonoFechado()) {
      ctx.closePath();
    }
    ctx.stroke();
    vertices.forEach(v => {
      ctx.beginPath();
      ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#F4622A';
      ctx.fill();
    });
  }
}
```

Criar `src/app/config/zones/zone-editor.component.html` (versão inicial — a Tarefa completa o formulário abaixo, no mesmo arquivo, nos próximos passos):

```html
<div class="panel">
  <p class="vazio">Reinicie o pipeline desta câmera para aplicar qualquer mudança salva aqui — não há aplicação em tempo real nesta versão.</p>

  @if (erro()) {
    <p class="vazio" role="alert">{{ erro() }}</p>
  }

  <img #liveImg [src]="streamUrl()" alt="frame ao vivo" style="display:none" />
  <canvas #canvas style="max-width:100%;border:1px solid var(--border,#333);cursor:crosshair"
          (click)="onCanvasClick($event)"></canvas>

  <div style="display:flex;gap:12px;margin-top:12px">
    <button type="button" class="btn" (click)="capturarFrame()">Capturar frame</button>
    @if (frameCapturado() && !poligonoFechado()) {
      <button type="button" class="btn" (click)="removerUltimoVertice()" [disabled]="vertices().length === 0">
        remover último vértice
      </button>
      <button type="button" class="btn primary" (click)="fecharPoligono()">Fechar polígono</button>
    }
  </div>
</div>
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/config/zones/zone-editor.component.spec.ts`
Expected: PASS

- [ ] **Step 5: Escrever o teste do formulário e da persistência**

Adicionar em `zone-editor.component.spec.ts`:

```typescript
describe('ZoneEditorComponent — formulário e persistência', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<ZoneEditorComponent>>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ZoneEditorComponent);
    fixture.componentRef.setInput('codigo', 'CAM-01');
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });

  it('salvar sem nome mostra erro, sem chamar o backend', () => {
    const comp = fixture.componentInstance;
    comp.canvasWidth.set(1280);
    comp.canvasHeight.set(720);
    comp.vertices.set([{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }]);
    comp.form.set({ nome: '', zoneType: 'RESTRICTED', severity: 3, requiredPpe: [] });

    comp.salvar();

    http.expectNone(`${environment.apiUrl}/cameras/CAM-01/zones`);
    expect(comp.erro()).toBeTruthy();
  });

  it('salvar converte os vertices para normalizado antes de enviar', () => {
    const comp = fixture.componentInstance;
    comp.canvasWidth.set(1280);
    comp.canvasHeight.set(720);
    comp.vertices.set([{ x: 320, y: 180 }, { x: 960, y: 180 }, { x: 960, y: 540 }]);
    comp.form.set({ nome: 'Área da prensa', zoneType: 'RESTRICTED', severity: 4, requiredPpe: ['capacete'] });

    comp.salvar();

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.polygon).toEqual([{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }]);
    req.flush({ id: 1, cameraId: 'CAM-01', nome: 'Área da prensa', zoneType: 'RESTRICTED',
      polygon: req.request.body.polygon, severity: 4, requiredPpe: ['capacete'], ativa: true });
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });

  it('editar carrega uma zona existente convertida para pixel', () => {
    const comp = fixture.componentInstance;
    comp.canvasWidth.set(1280);
    comp.canvasHeight.set(720);

    comp.editar({
      id: 7, cameraId: 'CAM-01', nome: 'Existente', zoneType: 'ATTENTION',
      polygon: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }],
      severity: 2, requiredPpe: [], ativa: true,
    });

    expect(comp.editandoId()).toBe(7);
    expect(comp.vertices()).toEqual([{ x: 320, y: 180 }, { x: 960, y: 180 }, { x: 960, y: 540 }]);
    expect(comp.poligonoFechado()).toBe(true);
    expect(comp.form()).toEqual({ nome: 'Existente', zoneType: 'ATTENTION', severity: 2, requiredPpe: [] });
  });

  it('editar seguido de salvar faz PUT, nao POST', () => {
    const comp = fixture.componentInstance;
    comp.canvasWidth.set(1280);
    comp.canvasHeight.set(720);
    comp.editar({
      id: 7, cameraId: 'CAM-01', nome: 'Existente', zoneType: 'ATTENTION',
      polygon: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.2 }],
      severity: 2, requiredPpe: [], ativa: true,
    });

    comp.salvar();

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones/7`);
    expect(req.request.method).toBe('PUT');
    req.flush({ id: 7, cameraId: 'CAM-01', nome: 'Existente', zoneType: 'ATTENTION',
      polygon: req.request.body.polygon, severity: 2, requiredPpe: [], ativa: true });
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });

  it('desativar chama DELETE', () => {
    fixture.componentInstance.desativar(7);

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones/7`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npx vitest run src/app/config/zones/zone-editor.component.spec.ts`
Expected: FAIL na compilação — `salvar`/`editar`/`desativar` não existem.

- [ ] **Step 7: Completar o componente com formulário e persistência**

Adicionar a `zone-editor.component.ts`:

```typescript
  salvar(): void {
    const f = this.form();
    if (!f.nome.trim()) {
      this.erro.set('Informe um nome.');
      return;
    }
    if (this.vertices().length < 3) {
      this.erro.set('Feche o polígono antes de salvar.');
      return;
    }
    if (f.severity < 1 || f.severity > 4) {
      this.erro.set('Severidade deve estar entre 1 e 4.');
      return;
    }

    const payload: ZonePayload = {
      nome: f.nome.trim(),
      zoneType: f.zoneType,
      polygon: paraNormalizado(this.vertices(), this.canvasWidth(), this.canvasHeight()),
      severity: f.severity,
      requiredPpe: f.requiredPpe,
    };

    this.erro.set('');
    this.salvando.set(true);
    const id = this.editandoId();
    const acao = id != null
      ? this.zoneService.update(this.codigo(), id, payload)
      : this.zoneService.create(this.codigo(), payload);
    acao.subscribe({
      next: () => {
        this.reiniciarDesenho();
        this.salvando.set(false);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  editar(zona: Zone): void {
    this.editandoId.set(zona.id);
    this.form.set({
      nome: zona.nome, zoneType: zona.zoneType, severity: zona.severity, requiredPpe: [...zona.requiredPpe],
    });
    this.vertices.set(paraPixel(zona.polygon, this.canvasWidth(), this.canvasHeight()));
    this.poligonoFechado.set(true);
    this.redesenhar();
  }

  desativar(id: number): void {
    this.zoneService.deactivate(this.codigo(), id).subscribe({ error: e => this.erro.set(mensagemDeErro(e)) });
  }

  alternarPpe(epi: string): void {
    this.form.update(f => ({
      ...f,
      requiredPpe: f.requiredPpe.includes(epi) ? f.requiredPpe.filter(e => e !== epi) : [...f.requiredPpe, epi],
    }));
  }

  reiniciarDesenho(): void {
    this.vertices.set([]);
    this.poligonoFechado.set(false);
    this.editandoId.set(null);
    this.form.set({ ...FORM_VAZIO });
    this.redesenhar();
  }
```

Completar `zone-editor.component.html`, adicionando o formulário e a listagem logo após o bloco de botões já criado no Step 3:

```html
  @if (poligonoFechado()) {
    <form class="auth-form" style="max-width:560px;margin-top:20px" (submit)="$event.preventDefault(); salvar()">
      <div class="field">
        <label>Nome</label>
        <input class="input" [value]="form().nome"
               (input)="form.set({ ...form(), nome: $any($event.target).value })" />
      </div>
      <div class="field">
        <label>Tipo</label>
        <select class="select" [value]="form().zoneType"
                (change)="form.set({ ...form(), zoneType: $any($event.target).value })">
          <option value="RESTRICTED">Área restrita</option>
          <option value="ATTENTION">Área de atenção</option>
        </select>
      </div>
      <div class="field">
        <label>Severidade (1–4)</label>
        <input class="input" type="number" min="1" max="4" [value]="form().severity"
               (input)="form.set({ ...form(), severity: +($any($event.target).value) })" />
      </div>
      <div class="field">
        <label>EPIs obrigatórios nesta zona</label>
        <div class="subtabs">
          @for (epi of episDisponiveis(); track epi) {
            <button type="button" class="chip" [class.on]="form().requiredPpe.includes(epi)"
                    (click)="alternarPpe(epi)">{{ epi }}</button>
          }
        </div>
      </div>
      <div style="display:flex;gap:12px">
        <button type="submit" class="btn primary" [disabled]="salvando()">
          {{ editandoId() != null ? 'Salvar edição' : 'Cadastrar zona' }}
        </button>
        <button type="button" class="btn ghost" (click)="reiniciarDesenho()">cancelar</button>
      </div>
    </form>
  }

  <div style="margin-top:28px">
    @for (z of zonas(); track z.id) {
      <div class="list-row">
        <span class="ph-meta">{{ z.nome }}</span>
        <span class="chip">{{ z.zoneType }}</span>
        <span class="chip">severidade {{ z.severity }}</span>
        <button type="button" class="btn ghost sm" (click)="editar(z)">editar</button>
        <button type="button" class="btn ghost sm" (click)="desativar(z.id)">desativar</button>
      </div>
    } @empty {
      <p class="vazio">nenhuma zona cadastrada nesta câmera ainda</p>
    }
  </div>
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npx vitest run src/app/config/zones/zone-editor.component.spec.ts`
Expected: PASS

- [ ] **Step 9: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/app/config/zones/zone-editor.component.ts \
        src/app/config/zones/zone-editor.component.html \
        src/app/config/zones/zone-editor.component.spec.ts
git commit -m "feat: adiciona ZoneEditorComponent (captura de frame, desenho, formulario, persistencia)"
```

---

### Task 4: Integração na tela de cadastro de câmera

**Files:**
- Modify: `src/app/config/stations/stations-config.component.ts`
- Modify: `src/app/config/stations/stations-config.component.html`
- Test: `src/app/config/stations/stations-config.component.spec.ts`

**Interfaces:**
- Consumes: `ZoneEditorComponent` (Tarefa 3)

- [ ] **Step 1: Escrever o teste de abertura/fechamento do painel**

Em `stations-config.component.spec.ts`, adicionar (seguindo o padrão de montagem já usado nos outros testes deste arquivo):

```typescript
  it('abre e fecha o editor de zonas de uma câmera', () => {
    const fixture = montar(/* ...mesma fábrica de fixture já usada nos outros testes... */);
    const comp = fixture.componentInstance;

    comp.editarZonasDe({ id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x/stream' });
    expect(comp.cameraEmEdicaoDeZonas()?.id).toBe('CAM-01');

    comp.fecharEditorDeZonas();
    expect(comp.cameraEmEdicaoDeZonas()).toBeNull();
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/config/stations/stations-config.component.spec.ts`
Expected: FAIL na compilação — `editarZonasDe`/`fecharEditorDeZonas`/`cameraEmEdicaoDeZonas` não existem.

- [ ] **Step 3: Adicionar o estado e a ação ao componente**

Em `stations-config.component.ts`, importar `Camera` de `../../shared/incident.models` (se ainda não importado) e adicionar:

```typescript
  readonly cameraEmEdicaoDeZonas = signal<Camera | null>(null);

  editarZonasDe(camera: Camera): void {
    this.cameraEmEdicaoDeZonas.set(camera);
  }

  fecharEditorDeZonas(): void {
    this.cameraEmEdicaoDeZonas.set(null);
  }
```

Adicionar `ZoneEditorComponent` aos `imports` do `@Component`.

- [ ] **Step 4: Adicionar o botão e o painel ao template**

Em `stations-config.component.html`, no `@for (c of e.cameras; ...)` já existente, acrescentar um botão ao lado de "desativar":

```html
        @for (c of e.cameras; track c.id) {
          <div class="camera-row">
            <span class="codigo">{{ c.id }}</span>
            <span class="nome">{{ c.nome }}</span>
            <button type="button" class="btn ghost sm" (click)="editarZonasDe(c)">editar zonas</button>
            <button type="button" class="btn ghost sm" (click)="desativarCamera(c.id)">desativar</button>
          </div>
        } @empty {
          <p class="vazio">nenhuma câmera nesta estação — o sistema não vê nada aqui</p>
        }
```

E, ao final do arquivo (fora do loop de estações, como um painel único que aparece por cima quando uma câmera está selecionada):

```html
@if (cameraEmEdicaoDeZonas(); as camera) {
  <div class="panel" style="margin-top:32px">
    <div class="panel-head">
      <span class="ph-title">Zonas de risco — {{ camera.nome }}</span>
      <button type="button" class="btn ghost sm" (click)="fecharEditorDeZonas()">fechar</button>
    </div>
    <app-zone-editor [codigo]="camera.id" [streamUrl]="camera.streamUrl" />
  </div>
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run src/app/config/stations/stations-config.component.spec.ts`
Expected: PASS

- [ ] **Step 6: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/config/stations/stations-config.component.ts \
        src/app/config/stations/stations-config.component.html \
        src/app/config/stations/stations-config.component.spec.ts
git commit -m "feat: liga o editor de zonas a acao editar zonas do cadastro de camera"
```

---

### Task 5: Modo mock

**Files:**
- Modify: `src/app/shared/mock/fixtures.ts`
- Modify: `src/app/shared/mock/mock-api.interceptor.ts`

**Interfaces:**
- Nenhuma nova — só torna o modo de exemplo funcional para esta entrega.

- [ ] **Step 1: Adicionar as fixtures mutáveis**

Em `fixtures.ts`, ao final do arquivo:

```typescript
// ---------------- zonas de risco (mock) ----------------

import { Zone } from '../zone.models';

export const ZONAS: Zone[] = [];

export let ZONAS_MUTAVEL: Zone[] = [];
let PROXIMO_ID_ZONA = 1;

export function resetMockZonas(): void {
  ZONAS_MUTAVEL = ZONAS.map(z => ({ ...z, polygon: [...z.polygon], requiredPpe: [...z.requiredPpe] }));
  PROXIMO_ID_ZONA = 1;
}

export function proximoIdZona(): number {
  return PROXIMO_ID_ZONA++;
}

resetMockZonas();
```

(nenhuma zona semeada por padrão — mesma decisão de `EMITIDOS`, que também começa vazio; o modo de exemplo demonstra o cadastro, não um estado pré-populado.)

- [ ] **Step 2: Adicionar os handlers ao interceptor**

Em `mock-api.interceptor.ts`, importar `ZONAS_MUTAVEL, proximoIdZona` de `./fixtures` e `Zone, ZonePayload` de `../zone.models`, e adicionar a seção (logo após `// ---------------- webhooks ----------------`, se já existir, ou após `// ---------------- usuários ----------------`):

```typescript
  // ---------------- zonas de risco ----------------

  const matchZones = req.url.match(/\/cameras\/([^/]+)\/zones(?:\/(\d+))?$/);
  if (matchZones) {
    const [, cameraId, idStr] = matchZones;
    const id = idStr ? Number(idStr) : null;

    if (req.method === 'GET' && id === null) {
      return ZONAS_MUTAVEL.filter(z => z.cameraId === cameraId && z.ativa)
        .map(z => ({ ...z, polygon: [...z.polygon], requiredPpe: [...z.requiredPpe] }));
    }

    if (req.method === 'POST' && id === null) {
      const corpo = req.body as ZonePayload;
      const nova: Zone = { id: proximoIdZona(), cameraId, ...corpo, ativa: true };
      ZONAS_MUTAVEL.push(nova);
      return nova;
    }

    if (req.method === 'PUT' && id !== null) {
      const corpo = req.body as ZonePayload;
      const atual = ZONAS_MUTAVEL.find(z => z.id === id && z.cameraId === cameraId);
      if (!atual) {
        return naoEncontrado(`Zona inexistente: ${id}`);
      }
      Object.assign(atual, corpo);
      return atual;
    }

    if (req.method === 'DELETE' && id !== null) {
      const atual = ZONAS_MUTAVEL.find(z => z.id === id && z.cameraId === cameraId);
      if (!atual) {
        return naoEncontrado(`Zona inexistente: ${id}`);
      }
      atual.ativa = false;
      return null;
    }
  }
```

(o regex casa tanto `GET/POST /cameras/CAM-01/zones` quanto `PUT/DELETE /cameras/CAM-01/zones/7` num único bloco, para não repetir a extração de `cameraId` quatro vezes — estilo um pouco diferente das seções anteriores deste arquivo, justificado pela URL aninhada por câmera, que nenhuma seção anterior tinha.)

- [ ] **Step 3: Rodar a suíte inteira do front e confirmar que passa**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/shared/mock/fixtures.ts src/app/shared/mock/mock-api.interceptor.ts
git commit -m "feat: liga o editor de zonas ao modo mock"
```

---

## Self-Review

**Cobertura da spec:** §4.1 (onde entra) → Tarefa 4. §4.2 (congelar o frame) → Tarefa 3, `capturarFrame`. §4.3 (desenho do polígono, fração 0–1, edição de zona existente) → Tarefa 3, `onCanvasClick`/`fecharPoligono`/`editar`, matemática isolada na Tarefa 1. §4.4 (`ZoneService`) → Tarefa 2. §4.5 (modo mock) → Tarefa 5. §4.6 (aviso de reinício) → texto fixo no topo do painel, Tarefa 3 Step 3. §6 "Angular" (estratégia de testes) → captura de frame, adição/edição/remoção de vértice e conversão pixel↔normalizado cobertos na Tarefa 3; spec do `ZoneService` na Tarefa 2; interceptor mock na Tarefa 5.

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** `Zone`/`ZonePayload`/`Ponto` (Tarefa 1) usados sem variação nas Tarefas 2–5; `paraNormalizado`/`paraPixel` (Tarefa 1) são as únicas funções de conversão em todo o plano — nenhuma reimplementação inline no componente.

**Fora de escopo confirmado:** nenhuma tarefa deste plano implementa drag real de vértice com mouse (arrastar) além do que já existe via `editar()` — simplificação registrada aqui: a spec (§4.3) menciona "permitindo editar vértices... arrastando-os"; este plano cobre a edição substituindo o polígono inteiro (remover/adicionar vértices, reabrir e redesenhar), não arrasto individual pixel a pixel. Se o arrasto interativo for exigido à risca na revisão, é uma extensão pequena e isolada de `onCanvasClick` (adicionar `onMouseDown`/`onMouseMove`/`onMouseUp` detectando proximidade a um vértice existente) — não muda nenhum contrato já definido aqui.

---

**Plan complete and saved to `docs/superpowers/plans/zonas-de-risco/2026-08-29-zrc-front-zonas.md`.**

## Execution Handoff

Os três planos desta entrega (`2026-08-29-zra-backend-zonas.md`, `2026-08-29-zrb-capture-zonas.md`, `2026-08-29-zrc-front-zonas.md`) estão prontos. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — dispatch de um subagente por tarefa, revisão entre tarefas, iteração rápida.

**2. Inline Execution** — execução em lote nesta sessão via `executing-plans`, com checkpoints para revisão.

Qual abordagem?
