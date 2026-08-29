# Cypher — Operação (E3): timeline, detalhe, feeds e kiosk

**Data:** 2026-08-23
**Status:** aprovado (design)
**Escopo:** **Entrega E3** do roteiro de §14 do documento `2026-08-10-notificacao-de-incidentes-design.md` — as quatro telas de operação: timeline com filtros, detalhe do incidente, grade de feeds ao vivo e kiosk do operador.

Pré-requisitos já entregues: E1 (núcleo de notificação) e E2 (cadastro de estações/câmeras) estão implementados e mergeados em `dev` nos três repositórios.

**Repositórios tocados por esta entrega:** `cypher` (um endpoint novo, §3) e `cypher-front` (as quatro telas, praticamente todo o trabalho). `cypher-capture` **não** é tocado — nada em E3 depende de mudança no pipeline (§1.1).

**Nota de design:** toda implementação em `cypher-front` usa os primitivos globais já estabelecidos em `src/styles.scss` (`.field`, `.input`, `.select`, `.btn`, `.surface`, tokens como `--line-2`) — o mesmo padrão que a correção do commit `6394366` ("cadastro de estações/câmeras segue o design system do app") aplicou em E2. Nenhum componente novo de E3 introduz CSS solto ou elementos crus sem essas classes; onde o wireframe original (`Cypher/uploads/Cypher/gestor.jsx`, `operador.jsx`, `primitives.jsx`) sugerir algo fora desses primitivos, adapta-se ao sistema existente em vez de estendê-lo ad hoc.

---

## 1. Contexto e diagnóstico

### 1.1 O que já existe

Um levantamento no início desta entrega confirmou que a plumbing de dados para E3 já está construída, testada e não usada por nenhuma tela:

- **`cypher` (backend):** `GET /api/v1/incidents` já suporta paginação e filtros `since`, `camera`, `severityMin`, `status`. `PUT /api/v1/incidents/{id}/status` já existe, já aceita qualquer transição de `AlertaStatus` (sem validação de sequência) e já publica `IncidentChangedEvent`, que o `IncidentSseService` propaga como evento SSE `incident-changed`. O catálogo de estações/câmeras (E2) tem CRUD completo, e `Station.cameras` já entrega a lista de câmeras de uma estação.
- **`cypher-front`:** `IncidentService` já expõe `incidents` (signal, até 100 itens), `connection`, `summary`, `loadHistory(since?)`, `upsert()` e **`acknowledge(id, status)`** (já chama o `PUT .../status`). `CatalogService` já expõe `cameras`/`stations`. `LiveFeedComponent` já renderiza um stream MJPEG com tratamento de erro. `ConfigService.config().epis` já guarda os EPIs exigidos, cadastrados no onboarding. O `dock.component.ts` já reserva itens de navegação sem rota: "Ao Vivo", "Alertas", "Histórico". O modo mock (`fixtures.ts` + interceptor) já responde ao `PUT .../status`.
- **`cypher-capture`:** upload de snapshot (Cloudinary) já implementado e usado pelo `IncidentTracker`, fora do caminho crítico (§4.4 do doc de E1). Nada em E3 depende de mudança no pipeline.

**Único gap real identificado:** não existe `GET /api/v1/incidents/{id}` para buscar um incidente individual. Sem ele, `/incidentes/:id` não sobrevive a um refresh de página ou a um link direto, porque o único cache disponível é o store de 100 itens mais recentes do `IncidentService`.

### 1.2 Consequência de escopo

Diferente de E1 e E2, que dividiam trabalho comparável entre as três frentes (`e1a`/`e1b`/`e1c`, `e2a`/`e2b`/`e2c`), **E3 é majoritariamente frontend**: uma mudança pontual no backend e nenhuma no pipeline. A entrega usa um único spec e plano cobrindo as quatro telas, não subdividido por repositório nem por dupla de telas — a infraestrutura de dados já compartilhada entre elas não justifica a fronteira.

---

## 2. Mapa de telas

Do mapa de §14.1 do documento de E1:

```
gestor · desktop
  /incidentes              timeline com filtros
  /incidentes/:id          detalhe — snapshot, REBA, zona, EPIs, ações

  /estacoes                grade de feeds ao vivo

operador · kiosk na estação
  /estacao/:id              feed ao vivo · checklist de EPIs · eventos recentes
```

### 2.1 `/incidentes` — `IncidentTimelineComponent`

Tabela paginada, mais recentes primeiro. Filtros: câmera (não estação — o backend filtra só por `camera`, e misturar múltiplas câmeras de uma estação quebraria a paginação real do backend, diferente do kiosk em §2.4, que não pagina), severidade mínima, status, período (`since`). O seletor de câmera no filtro mostra o nome amigável (via `CatalogService`) mas envia o `cameraId`. Cada linha mostra tipo, severidade (badge), câmera, horário, status, e uma ação rápida de reconhecer (mudar status inline). Clique na linha (fora da ação) navega para `/incidentes/:id`.

Busca via `IncidentService.search(filtros, page, size)` (§4), com paginação real do backend — não filtra sobre o store de 100 itens em memória, que cobre só o "ao vivo" recente.

### 2.2 `/incidentes/:id` — `IncidentDetailComponent`

Snapshot (ou placeholder "processando imagem" se `snapshotUrl` ainda é `null`), tipo, severidade, REBA (`rebaScore`, `actionLevel`), zona (`zoneName`/`zoneStatus`), EPIs presentes/ausentes, duração (`durationSeconds`, disponível só após o fechamento), motivo de fechamento (`closedReason`). Botões para as três transições de status — livres, qualquer uma para qualquer uma, refletindo o que o backend já permite.

Busca por `IncidentService.getById(id)` (§4). Se o backend responder 404, mensagem de erro com link de volta para `/incidentes`.

### 2.3 `/estacoes` — `StationsGridComponent`

Grade com um `LiveFeedComponent` por estação, usando a primeira câmera da estação (`station.cameras[0]`) — mesmo critério que o dashboard já usa hoje (`cameras()[0]`), sem seletor: nenhuma tela do front tem hoje alternância entre câmeras, e introduzir uma nesta entrega seria escopo novo, não reaproveitamento. Cada card linka para `/estacao/:id`.

Tela nova, distinta do `/heatmap` existente: o heatmap é visualização agregada de KPIs por célula (números/cores); `/estacoes` é vídeo ao vivo. Propósitos diferentes não compartilham layout.

### 2.4 `/estacao/:id` — `StationKioskComponent`

Três seções:
- **Feed ao vivo** de todas as câmeras da estação (`LiveFeedComponent` por câmera, empilhados ou em grade pequena dentro da tela) — diferente da grade de `/estacoes`, que mostra só a primeira câmera como miniatura representativa de cada estação. O kiosk é a tela dedicada daquela estação: o operador que já chegou até `/estacao/:id` quer ver todas as câmeras, não só a primeira.
- **Checklist de EPIs**, somente leitura: lista `ConfigService.config().epis` (já cadastrada no onboarding). Sem interação, sem persistência de "marcado/não marcado" — informativo. Nenhum contrato novo de backend: o modelo de dados já existe, só não tinha consumidor.
- **Eventos recentes da estação**: últimos N incidentes de todas as câmeras da estação. O filtro `camera` do backend aceita só um valor por vez (§3), então o componente faz uma chamada `IncidentService.search({ camera }, ...)` por câmera da estação e mescla os resultados no cliente (concatenar, ordenar por `detectedAt` desc, cortar em N) — sem endpoint novo de "por estação", cujo custo não se justifica para estações com poucas câmeras. **Não é "eventos do turno"** — o conceito de turno/equipe só existe a partir de E4/E5 (§16 do doc de E1); nomear a seção como "turno" prometeria uma semântica que ainda não existe.

---

## 3. Backend — mudança única

`GET /api/v1/incidents/{id}` → `IncidentResponse` (200) ou 404. Sem outra mudança: `changeStatus` já é livre e já publica o evento SSE de mudança; `search` já suporta os quatro filtros que a timeline precisa.

---

## 4. Front — camada de dados

Dois métodos novos em `IncidentService`, sem alterar o que já existe:

```typescript
getById(id: number): Observable<Incident>       // GET /incidents/{id}
search(filters: {
  camera?: string; severityMin?: number;
  status?: AlertaStatus; since?: string;
}, page: number, size: number): Observable<Page<Incident>>  // GET /incidents
```

`getById` também faz `upsert()` no store global, para que uma mudança recebida via SSE enquanto a tela de detalhe está aberta apareça sem recarregar — a tela observa o item via `computed()` sobre `incidents()`, com fallback para o resultado do `getById` inicial.

`search` mantém estado próprio no componente da timeline, sem entrar no store de 100 itens: filtros por severidade/status/câmera podem alcançar além do que está em memória, e misturar isso no store compartilhado contaminaria o "ao vivo" do dashboard.

`CatalogService` não precisa de método novo — `Station.cameras` já é suficiente.

Modo mock: adicionar handlers no interceptor para `GET /incidents/{id}` e para os filtros de `GET /incidents` (hoje o interceptor não filtra); usar o array `INCIDENTS` de `fixtures.ts`, que já tem todos os campos do contrato, incluindo `status`.

---

## 5. Tratamento de erros

| Situação | Comportamento |
|---|---|
| `snapshotUrl` ainda `null` | Placeholder "processando imagem" no detalhe |
| `GET /incidents/{id}` → 404 | Mensagem + link de volta para `/incidentes` |
| Falha ao mudar status | Mantém estado anterior, mostra erro (`mensagemDeErro()`, mesmo padrão de `acknowledge()` hoje) |
| Filtros sem resultado | Estado vazio explícito ("nenhum incidente encontrado com esses filtros") |
| Feed indisponível (grade ou kiosk) | Já resolvido pelo `LiveFeedComponent` existente |

---

## 6. Estratégia de testes

**`cypher`:** teste de integração para `GET /incidents/{id}` — encontrado (200) e ausente (404).

**`cypher-front`:** spec por componente novo (`IncidentTimelineComponent`, `IncidentDetailComponent`, `StationsGridComponent`, `StationKioskComponent`) cobrindo renderização, aplicação de filtros e chamada das ações de status; specs de `getById`/`search` no `IncidentService` via `HttpTestingController`. Segue o padrão dos 115 testes já existentes no repo.

**Ponta a ponta:** ver §8.

---

## 7. Branches e commits

`cypher-capture` não é tocado nesta entrega — sem branch.

- **`cypher`:** branch `feat/e3a-backend-incident-by-id`. Um commit de endpoint + teste.
- **`cypher-front`:** branch `e3b-front-operacao` (mesmo padrão sem prefixo usado em `e2c-front-cadastro`). Commits, um por camada/tela:
  1. `feat(front): getById e search no IncidentService`
  2. `feat(front): timeline de incidentes com filtros (/incidentes)`
  3. `feat(front): detalhe do incidente (/incidentes/:id)`
  4. `feat(front): grade de feeds por estação (/estacoes)`
  5. `feat(front): kiosk do operador (/estacao/:id)`
  6. `feat(front): liga rotas de operação ao dock`

---

## 8. Plano de validação ponta a ponta

Segue o padrão já usado em E2 (`docs/e2c-e2e-validacao-prompt.md` → `docs/e2c-verificacao.md`): um prompt copiável para uma sessão futura, escrito quando as branches de `cypher` e `cypher-front` estiverem prontas, em `docs/e3-e2e-validacao-prompt.md` (repo `cypher-front`). Cobre:

1. Subir `cypher` (`./mvnw -o spring-boot:run`) e `cypher-front` (`npm start`, `useMockData: false`).
2. Confirmar por `curl` o contrato do endpoint novo: `GET /incidents/{id}` existente → 200 com o corpo esperado; id inexistente → 404.
3. Navegar pela timeline aplicando cada filtro (câmera, severidade mínima, status, período) contra dados reais gerados pelo pipeline (reaproveita `cenario2.mp4` ou a webcam, como em E1/E2).
4. Abrir o detalhe de um incidente real: confirmar que o snapshot aparece depois do `PATCH` assíncrono (pode chegar depois do primeiro carregamento da tela).
5. Mudar o status em duas abas abertas simultaneamente e confirmar propagação via SSE (`incident-changed`) sem recarregar.
6. Conferir a grade de feeds (`/estacoes`) e o kiosk (`/estacao/:id`) contra o pipeline real rodando — reaproveita o setup multi-câmera de §6.5 do doc de E1 (3–4 processos, `cameraId` e `stream_port` distintos).
7. Confirmar que a checklist de EPIs do kiosk reflete o que foi cadastrado no onboarding.
8. Registrar o resultado em `docs/e3-verificacao.md`, com números reais e divergências reais — o documento registra o que aconteceu, não certifica sucesso.

---

## 9. Fora de escopo de E3

- Modelo de turno/equipe (E4/E5) — a seção de "eventos recentes" do kiosk não depende disso e não deve ser confundida com ele.
- Interatividade na checklist de EPIs (marcar/desmarcar, persistir) — somente leitura nesta entrega.
- `EPI_VIOLATION` como incidente real — segue sem disparar, por limitação do detector (§4.6 do doc de E1), inalterado por E3.
- Autenticação e identificação de quem reconheceu um incidente — E4.
