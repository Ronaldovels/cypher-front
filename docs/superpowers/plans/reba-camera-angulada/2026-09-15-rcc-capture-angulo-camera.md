# RCC — REBA invariante a câmera angulada (capture) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o pipeline Python ler rotação/ângulo do cadastro (não só `--rotate` manual), corrigir `trunk_flexion` para câmera com roll, marcar frames com keypoint ausente como indeterminados em vez de "risco mínimo" silencioso, suavizar o REBA temporal pulando indeterminados, e restringir alertas ergonômicos à zona configurada (quando existir).

**Architecture:** Cada mudança é uma extensão aditiva de um módulo existente (`angles.py`, `reba.py`, `classifier.py`, `config_client.py`, `estimator.py`, `pipeline.py`, `run_pipeline.py`) — nenhum arquivo novo além de `src/pose/reba_smoother.py`. Ordem das tasks é a ordem de dependência: campos de config primeiro (Task 1), depois threshold configurável (Task 2, independente), depois vetor de verticalidade (Task 3), depois indeterminado+suavização (Task 4, depende de Task 3 pro campo `indeterminate`), depois gate de zona (Task 5, independente), por fim o wiring de CLI/precedência em `run_pipeline.py` (Task 6, amarra tudo).

**Tech Stack:** Python 3, pytest, numpy, dataclasses, PyYAML.

**Spec:** `docs/superpowers/specs/planejadas/2026-09-15-reba-camera-angulada-design.md`

## Global Constraints

- `rotacao` e `angulo_camera_graus` chegam do backend com `.get(..., 0)` — um capture rodando contra um backend ainda não redeployado (comum em campo, onde nem tudo reinicia junto) não pode quebrar.
- Threshold de confiança de keypoint, roll manual e stride de EPI seguem o mesmo padrão de configuração já usado no repo: campo em `PipelineConfig`, chave correspondente em `config/pose_config.yaml`, override opcional por `--flag` da CLI.
- Nenhuma dependência nova (sem instalar biblioteca de calibração/filtro — tudo com numpy que já é dependência).
- `zones/config_client.py` **não muda** — ele já recebe `width`/`height` corretos (pós-rotação) do chamador; rotação não é um conceito que o cliente de zonas precisa conhecer.

---

### Task 1: `CameraConfig` ganha `rotacao`/`angulo_camera_graus`

**Files:**
- Modify: `src/capture/config_client.py`
- Test: `tests/test_camera_config_client.py`

**Interfaces:**
- Produces: `CameraConfig.rotacao: int = 0`, `CameraConfig.angulo_camera_graus: int = 0`.

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/test_camera_config_client.py`, adicionar (reaproveitando `TransporteFake`/`AMBIENTE`/`AGORA` já definidos no arquivo):

```python
def test_rotacao_e_angulo_vem_da_api(tmp_path):
    corpo = {**CORPO, "rotacao": 90, "anguloCameraGraus": -12}
    transporte = TransporteFake(corpo=corpo)
    c = cliente(tmp_path, transporte)

    config = c.fetch("CAM-01", AMBIENTE)

    assert config.rotacao == 90
    assert config.angulo_camera_graus == -12


def test_rotacao_e_angulo_default_zero_quando_ausentes(tmp_path):
    """Backend ainda não redeployado com os campos novos — não pode quebrar."""
    transporte = TransporteFake(corpo=CORPO)  # CORPO não tem rotacao/anguloCameraGraus
    c = cliente(tmp_path, transporte)

    config = c.fetch("CAM-01", AMBIENTE)

    assert config.rotacao == 0
    assert config.angulo_camera_graus == 0
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_camera_config_client.py -k "rotacao_e_angulo" -v`
Expected: FAIL com `AttributeError: 'CameraConfig' object has no attribute 'rotacao'`

- [ ] **Step 3: Implementar**

Em `config_client.py`, no dataclass `CameraConfig` (linhas 88-99), adicionar após `ativa: bool`:

```python
    ativa: bool
    rotacao: int = 0
    angulo_camera_graus: int = 0
```

Em `_montar` (linhas 164-182), adicionar ao construtor de `CameraConfig`:

```python
        config = CameraConfig(
            codigo=bruto.get("codigo", ""),
            nome=bruto.get("nome", ""),
            estacao_id=bruto.get("estacaoId", ""),
            fonte=expand_placeholders(bruto.get("fonte"), env),
            stream_port=bruto.get("streamPort"),
            ativa=bool(bruto.get("ativa", True)),
            rotacao=int(bruto.get("rotacao") or 0),
            angulo_camera_graus=int(bruto.get("anguloCameraGraus") or 0),
            origem=origem,
            idade_segundos=idade,
        )
```

(Nota: `CameraConfig` é um dataclass posicional — como `rotacao`/`angulo_camera_graus` têm default e foram inseridos ANTES de `origem`/`idade_segundos` que também têm posição fixa no dataclass original, use kwargs em toda construção, como já é o padrão em `_montar`. Nenhum outro ponto do código constrói `CameraConfig` posicionalmente — confirmado por `grep -rn "CameraConfig(" src/`.)

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_camera_config_client.py -v`
Expected: PASS (todos, incluindo os 2 novos)

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/capture/config_client.py tests/test_camera_config_client.py
git commit -m "feat: CameraConfig le rotacao e anguloCameraGraus do cadastro"
```

---

### Task 2: Threshold de confiança de keypoint configurável

**Files:**
- Modify: `src/pose/estimator.py`
- Modify: `src/fusion/pipeline.py`
- Modify: `config/pose_config.yaml`

**Interfaces:**
- Produces: `PersonPose.kp_confidence_threshold: float = 0.5` (novo campo do dataclass); `PoseEstimator.__init__(..., kp_confidence: float = 0.5)`; `PipelineConfig.kp_confidence: float = 0.5`.

- [ ] **Step 1: `PersonPose` ganha o threshold como campo, `kp()` usa `self`**

Em `src/pose/estimator.py`, no dataclass `PersonPose` (linhas 25-38):

```python
@dataclass
class PersonPose:
    person_id: int
    keypoints: np.ndarray           # (17, 2) pixel coordinates
    confidences: np.ndarray         # (17,) float in [0, 1]
    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2
    timestamp: float = field(default_factory=time.time)
    kp_confidence_threshold: float = 0.5

    def kp(self, name: str) -> Optional[tuple[float, float]]:
        """Return (x, y) for the keypoint if confidence >= threshold, else None."""
        idx = KP[name]
        if self.confidences[idx] >= self.kp_confidence_threshold:
            return (float(self.keypoints[idx, 0]), float(self.keypoints[idx, 1]))
        return None
```

- [ ] **Step 2: `PoseEstimator` recebe e propaga o threshold**

Em `PoseEstimator.__init__` (linhas 52-60):

```python
    def __init__(
        self,
        model_path: str = "yolo11s-pose.pt",
        conf: float = 0.5,
        device: str = "cpu",
        kp_confidence: float = 0.5,
    ) -> None:
        self.model = YOLO(model_path)
        self.conf = conf
        self.device = device
        self.kp_confidence = kp_confidence
```

Em `estimate()` (linha 90, dentro do loop `for i in range(len(kps_data)):`):

```python
                poses.append(PersonPose(
                    person_id=person_id,
                    keypoints=kps_data[i, :, :2],
                    confidences=kps_data[i, :, 2],
                    bbox=tuple(boxes[i].tolist()),
                    kp_confidence_threshold=self.kp_confidence,
                ))
```

- [ ] **Step 3: `PipelineConfig` ganha o campo e propaga pro `PoseEstimator`**

Em `src/fusion/pipeline.py`, no dataclass `PipelineConfig` (linha 36, logo após `conf_pose: float = 0.5`):

```python
    conf_pose: float = 0.5
    kp_confidence: float = 0.5
```

Em `UnifiedPipeline.__init__` (linha 79):

```python
        self._pose = PoseEstimator(
            config.pose_model_path, config.conf_pose, config.device,
            kp_confidence=config.kp_confidence,
        )
```

- [ ] **Step 4: YAML — documentar a chave nova**

Em `config/pose_config.yaml`, na seção `pipeline:`, logo após `conf_pose: 0.5` (linha 10):

```yaml
  conf_pose: 0.5
  kp_confidence: 0.5                 # confianca minima por keypoint p/ ser usado nos angulos (ajustavel em campo,
                                      # antes hard-coded em PersonPose.kp()); subir aumenta frames indeterminados
```

- [ ] **Step 5: Rodar a suíte pra confirmar que nada quebrou (não há teste dedicado a `estimator.py` hoje)**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/ -v`
Expected: PASS (mudança é aditiva com default idêntico ao valor hard-coded anterior)

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/pose/estimator.py src/fusion/pipeline.py config/pose_config.yaml
git commit -m "feat: threshold de confianca de keypoint configuravel via pose_config.yaml"
```

---

### Task 3: `trunk_flexion` usa vetor de verticalidade (corrige roll)

**Files:**
- Modify: `src/pose/angles.py`
- Test: `tests/test_angles.py` (novo — não existe teste dedicado a `angles.py` hoje)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `vertical_from_roll(roll_deg: float) -> tuple[float, float]`; `extract_angles(pose: PersonPose, vertical_reference: tuple[float, float] = (0.0, -1.0)) -> JointAngles` (assinatura muda, com default que preserva o comportamento atual para quem não passar o parâmetro).

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_angles.py`:

```python
"""
Testes de src/pose/angles.py — foco na generalizacao de trunk_flexion para
aceitar uma referencia de verticalidade (correcao de roll de camera), que
precisa reproduzir o comportamento antigo (assumir roll=0) quando ninguem
passa vertical_reference.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from src.pose.angles import JointAngles, extract_angles, vertical_from_roll
from src.pose.estimator import PersonPose


def make_pose(mid_shoulder: tuple[float, float], mid_hip: tuple[float, float]) -> PersonPose:
    """Pose so com ombro/quadril, confianca alta, na posicao dada (o resto fica ausente)."""
    from src.pose.estimator import KP
    keypoints = np.zeros((17, 2))
    confidences = np.zeros(17)
    for side, pt in (("left", mid_shoulder), ("right", mid_shoulder)):
        keypoints[KP[f"{side}_shoulder"]] = pt
        confidences[KP[f"{side}_shoulder"]] = 1.0
    for side, pt in (("left", mid_hip), ("right", mid_hip)):
        keypoints[KP[f"{side}_hip"]] = pt
        confidences[KP[f"{side}_hip"]] = 1.0
    return PersonPose(person_id=1, keypoints=keypoints, confidences=confidences,
                       bbox=(0.0, 0.0, 100.0, 200.0))


def test_vertical_from_roll_zero_e_eixo_y_negativo():
    assert vertical_from_roll(0.0) == pytest.approx((0.0, -1.0))


def test_vertical_from_roll_noventa_graus():
    vx, vy = vertical_from_roll(90.0)
    assert (vx, vy) == pytest.approx((1.0, 0.0), abs=1e-9)


def test_trunk_flexion_upright_sem_correcao():
    """Pessoa em pe (ombro acima do quadril), sem roll: flexao ~0."""
    pose = make_pose(mid_shoulder=(50.0, 50.0), mid_hip=(50.0, 150.0))
    angles = extract_angles(pose)
    assert angles.trunk_flexion == pytest.approx(0.0, abs=1e-6)


def test_trunk_flexion_default_bate_com_formula_antiga():
    """dx=30, dy=-100 (ombro acima e a direita do quadril) — reproduz
    arctan2(abs(dx), abs(dy)) da implementacao anterior."""
    pose = make_pose(mid_shoulder=(80.0, 50.0), mid_hip=(50.0, 150.0))
    angles = extract_angles(pose)
    esperado = math.degrees(math.atan2(30.0, 100.0))
    assert angles.trunk_flexion == pytest.approx(esperado, abs=1e-6)


def test_trunk_flexion_corrigida_por_roll_da_camera():
    """Pessoa fisicamente em pe, mas a camera tem roll de 30 graus: sem
    correcao o torso pareceria inclinado 30 graus; com a referencia vertical
    rotacionada, a flexao medida volta a ~0."""
    # Torso "reto" já rotacionado 30° na imagem por causa do roll da câmera
    # (ombro sobre o quadril, girado 30° em torno do quadril).
    theta = math.radians(30.0)
    comprimento = 100.0
    dx = comprimento * math.sin(theta)
    dy = -comprimento * math.cos(theta)
    mid_hip = (50.0, 150.0)
    mid_shoulder = (mid_hip[0] + dx, mid_hip[1] + dy)

    pose = make_pose(mid_shoulder=mid_shoulder, mid_hip=mid_hip)
    vertical = vertical_from_roll(30.0)

    angles = extract_angles(pose, vertical_reference=vertical)
    assert angles.trunk_flexion == pytest.approx(0.0, abs=1e-6)
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_angles.py -v`
Expected: FAIL com `ImportError: cannot import name 'vertical_from_roll'`

- [ ] **Step 3: Implementar em `angles.py`**

Adicionar após os imports (linha 8), antes de `_angle`:

```python
import math


def vertical_from_roll(roll_deg: float) -> tuple[float, float]:
    """Vetor "vertical do mundo" em coordenadas de imagem, para uma camera com
    roll de `roll_deg` graus (rotacao lateral, nao gira o frame inteiro como
    apply_rotation — so corrige o calculo de angulo). roll=0 reproduz o eixo Y
    hard-coded que o codigo assumia antes (0, -1).

    Convencao de sinal NAO validada empiricamente ainda — se a correcao sair
    invertida em campo, use o valor negado (ex.: -12 em vez de 12).
    """
    theta = math.radians(roll_deg)
    return (math.sin(theta), -math.cos(theta))


def _angle_from_vertical(vec: tuple[float, float], vertical: tuple[float, float]) -> float:
    """Menor angulo entre `vec` e `vertical` (ou seu oposto), em graus [0, 90].
    Generaliza o antigo arctan2(abs(dx), abs(dy)) para uma vertical arbitraria:
    dobra o resultado sobre 90 do mesmo jeito que abs() fazia para vertical=(0,-1)."""
    vx, vy = vec
    ux, uy = vertical
    norm_v = math.hypot(vx, vy)
    norm_u = math.hypot(ux, uy)
    if norm_v < 1e-6 or norm_u < 1e-6:
        return 0.0
    cos_a = max(-1.0, min(1.0, (vx * ux + vy * uy) / (norm_v * norm_u)))
    ang = math.degrees(math.acos(cos_a))
    return min(ang, 180.0 - ang)
```

Modificar `extract_angles` (linha 52) e o bloco de `trunk_flexion` (linhas 60-70):

```python
def extract_angles(
    pose: PersonPose,
    vertical_reference: tuple[float, float] = (0.0, -1.0),
) -> JointAngles:
    """Compute all joint angles from a PersonPose. Returns None for angles with low-confidence keypoints.

    `vertical_reference` e a direcao de "para cima" no mundo real, em
    coordenadas de imagem — default (0, -1) assume camera sem roll. Passe
    `vertical_from_roll(angulo)` para corrigir camera fisicamente inclinada.
    """
    g = pose.kp
    angles = JointAngles(person_id=pose.person_id)

    mid_shoulder = _midpoint(g("left_shoulder"), g("right_shoulder"))
    mid_hip = _midpoint(g("left_hip"), g("right_hip"))

    # Trunk flexion: angle between the torso vector (mid_hip → mid_shoulder)
    # and the world-vertical reference (image axis by default, or corrected
    # for camera roll). 0° = upright, 90° = horizontal torso.
    if mid_shoulder and mid_hip:
        dx = mid_shoulder[0] - mid_hip[0]
        dy = mid_shoulder[1] - mid_hip[1]  # image y grows downward
        angles.trunk_flexion = _angle_from_vertical((dx, dy), vertical_reference)
```

(O resto da função não muda.)

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_angles.py tests/test_reba.py tests/test_classifier.py -v`
Expected: PASS em tudo (a suíte de REBA/classifier usa `JointAngles` construído diretamente, não `extract_angles`, então não é afetada pela mudança de assinatura)

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/pose/angles.py tests/test_angles.py
git commit -m "feat: trunk_flexion aceita referencia de verticalidade (corrige roll de camera)"
```

---

### Task 4: REBA indeterminado sob oclusão + suavização temporal

**Files:**
- Modify: `src/pose/reba.py`
- Create: `src/pose/reba_smoother.py`
- Modify: `src/fusion/pipeline.py`
- Test: `tests/test_reba.py`
- Test: `tests/test_reba_smoother.py` (novo)

**Interfaces:**
- Produces: `REBAScore.indeterminate: bool = False`; `RebaSmoother.smooth(person_id: int, reba: REBAScore) -> int`; `UnifiedPipeline.indeterminate_rate` (property, 0.0–1.0, últimos N frames).
- Consumes: nenhuma task anterior diretamente (independente de Task 3), mas se integra no mesmo trecho de `pipeline.py` que Task 3 tocaria — implemente Task 3 primeiro para evitar conflito de merge no mesmo bloco.

- [ ] **Step 1: Escrever o teste que falha para `REBAScore.indeterminate`**

Em `tests/test_reba.py`, adicionar (usar o `make_angles` helper já existente no arquivo — leia o restante do arquivo antes de editar para replicar a assinatura exata):

```python
class TestIndeterminado:
    """Keypoint ausente marca o frame como indeterminado em vez de virar
    silenciosamente 'risco minimo' (score 1) — achado da auditoria de vies
    sistematico de oclusao."""

    def test_todos_angulos_presentes_nao_e_indeterminado(self):
        angles = make_angles(trunk_flexion=10, neck_flexion=170,
                              left_knee_flexion=170, right_knee_flexion=170,
                              left_shoulder_elevation=10, right_shoulder_elevation=10,
                              left_elbow_flexion=80, right_elbow_flexion=80)
        score = compute_reba(angles)
        assert score.indeterminate is False

    def test_trunk_flexion_ausente_e_indeterminado(self):
        angles = make_angles(trunk_flexion=None, neck_flexion=170,
                              left_knee_flexion=170, right_knee_flexion=170,
                              left_shoulder_elevation=10, right_shoulder_elevation=10,
                              left_elbow_flexion=80, right_elbow_flexion=80)
        score = compute_reba(angles)
        assert score.indeterminate is True

    def test_ambos_joelhos_ausentes_e_indeterminado(self):
        angles = make_angles(trunk_flexion=10, neck_flexion=170,
                              left_knee_flexion=None, right_knee_flexion=None,
                              left_shoulder_elevation=10, right_shoulder_elevation=10,
                              left_elbow_flexion=80, right_elbow_flexion=80)
        score = compute_reba(angles)
        assert score.indeterminate is True

    def test_um_joelho_presente_nao_e_indeterminado(self):
        """Bilateral: um lado visivel basta (mesma regra que _legs_score ja usa)."""
        angles = make_angles(trunk_flexion=10, neck_flexion=170,
                              left_knee_flexion=170, right_knee_flexion=None,
                              left_shoulder_elevation=10, right_shoulder_elevation=10,
                              left_elbow_flexion=80, right_elbow_flexion=80)
        score = compute_reba(angles)
        assert score.indeterminate is False
```

(Se `make_angles` não aceitar todos esses kwargs nomeados, ajuste os nomes para bater com o helper real do arquivo — ele já existe e é usado por todos os outros testes da suíte.)

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_reba.py -k Indeterminado -v`
Expected: FAIL com `AttributeError: 'REBAScore' object has no attribute 'indeterminate'`

- [ ] **Step 3: Implementar em `reba.py`**

No dataclass `REBAScore` (linhas 69-82), adicionar campo:

```python
@dataclass
class REBAScore:
    person_id: int
    trunk_score: int = 1
    neck_score: int = 1
    legs_score: int = 1
    upper_arm_score: int = 1
    lower_arm_score: int = 1
    wrist_score: int = 1
    score_a: int = 1
    score_b: int = 1
    final_score: int = 1
    action_level: int = 1
    action_description: str = "Negligible risk — no action required"
    indeterminate: bool = False
```

Em `compute_reba` (linhas 163-176), logo após calcular os scores individuais (antes do lookup de Table A):

```python
    score.trunk_score = _trunk_score(angles.trunk_flexion)
    score.neck_score = _neck_score(angles.neck_flexion)
    score.legs_score = _legs_score(angles.left_knee_flexion, angles.right_knee_flexion)
    score.upper_arm_score = _upper_arm_score(
        angles.left_shoulder_elevation, angles.right_shoulder_elevation
    )
    score.lower_arm_score = _lower_arm_score(
        angles.left_elbow_flexion, angles.right_elbow_flexion
    )
    score.wrist_score = 1  # 2D vision cannot reliably estimate wrist deviation

    # Indeterminado: um componente usado nas tabelas A/B nao pode ser lido do
    # frame (oclusao/baixa confianca). Sinaliza o chamador em vez de deixar o
    # score-1 de fallback virar "risco minimo" silencioso (achado de auditoria:
    # antes disto, oclusao parcial sub-notificava risco sem nenhum sinal).
    score.indeterminate = (
        angles.trunk_flexion is None
        or angles.neck_flexion is None
        or (angles.left_knee_flexion is None and angles.right_knee_flexion is None)
        or (angles.left_shoulder_elevation is None and angles.right_shoulder_elevation is None)
        or (angles.left_elbow_flexion is None and angles.right_elbow_flexion is None)
    )
```

(`final_score`/`action_level` continuam calculados normalmente mesmo quando `indeterminate=True` — o valor de fallback score=1 permanece como "melhor palpite" para quem não checar a flag; quem checa, ex. `RebaSmoother`, decide o que fazer.)

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_reba.py -v`
Expected: PASS em tudo (campo novo com default `False` não muda nenhum assert existente)

- [ ] **Step 5: Escrever o teste que falha para `RebaSmoother`**

Criar `tests/test_reba_smoother.py`:

```python
"""
Testes de RebaSmoother (src/pose/reba_smoother.py) — suaviza final_score por
mediana movel, pulando frames indeterminados (achado da auditoria: REBA era
calculado cru por frame, sem nenhuma suavizacao, so a categoria discreta
tinha histerese).
"""
from __future__ import annotations

from src.pose.reba import REBAScore
from src.pose.reba_smoother import RebaSmoother


def score(final: int, indeterminate: bool = False) -> REBAScore:
    return REBAScore(person_id=1, final_score=final, indeterminate=indeterminate)


def test_primeiro_frame_devolve_o_proprio_valor():
    smoother = RebaSmoother(window=5)
    assert smoother.smooth(1, score(4)) == 4


def test_suaviza_por_mediana_da_janela():
    smoother = RebaSmoother(window=3)
    smoother.smooth(1, score(2))
    smoother.smooth(1, score(2))
    resultado = smoother.smooth(1, score(9))  # outlier isolado
    assert resultado == 2  # mediana de [2, 2, 9]


def test_frame_indeterminado_nao_entra_na_janela_e_devolve_ultimo_valido():
    smoother = RebaSmoother(window=3)
    smoother.smooth(1, score(7))
    resultado = smoother.smooth(1, score(1, indeterminate=True))
    assert resultado == 7  # nao contamina com o score(1) de fallback


def test_pessoas_diferentes_tem_janelas_independentes():
    smoother = RebaSmoother(window=3)
    smoother.smooth(1, score(9))
    resultado_pid2 = smoother.smooth(2, score(2))
    assert resultado_pid2 == 2
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_reba_smoother.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'src.pose.reba_smoother'`

- [ ] **Step 7: Implementar `src/pose/reba_smoother.py`**

```python
"""
Suavizacao temporal do score REBA final, por pessoa rastreada.

Achado da auditoria (2026-09-15): o REBA numerico era calculado cru a cada
frame — so a CATEGORIA discreta (normal/inadequado/risco/zona) tinha
histerese via PostureClassifier. Um unico frame de pose ruidosa podia gerar
um final_score espurio. Isto suaviza o numero em si, ignorando frames
indeterminados (ver REBAScore.indeterminate) em vez de deixa-los
contaminar a mediana com o score-1 de fallback.
"""
from __future__ import annotations

from collections import defaultdict, deque

import numpy as np

from .reba import REBAScore


class RebaSmoother:
    def __init__(self, window: int = 5) -> None:
        self.window = window
        self._history: dict[int, deque] = defaultdict(lambda: deque(maxlen=window))
        self._last_valid: dict[int, int] = {}

    def smooth(self, person_id: int, reba: REBAScore) -> int:
        """Mediana movel de final_score, pulando frames indeterminados.
        Sem nenhum frame valido ainda, devolve o proprio valor bruto."""
        if reba.indeterminate:
            return self._last_valid.get(person_id, reba.final_score)

        self._history[person_id].append(reba.final_score)
        self._last_valid[person_id] = reba.final_score
        return int(np.median(self._history[person_id]))
```

- [ ] **Step 8: Rodar e confirmar sucesso**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_reba_smoother.py -v`
Expected: PASS

- [ ] **Step 9: Ligar no pipeline + contador de taxa de indeterminados**

Em `src/fusion/pipeline.py`, import (linha 20, junto dos outros de `pose`):

```python
from ..pose.reba import compute_reba
from ..pose.reba_smoother import RebaSmoother
```

Em `UnifiedPipeline.__init__` (após linha 88, `self._temporal = ...`):

```python
        self._reba_smoother = RebaSmoother(window=5)
        self._indeterminate_history: deque = deque(maxlen=150)  # ~10s a 15fps, so pro HUD
```

(Adicionar `from collections import deque` ao topo do arquivo — hoje só importa `dataclass, field, fields` de `dataclasses`; `deque` não está importado em `pipeline.py`.)

No loop `for pose in poses:` (linhas 146-148), substituir:

```python
        for pose in poses:
            angles = extract_angles(pose, self._vertical_reference)
            reba = compute_reba(angles)
            self._indeterminate_history.append(reba.indeterminate)
            reba.final_score = self._reba_smoother.smooth(pose.person_id, reba)
```

(`self._vertical_reference` é setado pela Task 6 — sem ela, use `(0.0, -1.0)` como placeholder temporário nesta task para não quebrar o build antes da Task 6 rodar. Se as tasks forem executadas em ordem, a Task 6 já vai ter adicionado `self._vertical_reference` ao `__init__` antes deste ponto ser lido; se este task for revisado isoladamente, troque por `extract_angles(pose)` sem segundo argumento.)

Adicionar a property no fim da classe (antes de `run_video`):

```python
    @property
    def indeterminate_rate(self) -> float:
        """Fracao de frames indeterminados na janela recente (HUD de campo:
        subir kp_confidence aumenta isto, e sem esse numero parece que o
        sistema quebrou em vez de estar sendo mais conservador)."""
        if not self._indeterminate_history:
            return 0.0
        return sum(self._indeterminate_history) / len(self._indeterminate_history)
```

- [ ] **Step 10: HUD em `run_pipeline.py`**

Na linha 381-384 (montagem do `hud`), adicionar o indicador:

```python
            hud = (f"f{frame_idx:5d}  {dt_ms:6.1f}ms (avg {avg:5.1f} | {fps:4.1f} FPS)  "
                   f"pose {tm.get('pose_ms', 0):5.1f} | epi {tm.get('epi_ms', 0):5.1f}{epi_tag} | "
                   f"analysis {tm.get('analysis_ms', 0):4.1f} | overlay {tm.get('overlay_ms', 0):4.1f} | "
                   f"stride {pipeline._epi_stride} | indeterm {pipeline.indeterminate_rate * 100:4.1f}%")
```

- [ ] **Step 11: Rodar a suíte inteira**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/ -v`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/pose/reba.py src/pose/reba_smoother.py src/fusion/pipeline.py \
        src/run_pipeline.py tests/test_reba.py tests/test_reba_smoother.py
git commit -m "feat: REBA indeterminado sob oclusao + suavizacao temporal do score"
```

---

### Task 5: Gate de zona no alerta ergonômico

**Files:**
- Modify: `src/pose/classifier.py`
- Modify: `src/fusion/pipeline.py`
- Test: `tests/test_classifier.py`

**Interfaces:**
- Produces: `PostureClassifier.update(..., ergonomic_eval_enabled: bool = True)` (novo kwarg, default preserva comportamento atual).

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/test_classifier.py`, adicionar (reaproveitando `neutral_angles`/`reba`/`TALL_BBOX` já definidos no arquivo — confira a assinatura exata dos helpers antes de editar):

```python
class TestGateDeZona:
    """Alerta ergonomico (REBA/postura sustentada) so vale dentro da zona
    configurada; queda e zona critica continuam ativas sempre (achado da
    auditoria: zona so alimentava um flag, nao restringia nada)."""

    def test_reba_alto_fora_da_zona_com_gate_desativado_nao_dispara(self):
        clf = PostureClassifier(enter_frames=1)
        estado = clf.update(1, neutral_angles(1), reba(9), TALL_BBOX,
                             ergonomic_eval_enabled=False)
        assert estado.category == PostureCategory.NORMAL

    def test_reba_alto_com_gate_ativado_dispara(self):
        clf = PostureClassifier(enter_frames=1)
        estado = clf.update(1, neutral_angles(1), reba(9), TALL_BBOX,
                             ergonomic_eval_enabled=True)
        assert estado.category == PostureCategory.ERGONOMICALLY_INADEQUATE

    def test_queda_dispara_mesmo_com_gate_desativado(self):
        clf = PostureClassifier(enter_frames_risk=1)
        estado = clf.update(1, neutral_angles(1), reba(1), WIDE_BBOX,
                             ergonomic_eval_enabled=False)
        assert estado.category == PostureCategory.IMMEDIATE_RISK

    def test_gate_default_preserva_comportamento_atual(self):
        """Quem nao passa o kwarg novo continua avaliando ergonomia sempre
        (compatibilidade com todo o resto da suite que ja chama update sem ele)."""
        clf = PostureClassifier(enter_frames=1)
        estado = clf.update(1, neutral_angles(1), reba(9), TALL_BBOX)
        assert estado.category == PostureCategory.ERGONOMICALLY_INADEQUATE
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_classifier.py -k GateDeZona -v`
Expected: FAIL com `TypeError: update() got an unexpected keyword argument 'ergonomic_eval_enabled'`

- [ ] **Step 3: Implementar em `classifier.py`**

Modificar `update` (linhas 88-99):

```python
    def update(
        self,
        person_id: int,
        angles: JointAngles,
        reba: REBAScore,
        bbox: tuple,
        in_critical_zone: bool = False,
        fall_risk: float = 0.0,
        ergonomic_eval_enabled: bool = True,
    ) -> PostureState:
        raw_cat, raw_reason = self._evaluate_rules(
            angles, reba, bbox, in_critical_zone, fall_risk, ergonomic_eval_enabled
        )
```

Modificar `_evaluate_rules` (linhas 132-167):

```python
    def _evaluate_rules(
        self,
        angles: JointAngles,
        reba: REBAScore,
        bbox: tuple,
        in_critical_zone: bool,
        fall_risk: float,
        ergonomic_eval_enabled: bool = True,
    ) -> tuple[PostureCategory, str]:
        # Priority order: IMMEDIATE_RISK > CRITICAL_ZONE > ERGONOMICALLY_INADEQUATE

        if self._detect_fallen(bbox, angles):
            return PostureCategory.IMMEDIATE_RISK, "person_fallen"

        if fall_risk >= self.t.fall_risk_min:
            return PostureCategory.IMMEDIATE_RISK, "fall_velocity"

        if self._detect_instability(angles):
            return PostureCategory.IMMEDIATE_RISK, "balance_loss_risk"

        if in_critical_zone:
            return PostureCategory.CRITICAL_ZONE, "critical_zone_entry"

        # Gate de zona (spec RCC): alerta ergonomico so vale dentro de uma
        # zona configurada, quando a camera tem alguma zona cadastrada. Queda
        # e zona critica (acima) NUNCA sao gateados — sao checagens de
        # seguranca independentes de zona de trabalho estar configurada.
        if not ergonomic_eval_enabled:
            return PostureCategory.NORMAL, ""

        if self._detect_spine_load(angles):
            return PostureCategory.ERGONOMICALLY_INADEQUATE, "trunk_flexion_spine_load"

        if self._detect_prolonged_squat(angles):
            return PostureCategory.ERGONOMICALLY_INADEQUATE, "prolonged_squat"

        if self._detect_elevated_arm(angles):
            return PostureCategory.ERGONOMICALLY_INADEQUATE, "elevated_arm_work"

        if reba.final_score >= self.t.reba_risk_score:
            return PostureCategory.ERGONOMICALLY_INADEQUATE, f"reba_{reba.final_score}"

        return PostureCategory.NORMAL, ""
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_classifier.py -v`
Expected: PASS em tudo

- [ ] **Step 5: Ligar no pipeline**

Em `src/fusion/pipeline.py`, no loop principal (linhas 150-169), logo após calcular `in_zone`:

```python
            feet = [pt for pt in [pose.kp("left_ankle"), pose.kp("right_ankle")] if pt]
            zone_results = self._zone_detector.check(pose.person_id, feet)
            in_zone = any(z.status == ZoneStatus.INSIDE for z in zone_results)
            # Gate de zona (spec RCC): so restringe avaliacao ergonomica quando
            # a camera TEM zona cadastrada — sem nenhuma zona, comportamento
            # inalterado (avalia todo mundo), pra nao regredir cameras que
            # nunca tiveram zona de risco configurada.
            zona_configurada = len(self._zones.get_all()) > 0
            ergonomic_eval_enabled = (not zona_configurada) or in_zone

            prev_state = self._classifier.get_state(pose.person_id)
            prev_category = prev_state.category
            metrics = self._temporal.update(
                pose.person_id, angles, pose.bbox,
                is_bad_posture=prev_state.category != PostureCategory.NORMAL,
            )

            posture_state = self._classifier.update(
                pose.person_id, angles, reba, pose.bbox, in_zone,
                fall_risk=metrics.fall_risk_score,
                ergonomic_eval_enabled=ergonomic_eval_enabled,
            )
```

- [ ] **Step 6: Rodar a suíte inteira**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/ -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/pose/classifier.py src/fusion/pipeline.py tests/test_classifier.py
git commit -m "feat: gate de zona restringe alerta ergonomico, preserva queda/zona critica"
```

---

### Task 6: `run_pipeline.py` — precedência CLI > cadastro, roll no pipeline, HUD

**Files:**
- Modify: `src/run_pipeline.py`
- Modify: `src/fusion/pipeline.py`

**Interfaces:**
- Consumes: `CameraConfig.rotacao`/`.angulo_camera_graus` (Task 1), `vertical_from_roll` (Task 3), `PipelineConfig` (Task 2).
- Produces: `PipelineConfig.camera_roll_deg: float = 0.0`; `UnifiedPipeline._vertical_reference` setado no `__init__` a partir desse campo.

- [ ] **Step 1: `PipelineConfig` ganha `camera_roll_deg` e `UnifiedPipeline` computa `_vertical_reference`**

Em `src/fusion/pipeline.py`, no dataclass `PipelineConfig` (após `kp_confidence`, adicionado na Task 2):

```python
    kp_confidence: float = 0.5
    camera_roll_deg: float = 0.0
```

Em `UnifiedPipeline.__init__`, após `self._pose = PoseEstimator(...)`:

```python
        from ..pose.angles import vertical_from_roll
        self._vertical_reference = vertical_from_roll(config.camera_roll_deg)
```

(Import local para não criar dependência circular no topo do módulo — `angles.py` já é importado no topo para `extract_angles`; se preferir, mova `vertical_from_roll` para o import já existente na linha 19: `from ..pose.angles import extract_angles, vertical_from_roll` e remova o import local.)

- [ ] **Step 2: CLI — `--rotate` vira opcional (default `None`, não `0`) e novo `--camera-roll-deg`**

Em `parse_args()` (linhas 123-130), substituir:

```python
    p.add_argument("--rotate", type=int, default=None, choices=[0, 90, 180, 270],
                   help="graus (sentido horario) para corrigir uma camera "
                        "montada fisicamente virada (instalacao tipo corredor) "
                        "— aplicado em cada frame bruto antes de qualquer "
                        "analise. 90/270 trocam largura x altura, o que muda "
                        "a resolucao usada para buscar zonas no cadastro; "
                        "zonas calibradas na orientacao antiga precisam ser "
                        "re-desenhadas (scripts/annotate_zones.py) apos girar. "
                        "Default: le do cadastro da camera (campo rotacao); "
                        "se nem cadastro nem esta flag informarem, usa 0.")
    p.add_argument("--camera-roll-deg", type=float, default=None,
                   help="graus de inclinacao lateral (roll) da camera, so "
                        "para corrigir o calculo de flexao de tronco do REBA "
                        "— nao gira o frame (diferente de --rotate). Default: "
                        "le do cadastro (campo anguloCameraGraus); sem "
                        "cadastro nem flag, usa 0.")
```

- [ ] **Step 3: Resolver precedência CLI > cadastro > 0, logo após `config_remota` ser resolvido**

Após o bloco `elif args.camera_id and not args.source:` (linhas 199-201), adicionar:

```python
    rotate = args.rotate if args.rotate is not None else (
        config_remota.rotacao if config_remota is not None else 0)
    camera_roll_deg = args.camera_roll_deg if args.camera_roll_deg is not None else (
        config_remota.angulo_camera_graus if config_remota is not None else 0.0)
    args.rotate = rotate  # normaliza pro resto do arquivo, que ja usa args.rotate
    config.camera_roll_deg = camera_roll_deg

    if rotate:
        print(f"[config] rotate={rotate}° (horario) aplicado em cada frame bruto")
    if camera_roll_deg:
        print(f"[config] camera_roll_deg={camera_roll_deg}° aplicado so no calculo de flexao de tronco")
```

Remover o bloco antigo que imprimia rotate logo depois de `config = PipelineConfig.from_yaml(...)` (linhas 145-146:
```python
    if args.rotate:
        print(f"[config] rotate={args.rotate}° (horario) aplicado em cada frame bruto")
```
), já que a nova impressão (acima) acontece depois que `config_remota` existe e cobre o mesmo caso.

- [ ] **Step 4: Confirmar que `pipeline = UnifiedPipeline(config)` (linha 210) já roda depois deste bloco**

Não precisa mudar nada aqui — `UnifiedPipeline(config)` já é construído na linha 210, depois do bloco de resolução do Step 3 (que fica por volta da linha 201-202). Só confirme com `grep -n "UnifiedPipeline(config)" src/run_pipeline.py` que a ordem ficou: resolver `rotate`/`camera_roll_deg` → setar `config.camera_roll_deg` → **depois** `UnifiedPipeline(config)`. Se a ordem inverter, mova o bloco do Step 3 para antes da linha `pipeline = UnifiedPipeline(config)`.

- [ ] **Step 5: Testar manualmente com um vídeo de validação já existente no repo**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python src/run_pipeline.py --source data/validation/cenario1.mp4 --no-display --max-frames 30 --camera-roll-deg 10`
Expected: roda sem erro, HUD imprime `f 30` e a linha de config mostra `camera_roll_deg=10.0°`.

- [ ] **Step 6: Rodar a suíte inteira do repo**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/ -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/run_pipeline.py src/fusion/pipeline.py
git commit -m "feat: rotacao e roll vem do cadastro por default, --rotate/--camera-roll-deg viram override"
```

## Self-Review

- **Cobertura da spec:** rotação/roll do cadastro (Tasks 1 e 6), threshold configurável (Task 2), vetor de verticalidade corrigindo roll (Task 3), indeterminado+suavização (Task 4), gate de zona só no ergonômico (Task 5) — as 6 decisões de design da spec RCC estão todas cobertas.
- **Placeholders:** nenhum, exceto a nota explícita na Task 4/Step 9 sobre `self._vertical_reference` só existir após a Task 6 — documentado como ordem de execução, não como lacuna a preencher depois.
- **Consistência de tipos:** `extract_angles(pose, vertical_reference)` (Task 3) é chamado em `pipeline.py` como `extract_angles(pose, self._vertical_reference)` (Task 4/6) — mesmo nome de parâmetro posicional, tipo `tuple[float, float]` em ambos os lados. `REBAScore.indeterminate` (Task 4) é lido por `RebaSmoother.smooth` (mesma task) e teria sido lido por qualquer consumidor futuro — nome estável em todo o plano. `ergonomic_eval_enabled` (Task 5) tem o mesmo nome em `PostureClassifier.update`, `_evaluate_rules` e na chamada em `pipeline.py`.
