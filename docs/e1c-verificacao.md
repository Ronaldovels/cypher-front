# E1-C — verificação de ponta a ponta

Data: 2026-08-19. Branch: `feat/e1c-front-dados-reais`, no commit `54a015c`.

Este documento registra o que foi **observado**, não o que deveria acontecer.
Onde a verificação não alcançou, está dito que não alcançou.

## Ambiente

| Peça | Como subiu |
|---|---|
| API | `./mvnw spring-boot:run` em `~/projects/cypher` |
| Front | `npm start` (`environment.development.ts` com `useMockData: false`) |
| Captura | `cypher-capture/venv`, `--device cuda` (RTX 3050 6GB) |

Dois runs de pipeline, sobre vídeos distintos de `data/validation/`:

| Run | Vídeo | Câmera | Porta MJPEG | Frames | p95 E2E |
|---|---|---|---|---|---|
| 1 | `cenario2.mp4` | CAM-01 | 8090 | 1331 | 45.1 ms |
| 2 | `cenario3.mp4` | CAM-02 | 8091 | 1388 | 40.8 ms |

Ambos com `Latency target: PASS ✓ (p95 ≤ 200ms)`.

## Contratos

Os quatro endpoints que o front consome respondem e batem campo por campo
com os tipos da Task 4:

- `GET /api/v1/incidents` → `Page<Incident>` (envelope `content`, como o front tipa)
- `GET /api/v1/summary` → `Summary`, com `heatmap` e `ultimosSeteDias`
- `GET /api/v1/cameras` → `Camera[]`, com `streamUrl` real
- `GET /api/v1/stations` → `Station[]`

O payload do SSE traz `detectedAt` — o campo em que `upsert()` ordena. Confirmado
em payload real, não em fixture.

Correção de rota: o resumo está em `/api/v1/summary`, **não** em
`/api/v1/incidents/summary` (essa devolve 405). O front já chamava a rota certa.

## Caminho do incidente

Listener SSE atado **antes** de o pipeline subir, para não confundir replay com
push. Durante o run 2 chegaram **17 eventos** pelo stream, em dois nomes de
evento: `incident` e `incident-changed`. `connect()` assina os dois
(`incident.service.ts:118-119`), então nenhum é perdido.

Agregados antes → depois do run 2, do mesmo endpoint:

| Campo | Antes | Depois |
|---|---|---|
| `incidentesHoje` | 2 | 8 |
| `criticosHoje` | 1 | 5 |
| `pendentes` | 10 | 16 |
| `ultimosSeteDias` (hoje) | 2 | 8 |
| heatmap EST-02 (Prensa 3) | 0 | 5 |

EST-02 é a estação da CAM-02, a câmera do run — o calor apareceu onde o vídeo
rodou. `ultimosSeteDias[hoje]` acompanha `incidentesHoje` exatamente, e nenhum
KPI contradiz outro. É essa coerência que a Task 10 existia para garantir: antes
da entrega, a tela dizia "8 incidentes pendentes hoje" com `incidentesHoje: 0`.

## Caminho do vídeo

Com o pipeline no ar, `http://127.0.0.1:8090/stream` devolve
`200 multipart/x-mixed-replace; boundary=cypherframe` e **14 MB de JPEG em 4
segundos** — quadros de verdade, não um handshake vazio.

Depois de cada pipeline encerrar, a porta correspondente passa a recusar conexão
(código `000` no curl): 8090 após o run 1, 8091 após o run 2. É o estado que
alimenta o "câmera indisponível" do `LiveFeedComponent`.

O catálogo casa com as portas do pipeline (CAM-01→8090 … CAM-04→8093). O
dashboard renderiza `cameras()[0]`, isto é CAM-01/8090 — foi por isso que o run 1
usou CAM-01 e não a CAM-02 que o plano sugeria: o objetivo era exercitar o card
que a UI de fato mostra.

## O que esta verificação NÃO cobre

Honestidade sobre o alcance:

1. **Nada foi afirmado a partir do DOM renderizado.** Não há Playwright,
   Puppeteer nem Cypress no projeto (`package.json` e `node_modules/.bin`
   conferidos). A cadeia foi verificada em API, SSE e MJPEG; que o badge escreva
   "ao vivo", que o card entre sem refresh e que o KPI incremente em ~2s segue
   dependendo de **olho humano no navegador**. Os 78 testes de unidade cobrem a
   lógica desses componentes; a composição visual, não.
2. **Queda de conexão não foi provocada.** O `onopen`/`onerror` e o re-fetch com
   `since` estão cobertos por teste de unidade, mas não observei o backend cair e
   voltar com o front aberto.
3. **As duas passadas visuais seguem pendentes** e são de dono humano: a
   tipografia da Task 3 (Rendered Fonts sem "Synthetic bold", `.q` em 66px sem
   quebrar em 3 linhas, os 4 KPIs caindo na linha, `.station .sn` legível no tile
   de 76px) e o check da Task 2 (dois ícones distintos, o toggle não navegar,
   tema sobreviver ao reload).

## Divergência encontrada

O bundle de produção **carrega as fixtures de exemplo mortas**. `useMockData` é
`false` nos dois ambientes e o interceptor nunca é registrado, então não há bug
de comportamento — mas `grep` acha `run-exemplo` e `Queda detectada` dentro de
`dist/cypher-front/browser/main-*.js`. O ternário
`environment.useMockData ? [mockApiInterceptor] : []` não foi eliminado no
tree-shaking, e ~10.7 KB de fonte de mock viajam para produção.

Não corrigido nesta entrega: é peso, não risco, e mexer nisso agora mudaria o
grafo de imports fora do escopo do E1-C. Registrado para virar tarefa própria
(a saída seria `import()` dinâmico atrás da flag, ou mover o mock para um
`fileReplacements` do build).

## Estado da branch

- `npm test -- --watch=false` → exit 0, **13 arquivos, 78/78 passando**
- `npm run build` → exit 0, **Initial total 424.15 kB**
