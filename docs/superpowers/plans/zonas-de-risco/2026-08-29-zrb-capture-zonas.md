# ZR-B — cypher-capture: Busca Remota de Zonas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `cypher-capture` passa a buscar zonas do backend (`ZR-A`) no boot, convertendo coordenadas normalizadas para pixel usando a resolução real do frame — substituindo, quando disponível, o arquivo local `config/zones/zones.json` sem quebrar quem ainda depende dele.

**Architecture:** Réplica do padrão já estabelecido por `CameraConfigClient` (`src/capture/config_client.py`), não uma abstração compartilhada forçada (spec §3.1): `ZoneConfigClient` novo implementa a mesma escada de degradação (API → cache normalizado → nada, cai para o arquivo local), convertendo normalizado→pixel a cada boot. Tarefa 1 dá a `ZoneManager` um jeito de receber zonas já prontas em memória, sem tocar no caminho de arquivo existente. Tarefa 2 entrega `ZoneConfigClient` isolado, testado sem rede. Tarefa 3 liga os dois em `run_pipeline.py`, no único ponto onde a resolução real do frame já é conhecida.

**Tech Stack:** Python 3.10, pytest, sem chamada de rede nos testes (transporte injetado, mesmo padrão de `test_camera_config_client.py`).

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-zonas-de-risco-design.md` (repo `cypher-front`), §3 (`cypher-capture`).

**Repositório:** `/home/asaas/projects/challenge/cypher-capture`

## Global Constraints

- Repositório: `/home/asaas/projects/challenge/cypher-capture`. Branch atual: verificar com `git branch --show-current` antes de ramificar; criar `feat/zr-capture-zonas` a partir do branch principal do repositório.
- **Depende do plano `2026-08-29-zra-backend-zonas.md`** — os testes desta entrega não tocam rede (transporte injetado), então não precisam do backend real rodando; só o roteiro de ponta a ponta (spec §9, item 4) precisa.
- **`ZoneManager`/`ZoneDetector` não mudam de comportamento** (spec §3.3) — a Tarefa 1 acrescenta um parâmetro opcional a `ZoneManager.__init__`, com o caminho de arquivo (`config_path`) preservado exatamente como está hoje quando esse parâmetro não é usado.
- **A conversão normalizado→pixel nunca é cacheada já convertida** — o cache (`outputs/zones-config-cache.json`) sempre guarda o valor normalizado; a conversão é refeita a cada boot com a resolução atual (spec §3.1/§5, "resolução muda entre execuções").
- **Zero zonas em qualquer nível da escada é aceito** — nenhuma exceção nova é levantada por `ZoneConfigClient` (diferente de `CameraConfigClient`, que tem `CameraDisabledError`/`CameraNotRegisteredError` — zona não tem conceito de "desativada no cadastro" barrando o boot, spec §5).
- **`annotate_zones.py` continua existindo, sem nenhuma mudança** (spec §8) — é o caminho totalmente offline, independente do backend.
- Run: `cd /home/asaas/projects/challenge/cypher-capture && source venv/bin/activate && python -m pytest tests/<arquivo>.py -v` para um arquivo; `python -m pytest -q` para a suíte inteira.

---

### Task 1: `ZoneManager` aceita zonas pré-carregadas

**Files:**
- Modify: `src/zones/manager.py`
- Test: `tests/test_zone_manager.py` (novo — não existe teste de `ZoneManager` hoje, confirmado por grep)

**Interfaces:**
- Produces: `ZoneManager(config_path=..., zones=None)` — quando `zones` é uma lista, `ZoneManager` a usa diretamente, sem tocar em disco; consumido pela Tarefa 3

- [ ] **Step 1: Escrever o teste**

Criar `tests/test_zone_manager.py`:

```python
"""
Testes de ZoneManager (src/zones/manager.py) — cobrindo o construtor com
zonas pré-carregadas em memória, adicionado para a busca remota (design doc
de zonas de risco, §3.1). O caminho por arquivo já existia sem testes
dedicados; não é reescrito aqui, só preservado.
"""
from __future__ import annotations

from src.zones.manager import Zone, ZoneManager


def test_zones_pre_carregadas_nao_tocam_arquivo(tmp_path):
    caminho_inexistente = tmp_path / "nao-existe" / "zones.json"
    zona = Zone.new("Area da prensa", "restricted", [(100.0, 100.0), (400.0, 100.0), (400.0, 400.0)])

    manager = ZoneManager(str(caminho_inexistente), zones=[zona])

    assert manager.get_all() == [zona]
    assert not caminho_inexistente.exists()


def test_sem_zones_cai_no_carregamento_por_arquivo_como_antes(tmp_path):
    caminho = tmp_path / "zones.json"
    manager_para_gravar = ZoneManager(str(caminho))
    manager_para_gravar.add(Zone.new("Zona X", "attention", [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0)]))

    manager_lido = ZoneManager(str(caminho))

    assert len(manager_lido.get_all()) == 1
    assert manager_lido.get_all()[0].name == "Zona X"


def test_zones_pre_carregadas_indexam_por_zone_id_como_o_carregamento_por_arquivo(tmp_path):
    z1 = Zone.new("A", "restricted", [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)])
    z2 = Zone.new("B", "attention", [(2.0, 2.0), (3.0, 2.0), (3.0, 3.0)])

    manager = ZoneManager(str(tmp_path / "zones.json"), zones=[z1, z2])

    assert {z.zone_id for z in manager.get_all()} == {z1.zone_id, z2.zone_id}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_zone_manager.py -v`
Expected: FAIL — `ZoneManager.__init__` ainda não aceita o argumento `zones`.

- [ ] **Step 3: Adicionar o parâmetro**

Em `src/zones/manager.py`, alterar o construtor:

```python
class ZoneManager:
    """Manages critical zone definitions with JSON persistence.

    Aceita zonas ja resolvidas em memoria (``zones=``), usadas quando o
    cliente remoto de configuracao (``ZoneConfigClient``, design doc de
    zonas de risco §3.1) ja converteu normalizado->pixel com a resolucao
    real do frame — nesse caso nada e lido nem gravado em disco.
    """

    def __init__(self, config_path: str = "config/zones/zones.json",
                 zones: list[Zone] | None = None) -> None:
        self._path = Path(config_path)
        self._zones: dict[str, Zone] = {}
        if zones is not None:
            for z in zones:
                self._zones[z.zone_id] = z
        elif self._path.exists():
            self._load()
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_zone_manager.py -v`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/zones/manager.py tests/test_zone_manager.py
git commit -m "feat: ZoneManager aceita zonas pre-carregadas em memoria, sem tocar disco"
```

---

### Task 2: `ZoneConfigClient` — escada de degradação com conversão normalizado→pixel

**Files:**
- Create: `src/zones/config_client.py`
- Modify: `src/zones/__init__.py`
- Test: `tests/test_zone_config_client.py`

**Interfaces:**
- Produces: `ZoneConfigClient(api_url, cache_path=..., transport=..., now=...)`, `.fetch(camera_id, width, height) -> Optional[list[Zone]]` — consumido pela Tarefa 3

- [ ] **Step 1: Escrever os testes da escada de degradação**

Criar `tests/test_zone_config_client.py`:

```python
"""
Testes de ZoneConfigClient (src/zones/config_client.py).

O que está sendo protegido: a escada de degradação (API -> cache -> nada) e a
conversão normalizado->pixel usando a resolução real do frame — a mesma zona
normalizada precisa produzir polígonos corretos em resoluções diferentes
(design doc de zonas de risco, §3.1/§6). Nenhum teste toca rede: o
transporte é injetado, mesmo padrão de test_camera_config_client.py.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from src.zones.config_client import ZoneConfigClient

AGORA = datetime(2026, 8, 29, 12, 0, 0, tzinfo=timezone.utc)

CORPO_API = [
    {
        "id": 1,
        "nome": "Area da prensa",
        "zoneType": "RESTRICTED",
        "polygon": [{"x": 0.25, "y": 0.25}, {"x": 0.75, "y": 0.25}, {"x": 0.75, "y": 0.75}],
        "severity": 4,
        "requiredPpe": ["capacete"],
    },
]


class TransporteFake:
    def __init__(self, status=200, corpo=None, erro=None):
        self.status = status
        self.corpo = corpo if corpo is not None else CORPO_API
        self.erro = erro
        self.urls: list[str] = []

    def get_json(self, url):
        self.urls.append(url)
        if self.erro is not None:
            raise self.erro
        return self.status, self.corpo


def cliente(tmp_path, transporte, **kwargs):
    return ZoneConfigClient(
        "http://api/api/v1",
        cache_path=str(tmp_path / "zones-cache.json"),
        transport=transporte,
        now=lambda: AGORA,
        **kwargs,
    )


def test_busca_no_endpoint_de_config_de_zonas_da_camera(tmp_path):
    transporte = TransporteFake()

    cliente(tmp_path, transporte).fetch("CAM-01", 1280, 720)

    assert transporte.urls == ["http://api/api/v1/cameras/CAM-01/zones/config"]


def test_converte_normalizado_para_pixel_usando_a_resolucao_informada(tmp_path):
    zonas = cliente(tmp_path, TransporteFake()).fetch("CAM-01", 1280, 720)

    assert len(zonas) == 1
    z = zonas[0]
    assert z.zone_id == "1"
    assert z.name == "Area da prensa"
    assert z.zone_type == "restricted"
    assert z.polygon == [(320.0, 180.0), (960.0, 180.0), (960.0, 540.0)]
    assert z.severity == 4
    assert z.required_ppe == ["capacete"]


def test_mesma_zona_normalizada_produz_poligono_diferente_em_outra_resolucao(tmp_path):
    zonas_720p = cliente(tmp_path, TransporteFake()).fetch("CAM-01", 1280, 720)
    zonas_1080p = cliente(tmp_path, TransporteFake()).fetch("CAM-01", 1920, 1080)

    assert zonas_720p[0].polygon == [(320.0, 180.0), (960.0, 180.0), (960.0, 540.0)]
    assert zonas_1080p[0].polygon == [(480.0, 270.0), (1440.0, 270.0), (1440.0, 810.0)]


def test_grava_cache_normalizado_nao_convertido(tmp_path):
    transporte = TransporteFake()
    cache_path = tmp_path / "zones-cache.json"

    ZoneConfigClient("http://api/api/v1", cache_path=str(cache_path),
                     transport=transporte, now=lambda: AGORA).fetch("CAM-01", 1280, 720)

    gravado = json.loads(cache_path.read_text())
    assert gravado["CAM-01"]["zones"] == CORPO_API


def test_api_fora_usa_cache_e_converte_com_a_resolucao_atual(tmp_path):
    cache_path = tmp_path / "zones-cache.json"
    cache_path.write_text(json.dumps({
        "CAM-01": {"fetched_at": AGORA.isoformat(), "zones": CORPO_API},
    }))

    zonas = ZoneConfigClient("http://api/api/v1", cache_path=str(cache_path),
                            transport=TransporteFake(erro=ConnectionError("fora do ar")),
                            now=lambda: AGORA + timedelta(hours=2)).fetch("CAM-01", 640, 360)

    assert zonas[0].polygon == [(160.0, 90.0), (480.0, 90.0), (480.0, 270.0)]


def test_api_fora_sem_cache_devolve_none(tmp_path):
    zonas = cliente(tmp_path, TransporteFake(erro=ConnectionError("fora do ar"))).fetch("CAM-01", 1280, 720)

    assert zonas is None


def test_zero_zonas_e_aceito(tmp_path):
    zonas = cliente(tmp_path, TransporteFake(corpo=[])).fetch("CAM-01", 1280, 720)

    assert zonas == []


def test_status_inesperado_da_api_sem_cache_devolve_none(tmp_path):
    zonas = cliente(tmp_path, TransporteFake(status=500, corpo={})).fetch("CAM-01", 1280, 720)

    assert zonas is None
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_zone_config_client.py -v`
Expected: FAIL na coleta — `src/zones/config_client.py` não existe.

- [ ] **Step 3: Criar `ZoneConfigClient`**

Criar `src/zones/config_client.py`:

```python
"""
Zonas de risco vindas do cadastro remoto (design doc de zonas de risco, §3.1).

Réplica deliberada do padrão de ``src/capture/config_client.py``
(``CameraConfigClient``), não uma abstração compartilhada — zona e câmera são
conceitos independentes o bastante para não forçar uma base comum. A
diferença central: aqui SEMPRE há conversão de coordenada (normalizado ->
pixel), porque o backend nunca abre a câmera e não tem como saber a
resolução real do frame; quem converte é este cliente, com a resolução que
o processo já tem em mãos depois de abrir a captura.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional, Protocol

from .manager import Zone

log = logging.getLogger(__name__)


class ZoneConfigTransport(Protocol):
    def get_json(self, url: str) -> tuple[int, object]: ...


class RequestsZoneConfigTransport:
    """Transporte real. Importa requests preguiçosamente para manter os
    testes livres da dependência."""

    def __init__(self, timeout: float = 5.0) -> None:
        self.timeout = timeout

    def get_json(self, url: str) -> tuple[int, object]:
        import requests
        resposta = requests.get(url, timeout=self.timeout)
        try:
            corpo = resposta.json()
        except ValueError:
            corpo = []
        return resposta.status_code, corpo


class ZoneConfigClient:
    """Escada de degradação da spec §3.1:

    1. API responde   -> converte normalizado->pixel com a resolução atual, grava cache normalizado
    2. API fora, cache -> converte o cache (normalizado) com a resolução atual
    3. sem cache      -> None; o chamador cai para o arquivo local (pixel absoluto, já existente hoje)

    Zero zonas em qualquer nível é aceito (spec §5) — nenhuma exceção
    própria, diferente de CameraConfigClient (zona não tem "desativada no
    cadastro" barrando o boot).
    """

    def __init__(self, api_url: str,
                 cache_path: str = "outputs/zones-config-cache.json",
                 transport: Optional[ZoneConfigTransport] = None,
                 now: Optional[Callable[[], datetime]] = None) -> None:
        self.api_url = api_url.rstrip("/")
        self.cache_path = Path(cache_path)
        self.transport = transport or RequestsZoneConfigTransport()
        self._now = now or (lambda: datetime.now(timezone.utc))

    def fetch(self, camera_id: str, width: int, height: int) -> Optional[list[Zone]]:
        bruto = self._da_api(camera_id)
        if bruto is not None:
            self._gravar_cache(camera_id, bruto)
            return self._converter(bruto, width, height)

        bruto_cache = self._do_cache(camera_id)
        if bruto_cache is None:
            return None
        return self._converter(bruto_cache, width, height)

    # ------------------------------------------------------------------
    # Internos
    # ------------------------------------------------------------------

    def _da_api(self, camera_id: str) -> Optional[list[dict]]:
        url = f"{self.api_url}/cameras/{camera_id}/zones/config"
        try:
            status, corpo = self.transport.get_json(url)
        except Exception as falha:
            log.warning("Zonas de %s indisponiveis na API: %s", camera_id, falha)
            return None

        if status == 200:
            return corpo
        log.warning("Zonas de %s: API respondeu %s", camera_id, status)
        return None

    def _converter(self, bruto: list[dict], width: int, height: int) -> list[Zone]:
        zonas: list[Zone] = []
        for item in bruto:
            polygon_px = [(p["x"] * width, p["y"] * height) for p in item["polygon"]]
            zonas.append(Zone(
                zone_id=str(item["id"]),
                name=item["nome"],
                zone_type=item["zoneType"].lower(),
                polygon=polygon_px,
                severity=item["severity"],
                required_ppe=item.get("requiredPpe") or [],
            ))
        return zonas

    def _gravar_cache(self, camera_id: str, bruto: list[dict]) -> None:
        try:
            tudo = self._ler_cache_bruto()
            tudo[camera_id] = {"fetched_at": self._now().isoformat(), "zones": bruto}
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(json.dumps(tudo, indent=2))
        except OSError as erro:
            log.warning("Nao foi possivel gravar o cache de zonas: %s", erro)

    def _do_cache(self, camera_id: str) -> Optional[list[dict]]:
        registro = self._ler_cache_bruto().get(camera_id)
        if not registro:
            return None
        return registro.get("zones", [])

    def _ler_cache_bruto(self) -> dict:
        if not self.cache_path.exists():
            return {}
        try:
            return json.loads(self.cache_path.read_text()) or {}
        except (OSError, json.JSONDecodeError):
            log.warning("Cache de zonas ilegivel, ignorando: %s", self.cache_path)
            return {}
```

- [ ] **Step 4: Exportar `ZoneConfigClient` em `src/zones/__init__.py`**

```python
from .config_client import ZoneConfigClient
from .manager import ZoneManager, Zone
from .detector import ZoneDetector, ZoneResult, ZoneStatus

__all__ = ["ZoneManager", "Zone", "ZoneDetector", "ZoneResult", "ZoneStatus", "ZoneConfigClient"]
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_zone_config_client.py -v`
Expected: PASS

- [ ] **Step 6: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/zones/config_client.py src/zones/__init__.py tests/test_zone_config_client.py
git commit -m "feat: adiciona ZoneConfigClient, escada de degradacao com conversao normalizado-pixel"
```

---

### Task 3: Ligação em `run_pipeline.py`

**Files:**
- Modify: `src/capture/__init__.py`
- Modify: `src/run_pipeline.py`
- Test: `tests/test_run_pipeline_config.py`

**Interfaces:**
- Consumes: `ZoneConfigClient.fetch` (Tarefa 2), `ZoneManager(config_path, zones=...)` (Tarefa 1)
- Produces: `resolver_zonas(cliente, camera_id, width, height)` — testável isoladamente, mesmo padrão de `resolver_config_remota`

- [ ] **Step 1: Escrever o teste do helper de resolução**

Adicionar em `tests/test_run_pipeline_config.py`:

```python
from src.run_pipeline import resolver_zonas
from src.zones.manager import Zone


class ClienteZonasFake:
    def __init__(self, zonas=None):
        self.zonas = zonas
        self.chamadas: list[tuple[str, int, int]] = []

    def fetch(self, camera_id, width, height):
        self.chamadas.append((camera_id, width, height))
        return self.zonas


def test_resolver_zonas_devolve_o_que_o_cliente_busca():
    zona = Zone.new("A", "restricted", [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)])
    cliente = ClienteZonasFake(zonas=[zona])

    resultado = resolver_zonas(cliente, "CAM-01", 1280, 720)

    assert resultado == [zona]
    assert cliente.chamadas == [("CAM-01", 1280, 720)]


def test_resolver_zonas_devolve_none_quando_o_cliente_nao_tem_nada():
    cliente = ClienteZonasFake(zonas=None)

    resultado = resolver_zonas(cliente, "CAM-01", 1280, 720)

    assert resultado is None


def test_resolver_zonas_aceita_lista_vazia_sem_virar_none():
    cliente = ClienteZonasFake(zonas=[])

    resultado = resolver_zonas(cliente, "CAM-01", 1280, 720)

    assert resultado == []
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_run_pipeline_config.py -v`
Expected: FAIL na coleta — `resolver_zonas` não existe em `src/run_pipeline.py`.

- [ ] **Step 3: Adicionar `zones_cache_path` a `CaptureConfig`**

Em `src/capture/__init__.py`:

```python
@dataclass
class CaptureConfig:
    """Seção `capture` do pose_config.yaml. Chaves desconhecidas são
    ignoradas, seguindo o contrato de PipelineConfig.from_yaml."""

    rtsp_transport: str = "tcp"
    read_timeout_ms: int = 5000
    backoff_base_seconds: float = 0.5
    backoff_max_seconds: float = 10.0
    cache_path: str = "outputs/camera-config-cache.json"
    zones_cache_path: str = "outputs/zones-config-cache.json"
```

- [ ] **Step 4: Adicionar `resolver_zonas` e ligar em `main()`**

Em `src/run_pipeline.py`, adicionar os imports:

```python
from src.zones import ZoneConfigClient, ZoneDetector, ZoneManager, Zone
```

Adicionar a função, ao lado de `resolver_config_remota`:

```python
def resolver_zonas(cliente: ZoneConfigClient, camera_id: str,
                   width: int, height: int) -> Optional[list[Zone]]:
    """Busca zonas remotas convertidas para a resolucao real do frame.

    None quando API e cache nao tem nada — o chamador mantem as zonas do
    arquivo local (config.zones_config) sem interrupcao (design doc de
    zonas de risco, §3.1, degrau 3). Diferente de resolver_config_remota,
    nao ha excecao de dominio a distinguir: zero zonas e sempre aceito.
    """
    return cliente.fetch(camera_id, width, height)
```

(adicionar `Optional` ao import já existente de `typing`, se necessário.)

Em `main()`, logo depois do bloco que lê `width`/`height` da captura (`width = cap.width` / `height = cap.height`):

```python
    if args.camera_id and args.api_url:
        zone_cliente = ZoneConfigClient(args.api_url, cache_path=capture_config.zones_cache_path)
        zonas_remotas = resolver_zonas(zone_cliente, args.camera_id, width, height)
        if zonas_remotas is not None:
            pipeline._zones = ZoneManager(config.zones_config, zones=zonas_remotas)
            pipeline._zone_detector = ZoneDetector(pipeline._zones, config.approach_buffer_px)
            print(f"[zones]  {len(zonas_remotas)} zone(s) resolved remotely for {width}x{height}")
```

(`pipeline._zones`/`pipeline._zone_detector` são atributos de instância comuns do Python, sem controle de acesso real — reatribuí-los aqui é o mesmo tipo de acoplamento que `print(f"[zones]  {len(pipeline._zones.get_all())} zone(s) loaded")`, já presente em `main()`, já pratica.)

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest tests/test_run_pipeline_config.py -v`
Expected: PASS

- [ ] **Step 6: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/challenge/cypher-capture && python -m pytest -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/capture/__init__.py src/run_pipeline.py tests/test_run_pipeline_config.py
git commit -m "feat: resolve zonas remotamente apos abrir a captura, convertendo para a resolucao real"
```

---

## Self-Review

**Cobertura da spec:** §3.1 (`ZoneConfigClient`, três degraus) → Tarefa 2. §3.2 (conversão no pipeline) → `ZoneConfigClient._converter`, chamado só depois que `width`/`height` são conhecidos (Tarefa 3). §3.3 (`ZoneManager`/`ZoneDetector` não mudam) → Tarefa 1 só acrescenta um parâmetro opcional, comportamento por arquivo idêntico. §3.4 (sem hot-reload) → nenhuma tarefa deste plano introduz comunicação em tempo real; a zona resolvida vale só para o boot corrente. §5 "resolução muda entre execuções" → testado explicitamente (`test_mesma_zona_normalizada_produz_poligono_diferente_em_outra_resolucao`). §6 "Python" (estratégia de testes) → coberta pelas três tarefas (escada completa, conversão em duas resoluções, `ZoneDetector`/`ZoneManager` sem mudança de comportamento).

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** `Zone` (de `src.zones.manager`, já existente) é o tipo de retorno de `ZoneConfigClient.fetch`/`resolver_zonas`, sem um tipo paralelo novo — mesma entidade que `ZoneManager`/`ZoneDetector` já consomem.

**Fora de escopo confirmado:** `annotate_zones.py` não é tocado por nenhuma tarefa — continua existindo como caminho offline (spec §8).

---

**Plan complete and saved to `docs/superpowers/plans/zonas-de-risco/2026-08-29-zrb-capture-zonas.md`.**
