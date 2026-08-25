# Product Backlog — Cypher (Challenge SPI/FIAP)

**Atualizado em:** 2026-08-25
**Fonte:** reconstruído a partir do histórico real de commits/specs dos três repositórios (`cypher`, `cypher-capture`, `cypher-front`) — não é um backlog fictício, reflete o que de fato foi priorizado e entregue nas Entregas E1–E4.

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

## Sprint 3 (em andamento)

| # | Item | Valor | Status |
|---|---|---|---|
| 6 | Evoluir protótipo Figma com ≥2 telas/fluxos novos (login, cadastro de equipes) | Must | 🔄 Sprint Backlog |
| 7 | Configurar e compartilhar board Trello (Product Backlog, Sprint Backlog, cards) | Must | 🔄 Sprint Backlog |
| 8 | Documentar cerimônias Scrum (Planning, Daily, Review) da Sprint 3 | Must | 🔄 Sprint Backlog |
| 9 | Atualizar README com links de Trello, Figma e cerimônias | Must | 🔄 Sprint Backlog |

## Backlog futuro (não priorizado para Sprint 3)

| # | Item | Valor | Observação |
|---|---|---|---|
| 10 | Interface de cadastro de webhook (hoje só via `application.yaml` + restart) | Should | Registrado em E1 §9 — sem UI, decisão consciente de adiar |
| 11 | Multi-empresa (multi-tenant) | Won't (por ora) | Registrado em E4 §6 — nunca virou spec; sistema é single-tenant por decisão consciente |
| 12 | Rotação/expiração automática de token de estação | Should | Hoje só rotação manual via `/token/regenerate` |
| 13 | Rate limiting de login | Should | Fora de escopo de E4 |
| 14 | Tela de "esqueci minha senha" | Could | Fora de escopo de E4 |
| 15 | Refilmar cenário de ergonomia de perfil (subir acurácia de 0,78) | Must (Fase 4) | Limitação 2D documentada em `apresentacao-esqueleto.md` |
| 16 | Filmar cenário de zona crítica + gerar `zones.json` | Should (Fase 4) | Código pronto, falta footage |
| 17 | Deploy na Metaindústria com ≥3 câmeras reais | Must (Fase 4) | Objetivo final do produto |

---

**Notas de priorização:**
- Itens 10–14 foram deliberadamente adiados (não esquecidos) — cada um tem uma nota de "fora de escopo" no spec da entrega correspondente, com justificativa registrada.
- Itens 15–17 pertencem à Fase 4 (validação industrial), fora do escopo desta Sprint 3, mas mantidos no backlog para não perder o objetivo final de produto.
