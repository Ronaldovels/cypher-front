# MCD — Servidor MCP e as 8 tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar `spring-ai-starter-mcp-server-webmvc` ao backend `cypher` e expor 8 tools (`list_incidents`, `get_incident`, `get_incident_analysis`, `analyze_incident`, `list_cameras`, `list_stations`, `get_summary`, `get_placar`) que chamam os services de domínio já existentes.

**Architecture:** Três classes `@Component` de tools (`IncidentMcpTools`, `CatalogMcpTools`, `DashboardMcpTools`), cada uma injetando os services já existentes e anotando métodos finos com `@McpTool`/`@McpToolParam` — sem lógica de negócio nova, só tradução de parâmetros MCP para as assinaturas reais dos services. Servidor MCP montado automaticamente pelo starter no path `/mcp`, protocolo `STREAMABLE`, protegido por `McpKeyAuthenticationFilter` (MCC).

**Tech Stack:** Spring AI 2.0 (`spring-ai-bom`, `spring-ai-starter-mcp-server-webmvc`), Jackson 3 (serialização automática de records).

**Spec:** `docs/superpowers/specs/planejadas/2026-09-20-mcp-server-design.md`

## Global Constraints

- Requer Spring Boot 4.1+ (MCA) já aplicado.
- Requer `McpKeyAuthenticationFilter` protegendo `/mcp/**` (MCC) já aplicado — sem isso, as tools ficam acessíveis sem autenticação.
- Nenhuma tool de escrita além de `analyze_incident` (que aciona o LLM, não muta cadastro).
- `analyze_incident` deve ter a descrição da tool explicitando que é uma operação lenta (até ~1min) — para o agente não tratar como instantânea.
- Retornos são records (`IncidentResponse`, `SummaryResponse` etc.) — serializados automaticamente via Jackson 3, sem DTO MCP intermediário.

---

### Task 1: Dependência Spring AI MCP Server e configuração

**Files:**
- Modify: `/home/asaas/projects/cypher/pom.xml`
- Modify: `/home/asaas/projects/cypher/src/main/resources/application.yaml`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/CypherApplicationTests.java` (ou nome real do teste de contexto — ver Step 4)

**Interfaces:**
- Produces: contexto Spring sobe com o servidor MCP registrado no path `/mcp`, protocolo `STREAMABLE`; classes `@McpTool` (Tasks 2-4) passam a ser descobertas automaticamente por scanning de componentes.

- [ ] **Step 1: Adicionar o BOM do Spring AI ao `pom.xml`**

Dentro da tag `<dependencyManagement><dependencies>` (criar a seção se não existir, logo antes de `</project>` ou perto de `<dependencies>` existente):

```xml
	<dependencyManagement>
		<dependencies>
			<dependency>
				<groupId>org.springframework.ai</groupId>
				<artifactId>spring-ai-bom</artifactId>
				<version>2.0.1</version>
				<type>pom</type>
				<scope>import</scope>
			</dependency>
		</dependencies>
	</dependencyManagement>
```

- [ ] **Step 2: Adicionar o starter dentro de `<dependencies>`**

```xml
		<dependency>
			<groupId>org.springframework.ai</groupId>
			<artifactId>spring-ai-starter-mcp-server-webmvc</artifactId>
		</dependency>
```

- [ ] **Step 3: Configurar o protocolo e o endpoint em `application.yaml`**

Adicionar ao final do arquivo:

```yaml
spring:
  ai:
    mcp:
      server:
        name: cypher-mcp-server
        version: 0.0.1
        protocol: STREAMABLE
        type: SYNC
```

- [ ] **Step 4: Confirmar que o contexto Spring sobe com a nova dependência**

Localizar o teste de contexto existente (`grep -rl "SpringBootTest" src/test/java/com/dev4/cypher/*.java | xargs grep -l "class.*Tests"` ou verificar se existe um `CypherApplicationTests.java`; se não existir nenhum teste puro de "contexto sobe", usar `McpCredentialApiTest` de MCB, que já é `@SpringBootTest`, como sinal indireto).

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpCredentialApiTest test`
Expected: PASS (se o contexto não sobe por causa de configuração inválida do Spring AI, este teste já falharia por erro de bootstrap do `ApplicationContext`, não pelo teste em si)

- [ ] **Step 5: Descobrir o path real montado pelo Spring AI e ajustar o matcher de `SecurityConfig` se necessário**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q spring-boot:run &` (em background) e, após o boot, `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8080/mcp`
Expected: `401` (confirma que o path é `/mcp` e que `McpKeyAuthenticationFilter` de MCC está protegendo). Se vier `404`, o path real é outro — inspecionar o log de boot (`grep -i "mcp" nos logs do mvnw`) para achar o path efetivo e atualizar `.requestMatchers("/mcp/**")` em `SecurityConfig.java` (MCC Task 4) para o path correto.

Encerrar o processo em background depois do teste: `pkill -f spring-boot:run` (ou `Ctrl+C` se executado em foreground).

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/cypher
git add pom.xml src/main/resources/application.yaml
git commit -m "feat: adiciona spring-ai-starter-mcp-server-webmvc (protocolo STREAMABLE)"
```

---

### Task 2: Tools de incidentes (`IncidentMcpTools`)

**Files:**
- Create: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/mcp/IncidentMcpTools.java`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/mcp/IncidentMcpToolsTest.java`

**Interfaces:**
- Consumes: `IncidentService.search(OffsetDateTime, String, Integer, AlertaStatus, String, Pageable)` → `Page<IncidentResponse>`; `IncidentService.findById(Long)` → `Optional<IncidentResponse>` (ambos em `com.dev4.cypher.service.IncidentService`); `LlmAnalysisService.ultimaAnalise(Long)` → `Optional<RiskAnalysisResponse>`; `LlmAnalysisService.analisar(Long)` → `RiskAnalysisResponse` (ambos em `com.dev4.cypher.llm.LlmAnalysisService`).
- Produces: tools `list_incidents`, `get_incident`, `get_incident_analysis`, `analyze_incident`.

- [ ] **Step 1: Escrever o teste que falha**

```java
package com.dev4.cypher.mcp;

import com.dev4.cypher.dto.IncidentResponse;
import com.dev4.cypher.dto.RiskAnalysisResponse;
import com.dev4.cypher.llm.LlmAnalysisService;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.service.IncidentService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

class IncidentMcpToolsTest {

    private final IncidentService incidentes = Mockito.mock(IncidentService.class);
    private final LlmAnalysisService llm = Mockito.mock(LlmAnalysisService.class);
    private final IncidentMcpTools tools = new IncidentMcpTools(incidentes, llm);

    @Test
    void listIncidentsDelegaParaSearchComPaginacaoPadrao() {
        Page<IncidentResponse> pagina = new PageImpl<>(List.of());
        when(incidentes.search(isNull(), eq("CAM-01"), eq(2), isNull(), isNull(), any(Pageable.class)))
                .thenReturn(pagina);

        Page<IncidentResponse> resultado = tools.listIncidents(null, "CAM-01", 2, null, 0, 20);

        assertThat(resultado).isSameAs(pagina);
    }

    @Test
    void getIncidentDelegaParaFindById() {
        IncidentResponse resposta = Mockito.mock(IncidentResponse.class);
        when(incidentes.findById(10L)).thenReturn(Optional.of(resposta));

        Optional<IncidentResponse> resultado = tools.getIncident(10L);

        assertThat(resultado).contains(resposta);
    }

    @Test
    void getIncidentAnalysisDelegaParaUltimaAnaliseSemChamarOLlm() {
        RiskAnalysisResponse resposta = Mockito.mock(RiskAnalysisResponse.class);
        when(llm.ultimaAnalise(10L)).thenReturn(Optional.of(resposta));

        Optional<RiskAnalysisResponse> resultado = tools.getIncidentAnalysis(10L);

        assertThat(resultado).contains(resposta);
        Mockito.verify(llm, Mockito.never()).analisar(Mockito.anyLong());
    }

    @Test
    void analyzeIncidentDelegaParaAnalisar() {
        RiskAnalysisResponse resposta = Mockito.mock(RiskAnalysisResponse.class);
        when(llm.analisar(10L)).thenReturn(resposta);

        RiskAnalysisResponse resultado = tools.analyzeIncident(10L);

        assertThat(resultado).isSameAs(resposta);
    }
}
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=IncidentMcpToolsTest test`
Expected: FAIL (`IncidentMcpTools` ainda não existe)

- [ ] **Step 3: Implementar**

```java
package com.dev4.cypher.mcp;

import com.dev4.cypher.dto.IncidentResponse;
import com.dev4.cypher.dto.RiskAnalysisResponse;
import com.dev4.cypher.llm.LlmAnalysisService;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.service.IncidentService;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.Optional;

/** Tools MCP de leitura/análise de incidentes — delega inteiramente para IncidentService/LlmAnalysisService. */
@Component
public class IncidentMcpTools {

    private final IncidentService incidentes;
    private final LlmAnalysisService llm;

    public IncidentMcpTools(IncidentService incidentes, LlmAnalysisService llm) {
        this.incidentes = incidentes;
        this.llm = llm;
    }

    @McpTool(name = "list_incidents", description = "Lista incidentes da empresa, com filtros opcionais.")
    public Page<IncidentResponse> listIncidents(
            @McpToolParam(description = "Data/hora mínima (ISO-8601), ou null para sem filtro", required = false)
            OffsetDateTime since,
            @McpToolParam(description = "Código da câmera, ou null para todas", required = false)
            String cameraId,
            @McpToolParam(description = "Severidade mínima (0-4), ou null para sem filtro", required = false)
            Integer severityMin,
            @McpToolParam(description = "Status do incidente (ABERTO/FECHADO), ou null para todos", required = false)
            AlertaStatus status,
            @McpToolParam(description = "Página (0-based)", required = true) int page,
            @McpToolParam(description = "Tamanho da página", required = true) int size) {
        return incidentes.search(since, cameraId, severityMin, status, null, PageRequest.of(page, size));
    }

    @McpTool(name = "get_incident", description = "Busca um incidente pelo id.")
    public Optional<IncidentResponse> getIncident(
            @McpToolParam(description = "Id do incidente", required = true) Long id) {
        return incidentes.findById(id);
    }

    @McpTool(name = "get_incident_analysis",
            description = "Le a ultima analise de risco (via LLM) ja calculada para um incidente, sem acionar o LLM. Rapido.")
    public Optional<RiskAnalysisResponse> getIncidentAnalysis(
            @McpToolParam(description = "Id do incidente", required = true) Long id) {
        return llm.ultimaAnalise(id);
    }

    @McpTool(name = "analyze_incident",
            description = "Aciona uma nova analise de risco via LLM para um incidente. "
                    + "OPERACAO LENTA: pode levar ate ~1 minuto (retries com backoff embutidos). "
                    + "Use get_incident_analysis se uma analise ja calculada for suficiente.")
    public RiskAnalysisResponse analyzeIncident(
            @McpToolParam(description = "Id do incidente", required = true) Long id) {
        return llm.analisar(id);
    }
}
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=IncidentMcpToolsTest test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/mcp/IncidentMcpTools.java \
        src/test/java/com/dev4/cypher/mcp/IncidentMcpToolsTest.java
git commit -m "feat: adiciona tools MCP de incidentes"
```

---

### Task 3: Tools de catálogo (`CatalogMcpTools`)

**Files:**
- Create: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/mcp/CatalogMcpTools.java`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/mcp/CatalogMcpToolsTest.java`

**Interfaces:**
- Consumes: `CatalogService.cameras(boolean)` → `List<CameraResponse>`; `CatalogService.stations(boolean)` → `List<StationResponse>` (ambos em `com.dev4.cypher.service.CatalogService`).
- Produces: tools `list_cameras`, `list_stations`.

- [ ] **Step 1: Escrever o teste que falha**

```java
package com.dev4.cypher.mcp;

import com.dev4.cypher.dto.CameraResponse;
import com.dev4.cypher.dto.StationResponse;
import com.dev4.cypher.service.CatalogService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

class CatalogMcpToolsTest {

    private final CatalogService catalog = Mockito.mock(CatalogService.class);
    private final CatalogMcpTools tools = new CatalogMcpTools(catalog);

    @Test
    void listCamerasDelegaParaCatalogService() {
        List<CameraResponse> lista = List.of(Mockito.mock(CameraResponse.class));
        when(catalog.cameras(false)).thenReturn(lista);

        assertThat(tools.listCameras(false)).isSameAs(lista);
    }

    @Test
    void listStationsDelegaParaCatalogService() {
        List<StationResponse> lista = List.of(Mockito.mock(StationResponse.class));
        when(catalog.stations(true)).thenReturn(lista);

        assertThat(tools.listStations(true)).isSameAs(lista);
    }
}
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=CatalogMcpToolsTest test`
Expected: FAIL (`CatalogMcpTools` ainda não existe)

- [ ] **Step 3: Implementar**

```java
package com.dev4.cypher.mcp;

import com.dev4.cypher.dto.CameraResponse;
import com.dev4.cypher.dto.StationResponse;
import com.dev4.cypher.service.CatalogService;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.stereotype.Component;

import java.util.List;

/** Tools MCP de catálogo (câmeras/estações) — delega inteiramente para CatalogService. */
@Component
public class CatalogMcpTools {

    private final CatalogService catalog;

    public CatalogMcpTools(CatalogService catalog) {
        this.catalog = catalog;
    }

    @McpTool(name = "list_cameras", description = "Lista as câmeras cadastradas na empresa.")
    public List<CameraResponse> listCameras(
            @McpToolParam(description = "Incluir câmeras inativas", required = true) boolean incluirInativas) {
        return catalog.cameras(incluirInativas);
    }

    @McpTool(name = "list_stations", description = "Lista as estações cadastradas na empresa.")
    public List<StationResponse> listStations(
            @McpToolParam(description = "Incluir estações inativas", required = true) boolean incluirInativas) {
        return catalog.stations(incluirInativas);
    }
}
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=CatalogMcpToolsTest test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/mcp/CatalogMcpTools.java \
        src/test/java/com/dev4/cypher/mcp/CatalogMcpToolsTest.java
git commit -m "feat: adiciona tools MCP de catalogo (cameras/estacoes)"
```

---

### Task 4: Tools de dashboard (`DashboardMcpTools`)

**Files:**
- Create: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/mcp/DashboardMcpTools.java`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/mcp/DashboardMcpToolsTest.java`

**Interfaces:**
- Consumes: `SummaryService.build(OffsetDateTime, OffsetDateTime, String, String, String, boolean)` → `SummaryResponse` (`com.dev4.cypher.service.SummaryService`); `PlacarService.placar(OffsetDateTime, OffsetDateTime)` → `List<PlacarEquipeResponse>` e `PlacarService.janelaPadrao(OffsetDateTime, OffsetDateTime)` (`static`) → `OffsetDateTime[]` (`com.dev4.cypher.service.PlacarService`).
- Produces: tools `get_summary`, `get_placar`.

- [ ] **Step 1: Escrever o teste que falha**

```java
package com.dev4.cypher.mcp;

import com.dev4.cypher.dto.PlacarEquipeResponse;
import com.dev4.cypher.dto.SummaryResponse;
import com.dev4.cypher.service.PlacarService;
import com.dev4.cypher.service.SummaryService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

class DashboardMcpToolsTest {

    private final SummaryService summary = Mockito.mock(SummaryService.class);
    private final PlacarService placar = Mockito.mock(PlacarService.class);
    private final DashboardMcpTools tools = new DashboardMcpTools(summary, placar);

    @Test
    void getSummaryDelegaParaSummaryServiceBuild() {
        SummaryResponse resposta = Mockito.mock(SummaryResponse.class);
        when(summary.build(null, null, null, null, null, false)).thenReturn(resposta);

        assertThat(tools.getSummary(null, null, null, null, null, false)).isSameAs(resposta);
    }

    @Test
    void getPlacarResolveJanelaPadraoAntesDeChamarPlacar() {
        OffsetDateTime inicio = OffsetDateTime.now().minusDays(7);
        OffsetDateTime fim = OffsetDateTime.now();
        List<PlacarEquipeResponse> lista = List.of(Mockito.mock(PlacarEquipeResponse.class));
        when(placar.placar(inicio, fim)).thenReturn(lista);

        try (var mocked = Mockito.mockStatic(PlacarService.class)) {
            mocked.when(() -> PlacarService.janelaPadrao(null, null))
                    .thenReturn(new OffsetDateTime[]{inicio, fim});

            assertThat(tools.getPlacar(null, null)).isSameAs(lista);
        }
    }
}
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=DashboardMcpToolsTest test`
Expected: FAIL (`DashboardMcpTools` ainda não existe)

- [ ] **Step 3: Implementar**

```java
package com.dev4.cypher.mcp;

import com.dev4.cypher.dto.PlacarEquipeResponse;
import com.dev4.cypher.dto.SummaryResponse;
import com.dev4.cypher.service.PlacarService;
import com.dev4.cypher.service.SummaryService;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.List;

/** Tools MCP de dashboard/gamificação — delega para SummaryService/PlacarService. */
@Component
public class DashboardMcpTools {

    private final SummaryService summary;
    private final PlacarService placar;

    public DashboardMcpTools(SummaryService summary, PlacarService placar) {
        this.summary = summary;
        this.placar = placar;
    }

    @McpTool(name = "get_summary", description = "Resumo/heatmap do dashboard: contagens por estação, turno, setor e EPI.")
    public SummaryResponse getSummary(
            @McpToolParam(description = "Data/hora inicial (ISO-8601), ou null para padrão", required = false)
            OffsetDateTime since,
            @McpToolParam(description = "Data/hora final (ISO-8601), ou null para padrão", required = false)
            OffsetDateTime until,
            @McpToolParam(description = "Turno (A/B/N), ou null para todos", required = false) String turno,
            @McpToolParam(description = "Nome do setor, ou null para todos", required = false) String setor,
            @McpToolParam(description = "EPI (capacete/oculos/luvas/botas), ou null para todos", required = false)
            String epi,
            @McpToolParam(description = "Incluir distribuição temporal detalhada", required = true)
            boolean detalhado) {
        return summary.build(since, until, turno, setor, epi, detalhado);
    }

    @McpTool(name = "get_placar", description = "Placar de gamificação por equipe (conformidade, cobertura, sequência, ranking).")
    public List<PlacarEquipeResponse> getPlacar(
            @McpToolParam(description = "Data/hora inicial (ISO-8601), ou null para os últimos 7 dias", required = false)
            OffsetDateTime since,
            @McpToolParam(description = "Data/hora final (ISO-8601), ou null para agora", required = false)
            OffsetDateTime until) {
        OffsetDateTime[] janela = PlacarService.janelaPadrao(since, until);
        return placar.placar(janela[0], janela[1]);
    }
}
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=DashboardMcpToolsTest test`
Expected: PASS

- [ ] **Step 5: Rodar a suíte completa do backend**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/mcp/DashboardMcpTools.java \
        src/test/java/com/dev4/cypher/mcp/DashboardMcpToolsTest.java
git commit -m "feat: adiciona tools MCP de dashboard (summary/placar)"
```

## Self-Review

- **Cobertura da spec:** as 8 tools da tabela §"Escopo de tools" da spec estão todas presentes (Task 2: 4 tools de incidentes; Task 3: 2 de catálogo; Task 4: 2 de dashboard); dependência/config Spring AI (Task 1); `analyze_incident` com descrição marcando operação lenta, conforme exigido na spec.
- **Placeholders:** o Step 5 da Task 1 (descobrir o path real do endpoint) é uma verificação empírica documentada explicitamente como tal, não uma lacuna — a ação a tomar em cada resultado possível (`401` vs `404`) está descrita.
- **Consistência de tipos:** assinaturas dos services (`IncidentService.search`, `CatalogService.cameras/stations`, `SummaryService.build`, `PlacarService.placar/janelaPadrao`) replicadas exatamente como confirmado por leitura de código, incluindo o `boolean detalhado` primitivo (não `Boolean`) e `Pageable`/`PageRequest.of(page, size)` para a tool `list_incidents`, que precisa converter os parâmetros `page`/`size` recebidos da tool MCP (tipos simples) para o `Pageable` que o service espera.
