# Product Backlog — Cypher (Challenge SPI/FIAP)

**Atualizado em:** 2026-09-14
**Fonte:** reconstruído a partir do histórico real de commits/specs dos três repositórios (`cypher`, `cypher-capture`, `cypher-front`) — não é um backlog fictício, reflete o que de fato foi priorizado, especificado e entregue.

Priorização: MoSCoW simplificado, ordenado por valor para o objetivo "sistema rodando na Metaindústria com ≥3 câmeras" (meta de Fase 4).

---

## Concluído (Entregas E1–E4)

*(Itens 4 e 5 foram implementados dentro da própria janela da Sprint 3 — 2026-08-23 a 2026-08-25 — ver `docs/scrum/sprint-3/sprint-backlog.md`, seção "Código".)*

| # | Item | Entrega | Valor | Status |
|---|---|---|---|---|
| 1 | Notificar um incidente ponta a ponta (capture → backend → front) | E1 | Must | ✅ Concluído |
| 2 | Cadastro de câmeras e estações + captura resiliente | E2 | Must | ✅ Concluído |
| 3 | Timeline de incidentes, detalhe, reconhecimento de status, kiosk do operador | E3 | Must | ✅ Concluído |
| 4 | Login (gestor e operador), papéis, guards, proteção de endpoints, cadastro de equipes | E4 | Must | ✅ Concluído |
| 5 | Chave de API por câmera para ingestão autenticada | E4 | Must | ✅ Concluído |

## Especificado, planejado e implementado (roteiro E1–E6 completo)

Cada item abaixo teve um documento de design (`docs/superpowers/specs/`) e um plano de implementação TDD tarefa-a-tarefa (`docs/superpowers/plans/`) escritos entre 2026-08-25 e 2026-09-01, e foi puxado e mergeado nas semanas seguintes (2026-09-01 a 2026-09-11) — o roteiro original de 6 entregas está 100% concluído. Ordem de dependência registrada em `docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md`.

**Quebra em cards de execução:** cada item abaixo já está quebrado em cards por fatia de repositório (backend/capture/front), prontos para virar cards do Trello com checklist = tasks do plano — ver `docs/scrum/sprint-3/sprint-backlog.md`, seção "Próximas entregas".

| # | Item | Valor | Spec | Plano | Status |
|---|---|---|---|---|---|
| 6 | Multi-tenant (Empresa) — pré-requisito das próximas 4 entregas | Must | `2026-08-29-multi-tenant-design.md` | `plans/multi-tenant/` | ✅ Concluído (PRs [#7](https://github.com/lucvs07/Cypher-Api/pull/7)/[#6](https://github.com/Ronaldovels/cypher-front/pull/6) mergeados) |
| 7 | Cadastro de webhook pela interface (hoje só via `application.yaml`+restart) | Should | `2026-08-29-cadastro-webhook-design.md` | `plans/webhook/` | ✅ Concluído (PRs [#8](https://github.com/lucvs07/Cypher-Api/pull/8)/[#7](https://github.com/Ronaldovels/cypher-front/pull/7) mergeados, testado com câmera real) |
| 8 | Zonas de risco configuráveis pela interface | Should | `2026-08-29-zonas-de-risco-design.md` | `plans/zonas-de-risco/` | ✅ Concluído (PRs [#9](https://github.com/lucvs07/Cypher-Api/pull/9)/[#9](https://github.com/lucvs07/cypher-capture/pull/9)/[#8](https://github.com/Ronaldovels/cypher-front/pull/8) mergeados) |
| 9 | Gamificação por equipe (placar, metas, sequência) | Should | `2026-08-29-gamificacao-e5-design.md` | `plans/e5-gamificacao/` | ✅ Concluído — bloqueio de gating temporal de queda resolvido (`gtq`, PR [#10](https://github.com/lucvs07/cypher-capture/pull/10)), PRs [#10](https://github.com/lucvs07/Cypher-Api/pull/10)/[#11](https://github.com/lucvs07/cypher-capture/pull/11)/[#10](https://github.com/Ronaldovels/cypher-front/pull/10) mergeados |
| 10 | Relatórios e exportação (CSV/PDF) | Could | `2026-08-29-relatorios-e6-design.md` | `plans/e6-relatorios/` | ✅ Concluído (PRs [#11](https://github.com/lucvs07/Cypher-Api/pull/11)/[#11](https://github.com/Ronaldovels/cypher-front/pull/11) mergeados) |
| 11 | Análise de risco com LLM multimodal (Claude/Gemini) no detalhe do incidente | Must (prazo externo 21/09) | `2026-09-01-analise-llm-multimodal-design.md` | `plans/analise-llm/` | ✅ Concluído (PRs [#6](https://github.com/lucvs07/Cypher-Api/pull/6)/[#5](https://github.com/Ronaldovels/cypher-front/pull/5) mergeados, testado com câmera real) |
| 24 | Orquestrador de pipelines por câmera (`cypher-capture` sobe/derruba/reinicia processo por câmera) | Must (gap real achado no teste ponta a ponta de multi-tenant) | `2026-09-03-orquestrador-pipelines-design.md` | `plans/orquestrador-pipelines/` | ✅ Concluído (PR [#8](https://github.com/lucvs07/cypher-capture/pull/8) mergeado, testado com câmera real) |

## Sprint 3 — gestão ágil (fechamento)

| # | Item | Valor | Status |
|---|---|---|---|
| 12 | Evoluir protótipo com ≥2 telas/fluxos novos (login, cadastro de equipes) | Must | ✅ Concluído — decisão do grupo: o projeto passou de prototipação para implementação a partir da E4; 6 telas/fluxos novos mapeados e justificados em `docs/fluxo-de-telas.md`, demonstrados ao vivo no projeto local em vez de artboards Figma novos |
| 13 | Configurar e compartilhar board Trello (Product Backlog, Sprint Backlog, cards) | Must | ✅ Concluído |
| 14 | Documentar cerimônias Scrum (Planning, Daily, Review) da Sprint 3 | Must | ✅ Concluído — `docs/scrum/sprint-3/cerimonias.md` |
| 15 | Atualizar README com links de Trello, Figma e cerimônias | Must | ✅ Concluído |
| 25 | Design system documentado (pedido do professor) | Must | ✅ Concluído — `docs/design-system.md` |
| 26 | Documentação arquitetural ligando os 3 repositórios | Must | ✅ Concluído — `docs/arquitetura.md` |

## Backlog futuro (não priorizado para desenvolvimento imediato)

| # | Item | Valor | Observação |
|---|---|---|---|
| 16 | Rotação/expiração automática de token de estação | Should | Hoje só rotação manual via `/token/regenerate` |
| 17 | Rate limiting de login | Should | Fora de escopo de E4 |
| 18 | Tela de "esqueci minha senha" | Could | Fora de escopo de E4 |
| 19 | Painel de super-admin multi-empresa (gestão entre empresas, billing) | Won't (por ora) | Registrado em `2026-08-29-multi-tenant-design.md` §9 — não foi pedido |
| 20 | ~~Hot-reload de zonas (UI → pipeline rodando, sem restart)~~ | Should | ✅ Resolvido — `ZoneHotReloader` implementado em `zrb`/`zrc` (2026-09-05), trazido para dentro da entrega por pedido explícito |
| 21 | Refilmar cenário de ergonomia de perfil (subir acurácia de 0,78) | Must (Fase 4) | Limitação 2D documentada em `apresentacao-esqueleto.md` |
| 22 | Filmar cenário de zona crítica + gerar `zones.json` | Should (Fase 4) | Código pronto, falta footage |
| 23 | Deploy na Metaindústria com ≥3 câmeras reais | Must (Fase 4) | Objetivo final do produto |
| 27 | Rotação de câmera personalizável (backend) | Should | Achado da review da SPI (2026-09-08), sem spec — card em `Product Backlog` no Trello, repositório `cypher` |
| 28 | REBA com câmera angulada + zona restringindo pipeline + rotação (capture) | Should | Achado da review da SPI (2026-09-08), sem spec — card em `Product Backlog` no Trello, repositório `cypher-capture` |

---

**Notas de priorização:**
- Itens 6–11 e 24 (roteiro original E1–E6 + orquestrador) estão todos concluídos — ver coluna Status na tabela acima, cada um com link de PR mergeado.
- Itens 16–18 permanecem deliberadamente adiados, cada um com nota de "fora de escopo" no spec da entrega correspondente.
- Itens 21–23 pertencem à Fase 4 (validação industrial), fora do escopo de desenvolvimento imediato, mantidos para não perder o objetivo final de produto.
- Item 20 (hot-reload de zonas) foi resolvido durante a entrega de zonas de risco (`zrb`/`zrc`, `ZoneHotReloader`) — ver nota abaixo.
- Itens 27–28: achados da review da SPI (2026-09-08) sem spec ainda — cards em `Product Backlog` no Trello.
