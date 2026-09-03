# Orquestrador de pipelines (cypher-capture) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir um orquestrador no `cypher-capture` que reconcilia periodicamente o catálogo de câmeras do backend com processos de pipeline (`run_pipeline.py`) rodando localmente — sobe o que falta, derruba o que foi desativado, reinicia o que mudou de config ou morreu sozinho — eliminando a necessidade de subir cada câmera manualmente.

**Architecture:** Três componentes isolados e testáveis (`OrchestratorSession`, `ProcessRegistry`, `Reconciler`), cada um construído numa task própria com TDD, e uma task final de fiação (`__main__.py`, CLI real). `Reconciler` é a única peça de integração — as outras duas são puras o suficiente para não precisarem uma da outra.

**Tech Stack:** Python 3.10, `requests` (já usado no repo), stdlib (`subprocess`, `json`, `os`, `signal`, `pathlib`, `dataclasses`), `pytest` (padrão de testes já usado no repo).

**Spec:** `docs/superpowers/specs/planejadas/2026-09-03-orquestrador-pipelines-design.md`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-capture`. Branch atual: `main` — criar `feat/oqa-orquestrador` a partir de `main` via `git checkout -b`.
- **Orquestrador é sempre mono-tenant por instância** (spec §1.3) — uma instância gerencia as câmeras de um único tenant. Nunca implementar suporte a múltiplos tenants numa mesma sessão/instância.
- **Autenticação reaproveita `CYPHER_GESTOR_USER`/`CYPHER_GESTOR_PASSWORD`** do `.env` do host — as mesmas variáveis que `src/capture/apikey_provisioning.py` (`ApiKeyProvisioner`) já usa. Não introduzir um terceiro nome de variável para o mesmo conceito.
- **Backoff de reinício reaproveita a fórmula exata de `src/capture/resilient.py` (`ResilientCapture._loop_leitura`)**: a espera começa em `backoff_base` (a PRIMEIRA falha já espera esse tanto, não tenta de novo instantaneamente), dobra a cada falha consecutiva (`espera = min(espera * 2, backoff_max)`), e volta a `backoff_base` assim que a câmera roda com sucesso de novo. Os valores vêm de `CaptureConfig.backoff_base_seconds`/`backoff_max_seconds` (`src/capture/__init__.py`, já carregados de `pose_config.yaml`) — não introduzir uma configuração de backoff nova.
- **`GET /api/v1/cameras` (sem `incluirInativas`) já devolve só câmeras ativas do tenant da sessão** (`CatalogController.cameras`, default `incluirInativas=false`) — o orquestrador NÃO precisa filtrar por um campo `ativa` no cliente (o DTO `CameraResponse` nem expõe esse campo). Chamar o endpoint sem esse parâmetro já é "o desejado".
- **Resposta de `GET /api/v1/cameras` é uma lista JSON de objetos com `id`/`nome`/`estacaoId`/`streamUrl`** (camelCase, `CameraResponse` do backend) — `id` já é o código puro da câmera (ex.: `"CAM-01"`), pronto para usar como `--camera-id` de `run_pipeline.py`.
- **Sem dependência nova** além do que o repo já usa (`requests`, stdlib). Sem `docker`, sem `supervisord`, sem `multiprocessing`.
- Todo componente injetável (transporte HTTP, lançador de processo, verificador/matador de PID, relógio) — nenhum teste bate em rede real, sobe subprocess de verdade, ou mexe em PID real do SO. Segue o padrão de `tests/test_apikey_provisioning.py` (`TransporteFake` injetado, `tmp_path` para arquivos, docstring no topo do arquivo de teste explicando o que está sendo protegido).
- Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_*.py -v` para os testes desta entrega; `python -m pytest` para a suíte inteira.

---

### Task 1: `OrchestratorSession` — login e listagem de câmeras com sessão de longa duração

**Files:**
- Create: `src/orchestrator/__init__.py`
- Create: `src/orchestrator/session.py`
- Test: `tests/test_orchestrator_session.py`

**Interfaces:**
- Produces: `CameraDesejada` (dataclass: `camera_id: str`, `stream_url: str`); `OrchestratorSession(api_url: str, transport: SessionTransport)` com `.login(env: Mapping[str, str]) -> None` e `.listar_cameras() -> list[CameraDesejada]`; exceções `CredenciaisAusentesError`, `LoginFalhouError`, `SessaoExpiradaError`, `CatalogoInacessivelError` — todas em `src/orchestrator/session.py`.

- [ ] **Step 1: Escrever os testes de `OrchestratorSession`**

Criar `tests/test_orchestrator_session.py`:

```python
"""
Testes de OrchestratorSession (src/orchestrator/session.py).

O que está sendo protegido: a sessão do orquestrador precisa sobreviver ao
tempo de vida inteiro do processo (diferente do ApiKeyProvisioner, que loga
uma vez e descarta) — então precisa re-logar sozinha quando a sessão expira,
e nunca deixar uma falha de sessão virar uma exceção não tratada que derruba
o orquestrador inteiro (isso é responsabilidade do Reconciler, mas a Session
precisa entregar um único tipo de erro previsível: CatalogoInacessivelError).
Transporte sempre injetado — nenhum teste toca rede.
"""
from __future__ import annotations

import pytest

from src.orchestrator.session import (
    CatalogoInacessivelError,
    CredenciaisAusentesError,
    LoginFalhouError,
    OrchestratorSession,
    SessaoExpiradaError,
)


class TransporteFake:
    """Registra logins e listagens; permite simular falha de login, sessão
    expirada na N-ésima chamada de listar_cameras, e catálogo inacessível."""

    def __init__(self, cameras=None, falhar_login=False,
                 expirar_na_chamada=None, falhar_apos_relogin=False):
        self.cameras = cameras if cameras is not None else []
        self.falhar_login = falhar_login
        self.expirar_na_chamada = expirar_na_chamada
        self.falhar_apos_relogin = falhar_apos_relogin
        self.logins: list[tuple[str, str, str]] = []
        self.chamadas_listar = 0

    def login(self, api_url: str, username: str, password: str) -> None:
        self.logins.append((api_url, username, password))
        if self.falhar_login:
            raise LoginFalhouError("login falhou")

    def listar_cameras(self, api_url: str) -> list[dict]:
        self.chamadas_listar += 1
        if self.chamadas_listar == self.expirar_na_chamada:
            raise SessaoExpiradaError()
        if self.falhar_apos_relogin and self.chamadas_listar == 2:
            raise SessaoExpiradaError()
        return self.cameras


def test_login_sem_credenciais_no_ambiente_levanta_erro():
    sessao = OrchestratorSession("http://api/api/v1", TransporteFake())

    with pytest.raises(CredenciaisAusentesError):
        sessao.login({})


def test_login_chama_transporte_com_credenciais_do_ambiente():
    transporte = TransporteFake()
    sessao = OrchestratorSession("http://api/api/v1", transporte)

    sessao.login({"CYPHER_GESTOR_USER": "orquestrador@acme", "CYPHER_GESTOR_PASSWORD": "senha123"})

    assert transporte.logins == [("http://api/api/v1", "orquestrador@acme", "senha123")]


def test_login_repassa_falha_do_transporte():
    transporte = TransporteFake(falhar_login=True)
    sessao = OrchestratorSession("http://api/api/v1", transporte)

    with pytest.raises(LoginFalhouError):
        sessao.login({"CYPHER_GESTOR_USER": "orquestrador@acme", "CYPHER_GESTOR_PASSWORD": "senha123"})


def test_listar_cameras_parseia_a_resposta():
    transporte = TransporteFake(cameras=[
        {"id": "CAM-01", "nome": "Entrada", "estacaoId": "EST-01", "streamUrl": "http://host:9001/stream"},
    ])
    sessao = OrchestratorSession("http://api/api/v1", transporte)
    sessao.login({"CYPHER_GESTOR_USER": "orquestrador@acme", "CYPHER_GESTOR_PASSWORD": "senha123"})

    cameras = sessao.listar_cameras()

    assert cameras == [CameraDesejada(camera_id="CAM-01", stream_url="http://host:9001/stream")]


def test_listar_cameras_reloga_uma_vez_quando_a_sessao_expira():
    transporte = TransporteFake(
        cameras=[{"id": "CAM-01", "nome": "Entrada", "estacaoId": "EST-01", "streamUrl": "http://host:9001/stream"}],
        expirar_na_chamada=1,
    )
    sessao = OrchestratorSession("http://api/api/v1", transporte)
    sessao.login({"CYPHER_GESTOR_USER": "orquestrador@acme", "CYPHER_GESTOR_PASSWORD": "senha123"})

    cameras = sessao.listar_cameras()

    assert cameras == [CameraDesejada(camera_id="CAM-01", stream_url="http://host:9001/stream")]
    assert len(transporte.logins) == 2  # login inicial + relogin apos a sessao expirar


def test_listar_cameras_propaga_catalogo_inacessivel_quando_o_relogin_tambem_falha():
    transporte = TransporteFake(
        cameras=[{"id": "CAM-01", "nome": "Entrada", "estacaoId": "EST-01", "streamUrl": "http://host:9001/stream"}],
        expirar_na_chamada=1,
        falhar_apos_relogin=True,
    )
    sessao = OrchestratorSession("http://api/api/v1", transporte)
    sessao.login({"CYPHER_GESTOR_USER": "orquestrador@acme", "CYPHER_GESTOR_PASSWORD": "senha123"})

    with pytest.raises(CatalogoInacessivelError):
        sessao.listar_cameras()
```

Adicionar o import que falta no topo do arquivo de teste:

```python
from src.orchestrator.session import CameraDesejada
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_session.py -v`
Expected: FAIL — `src.orchestrator.session` não existe ainda (`ModuleNotFoundError`).

- [ ] **Step 3: Implementar `src/orchestrator/session.py`**

```python
"""
Sessão do orquestrador (design doc de orquestrador de pipelines, §2.1/§3).

Ao contrário de `ApiKeyProvisioner` (login uma vez, descarta), esta sessão
precisa sobreviver ao tempo de vida inteiro do orquestrador: faz polling
contínuo em `GET /cameras`, então precisa re-logar sozinha quando a sessão
expira. `listar_cameras()` absorve TODA falha de sessão/rede num único tipo
de exceção (`CatalogoInacessivelError`) — quem chama (o `Reconciler`) só
precisa tratar um caso: "não deu pra confirmar o catálogo agora".
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Optional, Protocol


class CredenciaisAusentesError(Exception):
    """CYPHER_GESTOR_USER/CYPHER_GESTOR_PASSWORD ausentes no ambiente do host."""

    def __init__(self) -> None:
        super().__init__(
            "CYPHER_GESTOR_USER e CYPHER_GESTOR_PASSWORD precisam estar "
            "definidos no ambiente (.env do host) para o orquestrador logar "
            "como a conta de servico GESTOR daquele tenant."
        )


class LoginFalhouError(Exception):
    """Login rejeitado pelo backend — credencial invalida."""


class SessaoExpiradaError(Exception):
    """GET /cameras devolveu 401 — a sessao do orquestrador expirou."""


class CatalogoInacessivelError(Exception):
    """Catalogo nao pode ser confirmado agora (rede, backend fora do ar, ou
    sessao expirou e o re-login tambem falhou). O Reconciler trata isso como
    'nao mexe em nada neste ciclo'."""


@dataclass(frozen=True)
class CameraDesejada:
    camera_id: str
    stream_url: str


class SessionTransport(Protocol):
    def login(self, api_url: str, username: str, password: str) -> None: ...
    def listar_cameras(self, api_url: str) -> list[dict]: ...


class RequestsSessionTransport:
    """Transporte real. Uma unica `requests.Session` mantem o cookie de
    sessao entre chamadas — mesmo padrao de `RequestsProvisioningTransport`
    em `apikey_provisioning.py`."""

    def __init__(self, timeout: float = 5.0) -> None:
        self.timeout = timeout
        self._session = None

    def login(self, api_url: str, username: str, password: str) -> None:
        import requests
        self._session = requests.Session()
        resposta = self._session.post(
            f"{api_url}/auth/login", json={"username": username, "password": password},
            timeout=self.timeout)
        if resposta.status_code != 200:
            raise LoginFalhouError(
                f"Login do orquestrador falhou ({resposta.status_code}) — "
                "confira CYPHER_GESTOR_USER/CYPHER_GESTOR_PASSWORD.")

    def listar_cameras(self, api_url: str) -> list[dict]:
        if self._session is None:
            raise CatalogoInacessivelError("listar_cameras chamado antes de login().")
        try:
            resposta = self._session.get(f"{api_url}/cameras", timeout=self.timeout)
        except Exception as erro:  # rede fora do ar, timeout, etc.
            raise CatalogoInacessivelError(f"GET /cameras falhou: {erro}") from erro
        if resposta.status_code == 401:
            raise SessaoExpiradaError()
        if resposta.status_code != 200:
            raise CatalogoInacessivelError(f"GET /cameras devolveu {resposta.status_code}")
        return resposta.json()


class OrchestratorSession:
    def __init__(self, api_url: str, transport: SessionTransport) -> None:
        self.api_url = api_url.rstrip("/")
        self.transport = transport
        self._username: Optional[str] = None
        self._password: Optional[str] = None

    def login(self, env: Mapping[str, str]) -> None:
        username = env.get("CYPHER_GESTOR_USER")
        password = env.get("CYPHER_GESTOR_PASSWORD")
        if not username or not password:
            raise CredenciaisAusentesError()
        self.transport.login(self.api_url, username, password)
        self._username, self._password = username, password

    def listar_cameras(self) -> list[CameraDesejada]:
        try:
            dados = self.transport.listar_cameras(self.api_url)
        except SessaoExpiradaError:
            try:
                self.transport.login(self.api_url, self._username, self._password)
                dados = self.transport.listar_cameras(self.api_url)
            except (SessaoExpiradaError, LoginFalhouError, CatalogoInacessivelError) as segunda_falha:
                raise CatalogoInacessivelError(
                    f"sessao expirou e o re-login falhou: {segunda_falha}") from segunda_falha
        return [CameraDesejada(camera_id=d["id"], stream_url=d["streamUrl"]) for d in dados]
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_session.py -v`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator/__init__.py src/orchestrator/session.py tests/test_orchestrator_session.py
git commit -m "feat(orchestrator): sessao de longa duracao com re-login automatico"
```

---

### Task 2: `ProcessRegistry` — iniciar/encerrar processos, sem persistência ainda

**Files:**
- Create: `src/orchestrator/registry.py`
- Test: `tests/test_orchestrator_registry.py`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: `ProcessoLike` (Protocol: `.pid: int`, `.poll() -> Optional[int]`, `.terminate() -> None`, `.kill() -> None`); `ProcessLauncher` (Protocol: `.iniciar(camera_id: str, api_url: str) -> ProcessoLike`); `ProcessRegistry(launcher: ProcessLauncher)` com `.iniciar(camera_id, stream_url, api_url) -> None`, `.encerrar(camera_id) -> None`, `.esta_vivo(camera_id) -> bool`, `.stream_url_atual(camera_id) -> Optional[str]`, `.camera_ids_rastreados() -> list[str]` — consumido pela Task 3 (persistência) e pela Task 4 (`Reconciler`).

- [ ] **Step 1: Escrever os testes de `ProcessRegistry`**

Criar `tests/test_orchestrator_registry.py`:

```python
"""
Testes de ProcessRegistry (src/orchestrator/registry.py).

O que está sendo protegido: o registro precisa saber corretamente quais
câmeras têm processo vivo, com qual streamUrl cada uma foi iniciada (para o
Reconciler detectar mudança de config), e nunca deixar um processo "morto"
(poll() != None) passar por vivo. Lançador sempre injetado — nenhum teste
sobe um processo real do SO.
"""
from __future__ import annotations

from src.orchestrator.registry import ProcessRegistry


class ProcessoFake:
    def __init__(self, pid: int):
        self.pid = pid
        self.codigo_saida = None
        self.terminado = False

    def poll(self):
        return self.codigo_saida

    def terminate(self):
        self.terminado = True

    def kill(self):
        self.terminado = True


class LauncherFake:
    def __init__(self):
        self.iniciados: list[tuple[str, str]] = []
        self._proximo_pid = 1000
        self.processos: dict[str, ProcessoFake] = {}

    def iniciar(self, camera_id: str, api_url: str) -> ProcessoFake:
        self.iniciados.append((camera_id, api_url))
        processo = ProcessoFake(pid=self._proximo_pid)
        self._proximo_pid += 1
        self.processos[camera_id] = processo
        return processo


def test_iniciar_registra_o_processo_e_marca_vivo():
    launcher = LauncherFake()
    registry = ProcessRegistry(launcher)

    registry.iniciar("CAM-01", "http://host:9001/stream", "http://api/api/v1")

    assert registry.esta_vivo("CAM-01") is True
    assert launcher.iniciados == [("CAM-01", "http://api/api/v1")]
    assert registry.stream_url_atual("CAM-01") == "http://host:9001/stream"


def test_esta_vivo_retorna_falso_para_camera_desconhecida():
    registry = ProcessRegistry(LauncherFake())

    assert registry.esta_vivo("CAM-99") is False


def test_esta_vivo_retorna_falso_quando_o_processo_terminou():
    launcher = LauncherFake()
    registry = ProcessRegistry(launcher)
    registry.iniciar("CAM-01", "http://host:9001/stream", "http://api/api/v1")

    launcher.processos["CAM-01"].codigo_saida = 1

    assert registry.esta_vivo("CAM-01") is False


def test_encerrar_chama_terminate_e_remove_do_registro():
    launcher = LauncherFake()
    registry = ProcessRegistry(launcher)
    registry.iniciar("CAM-01", "http://host:9001/stream", "http://api/api/v1")

    registry.encerrar("CAM-01")

    assert launcher.processos["CAM-01"].terminado is True
    assert registry.esta_vivo("CAM-01") is False
    assert "CAM-01" not in registry.camera_ids_rastreados()


def test_encerrar_camera_desconhecida_nao_faz_nada():
    registry = ProcessRegistry(LauncherFake())

    registry.encerrar("CAM-99")  # nao deve levantar excecao


def test_camera_ids_rastreados_reflete_o_que_esta_registrado():
    launcher = LauncherFake()
    registry = ProcessRegistry(launcher)
    registry.iniciar("CAM-01", "url-1", "http://api/api/v1")
    registry.iniciar("CAM-02", "url-2", "http://api/api/v1")

    assert sorted(registry.camera_ids_rastreados()) == ["CAM-01", "CAM-02"]
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_registry.py -v`
Expected: FAIL — `src.orchestrator.registry` não existe ainda.

- [ ] **Step 3: Implementar `src/orchestrator/registry.py`**

```python
"""
Registro de processos gerenciados pelo orquestrador (design doc, §2.2).

Sabe o estado real (quais câmeras têm processo vivo, com qual streamUrl
cada uma foi iniciada) — a decisão de QUANDO iniciar/encerrar é do
Reconciler, não daqui.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol


class ProcessoLike(Protocol):
    pid: int

    def poll(self) -> Optional[int]: ...
    def terminate(self) -> None: ...
    def kill(self) -> None: ...


class ProcessLauncher(Protocol):
    def iniciar(self, camera_id: str, api_url: str) -> ProcessoLike: ...


@dataclass
class _Entrada:
    stream_url: str
    processo: ProcessoLike


class ProcessRegistry:
    def __init__(self, launcher: ProcessLauncher) -> None:
        self.launcher = launcher
        self._entradas: dict[str, _Entrada] = {}

    def iniciar(self, camera_id: str, stream_url: str, api_url: str) -> None:
        processo = self.launcher.iniciar(camera_id, api_url)
        self._entradas[camera_id] = _Entrada(stream_url=stream_url, processo=processo)

    def encerrar(self, camera_id: str) -> None:
        entrada = self._entradas.pop(camera_id, None)
        if entrada is None:
            return
        entrada.processo.terminate()

    def esta_vivo(self, camera_id: str) -> bool:
        entrada = self._entradas.get(camera_id)
        return entrada is not None and entrada.processo.poll() is None

    def stream_url_atual(self, camera_id: str) -> Optional[str]:
        entrada = self._entradas.get(camera_id)
        return entrada.stream_url if entrada else None

    def camera_ids_rastreados(self) -> list[str]:
        return list(self._entradas.keys())
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_registry.py -v`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator/registry.py tests/test_orchestrator_registry.py
git commit -m "feat(orchestrator): registro de processos (iniciar/encerrar/esta_vivo)"
```

---

### Task 3: Persistência de estado + limpeza de órfãos no boot

**Files:**
- Modify: `src/orchestrator/registry.py`
- Test: `tests/test_orchestrator_registry.py`

**Interfaces:**
- Consumes: `ProcessRegistry` da Task 2 (estende, não substitui, as assinaturas já existentes).
- Produces: `ProcessRegistry(launcher, state_path: str = "outputs/orchestrator-state.json", esta_pid_vivo: Callable[[int], bool] = ..., matar_pid: Callable[[int], None] = ...)`; `.limpar_orfaos_do_boot_anterior() -> None` — consumido pela Task 5 (`__main__.py`, chamado uma vez no boot antes do loop).

- [ ] **Step 1: Escrever os testes de persistência e limpeza de órfãos**

Adicionar a `tests/test_orchestrator_registry.py` (mesmo arquivo da Task 2 — é a mesma classe, ganhando um comportamento novo). Acrescentar `import json` no topo do arquivo, junto aos imports já existentes da Task 2 (não duplicar o `from src.orchestrator.registry import ProcessRegistry`, que já está lá):

```python
def test_iniciar_grava_o_pid_no_arquivo_de_estado(tmp_path):
    state_path = tmp_path / "orchestrator-state.json"
    launcher = LauncherFake()
    registry = ProcessRegistry(launcher, state_path=str(state_path))

    registry.iniciar("CAM-01", "url-1", "http://api/api/v1")

    estado = json.loads(state_path.read_text())
    assert estado == {"CAM-01": launcher.processos["CAM-01"].pid}


def test_encerrar_remove_a_camera_do_arquivo_de_estado(tmp_path):
    state_path = tmp_path / "orchestrator-state.json"
    launcher = LauncherFake()
    registry = ProcessRegistry(launcher, state_path=str(state_path))
    registry.iniciar("CAM-01", "url-1", "http://api/api/v1")

    registry.encerrar("CAM-01")

    estado = json.loads(state_path.read_text())
    assert estado == {}


def test_limpar_orfaos_mata_pid_vivo_registrado_no_boot_anterior(tmp_path):
    state_path = tmp_path / "orchestrator-state.json"
    state_path.write_text(json.dumps({"CAM-01": 999}))
    pids_mortos = []
    registry = ProcessRegistry(
        LauncherFake(), state_path=str(state_path),
        esta_pid_vivo=lambda pid: pid == 999,
        matar_pid=lambda pid: pids_mortos.append(pid),
    )

    registry.limpar_orfaos_do_boot_anterior()

    assert pids_mortos == [999]
    assert json.loads(state_path.read_text()) == {}


def test_limpar_orfaos_ignora_pid_ja_morto(tmp_path):
    state_path = tmp_path / "orchestrator-state.json"
    state_path.write_text(json.dumps({"CAM-01": 999}))
    pids_mortos = []
    registry = ProcessRegistry(
        LauncherFake(), state_path=str(state_path),
        esta_pid_vivo=lambda pid: False,
        matar_pid=lambda pid: pids_mortos.append(pid),
    )

    registry.limpar_orfaos_do_boot_anterior()

    assert pids_mortos == []


def test_limpar_orfaos_sem_arquivo_de_estado_nao_faz_nada(tmp_path):
    state_path = tmp_path / "orchestrator-state.json"
    registry = ProcessRegistry(LauncherFake(), state_path=str(state_path))

    registry.limpar_orfaos_do_boot_anterior()  # nao deve levantar excecao
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_registry.py -v`
Expected: FAIL — `ProcessRegistry.__init__` ainda não aceita `state_path`/`esta_pid_vivo`/`matar_pid`, e `limpar_orfaos_do_boot_anterior` não existe.

- [ ] **Step 3: Estender `src/orchestrator/registry.py`**

Substituir o conteúdo do arquivo por:

```python
"""
Registro de processos gerenciados pelo orquestrador (design doc, §2.2/§2.4).

Sabe o estado real (quais câmeras têm processo vivo, com qual streamUrl
cada uma foi iniciada) e persiste o mínimo necessário (PID por câmera) para
sobreviver a um restart do próprio orquestrador sem duplicar processo —
ver `limpar_orfaos_do_boot_anterior`.
"""
from __future__ import annotations

import json
import os
import signal
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional, Protocol


class ProcessoLike(Protocol):
    pid: int

    def poll(self) -> Optional[int]: ...
    def terminate(self) -> None: ...
    def kill(self) -> None: ...


class ProcessLauncher(Protocol):
    def iniciar(self, camera_id: str, api_url: str) -> ProcessoLike: ...


@dataclass
class _Entrada:
    stream_url: str
    processo: ProcessoLike


def _pid_esta_vivo_real(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # existe, mas de outro usuario -- trata como vivo
    return True


def _matar_pid_real(pid: int) -> None:
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


class ProcessRegistry:
    def __init__(self, launcher: ProcessLauncher,
                 state_path: str = "outputs/orchestrator-state.json",
                 esta_pid_vivo: Callable[[int], bool] = _pid_esta_vivo_real,
                 matar_pid: Callable[[int], None] = _matar_pid_real) -> None:
        self.launcher = launcher
        self.state_path = Path(state_path)
        self.esta_pid_vivo = esta_pid_vivo
        self.matar_pid = matar_pid
        self._entradas: dict[str, _Entrada] = {}

    def iniciar(self, camera_id: str, stream_url: str, api_url: str) -> None:
        processo = self.launcher.iniciar(camera_id, api_url)
        self._entradas[camera_id] = _Entrada(stream_url=stream_url, processo=processo)
        self._gravar_estado()

    def encerrar(self, camera_id: str) -> None:
        entrada = self._entradas.pop(camera_id, None)
        if entrada is None:
            return
        entrada.processo.terminate()
        self._gravar_estado()

    def esta_vivo(self, camera_id: str) -> bool:
        entrada = self._entradas.get(camera_id)
        return entrada is not None and entrada.processo.poll() is None

    def stream_url_atual(self, camera_id: str) -> Optional[str]:
        entrada = self._entradas.get(camera_id)
        return entrada.stream_url if entrada else None

    def camera_ids_rastreados(self) -> list[str]:
        return list(self._entradas.keys())

    def limpar_orfaos_do_boot_anterior(self) -> None:
        if not self.state_path.exists():
            return
        estado_anterior: dict[str, int] = json.loads(self.state_path.read_text())
        for pid in estado_anterior.values():
            if self.esta_pid_vivo(pid):
                self.matar_pid(pid)
        self.state_path.write_text(json.dumps({}))

    def _gravar_estado(self) -> None:
        estado = {camera_id: entrada.processo.pid for camera_id, entrada in self._entradas.items()}
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps(estado))
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_registry.py -v`
Expected: PASS (11/11 — os 6 da Task 2 + os 5 novos)

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator/registry.py tests/test_orchestrator_registry.py
git commit -m "feat(orchestrator): persiste estado e limpa processos orfaos no boot"
```

---

### Task 4: `Reconciler` — o ciclo de reconciliação completo

**Files:**
- Create: `src/orchestrator/reconciler.py`
- Test: `tests/test_orchestrator_reconciler.py`

**Interfaces:**
- Consumes: `OrchestratorSession.listar_cameras()`/`CameraDesejada`/`CatalogoInacessivelError` (Task 1); `ProcessRegistry` completo (Tasks 2-3).
- Produces: `Reconciler(sessao, registry, api_url, max_concorrentes, backoff_base, backoff_max, agora=...)` com `.reconciliar_uma_vez() -> None` — consumido pela Task 5 (`__main__.py`, chamado dentro do loop `while True`).

- [ ] **Step 1: Escrever os testes do `Reconciler`**

Criar `tests/test_orchestrator_reconciler.py`:

```python
"""
Testes de Reconciler (src/orchestrator/reconciler.py).

O que está sendo protegido: os seis passos do ciclo de reconciliação
(design doc, §2.3) — sobe câmera nova, derruba a que saiu do catálogo,
reinicia a que mudou de streamUrl, respeita backoff antes de reiniciar a
que morreu sozinha, respeita o limite de concorrência, e não toca em nada
quando o catálogo está inacessível. Usa o ProcessRegistry REAL (já testado
nas Tasks 2-3) com um LauncherFake, e uma sessão fake — assim o teste cobre
a decisão do Reconciler, confiando na mecânica do registro já provada.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from src.orchestrator.registry import ProcessRegistry
from src.orchestrator.reconciler import Reconciler
from src.orchestrator.session import CameraDesejada, CatalogoInacessivelError


class ProcessoFake:
    def __init__(self, pid: int):
        self.pid = pid
        self.codigo_saida = None
        self.terminado = False

    def poll(self):
        return self.codigo_saida

    def terminate(self):
        self.terminado = True

    def kill(self):
        self.terminado = True


class LauncherFake:
    def __init__(self):
        self.iniciados: list[tuple[str, str]] = []
        self._proximo_pid = 1000
        self.processos: dict[str, ProcessoFake] = {}

    def iniciar(self, camera_id: str, api_url: str) -> ProcessoFake:
        self.iniciados.append((camera_id, api_url))
        processo = ProcessoFake(pid=self._proximo_pid)
        self._proximo_pid += 1
        self.processos[camera_id] = processo
        return processo


class SessaoFake:
    def __init__(self, cameras=None, falhar=False):
        self.cameras = cameras if cameras is not None else []
        self.falhar = falhar

    def listar_cameras(self):
        if self.falhar:
            raise CatalogoInacessivelError("catalogo fora do ar")
        return self.cameras


class RelogioFake:
    def __init__(self):
        self.valor = datetime(2026, 9, 3, 12, 0, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.valor

    def avancar(self, segundos: float) -> None:
        self.valor += timedelta(seconds=segundos)


def _reconciler(sessao, launcher=None, max_concorrentes=4, backoff_base=0.5,
                 backoff_max=10.0, relogio=None, state_path="outputs/x.json"):
    launcher = launcher or LauncherFake()
    registry = ProcessRegistry(launcher, state_path=state_path)
    relogio = relogio or RelogioFake()
    reconciler = Reconciler(sessao, registry, "http://api/api/v1", max_concorrentes,
                             backoff_base, backoff_max, agora=relogio)
    return reconciler, registry, launcher, relogio


def test_camera_nova_e_iniciada(tmp_path):
    sessao = SessaoFake(cameras=[CameraDesejada("CAM-01", "url-1")])
    reconciler, registry, launcher, _ = _reconciler(sessao, state_path=str(tmp_path / "s.json"))

    reconciler.reconciliar_uma_vez()

    assert launcher.iniciados == [("CAM-01", "http://api/api/v1")]
    assert registry.esta_vivo("CAM-01") is True


def test_camera_removida_do_catalogo_e_encerrada(tmp_path):
    sessao = SessaoFake(cameras=[CameraDesejada("CAM-01", "url-1")])
    reconciler, registry, launcher, _ = _reconciler(sessao, state_path=str(tmp_path / "s.json"))
    reconciler.reconciliar_uma_vez()

    sessao.cameras = []  # desativada/deletada
    reconciler.reconciliar_uma_vez()

    assert launcher.processos["CAM-01"].terminado is True
    assert registry.esta_vivo("CAM-01") is False


def test_streamurl_mudou_reinicia_com_a_nova_url(tmp_path):
    sessao = SessaoFake(cameras=[CameraDesejada("CAM-01", "url-antiga")])
    reconciler, registry, launcher, _ = _reconciler(sessao, state_path=str(tmp_path / "s.json"))
    reconciler.reconciliar_uma_vez()

    sessao.cameras = [CameraDesejada("CAM-01", "url-nova")]
    reconciler.reconciliar_uma_vez()

    assert launcher.processos["CAM-01"].terminado is True  # o processo antigo foi encerrado
    assert launcher.iniciados == [("CAM-01", "http://api/api/v1"), ("CAM-01", "http://api/api/v1")]
    assert registry.stream_url_atual("CAM-01") == "url-nova"


def test_catalogo_inacessivel_nao_mexe_em_nada(tmp_path):
    sessao = SessaoFake(cameras=[CameraDesejada("CAM-01", "url-1")])
    reconciler, registry, launcher, _ = _reconciler(sessao, state_path=str(tmp_path / "s.json"))
    reconciler.reconciliar_uma_vez()

    sessao.falhar = True
    reconciler.reconciliar_uma_vez()

    assert len(launcher.iniciados) == 1  # nao tentou iniciar de novo
    assert registry.esta_vivo("CAM-01") is True  # continua rodando


def test_processo_morto_espera_o_backoff_antes_de_reiniciar(tmp_path):
    sessao = SessaoFake(cameras=[CameraDesejada("CAM-01", "url-1")])
    relogio = RelogioFake()
    reconciler, registry, launcher, relogio = _reconciler(
        sessao, backoff_base=1.0, backoff_max=10.0, relogio=relogio, state_path=str(tmp_path / "s.json"))
    reconciler.reconciliar_uma_vez()

    launcher.processos["CAM-01"].codigo_saida = 1  # morreu sozinha

    reconciler.reconciliar_uma_vez()
    assert len(launcher.iniciados) == 1  # ainda nao reiniciou -- backoff_base ainda nao passou

    relogio.avancar(1.0)
    reconciler.reconciliar_uma_vez()
    assert len(launcher.iniciados) == 2  # backoff passou -- reiniciou


def test_limite_de_concorrencia_deixa_o_excedente_de_fora(tmp_path):
    sessao = SessaoFake(cameras=[CameraDesejada("CAM-01", "url-1"), CameraDesejada("CAM-02", "url-2")])
    reconciler, registry, launcher, _ = _reconciler(
        sessao, max_concorrentes=1, state_path=str(tmp_path / "s.json"))

    reconciler.reconciliar_uma_vez()

    assert len(launcher.iniciados) == 1
    assert launcher.iniciados[0][0] == "CAM-01"  # ordenado por camera_id
    assert registry.esta_vivo("CAM-02") is False


def test_vaga_liberada_e_ocupada_no_ciclo_seguinte(tmp_path):
    sessao = SessaoFake(cameras=[CameraDesejada("CAM-01", "url-1"), CameraDesejada("CAM-02", "url-2")])
    reconciler, registry, launcher, _ = _reconciler(
        sessao, max_concorrentes=1, state_path=str(tmp_path / "s.json"))
    reconciler.reconciliar_uma_vez()  # so CAM-01 sobe

    sessao.cameras = [CameraDesejada("CAM-02", "url-2")]  # CAM-01 saiu do catalogo
    reconciler.reconciliar_uma_vez()

    assert registry.esta_vivo("CAM-01") is False
    assert registry.esta_vivo("CAM-02") is True
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_reconciler.py -v`
Expected: FAIL — `src.orchestrator.reconciler` não existe ainda.

- [ ] **Step 3: Implementar `src/orchestrator/reconciler.py`**

```python
"""
Ciclo de reconciliação do orquestrador (design doc, §2.3).

A cada chamada de `reconciliar_uma_vez()`: busca o catálogo desejado,
encerra o que saiu dele, detecta mudança de streamUrl e processo morto
(com backoff exponencial — mesma fórmula de `ResilientCapture`), e sobe o
que falta respeitando o limite de concorrência. Nunca levanta exceção para
falhas esperadas (catálogo inacessível vira "não faz nada neste ciclo").
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable

from src.orchestrator.registry import ProcessRegistry
from src.orchestrator.session import CatalogoInacessivelError


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class _EstadoDeFalha:
    espera_atual_segundos: float
    proxima_tentativa_permitida: datetime


class Reconciler:
    def __init__(self, sessao, registry: ProcessRegistry, api_url: str,
                 max_concorrentes: int, backoff_base: float, backoff_max: float,
                 agora: Callable[[], datetime] = _agora_utc) -> None:
        self.sessao = sessao
        self.registry = registry
        self.api_url = api_url
        self.max_concorrentes = max_concorrentes
        self.backoff_base = backoff_base
        self.backoff_max = backoff_max
        self.agora = agora
        self._falhas: dict[str, _EstadoDeFalha] = {}

    def reconciliar_uma_vez(self) -> None:
        try:
            desejadas = self.sessao.listar_cameras()
        except CatalogoInacessivelError:
            return  # fail-safe: nao mexe em nenhum processo neste ciclo

        desejado_por_id = {c.camera_id: c for c in desejadas}

        # 2. encerra o que saiu do catalogo (desativada ou deletada)
        for camera_id in list(self.registry.camera_ids_rastreados()):
            if camera_id not in desejado_por_id:
                self.registry.encerrar(camera_id)
                self._falhas.pop(camera_id, None)

        precisa_iniciar: list[str] = []

        for camera_id, camera in desejado_por_id.items():
            viva = self.registry.esta_vivo(camera_id)
            rastreada = camera_id in self.registry.camera_ids_rastreados()

            if viva and self.registry.stream_url_atual(camera_id) != camera.stream_url:
                # 3. mudou de config -- encerra e marca para reiniciar com a nova
                self.registry.encerrar(camera_id)
                self._falhas.pop(camera_id, None)
                precisa_iniciar.append(camera_id)
                continue

            if viva:
                self._falhas.pop(camera_id, None)  # rodando com sucesso -- reseta o backoff
                continue

            if rastreada:
                # 4. estava rastreada mas nao esta mais viva -- morreu sozinha
                if not self._pode_reiniciar_agora(camera_id):
                    continue
                self.registry.encerrar(camera_id)  # limpa a entrada morta antes de reiniciar

            precisa_iniciar.append(camera_id)

        # 5. sobe o que falta, respeitando o limite de concorrencia
        vivos = sum(1 for cid in self.registry.camera_ids_rastreados() if self.registry.esta_vivo(cid))
        vagas = max(self.max_concorrentes - vivos, 0)
        for camera_id in sorted(precisa_iniciar)[:vagas]:
            camera = desejado_por_id[camera_id]
            self.registry.iniciar(camera_id, camera.stream_url, self.api_url)

    def _pode_reiniciar_agora(self, camera_id: str) -> bool:
        """Mesma formula de backoff de ResilientCapture._loop_leitura: a
        primeira falha ja espera backoff_base (nao tenta de novo na hora), e
        cada falha subsequente dobra a espera ate backoff_max."""
        estado = self._falhas.get(camera_id)
        if estado is None:
            self._falhas[camera_id] = _EstadoDeFalha(
                espera_atual_segundos=self.backoff_base,
                proxima_tentativa_permitida=self.agora() + timedelta(seconds=self.backoff_base))
            return False
        if self.agora() < estado.proxima_tentativa_permitida:
            return False
        proxima_espera = min(estado.espera_atual_segundos * 2, self.backoff_max)
        self._falhas[camera_id] = _EstadoDeFalha(
            espera_atual_segundos=proxima_espera,
            proxima_tentativa_permitida=self.agora() + timedelta(seconds=proxima_espera))
        return True
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_reconciler.py -v`
Expected: PASS (7/7)

- [ ] **Step 5: Rodar a suíte inteira do orquestrador e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_session.py tests/test_orchestrator_registry.py tests/test_orchestrator_reconciler.py -v`
Expected: PASS (24/24)

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator/reconciler.py tests/test_orchestrator_reconciler.py
git commit -m "feat(orchestrator): ciclo de reconciliacao completo (start/stop/restart/fila)"
```

---

### Task 5: CLI real (`__main__.py`) — fiação e loop

**Files:**
- Create: `src/orchestrator/__main__.py`
- Test: `tests/test_orchestrator_cli.py`

**Interfaces:**
- Consumes: `OrchestratorSession`/`RequestsSessionTransport` (Task 1), `ProcessRegistry` (Tasks 2-3), `Reconciler` (Task 4), `CaptureConfig` (`src/capture/__init__.py`, já existente).
- Produces: `parse_args(argv: list[str] | None = None) -> argparse.Namespace`; `main() -> None` (entrypoint real — não testado diretamente, mesmo padrão de `run_pipeline.py`, ver docstring do teste).

- [ ] **Step 1: Escrever o teste de `parse_args`**

Criar `tests/test_orchestrator_cli.py`:

```python
"""
Teste de parse_args (src/orchestrator/__main__.py).

Não é praticável testar `main()` diretamente (login real, loop infinito,
subprocess real) — mesma situação de `run_pipeline.py`
(`tests/test_run_pipeline_config.py`). Só `parse_args` é testado aqui; o
resto é fiação de componentes já cobertos nas Tasks 1-4.
"""
from __future__ import annotations

from src.orchestrator.__main__ import parse_args


def test_parse_args_usa_os_defaults_documentados():
    args = parse_args(["--api-url", "http://localhost:8080/api/v1"])

    assert args.api_url == "http://localhost:8080/api/v1"
    assert args.intervalo == 30
    assert args.max_concorrentes == 2
    assert args.config == "config/pose_config.yaml"
    assert args.state_path == "outputs/orchestrator-state.json"


def test_parse_args_aceita_overrides():
    args = parse_args([
        "--api-url", "http://localhost:8080/api/v1",
        "--intervalo", "10",
        "--max-concorrentes", "5",
        "--config", "config/outro.yaml",
        "--state-path", "outputs/outro-estado.json",
    ])

    assert args.intervalo == 10
    assert args.max_concorrentes == 5
    assert args.config == "config/outro.yaml"
    assert args.state_path == "outputs/outro-estado.json"
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_cli.py -v`
Expected: FAIL — `src.orchestrator.__main__` não existe ainda. (Nota: importar de um módulo chamado `__main__` funciona normalmente em Python — mesmo padrão de `python -m src.orchestrator` executá-lo.)

- [ ] **Step 3: Implementar `src/orchestrator/__main__.py`**

```python
"""
Entrypoint do orquestrador (design doc, §4): `python -m src.orchestrator`.

Fiação real dos três componentes (Tasks 1-4) — login, limpeza de órfãos do
boot anterior, e o loop de reconciliação. `main()` não é testado
diretamente (login real, loop infinito, subprocess real de verdade) — só
`parse_args` é coberto por teste.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

from src.capture import CaptureConfig
from src.orchestrator.reconciler import Reconciler
from src.orchestrator.registry import ProcessRegistry
from src.orchestrator.session import OrchestratorSession, RequestsSessionTransport


class SubprocessLauncher:
    """Lançador real: um `python -m src.run_pipeline` por câmera, log
    redirecionado para um arquivo próprio (`outputs/orchestrator-logs/<id>.log`)."""

    def __init__(self, log_dir: str = "outputs/orchestrator-logs") -> None:
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)

    def iniciar(self, camera_id: str, api_url: str) -> subprocess.Popen:
        log_path = self.log_dir / f"{camera_id}.log"
        arquivo_log = open(log_path, "ab")
        return subprocess.Popen(
            [sys.executable, "-m", "src.run_pipeline",
             "--camera-id", camera_id, "--api-url", api_url, "--no-display"],
            stdout=arquivo_log, stderr=subprocess.STDOUT)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Orquestrador de pipelines por camera")
    p.add_argument("--api-url", required=True,
                   help="URL base da API do cypher para este tenant (ex.: http://localhost:8080/api/v1)")
    p.add_argument("--intervalo", type=int, default=30,
                   help="Segundos entre reconciliacoes (default: 30)")
    p.add_argument("--max-concorrentes", type=int, default=2,
                   help="Teto de pipelines simultaneos neste host (default: 2)")
    p.add_argument("--config", default="config/pose_config.yaml",
                   help="Arquivo de config de onde ler capture.backoff_base_seconds/backoff_max_seconds")
    p.add_argument("--state-path", default="outputs/orchestrator-state.json",
                   help="Onde persistir o mapa camera_id->pid entre reinicios do orquestrador")
    return p.parse_args(argv)


def main() -> None:
    args = parse_args()
    capture_config = CaptureConfig.from_yaml(args.config)

    sessao = OrchestratorSession(args.api_url, RequestsSessionTransport())
    sessao.login(os.environ)

    registry = ProcessRegistry(SubprocessLauncher(), state_path=args.state_path)
    registry.limpar_orfaos_do_boot_anterior()

    reconciler = Reconciler(
        sessao, registry, args.api_url, args.max_concorrentes,
        capture_config.backoff_base_seconds, capture_config.backoff_max_seconds)

    while True:
        reconciler.reconciliar_uma_vez()
        time.sleep(args.intervalo)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_cli.py -v`
Expected: PASS (2/2)

- [ ] **Step 5: Rodar a suíte inteira do orquestrador uma última vez**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_orchestrator_session.py tests/test_orchestrator_registry.py tests/test_orchestrator_reconciler.py tests/test_orchestrator_cli.py -v`
Expected: PASS (26/26)

- [ ] **Step 6: Rodar a suíte inteira do repositório e confirmar que nada quebrou**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest`
Expected: PASS em toda a suíte (nenhum arquivo fora de `src/orchestrator/`/`tests/test_orchestrator_*.py` foi tocado por este plano).

- [ ] **Step 7: Commit**

```bash
git add src/orchestrator/__main__.py tests/test_orchestrator_cli.py
git commit -m "feat(orchestrator): CLI real e loop de reconciliacao (python -m src.orchestrator)"
```

---

## Self-Review

**Cobertura da spec:** §2.1 (`OrchestratorSession`) → Tarefa 1. §2.2 (`ProcessRegistry`, sem persistência) → Tarefa 2. §2.4 (persistência de estado + limpeza de órfãos) → Tarefa 3. §2.3 (ciclo de reconciliação completo) → Tarefa 4. §3 (autenticação — mesmas variáveis `.env`, re-login em 401) → Tarefa 1. §4 (CLI/config) → Tarefa 5. §6 (comportamento sob falha — catálogo inacessível, login fatal, backoff, restart do orquestrador) → Tarefas 1, 3, 4. §7 (estratégia de testes — tudo injetável, sem rede/subprocess/PID real) → todas as tarefas.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todo passo tem código completo, sem `pass` de espaço reservado.

**Consistência de tipos:** `CameraDesejada(camera_id, stream_url)` introduzido na Tarefa 1, consumido sem variação nas Tarefas 4 e 5. `ProcessRegistry.iniciar(camera_id, stream_url, api_url)`/`.encerrar(camera_id)`/`.esta_vivo(camera_id)`/`.stream_url_atual(camera_id)`/`.camera_ids_rastreados()` introduzidos na Tarefa 2, estendidos (não renomeados) na Tarefa 3, consumidos sem variação na Tarefa 4. `CatalogoInacessivelError` introduzido na Tarefa 1, é o único tipo que `Reconciler.reconciliar_uma_vez` trata (Tarefa 4) — consistente com a decisão de design de absorver toda falha de sessão num único tipo.

---

**Plan complete and saved to `docs/superpowers/plans/orquestrador-pipelines/2026-09-03-oqa-capture-orquestrador.md`.**

## Execution Handoff

**1. Subagent-Driven (recomendado)** — dispatch de um subagente por tarefa, revisão entre tarefas, iteração rápida.

**2. Inline Execution** — execução em lote nesta sessão via `executing-plans`, com checkpoints para revisão.

Qual abordagem?
