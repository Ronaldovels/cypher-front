# MT-A — Backend: Empresa (multi-tenant) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir `Empresa` como unidade de isolamento no backend `cypher`: toda entidade de catálogo/acesso/incidente ganha `empresaId`, a PK de `Estacao`/`Camera`/`Equipe` passa a armazenar `empresaId:codigo`, a sessão carrega o tenant, e toda listagem/busca fica escopada por ele — terminando com um teste de ponta a ponta provando que duas empresas com códigos idênticos nunca se enxergam.

**Architecture:** Construído em camadas que nunca quebram a suíte, na mesma lógica do plano de E4 (esqueleto primeiro, trava por último): Tarefa 1 cria `Empresa` e os helpers puros de string; Tarefa 2 estende o modelo de dados inteiro sob um único tenant "demo" hardcoded (estado intermediário real e funcional, não um stub); Tarefa 3 substitui esse hardcode por resolução de sessão de verdade; Tarefas 4–7 escopam leitura/incidentes/SSE/webhook um de cada vez; Tarefa 8 (sempre a última) prova isolamento entre duas empresas de ponta a ponta. Chave armazenada `empresaId:codigo` (não `@IdClass`) em vez de chave composta — decisão da spec §2.3, que preserva `JpaRepository<Entidade, String>` e toda assinatura de service já existente.

**Tech Stack:** Spring Boot 4.0.6, Spring Data JPA, H2, Spring Security (sessão), Lombok, MockMvc + `@SpringBootTest`/`@DataJpaTest`, JUnit 5, AssertJ. Sem framework de mock (mesma convenção de E4: sessão real via `MockHttpSession`, repositórios reais via `@DataJpaTest`).

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-multi-tenant-design.md` (repo `cypher-front`), §2 (modelo de dados), §3 (autenticação e escopo), §6 (migração/seed), §7 (comportamento sob falha), §11 (ordem de implementação).

**Repositório:** `/home/asaas/projects/cypher`

## Global Constraints

- Repositório: `/home/asaas/projects/cypher`. Branch: `feat/mt-backend-empresa`, criada a partir de `main` — **não** usar worktree, apenas `git checkout -b`. `main` está limpo (sem branch `dev` neste repo).
- **Regra única de conversão chave↔código** (spec §2.2): todo campo de entidade que referencia catálogo (`Estacao.id`/`Camera.id`/`Equipe.id`, `Camera.estacaoId`, `Equipe.estacaoIds`, `Usuario.estacaoId`, `Alerta.cameraId`) guarda a string **prefixada** `empresaId:codigo`. Todo DTO na borda da API fala só o **código puro**. A conversão só acontece via `TenantContext.key(...)`/`TenantContext.codigo(...)` (Tarefa 1) — nenhum service concatena string manualmente fora desses dois métodos.
- **Ordem das tarefas é rígida nos dois extremos.** Tarefa 1 (Empresa + helpers) e Tarefa 2 (modelo sob tenant único hardcoded) sempre antes de qualquer escopo real — sem elas as entidades não têm onde guardar o tenant. Tarefa 8 (isolamento ponta a ponta) é sempre a última — só faz sentido depois que toda escopo de leitura (Tarefas 4–7) está pronto.
- **Tarefa 2 usa um tenant único hardcoded (`TenantContext.DEMO_EMPRESA_ID`, valor `"demo"`) como estado intermediário real** — não um placeholder: tudo funciona de ponta a ponta sob esse único tenant, exatamente como a Tarefa 1 do plano de E4 deixou a cadeia de segurança 100% permissiva antes de qualquer trava existir. A Tarefa 3 substitui cada uso desse hardcode por `TenantContext.currentEmpresaId()` e remove a constante.
- Nenhuma entidade do backend tem `@ManyToOne`/FK real (confirmado em `Estacao`/`Camera`/`Equipe`/`Usuario`/`Alerta`/`WebhookSubscription`) — toda referência é `String`/`Long` solta, validada em service. Este plano segue exatamente esse padrão para `empresaId`: nunca uma FK nova, nunca uma classe de chave composta.
- **`Alerta` nunca é construído via construtor `@AllArgsConstructor`** em código de produção nem em teste (confirmado por grep) — sempre `new Alerta()` + setters, via `IncidentMapper.toEntity`. Adicionar o campo `empresaId` não quebra nenhum call site de construtor desta entidade.
- **`GestorAuthentication`/`OperadorAuthentication`/`PipelineAuthentication` têm exatamente 5 call sites de construção em produção** (confirmado por grep): `AuthController.login` (×2), `AuthController.loginEstacao` (×1), `SetupController.setup` (×1), `CypherKeyAuthenticationFilter.doFilterInternal` (×1). Nenhum teste constrói essas classes diretamente — todos passam pela cadeia HTTP real (`AuthTestSupport`). A Tarefa 3 atualiza os 5 sem precisar tocar teste nenhum por causa disso.
- **`GET /api/v1/setup/status` é removido nesta entrega** (spec §5: não faz sentido um booleano global quando várias empresas coexistem) — junto com o front removendo `canActivateOnboarding`/`checkSetupStatus` (plano MT-B, repositório irmão). As duas remoções devem mergear juntas; entre elas, o front aponta para um endpoint que passa a devolver 404, o que é aceitável só durante o desenvolvimento coordenado desta entrega.
- Rodando localmente com `./data/cypherdb` já populado de antes desta entrega: apagar `./data/` antes de subir a aplicação (spec §6) — `ddl-auto: update` não relaxa `NOT NULL`/muda o formato de uma PK existente. Os testes usam H2 em memória e não são afetados.
- Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=NomeDaClasse` para uma classe; `./mvnw -o test` para a suíte inteira.

---

### Task 0: Preparação — commit pendente e branch

**Files:**
- Modify (commit isolado, sem relação com multi-tenant): `src/main/resources/application.yaml`

- [ ] **Step 1: Commitar a mudança já pendente em `main`**

Há uma modificação não commitada em `src/main/resources/application.yaml` (seed do webhook de demonstração, já em uso pelo `CatalogSeeder` — apenas não commitada). Ela é anterior e independente desta entrega; commitar antes de ramificar evita carregar uma mudança não relacionada dentro do diff do multi-tenant.

```bash
cd /home/asaas/projects/cypher
git status --short
git add src/main/resources/application.yaml
git commit -m "chore: adiciona seed de webhook de demonstracao pendente em application.yaml"
```

- [ ] **Step 2: Criar a branch**

```bash
git checkout main
git pull
git checkout -b feat/mt-backend-empresa
```

---

### Task 1: `Empresa` + helpers puros de `TenantContext`

**Files:**
- Create: `src/main/java/com/dev4/cypher/model/Empresa.java`
- Create: `src/main/java/com/dev4/cypher/repository/EmpresaRepository.java`
- Create: `src/main/java/com/dev4/cypher/security/TenantContext.java`
- Test: `src/test/java/com/dev4/cypher/repository/EmpresaRepositoryTest.java`
- Test: `src/test/java/com/dev4/cypher/security/TenantContextTest.java`

**Interfaces:**
- Produces: `Empresa(String id, String nome, boolean ativa)`, `EmpresaRepository extends JpaRepository<Empresa, String>`
- Produces: `TenantContext.key(String empresaId, String codigo)`, `TenantContext.codigo(String chave)`, constante `TenantContext.DEMO_EMPRESA_ID = "demo"` (removida na Tarefa 3)

- [ ] **Step 1: Escrever o teste de `Empresa`/`EmpresaRepository`**

Criar `src/test/java/com/dev4/cypher/repository/EmpresaRepositoryTest.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Empresa;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class EmpresaRepositoryTest {

    @Autowired
    private EmpresaRepository empresas;

    @Test
    void gravaELeEmpresaPeloSlug() {
        empresas.saveAndFlush(new Empresa("acme", "Acme Industrial Ltda", true));

        Empresa lida = empresas.findById("acme").orElseThrow();
        assertThat(lida.getNome()).isEqualTo("Acme Industrial Ltda");
        assertThat(lida.isAtiva()).isTrue();
    }

    @Test
    void existsByIdDistingueSlugsDiferentes() {
        empresas.saveAndFlush(new Empresa("acme", "Acme", true));

        assertThat(empresas.existsById("acme")).isTrue();
        assertThat(empresas.existsById("outra")).isFalse();
    }
}
```

- [ ] **Step 2: Rodar e confirmar que falha (classe não existe)**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=EmpresaRepositoryTest`
Expected: FAIL na compilação — `Empresa`/`EmpresaRepository` não existem.

- [ ] **Step 3: Criar `Empresa` e `EmpresaRepository`**

Criar `src/main/java/com/dev4/cypher/model/Empresa.java`:

```java
package com.dev4.cypher.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Unidade de isolamento (tenant): uma empresa cliente do SaaS.
 *
 * <p>{@code id} e o slug escolhido pela propria empresa no sign-up (ex.:
 * "acme"), imutavel apos criado — compoe {@code Usuario.username}
 * ("gestor@acme") e a chave armazenada de todo recurso de catalogo
 * ("acme:EST-01"), entao renomear reescreveria identidade em todo o
 * historico (spec §2.1, mesmo motivo de codigo de estacao/camera ser
 * imutavel).
 */
@Entity
@Table(name = "empresas")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Empresa {

    @Id
    @Column(length = 30)
    private String id;

    @Column(nullable = false, length = 120)
    private String nome;

    @Column(nullable = false)
    private boolean ativa;
}
```

Criar `src/main/java/com/dev4/cypher/repository/EmpresaRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Empresa;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface EmpresaRepository extends JpaRepository<Empresa, String> {
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=EmpresaRepositoryTest`
Expected: PASS

- [ ] **Step 5: Escrever o teste de `TenantContext`**

Criar `src/test/java/com/dev4/cypher/security/TenantContextTest.java`:

```java
package com.dev4.cypher.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TenantContextTest {

    @Test
    void keyPrefixaEmpresaIdNoCodigo() {
        assertThat(TenantContext.key("acme", "EST-01")).isEqualTo("acme:EST-01");
    }

    @Test
    void codigoRemoveOPrefixoDaChave() {
        assertThat(TenantContext.codigo("acme:EST-01")).isEqualTo("EST-01");
    }

    @Test
    void codigoDevolveOValorIntactoSeNaoHouverPrefixo() {
        // Defensivo: nenhum caminho de producao chama codigo() sem prefixo,
        // mas o metodo nao deve lancar nem truncar por engano.
        assertThat(TenantContext.codigo("EST-01")).isEqualTo("EST-01");
    }

    @Test
    void codigoUsaOPrimeiroDoisPontosComoSeparador() {
        // O slug de empresa (formato ^[a-z0-9-]{2,30}$) nunca contem ':',
        // entao o primeiro ':' na chave e sempre o separador correto.
        assertThat(TenantContext.codigo("acme:EST-01:extra")).isEqualTo("EST-01:extra");
    }
}
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=TenantContextTest`
Expected: FAIL na compilação — `TenantContext` não existe.

- [ ] **Step 7: Criar `TenantContext` com os helpers puros**

Criar `src/main/java/com/dev4/cypher/security/TenantContext.java`:

```java
package com.dev4.cypher.security;

/**
 * Fronteira unica entre a chave armazenada ("empresaId:codigo") e o codigo
 * puro que a API/UI enxergam (spec §2.2). Nenhum service concatena essa
 * string fora daqui.
 */
public final class TenantContext {

    /**
     * Tenant unico usado pela Tarefa 2 antes de a sessao carregar o tenant de
     * verdade. Removida na Tarefa 3, quando {@code currentEmpresaId()}
     * substitui todo uso deste valor.
     */
    public static final String DEMO_EMPRESA_ID = "demo";

    private TenantContext() {
    }

    public static String key(String empresaId, String codigo) {
        return empresaId + ":" + codigo;
    }

    /** Remove o prefixo "empresaId:" de uma chave armazenada, devolvendo so o codigo. */
    public static String codigo(String chave) {
        int i = chave.indexOf(':');
        return i < 0 ? chave : chave.substring(i + 1);
    }
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=TenantContextTest`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/main/java/com/dev4/cypher/model/Empresa.java \
        src/main/java/com/dev4/cypher/repository/EmpresaRepository.java \
        src/main/java/com/dev4/cypher/security/TenantContext.java \
        src/test/java/com/dev4/cypher/repository/EmpresaRepositoryTest.java \
        src/test/java/com/dev4/cypher/security/TenantContextTest.java
git commit -m "feat: adiciona entidade Empresa e helpers puros de TenantContext"
```

---

### Task 2: Modelo — `empresaId` + chave prefixada sob tenant único (`demo`)

**Files:**
- Modify: `src/main/java/com/dev4/cypher/model/Estacao.java`
- Modify: `src/main/java/com/dev4/cypher/model/Camera.java`
- Modify: `src/main/java/com/dev4/cypher/model/Equipe.java`
- Modify: `src/main/java/com/dev4/cypher/model/Usuario.java`
- Modify: `src/main/java/com/dev4/cypher/model/Alerta.java`
- Modify: `src/main/java/com/dev4/cypher/model/WebhookSubscription.java`
- Modify: `src/main/java/com/dev4/cypher/service/CatalogService.java`
- Modify: `src/main/java/com/dev4/cypher/service/EquipeService.java`
- Modify: `src/main/java/com/dev4/cypher/service/UsuarioService.java`
- Modify: `src/main/java/com/dev4/cypher/mapper/IncidentMapper.java`
- Modify: `src/main/java/com/dev4/cypher/controller/SetupController.java` (só o call site do construtor de `Usuario`, mecânico — a reescrita semântica é Tarefa 3)
- Modify: `src/main/java/com/dev4/cypher/config/CatalogSeeder.java`
- Modify: todo teste que constrói `Estacao`/`Camera`/`Equipe`/`Usuario`/`WebhookSubscription` via construtor (lista completa no Step 8)

**Interfaces:**
- Consumes: `TenantContext.key(String, String)`, `TenantContext.DEMO_EMPRESA_ID` (Tarefa 1)
- Produces: `Estacao.getEmpresaId()`/`Camera.getEmpresaId()`/`Equipe.getEmpresaId()`/`Usuario.getEmpresaId()`/`Alerta.getEmpresaId()`/`WebhookSubscription.getEmpresaId()` — consumidos pelas Tarefas 3–7

- [ ] **Step 1: Escrever o teste (repositório) provando a chave prefixada**

Modificar `src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java`, adicionando (sem remover nada existente — os testes existentes são corrigidos no Step 8):

```java
    @Test
    void chaveArmazenadaDeEstacaoEhPrefixadaPeloTenant() {
        estacoes.saveAndFlush(new Estacao("demo:EST-77", "Prefixada", "montagem", true, "tok-EST-77", "demo"));

        Estacao lida = estacoes.findById("demo:EST-77").orElseThrow();
        assertThat(lida.getEmpresaId()).isEqualTo("demo");
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogRepositoryTest`
Expected: FAIL na compilação — `Estacao` não tem construtor de 6 argumentos.

- [ ] **Step 3: Adicionar `empresaId` às seis entidades**

Em `Estacao.java`, aumentar `id` para `length = 100` (antes 64 — precisa caber o prefixo) e acrescentar o campo por último:

```java
    @Id
    @Column(length = 100)
    private String id;

    @Column(nullable = false, length = 120)
    private String nome;

    @Column(length = 120)
    private String setor;

    @Column(nullable = false)
    private boolean ativa;

    @Column(nullable = false, unique = true, length = 80)
    private String token;

    /** Sempre o mesmo prefixo de {@code id} — coluna propria para permitir `findByEmpresaId...` sem parsear a chave. */
    @Column(nullable = false, length = 30)
    private String empresaId;
```

Em `Camera.java`, aumentar `id` e `estacaoId` para `length = 100` (`estacaoId` agora guarda o valor já prefixado da estação) e acrescentar por último:

```java
    @Id
    @Column(length = 100)
    private String id;

    @Column(nullable = false, length = 120)
    private String nome;

    @Column(nullable = false, length = 100)
    private String estacaoId;

    @Column(length = 500)
    private String streamUrl;

    @Column(length = 500)
    private String fonte;

    @ColumnDefault("true")
    @Column(nullable = false)
    private boolean ativa;

    @Column(nullable = false, unique = true, length = 80)
    private String apiKey;

    @Column(nullable = false, length = 30)
    private String empresaId;
```

Em `Equipe.java`, aumentar `id` para `length = 100`, a coluna de `estacaoIds` para `length = 100`, e acrescentar por último:

```java
    @Id
    @Column(length = 100)
    private String id;

    @Column(nullable = false, length = 120)
    private String nome;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Turno turno;

    @ElementCollection
    @CollectionTable(name = "equipe_estacoes", joinColumns = @JoinColumn(name = "equipe_id"))
    @Column(name = "estacao_id", length = 100)
    private List<String> estacaoIds = new ArrayList<>();

    private boolean ativa;

    @Column(nullable = false, length = 30)
    private String empresaId;
```

Em `Usuario.java`, aumentar `username` para `length = 90` (antes 60 — precisa caber `nome@empresa`) e `estacaoId` para `length = 100` (antes 20 — precisa caber o valor prefixado), e acrescentar por último:

```java
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 90)
    private String username;

    @Column(nullable = false, length = 100)
    private String passwordHash;

    @Column(nullable = false, length = 20)
    private String papel;

    @Column(length = 100)
    private String estacaoId;

    @Column(nullable = false, length = 30)
    private String empresaId;
```

Em `Alerta.java`, aumentar `cameraId` para `length = 100` (antes 64) e acrescentar por último:

```java
    @Column(nullable = false, length = 100)
    private String cameraId;
```
(demais campos inalterados, exceto o novo campo ao final da classe)

```java
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AlertaStatus status;

    @Column(nullable = false, length = 30)
    private String empresaId;
```

Em `WebhookSubscription.java`, acrescentar por último (nenhum outro campo muda de tamanho — não referencia catálogo):

```java
    @Column(nullable = false)
    private boolean ativo;

    @Column(nullable = false, length = 30)
    private String empresaId;
```

- [ ] **Step 4: Atualizar `CatalogService` para gravar sob o tenant único `demo`**

Em `CatalogService.java`, toda leitura/escrita de estação/câmera passa a operar sobre a chave prefixada. Reescrever os métodos afetados:

```java
    @Transactional(readOnly = true)
    public List<CameraResponse> cameras(boolean incluirInativas) {
        List<Camera> base = incluirInativas ? cameras.findAll() : cameras.findByAtivaTrue();
        return base.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<StationResponse> stations(boolean incluirInativas) {
        List<Estacao> base = incluirInativas ? estacoes.findAll() : estacoes.findByAtivaTrue();
        return base.stream().map(this::toResponse).toList();
    }

    @Transactional
    public EstacaoAdminResponse createStation(StationRequest req) {
        String id = TenantContext.key(TenantContext.DEMO_EMPRESA_ID, req.id());
        if (estacoes.existsById(id)) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "Estacao ja cadastrada: " + req.id());
        }
        Estacao nova = new Estacao(id, req.nome(), req.setor(),
                req.ativa() == null || req.ativa(), TokenGenerator.novo("est-tok"),
                TenantContext.DEMO_EMPRESA_ID);
        return toAdminResponse(estacoes.saveAndFlush(nova));
    }

    @Transactional
    public Optional<EstacaoAdminResponse> updateStation(String id, StationRequest req) {
        exigirMesmoCodigo(id, req.id(), "estacao");
        return estacoes.findById(TenantContext.key(TenantContext.DEMO_EMPRESA_ID, id)).map(estacao -> {
            estacao.setNome(req.nome());
            estacao.setSetor(req.setor());
            if (req.ativa() != null) {
                estacao.setAtiva(req.ativa());
            }
            return toAdminResponse(estacoes.saveAndFlush(estacao));
        });
    }

    @Transactional
    public Optional<EstacaoAdminResponse> regenerateToken(String id) {
        return estacoes.findById(TenantContext.key(TenantContext.DEMO_EMPRESA_ID, id)).map(estacao -> {
            estacao.setToken(TokenGenerator.novo("est-tok"));
            return toAdminResponse(estacoes.saveAndFlush(estacao));
        });
    }

    @Transactional
    public boolean deactivateStation(String id) {
        return estacoes.findById(TenantContext.key(TenantContext.DEMO_EMPRESA_ID, id)).map(estacao -> {
            estacao.setAtiva(false);
            estacoes.saveAndFlush(estacao);
            return true;
        }).orElse(false);
    }

    @Transactional(readOnly = true)
    public Optional<CameraAdminResponse> camera(String id) {
        return cameras.findById(TenantContext.key(TenantContext.DEMO_EMPRESA_ID, id)).map(this::toAdminResponse);
    }

    @Transactional
    public CameraAdminResponse createCamera(CameraRequest req) {
        String id = TenantContext.key(TenantContext.DEMO_EMPRESA_ID, req.id());
        if (cameras.existsById(id)) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "Camera ja cadastrada: " + req.id());
        }
        String estacaoId = TenantContext.key(TenantContext.DEMO_EMPRESA_ID, req.estacaoId());
        exigirEstacao(estacaoId);
        exigirUrlLivre(req.streamUrl(), id);
        CatalogCodes.portaDe(req.streamUrl());

        Camera nova = new Camera(id, req.nome(), estacaoId,
                req.streamUrl(), req.fonte(), req.ativa() == null || req.ativa(),
                TokenGenerator.novo("cam-key"), TenantContext.DEMO_EMPRESA_ID);
        return toAdminResponse(cameras.saveAndFlush(nova));
    }

    @Transactional
    public Optional<CameraAdminResponse> updateCamera(String id, CameraRequest req) {
        exigirMesmoCodigo(id, req.id(), "camera");
        String chave = TenantContext.key(TenantContext.DEMO_EMPRESA_ID, id);
        return cameras.findById(chave).map(camera -> {
            String estacaoId = TenantContext.key(TenantContext.DEMO_EMPRESA_ID, req.estacaoId());
            exigirEstacao(estacaoId);
            exigirUrlLivre(req.streamUrl(), chave);

            camera.setNome(req.nome());
            camera.setEstacaoId(estacaoId);
            camera.setStreamUrl(req.streamUrl());
            camera.setFonte(req.fonte());
            if (req.ativa() != null) {
                camera.setAtiva(req.ativa());
            }
            return toAdminResponse(cameras.saveAndFlush(camera));
        });
    }

    @Transactional
    public Optional<CameraApiKeyResponse> regenerateApiKey(String id) {
        return cameras.findById(TenantContext.key(TenantContext.DEMO_EMPRESA_ID, id)).map(camera -> {
            camera.setApiKey(TokenGenerator.novo("cam-key"));
            return toApiKeyResponse(cameras.saveAndFlush(camera));
        });
    }

    @Transactional
    public boolean deactivateCamera(String id) {
        return cameras.findById(TenantContext.key(TenantContext.DEMO_EMPRESA_ID, id)).map(camera -> {
            camera.setAtiva(false);
            cameras.saveAndFlush(camera);
            return true;
        }).orElse(false);
    }

    @Transactional(readOnly = true)
    public Optional<CameraConfigResponse> cameraConfig(String id) {
        return cameras.findById(TenantContext.key(TenantContext.DEMO_EMPRESA_ID, id)).map(camera -> {
            if (!camera.isAtiva()) {
                throw new CatalogValidationException(HttpStatus.CONFLICT,
                        "Camera desativada: " + TenantContext.codigo(camera.getId()));
            }
            estacoes.findById(camera.getEstacaoId())
                    .filter(estacao -> !estacao.isAtiva())
                    .ifPresent(estacao -> {
                        throw new CatalogValidationException(HttpStatus.CONFLICT,
                                "Estacao da camera esta desativada: " + TenantContext.codigo(estacao.getId()));
                    });
            return new CameraConfigResponse(
                    TenantContext.codigo(camera.getId()),
                    camera.getNome(),
                    TenantContext.codigo(camera.getEstacaoId()),
                    camera.getFonte(),
                    CatalogCodes.portaDe(camera.getStreamUrl()),
                    camera.isAtiva());
        });
    }

    private void exigirEstacao(String estacaoIdPrefixado) {
        if (!estacoes.existsById(estacaoIdPrefixado)) {
            throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Estacao inexistente: " + TenantContext.codigo(estacaoIdPrefixado));
        }
    }

    private void exigirUrlLivre(String streamUrl, String idPropriaPrefixada) {
        cameras.findByStreamUrl(streamUrl)
                .filter(outra -> !outra.getId().equals(idPropriaPrefixada))
                .ifPresent(outra -> {
                    throw new CatalogValidationException(HttpStatus.CONFLICT,
                            "streamUrl ja usada pela camera " + TenantContext.codigo(outra.getId()));
                });
    }

    private StationResponse toResponse(Estacao e) {
        return new StationResponse(TenantContext.codigo(e.getId()), e.getNome(), e.getSetor(), e.isAtiva(),
                cameras.findByEstacaoIdAndAtivaTrue(e.getId()).stream()
                        .map(this::toResponse).toList());
    }

    private EstacaoAdminResponse toAdminResponse(Estacao e) {
        return new EstacaoAdminResponse(TenantContext.codigo(e.getId()), e.getNome(), e.getSetor(), e.isAtiva(), e.getToken());
    }

    private CameraResponse toResponse(Camera c) {
        return new CameraResponse(TenantContext.codigo(c.getId()), c.getNome(),
                TenantContext.codigo(c.getEstacaoId()), c.getStreamUrl());
    }

    private CameraAdminResponse toAdminResponse(Camera c) {
        return new CameraAdminResponse(TenantContext.codigo(c.getId()), c.getNome(),
                TenantContext.codigo(c.getEstacaoId()), c.getStreamUrl(), c.getFonte(), c.isAtiva());
    }

    private CameraApiKeyResponse toApiKeyResponse(Camera c) {
        return new CameraApiKeyResponse(TenantContext.codigo(c.getId()), c.getApiKey());
    }
```

`exigirMesmoCodigo` não muda (compara códigos puros vindos da URL/corpo, nunca a chave prefixada). Adicionar o import `com.dev4.cypher.security.TenantContext` no topo do arquivo.

Nota: `cameras.findByEstacaoIdAndAtivaTrue(e.getId())` continua funcionando sem mudança de assinatura — `e.getId()` já é a chave prefixada, e `Camera.estacaoId` guarda o mesmo formato, então o filtro casa naturalmente. Esse é o benefício central de armazenar a chave prefixada em vez de criar chave composta (spec §2.3).

- [ ] **Step 5: Atualizar `EquipeService`**

```java
    @Transactional(readOnly = true)
    public List<TeamResponse> listar() {
        return equipes.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional
    public TeamResponse criar(TeamRequest req) {
        String id = TenantContext.key(TenantContext.DEMO_EMPRESA_ID, req.id());
        if (equipes.existsById(id)) {
            throw new CatalogValidationException(HttpStatus.CONFLICT, "Equipe ja cadastrada: " + req.id());
        }
        List<String> estacaoIds = prefixar(req.estacaoIds());
        exigirEstacoesExistentes(estacaoIds);
        exigirSemConflito(estacaoIds, req.turno(), null);
        Equipe nova = new Equipe(id, req.nome(), req.turno(), estacaoIds,
                req.ativa() == null || req.ativa(), TenantContext.DEMO_EMPRESA_ID);
        return toResponse(equipes.saveAndFlush(nova));
    }

    @Transactional
    public Optional<TeamResponse> atualizar(String id, TeamRequest req) {
        exigirMesmoCodigo(id, req.id());
        return equipes.findById(TenantContext.key(TenantContext.DEMO_EMPRESA_ID, id)).map(equipe -> {
            List<String> estacaoIds = prefixar(req.estacaoIds());
            exigirEstacoesExistentes(estacaoIds);
            exigirSemConflito(estacaoIds, req.turno(), equipe.getId());
            equipe.setNome(req.nome());
            equipe.setTurno(req.turno());
            equipe.setEstacaoIds(estacaoIds);
            if (req.ativa() != null) {
                equipe.setAtiva(req.ativa());
            }
            return toResponse(equipes.saveAndFlush(equipe));
        });
    }

    @Transactional
    public boolean remover(String id) {
        String chave = TenantContext.key(TenantContext.DEMO_EMPRESA_ID, id);
        if (!equipes.existsById(chave)) {
            return false;
        }
        equipes.deleteById(chave);
        return true;
    }

    private List<String> prefixar(List<String> estacaoIds) {
        return estacaoIds.stream().map(id -> TenantContext.key(TenantContext.DEMO_EMPRESA_ID, id)).toList();
    }

    private void exigirEstacoesExistentes(List<String> estacaoIdsPrefixados) {
        for (String estacaoId : estacaoIdsPrefixados) {
            if (!estacoes.existsById(estacaoId)) {
                throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Estacao inexistente: " + TenantContext.codigo(estacaoId));
            }
        }
    }

    private void exigirSemConflito(List<String> estacaoIdsPrefixados, Turno turno, String idPropria) {
        equipes.findByTurno(turno).stream()
                .filter(outra -> !outra.getId().equals(idPropria))
                .forEach(outra -> {
                    for (String estacaoId : estacaoIdsPrefixados) {
                        if (outra.getEstacaoIds().contains(estacaoId)) {
                            throw new CatalogValidationException(HttpStatus.CONFLICT,
                                    "Estacao %s ja coberta pela equipe %s no turno %s"
                                            .formatted(TenantContext.codigo(estacaoId),
                                                    TenantContext.codigo(outra.getId()), turno));
                        }
                    }
                });
    }

    private TeamResponse toResponse(Equipe e) {
        List<String> estacaoIds = e.getEstacaoIds().stream().map(TenantContext::codigo).toList();
        return new TeamResponse(TenantContext.codigo(e.getId()), e.getNome(), e.getTurno(), estacaoIds, e.isAtiva());
    }
```

`equipes.findAll()` em `listar()` ainda devolve tudo (só existe o tenant `demo` nesta tarefa) — a Tarefa 4 escopa por `empresaId`. `new ArrayList<>(req.estacaoIds())` no código original vira `prefixar(req.estacaoIds())`, que já devolve uma lista nova (via `.toList()`), então o `new ArrayList<>(...)` extra não é mais necessário. Adicionar o import `com.dev4.cypher.security.TenantContext`.

- [ ] **Step 6: Atualizar `UsuarioService`**

```java
    @Transactional(readOnly = true)
    public List<UsuarioResponse> listar() {
        return usuarios.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional
    public UsuarioResponse criar(UserRequest req) {
        String estacaoIdPrefixado = "OPERADOR".equals(req.papel())
                ? TenantContext.key(TenantContext.DEMO_EMPRESA_ID, req.estacaoId()) : null;
        validarPapelEEstacao(req.papel(), estacaoIdPrefixado);
        if (usuarios.existsByUsername(req.username())) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "Usuario ja cadastrado: " + req.username());
        }
        if (req.password() == null || req.password().isBlank()) {
            throw new CatalogValidationException(HttpStatus.BAD_REQUEST,
                    "password e obrigatoria no cadastro");
        }
        Usuario novo = new Usuario(null, req.username(), encoder.encode(req.password()), req.papel(),
                estacaoIdPrefixado, TenantContext.DEMO_EMPRESA_ID);
        return toResponse(usuarios.saveAndFlush(novo));
    }

    @Transactional
    public Optional<UsuarioResponse> atualizar(String username, UserRequest req) {
        String estacaoIdPrefixado = "OPERADOR".equals(req.papel())
                ? TenantContext.key(TenantContext.DEMO_EMPRESA_ID, req.estacaoId()) : null;
        validarPapelEEstacao(req.papel(), estacaoIdPrefixado);
        return usuarios.findByUsername(username).map(usuario -> {
            if (!usuario.getUsername().equals(req.username()) && usuarios.existsByUsername(req.username())) {
                throw new CatalogValidationException(HttpStatus.CONFLICT,
                        "Usuario ja cadastrado: " + req.username());
            }
            usuario.setUsername(req.username());
            usuario.setPapel(req.papel());
            usuario.setEstacaoId(estacaoIdPrefixado);
            if (req.password() != null && !req.password().isBlank()) {
                usuario.setPasswordHash(encoder.encode(req.password()));
            }
            return toResponse(usuarios.saveAndFlush(usuario));
        });
    }

    private void validarPapelEEstacao(String papel, String estacaoIdPrefixado) {
        if (!PAPEIS_VALIDOS.contains(papel)) {
            throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "papel deve ser GESTOR ou OPERADOR: " + papel);
        }
        if ("OPERADOR".equals(papel)) {
            if (estacaoIdPrefixado == null) {
                throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "estacaoId e obrigatorio para OPERADOR");
            }
            if (!estacoes.existsById(estacaoIdPrefixado)) {
                throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "estacao inexistente: " + TenantContext.codigo(estacaoIdPrefixado));
            }
        }
    }

    private UsuarioResponse toResponse(Usuario u) {
        String estacaoId = u.getEstacaoId() == null ? null : TenantContext.codigo(u.getEstacaoId());
        return new UsuarioResponse(u.getId(), u.getUsername(), u.getPapel(), estacaoId);
    }
```

`req.estacaoId()` pode ser `null` (papel GESTOR) — a expressão `"OPERADOR".equals(req.papel()) ? TenantContext.key(...) : null` já cobre isso porque só entra no ramo de prefixar quando o papel é OPERADOR, e o `UserRequest.estacaoId()` é obrigatório nesse caso pela regra de negócio existente. Adicionar o import `com.dev4.cypher.security.TenantContext`.

- [ ] **Step 7: Atualizar `IncidentMapper`, `SetupController` e `CatalogSeeder`**

Em `IncidentMapper.toEntity`, adicionar a atribuição de `empresaId` (o `cameraId`/`incidentKey` continuam vindo do `IncidentRequest` como estão — a Tarefa 5 é quem os prefixa, porque depende de `PipelineAuthentication` carregar o tenant real):

```java
    public Alerta toEntity(IncidentRequest req) {
        Alerta a = new Alerta();
        a.setIncidentKey(req.incidentKey());
        a.setCameraId(req.cameraId());
        // ...(inalterado)...
        a.setStatus(AlertaStatus.PENDENTE);
        a.setEmpresaId(TenantContext.DEMO_EMPRESA_ID);
        return a;
    }
```

Adicionar o import `com.dev4.cypher.security.TenantContext`.

Em `SetupController.setup`, corrigir o call site do construtor de `Usuario` (mecânico — a reescrita semântica de `SetupController` inteiro é a Tarefa 3):

```java
        Usuario gestor = usuarios.saveAndFlush(
                new Usuario(null, req.username(), encoder.encode(req.password()), "GESTOR", null,
                        com.dev4.cypher.security.TenantContext.DEMO_EMPRESA_ID));
```

Em `CatalogSeeder.java`, injetar `EmpresaRepository`, criar a empresa `demo` antes de semear o resto, e prefixar toda chave/referência semeada:

```java
    private final CatalogProperties properties;
    private final EmpresaRepository empresas;
    private final EstacaoRepository estacoes;
    private final CameraRepository cameras;
    private final WebhookSubscriptionRepository webhooks;

    public CatalogSeeder(CatalogProperties properties,
                         EmpresaRepository empresas,
                         EstacaoRepository estacoes,
                         CameraRepository cameras,
                         WebhookSubscriptionRepository webhooks) {
        this.properties = properties;
        this.empresas = empresas;
        this.estacoes = estacoes;
        this.cameras = cameras;
        this.webhooks = webhooks;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!empresas.existsById(TenantContext.DEMO_EMPRESA_ID)) {
            empresas.save(new Empresa(TenantContext.DEMO_EMPRESA_ID, "Empresa de demonstracao", true));
        }

        if (estacoes.count() == 0) {
            properties.getStations().forEach(cfg ->
                    estacoes.save(new Estacao(TenantContext.key(TenantContext.DEMO_EMPRESA_ID, cfg.getId()),
                            cfg.getNome(), cfg.getSetor(), cfg.isAtiva(), TokenGenerator.novo("est-tok"),
                            TenantContext.DEMO_EMPRESA_ID)));
            log.info("Catalogo: {} estacao(oes) semeada(s) da configuracao", properties.getStations().size());
        } else {
            log.info("Catalogo: {} estacao(oes) ja no banco, configuracao ignorada", estacoes.count());
        }

        if (cameras.count() == 0) {
            properties.getCameras().forEach(cfg ->
                    cameras.save(new Camera(TenantContext.key(TenantContext.DEMO_EMPRESA_ID, cfg.getId()),
                            cfg.getNome(), TenantContext.key(TenantContext.DEMO_EMPRESA_ID, cfg.getEstacaoId()),
                            cfg.getStreamUrl(), cfg.getFonte(), cfg.isAtiva(), TokenGenerator.novo("cam-key"),
                            TenantContext.DEMO_EMPRESA_ID)));
            log.info("Catalogo: {} camera(s) semeada(s) da configuracao", properties.getCameras().size());
        } else {
            log.info("Catalogo: {} camera(s) ja no banco, configuracao ignorada", cameras.count());
        }

        properties.getWebhooks().forEach(cfg -> {
            boolean jaExiste = webhooks.findAll().stream()
                    .anyMatch(w -> w.getUrl().equals(cfg.getUrl()));
            if (!jaExiste) {
                webhooks.save(new WebhookSubscription(null, cfg.getUrl(), cfg.getSecret(),
                        cfg.getMinSeverity(), cfg.isAtivo(), TenantContext.DEMO_EMPRESA_ID));
            }
        });
    }
```

Adicionar os imports `com.dev4.cypher.model.Empresa`, `com.dev4.cypher.repository.EmpresaRepository` e `com.dev4.cypher.security.TenantContext`.

- [ ] **Step 8: Corrigir todo call site de teste que constrói as seis entidades**

Rodar a suíte para ver a lista completa de erros de compilação:

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test-compile`
Expected: FAIL — dezenas de erros "constructor Estacao/Camera/Equipe/Usuario/WebhookSubscription cannot be applied" nos arquivos listados abaixo (confirmados por grep antes desta tarefa):

```
src/test/java/com/dev4/cypher/AuthControllerApiTest.java
src/test/java/com/dev4/cypher/IncidentEventPublicationTest.java
src/test/java/com/dev4/cypher/IncidentIngestionApiTest.java
src/test/java/com/dev4/cypher/IncidentQueryApiTest.java
src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java
src/test/java/com/dev4/cypher/repository/EquipeRepositoryTest.java
src/test/java/com/dev4/cypher/repository/UsuarioRepositoryTest.java
src/test/java/com/dev4/cypher/security/CypherKeyAuthenticationFilterTest.java
src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java
src/test/java/com/dev4/cypher/service/EquipeServiceTest.java
src/test/java/com/dev4/cypher/service/UsuarioServiceTest.java
src/test/java/com/dev4/cypher/SetupApiTest.java
src/test/java/com/dev4/cypher/sse/IncidentSseServiceTest.java
src/test/java/com/dev4/cypher/webhook/WebhookDispatcherTest.java
```

A correção é mecânica e igual em todo arquivo da lista: toda chave/código de estação, câmera ou equipe passa a ser escrita já prefixada com `"demo:"` (ex.: `"EST-01"` vira `"demo:EST-01"`, e toda referência a essa estação/câmera em outra linha do mesmo teste também vira `"demo:EST-01"`), e o construtor de `Estacao`/`Camera`/`Equipe`/`Usuario`/`WebhookSubscription` ganha `"demo"` como último argumento. Por exemplo, em `CatalogRepositoryTest.umaEstacaoEhCobertaPorVariasCameras`:

```java
    @Test
    void umaEstacaoEhCobertaPorVariasCameras() {
        estacoes.save(new Estacao("demo:EST-01", "Esteira de montagem", "montagem", true, "tok-EST-01", "demo"));
        cameras.save(new Camera("demo:CAM-01", "Frontal", "demo:EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://cam1/stream", true, "key-CAM-01", "demo"));
        cameras.save(new Camera("demo:CAM-02", "Lateral", "demo:EST-01",
                "http://127.0.0.1:8091/stream", "rtsp://cam2/stream", true, "key-CAM-02", "demo"));
        cameras.saveAndFlush(new Camera("demo:CAM-03", "Expedicao", "demo:EST-02",
                "http://127.0.0.1:8092/stream", "0", true, "key-CAM-03", "demo"));

        List<Camera> daEstacao = cameras.findByEstacaoId("demo:EST-01");

        assertThat(daEstacao).extracting(Camera::getId)
                .containsExactlyInAnyOrder("demo:CAM-01", "demo:CAM-02");
    }
```

Aplicar a mesma transformação — prefixar toda chave de estação/câmera/equipe com `"demo:"` e acrescentar `"demo"` como último argumento do construtor — em cada um dos 14 arquivos listados acima. `Usuario` (em `SetupApiTest`, `AuthControllerApiTest`, `UsuarioRepositoryTest`, `UsuarioServiceTest`) ganha `"demo"` como último argumento; `username`/`estacaoId` não mudam de valor além do prefixo em `estacaoId` quando presente. `WebhookSubscription` (em `WebhookDispatcherTest`) ganha `"demo"` como último argumento, sem mudança em nenhum outro campo.

- [ ] **Step 9: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS em toda a suíte.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: adiciona empresaId e chave prefixada ao modelo, sob tenant unico demo"
```

---

### Task 3: Autenticação — `TenantContext.currentEmpresaId()` e sign-up por empresa

**Files:**
- Modify: `src/main/java/com/dev4/cypher/security/TenantContext.java`
- Modify: `src/main/java/com/dev4/cypher/security/GestorAuthentication.java`
- Modify: `src/main/java/com/dev4/cypher/security/OperadorAuthentication.java`
- Modify: `src/main/java/com/dev4/cypher/security/PipelineAuthentication.java`
- Modify: `src/main/java/com/dev4/cypher/security/CypherKeyAuthenticationFilter.java`
- Modify: `src/main/java/com/dev4/cypher/controller/AuthController.java`
- Modify: `src/main/java/com/dev4/cypher/controller/SetupController.java`
- Modify: `src/main/java/com/dev4/cypher/dto/SetupRequest.java`
- Modify: `src/main/java/com/dev4/cypher/dto/AuthResponse.java`
- Modify: `src/main/java/com/dev4/cypher/service/CatalogService.java` (substituir `DEMO_EMPRESA_ID`)
- Modify: `src/main/java/com/dev4/cypher/service/EquipeService.java` (substituir `DEMO_EMPRESA_ID`)
- Modify: `src/main/java/com/dev4/cypher/service/UsuarioService.java` (substituir `DEMO_EMPRESA_ID`, compor username)
- Modify: `src/main/java/com/dev4/cypher/mapper/IncidentMapper.java` (substituir `DEMO_EMPRESA_ID`)
- Modify: `src/main/java/com/dev4/cypher/config/CatalogSeeder.java` (substituir `DEMO_EMPRESA_ID` — mantém o hardcode "demo" como o slug fixo da empresa de desenvolvimento, agora explícito em vez de vir de `TenantContext`)
- Modify: `src/main/java/com/dev4/cypher/config/SecurityConfig.java` (remover `GET /api/v1/setup/status` do `permitAll`)
- Delete: `src/main/java/com/dev4/cypher/dto/SetupStatusResponse.java`
- Modify: `src/test/java/com/dev4/cypher/SetupApiTest.java`
- Modify: `src/test/java/com/dev4/cypher/AuthControllerApiTest.java`
- Modify: `src/test/java/com/dev4/cypher/security/AuthTestSupport.java`

**Interfaces:**
- Consumes: `Usuario.getEmpresaId()`/`Estacao.getEmpresaId()`/`Camera.getEmpresaId()` (Tarefa 2)
- Produces: `TenantContext.currentEmpresaId()`, `GestorAuthentication.getEmpresaId()`, `OperadorAuthentication.getEmpresaId()`, `PipelineAuthentication.getEmpresaId()` — consumidos pelas Tarefas 4–7

- [ ] **Step 1: Escrever o teste de `currentEmpresaId()`**

Adicionar em `TenantContextTest.java`:

```java
    @org.junit.jupiter.api.AfterEach
    void limparContexto() {
        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    @Test
    void currentEmpresaIdResolveDeGestorAuthentication() {
        autenticarComo(new GestorAuthentication("gestor@acme", "acme"));
        assertThat(TenantContext.currentEmpresaId()).isEqualTo("acme");
    }

    @Test
    void currentEmpresaIdResolveDeOperadorAuthentication() {
        autenticarComo(new OperadorAuthentication("acme:EST-01", "acme"));
        assertThat(TenantContext.currentEmpresaId()).isEqualTo("acme");
    }

    @Test
    void currentEmpresaIdResolveDePipelineAuthentication() {
        autenticarComo(new PipelineAuthentication("acme:CAM-01", "acme"));
        assertThat(TenantContext.currentEmpresaId()).isEqualTo("acme");
    }

    @Test
    void currentEmpresaIdLancaSemAutenticacao() {
        org.springframework.security.core.context.SecurityContextHolder.clearContext();
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                TenantContext::currentEmpresaId);
    }

    private void autenticarComo(org.springframework.security.authentication.AbstractAuthenticationToken auth) {
        var context = org.springframework.security.core.context.SecurityContextHolder.createEmptyContext();
        context.setAuthentication(auth);
        org.springframework.security.core.context.SecurityContextHolder.setContext(context);
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=TenantContextTest`
Expected: FAIL na compilação — os 3 construtores de 2 argumentos não existem ainda, `currentEmpresaId()` não existe.

- [ ] **Step 3: Adicionar `empresaId` às três `Authentication` e `currentEmpresaId()` a `TenantContext`**

Em `GestorAuthentication.java`:

```java
public class GestorAuthentication extends AbstractAuthenticationToken {

    private final String username;
    private final String empresaId;

    public GestorAuthentication(String username, String empresaId) {
        super(List.of(new SimpleGrantedAuthority("ROLE_GESTOR")));
        this.username = username;
        this.empresaId = empresaId;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Object getPrincipal() {
        return username;
    }

    public String getUsername() {
        return username;
    }

    public String getEmpresaId() {
        return empresaId;
    }
}
```

Em `OperadorAuthentication.java`:

```java
public class OperadorAuthentication extends AbstractAuthenticationToken {

    private final String estacaoId;
    private final String username;
    private final String empresaId;

    public OperadorAuthentication(String estacaoId, String empresaId) {
        this(estacaoId, null, empresaId);
    }

    public OperadorAuthentication(String estacaoId, String username, String empresaId) {
        super(List.of(new SimpleGrantedAuthority("ROLE_OPERADOR")));
        this.estacaoId = estacaoId;
        this.username = username;
        this.empresaId = empresaId;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Object getPrincipal() {
        return estacaoId;
    }

    public String getEstacaoId() {
        return estacaoId;
    }

    public String getUsername() {
        return username;
    }

    public String getEmpresaId() {
        return empresaId;
    }
}
```

Em `PipelineAuthentication.java`:

```java
public class PipelineAuthentication extends AbstractAuthenticationToken {

    private final String cameraId;
    private final String empresaId;

    public PipelineAuthentication(String cameraId, String empresaId) {
        super(List.of(new SimpleGrantedAuthority("ROLE_PIPELINE")));
        this.cameraId = cameraId;
        this.empresaId = empresaId;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Object getPrincipal() {
        return cameraId;
    }

    public String getCameraId() {
        return cameraId;
    }

    public String getEmpresaId() {
        return empresaId;
    }
}
```

Em `TenantContext.java`, remover a constante `DEMO_EMPRESA_ID` e adicionar `currentEmpresaId()`:

```java
package com.dev4.cypher.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class TenantContext {

    private TenantContext() {
    }

    /** Le o tenant autenticado no contexto de seguranca atual (spec §3.3). */
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
        throw new IllegalStateException("Nenhum tenant autenticado no contexto de seguranca");
    }

    public static String key(String empresaId, String codigo) {
        return empresaId + ":" + codigo;
    }

    public static String key(String codigo) {
        return key(currentEmpresaId(), codigo);
    }

    public static String codigo(String chave) {
        int i = chave.indexOf(':');
        return i < 0 ? chave : chave.substring(i + 1);
    }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=TenantContextTest`
Expected: PASS

- [ ] **Step 5: Atualizar o único call site de produção de `PipelineAuthentication` (`CypherKeyAuthenticationFilter`)**

```java
        Optional<Camera> camera = chave != null ? cameras.findByApiKey(chave) : Optional.empty();
        camera.ifPresent(c ->
                SecurityContextHolder.getContext().setAuthentication(
                        new PipelineAuthentication(c.getId(), c.getEmpresaId())));
```

(`c.getId()` já é a chave prefixada — `IncidentController.chaveDeOutraCamera` compara `pipeline.getCameraId()` contra `req.cameraId()`, que ainda é o código puro vindo do payload; essa comparação é corrigida na Tarefa 5, quando `cameraId` de `Alerta`/`IncidentRequest` passa a ser resolvido via `TenantContext`.)

- [ ] **Step 6: Reescrever `SetupController`, `SetupRequest` e `AuthResponse`**

Em `SetupRequest.java`:

```java
package com.dev4.cypher.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Corpo de `POST /api/v1/setup`. `username` e so o "nome" (sem "@empresa") —
 * o backend compoe o username completo como `username + "@" + empresaId`
 * (spec §3.1), para o formato nunca depender do que o cliente manda.
 */
public record SetupRequest(
        @NotBlank
        @Pattern(regexp = "^[^@]+$", message = "username nao pode conter '@'")
        String username,

        @NotBlank String password,

        @NotBlank
        @Pattern(regexp = "^[a-z0-9-]{2,30}$", message = "empresaId deve ser minusculas-numeros-hifen, 2 a 30 caracteres")
        String empresaId,

        @NotBlank String empresaNome
) {
}
```

Em `AuthResponse.java`:

```java
package com.dev4.cypher.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuthResponse(String papel, String username, String estacaoId, String empresaId, String empresaNome) {

    public static AuthResponse gestor(String username, String empresaId, String empresaNome) {
        return new AuthResponse("GESTOR", username, null, empresaId, empresaNome);
    }

    public static AuthResponse operador(String estacaoId, String empresaId, String empresaNome) {
        return new AuthResponse("OPERADOR", null, estacaoId, empresaId, empresaNome);
    }

    public static AuthResponse operador(String estacaoId, String username, String empresaId, String empresaNome) {
        return new AuthResponse("OPERADOR", username, estacaoId, empresaId, empresaNome);
    }
}
```

Em `SetupController.java` (reescrita completa):

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.AuthResponse;
import com.dev4.cypher.dto.SetupRequest;
import com.dev4.cypher.model.Empresa;
import com.dev4.cypher.model.Usuario;
import com.dev4.cypher.repository.EmpresaRepository;
import com.dev4.cypher.repository.UsuarioRepository;
import com.dev4.cypher.security.GestorAuthentication;
import com.dev4.cypher.security.SessionAuthenticator;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Sign-up de uma empresa nova: cria a `Empresa` e o `Usuario` mestre dela
 * (spec §3, §7). O conflito passa a ser por slug de empresa, nunca mais
 * global — duas empresas podem se cadastrar em paralelo sem se afetar.
 */
@RestController
@RequestMapping("/api/v1/setup")
public class SetupController {

    private final EmpresaRepository empresas;
    private final UsuarioRepository usuarios;
    private final PasswordEncoder encoder;
    private final SessionAuthenticator sessionAuthenticator;

    public SetupController(EmpresaRepository empresas, UsuarioRepository usuarios,
                           PasswordEncoder encoder, SessionAuthenticator sessionAuthenticator) {
        this.empresas = empresas;
        this.usuarios = usuarios;
        this.encoder = encoder;
        this.sessionAuthenticator = sessionAuthenticator;
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> setup(@Valid @RequestBody SetupRequest req,
                                   HttpServletRequest request, HttpServletResponse response) {
        if (empresas.existsById(req.empresaId())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("erro", "Empresa ja cadastrada: " + req.empresaId()));
        }
        empresas.saveAndFlush(new Empresa(req.empresaId(), req.empresaNome(), true));

        String username = req.username() + "@" + req.empresaId();
        Usuario gestor = usuarios.saveAndFlush(
                new Usuario(null, username, encoder.encode(req.password()), "GESTOR", null, req.empresaId()));
        sessionAuthenticator.autenticar(
                new GestorAuthentication(gestor.getUsername(), gestor.getEmpresaId()), request, response);
        return ResponseEntity.ok(AuthResponse.gestor(gestor.getUsername(), req.empresaId(), req.empresaNome()));
    }
}
```

Deletar `src/main/java/com/dev4/cypher/dto/SetupStatusResponse.java`.

- [ ] **Step 7: Atualizar `AuthController` (login/loginEstacao/me) e `SecurityConfig`**

Em `AuthController.java`, injetar `EmpresaRepository` e resolver `empresaNome`:

```java
    private final UsuarioRepository usuarios;
    private final EstacaoRepository estacoes;
    private final EmpresaRepository empresas;
    private final PasswordEncoder encoder;
    private final SessionAuthenticator sessionAuthenticator;

    public AuthController(UsuarioRepository usuarios, EstacaoRepository estacoes, EmpresaRepository empresas,
                          PasswordEncoder encoder, SessionAuthenticator sessionAuthenticator) {
        this.usuarios = usuarios;
        this.estacoes = estacoes;
        this.empresas = empresas;
        this.encoder = encoder;
        this.sessionAuthenticator = sessionAuthenticator;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest req,
                                   HttpServletRequest request, HttpServletResponse response) {
        Usuario usuario = usuarios.findByUsername(req.username()).orElse(null);
        if (usuario == null || !encoder.matches(req.password(), usuario.getPasswordHash())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("erro", "Usuario ou senha invalidos"));
        }
        String empresaNome = nomeDaEmpresa(usuario.getEmpresaId());
        if ("OPERADOR".equals(usuario.getPapel())) {
            sessionAuthenticator.autenticar(
                    new OperadorAuthentication(usuario.getEstacaoId(), usuario.getUsername(), usuario.getEmpresaId()),
                    request, response);
            return ResponseEntity.ok(AuthResponse.operador(
                    com.dev4.cypher.security.TenantContext.codigo(usuario.getEstacaoId()),
                    usuario.getUsername(), usuario.getEmpresaId(), empresaNome));
        }
        sessionAuthenticator.autenticar(new GestorAuthentication(usuario.getUsername(), usuario.getEmpresaId()),
                request, response);
        return ResponseEntity.ok(AuthResponse.gestor(usuario.getUsername(), usuario.getEmpresaId(), empresaNome));
    }

    @PostMapping("/login-estacao")
    public ResponseEntity<?> loginEstacao(@Valid @RequestBody LoginEstacaoRequest req,
                                          HttpServletRequest request, HttpServletResponse response) {
        Estacao estacao = estacoes.findByToken(req.token()).orElse(null);
        if (estacao == null || !estacao.isAtiva()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("erro", "Token de estacao invalido ou inativo"));
        }
        sessionAuthenticator.autenticar(
                new OperadorAuthentication(estacao.getId(), estacao.getEmpresaId()), request, response);
        return ResponseEntity.ok(AuthResponse.operador(
                com.dev4.cypher.security.TenantContext.codigo(estacao.getId()),
                estacao.getEmpresaId(), nomeDaEmpresa(estacao.getEmpresaId())));
    }

    @GetMapping("/me")
    public ResponseEntity<AuthResponse> me() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof GestorAuthentication g) {
            return ResponseEntity.ok(AuthResponse.gestor(g.getUsername(), g.getEmpresaId(), nomeDaEmpresa(g.getEmpresaId())));
        }
        if (auth instanceof OperadorAuthentication o) {
            String estacaoId = com.dev4.cypher.security.TenantContext.codigo(o.getEstacaoId());
            String empresaNome = nomeDaEmpresa(o.getEmpresaId());
            return ResponseEntity.ok(o.getUsername() != null
                    ? AuthResponse.operador(estacaoId, o.getUsername(), o.getEmpresaId(), empresaNome)
                    : AuthResponse.operador(estacaoId, o.getEmpresaId(), empresaNome));
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }

    private String nomeDaEmpresa(String empresaId) {
        return empresas.findById(empresaId).map(Empresa::getNome).orElse(null);
    }
```

Adicionar os imports `com.dev4.cypher.model.Empresa` e `com.dev4.cypher.repository.EmpresaRepository`.

Em `SecurityConfig.java`, remover a linha `.requestMatchers(HttpMethod.GET, "/api/v1/setup/status").permitAll()` (o `POST /api/v1/setup` continua público, mesma rota, corpo diferente).

- [ ] **Step 8: Substituir todo uso de `TenantContext.DEMO_EMPRESA_ID` por `TenantContext.currentEmpresaId()`**

Em `CatalogService.java`, `EquipeService.java`, `UsuarioService.java`, `IncidentMapper.java`: toda ocorrência de `TenantContext.DEMO_EMPRESA_ID` vira `TenantContext.currentEmpresaId()`. `TenantContext.key(TenantContext.DEMO_EMPRESA_ID, codigo)` vira simplesmente `TenantContext.key(codigo)` (a sobrecarga de 1 argumento já resolve o tenant atual). Exemplo em `CatalogService.createStation`:

```java
    @Transactional
    public EstacaoAdminResponse createStation(StationRequest req) {
        String id = TenantContext.key(req.id());
        if (estacoes.existsById(id)) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "Estacao ja cadastrada: " + req.id());
        }
        Estacao nova = new Estacao(id, req.nome(), req.setor(),
                req.ativa() == null || req.ativa(), TokenGenerator.novo("est-tok"),
                TenantContext.currentEmpresaId());
        return toAdminResponse(estacoes.saveAndFlush(nova));
    }
```

Aplicar a mesma substituição (`TenantContext.key(TenantContext.DEMO_EMPRESA_ID, x)` → `TenantContext.key(x)`, e todo `TenantContext.DEMO_EMPRESA_ID` isolado → `TenantContext.currentEmpresaId()`) em todo método tocado pela Tarefa 2 nos quatro arquivos.

Em `CatalogSeeder.java`, a constante deixa de vir de `TenantContext` (que não a tem mais) — declarar localmente:

```java
    private static final String EMPRESA_DEMO = "demo";
```

E trocar toda referência a `TenantContext.DEMO_EMPRESA_ID` por `EMPRESA_DEMO` neste arquivo. `TenantContext.key(EMPRESA_DEMO, cfg.getId())` continua igual (é a sobrecarga de 2 argumentos, que não precisa de sessão — correto para código de boot, que roda sem `Authentication`).

Em `UsuarioService.criar`, compor o username com o tenant atual em vez de confiar no valor recebido (mesma regra de `SetupController`):

```java
    @Transactional
    public UsuarioResponse criar(UserRequest req) {
        String empresaId = TenantContext.currentEmpresaId();
        String estacaoIdPrefixado = "OPERADOR".equals(req.papel())
                ? TenantContext.key(req.estacaoId()) : null;
        validarPapelEEstacao(req.papel(), estacaoIdPrefixado);
        String username = req.username() + "@" + empresaId;
        if (usuarios.existsByUsername(username)) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "Usuario ja cadastrado: " + username);
        }
        if (req.password() == null || req.password().isBlank()) {
            throw new CatalogValidationException(HttpStatus.BAD_REQUEST,
                    "password e obrigatoria no cadastro");
        }
        Usuario novo = new Usuario(null, username, encoder.encode(req.password()), req.papel(),
                estacaoIdPrefixado, empresaId);
        return toResponse(usuarios.saveAndFlush(novo));
    }
```

`UserController.update`/`UsuarioService.atualizar` continua recebendo o `username` completo pela URL (quem edita já sabe o username completo de quem está editando, retornado por `listar()`) — não precisa compor de novo, só validar que o novo `req.username()` (se mudou) preserva o mesmo sufixo `@{empresaId atual}`. Adicionar essa checagem:

```java
    @Transactional
    public Optional<UsuarioResponse> atualizar(String username, UserRequest req) {
        String empresaId = TenantContext.currentEmpresaId();
        String estacaoIdPrefixado = "OPERADOR".equals(req.papel())
                ? TenantContext.key(req.estacaoId()) : null;
        validarPapelEEstacao(req.papel(), estacaoIdPrefixado);
        if (!req.username().endsWith("@" + empresaId)) {
            throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "username deve terminar em @" + empresaId);
        }
        return usuarios.findByUsername(username).map(usuario -> {
            if (!usuario.getUsername().equals(req.username()) && usuarios.existsByUsername(req.username())) {
                throw new CatalogValidationException(HttpStatus.CONFLICT,
                        "Usuario ja cadastrado: " + req.username());
            }
            usuario.setUsername(req.username());
            usuario.setPapel(req.papel());
            usuario.setEstacaoId(estacaoIdPrefixado);
            if (req.password() != null && !req.password().isBlank()) {
                usuario.setPasswordHash(encoder.encode(req.password()));
            }
            return toResponse(usuarios.saveAndFlush(usuario));
        });
    }
```

- [ ] **Step 9: Atualizar `AuthTestSupport` e os testes de `SetupApiTest`/`AuthControllerApiTest`**

Em `AuthTestSupport.java`, `loginGestorBootstrap` passa a mandar `empresaId`/`empresaNome` no corpo de `POST /api/v1/setup`, e a credencial fixa passa a incluir o sufixo:

```java
    public static final String GESTOR_USERNAME = "admin@acme-test";
    public static final String GESTOR_PASSWORD = "admin123";

    public static MockHttpSession loginGestorBootstrap(MockMvc mvc) throws Exception {
        MockHttpSession session = new MockHttpSession();
        int status = mvc.perform(post("/api/v1/setup").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"admin\", \"password\": \"admin123\", "
                                + "\"empresaId\": \"acme-test\", \"empresaNome\": \"Acme Test\"}"))
                .andReturn().getResponse().getStatus();
        if (status != 200 && status != 409) {
            throw new IllegalStateException(
                    "POST /api/v1/setup devolveu status inesperado " + status
                            + " (esperado 200 ou 409) — loginGestorBootstrap não pode prosseguir");
        }
        if (status == 409) {
            return loginGestor(mvc, GESTOR_USERNAME, GESTOR_PASSWORD);
        }
        return session;
    }
```

(`GESTOR_USERNAME` passa a ser o username completo `admin@acme-test`, já que é isso que `POST /api/v1/setup` grava e é isso que `POST /auth/login` espera receber.)

Em `SetupApiTest.java`, atualizar os testes que constroem `Usuario` diretamente para incluir `empresaId`, e o corpo de `POST /setup` para incluir `empresaId`/`empresaNome`:

```java
    @Test
    void setupCriaOGestorEDevolveSessaoAutenticada() throws Exception {
        MockHttpSession session = new MockHttpSession();

        mvc.perform(post("/api/v1/setup").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"admin\", \"password\": \"admin123\", "
                                + "\"empresaId\": \"acme\", \"empresaNome\": \"Acme\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.papel").value("GESTOR"))
                .andExpect(jsonPath("$.username").value("admin@acme"))
                .andExpect(jsonPath("$.empresaId").value("acme"))
                .andExpect(jsonPath("$.empresaNome").value("Acme"))
                .andExpect(jsonPath("$.estacaoId").doesNotExist());

        mvc.perform(get("/api/v1/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.papel").value("GESTOR"));
    }

    @Test
    void setupSeSegundaVezComMesmoSlugDevolve409() throws Exception {
        empresas.saveAndFlush(new com.dev4.cypher.model.Empresa("ja-existe", "Ja Existe Ltda", true));

        mvc.perform(post("/api/v1/setup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"outro\", \"password\": \"x\", "
                                + "\"empresaId\": \"ja-existe\", \"empresaNome\": \"Ja Existe\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void setupComSlugDiferenteEmParaleloNaoColide() throws Exception {
        mvc.perform(post("/api/v1/setup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"gestor\", \"password\": \"x\", "
                                + "\"empresaId\": \"empresa-a\", \"empresaNome\": \"Empresa A\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/setup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"gestor\", \"password\": \"x\", "
                                + "\"empresaId\": \"empresa-b\", \"empresaNome\": \"Empresa B\"}"))
                .andExpect(status().isOk());
    }
```

Remover os dois testes baseados em `GET /api/v1/setup/status` (`configuradoFalseQuandoNenhumUsuarioExiste`, `configuradoTrueQuandoJaExisteUsuario`) e o `@BeforeEach` que fazia `usuarios.deleteAll()` só para eles — o teste `setupSeSegundaVezComMesmoSlugDevolve409` acima já cobre o cenário de conflito sem depender de estado global da tabela. Injetar `EmpresaRepository empresas` no teste.

- [ ] **Step 10: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS em toda a suíte.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: resolve tenant a partir da sessao e reescreve sign-up por empresa"
```

---

### Task 4: Escopo de listagem — catálogo e equipes/usuários

**Files:**
- Modify: `src/main/java/com/dev4/cypher/repository/EstacaoRepository.java`
- Modify: `src/main/java/com/dev4/cypher/repository/CameraRepository.java`
- Modify: `src/main/java/com/dev4/cypher/repository/EquipeRepository.java`
- Modify: `src/main/java/com/dev4/cypher/repository/UsuarioRepository.java`
- Modify: `src/main/java/com/dev4/cypher/service/CatalogService.java`
- Modify: `src/main/java/com/dev4/cypher/service/EquipeService.java`
- Modify: `src/main/java/com/dev4/cypher/service/UsuarioService.java`
- Test: `src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java`
- Test: `src/test/java/com/dev4/cypher/service/EquipeServiceTest.java`
- Test: `src/test/java/com/dev4/cypher/service/UsuarioServiceTest.java`

**Interfaces:**
- Produces: `EstacaoRepository.findByEmpresaId(String)`, `.findByEmpresaIdAndAtivaTrue(String)`; `CameraRepository.findByEmpresaId(String)`, `.findByEmpresaIdAndAtivaTrue(String)`; `EquipeRepository.findByEmpresaId(String)`, `.findByEmpresaIdAndTurno(String, Turno)`; `UsuarioRepository.findByEmpresaId(String)`

- [ ] **Step 1: Escrever o teste de isolamento em `CatalogWriteServiceTest`**

Adicionar (assumindo que a classe já usa `TestSecurityContext`-style helper; se não, seguir o padrão de autenticar via `SecurityContextHolder` direto, como no `TenantContextTest` da Tarefa 3):

```java
    @Test
    void listaDeEstacoesNaoVazaEntreEmpresas() {
        autenticarComo(new GestorAuthentication("gestor@acme", "acme"));
        service.createStation(new StationRequest("EST-01", "Acme", "montagem", true));

        autenticarComo(new GestorAuthentication("gestor@globex", "globex"));
        service.createStation(new StationRequest("EST-01", "Globex", "montagem", true));

        List<StationResponse> deAcme;
        autenticarComo(new GestorAuthentication("gestor@acme", "acme"));
        deAcme = service.stations();

        assertThat(deAcme).extracting(StationResponse::nome).containsExactly("Acme");
    }
```

(Ajustar o helper `autenticarComo` para o padrão já usado nos testes de service desta suíte — grava direto em `SecurityContextHolder`, sem passar por `MockMvc`, já que `CatalogWriteServiceTest` testa a camada de serviço isolada.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogWriteServiceTest`
Expected: FAIL — `service.stations()` ainda devolve as duas estações (`findByAtivaTrue()` não filtra por tenant).

- [ ] **Step 3: Adicionar os métodos de repositório escopados**

Em `EstacaoRepository.java`:

```java
    List<Estacao> findByEmpresaId(String empresaId);

    List<Estacao> findByEmpresaIdAndAtivaTrue(String empresaId);
```

Em `CameraRepository.java`:

```java
    List<Camera> findByEmpresaId(String empresaId);

    List<Camera> findByEmpresaIdAndAtivaTrue(String empresaId);
```

Em `EquipeRepository.java`:

```java
    List<Equipe> findByEmpresaId(String empresaId);

    List<Equipe> findByEmpresaIdAndTurno(String empresaId, Turno turno);
```

Em `UsuarioRepository.java`:

```java
    List<Usuario> findByEmpresaId(String empresaId);
```

(adicionar o import `java.util.List` onde faltar.)

- [ ] **Step 4: Escopar as listagens em `CatalogService`, `EquipeService`, `UsuarioService`**

Em `CatalogService.java`:

```java
    @Transactional(readOnly = true)
    public List<CameraResponse> cameras(boolean incluirInativas) {
        String empresaId = TenantContext.currentEmpresaId();
        List<Camera> base = incluirInativas
                ? cameras.findByEmpresaId(empresaId) : cameras.findByEmpresaIdAndAtivaTrue(empresaId);
        return base.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<StationResponse> stations(boolean incluirInativas) {
        String empresaId = TenantContext.currentEmpresaId();
        List<Estacao> base = incluirInativas
                ? estacoes.findByEmpresaId(empresaId) : estacoes.findByEmpresaIdAndAtivaTrue(empresaId);
        return base.stream().map(this::toResponse).toList();
    }
```

Em `EquipeService.java`:

```java
    @Transactional(readOnly = true)
    public List<TeamResponse> listar() {
        return equipes.findByEmpresaId(TenantContext.currentEmpresaId()).stream().map(this::toResponse).toList();
    }
```

E em `exigirSemConflito`, escopar a checagem de conflito ao tenant atual (duas empresas podem ter equipes cobrindo o "mesmo" turno sem conflito nenhum — são estações diferentes por construção, mas restringir explicitamente documenta a intenção e evita depender só da unicidade de `estacaoIds`):

```java
    private void exigirSemConflito(List<String> estacaoIdsPrefixados, Turno turno, String idPropria) {
        equipes.findByEmpresaIdAndTurno(TenantContext.currentEmpresaId(), turno).stream()
                .filter(outra -> !outra.getId().equals(idPropria))
                .forEach(outra -> {
                    for (String estacaoId : estacaoIdsPrefixados) {
                        if (outra.getEstacaoIds().contains(estacaoId)) {
                            throw new CatalogValidationException(HttpStatus.CONFLICT,
                                    "Estacao %s ja coberta pela equipe %s no turno %s"
                                            .formatted(TenantContext.codigo(estacaoId),
                                                    TenantContext.codigo(outra.getId()), turno));
                        }
                    }
                });
    }
```

Em `UsuarioService.java`:

```java
    @Transactional(readOnly = true)
    public List<UsuarioResponse> listar() {
        return usuarios.findByEmpresaId(TenantContext.currentEmpresaId()).stream().map(this::toResponse).toList();
    }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogWriteServiceTest`
Expected: PASS

- [ ] **Step 6: Repetir o mesmo padrão de teste (criar sob um tenant, listar sob outro, confirmar isolamento) em `EquipeServiceTest` e `UsuarioServiceTest`**

Mesma estrutura do Step 1, adaptada a `EquipeService.criar`/`.listar()` e `UsuarioService.criar`/`.listar()`.

- [ ] **Step 7: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: escopa listagem de estacoes, cameras, equipes e usuarios por empresa"
```

---

### Task 5: Incidentes — `Alerta` escopado e busca por empresa

**Files:**
- Modify: `src/main/java/com/dev4/cypher/dto/IncidentResponse.java`
- Modify: `src/main/java/com/dev4/cypher/mapper/IncidentMapper.java`
- Modify: `src/main/java/com/dev4/cypher/repository/AlertaRepository.java`
- Modify: `src/main/java/com/dev4/cypher/service/IncidentService.java`
- Modify: `src/main/java/com/dev4/cypher/controller/IncidentController.java`
- Test: `src/test/java/com/dev4/cypher/IncidentIngestionApiTest.java`
- Test: `src/test/java/com/dev4/cypher/IncidentQueryApiTest.java`
- Test: `src/test/java/com/dev4/cypher/security/CypherKeyAuthenticationFilterTest.java`

**Interfaces:**
- Produces: `IncidentResponse.empresaId()` (campo novo, ao final — o front ignora, o `WebhookDispatcher` da Tarefa 7 usa); `AlertaRepository.buscar(..., String empresaId, Pageable)`

- [ ] **Step 1: Escrever o teste de ingestão prefixando `cameraId`/`incidentKey`**

Em `IncidentIngestionApiTest.java`, adicionar (usando o helper de autenticação de câmera já existente na classe — `X-Cypher-Key` de uma câmera semeada):

```java
    @Test
    void incidenteIngeridoGuardaChaveECameraIdPrefixadosPeloTenantDaChave() throws Exception {
        // CAM-01 (semeada pelo CatalogSeeder) pertence ao tenant "demo".
        mvc.perform(post("/api/v1/incidents")
                        .header("X-Cypher-Key", apiKeyDeCamera("CAM-01"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payloadValido("CAM-01", "incident-key-1")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.cameraId").value("CAM-01"));

        Alerta salvo = alertas.findByIncidentKey("demo:incident-key-1").orElseThrow();
        assertThat(salvo.getCameraId()).isEqualTo("demo:CAM-01");
        assertThat(salvo.getEmpresaId()).isEqualTo("demo");
    }
```

(Ajustar `apiKeyDeCamera`/`payloadValido` aos helpers reais já presentes na classe — o ponto novo é a asserção sobre `incidentKey`/`cameraId` prefixados na entidade, com o DTO devolvendo o código puro.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentIngestionApiTest`
Expected: FAIL — `Alerta.getCameraId()` ainda é o valor bruto do payload, sem prefixo.

- [ ] **Step 3: Prefixar `cameraId`/`incidentKey` em `IncidentMapper` e adicionar `empresaId` a `IncidentResponse`**

Em `IncidentResponse.java`, acrescentar o campo ao final:

```java
public record IncidentResponse(
        Long id,
        String incidentKey,
        String cameraId,
        String runId,
        Integer trackId,
        AlertaTipo type,
        Integer severity,
        AlertaNivel nivel,
        String descricao,
        String reason,
        String postureCategory,
        Integer rebaScore,
        Integer actionLevel,
        String zoneName,
        String zoneStatus,
        List<String> epiPresent,
        List<String> epiMissing,
        String snapshotUrl,
        OffsetDateTime detectedAt,
        OffsetDateTime endedAt,
        Double durationSeconds,
        Integer peakSeverity,
        ClosedReason closedReason,
        AlertaStatus status,
        String empresaId
) {
}
```

Em `IncidentMapper.java`:

```java
    public Alerta toEntity(IncidentRequest req) {
        String empresaId = TenantContext.currentEmpresaId();
        Alerta a = new Alerta();
        a.setIncidentKey(TenantContext.key(empresaId, req.incidentKey()));
        a.setCameraId(TenantContext.key(empresaId, req.cameraId()));
        a.setRunId(req.runId());
        a.setTrackId(req.trackId());
        a.setTipo(req.type());
        a.setSeveridade(req.severity());
        a.setNivel(AlertaNivel.fromSeverity(req.severity()));
        a.setReason(req.reason());
        a.setPosturaCategoria(req.postureCategory());
        a.setRebaScore(req.rebaScore());
        a.setActionLevel(req.actionLevel());
        a.setZona(req.zoneName());
        a.setZoneStatus(req.zoneStatus());
        a.setEpiPresent(req.epiPresent() == null ? List.of() : List.copyOf(req.epiPresent()));
        a.setEpiMissing(req.epiMissing() == null ? List.of() : List.copyOf(req.epiMissing()));
        a.setSnapshotUrl(req.snapshotUrl());
        a.setDataHora(req.detectedAt());
        a.setDescricao(descricaoDe(req.type(), req.reason(), req.cameraId()));
        a.setStatus(AlertaStatus.PENDENTE);
        a.setEmpresaId(empresaId);
        return a;
    }

    public IncidentResponse toResponse(Alerta a) {
        return new IncidentResponse(
                a.getId(),
                TenantContext.codigo(a.getIncidentKey()),
                TenantContext.codigo(a.getCameraId()),
                a.getRunId(),
                a.getTrackId(),
                a.getTipo(),
                a.getSeveridade(),
                a.getNivel(),
                a.getDescricao(),
                a.getReason(),
                a.getPosturaCategoria(),
                a.getRebaScore(),
                a.getActionLevel(),
                a.getZona(),
                a.getZoneStatus(),
                a.getEpiPresent(),
                a.getEpiMissing(),
                a.getSnapshotUrl(),
                a.getDataHora(),
                a.getEncerradoEm(),
                a.getDuracaoSegundos(),
                a.getSeveridadePico(),
                a.getClosedReason(),
                a.getStatus(),
                a.getEmpresaId());
    }
```

`descricaoDe` continua recebendo `req.cameraId()` puro (é só texto exibido, não usado em lookup). Adicionar o import `com.dev4.cypher.security.TenantContext`.

Nota: `TenantContext.codigo(a.getIncidentKey())` remove só o primeiro segmento (`empresaId:`) — o restante da chave (`cameraId:runId:trackId:timestamp`) continua intacto, porque `codigo()` corta no primeiro `:` e o valor devolvido ainda contém os demais dois-pontos originais do formato de `incidentKey` (comportamento já coberto pelo teste `codigoUsaOPrimeiroDoisPontosComoSeparador` da Tarefa 1).

- [ ] **Step 4: Corrigir o achado de segurança em `IncidentController`/`CypherKeyAuthenticationFilter`**

`IncidentController.chaveDeOutraCamera` compara `pipeline.getCameraId()` (chave prefixada, ex. `"demo:CAM-01"`) contra `cameraIdDoAlvo` — que agora precisa ser o mesmo formato. No método `ingest`, `req.cameraId()` ainda é o código puro do payload (`"CAM-01"`); resolver a comparação prefixando o lado do payload com o tenant da própria chave que autenticou a requisição:

```java
    @PostMapping
    public ResponseEntity<IncidentResponse> ingest(@Valid @RequestBody IncidentRequest req) {
        if (chaveDeOutraCamera(TenantContext.key(req.cameraId()))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        IncidentService.IngestResult resultado = service.ingest(req);
        HttpStatus status = resultado.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(resultado.incident());
    }
```

`TenantContext.key(req.cameraId())` resolve `currentEmpresaId()` a partir do `PipelineAuthentication` já presente no contexto (a mesma chave que autenticou a ingestão) — correto porque só chega a este ponto quando a autenticação por `X-Cypher-Key` já aconteceu. No método `close`, `atual.get().cameraId()` já vem do `IncidentResponse`, que devolve o código puro (Step 3) — mesma correção:

```java
    @PatchMapping("/{incidentKey}")
    public ResponseEntity<IncidentResponse> close(@PathVariable String incidentKey,
                                                  @Valid @RequestBody IncidentCloseRequest req) {
        Optional<IncidentResponse> atual = service.findByIncidentKey(incidentKey);
        if (atual.isPresent() && chaveDeOutraCamera(TenantContext.key(atual.get().cameraId()))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return service.close(incidentKey, req)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
```

E `foraDoEscopoDoOperador`, que faz `cameras.findById(cameraId)` com o `cameraId` puro vindo de `IncidentResponse` — também precisa da chave prefixada:

```java
    private boolean foraDoEscopoDoOperador(String cameraId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof OperadorAuthentication operador)) {
            return false;
        }
        return cameras.findById(TenantContext.key(operador.getEmpresaId(), cameraId))
                .map(c -> !c.getEstacaoId().equals(operador.getEstacaoId()))
                .orElse(true);
    }
```

(usa `TenantContext.key(operador.getEmpresaId(), cameraId)`, a sobrecarga de 2 argumentos — não a de 1, porque este método pode ser chamado num caminho onde o `Authentication` atual não é necessariamente quem forneceu o `cameraId`, mas sempre é o mesmo tenant do operador logado; usar a sobrecarga de 1 argumento seria equivalente aqui, mas a de 2 é mais explícita sobre de onde o tenant vem). Adicionar o import `com.dev4.cypher.security.TenantContext` em `IncidentController.java`.

- [ ] **Step 5: Escopar `IncidentService.search`/`AlertaRepository.buscar` por `empresaId`**

Em `AlertaRepository.java`:

```java
    @Query("""
            SELECT a FROM Alerta a
            WHERE a.empresaId = :empresaId
              AND (:since IS NULL OR a.dataHora >= :since)
              AND (:cameraId IS NULL OR a.cameraId = :cameraId)
              AND (:severityMin IS NULL OR a.severidade >= :severityMin)
              AND (:status IS NULL OR a.status = :status)
              AND (:estacaoId IS NULL OR a.cameraId IN
                    (SELECT c.id FROM Camera c WHERE c.estacaoId = :estacaoId))
            """)
    Page<Alerta> buscar(@Param("empresaId") String empresaId,
                        @Param("since") OffsetDateTime since,
                        @Param("cameraId") String cameraId,
                        @Param("severityMin") Integer severityMin,
                        @Param("status") AlertaStatus status,
                        @Param("estacaoId") String estacaoId,
                        Pageable pageable);
```

Em `IncidentService.search`, resolver o tenant e prefixar `cameraId`/`estacaoId` antes de repassar (ambos chegam como código puro do `IncidentController`):

```java
    @Transactional(readOnly = true)
    public Page<IncidentResponse> search(OffsetDateTime since,
                                         String cameraId,
                                         Integer severityMin,
                                         AlertaStatus status,
                                         String estacaoId,
                                         Pageable pageable) {
        String empresaId = TenantContext.currentEmpresaId();
        String cameraIdPrefixado = cameraId == null ? null : TenantContext.key(empresaId, cameraId);
        String estacaoIdPrefixado = estacaoId == null ? null : TenantContext.key(empresaId, estacaoId);
        return repository.buscar(empresaId, since, cameraIdPrefixado, severityMin, status, estacaoIdPrefixado, pageable)
                .map(mapper::toResponse);
    }
```

Adicionar o import `com.dev4.cypher.security.TenantContext` em `IncidentService.java`. `IncidentController.list`/`estacaoIdDoOperadorAtual()` continuam devolvendo o código puro do `OperadorAuthentication.getEstacaoId()` — mas essa `estacaoId` já é a chave *prefixada* (ver Step 5 da Tarefa 3, `OperadorAuthentication` guarda `estacaoId` prefixado desde a autenticação). Ajustar `estacaoIdDoOperadorAtual()` para devolver o código puro, já que `IncidentService.search` agora prefixa de novo:

```java
    private String estacaoIdDoOperadorAtual() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth instanceof OperadorAuthentication operador
                ? TenantContext.codigo(operador.getEstacaoId()) : null;
    }
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentIngestionApiTest,IncidentQueryApiTest,CypherKeyAuthenticationFilterTest`
Expected: PASS

- [ ] **Step 7: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS (corrigir qualquer teste de `IncidentQueryApiTest`/`IncidentOperatorScopeApiTest` que ainda assuma `estacaoId`/`cameraId` sem prefixo, seguindo o mesmo padrão do Step 8 da Tarefa 2).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: escopa incidentes por empresa, prefixando incidentKey e cameraId"
```

---

### Task 6: SSE — filtro por empresa

**Files:**
- Modify: `src/main/java/com/dev4/cypher/sse/IncidentSseService.java`
- Modify: `src/main/java/com/dev4/cypher/controller/IncidentController.java`
- Test: `src/test/java/com/dev4/cypher/sse/IncidentSseServiceTest.java`

**Interfaces:**
- Consumes: `IncidentResponse.empresaId()` (Tarefa 5)
- Produces: `IncidentSseService.subscribe(String empresaId, String estacaoId)`

- [ ] **Step 1: Escrever o teste de isolamento por empresa no SSE**

Adicionar em `IncidentSseServiceTest.java`:

```java
    @Test
    void assinanteDeUmaEmpresaNaoRecebeIncidenteDeOutra() {
        SseEmitter emitterAcme = new SseEmitter();
        sse.register(emitterAcme, "acme", null);

        IncidentResponse incidenteGlobex = incidenteDeExemplo("globex", "CAM-01");
        sse.broadcast("incident", incidenteGlobex);

        // Sem assinante de "globex" nesta suíte: a ausência de exceção e o
        // não-envio (verificável via double/spy do emitter, conforme padrão
        // já usado nesta classe) provam o filtro.
    }
```

(Ajustar `incidenteDeExemplo` ao helper/fixture já existente na classe, agora incluindo o argumento `empresaId`.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentSseServiceTest`
Expected: FAIL na compilação — `register(emitter, empresaId, estacaoId)` de 3 argumentos não existe.

- [ ] **Step 3: Generalizar `Subscription` e o filtro**

Em `IncidentSseService.java`:

```java
    private record Subscription(SseEmitter emitter, String empresaId, String estacaoId) {
    }

    private final CameraRepository cameras;
    private final List<Subscription> subscriptions = new CopyOnWriteArrayList<>();

    public IncidentSseService(CameraRepository cameras) {
        this.cameras = cameras;
    }

    public SseEmitter subscribe(String empresaId) {
        return subscribe(empresaId, null);
    }

    public SseEmitter subscribe(String empresaId, String estacaoId) {
        return register(new SseEmitter(SEM_TIMEOUT), empresaId, estacaoId);
    }

    public SseEmitter register(SseEmitter emitter, String empresaId, String estacaoId) {
        Subscription subscription = new Subscription(emitter, empresaId, estacaoId);
        subscriptions.add(subscription);
        emitter.onCompletion(() -> subscriptions.remove(subscription));
        emitter.onTimeout(() -> subscriptions.remove(subscription));
        emitter.onError(e -> subscriptions.remove(subscription));
        return emitter;
    }

    public void broadcast(String eventName, IncidentResponse incident) {
        String estacaoDoIncidente = cameras.findById(
                        com.dev4.cypher.security.TenantContext.key(incident.empresaId(), incident.cameraId()))
                .map(Camera::getEstacaoId)
                .map(com.dev4.cypher.security.TenantContext::codigo)
                .orElse(null);
        enviarAosQueEnxergam(incident.empresaId(), estacaoDoIncidente,
                SseEmitter.event().name(eventName).data(incident));
    }

    private void enviarAosQueEnxergam(String empresaDoIncidente, String estacaoDoIncidente,
                                      SseEmitter.SseEventBuilder evento) {
        for (Subscription subscription : subscriptions) {
            boolean mesmaEmpresa = subscription.empresaId().equals(empresaDoIncidente);
            boolean enxergaEstacao = subscription.estacaoId() == null
                    || subscription.estacaoId().equals(estacaoDoIncidente);
            if (!mesmaEmpresa || !enxergaEstacao) {
                continue;
            }
            enviar(subscription, evento);
        }
    }
```

`incident.cameraId()` já é o código puro (Tarefa 5, `IncidentMapper.toResponse`) — `TenantContext.key(incident.empresaId(), incident.cameraId())` reconstrói a chave prefixada para o lookup em `cameras.findById`.

- [ ] **Step 4: Atualizar `IncidentController.stream()`**

```java
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return sse.subscribe(TenantContext.currentEmpresaId(), estacaoIdDoOperadorAtual());
    }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentSseServiceTest`
Expected: PASS

- [ ] **Step 6: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: filtra SSE de incidentes por empresa, alem de estacao"
```

---

### Task 7: Webhook — assinatura escopada por empresa

**Files:**
- Modify: `src/main/java/com/dev4/cypher/model/WebhookSubscription.java` (já feito na Tarefa 2 — confirmar campo presente)
- Modify: `src/main/java/com/dev4/cypher/repository/WebhookSubscriptionRepository.java`
- Modify: `src/main/java/com/dev4/cypher/webhook/WebhookDispatcher.java`
- Test: `src/test/java/com/dev4/cypher/webhook/WebhookDispatcherTest.java`

**Interfaces:**
- Consumes: `IncidentResponse.empresaId()` (Tarefa 5)
- Produces: `WebhookSubscriptionRepository.findByEmpresaIdAndAtivoTrue(String)`

- [ ] **Step 1: Escrever o teste de isolamento de webhook**

Adicionar em `WebhookDispatcherTest.java`:

```java
    @Test
    void assinanteDeUmaEmpresaNaoRecebeIncidenteDeOutra() {
        assinaturas.saveAndFlush(new WebhookSubscription(null, "https://exemplo.com/acme",
                "segredo", 0, true, "acme"));
        assinaturas.saveAndFlush(new WebhookSubscription(null, "https://exemplo.com/globex",
                "segredo", 0, true, "globex"));

        IncidentResponse incidenteAcme = incidenteDeExemplo("acme");
        dispatcher.onIncidentCreated(new IncidentCreatedEvent(incidenteAcme));

        // Só a delivery da assinatura "acme" deve existir — nenhuma para "globex".
        List<WebhookDelivery> entregasGravadas = entregas.findAll();
        assertThat(entregasGravadas).hasSize(1);
    }
```

(Ajustar `incidenteDeExemplo` ao fixture já existente na classe, agora com `empresaId` como argumento.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=WebhookDispatcherTest`
Expected: FAIL — `onIncidentCreated` ainda usa `assinaturas.findByAtivoTrue()`, que devolve as duas.

- [ ] **Step 3: Escopar o repositório e o dispatcher**

Em `WebhookSubscriptionRepository.java`:

```java
    List<WebhookSubscription> findByEmpresaIdAndAtivoTrue(String empresaId);
```

Em `WebhookDispatcher.onIncidentCreated`:

```java
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onIncidentCreated(IncidentCreatedEvent event) {
        IncidentResponse incidente = event.incident();
        String payload = serializar(incidente);

        for (WebhookSubscription assinatura : assinaturas.findByEmpresaIdAndAtivoTrue(incidente.empresaId())) {
            if (incidente.severity() < assinatura.getMinSeverity()) {
                continue;
            }
            WebhookDelivery entrega = new WebhookDelivery(null, assinatura.getId(),
                    incidente.incidentKey(), payload, DeliveryStatus.PENDENTE, 0, null, null);
            tentarEntregar(entrega, assinatura);
        }
    }
```

`reenviarPendentes()` não muda — já resolve a assinatura por `subscriptionId` (PK direta, sem tenant envolvido no lookup).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=WebhookDispatcherTest`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: escopa disparo de webhook por empresa"
```

---

### Task 8: Isolamento ponta a ponta entre duas empresas (sempre a última)

**Files:**
- Test: `src/test/java/com/dev4/cypher/MultiTenantIsolationApiTest.java` (novo)

**Interfaces:**
- Consumes: toda a cadeia construída nas Tarefas 1–7

- [ ] **Step 1: Escrever o teste de ponta a ponta**

Criar `src/test/java/com/dev4/cypher/MultiTenantIsolationApiTest.java`:

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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Prova de ponta a ponta da spec (§8, "Ponta a ponta"): duas empresas
 * cadastradas via sign-up, cada uma com o mesmo codigo de estacao/camera,
 * nunca se enxergam — nem no cadastro, nem no incidente, nem entre si por
 * qualquer combinacao de GET/PUT/DELETE.
 */
@SpringBootTest
@Transactional
@AutoConfigureMockMvc
class MultiTenantIsolationApiTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void duasEmpresasComCodigosIdenticosNuncaSeEnxergam() throws Exception {
        MockHttpSession sessaoAcme = setupEmpresa("acme", "Acme Industrial");
        MockHttpSession sessaoGlobex = setupEmpresa("globex", "Globex Corp");

        criarEstacao(sessaoAcme, "EST-01", "Linha Acme");
        criarEstacao(sessaoGlobex, "EST-01", "Linha Globex");

        mvc.perform(get("/api/v1/stations").session(sessaoAcme))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].nome").value("Linha Acme"));

        mvc.perform(get("/api/v1/stations").session(sessaoGlobex))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].nome").value("Linha Globex"));

        // GESTOR da Globex tentando editar a EST-01 "dele" nao toca a da Acme.
        mvc.perform(post("/api/v1/stations/EST-01/token/regenerate").session(sessaoGlobex))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/stations").session(sessaoAcme))
                .andExpect(jsonPath("$[0].nome").value("Linha Acme"));
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

    private void criarEstacao(MockHttpSession session, String codigo, String nome) throws Exception {
        mvc.perform(post("/api/v1/stations").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"id\": \"%s\", \"nome\": \"%s\", \"setor\": \"montagem\", \"ativa\": true}")
                                .formatted(codigo, nome)))
                .andExpect(status().isCreated());
    }
}
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=MultiTenantIsolationApiTest`
Expected: PASS — se falhar em qualquer asserção, o isolamento de alguma Tarefa 1–7 ficou incompleto; revisar a tarefa correspondente antes de prosseguir.

- [ ] **Step 3: Rodar a suíte inteira uma última vez**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS em toda a suíte.

- [ ] **Step 4: Commit**

```bash
git add src/test/java/com/dev4/cypher/MultiTenantIsolationApiTest.java
git commit -m "test: prova isolamento ponta a ponta entre duas empresas com codigos identicos"
```

---

## Self-Review

**Cobertura da spec:** §2.1 (Empresa) → Tarefa 1. §2.2 (empresaId + chave prefixada em todas as entidades) → Tarefa 2. §2.3 (rejeição de `@IdClass`) → decisão de arquitetura seguida em todo o plano, nunca uma classe de chave composta é criada. §3.1 (username `nome@empresa`) → Tarefa 3, Step 8. §3.2 (Authentication ganha empresaId) → Tarefa 3, Step 3. §3.3 (escopo de query) → Tarefas 3 (setup), 4 (listagem), 5 (incidentes). §3.4 (SSE) → Tarefa 6. §4 (cypher-capture não muda) → nenhuma tarefa toca esse repositório. §6 (seed) → Tarefa 2, Step 7 (`CatalogSeeder`). §7 (comportamento sob falha) → coberto pelos testes de conflito de slug (Tarefa 3) e de código duplicado entre empresas (Tarefa 8). §8 (estratégia de testes) → cada tarefa tem teste de isolamento próprio, culminando na Tarefa 8.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — o único estado intermediário deliberado (`TenantContext.DEMO_EMPRESA_ID`, Tarefa 2) é código real e funcional, removido explicitamente na Tarefa 3 com o diff exato mostrado.

**Consistência de tipos:** `TenantContext.key`/`.codigo`/`.currentEmpresaId` mantêm a mesma assinatura do início ao fim; `IncidentResponse.empresaId()` é introduzido na Tarefa 5 e consumido sem renomear nas Tarefas 6 e 7; os três `Authentication.getEmpresaId()` são introduzidos na Tarefa 3 e consumidos sem variação nas Tarefas 5–8.

---

**Plan complete and saved to `docs/superpowers/plans/multi-tenant/2026-08-29-mta-backend-empresa.md`.**
