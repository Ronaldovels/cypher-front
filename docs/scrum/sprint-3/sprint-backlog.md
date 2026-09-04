# Sprint Backlog — Sprint 3

**Período:** 2026-08-23 a 2026-09-01
**Sprint Goal:** Fechar a Entrega E4 (acesso, papéis e cadastro de equipes) nos três repositórios, especificar e planejar as 6 próximas entregas do roteiro de produto (multi-tenant, webhook, zonas de risco, gamificação E5, relatórios E6, análise por LLM multimodal) e, na sequência, evoluir o protótipo Figma para acompanhar os fluxos já entregues, com a gestão do grupo formalizada em Scrum visível no Trello e as cerimônias documentadas.

Board Trello: `[PREENCHER: link do board Trello, com permissão de visualização]`

---

## Colunas do board

`Product Backlog` → `Sprint Backlog` → `Em andamento` → `Em revisão` → `Concluído`

## Cards da Sprint 3

### Código (concluído — evidenciado pelo histórico de commits/PRs, 2026-08-23 a 2026-08-25)

| Card | Descrição | Responsável | Status |
|---|---|---|---|
| Backend — `Usuario`, `Equipe`, sessão e guards de segurança | Spring Security com `HttpSession`, `/auth/*`, `/setup`, restrição de OPERADOR à própria `estacaoId` — PR [#5](https://github.com/lucvs07/Cypher-Api/pull/5) | Lucas Grecco | ✅ Concluído |
| Capture — chave de API por câmera na ingestão | `X-Cypher-Key` via `api_key_env`, provisionamento automático via login de gestor — PR [#7](https://github.com/lucvs07/cypher-capture/pull/7) | Lucas Grecco | ✅ Concluído |
| Front — login (gestor/kiosk), guards, dock por papel, `/config/equipe` | Telas `/login`, `/login-estacao`, abas Equipes/Usuários — PR [#4](https://github.com/Ronaldovels/cypher-front/pull/4) | Lucas Grecco | ✅ Concluído |

### Planejamento (concluído — 2026-08-25 a 2026-09-01, evidenciado pelos specs/planos commitados)

| Card | Descrição | Responsável | Status |
|---|---|---|---|
| Spec + plano — Multi-tenant (Empresa) | Design de PK prefixada por empresa (`empresaId:codigo`) para `Estacao`/`Camera`/`Equipe`, `TenantContext`, sessão real por empresa. `docs/superpowers/specs/planejadas/2026-08-29-multi-tenant-design.md` + `docs/superpowers/plans/multi-tenant/` | Lucas Grecco | ✅ Concluído |
| Spec + plano — Cadastro de webhook pela interface | CRUD de `WebhookSubscription` + histórico de `WebhookDelivery`, fecha o gap de "só via YAML+restart". `docs/superpowers/specs/planejadas/2026-08-29-cadastro-webhook-design.md` + `docs/superpowers/plans/webhook/` | Lucas Grecco | ✅ Concluído |
| Spec + plano — Zonas de risco pela interface | Editor de polígono no canvas, `ZoneConfigClient` com ladder de degradação no `cypher-capture`. `docs/superpowers/specs/planejadas/2026-08-29-zonas-de-risco-design.md` + `docs/superpowers/plans/zonas-de-risco/` | Lucas Grecco | ✅ Concluído |
| Spec + plano — Gamificação por equipe (E5) | Heartbeat de câmera, placar por delta de conformidade, metas por equipe. Bloqueado por gating externo no `cypher-capture`. `docs/superpowers/specs/planejadas/2026-08-29-gamificacao-e5-design.md` + `docs/superpowers/plans/e5-gamificacao/` | Lucas Grecco | ✅ Concluído (execução bloqueada) |
| Spec + plano — Relatórios e exportação (E6) | CSV de incidentes (liberado), CSV de placar + PDF de resumo (depende de E5). `docs/superpowers/specs/planejadas/2026-08-29-relatorios-e6-design.md` + `docs/superpowers/plans/e6-relatorios/` | Lucas Grecco | ✅ Concluído |
| Spec + plano — Análise de risco com LLM multimodal | Botão "Analisar com IA" no detalhe do incidente, cliente alternável Claude/Gemini via `@ConditionalOnProperty`. `docs/superpowers/specs/planejadas/2026-09-01-analise-llm-multimodal-design.md` + `docs/superpowers/plans/analise-llm/` | Lucas Grecco | ✅ Concluído |
| Spec + plano — Orquestrador de pipelines por câmera | Reconcilia o catálogo de câmeras com processos `run_pipeline.py`, mono-tenant por instância. Nasceu de um gap achado no teste manual de multi-tenant (2026-09-03), não do backlog original de 6 entregas. `docs/superpowers/specs/planejadas/2026-09-03-orquestrador-pipelines-design.md` + `docs/superpowers/plans/orquestrador-pipelines/` | Lucas Grecco | ✅ Concluído |

### Análise LLM multimodal (puxado em 2026-09-01, implementado via subagent-driven development, mergeado em 2026-09-02)

| Card | Descrição | Checklist (tasks do plano) | Responsável | Status |
|---|---|---|---|---|
| Análise LLM multimodal — backend (`ala`) | `RiskAnalysisResponse`, `PromptBuilder` (v1/v2), `LlmResponseParser`, `ClaudeVisionClient`/`GeminiVisionClient`, `LlmAnalysisService` (com `RetryComBackoff` para 503 transitório), endpoints `POST`/`GET /incidents/{id}/analyze` — PR [#6](https://github.com/lucvs07/Cypher-Api/pull/6), **mergeado** | 7 tasks — `plans/analise-llm/2026-09-01-ala-backend-analise-llm.md` (+ retry e cache de última análise, adicionados após teste ponta a ponta) | Lucas Grecco | ✅ Concluído |
| Análise LLM multimodal — front (`alb`) | Botão "Analisar com IA" + painel de resultado (redesenhado via skill `frontend-design`) no detalhe do incidente, carregamento automático da última análise, modo mock — PR [#5](https://github.com/Ronaldovels/cypher-front/pull/5), **mergeado** | 3 tasks — `plans/analise-llm/2026-09-01-alb-front-analise-llm.md` (+ auto-carregamento e redesenho, adicionados após teste ponta a ponta) | Lucas Grecco | ✅ Concluído |

Planning registrado em `docs/scrum/sprint-3/cerimonias.md` §1.1. Review registrada em `docs/scrum/sprint-3/cerimonias.md` §3.1. Testado ponta a ponta com câmera real (webcam local, Cloudinary e Gemini reais) antes do merge.

### Multi-tenant (puxado em 2026-09-02, implementado via subagent-driven development, mergeado em 2026-09-03)

| Card | Descrição | Checklist (tasks do plano) | Responsável | Status |
|---|---|---|---|---|
| Multi-tenant — backend (`mta`) | `Empresa`, `TenantContext`, PK prefixada nas 6 entidades, sessão real por empresa, escopo de listagens/incidentes/SSE/webhook. 4 vazamentos cross-tenant reais encontrados e corrigidos durante a execução (ver Review) — PR [#7](https://github.com/lucvs07/Cypher-Api/pull/7), **mergeado**, 315/315 testes | 8 tasks — `plans/multi-tenant/2026-08-29-mta-backend-empresa.md` | Lucas Grecco | ✅ Concluído |
| Multi-tenant — front (`mtb`) | Slug no onboarding, `AuthService.bootstrap()` com `empresaId`, `LandingComponent`, topbar mostrando nome da empresa — PR [#6](https://github.com/Ronaldovels/cypher-front/pull/6), **mergeado**, 291/291 testes | 4 tasks — `plans/multi-tenant/2026-08-29-mtb-front-empresa.md` | Lucas Grecco | ✅ Concluído |

Planning informal (sem ata dedicada — seguiu direto o roteiro de entregas, ordem 1). Review registrada em `docs/scrum/sprint-3/cerimonias.md` §3.2. Testado manualmente ponta a ponta com os três projetos rodando localmente (onboarding, sign-up, isolamento entre empresas) antes do merge.

### Orquestrador de pipelines + Webhook (puxados em 2026-09-03, implementados via subagent-driven development, mergeados em 2026-09-04)

| Card | Descrição | Checklist (tasks do plano) | Repositório | Responsável | Status |
|---|---|---|---|---|---|
| Orquestrador de pipelines por câmera (`oqa`) | Reconcilia o catálogo de câmeras com processos `run_pipeline.py` rodando — sobe o que falta, derruba o desativado, reinicia o que mudou de config ou morreu sozinho. Mono-tenant por instância. PR [#8](https://github.com/lucvs07/cypher-capture/pull/8), **mergeado**, 247/247 testes | 5 tasks — `plans/orquestrador-pipelines/2026-09-03-oqa-capture-orquestrador.md` | `cypher-capture` | Lucas Grecco | ✅ Concluído |
| Webhook — backend (`wha`) | CRUD de `WebhookSubscription`, histórico paginado de `WebhookDelivery`, `?incluirInativos=true` para listar/reativar assinante desativado. PR [#8](https://github.com/lucvs07/Cypher-Api/pull/8), **mergeado**, 326/326 testes | 2 tasks — `plans/webhook/2026-08-29-wha-backend-webhook.md` | `cypher` | Lucas Grecco | ✅ Concluído |
| Webhook — front (`whb`) | Aba "Webhooks" em `/config` (assinantes + histórico), redesenhada via skill `frontend-design` seguindo o style guide já implementado. PR [#7](https://github.com/Ronaldovels/cypher-front/pull/7), **mergeado**, 314/314 testes | 4 tasks — `plans/webhook/2026-08-29-whb-front-webhook.md` | `cypher-front` | Lucas Grecco | ✅ Concluído |

Planning de `oqa` registrado em `docs/scrum/sprint-3/cerimonias.md` §1.2. Planning de `wha`/`whb` registrado em `docs/scrum/sprint-3/cerimonias.md` §1.3. Review registrada em `docs/scrum/sprint-3/cerimonias.md` §3.3. Os três cards movidos de `Sprint Backlog`/`Product Backlog` para `Em andamento` em 2026-09-03 (implementação delegada a um agente por repositório, subagent-driven development em paralelo), para `Em revisão` no mesmo dia com os 3 PRs abertos, e para `Concluído` em 2026-09-04 depois de um teste manual ponta a ponta com os três projetos rodando localmente (webcam real do notebook, inferência em CUDA) e o merge dos 3 PRs.

### Zonas de risco (puxado em 2026-09-04, implementação via subagent-driven development, em andamento)

| Card | Descrição | Checklist (tasks do plano) | Repositório | Responsável | Status |
|---|---|---|---|---|---|
| Zonas de risco — backend (`zra`) | `Zona`, polígono normalizado, endpoints `/cameras/{codigo}/zones` + config para o pipeline | 2 tasks — `plans/zonas-de-risco/2026-08-29-zra-backend-zonas.md` | `cypher` | Lucas Grecco | 🔄 Em andamento |
| Zonas de risco — capture (`zrb`) | `ZoneManager` com zonas pré-carregadas, `ZoneConfigClient` (ladder de degradação) | 3 tasks — `plans/zonas-de-risco/2026-08-29-zrb-capture-zonas.md` | `cypher-capture` | Lucas Grecco | 🔄 Em andamento |
| Zonas de risco — front (`zrc`) | Editor de polígono em canvas, integrado a `/config/estacoes` | 5 tasks — `plans/zonas-de-risco/2026-08-29-zrc-front-zonas.md` | `cypher-front` | Lucas Grecco | 🔄 Em andamento |

Planning registrado em `docs/scrum/sprint-3/cerimonias.md` §1.4. Os três cards movidos de `Product Backlog` para `Em andamento` em 2026-09-04 — execução delegada a um agente por repositório (subagent-driven development), uma sessão separada para `zra` (backend), `zrb` (capture) e `zrc` (front). `zrb`/`zrc` não têm bloqueio duro sobre `zra` (capture tem cache + arquivo local como fallback, front tem modo mock), mas o teste ponta a ponta final (spec §6) exige as três prontas.

### Próximas entregas (cards para o Product Backlog do Trello — desenvolvimento ainda não iniciado)

Um card por fatia de repositório de cada plano — o checklist do card é a lista de tasks do próprio arquivo do plano (`docs/superpowers/plans/<entrega>/`). Ordem de cima pra baixo = ordem de retirada recomendada pelo roteiro (`docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md` §3); cards sem dependência pendente podem ser puxados em paralelo.

**Coluna inicial no Trello: `Product Backlog`**, para os 4 cards abaixo — nenhum teve código iniciado ainda. Os cards de Análise LLM multimodal (`ala`/`alb`), Multi-tenant (`mta`/`mtb`), Orquestrador (`oqa`), Webhook (`wha`/`whb`) e Zonas de risco (`zra`/`zrb`/`zrc`) já foram puxados — ver seções acima. Mover os demais para `Sprint Backlog` só quando o time decidir puxá-los, respeitando a coluna "Depende de".

**Orquestrador de pipelines (`oqa`) inserido no topo da fila em 2026-09-03** — decisão de produto, registrada em `docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md` §3 ("Priorização do orquestrador"), motivada por um gap real encontrado no teste manual ponta a ponta de multi-tenant. As demais linhas foram renumeradas (+1) para manter a ordem de retirada sequencial. Com `zra`/`zrb`/`zrc` puxados em 2026-09-04, as linhas restantes foram renumeradas novamente.

| Ordem | Card | Descrição | Checklist (tasks do plano) | Depende de |
|---|---|---|---|---|
| 8 | Relatórios — backend, CSV de incidentes (`e6a`, tarefa 1) | `CsvReportBuilder`, `GET /reports/incidents.csv` | 1 task — `plans/e6-relatorios/2026-08-29-e6a-backend-relatorios.md` (tarefa 1) | multi-tenant |
| 9 | Relatórios — front, CSV de incidentes (`e6b`, tarefa 1) | Link de exportação na timeline de incidentes | 1 task — `plans/e6-relatorios/2026-08-29-e6b-front-relatorios.md` (tarefa 1) | e6a tarefa 1 |
| 10 | Gamificação — backend/capture/front (`e5a`/`e5b`/`e5c`) | Heartbeat, `PlacarService`, metas por equipe, tela de placar | 3+2+3 tasks — `plans/e5-gamificacao/` | ⛔ bloqueado — gating de calibração no `cypher-capture`, sem data. Não puxar antes de liberado. |
| 10 | Relatórios — placar/PDF (`e6a`/`e6b`, tarefa 2) | CSV de placar + PDF de resumo executivo | tarefa 2 de cada arquivo — `plans/e6-relatorios/` | item 9 (E5) |

### Gestão ágil e protótipo (em andamento — objeto real desta Sprint)

| Card | Descrição | Responsável | Status |
|---|---|---|---|
| Evoluir Figma — tela de login (gestor) | Alta fidelidade, mesma linha de design das telas existentes | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Evoluir Figma — tela de login do kiosk (`/login-estacao`) | Fluxo separado, sem campo de senha, token da estação | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Evoluir Figma — tela `/config/equipe` (abas Equipes/Usuários) | Cobre o cadastro de equipe introduzido em E4 | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Configurar board Trello | Colunas do Scrum + Product Backlog + Sprint Backlog importados | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Documentar Planning da Sprint 3 | Ata registrada em `docs/scrum/sprint-3/cerimonias.md` | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Registrar Dailies resumidas | Ao menos uma rodada, assíncrona (texto ou vídeo curto) | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Documentar Review da Sprint 3 | Ata cobrindo o que foi entregue nesta janela | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Atualizar README | Links de Trello, Figma atualizado e documento de cerimônias | `[PREENCHER]` | `[PREENCHER: status atual]` |

**Nota sobre este arquivo:** este documento é o conteúdo de referência do Sprint Backlog — os campos `[PREENCHER]` (responsável e status) devem ser preenchidos no Trello real, que é a fonte de verdade viva; este markdown existe para o README linkar e para constar no repositório caso o board mude.

## Definição de pronto desta Sprint

Ver `docs/scrum/sprint-3/definition-of-done.md`.
