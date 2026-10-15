# Dailies — Sprint 4

Uma linha por integrante por daily. Registrar só **o que mudou, a decisão tomada e o bloqueio**. Detalhe técnico vai no card do Trello ou no PR.

**Formato e frequência das dailies:** a registrar pelo time. O que o grupo conversou em cada daily não está em nenhum registro, então a tabela de dailies no fim do arquivo fica para o time preencher.

## Marcos da Sprint

| Data | Marco | Fonte |
|---|---|---|
| 2026-09-23 | Apresentação final à SPI Integração, abertura da Sprint 4 | Informado pelo time. O que foi apresentado em cada bloco e o feedback recebido ficam para o time registrar em [review.md](review.md) |

## Andamento por tarefa, comprovado pelo git

Cada linha é uma tarefa entregue, com a data e o autor do commit. A coluna de autor é a conta que commitou; o responsável pelo card consta como coautor (`Co-authored-by`) no commit, pois o trabalho foi feito presencialmente em grupo. A data é a do commit; o que foi falado entre as pessoas não está aqui.

| Data | Autor do commit | Tarefa | Repositório (commit) | Card |
|---|---|---|---|---|
| 2026-09-22 | Lucas | Preparar a empresa `demo` para a banca final: script de preparação, runbook e seed | backend `5903e15`, `b1e2d27`; front `fd343a5` | S4-05 |
| 2026-09-22 | Lucas | Contrato de EPI só com os 6 EPIs que o modelo detecta, no backend, no capture e no front | backend `13ae2f4`; capture `067e498`, `e51fa4b`; front `b954bfa` | S4-05 |
| 2026-09-22 | Lucas | Modelo padrão passa a ser `exp-m4-1709-v4`; golden do fluxo de EPI com os pesos reais | capture `8a51552`, `e51fa4b`, `81cbe62` | S4-06 |
| 2026-09-22 | Ronaldo | Tracker e pipeline liberam memória e estado de tracks encerrados; fechamento só enviado quando a janela de merge vence | capture `036450a`, `3ab771a`, `c5c3990` | pós-Sprint 3 |
| 2026-09-22 | Ronaldo | Sink para de retentar incidente recusado pelo backend (4xx) | capture `37b4548`, `85244c2` | pós-Sprint 3 |
| 2026-09-22 | Ronaldo | Escalonamento por EPI exigido na zona (nome canônico) | capture `ff9bed2` | pós-Sprint 3 |
| 2026-09-22 | Ronaldo | Webhook com timeout não trava o agendador; `ClosedReason` aceita `RENOTIFIED` | backend `aa9b83e`, `9132371` | pós-Sprint 3 |
| 2026-09-22 | Ronaldo | Rotas `/incidentes` e `/estacoes` exigem sessão; troca de sessão limpa os stores | front `ea6c393`, `b5622e2` | pós-Sprint 3 |
| 2026-09-22 | Lucas | Limpeza de estado na troca de sessão (credenciais MCP, senha do gestor mestre), login volta ao endereço barrado, runbook MCP | front `ede8ade`, `56687f9`, `b6f2d09`, `3e47166`, `0e8cf4e` | pós-Sprint 3 |
| 2026-09-22 | Lucas | Fechamento pendente do incidente sai sem frame e no SIGTERM; renotificação; 404 retentável no sink | capture `e27b092`, `fc9deec`, `1890a0c`, `ecc0561` | pós-Sprint 3 |
| 2026-09-29 | Lucas | Vídeos motion do pitch (demo ao vivo, tour pelas telas, apresentação completa) nos 3 READMEs | front `66e4022`, `86f571e`, `1c82b89`; capture `7e52a56`, `1ae1689`, `0fafa1f`; backend `bd2fde0`, `5195edb`, `4e1f4c3` | S4-01 |
| 2026-10-15 | Lucas | Script de demo portátil: acha os repositórios vizinhos, usa CPU quando não há GPU e o vídeo de demonstração como fonte padrão | front `43a0c42`, `13dbe60`, `6fb8846`; capture e backend com os mesmos commits | S4-03, S4-04 |
| 2026-10-15 | Lucas | Vídeo de validação gravado na câmera e clipe do cenário 4 versionados para rodar sem webcam | capture `b997d97`, `312f50b` | S4-04 |
| 2026-10-15 | Lucas | README do backend e do capture (pré-requisitos, testes, execução sem webcam, GPU ou chave de LLM) | backend `6859767`; capture `38bbb24` | S4-02 |
| 2026-10-15 | Lucas | Métricas finais do modelo com a fonte de cada número | capture `38bbb24` | S4-06 |
| 2026-10-15 | Lucas | README âncora do front | front `638815b` | S4-10 |
| 2026-10-15 | Lucas | Arquitetura final com stack e decisões por Sprint | front `db54055` | S4-07 |
| 2026-10-15 | Lucas | Manual de uso com 16 prints | front `ff06100` | S4-08 |
| 2026-10-15 | Lucas | Fluxo de telas atualizado, contagem 7 | front `e19ae35` | S4-09 |
| 2026-10-15 | Lucas | Matriz de rastreabilidade | front `e5e0289` | S4-11 |
| 2026-10-15 | Lucas | Origem simulada dos dados no runbook da empresa `demo` | front `1aee0e0` | S4-05 |
| 2026-10-15 | Lucas | Artefatos Scrum da Sprint 4 | front `d1ea5bd`, `8718613` | S4-13 |

## Daily (preencher a cada encontro)

| Data | Quem | Fez / vai fazer (card) | Decisão | Bloqueio |
|---|---|---|---|---|
| | | | | |
