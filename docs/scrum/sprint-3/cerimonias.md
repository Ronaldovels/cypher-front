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

### 1.5 Planning — Gating temporal de queda (`gtq`)

**Data:** 2026-09-05
**Participantes:** `[PREENCHER: nomes presentes]`

#### Contexto de entrada
Pedido explícito do usuário pra revisar a E5 (gamificação) pra poder implementá-la agora. Antes de brainstormar a E5 em si, foi necessário verificar o bloqueio já registrado na própria spec (§7): "implementação não deve começar antes do gating temporal de queda ser resolvido no `cypher-capture`". Investigação confirmou que o bloqueio segue válido (`docs/apresentacao-esqueleto.md` lista o item em "Pós-NEXT", sem data; nenhum commit recente o implementa). Como o usuário decidiu investigar/resolver o bloqueio em vez de esperar, uma segunda investigação técnica (classificador de postura, `src/pose/classifier.py`) mostrou que o gating é viável sem retreino de modelo — vira spec e plano no mesmo dia.

**Achado importante durante o brainstorming:** a primeira versão da spec citava como evidência "2 quedas reais → 3 incidentes" (`docs/e1b-verificacao.md`) — mas ao ler a fonte primária, esse documento diz explicitamente que essa divergência **não é defeito** (3 incidentes genuínos: 2 quedas + 1 agachamento real; o "2" esperado era artefato de replay de vídeo, nem se aplica em produção). A evidência real, corrigida antes da aprovação final da spec: precisão de `immediate_risk` = 0,418 em `cenario2.mp4` (`docs/metricas-dia2.md` §5.2), causada pelo resíduo de `fall_velocity` em agachamentos rápidos. O mecanismo desenhado não mudou — só a motivação e os critérios de aceite.

#### Sprint Goal
Implementar a janela de confirmação no `PostureClassifier` (`cypher-capture`, plano `plans/gating-temporal-queda/2026-09-05-gtq-capture-gating-queda.md`, 5 tasks): `fall_velocity` sem `person_fallen` confirmado dentro de `fall_confirm_seconds` (default 1.0s) nunca vira `IMMEDIATE_RISK` — elimina o falso alarme de agachamento sem mexer no `IncidentTracker` nem retreinar modelo. Tasks 4-5 são validação empírica (precisão/recall via `scripts/evaluate_pose.py`, ponta a ponta) que terminam numa decisão explícita: o bloqueio §7 da E5 está resolvido ou não.

#### Itens puxados do Product Backlog
Card `gtq` de `sprint-backlog.md` — inserido no topo da fila de "Próximas entregas" por decisão de produto (destrava E5), movido de `Product Backlog` para `Sprint Backlog`.

#### Capacidade e divisão de trabalho
Lucas Grecco — único repositório tocado (`cypher-capture`).

#### Riscos identificados no planning
- O critério de aceite (spec §5/§7) não é um gate automático — precisão deve "melhorar de forma mensurável" e recall "não regredir abaixo de 0,95", mas a decisão final de considerar a E5 destravada é humana, sobre os números medidos nas Tasks 4-5, não uma assertiva de teste que passa/falha sozinha.
- Trade-off de latência aceito conscientemente: uma queda real confirmada demora até 1s a mais pra virar incidente (janela de confirmação) — pequeno frente à duração típica de queda (~4.5s), mas registrado como custo real num sistema de segurança.
- Regravar a fixture de regressão (`tests/fixtures/cenario2_transitions.json`, Task 3) exige rodar o pipeline real contra o vídeo (modelo YOLO, GPU/CPU) — não é um teste unitário puro, é geração de dado de teste via script novo (`scripts/regen_cenario2_fixture.py`).

---

### 1.6 Planning — Gamificação por equipe E5 (`e5a`/`e5b`/`e5c`)

**Data:** 2026-09-07
**Participantes:** `[PREENCHER: nomes presentes]`

#### Contexto de entrada
Com o bloqueio §7 resolvido (GTQ mergeado, PR #10), o usuário pediu para revisar o design da E5 e os três planos de desenvolvimento (`plans/e5-gamificacao/`, escritos em 2026-08-29 e mantidos bloqueados desde então) antes de partir para a execução. A revisão comparou spec, planos e o estado real dos três repositórios.

#### Achados da revisão que viraram decisão de design (registrados na spec E5 §3.2/§7)
- **"Dados insuficientes" não estava implementado.** A spec §3.2 exige que equipe com cobertura baixa saia do ranking, mas os planos não tinham esse estado. Piso fixado em **cobertura `< 0,5`** → `conformidade`/`deltaConformidadeSemana` anuláveis no DTO, equipe fora da ordenação, seção separada no front. Resolve também o artefato de time novo (sem semana anterior) subindo espúrio no ranking-por-melhora.
- **Denominador ignorava o turno.** `MonitoramentoDiario` é uma linha por `(câmera, dia, turno)`; somar os três turnos daria até 300% de cobertura para uma câmera 24h. Corrigido: query `...AndTurnoAndDiaBetween`, normalização por nº de câmeras, e numerador de conformidade filtrado pela janela do turno da equipe.
- **Filtro de sequência por severidade não funciona.** O `cypher-capture` (`fusion/engine.py`) atribui severidade 4 a *todo* `IMMEDIATE_RISK`, sem discriminar o gatilho. Decisão: a sequência só é quebrada por `FALL_RISK` com **`duracaoSegundos ≥ 3`** (ou ainda aberto) — o espúrio residual de `balance_loss_risk` em agachamento é curto e auto-fechado; queda real dura ~4,5 s.
- **Nota do `SummaryService` estava obsoleta** — o vazamento entre empresas já foi corrigido numa entrega posterior; nota do plano `e5a` marcada como resolvida.

#### Sprint Goal
Executar os três planos revisados: `e5a` (backend `cypher` — heartbeat, `MonitoramentoDiario`, `GET /api/v1/placar`, norma aplicável), `e5b` (`cypher-capture` — `HeartbeatSender` no laço do pipeline), `e5c` (`cypher-front` — `PlacarComponent`, campos de meta em `/config/equipe`, norma no card do kiosk). Subagent-driven development, uma sessão por repositório, branches locais (sem worktree).

#### Itens puxados do Product Backlog
Cards `e5a`/`e5b`/`e5c` de `sprint-backlog.md` — movidos de `Product Backlog`. `e5a` para `Em andamento` (execução iniciada); `e5b` e `e5c` para `Sprint Backlog` (partem após `e5a` rodar localmente).

#### Capacidade e divisão de trabalho
Lucas Grecco — os três repositórios, uma sessão dedicada por repositório. Ordem: `e5a` primeiro (fixa o contrato dos DTOs consumido por `e5b`/`e5c`), depois `e5b` e `e5c` em paralelo.

#### Riscos identificados no planning
- Os planos têm ~1 semana; várias entregas mergearam desde (multi-tenant, webhook, zonas). A sessão `e5a` precisa verificar contra a árvore atual: aridade do construtor de `Equipe` após os 3 campos de meta (afeta todas as chamadas `new Equipe(...)` e `EquipeService`), construtores de `Camera`/`Estacao` nos testes, nome do campo em `CameraApiKeyResponse`.
- `e5b` depende do endpoint de heartbeat de `e5a` existir e rodar localmente para o teste ponta a ponta da Tarefa 2 (Tarefa 1 é isolada, sem rede, pode começar antes).
- Ressalva do GTQ (recall frame-level 0,915 < piso 0,95) segue como follow-up **não bloqueante** — afrouxar cues `person_fallen` / fixar `merge_window_seconds` fica fora do escopo da E5; a conformidade ponderada por tempo é robusta a um evento curto isolado, só a sequência precisava do piso de duração.

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
- Lucas Grecco — feito: `zrc` (front, `cypher-front`) concluído via subagent-driven development — 5 tasks + 3 fix loops de task (payload NaN sem frame capturado, teste de clique real, cobertura de DOM na integração) + 1 fix wave da revisão final (reset ao trocar de câmera, frame realmente congelado, zonas existentes desenhadas sobre o frame — o último era gap do próprio plano, corrigido mesmo assim), 341/341 testes; PR aberto [#8](https://github.com/Ronaldovels/cypher-front/pull/8); card `zrc` movido para `Em revisão` no Trello e neste documento (ver Review §3.4); próximo: aguardar `zra`/`zrb` para teste ponta a ponta completo; bloqueio: nenhum.
- Lucas Grecco — feito: `zra` (backend, `cypher`) e `zrb` (capture, `cypher-capture`) concluídos via subagent-driven development, em sessões separadas — `zra`: 2 tasks, revisão final encontrou 4 achados Important (3 lacunas de teste corrigidas; reativação de zona via API decidida fora de escopo, spec não pede), 339/339 testes, PR [#9](https://github.com/lucvs07/Cypher-Api/pull/9); `zrb`: 3 tasks, endurecimento pós-revisão (payload malformado não derruba boot, polígono degenerado ignorado com log, `--zones` explícito vence cadastro remoto), 269 testes sem regressão, PR [#9](https://github.com/lucvs07/cypher-capture/pull/9) — cards movidos para `Em revisão` no Trello e neste documento (ver Review §3.5); com os 3 PRs de zonas de risco abertos (`zra`/`zrb`/`zrc`), próximo: teste manual ponta a ponta (spec §6) com as três branches rodando juntas antes do merge; bloqueio: nenhum.

### 2026-09-05 (teste manual ponta a ponta de `zra`/`zrb`/`zrc` + merge dos 3 PRs)
- Lucas Grecco — feito: subiu os três projetos localmente (backend `feat/zr-backend-zonas` com Gemini configurado, capture `feat/zr-capture-zonas` com webcam real + Cloudinary já configurado, front `feat/zr-front-zonas`); achou e corrigiu via TDD um gap de autenticação real em `CameraConfigClient`/`ZoneConfigClient` (nunca enviavam `X-Cypher-Key`, sempre 401) — a mesma correção fechou de brinde o gap de bootstrap de câmera nova no orquestrador (roteiro §5, achado em 2026-09-04); próximo: continuar o teste manual e corrigir o que mais aparecer; bloqueio: nenhum.
- Lucas Grecco — feito: por pedido explícito durante o teste, corrigiu UX do editor de zonas (preview ao vivo antes de capturar frame; botão pra reabrir um polígono já fechado e editar os pontos — antes disso era literalmente impossível ajustar os vértices de uma zona já criada) e implementou hot-reload de zonas (`ZoneHotReloader`, revalida a cada ~30s em segundo plano, sem reiniciar o pipeline) — trazido pra dentro do escopo mesmo estando registrado como fora de escopo na spec (§7); confirmado empiricamente que uma zona cadastrada pela UI foi buscada e aplicada pelo pipeline sem reiniciar; specs e roteiro de entregas atualizados; próximo: encerrar os três projetos e aguardar decisão de merge; bloqueio: nenhum.
- Lucas Grecco — feito: revisou e mergeou os 3 PRs (`zra` #9 em `cypher` → `main`, `zrb` #9 em `cypher-capture` → `main`, `zrc` #8 em `cypher-front` → `dev`); moveu os cards `zra`/`zrb`/`zrc` para `Concluído` no Trello; spec de zonas de risco movida de `planejadas/` para `implementadas/`, roteiro de entregas atualizado (gaps de hot-reload e bootstrap do orquestrador marcados como resolvidos); próximo: retomar E5 (gamificação, ainda bloqueada) e E6 (relatórios, CSV de incidentes liberado); bloqueio: nenhum.
- Lucas Grecco — feito: a pedido do usuário, investigou o bloqueio §7 da E5 antes de revisar o design — confirmou que o gating temporal de queda segue pendente no `cypher-capture` (sem prazo); investigação técnica do classificador mostrou que é viável sem retreino de modelo; brainstorming completo (spec escrita, achado e corrigido um erro de evidência citada — "2 quedas → 3 incidentes" não era o bug real, a métrica certa é precisão 0,418 de `docs/metricas-dia2.md`); plano de implementação escrito (5 tasks, `plans/gating-temporal-queda/`); card `gtq` inserido no topo da fila (destrava E5) e movido para `Sprint Backlog`; roteiro de entregas e sprint-backlog atualizados; próximo: puxar `gtq` pra `Em andamento`. bloqueio: nenhum.
- Lucas Grecco — feito: iniciou a sessão de implementação do plano `gtq` no repositório `cypher-capture` (branch `feat/gtq-gating-queda`, subagent-driven development) e moveu o card `gtq` para `Doing` no Trello; sprint-backlog atualizado (seção "Em andamento" dedicada, removido da tabela de próximas entregas); próximo: acompanhar a execução das 5 tasks do plano; bloqueio: nenhum.

### 2026-09-07 (retomada da sessão corrompida do `gtq` + conclusão + PR + decisão de desbloqueio da E5)
- Lucas Grecco — feito: retomou a implementação do `gtq` depois que a sessão anterior corrompeu no meio da Tarefa 5; diagnóstico reconstruído só a partir do git/ledger (não do estado relatado) — Tarefas 1–4 já commitadas e revisadas na branch `feat/gtq-gating-queda` (`b19f2ef..1f87c9c`), suíte 290/290, Tarefa 5 só briefada, sem relatório. Artefatos SDD preservados para fora do worktree travado. Tarefa 5 executada (subagente rodou `run_pipeline.py` ponta a ponta em `cenario2.mp4`): as 2 quedas reais geram alerta `FALL_RISK` com cobertura contínua, `fall_velocity` puro nunca aflora, 1 `FALL_RISK` espúrio pré-existente via `balance_loss_risk` (fora do escopo do GTQ). **Decisão do controlador: bloqueio §7 da E5 resolvido com ressalva** — precisão de `immediate_risk` 0,581 → 0,680 (objetivo primário atingido), zero falso novo em `cenario.mp4`; ressalva: recall frame-level 0,915 < piso 0,95 (latência de borda numa queda, não queda perdida), follow-up não bloqueante registrado. PR [#10](https://github.com/lucvs07/cypher-capture/pull/10) aberto contra `main` do `cypher-capture`; card `gtq` movido para `Em revisão` no Trello e neste documento. Roteiro de entregas, spec E5 §7, sprint-backlog e este documento (Review §3.7) atualizados. Próximo: revisão/merge do PR #10, depois puxar a E5. Bloqueio: nenhum.
- Lucas Grecco — feito: mergeou o PR [#10](https://github.com/lucvs07/cypher-capture/pull/10) do `cypher-capture` (`gtq` → `main`) e moveu o card `gtq` para `Concluído` no Trello; spec GTQ movida de `planejadas/` para `implementadas/` (`git mv`), roteiro de entregas atualizado (GTQ na tabela de §2 implementadas, removido de §3; E5 sem bloqueio), spec E5 §7 e status atualizados ("implementação liberada"), sprint-backlog (`gtq` → `Concluído`, linha E5 → liberada) e este documento (Review §3.7) atualizados; próximo: puxar a E5 (`e5a`/`e5b`/`e5c`); bloqueio: nenhum.
- Lucas Grecco — feito: revisão de design da E5 antes da execução (§1.6) — spec E5 e os três planos comparados com o estado real dos repositórios; quatro achados viraram decisão (piso de cobertura `0,5` para "dados insuficientes", filtro de turno no denominador, piso de duração `≥ 3 s` na sequência, nota obsoleta do `SummaryService`); spec E5 §3.2/§7, roteiro §3, os três planos, `sprint-backlog.md` e este documento atualizados. Card `e5a` movido para `Doing`/`Em andamento` no Trello e sessão de implementação iniciada no `cypher` (branch local `feat/e5-backend-gamificacao`, subagent-driven development); cards `e5b`/`e5c` movidos para `To Do`/`Sprint Backlog` (partem após `e5a` rodar localmente). Próximo: acompanhar `e5a`, liberar `e5b`/`e5c` em paralelo; bloqueio: nenhum.
- Lucas Grecco — feito: `e5a` (backend, `cypher`) concluído via subagent-driven development — 3 tarefas (heartbeat + `MonitoramentoDiario` + `TurnoWindow`; metas de `Equipe` + `GET /api/v1/placar`; `NormaAplicavel` no `IncidentResponse`), 1 fix loop de tarefa na Tarefa 2 (o ranking colapsava para conformidade absoluta quando a equipe não tinha monitoramento na semana anterior — o piso de cobertura não era aplicado à janela anterior) e 1 fix wave da revisão final de branch (janela de incidentes do placar alinhada ao grão de dia do denominador; janelas de delta tornadas disjuntas; sequência travada em zero sem dados suficientes, fechando o incentivo de "tapar a câmera"; fixtures reais de `Alerta` cobrindo delta/sequência/conformidade). Suíte 315 → **362/362**. PR [#10](https://github.com/lucvs07/Cypher-Api/pull/10) aberto contra `main` do `cypher`; card `e5a` movido para `Em revisão` no Trello e neste documento (Review §3.8). `e5b`/`e5c` liberados para partir contra o contrato (`e5a` roda localmente). Próximo: revisão/merge do PR #10, executar `e5b`/`e5c`; bloqueio: nenhum.

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
- [x] Gamificação por equipe (E5) — `docs/superpowers/specs/planejadas/2026-08-29-gamificacao-e5-design.md` (planos escritos; bloqueio §7 resolvido e planos revisados em 2026-09-07, execução iniciada — ver §1.6)
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

### 3.4 Review — Zonas de risco, front (`zrc`)

**Data:** 2026-09-04
**Participantes:** `[PREENCHER: nomes presentes]`

#### Entregue
- `zrc` (`cypher-front`) — 5 tasks do plano (`plans/zonas-de-risco/2026-08-29-zrc-front-zonas.md`): modelos e matemática de conversão pixel↔normalizado isolada em funções puras (`zone-canvas.util.ts`), `ZoneService` (mesmo esqueleto de `TeamService`/`WebhookService`), `ZoneEditorComponent` (captura de frame, desenho de polígono, formulário, persistência, edição de zona existente, desativação), integração na tela de cadastro de câmera (ação "editar zonas" em `StationsConfigComponent`), modo mock completo. PR [#8](https://github.com/Ronaldovels/cypher-front/pull/8) — **aberto em 04/09**, 341/341 testes passando.
- Implementado via subagent-driven development (task-by-task, revisão de spec+qualidade dedicada por task, revisão final de branch inteira em modelo mais capaz). Trabalhado em checkout direto (sem worktree), a pedido.
- **Achados reais corrigidos durante a execução (fix loops por task, antes da revisão final):**
  - Task 3 (`ZoneEditorComponent`): `editar()`/`salvar()` sem o frame ter sido capturado gerava payload `polygon` com `NaN` (divisão por zero, canvas com tamanho 0) enviado ao backend — corrigido com guarda contra canvas de tamanho zero; o teste "adiciona vértice por clique" só testava o setter do signal do Angular, não `onCanvasClick`/`posicaoNoCanvas` de verdade — reescrito para simular o clique real com `getBoundingClientRect` mockado.
  - Task 4 (integração no cadastro de câmera): teste de abrir/fechar o editor nunca chamava `detectChanges()`/asserção de DOM — não cobria o `@if` condicional nem o binding do componente filho — corrigido.
- **A revisão final de branch inteira (modelo mais capaz) encontrou e corrigiu, num único fix wave antes do PR:**
  - Trocar de câmera com o editor de zonas aberto (sem fechar o painel) não resetava o estado do componente — `@if` reaproveita a mesma instância, `ngOnInit` não roda de novo — lista de zonas, frame congelado e vértices continuavam da câmera anterior; um `PUT` nesse estado iria para a câmera errada (barrado só pelo escopo por empresa do backend real). Corrigido com um `effect()` reagindo a `codigo()`, resetando todo o estado de desenho e recarregando as zonas da nova câmera.
  - O frame "congelado" não era de fato congelado — `redesenhar()` lia direto do `<img>` MJPEG ao vivo a cada clique/remoção de vértice, então o fundo mudava silenciosamente enquanto o gestor desenhava, contradizendo a spec §4.2. Corrigido com um snapshot tirado uma única vez em canvas offscreen no momento de `capturarFrame()`.
  - Zonas já cadastradas não eram desenhadas sobre o frame na abertura do editor (spec §4.3 pedia isso) — esse era um defeito do próprio **plano** (o Self-Review da Task 3 só registrou como fora de escopo o arrasto de vértice, não a renderização das zonas existentes), não da implementação, que foi fiel ao brief. Corrigido mesmo assim — a spec é a autoridade, não o texto do plano.
  - Nenhum achado Critical. Cada achado Important foi endereçado num único fix dispatch + uma re-revisão escopada confirmando o endereçamento, sem quebra nova, antes do PR ser aberto.
- **Achados Minor, registrados e conscientemente adiados** (nenhum bloqueia o PR): cobertura de edge case rasa em `paraNormalizado`/`paraPixel` (divisão por zero, negativos); `ZoneService.load()` zera a lista em erro em vez de preservar estado anterior (diferente de `TeamService`/`WebhookService` — decisão mantida, revisada e considerada defensável para este editor); pequenas assimetrias no mock interceptor (POST/PUT não re-pinam campos após spread do corpo, `find()` de PUT/DELETE não filtra `ativa`, testes sem cobertura de isolamento por câmera); `<img>` do editor sem guarda de `streamUrl` nulo e sem handler `(error)`; duplo-clique para fechar o polígono não implementado (spec permitia botão OU duplo-clique, só o botão foi feito); `removerUltimoVertice`/`desativar()` sem algumas guardas de baixo risco.
- **Não testável automaticamente**, fica pendente de verificação manual no browser antes do teste ponta a ponta: se o frame realmente para de mudar após capturado, e se as zonas existentes aparecem visualmente em cinza sobre o frame sem duplicar a zona ativa em edição.
- Achado de hygiene fora do escopo desta entrega: um worktree órfão de uma entrega antiga já mergeada (`.worktrees/e2c-front-cadastro`) faz `npx vitest run` sem argumento explícito falhar sempre nesse repositório — não foi removido (fora do escopo do plano), registrado aqui para limpeza futura. O plano `zrc` também manda rodar `npx vitest run <arquivo>`, que não funciona neste repo por causa do `.worktrees` órfão e da falta de wiring de compilador JIT fora do builder do Angular — o comando real que funciona é `npx ng test --include="<arquivo>" --watch=false`; vale corrigir essa instrução no arquivo do plano.

#### O que não foi concluído / passa para o backlog
- Verificação manual no browser dos dois fixes não testáveis por jsdom (frame realmente congelado, zonas existentes desenhadas) — pendente até o teste ponta a ponta com o backend `zra` rodando.
- UI de edição de vértice por arrasto direto (drag) não implementada — a spec menciona isso, mas o plano (desde a escrita original) já registrou como fora de escopo, cobrindo edição por remoção/reabertura do polígono em vez de arrasto pixel a pixel.
- Limpeza do worktree órfão `.worktrees/e2c-front-cadastro`, fora do escopo desta entrega.

#### Feedback recebido
Nenhum registrado ainda (banca/mentoria).

#### Próximos passos
Aguardar `zra` (backend) e `zrb` (capture) para o teste manual ponta a ponta completo (spec §6: cadastrar zona pela UI → reiniciar pipeline → provocar invasão → confirmar `ZONE_VIOLATION` com `zoneName` correto). Card `zrc` movido para `Em revisão` no Trello e neste documento.

### 3.5 Review — Zonas de risco, backend e capture (`zra`/`zrb`)

**Data:** 2026-09-04
**Participantes:** `[PREENCHER: nomes presentes]`

#### Entregue
- **Backend (`zra`, `cypher`)** — 2 tasks do plano (`plans/zonas-de-risco/2026-08-29-zra-backend-zonas.md`): `Zona` (id gerado via `IDENTITY`, nunca digitado — diferente de `Estacao`/`Camera` — spec §2.1), `PontoNormalizado` (`@Embeddable`), ordem dos vértices preservada via `@OrderColumn`; CRUD GESTOR-only aninhado em `/api/v1/cameras/{codigo}/zones` (list/create/update/soft-delete); superfície de máquina `GET /api/v1/cameras/{codigo}/zones/config` — só zonas ativas, coordenadas normalizadas, acessível por sessão GESTOR ou `X-Cypher-Key` do pipeline; isolamento por tenant (câmera inexistente ou de outra empresa devolve 404 indistinguível). PR [#9](https://github.com/lucvs07/Cypher-Api/pull/9) — **aberto em 04/09**, 339/339 testes passando.
- **Capture (`zrb`, `cypher-capture`)** — 3 tasks do plano (`plans/zonas-de-risco/2026-08-29-zrb-capture-zonas.md`): `ZoneManager` passa a aceitar zonas pré-carregadas em memória (`zones=`), sem tocar disco — caminho por arquivo (`annotate_zones.py`) preservado intacto; novo `ZoneConfigClient`, réplica do padrão já estabelecido por `CameraConfigClient` (E2 §2.2/§6.1) — escada API → cache normalizado → arquivo local pixel absoluto, conversão normalizado→pixel sempre feita com a resolução real do frame (nunca cacheada já convertida); ligação em `run_pipeline.py` resolvendo zonas remotas logo após abrir a captura, quando a resolução já é conhecida. PR [#9](https://github.com/lucvs07/cypher-capture/pull/9) — **aberto em 04/09**, 269 testes passando, sem regressão.
- Ambos implementados via subagent-driven development (task-by-task, revisão de spec+qualidade dedicada, revisão final de branch inteira), cada um em sua própria sessão/repositório.
- **Rulings feitas durante a execução do `zra`, registradas no próprio PR:**
  - Task 1: `listar()` implementado filtrando por `ativa=true`, diferente do snippet literal do plano (que não filtrava) — necessário pro próprio teste do plano (`desativarEhSoftDeleteEDesapareceDaListagem`) passar; aprovado na revisão da tarefa.
  - Revisão final encontrou 4 achados Important: 3 eram lacunas de teste sem produção alterada (teste de segurança GESTOR-only nas rotas de zona; round-trip de valor/ordem dos vértices do polígono + PUT que muda a quantidade de vértices; coordenada fora de faixa 0.0–1.0 devolvendo 400) — todos corrigidos. O 4º (permitir reativar zona desativada via `incluirInativas`/PUT) foi decidido como **fora de escopo**: a spec (§2.2) só exige que a zona desativada suma de `.../zones/config`; sumir também da listagem administrativa é o comportamento exigido pelo próprio teste do plano, não um bug. Reativação é feature nova, não pedida — registrada para spec futura se o produto quiser (mesmo padrão do gap já conhecido em webhook, ver §3.3).
- **Endurecimento pós-revisão do `zrb`, registrado no PR:** payload malformado da API de zonas não derruba mais o boot do pipeline nem envenena o cache; zona com polígono degenerado (menos de 3 vértices) é ignorada com log, sem quebrar o loop de frames das demais; `--zones` explícito (CLI) agora vence o cadastro remoto, dando ao `zrb` a mesma paridade que `--source` já tinha com o cadastro remoto de câmera (E2/orquestrador).
- Nenhum achado Critical em nenhum dos dois. Suítes completas verdes em ambos antes da abertura do PR.

#### O que não foi concluído / passa para o backlog
- Reativação de zona desativada via API (`zra`) — decidida fora de escopo desta entrega, spec não pede; registrar como item de backlog se o produto quiser essa ação administrativa no futuro.
- Teste manual ponta a ponta (spec §6: cadastrar zona pela UI → reiniciar pipeline → provocar invasão real → confirmar `ZONE_VIOLATION` com `zoneName` correto) ainda não realizado — depende das três branches (`zra`/`zrb`/`zrc`) rodando juntas.

#### Feedback recebido
Nenhum registrado ainda (banca/mentoria).

#### Próximos passos
Com os 3 PRs de zonas de risco abertos (`zra` #9 em `cypher`, `zrb` #9 em `cypher-capture`, `zrc` #8 em `cypher-front`), subir os três projetos localmente para o teste manual ponta a ponta completo antes do merge, seguindo o mesmo padrão já usado em multi-tenant e orquestrador/webhook (webcam real, empresa/câmera isolados só para o teste). Cards `zra`/`zrb` movidos para `Em revisão` no Trello e neste documento.

### 3.6 Review — Teste manual ponta a ponta e merge de zonas de risco (`zra`/`zrb`/`zrc`)

**Data:** 2026-09-05
**Participantes:** `[PREENCHER: nomes presentes]`

#### Entregue
Os três projetos subidos localmente com webcam real do notebook, inferência em CUDA, Gemini configurado (`CYPHER_LLM_PROVIDER=gemini`) e Cloudinary já configurado no `.env` do `cypher-capture` (empresa `webcam-demo`, câmera `CAM-WEBCAM` reaproveitadas de teste anterior). Cadastro/edição de zona testado de verdade pela UI contra o backend real.

**Achados do teste manual, todos corrigidos antes do merge:**
- **Gap de autenticação real (Critical para a funcionalidade, não Critical de segurança):** `CameraConfigClient`/`ZoneConfigClient` (`cypher-capture`) nunca enviavam nenhum cabeçalho de autenticação em `GET /cameras/{id}/config` e `.../zones/config`, mesmo já havendo uma `X-Cypher-Key` provisionada em cache — a API sempre respondia `401` e a escada de degradação caía direto pro próximo degrau. Corrigido via TDD: `api_key` passou a ser parâmetro de `fetch()` nos dois clientes, e o provisionamento da chave em `run_pipeline.py` foi movido pra antes dessas buscas (era feito só depois, na hora de montar o `HttpIncidentSink`). PR #9 do `cypher-capture` ganhou um segundo commit com esse fix (274→283 testes, +9 novos: 2 no client de câmera, 2 no de zonas, 5 no hot-reload abaixo). **Efeito colateral positivo:** essa mesma correção fecha o gap de "bootstrap de câmera nova no orquestrador" já registrado no roteiro §5 (2026-09-04) — o orquestrador sobe exatamente esse `run_pipeline.py` como subprocesso.
- **UX do editor de zonas (`zrc`):** o `<img>` do stream ficava sempre `display:none`, então o gestor não via a câmera antes de clicar "Capturar frame" — corrigido pra mostrar o preview ao vivo até a captura. `editar()` fechava o polígono de uma zona existente sem nenhum jeito de reabri-lo — a zona carregada nunca podia ter os pontos ajustados, só os campos do formulário; corrigido com um botão "reabrir polígono para editar pontos". PR #8 do `cypher-front` ganhou um commit com esses dois fixes (343 testes, +2 novos).
- **Hot-reload trazido pra dentro do escopo por pedido explícito:** originalmente fora de escopo (spec §7, "comunicação entre a UI e o pipeline já rodando"). Implementado como `ZoneHotReloader` (`cypher-capture`) — thread separada, revalida a cada ~30s (configurável via `--zone-refresh-seconds`, 0 desativa), só troca `ZoneManager`/`ZoneDetector` quando a lista de zonas muda de verdade (comparação estrutural), não trava o loop de frames com a chamada de rede síncrona. `--zones` (arquivo local explícito) continua desativando o hot-reload. Aviso na UI atualizado de "reinicie o pipeline" para "aplica em até ~30s, sem reiniciar". Specs de zonas de risco e roteiro de entregas atualizados para refletir a mudança de escopo.
- Confirmado empiricamente: uma zona cadastrada pela UI ("Teste") foi buscada remotamente pelo pipeline reiniciado com o fix, convertida de normalizado para pixel na resolução real da câmera (640×480).

**Suítes finais antes do merge:** `zra` 339/339 (inalterado); `zrb` 283/283 (269 originais + 5 do fix de auth + 9 do hot-reload, entrando em dois commits separados); `zrc` 343/343 (341 originais + 2 dos fixes de UX).

Os 3 PRs mergeados: `zra` PR [#9](https://github.com/lucvs07/Cypher-Api/pull/9) → `main`; `zrb` PR [#9](https://github.com/lucvs07/cypher-capture/pull/9) → `main`; `zrc` PR [#8](https://github.com/Ronaldovels/cypher-front/pull/8) → `dev`.

#### O que não foi concluído / passa para o backlog
- Verificação visual manual dos dois fixes de canvas que jsdom não testa automaticamente (frame realmente parado, zonas existentes em cinza sobre o frame) — confirmados funcionando no teste real, mas sem cobertura automatizada possível (limitação conhecida, documentada desde a Task 3 de `zrc`).
- Worktree órfão `.worktrees/e2c-front-cadastro` (de uma entrega antiga já mergeada) segue no `cypher-front`, causando falha de `npx vitest run` sem argumento explícito — não removido, fora do escopo desta sessão.
- Demonstração formal do fluxo completo (spec §6: incidente `ZONE_VIOLATION` disparado por invasão real de zona) não foi executada nesta rodada — o teste validou cadastro, hot-reload e busca remota, não uma invasão real filmada.

#### Feedback recebido
Nenhum registrado ainda (banca/mentoria).

#### Próximos passos
Cards `zra`/`zrb`/`zrc` movidos para `Concluído` no Trello e neste documento. Spec de zonas de risco movida de `planejadas/` para `implementadas/`, roteiro de entregas atualizado (gaps de hot-reload e bootstrap do orquestrador marcados como resolvidos). Próximo: retomar E5 (gamificação, ainda bloqueada por gating externo) e E6 (relatórios, CSV de incidentes já liberado).

---

### 3.7 Review — Gating temporal de queda (`gtq`)

**Data:** 2026-09-07
**Participantes:** `[PREENCHER: nomes presentes]`

#### Contexto
A sessão de implementação iniciada em 2026-09-05 corrompeu no meio da Tarefa 5. Esta sessão retomou o trabalho reconstruindo o diagnóstico **só a partir do git e do ledger SDD**, sem confiar em nenhum estado de progresso relatado: Tarefas 1–4 já estavam commitadas e revisadas na branch `feat/gtq-gating-queda` (`b19f2ef..1f87c9c`), suíte 290/290 verde; a Tarefa 5 tinha só o brief, sem relatório — esse era o ponto real de parada. Os artefatos SDD (ledger + relatórios das tasks + saídas instrumentadas) foram preservados para fora do worktree travado antes de qualquer coisa.

#### Entregue
Mecanismo de gating temporal de queda no `PostureClassifier` (`cypher-capture`), sem retreino de modelo:
- **T1** — janela de confirmação em `_apply_hysteresis`: `fall_velocity` puro (sem `person_fallen` no mesmo frame) não vira `IMMEDIATE_RISK` público até `person_fallen` confirmar dentro de `fall_confirm_frames`; senão o episódio é descartado. `balance_loss_risk` / `CRITICAL_ZONE` / `person_fallen`-desde-o-primeiro-frame não mudam (fix pós-revisão garantiu que a janela não bloqueia esses caminhos). 5 testes novos.
- **T2** — `fall_confirm_seconds` (default 1.0) fiado do `pose_config.yaml` até o classificador via `UnifiedPipeline` (`round(seconds × target_fps)`). `tests/test_pipeline_config.py` novo.
- **T3** — fixture `cenario2_transitions.json` regravada: 15 → 8 transições, 4 falsos "fall" de agachamento removidos (todos fora das janelas de queda anotadas), ambas as quedas reais preservadas; 2 testes de replay obsoletos alinhados à nova realidade.
- **T4/T5** (empíricas, sem commit) — validação de precisão/recall e ponta a ponta.

Suíte final: **290/290** (283 baseline + 7 novos). PR [#10](https://github.com/lucvs07/cypher-capture/pull/10) aberto contra `main`.

#### Resultados da validação empírica

| Métrica (`immediate_risk`, cenario2) | Baseline | Com gating |
|---|---|---|
| Precisão | 0,581 (oficial) / 0,418 (sweep) | **0,680** |
| Recall frame-level | 0,986 | **0,915** |
| Falso `immediate_risk` novo (cenario.mp4) | ~4 episódios | **0** |

- Precisão melhorou de forma mensurável — objetivo primário da spec **atingido**.
- Recall frame-level **abaixo** do piso literal de 0,95 (spec GTQ §5): os 24 FN são ~23 frames de borda de subida numa única queda + 1 de jitter — **nenhuma queda inteira perdida**. No caminho de produção (`run_pipeline.py`), as 2 quedas reais geram alerta `FALL_RISK` com cobertura contínua.
- `fall_confirm_seconds` é inerte no frame-level (sweep 0,3–1,0 idêntico); a alavanca real do recall são os cues `person_fallen`, fora do escopo do plano.

#### Decisão — bloqueio §7 da E5

**Resolvido com ressalva (decisão do controlador, 2026-09-07).** O bloqueio §7 condiciona-se à credibilidade de um placar de conformidade frente à taxa de falso positivo — que melhorou claramente (precisão +0,10, zero falso novo). Ressalva registrada na spec E5 §7: recall frame-level 0,915 < 0,95, causado por latência de onset, não queda perdida. Follow-up **não bloqueante**: se o placar E5 pontuar tempo-até-alerta ou contar número de incidentes, revisitar (a) afrouxar cues `person_fallen` com validação própria e (b) fixar `merge_window_seconds`.

#### O que não foi concluído / passa para o backlog
- Follow-up dos cues `person_fallen` para fechar o gap de recall 0,915 → ≥0,95 — precisa de spec/plano próprios com validação anti-overfitting (os thresholds atuais foram calibrados contra falso-positivo em agachamento).
- 1 `FALL_RISK` espúrio por clipe via `balance_loss_risk` em agachamento — pré-existente, fora do escopo do GTQ.
- Latência E2E p95 ~294 ms (alvo 200 ms) no host CPU de validação — pré-existente, não é questão do GTQ.

#### Feedback recebido
Nenhum registrado ainda (banca/mentoria).

#### Próximos passos
PR [#10](https://github.com/lucvs07/cypher-capture/pull/10) mergeado em 2026-09-07 (`gtq` → `main` do `cypher-capture`). Card `gtq` movido para `Concluído` no Trello e neste documento. Spec GTQ migrada de `planejadas/` para `implementadas/`; roteiro de entregas atualizado (GTQ em §2, removido de §3; E5 sem bloqueio); spec E5 §7 e status atualizados; sprint-backlog atualizado (`gtq` → `Concluído`, E5 → liberada). Próximo: puxar a E5 (`e5a`/`e5b`/`e5c`). Follow-up não bloqueante registrado na spec E5 §7 (cues `person_fallen` para recuperar recall frame-level; `merge_window_seconds` fixo se o placar contar nº de incidentes).

---

### 3.8 Review — Gamificação por equipe, backend (`e5a`)

**Data:** 2026-09-07
**Participantes:** `[PREENCHER: nomes presentes]`

#### Contexto
Primeira das três fatias da E5. Execução via subagent-driven development no `cypher` (branch `feat/e5-backend-gamificacao`, a partir de `main`, sem worktree), um subagente implementador por tarefa + revisão de tarefa (spec + qualidade) após cada uma + revisão da branch inteira ao final. Os planos tinham ~1 semana e várias entregas mergearam desde (multi-tenant, webhook, zonas), então o scan pré-execução verificou a árvore atual: aridade do construtor de `Equipe` após os 3 campos de meta (afeta todas as chamadas `new Equipe(...)`, `EquipeService` e os testes de repositório/serviço), construtores de `Camera`/`Estacao` nos testes de placar, campo `apiKey` em `CameraApiKeyResponse`.

#### Entregue
- **Tarefa 1 — Heartbeat e `MonitoramentoDiario`.** `POST /api/v1/cameras/{codigo}/heartbeat` (superfície de máquina, só `X-Cypher-Key`/ROLE_PIPELINE, 204/4xx). `MonitoramentoDiario` — uma linha por `(cameraId, dia, turno)`, acúmulo de tempo monitorado com teto de gap (`cypher.heartbeat.max-gap-seconds`, default 60s); primeiro heartbeat é âncora. `TurnoWindow` — utilitário puro, janela fixa (spec §2.3).
- **Tarefa 2 — Metas de `Equipe` e `GET /api/v1/placar`.** Campos de meta opcionais em `Equipe`/`TeamRequest`/`TeamResponse`. `GET /api/v1/placar?since&until` → `List<PlacarEquipeResponse>`, GESTOR-only, escopado por `empresaId` desde a primeira linha. Conformidade ponderada por tempo, cobertura normalizada por nº de câmeras **e** restrita ao turno da equipe, ranking sempre por delta semana-vs-anterior, "dados insuficientes" com cobertura `< 0,5`, sequência quebrada só por `FALL_RISK` de `duracaoSegundos ≥ 3` ou aberto.
- **Tarefa 3 — Norma aplicável.** `NormaAplicavel.de(AlertaTipo)` (NR-35/NR-17/NR-12/NR-6), `IncidentResponse.normaAplicavel` como último campo (back-compat com SSE/webhook).

Suíte final: **362/362** (era 315 no início da entrega). PR [#10](https://github.com/lucvs07/Cypher-Api/pull/10) aberto contra `main` do `cypher`.

#### Achados de revisão corrigidos antes do PR
- **Revisão da Tarefa 2 (Critical):** o ranking colapsava para conformidade absoluta sempre que a equipe não tinha `MonitoramentoDiario` na semana anterior — o piso de cobertura só era aplicado à janela atual, e a janela anterior sem dados devolvia conformidade `0,0`, fazendo `delta = conformidade atual`. Corrigido: piso de cobertura aplicado às duas janelas; `deltaConformidadeSemana` nulo quando a semana anterior é insuficiente.
- **Revisão final de branch (4 Important):** (a) numerador de incidentes do placar era consultado por instante enquanto o denominador ia por dia de calendário — uma queda no próprio dia de `until` ficava fora do numerador com o dia inteiro no denominador; corrigido alinhando os limites ao grão de dia. (b) Janelas de delta atual e anterior compartilhavam a data de `since`; tornadas disjuntas (`[since-7d, since-1d]` vs `[since, until]`). (c) Sequência era devolvida mesmo sem dados suficientes — cobrir as câmeras 90 dias renderia `melhorSequencia = 90`; agora zerada quando `!dadosSuficientes`, fechando o incentivo de "tapar a câmera" (E1 §16.2). (d) Os caminhos de delta/sequência/numerador de conformidade não tinham nenhuma fixture de `Alerta` — a correção do Critical da Tarefa 2 estava sem teste; adicionadas fixtures reais cobrindo delta positivo, conformidade-vs-duração e o limiar de 3 s da sequência.

#### O que não foi concluído / passa para o backlog (follow-ups não bloqueantes)
- Ranking fica em ordem de inserção nas 2 primeiras semanas de operação (sem histórico para delta) — inerente ao ranking-por-delta (spec §3.2 / E1 §16.3); `e5c` precisa renderizar um estado "sem histórico suficiente".
- `TurnoWindow` e `cypher.heartbeat.max-gap-seconds` são constantes de aplicação, não `application.yaml` — decisão explícita do plano (utilitário puro, sem `@ConfigurationProperties`).
- Sem constraint de unicidade em `(cameraId, dia, turno)` (check-then-act) — ingestão serial por câmera no cenário atual; revisitar se houver ingestão concorrente.
- Bucketing de turno assume pipeline e API no mesmo fuso — verificado: `run_pipeline.py` envia `detectedAt` no offset local do host e o H2/Hibernate preserva o offset, então alertas e heartbeats caem no mesmo relógio de parede. Vale como premissa de implantação.
- `PlacarEquipeResponse` não tem `metaTempoReconhecimentoSegundosAtingida` (as outras duas metas têm o par `...Atingida`) — o tempo-até-reconhecimento depende de dado de E3 ainda não disponível; segue como campo informativo até `e6`.

#### Feedback recebido
Nenhum registrado ainda (banca/mentoria).

#### Próximos passos
Revisão/merge do PR [#10](https://github.com/lucvs07/Cypher-Api/pull/10) do `cypher`. Com `e5a` rodando localmente e o contrato dos DTOs fixado (`POST /api/v1/cameras/{codigo}/heartbeat`, `GET /api/v1/placar?since&until` → `List<PlacarEquipeResponse>`, `IncidentResponse.normaAplicavel`), executar `e5b` (`cypher-capture` — `HeartbeatSender`) e `e5c` (`cypher-front` — `PlacarComponent`, metas em `/config/equipe`, norma no card do kiosk) em paralelo. `e5c` deve tratar o estado "ranking sem histórico suficiente".
