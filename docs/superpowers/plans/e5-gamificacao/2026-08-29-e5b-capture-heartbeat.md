# E5-B — cypher-capture: Envio de Heartbeat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **✅ EXECUÇÃO LIBERADA (2026-09-07).** Pré-requisito da spec §7 (GTQ) resolvido, PR #10 mergeado. **Parte depois que `e5a` estiver rodando localmente** (o endpoint `POST /cameras/{codigo}/heartbeat` precisa existir). Verificado em 2026-09-07: `chave_provisionada` está viva em `src/run_pipeline.py:159` e o ponto de inserção após o `try/except MissingApiKeyError` (linha ~224) confere — o plano está alinhado com a árvore atual, incluindo a fusão com o fluxo de zonas (`zrb` mergeado no PR #9). **Commits sem `Co-Authored-By`.** Branch local `feat/e5-capture-heartbeat` a partir de `main` — **não** usar worktrees.

**Goal:** `cypher-capture` passa a enviar `POST /cameras/{id}/heartbeat` no intervalo configurado, sem travar o pipeline se a API estiver fora do ar (spec §9 "Python").

**Architecture:** `HeartbeatSender`, réplica pequena do padrão já usado por `HttpIncidentSink`/`ApiKeyProvisioner` — mesma resolução de chave (`resolve_api_key`, reaproveitada, não duplicada), mesma tolerância a falha (log e segue). Tarefa 1 entrega a classe isolada, testada sem rede. Tarefa 2 liga no laço principal de `run_pipeline.py`, chamando `enviar_se_necessario()` uma vez por frame — barato, porque o throttling interno decide sozinho quando de fato há I/O.

**Tech Stack:** Python 3.10, pytest, transporte injetado (sem rede nos testes).

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-gamificacao-e5-design.md` (repo `cypher-front`), §2.1, §9 "Python".

**Repositório:** `/home/asaas/projects/challenge/cypher-capture`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-capture`. Branch, quando a execução for liberada: `feat/e5-capture-heartbeat`.
- **Depende do plano `e5a-backend-gamificacao.md`** (o endpoint `POST /cameras/{codigo}/heartbeat` precisa existir) e do plano de zonas `zrb-capture-zonas.md` já mergeado ou coexistindo na mesma árvore (ambos tocam `run_pipeline.py`; resolver conflito de merge trivial na Tarefa 2 se as duas branches divergirem).
- **A resolução de chave é reaproveitada de `resolve_api_key` (`src/notify/sink.py`)**, nunca duplicada — mesmo contrato de `HttpIncidentSink`: `api_key` explícito vence `api_key_env`, e falha alto (`MissingApiKeyError`) se nenhum dos dois resolver, no boot, não no meio da execução.
- **`enviar_se_necessario()` nunca lança** — qualquer falha de transporte é logada e engolida, mesma tolerância de `HttpIncidentSink`. O throttle interno (`_ultimo_envio`) avança mesmo quando o envio falha, para não tentar de novo a cada frame depois de uma falha.
- Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/<arquivo>.py -v` para um arquivo; `python -m pytest -q` para a suíte inteira.

---

### Task 1: `HeartbeatSender`

**Files:**
- Create: `src/notify/heartbeat.py`
- Modify: `src/notify/__init__.py`
- Test: `tests/test_heartbeat_sender.py`

**Interfaces:**
- Produces: `HeartbeatSender(api_url, camera_id, api_key_env=, api_key=, interval_seconds=30.0, transport=, now=)`, `.enviar_se_necessario()` — consumido pela Tarefa 2

- [ ] **Step 1: Escrever os testes**

Criar `tests/test_heartbeat_sender.py`:

```python
"""
Testes de HeartbeatSender (src/notify/heartbeat.py).

O que está sendo protegido: o throttle (no máximo um POST por intervalo) e a
tolerância a falha (API fora do ar não trava o pipeline nem faz retry a cada
frame) — design doc de gamificação E5, §2.1/§9 "Python".
"""
from __future__ import annotations

from src.notify.heartbeat import HeartbeatSender


class TransporteFake:
    def __init__(self, erro=None):
        self.erro = erro
        self.chamadas: list[tuple[str, dict]] = []

    def post(self, url, headers=None):
        self.chamadas.append((url, headers))
        if self.erro is not None:
            raise self.erro


def relogio(inicio=0.0):
    estado = {"t": inicio}

    def agora():
        return estado["t"]

    def avancar(segundos):
        estado["t"] += segundos

    return agora, avancar


def test_primeiro_envio_acontece_imediatamente():
    transporte = TransporteFake()
    agora, _ = relogio()
    sender = HeartbeatSender("http://api/api/v1", "CAM-01", api_key="chave-x",
                             transport=transporte, now=agora)

    sender.enviar_se_necessario()

    assert transporte.chamadas == [("http://api/api/v1/cameras/CAM-01/heartbeat", {"X-Cypher-Key": "chave-x"})]


def test_segundo_envio_antes_do_intervalo_e_ignorado():
    transporte = TransporteFake()
    agora, avancar = relogio()
    sender = HeartbeatSender("http://api/api/v1", "CAM-01", api_key="chave-x",
                             interval_seconds=30.0, transport=transporte, now=agora)
    sender.enviar_se_necessario()

    avancar(10)
    sender.enviar_se_necessario()

    assert len(transporte.chamadas) == 1


def test_envio_depois_do_intervalo_acontece_de_novo():
    transporte = TransporteFake()
    agora, avancar = relogio()
    sender = HeartbeatSender("http://api/api/v1", "CAM-01", api_key="chave-x",
                             interval_seconds=30.0, transport=transporte, now=agora)
    sender.enviar_se_necessario()

    avancar(31)
    sender.enviar_se_necessario()

    assert len(transporte.chamadas) == 2


def test_falha_de_transporte_nao_propaga_e_respeita_o_throttle_seguinte():
    transporte = TransporteFake(erro=ConnectionError("api fora do ar"))
    agora, avancar = relogio()
    sender = HeartbeatSender("http://api/api/v1", "CAM-01", api_key="chave-x",
                             interval_seconds=30.0, transport=transporte, now=agora)

    sender.enviar_se_necessario()  # nao deve lancar

    avancar(5)
    sender.enviar_se_necessario()  # ainda dentro do intervalo: nao tenta de novo

    assert len(transporte.chamadas) == 1


def test_sem_chave_resolvida_nao_envia_nem_lanca():
    transporte = TransporteFake()
    agora, _ = relogio()
    sender = HeartbeatSender("http://api/api/v1", "CAM-01", transport=transporte, now=agora)

    sender.enviar_se_necessario()

    assert transporte.chamadas == []
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_heartbeat_sender.py -v`
Expected: FAIL na coleta — `src/notify/heartbeat.py` não existe.

- [ ] **Step 3: Criar `HeartbeatSender`**

Criar `src/notify/heartbeat.py`:

```python
"""
Envio periódico de heartbeat de câmera (design doc de gamificação E5, §2.1).

Mesma tolerância a falha de HttpIncidentSink (src/notify/sink.py): uma API
fora do ar não trava o pipeline — só loga e segue, tentando de novo apenas
depois do próximo intervalo inteiro (nunca a cada frame).
"""
from __future__ import annotations

import logging
import os
import time
from typing import Callable, Mapping, Optional, Protocol

from .sink import resolve_api_key

log = logging.getLogger(__name__)


class HeartbeatTransport(Protocol):
    def post(self, url: str, headers: Optional[dict] = None) -> None: ...


class RequestsHeartbeatTransport:
    """Transporte real. Importa requests preguiçosamente para manter os
    testes livres da dependência."""

    def __init__(self, timeout: float = 5.0) -> None:
        self.timeout = timeout

    def post(self, url: str, headers: Optional[dict] = None) -> None:
        import requests
        resposta = requests.post(url, headers=headers, timeout=self.timeout)
        resposta.raise_for_status()


class HeartbeatSender:
    """Manda POST /cameras/{id}/heartbeat no máximo uma vez por
    ``interval_seconds``. ``enviar_se_necessario()`` é barato o bastante para
    ser chamado a cada frame — só há I/O de verdade quando o intervalo já
    passou.
    """

    def __init__(self, api_url: str, camera_id: str,
                 api_key_env: Optional[str] = None,
                 api_key: Optional[str] = None,
                 env: Optional[Mapping[str, str]] = None,
                 interval_seconds: float = 30.0,
                 transport: Optional[HeartbeatTransport] = None,
                 now: Optional[Callable[[], float]] = None) -> None:
        self.url = f"{api_url.rstrip('/')}/cameras/{camera_id}/heartbeat"
        chave = api_key if api_key is not None else resolve_api_key(
            api_key_env, env if env is not None else os.environ)
        self._headers: Optional[dict[str, str]] = (
            {"X-Cypher-Key": chave} if chave is not None else None)
        self.interval = interval_seconds
        self.transport = transport or RequestsHeartbeatTransport()
        self._now = now or time.monotonic
        self._ultimo_envio: Optional[float] = None

    def enviar_se_necessario(self) -> None:
        agora = self._now()
        if self._ultimo_envio is not None and (agora - self._ultimo_envio) < self.interval:
            return
        self._ultimo_envio = agora

        if self._headers is None:
            return
        try:
            self.transport.post(self.url, headers=self._headers)
        except Exception as erro:
            log.warning("Heartbeat para %s falhou: %s", self.url, erro)
```

- [ ] **Step 4: Exportar em `src/notify/__init__.py`**

```python
from .heartbeat import HeartbeatSender
```

E adicionar `"HeartbeatSender"` a `__all__`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_heartbeat_sender.py -v`
Expected: PASS

- [ ] **Step 6: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/notify/heartbeat.py src/notify/__init__.py tests/test_heartbeat_sender.py
git commit -m "feat: adiciona HeartbeatSender, tolerante a falha e com throttle de intervalo"
```

---

### Task 2: Ligação em `run_pipeline.py`

**Files:**
- Modify: `src/notify/__init__.py` (campo `heartbeat_interval_seconds` em `NotifyConfig`)
- Modify: `src/run_pipeline.py`

**Interfaces:**
- Consumes: `HeartbeatSender` (Tarefa 1)

- [ ] **Step 1: Adicionar `heartbeat_interval_seconds` a `NotifyConfig`**

Em `src/notify/__init__.py`:

```python
@dataclass
class NotifyConfig:
    camera_id: str = "CAM-01"
    api_url: Optional[str] = None
    api_key_env: Optional[str] = None
    min_severity: int = 2
    merge_window_seconds: float = 15.0
    evict_after_frames: int = 45
    min_track_frames: int = 15
    queue_size: int = 256
    spill_path: str = "outputs/incidents.jsonl"
    stream_port: int = 8090
    stream_enabled: bool = True
    heartbeat_interval_seconds: float = 30.0
    run_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
```

- [ ] **Step 2: Construir e chamar o `HeartbeatSender` em `main()`**

Em `src/run_pipeline.py`, adicionar o import:

```python
from src.notify import (
    ConsoleIncidentSink, HeartbeatSender, HttpIncidentSink, IncidentTracker,
    MissingApiKeyError, MjpegServer, NotifyConfig, TrackerConfig,
)
```

Logo depois do bloco que constrói `sink` (dentro do `if notify_config.enabled:`, após o `try/except MissingApiKeyError` que já existe), construir o sender:

```python
        heartbeat_sender = HeartbeatSender(
            notify_config.api_url, notify_config.camera_id,
            api_key_env=notify_config.api_key_env, api_key=chave_provisionada,
            interval_seconds=notify_config.heartbeat_interval_seconds,
        )
    else:
        sink = ConsoleIncidentSink()
        print("[notify] sem api_url: incidentes apenas impressos")
        heartbeat_sender = None
```

(o `else:` acima é o mesmo que já existe no arquivo — só ganha a linha `heartbeat_sender = None` ao lado do `sink = ConsoleIncidentSink()` já presente.)

No laço principal (logo após `tracker.process(events, ...)`), adicionar:

```python
            if heartbeat_sender is not None:
                heartbeat_sender.enviar_se_necessario()
```

- [ ] **Step 3: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest -q`
Expected: PASS (nenhum teste novo nesta tarefa — `main()` continua sem cobertura direta, mesmo padrão já estabelecido para o resto da função, protegido pelos testes de `resolver_config_remota`/`resolver_zonas` extraídos).

- [ ] **Step 4: Commit**

```bash
git add src/notify/__init__.py src/run_pipeline.py
git commit -m "feat: envia heartbeat de camera a cada frame, respeitando o intervalo configurado"
```

---

## Self-Review

**Cobertura da spec:** §2.1 ("o pipeline chama a cada heartbeat_interval_seconds") → Tarefa 2. §9 "Python" ("cliente de heartbeat enviando no intervalo configurado, sem travar o pipeline se a API estiver fora") → Tarefa 1, testes de throttle e tolerância a falha.

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** `resolve_api_key` (já existente em `src/notify/sink.py`) reaproveitado sem reimplementação; `HeartbeatSender` segue a mesma assinatura de parâmetros (`api_key_env`/`api_key`/`env`) de `HttpIncidentSink`.

**Bloqueio confirmado:** o cabeçalho deste documento repete o bloqueio da spec §7.

---

**Plan complete and saved to `docs/superpowers/plans/e5-gamificacao/2026-08-29-e5b-capture-heartbeat.md`.**
