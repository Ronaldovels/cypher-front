# Cerimônias Scrum — Sprint 3

**Grupo:** Cypher — Challenge SPI/FIAP
**Sprint:** 3 · 2026-08-23 a 2026-09-01
**Formato:** cerimônias assíncronas (registradas por texto), conforme permitido pela tarefa.

---

## 1. Ata do Sprint Planning

**Data:** 2026-08-25
**Participantes:** `[PREENCHER: nomes presentes]`

### Contexto de entrada
A implementação de E4 (acesso, papéis, guards e cadastro de equipes) começou em 2026-08-23 e foi mergeada nos três repositórios (`cypher` PR #5, `cypher-capture` PR #7, `cypher-front` PR #4) em 2026-08-25, dentro desta mesma janela de Sprint. O trabalho está descrito em `docs/superpowers/specs/2026-08-23-acesso-e-equipes-e4-design.md`. A Sprint 3 cobre esse código como trabalho já puxado e concluído, e soma a ele o trabalho de gestão ágil que ainda falta: Figma, Trello e os artefatos deste documento.

### Sprint Goal
Fechar E4 nos três repositórios, evoluir o protótipo Figma com as telas que E4 introduziu (login e cadastro de equipes) e deixar o board Trello + os artefatos Scrum em condição de serem avaliados — refletindo trabalho real, não genérico.

### Itens puxados do Product Backlog para esta Sprint
Ver `docs/scrum/sprint-3/sprint-backlog.md` — itens 6 a 15 do Product Backlog: as 6 specs/planos de produto (multi-tenant, webhook, zonas de risco, E5, E6, LLM multimodal) e os 4 itens de gestão ágil (Figma, Trello, cerimônias, README).

### Capacidade e divisão de trabalho
`[PREENCHER: quem fica com Figma, quem fica com Trello/documentação de cerimônias, quem fica com o README]` — a divisão real deve ser refletida nos responsáveis de cada card do Trello.

### Riscos identificados no planning
- Prazo curto (1 semana) para 3 telas novas em alta fidelidade + configuração completa do Trello.
- Board Trello "vazio ou genérico" é motivo de reprovação nos critérios de avaliação — decisão do planning: cada card deve nascer com descrição específica do projeto, não um título curto.

---

### 1.1 Planning — Análise de risco com LLM multimodal (`ala`/`alb`)

**Data:** 2026-09-01
**Participantes:** `[PREENCHER: nomes presentes]`

#### Contexto de entrada
Segue o "Próximos passos" da Review da Sprint 3 (§3): início da implementação das entregas planejadas. Este é o primeiro par de cards puxado do Product Backlog (`docs/scrum/sprint-3/sprint-backlog.md`, cards 3 e 4), com prazo próprio de entrega acadêmica em 21/09, independente da ordem das demais entregas de produto.

#### Sprint Goal
Implementar o endpoint `POST /api/v1/incidents/{id}/analyze` (backend `cypher`, plano `plans/analise-llm/2026-09-01-ala-backend-analise-llm.md`, 7 tasks) e o botão "Analisar com IA" com painel de resultado no detalhe do incidente (front `cypher-front`, plano `plans/analise-llm/2026-09-01-alb-front-analise-llm.md`, 3 tasks), seguindo TDD tarefa a tarefa.

#### Itens puxados do Product Backlog
Cards 3 (`ala`) e 4 (`alb`) de `sprint-backlog.md` — movidos de `Product Backlog` para `Em andamento`.

#### Capacidade e divisão de trabalho
Lucas Grecco — backend e front desta entrega.

#### Riscos identificados no planning
- Cloudinary ainda não configurado no `cypher-capture` (sem credenciais no `.env`) — hoje nenhum incidente real tem `snapshotUrl` preenchido. Decisão do planning: **não bloqueia** a implementação de `ala`/`alb`, que é inteiramente testável com o `HttpServer` local embutido nos testes (mesmo padrão de `WebhookDispatcherTest`) e com incidentes de teste criados via `AlertaRepository` diretamente. A configuração real do Cloudinary fica como pré-requisito separado, só necessário para gerar as evidências de demonstração (3 cenários) exigidas pelo trabalho acadêmico, não para o código em si.
- Chaves de API (Claude/Gemini) precisam ser obtidas antes da demonstração real — o desenvolvimento e os testes automatizados não dependem delas (usam o `HttpServer` local), mas a demo ponta a ponta sim.

---

### 1.2 Planning — Orquestrador de pipelines por câmera (`oqa`)

**Data:** 2026-09-03
**Participantes:** `[PREENCHER: nomes presentes]`

#### Contexto de entrada
Surgiu do teste manual ponta a ponta de multi-tenant (§3.2): cadastrar uma câmera pela interface não bastava para ela rodar no pipeline — é preciso subir `run_pipeline.py --camera-id ...` manualmente, um processo por câmera, sem nenhum mecanismo que descubra câmeras novas ou reinicie as que caem. Passou por brainstorming completo (caminho arquitetural — três abordagens avaliadas, mono-tenant por instância decidido como restrição de design) antes de virar spec e plano.

#### Sprint Goal
Implementar `src/orchestrator/` no `cypher-capture` (plano `plans/orquestrador-pipelines/2026-09-03-oqa-capture-orquestrador.md`, 5 tasks): `OrchestratorSession` (login como conta de serviço GESTOR + re-login automático), `ProcessRegistry` (inicia/encerra processos, persiste PID para sobreviver a um restart do próprio orquestrador), `Reconciler` (ciclo de reconciliação — sobe/derruba/reinicia com backoff), CLI real (`python -m src.orchestrator`).

#### Itens puxados do Product Backlog
Card 5 (`oqa`) de `sprint-backlog.md` — inserido no topo da fila de "Próximas entregas" por decisão de produto (ver roteiro §3), movido de `Product Backlog` para `Sprint Backlog`.

#### Capacidade e divisão de trabalho
Lucas Grecco — único repositório tocado (`cypher-capture`).

#### Riscos identificados no planning
- Orquestrador é sempre mono-tenant por instância (decisão de design, não limitação a resolver depois) — rodar câmeras de duas empresas no mesmo host exige dois processos de orquestrador separados, cada um com sua própria conta de serviço. Documentado na spec §1.3 e §9.
- Sem containerização nem provisionamento automático de instância nesta entrega — fora de escopo, fica para quando a arquitetura de deploy em nuvem for definida (spec §8).

---

### 1.3 Planning — Webhook pela interface, backend e front (`wha`/`whb`)

**Data:** 2026-09-03
**Participantes:** `[PREENCHER: nomes presentes]`

#### Contexto de entrada
Card de ordem 2 do roteiro (`docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md` §3), liberado desde que multi-tenant mergeou. Fecha o gap registrado em E1 §9 ("Interface de cadastro de webhook") — hoje o assinante só é cadastrado via `application.yaml` + restart do backend. Puxado junto com o orquestrador de pipelines (§1.2), em paralelo, por serem independentes entre si (nenhum arquivo em comum, repositórios distintos).

#### Sprint Goal
Implementar o CRUD de `WebhookSubscription` GESTOR-only no backend `cypher` (plano `plans/webhook/2026-08-29-wha-backend-webhook.md`, 2 tasks) e a aba "Webhooks" em `/config` no `cypher-front` (plano `plans/webhook/2026-08-29-whb-front-webhook.md`, 4 tasks) — cadastro/edição/desativação de assinantes e histórico paginado de entregas, seguindo TDD tarefa a tarefa. O front reaproveita 100% os primitivos globais já existentes em `src/styles.scss`, refinado com a skill `frontend-design`.

#### Itens puxados do Product Backlog
Cards `wha`/`whb` de `sprint-backlog.md` (itens 6/7 do product-backlog) — movidos de `Product Backlog` para `Em andamento`.

#### Capacidade e divisão de trabalho
Lucas Grecco — backend (`cypher`) e front (`cypher-front`) desta entrega, cada um executado por um agente dedicado (subagent-driven development, um por repositório), em paralelo com o orquestrador de pipelines (`cypher-capture`, §1.2) — os três cards não compartilham arquivo nem repositório entre si.

#### Riscos identificados no planning
- `WebhookResponse` expõe `secret` em texto puro (diferente de `Camera.fonte`, nunca exposto) — decisão de design já registrada na spec §2 (é um valor conhecido pelo próprio GESTOR que cadastrou, digitado por ele, não gerado pelo sistema). Não é um risco a mitigar nesta entrega, só uma diferença de padrão a não estranhar em review.
- `whb` depende do CRUD de `wha` estar disponível para teste manual ponta a ponta no browser; os specs automatizados de `whb` usam `HttpTestingController`/mock interceptor e não dependem do backend real rodando.

---

### 1.4 Planning — Zonas de risco pela interface (`zra`/`zrb`/`zrc`)

**Data:** 2026-09-04
**Participantes:** `[PREENCHER: nomes presentes]`

#### Contexto de entrada
Ordem 2 do roteiro (`docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md` §3), liberado desde que multi-tenant mergeou. Zonas hoje não têm nenhum cadastro remoto — é um arquivo JSON local por processo, editado por uma ferramenta de anotação por mouse rodando no host do pipeline, sem `camera_id` estruturado. Puxado depois de orquestrador/webhook por decisão de capacidade do time (roteiro §3).

#### Sprint Goal
Introduzir a entidade `Zona` do zero e sua API no backend `cypher` (plano `plans/zonas-de-risco/2026-08-29-zra-backend-zonas.md`, 2 tasks); o `ZoneConfigClient` com ladder de degradação (API → cache normalizado → arquivo local pixel absoluto) e conversão normalizado→pixel no `cypher-capture` (plano `plans/zonas-de-risco/2026-08-29-zrb-capture-zonas.md`, 3 tasks); e o `ZoneEditorComponent` — canvas de desenho de polígono sobre frame congelado, integrado ao cadastro de câmera — no `cypher-front` (plano `plans/zonas-de-risco/2026-08-29-zrc-front-zonas.md`, 5 tasks).

#### Itens puxados do Product Backlog
Cards `zra`/`zrb`/`zrc` de `sprint-backlog.md` — movidos de `Product Backlog` para `Em andamento`.

#### Capacidade e divisão de trabalho
Lucas Grecco — os três repositórios, cada um executado por um agente dedicado (subagent-driven development, uma sessão separada por repositório). `zra` primeiro por ser a única dependência real (`zrb`/`zrc` degradam sem ele — cache/arquivo local no capture, mock interceptor no front); `zrb` e `zrc` iniciados em paralelo sem esperar `zra` terminar.

#### Riscos identificados no planning
- Sem hot-reload nesta entrega (spec §3.4/§7) — mudança na UI só se aplica no próximo boot do pipeline daquela câmera; o editor mostra aviso explícito disso ao salvar.
- Canvas de desenho do polígono (`zrc`, spec §4.3) é a única peça do front sem equivalente nos primitivos globais (`.field`/`.input`) — exceção deliberada e já registrada na spec, não um padrão novo a generalizar.
- `EPI_VIOLATION` continua sem disparar de fato (spec §7) — `requiredPpe` é cadastrado e devolvido pela API, mas o cruzamento zona×EPI depende do retreino do detector já pendente desde E1 §4.6; fora do escopo desta entrega.

---

## 2. Dailies (registro resumido, assíncrono)

Registro por texto, um bloco por dia com o formato: **feito / próximo / bloqueio**.

### 2026-08-25
- `[PREENCHER: nome]` — feito: `[PREENCHER]`; próximo: `[PREENCHER]`; bloqueio: `[PREENCHER]`
- `[PREENCHER: nome]` — feito: `[PREENCHER]`; próximo: `[PREENCHER]`; bloqueio: `[PREENCHER]`

### 2026-08-26
- `[PREENCHER]`

### 2026-08-27
- `[PREENCHER]`

*(adicionar uma seção por dia útil da sprint; o mínimo exigido pela tarefa é "ao menos uma rodada" — preencher conforme o grupo avança.)*

### 2026-09-01 (início de `ala`/`alb`)
- Lucas Grecco — feito: Planning de `ala`/`alb` registrado, cards movidos para "Em andamento"; próximo: Task 1 de `ala` (modelo de dados — `AnalysisStatus`, `RiskAnalysisResponse`, `IncidentLlmAnalysis`); bloqueio: nenhum.
- Lucas Grecco — feito: `ala` (7 tasks) e `alb` (3 tasks) implementadas via subagent-driven development, cada task com implementação + revisão; revisão final de branch inteira em ambos os repositórios, com correções aplicadas e re-revisadas antes do PR — PRs abertos: backend [#6](https://github.com/lucvs07/Cypher-Api/pull/6), front [#5](https://github.com/Ronaldovels/cypher-front/pull/5); próximo: revisão/merge dos PRs, depois demonstração (3 cenários reais); bloqueio: nenhum.

### 2026-09-02 (multi-tenant `mta`/`mtb`)
- Lucas Grecco — feito: `mta` (9 tasks, backend `cypher`) e `mtb` (4 tasks, front `cypher-front`) implementadas via subagent-driven development em paralelo (1 implementador por repositório, alternado), cada task com implementação TDD + revisão de spec/qualidade dedicada; revisão final de branch inteira em ambos os repositórios, com correções aplicadas e re-revisadas antes do PR — PRs abertos: backend [#7](https://github.com/lucvs07/Cypher-Api/pull/7) (315 testes), front [#6](https://github.com/Ronaldovels/cypher-front/pull/6) (291 testes); próximo: revisão/merge dos PRs, depois puxar webhook e zonas de risco (ordem 2 do roteiro, dependem de multi-tenant); bloqueio: nenhum.

### 2026-09-03 (teste manual ponta a ponta + merge de `mta`/`mtb` + planning do orquestrador)
- Lucas Grecco — feito: subiu os três projetos localmente num notebook (backend `feat/mt-backend-empresa`, front `feat/mt-front-empresa`, capture em `main`), testou onboarding/sign-up/isolamento manualmente; achou e registrou como backlog um bug de UX pré-existente da E4 (401 no passo "Estações e câmeras" do onboarding) e abriu a discussão sobre orquestração de pipelines, que virou a spec `2026-09-03-orquestrador-pipelines-design.md`; revisou e mergeou os PRs #7 (backend → `main`) e #6 (front → `dev`); moveu os cards `mta`/`mtb` para `Concluído` no Trello; specs de multi-tenant e LLM multimodal movidas de `planejadas/` para `implementadas/`; próximo: decidir entre puxar webhook/zonas de risco ou priorizar o orquestrador de pipelines; bloqueio: nenhum.
- Lucas Grecco — feito: brainstorming completo do orquestrador de pipelines (caminho arquitetural, três abordagens avaliadas, mono-tenant por instância decidido), spec escrita e autorrevisada (`2026-09-03-orquestrador-pipelines-design.md`), plano de implementação TDD escrito e autorrevisado (5 tasks — `plans/orquestrador-pipelines/2026-09-03-oqa-capture-orquestrador.md`); roteiro de entregas atualizado com a priorização (card `oqa` movido para o topo da fila de ordem 2); próximo: puxar o card `oqa` para `Em andamento` e começar a execução; bloqueio: nenhum.
- Lucas Grecco — feito: Planning de `wha`/`whb` registrado (§1.3); os três cards liberados (`oqa`, `wha`, `whb`) movidos de `Sprint Backlog`/`Product Backlog` para `Em andamento` no Trello e neste documento; execução iniciada em paralelo, um agente dedicado por repositório (subagent-driven development) — `oqa` em `cypher-capture`, `wha` em `cypher`, `whb` em `cypher-front`, com `whb` seguindo o style guide já implementado e refinado via skill `frontend-design`; próximo: acompanhar as três execuções, revisar branch inteira de cada uma antes do PR; bloqueio: nenhum.
- Lucas Grecco — feito: as três execuções concluídas (`oqa` 5/5 tasks, 247/247 testes; `wha` 2/2 tasks, 326/326 testes; `whb` 4/4 tasks, 314/314 testes), cada uma com revisão final de branch inteira + fix wave + re-revisão focada antes do PR (achados reais corrigidos em todas as três — ver Review §3.3); `wha` teve um rebase local pra remover um blob binário de 401KB (backup de H2) que tinha sobrado na história de um commit intermediário, antes de abrir o PR (branch nunca tinha sido empurrada); `whb` convertido de worktree isolado para checkout direto no diretório principal do `cypher-front`, a pedido; cards `oqa`/`wha`/`whb` movidos de `Em andamento` para `Em revisão` no Trello e neste documento — PRs abertos: orquestrador [#8](https://github.com/lucvs07/cypher-capture/pull/8), webhook backend [#8](https://github.com/lucvs07/Cypher-Api/pull/8), webhook front [#7](https://github.com/Ronaldovels/cypher-front/pull/7); próximo: revisão/merge dos 3 PRs; bloqueio: nenhum.

### 2026-09-04 (teste manual ponta a ponta de `oqa`/`wha`/`whb` + merge dos 3 PRs)
- Lucas Grecco — feito: subiu os três projetos localmente (backend `feat/wh-backend-webhook`, front `feat/wh-front-webhook`, capture `feat/oqa-orquestrador`) usando a webcam real do notebook e inferência em CUDA (RTX 3050 Laptop, ~25 FPS); criou empresa/gestor/estação/câmera novos e isolados só pra esse teste; validou a aba Webhooks (cadastro, histórico) e o vídeo ao vivo no dashboard; achou e registrou como backlog um gap pré-existente no `cypher-capture` — `GET /cameras/{id}/config` exige `PIPELINE`/`GESTOR` mas o cliente não autentica a chamada, então uma câmera nunca provisionada antes fica em loop de backoff no orquestrador (contornado no teste rodando o pipeline com `--source` explícito); mergeou os 3 PRs (orquestrador #8 em `cypher-capture`, webhook backend #8 em `cypher`, webhook front #7 em `cypher-front`); moveu os cards `oqa`/`wha`/`whb` para `Concluído` no Trello; specs de orquestrador e webhook movidas de `planejadas/` para `implementadas/`, roteiro de entregas atualizado; próximo: zonas de risco (`zra`/`zrb`/`zrc`, ordem 2 do roteiro); bloqueio: nenhum.
- Lucas Grecco — feito: Planning de zonas de risco registrado (§1.4); os três cards (`zra`/`zrb`/`zrc`) movidos de `Product Backlog` para `Em andamento` no Trello e neste documento, execução iniciada em sessões separadas por repositório (subagent-driven development) — `zra` em `cypher`, `zrb` em `cypher-capture`, `zrc` em `cypher-front`; próximo: acompanhar as três execuções, revisar branch inteira de cada uma antes do PR; bloqueio: nenhum.

*(continuar registrando um bloco por dia de trabalho real.)*

---

## 3. Ata do Sprint Review

**Data:** 2026-09-01
**Participantes:** `[PREENCHER: nomes presentes]`

### Entregue nesta Sprint — código (E4, PRs #5/#7/#4)
- Login de gestor e de operador, guards por papel, dock condicionado à sessão.
- Cadastro de equipes (`/config/equipe`) com alocação de estações e turno.
- Chave de API por câmera para ingestão autenticada do pipeline.
- Suíte de testes pós-E4, executada em 2026-08-25: 388/388 backend, 282/282 front, 214/214 capture, todos verdes; recall de risco imediato 0,986 medido em `docs/e3-verificacao.md` (ciclo anterior a E4) — não re-medido contra o pipeline após E4, só a suíte de testes unitários/integração foi reexecutada.

### Entregue nesta Sprint — planejamento de produto (2026-08-25 a 2026-09-01)
Além do código de E4, esta janela também produziu o refinamento de backlog para as 6 próximas entregas — cada uma com spec de design e plano de implementação TDD tarefa-a-tarefa, prontos para desenvolvimento (não apenas ideias soltas):
- [x] Multi-tenant (Empresa) — `docs/superpowers/specs/planejadas/2026-08-29-multi-tenant-design.md`
- [x] Cadastro de webhook pela interface — `docs/superpowers/specs/planejadas/2026-08-29-cadastro-webhook-design.md`
- [x] Zonas de risco pela interface — `docs/superpowers/specs/planejadas/2026-08-29-zonas-de-risco-design.md`
- [x] Gamificação por equipe (E5) — `docs/superpowers/specs/planejadas/2026-08-29-gamificacao-e5-design.md` (planos escritos, execução bloqueada por gating externo no `cypher-capture`)
- [x] Relatórios e exportação (E6) — `docs/superpowers/specs/planejadas/2026-08-29-relatorios-e6-design.md`
- [x] Análise de risco com LLM multimodal — `docs/superpowers/specs/planejadas/2026-09-01-analise-llm-multimodal-design.md`

O roteiro de dependência entre essas 6 entregas está consolidado em `docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md`.

### Entregue nesta Sprint (artefatos de gestão)
- [ ] Protótipo Figma evoluído com as telas de login e cadastro de equipes — `[PREENCHER: link]`
- [ ] Board Trello configurado e compartilhado — `[PREENCHER: link]`
- [x] Este documento de cerimônias
- [ ] README atualizado com os três links

### O que não foi concluído / passa para o backlog
- Nenhuma das 6 entregas especificadas nesta Sprint teve código implementado ainda — o trabalho desta janela foi de especificação e planejamento, não de desenvolvimento. Implementação passa para a próxima Sprint, seguindo a ordem do roteiro (multi-tenant primeiro, por ser pré-requisito das demais).
- Gamificação (E5) continua bloqueada por um item de calibração de modelo no `cypher-capture`, sem data definida — fora do controle do time de produto.
- Board Trello, evolução do Figma e preenchimento final de responsável/status por card `[PREENCHER: motivo, se não fechou a tempo]`.

### Feedback recebido (da banca/mentoria, se houver)
`[PREENCHER]`

### Próximos passos definidos na Review
Iniciar a implementação das entregas planejadas nesta Sprint, na ordem do roteiro: (1) multi-tenant, (2) webhook e zonas de risco em paralelo, seguidos por E6 (CSV de incidentes, independente) e, quando o bloqueio externo for resolvido, E5 (gamificação) e o restante de E6. A análise por LLM multimodal segue prazo próprio (21/09), independente da ordem de produto.

### 3.1 Review — Análise de risco com LLM multimodal (`ala`/`alb`)

**Data:** 2026-09-01
**Participantes:** `[PREENCHER: nomes presentes]`

#### Entregue
- Backend (`ala`, `cypher`) — 7 tasks do plano: modelo de dados/auditoria, `PromptBuilder` (v1/v2), `LlmResponseParser`, `ClaudeVisionClient`/`GeminiVisionClient` (alternáveis por config, sem tocar código), `LlmAnalysisService` (orquestração, nunca propaga falha de provedor como erro HTTP), endpoint `POST /api/v1/incidents/{id}/analyze` (GESTOR-only). PR [#6](https://github.com/lucvs07/Cypher-Api/pull/6) — **mergeado em 02/09**, 287/287 testes passando.
- Front (`alb`, `cypher-front`) — 3 tasks do plano: `LlmAnalysisService` + modelo TS espelhando o DTO, botão "Analisar com IA" + painel de resultado em `IncidentDetailComponent` (GESTOR-only), modo mock. PR [#5](https://github.com/Ronaldovels/cypher-front/pull/5) — **mergeado em 02/09**, 290/290 testes passando.
- Implementado via subagent-driven development (task-by-task, com revisão de spec+qualidade por task e uma revisão final de branch inteira em cada repositório). A revisão final encontrou e corrigiu, antes do PR:
  - Front: `status: "ERRO_API"` (uma resposta 200 cujo provedor LLM falhou) caía no `@else` genérico do template e renderizava um painel de análise vazio como se fosse válido — defeito do próprio plano (spec §4 não foi refletida no snippet de template), não do implementador.
  - Backend: `GeminiVisionClient` enviava a imagem via `file_data.file_uri`, que só aceita URIs da Files API do próprio Gemini, não uma URL pública — corrigido para baixar a imagem e enviar como `inline_data` base64; `max_tokens` estava assimétrico entre os dois provedores; `LlmResponseParser` aceitava qualquer JSON sintaticamente válido como `OK` mesmo fora do schema esperado.
  - Durante a execução (não no PR final): uma task intermediária do backend chegou a commitar acidentalmente um bloco de config de webhook não relacionado (URL pública + segredo em texto puro), pego pela revisão de task e revertido antes de prosseguir.
- **Adicionado após o teste ponta a ponta com câmera real** (webcam local + Cloudinary + Gemini), antes do merge:
  - `RetryComBackoff` — backoff exponencial + jitter (1s/2s/4s) em `LlmAnalysisService`, só para falha transitória (5xx, 429, timeout de rede) — contorna o `503 "high demand"` do nível gratuito do Gemini, confirmado em teste real (duas falhas seguidas + sucesso na terceira tentativa, no mesmo incidente).
  - `GET /api/v1/incidents/{id}/analyze` + `LlmAnalysisService.ultimaAnalise()` — devolve a última análise já feita, reconstruída do que está salvo, sem chamar o provedor de novo. O front carrega isso automaticamente ao abrir a tela do incidente. Motivação: evitar gasto de chamada de API só por reabrir o mesmo alerta.
  - Redesenho do painel de resultado (botão `.btn.primary` em vez de `.btn.ghost`, veredito de risco colorido igual ao resto do app, recomendação destacada em callout) — o botão original não tinha destaque visual nenhum.
  - Correção de bug real descoberto em teste: modelo padrão `gemini-2.5-flash` estava descontinuado pela Google para chaves novas (404) — trocado para o alias `gemini-flash-latest`.
- Testado ponta a ponta com câmera real: webcam local → detecção → snapshot real no Cloudinary (pasta `cypher`) → incidente persistido → análise `OK` do Gemini → reabertura da tela sem nova chamada ao provedor (confirmado direto no banco H2).

#### O que não foi concluído / passa para o backlog
- Demonstração formal com 3 cenários (seguro/risco/ambíguo, Claude vs Gemini) para os entregáveis acadêmicos — o teste ponta a ponta validou o fluxo técnico, mas ainda não湊 as 3 evidências formais exigidas pelo trabalho.
- Board Trello ainda não reflete este card como concluído (atualização manual pendente no board real).

#### Feedback recebido
Nenhum registrado ainda (banca/mentoria).

#### Próximos passos
Gerar as evidências dos 3 cenários exigidos pelo trabalho acadêmico (prazo 21/09). Em paralelo, retomar a ordem de produto do roteiro (multi-tenant primeiro).

### 3.2 Review — Multi-tenant / Empresa (`mta`/`mtb`)

**Data:** 2026-09-02
**Participantes:** `[PREENCHER: nomes presentes]`

#### Entregue
- Backend (`mta`, `cypher`) — 8 tasks do plano (`plans/multi-tenant/2026-08-29-mta-backend-empresa.md`): entidade `Empresa` (slug como PK, imutável) + `TenantContext` (`key`/`codigo`/`currentEmpresaId`); `empresaId` em `Estacao`/`Camera`/`Equipe`/`Usuario`/`Alerta`/`WebhookSubscription`, com PK de catálogo passando a armazenar `empresaId:codigo` (sem chave composta, sem FK nova — mesmo padrão de referência solta já usado na base); os três `Authentication` (`Gestor`/`Operador`/`Pipeline`) resolvendo `empresaId` real na sessão; `POST /setup` reescrito para criar a `Empresa` e compor `username@empresaId` no servidor; `GET /setup/status` removido; escopo por tenant em listagens (estações/câmeras/equipes/usuários), busca de incidentes, SSE e disparo de webhook; teste de ponta a ponta (`MultiTenantIsolationApiTest`) provando que duas empresas com códigos de estação idênticos nunca se enxergam. PR [#7](https://github.com/lucvs07/Cypher-Api/pull/7) — **aberto em 02/09**, 315/315 testes passando.
- Front (`mtb`, `cypher-front`) — 4 tasks do plano (`plans/multi-tenant/2026-08-29-mtb-front-empresa.md`): campo de slug no passo de identidade do onboarding; `AuthService` expondo `empresaId`/`empresaNome` e `bootstrap()` enviando o slug a `POST /setup`; rota `''` virando `LandingComponent` (duas ações — "Criar empresa"/"Entrar" — sem depender mais do booleano global de `GET /setup/status`); topbar exibindo o nome da empresa da sessão. PR [#6](https://github.com/Ronaldovels/cypher-front/pull/6) — **aberto em 02/09**, 291/291 testes passando.
- Implementado via subagent-driven development (task-by-task, com revisão de spec+qualidade dedicada por task e uma revisão final de branch inteira em cada repositório), executando os dois repositórios em paralelo (um implementador ativo por vez em cada um, para não haver dois trabalhando no mesmo repositório simultaneamente).
- **A revisão de tasks e a revisão final encontraram e corrigiram, dentro da própria branch, 4 vazamentos reais de dado entre empresas** (nenhum ficou pendente para depois do PR):
  1. `PUT`/`DELETE /api/v1/users/{username}` permitia takeover de conta entre empresas — a guarda de segurança verificava o campo `username` do **corpo** da requisição, mas buscava o usuário-alvo sem filtrar pelo tenant da sessão. Corrigido escopando a busca por `empresaId` atual, com teste provando 404 e a vítima inalterada.
  2. `GET/PUT/POST /api/v1/incidents/{id}` (e `/status`, `/analyze`) não tinham escopo de tenant — um gestor podia ler, mutar ou disparar análise de LLM (custo de API) em incidente de outra empresa iterando o id numérico; um caso relacionado permitia a um operador acessar incidente de outra empresa quando os códigos de câmera colidiam entre tenants. Corrigido escopando a busca por id+empresa.
  3. O SSE de incidentes em tempo real (`IncidentSseService`) entregava incidentes de todas as empresas para qualquer gestor sem filtro de estação; o resumo/heatmap (`GET /summary`) somava contagens de todas as empresas e atribuía incidentes à célula errada do heatmap quando códigos de câmera colidiam entre tenants. Ambos corrigidos com filtro por `empresaId`, provados por teste de não-entrega/não-vazamento.
  4. A checagem de conflito de URL de câmera (`CatalogService.exigirUrlLivre`) era global — bloqueava indevidamente o cadastro de câmeras entre empresas diferentes (comum em URLs RTSP de rede privada) e vazava o código da câmera de outra empresa na mensagem de erro 409.
- Cada achado foi tratado como bloqueante do próprio ciclo de revisão (nunca adiado silenciosamente): fix dedicado, teste comprovando a correção, e uma segunda revisão focada confirmando que o achado foi endereçado sem quebrar nada.
- **Testado manualmente ponta a ponta em 2026-09-03**, com os três projetos (`cypher`, `cypher-capture`, `cypher-front`) rodando localmente num único notebook: H2 recriado do zero (schema mudou — PK prefixada e colunas `NOT NULL` novas), onboarding criando a `Empresa` de verdade via `POST /setup`. Dois achados dessa rodada de teste, ambos registrados como itens de backlog separados (não bloquearam o merge, nenhum é regressão desta entrega):
  1. O passo "Estações e câmeras" do wizard de onboarding devolve 401 ao tentar cadastrar — bug pré-existente da E4 (confirmado por diff: `POST /api/v1/stations` já exigia `GESTOR` desde `df9d9d8`, antes do multi-tenant existir; o wizard só autentica a sessão no último passo, "Confirmação"). Não bloqueia o fluxo (o próprio código já trata isso — `'stations' não bloqueia` — dá pra avançar e cadastrar depois em `/config/estacoes`), mas é uma UX quebrada real que passa para o backlog.
  2. Discussão sobre como uma câmera cadastrada pela interface chega a rodar no pipeline levou a uma spec nova: `docs/superpowers/specs/planejadas/2026-09-03-orquestrador-pipelines-design.md` — um orquestrador mono-tenant no `cypher-capture` que reconcilia o catálogo de câmeras do backend com processos de pipeline rodando, sem execução iniciada ainda (spec aprovada em brainstorming, plano de implementação pendente).
- **PRs mergeados em 2026-09-03**: backend PR [#7](https://github.com/lucvs07/Cypher-Api/pull/7) → `main` (merge `288115d`); front PR [#6](https://github.com/Ronaldovels/cypher-front/pull/6) → `dev` (merge `dbc6a1b`).

#### O que não foi concluído / passa para o backlog
- Nota de migração do H2 (`./data/` precisa ser apagado antes do primeiro boot com o novo schema) recomendada para o README do `cypher`, ainda não movida da spec/plano para lá.
- Bug de UX pré-existente da E4 no passo "Estações e câmeras" do onboarding (401 antes da sessão existir) — descrito acima, item novo de backlog.

#### Feedback recebido
Nenhum registrado ainda (banca/mentoria).

#### Próximos passos
Cards `mta`/`mtb` movidos para `Concluído` no Trello e neste documento. Próximo: decidir a ordem entre puxar webhook (`wha`/`whb`)/zonas de risco (`zra`/`zrb`/`zrc`) — ordem 2 do roteiro, ambas dependentes só de multi-tenant — e o orquestrador de pipelines (spec nova, ainda sem plano nem ordem definida no roteiro).

### 3.3 Review — Orquestrador de pipelines (`oqa`) e Cadastro de webhook (`wha`/`whb`)

**Data:** 2026-09-03
**Participantes:** `[PREENCHER: nomes presentes]`

#### Entregue
- **Orquestrador (`oqa`, `cypher-capture`)** — 5 tasks do plano (`plans/orquestrador-pipelines/2026-09-03-oqa-capture-orquestrador.md`): `OrchestratorSession` (login como conta de serviço GESTOR + re-login automático em 401), `ProcessRegistry` (inicia/encerra processos, persiste PID pra sobreviver a um restart do próprio orquestrador, limpa órfãos no boot), `Reconciler` (ciclo completo de reconciliação — sobe/derruba/reinicia com backoff exponencial reaproveitado de `ResilientCapture`), CLI real (`python -m src.orchestrator`) com log de resumo do ciclo. PR [#8](https://github.com/lucvs07/cypher-capture/pull/8) — **mergeado em 04/09**, 247/247 testes passando.
- **Webhook backend (`wha`, `cypher`)** — 2 tasks do plano (`plans/webhook/2026-08-29-wha-backend-webhook.md`): CRUD de `WebhookSubscription` GESTOR-only escopado por empresa, histórico paginado de `WebhookDelivery`, `GET /api/v1/webhooks?incluirInativos=true` pra listar/reativar assinante desativado (adicionado na revisão final). PR [#8](https://github.com/lucvs07/Cypher-Api/pull/8) — **mergeado em 04/09**, 326/326 testes passando.
- **Webhook front (`whb`, `cypher-front`)** — 4 tasks do plano (`plans/webhook/2026-08-29-whb-front-webhook.md`): aba "Webhooks" em `/config` (sub-abas Assinantes/Histórico), `WebhookService`, modo mock, design refinado via skill `frontend-design`. PR [#7](https://github.com/Ronaldovels/cypher-front/pull/7) — **mergeado em 04/09**, 314/314 testes passando.
- Os três implementados via subagent-driven development, um agente dedicado por repositório rodando em paralelo (nenhum arquivo/repositório compartilhado entre eles), cada task com revisão de spec+qualidade dedicada e uma revisão final de branch inteira por repositório, com fix wave + re-revisão focada antes do PR.
- **Achados reais de revisão, corrigidos antes de cada PR:**
  - `oqa`: logging nunca configurado em produção (log de resumo do ciclo era descartado silenciosamente); um furo real no contrato "toda falha vira `CatalogoInacessivelError`" (resposta não-JSON ou DTO fora do formato esperado derrubava o orquestrador inteiro); uma câmera com `streamUrl` editada podia ficar fora do ar indefinidamente sob concorrência saturada — reproduzido empiricamente pelo revisor, corrigido com prioridade de reinício sobre novos starts, incluindo um residual da mesma falha (via processo morto em vez de edição de config) achado na re-revisão e corrigido também; falta de `--log-dir` configurável (risco real no cenário de dois tenants no mesmo host, citado na própria spec §9); `json.loads` sem guard no arquivo de estado (arquivo corrompido travaria o boot pra sempre).
  - `wha`: um arquivo binário de backup do H2 (401KB) entrou sem querer num commit intermediário via `git add -A`, corrigido no ciclo de revisão de task; soft-delete de um webhook deixava a URL reservada pra sempre sem forma de ver/reativar via API (`findByEmpresaId` tinha ficado como código morto por causa disso) — corrigido com o parâmetro `?incluirInativos=true`; faltava teste de segurança dedicado provando `/api/v1/webhooks` é GESTOR-only. Um achado adicional (Critical, condicional à estratégia de merge) ficou para decisão humana: o blob binário continuava na história de um commit intermediário mesmo depois de removido num commit seguinte — resolvido via `git rebase -i` antes de abrir o PR (branch nunca tinha sido empurrada), confirmado ausente de toda a história da branch e suíte revalidada (326/326) após o rebase.
  - `whb`: **bug crítico de dados** — o `<select>` de severidade mínima no formulário de cadastro mostrava "Qualquer evento" na tela mas submetia `minSeverity: 3` (race entre o binding `[value]` no `<select>` e as `<option>` geradas por `@for`), corrigido trocando por `[selected]` por opção; `pageIndex` do histórico não resetava ao trocar de assinante selecionado; busca de entregas sem tratamento de erro, travava em "carregando" pra sempre em caso de falha; os 5 handlers novos do mock interceptor não tinham nenhum teste (adicionados 8); UI de edição de assinante, prometida em 4 lugares da spec/plano mas nunca implementada nas tasks reais, deferida deliberadamente (mesmo padrão de `EquipesConfigComponent`) em vez de construída fora do TDD na hora do fix.
- Cada achado foi tratado como bloqueante do próprio ciclo de revisão (fix dedicado + re-revisão focada confirmando o endereçamento, sem quebra nova) antes de qualquer PR ser aberto.
- **Testado manualmente ponta a ponta em 2026-09-04**, com os três projetos rodando localmente: backend na branch `feat/wh-backend-webhook`, front na `feat/wh-front-webhook`, pipeline na `feat/oqa-orquestrador` — webcam real do notebook (`/dev/video0`), inferência em CUDA (RTX 3050 Laptop, ~25 FPS, pose 13ms + EPI 26ms por frame), X-Cypher-Key provisionada automaticamente, stream MJPEG ao vivo no dashboard. Empresa/gestor/estação/câmera novos criados só para o teste (`webcam-demo`), isolados dos dados de empresas anteriores.
- **Achado adicional durante o teste manual** (não é defeito das 3 PRs, é um gap pré-existente no `cypher-capture` que só ficou visível ao testar o orquestrador contra uma câmera genuinamente nova): `GET /api/v1/cameras/{id}/config` exige papel `PIPELINE`/`GESTOR`, mas `CameraConfigClient` (usado tanto pelo `run_pipeline.py` quanto pelos processos que o orquestrador sobe) faz a chamada sem nenhuma autenticação — pra uma câmera nunca provisionada antes (sem `X-Cypher-Key`, sem cache local), a busca de config sempre recebe 401 antes do `ApiKeyProvisioner` ter chance de provisionar a chave. Contornado no teste manual rodando o pipeline direto com `--source 0` (mesmo assim exercitando o resto da stack). O orquestrador não tem equivalente a `--source` pra esse fallback — registrado como item novo de backlog no roteiro de entregas §5, sem spec própria ainda.

#### O que não foi concluído / passa para o backlog
- `oqa`: SIGTERM→SIGKILL não implementado em `encerrar()` (aceito como não-bloqueante — a limpeza de órfãos no boot já cobre o risco real de duplicação); escrita não-atômica do arquivo de estado (o guard de leitura já protege a consequência); bootstrap de câmera nova via `GET /cameras/{id}/config` sem autenticação (achado no teste manual, descrito acima).
- `whb`: UI de edição de assinante de webhook, deferida — um GESTOR que errar URL/segredo precisa desativar e recadastrar em vez de editar, até uma task futura com spec própria.

#### Feedback recebido
Nenhum registrado ainda (banca/mentoria).

#### Próximos passos
Cards `oqa`/`wha`/`whb` movidos para `Concluído` no Trello e neste documento. Próximo: seguir a ordem do roteiro — zonas de risco (`zra`/`zrb`/`zrc`, ordem 2, dependente só de multi-tenant) e, quando o bloqueio externo de E5 for resolvido, gamificação e o restante de E6.
