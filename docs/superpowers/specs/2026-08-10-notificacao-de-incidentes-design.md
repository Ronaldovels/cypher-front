# Cypher — Arquitetura de Notificação de Incidentes

**Data:** 2026-08-10
**Status:** aprovado (design)
**Escopo:** **Entrega E1** do roteiro de §14 — integração ponta a ponta das três frentes (`cypher-capture`, `cypher`, `cypher-front`) para entregar a funcionalidade vital: **notificar um incidente**.

As seções 1 a 11 especificam E1. As seções 12 a 16 registram decisões já tomadas cuja implementação pertence a entregas posteriores — estão aqui porque restringem E1 e evitariam retrabalho se fossem descobertas tarde.

---

## 1. Contexto e diagnóstico

### 1.1 Estado atual das três frentes

**`cypher-capture` (Python) — maduro, porém sem saída.**
O `UnifiedPipeline` produz um `PersonEvent` por pessoa por frame, com severidade 0–4, escore REBA, categoria de postura, estado de zona e EPIs detectados (`src/fusion/engine.py`). O único consumidor desses eventos é um `print()` em `src/run_pipeline.py`. Não existe cliente HTTP, identidade de câmera, nem noção de *episódio* (incidente com início e fim).

**`cypher` (Spring Boot) — CRUD genérico, contrato desalinhado.**
A entidade `Alerta` cobre apenas `EPI_VIOLATION` e `ZONE_VIOLATION`; a capacidade mais bem validada do projeto (risco imediato / queda, recall 0,986) não tem tipo correspondente. Não há push para o cliente, idempotência, DTOs, validação, CORS ou paginação. O controller expõe a entidade JPA diretamente.

**`cypher-front` (Angular) — inteiramente mockado.**
`KPI_DATA`, `ALERTS`, `HEAT_DATA` e `BAR_DATA` são constantes em `src/app/dashboard/dashboard.component.ts`. Não há `provideHttpClient`, `src/environments/` nem qualquer chamada de rede. O `ConfigService` persiste somente em `localStorage`.

### 1.2 O achado que orienta o design

A agregação frame→incidente **já existe e está testada**. O `PostureClassifier` é uma máquina de estados com histerese assimétrica (`enter_frames_risk=2`, `exit_frames=45`), coberta por 89 testes unitários. Um incidente é exatamente uma transição confirmada `NORMAL → alarme` nessa máquina. O `UnifiedPipeline` já lê o estado anterior antes de chamar `update()` (`src/fusion/pipeline.py`), então detectar a transição custa uma comparação de enum.

Consequência arquitetural: **a agregação permanece em Python.** Reimplementá-la em Java significaria reescrever a lógica mais validada do projeto e reconstruir continuidade de tracking que o ByteTrack já fornece.

### 1.3 Documentação desatualizada

`cypher-capture/docs/apresentacao-esqueleto.md` §4 lista FastAPI, PostgreSQL, Redis e RabbitMQ como stack da Fase 3. O backend efetivamente construído é Spring Boot + H2. Este documento substitui aquela seção; o `apresentacao-esqueleto.md` deve ser corrigido para refletir a stack real.

---

## 2. Decisão de arquitetura

Três abordagens foram consideradas:

| Abordagem | Avaliação |
|---|---|
| **A. Python agrega, Java é o hub** | **Escolhida.** Reaproveita a máquina de estados testada; mantém o laço de frames livre de I/O de rede (p95 45 ms). |
| B. Python envia eventos crus, Java agrega | Rejeitada. ~15 eventos/s/pessoa/câmera contra H2, e duplica a máquina de estados em outra linguagem. |
| C. Broker no meio (RabbitMQ/Redis) | Rejeitada para o prazo de setembro. A durabilidade que ofereceria é obtida com fila em memória + spill em disco. Caminho legítimo de evolução na Fase 4. |

### 2.1 Topologia

Quatro caminhos independentes. O vídeo **não** passa pelo Java; o incidente **não** passa pelo laço de frames.

```
┌─ cypher-capture (Python) ──────────────────┐
│  UnifiedPipeline.process_frame()           │
│    pose → REBA → classifier → fuse         │  ← laço quente: I/O de rede proibido
│         │                    │             │
│         │ frame anotado      │ transição   │
│         ▼                    ▼             │
│   MjpegServer          IncidentTracker     │
│   :8090/stream         (fila + spill)      │
└─────────│──────────────────────│───────────┘
          │ MJPEG                │ POST /api/v1/incidents
          │                      ▼
          │        ┌─ cypher (Spring Boot) ──────────────┐
          │        │  IncidentController → Service       │
          │        │      ├─ persiste (H2)               │
          │        │      ├─ evento AFTER_COMMIT         │
          │        │      └─ WebhookDispatcher (async)   │──▶ assinantes
          │        │             │ SSE                   │    externos
          │        └─────────────│───────────────────────┘
          ▼                      ▼
┌─ cypher-front (Angular) ───────────────────┐
│  LiveFeedComponent  ·  IncidentService     │
│  Dashboard / Heatmap sobre signals         │
└────────────────────────────────────────────┘
```

### 2.2 Princípios que sustentam a topologia

**Notificar na abertura, não no fechamento.** Com `exit_frames=45` a 15 fps, um episódio só fecha ~3 s após a pessoa deixar de estar em risco. Notificar no fechamento acrescentaria 3 s a um alerta de queda. O `POST` sai na confirmação do alarme (2 frames para `immediate_risk`, ≈130 ms) e um `PATCH` posterior registra duração e severidade de pico.

**Nenhum I/O de rede na thread do frame.** O orçamento de latência é 200 ms e a medição atual é 45 ms p95. Uma chamada HTTP síncrona dentro de `process_frame` consumiria essa folga. O envio é assíncrono por construção.

**Perder um incidente é inaceitável.** A funcionalidade é descrita como vital, portanto fila limitada, spill em disco e reenvio fazem parte do escopo mínimo — não são refinamento posterior.

---

## 3. Contrato do incidente

Artefato central que amarra as três frentes.

### 3.1 Payload de ingestão — `POST /api/v1/incidents`

```json
{
  "incidentKey": "CAM-01:a3f9c2:track-7:20260810T143102482Z",
  "cameraId": "CAM-01",
  "runId": "a3f9c2",
  "trackId": 7,
  "type": "FALL_RISK",
  "severity": 4,
  "reason": "fallen_sustained",
  "postureCategory": "immediate_risk",
  "rebaScore": 11,
  "actionLevel": 4,
  "zoneName": null,
  "zoneStatus": "outside",
  "epiPresent": ["HELMET", "VEST"],
  "epiMissing": [],
  "detectedAt": "2026-08-10T14:31:02.482-03:00",
  "snapshotUrl": null
}
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `incidentKey` | sim | chave de idempotência (§3.2) |
| `cameraId` | sim | vem de `pose_config.yaml`, não do `PersonEvent` |
| `runId` | sim | UUID curto da execução do pipeline; persistido em coluna própria |
| `trackId` | sim | id do ByteTrack; único apenas dentro de um `runId` |
| `type` | sim | `FALL_RISK` · `ERGONOMIC_RISK` · `ZONE_VIOLATION` · `EPI_VIOLATION` |
| `severity` | sim | 0–4, valor cru preservado |
| `reason` | sim | rótulo da regra que disparou (`fallen_sustained`, `reba_11`, …) |
| `zoneName` / `zoneStatus` | não | `null` / `"outside"` quando fora de qualquer zona |
| `detectedAt` | sim | `OffsetDateTime` com offset explícito |
| `snapshotUrl` | não | preenchido posteriormente via `PATCH` (§4.4) |

### 3.2 Idempotência

`trackId` é um identificador do ByteTrack que **reinicia a cada restart do processo** — sozinho não identifica ninguém de forma estável. A chave é composta:

```
incidentKey = cameraId : runId : trackId : timestampDeAbertura
```

`runId` é um UUID gerado na subida do pipeline. A coluna tem `unique constraint`; um `POST` repetido (retry após timeout em que a resposta se perdeu) retorna `200 OK` com o incidente existente, em vez de `201`. Sem isso, cada retry produziria um alerta fantasma no painel.

### 3.3 Fechamento — `PATCH /api/v1/incidents/{incidentKey}`

```json
{
  "endedAt": "2026-08-10T14:31:09.140-03:00",
  "durationSeconds": 6.6,
  "peakSeverity": 4,
  "closedReason": "state_exit",
  "snapshotUrl": "https://res.cloudinary.com/.../abc_annotated.jpg"
}
```

`closedReason` ∈ `state_exit` (saiu do alarme) · `escalated` (mudou de tipo) · `track_lost` (pessoa sumiu do quadro) · `pipeline_stopped` (encerramento). Um incidente fechado como `track_lost` ou `pipeline_stopped` tem duração de confiança menor, e o dashboard o marca como tal — é a diferença entre "o risco cessou" e "o sistema perdeu de vista".

Todos os campos são opcionais e aplicados individualmente — o mesmo endpoint serve ao fechamento do episódio e à chegada tardia do snapshot.

### 3.4 Mapeamentos derivados

**Categoria de postura → tipo de incidente** (aplicado no Python, ao abrir o episódio):

| `PostureCategory` | `type` |
|---|---|
| `immediate_risk` | `FALL_RISK` |
| `ergonomically_inadequate` | `ERGONOMIC_RISK` |
| `critical_zone` | `ZONE_VIOLATION` |
| `normal` | não gera incidente |

`EPI_VIOLATION` não possui origem nesta entrega (§4.6).

**Severidade → nível** (derivado no Java, a partir de `severity`; `AlertaNivel` é mantido apenas para compatibilidade e leitura humana):

| `severity` | `nivel` |
|---|---|
| 0–1 | `BAIXO` |
| 2 | `MEDIO` |
| 3–4 | `ALTO` |

**Endereçamento dos endpoints.** O `PATCH` usa `incidentKey` porque o pipeline Python nunca conhece o `id` gerado pelo banco. O `PUT .../status` usa `id` porque o front sempre o recebe no payload de resposta. A assimetria é deliberada.

---

## 4. `cypher-capture` — do `print()` ao incidente

Módulo novo `src/notify/`. Sem `api_url` configurado, o comportamento atual do pipeline permanece idêntico.

### 4.1 `IncidentTracker`

Traduz transições de estado em episódios. O pipeline passa a marcar `posture_changed` no `PersonEvent`, comparando `prev_state.category` com a categoria retornada por `update()` — ambos já disponíveis no laço.

| Transição | Ação |
|---|---|
| `NORMAL → alarme` | abre incidente (`POST`), sujeito à janela de merge (§4.1.1) |
| `alarme → NORMAL` | fecha (`PATCH` com duração e severidade de pico) |
| `alarme → alarme diferente` | fecha o anterior e abre/reabre o do novo tipo |
| **track não visto por `evict_after_frames`** | fecha com `closedReason: track_lost` |

Escalação (ergonômico → queda) é tratada como episódio distinto, não como edição: a mudança de natureza do risco é informação que o histórico deve preservar.

O tracker acumula a **severidade de pico** durante o episódio, já que a severidade do frame de abertura raramente é a pior.

**A quarta regra existe porque as três primeiras dependem de `classifier.update()` ser chamado de novo para aquele `person_id`.** O pipeline itera sobre `for pose in poses`: se a pessoa sai do quadro ou o ByteTrack perde o id sob oclusão, `update()` nunca mais é chamado, o estado permanece em alarme para sempre e o `PATCH` de fechamento não dispara. Um trabalhador que cai e é retirado do quadro deixaria no painel um `FALL_RISK` permanentemente aberto, sem duração e sem severidade de pico. O tracker mantém o frame da última aparição de cada track e faz *sweep* a cada frame.

O mesmo vale no encerramento: o bloco `finally` de `run_pipeline.py` faz flush de todos os incidentes abertos com `closedReason: pipeline_stopped`. Sem isso, toda execução deixa incidentes órfãos — medido em §4.1.2.

### 4.1.1 Janela de merge por track e tipo

Se um par `(cameraId, trackId, type)` reabre dentro de `merge_window_seconds` do fechamento anterior, o tracker **reabre o mesmo incidente** (`PATCH` estendendo `endedAt` e `peakSeverity`) em vez de criar um novo. A janela é necessária, não opcional: sem ela um único evento real vira uma rajada de cards no dashboard.

### 4.1.2 Medição que calibra a janela

Executado o pipeline sobre `data/validation/cenario2.mp4` (1331 frames, ~30 fps, **2 quedas reais**, o mesmo clipe do ground truth com recall 0,986):

| Janela de merge | Incidentes gerados | Merges | Órfãos ao fim |
|---|---|---|---|
| 0 s (sem merge) | **10** | 0 | 2 |
| 2 s | 6 | 4 | 2 |
| 5 s | 5 | 5 | 2 |
| 10 s | 4 | 6 | 2 |
| **15 s** | **3** | 7 | 2 |
| 30 s | 3 | 7 | 2 |

Sem janela, 2 quedas reais produzem 10 incidentes (8 `FALL_RISK` + 2 `ERGONOMIC_RISK`) — uma amplificação de 5×.

A causa **não** é churn de id do ByteTrack: o `track#1` aparece em 1307 dos 1331 frames. É o mesmo track reentrando em alarme, porque a histerese (`exit_frames=45`) solta para `NORMAL` e reentra. Há ainda oscilação de categoria — entre os frames 327 e 349, o `track#1` alterna `immediate_risk → ergonomically_inadequate → immediate_risk → ergonomically_inadequate` em 22 frames.

Isso reflete a precisão conhecidamente baixa do detector em `immediate_risk` — deliberada, já que a calibração priorizou recall, e com "gating temporal de queda para subir precisão" já registrado no cronograma pós-NEXT. A camada de notificação não corrige o detector; ela impede que a característica vire ruído no painel.

**Default: `merge_window_seconds: 15`.** É o joelho da curva — 30 s não colapsa mais nada, o que significa que os 3 incidentes restantes estão separados por mais de 30 s e são episódios genuinamente distintos.

Os 2 órfãos são constantes em toda a tabela: nenhuma janela de merge os resolve, apenas a regra de eviction e o flush no encerramento.

**Guarda adicional:** tracks com menos de `min_track_frames` de vida não abrem incidente. A mesma execução registrou tracks espúrios de 1, 2 e 12 frames — um deles (`track#4`) abriria um `FALL_RISK` a 3 frames do fim do vídeo.

### 4.2 `HttpIncidentSink`

Fila `queue.Queue(maxsize=N)` consumida por uma thread daemon.

- Retry com backoff exponencial e jitter.
- Após N falhas, o incidente é gravado em `outputs/incidents.jsonl`.
- Na subida, o JSONL pendente é drenado antes de novos envios.
- **Fila cheia descarta o item de menor severidade**, nunca o mais recente: um incidente de queda jamais deve ser perdido por causa de um backlog de alertas ergonômicos. A contagem de descartes é registrada em log. Isso exige uma fila com política de descarte própria (`deque` sob lock ou `PriorityQueue`), já que `queue.Queue` só sabe bloquear ou levantar `Full`.
- Apenas incidentes cuja severidade de abertura seja ≥ `min_severity` são enviados. Como escalação de categoria abre um episódio novo (§4.1), um risco que se agrava é reavaliado contra o limiar na abertura do novo incidente.

### 4.3 `MjpegServer`

`ThreadingHTTPServer` em thread daemon publicando o último frame anotado em `multipart/x-mixed-replace`. O pipeline apenas executa `server.publish(annotated)` ao final de `process_frame` (atribuição sob lock). Sem cliente conectado, nenhum JPEG é codificado.

Escolha justificada: WebRTC entregaria latência sub-100 ms e melhor escala para 3–5 câmeras, ao custo de `aiortc` ou um media server mais sinalização — semanas de trabalho para um ganho imperceptível na demonstração.

### 4.4 Snapshot fora do caminho crítico

O upload para o Cloudinary leva centenas de milissegundos e não pode atrasar a notificação. Sequência:

1. `POST` do incidente **sem** `snapshotUrl` (imediato).
2. Upload do frame anotado na thread de envio.
3. `PATCH` com a URL quando disponível.

O card aparece no dashboard imediatamente; a imagem chega em seguida.

### 4.5 Configuração

Seção nova em `config/pose_config.yaml`:

```yaml
notify:
  camera_id: CAM-01
  api_url: http://localhost:8080/api/v1
  min_severity: 2
  merge_window_seconds: 15    # §4.1.1 — calibrado em cenario2.mp4
  evict_after_frames: 45      # track sumido por N frames = fecha como track_lost
  min_track_frames: 15        # tracks mais curtos não abrem incidente
  queue_size: 256
  spill_path: outputs/incidents.jsonl
  stream_port: 8090
  stream_enabled: true
```

Sobrescrevível por flags em `run_pipeline.py` (`--camera-id`, `--api-url`, `--stream-port`), seguindo o padrão já usado por `--device` e `--zones`.

### 4.6 Limitação declarada: violação de EPI não dispara

O modelo `models/exp.pt` possui apenas classes de **presença** (`GLOVE`, `Goggles`, `HELMET`, `MASK`, `Person`, `VEST`, `boots`), sem classes `no_*`. Portanto `PersonEvent.epi_violations` está sempre vazio e **nenhum incidente do tipo `EPI_VIOLATION` será gerado** nesta entrega, apesar de o tipo existir no contrato.

**Decisão:** o contrato já contempla `EPI_VIOLATION`, que passará a disparar quando `exp.pt` for retreinado com classes de violação — item já previsto no cronograma pós-NEXT.

**Alternativa rejeitada:** derivar violação por ausência, comparando EPIs detectados contra os EPIs exigidos coletados no onboarding (`config.epis`). Funcionaria sem retreino, mas transformaria cada falha de detecção em alerta falso, minando a credibilidade do painel.

O que funciona nesta entrega: queda/risco imediato (recall 0,986), risco ergonômico e zona crítica.

---

## 5. `cypher` (Spring Boot) — hub de incidentes

### 5.1 Endpoints

```
POST   /api/v1/incidents              ingestão (idempotente por incidentKey)
PATCH  /api/v1/incidents/{key}        fechamento + snapshotUrl
GET    /api/v1/incidents              histórico paginado (since, camera, severityMin, status)
GET    /api/v1/incidents/stream       SSE — push para o dashboard
PUT    /api/v1/incidents/{id}/status  operador reconhece (PENDENTE→REVISADO→RESOLVIDO)
GET    /api/v1/summary                KPIs agregados do dashboard
GET    /api/v1/cameras                id, nome, streamUrl e estação de cada câmera
GET    /api/v1/stations               estações com suas câmeras (§12)
```

`/summary` existe para evitar que o Angular baixe todo o histórico e agregue no browser. Ele alimenta os quatro KPIs, o heatmap por câmera e a série de sete dias, via `GROUP BY` no banco.

### 5.2 Correções obrigatórias no modelo

A entidade `Alerta` é **evoluída**, não substituída por uma entidade paralela — preservando commits, README e o vocabulário do time.

| Situação atual | Problema | Correção |
|---|---|---|
| `tipo ∈ {EPI_VIOLATION, ZONE_VIOLATION}` | queda e ergonomia não têm tipo | adicionar `FALL_RISK`, `ERGONOMIC_RISK` |
| `zona nullable = false` | queda fora de zona é impersistível | `nullable = true` |
| `cameraId nullable = false` | `PersonEvent` não carrega câmera | origem em `pose_config.yaml` |
| `nivel ∈ {BAIXO, MEDIO, ALTO}` | severidade 0–4 → 3 valores, com perda | persistir `severidade` (int) **e** derivar `nivel` |
| `dataHora: LocalDateTime` | perde o offset | `OffsetDateTime` |

Campos novos: `incidentKey` (unique), `runId`, `trackId`, `reason`, `posturaCategoria`, `rebaScore`, `actionLevel`, `zoneStatus`, `epiPresent`, `epiMissing`, `snapshotUrl`, `encerradoEm`, `duracaoSegundos`, `severidadePico`, `closedReason`.

`epiPresent` e `epiMissing` são listas de String: mapeadas com `@ElementCollection` em tabela auxiliar (não `@Convert` para JSON, que impediria consultas por EPI ausente no futuro).

O `status` passa a ter default `PENDENTE` atribuído pelo servidor. `AlertaController` deixa de receber e devolver a entidade JPA: entram `IncidentRequest` e `IncidentResponse` com Bean Validation. Hoje um cliente pode enviar `{"id": 42, "status": "RESOLVIDO"}` e sobrescrever um registro existente.

**Migração do banco:** `ddl-auto: update` adiciona colunas mas não relaxa `NOT NULL` em coluna existente. O arquivo `data/cypherdb.mv.db` contém apenas dado de teste (commit `CHORE: DB testing`), portanto será removido e recriado pelo Hibernate. Adotar Flyway é opção aberta ao time, não requisito desta entrega.

### 5.3 Push por SSE

`SseEmitter` do Spring, sem dependência nova. O fluxo é unidirecional; `EventSource` reconecta automaticamente no browser. WebSocket exigiria handshake, STOMP ou protocolo próprio e um canal de retorno sem uso.

- Heartbeat a cada 15 s (atravessa proxies e mantém a conexão viva).
- Remoção do emitter em `onCompletion`, `onTimeout` e `onError` — sem isso a lista vaza a cada refresh do browser.
- Broadcast é por instância; adequado ao deploy de instância única previsto.

### 5.4 Publicação após o commit

SSE e webhook são disparados por `@TransactionalEventListener(phase = AFTER_COMMIT)`. Se o push ocorresse dentro da transação, um rollback deixaria o operador vendo no painel um incidente inexistente no banco, e o assinante externo com um webhook de evento fantasma.

### 5.5 Fan-out para assinantes externos

Duas entidades:

- **`WebhookSubscription`** — `url`, `secret`, `minSeverity`, `ativo`.
- **`WebhookDelivery`** — `tentativas`, `status`, `ultimoErro`, `proximaTentativa`.

O dispatcher é `@Async`: falha de entrega não afeta a ingestão, apenas grava a delivery como pendente. Um `@Scheduled` varre pendentes com backoff.

Segurança: `X-Cypher-Signature: sha256=<hmac>` sobre o corpo cru, mais timestamp em header contra replay.

A tabela de delivery é o que permite responder "o alerta chegou ao cliente?" — pergunta inevitável sobre uma funcionalidade descrita como vital.

### 5.6 Infraestrutura

`CorsConfig` liberando a origem do Angular (`http://localhost:4200` em desenvolvimento). Sem isso, o front não conversa com a API nem localmente.

---

## 6. `cypher-front` (Angular) — dados reais

### 6.1 Peças novas

- `provideHttpClient(withFetch())` em `src/app/app.config.ts`.
- `src/environments/environment.ts` e `environment.development.ts` com `apiUrl` e `streamUrl`.
- `src/app/shared/incident.models.ts` — tipos espelhando o contrato de §3.
- `src/app/shared/incident.service.ts` — store baseado em signals, coerente com o `ConfigService` existente. Requisições com `withCredentials: true` desde já, pelo motivo explicado em §15.

### 6.2 `IncidentService`

Na inicialização busca o histórico por HTTP; em seguida abre o `EventSource` e faz *prepend* dos incidentes recebidos, deduplicando por `incidentKey`. Mantém em memória os 100 mais recentes; o restante vem paginado sob demanda.

`KPI_DATA`, `ALERTS`, `BAR_DATA` e `HEAT_DATA` deixam de ser constantes em `dashboard.component.ts` e passam a ser `computed()` sobre o store e o `/summary`.

`/summary` é buscado na inicialização e refeito quando chega um incidente pelo SSE, com debounce de 2 s para não disparar uma rajada de requisições durante um episódio ativo. Sem polling em intervalo fixo.

### 6.3 Estado de conexão visível

Signal `'conectando' | 'ao vivo' | 'offline'` renderizado como badge. Num painel de segurança, silêncio não pode parecer calmaria: com o SSE caído, a tela fica indistinguível de "nenhum incidente hoje" — a falha mais perigosa possível neste dashboard.

Ao reconectar, o serviço busca `GET /api/v1/incidents?since=<último recebido>` para cobrir a lacuna.

### 6.4 `LiveFeedComponent`

`<img [src]="streamUrl">` com tratamento de `(error)` levando a um estado "câmera indisponível". O protocolo MJPEG dispensa qualquer biblioteca de player.

### 6.5 Heatmap: a célula é a estação

O heatmap atual usa estações `EST-01`…`EST-17` como constantes. Essa entidade **não é ficção do dashboard**: `EST-04 · Esteira de montagem` aparece no wireframe do operador, o ranking do gestor é por setor e o mapa da fábrica é uma planta de estações. Ela foi desenhada desde o início e nunca modelada (§12).

**Decisão:** a célula do heatmap representa uma **estação**, agregando os incidentes de todas as câmeras que a cobrem. O nome amigável vem de `GET /api/v1/stations`.

Para que isso produza dados reais, a demonstração roda **3 a 4 processos do pipeline em paralelo**, cada um com `camera_id` e `stream_port` distintos, apontando para os clipes de validação disponíveis (`cenario.mp4`, `cenario2.mp4`, `cenario3.mp4`, `cenario4.mp4`), mapeados a estações distintas. O heatmap fica com 3–4 células alimentadas por incidentes verdadeiros e a arquitetura multi-câmera prevista para setembro passa a ser exercitada de fato, sem hardware adicional.

O `LiveFeedComponent` (§6.4) recebe a câmera como input e o dashboard permite alternar entre elas.

---

## 7. Comportamento sob falha

| Falha | Comportamento |
|---|---|
| API indisponível | Fila em memória → JSONL → drenagem ao retornar. Pipeline e vídeo seguem. |
| Fila cheia | Descarta o de menor severidade e registra contagem. Queda nunca é descartada. |
| SSE cai | `EventSource` reconecta; front busca por `since=<último>`. Badge indica "offline". |
| Assinante de webhook fora | Delivery pendente com backoff. Ingestão e dashboard não afetados. |
| `POST` duplicado | `incidentKey` unique → `200` com o existente. Sem duplicata no painel. |
| Cloudinary fora | Incidente persiste sem snapshot; `PATCH` tenta novamente depois. |
| Track perdido (oclusão, saída de quadro) | Eviction após `evict_after_frames` fecha com `closedReason: track_lost`. Sem incidente eternamente aberto. |
| Pipeline encerrado (`q`, Ctrl-C, fim da fonte) | `finally` faz flush dos abertos com `pipeline_stopped`. Medido: sem isso, `cenario2.mp4` deixa 2 órfãos. |
| Reentrada em alarme do mesmo track | Janela de merge de 15 s reabre o mesmo incidente. Medido: 10 incidentes → 3. |

---

## 8. Estratégia de testes

**Python** — `IncidentTracker` sobre sequências sintéticas de estado: abre uma única vez por episódio, não repete por frame, fecha no momento correto, escala corretamente entre categorias, **funde reentradas dentro da janela**, **fecha tracks evictados** e **faz flush no encerramento**. Fila testada com um sink que falha deterministicamente. Sem GPU e sem modelo, no mesmo padrão dos 89 testes existentes.

Teste de regressão sobre dados reais: o log de transições de `cenario2.mp4` (§4.1.2) vira fixture, travando o resultado em 3 incidentes e 0 órfãos. Isso protege a calibração contra mudanças futuras de threshold.

**Java** — idempotência do `POST`, publicação `AFTER_COMMIT`, assinatura HMAC, retry de `WebhookDelivery`, filtros e paginação do histórico.

**Angular** — deduplicação por `incidentKey`, recomputo dos KPIs, transições do estado de conexão.

**Ponta a ponta** — `POST` → evento recebido via SSE → webhook entregue ao assinante.

---

## 9. Fora de escopo de E1

**Adiado para entregas posteriores** (§14): hardening de RTSP e registro central de câmeras (E2), timeline com filtros, detalhe do incidente, reconhecimento pelo operador e tela de kiosk (E3), autenticação e cadastro de equipes (E4), gamificação (E5), relatórios e exportação (E6).

**Fora do produto nesta fase, sem entrega prevista:**

- Broker de mensagens (RabbitMQ/Redis) — evolução da Fase 4.
- Migração para PostgreSQL.
- WebRTC ou qualquer stream de baixa latência.
- Detecção de violação de EPI por ausência inferida (§4.6).
- Canais de notificação além do webhook (e-mail, Telegram, SMS).
- Múltiplas instâncias do backend (o broadcast SSE é por instância).
- Identificação individual de trabalhadores (§16.1).
- Atuação sobre máquinas (parar linha) — o wireframe do operador desenha um botão `pausar`; controle industrial é outra classe de risco e não pertence a este produto sem um projeto próprio de segurança funcional.

## 10. Premissas

- Demonstração com 3–4 processos do pipeline em paralelo, um por clipe de validação, cada um com seu `cameraId` (§6.5). Cada processo é independente: não há coordenação entre eles além de apontarem para a mesma API.
- Backend Spring Boot + H2 permanece a plataforma comprometida.
- Execução em rede local; API, pipeline e browser mutuamente alcançáveis.
- GPU disponível no host do pipeline (requisito já estabelecido para a meta de latência).
- **Os 45 ms p95 medidos valem para um processo.** Rodando 3–4 pipelines na mesma GPU, a latência por processo sobe e o orçamento de 200 ms pode ser estourado. Para a demonstração isso é aceitável — as fontes são clipes gravados, não câmeras ao vivo, então o pipeline pode rodar mais devagar que o tempo real sem perder frames. Medir a latência multi-processo e relatá-la honestamente é tarefa da implementação; a meta de 200 ms permanece definida sobre **um** processo por GPU.

## 11. Ordem de implementação

O contrato de §3 é o ponto de sincronização: uma vez fixado, as três frentes avançam em paralelo. A ordem abaixo mantém cada etapa demonstrável isoladamente.

1. **Java — modelo e ingestão.** Correções de §5.2, entidades `Estacao` e `Camera` de §12, DTOs, idempotência, CORS. Verificável com `curl`, sem depender do Python.
2. **Python — tracker e sink.** `IncidentTracker` + `HttpIncidentSink` contra a API real. Fim a fim de ingestão funcionando.
3. **Java — SSE, `/summary`, `/cameras` e `/stations`.** Push e agregação. Verificável com `curl -N`.
4. **Angular — store e dashboard.** `IncidentService`, substituição dos mocks, badge de conexão, heatmap por câmera.
5. **Python — MJPEG.** `MjpegServer` + `LiveFeedComponent` com seletor de câmera.
6. **Java — fan-out de webhook.** Assinaturas, deliveries, HMAC, retry.

Os passos 1–4 entregam a funcionalidade vital completa; 5 e 6 são as duas exigências adicionais confirmadas no escopo (vídeo ao vivo e integração de saída).

A demonstração multi-fonte (§6.5) só faz sentido a partir do passo 4; até lá, um processo apontando para um clipe basta para validar cada etapa.

---

# Decisões que restringem E1, implementadas depois

As seções a seguir não fazem parte do escopo de implementação de E1. Estão registradas aqui porque cada uma impõe uma restrição ao que E1 constrói — descobri-las depois significaria redesenhar.

## 12. Modelo de lugar: Estação → Câmera

O design inteiro pressupõe uma unidade de lugar que o modelo de dados não tem. O incidente conhece `cameraId`; o mapa da fábrica, o ranking por setor, a tela do operador e o heatmap pressupõem estação.

**Decisão:** hierarquia de dois níveis.

- **`Estacao`** — `id`, `nome` (`Esteira de montagem`), `setor` (campo texto livre), `ativa`.
- **`Camera`** — `id` (`CAM-01`), `nome`, `estacaoId`, `streamUrl`, `fonte`.

Uma estação é coberta por uma ou mais câmeras. Setor permanece **campo texto na estação**, sem entidade própria: o ranking por setor vira um `GROUP BY` sobre string livre, frágil a erro de digitação, e essa fragilidade é aceita conscientemente em troca de não modelar uma terceira entidade agora.

**O que E1 constrói:** as duas entidades com os campos acima, populadas por configuração em `application.yaml`, e os endpoints `GET /api/v1/cameras` e `GET /api/v1/stations`. O cadastro pela interface é E2.

Um pipeline que envia incidentes de um `cameraId` desconhecido **tem seus incidentes aceitos normalmente** e aparece na listagem com o próprio id como nome. A configuração serve para dar nome amigável, vincular à estação e fornecer a URL de vídeo — nunca para autorizar ingestão. Um incidente jamais é descartado por falha de cadastro.

## 13. Integração de câmeras

**Decisão:** suporte a RTSP (câmera IP), USB e arquivo, com a fonte de cada câmera vindo do registro central — o pipeline sobe com `--camera-id` e busca a própria fonte em `GET /api/v1/cameras`. URL e credencial ficam cadastradas num lugar só, em vez de espalhadas por YAMLs em cada host.

O estado atual é mais frágil do que aparenta. `open_capture` é um `cv2.VideoCapture` puro: RTSP funciona por intermédio do FFmpeg, mas sem nenhuma das proteções que uma câmera real exige. Três modos de falha que **não aparecem com arquivo local**, que é como o projeto foi testado até hoje:

| Falha | Sintoma | Correção (E2) |
|---|---|---|
| Câmera cai | `cap.read()` retorna `False` e o laço encerra | reconexão com backoff, sem derrubar o processo |
| Câmera muda (conectada, sem enviar) | `cap.read()` bloqueia indefinidamente | `OPENCV_FFMPEG_CAPTURE_OPTIONS` com timeout; watchdog de frame |
| Buffer interno acumula | latência cresce silenciosamente; passa-se a analisar o passado | `CAP_PROP_BUFFERSIZE=1` e descarte de frames atrasados |

Transporte TCP forçado (`rtsp_transport=tcp`) por padrão: UDP perde pacote sob carga e produz artefato que o detector interpreta como movimento.

ONVIF para descoberta automática foi considerado e descartado — comportamento varia demais entre fabricantes para o prazo disponível.

**Restrição sobre E1:** o contrato de `GET /api/v1/cameras` já precisa prever `streamUrl` e `fonte`, mesmo que E1 só os leia de configuração estática.

## 14. Roteiro de entregas

O produto desenhado nos wireframes tem treze itens de navegação. Não cabe numa spec.

| # | Entrega | Conteúdo |
|---|---|---|
| **E1** | **Núcleo de notificação** | Este documento, §1–§11 |
| E2 | Cadastro e câmeras | Onboarding estendido (estações, câmeras), hardening RTSP (§13), auto-configuração do pipeline |
| E3 | Operação | Timeline com filtros, detalhe do incidente, reconhecimento, tela de kiosk do operador |
| E4 | Acesso e equipes | Login, papéis, guards, proteção de endpoints (§15), cadastro de equipes com alocação a estações e turno |
| E5 | Gamificação | Placar por equipe, metas, sequências, contexto normativo (§16) |
| E6 | Relatórios e exportação | CSV/PDF por período |

E6 é a primeira a ser cortada se o calendário apertar: relatório não aparece em demonstração ao vivo, e `/summary` já cobre os números em tela.

**E5 tem um pré-requisito técnico, não apenas de cadastro.** A conformidade ponderada por tempo (§16.2) só é confiável depois que a precisão de `immediate_risk` melhorar — hoje, mesmo após a janela de merge, 2 quedas reais produzem 3 incidentes (§4.1.2). O item "gating temporal de queda" do cronograma pós-NEXT passa a ser pré-requisito de E5. Placar construído sobre detecção imprecisa perde credibilidade rápido, e placar não tem segunda chance.

### 14.1 Mapa de telas

Derivado das duas personas dos wireframes (`operador.jsx`, `gestor.jsx`), com as rotas atuais reaproveitadas. A coluna indica em que entrega cada tela entra.

```
público
  /login                   E4
  /onboarding              E2   identidade, estações, EPIs, CAs, tema     [existe, 4 passos]

gestor · desktop
  /dashboard               E1   KPIs · incidentes recentes · heatmap      [existe, mockado]
  /heatmap                 E1   visão expandida por estação               [existe, mockado]
  /incidentes              E3   timeline com filtros
  /incidentes/:id          E3   detalhe — snapshot, REBA, zona, EPIs, ações
  /estacoes                E3   grade de feeds ao vivo
  /config/estacoes         E2   cadastro de estações e câmeras
  /config/epis             E2   EPIs monitorados
  /config/equipe           E4   equipes, alocação e permissões
  /placar                  E5   conformidade, metas e sequências por equipe
  /relatorios              E6   exportação

operador · kiosk na estação
  /estacao/:id             E3   feed ao vivo · checklist de EPIs · eventos do turno
```

`/config/epis` existe porque hoje a configuração de EPIs só é acessível refazendo o onboarding: o `ConfigService` grava em `localStorage` e nunca mais é editável.

O kiosk do operador é a única tela sem navegação — abre numa estação e permanece nela.

## 15. Modelo de acesso

Decidido em E1, implementado em E4. Registrado agora porque um detalhe técnico do SSE determina o modelo de autenticação do front inteiro.

**`EventSource` não permite cabeçalhos customizados.** O SSE de §5.3 não pode ser autenticado por `Authorization: Bearer`. As saídas são cookie de sessão ou token na query string — e token em query string vaza em log de servidor e histórico de proxy. **Decisão: sessão por cookie `HttpOnly`.** Isso precisa valer para o front inteiro, não só para o stream, sob pena de conviver com dois mecanismos de autenticação.

**Três tipos de cliente, três mecanismos:**

| Cliente | Autenticação | Justificativa |
|---|---|---|
| Pipeline (ingestão) | chave de API por câmera, header `X-Cypher-Key` | máquina, não pessoa; não deve ter sessão nem expirar |
| Gestor (desktop) | usuário e senha → sessão por cookie | acesso nominal, com papel `GESTOR` |
| Kiosk do operador | token de estação de longa duração, provisionado uma vez na configuração do dispositivo | ninguém digita senha no chão de fábrica; papel `OPERADOR`, restrito à própria estação |

Endpoints públicos: apenas `/login` e o health check. O stream MJPEG do Python fica em rede interna e não é exposto ao público — E1 assume rede local (§10).

**Restrição sobre E1:** o `IncidentService` do Angular usa `withCredentials: true` desde já, e os controllers são escritos de modo que a introdução do Spring Security em E4 seja aditiva.

## 16. Gamificação positiva por equipe

Decidido em E1, implementado em E5.

### 16.1 A unidade é a equipe, não a pessoa

**Restrição técnica dura:** o sistema não consegue pontuar um indivíduo. `person_id` é um id do ByteTrack que reinicia a cada execução e troca sob oclusão — não há identidade persistente. Pontuar pessoa exigiria reconhecimento facial ou crachá, e aí LGPD deixa de ser nota de rodapé e vira o centro do projeto.

A restrição aponta para o desenho mais saudável de todo modo: **gamificar o coletivo**. Uma equipe cobre estações num turno, portanto a cadeia de atribuição é `incidente → estação + hora → equipe`. Alocação estática, sem escala por data — escala completa é um subsistema próprio e não altera nada na apresentação.

Os wireframes exibem nomes de trabalhadores (`M. Rocha · ID 00241`, `L. Silva`). Isso não é implementável e não deve ser prometido.

### 16.2 A métrica é conformidade ponderada por tempo

```
conformidade = 1 − (tempo com incidente ativo ÷ tempo monitorado)
```

A forma foi escolhida por uma propriedade específica: **é imune ao modo de falha central da gamificação em segurança.** Qualquer métrica que premie *menos incidentes registrados* cria incentivo para tapar a câmera, contestar alerta e desligar o pipeline — o sistema passa a medir a própria cegueira. Aqui, derrubar a captura reduz o `tempo monitorado` junto, o denominador encolhe e o placar não sobe.

Sendo normalizada por exposição, também não penaliza turno longo nem premia turno curto.

**Cobertura sempre ao lado do placar:** percentual do turno com câmera online e pipeline processando. Equipe com cobertura baixa não sobe no ranking — aparece como "dados insuficientes". Sem esse par, o placar é gamificável.

### 16.3 Metas, sequências e contexto normativo

Metas configuráveis por equipe (conformidade ≥ 98%, zero incidentes de severidade 4 no turno, tempo médio de reconhecimento abaixo de um limite). O painel mostra progresso em direção à meta.

Sequências positivas: "14 turnos consecutivos sem risco imediato". Sequência interrompida **não vira alerta vermelho** — vira "melhor sequência: 14 · atual: 0", preservando a conquista.

**Ranking por melhora sobre a própria linha de base, nunca por total.** Contagem absoluta ranqueia periculosidade herdada: uma estamparia sempre parecerá pior que um almoxarifado, por mais cuidadosa que seja a equipe. Melhora relativa mede o que a equipe controla.

**Camada educativa:** a taxonomia já mapeia cada regra à norma correspondente (`spine_load` → NR-17, queda → NR-35, EPI → NR-6). Cada incidente no kiosk carrega o que foi detectado, qual norma trata do assunto e o que fazer diferente — micro-aprendizado no momento do evento, em vez de repreensão no fim do mês.

**Restrição sobre E1:** o incidente já persiste `detectedAt`, `endedAt` e `duracaoSegundos`, que são exatamente os insumos do numerador. O denominador exige registro de tempo monitorado por câmera — um heartbeat periódico do pipeline. E1 não o implementa, mas nada em E1 deve impedi-lo.
