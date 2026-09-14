# Design System — Cypher Front

**Fonte única:** este documento é um índice do que já está implementado em [`src/styles.scss`](../src/styles.scss) (859 linhas, folha de estilos global — não há biblioteca de UI de terceiros, não há CSS-in-JS, cada componente Angular usa esses primitivos globais mais um `.component.scss` só para layout local). Nenhum token ou primitivo listado aqui é aspiracional: se está neste documento, está no CSS rodando na aplicação hoje.

**Regra do projeto** (`docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md` §4): toda tela nova reaproveita estes primitivos — nenhuma tela introduz CSS solto, biblioteca de UI ou `ReactiveFormsModule`. A única exceção documentada é o canvas de desenho de polígono do editor de zonas de risco, sem equivalente nos primitivos existentes.

---

## 1. Fundações

### 1.1 Cor — tokens semânticos (`:root`)

| Token | Valor | Uso |
|---|---|---|
| `--accent` | `#F4622A` | Cor de marca — CTAs primários, foco, destaques pontuais |
| `--accent-soft` | `rgba(244,98,42,0.14)` | Fundo suave sobre `--accent` (glow, halo de foco) |
| `--accent-deep` | `#C84A18` | Hover/active de botão primário |

### 1.2 Cor — tema (`.theme-dark` / `.theme-light`)

Toda cor de superfície e texto é redefinida por tema — nenhum componente hardcoda `--bg`/`--ink`; o toggle de tema (já implementado, alternador Claro/Escuro no chrome) troca só a classe raiz.

| Token | Dark | Light | Uso |
|---|---|---|---|
| `--bg` / `--bg-2` | `#0D0F14` / `#11141B` | `#F5F2EC` / `#ECE8DF` | fundo de página / gradiente |
| `--surface` / `--surface-2` / `--surface-hi` | `#15181F` / `#1B1F28` / `#22262E` | `#FBF9F4` / `#F0EDE5` / `#FFFFFF` | cards, painéis, inputs |
| `--line` / `--line-2` / `--line-3` | branco 8%/14%/22% | preto 8%/16%/28% | bordas, divisórias, em ordem crescente de ênfase |
| `--ink` / `--ink-2` / `--ink-mute` / `--ink-ghost` | branco 4 níveis de opacidade decrescente | preto idem | texto, do título ao rótulo mais apagado |

### 1.3 Cores de severidade/estado (fixas, não trocam por tema)

Não são tokens CSS — são valores fechados usados diretamente, decisão registrada na entrega `avs` (mesmo tier de severidade `ALTO` em toda a aplicação):

| Cor | Hex | Significado |
|---|---|---|
| Crítico/Alto | `#EE4242` | severidade crítica, KPI "Críticos hoje", badge de notificação, status "Inativo" |
| Atenção | `#FFCE38` | severidade média/alta, avisos |
| Médio/Info | `#3D88F6` | severidade média-baixa |
| OK | `#34D07E` | conformidade, "ao vivo", status "Ativo" |

**Gap conhecido, registrado, sem spec** (`roteiro-de-entregas.md` §5): `#EE4242` cai a ~4,1:1 contra fundo escuro — abaixo do piso AA (4,5:1) para texto pequeno. Só resolvido no tema claro (via `.theme-light .status.on/off`, ver §3.4 abaixo).

### 1.4 Tipografia — três vozes

| Token | Família | Papel |
|---|---|---|
| `--display` | `'Cypher Sans'` (Montserrat variable, self-hosted via `@font-face`), fallback `Montserrat`/`system-ui` | manchetes, números grandes — "o painel declara" |
| `--ui` | `'Inter Tight'`, fallback `system-ui`/`Roboto` | texto corrido, formulários, chips — "o painel explica" |
| `--mono` | `'JetBrains Mono'`, fallback `'Fira Code'`/`ui-monospace` | labels, badges, IDs, eixos — "o painel mede" |

Tracking (letter-spacing) em 6 degraus nomeados, de `--tracking-tighter` (-0.045em, manchetes) a `--tracking-widest` (0.22em, labels mono em caixa alta).

---

## 2. Primitivos de formulário e ação

| Classe | Descrição |
|---|---|
| `.field` + `label` | wrapper vertical de campo, label em mono uppercase |
| `.input`, `.select` | mesmo visual (altura, borda, radius 10px); `.select` troca a seta nativa por SVG inline |
| `.field-error` | mensagem de erro, mono, cor `#E14A3B`, prefixo `✕` |
| `.btn` | base — outline transparente; `.btn.primary` (preenchido, cor de marca), `.btn.ghost` (sem borda), `.btn.lg`/`.btn.sm` (variação de tamanho) |
| `.chip` | pílula clicável, estado `.on` com cor de marca |
| `.seg-toggle` | alternador segmentado (2+ opções mutuamente exclusivas) — nasceu do toggle Claro/Escuro, reaproveitado por qualquer alternância do mesmo tipo (ex.: "Por setor"/"Grade única" em Ao Vivo) |
| `.status` | badge de estado binário — `.status.on` (verde) / `.status.off` (vermelho), com override de contraste em `.theme-light` |

## 3. Estrutura e navegação

| Classe | Descrição |
|---|---|
| `.panel` | card de conteúdo genérico — fundo `--surface`, borda `--line-2`, radius 14px |
| `.list-row` | linha de lista horizontal (usada em config, notificações) |
| `.vazio` | texto de estado vazio, cinza — definida globalmente desde a central de notificações (antes só existia escopada por componente) |
| `app-chrome-topbar` / `.dtop` | barra superior fixa — marca, título de página, indicador "ao vivo", ícones de ferramenta, avatar |
| `.dock` / `.dock-item` / `.dock-wrap` | dock de navegação flutuante, arrastável entre 5 posições de encaixe (`snap-zones`), orientação horizontal/vertical |
| `.filterbar` | barra de filtro sticky, usada em Heatmap/Incidentes/Ao Vivo — todo controle dentro dela (`.chip`, `.fb-select`, `.input`, `.btn`, `.seg-toggle`) é forçado a 30px de altura por convenção (comentário explícito no CSS: "senão a barra cresce e destoa entre as telas que a usam") |
| `.setor-head` / `.setor-heading` | cabeçalho de seção ao agrupar por setor (Ao Vivo) — título com peso 700 e divisória real, não legenda solta |

## 4. Padrões de visualização de dados

| Classe | Descrição |
|---|---|
| `.kpi` / `.kpi-row` | cartão de indicador — valor grande em `--display`, cor por `--kpi-color` |
| `.heat-tile`, `.station` (`.t0`–`.t4`) | célula de mapa de calor, 5 degraus de intensidade via `color-mix()` sobre `--accent` |
| `.temporal` / `.temp-cell` / `.temp-foot` | grade dia×hora (Distribuição Temporal) — reaproveitada literalmente pelo Histórico Anual (mês×dia-da-semana) na mesma classe, por decisão explícita de manter os dois painéis "detalhados" visualmente idênticos |
| `.rk-row` / `.rk-bar` | linha de ranking com barra de progresso e badge de severidade |
| `.scale-pill` (`.s0`–`.s4`) | legenda de escala de intensidade |
| `.sample-seal` | selo "dado de exemplo" — usa `--ink-2` (não `--ink-mute`) por exigência de contraste AA explícita no comentário do CSS |

## 5. Primitivos de IA / notificação (entregas mais recentes)

| Classe | Descrição |
|---|---|
| `.detail-llm` / `.dl-risk` (`.lvl-baixo/medio/alto`) | painel de resultado da análise de risco por LLM, no detalhe do incidente |
| `.notif-offcanvas` / `.notif-backdrop` / `.notif-row` | central de notificações — único primitivo visual verdadeiramente novo desde o style guide original; painel lateral reparentado para `document.body` para vencer o stacking context do topbar/dock (`z-index` 2001, acima do dock em 1000 e do dock-toast em 1001) |

## 6. Exceção registrada

O editor de zonas de risco (canvas de desenho de polígono sobre frame de câmera congelado) não tem equivalente nos primitivos acima — é a única peça do front sem classe global correspondente, exceção documentada desde a spec original (`2026-08-29-zonas-de-risco-design.md` §4.3).

## 7. Acessibilidade — decisões registradas

- Contraste AA (4,5:1) verificado explicitamente em `.sample-seal` e em `.status.on/off` no tema claro (comentários com os valores medidos no próprio CSS).
- `font-variant-numeric: tabular-nums slashed-zero lining-nums` aplicado a todo número que atualiza em tempo real (KPIs, ranking, barras), para não "dançar" a cada refresh.
- Gap aberto: contraste de `#EE4242` no tema escuro (~4,1:1), registrado em `roteiro-de-entregas.md` §5, sem spec de correção ainda.
