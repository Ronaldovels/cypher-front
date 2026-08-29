# Cypher E6 — Relatórios e Exportação

**Data:** 2026-08-29
**Status:** aprovado (design)
**Escopo:** **Entrega E6** do roteiro (`2026-08-10-notificacao-de-incidentes-design.md` §14, última entrega) — exportação de incidentes e placar em CSV, e resumo executivo em PDF.

**Depende de:** `2026-08-29-multi-tenant-design.md` implementado. O CSV de placar e o PDF de resumo executivo dependem também de `2026-08-29-gamificacao-e5-design.md` — sem `GET /api/v1/placar`, não há o que exportar nessas duas peças. O CSV de incidentes é independente e pode ser implementado mesmo que E5 ainda não exista.

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

### 1.2 CSV do placar

Mesma agregação de `GET /api/v1/placar` (E5 §3.2), serializada linha por equipe. Dependência direta de E5 — sem `MonitoramentoDiario`/campos de meta, não há dado para preencher as colunas.

### 1.3 PDF de resumo executivo

Combina `/summary` (KPIs, heatmap, série de 7 dias) + `/placar` (ranking, metas) num documento formatado. Biblioteca: **`openhtmltopdf`** (renderiza HTML/CSS para PDF, licença Apache) sobre um template HTML próprio do backend — não reaproveita os componentes Angular diretamente, é um documento para impressão/anexo com uma folha de estilo enxuta que espelha a paleta e tipografia do app (não os componentes interativos, que não fazem sentido em papel).

**Rejeitado:** JasperReports (overhead de configuração desproporcional ao escopo de um único relatório) e montagem manual via PDFBox (reinventa layout de tabela que HTML/CSS já resolve de graça).

---

## 2. Front — `/relatorios` (rota já mapeada em E1 §14.1)

**Nota de design:** a tela reaproveita 100% os primitivos globais já existentes em `src/styles.scss` (`.btn`, `.panel`, `.field` para o seletor de período) — mesmo princípio seguido em todas as specs anteriores desta rodada. Nenhum componente novo além do que já existe; o estado de filtro é reaproveitado, não duplicado (ver abaixo).

Três ações, cada uma com seletor de período — e, para o CSV de incidentes, os mesmos filtros da timeline, reaproveitando o estado de filtro já existente em `IncidentTimelineComponent` em vez de duplicá-lo numa tela nova.

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

---

## 6. Premissas

- Multi-tenant (`2026-08-29-multi-tenant-design.md`) já implementado.
- Deploy de instância única (mesma premissa de sempre).

---

## 7. Ordem de implementação

1. **Backend — CSV de incidentes.** Independente de E5; pode ser feito assim que multi-tenant estiver pronto. Verificável com `curl`.
2. **Backend — CSV do placar e PDF de resumo.** Só depois de E5 (`GET /api/v1/placar`) estar implementada.
3. **Frontend.** Tela `/relatorios` com as três ações, reaproveitando o estado de filtro da timeline.
4. **Ponta a ponta.** Exportar cada um dos três formatos contra dados reais e conferir abertura em ferramenta externa (planilha para CSV, leitor de PDF para o resumo).

O passo 1 pode ser entregue isoladamente mesmo que E5 ainda não exista — é a única peça desta spec sem dependência cruzada.
