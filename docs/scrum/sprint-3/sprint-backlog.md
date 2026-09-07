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
| Spec + plano — Gamificação por equipe (E5) | Heartbeat de câmera, placar por delta de conformidade, metas por equipe. `docs/superpowers/specs/planejadas/2026-08-29-gamificacao-e5-design.md` + `docs/superpowers/plans/e5-gamificacao/` | Lucas Grecco | ✅ Concluído — bloqueio §7 (GTQ) resolvido e planos revisados em 2026-09-07; execução (`e5a`/`e5b`/`e5c`) liberada |
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

### Zonas de risco (puxado em 2026-09-04, implementado via subagent-driven development, mergeado em 2026-09-05)

| Card | Descrição | Checklist (tasks do plano) | Repositório | Responsável | Status |
|---|---|---|---|---|---|
| Zonas de risco — backend (`zra`) | `Zona`, polígono normalizado, endpoints `/cameras/{codigo}/zones` + config para o pipeline. PR [#9](https://github.com/lucvs07/Cypher-Api/pull/9), **mergeado**, 339/339 testes | 2 tasks — `plans/zonas-de-risco/2026-08-29-zra-backend-zonas.md` | `cypher` | Lucas Grecco | ✅ Concluído |
| Zonas de risco — capture (`zrb`) | `ZoneManager` com zonas pré-carregadas, `ZoneConfigClient` (ladder de degradação), fix de autenticação (`X-Cypher-Key`) e `ZoneHotReloader` (hot-reload em segundo plano) adicionados após o teste manual. PR [#9](https://github.com/lucvs07/cypher-capture/pull/9), **mergeado**, 283/283 testes | 3 tasks — `plans/zonas-de-risco/2026-08-29-zrb-capture-zonas.md` (+ fix de auth e hot-reload, pós teste ponta a ponta) | `cypher-capture` | Lucas Grecco | ✅ Concluído |
| Zonas de risco — front (`zrc`) | Editor de polígono em canvas, integrado a `/config/estacoes`; preview ao vivo antes de capturar e reabertura de polígono para editar pontos adicionados após o teste manual. PR [#8](https://github.com/Ronaldovels/cypher-front/pull/8), **mergeado**, 343/343 testes | 5 tasks — `plans/zonas-de-risco/2026-08-29-zrc-front-zonas.md` (+ preview ao vivo e reabertura de polígono, pós teste ponta a ponta) | `cypher-front` | Lucas Grecco | ✅ Concluído |

Planning registrado em `docs/scrum/sprint-3/cerimonias.md` §1.4. Review registrada em `docs/scrum/sprint-3/cerimonias.md` §3.4 (`zrc`) e §3.5 (`zra`/`zrb`). Os três cards movidos de `Product Backlog` para `Em andamento` em 2026-09-04 (execução delegada a um agente por repositório, subagent-driven development, uma sessão separada para `zra`, `zrb` e `zrc`), para `Em revisão` no mesmo dia com os 3 PRs abertos, e para `Concluído` em 2026-09-05 depois do teste manual ponta a ponta com os três projetos rodando localmente (webcam real, Gemini e Cloudinary configurados) e o merge dos 3 PRs. O teste manual encontrou e corrigiu, antes do merge: gap de autenticação em `ZoneConfigClient`/`CameraConfigClient` (nunca enviavam `X-Cypher-Key`, mesmo achado que resolveu de brinde o gap de bootstrap de câmera nova no orquestrador, registrado no roteiro §5); UX de preview ao vivo e reabertura de polígono no editor; e hot-reload de zonas em segundo plano, trazido pra dentro do escopo por pedido explícito (estava registrado como fora de escopo na spec §7).

### Gating temporal de queda (puxado em 2026-09-05, implementação via subagent-driven development, concluído em 2026-09-07)

| Card | Descrição | Checklist (tasks do plano) | Repositório | Responsável | Status |
|---|---|---|---|---|---|
| Gating temporal de queda (`gtq`) | Janela de confirmação no `PostureClassifier` antes de reportar `IMMEDIATE_RISK` via `fall_velocity` — elimina falso alarme em agachamentos rápidos, destrava a E5 | 5/5 tasks concluídas — `plans/gating-temporal-queda/2026-09-05-gtq-capture-gating-queda.md` | `cypher-capture` | Lucas Grecco | ✅ Concluído — PR [#10](https://github.com/lucvs07/cypher-capture/pull/10) mergeado em 2026-09-07 |

Planning registrado em `docs/scrum/sprint-3/cerimonias.md` §1.5. Review registrada em §3.7. Card movido de `Product Backlog` para `Em andamento` em 2026-09-05 (implementação iniciada em `cypher-capture`, subagent-driven development, branch `feat/gtq-gating-queda`), para `Em revisão` em 2026-09-07 (sessão anterior corrompida no meio da Tarefa 5 foi retomada, diagnóstico reconstruído a partir do git/ledger, 5 tasks concluídas com suíte 290/290, PR #10 aberto), e para `Concluído` no Trello e neste documento em 2026-09-07 com o merge do PR #10. Validação empírica (Tarefas 4–5): precisão de `immediate_risk` 0,581 → 0,680; recall frame-level 0,986 → 0,915 (abaixo do piso 0,95 da spec §5, mas nenhuma queda inteira perdida). **Decisão do controlador (2026-09-07): bloqueio §7 da E5 resolvido com ressalva** — ver roteiro §2/§3 e spec E5 §7. Spec GTQ movida de `planejadas/` para `implementadas/`.

### Gamificação por equipe E5 (spec/planos revisados e puxados em 2026-09-07, implementação via subagent-driven development)

| Card | Descrição | Checklist (tasks do plano) | Repositório | Responsável | Status |
|---|---|---|---|---|---|
| Gamificação — backend (`e5a`) | Heartbeat de câmera + `MonitoramentoDiario`, `GET /api/v1/placar` (conformidade/cobertura/sequência/ranking por delta, escopado por empresa e por turno), mapeamento de norma aplicável | 3 tarefas — `plans/e5-gamificacao/2026-08-29-e5a-backend-gamificacao.md` | `cypher` | Lucas Grecco | 🔨 Em andamento — branch local `feat/e5-backend-gamificacao` |
| Gamificação — capture (`e5b`) | `HeartbeatSender` tolerante a falha + ligação no laço de `run_pipeline.py` | 2 tarefas — `plans/e5-gamificacao/2026-08-29-e5b-capture-heartbeat.md` | `cypher-capture` | Lucas Grecco | 📋 Sprint Backlog — parte após `e5a` rodar localmente |
| Gamificação — front (`e5c`) | `PlacarComponent` (`/placar`), campos de meta em `/config/equipe`, norma aplicável no card do kiosk | 3 tarefas — `plans/e5-gamificacao/2026-08-29-e5c-front-placar.md` | `cypher-front` | Lucas Grecco | 📋 Sprint Backlog — parte após `e5a` rodar localmente |

Planning registrado em `docs/scrum/sprint-3/cerimonias.md` §1.6. Bloqueio §7 (gating temporal de queda) resolvido com ressalva em 2026-09-07 (PR #10 do `cypher-capture` mergeado); na mesma data a spec e os três planos foram revisados antes da execução, fechando três decisões: piso de cobertura `0,5` para "dados insuficientes" (spec §3.2), filtro de turno no denominador de conformidade/cobertura (`MonitoramentoDiario` é uma linha por câmera/dia/turno), e piso de duração `≥ 3 s` para o `FALL_RISK` que quebra a sequência (a severidade não discrimina — o `cypher-capture` dá sev 4 a todo `IMMEDIATE_RISK`). Ordem de execução: `e5a` primeiro (fixa o contrato dos DTOs), depois `e5b` e `e5c` em paralelo. Card `e5a` movido de `Product Backlog` para `Em andamento` em 2026-09-07; `e5b`/`e5c` movidos para `Sprint Backlog` na mesma data.

### Próximas entregas (cards para o Product Backlog do Trello — desenvolvimento ainda não iniciado)

Um card por fatia de repositório de cada plano — o checklist do card é a lista de tasks do próprio arquivo do plano (`docs/superpowers/plans/<entrega>/`). Ordem de cima pra baixo = ordem de retirada recomendada pelo roteiro (`docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md` §3); cards sem dependência pendente podem ser puxados em paralelo.

**Coluna inicial no Trello: `Product Backlog`**, para os cards abaixo — nenhum teve código iniciado ainda. Os cards de Análise LLM multimodal (`ala`/`alb`), Multi-tenant (`mta`/`mtb`), Orquestrador (`oqa`), Webhook (`wha`/`whb`), Zonas de risco (`zra`/`zrb`/`zrc`), Gating temporal de queda (`gtq`) e Gamificação E5 (`e5a`/`e5b`/`e5c`) já foram puxados — ver seções acima. Mover os demais para `Sprint Backlog` só quando o time decidir puxá-los, respeitando a coluna "Depende de".

**Orquestrador de pipelines (`oqa`) inserido no topo da fila em 2026-09-03** — decisão de produto, registrada em `docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md` §3 ("Priorização do orquestrador"), motivada por um gap real encontrado no teste manual ponta a ponta de multi-tenant. Com `zra`/`zrb`/`zrc` puxados em 2026-09-04, e o gating temporal de queda (`gtq`) puxado em 2026-09-05 (destrava a E5, ver roteiro §3) as linhas restantes foram renumeradas novamente.

| Ordem | Card | Descrição | Checklist (tasks do plano) | Depende de |
|---|---|---|---|---|
| 8 | Relatórios — backend, CSV de incidentes (`e6a`, tarefa 1) | `CsvReportBuilder`, `GET /reports/incidents.csv` | 1 task — `plans/e6-relatorios/2026-08-29-e6a-backend-relatorios.md` (tarefa 1) | multi-tenant |
| 9 | Relatórios — front, CSV de incidentes (`e6b`, tarefa 1) | Link de exportação na timeline de incidentes | 1 task — `plans/e6-relatorios/2026-08-29-e6b-front-relatorios.md` (tarefa 1) | e6a tarefa 1 |
| 10 | Relatórios — placar/PDF (`e6a`/`e6b`, tarefa 2) | CSV de placar + PDF de resumo executivo | tarefa 2 de cada arquivo — `plans/e6-relatorios/` | Gamificação E5 (em andamento) |

Gamificação por equipe (`e5a`/`e5b`/`e5c`) saiu desta tabela em 2026-09-07 — puxada, ver a seção "Gamificação por equipe E5" acima.

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
