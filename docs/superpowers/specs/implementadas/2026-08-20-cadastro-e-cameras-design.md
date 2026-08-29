# Cypher E2 — Cadastro de Estações e Câmeras, e Captura Resiliente

**Data:** 2026-08-20
**Status:** aprovado (design)
**Escopo:** **Entrega E2** do roteiro definido em `2026-08-10-notificacao-de-incidentes-design.md` §14 — cadastro de estações e câmeras pela interface, auto-configuração da fonte do pipeline, e hardening de RTSP.

**Depende de:** E1 completa (entregue e verificada — ver `docs/e1c-verificacao.md` e `cypher-capture/docs/e1b-verificacao.md`).

---

## 1. Ponto de partida

E1 deixou o modelo de lugar existindo, mas inerte:

- **Backend:** `Estacao` e `Camera` existem como entidades. `CatalogController` é **somente leitura** — dois `GET`, nenhuma escrita. O catálogo vem de `application.yaml` via `CatalogSeeder`. `Camera.fonte` existe no modelo e é deliberadamente omitida do `CameraResponse`.
- **Capture:** `open_capture` continua sendo um `cv2.VideoCapture` cru. `NotifyConfig` conhece `camera_id` mas a fonte de captura vem de `--source`, sem relação nenhuma com o cadastro.
- **Front:** onboarding com 4 passos; rotas `/`, `/dashboard`, `/heatmap`. Nenhuma área de configuração.

Duas coisas que o time construiu além do plano de E1 e que E2 aproveita: o modo de dados de exemplo (`src/app/shared/mock/`), que troca o **transporte** e não o serviço — logo as telas de cadastro podem ser desenvolvidas antes do endpoint existir, exercitando o código real; e um sistema de tema/tipografia com spec própria.

### 1.1 Estado de integração

No momento em que este design foi escrito, E1-A e E1-B estavam em branches de feature não mergeadas (`feat/e1a-backend-incidentes`, `feat/e1b-notificacao-incidentes`) e E1-C em `dev`. E2 toca os três repositórios, então a ordem de merge precisa ser resolvida antes de abrir frentes paralelas. Isto não é requisito de design; é pré-condição de execução.

---

## 2. Decisão de arquitetura

O eixo real de E2 é **como o pipeline obtém sua fonte de captura**. O resto tem forma determinada.

| Abordagem | Avaliação |
|---|---|
| **A. Pull no boot com cache local** | **Escolhida.** Degradação graciosa em três níveis; a fonte da verdade continua sendo o cadastro; custa uma requisição no boot e um arquivo de cache. |
| B. Registro ativo com reconfiguração quente | Rejeitada para esta entrega. Trocar câmera sem reiniciar processo é para onde isso vai em produção, mas ninguém pediu para setembro, e traz reabertura de captura no meio do laço mais um caminho de erro por operação. |
| C. Config materializada em arquivo por comando | Rejeitada. Simples e auditável, mas introduz um passo manual que alguém vai esquecer, e config velha não faz barulho — falha silenciosa é o pior modo de falha deste projeto. |

### 2.1 Topologia

```
┌─ cypher (Spring Boot) ─────────────────────────────┐
│  CatalogController      POST/PUT/DELETE estações   │  ← cadastro (navegador)
│                         POST/PUT/DELETE câmeras    │
│                         GET /cameras/{codigo}      │  ← administração (com fonte)
│  CameraConfigController GET /cameras/{cod}/config  │  ← config (pipeline)
│    devolve fonte COM placeholder, nunca segredo    │
└──────────│─────────────────────────────│───────────┘
           │ navegador                   │ pipeline, no boot
           ▼                             ▼
┌─ cypher-front ───────┐   ┌─ cypher-capture ─────────────────┐
│ /config/estacoes     │   │  CameraConfigClient              │
│ passo do onboarding  │   │    1. API → usa e grava cache    │
│ (mesmo componente)   │   │    2. API fora → usa cache       │
└──────────────────────┘   │    3. sem cache → --source/YAML  │
                           │  expande ${VAR} do ambiente      │
                           │            │                      │
                           │            ▼                      │
                           │  ResilientCapture                 │
                           │    reconecta · timeout · descarte │
                           └───────────────────────────────────┘
```

### 2.2 A escada de degradação

Um sistema de segurança não pode ficar impedido de capturar porque o servidor de configuração está fora. Três níveis, cada um visível no terminal:

1. **API responde** — usa a config remota e grava o cache.
2. **API fora, cache existe** — usa o cache e imprime de qual data ele é.
3. **API fora, sem cache** — cai para `--source`/YAML; se nem isso existir, aborta nomeando o que falta.

Config velha silenciosa é inaceitável: cada degradação anuncia a si mesma.

---

## 3. Credencial da câmera: placeholder na API, segredo no host

`Camera.fonte` pode conter `rtsp://usuario:senha@host/stream`. E1 excluiu esse campo do `CameraResponse` justamente por isso. E2 quer que o pipeline busque a fonte na API — e não há autenticação alguma até E4. Do jeito ingênuo, E2 publicaria senha de câmera num `GET` aberto na rede local.

**Decisão:** o cadastro armazena **placeholders**, e o segredo vive no host do pipeline.

```
Cadastrado na API:  rtsp://${CAM01_USER}:${CAM01_PASS}@10.0.0.7/Streaming/Channels/101
Resolvido no host:  rtsp://cypher:s3nh4@10.0.0.7/Streaming/Channels/101
```

A expansão acontece no `cypher-capture`, a partir de `os.environ`. Consequências que fazem esta escolha valer o custo: o segredo **nunca atravessa a rede**, nunca entra no H2, nunca aparece em backup do banco nem em log de requisição. O custo é um `.env` por host de pipeline.

**A expansão falha alto.** Variável ausente aborta o boot nomeando-a. A alternativa é o OpenCV tentar abrir uma URL com `${` literal dentro, falhar por motivo aparentemente não relacionado, e o operador depurar a câmera errada.

Alternativas rejeitadas: endpoint aberto devolvendo a fonte completa (senha em texto claro no H2 e num `GET` aberto durante todo o intervalo entre E2 e E4); cifrar em repouso (mesma distribuição de segredo que o `.env`, com criptografia caseira em cima); manter a fonte local (perde exatamente o ganho que E2 busca).

---

## 4. Identidade: o código digitado é a chave

`EST-01` e `CAM-01` são a própria chave primária hoje, e `cameraId` está embutido no `incidentKey` de todo incidente já gravado em E1.

**Decisão:** o operador digita o código no cadastro e ele continua sendo a PK, com validação de formato e unicidade. O código corresponde a algo físico — placa na estação, etiqueta na câmera — e mantém `incidentKey` legível para depuração.

**O código é imutável.** Um `PUT` que traga código diferente do da URL responde `409`. Renomear reescreveria histórico, então a operação não existe: quem errou desativa e cadastra outro; quem quer texto melhor edita `nome`, que é livre.

Formato aceito: `^[A-Z0-9]{2,10}-[A-Z0-9]{1,8}$` — letras maiúsculas e dígitos, um hífen obrigatório, 4 a 19 caracteres.

Alternativa rejeitada: PK gerada com `codigo` editável. Tornaria o rename trivial, mas deixaria `incidentKey` opaco, exigiria join para o heatmap resolver o código, e demandaria migração dos incidentes já gravados em E1.

---

## 5. Backend: cadastro e config

### 5.1 Endpoints

```
POST   /api/v1/stations                  cadastrar estação
PUT    /api/v1/stations/{codigo}         editar nome, setor, ativa
DELETE /api/v1/stations/{codigo}         desativar (soft delete)

POST   /api/v1/cameras                   cadastrar câmera
GET    /api/v1/cameras/{codigo}          câmera individual, COM fonte (administração)
PUT    /api/v1/cameras/{codigo}          editar nome, estação, streamUrl, fonte, ativa
DELETE /api/v1/cameras/{codigo}          desativar

GET    /api/v1/cameras/{codigo}/config   config do pipeline (fonte + porta)
```

`GET /api/v1/cameras` (lista, de E1) **continua sem `fonte`**. A separação é entre **navegar** — lista consumida pelo dashboard — e **administrar** — item individual, consumido pelo formulário de cadastro. É a fronteira que E4 vai proteger.

### 5.2 Três superfícies, um limite de segurança futuro

| Superfície | Rotas | Quem chama | E4 |
|---|---|---|---|
| Navegação | `GET /incidents`, `/summary`, `/cameras`, `/stations` | navegador do gestor | sessão por cookie |
| Administração | `GET /cameras/{codigo}`, todas as escritas de catálogo | navegador do gestor | sessão por cookie, papel `GESTOR` |
| Máquina | `GET /cameras/{codigo}/config`, `POST /incidents`, `PATCH /incidents/{key}` | pipeline | chave de API |

A superfície de máquina **não** ganha prefixo próprio: mover `POST /incidents` quebraria o `HttpIncidentSink` já entregue em E1-B. E4 aplica a exigência de chave por regra explícita nessas rotas, não por padrão de caminho. O custo é uma lista em vez de um curinga; o benefício é não churn no que já funciona.

### 5.3 Regras de integridade

**Câmera exige estação existente.** Cadastrar câmera apontando para estação inexistente responde `422`.

Isso parece contradizer a regra de E1 de aceitar incidente de câmera desconhecida, e não contradiz: **ingestão nunca pode perder dado; cadastro é ação humana deliberada onde falhar rápido é o comportamento certo.** Registrado explicitamente para que ninguém "harmonize" os dois depois.

**Desativar, nunca apagar.** `Camera` ganha o campo `ativa`, que hoje só `Estacao` possui. `DELETE` marca `ativa = false`. Não há chave estrangeira entre incidente e câmera, então apagar de verdade deixaria incidentes apontando para código inexistente — e num sistema de auditoria de segurança o histórico precisa continuar explicável. Câmera desativada sai do heatmap e do seletor de feed; seus incidentes continuam consultáveis.

**Reativar é um `PUT` com `ativa: true`** — não existe endpoint próprio para isso. `GET /cameras/{codigo}` responde normalmente para câmera desativada, porque é preciso poder vê-la para reativá-la; quem filtra por `ativa` é a lista, não o item.

### 5.4 Correção obrigatória no seeder

`CatalogSeeder` hoje faz upsert do `application.yaml` **a cada boot**. No momento em que o cadastro pela interface existir, editar uma estação e reiniciar a aplicação desfaz a edição em silêncio.

**Correção:** o seeder vira bootstrap — popula somente quando a tabela está vazia, e loga o que fez ou por que não fez. Sem isso, E2 entrega um formulário que perde dados de forma imprevisível.

### 5.5 O que o pipeline recebe

```json
{
  "codigo": "CAM-01",
  "nome": "Esteira - frontal",
  "estacaoId": "EST-01",
  "fonte": "rtsp://${CAM01_USER}:${CAM01_PASS}@10.0.0.7/Streaming/Channels/101",
  "streamPort": 8090,
  "ativa": true
}
```

`streamPort` é **derivado do `streamUrl` cadastrado**, extraído da porta da URL. Hoje `application.yaml` declara `streamUrl: http://127.0.0.1:8090/stream` e `pose_config.yaml` declara `stream_port: 8090`, independentes — quem mudar um faz o navegador apontar para o vazio. Em E2 o cadastro é a fonte única e a inconsistência deixa de ser possível.

Para que a derivação seja inequívoca, o cadastro **exige porta explícita** no `streamUrl` (`422` sem ela) e a **URL é única** entre câmeras (`409` em duplicata). Sem a primeira regra, `http://host/stream` teria de virar porta 80 por convenção, que não é onde o MJPEG serve; sem a segunda, dois pipelines no mesmo host disputariam o mesmo bind e um deles morreria no boot.

Câmera desativada responde `409` neste endpoint: o pipeline não deve subir apontando para câmera tirada de operação.

Os DTOs de entrada são separados dos de saída (`StationRequest`, `CameraRequest`), seguindo o que E1 estabeleceu — a entidade JPA não volta a ser exposta.

---

## 6. Capture: config remota e captura resiliente

Duas peças novas em `src/capture/`. `src/notify/` não muda.

### 6.1 `CameraConfigClient`

Implementa a escada de §2.2. Busca `GET /cameras/{codigo}/config`, grava `outputs/camera-config-cache.json` com carimbo de tempo, e expande `${VAR}` do ambiente.

A flag `--camera-id` **já existe** desde E1-B; E2 a reutiliza em vez de introduzir outra. Sem ela, o cliente não é construído: o comportamento atual com `--source` permanece intacto, que é o que mantém a suíte de E1 verde e a fixture de regressão de `cenario2.mp4` válida. Passar `--camera-id` **e** `--source` ao mesmo tempo faz `--source` vencer, com aviso no terminal — é o que permite depurar contra arquivo uma câmera já cadastrada.

### 6.2 `ResilientCapture`

Embrulha uma fábrica de `cv2.VideoCapture` e faz duas coisas que o laço de frames não deve saber: reconecta e descarta frame velho. A reconexão fica aqui, e não no laço do `run_pipeline`, porque o laço já carrega HUD, writer, tracker e stream — e não deveria também saber que câmera IP cai. O efeito prático: testar reconexão não exige câmera nem rede, só uma fábrica que falha sob demanda.

**Thread de leitura para fonte ao vivo.** Uma thread lê continuamente e guarda **apenas o frame mais recente**; o laço pede o último e recebe "sem frame novo" quando não há novidade. Resolve três problemas de uma vez:

- **Latência que cresce em silêncio.** `CAP_PROP_BUFFERSIZE=1` é best-effort e o backend FFmpeg costuma ignorar. A demonstração roda 3–4 pipelines na mesma GPU, o que já derruba o processamento abaixo da taxa da fonte; aí o buffer cresce sem limite até se estar analisando o passado. Descarte deliberado é a única correção confiável.
- **`read()` que bloqueia indefinidamente.** Câmera conectada mas muda travava o processo. Com a thread, o bloqueio fica isolado nela e o laço continua girando.
- **Reconexão.** A thread é dona do ciclo de vida da captura, então reabrir com backoff é local a ela.

**Fonte de arquivo não usa a thread.** Descartar frame de arquivo mudaria o conteúdo analisado, quebrando a fixture de regressão de `cenario2.mp4` e as métricas medidas em E1. Arquivo é lido quadro a quadro, e fim de arquivo é fim — não falha a reconectar. `ResilientCapture` decide pela fonte: índice de webcam e URL `rtsp://` são ao vivo; caminho de arquivo não é.

### 6.3 Opções de transporte

`OPENCV_FFMPEG_CAPTURE_OPTIONS` definido no arranque, antes de qualquer captura:

- `rtsp_transport;tcp` — UDP perde pacote sob carga e produz artefato que o detector interpreta como movimento, gerando falso positivo de queda causado pela rede.
- Timeout de leitura — a chave se chama `stimeout` no FFmpeg antigo e `timeout` no recente. **As duas são declaradas**, porque errar essa chave faz a proteção não existir sem avisar. Entra como reforço da thread de leitura, não como correção principal.

### 6.4 Efeito colateral bem-vindo

A verificação de E1-B registrou que a janela de merge mede tempo de relógio, não tempo de vídeo, o que esticava intervalos ao processar arquivo mais devagar que o tempo real. Com câmera ao vivo os dois coincidem — E2 torna a observação irrelevante para o alvo de produção. Não é correção; é a razão de não precisar de uma.

---

## 7. Front: cadastro reaproveitado

### 7.1 Um formulário, duas superfícies

`StationsConfigComponent` é montado na rota `/config/estacoes` **e** como passo do onboarding. O mesmo componente, não dois formulários que divergem.

O onboarding passa de 4 para 5 passos: identidade → **estações e câmeras** → EPIs → CAs → confirmação. A posição é deliberada: sem câmera cadastrada o sistema não vê nada, então esse passo vem antes de escolher EPIs.

Isto corrige também um defeito atual: a configuração só é editável refazendo o onboarding, porque o `ConfigService` grava em `localStorage` e nunca mais abre.

### 7.2 Serviço

`CatalogService` ganha `createStation`, `updateStation`, `deactivateStation`, os equivalentes de câmera, e `reload()`. Os signals que já alimentam dashboard e heatmap continuam sendo a mesma fonte — cadastrar uma estação atualiza o heatmap sem código de sincronização.

### 7.3 O campo de fonte é onde a decisão de credencial fica visível

O formulário de câmera mostra o placeholder como affordance, não como texto misterioso: campo com exemplo `rtsp://${CAM01_USER}:${CAM01_PASS}@10.0.0.7/stream` e uma linha explicando que `${VAR}` é lido do ambiente do host do pipeline, nunca gravado no servidor.

### 7.4 O modo de exemplo cobre escritas

`mockApiInterceptor` hoje só responde `GET`. Passa a manter as fixtures em memória e responder `POST`/`PUT`/`DELETE` sobre elas, para que as telas de cadastro sejam desenvolvíveis antes do endpoint existir. Mesmo princípio que o time já adotou: trocar o transporte, não o serviço.

---

## 8. Comportamento sob falha

| Falha | Comportamento |
|---|---|
| API fora no boot do pipeline | Usa o cache e imprime de qual data ele é |
| API fora e sem cache | Cai para `--source`/YAML; sem isso, aborta nomeando o que falta |
| Variável de ambiente ausente | Aborta no boot nomeando a variável; nunca tenta abrir URL com `${` literal |
| Câmera desativada no cadastro | `/config` responde `409`; o pipeline não sobe apontando para ela |
| Câmera RTSP cai | `ResilientCapture` reconecta com backoff; o laço continua e o HUD mostra o estado |
| Câmera muda, conectada sem enviar | Bloqueio isolado na thread; o laço recebe "sem frame novo" e o watchdog reconecta |
| Processamento mais lento que a fonte | A thread descarta o atrasado: latência constante em vez de crescente |
| Código duplicado no cadastro | `409` |
| Câmera para estação inexistente | `422` |
| Seeder com tabela populada | Não faz nada e loga por quê |

**Proteção deliberadamente ausente:** controle de concorrência em edição. Sem versionamento otimista, dois gestores editando a mesma câmera terminam com o último a gravar vencendo. Com um gestor e um piloto, o custo não se paga. Limitação conhecida, não esquecimento.

---

## 9. Estratégia de testes

**Java** — CRUD completo; imutabilidade do código respondendo `409`; `422` de estação inexistente; e o caso que é a razão de ser do soft delete: **desativar câmera a remove do heatmap sem apagar seus incidentes**. Mais o `/config` devolvendo placeholder, o `409` de câmera inativa, e o seeder que não sobrescreve tabela populada.

**Python** — `CameraConfigClient` nos três degraus da escada, com transporte injetado; expansão de `${VAR}` e aborto por variável ausente; `ResilientCapture` com fábrica de captura que falha sob demanda, cobrindo reconexão, descarte de frame velho e **fonte de arquivo não reconectando no fim do arquivo**. Nada exige câmera, rede ou GPU.

**Angular** — validação de formato do código; submit criando via serviço; erros `409`/`422` chegando na tela como mensagem em vez de falha silenciosa; interceptor de exemplo respondendo escritas sobre fixtures em memória.

**Ponta a ponta** — cadastrar estação e câmera pela interface, subir o pipeline apenas com `--camera-id`, confirmar que ele obtém a fonte da API, e derrubar a câmera no meio da execução para observar a reconexão sem o pipeline morrer.

---

## 10. Fora de escopo

**Adiado para entrega futura, por decisão explícita:**

- **`/config/epis`** — a §14.1 do design de E1 mapeou esta tela para E2. Adiada: a configuração de EPIs não tem consumidor hoje. `EPI_VIOLATION` não dispara porque o `exp.pt` só possui classes de presença, sem classes `no_*`, e a lista continua vivendo em `localStorage` sem que o backend a leia. Construir a tela agora é construir um formulário que não altera o comportamento de nada. **Fica condicionada ao retreino do detector com classes de violação** — quando esse item do cronograma pós-NEXT for feito, a tela entra junto, porque só então passa a existir algo que a consuma.

**Fora do produto nesta entrega:**

- Reconfiguração quente (trocar câmera sem reiniciar o pipeline) — abordagem B de §2.
- Descoberta ONVIF de câmeras na rede — comportamento varia demais entre fabricantes para o prazo.
- Versionamento otimista em edição concorrente (§8).
- Autenticação e papéis (E4), gamificação (E5), relatórios (E6).
- Renomear código de estação ou câmera (§4).

---

## 11. Premissas

- Um gestor operando o cadastro; sem edição concorrente real.
- Rede local: API, pipeline e navegador mutuamente alcançáveis.
- Um `.env` por host de pipeline, contendo as credenciais das câmeras que aquele host abre.
- O alvo de captura de produção é **câmera ao vivo**; arquivo continua suportado para validação e regressão.
- H2 em arquivo permanece a persistência (nenhuma migração de banco nesta entrega).

---

## 12. Ordem de implementação

O contrato de §5.1 e §5.5 é o ponto de sincronização: fixado, as três frentes avançam em paralelo.

1. **Java — escritas de catálogo.** CRUD, validação de código, `422` de estação inexistente, soft delete, correção do seeder (§5.4). Verificável com `curl`.
2. **Java — administração e config.** `GET /cameras/{codigo}` com fonte e `GET /cameras/{codigo}/config` com `streamPort` derivado.
3. **Python — config remota.** `CameraConfigClient` com a escada de três níveis e expansão de placeholder. Fim a fim contra a API real.
4. **Python — captura resiliente.** `ResilientCapture` com thread de leitura, reconexão e distinção entre fonte ao vivo e arquivo.
5. **Angular — cadastro.** `StationsConfigComponent`, rota `/config/estacoes`, escritas no `CatalogService`, escritas no interceptor de exemplo.
6. **Angular — passo do onboarding.** Reaproveitamento do mesmo componente como quinto passo.

Os passos 1–2 destravam 3 e 5. O passo 4 é independente de todos os outros e pode correr em paralelo desde o início.
