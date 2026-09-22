# MCC — Autenticação MCP (McpAuthentication + filtro + TenantContext) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar o quarto mecanismo de autenticação do backend — `McpKeyAuthenticationFilter` valida o header `X-Cypher-Mcp-Key` (formato `{id}.{secret}`) contra `McpCredential`, autentica como `McpAuthentication` (`ROLE_MCP`), e `TenantContext` passa a resolver `empresaId` também a partir desse tipo.

**Architecture:** Réplica exata do padrão `CypherKeyAuthenticationFilter`/`PipelineAuthentication` já existente, com uma diferença: o secret é hasheado (BCrypt), então o filtro não pode fazer um lookup direto por valor — extrai o `id` numérico do header, busca `McpCredential` por id, e valida o secret com `PasswordEncoder.matches`. Diferente do filtro de câmera (best-effort fora da rota de ingestão), o filtro MCP é **sempre obrigatório** em `/mcp/**` — sem header válido, 401 direto.

**Tech Stack:** Spring Security (`OncePerRequestFilter`, `AbstractAuthenticationToken`), Spring Data JPA.

**Spec:** `docs/superpowers/specs/planejadas/2026-09-20-mcp-server-design.md`

## Global Constraints

- Header: `X-Cypher-Mcp-Key`, formato `{id}.{secretPlano}` (ex.: `"42.mcp-key-a1b2c3..."`) — o mesmo formato retornado por `McpCredentialCriadaResponse.apiKey()` (MCB Task 4).
- Path protegido: `/mcp/**` (path onde o servidor MCP será montado — MCD). Header ausente/inválido nesse path → `401` direto, sem chamar o resto da chain.
- `McpAuthentication` carrega `mcpCredentialId` (Long) e `empresaId` (String), role única `ROLE_MCP`.
- `TenantContext.currentEmpresaId()` ganha um quarto `if` — sem alterar a assinatura do método nem o comportamento dos três tipos existentes.

---

### Task 1: `McpAuthentication`

**Files:**
- Create: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/security/McpAuthentication.java`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/security/McpAuthenticationTest.java`

**Interfaces:**
- Produces: `McpAuthentication(Long mcpCredentialId, String empresaId)`, `.getMcpCredentialId()` → `Long`, `.getEmpresaId()` → `String`, autoridade `ROLE_MCP`.

- [ ] **Step 1: Escrever o teste**

```java
package com.dev4.cypher.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class McpAuthenticationTest {

    @Test
    void carregaCredencialEEmpresaComRoleMcp() {
        McpAuthentication auth = new McpAuthentication(42L, "acme-test");

        assertThat(auth.getMcpCredentialId()).isEqualTo(42L);
        assertThat(auth.getEmpresaId()).isEqualTo("acme-test");
        assertThat(auth.isAuthenticated()).isTrue();
        assertThat(auth.getAuthorities())
                .extracting(Object::toString)
                .containsExactly("ROLE_MCP");
        assertThat(auth.getPrincipal()).isEqualTo(42L);
        assertThat(auth.getCredentials()).isNull();
    }
}
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpAuthenticationTest test`
Expected: FAIL (`McpAuthentication` ainda não existe)

- [ ] **Step 3: Implementar**

```java
package com.dev4.cypher.security;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;

/** Autenticação sem sessão de um agente de IA externo, via X-Cypher-Mcp-Key validado contra McpCredential. */
public class McpAuthentication extends AbstractAuthenticationToken {

    private final Long mcpCredentialId;
    private final String empresaId;

    public McpAuthentication(Long mcpCredentialId, String empresaId) {
        super(List.of(new SimpleGrantedAuthority("ROLE_MCP")));
        this.mcpCredentialId = mcpCredentialId;
        this.empresaId = empresaId;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Object getPrincipal() {
        return mcpCredentialId;
    }

    public Long getMcpCredentialId() {
        return mcpCredentialId;
    }

    public String getEmpresaId() {
        return empresaId;
    }
}
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpAuthenticationTest test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/security/McpAuthentication.java \
        src/test/java/com/dev4/cypher/security/McpAuthenticationTest.java
git commit -m "feat: adiciona McpAuthentication (ROLE_MCP)"
```

---

### Task 2: `TenantContext` — quarto branch

**Files:**
- Modify: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/security/TenantContext.java:12-24`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/security/TenantContextMcpTest.java`

**Interfaces:**
- Consumes: `McpAuthentication` (Task 1).
- Produces: `TenantContext.currentEmpresaId()` retorna o `empresaId` de uma `McpAuthentication` também.

- [ ] **Step 1: Escrever o teste que falha**

```java
package com.dev4.cypher.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;

class TenantContextMcpTest {

    @AfterEach
    void limpar() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void resolveEmpresaIdAPartirDeMcpAuthentication() {
        SecurityContextHolder.getContext().setAuthentication(new McpAuthentication(7L, "acme-test"));

        assertThat(TenantContext.currentEmpresaId()).isEqualTo("acme-test");
    }
}
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=TenantContextMcpTest test`
Expected: FAIL (`IllegalStateException: Nenhum tenant autenticado no contexto de seguranca`)

- [ ] **Step 3: Adicionar o branch**

Em `TenantContext.java`, dentro de `currentEmpresaId()` (linhas 12-24), adicionar antes do `throw` final:

```java
    public static String currentEmpresaId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof GestorAuthentication g) {
            return g.getEmpresaId();
        }
        if (auth instanceof OperadorAuthentication o) {
            return o.getEmpresaId();
        }
        if (auth instanceof PipelineAuthentication p) {
            return p.getEmpresaId();
        }
        if (auth instanceof McpAuthentication m) {
            return m.getEmpresaId();
        }
        throw new IllegalStateException("Nenhum tenant autenticado no contexto de seguranca");
    }
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=TenantContextMcpTest test`
Expected: PASS

- [ ] **Step 5: Rodar a suíte completa de segurança/tenant pra confirmar que os três tipos existentes continuam funcionando**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=MultiTenantIsolationApiTest,SecurityLockdownApiTest test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/security/TenantContext.java \
        src/test/java/com/dev4/cypher/security/TenantContextMcpTest.java
git commit -m "feat: TenantContext resolve empresaId a partir de McpAuthentication"
```

---

### Task 3: `McpKeyAuthenticationFilter`

**Files:**
- Create: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/security/McpKeyAuthenticationFilter.java`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/security/McpKeyAuthenticationFilterTest.java`

**Interfaces:**
- Consumes: `McpCredentialRepository` (MCB Task 2), `PasswordEncoder` (bean já existe), `McpAuthentication` (Task 1).
- Produces: `McpKeyAuthenticationFilter.HEADER` → `String` (`"X-Cypher-Mcp-Key"`); filtro que autentica requisições em `/mcp/**` e retorna 401 se ausente/inválido/revogado.

- [ ] **Step 1: Escrever o teste que falha**

```java
package com.dev4.cypher.security;

import com.dev4.cypher.model.McpCredential;
import com.dev4.cypher.repository.McpCredentialRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.OffsetDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

class McpKeyAuthenticationFilterTest {

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    @AfterEach
    void limpar() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void chaveValidaAutenticaComoMcpAuthentication() throws Exception {
        McpCredential credencial = new McpCredential(42L, "Teste", encoder.encode("segredo-123"),
                true, "acme-test", OffsetDateTime.now(), null);
        McpCredentialRepository repo = Mockito.mock(McpCredentialRepository.class);
        Mockito.when(repo.findById(42L)).thenReturn(Optional.of(credencial));

        McpKeyAuthenticationFilter filtro = new McpKeyAuthenticationFilter(repo, encoder);

        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/mcp");
        req.addHeader(McpKeyAuthenticationFilter.HEADER, "42.segredo-123");
        MockHttpServletResponse res = new MockHttpServletResponse();
        FilterChain chain = Mockito.mock(FilterChain.class);

        filtro.doFilterInternal(req, res, chain);

        McpAuthentication auth = (McpAuthentication) SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth.getMcpCredentialId()).isEqualTo(42L);
        assertThat(auth.getEmpresaId()).isEqualTo("acme-test");
        verify(chain).doFilter(req, res);
    }

    @Test
    void chaveAusenteEmRotaMcpRetorna401SemChamarAChain() throws Exception {
        McpCredentialRepository repo = Mockito.mock(McpCredentialRepository.class);
        McpKeyAuthenticationFilter filtro = new McpKeyAuthenticationFilter(repo, encoder);

        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/mcp");
        MockHttpServletResponse res = new MockHttpServletResponse();
        FilterChain chain = Mockito.mock(FilterChain.class);

        filtro.doFilterInternal(req, res, chain);

        assertThat(res.getStatus()).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED);
        Mockito.verifyNoInteractions(chain);
    }

    @Test
    void credencialRevogadaRetorna401() throws Exception {
        McpCredential revogada = new McpCredential(9L, "Revogada", encoder.encode("x"),
                false, "acme-test", OffsetDateTime.now(), null);
        McpCredentialRepository repo = Mockito.mock(McpCredentialRepository.class);
        Mockito.when(repo.findById(9L)).thenReturn(Optional.of(revogada));
        McpKeyAuthenticationFilter filtro = new McpKeyAuthenticationFilter(repo, encoder);

        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/mcp");
        req.addHeader(McpKeyAuthenticationFilter.HEADER, "9.x");
        MockHttpServletResponse res = new MockHttpServletResponse();
        FilterChain chain = Mockito.mock(FilterChain.class);

        filtro.doFilterInternal(req, res, chain);

        assertThat(res.getStatus()).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED);
    }
}
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpKeyAuthenticationFilterTest test`
Expected: FAIL (`McpKeyAuthenticationFilter` ainda não existe)

- [ ] **Step 3: Implementar o filtro**

```java
package com.dev4.cypher.security;

import com.dev4.cypher.model.McpCredential;
import com.dev4.cypher.repository.McpCredentialRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.Optional;

/**
 * Autentica requisicoes ao servidor MCP (/mcp/**) via header X-Cypher-Mcp-Key,
 * formato "{id}.{secretPlano}". Diferente de CypherKeyAuthenticationFilter
 * (best-effort fora da rota de ingestao), aqui a chave e sempre obrigatoria:
 * ausente/invalida/revogada -> 401 direto, sem seguir a chain.
 */
public class McpKeyAuthenticationFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Cypher-Mcp-Key";

    private final McpCredentialRepository credenciais;
    private final PasswordEncoder encoder;

    public McpKeyAuthenticationFilter(McpCredentialRepository credenciais, PasswordEncoder encoder) {
        this.credenciais = credenciais;
        this.encoder = encoder;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {
        if (!request.getRequestURI().startsWith("/mcp")) {
            filterChain.doFilter(request, response);
            return;
        }

        Optional<McpCredential> credencial = autenticar(request.getHeader(HEADER));
        if (credencial.isEmpty()) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }

        McpCredential c = credencial.get();
        c.setUltimoUsoEm(OffsetDateTime.now());
        credenciais.save(c);

        SecurityContextHolder.getContext().setAuthentication(
                new McpAuthentication(c.getId(), c.getEmpresaId()));
        filterChain.doFilter(request, response);
    }

    private Optional<McpCredential> autenticar(String header) {
        if (header == null || !header.contains(".")) {
            return Optional.empty();
        }
        String[] partes = header.split("\\.", 2);
        Long id;
        try {
            id = Long.parseLong(partes[0]);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
        String secretPlano = partes[1];

        return credenciais.findById(id)
                .filter(McpCredential::isAtiva)
                .filter(c -> encoder.matches(secretPlano, c.getSecretHash()));
    }
}
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpKeyAuthenticationFilterTest test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/security/McpKeyAuthenticationFilter.java \
        src/test/java/com/dev4/cypher/security/McpKeyAuthenticationFilterTest.java
git commit -m "feat: adiciona McpKeyAuthenticationFilter"
```

---

### Task 4: Registrar o filtro e a regra de acesso em `SecurityConfig`

**Files:**
- Modify: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/config/SecurityConfig.java`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/McpSecurityLockdownApiTest.java`

**Interfaces:**
- Consumes: `McpKeyAuthenticationFilter` (Task 3), `McpCredentialRepository` (MCB Task 2), `PasswordEncoder` (bean já existe).
- Produces: `/mcp/**` exige `ROLE_MCP` (só concedido pelo novo filtro); sem o header correto, 401 antes de qualquer lógica de tool.

- [ ] **Step 1: Escrever o teste que falha — sem header em `/mcp`, retorna 401**

```java
package com.dev4.cypher;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class McpSecurityLockdownApiTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void rotaMcpSemHeaderRetorna401() throws Exception {
        mvc.perform(post("/mcp")).andExpect(status().isUnauthorized());
    }

    @Test
    void rotaMcpComChaveInvalidaRetorna401() throws Exception {
        mvc.perform(post("/mcp").header("X-Cypher-Mcp-Key", "999.inexistente"))
                .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpSecurityLockdownApiTest test`
Expected: FAIL (path `/mcp` ainda não existe → 404, não 401; ou cai no catch-all GESTOR e retorna 401 por motivo diferente — de qualquer forma, o teste só fica correto depois desta task E de MCD montar o endpoint `/mcp`. Se MCD ainda não foi implementada quando esta task rodar, este teste específico pode ficar temporariamente marcado como aguardando MCD — ver nota no Self-Review)

- [ ] **Step 3: Registrar o filtro e a regra de acesso**

Em `SecurityConfig.java`, alterar a assinatura do bean `filterChain` (linhas 34-37) para receber o novo repository:

```java
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           SecurityContextRepository securityContextRepository,
                                           CameraRepository cameras,
                                           com.dev4.cypher.repository.McpCredentialRepository mcpCredentials,
                                           PasswordEncoder passwordEncoder) throws Exception {
```

Adicionar o import no topo do arquivo: `import com.dev4.cypher.security.McpKeyAuthenticationFilter;`

Logo após a linha `.addFilterAfter(new CypherKeyAuthenticationFilter(cameras), SecurityContextHolderFilter.class)` (linha 44), adicionar:

```java
                .addFilterAfter(new McpKeyAuthenticationFilter(mcpCredentials, passwordEncoder),
                        SecurityContextHolderFilter.class)
```

E, na cadeia `authorizeHttpRequests`, adicionar uma linha nova para `/mcp/**` **antes** de `.anyRequest().hasRole("GESTOR")`:

```java
                        .requestMatchers("/mcp/**").hasRole("MCP")
                        .anyRequest().hasRole("GESTOR"))
```

- [ ] **Step 4: Rodar o teste**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -Dtest=McpSecurityLockdownApiTest test`
Expected: PASS se MCD já criou o endpoint `/mcp` (Spring AI monta a rota automaticamente ao adicionar o starter); se MCD ainda não foi implementada, o teste `rotaMcpSemHeaderRetorna401` pode falhar com 404 em vez de 401, porque não existe handler nenhum registrado em `/mcp` ainda — nesse caso, marque este teste como dependente da Task 1 do plano MCD e revalide depois de implementá-la.

- [ ] **Step 5: Rodar a suíte completa do backend**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q test`
Expected: PASS (nenhuma regressão nas rotas GESTOR/OPERADOR/PIPELINE existentes — `SecurityLockdownApiTest`, `MultiTenantIsolationApiTest` continuam verdes)

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/config/SecurityConfig.java \
        src/test/java/com/dev4/cypher/McpSecurityLockdownApiTest.java
git commit -m "feat: registra McpKeyAuthenticationFilter e protege /mcp/** com ROLE_MCP"
```

## Self-Review

- **Cobertura da spec:** `McpAuthentication`/`ROLE_MCP` (Task 1), branch em `TenantContext` (Task 2), filtro obrigatório em `/mcp/**` (Task 3), registro em `SecurityConfig` com regra explícita antes do catch-all (Task 4) — cobre o sub-projeto MCC por completo, incluindo a seção "Fluxo de autenticação" da spec.
- **Placeholders:** nenhum "TBD" — o único ponto de incerteza documentado (Task 4, Step 2/4) é uma dependência real de ordem entre planos (MCC precisa que MCD já tenha montado `/mcp` para o 401 completo ser observável fim-a-fim), não uma lacuna de conteúdo — a spec já define essa ordem (MCC → MCD).
- **Consistência de tipos:** `McpAuthentication(Long, String)` (Task 1) usado identicamente em `TenantContext` (Task 2) e `McpKeyAuthenticationFilter` (Task 3); `McpCredentialRepository`/`McpCredential` (de MCB) consumidos com os métodos e getters reais confirmados por leitura de código (`findById`, `isAtiva`, `getSecretHash`, `getEmpresaId`, `setUltimoUsoEm`).
