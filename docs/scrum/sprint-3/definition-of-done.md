# Definition of Done (DoD) — Sprint 3

Um item da Sprint Backlog só é considerado **Concluído** quando todas as condições abaixo, aplicáveis ao tipo de item, estão satisfeitas.

## Para telas/fluxos do protótipo

Decisão do grupo (2026-09-14): a partir da E4 o projeto passou de prototipação (Figma) para implementação — telas novas nascem direto como código. Os critérios abaixo se aplicam à implementação real, não a um artboard novo no Figma:

- [ ] A tela existe implementada e rodando (`src/app/app.routes.ts` + componente), em alta fidelidade (não mockup).
- [ ] Usa a mesma linha de design (paleta, tipografia, componentes) das telas já existentes — nenhuma tela nova introduz um padrão visual próprio, salvo exceção documentada.
- [ ] A mudança está justificada por escrito (`docs/fluxo-de-telas.md` e/ou README) — feedback recebido, requisito não coberto anteriormente, ou melhoria de usabilidade; não é uma tela "porque sim".
- [ ] A tela foi demonstrada rodando no projeto local (não apenas descrita) antes de ser dada como concluída.

## Para artefatos Scrum (Backlog, cerimônias)

- [ ] O documento reflete o trabalho real do grupo — nenhuma tarefa genérica sem contexto do projeto Cypher/Metaindústria.
- [ ] Datas são absolutas (não "ontem"/"semana passada") para permanecerem interpretáveis depois.
- [ ] Responsável e status de cada card do Trello estão preenchidos (não fica em branco no board real, mesmo que o markdown de referência use placeholder).

## Para o board Trello

- [ ] As 5 colunas existem: Product Backlog, Sprint Backlog, Em andamento, Em revisão, Concluído.
- [ ] Todas as tarefas da Sprint aparecem como card, com responsável.
- [ ] O board tem permissão de visualização pública (link compartilhável testado em aba anônima antes da entrega).

## Para o README

- [ ] Contém o link do Trello, o link do protótipo Figma (telas originais) e do fluxo de telas implementadas (evolução), e o caminho/link do documento de cerimônias.
- [ ] Nenhum link aponta para um placeholder não resolvido na versão final entregue.

## Geral (todo item)

- [ ] Revisado por pelo menos uma pessoa do grupo além de quem produziu.
- [ ] Commitado no repositório (para os artefatos que vivem em `docs/`), com mensagem de commit descrevendo o que mudou e por quê.
