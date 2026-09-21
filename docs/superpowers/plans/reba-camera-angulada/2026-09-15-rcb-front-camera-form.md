# RCB — Rotação e ângulo no formulário de câmera (front) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o operador digite `rotacao` e `anguloCameraGraus` no cadastro de câmera existente, sem precisar chamar a API na mão em campo amanhã.

**Architecture:** Extensão aditiva do formulário reativo-por-signal já existente em `StationsConfigComponent` (`novaCamera`/`FormCamera`) — mesmo padrão dos campos atuais (`streamUrl`, `fonte`), sem novo componente.

**Tech Stack:** Angular standalone components, signals (sem `FormGroup`/Reactive Forms — o repo usa o padrão `signal` + `(input)` direto).

**Spec:** `docs/superpowers/specs/planejadas/2026-09-15-reba-camera-angulada-design.md`

## Global Constraints

- `rotacao`: um dos 4 valores `0/90/180/270`, default `0` — usar `<select>`, não `<input type="number">`, para não permitir digitar um valor inválido.
- `anguloCameraGraus`: inteiro `-45..45`, default `0` — `<input type="number" min="-45" max="45">`.
- Depende de RCA (backend) já estar mergeado/rodando — os campos precisam existir em `CameraPayload`/`CameraAdmin` no shape que a API devolve.

---

### Task 1: Modelo e serviço — `CameraPayload`/`CameraAdmin` ganham os 2 campos

**Files:**
- Modify: `/home/asaas/projects/challenge/cypher-front/src/app/shared/incident.models.ts`

**Interfaces:**
- Produces: `CameraPayload.rotacao: number`, `.anguloCameraGraus: number` (obrigatórios, não opcionais — o form sempre envia um valor, default 0). `CameraAdmin.rotacao: number`, `.anguloCameraGraus: number`.

- [ ] **Step 1: Editar `CameraPayload` (linha 108-115)**

```typescript
export interface CameraPayload {
  id: string;
  nome: string;
  estacaoId: string;
  streamUrl: string;
  fonte: string | null;
  ativa?: boolean;
  rotacao: number;
  anguloCameraGraus: number;
}
```

- [ ] **Step 2: Editar `CameraAdmin` (linha 82-85)**

```typescript
export interface CameraAdmin extends Camera {
  fonte: string | null;
  ativa: boolean;
  rotacao: number;
  anguloCameraGraus: number;
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/shared/incident.models.ts
git commit -m "feat: adiciona rotacao/anguloCameraGraus aos modelos de camera"
```

---

### Task 2: Formulário de nova câmera — campos e envio

**Files:**
- Modify: `/home/asaas/projects/challenge/cypher-front/src/app/config/stations/stations-config.component.ts`
- Modify: `/home/asaas/projects/challenge/cypher-front/src/app/config/stations/stations-config.component.html`

**Interfaces:**
- Consumes: `CameraPayload` (Task 1).
- Produces: `FormCamera` ganha `rotacao: number` e `anguloCameraGraus: number`; `salvarCamera()` envia os dois no `createCamera(...)`.

- [ ] **Step 1: `FormCamera`/`CAMERA_VAZIA` (linhas 8-15 de `stations-config.component.ts`)**

```typescript
interface FormCamera {
  id: string; nome: string; estacaoId: string; streamUrl: string; fonte: string;
  rotacao: number; anguloCameraGraus: number;
}

const CAMERA_VAZIA: FormCamera = {
  id: '', nome: '', estacaoId: '', streamUrl: '', fonte: '',
  rotacao: 0, anguloCameraGraus: 0,
};
```

- [ ] **Step 2: `salvarCamera()` — incluir os campos no payload (linhas 115-121)**

```typescript
    this.catalog.createCamera({
      id: form.id,
      nome: form.nome.trim(),
      estacaoId: form.estacaoId,
      streamUrl: form.streamUrl.trim(),
      fonte: form.fonte.trim() || null,
      rotacao: form.rotacao,
      anguloCameraGraus: form.anguloCameraGraus,
    }).subscribe({
```

- [ ] **Step 3: Template — dois campos novos após "Fonte de captura" (após a linha 59 de `stations-config.component.html`, antes do `<p class="ajuda">`)**

```html
      <div class="field">
        <label>Rotação da câmera</label>
        <select class="select" [value]="novaCamera().rotacao"
                (change)="novaCamera.set({ ...novaCamera(), rotacao: +$any($event.target).value })">
          <option value="0">0° (sem rotação)</option>
          <option value="90">90°</option>
          <option value="180">180°</option>
          <option value="270">270°</option>
        </select>
      </div>
      <div class="field">
        <label>Ângulo de inclinação (roll)</label>
        <input class="input" type="number" min="-45" max="45"
               [value]="novaCamera().anguloCameraGraus"
               (input)="novaCamera.set({ ...novaCamera(), anguloCameraGraus: +$any($event.target).value })" />
        <p class="ajuda">
          Graus de inclinação lateral da câmera (-45 a 45). Corrige o cálculo de postura
          quando a câmera não está perfeitamente nivelada. Meça no local e ajuste até o
          REBA exibido bater com uma pessoa em pé.
        </p>
      </div>
```

- [ ] **Step 4: Rodar o build do front pra confirmar que compila**

Run: `cd /home/asaas/projects/challenge/cypher-front && npx ng build --configuration development 2>&1 | tail -30`
Expected: build sem erros de tipo (nenhum `TS2741`/`TS2739` faltando propriedade)

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-front
git add src/app/config/stations/stations-config.component.ts \
        src/app/config/stations/stations-config.component.html
git commit -m "feat: expoe rotacao e angulo de camera no formulario de cadastro"
```

## Self-Review

- **Cobertura da spec:** RCB da spec é só "expor os 2 campos no formulário" — coberto integralmente pelas 2 tasks.
- **Placeholders:** nenhum — todo o código é literal, com linhas exatas dos arquivos lidos em 2026-09-15.
- **Consistência de tipos:** `FormCamera.rotacao`/`anguloCameraGraus: number` (Task 2) mapeiam direto para `CameraPayload.rotacao`/`anguloCameraGraus: number` (Task 1) sem conversão — o `+$any($event.target).value` no template já converte string→number na captura do evento, mesmo padrão que seria usado em qualquer input numérico do repo.
