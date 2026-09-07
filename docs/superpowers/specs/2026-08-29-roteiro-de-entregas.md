# Cypher — Roteiro de Entregas

**Data:** 2026-08-29
**Status:** vivo — atualizado a cada nova entrega concluída ou nova spec estruturada
**Propósito:** índice único de onde cada entrega do produto está especificada, o que já foi implementado e o que ainda falta, e em que ordem as entregas planejadas dependem umas das outras. Este documento não substitui nenhuma spec — só aponta para elas.

O roteiro original está em `implementadas/2026-08-10-notificacao-de-incidentes-design.md` §14. Este documento é a atualização viva daquela tabela, incluindo entregas que não constavam ali (zonas de risco) e o estado real de implementação de cada uma.

---

## 1. Organização das pastas

```
docs/superpowers/specs/
├── 2026-08-29-roteiro-de-entregas.md     este documento
├── implementadas/                          entregas com código mergeado em dev/main nos repositórios afetados
└── planejadas/                             specs aprovadas, aguardando plano de implementação ou pré-requisito
```

Uma spec migra de `planejadas/` para `implementadas/` quando a entrega correspondente é mergeada — não quando o plano de implementação é escrito. Este documento é atualizado no mesmo commit que move o arquivo.

**⚠️ Sempre que uma sessão de desenvolvimento finalizar ou revisar uma entrega deste roteiro** (PR aberto, revisado ou mergeado), atualizar também os artefatos Scrum em `docs/scrum/sprint-3/`: mover o card correspondente no Trello (e no `sprint-backlog.md` de referência), e registrar a Review daquela entrega em `docs/scrum/sprint-3/cerimonias.md`. Isso mantém os artefatos Scrum como reflexo real da execução, entrega por entrega, em vez de um dump retroativo no fim da sprint.

---

## 2. Entregas implementadas

| # | Entrega | Spec | Repositórios tocados |
|---|---|---|---|
| — | Tema, flag de mock e tipografia | `implementadas/2026-08-12-tema-flag-mock-tipografia-design.md` | `cypher-front` |
| E1 | Núcleo de notificação | `implementadas/2026-08-10-notificacao-de-incidentes-design.md` | `cypher-capture`, `cypher`, `cypher-front` |
| E2 | Cadastro de estações e câmeras, captura resiliente | `implementadas/2026-08-20-cadastro-e-cameras-design.md` | `cypher`, `cypher-capture`, `cypher-front` |
| E3 | Operação (timeline, detalhe, feeds, kiosk) | `implementadas/2026-08-23-operacao-e3-design.md` | `cypher`, `cypher-front` |
| E4 | Acesso e equipes | `implementadas/2026-08-23-acesso-e-equipes-e4-design.md` | `cypher`, `cypher-capture`, `cypher-front` |
| — | Análise de risco com LLM multimodal | `implementadas/2026-09-01-analise-llm-multimodal-design.md` | `cypher`, `cypher-front` |
| — | Multi-tenant (Empresa) | `implementadas/2026-08-29-multi-tenant-design.md` | `cypher`, `cypher-front` |
| — | Orquestrador de pipelines por câmera | `implementadas/2026-09-03-orquestrador-pipelines-design.md` | `cypher-capture` |
| — | Cadastro de webhook pela interface | `implementadas/2026-08-29-cadastro-webhook-design.md` | `cypher`, `cypher-front` |
| — | Zonas de risco pela interface | `implementadas/2026-08-29-zonas-de-risco-design.md` | `cypher`, `cypher-capture`, `cypher-front` |
| GTQ | Gating temporal de queda | `implementadas/2026-09-05-gating-temporal-queda-design.md` | `cypher-capture` |

Confirmado por histórico de commits nos três repositórios em 2026-08-29 (E4 mergeada via PR #4 em `cypher-front`, PR #5 em `cypher`, PR #7 em `cypher-capture`). Análise LLM multimodal mergeada em 2026-09-02 (PR #6 em `cypher`, PR #5 em `cypher-front`). Multi-tenant mergeada em 2026-09-03 (PR #7 em `cypher`, PR #6 em `cypher-front`). Orquestrador de pipelines e cadastro de webhook mergeados em 2026-09-04 (orquestrador: PR #8 em `cypher-capture`; webhook: PR #8 em `cypher`, PR #7 em `cypher-front`) — testados manualmente ponta a ponta com webcam real do notebook e inferência em CUDA antes do merge. Zonas de risco mergeada em 2026-09-05 (`zra`: PR #9 em `cypher`; `zrb`: PR #9 em `cypher-capture`; `zrc`: PR #8 em `cypher-front`) — testada manualmente ponta a ponta com webcam real, Gemini e Cloudinary configurados; o teste encontrou e corrigiu, antes do merge, o gap de autenticação em `ZoneConfigClient`/`CameraConfigClient` (ver §5) e trouxe o hot-reload de zonas pra dentro do escopo (estava registrado como fora de escopo, ver spec §3.4/§7). Gating temporal de queda mergeado em 2026-09-07 (`gtq`: PR #10 em `cypher-capture`) — implementado via subagent-driven development (5/5 tasks, suíte 290/290); validação empírica melhorou a precisão de `immediate_risk` de 0,581 para 0,680 sem perder nenhuma queda inteira (recall frame-level 0,915, abaixo do piso 0,95 da spec §5 — ver decisão de desbloqueio da E5 com ressalva na spec E5 §7).

---

## 3. Entregas planejadas

| Ordem | Entrega | Spec | Plano de implementação | Depende de | Bloqueio |
|---|---|---|---|---|---|
| E5 | Gamificação por equipe | `planejadas/2026-08-29-gamificacao-e5-design.md` | `plans/e5-gamificacao/` (`e5a` backend, `e5b` capture, `e5c` front) — **planos revisados 2026-09-07, execução liberada** | Multi-tenant; GTQ (ambos implementados) | **nenhum** — bloqueio §7 (GTQ) resolvido com ressalva em 2026-09-07 (PR #10). Revisão pré-execução (2026-09-07) fechou 3 decisões nos planos: piso de cobertura 0,5 ("dados insuficientes", spec §3.2), sequência quebrada só por `FALL_RISK` sev≥3 (spec §3.2/§7), `cobertura` normalizada por nº de câmeras. Ordem: `e5a` primeiro (fixa o contrato dos DTOs), depois `e5b`+`e5c` em paralelo |
| E6 | Relatórios e exportação | `planejadas/2026-08-29-relatorios-e6-design.md` | `plans/e6-relatorios/` (`e6a` backend, `e6b` front) — Tarefa 1 de cada arquivo liberada, Tarefa 2 depende de E5 | Multi-tenant; parcialmente E5 (placar) | CSV de incidentes é independente de E5 e pode ser executado agora; CSV de placar e PDF de resumo dependem de E5 estar implementada |

Todos os planos seguem a convenção `docs/superpowers/plans/<entrega>/YYYY-MM-DD-<letra><entrega>-<descricao>.md`, uma letra por repositório/fatia (`a`=backend `cypher`, `b`=`cypher-capture` quando a entrega o toca, última letra=front `cypher-front`) — mesmo padrão de `plans/e1`–`plans/e4`. GTQ foi single-repo (`cypher-capture`), mesmo padrão de `oqa` (orquestrador).

**Gating temporal de queda (GTQ) — puxado em 2026-09-05, mergeado em 2026-09-07 (ver §2).** Decisão de produto: o usuário pediu para investigar e resolver o bloqueio da E5 em vez de esperar por um prazo indefinido. Investigação confirmou que o gating é viável sem retreino de modelo (lógica de regras sobre sinais já extraídos); spec e plano escritos no mesmo dia. A nota de correção no topo da spec registra que a evidência original citada (E5 §7, "2 quedas → 3 incidentes") estava errada; a evidência real é a precisão de `immediate_risk` = 0,418 medida em `docs/metricas-dia2.md` §5.2. Implementado via subagent-driven development (5/5 tasks, suíte 290/290) retomando uma sessão anterior corrompida no meio da Tarefa 5. Validação (Tarefas 4–5, relatórios em `.superpowers/sdd/2026-09-05-gtq-capture-gating-queda/` no `cypher-capture`): precisão de `immediate_risk` 0,581 → **0,680** (0,418 → 0,680 vs baseline do sweep), zero falso `immediate_risk` novo em `cenario.mp4`, ambas as quedas reais gerando alerta `FALL_RISK` contínuo no caminho de produção. Recall frame-level caiu para 0,915 (piso da spec GTQ §5 é 0,95) — a decisão do controlador (2026-09-07) foi **considerar o bloqueio §7 da E5 resolvido com ressalva registrada**: a queda de recall é latência de borda de subida (~0,8 s numa única queda), não queda perdida, e a alavanca real (cues `person_fallen`) está fora do escopo do plano GTQ. Follow-up não bloqueante registrado na spec E5 §7.

**Orquestrador de pipelines, cadastro de webhook, zonas de risco e gating temporal de queda foram mergeados em 2026-09-04/05/07** — ver §2. Resta E5 (desbloqueada) e E6 (parcialmente liberado) na fila de planejadas.

**Descoberta do teste ponta a ponta do orquestrador (2026-09-04), resolvida em 2026-09-05:** `GET /api/v1/cameras/{id}/config` exige papel `PIPELINE` ou `GESTOR`, mas o cliente de config remota do `cypher-capture` (`CameraConfigClient`) fazia a chamada sem nenhuma autenticação — para uma câmera cadastrada pela primeira vez (sem `X-Cypher-Key` provisionada ainda e sem cache local), a busca de config sempre recebia 401 antes que o `ApiKeyProvisioner` tivesse chance de provisionar a chave. O `run_pipeline.py` manual contornava isso com `--source` explícito, mas o orquestrador não tinha equivalente. Corrigido durante o teste manual de zonas de risco (2026-09-05, PR #9 em `cypher-capture`): o provisionamento da chave passou a acontecer antes de qualquer busca de config/zonas remotas, e o mesmo `run_pipeline.py` é o processo que o orquestrador sobe via `subprocess.Popen` — resolve os dois casos com a mesma correção (ver §5).

**E5 deixou de estar bloqueada (2026-09-07)** — o bloqueio §7 foi resolvido com ressalva pela validação empírica do GTQ, e o PR #10 do `cypher-capture` foi mergeado. A E5 (`e5a`/`e5b`/`e5c`) pode ser puxada. Nada impede as demais entregas planejadas de avançarem.

---

## 4. Consistência de design no front

Toda spec com mudanças em `cypher-front` registra explicitamente (numa nota de design na própria seção) que reaproveita os primitivos globais já existentes em `src/styles.scss` (`.field`, `.input`, `.btn`, `.panel`, `.list-row`, `.chip`, `.status`) e o padrão de formulário "signal de rascunho + `patch()`" — nenhuma tela nova introduz CSS solto, biblioteca de UI, ou `ReactiveFormsModule`. A única exceção registrada é o canvas de desenho de polígono em `2026-08-29-zonas-de-risco-design.md` §4.3, justificada ali por não ter equivalente nos primitivos existentes. Ao brainstormar uma spec nova, essa nota deve ser incluída desde a primeira versão do documento, não adicionada depois.

---

## 5. Gaps conhecidos, ainda sem spec

- **`/config/epis`** (E1 §14.1, E2 §10) — condicionada ao retreino do detector com classes `no_*` de violação de EPI; sem consumidor até lá.
- **Painel de super-admin multi-empresa** (`2026-08-29-multi-tenant-design.md` §9) — gestão de empresas entre si (suporte, billing). Não foi pedido.

**Resolvidos durante o teste manual ponta a ponta de zonas de risco (2026-09-05):**
- ~~Hot-reload de zonas~~ — implementado (`ZoneHotReloader`, `2026-08-29-zonas-de-risco-design.md` §3.4), trazido pra dentro da entrega `zrb`/`zrc` por pedido explícito depois de originalmente registrado como fora de escopo.
- ~~Bootstrap de câmera nova no orquestrador~~ (achado no teste ponta a ponta de 2026-09-04, ver §3) — `CameraConfigClient`/`ZoneConfigClient` nunca enviavam `X-Cypher-Key`, então `GET /cameras/{id}/config` e `.../zones/config` sempre voltavam 401 mesmo com uma chave já em cache. Corrigido no `cypher-capture` (`feat/zr-capture-zonas`, achado no teste manual de zonas de risco): o provisionamento da chave em `run_pipeline.py` passou a acontecer antes dessas buscas, e o mesmo processo é o que o orquestrador sobe via `subprocess.Popen` — resolve os dois casos com a mesma correção.
