# E4-B — cypher-capture: Chave de API do Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O pipeline passa a mandar `X-Cypher-Key` (a chave de API da câmera, resolvida do ambiente) em todo `POST`/`PATCH` de incidente para o backend, sem nunca gravar a chave em texto puro no YAML versionado — e sem mudar de comportamento para quem ainda não configurou nada.

**Architecture:** Uma mudança aditiva em duas peças que já existem. `NotifyConfig` (`src/notify/__init__.py`) ganha um campo `api_key_env` apontando para o *nome* de uma variável de ambiente, seguindo o mesmo contrato que `expand_placeholders`/`MissingCredentialError` já estabeleceram em `src/capture/config_client.py` para a credencial de câmera. `HttpIncidentSink` (`src/notify/sink.py`) resolve essa variável **uma vez, na construção** — falha alto se ela estiver configurada mas ausente/vazia — e monta `{"X-Cypher-Key": chave}` uma única vez; `Transport.post`/`.patch` ganham um parâmetro `headers` opcional para carregar esse dicionário em cada chamada. Sem `api_key_env` configurado, `headers` é `None` em toda chamada — byte a byte o comportamento de hoje.

**Tech Stack:** Python 3.10, `requests` (via `RequestsTransport`, import preguiçoso), pytest.

**Spec:** `docs/superpowers/specs/2026-08-23-acesso-e-equipes-e4-design.md` §2.3 (chave por câmera, `X-Cypher-Key`), §5 ("`cypher-capture` — o que muda", autoritativa para o escopo deste plano), §7 (ordem de implementação entre os três repositórios).

**Repositório:** `/home/asaas/projects/challenge/cypher-capture`

## Global Constraints

- **Repositório:** `/home/asaas/projects/challenge/cypher-capture`. Branch: `feat/e4b-capture-chave-api`, criada a partir de `main` (confirmado: `main` está com E1/E2 já mergeados, PR #6 de `feat/e2b-capture-resiliente` é o commit mais recente) — **não** usar worktree, apenas `git checkout -b`.
- **Interpretador:** `./venv/bin/python`. Testes: `./venv/bin/python -m pytest`.
- **A chave nunca é gravada em YAML.** `NotifyConfig.api_key_env` guarda o *nome* da variável (ex.: `CYPHER_KEY_CAM01`), nunca o valor — mesmo contrato de `expand_placeholders`/`MissingCredentialError` em `src/capture/config_client.py`. O valor só existe em `os.environ` (via `.env` do host, gitignorado).
- **Falha alto, nomeando a variável.** Se `api_key_env` está configurado mas a variável não existe (ou está vazia) no ambiente, a construção do sink levanta um erro imediatamente — nunca manda a chave como string vazia, e nunca deixa de mandar o header em silêncio. Valor vazio conta como ausente, mesma regra de `expand_placeholders`.
- **Compatibilidade para trás é obrigatória, nos dois sentidos do §7 da spec.** Sem `api_key_env` configurado, nenhum header é enviado — nem `X-Cypher-Key` vazio, nem `None` viajando como string. É esse comportamento (mandar quando configurado, nada quando não) que permite este repositório implantar antes do backend tornar o header obrigatório (spec §7, passo 2 de 4): o pipeline de quem não migrou continua funcionando sem `401`.
- **Sem `--api-key` na CLI.** A chave vem só do ambiente, nunca de linha de comando (não aparece em `ps`, histórico de shell ou logs de processo).
- **Nenhum novo header em requisições que não sejam de incidente.** Este plano cobre só `POST`/`PATCH /incidents`, os únicos pontos de contato HTTP de `HttpIncidentSink`. `CameraConfigClient` (`GET /cameras/{id}/config`) é outro cliente HTTP, fora de escopo aqui.
- **Estilo dos testes:** seguir `tests/test_incident_sink.py`/`tests/test_notify_config.py` — docstring de módulo dizendo o que está sendo protegido, transporte sempre injetado (nenhum teste toca a rede).
- **Commits:** um por tarefa, em português, formato do repo (`feat(notify):`, `fix(notify):`).

---

## Estrutura de arquivos

```
src/notify/__init__.py     MODIFICAR  NotifyConfig ganha api_key_env; reexporta MissingApiKeyError
src/notify/sink.py         MODIFICAR  Transport/RequestsTransport ganham headers; MissingApiKeyError,
                                       resolve_api_key; HttpIncidentSink resolve e manda X-Cypher-Key
src/run_pipeline.py        MODIFICAR  liga NotifyConfig.api_key_env a HttpIncidentSink; trata o erro
config/pose_config.yaml    MODIFICAR  exemplo comentado de api_key_env na seção notify

tests/test_notify_config.py     MODIFICAR  cobre o novo campo (default None, parse do YAML)
tests/test_incident_sink.py     MODIFICAR  doubles de Transport ganham headers; testes de X-Cypher-Key
tests/test_incident_snapshot.py MODIFICAR  TransporteFake local tambem ganha headers (mesmo motivo)
```

**Por que a chave é resolvida na construção do sink, não por requisição.** A chave não muda no meio de uma execução — resolver uma vez e guardar o dicionário de headers pronto evita reler `os.environ` a cada `POST`/`PATCH` (que já roda fora da thread de frame, mas ainda assim é trabalho supérfluo) e, principalmente, faz o erro de configuração aparecer **no boot do processo**, no mesmo lugar onde `resolver_config_remota` já aborta por credencial de câmera ausente — não na primeira tentativa de entrega, horas depois, dentro da thread de retry onde ele viraria só mais uma linha de log de falha.

---

## Task 1: `NotifyConfig.api_key_env`

**Files:**
- Modify: `src/notify/__init__.py`
- Test: `tests/test_notify_config.py`

**Interfaces:**
- Consumes: nada novo (o mecanismo genérico de `from_yaml`, que já filtra por `{f.name for f in fields(cls)}`, cobre o campo novo sem mudança de código).
- Produces: `NotifyConfig.api_key_env: Optional[str] = None`.

- [ ] **Step 0: Criar a branch**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git checkout main
git pull
git checkout -b feat/e4b-capture-chave-api
```

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/test_notify_config.py`, adicionar a asserção do default à `test_valores_padrao_desligam_a_notificacao` (depois de `assert notify.api_url is None`):

```python
def test_valores_padrao_desligam_a_notificacao(tmp_path):
    config = tmp_path / "vazio.yaml"
    config.write_text("pipeline:\n  device: cpu\n")

    notify = NotifyConfig.from_yaml(str(config))

    assert notify.api_url is None
    assert notify.api_key_env is None
    assert notify.enabled is False
    assert notify.camera_id == "CAM-01"
    assert notify.merge_window_seconds == 15.0
    assert notify.evict_after_frames == 45
    assert notify.min_track_frames == 15
    assert notify.stream_enabled is True
    assert notify.stream_port == 8090
```

E estender `test_le_a_secao_notify` com a chave nova no YAML e a asserção correspondente:

```python
def test_le_a_secao_notify(tmp_path):
    config = tmp_path / "cheio.yaml"
    config.write_text(textwrap.dedent("""
        notify:
          camera_id: CAM-03
          api_url: http://localhost:8080/api/v1
          api_key_env: CYPHER_KEY_CAM03
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
    assert notify.api_key_env == "CYPHER_KEY_CAM03"
    assert notify.min_severity == 3
    assert notify.merge_window_seconds == 20
    assert notify.queue_size == 128
    assert notify.spill_path == "outputs/meu.jsonl"
    assert notify.stream_port == 8092
    assert notify.stream_enabled is False
```

E acrescentar um teste focado só no campo novo, ao final do arquivo:

```python
def test_le_api_key_env_isoladamente(tmp_path):
    config = tmp_path / "com_chave.yaml"
    config.write_text(textwrap.dedent("""
        notify:
          camera_id: CAM-01
          api_key_env: CYPHER_KEY_CAM01
    """))

    notify = NotifyConfig.from_yaml(str(config))

    assert notify.api_key_env == "CYPHER_KEY_CAM01"
    # api_url continua None: os dois campos sao independentes um do outro.
    assert notify.api_url is None
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_notify_config.py -q
```

Esperado: FALHA — `AttributeError: 'NotifyConfig' object has no attribute 'api_key_env'`.

- [ ] **Step 3: Implementar o mínimo**

Em `src/notify/__init__.py`, acrescentar o campo logo depois de `api_url`:

```python
@dataclass
class NotifyConfig:
    """Seção `notify` do pose_config.yaml. Chaves desconhecidas são ignoradas,
    seguindo o mesmo contrato de PipelineConfig.from_yaml."""

    camera_id: str = "CAM-01"
    api_url: Optional[str] = None
    api_key_env: Optional[str] = None   # nome da env var; o valor nunca fica aqui
    min_severity: int = 2
    merge_window_seconds: float = 15.0
    evict_after_frames: int = 45
    min_track_frames: int = 15
    queue_size: int = 256
    spill_path: str = "outputs/incidents.jsonl"
    stream_port: int = 8090
    stream_enabled: bool = True
    run_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
```

Nenhuma outra mudança: `from_yaml` já filtra por `{f.name for f in fields(cls)} - {"run_id"}`, então o campo novo é lido automaticamente quando presente na seção `notify:` do YAML.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_notify_config.py -q
```

Esperado: PASSA, 5 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/notify/__init__.py tests/test_notify_config.py
git commit -m "feat(notify): campo api_key_env em NotifyConfig"
```

---

## Task 2: `X-Cypher-Key` no transporte e no sink

**Files:**
- Modify: `src/notify/sink.py`
- Test: `tests/test_incident_sink.py`
- Test: `tests/test_incident_snapshot.py`

**Interfaces:**
- Consumes: nada de outra tarefa (independente de Task 1 — só é ligado a `NotifyConfig` na Task 3).
- Produces:
  - `MissingApiKeyError(Exception)` — atributo `.env_var: str`.
  - `resolve_api_key(env_var: Optional[str], env: Mapping[str, str]) -> Optional[str]`.
  - `Transport.post(url, payload, headers=None)` / `Transport.patch(url, payload, headers=None)` — protocolo estendido.
  - `RequestsTransport.post`/`.patch` repassam `headers` para `requests.post`/`.patch`.
  - `HttpIncidentSink(..., api_key_env: Optional[str] = None, env: Optional[Mapping[str, str]] = None)` — resolve a chave na construção e manda `{"X-Cypher-Key": chave}` em todo `POST`/`PATCH` (abertura, fechamento e o `PATCH` de snapshot).

Este é o núcleo do plano: os dois pontos de contato HTTP do sink (`_entregar` e `_anexar_snapshot`) e **todo** test double de `Transport` no repositório precisam mudar juntos, porque `HttpIncidentSink` passa a chamar `self.transport.post(..., headers=...)`/`.patch(..., headers=...)` sempre — mesmo quando `headers` é `None` — e qualquer double sem esse parâmetro quebra com `TypeError: post() got an unexpected keyword argument 'headers'`. Levantamento feito no repositório (`grep -rln "def post(self\|def patch(self" tests/ src/`): existem doubles em dois arquivos, `tests/test_incident_sink.py` (quatro classes) e `tests/test_incident_snapshot.py` (uma classe, `TransporteFake`, usada em quatro testes de anexo de snapshot) — os dois entram nesta tarefa.

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/test_incident_sink.py`, adicionar `from typing import Optional` aos imports do topo (junto de `json`, `threading`, `datetime`) e importar o erro novo:

```python
from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

import pytest

from src.notify.incident import ClosedReason, IncidentReport
from src.notify.sink import HttpIncidentSink, MissingApiKeyError
```

Atualizar `TransporteFake` para registrar `headers` e aceitar o parâmetro nas duas chamadas:

```python
class TransporteFake:
    """Registra chamadas (inclusive os headers recebidos) e falha sob demanda."""

    def __init__(self, falhas_ate: int = 0) -> None:
        self.posts: list[tuple[str, dict, Optional[dict]]] = []
        self.patches: list[tuple[str, dict, Optional[dict]]] = []
        self.falhas_ate = falhas_ate
        self.tentativas = 0
        self.entregou = threading.Event()

    def post(self, url: str, payload: dict, headers: Optional[dict] = None) -> None:
        self.tentativas += 1
        if self.tentativas <= self.falhas_ate:
            raise ConnectionError("API indisponivel")
        self.posts.append((url, payload, headers))
        self.entregou.set()

    def patch(self, url: str, payload: dict, headers: Optional[dict] = None) -> None:
        self.patches.append((url, payload, headers))
        self.entregou.set()
```

Ajustar as duas asserções existentes que desempacotam 2-tupla, para acompanhar o `headers` novo — em `test_envia_abertura_para_o_endpoint_de_incidentes`:

```python
    url, payload, headers = transporte.posts[0]
    assert url == "http://api/api/v1/incidents"
    assert payload["incidentKey"] == "k1"
    assert payload["severity"] == 4
    # Sem api_key_env configurado: nenhum header, byte a byte o comportamento
    # de antes desta mudanca.
    assert headers is None
```

E em `test_envia_fechamento_para_o_endpoint_da_chave`:

```python
    url, payload, headers = transporte.patches[0]
    assert url == "http://api/api/v1/incidents/k1"
    assert payload["durationSeconds"] == 6.0
    assert headers is None
```

(`test_drena_o_spill_na_subida` e `test_parada_entrega_o_que_ainda_esta_na_fila` acessam `transporte.posts[...][1]`/`p[1]` por índice — continuam corretos com a 3-tupla, não precisam mudar.)

As outras três classes de transporte ad-hoc no arquivo (`TransporteLento` em `test_nao_bloqueia_quem_chama`, `TransporteTravado` em `test_fila_cheia_descarta_o_menos_severo_e_nunca_a_queda`, `TransporteQueTrava` em `test_parada_grava_em_disco_o_que_nao_deu_tempo_de_entregar`) precisam aceitar `headers=None` nas assinaturas de `post`/`patch`, senão `HttpIncidentSink` passa a chamá-las com um argumento nomeado que elas não conhecem:

```python
    class TransporteLento:
        def post(self, url, payload, headers=None):
            threading.Event().wait(0.5)

        def patch(self, url, payload, headers=None):
            pass
```

```python
    class TransporteTravado:
        def __init__(self):
            self.liberar = threading.Event()
            self.recebidos = []

        def post(self, url, payload, headers=None):
            self.liberar.wait(timeout=5)
            self.recebidos.append(payload)

        def patch(self, url, payload, headers=None):
            pass
```

```python
    class TransporteQueTrava:
        def post(self, url, payload, headers=None):
            liberado.wait(timeout=5)
            raise ConnectionError("API indisponivel")

        def patch(self, url, payload, headers=None):
            pass
```

Em `tests/test_incident_snapshot.py` (arquivo separado, testes de anexo tardio de snapshot — usa sua própria `TransporteFake`, mais simples, que também constrói `HttpIncidentSink`), a mesma mudança mínima: aceitar `headers=None` sem gravá-lo, já que nenhum teste deste arquivo configura `api_key_env` e as asserções existentes desempacotam 2-tupla (`url, payload = transporte.patches[0]`, que continua válida porque a tupla armazenada não muda de forma aqui):

```python
class TransporteFake:
    def __init__(self) -> None:
        self.posts: list[tuple[str, dict]] = []
        self.patches: list[tuple[str, dict]] = []
        self.patch_chegou = threading.Event()

    def post(self, url, payload, headers=None):
        self.posts.append((url, payload))

    def patch(self, url, payload, headers=None):
        self.patches.append((url, payload))
        self.patch_chegou.set()
```

Por fim, acrescentar os testes novos, ao final de `tests/test_incident_sink.py`:

```python
def test_com_api_key_env_manda_x_cypher_key_no_post_e_no_patch():
    transporte = TransporteFake()
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte,
                            api_key_env="CYPHER_KEY_CAM01",
                            env={"CYPHER_KEY_CAM01": "chave-secreta"})
    sink.start()
    try:
        sink.open(relatorio("k1"))
        assert transporte.entregou.wait(timeout=2)
        transporte.entregou.clear()

        rel = relatorio("k1")
        rel.ended_at = T0 + timedelta(seconds=6)
        rel.duration_seconds = 6.0
        rel.closed_reason = ClosedReason.STATE_EXIT
        sink.close(rel)
        assert transporte.entregou.wait(timeout=2)
    finally:
        sink.stop()

    assert transporte.posts[0][2] == {"X-Cypher-Key": "chave-secreta"}
    assert transporte.patches[0][2] == {"X-Cypher-Key": "chave-secreta"}


def test_o_patch_de_snapshot_tambem_leva_o_header():
    class UploaderFake:
        def upload(self, frame, public_id):
            return f"https://cdn/{public_id}.jpg"

    transporte = TransporteFake()
    rel = relatorio("k1")
    rel.snapshot_frame = object()
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte,
                            uploader=UploaderFake(),
                            api_key_env="CYPHER_KEY_CAM01",
                            env={"CYPHER_KEY_CAM01": "chave-secreta"})
    sink.start()
    try:
        sink.open(rel)
        for _ in range(100):
            if len(transporte.patches) >= 1:
                break
            threading.Event().wait(0.02)
    finally:
        sink.stop()

    assert transporte.patches[0][2] == {"X-Cypher-Key": "chave-secreta"}


def test_api_key_env_configurada_mas_ausente_do_ambiente_falha_alto():
    with pytest.raises(MissingApiKeyError) as erro:
        HttpIncidentSink("http://api/api/v1", api_key_env="CYPHER_KEY_CAM01", env={})

    assert erro.value.env_var == "CYPHER_KEY_CAM01"
    assert "CYPHER_KEY_CAM01" in str(erro.value)


def test_api_key_env_com_valor_vazio_conta_como_ausente():
    # Uma chave vazia mandaria um header sintaticamente presente mas inutil —
    # o backend rejeitaria com um 401 obscuro em vez do erro claro daqui.
    with pytest.raises(MissingApiKeyError):
        HttpIncidentSink("http://api/api/v1", api_key_env="CYPHER_KEY_CAM01",
                         env={"CYPHER_KEY_CAM01": ""})


def test_api_key_env_none_nao_consulta_o_ambiente_e_nao_falha():
    # env={} sozinho provaria pouco (a variavel poderia nao existir por
    # acidente); o que este teste protege e que api_key_env=None nem chega a
    # olhar o ambiente — a construcao tem que suceder mesmo com env vazio,
    # porque "desligado" e um estado valido, nao um erro de configuracao.
    transporte = TransporteFake()
    sink = HttpIncidentSink("http://api/api/v1", transport=transporte, env={})
    sink.start()
    try:
        sink.open(relatorio("k1"))
        assert transporte.entregou.wait(timeout=2)
    finally:
        sink.stop()

    assert transporte.posts[0][2] is None
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_sink.py tests/test_incident_snapshot.py -q
```

Esperado: FALHA — `ImportError: cannot import name 'MissingApiKeyError' from 'src.notify.sink'` em `test_incident_sink.py` (e, depois de corrigir o import isoladamente para depurar cada arquivo, `TypeError: post() got an unexpected keyword argument 'headers'` nos doubles ainda não tocados, em ambos os arquivos).

- [ ] **Step 3: Implementar o mínimo**

Em `src/notify/sink.py`, ajustar os imports do topo — acrescentar `os` e `Mapping`:

```python
from __future__ import annotations

import json
import logging
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional, Protocol

from .incident import IncidentReport
```

Estender `Transport` e `RequestsTransport`:

```python
class Transport(Protocol):
    def post(self, url: str, payload: dict, headers: Optional[dict] = None) -> None: ...
    def patch(self, url: str, payload: dict, headers: Optional[dict] = None) -> None: ...


class RequestsTransport:
    """Transporte real. Importa requests preguiçosamente para manter os
    testes livres da dependência."""

    def __init__(self, timeout: float = 5.0) -> None:
        self.timeout = timeout

    def post(self, url: str, payload: dict, headers: Optional[dict] = None) -> None:
        import requests
        resposta = requests.post(url, json=payload, headers=headers, timeout=self.timeout)
        resposta.raise_for_status()

    def patch(self, url: str, payload: dict, headers: Optional[dict] = None) -> None:
        import requests
        resposta = requests.patch(url, json=payload, headers=headers, timeout=self.timeout)
        resposta.raise_for_status()
```

Acrescentar `MissingApiKeyError` e `resolve_api_key` logo antes da classe `HttpIncidentSink` (depois de `_Item`):

```python
class MissingApiKeyError(Exception):
    """A variável de ambiente referenciada por ``api_key_env`` não existe (ou
    está vazia) no ambiente informado."""

    def __init__(self, env_var: str) -> None:
        self.env_var = env_var
        super().__init__(
            "Variavel de ambiente ausente para a chave de API do pipeline: "
            f"{env_var}. Defina-a no .env do host (ou exporte antes de subir "
            "o pipeline)."
        )


def resolve_api_key(env_var: Optional[str], env: Mapping[str, str]) -> Optional[str]:
    """Resolve o valor de ``env_var`` no ambiente informado.

    Mesmo contrato de ``expand_placeholders`` (`src/capture/config_client.py`):
    o segredo nunca vem do YAML, só do ambiente do host, e a ausência (ou
    valor vazio) falha alto nomeando a variável — em vez de mandar a chave
    como string vazia, ou pior, deixar de mandar o header sem avisar.
    """
    if not env_var:
        return None
    valor = env.get(env_var)
    if not valor:
        raise MissingApiKeyError(env_var)
    return valor
```

Estender a assinatura de `HttpIncidentSink.__init__` e resolver a chave uma vez:

```python
    def __init__(self, api_url: str,
                 queue_size: int = 256,
                 spill_path: str = "outputs/incidents.jsonl",
                 max_attempts: int = 5,
                 backoff_base: float = 0.5,
                 transport: Optional[Transport] = None,
                 uploader: Optional[Uploader] = None,
                 api_key_env: Optional[str] = None,
                 env: Optional[Mapping[str, str]] = None) -> None:
        self.api_url = api_url.rstrip("/")
        self.queue_size = queue_size
        self.spill_path = Path(spill_path)
        self.max_attempts = max_attempts
        self.backoff_base = backoff_base
        self.transport = transport or RequestsTransport()
        self.uploader = uploader

        # Resolvida uma vez, no boot: a chave nao muda no meio de uma
        # execucao, e falhar aqui (em vez de dentro da thread de envio, no
        # primeiro POST) e o que impede o pipeline de subir "quase"
        # configurado e so descobrir o erro quando o primeiro incidente
        # tenta sair.
        chave = resolve_api_key(api_key_env, env if env is not None else os.environ)
        self._headers: Optional[dict[str, str]] = (
            {"X-Cypher-Key": chave} if chave is not None else None)

        self._items: list[_Item] = []
        self._lock = threading.Lock()
        self._nao_vazia = threading.Condition(self._lock)
        self._parar = threading.Event()
        self._worker: Optional[threading.Thread] = None
        self._dropped = 0
        self._em_voo = 0        # itens fora da fila, dentro do transporte
```

Passar `headers=self._headers` nas duas chamadas de `_entregar`:

```python
    def _entregar(self, item: _Item) -> None:
        while item.attempts < self.max_attempts and not self._parar.is_set():
            item.attempts += 1
            try:
                if item.kind == "open":
                    self.transport.post(f"{self.api_url}/incidents", item.payload,
                                        headers=self._headers)
                    self._anexar_snapshot(item)
                else:
                    self.transport.patch(
                        f"{self.api_url}/incidents/{item.incident_key}", item.payload,
                        headers=self._headers)
                return
            except Exception as falha:
                if item.attempts >= self.max_attempts:
                    log.warning("Incidente %s nao entregue apos %d tentativas: %s",
                                item.incident_key, item.attempts, falha)
                    self._gravar_spill(item)
                    return
                time.sleep(self.backoff_base * (2 ** (item.attempts - 1)))

        self._gravar_spill(item)
```

E em `_anexar_snapshot`:

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
                f"{self.api_url}/incidents/{item.incident_key}", {"snapshotUrl": url},
                headers=self._headers)
        except Exception as falha:
            log.warning("Snapshot de %s nao anexado: %s", item.incident_key, falha)
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_sink.py tests/test_incident_snapshot.py -q
```

Esperado: PASSA — 14 testes em `test_incident_sink.py`, 5 (inalterados) em `test_incident_snapshot.py`.

- [ ] **Step 5: Rodar a suíte de notify inteira, para garantir que nada mais quebrou**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_incident_sink.py tests/test_incident_snapshot.py tests/test_notify_config.py -q
```

Esperado: PASSA, 24 testes.

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/notify/sink.py tests/test_incident_sink.py tests/test_incident_snapshot.py
git commit -m "feat(notify): HttpIncidentSink manda X-Cypher-Key quando api_key_env configurado"
```

---

## Task 3: Ligação no pipeline e YAML de exemplo

**Files:**
- Modify: `src/notify/__init__.py`
- Modify: `src/run_pipeline.py`
- Modify: `config/pose_config.yaml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `NotifyConfig.api_key_env` (Task 1); `HttpIncidentSink(..., api_key_env=..., env=...)`, `MissingApiKeyError` (Task 2).
- Produces: pipeline funcional ponta a ponta com a chave configurável só por ambiente.

Nenhum teste novo nesta tarefa — é fiação entre peças já testadas nas Tasks 1 e 2. A verificação é a suíte completa (Task 4) mais uma checagem manual do `import` e do comportamento no processo real.

- [ ] **Step 1: Reexportar `MissingApiKeyError`**

Em `src/notify/__init__.py`, ajustar o import de `.sink` e o `__all__`:

```python
from .sink import ConsoleIncidentSink, HttpIncidentSink, MissingApiKeyError
```

```python
__all__ = [
    "ClosedReason",
    "ConsoleIncidentSink",
    "HttpIncidentSink",
    "IncidentReport",
    "IncidentTracker",
    "MissingApiKeyError",
    "MjpegServer",
    "NotifyConfig",
    "POSTURE_TO_TYPE",
    "TrackerConfig",
    "build_incident_key",
]
```

- [ ] **Step 2: Confirmar o import**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -c "from src.notify import MissingApiKeyError; print(MissingApiKeyError)"
```

Esperado: imprime a classe, sem erro.

- [ ] **Step 3: Ligar `api_key_env` na construção do sink em `run_pipeline.py`**

Ajustar o import de `src.notify` no topo do arquivo:

```python
from src.notify import (
    ConsoleIncidentSink, HttpIncidentSink, IncidentTracker,
    MissingApiKeyError, MjpegServer, NotifyConfig, TrackerConfig,
)
```

E o bloco de construção do sink (dentro de `if notify_config.enabled:`), envolvendo a construção em `try`/`except` — mesmo padrão de `resolver_config_remota`, que já converte um erro de configuração em `SystemExit` com prefixo `[algo]`:

```python
    if notify_config.enabled:
        uploader = None
        if os.getenv("CLOUDINARY_CLOUD_NAME"):
            from src.notify.sink import CloudinaryUploader
            uploader = CloudinaryUploader()
            print("[notify] snapshots serao enviados ao Cloudinary")
        try:
            sink = HttpIncidentSink(
                notify_config.api_url,
                queue_size=notify_config.queue_size,
                spill_path=notify_config.spill_path,
                uploader=uploader,
                api_key_env=notify_config.api_key_env,
            )
        except MissingApiKeyError as erro:
            raise SystemExit(f"[notify] {erro}")
        print(f"[notify] enviando incidentes para {notify_config.api_url} "
              f"como {notify_config.camera_id} (run {notify_config.run_id})")
        if notify_config.api_key_env:
            print(f"[notify] X-Cypher-Key resolvido via {notify_config.api_key_env}")
    else:
        sink = ConsoleIncidentSink()
        print("[notify] sem api_url: incidentes apenas impressos")
```

(`env` não é passado explicitamente — `HttpIncidentSink` usa `os.environ` por default, que é o comportamento certo em produção; só os testes da Task 2 injetam um `env` fake.)

- [ ] **Step 4: Exemplo comentado em `config/pose_config.yaml`**

Na seção `notify:`, logo abaixo do comentário existente sobre `api_url`:

```yaml
notify:
  camera_id: CAM-01
  # Sem api_url, o pipeline apenas imprime os incidentes (comportamento antigo).
  # api_url: http://localhost:8080/api/v1
  # Nome da variavel de ambiente com a chave desta camera (nunca a chave em
  # texto puro aqui — o valor vem do .env do host, gitignorado).
  # api_key_env: CYPHER_KEY_CAM01
  min_severity: 2
  merge_window_seconds: 15            # calibrado em cenario2.mp4 (spec §4.1.2)
  evict_after_frames: 45              # track sumido por N frames = fecha como TRACK_LOST
  min_track_frames: 15                # tracks mais curtos nao abrem incidente
  queue_size: 256
  spill_path: outputs/incidents.jsonl
  stream_port: 8090
  stream_enabled: true
```

- [ ] **Step 5: Documentar a variável em `.env.example`**

O arquivo hoje só lista `CLOUDINARY_*` e `API_ENDPOINT` (nenhum exemplo de credencial de câmera também — `.env.example` já estava um passo atrás do padrão que `config_client.py` introduziu em E2; não é escopo deste plano corrigir isso retroativamente, só não piorar). Acrescentar, ao final:

```
# Chave de API do pipeline, por camera — enviada como header X-Cypher-Key
# em cada incidente. Ver notify.api_key_env em config/pose_config.yaml.
CYPHER_KEY_CAM01=
```

- [ ] **Step 6: Confirmar que a suíte inteira continua verde**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/ -q
```

Esperado: PASSA — todos os testes de E1/E1-B/E2-B mais os desta tarefa, zero falhas.

- [ ] **Step 7: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/notify/__init__.py src/run_pipeline.py config/pose_config.yaml .env.example
git commit -m "feat(pipeline): liga api_key_env do notify ao HttpIncidentSink"
```

---

## Task 4: Verificação de ponta a ponta

**Files:** nenhuma alteração de código. Esta tarefa é verificação.

**Interfaces:**
- Consumes: Tasks 1–3 concluídas.
- Produces: confirmação manual de que os três comportamentos do §5/§7 da spec seguram: sem `api_key_env` nada muda; com `api_key_env` configurado e resolvido a chave viaja; com `api_key_env` configurado e a variável ausente o processo aborta cedo e com mensagem clara.

- [ ] **Step 1: Suíte completa, do zero**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/ -q
```

Esperado: PASSA, sem falhas. Contar o total impresso e conferir que cresceu em relação ao estado antes deste plano (Task 1 acrescenta 1 teste novo a `test_notify_config.py` — mais duas asserções em testes já existentes; Task 2 acrescenta 5 testes novos a `test_incident_sink.py` — mais duas asserções em testes já existentes. Total: 6 funções de teste novas).

- [ ] **Step 2: Comportamento antigo, sem `api_key_env` — nada muda**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python src/run_pipeline.py --source data/validation/cenario2.mp4 \
  --device cuda --no-display --no-stream --max-frames 60 \
  --camera-id CAM-TESTE --api-url http://localhost:9/api/v1
```

(`--api-url` aponta para uma porta que não responde de propósito — o objetivo aqui não é entregar o incidente, é confirmar que o processo sobe normalmente e a linha `[notify] X-Cypher-Key resolvido via ...` **não aparece**, porque `api_key_env` não foi configurado no `pose_config.yaml` nem passado.)

Esperado: `[notify] enviando incidentes para http://localhost:9/api/v1 como CAM-TESTE (...)` aparece; a linha de `X-Cypher-Key` não aparece; o pipeline roda os 60 frames e termina normalmente (a entrega falhar e cair no spill é esperado e não é o que este passo verifica).

- [ ] **Step 3: `api_key_env` configurado mas variável ausente — aborta cedo, com mensagem clara**

```bash
cd /home/asaas/projects/challenge/cypher-capture
unset CYPHER_KEY_CAM_TESTE
./venv/bin/python -c "
import yaml
c = yaml.safe_load(open('config/pose_config.yaml'))
c['notify']['api_key_env'] = 'CYPHER_KEY_CAM_TESTE'
yaml.safe_dump(c, open('/tmp/pose_config_e4_teste.yaml', 'w'))
"
./venv/bin/python src/run_pipeline.py --source data/validation/cenario2.mp4 \
  --config /tmp/pose_config_e4_teste.yaml \
  --device cuda --no-display --no-stream --max-frames 5 \
  --camera-id CAM-TESTE --api-url http://localhost:9/api/v1
```

Esperado: o processo aborta **antes** de abrir a fonte de vídeo (nenhum frame processado), com uma mensagem contendo `[notify]` e `CYPHER_KEY_CAM_TESTE` — não um stack trace.

- [ ] **Step 4: `api_key_env` configurado e resolvido — a chave é usada**

```bash
cd /home/asaas/projects/challenge/cypher-capture
export CYPHER_KEY_CAM_TESTE=chave-de-teste-e4
./venv/bin/python src/run_pipeline.py --source data/validation/cenario2.mp4 \
  --config /tmp/pose_config_e4_teste.yaml \
  --device cuda --no-display --no-stream --max-frames 60 \
  --camera-id CAM-TESTE --api-url http://localhost:9/api/v1
```

Esperado: a linha `[notify] X-Cypher-Key resolvido via CYPHER_KEY_CAM_TESTE` aparece logo depois de `[notify] enviando incidentes para ...`; o pipeline roda os 60 frames e termina normalmente. Limpar depois:

```bash
unset CYPHER_KEY_CAM_TESTE
rm -f /tmp/pose_config_e4_teste.yaml
```

- [ ] **Step 5: Registrar o resultado**

Anotar no corpo do PR (não em arquivo separado — este plano não introduz `docs/e4b-verificacao.md`, o escopo é pequeno o suficiente para caber na descrição do PR): os três passos acima, com o texto exato das mensagens observadas nos Steps 2–4. Se algo divergir do esperado, registrar a divergência ali antes de abrir o PR.

---

## Estado ao fim deste plano

O pipeline manda `X-Cypher-Key` em todo `POST`/`PATCH` de incidente quando `notify.api_key_env` aponta para uma variável de ambiente presente; sem essa configuração, o comportamento é idêntico ao de antes deste plano. Isso corresponde ao passo 2 de 4 da ordem de implementação da spec (§7): o backend (passo 1) já pode validar o header quando presente, sem exigi-lo, e o front (passo 3) segue em paralelo — nenhum dos dois é bloqueado por este plano nem bloqueia este plano. O passo 4 (backend passa a **exigir** o header) só deve acontecer depois que este plano e o de front estiverem implantados; não é escopo deste repositório decidir quando isso ocorre.

---

## Self-review

**1. Cobertura da spec (§5 do design doc):**
- "`NotifyConfig` ganha um campo (`api_key_env`, não `api_key`)" → Task 1.
- "mesmo padrão de `expand_placeholders` ... nunca a chave em texto puro no YAML" → Task 1 (comentário no campo) + Task 2 (`resolve_api_key`/`MissingApiKeyError` espelham o contrato) + Task 3 (YAML só com exemplo comentado).
- YAML de exemplo `notify.api_key_env: CYPHER_KEY_CAM01` → Task 3, Step 4, texto idêntico ao da spec.
- "`RequestsTransport.post`/`.patch` ... passam a mandar `headers={"X-Cypher-Key": resolved_key}` quando configurado" → Task 2.
- "Sem `api_key_env` configurado, nenhum header é enviado — mesmo comportamento de hoje" → Task 2 (`test_api_key_env_none_nao_consulta_o_ambiente_e_nao_falha`, e as asserções `headers is None` acrescentadas aos dois testes pré-existentes de `test_incident_sink.py`).
- Risco de sequenciamento do §5/§7 (capture manda o header sempre que configurado, antes de o backend exigir) → coberto pela própria natureza aditiva da mudança (Global Constraints) e explicitado na seção "Estado ao fim deste plano".
- Escopo explicitamente fora (nenhum `--api-key` na CLI) → respeitado; não há tarefa de CLI neste plano.

**2. Varredura de placeholder:** nenhum "TBD"/"implementar depois"/"tratamento de erro apropriado" no texto. Todo passo de código tem o trecho completo, não uma referência a "igual à Task N".

**3. Consistência de tipos e nomes:**
- `NotifyConfig.api_key_env: Optional[str]` (Task 1) é o mesmo nome usado em `HttpIncidentSink(..., api_key_env=...)` (Task 2) e em `notify_config.api_key_env` (Task 3).
- `MissingApiKeyError` é definido em `src/notify/sink.py` (Task 2), importado por `tests/test_incident_sink.py` direto de `src.notify.sink` (mesmo padrão de `HttpIncidentSink` nesse arquivo) e reexportado por `src/notify/__init__.py` (Task 3) para o uso em `src/run_pipeline.py`.
- `resolve_api_key(env_var, env)` tem a mesma forma de `expand_placeholders(texto, env)` em `src/capture/config_client.py` — variável nomeada, ambiente injetado, falha com uma exceção que carrega o nome que faltou.
- `Transport.post`/`.patch` ganham `headers: Optional[dict] = None` nas duas assinaturas (protocolo e implementação real). Levantamento explícito (`grep -rln "def post(self\|def patch(self" tests/ src/`) encontrou test doubles em **dois** arquivos, não só em `tests/test_incident_sink.py`: as quatro classes desse arquivo (`TransporteFake`, `TransporteLento`, `TransporteTravado`, `TransporteQueTrava`) e a `TransporteFake` própria de `tests/test_incident_snapshot.py` — as cinco foram atualizadas na Task 2 para não quebrar com o argumento novo. Sem esse levantamento, `test_incident_snapshot.py` teria começado a falhar só na Task 3 (suíte inteira), sem correção prevista no plano.
