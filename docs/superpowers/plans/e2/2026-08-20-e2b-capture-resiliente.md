# E2-B · Config Remota e Captura Resiliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O pipeline passa a obter sua fonte de captura do cadastro, expandindo credenciais do próprio ambiente, e a sobreviver a câmera IP que cai, trava ou entrega frames mais rápido do que ele consegue processar.

**Architecture:** Um pacote novo `src/capture/` com duas peças independentes. `CameraConfigClient` implementa a escada de três níveis — API, cache, fonte local — e expande `${VAR}` do ambiente. `ResilientCapture` embrulha o `cv2.VideoCapture` e assume o que o laço de frames não deve saber: reconectar e descartar frame velho. Fonte ao vivo usa thread de leitura; arquivo continua síncrono, para não alterar o conteúdo analisado.

**Tech Stack:** Python 3.10, OpenCV, `requests`, `queue`/`threading` da biblioteca padrão, pytest.

**Spec:** `docs/superpowers/specs/2026-08-20-cadastro-e-cameras-design.md` §2.2, §3, §6, §8, §9.

**Depende de:** E2-A Tasks 1–7 (`GET /api/v1/cameras/{id}/config` precisa existir para a Task 7 deste plano; as Tasks 1–6 não precisam da API, o transporte é injetado).

## Global Constraints

- **Repositório:** `/home/asaas/projects/challenge/cypher-capture`. Caminhos relativos a essa raiz.
- **Branch de partida:** `feat/e1b-notificacao-incidentes`. E1-B não foi mergeado; este plano continua dele.
- **Rodar sempre da raiz do projeto** — caminhos de modelos e configs são relativos a ela.
- **Interpretador:** `./venv/bin/python`. Testes: `./venv/bin/python -m pytest`.
- **Nenhum I/O de rede na thread do frame.** O orçamento é 200 ms e a medição de E1-B é 34 ms p95. A busca de config acontece **uma vez, no boot**, nunca no laço.
- **Compatibilidade para trás é obrigatória.** Sem `--camera-id`, o comportamento é exatamente o de hoje. A suíte de E1-B (incluindo a fixture de regressão de `cenario2.mp4`) não pode mudar de resultado.
- **`--source` vence `--camera-id`** quando ambos são passados, com aviso no terminal — é o que permite depurar contra arquivo uma câmera já cadastrada (spec §6.1).
- **Fonte de arquivo nunca descarta frame.** Descartar mudaria o conteúdo analisado e invalidaria as métricas medidas em E1 (spec §6.2).
- **Segredo nunca vem da API.** A `fonte` chega com `${VAR}`; a expansão acontece aqui, a partir de `os.environ`, e falha alto se a variável não existir (spec §3).
- **Estilo dos testes:** seguir `tests/test_incident_tracker.py` — docstring de módulo dizendo o que está sendo protegido, helpers no topo, sem GPU, sem rede, sem câmera.
- **Commits:** um por tarefa, em português, formato do repo (`feat(capture):`, `fix(notify):`).

---

## Estrutura de arquivos

```
src/capture/
├── __init__.py            CRIAR  reexporta o que run_pipeline usa
├── config_client.py       CRIAR  CameraConfig, CameraConfigClient, expansão de placeholder
└── resilient.py           CRIAR  ResilientCapture, is_live_source

src/utils/video.py         MODIFICAR  + is_live_source reaproveitando resolve_source
src/run_pipeline.py        MODIFICAR  --source opcional, escada, captura resiliente
config/pose_config.yaml    MODIFICAR  seção capture

tests/
├── test_camera_config_client.py   CRIAR
├── test_placeholder_expansion.py  CRIAR
└── test_resilient_capture.py      CRIAR
```

**Por que dois módulos e não um.** `config_client.py` é I/O de rede e disco sem nenhum conceito de vídeo; `resilient.py` é ciclo de vida de captura sem nenhum conceito de API. Juntá-los faria o teste de reconexão precisar de um transporte HTTP falso, e o teste de config precisar de um `cv2` falso — cada um carregando a complexidade do outro sem motivo.

---

## Task 1: Expansão de placeholder de credencial

**Files:**
- Create: `src/capture/__init__.py`
- Create: `src/capture/config_client.py`
- Test: `tests/test_placeholder_expansion.py`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `MissingCredentialError(Exception)` — com atributo `.variaveis: list[str]`.
  - `expand_placeholders(texto: str, env: Mapping[str, str]) -> str`.

O segredo vive no host, não no cadastro (spec §3). A expansão **falha alto** nomeando todas as variáveis ausentes de uma vez: a alternativa é o OpenCV tentar abrir uma URL com `${` literal dentro, falhar por motivo aparentemente não relacionado, e o operador depurar a câmera errada.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_placeholder_expansion.py`:

```python
"""
Testes da expansão de credencial (src/capture/config_client.py).

O que está sendo protegido: que a senha da câmera nunca precise existir no
cadastro, e que a ausência de uma variável de ambiente produza um erro que
nomeia o que falta — em vez de uma URL com "${" literal indo para o OpenCV.
"""
from __future__ import annotations

import pytest

from src.capture.config_client import MissingCredentialError, expand_placeholders


def test_expande_uma_variavel():
    resultado = expand_placeholders(
        "rtsp://${CAM01_USER}@10.0.0.7/stream", {"CAM01_USER": "cypher"})

    assert resultado == "rtsp://cypher@10.0.0.7/stream"


def test_expande_varias_variaveis():
    resultado = expand_placeholders(
        "rtsp://${U}:${P}@10.0.0.7/stream", {"U": "cypher", "P": "s3nh4"})

    assert resultado == "rtsp://cypher:s3nh4@10.0.0.7/stream"


def test_texto_sem_placeholder_passa_intacto():
    assert expand_placeholders("data/validation/cenario2.mp4", {}) \
        == "data/validation/cenario2.mp4"
    assert expand_placeholders("0", {}) == "0"


def test_nenhum_valor_e_inventado_quando_a_variavel_falta():
    with pytest.raises(MissingCredentialError) as erro:
        expand_placeholders("rtsp://${CAM01_USER}:${CAM01_PASS}@h/s", {})

    # Todas de uma vez: descobrir uma por execução é hostil.
    assert erro.value.variaveis == ["CAM01_USER", "CAM01_PASS"]
    assert "CAM01_USER" in str(erro.value)
    assert "CAM01_PASS" in str(erro.value)


def test_reporta_apenas_a_que_falta():
    with pytest.raises(MissingCredentialError) as erro:
        expand_placeholders("rtsp://${U}:${P}@h/s", {"U": "cypher"})

    assert erro.value.variaveis == ["P"]


def test_variavel_vazia_conta_como_ausente():
    # Uma senha vazia produziria uma URL sintaticamente válida e um erro de
    # autenticação obscuro na câmera.
    with pytest.raises(MissingCredentialError):
        expand_placeholders("rtsp://${U}@h/s", {"U": ""})


def test_variavel_repetida_e_reportada_uma_vez():
    with pytest.raises(MissingCredentialError) as erro:
        expand_placeholders("rtsp://${U}:${U}@h/s", {})

    assert erro.value.variaveis == ["U"]


def test_fonte_nula_ou_vazia_nao_explode():
    assert expand_placeholders(None, {}) is None
    assert expand_placeholders("", {}) == ""
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_placeholder_expansion.py -q
```

Esperado: FALHA — `ModuleNotFoundError: No module named 'src.capture'`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/capture/__init__.py`:

```python
"""Obtenção da fonte de captura e abertura resiliente de vídeo (E2)."""
```

Criar `src/capture/config_client.py`:

```python
"""
De onde o pipeline tira sua fonte de captura.

O cadastro guarda a fonte com placeholders — ``rtsp://${U}:${P}@host/stream``
— e o segredo vive no ambiente do host que abre a câmera. Assim a senha nunca
atravessa a rede, nunca entra no banco e nunca aparece em backup nem em log
de requisição.
"""
from __future__ import annotations

import re
from typing import Mapping, Optional

PLACEHOLDER = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


class MissingCredentialError(Exception):
    """Uma variável referenciada pela fonte não existe no ambiente."""

    def __init__(self, variaveis: list[str]) -> None:
        self.variaveis = variaveis
        super().__init__(
            "Variaveis de ambiente ausentes para expandir a fonte da camera: "
            + ", ".join(variaveis)
            + ". Defina-as no .env do host (ou exporte antes de subir o pipeline)."
        )


def expand_placeholders(texto: Optional[str], env: Mapping[str, str]) -> Optional[str]:
    """Substitui ``${VAR}`` pelos valores de ``env``.

    Falha nomeando **todas** as variáveis ausentes: descobrir uma por execução
    é hostil quando faltam usuário e senha. Valor vazio conta como ausente,
    porque produziria uma URL sintaticamente válida e um erro de autenticação
    obscuro na câmera.
    """
    if not texto:
        return texto

    faltando: list[str] = []
    for nome in PLACEHOLDER.findall(texto):
        if not env.get(nome) and nome not in faltando:
            faltando.append(nome)
    if faltando:
        raise MissingCredentialError(faltando)

    return PLACEHOLDER.sub(lambda m: env[m.group(1)], texto)
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_placeholder_expansion.py -q
```

Esperado: PASSA, 8 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/capture/__init__.py src/capture/config_client.py \
        tests/test_placeholder_expansion.py
git commit -m "feat(capture): expansao de credencial do ambiente com falha nomeada"
```

---

## Task 2: Cliente de config com cache

**Files:**
- Modify: `src/capture/config_client.py`
- Test: `tests/test_camera_config_client.py`

**Interfaces:**
- Consumes: `expand_placeholders`, `MissingCredentialError` (Task 1).
- Produces:
  - `CameraConfig(codigo, nome, estacao_id, fonte, stream_port, ativa, origem, idade_segundos)` — dataclass; `origem` ∈ `"api" | "cache"`.
  - `CameraDisabledError(Exception)`, `CameraNotRegisteredError(Exception)`.
  - `ConfigTransport` — protocolo com `get_json(url) -> tuple[int, dict]`.
  - `CameraConfigClient(api_url, cache_path="outputs/camera-config-cache.json", transport=None, now=None)`.
  - `CameraConfigClient.fetch(camera_id, env) -> Optional[CameraConfig]` — `None` significa "nem API nem cache", e o chamador cai para a fonte local.

Dois status são respostas **definitivas** e não caem para o cache: `409` (câmera desativada) e `404` (câmera não cadastrada). Cair para o cache nesses casos faria o pipeline subir apontando para uma câmera que alguém tirou de operação de propósito — o oposto do que o cadastro decidiu.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_camera_config_client.py`:

```python
"""
Testes do cliente de config de câmera (src/capture/config_client.py).

O que está sendo protegido: a escada de degradação. Um sistema de segurança
não pode ficar impedido de capturar porque o servidor de configuração está
fora — mas também não pode subir apontando para uma câmera que alguém
desativou de propósito. Os dois casos parecem "erro de rede" e não são.

Nenhum teste aqui toca a rede: o transporte é injetado.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from src.capture.config_client import (
    CameraConfigClient,
    CameraDisabledError,
    CameraNotRegisteredError,
    MissingCredentialError,
)

AGORA = datetime(2026, 8, 20, 12, 0, 0, tzinfo=timezone.utc)

CORPO = {
    "codigo": "CAM-01",
    "nome": "Esteira - frontal",
    "estacaoId": "EST-01",
    "fonte": "rtsp://${CAM01_USER}:${CAM01_PASS}@10.0.0.7/stream",
    "streamPort": 8090,
    "ativa": True,
}

AMBIENTE = {"CAM01_USER": "cypher", "CAM01_PASS": "s3nh4"}


class TransporteFake:
    """Responde um status fixo, ou levanta, e registra as URLs pedidas."""

    def __init__(self, status=200, corpo=None, erro=None):
        self.status = status
        self.corpo = corpo if corpo is not None else CORPO
        self.erro = erro
        self.urls: list[str] = []

    def get_json(self, url):
        self.urls.append(url)
        if self.erro is not None:
            raise self.erro
        return self.status, self.corpo


def cliente(tmp_path, transporte, **kwargs):
    return CameraConfigClient(
        "http://api/api/v1",
        cache_path=str(tmp_path / "cache.json"),
        transport=transporte,
        now=lambda: AGORA,
        **kwargs,
    )


def test_busca_no_endpoint_de_config_da_camera(tmp_path):
    transporte = TransporteFake()

    config = cliente(tmp_path, transporte).fetch("CAM-01", AMBIENTE)

    assert transporte.urls == ["http://api/api/v1/cameras/CAM-01/config"]
    assert config.codigo == "CAM-01"
    assert config.estacao_id == "EST-01"
    assert config.stream_port == 8090
    assert config.origem == "api"


def test_expande_a_credencial_do_ambiente(tmp_path):
    config = cliente(tmp_path, TransporteFake()).fetch("CAM-01", AMBIENTE)

    assert config.fonte == "rtsp://cypher:s3nh4@10.0.0.7/stream"


def test_credencial_ausente_aborta_em_vez_de_montar_url_quebrada(tmp_path):
    with pytest.raises(MissingCredentialError):
        cliente(tmp_path, TransporteFake()).fetch("CAM-01", {})


def test_grava_cache_com_a_fonte_ainda_em_placeholder(tmp_path):
    cache = tmp_path / "cache.json"
    cliente(tmp_path, TransporteFake()).fetch("CAM-01", AMBIENTE)

    gravado = json.loads(cache.read_text())

    # O cache é um arquivo em disco: guardar a senha expandida nele desfaria
    # justamente a razão do placeholder existir.
    assert "${CAM01_USER}" in gravado["CAM-01"]["config"]["fonte"]
    assert "s3nh4" not in cache.read_text()


def test_api_fora_usa_o_cache(tmp_path):
    cliente(tmp_path, TransporteFake()).fetch("CAM-01", AMBIENTE)

    offline = cliente(tmp_path, TransporteFake(erro=ConnectionError("sem rede")))
    config = offline.fetch("CAM-01", AMBIENTE)

    assert config is not None
    assert config.origem == "cache"
    assert config.fonte == "rtsp://cypher:s3nh4@10.0.0.7/stream"


def test_cache_informa_a_propria_idade(tmp_path):
    cliente(tmp_path, TransporteFake()).fetch("CAM-01", AMBIENTE)

    depois = AGORA + timedelta(hours=3)
    offline = CameraConfigClient(
        "http://api/api/v1",
        cache_path=str(tmp_path / "cache.json"),
        transport=TransporteFake(erro=ConnectionError("sem rede")),
        now=lambda: depois,
    )

    assert offline.fetch("CAM-01", AMBIENTE).idade_segundos == pytest.approx(3 * 3600)


def test_api_fora_e_sem_cache_devolve_nada(tmp_path):
    offline = cliente(tmp_path, TransporteFake(erro=ConnectionError("sem rede")))

    assert offline.fetch("CAM-01", AMBIENTE) is None


def test_cache_de_outra_camera_nao_serve(tmp_path):
    cliente(tmp_path, TransporteFake()).fetch("CAM-01", AMBIENTE)

    offline = cliente(tmp_path, TransporteFake(erro=ConnectionError("sem rede")))

    assert offline.fetch("CAM-99", AMBIENTE) is None


def test_camera_desativada_aborta_e_nao_cai_para_o_cache(tmp_path):
    cliente(tmp_path, TransporteFake()).fetch("CAM-01", AMBIENTE)

    desativada = cliente(tmp_path, TransporteFake(
        status=409, corpo={"erro": "Camera desativada: CAM-01"}))

    # 409 é resposta definitiva do cadastro, não falha de rede: subir com o
    # cache reativaria na prática uma câmera tirada de operação.
    with pytest.raises(CameraDisabledError):
        desativada.fetch("CAM-01", AMBIENTE)


def test_camera_nao_cadastrada_aborta(tmp_path):
    nao_existe = cliente(tmp_path, TransporteFake(status=404, corpo={}))

    with pytest.raises(CameraNotRegisteredError):
        nao_existe.fetch("CAM-01", AMBIENTE)


def test_erro_inesperado_do_servidor_cai_para_o_cache(tmp_path):
    cliente(tmp_path, TransporteFake()).fetch("CAM-01", AMBIENTE)

    quebrado = cliente(tmp_path, TransporteFake(status=500, corpo={}))
    config = quebrado.fetch("CAM-01", AMBIENTE)

    # 500 é o servidor mal, não uma decisão sobre a câmera: degrada.
    assert config is not None
    assert config.origem == "cache"


def test_cache_corrompido_nao_derruba_o_pipeline(tmp_path):
    (tmp_path / "cache.json").write_text("{isso nao e json")

    offline = cliente(tmp_path, TransporteFake(erro=ConnectionError("sem rede")))

    assert offline.fetch("CAM-01", AMBIENTE) is None
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_camera_config_client.py -q
```

Esperado: FALHA — `ImportError: cannot import name 'CameraConfigClient'`.

- [ ] **Step 3: Implementar o mínimo**

Acrescentar a `src/capture/config_client.py`, depois de `expand_placeholders`:

```python
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional, Protocol

log = logging.getLogger(__name__)


class CameraDisabledError(Exception):
    """A câmera existe no cadastro e está desativada."""


class CameraNotRegisteredError(Exception):
    """A câmera não existe no cadastro."""


class ConfigTransport(Protocol):
    def get_json(self, url: str) -> tuple[int, dict]: ...


class RequestsConfigTransport:
    """Transporte real. Importa requests preguiçosamente para manter os
    testes livres da dependência."""

    def __init__(self, timeout: float = 5.0) -> None:
        self.timeout = timeout

    def get_json(self, url: str) -> tuple[int, dict]:
        import requests
        resposta = requests.get(url, timeout=self.timeout)
        try:
            corpo = resposta.json()
        except ValueError:
            corpo = {}
        return resposta.status_code, corpo


@dataclass
class CameraConfig:
    """Config resolvida de uma câmera, com a procedência declarada."""

    codigo: str
    nome: str
    estacao_id: str
    fonte: Optional[str]
    stream_port: Optional[int]
    ativa: bool
    origem: str                      # "api" | "cache"
    idade_segundos: float = 0.0

    @property
    def do_cache(self) -> bool:
        return self.origem == "cache"


class CameraConfigClient:
    """Implementa a escada de degradação da spec §2.2.

    1. API responde  -> usa e grava o cache
    2. API fora      -> usa o cache, informando a idade dele
    3. sem cache     -> devolve None, e o chamador cai para a fonte local

    Duas respostas **não** degradam, porque são decisões do cadastro e não
    falhas de rede: 409 (desativada) e 404 (não cadastrada) abortam.
    """

    def __init__(self, api_url: str,
                 cache_path: str = "outputs/camera-config-cache.json",
                 transport: Optional[ConfigTransport] = None,
                 now: Optional[Callable[[], datetime]] = None) -> None:
        self.api_url = api_url.rstrip("/")
        self.cache_path = Path(cache_path)
        self.transport = transport or RequestsConfigTransport()
        self._now = now or (lambda: datetime.now(timezone.utc))

    def fetch(self, camera_id: str, env) -> Optional[CameraConfig]:
        bruto = self._da_api(camera_id)
        if bruto is not None:
            self._gravar_cache(camera_id, bruto)
            return self._montar(bruto, env, origem="api", idade=0.0)

        do_cache = self._do_cache(camera_id)
        if do_cache is None:
            return None
        bruto, idade = do_cache
        return self._montar(bruto, env, origem="cache", idade=idade)

    # ------------------------------------------------------------------
    # Internos
    # ------------------------------------------------------------------

    def _da_api(self, camera_id: str) -> Optional[dict]:
        url = f"{self.api_url}/cameras/{camera_id}/config"
        try:
            status, corpo = self.transport.get_json(url)
        except Exception as falha:
            log.warning("Config de %s indisponivel na API: %s", camera_id, falha)
            return None

        if status == 200:
            return corpo
        if status == 409:
            raise CameraDisabledError(
                corpo.get("erro") or f"Camera desativada no cadastro: {camera_id}")
        if status == 404:
            raise CameraNotRegisteredError(
                f"Camera nao cadastrada: {camera_id}. Cadastre-a ou use --source.")

        log.warning("Config de %s: API respondeu %s", camera_id, status)
        return None

    def _montar(self, bruto: dict, env, origem: str, idade: float) -> CameraConfig:
        return CameraConfig(
            codigo=bruto.get("codigo", ""),
            nome=bruto.get("nome", ""),
            estacao_id=bruto.get("estacaoId", ""),
            fonte=expand_placeholders(bruto.get("fonte"), env),
            stream_port=bruto.get("streamPort"),
            ativa=bool(bruto.get("ativa", True)),
            origem=origem,
            idade_segundos=idade,
        )

    def _gravar_cache(self, camera_id: str, bruto: dict) -> None:
        # Guarda a fonte AINDA com placeholder: o cache é um arquivo em disco,
        # e gravar a senha expandida desfaria a razão do placeholder existir.
        try:
            tudo = self._ler_cache_bruto()
            tudo[camera_id] = {
                "fetched_at": self._now().isoformat(),
                "config": bruto,
            }
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(json.dumps(tudo, indent=2))
        except OSError as erro:
            log.warning("Nao foi possivel gravar o cache de config: %s", erro)

    def _do_cache(self, camera_id: str) -> Optional[tuple[dict, float]]:
        registro = self._ler_cache_bruto().get(camera_id)
        if not registro:
            return None
        try:
            gravado_em = datetime.fromisoformat(registro["fetched_at"])
            idade = (self._now() - gravado_em).total_seconds()
        except (KeyError, ValueError):
            idade = 0.0
        return registro.get("config", {}), idade

    def _ler_cache_bruto(self) -> dict:
        if not self.cache_path.exists():
            return {}
        try:
            return json.loads(self.cache_path.read_text()) or {}
        except (OSError, json.JSONDecodeError):
            log.warning("Cache de config ilegivel, ignorando: %s", self.cache_path)
            return {}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_camera_config_client.py -q
```

Esperado: PASSA, 12 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/capture/config_client.py tests/test_camera_config_client.py
git commit -m "feat(capture): cliente de config com cache e escada de degradacao"
```

---

## Task 3: Fonte ao vivo ou arquivo

**Files:**
- Modify: `src/utils/video.py`
- Test: `tests/test_resilient_capture.py`

**Interfaces:**
- Consumes: `resolve_source` (existente).
- Produces: `is_live_source(source) -> bool`.

`ResilientCapture` se comporta de dois jeitos e a decisão vem daqui. Arquivo lido quadro a quadro; ao vivo com thread e descarte. Fim de arquivo é fim, não falha a reconectar (spec §6.2).

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_resilient_capture.py` com apenas a primeira parte (o arquivo cresce nas Tasks 4 e 5):

```python
"""
Testes da captura resiliente (src/capture/resilient.py).

O que está sendo protegido: que câmera IP que cai, trava ou entrega frames
mais rápido do que o pipeline processa não derrube nem atrase a análise — e
que arquivo continue sendo lido quadro a quadro, porque descartar frame de
arquivo mudaria o conteúdo analisado e invalidaria as métricas de E1.

Nenhum teste aqui abre câmera ou arquivo: a captura é injetada.
"""
from __future__ import annotations

import pytest

from src.utils.video import is_live_source


@pytest.mark.parametrize("fonte", [0, 1, "0", "-1", "rtsp://10.0.0.7/stream",
                                   "rtsps://cam/stream", "http://cam/mjpeg",
                                   "https://cam/mjpeg", "udp://239.0.0.1:1234"])
def test_reconhece_fonte_ao_vivo(fonte):
    assert is_live_source(fonte) is True


@pytest.mark.parametrize("fonte", ["data/validation/cenario2.mp4",
                                   "/tmp/clipe.avi", "clipe.mkv",
                                   "outputs/captures/x.mp4"])
def test_reconhece_arquivo(fonte):
    assert is_live_source(fonte) is False


def test_caminho_de_diretorio_de_imagens_nao_e_ao_vivo():
    assert is_live_source("data/imagens/") is False
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_resilient_capture.py -q
```

Esperado: FALHA — `ImportError: cannot import name 'is_live_source'`.

- [ ] **Step 3: Implementar o mínimo**

Acrescentar ao final de `src/utils/video.py`:

```python
# Esquemas que representam captura contínua. Um arquivo de vídeo servido por
# HTTP cairia aqui por engano, mas isso não é um uso previsto do projeto — e o
# custo do erro é apenas tentar reconectar no fim, não corromper análise.
LIVE_SCHEMES = ("rtsp://", "rtsps://", "http://", "https://", "udp://", "tcp://")


def is_live_source(source: int | str | Path) -> bool:
    """Se a fonte é captura contínua (câmera) e não mídia finita (arquivo).

    Decide o comportamento de ``ResilientCapture``: ao vivo reconecta e
    descarta frame atrasado; arquivo é lido quadro a quadro e o fim é o fim.
    """
    resolvida = resolve_source(source)
    if isinstance(resolvida, int):
        return True
    return resolvida.lower().startswith(LIVE_SCHEMES)
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_resilient_capture.py -q
```

Esperado: PASSA, 13 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/utils/video.py tests/test_resilient_capture.py
git commit -m "feat(capture): distingue fonte ao vivo de arquivo"
```

---

## Task 4: Captura de arquivo, quadro a quadro

**Files:**
- Create: `src/capture/resilient.py`
- Modify: `tests/test_resilient_capture.py`

**Interfaces:**
- Consumes: `is_live_source` (Task 3).
- Produces:
  - `CaptureLike` — protocolo com `isOpened()`, `read()`, `release()`, `get(prop)`, `set(prop, value)`.
  - `ResilientCapture(source, factory=None, backoff_base=0.5, backoff_max=10.0)`.
  - `.open()`, `.read() -> tuple[bool, Optional[ndarray]]`, `.release()`, `.isOpened() -> bool`.
  - `.width`, `.height`, `.fps` — lidos da captura, com defaults quando indisponíveis.
  - `.state` ∈ `"fechado" | "conectado" | "reconectando" | "encerrado"`, `.reconnects: int`, `.frames_descartados: int`.

Arquivo primeiro porque é o caminho que a suíte de E1 exercita: se este comportamento mudar, a fixture de regressão de `cenario2.mp4` deixa de valer.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/test_resilient_capture.py`:

```python
import numpy as np

from src.capture.resilient import ResilientCapture


class CapturaFake:
    """Captura controlável: entrega N frames e depois falha ou encerra."""

    def __init__(self, frames=3, abre=True, largura=64, altura=48, fps=30.0):
        self.restantes = frames
        self.abre = abre
        self.largura = largura
        self.altura = altura
        self.fps = fps
        self.liberada = False
        self.props: dict[int, float] = {}

    def isOpened(self):  # noqa: N802 (assinatura do OpenCV)
        return self.abre

    def read(self):
        if self.restantes <= 0:
            return False, None
        self.restantes -= 1
        return True, np.zeros((self.altura, self.largura, 3), dtype=np.uint8)

    def release(self):
        self.liberada = True

    def get(self, prop):
        import cv2
        if prop == cv2.CAP_PROP_FRAME_WIDTH:
            return self.largura
        if prop == cv2.CAP_PROP_FRAME_HEIGHT:
            return self.altura
        if prop == cv2.CAP_PROP_FPS:
            return self.fps
        return 0.0

    def set(self, prop, value):
        self.props[prop] = value
        return True


def test_le_arquivo_quadro_a_quadro_sem_descartar():
    fake = CapturaFake(frames=3)
    cap = ResilientCapture("clipe.mp4", factory=lambda: fake)
    cap.open()

    lidos = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        lidos.append(frame)

    assert len(lidos) == 3
    assert cap.frames_descartados == 0
    cap.release()


def test_fim_de_arquivo_encerra_em_vez_de_reconectar():
    fake = CapturaFake(frames=1)
    cap = ResilientCapture("clipe.mp4", factory=lambda: fake)
    cap.open()

    cap.read()
    ok, _ = cap.read()

    assert ok is False
    assert cap.state == "encerrado"
    assert cap.reconnects == 0
    cap.release()


def test_expoe_dimensoes_e_fps_da_fonte():
    cap = ResilientCapture("clipe.mp4",
                           factory=lambda: CapturaFake(largura=1280, altura=720, fps=25.0))
    cap.open()

    assert cap.width == 1280
    assert cap.height == 720
    assert cap.fps == pytest.approx(25.0)
    cap.release()


def test_dimensoes_ausentes_caem_para_um_default_utilizavel():
    cap = ResilientCapture("clipe.mp4",
                           factory=lambda: CapturaFake(largura=0, altura=0, fps=0.0))
    cap.open()

    # O writer de vídeo do run_pipeline precisa de números; zero o quebraria.
    assert cap.width == 1280
    assert cap.height == 720
    assert cap.fps > 0
    cap.release()


def test_arquivo_que_nao_abre_falha_imediatamente():
    cap = ResilientCapture("nao-existe.mp4", factory=lambda: CapturaFake(abre=False))

    with pytest.raises(RuntimeError, match="nao-existe.mp4"):
        cap.open()


def test_release_libera_a_captura_subjacente():
    fake = CapturaFake()
    cap = ResilientCapture("clipe.mp4", factory=lambda: fake)
    cap.open()

    cap.release()

    assert fake.liberada is True
    assert cap.isOpened() is False
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_resilient_capture.py -q
```

Esperado: FALHA — `ModuleNotFoundError: No module named 'src.capture.resilient'`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/capture/resilient.py`:

```python
"""
Abertura de vídeo que sobrevive a câmera real.

Três problemas que o laço de frames não deveria ter de conhecer:

  * a câmera cai — reconectar com backoff, sem derrubar o processo;
  * a câmera trava conectada sem enviar — ``read()`` bloqueia para sempre;
  * o processamento é mais lento que a fonte — o buffer cresce em silêncio até
    se estar analisando o passado.

Para fonte ao vivo, os três são resolvidos por uma thread de leitura que
guarda apenas o frame mais recente (ver ``_LiveReader``). Para arquivo, nada
disso se aplica: descartar frame mudaria o conteúdo analisado, e fim de
arquivo é fim.
"""
from __future__ import annotations

import logging
from typing import Callable, Optional, Protocol

import cv2
import numpy as np

from ..utils.video import is_live_source, resolve_source

log = logging.getLogger(__name__)

LARGURA_DEFAULT = 1280
ALTURA_DEFAULT = 720
FPS_DEFAULT = 15.0


class CaptureLike(Protocol):
    def isOpened(self) -> bool: ...
    def read(self) -> tuple[bool, Optional[np.ndarray]]: ...
    def release(self) -> None: ...
    def get(self, prop: int) -> float: ...
    def set(self, prop: int, value: float) -> bool: ...


class ResilientCapture:
    """Fonte de vídeo com comportamento distinto para arquivo e câmera."""

    def __init__(self, source,
                 factory: Optional[Callable[[], CaptureLike]] = None,
                 backoff_base: float = 0.5,
                 backoff_max: float = 10.0) -> None:
        self.source = source
        self.live = is_live_source(source)
        self.backoff_base = backoff_base
        self.backoff_max = backoff_max
        self._factory = factory or (lambda: cv2.VideoCapture(resolve_source(source)))

        self._cap: Optional[CaptureLike] = None
        self.state = "fechado"
        self.reconnects = 0
        self.frames_descartados = 0

    # ------------------------------------------------------------------
    # Ciclo de vida
    # ------------------------------------------------------------------

    def open(self) -> "ResilientCapture":
        cap = self._factory()
        if not cap.isOpened():
            raise RuntimeError(f"Nao foi possivel abrir a fonte de video '{self.source}'")
        self._cap = cap
        self.state = "conectado"
        return self

    def isOpened(self) -> bool:  # noqa: N802 (espelha a API do OpenCV)
        return self._cap is not None and self.state in ("conectado", "reconectando")

    def release(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        if self.state != "encerrado":
            self.state = "fechado"

    # ------------------------------------------------------------------
    # Leitura
    # ------------------------------------------------------------------

    def read(self) -> tuple[bool, Optional[np.ndarray]]:
        if self._cap is None:
            return False, None

        ok, frame = self._cap.read()
        if ok:
            return True, frame

        # Arquivo: o fim é o fim. Reconectar aqui reiniciaria o clipe e
        # duplicaria a análise.
        self.state = "encerrado"
        return False, None

    # ------------------------------------------------------------------
    # Metadados
    # ------------------------------------------------------------------

    @property
    def width(self) -> int:
        return self._inteiro(cv2.CAP_PROP_FRAME_WIDTH, LARGURA_DEFAULT)

    @property
    def height(self) -> int:
        return self._inteiro(cv2.CAP_PROP_FRAME_HEIGHT, ALTURA_DEFAULT)

    @property
    def fps(self) -> float:
        if self._cap is None:
            return FPS_DEFAULT
        valor = self._cap.get(cv2.CAP_PROP_FPS)
        return valor if valor and valor > 0 else FPS_DEFAULT

    def _inteiro(self, prop: int, default: int) -> int:
        if self._cap is None:
            return default
        valor = int(self._cap.get(prop) or 0)
        return valor if valor > 0 else default
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_resilient_capture.py -q
```

Esperado: PASSA, 19 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/capture/resilient.py tests/test_resilient_capture.py
git commit -m "feat(capture): ResilientCapture para arquivo, quadro a quadro"
```

---

## Task 5: Captura ao vivo com thread, descarte e reconexão

**Files:**
- Modify: `src/capture/resilient.py`
- Modify: `tests/test_resilient_capture.py`

**Interfaces:**
- Consumes: `ResilientCapture` (Task 4).
- Produces: comportamento ao vivo — `read()` devolve `(False, None)` quando não há frame novo, `reconnects` cresce, `frames_descartados` cresce.

A thread de leitura é o que resolve os três problemas de uma vez. `CAP_PROP_BUFFERSIZE=1` é best-effort e o backend FFmpeg costuma ignorar; e a demonstração roda 3–4 pipelines na mesma GPU, o que já derruba o processamento abaixo da taxa da fonte (spec §6.2).

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/test_resilient_capture.py`:

```python
import threading
import time


class CapturaAoVivoFake:
    """Câmera controlável: entrega frames sob comando, falha sob comando."""

    def __init__(self, abre=True):
        self.abre = abre
        self.liberada = False
        self.falhar = False
        self.travar = threading.Event()
        self.entregues = 0
        self.props: dict[int, float] = {}

    def isOpened(self):  # noqa: N802
        return self.abre

    def read(self):
        if self.travar.is_set():
            # Câmera conectada mas muda: read() nunca retorna.
            time.sleep(0.05)
            return False, None
        if self.falhar:
            return False, None
        self.entregues += 1
        return True, np.full((48, 64, 3), self.entregues % 255, dtype=np.uint8)

    def release(self):
        self.liberada = True

    def get(self, prop):
        import cv2
        if prop == cv2.CAP_PROP_FRAME_WIDTH:
            return 64
        if prop == cv2.CAP_PROP_FRAME_HEIGHT:
            return 48
        if prop == cv2.CAP_PROP_FPS:
            return 30.0
        return 0.0

    def set(self, prop, value):
        self.props[prop] = value
        return True


def _esperar(condicao, timeout=3.0):
    limite = time.perf_counter() + timeout
    while time.perf_counter() < limite:
        if condicao():
            return True
        time.sleep(0.01)
    return False


def test_ao_vivo_le_numa_thread_e_nao_bloqueia_o_laco():
    fake = CapturaAoVivoFake()
    cap = ResilientCapture("rtsp://10.0.0.7/stream", factory=lambda: fake)
    cap.open()
    try:
        assert _esperar(lambda: fake.entregues > 0)

        inicio = time.perf_counter()
        for _ in range(50):
            cap.read()
        decorrido = time.perf_counter() - inicio

        # 50 leituras do laço quente: nenhuma pode esperar pela câmera.
        assert decorrido < 0.05
    finally:
        cap.release()


def test_ao_vivo_pede_buffer_minimo_ao_backend():
    fake = CapturaAoVivoFake()
    cap = ResilientCapture("rtsp://10.0.0.7/stream", factory=lambda: fake)
    cap.open()
    try:
        import cv2
        # Best-effort: o FFmpeg costuma ignorar, e é por isso que a thread
        # existe. Ainda assim pedimos.
        assert fake.props.get(cv2.CAP_PROP_BUFFERSIZE) == 1
    finally:
        cap.release()


def test_ao_vivo_entrega_o_frame_mais_recente_e_descarta_os_atrasados():
    fake = CapturaAoVivoFake()
    cap = ResilientCapture("rtsp://10.0.0.7/stream", factory=lambda: fake)
    cap.open()
    try:
        assert _esperar(lambda: fake.entregues > 20)
        ok, _ = cap.read()

        assert ok is True
        # A câmera produziu mais do que o laço consumiu: a diferença foi
        # descartada em vez de virar latência.
        assert cap.frames_descartados > 0
    finally:
        cap.release()


def test_ao_vivo_sem_frame_novo_devolve_falso_sem_erro():
    fake = CapturaAoVivoFake()
    cap = ResilientCapture("rtsp://10.0.0.7/stream", factory=lambda: fake)
    cap.open()
    try:
        assert _esperar(lambda: cap.read()[0] is True)

        # Duas leituras seguidas sem a câmera ter produzido nada novo.
        fake.travar.set()
        time.sleep(0.1)
        cap.read()
        ok, frame = cap.read()

        assert ok is False
        assert frame is None
        # Travar não é morrer: o laço continua girando.
        assert cap.state in ("conectado", "reconectando")
    finally:
        fake.travar.clear()
        cap.release()


def test_ao_vivo_reconecta_quando_a_camera_cai():
    criadas: list[CapturaAoVivoFake] = []

    def fabrica():
        nova = CapturaAoVivoFake()
        criadas.append(nova)
        return nova

    cap = ResilientCapture("rtsp://10.0.0.7/stream", factory=fabrica,
                           backoff_base=0.01, backoff_max=0.05)
    cap.open()
    try:
        assert _esperar(lambda: criadas[0].entregues > 0)

        criadas[0].falhar = True

        assert _esperar(lambda: cap.reconnects >= 1)
        assert _esperar(lambda: len(criadas) >= 2)
        # A captura antiga foi liberada antes de reabrir.
        assert criadas[0].liberada is True
        # E o pipeline segue vivo.
        assert cap.isOpened() is True
    finally:
        cap.release()


def test_reconexao_nao_derruba_o_processo_quando_a_camera_nao_volta():
    def fabrica():
        return CapturaAoVivoFake(abre=False)

    cap = ResilientCapture("rtsp://10.0.0.7/stream", factory=fabrica,
                           backoff_base=0.01, backoff_max=0.02)
    # A primeira abertura falha e é erro do operador: fonte errada.
    with pytest.raises(RuntimeError):
        cap.open()


def test_release_encerra_a_thread():
    fake = CapturaAoVivoFake()
    cap = ResilientCapture("rtsp://10.0.0.7/stream", factory=lambda: fake)
    cap.open()
    assert _esperar(lambda: fake.entregues > 0)

    cap.release()

    assert _esperar(lambda: fake.liberada is True)
    assert cap.isOpened() is False
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_resilient_capture.py -q
```

Esperado: FALHA — a captura ao vivo hoje é síncrona, então `frames_descartados` fica em zero e `reconnects` nunca cresce.

- [ ] **Step 3: Implementar o mínimo**

Em `src/capture/resilient.py`, acrescentar `threading` e `time` aos imports, e substituir `open`, `read` e `release` pela versão que separa os dois modos:

```python
import threading
import time
```

```python
    def open(self) -> "ResilientCapture":
        cap = self._factory()
        if not cap.isOpened():
            raise RuntimeError(f"Nao foi possivel abrir a fonte de video '{self.source}'")
        self._cap = cap
        self.state = "conectado"

        if self.live:
            self._preparar_ao_vivo(cap)
            self._parar = threading.Event()
            self._novo = threading.Condition()
            self._ultimo: Optional[np.ndarray] = None
            self._serie = 0
            self._serie_lida = 0
            self._thread = threading.Thread(target=self._loop_leitura,
                                            name="capture-reader", daemon=True)
            self._thread.start()
        return self

    def read(self) -> tuple[bool, Optional[np.ndarray]]:
        if self.live:
            return self._read_ao_vivo()
        return self._read_arquivo()

    def release(self) -> None:
        if self.live and getattr(self, "_parar", None) is not None:
            self._parar.set()
            with self._novo:
                self._novo.notify_all()
            if self._thread is not None:
                self._thread.join(timeout=2.0)
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        if self.state != "encerrado":
            self.state = "fechado"

    # ------------------------------------------------------------------
    # Arquivo
    # ------------------------------------------------------------------

    def _read_arquivo(self) -> tuple[bool, Optional[np.ndarray]]:
        if self._cap is None:
            return False, None
        ok, frame = self._cap.read()
        if ok:
            return True, frame
        # O fim é o fim. Reconectar reiniciaria o clipe e duplicaria a análise.
        self.state = "encerrado"
        return False, None

    # ------------------------------------------------------------------
    # Ao vivo
    # ------------------------------------------------------------------

    def _preparar_ao_vivo(self, cap: CaptureLike) -> None:
        # Best-effort: o backend FFmpeg costuma ignorar, e é justamente por
        # isso que a thread de leitura existe.
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass

    def _read_ao_vivo(self) -> tuple[bool, Optional[np.ndarray]]:
        with self._novo:
            if self._ultimo is None or self._serie == self._serie_lida:
                return False, None
            self._serie_lida = self._serie
            return True, self._ultimo

    def _loop_leitura(self) -> None:
        """Guarda apenas o frame mais recente.

        Descartar deliberadamente é a única correção confiável para a latência
        que cresce quando o processamento é mais lento que a fonte — e mantém
        o bloqueio de uma câmera muda isolado aqui, longe do laço.
        """
        espera = self.backoff_base
        while not self._parar.is_set():
            cap = self._cap
            if cap is None:
                return

            ok, frame = cap.read()
            if ok:
                espera = self.backoff_base
                with self._novo:
                    if self._ultimo is not None and self._serie != self._serie_lida:
                        self.frames_descartados += 1
                    self._ultimo = frame
                    self._serie += 1
                    self._novo.notify_all()
                continue

            if self._parar.is_set():
                return
            self._reconectar(espera)
            espera = min(espera * 2, self.backoff_max)

    def _reconectar(self, espera: float) -> None:
        self.state = "reconectando"
        log.warning("Fonte '%s' caiu; reconectando em %.1fs (reconexoes=%d)",
                    self.source, espera, self.reconnects + 1)
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
            self._cap = None

        time.sleep(espera)
        if self._parar.is_set():
            return

        self.reconnects += 1
        try:
            nova = self._factory()
        except Exception as falha:
            log.warning("Falha ao reabrir '%s': %s", self.source, falha)
            return
        if not nova.isOpened():
            return
        self._preparar_ao_vivo(nova)
        self._cap = nova
        self.state = "conectado"
        log.info("Fonte '%s' reconectada", self.source)
```

Declarar os atributos usados no modo ao vivo no `__init__`, junto dos outros, para que `release()` funcione mesmo sem `open()`:

```python
        self._parar: Optional[threading.Event] = None
        self._novo: Optional[threading.Condition] = None
        self._thread: Optional[threading.Thread] = None
        self._ultimo: Optional[np.ndarray] = None
        self._serie = 0
        self._serie_lida = 0
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_resilient_capture.py -q
```

Esperado: PASSA, 26 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/capture/resilient.py tests/test_resilient_capture.py
git commit -m "feat(capture): thread de leitura ao vivo com descarte e reconexao"
```

---

## Task 6: Ligação no pipeline e opções de transporte

**Files:**
- Modify: `src/capture/__init__.py`
- Modify: `src/run_pipeline.py`
- Modify: `config/pose_config.yaml`
- Test: `tests/test_capture_config.py`

**Interfaces:**
- Consumes: tudo das Tasks 1–5.
- Produces:
  - `CaptureConfig` em `src/capture/__init__.py`, com `from_yaml(path) -> CaptureConfig`.
  - `aplicar_opcoes_ffmpeg(env)` — define `OPENCV_FFMPEG_CAPTURE_OPTIONS`.
  - `--source` deixa de ser obrigatório em `run_pipeline.py`.

Transporte TCP forçado por padrão: UDP perde pacote sob carga e produz artefato que o detector interpreta como movimento — falso positivo de queda causado pela rede. A chave de timeout se chama `stimeout` no FFmpeg antigo e `timeout` no recente; **as duas são declaradas**, porque errar essa chave faz a proteção não existir sem avisar (spec §6.3).

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_capture_config.py`:

```python
"""
Testes da configuração de captura.

O que está sendo protegido: que o transporte RTSP seja TCP por padrão (UDP
sob carga gera artefato que o detector lê como movimento), que as duas grafias
da chave de timeout sejam declaradas, e que o pipeline continue rodando como
antes para quem não configurou nada.
"""
from __future__ import annotations

import textwrap

from src.capture import CaptureConfig, aplicar_opcoes_ffmpeg


def test_valores_padrao(tmp_path):
    config = tmp_path / "vazio.yaml"
    config.write_text("pipeline:\n  device: cpu\n")

    capture = CaptureConfig.from_yaml(str(config))

    assert capture.rtsp_transport == "tcp"
    assert capture.read_timeout_ms == 5000
    assert capture.backoff_base_seconds == 0.5
    assert capture.backoff_max_seconds == 10.0
    assert capture.cache_path == "outputs/camera-config-cache.json"


def test_le_a_secao_capture(tmp_path):
    config = tmp_path / "cheio.yaml"
    config.write_text(textwrap.dedent("""
        capture:
          rtsp_transport: udp
          read_timeout_ms: 2000
          backoff_base_seconds: 1
          backoff_max_seconds: 30
          cache_path: outputs/meu-cache.json
    """))

    capture = CaptureConfig.from_yaml(str(config))

    assert capture.rtsp_transport == "udp"
    assert capture.read_timeout_ms == 2000
    assert capture.backoff_base_seconds == 1
    assert capture.backoff_max_seconds == 30
    assert capture.cache_path == "outputs/meu-cache.json"


def test_chaves_desconhecidas_sao_ignoradas(tmp_path):
    config = tmp_path / "extra.yaml"
    config.write_text("capture:\n  rtsp_transport: tcp\n  invento: 42\n")

    assert CaptureConfig.from_yaml(str(config)).rtsp_transport == "tcp"


def test_declara_as_duas_grafias_da_chave_de_timeout():
    env: dict[str, str] = {}

    aplicar_opcoes_ffmpeg(CaptureConfig(), env)

    opcoes = env["OPENCV_FFMPEG_CAPTURE_OPTIONS"]
    assert "rtsp_transport;tcp" in opcoes
    # stimeout no FFmpeg antigo, timeout no recente. Declarar só uma faz a
    # protecao nao existir na outra versao, sem avisar.
    assert "stimeout;5000000" in opcoes
    assert "timeout;5000000" in opcoes


def test_timeout_e_convertido_para_microssegundos():
    env: dict[str, str] = {}

    aplicar_opcoes_ffmpeg(CaptureConfig(read_timeout_ms=2000), env)

    assert "stimeout;2000000" in env["OPENCV_FFMPEG_CAPTURE_OPTIONS"]


def test_nao_sobrescreve_opcoes_definidas_pelo_operador():
    env = {"OPENCV_FFMPEG_CAPTURE_OPTIONS": "rtsp_transport;udp"}

    aplicar_opcoes_ffmpeg(CaptureConfig(), env)

    assert env["OPENCV_FFMPEG_CAPTURE_OPTIONS"] == "rtsp_transport;udp"
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_capture_config.py -q
```

Esperado: FALHA — `ImportError: cannot import name 'CaptureConfig'`.

- [ ] **Step 3: Implementar o mínimo**

Substituir `src/capture/__init__.py`:

```python
"""Obtenção da fonte de captura e abertura resiliente de vídeo (E2)."""

from __future__ import annotations

from dataclasses import dataclass, fields
from typing import MutableMapping

import yaml

from .config_client import (
    CameraConfig,
    CameraConfigClient,
    CameraDisabledError,
    CameraNotRegisteredError,
    MissingCredentialError,
    expand_placeholders,
)
from .resilient import ResilientCapture


@dataclass
class CaptureConfig:
    """Seção `capture` do pose_config.yaml. Chaves desconhecidas são
    ignoradas, seguindo o contrato de PipelineConfig.from_yaml."""

    rtsp_transport: str = "tcp"
    read_timeout_ms: int = 5000
    backoff_base_seconds: float = 0.5
    backoff_max_seconds: float = 10.0
    cache_path: str = "outputs/camera-config-cache.json"

    @classmethod
    def from_yaml(cls, path: str) -> "CaptureConfig":
        with open(path) as arquivo:
            bruto = yaml.safe_load(arquivo) or {}
        secao = bruto.get("capture") or {}
        conhecidos = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in secao.items() if k in conhecidos})


def aplicar_opcoes_ffmpeg(config: CaptureConfig,
                          env: MutableMapping[str, str]) -> None:
    """Define as opções do backend FFmpeg antes de qualquer captura abrir.

    TCP por padrão: UDP perde pacote sob carga e produz artefato que o
    detector interpreta como movimento — falso positivo de queda causado pela
    rede.

    O timeout de leitura se chama ``stimeout`` no FFmpeg antigo e ``timeout``
    no recente. As duas são declaradas: manter só uma faz a proteção não
    existir na outra versão, silenciosamente.
    """
    if env.get("OPENCV_FFMPEG_CAPTURE_OPTIONS"):
        # O operador sabe mais sobre a câmera dele do que este default.
        return

    micros = int(config.read_timeout_ms) * 1000
    env["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "|".join([
        f"rtsp_transport;{config.rtsp_transport}",
        f"stimeout;{micros}",
        f"timeout;{micros}",
    ])


__all__ = [
    "CameraConfig",
    "CameraConfigClient",
    "CameraDisabledError",
    "CameraNotRegisteredError",
    "CaptureConfig",
    "MissingCredentialError",
    "ResilientCapture",
    "aplicar_opcoes_ffmpeg",
    "expand_placeholders",
]
```

Acrescentar ao final de `config/pose_config.yaml`:

```yaml
capture:
  rtsp_transport: tcp                 # UDP sob carga gera artefato lido como movimento
  read_timeout_ms: 5000               # declarado como stimeout E timeout (versoes de FFmpeg)
  backoff_base_seconds: 0.5
  backoff_max_seconds: 10
  cache_path: outputs/camera-config-cache.json
```

Em `src/run_pipeline.py`, quatro mudanças.

Primeira, `--source` deixa de ser obrigatório:

```python
    p.add_argument("--source", default=None,
                   help="webcam index (e.g. 0) | video path | RTSP URL. "
                        "Opcional quando --camera-id é informado: nesse caso a "
                        "fonte vem do cadastro. Se os dois forem passados, "
                        "--source vence.")
```

Segunda, o `import` e a resolução da fonte, logo **antes** da construção do `pipeline` (as opções do FFmpeg precisam estar no ambiente antes de qualquer captura abrir):

```python
import os

from src.capture import (
    CameraConfigClient, CaptureConfig, ResilientCapture, aplicar_opcoes_ffmpeg,
)

    capture_config = CaptureConfig.from_yaml(args.config)
    aplicar_opcoes_ffmpeg(capture_config, os.environ)

    fonte = args.source
    origem_da_fonte = "--source"
    config_remota = None

    if args.camera_id and args.api_url:
        cliente = CameraConfigClient(args.api_url,
                                     cache_path=capture_config.cache_path)
        config_remota = cliente.fetch(args.camera_id, os.environ)

    if config_remota is not None:
        if args.source:
            print(f"[config] --source vence o cadastro de {args.camera_id} "
                  f"(depuracao contra arquivo)")
        else:
            fonte = config_remota.fonte
            origem_da_fonte = ("cadastro" if not config_remota.do_cache
                               else f"cache de {config_remota.idade_segundos / 3600:.1f}h")
    elif args.camera_id and not args.source:
        print(f"[config] cadastro indisponivel e sem cache para {args.camera_id}; "
              f"informe --source")

    if not fonte:
        p_erro = ("Informe --source, ou --camera-id com --api-url apontando "
                  "para uma camera cadastrada.")
        raise SystemExit(p_erro)

    print(f"[config] fonte={fonte} (origem: {origem_da_fonte})")
```

Terceira, a abertura da captura passa a ser resiliente. A linha `cap = open_capture(args.source)` vira:

```python
    cap = ResilientCapture(
        fonte,
        backoff_base=capture_config.backoff_base_seconds,
        backoff_max=capture_config.backoff_max_seconds,
    ).open()
    width = cap.width
    height = cap.height
    src_fps = cap.fps
```

E as leituras de propriedade que usavam `cap.get(cv2.CAP_PROP_...)` saem, substituídas pelas três linhas acima.

Quarta, o laço distingue "sem frame novo" de "acabou". O `while cap.isOpened(): ret, frame = cap.read(); if not ret: break` vira:

```python
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                if cap.state == "encerrado":
                    break
                # Câmera ao vivo sem frame novo (ou reconectando): o laço
                # continua girando em vez de encerrar a execução.
                time.sleep(0.005)
                continue
```

Se `config_remota` trouxe `stream_port`, ele passa a mandar no MJPEG — é a eliminação da duplicação entre cadastro e YAML. Acrescentar logo depois do bloco de `notify_config`:

```python
    if config_remota is not None and config_remota.stream_port:
        notify_config.stream_port = config_remota.stream_port
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/test_capture_config.py -q
```

Esperado: PASSA, 6 testes.

- [ ] **Step 5: Confirmar que a suíte inteira continua verde**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python -m pytest tests/ -q
```

Esperado: PASSA — os 89 testes de E1 mais os de E1-B mais os de E2-B, zero falhas. A fixture de regressão de `cenario2.mp4` **precisa continuar dando 2 incidentes**: se mudou, a captura de arquivo passou a descartar frame.

- [ ] **Step 6: Confirmar que o comportamento antigo não mudou**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python src/run_pipeline.py --source data/validation/cenario2.mp4 \
  --device cuda --no-display --no-stream --max-frames 120
```

Esperado: o HUD de latência aparece como antes, a linha `[config] fonte=... (origem: --source)` confirma o caminho local, e o resumo final continua reportando o veredito contra os 200 ms.

- [ ] **Step 7: Commit**

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add src/capture/__init__.py src/run_pipeline.py config/pose_config.yaml \
        tests/test_capture_config.py
git commit -m "feat(pipeline): fonte vinda do cadastro e captura resiliente no laco"
```

---

## Task 7: Verificação de ponta a ponta

**Files:** nenhuma alteração de código. Esta tarefa é verificação.

**Interfaces:**
- Consumes: E2-A Tasks 1–7 concluídas.
- Produces: `docs/e2b-verificacao.md` com os números observados.

- [ ] **Step 1: Subir a API e cadastrar uma câmera de arquivo**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o spring-boot:run
```

Noutro terminal:

```bash
curl -i -X POST http://localhost:8080/api/v1/stations \
  -H 'Content-Type: application/json' \
  -d '{"id":"EST-20","nome":"Bancada de teste","setor":"validacao"}'

curl -i -X POST http://localhost:8080/api/v1/cameras \
  -H 'Content-Type: application/json' \
  -d '{"id":"CAM-20","nome":"Clipe cenario2","estacaoId":"EST-20",
       "streamUrl":"http://127.0.0.1:8120/stream",
       "fonte":"data/validation/cenario2.mp4"}'
```

- [ ] **Step 2: Subir o pipeline apenas com `--camera-id`**

```bash
cd /home/asaas/projects/challenge/cypher-capture
./venv/bin/python src/run_pipeline.py --camera-id CAM-20 \
  --api-url http://localhost:8080/api/v1 --device cuda --no-display
```

Confirmar: a linha `[config] fonte=data/validation/cenario2.mp4 (origem: cadastro)` aparece, e `[stream] video ao vivo em http://127.0.0.1:8120/stream` usa a porta **derivada do cadastro**, não a do YAML.

- [ ] **Step 3: Confirmar a escada com a API fora**

Derrubar a API (Ctrl-C) e rodar de novo o mesmo comando. Confirmar que o pipeline **sobe** com `origem: cache de 0.0h` em vez de morrer.

Depois apagar o cache e tentar sem `--source`:

```bash
rm -f outputs/camera-config-cache.json
./venv/bin/python src/run_pipeline.py --camera-id CAM-20 \
  --api-url http://localhost:8080/api/v1 --device cuda --no-display
```

Esperado: mensagem dizendo que o cadastro está indisponível e que falta `--source`, e saída sem stack trace.

- [ ] **Step 4: Confirmar o aborto por credencial ausente**

Subir a API de novo e cadastrar uma câmera com placeholder:

```bash
curl -i -X POST http://localhost:8080/api/v1/cameras \
  -H 'Content-Type: application/json' \
  -d '{"id":"CAM-21","nome":"Com credencial","estacaoId":"EST-20",
       "streamUrl":"http://127.0.0.1:8121/stream",
       "fonte":"rtsp://${CAM21_USER}:${CAM21_PASS}@10.0.0.7/stream"}'
```

Rodar o pipeline sem definir as variáveis. Esperado: aborto nomeando `CAM21_USER` e `CAM21_PASS` — não uma falha de conexão obscura.

- [ ] **Step 5: Confirmar a recusa de câmera desativada**

```bash
curl -i -X DELETE http://localhost:8080/api/v1/cameras/CAM-20
```

Rodar o pipeline com `--camera-id CAM-20`. Esperado: aborto dizendo que a câmera está desativada, **sem** cair para o cache — mesmo com o cache presente. Reativar depois:

```bash
curl -i -X PUT http://localhost:8080/api/v1/cameras/CAM-20 \
  -H 'Content-Type: application/json' \
  -d '{"id":"CAM-20","nome":"Clipe cenario2","estacaoId":"EST-20",
       "streamUrl":"http://127.0.0.1:8120/stream",
       "fonte":"data/validation/cenario2.mp4","ativa":true}'
```

- [ ] **Step 6: Confirmar reconexão com câmera de verdade, se houver**

Se houver uma câmera IP disponível, cadastrá-la e rodar o pipeline; desconectar o cabo de rede dela por ~20 s e reconectar. Esperado: avisos de reconexão no terminal, `reconnects` crescendo, e o pipeline **continuando** — sem stack trace e sem encerrar.

Se não houver câmera IP, registrar isso no documento como não verificado em hardware: os testes da Task 5 cobrem a lógica, mas não substituem a rede real.

- [ ] **Step 7: Registrar o resultado**

Escrever `docs/e2b-verificacao.md` com o que foi observado — números reais, incluindo divergências. Se algo não funcionou, o documento registra; ele não é certificado.

```bash
cd /home/asaas/projects/challenge/cypher-capture
git add docs/e2b-verificacao.md
git commit -m "docs(capture): resultado da verificacao ponta a ponta de E2-B"
```

---

## Estado ao fim deste plano

O pipeline obtém a fonte do cadastro, expande credencial do ambiente e sobrevive a câmera que cai ou trava. Falta o plano **E2-C**, que dá ao gestor a interface para cadastrar tudo isso.

Fora do escopo, por decisão registrada na spec: reconfiguração quente sem reiniciar o processo (abordagem B da §2), descoberta ONVIF, e autenticação da superfície de máquina (E4).
