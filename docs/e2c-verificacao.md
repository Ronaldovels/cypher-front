# E2-C — Verificação de ponta a ponta

Executado em 2026-08-20, na branch `e2c-front-cadastro` (worktree isolado, partindo de `dev`).

## O que foi verificado

### 1. Modo de exemplo, sem backend (plano Task 6, Step 1)

Ligado temporariamente `useMockData: true` em `src/environments/environment.development.ts`, subido `npm start`, e dirigido um navegador Chrome real (headless, via `playwright-core` driver, instalado apenas temporariamente e removido ao final — não ficou no `package.json`) contra `http://localhost:4200/config/estacoes`.

Confirmado, com asserts sobre o DOM real (não apenas leitura de tela):

- Página carrega com `app-stations-config` renderizado.
- Cadastrar uma estação nova funciona: código `EST-5586`, nome e setor preenchidos, submit, e a estação aparece na lista "Cadastrado" logo em seguida.
- Cadastrar a mesma estação de novo mostra a mensagem exata que o interceptor de exemplo devolve: **"Estacao ja cadastrada: EST-5586"** — confirma que o erro do servidor (409) chega até a tela, sem virar mensagem genérica.
- Desativar a estação move ela para o estado inativo: a query `.estacao:not(.inativa)` para o código deixa de casar e `.estacao.inativa` passa a casar — confirma o soft delete refletindo na tela sem reload manual.
- Console do navegador sem nenhum erro JS durante todo o fluxo.

**Divergência do que o plano pedia, registrada honestamente:** o Step 1 do plano também pede confirmar que "câmera de estação inexistente mostra 422". Isso não é alcançável pela UI real: o `<select>` de estação da câmera só lista estações ativas existentes (por design, `@for (e of estacoes(); track e.id) { @if (e.ativa) { ... } }` em `stations-config.component.html`), e a validação client-side (`validarEstacao`) já bloqueia o envio com estação vazia antes de qualquer chamada à API. O caminho 422 (estação inexistente) só é alcançável programaticamente — e está coberto assim em dois níveis: o teste do interceptor (`recusa camera de estacao inexistente com 422`, Task 2) e o teste do `CatalogService` (Task 1). Não é um defeito da tela; é a tela fazendo seu trabalho de impedir o estado inválido antes de chegar à rede. O que a verificação manual confirmou em troca foi a validação client-side equivalente: submeter a câmera sem escolher estação mostra "Escolha a estação que esta câmera cobre." antes de qualquer requisição.

Após a verificação, `useMockData` foi **desligado de volta** para `false` — confirmado via `git diff` que não sobrou alteração nesse arquivo.

### 2–6. Ciclo completo com backend real e pipeline (plano Task 6, Steps 2–6)

**Não executado nesta sessão.** Investigação do repositório `/home/asaas/projects/cypher` (backend Spring Boot) mostrou que o último commit mergeado é `a58590b` (E1-A — incidentes), e que `CatalogController` existe mas **não tem** nenhum `@PostMapping`/`@PutMapping`/`@DeleteMapping` — ou seja, os endpoints de escrita de estações/câmeras que a E2-A (plano de backend) especifica ainda não foram implementados/mergeados no momento desta verificação. Sem esses endpoints, os Steps 2–6 (cadastrar pela interface e ver o efeito no heatmap, fechar o ciclo com o pipeline `cypher-capture`, soft delete de ponta a ponta, reinício da API) não são executáveis: o front já está pronto para eles (é exatamente o que as Tasks 1–5 deste plano implementaram e testaram), mas o lado do backend é um pré-requisito explícito do próprio plano ("Depende de: E2-A Tasks 1–7") que ainda não está satisfeito neste ambiente.

Este documento registra o que foi observado — não o certifica como completo. Quando a E2-A estiver mergeada em `cypher`, os Steps 2–6 devem ser re-executados com o backend e o pipeline `cypher-capture` de fato no ar, seguindo literalmente o texto do plano.

## Resumo

| Step do plano | Resultado |
|---|---|
| 1 — modo de exemplo sem backend | ✅ Verificado via navegador real (Playwright/Chrome), incluindo 409 com mensagem do servidor e soft delete refletido na tela. 422 de câmera-sem-estação confirmado nos testes automatizados (não alcançável pela UI, por design). |
| 2 — subir os três lados | ❌ Não executado — backend (`cypher`) ainda não tem os endpoints de escrita da E2-A. |
| 3 — cadastrar e ver efeito no heatmap | ❌ Bloqueado pelo Step 2. |
| 4 — fechar o ciclo com o pipeline | ❌ Bloqueado pelo Step 2. |
| 5 — soft delete de ponta a ponta | ❌ Bloqueado pelo Step 2. |
| 6 — reinício da API | ❌ Bloqueado pelo Step 2. |

Suíte automatizada do front nesta branch: **114/114 testes passando** (Tasks 1–5), build de produção (`npm run build`) sem erros.
