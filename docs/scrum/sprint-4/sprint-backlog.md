# Sprint Backlog — Sprint 4

Espelho dos cards do board [Trello](https://trello.com/b/AqgHhHCP/dev4-cypher-challenge), label `SP4`. O Trello é a fonte de verdade de status; este arquivo é atualizado na Review.

**Colunas do board:** Product Backlog → Sprint Backlog → To Do → Doing → Review → Done

Responsáveis marcados com *(sugestão)* ainda precisam ser confirmados pelo time no Trello. Status refletem o que está no repositório em 2026-10-15: "Review" quer dizer pronto no repositório e aguardando a revisão do revisor do card.

| ID | Card | Responsável | Revisor | Critério de pronto | Status |
|---|---|---|---|---|---|
| S4-01 | **Apresentação: Vídeos Motions** — tour de telas · demo · fluxo completo | Lucas | [preencher] | 3 vídeos em `docs/apresentacao/videos/` e referenciados no README | Review |
| S4-02 | **Refinar Documentação dos Repositórios** — cypher-api · cypher-capture · cypher-front | Ronaldo | [preencher] | Cada README tem pré-requisitos, instalação, execução e testes, sem seções de template | Review |
| S4-03 | Teste de instalação limpa (clone dos 3 repositórios em pasta vazia, sem webcam, sem GPU, sem chave de LLM, seguindo só o README) | Felipe *(sugestão)* | Ronaldo | Relatório de tropeços registrado; cada tropeço vira card ou correção | Review |
| S4-04 | Corrigir os tropeços da instalação: caminhos do `subir-empresa-demo.sh`, vídeos de validação fora do git, `--device cpu`, comportamento sem chave de LLM | Ronaldo *(sugestão)* | Lucas | Um segundo teste de instalação limpa passa sem ajuda | Review |
| S4-05 | Dados simulados da Metaindústria na empresa `demo`: EPIs, ocorrências, alertas e histórico de colaboradores | [preencher] | Lucas | Seed documentado; dashboard, heatmap, incidentes e placar mostram histórico após o `start` | Review |
| S4-06 | Métricas finais do modelo e do dataset (mAP, precision/recall por classe, latência, FPS) no README do capture | Felipe *(sugestão)* | Tiago | Números vêm de `evidencias-sprint4/logs/`, com a fonte citada | Review |
| S4-07 | Documento de arquitetura final: visão geral, stack com justificativas, decisões por Sprint (S1→S4), gaps conhecidos | Tiago *(sugestão)* | Lucas | `docs/arquitetura.md` atualizado, incluindo MCP, REBA angulado e checklist de EPI; `cypher-cs` incluído ou excluído explicitamente | Review |
| S4-08 | Manual de uso por papel (gestor e operador/kiosk), com prints | Monique *(sugestão)* | Rafael | `docs/manual-de-uso.md` cobre todos os fluxos de `docs/fluxo-de-telas.md` | Review |
| S4-09 | Revisar `docs/fluxo-de-telas.md` (7 telas/fluxos novos, incluindo MCP) | Monique *(sugestão)* | Tiago | Contagem bate com o README e com o feedback | Review |
| S4-10 | README âncora: proposta de solução, links (3 repositórios, Figma, Trello, YouTube), resumo das entregas S1→S4, sem template do Angular CLI | Rafael *(sugestão)* | Monique | Todos os links testados em aba anônima | Review |
| S4-11 | Matriz de rastreabilidade (requisito → backlog → PR → tela → teste) | Rafael *(sugestão)* | Lucas | [rastreabilidade.md](rastreabilidade.md) cobre todos os itens *Must* do Product Backlog | Review |
| S4-12 | Vídeo de pitch narrado (≤5 min): roteiro, gravação de cada bloco, edição com os vídeos motion como apoio, upload no YouTube não listado | Todos · edição: Lucas | [preencher] | Os 6 integrantes aparecem ou falam; sem narração por IA; link testado em aba anônima | To Do |
| S4-13 | Review final + Retrospectiva | Lucas (conduz) · todos | — | [review.md](review.md) e [retrospectiva.md](retrospectiva.md) preenchidos | Doing |
| S4-14 | Arquivo de entrega `.txt` | Lucas | [preencher] | [entrega-sprint4.txt](entrega-sprint4.txt) com os 4 links testados | To Do |

## Divisão entre S4-02 e S4-10

- **S4-02 (Ronaldo):** a parte técnica dos READMEs dos 3 repositórios, ou seja, pré-requisitos, instalação, execução, testes e variáveis de ambiente.
- **S4-10 (Rafael):** o conteúdo âncora do `cypher-front`, ou seja, proposta, links, resumo por Sprint e apresentação do produto.

Os dois revisam o README do front juntos antes da Review.
