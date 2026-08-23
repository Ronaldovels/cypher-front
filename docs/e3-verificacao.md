# E3 — Verificação ponta a ponta (cypher + cypher-front + cypher-capture)

Executado em 2026-08-23, com os três repositórios rodando simultaneamente contra as
branches dos PRs abertos:

- `cypher` (backend): branch `feat/e3a-backend-incident-by-id`, PR [#4](https://github.com/lucvs07/Cypher-Api/pull/4).
- `cypher-front`: branch `e3b-front-operacao`, PR [#3](https://github.com/Ronaldovels/cypher-front/pull/3).
- `cypher-capture`: branch `main` (E3 não toca este repositório — usado apenas como
  fonte de incidentes reais para o teste).

Câmera usada: nenhuma real — pipeline apontado para `data/validation/cenario2.mp4`
(1331 frames, 2 quedas reais, o mesmo clipe do ground truth de recall 0,986 citado no
doc de E1). Inferência em `cuda` (RTX 3050 6GB confirmada via `nvidia-smi`). Backend:
`./mvnw -o spring-boot:run` (H2 em arquivo, catálogo semeado via `CatalogSeeder`,
4 estações/câmeras). Front: `ng serve` com `useMockData: false`.

**Limitação desta sessão:** sem ferramenta de navegador disponível para o agente —
tudo abaixo foi verificado por API/curl/processo real. A seção 7 lista o que só um
humano olhando o navegador pode confirmar.

## Conflito de porta com sessão anterior

Antes de subir, as portas 8080 e 4200 estavam ocupadas por processos remanescentes de
uma sessão anterior (branches `feat/e2a-backend-cadastro` / `e2c-front-cadastro`, em
worktrees já mergeadas). Confirmado com o usuário e encerrados (`kill`) antes de subir
os serviços desta entrega.

## 1. Suítes automatizadas (pré-condição)

| Repo | Comando | Resultado |
|---|---|---|
| cypher (E3-A) | `./mvnw -o test` | **138/138** passed, BUILD SUCCESS |
| cypher-front (E3-B) | `npx ng test --no-watch` | **169/169** passed (25 arquivos) |

## 2. Contrato do endpoint novo — `GET /api/v1/incidents/{id}`

Evidência real (curl contra o backend rodando, banco vazio no início):

```
GET /incidents/999999 (antes de qualquer incidente)  → 404
GET /incidents/1 (id real, após ingestão pelo pipeline) → 200, corpo IncidentResponse
  completo — todos os campos batem 1:1 com o modelo Incident do front
  (id, incidentKey, cameraId, runId, trackId, type, severity, nivel, descricao,
  reason, postureCategory, rebaScore, actionLevel, zoneName, zoneStatus,
  epiPresent, epiMissing, snapshotUrl, detectedAt, endedAt, durationSeconds,
  peakSeverity, closedReason, status)
```

## 3. Filtros e ordenação da timeline (§2.1 do spec)

Contra os 3 incidentes reais gerados pelo pipeline (ver §5):

```
GET /incidents?camera=CAM-01            → totalElements: 3
GET /incidents?severityMin=3            → totalElements: 2 (os 2 FALL_RISK sev=4)
GET /incidents?status=PENDENTE          → totalElements: 3
GET /incidents?since=2026-08-23T21:43:00.000Z → totalElements: 2 (só os 2 depois desse
  instante — confirma que o formato ISO com offset/Z do fix do achado 2 da revisão
  final é aceito pelo backend real, não só pelo mock)
GET /incidents?sort=detectedAt,desc     → [3, 2, 1] — mais recentes primeiro,
  confirmando o fix do achado 5 (sort explícito) contra o backend real
```

## 4. Reconhecimento de status + propagação por SSE (§2.1/§2.2/§8)

```
PUT /incidents/2/status {"status":"REVISADO"}  → 200, status atualizado no corpo
```

Conectado em `GET /incidents/stream` (SSE) simultaneamente: o evento
`incident-changed` chegou em menos de 3s após o PUT, com o corpo completo do
incidente já refletindo `status: "REVISADO"`. Confirma o requisito do spec §8.5
("mudar status em duas abas... confirmar propagação via SSE") no nível de API —
o `IncidentService.connect()` do front já tem teste unitário cobrindo exatamente
esse evento (Task 1/2).

## 5. Pipeline real → backend → API (fecha o ciclo completo)

```
./venv/bin/python src/run_pipeline.py --source data/validation/cenario2.mp4 \
  --camera-id CAM-01 --api-url http://localhost:8080/api/v1 \
  --stream-port 8090 --device cuda --no-display
```

Resultado: **1331 frames, p95 39.6ms (dentro da meta de 200ms)**, 3 incidentes
persistidos no backend real:

| id | tipo | severidade | duração | closedReason |
|---|---|---|---|---|
| 1 | FALL_RISK | 4 | 16.87s | ESCALATED |
| 2 | ERGONOMIC_RISK | 2 | 3.63s | STATE_EXIT |
| 3 | FALL_RISK | 4 | 29.35s | — (aberto ao fim do vídeo) |

3 incidentes bate com a calibração documentada no spec de E1 §4.1.2 para este
clipe com janela de merge de 15s (2 FALL_RISK + 1 ERGONOMIC_RISK, mesmo track).
`snapshotUrl: null` em todos — esperado, credenciais do Cloudinary não configuradas
nesta sessão; exercita o placeholder "processando imagem" da tela de detalhe
(Task 3), não um bug.

`GET /summary` após a ingestão: `incidentesHoje: 3`, `criticosHoje: 2`,
`pendentes: 2` (1 a menos que 3, porque o incidente 2 foi reconhecido no §4),
`heatmap` com os 3 incidentes corretamente atribuídos a `EST-01` — confirma que
o dashboard/heatmap pré-existentes não regrediram com as mudanças de E3.

## 6. Catálogo e stream (usado por `/estacoes` e `/estacao/:id`)

```
GET /stations → EST-01 com cameras: [{id: CAM-01, streamUrl: http://127.0.0.1:8090/stream}]
```

Confirma o contrato `Station.cameras` que `StationsGridComponent` (Task 4) e
`StationKioskComponent` (Task 5) consomem.

Stream MJPEG do pipeline (`GET http://127.0.0.1:8090/stream`) respondendo com
frames JPEG reais (`Content-Type: image/jpeg`, boundary `--cypherframe`) — o
`LiveFeedComponent` recebe conteúdo de vídeo de verdade, não um endpoint vazio.

## 7. O que não foi verificado nesta sessão (precisa de navegador)

O agente não tem ferramenta de navegador neste ambiente. Os serviços ficaram no
ar (backend :8080, front :4200, stream :8090) para você conferir visualmente:

- [ ] `/incidentes` — os 3 incidentes aparecem na timeline, filtros funcionam na
      UI (não só na API), o badge de status muda de cor, a ação rápida "marcar
      revisado/resolvido" funciona clicando
- [ ] `/incidentes/:id` — snapshot mostra "processando imagem…" (não quebra com
      `snapshotUrl: null`), REBA/zona/EPIs renderizam, botões de status funcionam
- [ ] `/estacoes` — grade mostra as 4 estações, EST-01 com o feed ao vivo do
      pipeline (as outras 3 mostram "câmera indisponível", pipeline não está
      rodando para elas)
- [ ] `/estacao/:id` (EST-01) — feed ao vivo, checklist de EPIs (vazio, nenhum
      onboarding rodou nesta sessão — cadastre EPIs em `/config/epis` para ver a
      lista populada), eventos recentes mostrando os 3 incidentes de CAM-01, **sem
      dock visível** nesta tela
- [ ] Dock — itens "Ao Vivo"/"Alertas"/"Histórico" navegam para `/estacoes`/`/incidentes`
      a partir de qualquer tela (dashboard, heatmap, timeline, detalhe, grade)

## 8. Serviços deixados no ar

```
cypher:        http://localhost:8080  (log: /tmp/e3-verificacao-cypher.log)
cypher-front:  http://localhost:4200  (log: /tmp/e3-verificacao-front.log)
```

O pipeline já terminou de processar o clipe e encerrou por completo — o processo
Python não está mais rodando, e o `MjpegServer` (thread do mesmo processo) caiu
junto (`curl http://127.0.0.1:8090/stream` confirma conexão recusada). Para ver o
feed ao vivo de `/estacoes`/`/estacao/:id` funcionando de verdade, é preciso
subir o pipeline de novo (mesmo comando do §5) antes de abrir essas telas — sem
ele, `LiveFeedComponent` mostra "câmera indisponível" para CAM-01 também, o que é
o comportamento correto documentado (§5 do doc de E1), não um bug.

Backend e front continuam ativos para inspeção manual.
