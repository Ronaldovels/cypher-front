# Cypher — Orquestrador de pipelines (`cypher-capture`)

**Data:** 2026-09-03
**Status:** aprovado (design)
**Escopo:** introduzir um orquestrador no `cypher-capture` que sobe/derruba/reinicia automaticamente um processo de pipeline por câmera cadastrada, eliminando a necessidade de subir cada `run_pipeline.py` manualmente ao cadastrar uma câmera nova pela interface.

**Depende de:** Multi-tenant (Empresa) — `2026-08-29-multi-tenant-design.md` — não pelo modelo de dados, mas porque a conta de serviço do orquestrador precisa ser um `Usuario` GESTOR de um tenant específico, e `GET /api/v1/cameras` já vem escopado por `empresaId` desde essa entrega.

Este documento nasceu de uma dúvida levantada durante o teste manual ponta a ponta de multi-tenant (2026-09-03): ao cadastrar uma câmera pela interface, ela não aparece automaticamente rodando no pipeline — é preciso subir `run_pipeline.py --camera-id ...` manualmente, um processo por câmera, sem nenhum mecanismo hoje que descubra câmeras novas ou reinicie as que caem.

---

## 1. Contexto e diagnóstico

### 1.1 Estado atual

- `src/run_pipeline.py` é **um processo por câmera**: recebe `--camera-id` e `--api-url`, busca a config da câmera uma única vez no boot via `CameraConfigClient.fetch()` (`resolver_config_remota`, chamado dentro de `main()`, antes do loop de captura) e nunca mais consulta o backend por config durante a execução — sem polling, sem watch.
- Não existe nenhum mecanismo de orquestração no repositório: sem `docker-compose`, sem `Procfile`, sem `supervisord`, sem `multiprocessing`/`subprocess.Popen` em lugar nenhum do código hoje. Subir múltiplas câmeras é 100% manual — um terminal (ou `nohup`/nohup/systemd) por câmera.
- Cada câmera já tem `streamPort` derivado do próprio `streamUrl` cadastrado (`CameraConfigResponse.streamPort`, comentário no código: "elimina a duplicação em que a porta era declarada em dois arquivos") — isso já evita colisão de porta do MJPEG entre processos diferentes, sem esforço extra.
- Já existe um padrão pronto de autenticação de automação: `src/capture/apikey_provisioning.py` (`ApiKeyProvisioner`) loga como GESTOR uma vez via `POST /auth/login`, usando `CYPHER_GESTOR_USER`/`CYPHER_GESTOR_PASSWORD` do `.env` do host (nunca em texto puro no YAML), mantendo a sessão por cookie numa única `requests.Session`. Esse padrão é reaproveitado por este design, não reinventado.
- `GET /api/v1/cameras` (e `/api/v1/stations`) exige `hasAnyRole("GESTOR", "OPERADOR")` — mas só GESTOR loga por usuário/senha (`POST /auth/login`); OPERADOR loga por token de estação (`POST /auth/login-estacao`), sem par usuário/senha. Logo, a automação só pode ser um GESTOR.
- Desde a entrega de multi-tenant, `GET /api/v1/cameras` já devolve só as câmeras do tenant da sessão autenticada — o orquestrador herda esse isolamento de graça, sem precisar de nenhum código novo de escopo.

### 1.2 Por que um supervisor Python simples, e não outras formas

| Abordagem | Avaliação |
|---|---|
| **A. Supervisor Python no próprio `cypher-capture`, `subprocess.Popen` + polling** | **Escolhida.** Menor incremento sobre o que já existe — reaproveita o padrão de login do `ApiKeyProvisioner`, o backoff de reconexão já existente em `CaptureConfig`, e o padrão de arquivo-cache (`outputs/*.json`) já usado em dois lugares do repositório. Zero dependência nova. |
| B. `supervisord` externo, config gerada dinamicamente | Rejeitada por ora. Ganha restart/backoff prontos, mas adiciona uma peça de infraestrutura nova pra operar (processo `supervisord` à parte) sem eliminar a lógica de reconciliação que este design precisa de qualquer forma — só trocaria "dict de `Popen`" por "chamadas RPC ao `supervisorctl`". |
| C. Um container Docker por câmera (ou por tenant) | Rejeitada por ora, mas é a evolução natural quando a arquitetura de deploy em nuvem for definida (ver §9). Resolveria limite de recurso via cgroups em vez de contador manual, e mapeia melhor pra um host central multi-tenant — mas exige containerizar o `cypher-capture` agora (não existe `Dockerfile`), GPU passthrough (`nvidia-container-toolkit`) e rede pra RTSP dentro do container: trabalho de infraestrutura real, prematuro para o estágio atual (protótipo rodando localmente). |

### 1.3 Restrição de design: orquestrador é sempre mono-tenant

**Uma instância do orquestrador gerencia as câmeras de uma única empresa.** Não existe (e não é objetivo deste design) um orquestrador central que enxergue múltiplos tenants numa mesma sessão. Isso é consequência direta de como a conta de serviço funciona: o orquestrador loga como um GESTOR específico (`orquestrador@<empresaId>`), e `GET /api/v1/cameras` só devolve o catálogo daquele tenant.

Duas topologias de deploy decorrem disso, nenhuma delas implementada por este design (ver §9):
- **On-premise** (cada empresa cliente roda o `cypher-capture` na própria infraestrutura, perto das próprias câmeras): "1 orquestrador por empresa" já é automático — é literalmente uma máquina física diferente por cliente.
- **Host central multi-tenant** (vocês operam um servidor recebendo streams de várias empresas): exigiria rodar N processos de orquestrador nesse host (um por tenant ativo), cada um com sua própria conta de serviço e sua própria faixa de portas — isso é trabalho de infraestrutura de deploy, não deste design.

---

## 2. Componentes

Novo módulo `src/orchestrator/` no `cypher-capture`, com três peças, cada uma testável isoladamente:

### 2.1 `OrchestratorSession`

Mantém a sessão HTTP autenticada como o GESTOR de serviço pelo tempo de vida inteiro do orquestrador (diferente do `ApiKeyProvisioner`, que loga uma vez e descarta — aqui a sessão precisa sobreviver ao polling contínuo).

```python
class OrchestratorSession:
    def __init__(self, api_url: str, transport: SessionTransport) -> None: ...

    def login(self, username: str, password: str) -> None:
        """Chamado uma vez no boot. Falha fatal (MissingGestorCredentialError-like)
        se as credenciais forem invalidas ou ausentes do ambiente."""

    def listar_cameras(self) -> list[CameraDesejada]:
        """GET /api/v1/cameras. Em caso de 401, tenta um re-login automatico e
        repete a chamada uma vez; se o re-login tambem falhar, propaga
        CatalogoInacessivelError (o Reconciler decide o que fazer com isso)."""
```

`SessionTransport` é injetável (mesmo `Protocol` que `ProvisioningTransport` já estabelece em `apikey_provisioning.py`) — nenhum teste bate em rede real.

### 2.2 `ProcessRegistry`

Sabe o estado real (processos rodando) e o histórico recente (backoff), e persiste o mínimo necessário pra sobreviver a um restart do próprio orquestrador (§2.4).

```python
@dataclass
class ProcessoGerenciado:
    camera_id: str
    stream_url: str          # com que URL o processo foi iniciado
    processo: Popen
    ultima_tentativa: datetime
    tentativas_consecutivas: int  # para o calculo de backoff

class ProcessRegistry:
    def __init__(self, launcher: ProcessLauncher, state_path: str) -> None: ...

    def esta_vivo(self, camera_id: str) -> bool: ...
    def precisa_reiniciar_por_config(self, camera_id: str, stream_url_atual: str) -> bool: ...
    def iniciar(self, camera_id: str, api_url: str) -> None: ...
    def encerrar(self, camera_id: str) -> None: ...   # SIGTERM, escalona pra SIGKILL apos prazo curto
    def limpar_orfaos_do_boot_anterior(self) -> None: ...  # ver 2.4
```

`ProcessLauncher` é injetável (um `Protocol` com `iniciar(args) -> ProcessoLike`, onde `ProcessoLike` expõe `.pid`/`.poll()`/`.terminate()`/`.kill()`) — testes usam um dublê controlável, nunca sobem um processo Python de verdade.

### 2.3 `Reconciler`

O coração da lógica — puro o suficiente pra testar em isolamento com dublês de sessão e registro.

A cada `intervalo` segundos:

1. **Busca o desejado** — `sessao.listar_cameras()`, filtra só `ativa=true`. Se a chamada levantar `CatalogoInacessivelError`, aborta o ciclo inteiro sem tocar em nenhum processo (fail-safe — ver §6) e loga um aviso.
2. **Encerra o que saiu do desejado** — todo `camera_id` tracked que não está mais na lista (desativada ou deletada) → `registry.encerrar(camera_id)`.
3. **Detecta mudança de config** — todo `camera_id` presente nos dois lados cuja `streamUrl` atual difere da que o processo rodando foi iniciado com → `registry.encerrar` + marca para reiniciar no passo 5.
4. **Detecta processo morto** — todo `camera_id` tracked cujo `Popen.poll()` não é mais `None` → aplica o backoff exponencial já existente em `CaptureConfig` (`backoff_base_seconds`/`backoff_max_seconds`, do mesmo `pose_config.yaml` — não introduz configuração nova) antes de marcar para reiniciar.
5. **Sobe o que falta** — lista final de "precisa iniciar" (novo + mudou de config + morreu e passou do backoff), ordenada por `camera_id`. Conta quantos processos estão **de fato vivos agora** (não conta os recém-marcados para encerrar nos passos 2-3 — assim uma câmera que teve a URL trocada libera a própria vaga antes de tentar resubir) e inicia até `max_concorrentes - <vivos>`. O excedente não vira estado novo — é simplesmente retentado no próximo ciclo.
6. **Loga um resumo** do ciclo (rodando / na fila / reiniciadas) — observabilidade via log, sem storage adicional.

### 2.4 Persistência de estado — sobrevivendo a um restart do orquestrador

Um `ProcessRegistry` puramente em memória tem um problema real: se o **orquestrador** cair e reiniciar, ele esquece que já tinha subido processos — tentaria iniciar um segundo processo para cada câmera enquanto o antigo (órfão, mas vivo) continua rodando. Resultado: ingestão duplicada de incidentes e colisão de porta MJPEG.

Por isso o `ProcessRegistry` grava `outputs/orchestrator-state.json` (`camera_id → pid`) a cada início/parada de processo — mesmo padrão de arquivo-cache que `ApiKeyProvisioner`/`CameraConfigClient` já usam. **No boot**, antes de entrar no loop de reconciliação, `limpar_orfaos_do_boot_anterior()` lê esse arquivo e, para cada PID registrado, checa se ainda está vivo (`os.kill(pid, 0)` ou equivalente) — se estiver, mata antes de começar do zero. Garante que nunca existem dois processos para a mesma câmera, mesmo depois de um crash do orquestrador.

---

## 3. Autenticação do orquestrador

- Conta de serviço dedicada — **não** a credencial pessoal de um humano. Cadastrada uma vez em `/config/equipe` pelo gestor mestre daquele tenant (ex.: `orquestrador@acme`), com senha própria.
- Credenciais entram via `CYPHER_GESTOR_USER`/`CYPHER_GESTOR_PASSWORD` no `.env` do host — as **mesmas** variáveis que `ApiKeyProvisioner` já usa, sem introduzir um terceiro nome de variável para o mesmo conceito.
- Falha de login no boot é fatal — sem sessão, não há o que reconciliar. Segue a mesma filosofia de `MissingGestorCredentialError`.
- 401 durante o polling → um re-login automático e uma nova tentativa da mesma chamada; se falhar de novo, é tratado como catálogo inacessível (§6) — não derruba o orquestrador.

---

## 4. Configuração e CLI

Segue o estilo de `argparse` já usado por `run_pipeline.py`:

```
python -m src.orchestrator \
  --api-url http://localhost:8080/api/v1 \
  --intervalo 30 \
  --max-concorrentes 2
```

- `--intervalo`: segundos entre reconciliações (default 30).
- `--max-concorrentes`: teto de pipelines simultâneos nesse host (default 2 — conservador para uma GPU única compartilhada, ex.: o notebook de teste; ajustável por host conforme a capacidade real).
- Credenciais **não** entram por CLI — só por `.env`, mesma regra de segurança que `ApiKeyProvisioner` já aplica (nunca em texto puro em arquivo versionável).
- **Não existe flag de porta no orquestrador.** `Camera.streamUrl` (e a porta MJPEG que ele embute) é escolhido pelo GESTOR no cadastro da câmera, não computado pelo orquestrador — o backend garante unicidade só *dentro do mesmo tenant* (`exigirUrlLivre`, escopado por `empresaId`), de propósito, pensando no modelo on-premise onde cada tenant tem sua própria máquina. Ver §9 sobre a implicação disso ao testar dois tenants na mesma máquina física.

---

## 5. Fluxo por câmera (do cadastro ao vídeo processando)

1. GESTOR cadastra a câmera pela interface (`POST /api/v1/cameras`, já escopado por tenant).
2. No próximo ciclo de reconciliação (até `--intervalo` segundos depois), o orquestrador vê a câmera nova em `GET /api/v1/cameras` e sobe `python -m src.run_pipeline --camera-id <codigo> --api-url <api_url>`.
3. Esse processo filho segue o fluxo que já existe hoje, sem nenhuma mudança: `CameraConfigClient.fetch()` busca a config completa (incluindo `streamUrl`/`streamPort`), `ApiKeyProvisioner` garante a `X-Cypher-Key` daquela câmera especificamente (cache-first, não reloga se já tiver a chave), e o pipeline entra no loop de captura normal.
4. Se a câmera for desativada, editada (`streamUrl` nova) ou o processo cair sozinho, o próximo ciclo do orquestrador reage de acordo com §2.3.

---

## 6. Comportamento sob falha

| Falha | Comportamento |
|---|---|
| Catálogo inacessível (rede, backend fora do ar, 5xx) | Ciclo abortado sem tocar em nenhum processo — loga aviso, tenta de novo no próximo ciclo |
| Login inicial falha (credencial errada) | Erro fatal, orquestrador não sobe |
| Sessão expira em produção (401 no polling) | Re-login automático + repete a chamada; se falhar de novo, tratado como catálogo inacessível |
| Câmera nunca sobe (RTSP fora do ar, credencial errada) | Backoff cresce até o teto (`CaptureConfig.backoff_max_seconds`) e continua tentando pra sempre em intervalos maiores — nunca desiste de vez, mesma filosofia do `ResilientCapture` |
| Orquestrador cai e reinicia | `limpar_orfaos_do_boot_anterior()` mata qualquer processo do `orchestrator-state.json` ainda vivo antes de reconciliar do zero — nunca dois processos para a mesma câmera |
| Catálogo maior que `--max-concorrentes` | Excedente não é erro — fica de fora deste ciclo, retentado no próximo, sem estado novo pra representar "fila" |

---

## 7. Estratégia de testes

Segue o padrão já estabelecido em `tests/test_apikey_provisioning.py`: pytest, tudo injetável, nenhum teste toca rede real nem sobe subprocess de verdade.

- **`OrchestratorSession`** — transporte fake: login único no boot, `listar_cameras()` parseando a resposta, re-login automático simulando 401, erro fatal com credencial inválida.
- **`ProcessRegistry`** — lançador de processo fake (dublê de `Popen` controlável pelo teste, incluindo simular "morreu" via `.poll()`); leitura/escrita do arquivo de estado com `tmp_path`; `limpar_orfaos_do_boot_anterior` simulando um PID "vivo" e um "morto" no arquivo.
- **`Reconciler`** — dublês de sessão e registro; cenários: câmera desativada → encerra; `streamUrl` mudou → reinicia; processo morto → respeita backoff antes de tentar de novo; catálogo maior que `max_concorrentes` → excedente fica de fora e é retentado; catálogo inacessível → nenhuma ação.
- Sem teste de integração que sobe processo Python real ou bate na API real — a validação desse nível é o teste manual ponta a ponta (como o que motivou este documento).

---

## 8. Fora de escopo

- **Containerização** (Docker por câmera ou por tenant) — natural quando a arquitetura de deploy em nuvem for definida, não antes.
- **Provisionamento automático de uma instância de orquestrador quando uma empresa nova assina** ("orquestrador dos orquestradores") — relevante só no cenário de host central multi-tenant; hoje seria um passo manual de operação.
- **Papel mais restrito que GESTOR para a conta de serviço** — hoje não existe um papel intermediário no sistema; a conta de serviço tem os mesmos privilégios de qualquer GESTOR, mitigado só por ser uma conta dedicada (nunca a credencial pessoal de alguém).
- **Orquestrador multi-tenant** (uma instância gerenciando várias empresas) — decisão explícita de design (§1.3), não uma limitação a resolver depois.
- Nenhuma mudança no backend (`cypher`) — `GET /api/v1/cameras` já existe e já é escopado por tenant desde a entrega de multi-tenant.

---

## 9. Premissas

- O host onde o orquestrador roda tem acesso de rede tanto ao backend (`--api-url`) quanto às URLs RTSP das câmeras daquele tenant.
- `CYPHER_GESTOR_USER`/`CYPHER_GESTOR_PASSWORD` do `.env` desse host apontam para uma conta de serviço GESTOR já existente naquele tenant (criada manualmente uma vez, via `/config/equipe`).
- Cenário de validação imediato: um notebook único rodando os três projetos localmente, com possibilidade de dois orquestradores (duas empresas) na mesma máquina para testar isolamento multi-tenant. Nesse caso específico, **quem cadastra as câmeras de cada tenant precisa escolher `streamUrl`/portas que não colidam entre si manualmente** — é uma convenção de cadastro, não uma responsabilidade do orquestrador nem do backend (que intencionalmente permite a mesma porta entre tenants diferentes, pensando no caso normal de cada um numa máquina própria).
- Cenário futuro (fora de escopo): deploy em nuvem, on-premise por cliente ou host central multi-tenant — nenhum dos dois é implementado aqui, mas a unidade "1 orquestrador = 1 tenant" compõe em qualquer um dos dois sem precisar ser redesenhada.

---

## 10. Ordem de implementação sugerida

1. `OrchestratorSession` (login + `listar_cameras` + re-login em 401) — isolado, testável sem os outros dois componentes.
2. `ProcessRegistry` (iniciar/encerrar/estado persistido/limpeza de órfãos) — isolado, testável com um `ProcessLauncher` fake.
3. `Reconciler` (junta os dois, implementa o ciclo de 6 passos de §2.3) — a peça de integração, testada com dublês dos dois anteriores.
4. CLI (`src/orchestrator/__main__.py`, `argparse`) — fiação final, monta os três componentes reais e roda o loop `while True: reconciliar(); sleep(intervalo)`.
