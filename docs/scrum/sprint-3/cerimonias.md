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

*(continuar registrando um bloco por dia de trabalho real em `ala`/`alb`.)*

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
