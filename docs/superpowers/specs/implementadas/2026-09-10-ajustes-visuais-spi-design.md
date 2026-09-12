# Ajustes visuais pós-review da SPI — design

**Data:** 2026-09-10
**Repositório:** `cypher-front` (único repositório tocado por esta spec)

## Contexto

Durante a visita da SPI na terça-feira (2026-09-08), o time fez uma sessão de review com 9 achados (registrados em `docs/scrum/sprint-3/sprint-backlog.md`, seção "Review com a SPI"). Uma investigação no código confirmou que 6 desses 9 achados são só visuais/IA (informação e arquitetura), confinados ao `cypher-front`, sem tocar API ou dado — os outros 3 (REBA com câmera angulada, respeitar zona na pipeline, rotação de câmera) ficam em `cypher`/`cypher-capture`, fora do escopo desta spec.

Os 6 achados cobertos aqui:
1. Cores binárias para Ativo/Inativo em vez do `--accent` de onboarding.
2. Remover o destaque de cor que lembra "gerado por IA" de cards e alertas.
3. Segmentar câmeras por estação na tela "Ao Vivo".
4. Arquitetura de informação e layout dos filtros de Incidentes.
5. Remover o link morto "Cadastrar" da dock.
6. Reconciliar inputs/selects soltos com o style guide.

O usuário pediu explicitamente o mesmo fluxo rigoroso das entregas anteriores (spec → plano → execução) para esta, mesmo sendo um lote só de front-end — trata cada achado como uma decisão de design que merece registro, não como um ajuste solto.

## 1. Token `--accent` restrito a elementos interativos

Hoje um único token (`--accent: #F4622A`, laranja) é usado tanto em elementos interativos (botões primários, links, foco de input, navegação ativa, onboarding) quanto em elementos passivos (badges de status, KPIs, alertas, cards de seleção) — é essa sobreposição que faz cards e alertas "parecerem IA": a mesma cor de marca aparece em todo lugar sem hierarquia de uso.

**Princípio:** `--accent` passa a significar exclusivamente "isto é interativo ou é a marca" — botão primário, link, estado ativo de navegação (`.dock-item.active`, `.cat-item.on` do onboarding), foco de campo, e o próprio onboarding (`.brand-dot`, `.stepind`, `.step2-hero`). Fora disso, a cor vira neutra (`--ink`/`--line-2`/`--line-3`/`--surface-hi`) ou semântica binária (verde/vermelho) apenas onde o dado em si é binário.

**Concretamente:**
- **Status Ativo/Inativo** (`.status.on`/`.status.off` em `styles.scss:828`, reaproveitado em estações/equipes/webhooks): passam a usar verde/vermelho fixos — o precedente de verde já existe (`.save-status.ok { color: #34D07E }`), falta o par vermelho e aplicar os dois à classe `.status`.
- **KPIs do Dashboard** (`.kpi`, `dashboard.component.html:56`): 3 dos 4 cards já usam uma cor semântica própria via `--kpi-color` inline (`#EE4242` vermelho, `#FFCE38` amarelo, `#34D07E` verde) — só o card "Críticos hoje" reaproveita `var(--accent)` por herança do CSS, e não por decisão de design. O projeto já tem uma escala de severidade de 3 níveis usada nos badges de alerta (`.alert-row.crit`/`.high`, `styles.scss:440-442`, aplicada por `AlertaNivel`: `ALTO` → `#EE4242`, `MEDIO` → `#FFCE38`, `BAIXO` → `#34D07E`) — e `criticosHoje()` conta exatamente os alertas com `nivel === 'ALTO'` (`dashboard.component.html:136`), ou seja, é literalmente o tier "crítico" dessa escala. **Decisão: `--kpi-color: #EE4242`** para o card "Críticos hoje", seguindo a escala de severidade já existente em vez de inventar uma cor nova. Nota: o KPI "Incidentes hoje" (contagem total, não filtrada por nível) já usa esse mesmo `#EE4242` — os dois cards ficam com a mesma cor, o que é coerente com o style guide de severidade (o "crítico" real da escala), não um problema a resolver aqui.
- **`.ai-badge`** (`styles.scss:454-455`): CSS morto — não é usado em nenhum template hoje (confirmado por busca). Fica marcado para remoção junto com este lote, já que é exatamente o tipo de resíduo que motivou o achado da SPI.
- **Cards de seleção do onboarding** (`.epi-card.on`, `.opt-card.on`) e o **selo "Ao vivo"** (`.fb-status`, que já usa verde, não laranja): fora de escopo — onboarding é fluxo interativo (usuário está escolhendo algo), não um card/alerta passivo.
- **`.notif-row.unread`** (borda de 3px em `--accent`, adicionada na entrega Central de Notificações): fora de escopo — é um indicador funcional de não-lido, não um resíduo decorativo; revisitar isso é uma mudança de UX de notificação, não um ajuste de cor "IA".
- **Demais usos de `--accent` em texto/ícone decorativo sem função interativa** (ex: `.alerts-foot .r`, `.insight .diam`, `.summary-card .h .n`): avaliados caso a caso durante a implementação — o princípio geral (interativo = accent, passivo = neutro/semântico) decide cada um; a lista exaustiva de linhas fica para o plano de implementação, não para esta spec.

## 2. Filtros de Incidentes — arquitetura de informação e layout

Hoje `incident-timeline.component.html` (`.tl-filters`) é um formulário inline plano: Câmera, Severidade mínima, Status e "A partir de" lado a lado, sem agrupamento nem hierarquia visual — mas já usa os primitivos globais corretos (`.field`/`.input`/`.select`), então o problema aqui é puramente de layout/IA, não de token.

**Decisão:** reaproveitar o padrão de `.filterbar` já construído para o Heatmap (`heatmap.component.html`/`styles.scss:564-577`) — barra fixa no topo do conteúdo, grupos separados por `.fb-sep`, selects compactos com seta customizada. Aplicar essa mesma estrutura aos filtros de Incidentes, mantendo os mesmos campos e o mesmo `aplicarFiltros()` que já existem — é uma mudança de layout/contêiner, não de lógica de filtro.

**Nota de reconciliação de token (liga com o item 6):** `.fb-select` hoje é uma classe própria do Heatmap, com sua própria cor/borda/seta em vez de herdar de `.select` (o primitivo global). Ao mover esse padrão para Incidentes, os dois lugares passam a compartilhar a mesma classe de select compacto — momento certo para fazer `.fb-select` herdar cor/borda/tipografia de `.select` (mesmo `--surface-2`/`--line-2`/`--ink-2`), preservando só a altura compacta (30px) e a seta customizada que o justificam como uma variante, não uma classe solta. Assim o item 6 (inputs/selects seguindim style guide) se resolve pra Heatmap e Incidentes ao mesmo tempo, em vez de duas vezes.

## 3. "Ao Vivo" — reforço visual da segmentação por estação

`stations-grid.component.html` já segmenta por estação estruturalmente: cada card (`.station-card`) é uma estação, mostrando seu próprio feed representativo e contagem de câmeras (`station.cameras.length`); o clique leva ao kiosk daquela estação com todas as câmeras dela. Não há, hoje, agrupamento por **setor** (`station.setor` existe como metadado e aparece só como uma legenda pequena — `.ph-meta` — dentro de cada card, sem função de agrupamento).

**Decisão (reforço visual, sem mudar dado ou navegação):** adicionar cabeçalhos de agrupamento por setor na grid — cards com o mesmo `station.setor` ficam visualmente agrupados sob um cabeçalho de seção, em vez de soltos numa grid única. Estações sem setor definido caem num grupo "Sem setor" ao final. Nenhuma mudança na API, no `station-kiosk`, ou na contagem/feed de cada card — só a organização espacial da grid.

**Ressalva:** se ao entrar no código este reforço se mostrar insuficiente pro que a SPI realmente pediu (ex: se o pedido for sobre o kiosk multi-câmera, não a grid), a implementação para e o achado é escalado de volta para reclassificação — não se expande o escopo silenciosamente.

## 4. Remover o link "Cadastrar" da dock

`dock.component.ts:27` tem `{ key: 'invite', label: 'Cadastrar' }` sem `route` — o template (`dock.component.ts:92-102`) renderiza itens sem `route` como um `<button>` sem `(click)`, ou seja, um botão morto que nunca fez nada. Remove-se a entrada do array `ITEMS` e o `@case ('invite')` correspondente no template de ícones (`dock.component.ts:145-149`).

## 5. Inputs/selects seguindo o style guide

Já coberto em conjunto com o item 2 acima (a reconciliação de `.fb-select` com `.select`) — essa é a única divergência real encontrada na investigação; os demais formulários do projeto (Incidentes, Estações, Equipes, Webhooks) já usam `.field`/`.input`/`.select` corretamente.

## Nota de consistência de design (roteiro §4)

Esta spec não introduz nenhum primitivo visual novo — é puramente reconciliação e reforço do que já existe (`.select`, `.status`, `.filterbar`, cabeçalhos de seção). Nenhuma exceção ao roteiro §4 é necessária.

## Fora de escopo

- REBA com câmeras anguladas, respeitar zona na pipeline, rotação de câmera personalizável — os outros 3 achados da review da SPI, em `cypher`/`cypher-capture` (cards próprios no Product Backlog, fora desta spec).
- Remoção do `.notif-row.unread` (indicador funcional, não decorativo).
- Mudança de dado/navegação em "Ao Vivo" — só reforço visual da segmentação já existente (ver ressalva no item 3).
- Renomear ou remover o conceito por trás de `.ai-badge` além do CSS morto em si — não há um badge "Analisado com IA" em uso hoje; se um dia existir, sua paleta segue o princípio geral desta spec (interativo/marca vs. passivo).

## Premissas confirmadas com o usuário

- `--accent` reservado a elementos interativos/marca; o resto vira neutro ou semântico binário (opção recomendada, aprovada).
- Filtros de Incidentes reaproveitam o padrão de filterbar já construído no Heatmap, em vez de um padrão novo (aprovado).
- "Ao Vivo" recebe reforço visual da segmentação já existente, não uma feature nova — se o código mostrar que é insuficiente, o item é escalado de volta (aprovado).
- KPI "Críticos hoje" usa `#EE4242`, o mesmo tom da escala de severidade já usada em `.alert-row.crit`/`AlertaNivel.ALTO` — mesma cor do KPI "Incidentes hoje", aceito como coerência com a escala de severidade, não como duplicação a evitar (aprovado).
