# WH-A — Backend: Cadastro de Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao `WebhookSubscription` uma superfície de API GESTOR-only (CRUD + histórico de entregas) no backend `cypher`, fechando o gap registrado em E1 §9 — hoje só existe cadastro via `application.yaml` + restart.

**Architecture:** Uma fatia vertical só (sem esqueleto/trava em etapas, ao contrário dos planos de E4/multi-tenant): `WebhookService` novo, mesmo formato de `EquipeService`/`UsuarioService` (repositório injetado, validação de negócio via `CatalogValidationException`, DTO próprio nunca expondo a entidade), mais `WebhookController` fino por cima. Tarefa 1 entrega o CRUD completo com escopo por `empresaId` (herdado do mecanismo já pronto em multi-tenant — nenhum trabalho de tenant novo aqui); Tarefa 2 entrega o histórico paginado de entregas.

**Tech Stack:** Spring Boot 4.0.6, Spring Data JPA, H2, Spring Security (sessão), Lombok, MockMvc + `@SpringBootTest`, JUnit 5, AssertJ.

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-cadastro-webhook-design.md` (repo `cypher-front`), §2 (endpoints/DTOs), §2.2 (soft delete), §2.3 (histórico), §4 (comportamento sob falha).

**Repositório:** `/home/asaas/projects/cypher`

## Global Constraints

- Repositório: `/home/asaas/projects/cypher`. **Depende do plano `2026-08-29-mta-backend-empresa.md` já mergeado** (ou rodando localmente na mesma branch) — este plano assume `WebhookSubscription.empresaId`, `TenantContext.currentEmpresaId()`, `WebhookSubscriptionRepository.findByEmpresaIdAndAtivoTrue` e `AuthTestSupport`/`SetupRequest` com `empresaId`/`empresaNome` já existentes. Se `main` ainda não tem essas peças, ramificar a partir de `feat/mt-backend-empresa` em vez de `main`.
- Branch: `feat/wh-backend-webhook` — **não** usar worktree, apenas `git checkout -b`.
- **Nenhum handler de `MethodArgumentNotValidException` existe no projeto** (confirmado por grep) — violação de `@NotBlank`/`@Min`/`@Max` em `WebhookRequest` sempre devolve `400`, nunca `422` (spec §4, corrigida nesta revisão — ver commit `docs(spec)` do dia). `422` (via `CatalogValidationException`) fica reservado a checagem de negócio entre entidades — aqui, nenhuma existe (webhook não referencia catálogo).
- **`DELETE` é soft delete** (`ativo = false`), mesmo padrão de `Camera`/`Estacao` — nunca `deleteById`.
- **Sem endpoint de "regenerate"** para o `secret` (spec §2.1) — é só um campo comum de `PUT`, diferente de `Estacao.token`/`Camera.apiKey`.
- **Isolamento por `empresaId` é checado em toda operação por id** (`atualizar`/`desativar`/`deliveries`) via `.filter(a -> a.getEmpresaId().equals(empresaId))` — um id de outra empresa devolve `404`, nunca `403` nem vazamento de dado (mesmo espírito de `IncidentSseService`/`IncidentController` tratarem recurso fora do escopo como se não existisse, não como proibido).
- Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=NomeDaClasse` para uma classe; `./mvnw -o test` para a suíte inteira.

---

### Task 1: CRUD de `WebhookSubscription` — `WebhookService` + `WebhookController`

**Files:**
- Create: `src/main/java/com/dev4/cypher/dto/WebhookRequest.java`
- Create: `src/main/java/com/dev4/cypher/dto/WebhookResponse.java`
- Modify: `src/main/java/com/dev4/cypher/repository/WebhookSubscriptionRepository.java`
- Create: `src/main/java/com/dev4/cypher/service/WebhookService.java`
- Create: `src/main/java/com/dev4/cypher/controller/WebhookController.java`
- Test: `src/test/java/com/dev4/cypher/WebhookControllerApiTest.java`

**Interfaces:**
- Produces: `WebhookService.listar()`, `.criar(WebhookRequest)`, `.atualizar(Long, WebhookRequest)`, `.desativar(Long)` — consumidos pela Tarefa 2 (`deliveries`, mesma classe)

- [ ] **Step 1: Escrever o teste de cadastro, listagem e isolamento**

Criar `src/test/java/com/dev4/cypher/WebhookControllerApiTest.java`:

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@Transactional
@AutoConfigureMockMvc
class WebhookControllerApiTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void cadastraListaEEditaUmAssinante() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);

        mvc.perform(post("/api/v1/webhooks").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://exemplo.com/hook\", \"secret\": \"segredo123\", "
                                + "\"minSeverity\": 3, \"ativo\": true}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.url").value("https://exemplo.com/hook"))
                .andExpect(jsonPath("$.secret").value("segredo123"))
                .andExpect(jsonPath("$.ativo").value(true));

        String corpo = mvc.perform(get("/api/v1/webhooks").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andReturn().getResponse().getContentAsString();
        Long id = com.jayway.jsonpath.JsonPath.read(corpo, "$[0].id") instanceof Integer i
                ? i.longValue() : (Long) com.jayway.jsonpath.JsonPath.read(corpo, "$[0].id");

        mvc.perform(put("/api/v1/webhooks/" + id).session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://exemplo.com/hook\", \"secret\": \"novo-segredo\", "
                                + "\"minSeverity\": 2, \"ativo\": true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.secret").value("novo-segredo"))
                .andExpect(jsonPath("$.minSeverity").value(2));
    }

    @Test
    void urlDuplicadaDevolve409() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);
        String corpo = "{\"url\": \"https://exemplo.com/duplicada\", \"secret\": \"x\", "
                + "\"minSeverity\": 0, \"ativo\": true}";

        mvc.perform(post("/api/v1/webhooks").session(session)
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/webhooks").session(session)
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isConflict());
    }

    @Test
    void minSeverityForaDeFaixaDevolve400() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);

        mvc.perform(post("/api/v1/webhooks").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://exemplo.com/x\", \"secret\": \"segredo\", "
                                + "\"minSeverity\": 5, \"ativo\": true}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void secretVazioDevolve400() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);

        mvc.perform(post("/api/v1/webhooks").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://exemplo.com/y\", \"secret\": \"\", "
                                + "\"minSeverity\": 0, \"ativo\": true}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void desativarEhSoftDeleteEDesapareceDaListagem() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);
        String corpo = mvc.perform(post("/api/v1/webhooks").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://exemplo.com/desativar\", \"secret\": \"x\", "
                                + "\"minSeverity\": 0, \"ativo\": true}"))
                .andReturn().getResponse().getContentAsString();
        Number id = com.jayway.jsonpath.JsonPath.read(corpo, "$.id");

        mvc.perform(delete("/api/v1/webhooks/" + id).session(session))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/webhooks").session(session))
                .andExpect(jsonPath("$[?(@.url=='https://exemplo.com/desativar')]").isEmpty());
    }

    @Test
    void assinanteDeUmaEmpresaNaoApareceEditaOuDesativaPorOutra() throws Exception {
        MockHttpSession sessaoAcme = setupEmpresa("acme-wh", "Acme");
        MockHttpSession sessaoGlobex = setupEmpresa("globex-wh", "Globex");

        String corpo = mvc.perform(post("/api/v1/webhooks").session(sessaoAcme)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://exemplo.com/acme-hook\", \"secret\": \"x\", "
                                + "\"minSeverity\": 0, \"ativo\": true}"))
                .andReturn().getResponse().getContentAsString();
        Number idDaAcme = com.jayway.jsonpath.JsonPath.read(corpo, "$.id");

        mvc.perform(get("/api/v1/webhooks").session(sessaoGlobex))
                .andExpect(jsonPath("$.length()").value(0));

        mvc.perform(put("/api/v1/webhooks/" + idDaAcme).session(sessaoGlobex)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://exemplo.com/roubado\", \"secret\": \"x\", "
                                + "\"minSeverity\": 0, \"ativo\": true}"))
                .andExpect(status().isNotFound());

        mvc.perform(delete("/api/v1/webhooks/" + idDaAcme).session(sessaoGlobex))
                .andExpect(status().isNotFound());
    }

    private MockHttpSession setupEmpresa(String empresaId, String empresaNome) throws Exception {
        MockHttpSession session = new MockHttpSession();
        mvc.perform(post("/api/v1/setup").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"username\": \"gestor\", \"password\": \"senha123\", "
                                + "\"empresaId\": \"%s\", \"empresaNome\": \"%s\"}").formatted(empresaId, empresaNome)))
                .andExpect(status().isOk());
        return session;
    }
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=WebhookControllerApiTest`
Expected: FAIL na compilação — `WebhookRequest`/`WebhookResponse`/`WebhookController`/`WebhookService` não existem.

- [ ] **Step 3: Criar os DTOs**

Criar `src/main/java/com/dev4/cypher/dto/WebhookRequest.java`:

```java
package com.dev4.cypher.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Escrita de assinante de webhook (spec §2). {@code secret} e digitado pelo
 * gestor, nunca gerado pelo sistema — diferente de `Estacao.token`/`Camera.apiKey`
 * (spec §2.1): frequentemente e um valor combinado com o sistema externo.
 */
public record WebhookRequest(
        @NotBlank @Size(max = 500) String url,
        @NotBlank @Size(max = 200) String secret,
        @NotNull @Min(0) @Max(4) Integer minSeverity,
        Boolean ativo
) {
}
```

Criar `src/main/java/com/dev4/cypher/dto/WebhookResponse.java`:

```java
package com.dev4.cypher.dto;

/**
 * {@code secret} e devolvido de proposito — diferente de `Camera.fonte`
 * (nunca exposto), o segredo do webhook e conhecido e configurado pelo
 * proprio GESTOR que o cadastrou (spec §2).
 */
public record WebhookResponse(Long id, String url, String secret, Integer minSeverity, boolean ativo) {
}
```

- [ ] **Step 4: Adicionar `findByUrl`/`findByEmpresaId` ao repositório**

Em `WebhookSubscriptionRepository.java`:

```java
    List<WebhookSubscription> findByEmpresaId(String empresaId);

    Optional<WebhookSubscription> findByUrl(String url);
```

(adicionar o import `java.util.Optional` se ainda não estiver presente.)

- [ ] **Step 5: Criar `WebhookService`**

Criar `src/main/java/com/dev4/cypher/service/WebhookService.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.catalog.CatalogValidationException;
import com.dev4.cypher.dto.WebhookRequest;
import com.dev4.cypher.dto.WebhookResponse;
import com.dev4.cypher.model.WebhookSubscription;
import com.dev4.cypher.repository.WebhookSubscriptionRepository;
import com.dev4.cypher.security.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** CRUD de assinante de webhook (spec §2), escopado por empresa. */
@Service
public class WebhookService {

    private final WebhookSubscriptionRepository assinaturas;

    public WebhookService(WebhookSubscriptionRepository assinaturas) {
        this.assinaturas = assinaturas;
    }

    @Transactional(readOnly = true)
    public List<WebhookResponse> listar() {
        return assinaturas.findByEmpresaId(TenantContext.currentEmpresaId()).stream()
                .map(this::toResponse).toList();
    }

    @Transactional
    public WebhookResponse criar(WebhookRequest req) {
        exigirUrlLivre(req.url(), null);
        WebhookSubscription nova = new WebhookSubscription(null, req.url(), req.secret(),
                req.minSeverity(), req.ativo() == null || req.ativo(), TenantContext.currentEmpresaId());
        return toResponse(assinaturas.saveAndFlush(nova));
    }

    @Transactional
    public Optional<WebhookResponse> atualizar(Long id, WebhookRequest req) {
        return doTenant(id).map(assinatura -> {
            exigirUrlLivre(req.url(), id);
            assinatura.setUrl(req.url());
            assinatura.setSecret(req.secret());
            assinatura.setMinSeverity(req.minSeverity());
            if (req.ativo() != null) {
                assinatura.setAtivo(req.ativo());
            }
            return toResponse(assinaturas.saveAndFlush(assinatura));
        });
    }

    @Transactional
    public boolean desativar(Long id) {
        return doTenant(id).map(assinatura -> {
            assinatura.setAtivo(false);
            assinaturas.saveAndFlush(assinatura);
            return true;
        }).orElse(false);
    }

    /** Devolve a assinatura só se pertencer ao tenant atual — um id de outra empresa e tratado como inexistente. */
    Optional<WebhookSubscription> doTenant(Long id) {
        String empresaId = TenantContext.currentEmpresaId();
        return assinaturas.findById(id).filter(a -> a.getEmpresaId().equals(empresaId));
    }

    private void exigirUrlLivre(String url, Long idPropria) {
        assinaturas.findByUrl(url)
                .filter(outra -> !outra.getId().equals(idPropria))
                .ifPresent(outra -> {
                    throw new CatalogValidationException(HttpStatus.CONFLICT,
                            "URL ja usada por outro assinante: " + url);
                });
    }

    WebhookResponse toResponse(WebhookSubscription w) {
        return new WebhookResponse(w.getId(), w.getUrl(), w.getSecret(), w.getMinSeverity(), w.isAtivo());
    }
}
```

`doTenant`/`toResponse` ficam com visibilidade de pacote (não `private`) porque a Tarefa 2 os reaproveita a partir do mesmo arquivo.

- [ ] **Step 6: Criar `WebhookController`**

Criar `src/main/java/com/dev4/cypher/controller/WebhookController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.WebhookRequest;
import com.dev4.cypher.dto.WebhookResponse;
import com.dev4.cypher.service.WebhookService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * CRUD de assinante de webhook (spec §2) — GESTOR-only, sem `@PreAuthorize`
 * aqui: mesma proteção centralizada em `SecurityConfig` que já cobre
 * `/teams`/`/users` (nenhuma linha explicita, cai no catch-all
 * `anyRequest().hasRole("GESTOR")`).
 */
@RestController
@RequestMapping("/api/v1/webhooks")
public class WebhookController {

    private final WebhookService service;

    public WebhookController(WebhookService service) {
        this.service = service;
    }

    @GetMapping
    public List<WebhookResponse> list() {
        return service.listar();
    }

    @PostMapping
    public ResponseEntity<WebhookResponse> create(@Valid @RequestBody WebhookRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.criar(req));
    }

    @PutMapping("/{id}")
    public ResponseEntity<WebhookResponse> update(@PathVariable Long id, @Valid @RequestBody WebhookRequest req) {
        return service.atualizar(id, req)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deactivate(@PathVariable Long id) {
        return service.desativar(id)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }
}
```

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=WebhookControllerApiTest`
Expected: PASS. Se `com.jayway.jsonpath.JsonPath` não estiver no classpath de teste, trocar as leituras de `id` por `objectMapper.readTree(corpo).get("id").asLong()` (o `ObjectMapper` já é injetável via `@Autowired` em qualquer `@SpringBootTest`, e `jayway.jsonpath` já é uma dependência transitiva de `spring-boot-starter-test`/`json-path` usada por `jsonPath(...)` nas asserções do MockMvc, então normalmente já está disponível).

- [ ] **Step 8: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/main/java/com/dev4/cypher/dto/WebhookRequest.java \
        src/main/java/com/dev4/cypher/dto/WebhookResponse.java \
        src/main/java/com/dev4/cypher/repository/WebhookSubscriptionRepository.java \
        src/main/java/com/dev4/cypher/service/WebhookService.java \
        src/main/java/com/dev4/cypher/controller/WebhookController.java \
        src/test/java/com/dev4/cypher/WebhookControllerApiTest.java
git commit -m "feat: adiciona CRUD de assinante de webhook, escopado por empresa"
```

---

### Task 2: Histórico paginado de entregas

**Files:**
- Create: `src/main/java/com/dev4/cypher/dto/WebhookDeliveryResponse.java`
- Modify: `src/main/java/com/dev4/cypher/repository/WebhookDeliveryRepository.java`
- Modify: `src/main/java/com/dev4/cypher/service/WebhookService.java`
- Modify: `src/main/java/com/dev4/cypher/controller/WebhookController.java`
- Test: `src/test/java/com/dev4/cypher/WebhookControllerApiTest.java`

**Interfaces:**
- Consumes: `WebhookService.doTenant(Long)` (Tarefa 1)
- Produces: `GET /api/v1/webhooks/{id}/deliveries` → `Page<WebhookDeliveryResponse>`

- [ ] **Step 1: Escrever o teste de histórico paginado e isolamento**

Adicionar em `WebhookControllerApiTest.java`:

```java
    @Autowired
    private com.dev4.cypher.repository.WebhookDeliveryRepository entregas;

    @Test
    void historicoDeEntregasEhPaginadoEEscopadoPorEmpresa() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);
        String corpo = mvc.perform(post("/api/v1/webhooks").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://exemplo.com/historico\", \"secret\": \"x\", "
                                + "\"minSeverity\": 0, \"ativo\": true}"))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(corpo, "$.id")).longValue();

        entregas.saveAndFlush(new com.dev4.cypher.model.WebhookDelivery(null, id, "incident-1",
                "{}", com.dev4.cypher.model.DeliveryStatus.ENTREGUE, 1, null, null));
        entregas.saveAndFlush(new com.dev4.cypher.model.WebhookDelivery(null, id, "incident-2",
                "{}", com.dev4.cypher.model.DeliveryStatus.PENDENTE, 1, "timeout", null));

        mvc.perform(get("/api/v1/webhooks/" + id + "/deliveries").session(session)
                        .param("page", "0").param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void historicoDeAssinanteDeOutraEmpresaDevolve404() throws Exception {
        MockHttpSession sessaoAcme = setupEmpresa("acme-hist", "Acme");
        MockHttpSession sessaoGlobex = setupEmpresa("globex-hist", "Globex");

        String corpo = mvc.perform(post("/api/v1/webhooks").session(sessaoAcme)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\": \"https://exemplo.com/hist-acme\", \"secret\": \"x\", "
                                + "\"minSeverity\": 0, \"ativo\": true}"))
                .andReturn().getResponse().getContentAsString();
        Number id = com.jayway.jsonpath.JsonPath.read(corpo, "$.id");

        mvc.perform(get("/api/v1/webhooks/" + id + "/deliveries").session(sessaoGlobex))
                .andExpect(status().isNotFound());
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=WebhookControllerApiTest`
Expected: FAIL na compilação — `WebhookDeliveryResponse` não existe, `findBySubscriptionId` não existe, `GET .../deliveries` não existe.

- [ ] **Step 3: Criar o DTO e o método de repositório**

Criar `src/main/java/com/dev4/cypher/dto/WebhookDeliveryResponse.java`:

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.model.DeliveryStatus;

import java.time.OffsetDateTime;

public record WebhookDeliveryResponse(
        Long id,
        String incidentKey,
        DeliveryStatus status,
        int tentativas,
        String ultimoErro,
        OffsetDateTime proximaTentativa
) {
}
```

Em `WebhookDeliveryRepository.java`:

```java
    org.springframework.data.domain.Page<WebhookDelivery> findBySubscriptionId(
            Long subscriptionId, org.springframework.data.domain.Pageable pageable);
```

(ou, mais no estilo do resto do arquivo, adicionar os imports `org.springframework.data.domain.Page`/`.Pageable` no topo e usar os tipos sem qualificação.)

- [ ] **Step 4: Adicionar `deliveries` a `WebhookService`**

```java
    @Transactional(readOnly = true)
    public Optional<Page<WebhookDeliveryResponse>> deliveries(Long id, Pageable pageable) {
        return doTenant(id).map(a -> entregas.findBySubscriptionId(id, pageable).map(this::toResponse));
    }

    private WebhookDeliveryResponse toResponse(WebhookDelivery d) {
        return new WebhookDeliveryResponse(d.getId(), d.getIncidentKey(), d.getStatus(),
                d.getTentativas(), d.getUltimoErro(), d.getProximaTentativa());
    }
```

Injetar `WebhookDeliveryRepository entregas` no construtor de `WebhookService` (segundo parâmetro, ao lado de `assinaturas`), e adicionar os imports `com.dev4.cypher.dto.WebhookDeliveryResponse`, `com.dev4.cypher.model.WebhookDelivery`, `com.dev4.cypher.repository.WebhookDeliveryRepository`, `org.springframework.data.domain.Page`, `org.springframework.data.domain.Pageable`.

- [ ] **Step 5: Adicionar o endpoint ao controller**

Em `WebhookController.java`:

```java
    @GetMapping("/{id}/deliveries")
    public ResponseEntity<Page<WebhookDeliveryResponse>> deliveries(
            @PathVariable Long id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "id"));
        return service.deliveries(id, pageable)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
```

Adicionar os imports `com.dev4.cypher.dto.WebhookDeliveryResponse`, `org.springframework.data.domain.Page`, `org.springframework.data.domain.PageRequest`, `org.springframework.data.domain.Pageable`, `org.springframework.data.domain.Sort`, `org.springframework.web.bind.annotation.RequestParam`.

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=WebhookControllerApiTest`
Expected: PASS

- [ ] **Step 7: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: adiciona historico paginado de entregas de webhook"
```

---

## Self-Review

**Cobertura da spec:** §2 (endpoints/DTOs) → Tarefas 1 e 2. §2.1 (secret digitado, sem regenerate) → `WebhookRequest`/`WebhookService.atualizar` (Tarefa 1), nenhum endpoint de regenerate criado. §2.2 (soft delete) → `WebhookService.desativar` (Tarefa 1). §2.3 (histórico) → Tarefa 2. §4 (comportamento sob falha) → cada linha da tabela tem teste correspondente (409 URL duplicada, 400 minSeverity/secret, soft delete some da listagem, 404 entre empresas). §5 "Java" (estratégia de testes) → coberta integralmente pelas duas tarefas.

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** `WebhookService.doTenant`/`toResponse(WebhookSubscription)` (Tarefa 1) reaproveitados sem renomear na Tarefa 2; `toResponse(WebhookDelivery)` é uma sobrecarga nova, não conflita por assinatura.

**Fora de escopo confirmado:** nenhuma tarefa deste plano cria endpoint de reenvio manual, teste de conectividade ou notificação de `MAX_TENTATIVAS` — consistente com spec §6.

---

**Plan complete and saved to `docs/superpowers/plans/webhook/2026-08-29-wha-backend-webhook.md`.**
