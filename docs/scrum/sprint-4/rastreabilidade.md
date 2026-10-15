# Matriz de rastreabilidade — requisito → entrega

Liga cada requisito do Challenge/Metaindústria ao item do backlog, ao código que o entrega, à tela onde aparece e ao teste ou evidência que o comprova.

**Fontes:**
- [Product Backlog](../sprint-3/product-backlog.md), de onde vêm os números dos itens e os links dos PRs.
- [`docs/fluxo-de-telas.md`](../../fluxo-de-telas.md), para as rotas.
- [`cypher-capture/docs/metricas-finais.md`](https://github.com/lucvs07/cypher-capture/blob/main/docs/metricas-finais.md) e seus logs, para as métricas.

**Siglas dos repositórios nos PRs:** API = [`Cypher-Api`](https://github.com/lucvs07/Cypher-Api), CAP = [`cypher-capture`](https://github.com/lucvs07/cypher-capture), FRONT = [`cypher-front`](https://github.com/Ronaldovels/cypher-front).

## 1. Requisitos do Challenge

| Requisito | Item do backlog | Sprint | PR(s) | Tela / rota | Teste / evidência |
|---|---|---|---|---|---|
| **Detecção de EPI em tempo real** (capacete, óculos, bota, colete, luva, máscara) | Fase 1 do Challenge, item #1 | 1 a 4 | CAP #13 (EPI exigido por zona) | Kiosk `/estacao/:id` (checklist), `/incidentes` | mAP@0.5 0,915 em `metricas-finais.md` §1; `tests/test_epi_absence.py`, `tests/test_epi_catalog.py`; `fluxo-cenario4.txt` |
| **Postura de risco e queda** (pose, REBA, histerese) | Fase 2 do Challenge, item #9 (gating de queda) | 2 e 3 | CAP #10 (gating temporal de queda), CAP #12 (REBA com câmera angulada) | `/incidentes`, `/incidentes/:id` (REBA e severidade) | `tests/test_reba.py`, `tests/test_reba_smoother.py`; `eval-cenario*.txt`; `pytest-cypher-capture.txt` (449 passaram) |
| **Notificação do incidente ao operador e ao gestor** (SSE, alerta sonoro, central de notificações) | #1 (E1), #3 (E3); Central de notificações | 3 e 4 | FRONT #13 (central de notificações) | `/dashboard`, `/estacao/:id`, sino no topo | `docs/e1c-verificacao.md`, `docs/e3-verificacao.md`; `notification-center.component.spec.ts`, `station-kiosk.component.spec.ts` |
| **Integração com outros sistemas** (webhooks e MCP) | #7 (webhook); MCP na Sprint 4 | 3 e 4 | API #8, FRONT #7 (webhook); API #15, FRONT #16 (MCP) | `/config/webhooks`, `/config/mcp` | `WebhookControllerApiTest`, `McpCredentialApiTest`, `McpSecurityLockdownApiTest`; `docs/mcp-runbook.md` |
| **Análise de risco com IA** | #11 | 3 | API #6, FRONT #5 | `/incidentes/:id` ("Analisar com IA") | `LlmAnalysisServiceTest`, `LlmResponseParserTest` |
| **Dados simulados da Metaindústria** (EPIs, ocorrências, alertas, histórico por equipe) | Sprint 4, card S4-05 | 4 | — | todas as telas do gestor | `docs/empresa-demo-runbook.md`; `scripts/seed-empresa-demo.sh` e `seed_gamificacao_demo.py` (backend) |

## 2. Itens *Must* do Product Backlog

| # | Item | Entrega | PR(s) | Tela / rota | Teste / evidência |
|---|---|---|---|---|---|
| 1 | Notificar um incidente ponta a ponta (capture → backend → front) | E1 | ver `docs/e1c-verificacao.md` | `/dashboard`, `/incidentes` | `docs/e1c-verificacao.md`, `cypher-capture/docs/e1b-verificacao.md` |
| 2 | Cadastro de câmeras e estações, captura resiliente | E2 | ver `docs/e2c-verificacao.md` | `/estacoes`, `/config/estacoes` | `docs/e2c-verificacao.md`, `cypher-capture/docs/e2-verificacao-integrada.md`; `stations-config.component.spec.ts` |
| 3 | Timeline, detalhe, status e kiosk do operador | E3 | ver `docs/e3-verificacao.md` | `/incidentes`, `/incidentes/:id`, `/estacao/:id` | `docs/e3-verificacao.md`; `station-kiosk.component.spec.ts` |
| 4 | Login por papel, guards e equipes | E4 | FRONT #17, #18 (limpeza de estado e guards, Sprint 4) | `/login`, `/login-estacao`, `/config/equipe` | `auth.guards.spec.ts`, `auth.service.spec.ts`, `app.routes.spec.ts`, `equipes-config.component.spec.ts` |
| 5 | Chave de API por câmera na ingestão | E4 | ver [Product Backlog](../sprint-3/product-backlog.md) | (sem tela: a chave é provisionada pelo pipeline) | `IncidentIngestionApiTest`, `SecurityLockdownApiTest`, `HeartbeatApiTest` (backend) |
| 6 | Multi-tenant por `Empresa` | E5 (pré-requisito) | API [#7](https://github.com/lucvs07/Cypher-Api/pull/7), FRONT [#6](https://github.com/Ronaldovels/cypher-front/pull/6) | todas | `MultiTenantIsolationApiTest`, `IncidentCrossTenantScopeApiTest` |
| 8 | Zonas de risco pela interface | E5 | API [#9](https://github.com/lucvs07/Cypher-Api/pull/9), CAP [#9](https://github.com/lucvs07/cypher-capture/pull/9), FRONT [#8](https://github.com/Ronaldovels/cypher-front/pull/8) | editor em `/config/estacoes` | `ZonaControllerApiTest`; `tests/test_zone_manager.py`, `test_zone_hot_reload.py`; `zone-editor.component.spec.ts` |
| 11 | Análise de risco por LLM multimodal | E5 | API [#6](https://github.com/lucvs07/Cypher-Api/pull/6), FRONT [#5](https://github.com/Ronaldovels/cypher-front/pull/5) | `/incidentes/:id` | `LlmAnalysisServiceTest` |
| 12 | Evoluir o protótipo com 2 ou mais telas novas | Sprint 3 | — | 7 telas em `fluxo-de-telas.md` | [`fluxo-de-telas.md`](../../fluxo-de-telas.md) |
| 13 | Board Trello | Sprint 3 | — | — | [Board](https://trello.com/b/AqgHhHCP/dev4-cypher-challenge) |
| 14 | Cerimônias Scrum da Sprint 3 | Sprint 3 | — | — | [`cerimonias.md`](../sprint-3/cerimonias.md) |
| 15 | README com Trello, Figma e cerimônias | Sprint 3 | — | — | [`README.md`](../../../README.md) |
| 24 | Orquestrador de pipelines por câmera | E5 | CAP [#8](https://github.com/lucvs07/cypher-capture/pull/8) | — | `tests/test_orchestrator_reconciler.py`, `test_orchestrator_registry.py`, `test_orchestrator_session.py` |
| 25 | Design system documentado | Sprint 3 | — | — | [`design-system.md`](../../design-system.md) |
| 26 | Documentação de arquitetura dos 3 repositórios | Sprint 3, atualizada na 4 | — | — | [`arquitetura.md`](../../arquitetura.md) |

## 3. Itens *Should* e *Could* entregues

| # | Item | PR(s) | Tela / rota | Teste / evidência |
|---|---|---|---|---|
| 7 | Webhook pela interface | API [#8](https://github.com/lucvs07/Cypher-Api/pull/8), FRONT [#7](https://github.com/Ronaldovels/cypher-front/pull/7) | `/config/webhooks` | `WebhookControllerApiTest`; `webhooks-config.component.spec.ts` |
| 9 | Gamificação por equipe | API [#10](https://github.com/lucvs07/Cypher-Api/pull/10), CAP [#11](https://github.com/lucvs07/cypher-capture/pull/11), FRONT [#10](https://github.com/Ronaldovels/cypher-front/pull/10) | `/placar` | `PlacarApiTest`; `placar.component.spec.ts` |
| 10 | Relatórios CSV e PDF | API [#11](https://github.com/lucvs07/Cypher-Api/pull/11), FRONT [#11](https://github.com/Ronaldovels/cypher-front/pull/11) | `/incidentes`, `/heatmap`, `/placar` (botões de exportar) | `ReportControllerApiTest` |
| 20 | Hot-reload de zonas | CAP (`ZoneHotReloader`) | editor de zonas | `tests/test_zone_hot_reload.py` |

## 4. Entregas da Sprint 4 (depois de 14/09)

| Entrega | PR(s) | Tela / rota | Teste / evidência |
|---|---|---|---|
| REBA com câmera angulada (rotação e roll) | CAP [#12](https://github.com/lucvs07/cypher-capture/pull/12), API [#14](https://github.com/lucvs07/Cypher-Api/pull/14), FRONT [#15](https://github.com/Ronaldovels/cypher-front/pull/15) | `/config/estacoes` | `tests/test_reba.py` |
| Servidor MCP e credenciais pela interface | API [#15](https://github.com/lucvs07/Cypher-Api/pull/15), FRONT [#16](https://github.com/Ronaldovels/cypher-front/pull/16) | `/config/mcp` | `McpCredentialApiTest`, `McpSecurityLockdownApiTest`, `mcp-config.component.spec.ts` |
| Fixes de tracker e sink | CAP [#14](https://github.com/lucvs07/cypher-capture/pull/14), [#15](https://github.com/lucvs07/cypher-capture/pull/15), [#16](https://github.com/lucvs07/cypher-capture/pull/16), [#17](https://github.com/lucvs07/cypher-capture/pull/17) | — | `pytest-cypher-capture.txt` |
| Fixes de webhook | API [#16](https://github.com/lucvs07/Cypher-Api/pull/16), [#17](https://github.com/lucvs07/Cypher-Api/pull/17) | `/config/webhooks` | `WebhookControllerApiTest` |
| Só os 6 EPIs que o modelo detecta | commit `b954bfa` (FRONT) | `/config/epis` | `epis-tab.component.spec.ts`; `tests/test_epi_catalog.py` |
| Instalação limpa sem webcam, GPU ou chave de LLM | commits da Sprint 4 nos 3 repositórios | — | teste de instalação limpa registrado na [Review](review.md) |
| Métricas do modelo com fonte | commit de `docs/metricas-finais.md` (CAP) | — | `metricas-finais.md` e `docs/evidencias-sprint4/logs/` |
| Arquitetura final e manual de uso | commits da Sprint 4 (FRONT) | — | [`arquitetura.md`](../../arquitetura.md), [`manual-de-uso.md`](../../manual-de-uso.md) |

## 5. Pendências sem item entregue

Itens que o Product Backlog ainda lista como não concluídos e que a Sprint 4 não entregou: #16 (rotação automática de token de estação), #17 (limite de tentativas de login), #18 (esqueci minha senha), #19 (super-admin multi-empresa), #21 (refilmar o cenário de ergonomia de perfil), #22 (filmar zona crítica) e #23 (deploy com 3 ou mais câmeras reais na Metaindústria).
