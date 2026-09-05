# GTQ — Gating Temporal de Queda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** eliminar o resíduo de falsos alarmes `IMMEDIATE_RISK` causado por `fall_velocity` em agachamentos/flexões rápidos, sem retreinar o modelo — melhora a precisão do detector de queda (hoje 0,418) sem regredir o recall (hoje ~0,986–0,996) abaixo de 0,95, destravando a E5 (gamificação).

**Architecture:** uma janela de confirmação dentro de `PostureClassifier._apply_hysteresis` — quando o gatilho é `fall_velocity` sem `person_fallen` já verdadeiro, a transição pública para `IMMEDIATE_RISK` fica pendente por `fall_confirm_frames` frames; só é liberada se `person_fallen` (cues geométricos) se confirmar dentro da janela, senão é descartada silenciosamente. Nenhuma mudança no `IncidentTracker`. Tarefa 1 entrega o mecanismo no classificador; Tarefa 2 fia a configuração (`fall_confirm_seconds` → frames); Tarefa 3 regrava a fixture de regressão; Tarefas 4–5 são validação empírica (precisão/recall, ponta a ponta) — não têm "código para passar", têm números pra registrar e uma decisão de desbloqueio no final.

**Tech Stack:** Python 3.10, pytest, YOLO11-pose (`ultralytics`), OpenCV. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/planejadas/2026-09-05-gating-temporal-queda-design.md`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-capture`. Branch atual: verificar com `git branch --show-current` antes de ramificar; criar `feat/gtq-gating-queda` a partir do branch principal do repositório.
- **A correção fica inteira no `PostureClassifier` (`src/pose/classifier.py`)** — o `IncidentTracker` não recebe nenhuma mudança (spec §1: ele não tem acesso aos sinais brutos que diferenciam queda em andamento de queda confirmada).
- **O gating só se aplica ao caminho `fall_velocity`→`IMMEDIATE_RISK`** — `balance_loss_risk`, `person_fallen`-desde-o-primeiro-frame, e as demais categorias (`ERGONOMICALLY_INADEQUATE`, `CRITICAL_ZONE`) mantêm a histerese atual, sem nenhuma mudança de comportamento (spec §2/§6).
- **`fall_confirm_seconds` é parâmetro global de calibração** (mesmo nível de `conf_epi`/`conf_pose`/`enter_frames_risk`), não configurável por câmera/empresa (spec §6).
- **Sem retreino de modelo** — toda a mudança é lógica de regras determinística sobre `angles`/`bbox`/`fall_risk` já extraídos; nenhuma mudança em `PoseEstimator`, `extract_angles`, ou nos pesos do YOLO.
- Run: `cd /home/asaas/projects/challenge/cypher-capture && source venv/bin/activate && python -m pytest -q <arquivo>` para um arquivo; `python -m pytest -q` para a suíte inteira.

---

### Task 1: Gating no `PostureClassifier`

**Files:**
- Modify: `src/pose/classifier.py`
- Test: `tests/test_classifier.py`

**Interfaces:**
- Produces: `PostureClassifier.__init__(..., fall_confirm_frames: int = 15)` — novo parâmetro; consumido pela Tarefa 2 (`UnifiedPipeline` passa o valor convertido de `fall_confirm_seconds`).

- [ ] **Step 1: Escrever os 4 testes do mecanismo de confirmação**

Adicionar a `tests/test_classifier.py`, numa nova classe ao final do arquivo (depois de `TestCategories` ou onde as classes de teste existentes terminarem — abrir o arquivo pra confirmar o ponto de inserção, mas o conteúdo abaixo é independente de onde entra):

```python
class TestFallConfirmation:
    """Gating temporal de queda (design doc 2026-09-05, §2): fall_velocity só
    vira IMMEDIATE_RISK pra fora se terminar em person_fallen dentro da janela
    de confirmação — elimina o residuo de falso alarme em agachamentos rápidos
    (docs/metricas-dia2.md §5.2, precisão 0.418)."""

    def test_fall_velocity_confirmado_por_person_fallen_dentro_da_janela(self):
        clf = PostureClassifier(enter_frames_risk=2, fall_confirm_frames=5)
        pid = 1
        # 2 frames de fall_velocity (TALL_BBOX = sem cue geometrico) -> entra
        # em confirmacao, nao reporta IMMEDIATE_RISK ainda.
        assert clf.update(pid, neutral_angles(pid), reba(1), TALL_BBOX, fall_risk=0.9).category == PostureCategory.NORMAL
        assert clf.update(pid, neutral_angles(pid), reba(1), TALL_BBOX, fall_risk=0.9).category == PostureCategory.NORMAL
        # ainda dentro da janela (5 frames), person_fallen confirma via bbox largo.
        s = clf.update(pid, neutral_angles(pid), reba(1), WIDE_BBOX, fall_risk=0.9)
        assert s.category == PostureCategory.IMMEDIATE_RISK
        assert s.reason == "person_fallen"

    def test_fall_velocity_sem_confirmacao_nunca_vira_immediate_risk(self):
        clf = PostureClassifier(enter_frames_risk=2, fall_confirm_frames=3)
        pid = 1
        # 2 frames pra entrar em confirmacao, mais 3 frames de janela -- em
        # nenhum momento person_fallen aparece (agachamento rapido: so velocidade).
        estados = [
            clf.update(pid, neutral_angles(pid), reba(1), TALL_BBOX, fall_risk=0.9).category
            for _ in range(6)
        ]
        assert PostureCategory.IMMEDIATE_RISK not in estados

    def test_person_fallen_desde_o_primeiro_frame_confirma_sem_esperar_janela(self):
        clf = PostureClassifier(enter_frames_risk=2, fall_confirm_frames=10)
        pid = 1
        assert clf.update(pid, neutral_angles(pid), reba(1), WIDE_BBOX).category == PostureCategory.NORMAL
        s = clf.update(pid, neutral_angles(pid), reba(1), WIDE_BBOX)
        assert s.category == PostureCategory.IMMEDIATE_RISK
        assert s.reason == "person_fallen"

    def test_confirmacao_antecipada_nao_espera_o_resto_da_janela(self):
        clf = PostureClassifier(enter_frames_risk=2, fall_confirm_frames=10)
        pid = 1
        clf.update(pid, neutral_angles(pid), reba(1), TALL_BBOX, fall_risk=0.9)
        clf.update(pid, neutral_angles(pid), reba(1), TALL_BBOX, fall_risk=0.9)
        # so 1 frame dentro da janela de 10 antes de person_fallen confirmar --
        # nao precisa esperar os outros 9.
        s = clf.update(pid, neutral_angles(pid), reba(1), WIDE_BBOX, fall_risk=0.9)
        assert s.category == PostureCategory.IMMEDIATE_RISK
        assert s.reason == "person_fallen"
        assert s.frames_in_state == 1
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `python -m pytest -q tests/test_classifier.py -k TestFallConfirmation`
Expected: FAIL — `PostureClassifier.__init__() got an unexpected keyword argument 'fall_confirm_frames'`

- [ ] **Step 3: Implementar o gating**

Em `src/pose/classifier.py`, no `__init__` de `PostureClassifier`, adicionar o parâmetro e o dicionário de estado:

```python
    def __init__(
        self,
        fps: float = 15.0,
        thresholds: Optional[ClassifierThresholds] = None,
        enter_frames: int = 5,
        exit_frames: int = 15,
        enter_frames_risk: int = 2,
        fall_confirm_frames: int = 15,
    ) -> None:
        self.fps = fps
        self.t = thresholds or ClassifierThresholds()
        self.enter_frames = enter_frames
        self.exit_frames = exit_frames
        # IMMEDIATE_RISK uses a lower entry threshold to maximise recall
        self.enter_frames_risk = enter_frames_risk
        # Gating temporal de queda (design doc 2026-09-05, §2): janela de
        # confirmacao antes de reportar IMMEDIATE_RISK via fall_velocity.
        self.fall_confirm_frames = fall_confirm_frames
        self._states: dict[int, PostureState] = {}
        self._pending: dict[int, tuple[PostureCategory, str, int]] = {}
        self._exit_counters: dict[int, int] = defaultdict(int)
        self._fall_pending_confirm: dict[int, int] = {}
```

Substituir o método `_apply_hysteresis` inteiro por:

```python
    def _apply_hysteresis(
        self,
        person_id: int,
        cat: PostureCategory,
        reason: str,
    ) -> Optional[PostureState]:
        if cat == PostureCategory.NORMAL:
            # NORMAL is never "entered" through this path — leaving an alarm
            # state goes exclusively through the exit_frames counter in
            # update(), keeping alarms sticky (recall priority).
            self._pending.pop(person_id, None)
            self._fall_pending_confirm.pop(person_id, None)
            return None

        # Gating temporal de queda: uma confirmacao de fall_velocity ja esta
        # em andamento pra este track. So sai daqui confirmando IMMEDIATE_RISK
        # (via person_fallen) ou descartando o episodio (janela esgotada) —
        # nunca confirma via fall_velocity puro.
        if person_id in self._fall_pending_confirm:
            if reason == "person_fallen":
                frames_waited = self._fall_pending_confirm.pop(person_id)
                return PostureState(
                    category=PostureCategory.IMMEDIATE_RISK,
                    reason="person_fallen",
                    frames_in_state=frames_waited,
                )
            frames_waited = self._fall_pending_confirm[person_id] + 1
            if frames_waited >= self.fall_confirm_frames:
                # Janela esgotada sem confirmacao geometrica — descarta.
                # O episodio nunca chega a ser visivel fora do classificador
                # (spec 2026-09-05 §2: elimina o residuo de fall_velocity em
                # agachamentos rapidos, docs/metricas-dia2.md §5.2).
                self._fall_pending_confirm.pop(person_id)
            else:
                self._fall_pending_confirm[person_id] = frames_waited
            return None

        pending = self._pending.get(person_id)
        enter_threshold = (
            self.enter_frames_risk
            if cat == PostureCategory.IMMEDIATE_RISK
            else self.enter_frames
        )

        if pending is None or pending[0] != cat:
            self._pending[person_id] = (cat, reason, 1)
            return None

        count = pending[2] + 1
        self._pending[person_id] = (cat, reason, count)

        current_cat = self._states.get(person_id, PostureState()).category
        if cat != current_cat and count >= enter_threshold:
            self._pending.pop(person_id)
            if cat == PostureCategory.IMMEDIATE_RISK and reason == "fall_velocity":
                # Nao confirma ainda -- abre a janela de confirmacao em vez
                # de reportar a transicao.
                self._fall_pending_confirm[person_id] = 0
                return None
            # The posture already persisted `count` raw frames before being
            # confirmed; start the counter there so sustained_seconds is honest
            # (update() increments once more right after).
            return PostureState(category=cat, reason=reason, frames_in_state=count - 1)

        return None
```

- [ ] **Step 4: Rodar e confirmar que os 4 testes novos passam**

Run: `python -m pytest -q tests/test_classifier.py -k TestFallConfirmation`
Expected: PASS (4 testes)

- [ ] **Step 5: Rodar a suíte inteira do classificador e ajustar o teste que ficou obsoleto**

Run: `python -m pytest -q tests/test_classifier.py`
Expected: `test_immediate_risk_via_fall_velocity` FALHA — esse teste (linhas ~171-176) trava exatamente o comportamento antigo que este plano remove de propósito: com `enter_frames_risk=2` e só 2 chamadas de `fall_velocity`, ele esperava confirmação imediata com `reason == "fall_velocity"`. Com o gating, 2 chamadas só abrem a janela de confirmação (`fall_confirm_frames` default 15) — o estado ainda é `NORMAL` nesse ponto, não `IMMEDIATE_RISK`.

Esse teste virou redundante com `test_fall_velocity_sem_confirmacao_nunca_vira_immediate_risk` (Step 1) — que já cobre "fall_velocity isolado nunca confirma". Substituir o corpo do teste antigo para testar a nova garantia (entra em confirmação, não confirma ainda) em vez de apagá-lo:

```python
    def test_immediate_risk_via_fall_velocity(self):
        clf = PostureClassifier(enter_frames_risk=2)  # default fall_risk_min = 0.85
        clf.update(1, neutral_angles(), reba(1), TALL_BBOX, fall_risk=0.9)
        s = clf.update(1, neutral_angles(), reba(1), TALL_BBOX, fall_risk=0.9)
        # fall_velocity sozinho (sem geometria de queda) abre a janela de
        # confirmacao (design doc 2026-09-05, §2) em vez de confirmar direto —
        # ver TestFallConfirmation para o ciclo completo de confirmacao/descarte.
        assert s.category == PostureCategory.NORMAL
```

Run de novo: `python -m pytest -q tests/test_classifier.py`
Expected: PASS — todos os testes, incluindo o ajustado e os 4 novos de `TestFallConfirmation`.

- [ ] **Step 6: Commit**

```bash
git add src/pose/classifier.py tests/test_classifier.py
git commit -m "feat: adiciona gating temporal de queda no PostureClassifier"
```

---

### Task 2: Configuração `fall_confirm_seconds`

**Files:**
- Modify: `src/fusion/pipeline.py`
- Modify: `config/pose_config.yaml`
- Test: `tests/test_pipeline_config.py` (novo)

**Interfaces:**
- Consumes: `PostureClassifier(..., fall_confirm_frames=...)` (Tarefa 1)
- Produces: `PipelineConfig.fall_confirm_seconds: float` — consumido só internamente por `UnifiedPipeline.__init__` (não há tarefa posterior nesta entrega).

- [ ] **Step 1: Escrever os testes de config**

Criar `tests/test_pipeline_config.py`:

```python
"""
Testes de PipelineConfig.from_yaml (src/fusion/pipeline.py) — cobre só o
campo fall_confirm_seconds (design doc 2026-09-05, §3). PipelineConfig nao
tinha teste dedicado antes desta entrega; nao criamos cobertura retroativa
pros demais campos, so pro que estamos adicionando.
"""
from __future__ import annotations

from src.fusion.pipeline import PipelineConfig


def test_fall_confirm_seconds_default_e_um_segundo():
    config = PipelineConfig()
    assert config.fall_confirm_seconds == 1.0


def test_fall_confirm_seconds_carregado_do_yaml(tmp_path):
    yaml_path = tmp_path / "pose_config.yaml"
    yaml_path.write_text(
        "classifier:\n"
        "  fall_confirm_seconds: 2.5\n"
    )

    config = PipelineConfig.from_yaml(str(yaml_path))

    assert config.fall_confirm_seconds == 2.5
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `python -m pytest -q tests/test_pipeline_config.py`
Expected: FAIL — `TypeError: PipelineConfig.__init__() got an unexpected keyword argument 'fall_confirm_seconds'` (o segundo teste falha; o primeiro falha com `AttributeError` já que o campo não existe)

- [ ] **Step 3: Adicionar o campo e a conversão**

Em `src/fusion/pipeline.py`, no dataclass `PipelineConfig`, adicionar o campo (junto de `enter_frames_risk`/`exit_frames`):

```python
    enter_frames: int = 5
    enter_frames_risk: int = 2
    exit_frames: int = 15
    fall_confirm_seconds: float = 1.0
    thresholds: ClassifierThresholds = field(default_factory=ClassifierThresholds)
```

Em `UnifiedPipeline.__init__`, onde `self._classifier = PostureClassifier(...)` é construído, adicionar o parâmetro convertido:

```python
        self._classifier = PostureClassifier(
            fps=config.target_fps,
            thresholds=config.thresholds,
            enter_frames=config.enter_frames,
            exit_frames=config.exit_frames,
            enter_frames_risk=config.enter_frames_risk,
            fall_confirm_frames=round(config.fall_confirm_seconds * config.target_fps),
        )
```

Em `config/pose_config.yaml`, na seção `classifier:`, adicionar (junto de `enter_frames_risk`/`exit_frames`):

```yaml
classifier:
  enter_frames: 5
  enter_frames_risk: 2
  exit_frames: 45
  fall_confirm_seconds: 1.0          # janela de confirmacao antes de reportar
                                      # IMMEDIATE_RISK via fall_velocity puro
                                      # (design doc 2026-09-05, elimina falso
                                      # alarme em agachamentos rapidos)
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `python -m pytest -q tests/test_pipeline_config.py`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira e confirmar que nada quebrou**

Run: `python -m pytest -q`
Expected: PASS (suíte completa + os testes novos das Tarefas 1 e 2)

- [ ] **Step 6: Commit**

```bash
git add src/fusion/pipeline.py config/pose_config.yaml tests/test_pipeline_config.py
git commit -m "feat: fia fall_confirm_seconds do config ate o PostureClassifier"
```

---

### Task 3: Regravar a fixture de regressão do `IncidentTracker`

**Files:**
- Create: `scripts/regen_cenario2_fixture.py` (script utilitário, não faz parte do pipeline de produção)
- Modify: `tests/fixtures/cenario2_transitions.json` (regravado pelo script, não por edição manual)
- Test: `tests/test_incident_tracker.py` (já existe — não modificado, só precisa continuar verde)

**Interfaces:**
- Consumes: `UnifiedPipeline`/`PipelineConfig` com o gating das Tarefas 1–2 já aplicado.
- Produces: `tests/fixtures/cenario2_transitions.json` atualizado — consumido pelo `test_incident_tracker.py` já existente, sem mudança de interface.

- [ ] **Step 1: Ler o formato atual da fixture**

Antes de escrever o script, confirmar o formato exato rodando:

```bash
python3 -c "
import json
d = json.load(open('tests/fixtures/cenario2_transitions.json'))
print(list(d.keys()))
print(d['video'], d['total_frames'], d['fps'])
print(d['quedas_reais'])
"
```

Expected output: chaves `['video', 'total_frames', 'fps', 'quedas_reais', 'transitions', 'vida_dos_tracks']`; `quedas_reais` é uma lista anotada à mão com os intervalos reais de queda (não muda com o gating — são fatos do vídeo, não do classificador) — copiar esse valor para o script, não recalcular.

- [ ] **Step 2: Escrever o script de regravação**

Criar `scripts/regen_cenario2_fixture.py`:

```python
#!/usr/bin/env python3
"""
Regrava tests/fixtures/cenario2_transitions.json rodando o PostureClassifier
atualizado (gating temporal de queda, design doc 2026-09-05) contra o vídeo
real. Roda toda a pilha de pose+classificação frame a frame via
UnifiedPipeline.process_frame — não é um teste automatizado (precisa do
vídeo e do modelo YOLO), é um utilitário de manutenção da fixture.

Uso:
    python scripts/regen_cenario2_fixture.py
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import cv2

from src.fusion.pipeline import PipelineConfig, UnifiedPipeline

VIDEO = "data/validation/cenario2.mp4"
FIXTURE = Path("tests/fixtures/cenario2_transitions.json")

# Fatos do vídeo, anotados à mão — não mudam com o classificador.
QUEDAS_REAIS = json.loads(FIXTURE.read_text())["quedas_reais"]


def main() -> None:
    config = PipelineConfig.from_yaml("config/pose_config.yaml")
    pipeline = UnifiedPipeline(config)

    cap = cv2.VideoCapture(VIDEO)
    fps = cap.get(cv2.CAP_PROP_FPS)

    transitions: list[dict] = []
    frame_idx = -1
    vida_dos_tracks: dict[int, int] = defaultdict(int)

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1
        _, events = pipeline.process_frame(frame)
        for event in events:
            vida_dos_tracks[event.person_id] += 1
            if event.posture != event.previous_posture:
                transitions.append({
                    "frame": frame_idx,
                    "track": event.person_id,
                    "from": event.previous_posture,
                    "to": event.posture,
                })
    cap.release()

    dados = {
        "video": VIDEO,
        "total_frames": frame_idx + 1,
        "fps": fps,
        "quedas_reais": QUEDAS_REAIS,
        "transitions": transitions,
        "vida_dos_tracks": {str(k): v for k, v in vida_dos_tracks.items()},
    }
    FIXTURE.write_text(json.dumps(dados, indent=2, ensure_ascii=False))
    print(f"Fixture regravada: {len(transitions)} transicoes, "
          f"{len(vida_dos_tracks)} track(s), {frame_idx + 1} frames.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Rodar o script**

```bash
python scripts/regen_cenario2_fixture.py
```

Expected: imprime o resumo (`N transicoes, M track(s), 1331 frames` — mesmo `total_frames` de antes, já que o vídeo não muda) e sobrescreve `tests/fixtures/cenario2_transitions.json`.

- [ ] **Step 4: Rodar `test_incident_tracker.py` contra a fixture nova**

Run: `python -m pytest -q tests/test_incident_tracker.py -v`
Expected: PASS em todos, incluindo `test_cenario2_produz_dois_incidentes_para_duas_quedas` (que trava `tipos == ["ERGONOMIC_RISK", "FALL_RISK"]`).

Se `test_cenario2_produz_dois_incidentes_para_duas_quedas` falhar porque o novo `tipos` mudou (ex.: um `FALL_RISK` a menos por causa do gating ter descartado um episódio real), isso é uma **descoberta empírica real**, não um erro de implementação — decidir olhando as transições brutas (frame a frame) se o episódio descartado era mesmo um falso "fall" de agachamento (esperado, bom) ou uma queda real perdida por recall (ruim, ajustar `fall_confirm_seconds` pra baixo e regravar). Documentar a decisão no relatório da task antes de prosseguir.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `python -m pytest -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/regen_cenario2_fixture.py tests/fixtures/cenario2_transitions.json
git commit -m "chore: regrava fixture de cenario2 com o gating temporal de queda"
```

---

### Task 4: Validação de precisão/recall

**Files:**
- Nenhum arquivo de código — task de medição empírica, resultado registrado no relatório da task (não em código).

**Interfaces:**
- Consumes: classificador com gating (Tarefas 1–3) já commitado.
- Produces: números de precisão/recall registrados no relatório desta task — consumidos pela Tarefa 5 (decisão de desbloqueio da E5) e pelo registro final na spec/roteiro (fora deste plano, feito pelo controlador depois do plano completo).

- [ ] **Step 1: Rodar o harness contra `cenario2.mp4`**

```bash
python scripts/evaluate_pose.py \
    --annotations data/annotations/cenario2_gt.json \
    --video data/validation/cenario2.mp4
```

Registrar no relatório: precisão e recall de `immediate_risk` reportados pelo harness. Comparar contra o baseline documentado em `docs/metricas-dia2.md` §5.2 (recall 0,996 no sweep / 0,986 no caminho oficial; precisão 0,418).

- [ ] **Step 2: Rodar o harness contra `cenario.mp4` (validação cruzada anti-overfitting)**

```bash
python scripts/evaluate_pose.py \
    --annotations data/annotations/cenario_gt.json \
    --video data/validation/cenario.mp4
```

Registrar no relatório: quantos falsos "fall" aparecem (esperado: continuar em 0 ou próximo disso — `docs/metricas-dia2.md` §5.5 confirmou 0% de falso nos cues geométricos em agachamento/flexão; o gating não deveria piorar isso, já que só reduz a superfície de `fall_velocity`, nunca aumenta).

- [ ] **Step 3: Avaliar contra o critério de aceite da spec**

Spec §5: precisão de `immediate_risk` deve melhorar de forma mensurável a partir de 0,418; recall não deve regredir abaixo de 0,95. Registrar no relatório da task: os dois números medidos, se o critério foi atingido, e — se não foi — se o ajuste é no valor de `fall_confirm_seconds` (Tarefa 2) ou se o mecanismo (Tarefa 1) precisa de revisão. Esta é uma decisão a registrar no relatório, não código a escrever nesta task.

- [ ] **Step 4: Commit (se `fall_confirm_seconds` for recalibrado)**

Só commitar se o Step 3 concluir que o default de `1.0` precisa mudar:

```bash
git add config/pose_config.yaml
git commit -m "chore: recalibra fall_confirm_seconds apos validacao de precisao/recall"
```

Se nenhuma recalibração for necessária, não há commit nesta task — só o registro no relatório.

---

### Task 5: Ponta a ponta e decisão de desbloqueio da E5

**Files:**
- Nenhum arquivo de código — task de verificação manual + decisão registrada no relatório.

**Interfaces:**
- Consumes: classificador com gating validado (Tarefas 1–4).
- Produces: decisão de desbloqueio (ou não) do bloqueio §7 da spec de gamificação E5 — registrada no relatório desta task, não em código. A atualização formal da spec E5/roteiro de entregas acontece fora deste plano, depois que o controlador ler este relatório.

- [ ] **Step 1: Rodar `cenario2.mp4` via `run_pipeline.py` completo**

```bash
python src/run_pipeline.py --source data/validation/cenario2.mp4 --no-display --no-stream
```

Deixar rodar até o fim do vídeo (o loop já trata `cap.state == "encerrado"` e sai sozinho — não precisa `--max-frames`).

- [ ] **Step 2: Inspecionar os incidentes gerados**

Sem `--api-url`, os incidentes só são impressos no console (`ConsoleIncidentSink`) — registrar no relatório: quantos `FALL_RISK` e `ERGONOMIC_RISK` apareceram, e se as 2 quedas reais (`~f700–845`, `~f1050–1190`) foram capturadas (recall preservado no caminho de produção real, não só no harness).

- [ ] **Step 2b: Se quiser confirmar contra o backend real, subir a pilha completa**

Opcional, mais realista: seguir o mesmo procedimento já usado nos testes ponta a ponta anteriores (zonas de risco, orquestrador) — subir `cypher` local, cadastrar uma câmera de teste, e rodar `run_pipeline.py --camera-id ... --api-url ...` apontando pro vídeo via `--source data/validation/cenario2.mp4`, conferindo os incidentes que chegam no backend em vez de só no console.

- [ ] **Step 3: Decidir o desbloqueio da E5**

Com os números da Tarefa 4 (precisão/recall) e desta task (comportamento ponta a ponta) em mãos, registrar no relatório uma decisão explícita: **o bloqueio §7 da spec de gamificação E5 está resolvido, ou não** — e por quê. Esta decisão não é automática (spec §7 da própria spec desta entrega já registra isso) — é um julgamento sobre se os números são bons o bastante pra um placar de conformidade nascer com credibilidade.

- [ ] **Step 4: Nenhum commit de código nesta task** — o relatório da task é a entrega. A atualização da spec E5 (`docs/superpowers/specs/planejadas/2026-08-29-gamificacao-e5-design.md` §7) e do roteiro de entregas, refletindo a decisão do Step 3, é feita pelo controlador depois de ler este relatório — não faz parte deste plano de implementação em `cypher-capture`.

---

## Self-Review

**Cobertura da spec:** §2 (mecanismo de confirmação) → Task 1. §2.1 (trade-off recall/precisão) → coberto pelos testes de Task 1 (`test_fall_velocity_sem_confirmacao_nunca_vira_immediate_risk`) e pela validação empírica de Task 4. §2.2 (custo de latência) → não precisa de teste dedicado, é uma propriedade decorrente do mecanismo (frames_in_state honesto, já coberto por `test_confirmacao_antecipada_nao_espera_o_resto_da_janela`). §3 (configuração) → Task 2. §4 (comportamento sob falha/casos) → as 5 linhas da tabela mapeiam 1:1 pros 4 testes de Task 1 mais o comportamento inalterado de `balance_loss_risk` (não precisa de teste novo, não foi tocado). §5 (estratégia de testes) → Task 1 (unitário), Task 3 (fixture/regressão), Task 4 (precisão/recall), Task 5 (ponta a ponta). §7/§8 (premissas e ordem) → seguidos na ordem das tasks.

**Placeholder scan:** nenhum "TBD"/"implementar depois". As Tasks 4–5 não têm "steps de código" porque são inerentemente medição/decisão — todos os comandos e critérios de aceite são explícitos e executáveis.

**Consistência de tipos:** `fall_confirm_frames: int` (Task 1, `PostureClassifier`) e `fall_confirm_seconds: float` (Task 2, `PipelineConfig`) são nomes deliberadamente diferentes (frames vs. segundos) — a conversão (`round(seconds * target_fps)`) acontece uma única vez, em `UnifiedPipeline.__init__`, exatamente como documentado na spec §3.

**Fora de escopo confirmado:** nenhuma task mexe em `IncidentTracker`, `merge_window_seconds`, `balance_loss_risk`, ou treina/retreina modelo — consistente com spec §6.

---

**Plan complete and saved to `docs/superpowers/plans/gating-temporal-queda/2026-09-05-gtq-capture-gating-queda.md`.**

## Execution Handoff

**1. Subagent-Driven (recomendado)** — dispatch de um subagente por tarefa, revisão entre tarefas, iteração rápida.

**2. Inline Execution** — execução em lote nesta sessão via `executing-plans`, com checkpoints para revisão.

Qual abordagem?
