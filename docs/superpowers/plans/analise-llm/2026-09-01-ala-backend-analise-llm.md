# Análise de Risco com LLM Multimodal — Backend (`cypher`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** adicionar um endpoint `POST /api/v1/incidents/{id}/analyze`, GESTOR-only, que envia o snapshot já armazenado de um incidente para um LLM multimodal (Claude ou Gemini, alternável por config) e devolve uma análise de risco estruturada.

**Architecture:** uma interface `MultimodalRiskClient` com duas implementações escolhidas por `@ConditionalOnProperty` (`ClaudeVisionClient`/`GeminiVisionClient`), um `PromptBuilder` com duas versões de prompt, um `LlmResponseParser` tolerante a resposta malformada, um `LlmAnalysisService` que orquestra tudo e persiste cada chamada para auditoria, e um novo endpoint em `IncidentController`.

**Tech Stack:** Java 21+, Spring Boot 4.0.6, Spring Framework 7.0.7, `RestClient` (spring-web), Jackson 3 (`tools.jackson.*`) para JSON, JUnit 5 + AssertJ + `@DataJpaTest`/`@SpringBootTest` (sem Mockito — este projeto não usa nenhum framework de mock).

**Spec:** `docs/superpowers/specs/planejadas/2026-09-01-analise-llm-multimodal-design.md`

## Global Constraints

- Endpoint é **GESTOR-only** — `OPERADOR` deve receber `403`, barrado pelo `SecurityConfig` antes de chegar no controller (spec §2.1).
- Incidente sem `snapshotUrl` → `422` via `CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY, mensagem)`, reaproveitando o `@RestControllerAdvice` já existente (`CatalogExceptionHandler`) — nunca inventar um novo handler de exceção (spec §2.5, §4).
- Incidente inexistente → `404`.
- Falha de rede/timeout/5xx do provedor LLM **nunca** vira erro HTTP 5xx para o gestor — sempre `200 OK` com `status: "ERRO_API"` no corpo (spec §2.5, §4).
- Resposta do modelo que não é o JSON esperado **nunca** derruba a chamada — vira `200 OK` com `status: "ERRO_PARSE"` (spec §2.5, §4).
- Provedor (Claude/Gemini) é alternável só por config (`cypher.llm.provider`), sem se tocar em código (spec §2.4).
- `cypher.llm.claude.api-key`/`cypher.llm.gemini.api-key` são o primeiro segredo deste projeto injetado via `${VAR}` de ambiente — desvio deliberado, documentado (spec §2.7).
- **Este projeto não usa Mockito em nenhum teste existente.** Testes que envolvem uma chamada HTTP externa sobem um `com.sun.net.httpserver.HttpServer` local (ver `WebhookDispatcherTest`); testes de persistência usam `@DataJpaTest` com repositórios reais contra H2. Siga esse padrão — não introduza um mock framework novo.
- `cypher-capture` não é tocado por este plano.

---

### Task 1: Modelo de dados — `AnalysisStatus`, `RiskAnalysisResponse`, `IncidentLlmAnalysis`

**Files:**
- Create: `src/main/java/com/dev4/cypher/model/AnalysisStatus.java`
- Create: `src/main/java/com/dev4/cypher/dto/RiskAnalysisResponse.java`
- Create: `src/main/java/com/dev4/cypher/model/IncidentLlmAnalysis.java`
- Create: `src/main/java/com/dev4/cypher/repository/IncidentLlmAnalysisRepository.java`
- Test: `src/test/java/com/dev4/cypher/repository/IncidentLlmAnalysisRepositoryTest.java`

**Interfaces:**
- Produces: `AnalysisStatus` enum (`OK`, `ERRO_PARSE`, `ERRO_API`); `RiskAnalysisResponse` record com os campos `situacao, episIdentificados, episAusentes, riscoIdentificado, tipoRisco, nivelRisco, justificativa, acaoRecomendada, provider, promptVersion, status, geradoEm` e os métodos estáticos `RiskAnalysisResponse.erroApi(String provider, String promptVersion)` e `RiskAnalysisResponse.erroParse(String provider, String promptVersion)`; `IncidentLlmAnalysis` entidade JPA com construtor `(Long alertaId, String provider, String promptVersion, AnalysisStatus status, String respostaJson, String erro, OffsetDateTime criadoEm)`; `IncidentLlmAnalysisRepository extends JpaRepository<IncidentLlmAnalysis, Long>`.

- [ ] **Step 1: Escrever o teste de persistência (falho)**

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.AnalysisStatus;
import com.dev4.cypher.model.IncidentLlmAnalysis;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class IncidentLlmAnalysisRepositoryTest {

    @Autowired
    private IncidentLlmAnalysisRepository repository;

    @Test
    void salvaERecuperaUmaAnalise() {
        IncidentLlmAnalysis analise = new IncidentLlmAnalysis(42L, "claude", "v2",
                AnalysisStatus.OK, "{\"situacao\":\"ok\"}", null, OffsetDateTime.now());

        IncidentLlmAnalysis salva = repository.save(analise);

        assertThat(salva.getId()).isNotNull();
        assertThat(repository.findById(salva.getId()))
                .isPresent()
                .get()
                .satisfies(a -> {
                    assertThat(a.getAlertaId()).isEqualTo(42L);
                    assertThat(a.getProvider()).isEqualTo("claude");
                    assertThat(a.getStatus()).isEqualTo(AnalysisStatus.OK);
                    assertThat(a.getRespostaJson()).isEqualTo("{\"situacao\":\"ok\"}");
                });
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `mvn test -Dtest=IncidentLlmAnalysisRepositoryTest`
Expected: FAIL — classes `AnalysisStatus`/`IncidentLlmAnalysis`/`IncidentLlmAnalysisRepository` não existem ainda.

- [ ] **Step 3: Criar o enum**

```java
package com.dev4.cypher.model;

public enum AnalysisStatus {
    OK,
    ERRO_PARSE,
    ERRO_API
}
```

- [ ] **Step 4: Criar o DTO de resposta**

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.model.AnalysisStatus;

import java.time.OffsetDateTime;
import java.util.List;

/** Saída estruturada da análise de risco feita pelo LLM (spec §2.2). */
public record RiskAnalysisResponse(
        String situacao,
        List<String> episIdentificados,
        List<String> episAusentes,
        boolean riscoIdentificado,
        String tipoRisco,
        String nivelRisco,
        String justificativa,
        String acaoRecomendada,
        String provider,
        String promptVersion,
        AnalysisStatus status,
        OffsetDateTime geradoEm
) {
    public static RiskAnalysisResponse erroApi(String provider, String promptVersion) {
        return new RiskAnalysisResponse(null, List.of(), List.of(), false, null, null, null, null,
                provider, promptVersion, AnalysisStatus.ERRO_API, OffsetDateTime.now());
    }

    public static RiskAnalysisResponse erroParse(String provider, String promptVersion) {
        return new RiskAnalysisResponse(null, List.of(), List.of(), false, null, null, null, null,
                provider, promptVersion, AnalysisStatus.ERRO_PARSE, OffsetDateTime.now());
    }
}
```

- [ ] **Step 5: Criar a entidade de auditoria**

```java
package com.dev4.cypher.model;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * Registro de uma chamada de análise de risco por LLM (spec §2.3).
 * alertaId é referência solta, sem FK — mesmo padrão do resto do projeto
 * (ver Alerta.cameraId, WebhookDelivery.subscriptionId).
 */
@Entity
@Table(name = "incident_llm_analyses")
@Getter
@Setter
@NoArgsConstructor
public class IncidentLlmAnalysis {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long alertaId;
    private String provider;
    private String promptVersion;

    @Enumerated(EnumType.STRING)
    private AnalysisStatus status;

    @Lob
    private String respostaJson;

    private String erro;

    private OffsetDateTime criadoEm;

    public IncidentLlmAnalysis(Long alertaId, String provider, String promptVersion,
                                AnalysisStatus status, String respostaJson, String erro,
                                OffsetDateTime criadoEm) {
        this.alertaId = alertaId;
        this.provider = provider;
        this.promptVersion = promptVersion;
        this.status = status;
        this.respostaJson = respostaJson;
        this.erro = erro;
        this.criadoEm = criadoEm;
    }
}
```

- [ ] **Step 6: Criar o repositório**

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.IncidentLlmAnalysis;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface IncidentLlmAnalysisRepository extends JpaRepository<IncidentLlmAnalysis, Long> {
}
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

Run: `mvn test -Dtest=IncidentLlmAnalysisRepositoryTest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/main/java/com/dev4/cypher/model/AnalysisStatus.java \
        src/main/java/com/dev4/cypher/dto/RiskAnalysisResponse.java \
        src/main/java/com/dev4/cypher/model/IncidentLlmAnalysis.java \
        src/main/java/com/dev4/cypher/repository/IncidentLlmAnalysisRepository.java \
        src/test/java/com/dev4/cypher/repository/IncidentLlmAnalysisRepositoryTest.java
git commit -m "feat: modelo de dados para analise de risco por LLM"
```

---

### Task 2: `PromptBuilder` — duas versões de prompt

**Files:**
- Create: `src/main/java/com/dev4/cypher/llm/PromptBuilder.java`
- Test: `src/test/java/com/dev4/cypher/llm/PromptBuilderTest.java`

**Interfaces:**
- Consumes: `com.dev4.cypher.model.Alerta` (getters `getPosturaCategoria()`, `getZona()`, `getEpiPresent()`, `getEpiMissing()`, `getRebaScore()`, `getSeveridade()` — já existentes na entidade).
- Produces: `PromptBuilder.montar(Alerta alerta, String versao)` → `String`, onde `versao` é `"v1"` ou qualquer outro valor (tratado como `"v2"`, o padrão).

- [ ] **Step 1: Escrever o teste (falho)**

```java
package com.dev4.cypher.llm;

import com.dev4.cypher.model.Alerta;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PromptBuilderTest {

    private final PromptBuilder builder = new PromptBuilder();

    private Alerta alertaDeExemplo() {
        Alerta alerta = new Alerta();
        alerta.setPosturaCategoria("critical_zone");
        alerta.setZona("prensa-01");
        alerta.setEpiPresent(List.of("capacete"));
        alerta.setEpiMissing(List.of("luvas"));
        alerta.setRebaScore(9);
        alerta.setSeveridade(3);
        alerta.setDataHora(OffsetDateTime.now());
        return alerta;
    }

    @Test
    void v1NaoMencionaSinaisDaVisaoComputacional() {
        String prompt = builder.montar(alertaDeExemplo(), "v1");

        assertThat(prompt).doesNotContain("prensa-01");
        assertThat(prompt).contains("JSON");
    }

    @Test
    void v2IncluiSinaisJaCalculadosPelaVisaoComputacional() {
        String prompt = builder.montar(alertaDeExemplo(), "v2");

        assertThat(prompt).contains("critical_zone");
        assertThat(prompt).contains("prensa-01");
        assertThat(prompt).contains("capacete");
        assertThat(prompt).contains("luvas");
        assertThat(prompt).contains("JSON");
    }

    @Test
    void versaoDesconhecidaCaiParaV2() {
        String prompt = builder.montar(alertaDeExemplo(), "qualquer-coisa");

        assertThat(prompt).contains("prensa-01");
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `mvn test -Dtest=PromptBuilderTest`
Expected: FAIL — `PromptBuilder` não existe.

- [ ] **Step 3: Implementar**

```java
package com.dev4.cypher.llm;

import com.dev4.cypher.model.Alerta;
import org.springframework.stereotype.Component;

/** Monta o prompt enviado ao LLM multimodal (spec §2.6). */
@Component
public class PromptBuilder {

    private static final String INSTRUCOES_FORMATO = """
            Responda apenas com um objeto JSON, sem nenhum texto antes ou depois, exatamente neste formato:
            {
              "situacao": "string descrevendo a cena",
              "epis_identificados": ["lista", "de", "epis"],
              "epis_ausentes": ["lista", "de", "epis"],
              "risco_identificado": true ou false,
              "tipo_risco": "string ou null",
              "nivel_risco": "baixo, medio ou alto",
              "justificativa": "string",
              "acao_recomendada": "string"
            }
            """;

    public String montar(Alerta alerta, String versao) {
        if ("v1".equals(versao)) {
            return montarV1();
        }
        return montarV2(alerta);
    }

    private String montarV1() {
        return """
                Voce e um assistente de seguranca industrial. Analise a imagem anexada e identifique \
                riscos relacionados a uso de EPIs, proximidade de zonas perigosas ou posturas inadequadas.

                """ + INSTRUCOES_FORMATO;
    }

    private String montarV2(Alerta alerta) {
        String zona = alerta.getZona() != null ? alerta.getZona() : "nenhuma";
        String episPresentes = alerta.getEpiPresent().isEmpty()
                ? "nenhum" : String.join(", ", alerta.getEpiPresent());
        String episAusentes = alerta.getEpiMissing().isEmpty()
                ? "nenhum" : String.join(", ", alerta.getEpiMissing());

        return ("""
                Voce e um assistente de seguranca industrial. Um sistema de visao computacional ja \
                analisou esta cena e identificou os seguintes sinais preliminares:
                - categoria de postura: %s
                - zona: %s
                - EPIs presentes: %s
                - EPIs ausentes: %s
                - score REBA: %s
                - severidade calculada: %s

                Analise a imagem anexada e CONFIRME, REFINE ou CONTESTE esses sinais com base no que \
                voce observa. Nao assuma que os sinais acima estao corretos.

                """).formatted(alerta.getPosturaCategoria(), zona, episPresentes, episAusentes,
                        alerta.getRebaScore(), alerta.getSeveridade())
                + INSTRUCOES_FORMATO;
    }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `mvn test -Dtest=PromptBuilderTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/dev4/cypher/llm/PromptBuilder.java src/test/java/com/dev4/cypher/llm/PromptBuilderTest.java
git commit -m "feat: PromptBuilder com versoes v1 (minima) e v2 (com contexto da CV)"
```

---

### Task 3: `LlmResponseParser` — tolerante a resposta malformada

**Files:**
- Create: `src/main/java/com/dev4/cypher/llm/LlmResponseParser.java`
- Test: `src/test/java/com/dev4/cypher/llm/LlmResponseParserTest.java`

**Interfaces:**
- Consumes: `com.dev4.cypher.dto.RiskAnalysisResponse` (Task 1), `com.dev4.cypher.model.AnalysisStatus` (Task 1).
- Produces: `LlmResponseParser.parse(String bruto, String provider, String promptVersion)` → `RiskAnalysisResponse`, nunca lança exceção.

- [ ] **Step 1: Escrever o teste (falho)**

```java
package com.dev4.cypher.llm;

import com.dev4.cypher.model.AnalysisStatus;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LlmResponseParserTest {

    private final LlmResponseParser parser = new LlmResponseParser();

    @Test
    void jsonValidoVideStatusOk() {
        String bruto = """
                {
                  "situacao": "trabalhador proximo a prensa",
                  "epis_identificados": ["capacete"],
                  "epis_ausentes": ["luvas"],
                  "risco_identificado": true,
                  "tipo_risco": "aproximacao de zona perigosa",
                  "nivel_risco": "alto",
                  "justificativa": "muito perto da area de movimentacao",
                  "acao_recomendada": "interromper a operacao"
                }
                """;

        var resultado = parser.parse(bruto, "claude", "v2");

        assertThat(resultado.status()).isEqualTo(AnalysisStatus.OK);
        assertThat(resultado.situacao()).isEqualTo("trabalhador proximo a prensa");
        assertThat(resultado.episIdentificados()).containsExactly("capacete");
        assertThat(resultado.episAusentes()).containsExactly("luvas");
        assertThat(resultado.riscoIdentificado()).isTrue();
        assertThat(resultado.nivelRisco()).isEqualTo("alto");
        assertThat(resultado.provider()).isEqualTo("claude");
        assertThat(resultado.promptVersion()).isEqualTo("v2");
    }

    @Test
    void jsonEnvolvidoEmCercaDeMarkdownAindaEExtraido() {
        String bruto = "Aqui esta a analise:\n```json\n{\"situacao\": \"ok\", \"epis_identificados\": [], "
                + "\"epis_ausentes\": [], \"risco_identificado\": false, \"tipo_risco\": null, "
                + "\"nivel_risco\": \"baixo\", \"justificativa\": \"nada de anormal\", "
                + "\"acao_recomendada\": \"nenhuma\"}\n```";

        var resultado = parser.parse(bruto, "claude", "v1");

        assertThat(resultado.status()).isEqualTo(AnalysisStatus.OK);
        assertThat(resultado.situacao()).isEqualTo("ok");
    }

    @Test
    void textoSemNenhumJsonVideErroParse() {
        var resultado = parser.parse("desculpe, nao consigo analisar esta imagem.", "gemini", "v1");

        assertThat(resultado.status()).isEqualTo(AnalysisStatus.ERRO_PARSE);
        assertThat(resultado.provider()).isEqualTo("gemini");
        assertThat(resultado.promptVersion()).isEqualTo("v1");
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `mvn test -Dtest=LlmResponseParserTest`
Expected: FAIL — `LlmResponseParser` não existe.

- [ ] **Step 3: Implementar**

```java
package com.dev4.cypher.llm;

import com.dev4.cypher.dto.RiskAnalysisResponse;
import com.dev4.cypher.model.AnalysisStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Interpreta o texto bruto devolvido pelo LLM. Nunca lanca excecao — uma
 * resposta que nao e o JSON esperado vira ERRO_PARSE, nao um erro 5xx
 * (spec §2.5).
 */
@Component
public class LlmResponseParser {

    private final ObjectMapper mapper = new ObjectMapper();

    public RiskAnalysisResponse parse(String bruto, String provider, String promptVersion) {
        try {
            JsonNode raiz = mapper.readTree(extrairJson(bruto));
            return new RiskAnalysisResponse(
                    raiz.path("situacao").asText(""),
                    listaDe(raiz, "epis_identificados"),
                    listaDe(raiz, "epis_ausentes"),
                    raiz.path("risco_identificado").asBoolean(false),
                    raiz.path("tipo_risco").asText(null),
                    raiz.path("nivel_risco").asText(""),
                    raiz.path("justificativa").asText(""),
                    raiz.path("acao_recomendada").asText(""),
                    provider,
                    promptVersion,
                    AnalysisStatus.OK,
                    OffsetDateTime.now());
        } catch (Exception falha) {
            return RiskAnalysisResponse.erroParse(provider, promptVersion);
        }
    }

    private List<String> listaDe(JsonNode raiz, String campo) {
        List<String> valores = new ArrayList<>();
        raiz.path(campo).forEach(item -> valores.add(item.asText("")));
        return valores;
    }

    /** O modelo as vezes envolve o JSON em texto ou cerca de markdown; extrai so o objeto. */
    private String extrairJson(String bruto) {
        int inicio = bruto.indexOf('{');
        int fim = bruto.lastIndexOf('}');
        if (inicio < 0 || fim < 0 || fim < inicio) {
            throw new IllegalArgumentException("Nenhum objeto JSON encontrado na resposta");
        }
        return bruto.substring(inicio, fim + 1);
    }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `mvn test -Dtest=LlmResponseParserTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/dev4/cypher/llm/LlmResponseParser.java src/test/java/com/dev4/cypher/llm/LlmResponseParserTest.java
git commit -m "feat: LlmResponseParser tolerante a resposta malformada do modelo"
```

---

### Task 4: `LlmProperties`, `MultimodalRiskClient`, `ClaudeVisionClient`

**Files:**
- Create: `src/main/java/com/dev4/cypher/config/LlmProperties.java`
- Create: `src/main/java/com/dev4/cypher/llm/MultimodalRiskClient.java`
- Create: `src/main/java/com/dev4/cypher/llm/ClaudeVisionClient.java`
- Modify: `src/main/resources/application.yaml` — novo bloco `cypher.llm`
- Test: `src/test/java/com/dev4/cypher/llm/ClaudeVisionClientTest.java`

**Interfaces:**
- Produces: `LlmProperties` (`@ConfigurationProperties(prefix = "cypher.llm")`) com `getProvider()`, `getPromptVersion()`, `getTimeoutSeconds()`, `getClaude()`/`getGemini()` (ambos `LlmProperties.ProviderConfig` com `getApiKey()`, `getModel()`, `getBaseUrl()`); `MultimodalRiskClient.analisar(String imagemUrl, String prompt)` → `String` (texto bruto, pode lançar em caso de falha de rede — quem chama decide o que fazer); `ClaudeVisionClient implements MultimodalRiskClient`, ativo só quando `cypher.llm.provider=claude`.

- [ ] **Step 1: Adicionar o bloco de config no `application.yaml`**

Em `src/main/resources/application.yaml`, dentro do bloco `cypher:` já existente (irmão de `cors`/`catalog`):

```yaml
  llm:
    provider: claude
    prompt-version: v2
    timeout-seconds: 20
    claude:
      api-key: ${CYPHER_CLAUDE_API_KEY:}
      model: claude-sonnet-5
      base-url: https://api.anthropic.com
    gemini:
      api-key: ${CYPHER_GEMINI_API_KEY:}
      model: gemini-2.5-flash
      base-url: https://generativelanguage.googleapis.com
```

- [ ] **Step 2: Escrever o teste do cliente (falho)**

```java
package com.dev4.cypher.llm;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class ClaudeVisionClientTest {

    private static HttpServer servidor;
    private static final List<String> corposRecebidos = new CopyOnWriteArrayList<>();
    private static volatile int statusDeResposta = 200;
    private static volatile String corpoDeResposta =
            "{\"content\":[{\"type\":\"text\",\"text\":\"{\\\"situacao\\\":\\\"ok\\\"}\"}]}";

    @DynamicPropertySource
    static void propriedades(DynamicPropertyRegistry registry) throws IOException {
        servidor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        servidor.createContext("/v1/messages", troca -> {
            corposRecebidos.add(new String(troca.getRequestBody().readAllBytes()));
            byte[] resposta = corpoDeResposta.getBytes();
            troca.sendResponseHeaders(statusDeResposta, resposta.length);
            troca.getResponseBody().write(resposta);
            troca.close();
        });
        servidor.start();

        registry.add("cypher.llm.provider", () -> "claude");
        registry.add("cypher.llm.claude.base-url",
                () -> "http://127.0.0.1:" + servidor.getAddress().getPort());
        registry.add("cypher.llm.claude.api-key", () -> "chave-de-teste");
        registry.add("cypher.llm.claude.model", () -> "claude-teste");
    }

    @AfterAll
    static void derrubarServidor() {
        servidor.stop(0);
    }

    @Autowired
    private MultimodalRiskClient client;

    @BeforeEach
    void limpar() {
        corposRecebidos.clear();
        statusDeResposta = 200;
        corpoDeResposta = "{\"content\":[{\"type\":\"text\",\"text\":\"{\\\"situacao\\\":\\\"ok\\\"}\"}]}";
    }

    @Test
    void enviaImagemEPromptEDevolveOTextoDaResposta() {
        String resultado = client.analisar("https://exemplo.com/foto.jpg", "analise isso");

        assertThat(corposRecebidos).hasSize(1);
        assertThat(corposRecebidos.get(0)).contains("https://exemplo.com/foto.jpg");
        assertThat(corposRecebidos.get(0)).contains("analise isso");
        assertThat(resultado).contains("situacao");
    }
}
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `mvn test -Dtest=ClaudeVisionClientTest`
Expected: FAIL — `LlmProperties`, `MultimodalRiskClient`, `ClaudeVisionClient` não existem.

- [ ] **Step 4: Criar `LlmProperties`**

```java
package com.dev4.cypher.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** Config de análise de risco por LLM multimodal (spec §2.7). */
@Component
@ConfigurationProperties(prefix = "cypher.llm")
@Getter
@Setter
public class LlmProperties {
    private String provider = "claude";
    private String promptVersion = "v2";
    private int timeoutSeconds = 20;
    private ProviderConfig claude = new ProviderConfig();
    private ProviderConfig gemini = new ProviderConfig();

    @Getter
    @Setter
    public static class ProviderConfig {
        private String apiKey;
        private String model;
        private String baseUrl;
    }
}
```

- [ ] **Step 5: Criar a interface**

```java
package com.dev4.cypher.llm;

/** Porta para um provedor de LLM multimodal (spec §2.4) — alternável só por config. */
public interface MultimodalRiskClient {
    /** Devolve o texto bruto respondido pelo modelo; pode nao ser JSON valido. */
    String analisar(String imagemUrl, String prompt);
}
```

- [ ] **Step 6: Criar `ClaudeVisionClient`**

```java
package com.dev4.cypher.llm;

import com.dev4.cypher.config.LlmProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@Component
@ConditionalOnProperty(name = "cypher.llm.provider", havingValue = "claude")
public class ClaudeVisionClient implements MultimodalRiskClient {

    private final RestClient http;
    private final LlmProperties.ProviderConfig config;
    private final ObjectMapper mapper = new ObjectMapper();

    public ClaudeVisionClient(LlmProperties properties) {
        this.config = properties.getClaude();

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(properties.getTimeoutSeconds()));
        requestFactory.setReadTimeout(Duration.ofSeconds(properties.getTimeoutSeconds()));

        this.http = RestClient.builder()
                .baseUrl(config.getBaseUrl())
                .requestFactory(requestFactory)
                .build();
    }

    @Override
    public String analisar(String imagemUrl, String prompt) {
        Map<String, Object> corpo = Map.of(
                "model", config.getModel(),
                "max_tokens", 1024,
                "messages", List.of(Map.of(
                        "role", "user",
                        "content", List.of(
                                Map.of("type", "image", "source", Map.of("type", "url", "url", imagemUrl)),
                                Map.of("type", "text", "text", prompt)))));

        String resposta = http.post()
                .uri("/v1/messages")
                .header("x-api-key", config.getApiKey())
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .body(mapper.writeValueAsString(corpo))
                .retrieve()
                .body(String.class);

        JsonNode raiz = mapper.readTree(resposta);
        return raiz.path("content").path(0).path("text").asText("");
    }
}
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

Run: `mvn test -Dtest=ClaudeVisionClientTest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/main/resources/application.yaml \
        src/main/java/com/dev4/cypher/config/LlmProperties.java \
        src/main/java/com/dev4/cypher/llm/MultimodalRiskClient.java \
        src/main/java/com/dev4/cypher/llm/ClaudeVisionClient.java \
        src/test/java/com/dev4/cypher/llm/ClaudeVisionClientTest.java
git commit -m "feat: LlmProperties e ClaudeVisionClient (RestClient com timeout configuravel)"
```

---

### Task 5: `GeminiVisionClient` — segundo provedor

**Files:**
- Create: `src/main/java/com/dev4/cypher/llm/GeminiVisionClient.java`
- Test: `src/test/java/com/dev4/cypher/llm/GeminiVisionClientTest.java`

**Interfaces:**
- Consumes: `LlmProperties`/`LlmProperties.ProviderConfig` (Task 4), `MultimodalRiskClient` (Task 4).
- Produces: `GeminiVisionClient implements MultimodalRiskClient`, ativo só quando `cypher.llm.provider=gemini` — mesma assinatura de `analisar(String, String)`.

- [ ] **Step 1: Escrever o teste (falho)**

```java
package com.dev4.cypher.llm;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class GeminiVisionClientTest {

    private static HttpServer servidor;
    private static final List<String> corposRecebidos = new CopyOnWriteArrayList<>();
    private static volatile String corpoDeResposta =
            "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"{\\\"situacao\\\":\\\"ok\\\"}\"}]}}]}";

    @DynamicPropertySource
    static void propriedades(DynamicPropertyRegistry registry) throws IOException {
        servidor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        servidor.createContext("/", troca -> {
            corposRecebidos.add(new String(troca.getRequestBody().readAllBytes()));
            byte[] resposta = corpoDeResposta.getBytes();
            troca.sendResponseHeaders(200, resposta.length);
            troca.getResponseBody().write(resposta);
            troca.close();
        });
        servidor.start();

        registry.add("cypher.llm.provider", () -> "gemini");
        registry.add("cypher.llm.gemini.base-url",
                () -> "http://127.0.0.1:" + servidor.getAddress().getPort());
        registry.add("cypher.llm.gemini.api-key", () -> "chave-de-teste");
        registry.add("cypher.llm.gemini.model", () -> "gemini-teste");
    }

    @AfterAll
    static void derrubarServidor() {
        servidor.stop(0);
    }

    @Autowired
    private MultimodalRiskClient client;

    @BeforeEach
    void limpar() {
        corposRecebidos.clear();
    }

    @Test
    void enviaImagemEPromptEDevolveOTextoDaResposta() {
        String resultado = client.analisar("https://exemplo.com/foto.jpg", "analise isso");

        assertThat(corposRecebidos).hasSize(1);
        assertThat(corposRecebidos.get(0)).contains("https://exemplo.com/foto.jpg");
        assertThat(corposRecebidos.get(0)).contains("analise isso");
        assertThat(resultado).contains("situacao");
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `mvn test -Dtest=GeminiVisionClientTest`
Expected: FAIL — `GeminiVisionClient` não existe. (Nota: com `cypher.llm.provider=gemini` nesta classe de teste e `=claude` na de `ClaudeVisionClientTest`, cada `@SpringBootTest` sobe seu próprio contexto — nenhum dos dois beans conflita com o outro.)

- [ ] **Step 3: Implementar**

```java
package com.dev4.cypher.llm;

import com.dev4.cypher.config.LlmProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@Component
@ConditionalOnProperty(name = "cypher.llm.provider", havingValue = "gemini")
public class GeminiVisionClient implements MultimodalRiskClient {

    private final RestClient http;
    private final LlmProperties.ProviderConfig config;
    private final ObjectMapper mapper = new ObjectMapper();

    public GeminiVisionClient(LlmProperties properties) {
        this.config = properties.getGemini();

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(properties.getTimeoutSeconds()));
        requestFactory.setReadTimeout(Duration.ofSeconds(properties.getTimeoutSeconds()));

        this.http = RestClient.builder()
                .baseUrl(config.getBaseUrl())
                .requestFactory(requestFactory)
                .build();
    }

    @Override
    public String analisar(String imagemUrl, String prompt) {
        Map<String, Object> corpo = Map.of(
                "contents", List.of(Map.of(
                        "parts", List.of(
                                Map.of("text", prompt),
                                Map.of("file_data", Map.of("file_uri", imagemUrl))))));

        String resposta = http.post()
                .uri("/v1beta/models/{model}:generateContent?key={apiKey}",
                        config.getModel(), config.getApiKey())
                .header("Content-Type", "application/json")
                .body(mapper.writeValueAsString(corpo))
                .retrieve()
                .body(String.class);

        JsonNode raiz = mapper.readTree(resposta);
        return raiz.path("candidates").path(0).path("content").path("parts").path(0)
                .path("text").asText("");
    }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `mvn test -Dtest=GeminiVisionClientTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/dev4/cypher/llm/GeminiVisionClient.java src/test/java/com/dev4/cypher/llm/GeminiVisionClientTest.java
git commit -m "feat: GeminiVisionClient, segundo provedor alternavel por config"
```

---

### Task 6: `LlmAnalysisService` — orquestração

**Files:**
- Create: `src/main/java/com/dev4/cypher/llm/LlmAnalysisService.java`
- Test: `src/test/java/com/dev4/cypher/llm/LlmAnalysisServiceTest.java`

**Interfaces:**
- Consumes: `AlertaRepository` (`com.dev4.cypher.repository`, já existente, `findById(Long)` herdado de `JpaRepository`), `IncidentLlmAnalysisRepository` (Task 1), `MultimodalRiskClient` (Task 4/5), `PromptBuilder` (Task 2), `LlmResponseParser` (Task 3), `LlmProperties` (Task 4), `CatalogValidationException(HttpStatus, String)` (já existente em `com.dev4.cypher.catalog`).
- Produces: `LlmAnalysisService.analisar(Long alertaId)` → `RiskAnalysisResponse`; lança `NoSuchElementException` se o `Alerta` não existir, `CatalogValidationException` (422) se `snapshotUrl` for nulo.

- [ ] **Step 1: Escrever o teste (falho)**

```java
package com.dev4.cypher.llm;

import com.dev4.cypher.catalog.CatalogValidationException;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.model.AnalysisStatus;
import com.dev4.cypher.dto.IncidentRequest;
import com.dev4.cypher.repository.AlertaRepository;
import com.dev4.cypher.repository.IncidentLlmAnalysisRepository;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class LlmAnalysisServiceTest {

    private static HttpServer servidor;
    private static volatile int statusDeResposta = 200;
    private static volatile String corpoDeResposta =
            "{\"content\":[{\"type\":\"text\",\"text\":\"{\\\"situacao\\\":\\\"trabalhador ok\\\","
                    + "\\\"epis_identificados\\\":[],\\\"epis_ausentes\\\":[],"
                    + "\\\"risco_identificado\\\":false,\\\"tipo_risco\\\":null,"
                    + "\\\"nivel_risco\\\":\\\"baixo\\\",\\\"justificativa\\\":\\\"nada de anormal\\\","
                    + "\\\"acao_recomendada\\\":\\\"nenhuma\\\"}\"}]}";

    @DynamicPropertySource
    static void propriedades(DynamicPropertyRegistry registry) throws IOException {
        servidor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        servidor.createContext("/v1/messages", troca -> {
            byte[] resposta = corpoDeResposta.getBytes();
            troca.sendResponseHeaders(statusDeResposta, resposta.length);
            troca.getResponseBody().write(resposta);
            troca.close();
        });
        servidor.start();

        registry.add("cypher.llm.provider", () -> "claude");
        registry.add("cypher.llm.claude.base-url",
                () -> "http://127.0.0.1:" + servidor.getAddress().getPort());
        registry.add("cypher.llm.claude.api-key", () -> "chave-de-teste");
        registry.add("cypher.llm.claude.model", () -> "claude-teste");
    }

    @AfterAll
    static void derrubarServidor() {
        servidor.stop(0);
    }

    @Autowired
    private LlmAnalysisService service;

    @Autowired
    private AlertaRepository alertas;

    @Autowired
    private IncidentLlmAnalysisRepository analyses;

    @BeforeEach
    void limpar() {
        alertas.deleteAll();
        analyses.deleteAll();
        statusDeResposta = 200;
        corpoDeResposta = "{\"content\":[{\"type\":\"text\",\"text\":\"{\\\"situacao\\\":\\\"trabalhador ok\\\","
                + "\\\"epis_identificados\\\":[],\\\"epis_ausentes\\\":[],"
                + "\\\"risco_identificado\\\":false,\\\"tipo_risco\\\":null,"
                + "\\\"nivel_risco\\\":\\\"baixo\\\",\\\"justificativa\\\":\\\"nada de anormal\\\","
                + "\\\"acao_recomendada\\\":\\\"nenhuma\\\"}\"}]}";
    }

    private com.dev4.cypher.model.Alerta salvarAlertaComSnapshot(String snapshotUrl) {
        com.dev4.cypher.model.Alerta alerta = new com.dev4.cypher.model.Alerta();
        alerta.setIncidentKey("k-" + System.nanoTime());
        alerta.setCameraId("CAM-01");
        alerta.setTipo(com.dev4.cypher.model.AlertaTipo.EPI_VIOLATION);
        alerta.setSeveridade(2);
        alerta.setPosturaCategoria("adequate");
        alerta.setEpiPresent(java.util.List.of());
        alerta.setEpiMissing(java.util.List.of("luvas"));
        alerta.setRebaScore(3);
        alerta.setActionLevel(1);
        alerta.setZoneStatus("outside");
        alerta.setSnapshotUrl(snapshotUrl);
        alerta.setDataHora(OffsetDateTime.now());
        alerta.setStatus(AlertaStatus.PENDENTE);
        return alertas.save(alerta);
    }

    @Test
    void caminhoFelizDevolveAnaliseEPersisteAuditoria() {
        var alerta = salvarAlertaComSnapshot("https://exemplo.com/foto.jpg");

        var resultado = service.analisar(alerta.getId());

        assertThat(resultado.status()).isEqualTo(AnalysisStatus.OK);
        assertThat(resultado.situacao()).isEqualTo("trabalhador ok");
        assertThat(analyses.findAll()).hasSize(1);
        assertThat(analyses.findAll().get(0).getAlertaId()).isEqualTo(alerta.getId());
    }

    @Test
    void semSnapshotUrlLanca422() {
        var alerta = salvarAlertaComSnapshot(null);

        assertThatThrownBy(() -> service.analisar(alerta.getId()))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
    }

    @Test
    void alertaInexistenteLancaNoSuchElement() {
        assertThatThrownBy(() -> service.analisar(999999L))
                .isInstanceOf(java.util.NoSuchElementException.class);
    }

    @Test
    void falhaDoProvedorVideErroApiSemLancarExcecao() {
        var alerta = salvarAlertaComSnapshot("https://exemplo.com/foto.jpg");
        statusDeResposta = 500;

        var resultado = service.analisar(alerta.getId());

        assertThat(resultado.status()).isEqualTo(AnalysisStatus.ERRO_API);
        assertThat(analyses.findAll()).hasSize(1);
        assertThat(analyses.findAll().get(0).getStatus()).isEqualTo(AnalysisStatus.ERRO_API);
    }

    @Test
    void respostaMalformadaVideErroParseSemLancarExcecao() {
        var alerta = salvarAlertaComSnapshot("https://exemplo.com/foto.jpg");
        corpoDeResposta = "{\"content\":[{\"type\":\"text\",\"text\":\"desculpe, nao consigo analisar\"}]}";

        var resultado = service.analisar(alerta.getId());

        assertThat(resultado.status()).isEqualTo(AnalysisStatus.ERRO_PARSE);
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `mvn test -Dtest=LlmAnalysisServiceTest`
Expected: FAIL — `LlmAnalysisService` não existe.

- [ ] **Step 3: Implementar**

```java
package com.dev4.cypher.llm;

import com.dev4.cypher.catalog.CatalogValidationException;
import com.dev4.cypher.config.LlmProperties;
import com.dev4.cypher.dto.RiskAnalysisResponse;
import com.dev4.cypher.model.Alerta;
import com.dev4.cypher.model.IncidentLlmAnalysis;
import com.dev4.cypher.repository.AlertaRepository;
import com.dev4.cypher.repository.IncidentLlmAnalysisRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.NoSuchElementException;

/** Orquestra a analise de risco por LLM para um incidente (spec §2.5). */
@Service
public class LlmAnalysisService {

    private final AlertaRepository alertas;
    private final IncidentLlmAnalysisRepository analyses;
    private final MultimodalRiskClient client;
    private final PromptBuilder promptBuilder;
    private final LlmResponseParser parser;
    private final LlmProperties properties;

    public LlmAnalysisService(AlertaRepository alertas, IncidentLlmAnalysisRepository analyses,
                               MultimodalRiskClient client, PromptBuilder promptBuilder,
                               LlmResponseParser parser, LlmProperties properties) {
        this.alertas = alertas;
        this.analyses = analyses;
        this.client = client;
        this.promptBuilder = promptBuilder;
        this.parser = parser;
        this.properties = properties;
    }

    public RiskAnalysisResponse analisar(Long alertaId) {
        Alerta alerta = alertas.findById(alertaId)
                .orElseThrow(() -> new NoSuchElementException("Incidente nao encontrado: " + alertaId));

        if (alerta.getSnapshotUrl() == null) {
            throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Nenhuma imagem disponivel para analise deste incidente");
        }

        String prompt = promptBuilder.montar(alerta, properties.getPromptVersion());
        String bruto = null;
        String erro = null;
        RiskAnalysisResponse resultado;
        try {
            bruto = client.analisar(alerta.getSnapshotUrl(), prompt);
            resultado = parser.parse(bruto, properties.getProvider(), properties.getPromptVersion());
        } catch (Exception falhaApi) {
            erro = truncar(falhaApi.getMessage());
            resultado = RiskAnalysisResponse.erroApi(properties.getProvider(), properties.getPromptVersion());
        }

        analyses.save(new IncidentLlmAnalysis(alertaId, resultado.provider(), resultado.promptVersion(),
                resultado.status(), bruto, erro, OffsetDateTime.now()));

        return resultado;
    }

    private String truncar(String mensagem) {
        if (mensagem == null) {
            return null;
        }
        return mensagem.length() > 500 ? mensagem.substring(0, 500) : mensagem;
    }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `mvn test -Dtest=LlmAnalysisServiceTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/dev4/cypher/llm/LlmAnalysisService.java \
        src/test/java/com/dev4/cypher/llm/LlmAnalysisServiceTest.java
git commit -m "feat: LlmAnalysisService orquestra prompt, cliente, parser e auditoria"
```

---

### Task 7: Endpoint `POST /{id}/analyze` + `SecurityConfig`

**Files:**
- Modify: `src/main/java/com/dev4/cypher/controller/IncidentController.java`
- Modify: `src/main/java/com/dev4/cypher/config/SecurityConfig.java`
- Test: `src/test/java/com/dev4/cypher/IncidentAnalyzeApiTest.java`

**Interfaces:**
- Consumes: `LlmAnalysisService.analisar(Long)` (Task 6), `IncidentService.findById(Long)` (já existente, `Optional<IncidentResponse>`).
- Produces: `POST /api/v1/incidents/{id}/analyze` → `200` com `RiskAnalysisResponse`, `404` se incidente não existe, `422` se sem snapshot, `403` para `OPERADOR`.

- [ ] **Step 1: Escrever o teste de ponta a ponta (falho)**

```java
package com.dev4.cypher;

import com.dev4.cypher.repository.AlertaRepository;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MockHttpSession;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.OffsetDateTime;

import static com.dev4.cypher.security.AuthTestSupport.loginGestorBootstrap;
import static com.dev4.cypher.security.AuthTestSupport.loginOperador;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

@SpringBootTest
@AutoConfigureMockMvc
class IncidentAnalyzeApiTest {

    private static HttpServer servidor;

    @DynamicPropertySource
    static void propriedades(DynamicPropertyRegistry registry) throws IOException {
        servidor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        servidor.createContext("/v1/messages", troca -> {
            String corpo = "{\"content\":[{\"type\":\"text\",\"text\":\"{\\\"situacao\\\":\\\"ok\\\","
                    + "\\\"epis_identificados\\\":[],\\\"epis_ausentes\\\":[],"
                    + "\\\"risco_identificado\\\":false,\\\"tipo_risco\\\":null,"
                    + "\\\"nivel_risco\\\":\\\"baixo\\\",\\\"justificativa\\\":\\\"ok\\\","
                    + "\\\"acao_recomendada\\\":\\\"nenhuma\\\"}\"}]}";
            byte[] resposta = corpo.getBytes();
            troca.sendResponseHeaders(200, resposta.length);
            troca.getResponseBody().write(resposta);
            troca.close();
        });
        servidor.start();

        registry.add("cypher.llm.provider", () -> "claude");
        registry.add("cypher.llm.claude.base-url",
                () -> "http://127.0.0.1:" + servidor.getAddress().getPort());
        registry.add("cypher.llm.claude.api-key", () -> "chave-de-teste");
        registry.add("cypher.llm.claude.model", () -> "claude-teste");
    }

    @AfterAll
    static void derrubarServidor() {
        servidor.stop(0);
    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AlertaRepository alertas;

    @BeforeEach
    void limpar() {
        alertas.deleteAll();
    }

    private Long criarAlertaComSnapshot(String snapshotUrl) {
        var alerta = new com.dev4.cypher.model.Alerta();
        alerta.setIncidentKey("k-" + System.nanoTime());
        alerta.setCameraId("CAM-01");
        alerta.setTipo(com.dev4.cypher.model.AlertaTipo.EPI_VIOLATION);
        alerta.setSeveridade(2);
        alerta.setPosturaCategoria("adequate");
        alerta.setEpiPresent(java.util.List.of());
        alerta.setEpiMissing(java.util.List.of("luvas"));
        alerta.setRebaScore(3);
        alerta.setActionLevel(1);
        alerta.setZoneStatus("outside");
        alerta.setSnapshotUrl(snapshotUrl);
        alerta.setDataHora(OffsetDateTime.now());
        alerta.setStatus(com.dev4.cypher.model.AlertaStatus.PENDENTE);
        return alertas.save(alerta).getId();
    }

    @Test
    void gestorAnalisaComSucesso() throws Exception {
        MockHttpSession gestor = loginGestorBootstrap(mvc);
        Long id = criarAlertaComSnapshot("https://exemplo.com/foto.jpg");

        mvc.perform(post("/api/v1/incidents/" + id + "/analyze").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OK"))
                .andExpect(jsonPath("$.situacao").value("ok"));
    }

    @Test
    void operadorRecebe403() throws Exception {
        MockHttpSession gestor = loginGestorBootstrap(mvc);
        Long id = criarAlertaComSnapshot("https://exemplo.com/foto.jpg");
        mvc.perform(post("/api/v1/stations").session(gestor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"EST-98\", \"nome\": \"A\", \"setor\": \"s\"}"));
        mvc.perform(post("/api/v1/cameras").session(gestor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"CAM-98\", \"nome\": \"C\", \"estacaoId\": \"EST-98\", "
                        + "\"streamUrl\": \"http://127.0.0.1:9/stream\", \"fonte\": \"f\"}"));
        String token = com.jayway.jsonpath.JsonPath.read(
                mvc.perform(post("/api/v1/stations/EST-98/token/regenerate").session(gestor))
                        .andReturn().getResponse().getContentAsString(),
                "$.token");
        MockHttpSession operador = loginOperador(mvc, token);

        mvc.perform(post("/api/v1/incidents/" + id + "/analyze").session(operador))
                .andExpect(status().isForbidden());
    }

    @Test
    void incidenteInexistenteRetorna404() throws Exception {
        MockHttpSession gestor = loginGestorBootstrap(mvc);

        mvc.perform(post("/api/v1/incidents/999999/analyze").session(gestor))
                .andExpect(status().isNotFound());
    }

    @Test
    void semSnapshotRetorna422() throws Exception {
        MockHttpSession gestor = loginGestorBootstrap(mvc);
        Long id = criarAlertaComSnapshot(null);

        mvc.perform(post("/api/v1/incidents/" + id + "/analyze").session(gestor))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.erro").exists());
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `mvn test -Dtest=IncidentAnalyzeApiTest`
Expected: FAIL — endpoint `/analyze` não existe (404 em todos os cenários, incluindo os que esperam 200/422).

- [ ] **Step 3: Adicionar a regra no `SecurityConfig`**

Em `src/main/java/com/dev4/cypher/config/SecurityConfig.java`, inserir entre a linha de `PUT .../status` e o catch-all (linhas 94-96 hoje):

```java
                        .requestMatchers(HttpMethod.PUT, "/api/v1/incidents/*/status")
                        .hasAnyRole("GESTOR", "OPERADOR")
                        .requestMatchers(HttpMethod.POST, "/api/v1/incidents/*/analyze")
                        .hasRole("GESTOR")
                        .anyRequest().hasRole("GESTOR"))
```

- [ ] **Step 4: Adicionar o endpoint no `IncidentController`**

Modificar o construtor (linhas 42-50) para injetar `LlmAnalysisService`:

```java
    private final IncidentService service;
    private final IncidentSseService sse;
    private final CameraRepository cameras;
    private final LlmAnalysisService llmAnalysisService;

    public IncidentController(IncidentService service, IncidentSseService sse, CameraRepository cameras,
                               LlmAnalysisService llmAnalysisService) {
        this.service = service;
        this.sse = sse;
        this.cameras = cameras;
        this.llmAnalysisService = llmAnalysisService;
    }
```

Adicionar o novo endpoint (perto de `changeStatus`):

```java
    @PostMapping("/{id}/analyze")
    public ResponseEntity<RiskAnalysisResponse> analyze(@PathVariable Long id) {
        if (service.findById(id).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(llmAnalysisService.analisar(id));
    }
```

Adicionar os imports necessários no topo do arquivo:

```java
import com.dev4.cypher.dto.RiskAnalysisResponse;
import com.dev4.cypher.llm.LlmAnalysisService;
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `mvn test -Dtest=IncidentAnalyzeApiTest`
Expected: PASS

- [ ] **Step 6: Rodar a suíte completa antes de commitar**

Run: `mvn test`
Expected: PASS — nenhuma regressão nos testes existentes de `IncidentController` (a mudança de assinatura do construtor não quebra nenhum outro teste porque `IncidentController` é sempre instanciado pelo contexto Spring, nunca via `new` direto nos testes existentes).

- [ ] **Step 7: Commit**

```bash
git add src/main/java/com/dev4/cypher/controller/IncidentController.java \
        src/main/java/com/dev4/cypher/config/SecurityConfig.java \
        src/test/java/com/dev4/cypher/IncidentAnalyzeApiTest.java
git commit -m "feat: endpoint POST /incidents/{id}/analyze, GESTOR-only"
```

---

## Self-Review

**1. Cobertura do spec:** §2.1 (endpoint+SecurityConfig) → Task 7. §2.2 (DTO) → Task 1. §2.3 (entidade de auditoria) → Task 1. §2.4 (interface alternável) → Tasks 4/5. §2.5 (orquestração, 422/erro API/erro parse) → Task 6. §2.6 (duas versões de prompt) → Task 2. §2.7 (config) → Task 4. §4 (tabela de falhas) → coberta pelos testes de Tasks 6 e 7. §5 (estratégia de testes) → cada task tem seu próprio teste seguindo exatamente a convenção descrita (`@DataJpaTest`/`@SpringBootTest`+`HttpServer` local/MockMvc com `AuthTestSupport`).

**2. Varredura de placeholder:** nenhum "TBD"/"implementar depois" — toda etapa tem código completo.

**3. Consistência de tipos:** `RiskAnalysisResponse` definido em Task 1 é usado sem alteração de nome de campo em Tasks 3, 6 e 7. `MultimodalRiskClient.analisar(String, String)` definido em Task 4 é implementado identicamente em Task 5. `LlmProperties.ProviderConfig` (Task 4) é consumido do mesmo jeito por `ClaudeVisionClient` e `GeminiVisionClient`. `LlmAnalysisService.analisar(Long)` (Task 6) é chamado com a mesma assinatura em Task 7.
