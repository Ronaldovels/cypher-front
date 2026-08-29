# E6-A — Backend: Relatórios e Exportação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Três projeções de dados já existentes, sem estado novo: CSV de incidentes, CSV de placar e PDF de resumo executivo.

**Architecture:** Duas fatias com dependências diferentes. **Tarefa 1 (CSV de incidentes) é independente e pode ser executada agora** — reaproveita `IncidentService.search` já existente, só troca a serialização JSON-paginado por CSV completo do período (Apache Commons CSV). **Tarefa 2 (CSV de placar + PDF de resumo) depende do plano `2026-08-29-e5a-backend-gamificacao.md` estar implementado** (`PlacarService`/`PlacarEquipeResponse` precisam existir) — não iniciar a Tarefa 2 antes disso, mesmo que a Tarefa 1 já esteja em produção.

**Tech Stack:** Spring Boot 4.0.6, Apache Commons CSV (novo), `openhtmltopdf-pdfbox` (novo), JUnit 5, AssertJ, MockMvc.

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-relatorios-e6-design.md` (repo `cypher-front`), §1 (endpoints), §1.1/§1.2/§1.3, §3 (comportamento sob falha).

**Repositório:** `/home/asaas/projects/cypher`

## Global Constraints

- Repositório: `/home/asaas/projects/cypher`. **Depende do plano `2026-08-29-mta-backend-empresa.md` já mergeado.** Branch: `feat/e6-backend-relatorios`, a partir de `main`.
- **Nenhuma entidade nova, nenhum estado novo** (spec §1) — os três endpoints são projeções de dados já persistidos.
- **`GET /api/v1/reports/*` é GESTOR-only**, sem escopo de `estacaoId` de OPERADOR — relatório é ação de gestão, não de operação de estação. Nenhuma linha explícita em `SecurityConfig`; cai no catch-all `hasRole("GESTOR")`, mesmo padrão de `/teams`/`/users`/`/webhooks`/CRUD de zonas/`/placar`.
- **CSV usa `Pageable.unpaged()`** sobre os métodos de repositório já existentes (`AlertaRepository.buscar`) — spring Data JPA executa a `@Query` sem `LIMIT`/`OFFSET` quando o `Pageable` é `unpaged()`; nenhum método de repositório novo é necessário para o CSV de incidentes.
- **PDF é `openhtmltopdf` sobre um template HTML/CSS próprio do backend** — não reaproveita nenhum componente Angular (spec §1.3, rejeitando JasperReports/PDFBox manual).
- **A Tarefa 2 não deve ser iniciada antes do plano `e5a-backend-gamificacao.md` estar implementado** (`PlacarService`/`PlacarEquipeResponse` são pré-requisito direto) — a Tarefa 1 não tem essa dependência e pode seguir isoladamente (spec §7).
- Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=NomeDaClasse` para uma classe; `./mvnw -o test` para a suíte inteira.

---

### Task 1: CSV de incidentes (independente de E5)

**Files:**
- Modify: `pom.xml`
- Create: `src/main/java/com/dev4/cypher/report/CsvReportBuilder.java`
- Create: `src/main/java/com/dev4/cypher/controller/ReportController.java`
- Test: `src/test/java/com/dev4/cypher/ReportControllerApiTest.java`

**Interfaces:**
- Produces: `GET /api/v1/reports/incidents.csv?since&camera&severityMin&status` → `text/csv`

- [ ] **Step 1: Adicionar a dependência**

Em `pom.xml`, logo após a dependência `spring-boot-starter-validation`:

```xml
		<dependency>
			<groupId>org.apache.commons</groupId>
			<artifactId>commons-csv</artifactId>
			<version>1.11.0</version>
		</dependency>
```

- [ ] **Step 2: Escrever o teste**

Criar `src/test/java/com/dev4/cypher/ReportControllerApiTest.java`:

```java
package com.dev4.cypher;

import com.dev4.cypher.security.AuthTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@Transactional
@AutoConfigureMockMvc
class ReportControllerApiTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void csvDeIncidentesTemCabecalhoMesmoSemDado() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);

        String csv = mvc.perform(get("/api/v1/reports/incidents.csv")
                        .param("camera", "CAM-QUE-NAO-EXISTE-NESTE-TESTE").session(session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(csv).startsWith("id,incidentKey,cameraId,type,severity,nivel,reason,zoneName,detectedAt,endedAt,durationSeconds,status");
        // So o cabecalho: nenhuma linha de dado para uma camera que nao existe.
        assertThat(csv.trim().split("\r\n")).hasSize(1);
    }

    @Test
    void csvDeIncidentesContemUmaLinhaPorIncidenteDaCamera() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);
        String apiKey = criarCameraEPegarApiKey(session, "CAM-RPT1", "EST-01");

        mvc.perform(post("/api/v1/incidents").header("X-Cypher-Key", apiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payloadDeIncidente("CAM-RPT1", "incident-rpt-1")));

        String csv = mvc.perform(get("/api/v1/reports/incidents.csv")
                        .param("camera", "CAM-RPT1").session(session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(csv.trim().split("\r\n")).hasSize(2); // cabecalho + 1 linha
        assertThat(csv).contains("CAM-RPT1");
    }

    private String criarCameraEPegarApiKey(MockHttpSession session, String codigo, String estacaoId) throws Exception {
        mvc.perform(post("/api/v1/stations").session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"" + estacaoId + "\", \"nome\": \"E\", \"setor\": \"x\", \"ativa\": true}"));
        mvc.perform(post("/api/v1/cameras").session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(("{\"id\": \"%s\", \"nome\": \"C\", \"estacaoId\": \"%s\", "
                        + "\"streamUrl\": \"http://127.0.0.1:9200/stream\", \"ativa\": true}")
                        .formatted(codigo, estacaoId)));
        String corpo = mvc.perform(post("/api/v1/cameras/" + codigo + "/apikey/regenerate").session(session))
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(corpo, "$.apiKey");
    }

    private String payloadDeIncidente(String cameraId, String incidentKey) {
        return ("{\"incidentKey\": \"%s\", \"cameraId\": \"%s\", \"runId\": \"run-1\", \"trackId\": 1, "
                + "\"type\": \"FALL_RISK\", \"severity\": 3, \"reason\": \"fallen_sustained\", "
                + "\"postureCategory\": \"fallen\", \"rebaScore\": 11, \"actionLevel\": 3, "
                + "\"zoneStatus\": \"outside\", \"detectedAt\": \"2026-08-29T10:00:00Z\"}")
                .formatted(incidentKey, cameraId);
    }
}
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=ReportControllerApiTest`
Expected: FAIL na compilação — `CsvReportBuilder`/`ReportController` não existem.

- [ ] **Step 4: Criar `CsvReportBuilder`**

Criar `src/main/java/com/dev4/cypher/report/CsvReportBuilder.java`:

```java
package com.dev4.cypher.report;

import com.dev4.cypher.dto.IncidentResponse;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;

import java.io.IOException;
import java.io.StringWriter;
import java.util.List;

/**
 * Serialização CSV de projeções já existentes (spec E6 §1) — nenhum estado
 * novo, só troca a representação de JSON paginado para arquivo completo do
 * período. Apache Commons CSV cuida do escaping de vírgula/aspas.
 */
public final class CsvReportBuilder {

    private static final String[] CABECALHO_INCIDENTES = {
            "id", "incidentKey", "cameraId", "type", "severity", "nivel", "reason",
            "zoneName", "detectedAt", "endedAt", "durationSeconds", "status",
    };

    private CsvReportBuilder() {
    }

    public static String incidentesParaCsv(List<IncidentResponse> incidentes) throws IOException {
        StringWriter writer = new StringWriter();
        CSVFormat format = CSVFormat.DEFAULT.builder().setHeader(CABECALHO_INCIDENTES).build();
        try (CSVPrinter printer = new CSVPrinter(writer, format)) {
            for (IncidentResponse i : incidentes) {
                printer.printRecord(i.id(), i.incidentKey(), i.cameraId(), i.type(), i.severity(),
                        i.nivel(), i.reason(), i.zoneName(), i.detectedAt(), i.endedAt(),
                        i.durationSeconds(), i.status());
            }
        }
        return writer.toString();
    }
}
```

- [ ] **Step 5: Criar `ReportController`**

Criar `src/main/java/com/dev4/cypher/controller/ReportController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.IncidentResponse;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.report.CsvReportBuilder;
import com.dev4.cypher.service.IncidentService;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;

/**
 * Projeções em arquivo de dados já existentes (spec E6 §1) — GESTOR-only,
 * sem escopo de estação de OPERADOR: relatório é ação de gestão.
 */
@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final IncidentService incidentService;

    public ReportController(IncidentService incidentService) {
        this.incidentService = incidentService;
    }

    @GetMapping("/incidents.csv")
    public ResponseEntity<byte[]> incidentsCsv(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since,
            @RequestParam(required = false) String camera,
            @RequestParam(required = false) Integer severityMin,
            @RequestParam(required = false) AlertaStatus status) throws IOException {
        java.util.List<IncidentResponse> incidentes = incidentService
                .search(since, camera, severityMin, status, null, Pageable.unpaged())
                .getContent();
        String csv = CsvReportBuilder.incidentesParaCsv(incidentes);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=incidentes.csv")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(csv.getBytes(StandardCharsets.UTF_8));
    }
}
```

(`estacaoId` sempre `null` no `search(...)` — este endpoint é GESTOR-only, nunca chamado no contexto de um `OperadorAuthentication`, então não há escopo de estação a aplicar.)

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=ReportControllerApiTest`
Expected: PASS

- [ ] **Step 7: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add pom.xml src/main/java/com/dev4/cypher/report/CsvReportBuilder.java \
        src/main/java/com/dev4/cypher/controller/ReportController.java \
        src/test/java/com/dev4/cypher/ReportControllerApiTest.java
git commit -m "feat: adiciona exportacao de incidentes em CSV"
```

---

### Task 2: CSV de placar e PDF de resumo executivo

> **Pré-requisito:** `2026-08-29-e5a-backend-gamificacao.md` implementado (`PlacarService`/`PlacarEquipeResponse` precisam existir e estar compilando em `main`). Não iniciar esta tarefa antes disso — ela depende diretamente desses tipos.

**Files:**
- Modify: `pom.xml`
- Modify: `src/main/java/com/dev4/cypher/report/CsvReportBuilder.java`
- Create: `src/main/java/com/dev4/cypher/report/PdfReportBuilder.java`
- Modify: `src/main/java/com/dev4/cypher/controller/ReportController.java`
- Test: `src/test/java/com/dev4/cypher/ReportControllerApiTest.java`

**Interfaces:**
- Consumes: `PlacarService.placar(OffsetDateTime, OffsetDateTime)`, `PlacarEquipeResponse` (plano `e5a`), `SummaryService` (já existente)
- Produces: `GET /api/v1/reports/placar.csv?since&until` → `text/csv`; `GET /api/v1/reports/summary.pdf?since&until` → `application/pdf`

- [ ] **Step 1: Adicionar a dependência**

Em `pom.xml`, logo após `commons-csv`:

```xml
		<dependency>
			<groupId>com.openhtmltopdf</groupId>
			<artifactId>openhtmltopdf-pdfbox</artifactId>
			<version>1.0.10</version>
		</dependency>
```

- [ ] **Step 2: Escrever os testes**

Adicionar em `ReportControllerApiTest.java`:

```java
    @Test
    void csvDePlacarTemCabecalhoEUmaLinhaPorEquipe() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);
        mvc.perform(post("/api/v1/teams").session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"EQ-RPT1\", \"nome\": \"Equipe Rpt\", \"turno\": \"MANHA\", "
                        + "\"estacaoIds\": [], \"ativa\": true}"));

        String csv = mvc.perform(get("/api/v1/reports/placar.csv").session(session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(csv).startsWith("equipeId,nome,turno,conformidade,cobertura,sequenciaAtual,melhorSequencia");
        assertThat(csv).contains("Equipe Rpt");
    }

    @Test
    void pdfDeResumoComecaComAAssinaturaDeBytesPdf() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);

        byte[] pdf = mvc.perform(get("/api/v1/reports/summary.pdf").session(session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        assertThat(new String(pdf, 0, 5, java.nio.charset.StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    }
```

(`TeamRequest` exige `estacaoIds` não vazio, per o plano `e4`/`mta` — se a validação bloquear lista vazia, ajustar o corpo do teste para uma estação real já criada, seguindo o padrão dos demais testes deste arquivo.)

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=ReportControllerApiTest`
Expected: FAIL — `.../placar.csv`/`.../summary.pdf` não existem.

- [ ] **Step 4: Adicionar `placarParaCsv` a `CsvReportBuilder`**

```java
    private static final String[] CABECALHO_PLACAR = {
            "equipeId", "nome", "turno", "conformidade", "cobertura", "sequenciaAtual", "melhorSequencia",
    };

    public static String placarParaCsv(List<PlacarEquipeResponse> placar) throws IOException {
        StringWriter writer = new StringWriter();
        CSVFormat format = CSVFormat.DEFAULT.builder().setHeader(CABECALHO_PLACAR).build();
        try (CSVPrinter printer = new CSVPrinter(writer, format)) {
            for (PlacarEquipeResponse p : placar) {
                printer.printRecord(p.equipeId(), p.nome(), p.turno(), p.conformidade(), p.cobertura(),
                        p.sequenciaAtual(), p.melhorSequencia());
            }
        }
        return writer.toString();
    }
```

(adicionar o import `com.dev4.cypher.dto.PlacarEquipeResponse`.)

- [ ] **Step 5: Criar `PdfReportBuilder`**

Criar `src/main/java/com/dev4/cypher/report/PdfReportBuilder.java`:

```java
package com.dev4.cypher.report;

import com.dev4.cypher.dto.PlacarEquipeResponse;
import com.dev4.cypher.dto.SummaryResponse;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

/**
 * Resumo executivo (spec E6 §1.3): combina `/summary` + `/placar` num
 * template HTML/CSS próprio, renderizado a PDF via openhtmltopdf — não
 * reaproveita nenhum componente Angular, é um documento para impressão.
 */
public final class PdfReportBuilder {

    private PdfReportBuilder() {
    }

    public static byte[] resumoExecutivo(SummaryResponse summary, List<PlacarEquipeResponse> placar) throws IOException {
        String html = montarHtml(summary, placar);
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        PdfRendererBuilder builder = new PdfRendererBuilder();
        builder.useFastMode();
        builder.withHtmlContent(html, null);
        builder.toStream(saida);
        try {
            builder.run();
        } catch (Exception e) {
            throw new IOException("Falha ao gerar PDF de resumo executivo", e);
        }
        return saida.toByteArray();
    }

    private static String montarHtml(SummaryResponse s, List<PlacarEquipeResponse> placar) {
        StringBuilder html = new StringBuilder();
        html.append("<html><head><style>")
            .append("body{font-family:sans-serif;color:#222}h1{color:#F4622A}")
            .append("table{width:100%;border-collapse:collapse;margin-top:8px}")
            .append("td,th{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px}")
            .append("</style></head><body>");

        html.append("<h1>Resumo executivo — Cypher</h1>");
        html.append("<h2>Indicadores</h2><ul>")
            .append("<li>Incidentes hoje: ").append(s.incidentesHoje()).append("</li>")
            .append("<li>Incidentes ontem: ").append(s.incidentesOntem()).append("</li>")
            .append("<li>Críticos hoje: ").append(s.criticosHoje()).append("</li>")
            .append("<li>Pendentes: ").append(s.pendentes()).append("</li></ul>");

        html.append("<h2>Heatmap por estação</h2><table><tr><th>Estação</th><th>Setor</th><th>Incidentes</th></tr>");
        for (SummaryResponse.StationCell celula : s.heatmap()) {
            html.append("<tr><td>").append(celula.nome()).append("</td><td>").append(celula.setor())
                .append("</td><td>").append(celula.incidentes()).append("</td></tr>");
        }
        html.append("</table>");

        html.append("<h2>Placar de conformidade</h2><table><tr><th>Equipe</th><th>Conformidade</th><th>Cobertura</th></tr>");
        for (PlacarEquipeResponse p : placar) {
            html.append("<tr><td>").append(p.nome()).append("</td><td>")
                .append(String.format("%.0f%%", p.conformidade() * 100)).append("</td><td>")
                .append(String.format("%.0f%%", p.cobertura() * 100)).append("</td></tr>");
        }
        html.append("</table></body></html>");
        return html.toString();
    }
}
```

- [ ] **Step 6: Adicionar os dois endpoints ao `ReportController`**

```java
    private final PlacarService placarService;
    private final SummaryService summaryService;

    public ReportController(IncidentService incidentService, PlacarService placarService,
                            SummaryService summaryService) {
        this.incidentService = incidentService;
        this.placarService = placarService;
        this.summaryService = summaryService;
    }

    @GetMapping("/placar.csv")
    public ResponseEntity<byte[]> placarCsv(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime until) throws IOException {
        OffsetDateTime fim = until != null ? until : OffsetDateTime.now();
        OffsetDateTime inicio = since != null ? since : fim.minusDays(7);
        String csv = CsvReportBuilder.placarParaCsv(placarService.placar(inicio, fim));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=placar.csv")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(csv.getBytes(StandardCharsets.UTF_8));
    }

    @GetMapping("/summary.pdf")
    public ResponseEntity<byte[]> summaryPdf(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime until) throws IOException {
        OffsetDateTime fim = until != null ? until : OffsetDateTime.now();
        OffsetDateTime inicio = since != null ? since : fim.minusDays(7);
        byte[] pdf = PdfReportBuilder.resumoExecutivo(summaryService.build(), placarService.placar(inicio, fim));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=resumo.pdf")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }
```

(adicionar os imports `com.dev4.cypher.service.PlacarService`, `com.dev4.cypher.service.SummaryService`, `com.dev4.cypher.report.PdfReportBuilder`. `SummaryService.build()` é o método já existente que devolve `SummaryResponse` — confirmado em `src/main/java/com/dev4/cypher/service/SummaryService.java:39`.)

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=ReportControllerApiTest`
Expected: PASS

- [ ] **Step 8: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: adiciona exportacao de placar em CSV e resumo executivo em PDF"
```

---

## Self-Review

**Cobertura da spec:** §1.1 (CSV de incidentes) → Tarefa 1. §1.2 (CSV de placar) → Tarefa 2. §1.3 (PDF de resumo, bibliotecas escolhidas/rejeitadas) → Tarefa 2, `PdfReportBuilder`. §3 (comportamento sob falha: período sem incidentes → só cabeçalho) → testado explicitamente na Tarefa 1. §7 ("passo 1 pode ser entregue isoladamente mesmo que E5 ainda não exista") → refletido na estrutura de duas tarefas com o pré-requisito só na segunda.

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** `CsvReportBuilder`/`PdfReportBuilder` são classes utilitárias sem estado, consumidas só pelo `ReportController`; `PlacarEquipeResponse`/`SummaryResponse` são os tipos exatos já definidos em `e5a-backend-gamificacao.md` e `SummaryService` (existente), sem duplicação.

---

**Plan complete and saved to `docs/superpowers/plans/e6-relatorios/2026-08-29-e6a-backend-relatorios.md`.**
