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

Confirmado por histórico de commits nos três repositórios em 2026-08-29 (E4 mergeada via PR #4 em `cypher-front`, PR #5 em `cypher`, PR #7 em `cypher-capture`). Análise LLM multimodal mergeada em 2026-09-02 (PR #6 em `cypher`, PR #5 em `cypher-front`). Multi-tenant mergeada em 2026-09-03 (PR #7 em `cypher`, PR #6 em `cypher-front`).

---

## 3. Entregas planejadas

| Ordem | Entrega | Spec | Plano de implementação | Depende de | Bloqueio |
|---|---|---|---|---|---|
| 2 | Orquestrador de pipelines por câmera | `planejadas/2026-09-03-orquestrador-pipelines-design.md` | `plans/orquestrador-pipelines/` (`oqa`, só `cypher-capture`) | Multi-tenant (conta de serviço GESTOR + `GET /cameras` escopado por tenant) | nenhum, além da ordem — **priorizada pelo produto em 2026-09-03**, ver nota abaixo |
| 2 | Cadastro de webhook pela interface | `planejadas/2026-08-29-cadastro-webhook-design.md` | `plans/webhook/` (`wha` backend, `whb` front) | Multi-tenant | nenhum, além da ordem |
| 2 | Zonas de risco pela interface | `planejadas/2026-08-29-zonas-de-risco-design.md` | `plans/zonas-de-risco/` (`zra` backend, `zrb` capture, `zrc` front) | Multi-tenant | nenhum, além da ordem |
| E5 | Gamificação por equipe | `planejadas/2026-08-29-gamificacao-e5-design.md` | `plans/e5-gamificacao/` (`e5a` backend, `e5b` capture, `e5c` front) — **planos escritos, execução bloqueada** | Multi-tenant | **sim** — gating temporal de queda no `cypher-capture` (cronograma pós-NEXT, sem data definida); implementação não deve começar antes disso (spec §7) |
| E6 | Relatórios e exportação | `planejadas/2026-08-29-relatorios-e6-design.md` | `plans/e6-relatorios/` (`e6a` backend, `e6b` front) — Tarefa 1 de cada arquivo liberada, Tarefa 2 depende de E5 | Multi-tenant; parcialmente E5 (placar) | CSV de incidentes é independente de E5 e pode ser executado agora; CSV de placar e PDF de resumo dependem de E5 estar implementada |

Todos os planos seguem a convenção `docs/superpowers/plans/<entrega>/YYYY-MM-DD-<letra><entrega>-<descricao>.md`, uma letra por repositório/fatia (`a`=backend `cypher`, `b`=`cypher-capture` quando a entrega o toca, última letra=front `cypher-front`) — mesmo padrão de `plans/e1`–`plans/e4`. O orquestrador é a primeira entrega deste roteiro a tocar **só** `cypher-capture` — por isso tem uma única fatia (`oqa`), sem letra de backend/front.

**Orquestrador de pipelines, cadastro de webhook e zonas de risco têm a mesma ordem (2)** porque são independentes entre si — todas só dependem do multi-tenant, podem avançar em paralelo ou em qualquer ordem relativa. Confirmado que não competem por arquivo: o orquestrador só cria `src/orchestrator/` (módulo novo) e invoca `run_pipeline.py` como subprocesso externo, sem editar seu código-fonte — mesmo zonas de risco (`zrb`) alterando esse mesmo arquivo (`run_pipeline.py`), não há sobreposição de linhas entre os dois planos.

**Priorização do orquestrador (decisão de produto, 2026-09-03):** durante o teste manual ponta a ponta de multi-tenant, ficou claro que cadastrar uma câmera pela interface não bastava para ela rodar no pipeline — é preciso subir `run_pipeline.py` manualmente, um processo por câmera, sem nenhum mecanismo que descubra câmeras novas ou reinicie as que caem. Decisão: o orquestrador entra como prioridade entre os itens de ordem 2, à frente de webhook/zonas de risco na fila de retirada — mas continua sem bloqueio de dependência sobre eles (podem avançar em paralelo se o time tiver capacidade).

**E5 é a única com um bloqueio externo ao controle do time de produto** — depende de um item de calibração de modelo no `cypher-capture` sem prazo definido. Nada impede as demais entregas planejadas de avançarem enquanto isso.

---

## 4. Consistência de design no front

Toda spec com mudanças em `cypher-front` registra explicitamente (numa nota de design na própria seção) que reaproveita os primitivos globais já existentes em `src/styles.scss` (`.field`, `.input`, `.btn`, `.panel`, `.list-row`, `.chip`, `.status`) e o padrão de formulário "signal de rascunho + `patch()`" — nenhuma tela nova introduz CSS solto, biblioteca de UI, ou `ReactiveFormsModule`. A única exceção registrada é o canvas de desenho de polígono em `2026-08-29-zonas-de-risco-design.md` §4.3, justificada ali por não ter equivalente nos primitivos existentes. Ao brainstormar uma spec nova, essa nota deve ser incluída desde a primeira versão do documento, não adicionada depois.

---

## 5. Gaps conhecidos, ainda sem spec

- **`/config/epis`** (E1 §14.1, E2 §10) — condicionada ao retreino do detector com classes `no_*` de violação de EPI; sem consumidor até lá.
- **Hot-reload de zonas** (`2026-08-29-zonas-de-risco-design.md` §7) — comunicação entre a UI e o pipeline já rodando, sem precisar reiniciar. Registrado como entrega futura, sem spec própria ainda.
- **Painel de super-admin multi-empresa** (`2026-08-29-multi-tenant-design.md` §9) — gestão de empresas entre si (suporte, billing). Não foi pedido.
