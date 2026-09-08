# Cypher — Heatmap funcional (filtros, ordenação e paineis temporal/anual)

**Data:** 2026-09-08
**Status:** aprovado (design)
**Escopo:** a tela `/heatmap` (E1) tem uma barra de filtros (Período/Setor/EPI/Turno) e um seletor de ordenação que nunca tiveram lógica por trás — chrome estático de uma passada de UI anterior aos dados reais. Os dois painéis "Distribuição Temporal" e "Histórico Anual" são dado fabricado no front, rotulados "dado de exemplo" desde a E1. Esta entrega torna os filtros/ordenação reais e substitui os dois painéis fabricados por agregações reais do backend.

**Achado que originou esta spec:** durante o teste manual ponta a ponta da E6 (relatórios), o usuário pediu uma revisão da tela `/heatmap` como um todo. `HeatmapComponent` (`period`/`shift` signals, `<select>` de Setor/EPI/Ordenar) não tem nenhum binding — os únicos dados reais na tela são `celulas()`/`top5()`, derivados de `IncidentService.summary().heatmap`, que por sua vez é sempre "hoje" (hardcoded em `SummaryService.build()`), nunca respeitou nenhum filtro.

**Depende de:** nenhuma entrega anterior — é uma extensão de `/summary` (E1) e do `HeatmapComponent` (E1), ambos já implementados. Branches locais dedicadas (`feat/hf-backend-heatmap` a partir de `main`, `feat/hf-front-heatmap` a partir de `dev`), sem worktree — mesmo padrão das entregas anteriores.

---

## 1. Backend — `GET /api/v1/summary` ganha parâmetros opcionais

```
GET /api/v1/summary  ?since&until&turno&setor&epi&detalhado
```

Nenhum parâmetro novo é obrigatório — uma chamada sem parâmetros continua devolvendo exatamente o mesmo shape de hoje (compatibilidade com o Dashboard, que não muda).

### 1.1 `since`/`until` — generaliza a janela do heatmap espacial

Hoje `porEstacaoHoje` (o mapa que alimenta o campo `heatmap`) só conta incidentes de `hoje` (data local), hardcoded em `SummaryService.build()`. Passa a aceitar `since`/`until`; omitidos, o comportamento é idêntico ao atual (`since = until = hoje`, `until` default = agora). Os campos `incidentesHoje`/`incidentesOntem`/`ultimosSeteDias` **não mudam** — continuam sempre relativos a hoje, são KPIs de dashboard, não do heatmap espacial.

### 1.2 `turno` — filtra por faixa horária do incidente

Valores: `A` (06–14h), `B` (14–22h), `N` (22–06h) — mesmas faixas já exibidas nos chips do front. Calculado direto de `Alerta.dataHora` (hora local), **sem vínculo com `Equipe`/`Turno` da E5** — é uma faixa horária do relógio, não o turno de uma equipe específica, então se aplica a qualquer estação, com ou sem equipe associada.

### 1.3 `setor` — filtra por `Estacao.setor`

Valor literal do setor (ex.: `montagem`, `usinagem`) — igual ao que `StationCell.setor` já expõe. Sem correspondência com nenhuma estação, o resultado é vazio (não é erro 400).

### 1.4 `epi` — filtra por EPI ausente

A tela mostra os nomes em português do catálogo `EPI_LIST` (front, `onboarding.models.ts`): `capacete`, `colete`, `luvas`, `oculos`, `mascara`, `auricular`, `botas`, `cinto`. O `cypher-capture` gera rótulos próprios para violação (`no_helmet`, `no_goggle`, `no_gloves`, `no_boots`) — só quatro desses oito EPIs têm detecção de violação implementada hoje. O backend mantém um mapa fixo:

```java
private static final Map<String, String> EPI_PARA_VIOLACAO = Map.of(
    "capacete", "no_helmet",
    "oculos",   "no_goggle",
    "luvas",    "no_gloves",
    "botas",    "no_boots"
);
```

`epi` com um valor fora desse mapa (ex.: `colete`, que o modelo não detecta) devolve `400` com mensagem explícita — não um resultado vazio silencioso, porque um EPI que nunca vai aparecer filtrado é diferente de um EPI que simplesmente não teve violação no período. Filtra por `Alerta.epiMissing` (`@ElementCollection` já existente, tabela `alerta_epi_missing`) conter o rótulo mapeado.

### 1.5 `detalhado=true` — opt-in para os dois campos novos

```java
List<TemporalCell> distribuicaoTemporal   // diaSemana (0=Seg..6=Dom) × faixa2h (0..11) → contagem
List<DayCount> historicoAnual             // um DayCount por dia do ano corrente (mesmo record de ultimosSeteDias)
```

Sem `detalhado=true`, os dois campos vêm `null` no JSON (mesma convenção de campo opcional já usada em `PlacarEquipeResponse.conformidade`/`deltaConformidadeSemana` — o projeto não configura `default-property-inclusion`, então Jackson serializa `null` explícito, não omite a chave) e a resposta tem o mesmo custo de hoje. O Dashboard nunca manda essa flag. O Heatmap sempre manda.

- **`distribuicaoTemporal`** respeita `since`/`until`/`turno`/`setor`/`epi` — é a mesma janela filtrada do heatmap espacial, só que rebatida em dia-da-semana×faixa-de-2h em vez de por estação. Faixas de 2h (12 linhas) para bater com o mock atual (`00–02h` ... `22–00h`).
- **`historicoAnual`** é **sempre o ano corrente inteiro** (`LocalDate.now().getYear()`, Jan–Dez) — **ignora `since`/`until`** (um "ano inteiro" não é compatível com um período de 7/30/90 dias sem deixar de ser um calendário anual), mas respeita `turno`/`setor`/`epi`. O front decide, célula a célula, se o dia cai dentro do `since`/`until` selecionado para aplicar opacidade reduzida — ver §2.

### 1.6 Custo conhecido, não endereçado nesta entrega

`historicoAnual` carrega até 365 dias de `Alerta` em memória — o comentário atual de `SummaryService` ("sete dias é curto o bastante pra caber em memória") deixa de valer quando `detalhado=true`. Aceitável no volume de dados de uma demonstração; se o volume crescer, a substituição é por uma consulta de agregação no banco (`GROUP BY` por dia), não por reescrever a estrutura da resposta.

---

## 2. Front — `HeatmapComponent`

- **`setor`, `epi`, `ordenar`** viram `signal`s reais, com `<select>` ligado (`(change)`/`[(ngModel)]`, mesmo padrão de `camera`/`severityMin` em `IncidentTimelineComponent`). As opções de `setor` deixam de ser hardcoded (`Setor A/B/C`) — vêm de `CatalogService` (setores distintos das estações já carregadas). As opções de `epi` vêm do `EPI_LIST` já existente (`onboarding.models.ts`), filtradas aos quatro que o mapa do backend (§1.4) realmente suporta — os outros quatro (colete, máscara, auricular, cinto) ficam fora da lista até o `cypher-capture` detectar essas violações.
- Um `computed` monta a query string a partir de `period()`/`shift()`/`setor()`/`epi()` e o carregamento de summary (`IncidentService.loadSummary(filtros)`, hoje sem parâmetro) passa a receber esses filtros, sempre com `detalhado=true`.
- `celulas()`/`top5()` continuam derivando de `summary()?.heatmap` — passam a refletir os filtros porque a resposta já vem filtrada; nenhuma lógica de filtro no front.
- **`ordenar`** — `computed` com três modos:
  - `ranking`: lista plana de todas as células, ordenada por `incidentes` desc, sem agrupamento por setor.
  - `nome`: lista plana ordenada alfabeticamente por `nome` da estação.
  - `zona` (default, comportamento atual): `grupos()` continua existindo, agora ordenado alfabeticamente por `setor` (hoje é ordem de inserção do `Map`, que é arbitrária).

  `ranking`/`nome` abandonam o `zone-label`/agrupamento visual; `zona` é a única opção que mostra os grupos.
- **Temporal/Anual** consomem `summary()?.distribuicaoTemporal`/`summary()?.historicoAnual` no lugar de `TEMP_MATRIX`/`buildAnnual()`, que são removidos do componente junto com o comentário/selo "dado de exemplo" (`sample-seal`) — deixam de ser fabricados.
- **Opacidade do Anual:** uma função pura `dentroDoPeriodo(dia: LocalDate-like, period: string, agora: Date): boolean` (mesmo padrão de `inicioDoPeriodo`, criada para a E6) decide a classe CSS (`.dimmed` vs. normal) de cada célula do calendário, comparando a data da célula contra a janela que o `period()` selecionado implica — client-side, sem parâmetro novo no backend para isso.

---

## 3. Comportamento sob falha / vazio

| Situação | Comportamento |
|---|---|
| Nenhum incidente na janela filtrada | Painéis mostram "vazio" (mesmo padrão já usado: `nenhuma estação cadastrada`, `sem estações para ranquear`) — nunca erro. |
| `epi` fora do mapa suportado (ex.: `colete`) | `400` com mensagem explícita — não é um resultado vazio silencioso. A tela nem oferece essa opção no `<select>` (só os 4 EPIs mapeados aparecem), então isso só ocorre por chamada direta à API. |
| `setor` que não existe mais | Resultado vazio, não erro — filtro que não bate com nada não é uma requisição inválida. |
| Combinação turno+período que não cobre nenhum dia (ex.: período "hoje" + turno "N" antes das 00h) | Resultado vazio, comportamento normal. |
| `distribuicaoTemporal`/`historicoAnual` com todas as contagens zero | Grid renderiza normalmente, todas as células na tonalidade mais baixa da legenda. |
| `GET /summary` falhar (rede/500) | Mesmo tratamento que o Dashboard já tem hoje — sem crash, mantém o último dado bom em tela. |

---

## 4. Estratégia de testes

**Java** — `SummaryServiceTest`: cada parâmetro novo isolado (só `since`, só `turno`, só `setor`, só `epi`, combinação de dois) e os casos de vazio/erro da tabela acima (`epi` fora do mapa → 400). `distribuicaoTemporal`/`historicoAnual` testados com fixtures de `Alerta` em horários/dias conhecidos, verificando o bucket exato (ex.: um incidente às 23h de uma quarta-feira cai em `diaSemana=2, faixa2h=11`). Contrato de compatibilidade: uma chamada sem parâmetro novo nenhum continua batendo com os testes existentes de `SummaryServiceTest`/`SummaryApiTest`, sem os dois campos novos preenchidos.

**Angular** — `HeatmapComponentTest`: cada `signal` novo (`setor`/`epi`/`ordenar`) testado isoladamente, verificando que a URL/query do `loadSummary` reflete o valor selecionado; `ordenar` testado nos três modos contra uma fixture de `celulas()` conhecida (ranking, nome, zona); `dentroDoPeriodo` testada como função pura com datas fixas (mesmo padrão de `inicioDoPeriodo`, sem mockar relógio).

---

## 5. Fora de escopo

- Tornar `Setor`/`EPI` filtros com múltipla seleção (hoje é um valor por vez, igual ao resto dos filtros do app).
- Detecção de violação para os quatro EPIs sem mapeamento hoje (colete, máscara, auricular, cinto) — depende de mudança no `cypher-capture`/modelo de EPI, fora do escopo desta entrega de front+summary.
- Gráfico de linha/barra real para a série de 7 dias do Dashboard — fora de escopo, não faz parte desta tela.
- Otimizar `historicoAnual` com agregação no banco — ver §1.6, registrado como limite conhecido.

---

## 6. Premissas

- `EPI_LIST` (front) e os rótulos de violação do `cypher-capture` continuam como estão — o mapeamento fixo em §1.4 é a ponte entre os dois vocabulários, não uma tentativa de unificá-los.
- Volume de dados de demonstração — ver §1.6.

---

## 7. `GET /reports/summary.pdf` também passa a respeitar os filtros

**Achado depois de escrever os planos (2026-09-08):** a spec original só ligava `period()` ao `since` do PDF, e mesmo assim só a metade de placar — a tabela de heatmap por estação dentro do PDF (`PdfReportBuilder`) sempre vinha de `summaryService.build()` sem argumento nenhum (sempre "hoje", sem filtro de turno/setor/EPI). Isso já era um descompasso visual antes desta entrega (o botão "Exportar PDF" fica ao lado da barra de filtros no Heatmap, sugerindo que os dois estão ligados) e ficaria mais visível depois — a tela passaria a filtrar de verdade enquanto o PDF continuaria sempre igual.

**Decisão:** `GET /reports/summary.pdf` ganha `turno`/`setor`/`epi` (além de `since`/`until`, que já existiam) e repassa todos pra `summaryService.build(...)` — a tabela de heatmap do PDF passa a bater exatamente com o que está filtrado na tela no momento do clique. Os KPIs ("Indicadores (hoje)") **continuam sempre hoje**, sem filtro nenhum — são ponto-no-tempo por definição (decisão já tomada na spec E6 §1.3, não reaberta aqui).

`since`/`until` do PDF passam a alimentar tanto o heatmap quanto o placar com a **mesma janela** (`PlacarService.janelaPadrao`, default últimos 7 dias) — antes só o placar usava essa janela; o heatmap do PDF ficava preso a "hoje" independente do que fosse pedido. Isso muda o default do heatmap do PDF de "hoje" para "últimos 7 dias" quando nenhum período é selecionado — consistente com o próprio default da tela (`period = signal('7d')`), não um comportamento nunca visto por um usuário normal.

Validação de `turno`/`epi` inválidos no PDF usa o mesmo `400` já definido em §1.2/§1.4 — `SummaryService.build(...)` já lança `CatalogValidationException` pra esses casos, e `/reports/summary.pdf` herda o comportamento automaticamente por reaproveitar o mesmo método.

Front: `HeatmapComponent.urlResumoPdf` passa a incluir `turno`/`setor`/`epi` junto do `since` que já mandava, usando os mesmos signals que os filtros da tela.

---

## 8. Ordem de implementação

1. **Backend.** `GET /summary` com os 6 parâmetros novos, incluindo `distribuicaoTemporal`/`historicoAnual` atrás de `detalhado=true`; em seguida `GET /reports/summary.pdf` ganha `turno`/`setor`/`epi` (§7). Verificável com `curl`.
2. **Frontend.** `HeatmapComponent`: filtros reais, ordenação real, os dois painéis fabricados substituídos pelos campos novos, `urlResumoPdf` passando os mesmos filtros (§7).
3. **Ponta a ponta.** Cada combinação de filtro testada manualmente contra dado real, heatmap Anual conferido em dezembro (limite do ano) e janeiro (início do ano) para o cálculo de faixa2h/diaSemana não vazar pro ano vizinho; PDF exportado com um filtro ativo conferido contra o que a tela mostra no mesmo instante.

Sem dependência cruzada com nenhuma entrega anterior — pode ser implementado inteiramente numa sessão, backend e front em paralelo (o front consome o shape final da resposta, mas os dois lados foram desenhados juntos nesta spec, então o contrato já está fechado).
