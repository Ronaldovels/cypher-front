# E1-B · cypher-capture, do `print()` ao incidente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o pipeline de visão computacional emitir incidentes para a API e servir o vídeo anotado ao vivo, sem tocar no orçamento de latência do laço de frames.

**Architecture:** Um módulo novo `src/notify/` com quatro peças pequenas. O `IncidentTracker` traduz transições da máquina de estados já existente em episódios com início e fim; o `HttpIncidentSink` envia numa thread separada com fila limitada, retry e spill em disco; o `MjpegServer` publica o último frame anotado. O pipeline continua se comportando exatamente como hoje quando `api_url` não está configurado.

**Tech Stack:** Python 3.10, `requests`, `PyYAML`, `queue`/`threading`/`http.server` da biblioteca padrão, pytest. Nenhuma dependência nova além do que já está em `requirements.txt`.

**Spec:** `docs/superpowers/specs/2026-08-10-notificacao-de-incidentes-design.md` §3, §4, §7, §8.

**Depende de:** plano E1-A, Tasks 1–13 (a API precisa existir para a verificação de ponta a ponta da Task 8; as Tasks 1–7 deste plano não precisam dela).

## Global Constraints

- **Repositório:** `/home/asaas/projects/challenge/cypher-capture`. Todos os caminhos são relativos a essa raiz.
- **Rodar sempre da raiz do projeto** — caminhos de modelos e configs são relativos a ela, como o README já avisa.
- **Interpretador:** `./venv/bin/python`. Os testes rodam com `./venv/bin/python -m pytest`.
- **Nenhum I/O de rede na thread do frame.** O orçamento é 200 ms e a medição atual é 45 ms p95; uma chamada HTTP síncrona dentro de `process_frame` consumiria essa folga. Toda saída é assíncrona por construção.
- **Perder um incidente é inaceitável.** Fila limitada, spill em disco e reenvio são escopo mínimo, não refinamento.
- **Compatibilidade para trás:** sem `notify.api_url` configurado, `run_pipeline.py` se comporta exatamente como hoje. Nenhum teste existente pode quebrar.
- **Estilo dos testes:** seguir `tests/test_classifier.py` — docstring de módulo explicando o que está sendo protegido, helpers no topo, sem GPU e sem modelo.
- **Commits:** um por tarefa, em português, no formato do repo (`feat(pose):`, `fix(reba):`).

---

## Estrutura de arquivos

```
src/notify/
├── __init__.py          CRIAR  reexporta IncidentTracker, HttpIncidentSink, MjpegServer
├── incident.py          CRIAR  IncidentReport, mapeamento categoria→tipo, serialização
├── tracker.py           CRIAR  transições → episódios; merge, eviction, pico, flush
├── sink.py              CRIAR  IncidentSink (protocolo), HttpIncidentSink, ConsoleIncidentSink
└── mjpeg.py             CRIAR  MjpegServer

src/fusion/engine.py     MODIFICAR  PersonEvent ganha previous_posture
src/fusion/pipeline.py   MODIFICAR  preenche previous_posture; publica frame no MJPEG
src/run_pipeline.py      MODIFICAR  flags novas, wiring, flush no finally
config/pose_config.yaml  MODIFICAR  seção notify

tests/
├── test_incident_tracker.py                CRIAR
├── test_incident_sink.py                   CRIAR
├── test_mjpeg.py                           CRIAR
└── fixtures/cenario2_transitions.json      CRIAR  log medido, para regressão
```

**Por que essa divisão.** `tracker.py` é lógica determinística e testável sem rede; `sink.py` é I/O e concorrência; `mjpeg.py` é um servidor independente. Misturá-los tornaria a parte mais crítica — a que decide o que é um incidente — impossível de testar sem subir socket. `incident.py` fica separado porque é o contrato compartilhado entre os outros dois e o único lugar que conhece nomes de campo do fio.

---

## Task 1: Estado anterior visível no evento

**Files:**
- Modify: `src/fusion/engine.py`
- Modify: `src/fusion/pipeline.py:153-167`
- Test: `tests/test_incident_tracker.py`

**Interfaces:**
- Consumes: `PersonEvent` (existente).
- Produces: `PersonEvent.previous_posture: str` (default `"normal"`), preenchido pelo pipeline com a categoria confirmada do frame anterior.

O pipeline já lê `prev_state = self._classifier.get_state(pose.person_id)` antes de chamar `update()`, então detectar a transição custa uma comparação. O que falta é expor isso no evento.

Detalhe que torna a comparação correta: quando há transição confirmada, `_apply_hysteresis` devolve um `PostureState` **novo** e o classificador troca o objeto guardado em `_states`; `prev_state` continua apontando para o objeto antigo, com a categoria antiga. Quando não há transição, `prev_state` é o mesmo objeto retornado. Nos dois casos a comparação de categorias diz a verdade.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_incident_tracker.py` com apenas o primeiro caso (o arquivo cresce nas Tasks 3 e 4):

```python
"""
Testes do ciclo de vida do incidente (src/notify/).

O que está sendo protegido: a tradução de transições da máquina de estados em
episódios com início e fim. Sem janela de merge, as 2 quedas reais de
cenario2.mp4 produzem 10 incidentes; sem eviction, 2 incidentes ficam abertos
para sempre. Ambos os números foram medidos, não estimados — ver a spec §4.1.2.

Nada aqui exige GPU ou modelo: os eventos são construídos à mão.
"""
from __future__ import annotations

from src.fusion.engine import PersonEvent


def test_evento_nasce_com_postura_anterior_normal():
    evento = PersonEvent(person_id=1)

    assert evento.previous_posture == "normal"


def test_postura_anterior_e_um_campo_independente_da_atual():
    evento = PersonEvent(person_id=1, posture="immediate_risk",
                         previous_posture="normal")

    assert evento.posture == "immediate_risk"
    assert evento.previous_posture == "normal"
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_tracker.py -q
```

Esperado: FALHA — `TypeError: PersonEvent.__init__() got an unexpected keyword argument 'previous_posture'`.

- [ ] **Step 3: Implementar o mínimo**

Em `src/fusion/engine.py`, acrescentar o campo ao `PersonEvent`, logo abaixo de `posture`:

```python
    posture: str = "normal"
    previous_posture: str = "normal"   # categoria confirmada no frame anterior
```

Em `src/fusion/pipeline.py`, dentro do laço `for pose in poses`, o bloco que hoje termina em `events.append(event)` passa a preencher o campo. O trecho completo, do `prev_state` ao `append`:

```python
            # Temporal metrics use the previous frame's confirmed state (one
            # frame of lag) so the fall-risk score can feed this frame's rules.
            prev_state = self._classifier.get_state(pose.person_id)
            prev_category = prev_state.category          # antes do update
            metrics = self._temporal.update(
                pose.person_id, angles, pose.bbox,
                is_bad_posture=prev_state.category != PostureCategory.NORMAL,
            )

            posture_state = self._classifier.update(
                pose.person_id, angles, reba, pose.bbox, in_zone,
                fall_risk=metrics.fall_risk_score,
            )

            epi_labels = epi_assoc.get(pose.person_id, [])
            event = self._decision.fuse(
                pose.person_id, posture_state, reba, zone_results, epi_labels
            )
            event.previous_posture = prev_category.value
            events.append(event)
```

A leitura de `prev_state.category` para uma variável local acontece **antes** do `update()`, que é o que garante que o valor não seja sobrescrito.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_tracker.py -q
```

Esperado: PASSA, 2 testes.

- [ ] **Step 5: Confirmar que a suíte existente continua verde**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/ -q
```

Esperado: PASSA — os 89 testes de REBA e classificador mais os 2 novos.

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/fusion/engine.py src/fusion/pipeline.py tests/test_incident_tracker.py
git commit -m "feat(fusion): expoe a postura confirmada do frame anterior no evento"
```

---

## Task 2: Contrato do incidente

**Files:**
- Create: `src/notify/__init__.py`
- Create: `src/notify/incident.py`
- Test: `tests/test_incident_report.py`

**Interfaces:**
- Consumes: `PersonEvent` (Task 1).
- Produces:
  - `POSTURE_TO_TYPE: dict[str, str]` — `immediate_risk`→`FALL_RISK`, `ergonomically_inadequate`→`ERGONOMIC_RISK`, `critical_zone`→`ZONE_VIOLATION`.
  - `ClosedReason` — constantes `STATE_EXIT`, `ESCALATED`, `TRACK_LOST`, `PIPELINE_STOPPED`.
  - `IncidentReport` — dataclass com `incident_key, camera_id, run_id, track_id, type, severity, reason, posture_category, reba_score, action_level, zone_name, zone_status, epi_present, epi_missing, detected_at, snapshot_url, ended_at, duration_seconds, peak_severity, closed_reason`.
  - `IncidentReport.open_payload() -> dict`, `IncidentReport.close_payload() -> dict`.
  - `build_incident_key(camera_id, run_id, track_id, detected_at) -> str`.

`track_id` é um id do ByteTrack que reinicia a cada execução, então sozinho não identifica ninguém. A chave composta com `run_id` é o que torna a idempotência confiável (spec §3.2).

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_incident_report.py`:

```python
"""
Testes do contrato do incidente (src/notify/incident.py).

O que está sendo protegido: a chave de idempotência e o formato exato dos dois
payloads. Um erro aqui não quebra o pipeline — ele produz alerta duplicado ou
campo silenciosamente ausente no painel, que é pior porque não faz barulho.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from src.notify.incident import (
    POSTURE_TO_TYPE,
    ClosedReason,
    IncidentReport,
    build_incident_key,
)

BRT = timezone(timedelta(hours=-3))
INSTANTE = datetime(2026, 8, 10, 14, 31, 2, 482000, tzinfo=BRT)


def relatorio(**overrides) -> IncidentReport:
    base = dict(
        incident_key="CAM-01:run-a:track-7:20260810T173102482Z",
        camera_id="CAM-01",
        run_id="run-a",
        track_id=7,
        type="FALL_RISK",
        severity=4,
        reason="fallen_sustained",
        posture_category="immediate_risk",
        reba_score=11,
        action_level=4,
        zone_name=None,
        zone_status="outside",
        epi_present=["HELMET", "VEST"],
        epi_missing=[],
        detected_at=INSTANTE,
    )
    base.update(overrides)
    return IncidentReport(**base)


def test_categorias_mapeiam_para_tipos_de_incidente():
    assert POSTURE_TO_TYPE["immediate_risk"] == "FALL_RISK"
    assert POSTURE_TO_TYPE["ergonomically_inadequate"] == "ERGONOMIC_RISK"
    assert POSTURE_TO_TYPE["critical_zone"] == "ZONE_VIOLATION"


def test_categoria_normal_nao_tem_tipo():
    assert "normal" not in POSTURE_TO_TYPE


def test_chave_combina_camera_execucao_track_e_instante():
    chave = build_incident_key("CAM-01", "run-a", 7, INSTANTE)

    assert chave.startswith("CAM-01:run-a:track-7:")
    # Instante normalizado em UTC, sem separadores: 14:31:02.482-03:00 = 17:31:02.482Z
    assert chave.endswith(":20260810T173102482Z")


def test_chaves_de_execucoes_diferentes_nao_colidem():
    a = build_incident_key("CAM-01", "run-a", 7, INSTANTE)
    b = build_incident_key("CAM-01", "run-b", 7, INSTANTE)

    assert a != b


def test_payload_de_abertura_traz_o_contrato_completo():
    payload = relatorio().open_payload()

    assert payload["incidentKey"] == "CAM-01:run-a:track-7:20260810T173102482Z"
    assert payload["cameraId"] == "CAM-01"
    assert payload["runId"] == "run-a"
    assert payload["trackId"] == 7
    assert payload["type"] == "FALL_RISK"
    assert payload["severity"] == 4
    assert payload["reason"] == "fallen_sustained"
    assert payload["postureCategory"] == "immediate_risk"
    assert payload["rebaScore"] == 11
    assert payload["actionLevel"] == 4
    assert payload["zoneName"] is None
    assert payload["zoneStatus"] == "outside"
    assert payload["epiPresent"] == ["HELMET", "VEST"]
    assert payload["epiMissing"] == []
    assert payload["snapshotUrl"] is None
    assert payload["detectedAt"] == "2026-08-10T14:31:02.482000-03:00"


def test_payload_de_abertura_nao_leva_dados_de_fechamento():
    payload = relatorio(ended_at=INSTANTE, duration_seconds=6.6).open_payload()

    assert "endedAt" not in payload
    assert "durationSeconds" not in payload


def test_payload_de_fechamento_leva_apenas_o_que_esta_preenchido():
    rel = relatorio(
        ended_at=INSTANTE + timedelta(seconds=6.6),
        duration_seconds=6.6,
        peak_severity=4,
        closed_reason=ClosedReason.STATE_EXIT,
    )

    payload = rel.close_payload()

    assert payload["durationSeconds"] == 6.6
    assert payload["peakSeverity"] == 4
    assert payload["closedReason"] == "STATE_EXIT"
    assert payload["endedAt"].startswith("2026-08-10T14:31:09")
    assert "snapshotUrl" not in payload


def test_payload_de_fechamento_serve_ao_snapshot_atrasado():
    payload = relatorio(snapshot_url="https://cdn/snap.jpg").close_payload()

    assert payload == {"snapshotUrl": "https://cdn/snap.jpg"}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_report.py -q
```

Esperado: FALHA — `ModuleNotFoundError: No module named 'src.notify'`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/notify/__init__.py`:

```python
"""Emissão de incidentes e stream de vídeo ao vivo (Fase 3)."""

from .incident import ClosedReason, IncidentReport, POSTURE_TO_TYPE, build_incident_key

__all__ = [
    "ClosedReason",
    "IncidentReport",
    "POSTURE_TO_TYPE",
    "build_incident_key",
]
```

Criar `src/notify/incident.py`:

```python
"""
Contrato do incidente: o que sai daqui é exatamente o que a API recebe.

Este é o único módulo que conhece os nomes de campo do fio (camelCase); o
restante do pacote trabalha com o dataclass.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

# Categoria de postura -> tipo de incidente (spec §3.4).
# "normal" não aparece: não gera incidente.
POSTURE_TO_TYPE: dict[str, str] = {
    "immediate_risk": "FALL_RISK",
    "ergonomically_inadequate": "ERGONOMIC_RISK",
    "critical_zone": "ZONE_VIOLATION",
}


class ClosedReason:
    """Por que o episódio foi encerrado.

    TRACK_LOST e PIPELINE_STOPPED indicam duração de confiança menor: o risco
    pode não ter cessado, o sistema é que deixou de observar.
    """

    STATE_EXIT = "STATE_EXIT"
    ESCALATED = "ESCALATED"
    TRACK_LOST = "TRACK_LOST"
    PIPELINE_STOPPED = "PIPELINE_STOPPED"


def build_incident_key(camera_id: str, run_id: str, track_id: int,
                       detected_at: datetime) -> str:
    """Chave de idempotência.

    track_id é um id do ByteTrack que reinicia a cada execução do pipeline, por
    isso sozinho não identifica ninguém; run_id é o que a torna estável.
    O instante é normalizado em UTC para que a chave não dependa do fuso do
    host que a gerou.
    """
    instante = detected_at.astimezone(timezone.utc)
    carimbo = instante.strftime("%Y%m%dT%H%M%S") + f"{instante.microsecond // 1000:03d}Z"
    return f"{camera_id}:{run_id}:track-{track_id}:{carimbo}"


@dataclass
class IncidentReport:
    """Um episódio de risco, do alarme confirmado até o encerramento."""

    incident_key: str
    camera_id: str
    run_id: str
    track_id: int
    type: str
    severity: int
    reason: str
    posture_category: str
    zone_status: str
    detected_at: datetime
    reba_score: int = 1
    action_level: int = 1
    zone_name: Optional[str] = None
    epi_present: list[str] = field(default_factory=list)
    epi_missing: list[str] = field(default_factory=list)
    snapshot_url: Optional[str] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    peak_severity: Optional[int] = None
    closed_reason: Optional[str] = None

    def open_payload(self) -> dict:
        """Corpo do POST de abertura. Nunca carrega dados de fechamento."""
        return {
            "incidentKey": self.incident_key,
            "cameraId": self.camera_id,
            "runId": self.run_id,
            "trackId": self.track_id,
            "type": self.type,
            "severity": self.severity,
            "reason": self.reason,
            "postureCategory": self.posture_category,
            "rebaScore": self.reba_score,
            "actionLevel": self.action_level,
            "zoneName": self.zone_name,
            "zoneStatus": self.zone_status,
            "epiPresent": list(self.epi_present),
            "epiMissing": list(self.epi_missing),
            "detectedAt": self.detected_at.isoformat(),
            "snapshotUrl": self.snapshot_url,
        }

    def close_payload(self) -> dict:
        """Corpo do PATCH.

        Só os campos preenchidos entram: o mesmo endpoint serve ao fechamento
        do episódio e à chegada tardia do snapshot, e enviar ``None`` apagaria
        o que já foi gravado.
        """
        payload: dict = {}
        if self.ended_at is not None:
            payload["endedAt"] = self.ended_at.isoformat()
        if self.duration_seconds is not None:
            payload["durationSeconds"] = self.duration_seconds
        if self.peak_severity is not None:
            payload["peakSeverity"] = self.peak_severity
        if self.closed_reason is not None:
            payload["closedReason"] = self.closed_reason
        if self.snapshot_url is not None:
            payload["snapshotUrl"] = self.snapshot_url
        return payload
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_report.py -q
```

Esperado: PASSA, 8 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/notify/__init__.py src/notify/incident.py tests/test_incident_report.py
git commit -m "feat(notify): contrato do incidente com chave idempotente e payloads"
```

---

## Task 3: Abertura, fechamento e janela de merge

**Files:**
- Create: `src/notify/tracker.py`
- Test: `tests/test_incident_tracker.py` (acrescenta aos 2 casos da Task 1)

**Interfaces:**
- Consumes: `IncidentReport`, `POSTURE_TO_TYPE`, `ClosedReason`, `build_incident_key` (Task 2); `PersonEvent` (Task 1).
- Produces:
  - `TrackerConfig(camera_id, run_id, min_severity=2, merge_window_seconds=15.0, evict_after_frames=45, min_track_frames=15, fps=15.0)`.
  - `IncidentTracker(config, on_open, on_close)` — as duas funções recebem um `IncidentReport`.
  - `IncidentTracker.process(events: list[PersonEvent], now: datetime) -> None`.
  - `IncidentTracker.flush(now: datetime) -> None`.
  - `IncidentTracker.open_incidents() -> dict[tuple[int, str], IncidentReport]`.

Sem janela de merge, as 2 quedas reais de `cenario2.mp4` produzem 10 incidentes — medido, não estimado. A causa não é churn de id do ByteTrack: é o mesmo track reentrando em alarme depois que a histerese solta para `normal`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/test_incident_tracker.py`, depois dos dois testes existentes:

```python
from datetime import datetime, timedelta, timezone

import pytest

from src.notify.incident import ClosedReason
from src.notify.tracker import IncidentTracker, TrackerConfig

BRT = timezone(timedelta(hours=-3))
T0 = datetime(2026, 8, 10, 14, 0, 0, tzinfo=BRT)


class Coletor:
    """Guarda o que o tracker abriu e fechou, na ordem."""

    def __init__(self) -> None:
        self.abertos: list = []
        self.fechados: list = []

    def on_open(self, relatorio):
        self.abertos.append(relatorio)

    def on_close(self, relatorio):
        self.fechados.append(relatorio)


def montar(**overrides):
    coletor = Coletor()
    config = TrackerConfig(camera_id="CAM-01", run_id="run-t", **overrides)
    return IncidentTracker(config, coletor.on_open, coletor.on_close), coletor


def evento(person_id: int, postura: str, anterior: str, severidade: int = 4) -> PersonEvent:
    return PersonEvent(
        person_id=person_id,
        posture=postura,
        previous_posture=anterior,
        severity=severidade,
        reason="fallen_sustained",
    )


def aquecer(tracker, person_id: int, frames: int, quando: datetime) -> None:
    """Dá vida suficiente ao track para passar pelo guard de min_track_frames."""
    for _ in range(frames):
        tracker.process([evento(person_id, "normal", "normal", severidade=0)], quando)


def test_transicao_para_alarme_abre_incidente():
    tracker, coletor = montar()
    aquecer(tracker, 1, 20, T0)

    tracker.process([evento(1, "immediate_risk", "normal")], T0)

    assert len(coletor.abertos) == 1
    assert coletor.abertos[0].type == "FALL_RISK"
    assert coletor.abertos[0].severity == 4


def test_alarme_sustentado_nao_reabre_a_cada_frame():
    tracker, coletor = montar()
    aquecer(tracker, 1, 20, T0)
    tracker.process([evento(1, "immediate_risk", "normal")], T0)

    for i in range(30):
        tracker.process([evento(1, "immediate_risk", "immediate_risk")],
                        T0 + timedelta(seconds=i * 0.05))

    assert len(coletor.abertos) == 1
    assert coletor.fechados == []


def test_volta_ao_normal_fecha_com_duracao_e_pico():
    tracker, coletor = montar()
    aquecer(tracker, 1, 20, T0)
    tracker.process([evento(1, "immediate_risk", "normal", severidade=3)], T0)
    tracker.process([evento(1, "immediate_risk", "immediate_risk", severidade=4)],
                    T0 + timedelta(seconds=2))

    tracker.process([evento(1, "normal", "immediate_risk", severidade=0)],
                    T0 + timedelta(seconds=5))

    assert len(coletor.fechados) == 1
    fechado = coletor.fechados[0]
    assert fechado.duration_seconds == pytest.approx(5.0)
    assert fechado.peak_severity == 4       # pico, não a severidade de abertura
    assert fechado.closed_reason == ClosedReason.STATE_EXIT


def test_reentrada_dentro_da_janela_reabre_o_mesmo_incidente():
    tracker, coletor = montar(merge_window_seconds=15.0)
    aquecer(tracker, 1, 20, T0)
    tracker.process([evento(1, "immediate_risk", "normal")], T0)
    tracker.process([evento(1, "normal", "immediate_risk", severidade=0)],
                    T0 + timedelta(seconds=3))

    tracker.process([evento(1, "immediate_risk", "normal")], T0 + timedelta(seconds=10))

    assert len(coletor.abertos) == 1        # não abriu um segundo
    assert tracker.open_incidents()


def test_reentrada_fora_da_janela_abre_incidente_novo():
    tracker, coletor = montar(merge_window_seconds=15.0)
    aquecer(tracker, 1, 20, T0)
    tracker.process([evento(1, "immediate_risk", "normal")], T0)
    tracker.process([evento(1, "normal", "immediate_risk", severidade=0)],
                    T0 + timedelta(seconds=3))

    tracker.process([evento(1, "immediate_risk", "normal")], T0 + timedelta(seconds=40))

    assert len(coletor.abertos) == 2


def test_escalacao_fecha_um_tipo_e_abre_o_outro():
    tracker, coletor = montar()
    aquecer(tracker, 1, 20, T0)
    tracker.process([evento(1, "ergonomically_inadequate", "normal", severidade=2)], T0)

    tracker.process([evento(1, "immediate_risk", "ergonomically_inadequate")],
                    T0 + timedelta(seconds=2))

    assert [r.type for r in coletor.abertos] == ["ERGONOMIC_RISK", "FALL_RISK"]
    assert coletor.fechados[0].type == "ERGONOMIC_RISK"
    assert coletor.fechados[0].closed_reason == ClosedReason.ESCALATED


def test_severidade_abaixo_do_limiar_nao_abre_incidente():
    tracker, coletor = montar(min_severity=3)
    aquecer(tracker, 1, 20, T0)

    tracker.process([evento(1, "ergonomically_inadequate", "normal", severidade=2)], T0)

    assert coletor.abertos == []


def test_track_muito_novo_nao_abre_incidente():
    tracker, coletor = montar(min_track_frames=15)

    # Só 3 frames de vida: o ByteTrack produz tracks espúrios curtos.
    aquecer(tracker, 4, 3, T0)
    tracker.process([evento(4, "immediate_risk", "normal")], T0)

    assert coletor.abertos == []


def test_incidentes_de_tracks_diferentes_sao_independentes():
    tracker, coletor = montar()
    aquecer(tracker, 1, 20, T0)
    aquecer(tracker, 2, 20, T0)

    tracker.process([
        evento(1, "immediate_risk", "normal"),
        evento(2, "ergonomically_inadequate", "normal", severidade=2),
    ], T0)

    assert len(coletor.abertos) == 2
    assert {r.track_id for r in coletor.abertos} == {1, 2}
```

Acrescentar `from src.fusion.engine import PersonEvent` já está no topo do arquivo desde a Task 1.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_tracker.py -q
```

Esperado: FALHA — `ModuleNotFoundError: No module named 'src.notify.tracker'`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/notify/tracker.py`:

```python
"""
Tradução de transições de estado em episódios.

A máquina de estados do classificador já existe e é testada; o que faltava era
expor suas transições como incidentes. Três coisas que este módulo faz e que
não são opcionais, porque foram medidas em cenario2.mp4 (spec §4.1.2):

  * janela de merge — sem ela, 2 quedas reais viram 10 incidentes;
  * eviction de track sumido — sem ela, 2 incidentes ficam abertos para sempre;
  * guard de idade do track — o ByteTrack produz tracks espúrios de poucos
    frames, e um deles abriria um FALL_RISK a 3 frames do fim do vídeo.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Optional

from ..fusion.engine import PersonEvent
from .incident import (
    POSTURE_TO_TYPE,
    ClosedReason,
    IncidentReport,
    build_incident_key,
)

Handler = Callable[[IncidentReport], None]

# Chave de um episódio em curso: o par (track, tipo). O mesmo track pode ter
# um FALL_RISK e um ERGONOMIC_RISK em momentos distintos.
IncidentKey = tuple[int, str]


@dataclass
class TrackerConfig:
    camera_id: str
    run_id: str
    min_severity: int = 2
    merge_window_seconds: float = 15.0
    evict_after_frames: int = 45
    min_track_frames: int = 15
    fps: float = 15.0


class IncidentTracker:
    """Converte eventos por frame em incidentes com início e fim."""

    def __init__(self, config: TrackerConfig,
                 on_open: Handler, on_close: Handler) -> None:
        self.config = config
        self._on_open = on_open
        self._on_close = on_close
        self._open: dict[IncidentKey, IncidentReport] = {}
        self._last_close: dict[IncidentKey, datetime] = {}
        self._frames_seen: dict[int, int] = {}
        self._last_frame_seen: dict[int, int] = {}
        self._frame_idx = 0

    # ------------------------------------------------------------------
    # Laço principal
    # ------------------------------------------------------------------

    def process(self, events: list[PersonEvent], now: datetime) -> None:
        self._frame_idx += 1

        for event in events:
            self._frames_seen[event.person_id] = self._frames_seen.get(event.person_id, 0) + 1
            self._last_frame_seen[event.person_id] = self._frame_idx
            self._handle(event, now)

        self._evict_lost_tracks(now)

    def flush(self, now: datetime) -> None:
        """Fecha tudo o que restou aberto. Chamado no encerramento do pipeline.

        Sem isto, toda execução deixa incidentes órfãos: um trabalhador que cai
        e é retirado do quadro ficaria no painel como FALL_RISK eternamente
        aberto, sem duração e sem severidade de pico.
        """
        for key in list(self._open):
            self._close(key, now, ClosedReason.PIPELINE_STOPPED)

    def open_incidents(self) -> dict[IncidentKey, IncidentReport]:
        return dict(self._open)

    # ------------------------------------------------------------------
    # Transições
    # ------------------------------------------------------------------

    def _handle(self, event: PersonEvent, now: datetime) -> None:
        atual = POSTURE_TO_TYPE.get(event.posture)
        anterior = POSTURE_TO_TYPE.get(event.previous_posture)

        if atual == anterior:
            if atual is not None:
                self._update_peak(event, atual)
            return

        if anterior is not None:
            motivo = ClosedReason.ESCALATED if atual else ClosedReason.STATE_EXIT
            self._close((event.person_id, anterior), now, motivo)

        if atual is not None:
            self._open_or_merge(event, atual, now)

    def _update_peak(self, event: PersonEvent, tipo: str) -> None:
        relatorio = self._open.get((event.person_id, tipo))
        if relatorio is None:
            return
        # A severidade do frame de abertura raramente é a pior do episódio.
        if event.severity > (relatorio.peak_severity or relatorio.severity):
            relatorio.peak_severity = event.severity

    def _open_or_merge(self, event: PersonEvent, tipo: str, now: datetime) -> None:
        if event.severity < self.config.min_severity:
            return
        if self._frames_seen.get(event.person_id, 0) < self.config.min_track_frames:
            return

        key = (event.person_id, tipo)

        fechado_em = self._last_close.get(key)
        if fechado_em is not None:
            desde = (now - fechado_em).total_seconds()
            if desde <= self.config.merge_window_seconds:
                # Reabre o mesmo episódio: o alarme oscilou, não recomeçou.
                anterior = self._merged.pop(key, None)
                if anterior is not None:
                    anterior.ended_at = None
                    anterior.duration_seconds = None
                    anterior.closed_reason = None
                    self._open[key] = anterior
                    self._update_peak(event, tipo)
                    return

        relatorio = IncidentReport(
            incident_key=build_incident_key(
                self.config.camera_id, self.config.run_id, event.person_id, now),
            camera_id=self.config.camera_id,
            run_id=self.config.run_id,
            track_id=event.person_id,
            type=tipo,
            severity=event.severity,
            reason=event.reason,
            posture_category=event.posture,
            zone_status=event.zone_status,
            zone_name=event.zone_name,
            reba_score=event.reba_score,
            action_level=event.action_level,
            epi_present=list(event.epi_present),
            epi_missing=list(event.epi_violations),
            detected_at=now,
            peak_severity=event.severity,
        )
        self._open[key] = relatorio
        self._on_open(relatorio)

    def _close(self, key: IncidentKey, now: datetime, motivo: str) -> None:
        relatorio = self._open.pop(key, None)
        if relatorio is None:
            return
        relatorio.ended_at = now
        relatorio.duration_seconds = (now - relatorio.detected_at).total_seconds()
        relatorio.closed_reason = motivo
        self._last_close[key] = now
        self._merged[key] = relatorio
        self._on_close(relatorio)

    def _evict_lost_tracks(self, now: datetime) -> None:
        """Fecha episódios de tracks que sumiram do quadro.

        As transições dependem de o classificador ser chamado de novo para
        aquele person_id. Se a pessoa sai do quadro ou o ByteTrack perde o id
        sob oclusão, isso nunca acontece.
        """
        limite = self._frame_idx - self.config.evict_after_frames
        for key in list(self._open):
            track_id, _ = key
            if self._last_frame_seen.get(track_id, 0) <= limite:
                self._close(key, now, ClosedReason.TRACK_LOST)
```

Falta declarar `self._merged` no `__init__`, junto dos outros dicionários — ele guarda os relatórios já fechados que ainda estão dentro da janela de merge:

```python
        self._merged: dict[IncidentKey, IncidentReport] = {}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_tracker.py -q
```

Esperado: PASSA, 11 testes (2 da Task 1 + 9 desta).

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/notify/tracker.py tests/test_incident_tracker.py
git commit -m "feat(notify): tracker de incidentes com janela de merge e severidade de pico"
```

---

## Task 4: Eviction, flush e regressão sobre dados reais

**Files:**
- Create: `tests/fixtures/cenario2_transitions.json`
- Test: `tests/test_incident_tracker.py` (acrescenta)

**Interfaces:**
- Consumes: `IncidentTracker`, `TrackerConfig` (Task 3).
- Produces: nenhuma interface nova — trava o comportamento medido.

O log abaixo é o resultado real de rodar o pipeline sobre `data/validation/cenario2.mp4` (1331 frames, ~30 fps, **2 quedas reais**, o mesmo clipe cujo ground truth mede recall 0,986). Vira fixture para que uma mudança futura de threshold não desfaça a calibração em silêncio.

- [ ] **Step 1: Criar a fixture**

Criar `tests/fixtures/cenario2_transitions.json`:

```json
{
  "video": "data/validation/cenario2.mp4",
  "total_frames": 1331,
  "fps": 30.0,
  "quedas_reais": 2,
  "transitions": [
    {"frame": 19,   "track": 1, "from": "normal",                   "to": "immediate_risk"},
    {"frame": 120,  "track": 1, "from": "immediate_risk",           "to": "normal"},
    {"frame": 305,  "track": 1, "from": "normal",                   "to": "immediate_risk"},
    {"frame": 327,  "track": 1, "from": "immediate_risk",           "to": "ergonomically_inadequate"},
    {"frame": 329,  "track": 1, "from": "ergonomically_inadequate", "to": "immediate_risk"},
    {"frame": 349,  "track": 1, "from": "immediate_risk",           "to": "ergonomically_inadequate"},
    {"frame": 405,  "track": 1, "from": "ergonomically_inadequate", "to": "normal"},
    {"frame": 696,  "track": 1, "from": "normal",                   "to": "immediate_risk"},
    {"frame": 863,  "track": 1, "from": "immediate_risk",           "to": "normal"},
    {"frame": 881,  "track": 1, "from": "normal",                   "to": "immediate_risk"},
    {"frame": 969,  "track": 1, "from": "immediate_risk",           "to": "normal"},
    {"frame": 1030, "track": 1, "from": "normal",                   "to": "immediate_risk"},
    {"frame": 1264, "track": 1, "from": "immediate_risk",           "to": "normal"},
    {"frame": 1270, "track": 1, "from": "normal",                   "to": "immediate_risk"},
    {"frame": 1328, "track": 4, "from": "normal",                   "to": "immediate_risk"}
  ],
  "vida_dos_tracks": {"1": 1307, "2": 1, "4": 12}
}
```

- [ ] **Step 2: Escrever o teste que falha**

Acrescentar a `tests/test_incident_tracker.py`:

```python
import json
from pathlib import Path

FIXTURE = Path(__file__).parent / "fixtures" / "cenario2_transitions.json"


def _reproduzir_cenario2(**overrides):
    """Replica o log medido de cenario2.mp4 através do tracker.

    Cada frame do vídeo vira uma chamada a process(); os frames sem transição
    repetem a categoria vigente, que é o que o pipeline real produz.
    """
    dados = json.loads(FIXTURE.read_text())
    fps = dados["fps"]
    por_frame = {t["frame"]: t for t in dados["transitions"]}
    vida = {int(k): v for k, v in dados["vida_dos_tracks"].items()}

    tracker, coletor = montar(fps=fps, merge_window_seconds=15.0,
                              min_track_frames=15, evict_after_frames=45,
                              **overrides)

    # Frame em que cada track aparece pela primeira vez, deduzido da vida dele.
    primeiro_frame = {tid: dados["total_frames"] - v + 1 for tid, v in vida.items()}
    categoria = {tid: "normal" for tid in vida}

    for frame in range(1, dados["total_frames"] + 1):
        agora = T0 + timedelta(seconds=frame / fps)
        eventos = []
        for tid in vida:
            if frame < primeiro_frame[tid]:
                continue
            anterior = categoria[tid]
            transicao = por_frame.get(frame)
            if transicao is not None and transicao["track"] == tid:
                categoria[tid] = transicao["to"]
            severidade = 0 if categoria[tid] == "normal" else 4
            eventos.append(evento(tid, categoria[tid], anterior, severidade))
        tracker.process(eventos, agora)

    tracker.flush(T0 + timedelta(seconds=dados["total_frames"] / fps))
    return tracker, coletor


def test_cenario2_produz_dois_incidentes_para_duas_quedas():
    _, coletor = _reproduzir_cenario2()

    tipos = sorted(r.type for r in coletor.abertos)
    assert tipos == ["ERGONOMIC_RISK", "FALL_RISK"]


def test_cenario2_nao_deixa_incidente_orfao():
    tracker, coletor = _reproduzir_cenario2()

    assert tracker.open_incidents() == {}
    assert len(coletor.fechados) >= len(coletor.abertos)


def test_cenario2_fecha_o_ultimo_episodio_como_pipeline_parado():
    _, coletor = _reproduzir_cenario2()

    ultimo = coletor.fechados[-1]
    assert ultimo.closed_reason == ClosedReason.PIPELINE_STOPPED


def test_sem_janela_de_merge_o_mesmo_clipe_explode_em_alertas():
    """Prova que a janela não é enfeite: sem ela, o painel vira rajada."""
    _, com_janela = _reproduzir_cenario2()
    _, sem_janela = _reproduzir_cenario2(merge_window_seconds=0.0)

    assert len(sem_janela.abertos) > len(com_janela.abertos)


def test_track_espurio_de_doze_frames_nao_vira_incidente():
    _, coletor = _reproduzir_cenario2()

    # O track 4 vive 12 frames e abriria um FALL_RISK a 3 frames do fim.
    assert all(r.track_id != 4 for r in coletor.abertos)


def test_eviction_fecha_track_que_some_do_quadro():
    tracker, coletor = montar(evict_after_frames=10)
    aquecer(tracker, 1, 20, T0)
    tracker.process([evento(1, "immediate_risk", "normal")], T0)

    # Ninguém mais reporta o track 1: a pessoa saiu do quadro.
    for i in range(15):
        tracker.process([], T0 + timedelta(seconds=1 + i * 0.05))

    assert len(coletor.fechados) == 1
    assert coletor.fechados[0].closed_reason == ClosedReason.TRACK_LOST
    assert tracker.open_incidents() == {}


def test_flush_fecha_o_que_restou_aberto():
    tracker, coletor = montar()
    aquecer(tracker, 1, 20, T0)
    tracker.process([evento(1, "immediate_risk", "normal")], T0)

    tracker.flush(T0 + timedelta(seconds=4))

    assert len(coletor.fechados) == 1
    assert coletor.fechados[0].closed_reason == ClosedReason.PIPELINE_STOPPED
    assert coletor.fechados[0].duration_seconds == pytest.approx(4.0)
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_tracker.py -q
```

Esperado: FALHA nos casos de `cenario2` (`TrackerConfig` ainda não aceita `fps` como override em `montar`, e o helper `montar` precisa repassá-lo) — a correção faz parte do passo seguinte.

- [ ] **Step 4: Ajustar o helper e confirmar que passa**

O helper `montar` da Task 3 já repassa `**overrides` para `TrackerConfig`, que tem campo `fps`. Se o erro for outro, corrigir a implementação de `tracker.py` — não a fixture nem as asserções, que refletem medição real.

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_tracker.py -q
```

Esperado: PASSA, 18 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add tests/fixtures/cenario2_transitions.json tests/test_incident_tracker.py src/notify/tracker.py
git commit -m "test(notify): trava o ciclo de vida contra o log medido de cenario2"
```

---

## Task 5: Envio assíncrono com fila, retry e spill

**Files:**
- Create: `src/notify/sink.py`
- Test: `tests/test_incident_sink.py`

**Interfaces:**
- Consumes: `IncidentReport` (Task 2).
- Produces:
  - `ConsoleIncidentSink` — imprime, comportamento padrão sem API configurada.
  - `HttpIncidentSink(api_url, queue_size=256, spill_path=..., max_attempts=5, backoff_base=0.5, transport=None)`.
  - `HttpIncidentSink.open(IncidentReport)`, `.close(IncidentReport)`, `.start()`, `.stop(timeout=5.0)`, `.pending()`, `.dropped()`.
  - `Transport` — protocolo com `post(url, payload) -> None` e `patch(url, payload) -> None`; a implementação padrão usa `requests`.

Fila cheia descarta o item de **menor** severidade, nunca o mais recente: um incidente de queda jamais deve ser perdido por causa de um backlog de alertas ergonômicos. Isso exige política de descarte própria, já que `queue.Queue` só sabe bloquear ou levantar `Full`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_incident_sink.py`:

```python
"""
Testes do envio de incidentes (src/notify/sink.py).

O que está sendo protegido: que nenhum incidente grave se perca. A API pode
cair, a rede pode engasgar e a fila pode encher — em nenhum desses casos uma
queda pode desaparecer em silêncio.

Nenhum teste aqui toca a rede: o transporte é injetado.
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta, timezone

import pytest

from src.notify.incident import ClosedReason, IncidentReport
from src.notify.sink import HttpIncidentSink

BRT = timezone(timedelta(hours=-3))
T0 = datetime(2026, 8, 10, 14, 0, 0, tzinfo=BRT)


def relatorio(chave: str, severidade: int = 4) -> IncidentReport:
    return IncidentReport(
        incident_key=chave,
        camera_id="CAM-01",
        run_id="run-a",
        track_id=7,
        type="FALL_RISK",
        severity=severidade,
        reason="fallen_sustained",
        posture_category="immediate_risk",
        zone_status="outside",
        detected_at=T0,
        peak_severity=severidade,
    )


class TransporteFake:
    """Registra chamadas e falha sob demanda."""

    def __init__(self, falhas_ate: int = 0) -> None:
        self.posts: list[tuple[str, dict]] = []
        self.patches: list[tuple[str, dict]] = []
        self.falhas_ate = falhas_ate
        self.tentativas = 0
        self.entregou = threading.Event()

    def post(self, url: str, payload: dict) -> None:
        self.tentativas += 1
        if self.tentativas <= self.falhas_ate:
            raise ConnectionError("API indisponivel")
        self.posts.append((url, payload))
        self.entregou.set()

    def patch(self, url: str, payload: dict) -> None:
        self.patches.append((url, payload))
        self.entregou.set()


def test_envia_abertura_para_o_endpoint_de_incidentes():
    transporte = TransporteFake()
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte)
    sink.start()
    try:
        sink.open(relatorio("k1"))
        assert transporte.entregou.wait(timeout=2)
    finally:
        sink.stop()

    url, payload = transporte.posts[0]
    assert url == "http://api/api/v1/incidents"
    assert payload["incidentKey"] == "k1"
    assert payload["severity"] == 4


def test_envia_fechamento_para_o_endpoint_da_chave():
    transporte = TransporteFake()
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte)
    sink.start()
    try:
        rel = relatorio("k1")
        rel.ended_at = T0 + timedelta(seconds=6)
        rel.duration_seconds = 6.0
        rel.closed_reason = ClosedReason.STATE_EXIT
        sink.close(rel)
        assert transporte.entregou.wait(timeout=2)
    finally:
        sink.stop()

    url, payload = transporte.patches[0]
    assert url == "http://api/api/v1/incidents/k1"
    assert payload["durationSeconds"] == 6.0


def test_nao_bloqueia_quem_chama():
    """O laço de frames tem 200ms de orcamento: enfileirar precisa ser barato."""
    class TransporteLento:
        def post(self, url, payload):
            threading.Event().wait(0.5)

        def patch(self, url, payload):
            pass

    sink = HttpIncidentSink("http://api/api/v1", transport=TransporteLento())
    sink.start()
    try:
        import time
        inicio = time.perf_counter()
        sink.open(relatorio("k1"))
        decorrido = time.perf_counter() - inicio
    finally:
        sink.stop(timeout=1.0)

    assert decorrido < 0.05


def test_retenta_ate_entregar():
    transporte = TransporteFake(falhas_ate=2)
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte,
                            backoff_base=0.01)
    sink.start()
    try:
        sink.open(relatorio("k1"))
        assert transporte.entregou.wait(timeout=3)
    finally:
        sink.stop()

    assert transporte.tentativas == 3
    assert len(transporte.posts) == 1


def test_grava_em_disco_quando_desiste(tmp_path):
    spill = tmp_path / "incidents.jsonl"
    transporte = TransporteFake(falhas_ate=99)
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte,
                            spill_path=str(spill), max_attempts=2,
                            backoff_base=0.01)
    sink.start()
    try:
        sink.open(relatorio("k1"))
        for _ in range(100):
            if spill.exists() and spill.read_text().strip():
                break
            threading.Event().wait(0.05)
    finally:
        sink.stop()

    linhas = [json.loads(l) for l in spill.read_text().splitlines() if l.strip()]
    assert linhas[0]["payload"]["incidentKey"] == "k1"
    assert linhas[0]["kind"] == "open"


def test_drena_o_spill_na_subida(tmp_path):
    spill = tmp_path / "incidents.jsonl"
    spill.write_text(json.dumps({
        "kind": "open",
        "payload": relatorio("k-antigo").open_payload(),
    }) + "\n")

    transporte = TransporteFake()
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte,
                            spill_path=str(spill))
    sink.start()
    try:
        assert transporte.entregou.wait(timeout=2)
    finally:
        sink.stop()

    assert transporte.posts[0][1]["incidentKey"] == "k-antigo"
    assert spill.read_text().strip() == ""


def test_fila_cheia_descarta_o_menos_severo_e_nunca_a_queda():
    class TransporteTravado:
        def __init__(self):
            self.liberar = threading.Event()
            self.recebidos = []

        def post(self, url, payload):
            self.liberar.wait(timeout=5)
            self.recebidos.append(payload)

        def patch(self, url, payload):
            pass

    transporte = TransporteTravado()
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte,
                            queue_size=3)
    sink.start()
    try:
        sink.open(relatorio("ocupa-worker", severidade=2))
        sink.open(relatorio("baixa-a", severidade=1))
        sink.open(relatorio("baixa-b", severidade=1))
        sink.open(relatorio("media", severidade=2))
        sink.open(relatorio("queda", severidade=4))   # estoura a fila

        assert sink.dropped() >= 1
        chaves = {item.incident_key for item in sink.snapshot()}
        assert "queda" in chaves
    finally:
        transporte.liberar.set()
        sink.stop()
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_sink.py -q
```

Esperado: FALHA — `ModuleNotFoundError: No module named 'src.notify.sink'`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/notify/sink.py`:

```python
"""
Saída de incidentes.

O laço de frames tem 200 ms de orçamento e a medição atual é 45 ms p95: uma
chamada HTTP síncrona dentro dele consumiria toda a folga. Por isso enfileirar
é O(1) e todo o I/O acontece numa thread daemon.

"Vital" significa que perder um incidente importa, então o caminho de retry e
o spill em disco fazem parte do mínimo, não do refinamento.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Protocol

from .incident import IncidentReport

log = logging.getLogger(__name__)


class Transport(Protocol):
    def post(self, url: str, payload: dict) -> None: ...
    def patch(self, url: str, payload: dict) -> None: ...


class RequestsTransport:
    """Transporte real. Importa requests preguiçosamente para manter os
    testes livres da dependência."""

    def __init__(self, timeout: float = 5.0) -> None:
        self.timeout = timeout

    def post(self, url: str, payload: dict) -> None:
        import requests
        resposta = requests.post(url, json=payload, timeout=self.timeout)
        resposta.raise_for_status()

    def patch(self, url: str, payload: dict) -> None:
        import requests
        resposta = requests.patch(url, json=payload, timeout=self.timeout)
        resposta.raise_for_status()


class ConsoleIncidentSink:
    """Comportamento padrão sem API configurada: imprime e segue."""

    def open(self, relatorio: IncidentReport) -> None:
        print(f"\n[INCIDENTE ABERTO] {relatorio.incident_key} "
              f"tipo={relatorio.type} sev={relatorio.severity} :: {relatorio.reason}")

    def close(self, relatorio: IncidentReport) -> None:
        print(f"\n[INCIDENTE FECHADO] {relatorio.incident_key} "
              f"dur={relatorio.duration_seconds:.1f}s pico={relatorio.peak_severity} "
              f"motivo={relatorio.closed_reason}")

    def start(self) -> None:
        pass

    def stop(self, timeout: float = 5.0) -> None:
        pass


@dataclass
class _Item:
    kind: str                  # "open" | "close"
    incident_key: str
    severity: int
    payload: dict
    attempts: int = 0


class HttpIncidentSink:
    """Fila limitada + thread de envio, com retry e spill em disco."""

    def __init__(self, api_url: str,
                 queue_size: int = 256,
                 spill_path: str = "outputs/incidents.jsonl",
                 max_attempts: int = 5,
                 backoff_base: float = 0.5,
                 transport: Optional[Transport] = None) -> None:
        self.api_url = api_url.rstrip("/")
        self.queue_size = queue_size
        self.spill_path = Path(spill_path)
        self.max_attempts = max_attempts
        self.backoff_base = backoff_base
        self.transport = transport or RequestsTransport()

        self._items: list[_Item] = []
        self._lock = threading.Lock()
        self._nao_vazia = threading.Condition(self._lock)
        self._parar = threading.Event()
        self._worker: Optional[threading.Thread] = None
        self._dropped = 0

    # ------------------------------------------------------------------
    # API pública — chamada da thread do frame, precisa ser barata
    # ------------------------------------------------------------------

    def open(self, relatorio: IncidentReport) -> None:
        self._enfileirar(_Item("open", relatorio.incident_key,
                               relatorio.severity, relatorio.open_payload()))

    def close(self, relatorio: IncidentReport) -> None:
        payload = relatorio.close_payload()
        if not payload:
            return
        self._enfileirar(_Item("close", relatorio.incident_key,
                               relatorio.severity, payload))

    def start(self) -> None:
        self._drenar_spill()
        self._worker = threading.Thread(target=self._loop, name="incident-sink",
                                        daemon=True)
        self._worker.start()

    def stop(self, timeout: float = 5.0) -> None:
        self._parar.set()
        with self._nao_vazia:
            self._nao_vazia.notify_all()
        if self._worker is not None:
            self._worker.join(timeout=timeout)
        # O que não foi entregue vai para o disco em vez de sumir.
        with self._lock:
            restantes = list(self._items)
            self._items.clear()
        for item in restantes:
            self._gravar_spill(item)

    def pending(self) -> int:
        with self._lock:
            return len(self._items)

    def dropped(self) -> int:
        return self._dropped

    def snapshot(self) -> list[_Item]:
        with self._lock:
            return list(self._items)

    # ------------------------------------------------------------------
    # Interno
    # ------------------------------------------------------------------

    def _enfileirar(self, item: _Item) -> None:
        with self._nao_vazia:
            if len(self._items) >= self.queue_size:
                # Descarta o de MENOR severidade, nunca o mais recente: uma
                # queda não pode ser perdida por backlog de alerta ergonômico.
                indice = min(range(len(self._items)),
                             key=lambda i: self._items[i].severity)
                if self._items[indice].severity < item.severity:
                    descartado = self._items.pop(indice)
                    self._gravar_spill(descartado)
                else:
                    self._gravar_spill(item)
                    self._dropped += 1
                    log.warning("Fila cheia: incidente %s gravado em disco (descartes=%d)",
                                item.incident_key, self._dropped)
                    return
                self._dropped += 1
            self._items.append(item)
            self._nao_vazia.notify()

    def _loop(self) -> None:
        while not self._parar.is_set():
            with self._nao_vazia:
                while not self._items and not self._parar.is_set():
                    self._nao_vazia.wait(timeout=0.2)
                if self._parar.is_set() and not self._items:
                    return
                item = self._items.pop(0)
            self._entregar(item)

    def _entregar(self, item: _Item) -> None:
        while item.attempts < self.max_attempts and not self._parar.is_set():
            item.attempts += 1
            try:
                if item.kind == "open":
                    self.transport.post(f"{self.api_url}/incidents", item.payload)
                else:
                    self.transport.patch(
                        f"{self.api_url}/incidents/{item.incident_key}", item.payload)
                return
            except Exception as falha:
                if item.attempts >= self.max_attempts:
                    log.warning("Incidente %s nao entregue apos %d tentativas: %s",
                                item.incident_key, item.attempts, falha)
                    self._gravar_spill(item)
                    return
                time.sleep(self.backoff_base * (2 ** (item.attempts - 1)))

    def _gravar_spill(self, item: _Item) -> None:
        try:
            self.spill_path.parent.mkdir(parents=True, exist_ok=True)
            with self.spill_path.open("a") as arquivo:
                arquivo.write(json.dumps({
                    "kind": item.kind,
                    "incident_key": item.incident_key,
                    "severity": item.severity,
                    "payload": item.payload,
                }) + "\n")
        except OSError as erro:
            log.error("Falha ao gravar spill de %s: %s", item.incident_key, erro)

    def _drenar_spill(self) -> None:
        """Reenfileira o que ficou pendente de uma execução anterior."""
        if not self.spill_path.exists():
            return
        linhas = [l for l in self.spill_path.read_text().splitlines() if l.strip()]
        self.spill_path.write_text("")
        for linha in linhas:
            try:
                registro = json.loads(linha)
            except json.JSONDecodeError:
                continue
            self._enfileirar(_Item(registro["kind"], registro.get("incident_key", ""),
                                   registro.get("severity", 0), registro["payload"]))
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_sink.py -q
```

Esperado: PASSA, 7 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/notify/sink.py tests/test_incident_sink.py
git commit -m "feat(notify): envio assincrono com retry, spill em disco e descarte por severidade"
```

---

## Task 6: Vídeo ao vivo por MJPEG

**Files:**
- Create: `src/notify/mjpeg.py`
- Test: `tests/test_mjpeg.py`

**Interfaces:**
- Consumes: nada.
- Produces: `MjpegServer(port=8090, quality=80)`, `.start()`, `.stop()`, `.publish(frame)`, `.has_frame()`, `.port`.

O pipeline só executa `publish(annotated)` ao final de `process_frame` — uma atribuição sob lock. Sem cliente conectado, nenhum JPEG é codificado: a codificação acontece na thread do servidor, não na do frame.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_mjpeg.py`:

```python
"""
Testes do servidor de vídeo ao vivo (src/notify/mjpeg.py).

O que está sendo protegido: que publicar um frame seja barato e que o servidor
não derrube o pipeline quando ninguém está assistindo — ou quando o browser
desconecta no meio do stream.
"""
from __future__ import annotations

import urllib.request

import numpy as np
import pytest

from src.notify.mjpeg import MjpegServer


@pytest.fixture
def servidor():
    srv = MjpegServer(port=0)
    srv.start()
    yield srv
    srv.stop()


def frame_de_teste() -> np.ndarray:
    return np.zeros((48, 64, 3), dtype=np.uint8)


def test_sobe_numa_porta_efemera(servidor):
    assert servidor.port > 0


def test_comeca_sem_frame(servidor):
    assert servidor.has_frame() is False


def test_publicar_e_barato_e_nao_codifica(servidor):
    import time

    inicio = time.perf_counter()
    for _ in range(200):
        servidor.publish(frame_de_teste())
    decorrido = time.perf_counter() - inicio

    assert servidor.has_frame() is True
    # 200 publicações sem cliente conectado: nenhuma codificação JPEG.
    assert decorrido < 0.05


def test_responde_o_stream_como_multipart(servidor):
    servidor.publish(frame_de_teste())

    with urllib.request.urlopen(f"http://127.0.0.1:{servidor.port}/stream",
                                timeout=5) as resposta:
        tipo = resposta.headers["Content-Type"]
        pedaco = resposta.read(2048)

    assert tipo.startswith("multipart/x-mixed-replace")
    assert b"Content-Type: image/jpeg" in pedaco
    assert b"\xff\xd8" in pedaco          # marcador de início de JPEG


def test_rota_desconhecida_devolve_404(servidor):
    with pytest.raises(urllib.error.HTTPError) as erro:
        urllib.request.urlopen(f"http://127.0.0.1:{servidor.port}/inexistente",
                               timeout=5)

    assert erro.value.code == 404
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_mjpeg.py -q
```

Esperado: FALHA — `ModuleNotFoundError: No module named 'src.notify.mjpeg'`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/notify/mjpeg.py`:

```python
"""
Servidor MJPEG do frame anotado.

Escolhido em vez de WebRTC deliberadamente: entrega latência de cerca de um
frame com zero dependência nova e um <img src> no browser. WebRTC daria
sub-100 ms ao custo de aiortc ou um media server mais sinalização — semanas
de trabalho para um ganho imperceptível na demonstração.
"""
from __future__ import annotations

import logging
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

import cv2
import numpy as np

log = logging.getLogger(__name__)

FRONTEIRA = "cypherframe"


class MjpegServer:
    """Publica o último frame anotado em multipart/x-mixed-replace."""

    def __init__(self, port: int = 8090, quality: int = 80) -> None:
        self.requested_port = port
        self.quality = quality
        self._frame: Optional[np.ndarray] = None
        self._lock = threading.Lock()
        self._novo_frame = threading.Condition(self._lock)
        self._server: Optional[ThreadingHTTPServer] = None
        self._thread: Optional[threading.Thread] = None

    @property
    def port(self) -> int:
        return self._server.server_address[1] if self._server else self.requested_port

    def publish(self, frame: np.ndarray) -> None:
        """Chamado da thread do frame. Uma atribuição sob lock — sem codificação."""
        with self._novo_frame:
            self._frame = frame
            self._novo_frame.notify_all()

    def has_frame(self) -> bool:
        with self._lock:
            return self._frame is not None

    def start(self) -> None:
        servidor_pai = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.0"

            def do_GET(self):  # noqa: N802 (assinatura da biblioteca padrão)
                if self.path.split("?")[0] != "/stream":
                    self.send_error(404, "Rota desconhecida")
                    return
                servidor_pai._servir_stream(self)

            def log_message(self, *args):
                pass   # o HUD do pipeline já ocupa o terminal

        self._server = ThreadingHTTPServer(("0.0.0.0", self.requested_port), Handler)
        self._thread = threading.Thread(target=self._server.serve_forever,
                                        name="mjpeg-server", daemon=True)
        self._thread.start()
        log.info("MJPEG servindo em http://0.0.0.0:%d/stream", self.port)

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=2.0)

    def _servir_stream(self, handler: BaseHTTPRequestHandler) -> None:
        handler.send_response(200)
        handler.send_header("Content-Type",
                            f"multipart/x-mixed-replace; boundary={FRONTEIRA}")
        handler.send_header("Cache-Control", "no-store")
        handler.end_headers()

        ultimo = None
        try:
            while True:
                with self._novo_frame:
                    while self._frame is None or self._frame is ultimo:
                        if not self._novo_frame.wait(timeout=5.0):
                            break
                    if self._frame is None:
                        continue
                    ultimo = self._frame
                    frame = ultimo

                ok, jpeg = cv2.imencode(
                    ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), self.quality])
                if not ok:
                    continue

                handler.wfile.write(f"--{FRONTEIRA}\r\n".encode())
                handler.wfile.write(b"Content-Type: image/jpeg\r\n")
                handler.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode())
                handler.wfile.write(jpeg.tobytes())
                handler.wfile.write(b"\r\n")
        except (BrokenPipeError, ConnectionResetError):
            # Browser fechou a aba. O pipeline não precisa saber disso.
            pass
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_mjpeg.py -q
```

Esperado: PASSA, 5 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/notify/mjpeg.py tests/test_mjpeg.py
git commit -m "feat(notify): servidor MJPEG do frame anotado"
```

---

## Task 7: Configuração e ligação no pipeline

**Files:**
- Modify: `config/pose_config.yaml`
- Modify: `src/run_pipeline.py`
- Modify: `src/notify/__init__.py`
- Modify: `src/fusion/pipeline.py`
- Test: `tests/test_notify_config.py`

**Interfaces:**
- Consumes: tudo das Tasks 1–6.
- Produces:
  - `NotifyConfig` em `src/notify/__init__.py`, com `from_yaml(path) -> NotifyConfig`.
  - Flags novas em `run_pipeline.py`: `--camera-id`, `--api-url`, `--stream-port`, `--no-stream`.
  - `UnifiedPipeline.set_frame_publisher(callable)`.

Sem `api_url` configurado, o comportamento é idêntico ao de hoje: o `ConsoleIncidentSink` imprime e nada mais muda.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_notify_config.py`:

```python
"""
Testes da configuração de notificação.

O que está sendo protegido: que o pipeline continue rodando exatamente como
antes quando ninguém configurou a API — a compatibilidade para trás é o que
permite executar este plano sem quebrar a demonstração atual.
"""
from __future__ import annotations

import textwrap

from src.notify import NotifyConfig


def test_valores_padrao_desligam_a_notificacao(tmp_path):
    config = tmp_path / "vazio.yaml"
    config.write_text("pipeline:\n  device: cpu\n")

    notify = NotifyConfig.from_yaml(str(config))

    assert notify.api_url is None
    assert notify.enabled is False
    assert notify.camera_id == "CAM-01"
    assert notify.merge_window_seconds == 15.0
    assert notify.evict_after_frames == 45
    assert notify.min_track_frames == 15
    assert notify.stream_enabled is True
    assert notify.stream_port == 8090


def test_le_a_secao_notify(tmp_path):
    config = tmp_path / "cheio.yaml"
    config.write_text(textwrap.dedent("""
        notify:
          camera_id: CAM-03
          api_url: http://localhost:8080/api/v1
          min_severity: 3
          merge_window_seconds: 20
          evict_after_frames: 60
          min_track_frames: 10
          queue_size: 128
          spill_path: outputs/meu.jsonl
          stream_port: 8092
          stream_enabled: false
    """))

    notify = NotifyConfig.from_yaml(str(config))

    assert notify.enabled is True
    assert notify.camera_id == "CAM-03"
    assert notify.api_url == "http://localhost:8080/api/v1"
    assert notify.min_severity == 3
    assert notify.merge_window_seconds == 20
    assert notify.queue_size == 128
    assert notify.spill_path == "outputs/meu.jsonl"
    assert notify.stream_port == 8092
    assert notify.stream_enabled is False


def test_chaves_desconhecidas_sao_ignoradas(tmp_path):
    config = tmp_path / "extra.yaml"
    config.write_text("notify:\n  camera_id: CAM-09\n  invento: 42\n")

    notify = NotifyConfig.from_yaml(str(config))

    assert notify.camera_id == "CAM-09"


def test_cada_execucao_tem_run_id_proprio(tmp_path):
    config = tmp_path / "c.yaml"
    config.write_text("notify:\n  camera_id: CAM-01\n")

    a = NotifyConfig.from_yaml(str(config))
    b = NotifyConfig.from_yaml(str(config))

    assert a.run_id != b.run_id
    assert len(a.run_id) >= 6
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_notify_config.py -q
```

Esperado: FALHA — `ImportError: cannot import name 'NotifyConfig'`.

- [ ] **Step 3: Implementar o mínimo**

Substituir `src/notify/__init__.py`:

```python
"""Emissão de incidentes e stream de vídeo ao vivo (Fase 3)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, fields
from typing import Optional

import yaml

from .incident import ClosedReason, IncidentReport, POSTURE_TO_TYPE, build_incident_key
from .mjpeg import MjpegServer
from .sink import ConsoleIncidentSink, HttpIncidentSink
from .tracker import IncidentTracker, TrackerConfig


@dataclass
class NotifyConfig:
    """Seção `notify` do pose_config.yaml. Chaves desconhecidas são ignoradas,
    seguindo o mesmo contrato de PipelineConfig.from_yaml."""

    camera_id: str = "CAM-01"
    api_url: Optional[str] = None
    min_severity: int = 2
    merge_window_seconds: float = 15.0
    evict_after_frames: int = 45
    min_track_frames: int = 15
    queue_size: int = 256
    spill_path: str = "outputs/incidents.jsonl"
    stream_port: int = 8090
    stream_enabled: bool = True
    run_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])

    @property
    def enabled(self) -> bool:
        """Sem api_url, o pipeline se comporta exatamente como antes."""
        return bool(self.api_url)

    @classmethod
    def from_yaml(cls, path: str) -> "NotifyConfig":
        with open(path) as arquivo:
            bruto = yaml.safe_load(arquivo) or {}
        secao = bruto.get("notify") or {}
        conhecidos = {f.name for f in fields(cls)} - {"run_id"}
        return cls(**{k: v for k, v in secao.items() if k in conhecidos})


__all__ = [
    "ClosedReason",
    "ConsoleIncidentSink",
    "HttpIncidentSink",
    "IncidentReport",
    "IncidentTracker",
    "MjpegServer",
    "NotifyConfig",
    "POSTURE_TO_TYPE",
    "TrackerConfig",
    "build_incident_key",
]
```

Acrescentar a seção ao final de `config/pose_config.yaml`:

```yaml
notify:
  camera_id: CAM-01
  # Sem api_url, o pipeline apenas imprime os incidentes (comportamento antigo).
  # api_url: http://localhost:8080/api/v1
  min_severity: 2
  merge_window_seconds: 15            # calibrado em cenario2.mp4 (spec §4.1.2)
  evict_after_frames: 45              # track sumido por N frames = fecha como TRACK_LOST
  min_track_frames: 15                # tracks mais curtos nao abrem incidente
  queue_size: 256
  spill_path: outputs/incidents.jsonl
  stream_port: 8090
  stream_enabled: true
```

Em `src/fusion/pipeline.py`, acrescentar ao `__init__` da `UnifiedPipeline`:

```python
        self._frame_publisher = None    # callable opcional, alimentado pelo MJPEG
```

e um método público logo depois de `_ensure_epi_model`:

```python
    def set_frame_publisher(self, publisher) -> None:
        """Registra quem recebe cada frame anotado (ex.: MjpegServer.publish)."""
        self._frame_publisher = publisher
```

e, em `process_frame`, imediatamente antes do `return annotated, events`:

```python
        if self._frame_publisher is not None:
            self._frame_publisher(annotated)
```

Em `src/run_pipeline.py`, acrescentar as flags em `parse_args`:

```python
    p.add_argument("--camera-id", default=None,
                   help="identificador desta camera (default: do config)")
    p.add_argument("--api-url", default=None,
                   help="base da API, ex. http://localhost:8080/api/v1 "
                        "(sem isso, os incidentes so sao impressos)")
    p.add_argument("--stream-port", type=int, default=None,
                   help="porta do stream MJPEG (default: do config)")
    p.add_argument("--no-stream", action="store_true",
                   help="nao sobe o servidor de video ao vivo")
```

e, em `main`, logo após a construção do `pipeline`:

```python
    from datetime import datetime, timezone
    from src.notify import (
        ConsoleIncidentSink, HttpIncidentSink, IncidentTracker,
        MjpegServer, NotifyConfig, TrackerConfig,
    )

    notify_config = NotifyConfig.from_yaml(args.config)
    if args.camera_id:
        notify_config.camera_id = args.camera_id
    if args.api_url:
        notify_config.api_url = args.api_url
    if args.stream_port is not None:
        notify_config.stream_port = args.stream_port
    if args.no_stream:
        notify_config.stream_enabled = False

    if notify_config.enabled:
        sink = HttpIncidentSink(
            notify_config.api_url,
            queue_size=notify_config.queue_size,
            spill_path=notify_config.spill_path,
        )
        print(f"[notify] enviando incidentes para {notify_config.api_url} "
              f"como {notify_config.camera_id} (run {notify_config.run_id})")
    else:
        sink = ConsoleIncidentSink()
        print("[notify] sem api_url: incidentes apenas impressos")
    sink.start()

    tracker = IncidentTracker(
        TrackerConfig(
            camera_id=notify_config.camera_id,
            run_id=notify_config.run_id,
            min_severity=notify_config.min_severity,
            merge_window_seconds=notify_config.merge_window_seconds,
            evict_after_frames=notify_config.evict_after_frames,
            min_track_frames=notify_config.min_track_frames,
            fps=config.target_fps,
        ),
        on_open=sink.open,
        on_close=sink.close,
    )

    stream = None
    if notify_config.stream_enabled:
        stream = MjpegServer(port=notify_config.stream_port)
        stream.start()
        pipeline.set_frame_publisher(stream.publish)
        print(f"[stream] video ao vivo em http://127.0.0.1:{stream.port}/stream")
```

Dentro do laço, logo após a impressão dos eventos acima do limiar de severidade:

```python
            tracker.process(events, datetime.now(timezone.utc).astimezone())
```

E no bloco `finally`, antes de `cap.release()`:

```python
        tracker.flush(datetime.now(timezone.utc).astimezone())
        sink.stop()
        if stream is not None:
            stream.stop()
```

O `flush` no `finally` é o que impede que cada execução deixe incidentes órfãos — medido: sem ele, `cenario2.mp4` deixa 2.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_notify_config.py -q
```

Esperado: PASSA, 4 testes.

- [ ] **Step 5: Confirmar que a suíte inteira continua verde**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/ -q
```

Esperado: PASSA — 89 testes originais mais os novos, zero falhas.

- [ ] **Step 6: Confirmar que o comportamento antigo não mudou**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python src/run_pipeline.py --source data/validation/cenario2.mp4 \
  --device cuda --no-display --no-stream --max-frames 120
```

Esperado: o HUD de latência aparece como antes, a linha `[notify] sem api_url` confirma o modo de compatibilidade, e o resumo final de latência continua reportando o veredito contra os 200 ms.

- [ ] **Step 7: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/notify/__init__.py src/fusion/pipeline.py src/run_pipeline.py \
        config/pose_config.yaml tests/test_notify_config.py
git commit -m "feat(pipeline): liga tracker, sink e stream ao run_pipeline"
```

---

## Task 8: Snapshot anexado depois

**Files:**
- Modify: `src/notify/incident.py`
- Modify: `src/notify/sink.py`
- Modify: `src/notify/tracker.py`
- Modify: `src/fusion/pipeline.py`
- Modify: `src/run_pipeline.py`
- Test: `tests/test_incident_snapshot.py`

**Interfaces:**
- Consumes: `IncidentReport` (Task 2), `HttpIncidentSink` (Task 5), `IncidentTracker` (Task 3).
- Produces:
  - `IncidentReport.snapshot_frame: Any` — o frame anotado, **nunca serializado**.
  - `Uploader` — protocolo com `upload(frame, public_id) -> str`.
  - `CloudinaryUploader` — embrulha `src/utils/upload.py`.
  - `IncidentTracker.process(events, now, frame=None)`.
  - `HttpIncidentSink(..., uploader=None)`.

O upload para o Cloudinary leva centenas de milissegundos e não pode atrasar a notificação. A sequência é: `POST` sem `snapshotUrl` imediatamente, upload na thread de envio, `PATCH` quando a URL existir. O card aparece no dashboard na hora; a imagem chega em seguida (spec §4.4).

Os testes não precisam de credencial: o uploader é injetado.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_incident_snapshot.py`:

```python
"""
Testes do anexo tardio do snapshot.

O que está sendo protegido: que o upload nunca entre no caminho da
notificação. Um POST que espera centenas de milissegundos pelo Cloudinary
atrasa o alerta de queda pelo mesmo tanto — e é exatamente o alerta que não
pode esperar.
"""
from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

import numpy as np

from src.notify.incident import IncidentReport
from src.notify.sink import HttpIncidentSink

BRT = timezone(timedelta(hours=-3))
T0 = datetime(2026, 8, 10, 14, 0, 0, tzinfo=BRT)


def relatorio_com_frame(chave: str) -> IncidentReport:
    return IncidentReport(
        incident_key=chave,
        camera_id="CAM-01",
        run_id="run-a",
        track_id=7,
        type="FALL_RISK",
        severity=4,
        reason="fallen_sustained",
        posture_category="immediate_risk",
        zone_status="outside",
        detected_at=T0,
        peak_severity=4,
        snapshot_frame=np.zeros((48, 64, 3), dtype=np.uint8),
    )


class TransporteFake:
    def __init__(self) -> None:
        self.posts: list[tuple[str, dict]] = []
        self.patches: list[tuple[str, dict]] = []
        self.patch_chegou = threading.Event()

    def post(self, url, payload):
        self.posts.append((url, payload))

    def patch(self, url, payload):
        self.patches.append((url, payload))
        self.patch_chegou.set()


class UploaderFake:
    def __init__(self) -> None:
        self.chamadas: list[str] = []

    def upload(self, frame, public_id: str) -> str:
        self.chamadas.append(public_id)
        return f"https://cdn.exemplo/{public_id}.jpg"


def test_frame_nunca_entra_no_payload():
    payload = relatorio_com_frame("k1").open_payload()

    assert "snapshot_frame" not in payload
    assert "snapshotFrame" not in payload
    assert payload["snapshotUrl"] is None


def test_post_sai_sem_snapshot_e_patch_traz_a_url():
    transporte = TransporteFake()
    uploader = UploaderFake()
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte,
                            uploader=uploader)
    sink.start()
    try:
        sink.open(relatorio_com_frame("k1"))
        assert transporte.patch_chegou.wait(timeout=3)
    finally:
        sink.stop()

    # O POST foi primeiro e sem imagem.
    assert transporte.posts[0][1]["snapshotUrl"] is None
    # O PATCH veio depois, só com a URL.
    url, payload = transporte.patches[0]
    assert url == "http://api/api/v1/incidents/k1"
    assert payload == {"snapshotUrl": "https://cdn.exemplo/k1.jpg"}
    assert uploader.chamadas == ["k1"]


def test_falha_de_upload_nao_derruba_o_incidente():
    class UploaderQuebrado:
        def upload(self, frame, public_id):
            raise RuntimeError("Cloudinary fora do ar")

    transporte = TransporteFake()
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte,
                            uploader=UploaderQuebrado())
    sink.start()
    try:
        sink.open(relatorio_com_frame("k1"))
        import time
        time.sleep(0.3)
    finally:
        sink.stop()

    assert len(transporte.posts) == 1        # o incidente foi entregue
    assert transporte.patches == []          # só o snapshot se perdeu


def test_sem_uploader_configurado_nao_ha_patch():
    transporte = TransporteFake()
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte)
    sink.start()
    try:
        sink.open(relatorio_com_frame("k1"))
        import time
        time.sleep(0.2)
    finally:
        sink.stop()

    assert len(transporte.posts) == 1
    assert transporte.patches == []


def test_incidente_sem_frame_nao_tenta_upload():
    transporte = TransporteFake()
    uploader = UploaderFake()
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte,
                            uploader=uploader)
    sink.start()
    try:
        rel = relatorio_com_frame("k1")
        rel.snapshot_frame = None
        sink.open(rel)
        import time
        time.sleep(0.2)
    finally:
        sink.stop()

    assert uploader.chamadas == []
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_snapshot.py -q
```

Esperado: FALHA — `IncidentReport.__init__() got an unexpected keyword argument 'snapshot_frame'`.

- [ ] **Step 3: Implementar o mínimo**

Em `src/notify/incident.py`, acrescentar `Any` ao import de `typing` e o campo ao final do dataclass:

```python
    # Frame anotado do momento da abertura. Nunca serializado: existe apenas
    # para o sink fazer o upload fora do caminho crítico.
    snapshot_frame: Any = None
```

Em `src/notify/tracker.py`, `process` passa a aceitar o frame e o repassa ao relatório aberto:

```python
    def process(self, events: list[PersonEvent], now: datetime,
                frame=None) -> None:
        self._frame_idx += 1
        self._frame_atual = frame
        ...
```

Declarar `self._frame_atual = None` no `__init__`, e em `_open_or_merge`, ao construir o `IncidentReport`, acrescentar o argumento:

```python
            snapshot_frame=self._frame_atual,
```

Em `src/notify/sink.py`, acrescentar o protocolo e a implementação real:

```python
class Uploader(Protocol):
    def upload(self, frame, public_id: str) -> str: ...


class CloudinaryUploader:
    """Embrulha src/utils/upload.py. Importa preguiçosamente para que os
    testes rodem sem credencial e sem a dependência carregada."""

    def __init__(self, folder: str = "cypher-incidents") -> None:
        self.folder = folder

    def upload(self, frame, public_id: str) -> str:
        import os
        import tempfile

        import cloudinary.uploader
        import cv2

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            cv2.imwrite(tmp.name, frame)
            resposta = cloudinary.uploader.upload(
                tmp.name, folder=self.folder, public_id=public_id)
        os.unlink(tmp.name)
        return resposta["secure_url"]
```

`_Item` ganha dois campos, ao final:

```python
    snapshot_frame: object = None
```

`HttpIncidentSink.__init__` ganha o parâmetro `uploader: Optional[Uploader] = None` e o guarda em `self.uploader`. O método `open` passa o frame adiante:

```python
    def open(self, relatorio: IncidentReport) -> None:
        self._enfileirar(_Item("open", relatorio.incident_key,
                               relatorio.severity, relatorio.open_payload(),
                               snapshot_frame=relatorio.snapshot_frame))
```

Como `_Item` é um dataclass com `attempts` antes do campo novo, a chamada usa palavra-chave — o que já está feito acima.

E em `_entregar`, logo após o `return` do caso de sucesso do `post`, o upload entra como passo seguinte **dentro da mesma thread de envio**:

```python
            try:
                if item.kind == "open":
                    self.transport.post(f"{self.api_url}/incidents", item.payload)
                    self._anexar_snapshot(item)
                else:
                    self.transport.patch(
                        f"{self.api_url}/incidents/{item.incident_key}", item.payload)
                return
```

e o método novo:

```python
    def _anexar_snapshot(self, item: _Item) -> None:
        """Upload e PATCH depois que o incidente já foi entregue.

        Falha aqui perde a imagem, nunca o alerta: o POST já aconteceu.
        """
        if self.uploader is None or item.snapshot_frame is None:
            return
        try:
            url = self.uploader.upload(item.snapshot_frame, item.incident_key)
            self.transport.patch(
                f"{self.api_url}/incidents/{item.incident_key}", {"snapshotUrl": url})
        except Exception as falha:
            log.warning("Snapshot de %s nao anexado: %s", item.incident_key, falha)
```

Em `src/fusion/pipeline.py`, `process_frame` já devolve `annotated`; nenhuma mudança extra é necessária aqui.

Em `src/run_pipeline.py`, passar o frame anotado ao tracker e ligar o uploader quando as credenciais existirem. A chamada do laço passa a ser:

```python
            tracker.process(events, datetime.now(timezone.utc).astimezone(),
                            frame=annotated)
```

e a construção do sink ganha o uploader:

```python
    if notify_config.enabled:
        uploader = None
        if os.getenv("CLOUDINARY_CLOUD_NAME"):
            from src.notify.sink import CloudinaryUploader
            uploader = CloudinaryUploader()
            print("[notify] snapshots serao enviados ao Cloudinary")
        sink = HttpIncidentSink(
            notify_config.api_url,
            queue_size=notify_config.queue_size,
            spill_path=notify_config.spill_path,
            uploader=uploader,
        )
```

Acrescentar `import os` ao topo de `run_pipeline.py` caso ainda não exista.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_snapshot.py -q
```

Esperado: PASSA, 5 testes.

- [ ] **Step 5: Confirmar que a suíte inteira continua verde**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/ -q
```

Esperado: PASSA, zero falhas.

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/notify/ src/run_pipeline.py tests/test_incident_snapshot.py
git commit -m "feat(notify): snapshot enviado apos o incidente, fora do caminho critico"
```

---

## Task 9: Verificação de ponta a ponta contra a API

**Files:** nenhuma alteração de código. Esta tarefa é verificação.

**Interfaces:**
- Consumes: plano E1-A, Tasks 1–13 concluídas.
- Produces: confirmação de que o clipe medido produz na API exatamente os incidentes que os testes preveem.

- [ ] **Step 1: Subir a API**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o spring-boot:run
```

- [ ] **Step 2: Abrir o stream de eventos noutro terminal**

```bash
curl -N http://localhost:8080/api/v1/incidents/stream
```

- [ ] **Step 3: Rodar o pipeline sobre o clipe medido**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python src/run_pipeline.py \
  --source data/validation/cenario2.mp4 \
  --device cuda --no-display \
  --camera-id CAM-02 \
  --api-url http://localhost:8080/api/v1
```

- [ ] **Step 4: Conferir o resultado contra o que foi medido**

```bash
curl -s 'http://localhost:8080/api/v1/incidents?camera=CAM-02' | python3 -m json.tool
```

Confirmar, nesta ordem:

1. `totalElements` é **2** — um `FALL_RISK` e um `ERGONOMIC_RISK`. É o mesmo número que `test_cenario2_produz_dois_incidentes_para_duas_quedas` trava, agora atravessando a rede e o banco.
2. Nenhum incidente ficou sem `endedAt`: o `flush` do `finally` fechou o que restava.
3. Pelo menos um tem `closedReason` igual a `PIPELINE_STOPPED`.
4. O terminal do `curl -N` imprimiu um evento `incident` por abertura e eventos `incident-changed` nos fechamentos.
5. O vídeo ao vivo responde durante a execução: abrir `http://127.0.0.1:8090/stream` no browser mostra o esqueleto anotado.

- [ ] **Step 5: Conferir o comportamento com a API fora do ar**

Derrubar a API (Ctrl-C no terminal do Maven) e rodar de novo com `--max-frames 400`. Confirmar que o pipeline **não para**, que o HUD continua, e que ao final existe conteúdo em `outputs/incidents.jsonl`. Subir a API novamente e rodar o pipeline com `--max-frames 1`: o spill deve ser drenado na subida e os incidentes pendentes aparecem na API.

```bash
curl -s 'http://localhost:8080/api/v1/incidents?camera=CAM-02' | python3 -c "import json,sys;print(len(json.load(sys.stdin)['content']))"
wc -l outputs/incidents.jsonl
```

Esperado: o arquivo de spill fica vazio depois da drenagem e a contagem na API cresce.

- [ ] **Step 6: Commit da documentação do resultado**

Registrar o que foi observado em `docs/e1b-verificacao.md` (números reais, não os esperados) e commitar:

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add docs/e1b-verificacao.md
git commit -m "docs(notify): resultado da verificacao ponta a ponta de E1-B"
```

---

## Estado ao fim deste plano

O pipeline emite incidentes reais para a API e serve vídeo ao vivo. O que falta para completar E1 é o plano **E1-C**, que substitui os mocks do Angular por esses dados.

O snapshot (Task 8) funciona sem credencial: sem `CLOUDINARY_CLOUD_NAME` no ambiente, o uploader não é ligado e os incidentes seguem sem imagem. Configurar o `.env` é o único passo que falta para as imagens aparecerem no painel.

Fora do escopo, por decisão registrada na spec: hardening de RTSP e auto-configuração da fonte pela API (E2).
