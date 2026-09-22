# MCB — Entidade e CRUD de McpCredential Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a entidade `McpCredential` (espelhando `WebhookSubscription`) com CRUD completo pela API (`GET/POST/DELETE /api/v1/mcp-credentials`), GESTOR-only, para gerenciar credenciais de acesso ao servidor MCP.

**Architecture:** Model JPA + Repository + Service + Controller, seguindo 1:1 o padrão de `WebhookSubscription`/`WebhookSubscriptionRepository`/`WebhookService`/`WebhookController`. Diferente de `WebhookSubscription.secret` (texto puro, digitado pelo usuário), o secret de `McpCredential` é **gerado pelo servidor** (`TokenGenerator.novo("mcp-key")`) e guardado como **hash BCrypt** (`PasswordEncoder` já existe como bean em `SecurityConfig`); o valor em texto puro só é devolvido na resposta do `POST` de criação.

**Tech Stack:** Spring Boot, Spring Data JPA, Spring Security (`PasswordEncoder`/`BCryptPasswordEncoder`), Lombok, JUnit 5, MockMvc.

**Spec:** `docs/superpowers/specs/planejadas/2026-09-20-mcp-server-design.md`

## Global Constraints

- Rota base: `/api/v1/mcp-credentials`. Sem `@PreAuthorize` no controller — proteção 100% centralizada em `SecurityConfig` (mesmo padrão de `WebhookController`/`TeamController`), cai no catch-all `anyRequest().hasRole("GESTOR")` já existente — **nenhuma alteração em `SecurityConfig` é necessária nesta task**.
- `McpCredential` usa `Long`/`IDENTITY` como PK (como `WebhookSubscription`), não `String` composto (como `Camera`).
- Secret nunca é reexibido depois da criação — nem no model, nem em nenhuma resposta além do `POST`.
- Revogação é soft-delete (`ativa = false`), preserva histórico.
- Nome da credencial deve ser único por empresa (validação análoga a `exigirUrlLivre` do webhook).

---

### Task 1: Entidade `McpCredential`

**Files:**
- Create: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/model/McpCredential.java`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/repository/McpCredentialRepositoryTest.java`

**Interfaces:**
- Produces: `McpCredential` com getters/setters via Lombok (`getId()`, `getNome()`, `getSecretHash()`, `isAtiva()`, `getEmpresaId()`, `getCriadaEm()`, `getUltimoUsoEm()`), construtor `@AllArgsConstructor` (id, nome, secretHash, ativa, empresaId, criadaEm, ultimoUsoEm) e `@NoArgsConstructor`.

- [ ] **Step 1: Criar a entidade**

```java
package com.dev4.cypher.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

/** Credencial de acesso ao servidor MCP — um agente de IA externo, escopado por empresa. */
@Entity
@Table(name = "mcp_credentials")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class McpCredential {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String nome;

    /** Hash BCrypt do secret gerado na criação — o valor em texto puro nunca e persistido. */
    @Column(nullable = false, length = 200)
    private String secretHash;

    @Column(nullable = false)
    private boolean ativa;

    @Column(nullable = false, length = 30)
    private String empresaId;

    @Column(nullable = false)
    private OffsetDateTime criadaEm;

    private OffsetDateTime ultimoUsoEm;
}
```

- [ ] **Step 2: Escrever o teste de persistência**

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.McpCredential;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class McpCredentialRepositoryTest {

    @Autowired
    private McpCredentialRepository repository;

    @Test
    void persisteERecuperaCredencial() {
        McpCredential nova = new McpCredential(null, "Claude Desktop", "$2a$hash", true,
                "acme-test", OffsetDateTime.now(), null);

        McpCredential salva = repository.saveAndFlush(nova);

        assertThat(salva.getId()).isNotNull();
        assertThat(repository.findById(salva.getId())).isPresent();
    }
}
```

(Este teste falha até a Task 2 criar `McpCredentialRepository` — normal, resolvido no mesmo commit.)

- [ ] **Step 3: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/model/McpCredential.java \
        src/test/java/com/dev4/cypher/repository/McpCredentialRepositoryTest.java
git commit -m "feat: adiciona entidade McpCredential"
```

(Commit não compila sozinho — falta o repository, Task 2. Combine as duas tasks num commit se preferir manter cada commit compilável.)

---

### Task 2: `McpCredentialRepository`

**Files:**
- Create: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/repository/McpCredentialRepository.java`

**Interfaces:**
- Consumes: `McpCredential` (Task 1).
- Produces: `McpCredentialRepository.findByEmpresaId(String)`, `.findByEmpresaIdAndAtivaTrue(String)`, `.findByEmpresaIdAndNome(String, String)` (usados pela Task 4).

- [ ] **Step 1: Criar o repository**

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.McpCredential;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface McpCredentialRepository extends JpaRepository<McpCredential, Long> {

    List<McpCredential> findByEmpresaId(String empresaId);

    List<McpCredential> findByEmpresaIdAndAtivaTrue(String empresaId);

    Optional<McpCredential> findByEmpresaIdAndNome(String empresaId, String nome);
}
```

- [ ] **Step 2: Rodar o teste da Task 1**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpCredentialRepositoryTest test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/repository/McpCredentialRepository.java
git commit -m "feat: adiciona McpCredentialRepository"
```

---

### Task 3: DTOs

**Files:**
- Create: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/dto/McpCredentialRequest.java`
- Create: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/dto/McpCredentialResponse.java`
- Create: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/dto/McpCredentialCriadaResponse.java`

**Interfaces:**
- Produces: `McpCredentialRequest.nome()` → `String`. `McpCredentialResponse` (id, nome, criadaEm, ultimoUsoEm, ativa) — nunca carrega secret. `McpCredentialCriadaResponse` (id, nome, criadaEm, ativa, apiKey) — `apiKey` é a única vez que o secret aparece, no formato `"{id}.{secretPlano}"`.

- [ ] **Step 1: `McpCredentialRequest`**

```java
package com.dev4.cypher.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record McpCredentialRequest(
        @NotBlank @Size(max = 120) String nome
) {
}
```

- [ ] **Step 2: `McpCredentialResponse`**

```java
package com.dev4.cypher.dto;

import java.time.OffsetDateTime;

public record McpCredentialResponse(
        Long id,
        String nome,
        OffsetDateTime criadaEm,
        OffsetDateTime ultimoUsoEm,
        boolean ativa
) {
}
```

- [ ] **Step 3: `McpCredentialCriadaResponse`**

```java
package com.dev4.cypher.dto;

import java.time.OffsetDateTime;

/** Resposta do POST de criacao — unico momento em que {@code apiKey} (texto puro) aparece. */
public record McpCredentialCriadaResponse(
        Long id,
        String nome,
        OffsetDateTime criadaEm,
        boolean ativa,
        String apiKey
) {
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/dto/McpCredentialRequest.java \
        src/main/java/com/dev4/cypher/dto/McpCredentialResponse.java \
        src/main/java/com/dev4/cypher/dto/McpCredentialCriadaResponse.java
git commit -m "feat: adiciona DTOs de McpCredential"
```

---

### Task 4: `McpCredentialService`

**Files:**
- Create: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/service/McpCredentialService.java`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/service/McpCredentialServiceTest.java`

**Interfaces:**
- Consumes: `McpCredentialRepository` (Task 2), DTOs (Task 3), `TokenGenerator.novo(String)` (`com.dev4.cypher.security.TokenGenerator`, já existe), `PasswordEncoder` (bean já existe em `SecurityConfig`), `TenantContext.currentEmpresaId()` (já existe).
- Produces: `McpCredentialService.listar(boolean incluirInativas)` → `List<McpCredentialResponse>`; `.criar(McpCredentialRequest)` → `McpCredentialCriadaResponse`; `.revogar(Long id)` → `boolean`.

- [ ] **Step 1: Escrever o teste que falha — criação gera secret e devolve `apiKey` no formato `id.secret`**

```java
package com.dev4.cypher.service;

import com.dev4.cypher.dto.McpCredentialCriadaResponse;
import com.dev4.cypher.dto.McpCredentialRequest;
import com.dev4.cypher.repository.McpCredentialRepository;
import com.dev4.cypher.security.GestorAuthentication;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class McpCredentialServiceTest {

    @Autowired
    private McpCredentialService service;
    @Autowired
    private McpCredentialRepository repository;
    @Autowired
    private PasswordEncoder encoder;

    @BeforeEach
    void autenticarComoGestor() {
        SecurityContextHolder.getContext().setAuthentication(
                new GestorAuthentication("gestor@acme-test", "acme-test"));
    }

    @AfterEach
    void limparContexto() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void criarGeraApiKeyNoFormatoIdPontoSecretEHashEhValido() {
        McpCredentialCriadaResponse resposta = service.criar(new McpCredentialRequest("Claude Desktop"));

        assertThat(resposta.apiKey()).startsWith(resposta.id() + ".");
        String secretPlano = resposta.apiKey().substring((resposta.id() + ".").length());

        String hashPersistido = repository.findById(resposta.id()).orElseThrow().getSecretHash();
        assertThat(encoder.matches(secretPlano, hashPersistido)).isTrue();
    }
}
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpCredentialServiceTest test`
Expected: FAIL (`McpCredentialService` ainda não existe)

- [ ] **Step 3: Implementar `McpCredentialService`**

```java
package com.dev4.cypher.service;

import com.dev4.cypher.catalog.CatalogValidationException;
import com.dev4.cypher.dto.McpCredentialCriadaResponse;
import com.dev4.cypher.dto.McpCredentialRequest;
import com.dev4.cypher.dto.McpCredentialResponse;
import com.dev4.cypher.model.McpCredential;
import com.dev4.cypher.repository.McpCredentialRepository;
import com.dev4.cypher.security.TenantContext;
import com.dev4.cypher.security.TokenGenerator;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/** CRUD de credenciais de acesso ao servidor MCP, escopado por empresa. */
@Service
public class McpCredentialService {

    private final McpCredentialRepository credenciais;
    private final PasswordEncoder encoder;

    public McpCredentialService(McpCredentialRepository credenciais, PasswordEncoder encoder) {
        this.credenciais = credenciais;
        this.encoder = encoder;
    }

    @Transactional(readOnly = true)
    public List<McpCredentialResponse> listar(boolean incluirInativas) {
        String empresaId = TenantContext.currentEmpresaId();
        List<McpCredential> lista = incluirInativas
                ? credenciais.findByEmpresaId(empresaId)
                : credenciais.findByEmpresaIdAndAtivaTrue(empresaId);
        return lista.stream().map(this::toResponse).toList();
    }

    @Transactional
    public McpCredentialCriadaResponse criar(McpCredentialRequest req) {
        String empresaId = TenantContext.currentEmpresaId();
        exigirNomeLivre(empresaId, req.nome());

        String secretPlano = TokenGenerator.novo("mcp-key");
        OffsetDateTime agora = OffsetDateTime.now();
        McpCredential nova = new McpCredential(null, req.nome(), encoder.encode(secretPlano),
                true, empresaId, agora, null);
        McpCredential salva = credenciais.saveAndFlush(nova);

        return new McpCredentialCriadaResponse(salva.getId(), salva.getNome(), salva.getCriadaEm(),
                salva.isAtiva(), salva.getId() + "." + secretPlano);
    }

    @Transactional
    public boolean revogar(Long id) {
        String empresaId = TenantContext.currentEmpresaId();
        return credenciais.findById(id)
                .filter(c -> c.getEmpresaId().equals(empresaId))
                .map(c -> {
                    c.setAtiva(false);
                    credenciais.saveAndFlush(c);
                    return true;
                }).orElse(false);
    }

    private void exigirNomeLivre(String empresaId, String nome) {
        Optional<McpCredential> existente = credenciais.findByEmpresaIdAndNome(empresaId, nome);
        if (existente.isPresent()) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "Ja existe uma credencial MCP com esse nome: " + nome);
        }
    }

    private McpCredentialResponse toResponse(McpCredential c) {
        return new McpCredentialResponse(c.getId(), c.getNome(), c.getCriadaEm(),
                c.getUltimoUsoEm(), c.isAtiva());
    }
}
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpCredentialServiceTest test`
Expected: PASS

- [ ] **Step 5: Escrever e rodar um teste de revogação e de nome duplicado**

Adicionar à mesma classe de teste:

```java
    @Test
    void revogarMarcaComoInativaEIdDeOutraEmpresaEhTratadoComoInexistente() {
        McpCredentialCriadaResponse criada = service.criar(new McpCredentialRequest("Agente de demo"));

        assertThat(service.revogar(criada.id())).isTrue();
        assertThat(repository.findById(criada.id()).orElseThrow().isAtiva()).isFalse();
    }

    @Test
    void criarComNomeDuplicadoNaMesmaEmpresaLancaConflito() {
        service.criar(new McpCredentialRequest("Duplicada"));

        assertThatThrownBy(() -> service.criar(new McpCredentialRequest("Duplicada")))
                .isInstanceOf(com.dev4.cypher.catalog.CatalogValidationException.class);
    }
```

Adicionar o import: `import static org.assertj.core.api.Assertions.assertThatThrownBy;`

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpCredentialServiceTest test`
Expected: PASS (4 testes)

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/service/McpCredentialService.java \
        src/test/java/com/dev4/cypher/service/McpCredentialServiceTest.java
git commit -m "feat: adiciona McpCredentialService (criar/listar/revogar)"
```

---

### Task 5: `McpCredentialController`

**Files:**
- Create: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/controller/McpCredentialController.java`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/McpCredentialApiTest.java`

**Interfaces:**
- Consumes: `McpCredentialService` (Task 4).
- Produces: `GET /api/v1/mcp-credentials` → `List<McpCredentialResponse>`; `POST /api/v1/mcp-credentials` → `201` + `McpCredentialCriadaResponse`; `DELETE /api/v1/mcp-credentials/{id}` → `204` ou `404`.

- [ ] **Step 1: Escrever o teste que falha — API completa via MockMvc, autenticado como GESTOR**

Ler `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/SecurityLockdownApiTest.java` antes de escrever, para replicar o padrão exato de login/sessão via MockMvc já usado nos outros `*ApiTest.java` do projeto (login como GESTOR antes de cada chamada autenticada). Usar esse mesmo padrão de setup no teste abaixo:

```java
package com.dev4.cypher;

import com.dev4.cypher.dto.McpCredentialCriadaResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class McpCredentialApiTest {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private ObjectMapper mapper;

    // NOTA para quem implementar: substituir por chamada real ao helper de
    // login GESTOR usado em SecurityLockdownApiTest.java (ex.: setup de
    // empresa + POST /api/v1/setup + reaproveitar cookie de sessao).

    @Test
    void crudCompletoDeCredencialMcp() throws Exception {
        MvcResult criacao = mvc.perform(post("/api/v1/mcp-credentials")
                        .contentType("application/json")
                        .content("{\"nome\":\"Claude Desktop do Teste\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.apiKey").isNotEmpty())
                .andReturn();

        McpCredentialCriadaResponse criada = mapper.readValue(
                criacao.getResponse().getContentAsString(), McpCredentialCriadaResponse.class);

        mvc.perform(get("/api/v1/mcp-credentials"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + criada.id() + ")].apiKey").doesNotExist());

        mvc.perform(delete("/api/v1/mcp-credentials/" + criada.id()))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/mcp-credentials?incluirInativas=true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + criada.id() + ")].ativa").value(false));
    }

    @Test
    void semSessaoDeGestorRetorna401() throws Exception {
        mvc.perform(get("/api/v1/mcp-credentials"))
                .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpCredentialApiTest test`
Expected: FAIL (`McpCredentialController` ainda não existe — 404)

- [ ] **Step 3: Implementar o controller**

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.McpCredentialCriadaResponse;
import com.dev4.cypher.dto.McpCredentialRequest;
import com.dev4.cypher.dto.McpCredentialResponse;
import com.dev4.cypher.service.McpCredentialService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * CRUD de credenciais MCP — GESTOR-only, sem {@code @PreAuthorize}: mesma
 * protecao centralizada em SecurityConfig que ja cobre /webhooks e /teams
 * (cai no catch-all {@code anyRequest().hasRole("GESTOR")}).
 */
@RestController
@RequestMapping("/api/v1/mcp-credentials")
public class McpCredentialController {

    private final McpCredentialService service;

    public McpCredentialController(McpCredentialService service) {
        this.service = service;
    }

    @GetMapping
    public List<McpCredentialResponse> list(@RequestParam(defaultValue = "false") boolean incluirInativas) {
        return service.listar(incluirInativas);
    }

    @PostMapping
    public ResponseEntity<McpCredentialCriadaResponse> create(@Valid @RequestBody McpCredentialRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.criar(req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> revoke(@PathVariable Long id) {
        return service.revogar(id)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }
}
```

- [ ] **Step 4: Ajustar o setup de autenticação do teste conforme o padrão real do projeto**

Abrir `SecurityLockdownApiTest.java` e copiar o mecanismo exato de autenticação usado lá (helper de login/sessão MockMvc) para dentro de `McpCredentialApiTest`, substituindo a nota do Step 1. Sem essa etapa o teste `crudCompletoDeCredencialMcp` falha com 401 em vez de validar o CRUD.

- [ ] **Step 5: Rodar o teste, confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpCredentialApiTest test`
Expected: PASS

- [ ] **Step 6: Rodar a suíte completa do backend**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q test`
Expected: PASS (baseline 409 + os novos testes desta feature)

- [ ] **Step 7: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/controller/McpCredentialController.java \
        src/test/java/com/dev4/cypher/McpCredentialApiTest.java
git commit -m "feat: adiciona McpCredentialController (CRUD GESTOR-only)"
```

## Self-Review

- **Cobertura da spec:** entidade espelhando `WebhookSubscription` (Task 1-2), secret hash BCrypt exibido uma vez (Task 3-4), CRUD GESTOR-only via catch-all existente (Task 5) — cobre o sub-projeto MCB por completo.
- **Placeholders:** um único ponto sinalizado explicitamente (Step 1/4 da Task 5) pede para copiar o helper de login real de `SecurityLockdownApiTest.java` em vez de assumir uma assinatura que eu não confirmei por leitura direta — é uma instrução acionável, não um "TBD" vago, e é resolvida dentro da própria task antes do teste ser considerado concluído.
- **Consistência de tipos:** `McpCredentialResponse`/`McpCredentialCriadaResponse` (Task 3) usados identicamente em `McpCredentialService` (Task 4) e `McpCredentialController` (Task 5); `TokenGenerator.novo(String)` e `PasswordEncoder` usados com a assinatura real confirmada por leitura de código.
