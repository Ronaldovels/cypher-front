# Product Backlog — Cypher (Challenge SPI/FIAP)

**Atualizado em:** 2026-09-01
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

## Especificado e planejado nesta Sprint (2026-08-25 a 2026-09-01)

Trabalho real de refinamento de backlog: cada item abaixo tem um documento de design (`docs/superpowers/specs/`) e um plano de implementação TDD tarefa-a-tarefa (`docs/superpowers/plans/`) — nenhum é ainda código mergeado, mas todos saíram de "ideia" para "pronto para desenvolver" nesta janela. Ordem de dependência registrada em `docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md`.

| # | Item | Valor | Spec | Plano | Status |
|---|---|---|---|---|---|
| 6 | Multi-tenant (Empresa) — pré-requisito das próximas 4 entregas | Must | `2026-08-29-multi-tenant-design.md` | `plans/multi-tenant/` | 📝 Pronto para dev |
| 7 | Cadastro de webhook pela interface (hoje só via `application.yaml`+restart) | Should | `2026-08-29-cadastro-webhook-design.md` | `plans/webhook/` | 📝 Pronto para dev |
| 8 | Zonas de risco configuráveis pela interface | Should | `2026-08-29-zonas-de-risco-design.md` | `plans/zonas-de-risco/` | 📝 Pronto para dev |
| 9 | Gamificação por equipe (placar, metas, sequência) | Should | `2026-08-29-gamificacao-e5-design.md` | `plans/e5-gamificacao/` | ⛔ Planejado, bloqueado (gating de calibração no `cypher-capture`, sem data) |
| 10 | Relatórios e exportação (CSV/PDF) | Could | `2026-08-29-relatorios-e6-design.md` | `plans/e6-relatorios/` | 📝 Parcialmente liberado (CSV de incidentes já pode ser feito; resto depende do item 9) |
| 11 | Análise de risco com LLM multimodal (Claude/Gemini) no detalhe do incidente | Must (prazo externo 21/09) | `2026-09-01-analise-llm-multimodal-design.md` | `plans/analise-llm/` | 📝 Pronto para dev |

## Sprint 3 (em andamento — gestão ágil)

| # | Item | Valor | Status |
|---|---|---|---|
| 12 | Evoluir protótipo Figma com ≥2 telas/fluxos novos (login, cadastro de equipes) | Must | 🔄 Sprint Backlog |
| 13 | Configurar e compartilhar board Trello (Product Backlog, Sprint Backlog, cards) | Must | 🔄 Sprint Backlog |
| 14 | Documentar cerimônias Scrum (Planning, Daily, Review) da Sprint 3 | Must | 🔄 Sprint Backlog |
| 15 | Atualizar README com links de Trello, Figma e cerimônias | Must | 🔄 Sprint Backlog |

## Backlog futuro (não priorizado para desenvolvimento imediato)

| # | Item | Valor | Observação |
|---|---|---|---|
| 16 | Rotação/expiração automática de token de estação | Should | Hoje só rotação manual via `/token/regenerate` |
| 17 | Rate limiting de login | Should | Fora de escopo de E4 |
| 18 | Tela de "esqueci minha senha" | Could | Fora de escopo de E4 |
| 19 | Painel de super-admin multi-empresa (gestão entre empresas, billing) | Won't (por ora) | Registrado em `2026-08-29-multi-tenant-design.md` §9 — não foi pedido |
| 20 | Hot-reload de zonas (UI → pipeline rodando, sem restart) | Should | Registrado em `2026-08-29-zonas-de-risco-design.md` §7 — sem spec própria ainda |
| 21 | Refilmar cenário de ergonomia de perfil (subir acurácia de 0,78) | Must (Fase 4) | Limitação 2D documentada em `apresentacao-esqueleto.md` |
| 22 | Filmar cenário de zona crítica + gerar `zones.json` | Should (Fase 4) | Código pronto, falta footage |
| 23 | Deploy na Metaindústria com ≥3 câmeras reais | Must (Fase 4) | Objetivo final do produto |

---

**Notas de priorização:**
- Itens 6–11 substituem os antigos itens 10–11 deste documento ("cadastro de webhook" e "multi-tenant"), que estavam registrados como adiados/"nunca virou spec" — ambos agora têm spec e plano completos, puxados para o topo do backlog.
- Item 9 é o único bloqueado por fator externo ao controle do time (calibração de modelo no `cypher-capture`); os demais itens 6–8 e 10–11 não têm bloqueio e podem entrar em desenvolvimento a qualquer momento, na ordem do roteiro.
- Itens 16–18 permanecem deliberadamente adiados, cada um com nota de "fora de escopo" no spec da entrega correspondente.
- Itens 21–23 pertencem à Fase 4 (validação industrial), fora do escopo de desenvolvimento imediato, mantidos para não perder o objetivo final de produto.
