# Ata do Sprint Planning — Sprint 4

**Janela da Sprint:** 2026-09-23 a 2026-10-23
**Data, duração e formato da reunião:** a registrar pelo time (o git e o Trello não guardam isso)
**Participantes:** a registrar pelo time. Integrantes: Felipe · Lucas · Monique · Rafael · Ronaldo · Tiago

## Contexto de entrada

- Sprint 3 fechada em 2026-09-14. Entre 2026-09-15 e 2026-09-22 entraram no produto: REBA com câmera angulada (capture #12, backend #14, front #15), checklist global de EPI, servidor MCP (backend #15, front #16), fixes de tracker, sink e webhook (capture #13 a #17, backend #16 e #17) e correções de sessão e guards (front #17 e #18). Os vídeos motion foram gravados em 2026-09-29.
- Autoria até aqui, segundo o git: `cypher-front` 297 commits do Lucas e 6 do Ronaldo; `cypher` 184 e 3; `cypher-capture` 133 do Lucas, 6 do Ronaldo e 5 do Felipe. A concentração do desenvolvimento em uma pessoa é o dado que a Sprint 4 precisa mudar.
- Feedback da Sprint 3, como foi registrado nos cards ([`cards-trello-sprint4.md`](../../../../cards-trello-sprint4.md)): contagem de telas inconsistente (o professor contou 7 e o README dizia 6), README com resquícios de template, e divisão de trabalho pouco visível no Trello e nas atas.

## Sprint Goal

Ver [README.md](README.md#sprint-goal).

## Decisões registradas

| # | Decisão | Onde está registrada |
|---|---|---|
| 1 | Lucas atua como PO, Scrum Master e revisor; os entregáveis ficam com os demais integrantes | [README da Sprint](README.md#regras-de-registro-resposta-ao-feedback-da-sprint-3) |
| 2 | Cada entregável é commitado pela conta de quem o produziu, via PR revisado por outra pessoa | idem |
| 3 | Atas com no máximo 1 página, só com decisões e responsáveis | idem |
| 4 | O `cypher-cs` (app mobile da Sprint 2) fica fora da solução final | [`arquitetura.md`](../../arquitetura.md) §8 |
| 5 | A demonstração sem webcam usa um vídeo versionado em `cypher-capture/data/demo/` | [`arquitetura.md`](../../arquitetura.md) §7 |

Quem propôs cada decisão e o motivo dito na reunião ficam para o time registrar.

## Itens puxados e responsáveis

Ver [sprint-backlog.md](sprint-backlog.md). Responsáveis e revisores ainda sem nome aparecem como "a definir".

## Capacidade

A disponibilidade de cada integrante em horas por semana não consta em nenhum registro do projeto. O time deve preencher:

| Integrante | Disponibilidade na Sprint |
|---|---|
| Felipe | a registrar |
| Lucas | a registrar |
| Monique | a registrar |
| Rafael | a registrar |
| Ronaldo | a registrar |
| Tiago | a registrar |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Avaliador não consegue subir o sistema só com o README (sem webcam, sem GPU, sem chave de LLM) | Alto (40 pts) | Vídeo de demonstração versionado, script que acha os repositórios vizinhos e cai para CPU, teste de instalação limpa (S4-03) |
| Vídeo sem narração dos integrantes | Alto (30 pts) | Cada integrante grava o próprio bloco (S4-12); narração por IA não é aceita |
| Repositórios do GitHub privados quando o avaliador abre os links | Alto | Conferir em aba anônima antes de entregar; tornar públicos ou dar acesso aos avaliadores |
| Autoria concentrada em uma pessoa no histórico | Médio (evidência de Scrum) | Cada integrante commita da própria conta os cards que assumiu |

## Marcos

| Data | Marco |
|---|---|
| 2026-10-23 | Entrega do `.txt` (prazo do Challenge) |

As datas dos demais marcos (documentação congelada, gravação dos blocos do vídeo, Review final e Retrospectiva) o time define e registra aqui.
