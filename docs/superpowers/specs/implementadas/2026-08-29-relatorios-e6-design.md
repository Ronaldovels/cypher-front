# Cypher E6 — Relatórios e Exportação

**Data:** 2026-08-29
**Status:** aprovado (design) — revisado em 2026-09-08 antes da execução (ver §8) e novamente no mesmo dia para reconciliar com UI existente não mapeada na spec original (ver §9)
**Escopo:** **Entrega E6** do roteiro (`2026-08-10-notificacao-de-incidentes-design.md` §14, última entrega) — exportação de incidentes e placar em CSV, e resumo executivo em PDF.

**Depende de:** `2026-08-29-multi-tenant-design.md` (implementado) e `2026-08-29-gamificacao-e5-design.md` (implementada, mergeada em 2026-09-08) — sem `GET /api/v1/placar`/`PlacarEquipeResponse`, não há o que exportar no CSV de placar e no PDF de resumo. Com E5 mergeada, as duas tarefas de cada plano (`e6a`/`e6b`) estão liberadas.

Registrado em E1 §14 como a primeira a ser cortada se o calendário apertar: "relatório não aparece em demonstração ao vivo, e `/summary` já cobre os números em tela" — decisão que este documento não reabre, só estrutura o que a entrega conteria se for priorizada.

---

## 1. Backend — três endpoints, sem estado novo

```
GET /api/v1/reports/incidents.csv    ?since&camera&severityMin&status
GET /api/v1/reports/placar.csv       ?since&until
GET /api/v1/reports/summary.pdf      ?since&until
```

Nenhuma entidade nova — os três endpoints são projeções de dados já existentes, sem introduzir estado próprio.

### 1.1 CSV de incidentes

Mesmos filtros já existentes em `GET /api/v1/incidents` (E3 §3) — reaproveita a query, só troca a serialização de JSON paginado para CSV completo do período. Biblioteca: **Apache Commons CSV** (escaping correto de vírgula/aspas sem reinventar), dependência leve, sem sobreposição com nada já usado no projeto.

Colunas: `id,incidentKey,cameraId,type,severity,nivel,reason,zoneName,detectedAt,endedAt,durationSeconds,status` — `empresaId` fica de fora (é plumbing de tenant, sem valor pro relatório; o endpoint já é escopado por empresa via `TenantContext`, então todo o CSV é de uma empresa só). `normaAplicavel` (campo que E5 acrescentou a `IncidentResponse`) também fica de fora nesta entrega — é redundante com `type`/`reason` na maioria dos casos e não estava na spec original; registrado como possível coluna futura, não bloqueia.

### 1.2 CSV do placar

Mesma agregação de `GET /api/v1/placar` (E5 §3.2), serializada linha por equipe.

**Colunas:** `equipeId,nome,turno,dadosSuficientes,conformidade,cobertura,sequenciaAtual,melhorSequencia,deltaConformidadeSemana`. `PlacarEquipeResponse` (E5, mergeada) tem 14 campos, incluindo `dadosSuficientes` — decisão de design da própria E5 §3.2, o estado "dados insuficientes" que tira a equipe do ranking. Excluir essa coluna do CSV perderia justamente a informação que motivou o campo; por isso ela entra, junto com `deltaConformidadeSemana` (mesmo dado exibido no front). Os quatro campos de meta (`metaConformidade`, `metaConformidadeAtingida`, `metaZeroSeveridade4Ativa`, `metaZeroSeveridade4Atingida`, `metaTempoReconhecimentoSegundos`) ficam de fora — são configuração da equipe (já visível em `/config/equipe`), não resultado do período exportado; podem entrar numa iteração futura se o consumidor do CSV pedir.

`conformidade` e `deltaConformidadeSemana` são nuláveis (equipe com `dadosSuficientes = false`) — o CSV imprime a célula vazia nesse caso (Commons CSV já lida com `null` sem erro), consistente com o front, que mostra a equipe fora da ordenação em vez de um número.

### 1.3 PDF de resumo executivo

Combina `/summary` (KPIs, heatmap, **série de 7 dias**) + `/placar` (ranking) num documento formatado — um resumo geral da operação com uma seção de desempenho de equipe embutida, não um relatório de gamificação. Biblioteca: **`openhtmltopdf`** (renderiza HTML/CSS para PDF, licença Apache) sobre um template HTML próprio do backend — não reaproveita os componentes Angular diretamente, é um documento para impressão/anexo com uma folha de estilo enxuta que espelha a paleta e tipografia do app (não os componentes interativos, que não fazem sentido em papel).

A série de 7 dias (`SummaryResponse.ultimosSeteDias`, já existente) entra como uma seção própria (lista dia/contagem — o `openhtmltopdf` não desenha gráfico sem uma lib de charting adicional, fora de escopo aqui) — tinha ficado de fora de uma revisão anterior deste documento por descuido (o dado já existe, não precisa de agregação nova), restaurada em §9.

**Escopo desta rodada:** o PDF cobre só o que `/summary` e `/placar` já agregam. Saúde de webhooks (taxa de entrega) e cobertura de análise por IA (`IncidentLlmAnalysis`) foram consideradas e adiadas — cada uma pediria um método de agregação novo no respectivo service; ficam candidatas a uma iteração futura, registradas em §5.

**Semântica de `?since&until`:** o parâmetro só escopa a seção de placar (`PlacarService.placar(since, until)`). `SummaryService.build()` não recebe período — é o mesmo ponto-no-tempo (hoje/ontem) que `/summary` já expõe em tela, sem parâmetro de janela. O documento rotula a seção de KPIs como "Indicadores (hoje)" para deixar isso explícito, em vez de sugerir que os KPIs também respeitam `since`/`until`. Ampliar `/summary` para aceitar período fica fora de escopo desta entrega.

**Equipe com `dadosSuficientes = false`:** a linha do placar no PDF mostra "dados insuficientes" no lugar do percentual de conformidade, em vez de formatar um `null` (que quebraria a geração do PDF — achado da revisão de 2026-09-08, ver §8).

**Rejeitado:** JasperReports (overhead de configuração desproporcional ao escopo de um único relatório) e montagem manual via PDFBox (reinventa layout de tabela que HTML/CSS já resolve de graça).

---

## 2. Front — três ações, três telas existentes, nenhuma rota nova

**Revisado em 2026-09-08 (§9):** a versão original desta seção desenhava uma rota `/relatorios` dedicada com as três ações. A revisão de design encontrou uma tela que a spec original não tinha mapeado — o Heatmap já tem um botão "Exportar PDF" (hoje decorativo, sem `href`/handler) dentro da sua barra de filtros, ao lado de um seletor de período (`hoje`/`7d`/`30d`/`90d`/`custom`) que também já existe mas não filtra nada ainda. Em vez de construir uma tela nova ao lado dessa UI já existente, a decisão foi **consolidar cada exportação na tela que já mostra o dado equivalente**, seguindo o mesmo princípio que a própria spec original já aplicava ao CSV de incidentes ("reaproveitar o estado de filtro em vez de duplicá-lo") — só que aplicado de forma mais completa, incluindo a tela que a primeira versão desta spec não tinha visto.

**Sem rota `/relatorios`, sem componente novo, sem item de dock novo.** As três ações:

- **CSV de incidentes** — dentro de `IncidentTimelineComponent`, reaproveitando os filtros que a tela já mantém (`camera`/`severityMin`/`status`/`since`). Inalterado da versão original desta spec.
- **PDF de resumo executivo** — liga o botão "Exportar PDF" que já existe no Heatmap. O valor de `period()` (já um signal do componente) mapeia para `since`/`until`: `hoje` → início do dia corrente; `7d`/`30d`/`90d` → `now - N dias`; `custom` não tem UI de intervalo por trás (nunca teve — é só um rótulo no chip) e por isso omite `since`/`until`, caindo no default do backend (últimos 7 dias) — não é uma regressão, é o mesmo estado (nulo) que o `custom` já tinha antes. Não faz parte desta entrega tornar `period()`/`shift()` filtros de verdade para o grid do heatmap — são decorativos desde antes da E6 e continuam assim; só o valor de `period()` passa a alimentar uma coisa real (a URL do PDF).
- **CSV de placar** — link simples no cabeçalho do painel (`panel-head`) de `PlacarComponent` (rota `/placar`, já existe desde a E5), sem seletor de período — a tela não tem um hoje, e adicionar um só para o CSV duplicaria estado por um ganho pequeno; o link não leva `since`/`until`, então baixa a mesma janela de 7 dias que o backend já usa como default (mesmo dado, mesma janela que o resto do placar já assume implicitamente).

**Download via link `<a href>` direto para o endpoint do backend** — mesmo padrão que `LiveFeedComponent` já usa para MJPEG cross-origin-mesmo-site: E4 §2.2 já confirma que `localhost:4200`/`:8080` são origens diferentes mas mesmo *site*, então o cookie de sessão `SameSite=Lax` acompanha a navegação/subrequest sem precisar de `fetch` + blob. Nenhum código de download customizado.

---

## 3. Comportamento sob falha

| Situação | Comportamento |
|---|---|
| Período sem incidentes | CSV com só o cabeçalho, sem erro |
| E5 não implementada ainda | `/reports/placar.csv` e `/reports/summary.pdf` não existem nesta entrega parcial — ver §"ordem de implementação" |
| Geração de PDF falha | `500` com corpo de erro consistente, mesmo padrão do resto da API |

---

## 4. Estratégia de testes

**Java** — corretude do CSV (escaping de campos com vírgula/aspas, filtros aplicados corretamente, cabeçalho presente mesmo sem dado); PDF gerado é um arquivo válido (assinatura de bytes `%PDF-`) com as seções esperadas (KPIs, heatmap, placar).

**Angular** — geração correta da URL/query string do link de download para cada combinação de filtro selecionado (o download em si não é testável em unit test — cobertura é sobre a composição do link).

---

## 5. Fora de escopo

- Relatórios agendados/por e-mail — canal de notificação além de webhook já registrado como fora do produto (E1 §9).
- Relatório customizável (usuário escolhe colunas/métricas exibidas).
- Integração com BI externo (PowerBI, Looker, etc.).
- Saúde de webhooks (taxa de entrega/falha) e cobertura de análise por IA no PDF de resumo — considerados na revisão de 2026-09-08 (§9), adiados porque cada um pede um método de agregação novo (ainda sem entidade nova, mas fora do que `/summary`/`/placar` já projetam); candidatos a uma iteração futura se o consumidor do relatório pedir.
- Tornar `period()`/`shift()` do Heatmap filtros reais para o grid — são decorativos desde antes da E6; esta entrega só passa a consumir `period()` para montar a URL do PDF, sem alterar o resto do comportamento da tela.

---

## 6. Premissas

- Multi-tenant (`2026-08-29-multi-tenant-design.md`) já implementado.
- Deploy de instância única (mesma premissa de sempre).

---

## 7. Ordem de implementação

1. **Backend — CSV de incidentes.** Independente de E5; pode ser feito assim que multi-tenant estiver pronto. Verificável com `curl`.
2. **Backend — CSV do placar e PDF de resumo.** Só depois de E5 (`GET /api/v1/placar`) estar implementada.
3. **Frontend.** As três ações espalhadas nas três telas que já mostram o dado equivalente (timeline, Heatmap, `/placar`) — sem tela nova (§2, revisado em §9).
4. **Ponta a ponta.** Exportar cada um dos três formatos contra dados reais e conferir abertura em ferramenta externa (planilha para CSV, leitor de PDF para o resumo).

O passo 1 pode ser entregue isoladamente mesmo que E5 ainda não exista — é a única peça desta spec sem dependência cruzada. Com E5 mergeada (2026-09-08), os passos 1 e 2 podem ser puxados juntos; o front (passo 3) não depende de contrato de resposta nenhum dos dois backends novos — só monta URLs de `<a href>` — então pode ser executado em paralelo ao backend, e não em série como a ordem acima sugere.

---

## 8. Revisão de design (2026-09-08, antes da execução)

Com E5 mergeada e os dois planos (`e6a`/`e6b`) liberados por inteiro, a spec e os dois planos foram comparados com o estado real dos repositórios (`PlacarEquipeResponse`, `SummaryService`, `AlertaRepository`, `environment.apiUrl`, `DockComponent`) antes de puxar os cards. Achados:

- **NPE no PDF.** `PlacarEquipeResponse.conformidade()` é `Double` nulável desde a E5 (§3.2, "dados insuficientes") — o plano `e6a` fazia `p.conformidade() * 100`, que desempacota `null` e quebra a geração do PDF assim que uma equipe está no estado "dados insuficientes" (que os dados de demo da E5 já povoam). Corrigido no plano: linha do placar no PDF mostra "dados insuficientes" nesse caso (§1.3 acima).
- **Colunas do CSV de placar eram 7 de 14 campos e omitiam `dadosSuficientes`.** Perderia a informação central da E5 §3.2. Resolvido em §1.2 acima — coluna incluída, metas ficam de fora por decisão (config, não resultado do período).
- **`summary.pdf?since&until` não escopava a metade de KPIs.** `SummaryService.build()` não aceita período; só `placarService.placar(...)` recebia `since`/`until` no plano. Não é um bug de implementação (o plano é fiel à spec original, que não detalhava isso) — é uma lacuna da spec, fechada em §1.3 acima: KPIs continuam ponto-no-tempo, rotulados "Indicadores (hoje)" no documento.
- **`new URL(...)` sem base, nos testes do front, lança `Invalid URL`.** `environment.apiUrl` é `/api/v1` (caminho relativo — funciona bem num `<a href>` real, resolvido pelo browser); mas o construtor `URL` do WHATWG exige uma URL absoluta quando nenhum segundo argumento (`base`) é passado. Confirmado com `node -e "new URL('/api/v1/...')"` → `Invalid URL`. Corrigido no plano `e6b`: os 5 asserts de URL passam `'http://localhost'` como base; nenhuma mudança no componente (o `href` relativo está correto).
- **Rota `/relatorios` sem entrada de navegação.** O plano `e6b` adiciona a rota em `app.routes.ts` e usa `activeKey="relatorios"` no dock, mas `DockComponent` não tem nenhum `DockItem` com essa key — a tela ficaria alcançável só digitando a URL. Corrigido no plano: passo adicional cria o item de dock (ícone cai no `@default` do `iconTpl`, aceitável para esta entrega — um `@case` dedicado é um follow-up cosmético, não bloqueante).
- **`AlertaRepository.buscar` + `Pageable.unpaged()` (Global Constraints do `e6a`) — verificado, sem gap.** É um `@Query` JPQL retornando `Page<Alerta>`; `Pageable.unpaged()` não adiciona `LIMIT`/`OFFSET` e não precisa de método novo, confirmando a premissa do plano.
- **Assimetria `since`/`until`** — `incidents.csv` só tem `since` (igual a `GET /api/v1/incidents` de origem, E3 §3), enquanto `placar.csv`/`summary.pdf` têm os dois. Isso está na spec como escrita originalmente (§1) — é uma nota de design, não um mismatch a corrigir.
- **Limite conhecido, não endereçado nesta entrega:** `Pageable.unpaged()` carrega o período inteiro em memória (`StringWriter`) antes de escrever a resposta — aceitável para o volume de uma demo, sem paginação/streaming. Registrar como follow-up se o volume de incidentes crescer.

Nenhum achado bloqueia a execução — todos foram corrigidos diretamente nos planos (`plans/e6-relatorios/`).

---

## 9. Reconciliação de UI (2026-09-08, mesmo dia — antes de puxar os cards)

Ao revisar o plano `e6b` contra as telas reais do app (parte da checagem do §8), apareceu algo que a spec original de 2026-08-29 nunca tinha visto: **o Heatmap já tem um botão "Exportar PDF"** na barra de filtros (`.fb-export`, `src/app/heatmap/heatmap.component.html`), ao lado de um seletor de período (`hoje`/`7d`/`30d`/`90d`/`custom`). Nenhum dos dois faz nada hoje — são sobra de uma passada de UI anterior à própria E6 (a barra de filtros inteira do Heatmap, incluindo os seletores de Setor/EPI/Turno, é decorativa; só `celulas()`/`top5()` são ligados a dado real). `.filterbar`/`.fb-export` não são reaproveitados em nenhuma outra tela — é uma classe própria do Heatmap, não um primitivo global como `.btn`/`.panel`/`.field`.

Isso trocou a pergunta de "onde colocar uma ação nova" para "esta ação já tem um lugar — só falta ligar". Decisão, com três opções avaliadas:

1. **Consolidar nas telas existentes** (escolhida) — liga o botão do Heatmap ao PDF de verdade, reaproveitando o `period()` que já está ali; CSV de placar ganha um link simples em `/placar`; nenhuma rota nova. Zero UI nova de verdade — só liga o que já existe e adiciona um link a uma tela que já existe.
2. Manter `/relatorios` como hub e o botão do Heatmap só navegar para lá — rejeitada: deixaria o seletor de período do Heatmap sem uso para este fim, e reintroduziria a rota + item de dock que só existiam para hospedar uma ação que já tem casa.
3. Híbrido (Heatmap dispara o PDF e `/relatorios` continua existindo como cópia) — rejeitada: duas ações que baixam o mesmo arquivo, exatamente a duplicação de estado que a spec original já evitava para o CSV de incidentes.

Junto com esta decisão, dois pontos adicionais fechados na mesma revisão (com o usuário, antes de escrever o plano):

- **Série de 7 dias no PDF** — a versão anterior deste documento (revisão de §8, mesmo dia) tinha deixado cair a menção original a "série de 7 dias" ao reescrever §1.3, sem virar uma decisão registrada — era uma omissão, não uma escolha. Restaurada em §1.3: `SummaryResponse.ultimosSeteDias` (já existente) entra como seção própria do PDF.
- **Escopo do PDF fica em `/summary` + `/placar`, sem expandir para webhooks/análise por IA nesta rodada** — ambos considerados (dado já existe em `WebhookDelivery`/`IncidentLlmAnalysis`), adiados por pedirem agregação nova; registrados em §5 como candidatos futuros.

Nenhum destes três pontos muda o backend (`e6a`) alem da série de 7 dias no PDF — a mudança de maior impacto é inteiramente no plano `e6b`, que perde a Tarefa 2 original (`RelatoriosComponent`, rota, dock) e ganha duas tarefas menores (ligar o botão do Heatmap; link de CSV em `/placar`). Ver `plans/e6-relatorios/2026-08-29-e6b-front-relatorios.md`.
