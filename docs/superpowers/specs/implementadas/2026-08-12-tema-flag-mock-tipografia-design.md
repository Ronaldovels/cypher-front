# Tema, flag de dados mockados e sistema tipográfico — Design

**Data:** 2026-08-12
**Escopo:** três ajustes ao plano `docs/superpowers/plans/e1/2026-08-10-e1c-front-dados-reais.md`, levantados na revisão dele.
**Repositório:** `/home/asaas/projects/challenge/cypher-front`

Os três são independentes entre si. Dois deles (tema e tipografia) não dependem da API e podem ser feitos antes de qualquer coisa de E1-C.

---

## 1. Tema: a engrenagem que era um sol

### O que acontece hoje

Na topbar do dashboard existe um botão que parece um toggle de tema e não é. O SVG em
[`chrome-topbar.component.ts:48-51`](../../../src/app/shared/chrome-topbar/chrome-topbar.component.ts) é um
círculo com oito raios — um sol. O elemento é um `<a routerLink="/">` com
`aria-label="Configurações"` e `title="Reabrir onboarding"`. Quem quer trocar o tema clica no sol e cai
no wizard de onboarding.

Não é bug de estado: os botões Claro/Escuro do step 1 não estão dentro de um `<form>`, então não há
reload nem reset. É bug de *affordance* — o ícone promete uma coisa e o link faz outra.

### O problema estrutural que a correção esbarra

O app não tem dono do tema. Dois serviços `providedIn: 'root'` escrevem `document.body.className` por
atribuição direta:

- [`config.service.ts:28`](../../../src/app/shared/config.service.ts) — dentro de um `effect`, guardado por `if (!cfg) return`
- [`onboarding.service.ts:28`](../../../src/app/onboarding/onboarding.service.ts) — dentro de um `effect`, sem guarda, disparando a cada mudança de `data()`

Três consequências:

1. **Atribuir `className` apaga qualquer outra classe do `<body>`.** Hoje ninguém mais escreve ali, mas é uma armadilha armada.
2. **`OnboardingService` nunca hidrata do `localStorage`.** Ele nasce com `DEFAULT_DATA` (`theme: 'dark'`) e é singleton pelo resto da sessão. O wizard reaberto mostra "Escuro" selecionado mesmo para quem salvou "Claro".
3. **O tema só persiste em `persistConfig()`**, que roda ao concluir o wizard. Trocar o tema e recarregar antes disso perde a escolha.

O item 3 é o que torna a unificação obrigatória, não opcional: um toggle no dashboard que não persiste
volta sozinho no próximo reload. E um toggle no dashboard que grava sem passar por um dono único
entra em disputa com o `effect` do wizard assim que alguém reabre o onboarding.

### Desenho

**`src/app/shared/theme.service.ts` — dono único do tema.**

```typescript
export type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme: Signal<Theme>;
  set(theme: Theme): void;
  toggle(): void;
}
```

Regras:

- Aplica o tema com `classList.remove('theme-dark', 'theme-light')` + `classList.add(...)`, nunca por
  atribuição de `className`. Outras classes no `<body>` sobrevivem.
- **Persiste em `set()`**, não ao concluir o wizard. Chave: `cypher.theme`.
- **Hidratação, nesta ordem:** `localStorage['cypher.theme']` → `localStorage['cypher.config'].theme`
  (legado, de quem concluiu o onboarding antes desta mudança) → `'dark'`. Sem o degrau do meio, quem
  já usava o app perderia a escolha na primeira carga depois do deploy. É migração de leitura, só:
  ninguém volta a escrever em `cypher.config.theme`.
- Sem dependências. Isso mantém `ConfigService` e `OnboardingService` livres para injetá-lo sem ciclo.

**`cypher.theme` é a única fonte de verdade.** O campo `theme` sai de `CypherConfig` e de
`OnboardingData`. Sem isso o tema passa a morar em duas chaves de `localStorage` sem regra de escrita:
concluir o wizard sobrescreveria um toggle feito no dashboard, e as duas cópias divergiriam em
silêncio até o próximo `save()` ressuscitar a antiga.

Consequências, todas pequenas:

- `ConfigService` deixa de tocar no `<body>` e de carregar `theme`. Continua dono do accent
  (`--accent`, `--accent-soft`, `--accent-deep`).
- `OnboardingService` deixa de tocar no `<body>` e `persistConfig()` para de gravar `theme`.
- **O step 1 fala com o `ThemeService` direto**, não com `data()`: `setTheme(t)` vira
  `themeService.set(t)`, e o `[class.on]` dos botões lê `themeService.theme()`. Guardar uma cópia em
  `data()` é o que criaria o bug seguinte — `OnboardingService` é singleton e seu `effect` só reage a
  mudanças de `data()`, então trocar o tema no dashboard e reabrir o wizard mostraria o botão errado,
  porque `data()` não mudou.
- O step 4 (`step4-confirm.component.html`) mostra `tema {{ state.data().theme }}`; passa a ler
  `themeService.theme()`.

Esse arranjo mantém a prévia ao vivo do wizard e a torna persistente: quem clica "Claro" e abandona o
wizard fica no claro, que é o que a pessoa pediu.

**`ChromeTopbarComponent`** — duas correções no bloco `.tools`:

| Controle | Hoje | Depois |
|---|---|---|
| Reabrir onboarding | ícone de sol, `aria-label="Configurações"` | ícone de engrenagem, `aria-label="Reabrir configuração inicial"` |
| Trocar tema | não existe | `<button>` novo, ícone sol/lua, chama `themeService.toggle()` |

O ícone do toggle mostra **o destino**, não o estado atual: no tema escuro aparece um sol
(`aria-label="Mudar para tema claro"`); no claro, uma lua. É a convenção que exige menos interpretação.

### Testes

`theme.service.spec.ts`:
- aplica `theme-dark` no `<body>` e remove `theme-light` ao trocar
- preserva outras classes do `<body>` (o teste que a atribuição direta não passaria)
- `toggle()` alterna e persiste em `cypher.theme` imediatamente
- hidrata de `cypher.theme` quando existe
- hidrata de `cypher.config.theme` quando `cypher.theme` está ausente
- cai em `'dark'` quando não há nada gravado
- `localStorage` indisponível não derruba o serviço

`chrome-topbar.component.spec.ts`:
- existe um botão de tema, e clicar nele troca o tema no serviço
- o link de reabrir onboarding continua apontando para `/` e não é mais rotulado "Configurações"

`onboarding.service.spec.ts` — o caminho que o desenho antigo quebrava:
- trocar o tema fora do wizard e depois montar o step 1 mostra o botão certo selecionado
  (o teste que uma cópia em `data()` não passaria)
- `persistConfig()` não grava `theme` em `cypher.config`

---

## 2. Flag de dados mockados

Build-time, em `environment.ts` — sem toggle em runtime, decisão do usuário.

### Por que a costura é o transporte, não o serviço

Duas implementações paralelas de `IncidentService`/`CatalogService` atrás de um token divergem: a de
mock deixa de exercitar o `upsert`, a deduplicação por `incidentKey`, o limite de 100 em memória e a
cobertura de lacuna por `since`. Trocar o **transporte** mantém serviços, componentes e templates
byte-a-byte idênticos nos dois modos — o modo mock exercita o código real.

O plano E1-C já tem metade dessa costura pronta: `EVENT_SOURCE_FACTORY` (Task 4) existe justamente
para ser substituível. Falta a outra metade, no lado HTTP.

### Desenho

```
src/environments/environment.ts               useMockData: false   (produção, sempre)
src/environments/environment.development.ts   useMockData: true    (dev, até E1-A subir)

src/app/shared/mock/
├── fixtures.ts              incidentes, summary, cameras, stations de exemplo
├── mock-api.interceptor.ts  responde os quatro endpoints sem rede
└── mock-event-source.ts     EventSourceLike que emite incidentes num timer
```

`environment.development.ts` nasce com `useMockData: true` porque hoje não há backend rodando — é o
motivo de a flag existir. Vira `false` quando E1-A estiver de pé.

**`USE_MOCK_DATA`** — `InjectionToken<boolean>` com `factory: () => environment.useMockData`. Existe
para que os testes possam forçar os dois modos; nenhum componente lê `environment` direto.

**Nos testes, o modo real é o padrão — e isso precisa ser explícito.** O alvo de teste usa
`buildTarget: cypher-front:build:development`, e o `fileReplacements` do `angular.json` troca
`environment.ts` por `environment.development.ts`, onde `useMockData` é `true`. Ou seja, a factory do
token devolveria `true` em toda spec que não sobrescrevesse. Todo `TestBed` que renderize o
`ConnectionBadgeComponent` — direta ou indiretamente, o que inclui `dashboard.component.spec.ts` —
declara `{ provide: USE_MOCK_DATA, useValue: false }`. Mock é opt-in no teste, nunca herdado do
ambiente. Sem essa regra, a Task 8 entra e os testes da Task 10 passam a afirmar coisas sobre um badge
num modo que ninguém escolheu.

**`mockApiInterceptor`** responde `GET /incidents`, `GET /summary`, `GET /cameras`, `GET /stations` e
`PUT /incidents/:id/status` a partir de `fixtures.ts`, com um atraso curto para que os estados de
carregamento sejam exercitados. Registrado condicionalmente:

```typescript
provideHttpClient(
  withFetch(),
  withInterceptors(environment.useMockData ? [mockApiInterceptor] : []),
)
```

O `params.since` é respeitado — filtrar por `detectedAt > since` é o que torna a rebusca de reconexão
testável à mão.

**`mockEventSourceFactory`** emite um evento `incident` a cada ~8 s com um incidente sintético novo, e
dispara `onopen` no próximo tick. Substitui `EVENT_SOURCE_FACTORY` quando `useMockData`.

### Dado de exemplo precisa aparecer na tela

A constraint global do plano E1-C diz: *"Nada de dados fabricados. Toda constante mockada que
sobreviver a este plano precisa estar rotulada em tela como dado de exemplo."* O modo mock é
exatamente isso, em escala maior.

`ConnectionBadgeComponent` injeta `USE_MOCK_DATA` e, quando ligado, renderiza **"dados de exemplo"**
com tratamento visual próprio (âmbar, borda tracejada) em vez de "ao vivo" / "conectando" / "offline".
Um badge, não um banner — é o lugar onde a pessoa já olha para saber se pode confiar no que está
vendo. O tipo `ConnectionState` não muda; a distinção é de apresentação.

### Testes

`mock-api.interceptor.spec.ts`:
- responde `/incidents` sem tocar a rede quando ligado
- filtra por `since`
- deixa a requisição passar quando desligado

`connection-badge.component.spec.ts`:
- com `USE_MOCK_DATA` verdadeiro, mostra "dados de exemplo" e não mostra "ao vivo"
- com ele falso, mostra o estado da conexão como hoje

---

## 3. Sistema tipográfico Cypher Sans

### O que o app é hoje

Inventário de `src/styles.scss` (690 linhas): **~70 declarações `var(--mono)` contra ~8 de
`var(--display)`**. Os tamanhos dominantes são 9px, 10px e 11px. A identidade real do app é JetBrains
Mono em caixa alta com tracking largo — labels, badges, IDs de estação, eixos de gráfico, legendas.
Inter Tight aparece em oito lugares e no `html, body` herdado.

Os oito: `.brand` (22/700), `.q` (64/700/-0.035em), `.sub` (18/400), `.summary-card .big` (28/600),
`.stage-meta .big` (22/600), `.dock-label` (9/500), `.dock-tooltip` (11/500) e o `html, body`. Por
herança do `body`: `.kpi .kpi-val` (48/800/-0.04em), `.greeting .hi` (28/800/-0.03em),
`.panel-head .ph-title` (14/700), `.chart-head .ch-l .t` (14/700), inputs, chips e o texto corrido.

### Três defeitos em aplicar `cypher-sans.css` literal

**1. `font-variation-settings` no `html` achata todos os pesos.** O bloco de dark mode do arquivo faz
`html { font-variation-settings: 'wght' 420 }`. Como *propriedade*, ela é herdada e, pela CSS Fonts 4
§6.9, **sobrepõe `font-weight`** no mesmo eixo. O app tem 25 declarações `font-weight: 700` e 7 de
`800`, e o tema padrão é o escuro: todo negrito do app renderizaria a 420. **Nenhum
`font-variation-settings` global.** Peso se controla por `font-weight`, que a variable font honra na
faixa 100–900.

(O `'wght' 400` dentro do `@font-face` é outra coisa — ali é *descritor*, define o default do eixo e
não se propaga para os elementos; o mapeamento de `font-weight: 100 900` continua mandando. Sai
junto por ser ruído, não por ser defeito.)

**2. O `@import` do exemplo derruba o JetBrains Mono 500 — e o import de hoje já está incompleto.** O
exemplo pede `wght@400;600;700`, mas o app usa 500 em `.kicker`, `.eyebrow-accent`, `.field label`,
`.filterbar .fb-label`, `.tkpi-trend` e outros. Pior: o import atual do app carrega só `400;500;600`,
enquanto há ~15 classes em mono 700 (`.rk-row .id`, `.alert-row .a-station`, `.heat-tile .tid`,
`.a-sev`, `.bar-val`, `.ai-badge`, `.dock-badge`, `.zone-label`…) e uma em 800 (`.station .sn`).
**Todo esse peso é sintetizado hoje.** O import correto é a união: `400;500;600;700;800`. Verificado
em 2026-08-12: a variable do JetBrains Mono cobre 100–800 (`wght@100..900` devolve HTTP 400), então o
800 do `.station .sn` passa a existir de verdade.

**3. O `@font-face` força pesos sintetizados e está desatualizado.** O `src` começa com
`local('Montserrat'), local('Montserrat-Regular')`: quem tiver Montserrat *estático* instalado ganha
esse arquivo para a faixa 100–900 inteira e o navegador fabrica os pesos que faltam — fake bold numa
manchete de 64px é visível. A URL também está fixada em `v30`; verificado em 2026-08-12, o Google
serve **v31**: `https://fonts.gstatic.com/s/montserrat/v31/JTUSjIg1_i6t8kCHKm459Wlhyw.woff2`.

### A decisão: três vozes em vez de duas

Montserrat vem dos letreiros pintados do bairro Montserrat, em Buenos Aires. É uma fonte de
**sinalização** — e sinalização industrial é o registro deste produto. Ela é forte onde o painel
*declara* e fraca onde ele *explica*: geométrica, larga, com x-height menor que a do Inter Tight, ela
lê menor e mais apertada a 14–16px com o `letter-spacing: -0.005em` global.

| Papel | Token | Fonte | Onde |
|---|---|---|---|
| **Display** — o painel declara | `--display` | Cypher Sans (Montserrat variable) | `.q`, `.brand`, `.summary-card .big`, `.stage-meta-* .big`, `.kpi .kpi-val`, `.greeting .gtext .hi` |
| **UI** — o painel explica | `--ui` (novo) | Inter Tight | `html, body`, `.sub`, inputs, chips, `.dock-label`, `.dock-tooltip`, títulos de painel de 14px |
| **Dados** — o painel mede | `--mono` | JetBrains Mono | os ~70 labels, badges, IDs, eixos — inclusive `.station .sn` |

Como `html, body` passa a `var(--ui)`, a atribuição **não é automática por herança**. O diff em
`styles.scss` é:

- **Mantêm `var(--display)`, agora resolvendo para Montserrat:** `.brand`, `.q`,
  `.summary-card .big`, `.stage-meta-{tl,tr,bl,br} .big`.
- **Ganham `font-family: var(--display)`** (hoje herdam do `body`): `.kpi .kpi-val`,
  `.greeting .gtext .hi`. São os dois números que o painel declara mais alto — 48/800 e 28/800.
- **Trocam `var(--display)` por `var(--ui)`**, para continuar em Inter Tight: `.sub`, `.dock-label`,
  `.dock-tooltip`, e o `html, body`.
- **`.station .sn` fica em mono.** Ela é 20px/800 em JetBrains Mono, não em `--display` — o nome da
  estação pertence à voz de dados, junto do `.sid` logo acima dele.

Nenhum arquivo de componente muda; o diff inteiro é `src/styles.scss`.

### O que entra e o que fica de fora

**Entra:**

- O `@font-face` de `'Cypher Sans'`, corrigido: sem `local()`, apontando para a URL v31 da variable
  font, sem `font-variation-settings`, com `unicode-range` latin (que cobre ç, ã, õ, á, é). O italic
  do exemplo sai — o app zera `font-style` nos dois lugares em que usaria (`.q em`, `.hi em`).
- `'Montserrat'` como segundo item da pilha de `--display`, para que o `@import` cubra o que o
  `unicode-range` do alias não cobrir.
- Os tokens de tracking (`--tracking-tighter` … `--tracking-widest`), usados nos call-sites de display.
- `font-variant-numeric: tabular-nums slashed-zero lining-nums` nas classes de número:
  `.kpi .kpi-val`, `.bar-val`, `.rk-row .nm`, `.station .sn`, `.summary-card .big`, `.tkpi-val`.
  Propriedade de alto nível, não `font-feature-settings` — assim não clobbera nada.

**Entra durante o passe visual e sai antes do commit:**

- `font-synthesis-weight: none` no `html`. É o canário que faz um peso não carregado aparecer errado
  em vez de ser fabricado em silêncio — exatamente o defeito que passou despercebido nos 700/800 de
  mono até hoje. Mas ele **não vai para produção**: numa rede de planta com o gstatic bloqueado, o
  fallback é `system-ui` com poucos pesos, e degradar visivelmente é pior que degradar de leve. Usar
  para achar o problema, remover depois. A checagem de "Rendered Fonts" no passe de verificação é o
  que segura a regressão daqui pra frente.

**Fica de fora, e por quê:**

- **A escala `--cypher-text-*`.** O app tem 100+ tamanhos em px espalhados; migrar é um refactor
  separado, com superfície grande de regressão e nenhum ganho visível agora.
- **As classes `.cypher-h1` … `.cypher-code`, `.wght-*`.** Duplicam o que `.q`, `.sub`, `.kicker` e
  companhia já fazem. Dois sistemas paralelos é pior que um.
- **`cv11` e `ss01`.** São features do Inter, não do Montserrat — no-op silencioso.
- **`text-rendering: optimizeLegibility`.** Custo de layout conhecido, sem ganho aqui.
- **O boost de peso no escuro.** Além de quebrar os pesos (defeito 1), o app já usa
  `-webkit-font-smoothing: antialiased`. Se o passe visual mostrar afinamento no escuro, a correção
  vai nas classes específicas, dentro de `.theme-dark` — nunca no `html`.

### Retoque dos call-sites de display

Montserrat com x-height menor e conjunto mais largo não aceita os mesmos valores do Inter Tight. Os
valores abaixo são **ponto de partida a confirmar no passe visual**, não medidas finais:

| Classe | Hoje | Partida |
|---|---|---|
| `.q` | 64px / 700 / -0.035em | 66px / 700 / -0.04em |
| `.kpi .kpi-val` | 48px / 800 / -0.04em | 48px / 800 / -0.045em |
| `.greeting .hi` | 28px / 800 / -0.03em | 28px / 800 / -0.035em |
| `.brand` | 22px / 700 / -0.03em | 22px / 700 / -0.035em |

O `.sub` de 18px e os títulos de painel de 14px permanecem em Inter Tight, então não mudam.

### Verificação

Sem teste unitário — tipografia se verifica olhando. O passe cobre, em ambos os temas:

1. **Nenhum peso sintetizado.** Em DevTools › Rendered Fonts, confirmar que `.q` e `.kpi-val` usam
   `Montserrat` com o peso pedido, e que "Synthetic bold" não aparece.
2. **Todos os pesos de mono carregaram.** `.kicker` continua distinto de `.rail-title` (500 vs 400), e
   os badges e IDs em 700 deixam de ser sintetizados. Espere uma diferença sutil e desejável ali: o
   700 real do JetBrains Mono é menos borrado que o falso de hoje.
3. **Onboarding step 1** — o herói `.q` não quebra em três linhas nem estoura a coluna de `1fr 1fr`.
4. **Linha de KPIs do dashboard** — os quatro cartões cabem, `48px` não estoura, e "94.2 %" alinha na
   baseline com o denominador.
5. **Heatmap** — `.station .sn` (20px/800 em mono) legível dentro do tile de 76px. É o peso que mais
   muda com a correção do import: hoje é fabricado, passa a ser o 800 de verdade do JetBrains Mono.
   Se ficar pesado demais no tile, cair para 700 é a saída.
6. **Zero cortado.** Se o Montserrat não implementar a feature `zero`, `slashed-zero` é no-op
   silencioso e inofensivo; registrar o que se observou.

---

## 4. Impacto no plano E1-C

### Constraint global a corrigir

A linha *"Não alterar `src/styles.scss` além do necessário para os estados novos"* passa a valer só
para os estados de conexão e vazio. A tipografia é uma mudança deliberada e substancial ali, coberta
pela seção 3 deste spec.

### Nova ordem das tarefas

| # | Tarefa | Origem |
|---|---|---|
| 1 | Ligar o runner de testes | era Task 1 |
| 2 | **Tema: dono único, toggle e ícone honesto** | **nova** |
| 3 | **Tipografia Cypher Sans** | **nova** |
| 4 | Ambientes, HTTP, tipos do contrato — agora com `useMockData` e `USE_MOCK_DATA` | era Task 2, ampliada |
| 5 | Store de incidentes por HTTP | era Task 3 |
| 6 | Push por SSE e estado de conexão | era Task 4 |
| 7 | Catálogo e agregados | era Task 5 |
| 8 | **Modo mock: interceptor, EventSource fake e badge "dados de exemplo"** | **nova** |
| 9 | Vídeo ao vivo | era Task 6 |
| 10 | Dashboard sem dados fabricados | era Task 7 |
| 11 | Heatmap por estação | era Task 8 |
| 12 | Verificação de ponta a ponta | era Task 9 |

Tarefas 2 e 3 vêm cedo porque não dependem da API nem uma da outra — só do runner de testes, e a 3
nem disso. O modo mock fica na 8 porque precisa dos endpoints das tarefas 5–7 já modelados; antes
disso ele mockaria contratos que ainda não existem.

A tarefa 12 ganha um passo: rodar uma vez com `useMockData: true` e confirmar que o badge diz "dados
de exemplo", antes de virar para `false` e fazer a verificação real contra a API.

---

## 5. Fora de escopo

- **Duplicação do accent.** `ConfigService` e `OnboardingService` também escrevem `--accent`,
  `--accent-soft` e `--accent-deep` cada um por conta própria. Hoje não produz bug — os `effect` só
  reagem às próprias fontes e o wizard não está montado no dashboard — mas é o mesmo padrão do
  problema do tema. Fica registrado; se o accent ganhar um controle fora do wizard, vira o mesmo
  trabalho da seção 1.
- **`src/app/app.html`** contém `<app-onboarding/>` e é código morto: `app.ts` usa template inline com
  `<router-outlet/>`. Não atrapalha nada.
- **Migração da escala tipográfica para tokens.** Justificada na seção 3.
- **Toggle de mock em runtime.** Decisão do usuário: build-time basta.
