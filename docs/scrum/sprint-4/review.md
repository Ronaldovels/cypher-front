# Ata da Sprint Review final — Sprint 4

**Data e participantes:** a registrar pelo time. Integrantes: Felipe · Lucas · Monique · Rafael · Ronaldo · Tiago
**Convidados:** a registrar, se houver

## Sprint Goal atingido?

Parcialmente. O sistema instala e roda seguindo só o README, e a documentação está consolidada. Faltam o vídeo de pitch gravado pelos integrantes e publicado no YouTube, a atualização do board Trello e o preenchimento, pelo time, das informações que só o time tem (datas, presença, retro individual).

## Entregue

| ID | Entregável | Evidência |
|---|---|---|
| S4-01 | Vídeos motion (demo ao vivo, tour, completo) | [`docs/apresentacao/videos/`](../../apresentacao/videos/README.md), commits de 2026-09-29 |
| S4-02 | READMEs técnicos dos 3 repositórios, sem template | `README.md` de cada repositório; commits de 2026-10-15 |
| S4-03 | Teste de instalação limpa | Executado em 2026-10-15 em cópia limpa dos 3 repositórios, em CPU, sem webcam e sem chave de LLM: backend, seed, front e captura subiram, e um incidente novo (ergonomia) chegou ao backend. A repetição por quem não escreveu as instruções continua pendente |
| S4-04 | Correções de instalação | `subir-empresa-demo.sh` acha os repositórios vizinhos e cai para CPU; vídeos de demonstração versionados em `cypher-capture/data/demo/`; `--device cpu` e o comportamento sem chave de LLM documentados |
| S4-05 | Dados simulados na empresa `demo` | [`empresa-demo-runbook.md`](../../empresa-demo-runbook.md); seed do backend com histórico de 14 dias |
| S4-06 | Métricas do modelo e do dataset | [`metricas-finais.md`](https://github.com/lucvs07/cypher-capture/blob/main/docs/metricas-finais.md) e logs em `docs/evidencias-sprint4/logs/` |
| S4-07 | Arquitetura final | [`arquitetura.md`](../../arquitetura.md) |
| S4-08 | Manual de uso com prints | [`manual-de-uso.md`](../../manual-de-uso.md) |
| S4-09 | Fluxo de telas revisado, contagem alinhada | [`fluxo-de-telas.md`](../../fluxo-de-telas.md) e README |
| S4-10 | README âncora | [`README.md`](../../../README.md) |
| S4-11 | Matriz de rastreabilidade | [`rastreabilidade.md`](rastreabilidade.md) |

Responsável de cada card: ver [sprint-backlog.md](sprint-backlog.md). A autoria no git mostra quem commitou cada entregável.

## Não concluído

| ID | Item | Motivo | Destino |
|---|---|---|---|
| S4-12 | Vídeo de pitch narrado pelos 6 integrantes, até 5 min, no YouTube não listado | Depende da gravação dos integrantes | Prazo 2026-10-23 |
| S4-13 | Retrospectiva individual e informações da reunião | Só o time tem | Preencher nesta ata e em [retrospectiva.md](retrospectiva.md) |
| S4-14 | Link do vídeo no `.txt` de entrega | Depende do S4-12 | Preencher e conferir em aba anônima |
| — | Atualizar o board Trello com o Sprint Backlog final e esta ata | Não feito | Ação do time |
| — | Links do GitHub abrirem sem login | Em teste de 2026-10-15, os 3 repositórios responderam 404 sem login (privados) | Tornar públicos ou dar acesso aos avaliadores antes de entregar |

## Demonstração

- Apresentação final à SPI Integração em 2026-09-23 (informada pelo time). Quem apresentou, quais fluxos foram mostrados e o feedback recebido: a registrar pelo time.
- Quem demonstrou e quais fluxos foram mostrados nesta Review: a registrar pelo time.
- Instalação limpa seguindo o README: passou em 2026-10-15 (ver S4-03 acima).

## Feedback recebido

| De quem | Feedback | Decisão do time |
|---|---|---|
| Professor (Sprint 3) | Contagem de telas inconsistente: ele contou 7 e o README dizia 6 | README, fluxo de telas e manual usam 7 |
| Professor (Sprint 3) | README com resquícios de template (`<repo-url>`, checklist sem marcar, branches que o time não usa) | Removidos no README final |
| Professor (Sprint 3) | Divisão de trabalho pouco visível | Cada card tem responsável e revisor no Trello e em [sprint-backlog.md](sprint-backlog.md) |

Feedback desta Review: a registrar pelo time.

## Evolução do projeto (S1 → S4)

| Sprint | Entrega principal | Link |
|---|---|---|
| 1 e 2 | Protótipo de alta fidelidade no Figma (onboarding, dashboard e heatmap) | [`fluxo-de-telas.md`](../../fluxo-de-telas.md) |
| 3 | Implementação em Angular com 7 telas/fluxos novos, multi-tenant, notificações e gamificação | `docs/scrum/sprint-3/` |
| 4 | Instalação sem webcam, GPU ou chave de LLM; documentação final consolidada; rastreabilidade | `docs/scrum/sprint-4/` |
