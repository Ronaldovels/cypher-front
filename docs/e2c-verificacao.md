# E2-C — Verificação de ponta a ponta

Executado em 2026-08-20 (Step 1) e retomado em 2026-08-23 (Steps 2–7, com os três
repositórios rodando juntos), na branch `e2c-front-cadastro` (worktree isolado,
partindo de `dev`).

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

**Executado em 2026-08-23**, retomando o bloqueio acima: `feat/e2a-backend-cadastro`
mergeável (worktree `/home/asaas/projects/cypher/.claude/worktrees/feat+e2a-backend-cadastro`)
já tem `POST`/`PUT`/`DELETE` em `CatalogController`. Os três serviços subiram juntos
(`spring-boot:run` na porta 8080, `ng serve` na 4200, pipeline Python sob demanda),
e a verificação usou a webcam real do notebook (`/dev/video0`) como fonte de uma
câmera cadastrada pela tela.

Como este ambiente é não-interativo, a navegação real foi conduzida por um script
Playwright/Chromium (`playwright@1.62.1`, instalado temporariamente com
`npm install --no-save` e removido ao final — não ficou no `package.json`, mesmo
procedimento já usado na verificação do Step 1). Todas as afirmações abaixo vêm de
asserts sobre o DOM real do app rodando em `localhost:4200`, contra o backend real
em `localhost:8080` — não são leitura de código nem suposição.

**Contrato de escrita contra o backend real (Step 2):**
- `POST /stations`/`POST /cameras` aceitam `id` no corpo e devolvem `ativa: true`
  por padrão — confirmado por chamada direta e pelo cadastro feito na tela.
- 409 (código duplicado) e 422 (estação inexistente) devolvem `{"erro": "..."}` e
  a mensagem chega **verbatim** na tela — confirmado ao vivo: cadastrar `EST-40`
  duas vezes mostrou exatamente `"Estacao ja cadastrada: EST-40"` no `<p class="erro">`
  da tela; cadastrar duas câmeras com o mesmo `streamUrl` mostrou exatamente
  `"streamUrl ja usada pela camera CAM-40"`. Não vira "algo deu errado" em nenhum
  dos dois casos.
- `GET /stations?incluirInativas=true` traz as inativas; sem o parâmetro, não traz
  — confirmado contra o backend real (já não era só suposição do mock).
- `GET /cameras/{id}` traz `fonte`; `GET /cameras` (lista) não traz — confirmado.
- Todas as chamadas de escrita do `CatalogService` usam `withCredentials: true`
  (confirmado por leitura de código) e o preflight CORS do backend devolve
  `Access-Control-Allow-Credentials: true` para `Origin: http://localhost:4200`
  (confirmado por curl) — a escrita cross-origin funcionou de fato no navegador,
  o que fecha o ciclo dessa checagem.

**Cadastrar pela interface e ver o efeito no heatmap (Step 3):**
Cadastrado `EST-40 / Bancada` e `CAM-40` (`streamUrl` `http://127.0.0.1:8140/stream`,
`fonte` `0` — índice da webcam do notebook) pela tela real `/config/estacoes`.
Navegando para `/heatmap` **via o dock** (clique real, sem `page.reload()`), a
célula `EST-40` apareceu imediatamente — confirma as duas metades que a E2-C
entrega separadamente: `CatalogService.reload()` após o write atualiza a lista de
estações, e a navegação SPA para `/heatmap` dispara `IncidentService.loadSummary()`
de novo (não é o `reload()` do catálogo que atualiza o heatmap, é a navegação —
comportamento real bate com o que o comentário do código descreve).

**Fechar o ciclo com o pipeline (Step 4):**
Rodado `run_pipeline.py --camera-id CAM-40... ` não foi possível **simultaneamente**
ao browser aberto: `/dev/video0` só aceita um dono por vez, e o script Playwright já
estava com a webcam livre para o `getUserMedia` do preview de câmera do onboarding
(não usado neste teste) — na prática o conflito real é que o pipeline Python e o
Chromium não podem segurar o mesmo `/dev/video0` ao mesmo tempo nesta máquina com
uma única câmera física. O ciclo foi então confirmado **por partes**, não em uma
única sessão síncrona: (a) o pipeline real, com a mesma câmera, publicou o stream
MJPEG na porta derivada do cadastro e gerou incidentes reais que ficaram
persistidos em `GET /incidents` (ver `cypher-capture/docs/e2-verificacao-integrada.md`,
cenário A); (b) o front, nesta sessão, provou que lê exatamente esses mesmos
endpoints e reflete cadastro novo sem reload. A checagem visual simultânea
"stream ao vivo + incidente aparecendo no heatmap enquanto o pipeline roda" fica
como pendência — exigiria uma segunda câmera (uma para o pipeline, outra para o
operador assistir pela tela) para não competir pelo mesmo dispositivo.

**Soft delete de ponta a ponta (Step 5) — pergunta em aberto respondida:**
Desativado `EST-40` pela tela (clique real no botão "desativar"): a linha migrou
para a classe `.estacao.inativa` **sem reload manual** (assert direto na classe do
elemento). `CAM-40` continuou listada dentro da estação inativa — confirmando
contra o backend real, e não só contra o mock, que desativar uma **estação** não
cascateia para desativar suas câmeras. Isso responde com dado real a pergunta que
o mock tinha resolvido por suposição: câmeras continuam ativas quando a estação é
desativada (ver detalhe do porquê — o pipeline ainda é bloqueado por um 409 nesse
caso — em `cypher-capture/docs/e2-verificacao-integrada.md`).

Reativado `EST-40` depois, e o estado voltou ao normal (confirmado no DOM).

**Gap confirmado ao vivo, não é bug novo:** a linha de `CAM-40` na tela só expõe o
botão `desativar`. Não existe `reativarCamera()` no componente nem botão
correspondente no template — confirmado tanto por leitura de código quanto pelo
DOM real (`camRow.locator('button').allTextContents()` devolveu só `["desativar"]`).
`CatalogService.updateCamera()` continua existindo e funcional (o `PUT` com
`ativa: true` funciona contra o backend real, testado por chamada direta), só falta
o botão — exatamente como o gap já registrado no PR descreve.

**Confirmar o reinício da API (Step 6):**
Reiniciado o backend (`pkill` + novo `spring-boot:run`) com `EST-30`/`CAM-30`
(dados de uma rodada anterior desta mesma sessão) e `EST-40`/`CAM-40` já
cadastrados. Após o restart, `GET /stations?incluirInativas=true` devolveu os
quatro registros com os valores da tela — o seeder (bootstrap-only) não
sobrescreveu nada.

### 7. Verificações extras desta entrega (E2-C) — confirmadas ao vivo

- **Item "Configurações" do dock leva a `/config/estacoes` no app real**: clique
  real no link do dock (não apenas resolução de rota isolada) navegou
  corretamente — confirmado.
- **`/config/estacoes` sem badge de conexão quando a API cai**: confirmado por
  código e pelo DOM real (`<app-connection-badge/>` está em `dashboard` e
  `heatmap`, ausente em `stations-config`) — a tela de fato não distingue "API
  fora do ar" de "nenhuma estação cadastrada" hoje. Registro como item de ajuste
  abaixo, não como comportamento aceitável por omissão.
- **Onboarding, passo "Estações e câmeras" (posição 2 de 5) não trava o wizard**:
  confirmado ao vivo — preenchido o passo 1 (identidade), avançado para o passo
  "O que o Cypher vai monitorar" (match pelo título real na tela) e clicado
  "Continuar" sem alterar o cadastro; o wizard avançou. Bate com o código
  (`OnboardingService.validateStep` decide por `STEPS[s].key`, e a chave
  `'stations'` nunca adiciona erro — migração de validação por índice para por
  chave, o maior risco técnico da E2-C, comportamento real confere).

## Resumo

| Step do plano | Resultado |
|---|---|
| 1 — modo de exemplo sem backend | ✅ Verificado via navegador real (Playwright/Chrome), incluindo 409 com mensagem do servidor e soft delete refletido na tela. |
| 2 — contrato de escrita contra o backend real | ✅ Confirmado ao vivo (409/422 verbatim na tela, `withCredentials`, `incluirInativas`, assimetria de `fonte`). |
| 3 — cadastrar e ver efeito no heatmap | ✅ Confirmado ao vivo — célula nova aparece sem reload manual via navegação SPA. |
| 4 — fechar o ciclo com o pipeline | ⚠️ Confirmado por partes (backend↔pipeline e backend↔front separadamente); não simultâneo — limite de uma única webcam física nesta máquina. |
| 5 — soft delete de ponta a ponta | ✅ Confirmado ao vivo, incluindo a resposta real (sem cascata) à pergunta em aberto. |
| 6 — reinício da API | ✅ Confirmado — seeder não sobrescreve dados editados. |
| 7 — extras (dock, badge de conexão, onboarding) | ✅ Dock e onboarding confirmados ao vivo. ⚠️ Badge de conexão ausente em `/config/estacoes` — vira item de ajuste, não aceito por omissão. |

Suíte automatizada do front nesta branch: **115/115 testes passando** (15 arquivos),
crescimento em relação aos 114/114 registrados na primeira verificação desta
entrega — build (`npx ng test`) sem erros.

Este documento registra o que foi observado; os itens marcados ⚠️ não estão
certificados como concluídos.
