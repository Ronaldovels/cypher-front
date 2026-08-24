# E4-A — Backend: Acesso e Equipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar login, papéis (`GESTOR`/`OPERADOR`/`PIPELINE`), cadastro de equipes e usuários, e proteção de endpoint ao backend `cypher` — tudo que a spec de E4 atribui ao backend (order-steps 1 e 4 de §7), terminando com o flip de `X-Cypher-Key` de opcional para obrigatório como a última tarefa.

**Architecture:** Spring Security com sessão (`HttpSession`/`JSESSIONID`), introduzida em etapas para nunca quebrar a suíte: primeiro o esqueleto permissivo (Tarefa 1), depois cada peça de mecanismo/CRUD é adicionada sem travar nada que já funcionava (Tarefas 2–11), e só nas duas últimas tarefas o acesso é de fato travado — primeiro os endpoints existentes passam a exigir sessão/papel (Tarefa 12), depois `X-Cypher-Key` vira obrigatório na ingestão (Tarefa 13, a única deliberadamente por último, spec §5/§7). Dois papéis autenticados por sessão (`GESTOR` via usuário/senha, `OPERADOR` via token de estação, carregando a `estacaoId` como detalhe da `Authentication`) e um terceiro mecanismo sem sessão (`ROLE_PIPELINE` via header `X-Cypher-Key`, validado contra `Camera.apiKey`).

**Tech Stack:** Spring Boot 4.0.6, Spring Security (starter), Spring Data JPA, H2, Lombok, MockMvc + `@SpringBootTest`/`@DataJpaTest`, JUnit 5, AssertJ. Sem framework de mock (o projeto não usa Mockito em lugar nenhum — os testes de segurança usam sessão real via `MockHttpSession` e repositórios reais via `@DataJpaTest`, nunca dublês).

**Spec:** `docs/superpowers/specs/2026-08-23-acesso-e-equipes-e4-design.md` (repo `cypher-front`), §2 (modelo de acesso), §3 (`Equipe`), §5 e §7 (sequenciamento).

**Repositório:** `/home/asaas/projects/cypher`

## Global Constraints

- Repositório: `/home/asaas/projects/cypher`. Branch: `feat/e4a-backend-acesso`, criada a partir de `main` (este repo não tem branch `dev`; `feat/e3a-backend-incident-by-id` foi mergeada em `main` via PR #4, commit `c9e4c5b`) — **não** usar worktree, apenas `git checkout -b`.
- **A Tarefa 13 (flip de `X-Cypher-Key` para obrigatório) é sempre a última do plano.** Motivo (spec §5): o pipeline Python (`cypher-capture`) só passa a enviar o header numa entrega separada (order-step 2 de §7, fora deste repositório); exigir o header antes disso quebraria a ingestão de qualquer pipeline já em produção. A Tarefa 12 (exigir sessão/papel nos demais endpoints) vem logo antes dela, mas não precisa ser a penúltima por nenhum motivo de sequenciamento cruzado — é só onde o mecanismo de autorização geral fica pronto o bastante para travar.
- `Usuario` não tem coluna de papel: todo `Usuario` é `GESTOR` — é o único papel que essa entidade representa (spec §2.5). `OPERADOR` nunca é um `Usuario`; autentica pelo token da própria `Estacao`. `UsuarioResponse.papel` devolve sempre a string literal `"GESTOR"`, para o front ter o mesmo contrato de campo sem que o backend precise persistir o que já é constante.
- `Camera.apiKey` é gerado e persistido nesta entrega, mas **sem nenhuma superfície de leitura** (nem em `CameraAdminResponse`, nem endpoint de regenerate) — ao contrário de `Estacao.token`, que ganha `EstacaoAdminResponse` e `/token/regenerate`. Isso é assimetria deliberada do escopo desta entrega, não descuido: registrado explicitamente no Self-Review, com a lacuna de provisionamento (como alguém lê a chave para configurar o pipeline) marcada como pendência para a integração com `cypher-capture` (order-step 2).
- Violação de escopo de `OPERADOR` (tentar ler/mudar um incidente de outra estação) devolve **403 Forbidden**, nunca 404 — é negação de acesso, não ausência do recurso (spec §2.6: "o backend filtra/rejeita"). Consistente em `GET /incidents/{id}` e `PUT /incidents/{id}/status`.
- `GET /api/v1/cameras` e `GET /api/v1/stations` (listas de navegação) **não** são restritas por `estacaoId` — GESTOR e OPERADOR veem a lista inteira (spec §2.6, linha "navegação"). Só os endpoints de incidente (`GET /incidents`, `GET /incidents/{id}`, `PUT /incidents/{id}/status`, `GET /incidents/stream`) são restritos à estação do operador.
- Erros de validação de negócio em `Equipe`/`Usuario` reaproveitam `com.dev4.cypher.catalog.CatalogValidationException` (já capturada globalmente por `CatalogExceptionHandler`, um `@RestControllerAdvice` sem escopo de pacote) — não criar uma exceção nova por entidade.
- `Estacao.token` e `Camera.apiKey` usam o mesmo gerador (`com.dev4.cypher.security.TokenGenerator`, novo). Nos dois `@AllArgsConstructor` (Lombok), o novo campo é sempre **acrescentado por último** na ordem dos campos — minimiza o diff nos call sites existentes, que só ganham um argumento a mais no final.
- Sem CSRF token: é API JSON pura, sem formulário renderizado no servidor. A mitigação de CSRF já em vigor é `SameSite=Lax` no cookie de sessão (spec §2.2) mais o allowlist de origem em `CorsConfig`; `.csrf(AbstractHttpConfigurer::disable)` é deliberado, não uma omissão.
- Assim que `spring-boot-starter-security` entra no classpath, o header de resposta `X-Frame-Options: DENY` (padrão do Spring Security) quebra o `/h2-console` (que roda em `<iframe>`), habilitado em `application.yaml`. A Tarefa 1 já configura `frameOptions().sameOrigin()` para não quebrar essa ferramenta de dev.
- Rodando localmente com um `./data/cypherdb` já populado de antes desta entrega: `ddl-auto: update` vai tentar acrescentar colunas `unique` (`token`, `apiKey`) a tabelas com linhas existentes com valor nulo, o que falha a constraint unique (múltiplos nulos). Remédio: apagar `./data/` antes de rodar a aplicação (não os testes, que usam H2 em memória) — o seeder só populaciona tabela vazia, então recriar do zero é seguro.
- Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=NomeDaClasse` para uma classe; `./mvnw -o test` para a suíte inteira.

---

### Task 1: Dependência de segurança + cadeia permissiva + health check

**Files:**
- Modify: `pom.xml` — dependência `spring-boot-starter-security`
- Create: `src/main/java/com/dev4/cypher/config/SecurityConfig.java`
- Create: `src/main/java/com/dev4/cypher/dto/HealthResponse.java`
- Create: `src/main/java/com/dev4/cypher/controller/HealthController.java`
- Test: `src/test/java/com/dev4/cypher/HealthApiTest.java`

**Interfaces:**
- Produces: bean `PasswordEncoder` (`BCryptPasswordEncoder`), usado pelo `SetupController` (Tarefas 2/7) e `UsuarioService` (Tarefa 10)
- Produces: `GET /api/v1/health` → `200 {"status":"UP"}`, sempre público

- [ ] **Step 0: Criar a branch**

```bash
cd /home/asaas/projects/cypher
git checkout main
git pull
git checkout -b feat/e4a-backend-acesso
```

- [ ] **Step 1: Adicionar o starter de segurança**

Em `pom.xml`, logo após a dependência `spring-boot-starter-validation`:

```xml
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-security</artifactId>
		</dependency>
```

- [ ] **Step 2: Rodar a suíte e confirmar que agora falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: FAIL em quase toda classe que usa `MockMvc` — o Spring Security autoconfigurado (sem `SecurityFilterChain` próprio) exige login HTTP básico em tudo, com senha gerada aleatoriamente no log de boot.

- [ ] **Step 3: Criar `SecurityConfig` com cadeia 100% permissiva**

Criar `src/main/java/com/dev4/cypher/config/SecurityConfig.java`:

```java
package com.dev4.cypher.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Infra de segurança de E4 (spec §2), introduzida em etapas: esta primeira
 * versão só acrescenta o starter e mantém todo endpoint aberto (permitAll),
 * para que a suíte inteira continue passando sem quebrar nenhum cliente já
 * existente. As tarefas seguintes desta entrega apertam as regras aos
 * poucos; travar os endpoints já existentes e tornar X-Cypher-Key
 * obrigatório na ingestão são sempre as duas últimas tarefas do plano
 * (spec §5/§7).
 *
 * <p>{@code frameOptions().sameOrigin()} existe só por causa do
 * /h2-console: o padrão do Spring Security (X-Frame-Options: DENY) quebra
 * a página, que roda dentro de um iframe.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }
}
```

- [ ] **Step 4: Rodar a suíte e confirmar que volta a passar**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS — de volta ao estado anterior, sem nenhum endpoint protegido ainda.

- [ ] **Step 5: `HealthResponse` e `HealthController`**

Criar `src/main/java/com/dev4/cypher/dto/HealthResponse.java`:

```java
package com.dev4.cypher.dto;

public record HealthResponse(String status) {
}
```

Criar `src/main/java/com/dev4/cypher/controller/HealthController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.HealthResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Único endpoint hand-rolled de health check — não existe /actuator (spec §2.6). */
@RestController
@RequestMapping("/api/v1")
public class HealthController {

    @GetMapping("/health")
    public HealthResponse health() {
        return new HealthResponse("UP");
    }
}
```

- [ ] **Step 6: Teste do health check**

Criar `src/test/java/com/dev4/cypher/HealthApiTest.java`:

```java
package com.dev4.cypher;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class HealthApiTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void respondeUpSemAutenticacao() throws Exception {
        mvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
```

- [ ] **Step 7: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS

- [ ] **Step 8: Commit**

```bash
cd /home/asaas/projects/cypher
git add pom.xml src/main/java/com/dev4/cypher/config/SecurityConfig.java \
        src/main/java/com/dev4/cypher/dto/HealthResponse.java \
        src/main/java/com/dev4/cypher/controller/HealthController.java \
        src/test/java/com/dev4/cypher/HealthApiTest.java
git commit -m "feat(security): adiciona starter de seguranca com cadeia permissiva e health check"
```

---

### Task 2: `Usuario` + repositório + `GET /api/v1/setup/status`

**Files:**
- Create: `src/main/java/com/dev4/cypher/model/Usuario.java`
- Create: `src/main/java/com/dev4/cypher/repository/UsuarioRepository.java`
- Create: `src/main/java/com/dev4/cypher/dto/SetupStatusResponse.java`
- Create: `src/main/java/com/dev4/cypher/controller/SetupController.java`
- Test: `src/test/java/com/dev4/cypher/repository/UsuarioRepositoryTest.java`
- Test: `src/test/java/com/dev4/cypher/SetupApiTest.java`

**Interfaces:**
- Consumes: nada desta tarefa usa o bean `PasswordEncoder` (Tarefa 1) ainda — só `GET /setup/status` existe aqui, sem hash de senha; o encoder só entra quando a Tarefa 7 volta a este mesmo `SetupController` para acrescentar `POST /setup`.
- Produces: `Usuario` (id `Long` gerado, `username` único, `passwordHash`), `UsuarioRepository.findByUsername(String): Optional<Usuario>`, `UsuarioRepository.existsByUsername(String): boolean` — consumidos por `AuthController`/`SetupController` (Tarefa 7) e `UsuarioService`/`UserController` (Tarefa 10)
- Produces: `GET /api/v1/setup/status` → `200 {"configured": boolean}`, público, `true` sse `usuarioRepository.count() > 0` (spec E4 §2.5/§2.6) — sinaliza pro front (`cypher-front`, plano irmão) se deve mostrar o onboarding ou redirecionar para `/login`. `POST /api/v1/setup`, o outro endpoint da mesma tabela da spec, só pode existir a partir da Tarefa 7: precisa de `GestorAuthentication` e do bean `SecurityContextRepository` para autenticar a sessão de resposta, e nenhum dos dois existe ainda nesta tarefa — ver nota na Tarefa 7.

**Por que não há seed nesta entrega (revisão de design):** a resolução original (seed estático de `application.yaml`, um `UserSeeder` rodando em todo boot) foi descartada — ver spec E4 §2.5, nota "Revisado em 2026-08-23, segunda rodada de design". O onboarding do front (`cypher-front`, rota `''`) passa a coletar usuário/senha do gestor mestre num passo novo do wizard e chamar `POST /api/v1/setup` ao concluir — é a superfície natural, porque já é a tela que configura a empresa na primeira execução. Sem seed, sem `application.yaml` tocado por esta tarefa, sem processo de boot criando nada: `usuarios` nasce vazia e só ganha uma linha quando alguém completa o setup (Tarefa 7) ou o CRUD (Tarefa 10).

- [ ] **Step 1: Escrever o teste de repositório que falha**

Criar `src/test/java/com/dev4/cypher/repository/UsuarioRepositoryTest.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Usuario;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class UsuarioRepositoryTest {

    @Autowired
    private UsuarioRepository usuarios;

    @Test
    void encontraPeloUsername() {
        usuarios.saveAndFlush(new Usuario(null, "gestor1", "hash-qualquer"));

        assertThat(usuarios.findByUsername("gestor1")).isPresent();
        assertThat(usuarios.findByUsername("gestor1").orElseThrow().getPasswordHash())
                .isEqualTo("hash-qualquer");
        assertThat(usuarios.findByUsername("inexistente")).isEmpty();
    }

    @Test
    void existsByUsernameDistingueCadastrado() {
        usuarios.saveAndFlush(new Usuario(null, "gestor1", "hash"));

        assertThat(usuarios.existsByUsername("gestor1")).isTrue();
        assertThat(usuarios.existsByUsername("gestor2")).isFalse();
    }

    @Test
    void idEhGeradoAutomaticamente() {
        Usuario salvo = usuarios.saveAndFlush(new Usuario(null, "gestor1", "hash"));

        assertThat(salvo.getId()).isNotNull();
    }
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=UsuarioRepositoryTest`
Expected: FAIL — `com.dev4.cypher.model.Usuario` e `com.dev4.cypher.repository.UsuarioRepository` não existem

- [ ] **Step 3: Criar a entidade e o repositório**

Criar `src/main/java/com/dev4/cypher/model/Usuario.java`:

```java
package com.dev4.cypher.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Gestor autenticado por usuário/senha. É o único papel que esta entidade
 * representa — não existe coluna de papel: {@code OPERADOR} nunca é um
 * {@code Usuario}, autentica pelo token da própria {@code Estacao} (spec E4
 * §2.5). {@code UsuarioResponse.papel} devolve sempre a string literal
 * {@code "GESTOR"}.
 */
@Entity
@Table(name = "usuarios")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Usuario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String username;

    /** BCrypt, nunca texto puro — gravado só pelo `PasswordEncoder` (Tarefa 1). */
    @Column(nullable = false, length = 100)
    private String passwordHash;
}
```

Criar `src/main/java/com/dev4/cypher/repository/UsuarioRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UsuarioRepository extends JpaRepository<Usuario, Long> {

    Optional<Usuario> findByUsername(String username);

    boolean existsByUsername(String username);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=UsuarioRepositoryTest`
Expected: PASS

- [ ] **Step 5: Escrever o teste de `GET /setup/status` que falha**

Criar `src/test/java/com/dev4/cypher/SetupApiTest.java`:

```java
package com.dev4.cypher;

import com.dev4.cypher.model.Usuario;
import com.dev4.cypher.repository.UsuarioRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * `@Transactional` + `deleteAll()` no `@BeforeEach` (mesmo padrão de
 * `CatalogWriteApiTest`): sem isso, `configuradoFalseQuandoNenhumUsuarioExiste`
 * seria dependente da ordem de execução da suíte inteira — qualquer outra
 * classe que já tenha commitado um `Usuario` no H2 compartilhado
 * (`DB_CLOSE_DELAY=-1`) faria esse teste ver `configured: true` mesmo
 * partindo de uma tabela "vazia" do ponto de vista deste método. O rollback
 * ao final de cada teste devolve a tabela ao estado anterior, sem afetar
 * nenhuma outra classe.
 */
@SpringBootTest
@Transactional
@AutoConfigureMockMvc
class SetupApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private UsuarioRepository usuarios;

    @BeforeEach
    void limpar() {
        usuarios.deleteAll();
    }

    @Test
    void configuradoFalseQuandoNenhumUsuarioExiste() throws Exception {
        mvc.perform(get("/api/v1/setup/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configured").value(false));
    }

    @Test
    void configuradoTrueQuandoJaExisteUsuario() throws Exception {
        usuarios.saveAndFlush(new Usuario(null, "gestor1", "hash-qualquer"));

        mvc.perform(get("/api/v1/setup/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configured").value(true));
    }
}
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SetupApiTest`
Expected: FAIL — `com.dev4.cypher.controller.SetupController` não existe

- [ ] **Step 7: Criar `SetupStatusResponse` e `SetupController`**

Criar `src/main/java/com/dev4/cypher/dto/SetupStatusResponse.java`:

```java
package com.dev4.cypher.dto;

/** Corpo de `GET /api/v1/setup/status` — o front decide onboarding-vs-/login a partir daqui (spec E4 §2.5/§2.6). */
public record SetupStatusResponse(boolean configured) {
}
```

Criar `src/main/java/com/dev4/cypher/controller/SetupController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.SetupStatusResponse;
import com.dev4.cypher.repository.UsuarioRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Setup de execução única do gestor mestre (spec E4 §2.5) — substitui o seed
 * estático de `application.yaml` descartado na revisão de design. Nesta
 * tarefa só existe `GET /setup/status`, que não depende de nada além do
 * repositório; `POST /setup` (que precisa autenticar a sessão de resposta)
 * só é acrescentado na Tarefa 7, quando `GestorAuthentication` e o bean
 * `SecurityContextRepository` já existem.
 */
@RestController
@RequestMapping("/api/v1/setup")
public class SetupController {

    private final UsuarioRepository usuarios;

    public SetupController(UsuarioRepository usuarios) {
        this.usuarios = usuarios;
    }

    @GetMapping("/status")
    public SetupStatusResponse status() {
        return new SetupStatusResponse(usuarios.count() > 0);
    }
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SetupApiTest`
Expected: PASS

- [ ] **Step 9: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS — nada mais foi tocado, `Usuario`/`SetupController` são aditivos

- [ ] **Step 10: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/model/Usuario.java \
        src/main/java/com/dev4/cypher/repository/UsuarioRepository.java \
        src/main/java/com/dev4/cypher/dto/SetupStatusResponse.java \
        src/main/java/com/dev4/cypher/controller/SetupController.java \
        src/test/java/com/dev4/cypher/repository/UsuarioRepositoryTest.java \
        src/test/java/com/dev4/cypher/SetupApiTest.java
git commit -m "feat(security): adiciona Usuario, UsuarioRepository e GET /api/v1/setup/status"
```

---

### Task 3: `Equipe` + repositório (`Turno`, alocação de estações)

**Files:**
- Create: `src/main/java/com/dev4/cypher/model/Turno.java`
- Create: `src/main/java/com/dev4/cypher/model/Equipe.java`
- Create: `src/main/java/com/dev4/cypher/repository/EquipeRepository.java`
- Test: `src/test/java/com/dev4/cypher/repository/EquipeRepositoryTest.java`

**Interfaces:**
- Produces: `Equipe` (id `String`, `nome`, `turno: Turno`, `estacaoIds: List<String>`, `ativa`), `EquipeRepository.findByAtivaTrue(): List<Equipe>`, `EquipeRepository.findByTurno(Turno): List<Equipe>` — consumidos por `EquipeService`/`TeamController` (Tarefa 9)

- [ ] **Step 1: Escrever o teste de repositório que falha**

Criar `src/test/java/com/dev4/cypher/repository/EquipeRepositoryTest.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Equipe;
import com.dev4.cypher.model.Turno;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class EquipeRepositoryTest {

    @Autowired
    private EquipeRepository equipes;

    @Test
    void persisteEstacaoIdsComoElementCollection() {
        equipes.saveAndFlush(new Equipe("EQ-01", "Equipe A", Turno.MANHA,
                List.of("EST-01", "EST-02"), true));

        Equipe lida = equipes.findById("EQ-01").orElseThrow();
        assertThat(lida.getEstacaoIds()).containsExactlyInAnyOrder("EST-01", "EST-02");
        assertThat(lida.getTurno()).isEqualTo(Turno.MANHA);
    }

    @Test
    void listaApenasEquipesAtivas() {
        equipes.save(new Equipe("EQ-01", "Ativa", Turno.MANHA, List.of("EST-01"), true));
        equipes.saveAndFlush(new Equipe("EQ-02", "Inativa", Turno.TARDE, List.of("EST-02"), false));

        assertThat(equipes.findByAtivaTrue()).extracting(Equipe::getId).containsExactly("EQ-01");
    }

    @Test
    void encontraEquipesPeloTurno() {
        equipes.save(new Equipe("EQ-01", "Manha", Turno.MANHA, List.of("EST-01"), true));
        equipes.save(new Equipe("EQ-02", "Tarde", Turno.TARDE, List.of("EST-01"), true));
        equipes.saveAndFlush(new Equipe("EQ-03", "Manha 2", Turno.MANHA, List.of("EST-02"), true));

        assertThat(equipes.findByTurno(Turno.MANHA)).extracting(Equipe::getId)
                .containsExactlyInAnyOrder("EQ-01", "EQ-03");
    }
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=EquipeRepositoryTest`
Expected: FAIL — `com.dev4.cypher.model.Equipe`, `Turno` e `EquipeRepository` não existem

- [ ] **Step 3: Criar o enum, a entidade e o repositório**

Criar `src/main/java/com/dev4/cypher/model/Turno.java`:

```java
package com.dev4.cypher.model;

public enum Turno {
    MANHA, TARDE, NOITE
}
```

Criar `src/main/java/com/dev4/cypher/model/Equipe.java`:

```java
package com.dev4.cypher.model;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Unidade de alocação: uma equipe cobre uma ou mais estações dentro de um
 * único turno (spec E4 §3, conforme §16.1 da spec de E1 — a unidade é a
 * equipe, não a pessoa; alocação estática, sem escala por data).
 *
 * <p>A unicidade de {@code (estacaoId, turno)} é validada em
 * {@code EquipeService} (Tarefa 9), não como constraint de banco — mesma
 * escolha já feita para {@code setor} em §12 da spec de E1.
 */
@Entity
@Table(name = "equipes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Equipe {

    /** Identificador legível, ex.: EQ-01. */
    @Id
    @Column(length = 64)
    private String id;

    @Column(nullable = false, length = 120)
    private String nome;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Turno turno;

    @ElementCollection
    @CollectionTable(name = "equipe_estacoes", joinColumns = @JoinColumn(name = "equipe_id"))
    @Column(name = "estacao_id")
    private List<String> estacaoIds = new ArrayList<>();

    private boolean ativa;
}
```

Criar `src/main/java/com/dev4/cypher/repository/EquipeRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Equipe;
import com.dev4.cypher.model.Turno;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EquipeRepository extends JpaRepository<Equipe, String> {

    List<Equipe> findByAtivaTrue();

    List<Equipe> findByTurno(Turno turno);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=EquipeRepositoryTest`
Expected: PASS

- [ ] **Step 5: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS — `Equipe` é aditiva, nada existente referencia

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/model/Turno.java \
        src/main/java/com/dev4/cypher/model/Equipe.java \
        src/main/java/com/dev4/cypher/repository/EquipeRepository.java \
        src/test/java/com/dev4/cypher/repository/EquipeRepositoryTest.java
git commit -m "feat(security): adiciona Equipe, Turno e EquipeRepository"
```

---

### Task 4: `TokenGenerator` + `Estacao.token`

**Files:**
- Create: `src/main/java/com/dev4/cypher/security/TokenGenerator.java`
- Test: `src/test/java/com/dev4/cypher/security/TokenGeneratorTest.java`
- Modify: `src/main/java/com/dev4/cypher/model/Estacao.java` — campo `token`
- Modify: `src/main/java/com/dev4/cypher/repository/EstacaoRepository.java` — `findByToken`
- Modify: `src/main/java/com/dev4/cypher/config/CatalogSeeder.java` — gera token ao semear
- Modify: `src/main/java/com/dev4/cypher/service/CatalogService.java` — gera token em `createStation`
- Modify: `src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java` — 4 chamadas de `new Estacao(...)` ganham o 5º argumento

**Interfaces:**
- Produces: `TokenGenerator.novo(String prefixo): String` — reusado por `Camera.apiKey` (Tarefa 6) e por `CatalogService.regenerateToken` (Tarefa 5)
- Produces: `Estacao.getToken()/setToken(String)`, `EstacaoRepository.findByToken(String): Optional<Estacao>` — consumido por `AuthController.loginEstacao` (Tarefa 7)
- Consumes: nenhuma interface nova de tarefa anterior

- [ ] **Step 1: Escrever o teste do gerador que falha**

Criar `src/test/java/com/dev4/cypher/security/TokenGeneratorTest.java`:

```java
package com.dev4.cypher.security;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class TokenGeneratorTest {

    @Test
    void tokenComecaComOPrefixoInformado() {
        String token = TokenGenerator.novo("est-tok");

        assertThat(token).startsWith("est-tok-");
        assertThat(token.length()).isGreaterThan("est-tok-".length());
    }

    @Test
    void doisTokensGeradosSaoDiferentes() {
        assertThat(TokenGenerator.novo("est-tok"))
                .isNotEqualTo(TokenGenerator.novo("est-tok"));
    }

    @Test
    void cemTokensGeradosSaoTodosUnicos() {
        Set<String> gerados = new HashSet<>();
        for (int i = 0; i < 100; i++) {
            gerados.add(TokenGenerator.novo("cam-key"));
        }

        assertThat(gerados).hasSize(100);
    }
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=TokenGeneratorTest`
Expected: FAIL — `com.dev4.cypher.security.TokenGenerator` não existe

- [ ] **Step 3: Implementar `TokenGenerator`**

Criar `src/main/java/com/dev4/cypher/security/TokenGenerator.java`:

```java
package com.dev4.cypher.security;

import java.security.SecureRandom;
import java.util.HexFormat;

/**
 * Gerador único de token opaco, compartilhado por `Estacao.token` e
 * `Camera.apiKey` (spec E4 §2.3/§2.4) — 24 bytes de `SecureRandom` em hex
 * (48 caracteres), prefixados para que o valor seja identificável a olho nu
 * (`est-tok-...`, `cam-key-...`) sem revelar nada sobre o algoritmo.
 */
public final class TokenGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int BYTES = 24;

    private TokenGenerator() {
    }

    public static String novo(String prefixo) {
        byte[] bytes = new byte[BYTES];
        RANDOM.nextBytes(bytes);
        return prefixo + "-" + HexFormat.of().formatHex(bytes);
    }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=TokenGeneratorTest`
Expected: PASS

- [ ] **Step 5: Escrever o teste de `findByToken` que falha**

Em `src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java`, adicionar este teste ao final da classe (antes do `}` de fechamento):

```java

    @Test
    void encontraEstacaoPeloToken() {
        estacoes.saveAndFlush(new Estacao("EST-30", "Expedicao", "logistica", true, "tok-EST-30"));

        assertThat(estacoes.findByToken("tok-EST-30")).isPresent();
        assertThat(estacoes.findByToken("tok-EST-30").orElseThrow().getId()).isEqualTo("EST-30");
        assertThat(estacoes.findByToken("token-que-nao-existe")).isEmpty();
    }
```

E atualizar as 4 chamadas existentes de `new Estacao(...)` nesta classe, acrescentando o 5º argumento (token), cada uma com um valor distinto dentro do mesmo método de teste:

```java
        estacoes.save(new Estacao("EST-01", "Esteira de montagem", "montagem", true, "tok-EST-01"));
```
```java
        estacoes.saveAndFlush(new Estacao("EST-09", "Prensa 3", "estamparia", false, "tok-EST-09"));
```
```java
        estacoes.save(new Estacao("EST-01", "Ativa", "montagem", true, "tok-EST-01"));
```
```java
        estacoes.saveAndFlush(new Estacao("EST-02", "Inativa", "montagem", false, "tok-EST-02"));
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogRepositoryTest`
Expected: FAIL — não compila (`Estacao` não tem construtor de 5 argumentos, `findByToken` não existe)

- [ ] **Step 7: Acrescentar o campo `token` e o gerador nos pontos de criação**

Em `src/main/java/com/dev4/cypher/model/Estacao.java`, acrescentar o campo por último (a ordem dos campos no `@AllArgsConstructor` do Lombok segue a ordem de declaração — acrescentar por último minimiza o diff nos call sites existentes):

```java
    @Column(nullable = false, length = 120)
    private String nome;

    @Column(length = 120)
    private String setor;

    @Column(nullable = false)
    private boolean ativa;

    /** Opaco, gerado no cadastro (`TokenGenerator`). Exposto só via `EstacaoAdminResponse` (Tarefa 5). */
    @Column(nullable = false, unique = true, length = 80)
    private String token;
```

Em `src/main/java/com/dev4/cypher/repository/EstacaoRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Estacao;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface EstacaoRepository extends JpaRepository<Estacao, String> {

    List<Estacao> findByAtivaTrue();

    Optional<Estacao> findByToken(String token);
}
```

Em `src/main/java/com/dev4/cypher/config/CatalogSeeder.java`, importar `com.dev4.cypher.security.TokenGenerator` e trocar a linha que constrói `Estacao`:

```java
            properties.getStations().forEach(cfg ->
                    estacoes.save(new Estacao(cfg.getId(), cfg.getNome(), cfg.getSetor(),
                            cfg.isAtiva(), TokenGenerator.novo("est-tok"))));
```

Em `src/main/java/com/dev4/cypher/service/CatalogService.java`, importar `com.dev4.cypher.security.TokenGenerator` e trocar a construção em `createStation`:

```java
        Estacao nova = new Estacao(req.id(), req.nome(), req.setor(),
                req.ativa() == null || req.ativa(), TokenGenerator.novo("est-tok"));
```

`updateStation` não muda: token não é reatribuído por edição, só por `/token/regenerate` (Tarefa 5).

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogRepositoryTest`
Expected: PASS

- [ ] **Step 9: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS — `CatalogSeederTest`/`CatalogWriteApiTest`/`CatalogWriteServiceTest` continuam passando: nenhum deles lê `token`, só o `@AllArgsConstructor` mudou de aridade, e os únicos dois call sites de produção (`CatalogSeeder`, `CatalogService`) já foram corrigidos

- [ ] **Step 10: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/security/TokenGenerator.java \
        src/test/java/com/dev4/cypher/security/TokenGeneratorTest.java \
        src/main/java/com/dev4/cypher/model/Estacao.java \
        src/main/java/com/dev4/cypher/repository/EstacaoRepository.java \
        src/main/java/com/dev4/cypher/config/CatalogSeeder.java \
        src/main/java/com/dev4/cypher/service/CatalogService.java \
        src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java
git commit -m "feat(security): adiciona TokenGenerator e o campo Estacao.token"
```

---

### Task 5: `EstacaoAdminResponse` + `POST /stations/{id}/token/regenerate`

**Files:**
- Create: `src/main/java/com/dev4/cypher/dto/EstacaoAdminResponse.java`
- Modify: `src/main/java/com/dev4/cypher/service/CatalogService.java` — `createStation`/`updateStation` passam a devolver `EstacaoAdminResponse`; novo `regenerateToken`
- Modify: `src/main/java/com/dev4/cypher/controller/CatalogController.java` — tipos de retorno atualizados + novo endpoint
- Modify: `src/test/java/com/dev4/cypher/CatalogWriteApiTest.java` — asserções de `token`/ausência de `cameras`, novos testes de regenerate
- Modify: `src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java` — `cadastraEstacaoAtivaPorDefault` não lê mais `.cameras()`; `editaNomeESetor` troca o tipo da variável para `Optional<EstacaoAdminResponse>`

**Interfaces:**
- Consumes: `Estacao.token`, `EstacaoRepository` (Tarefa 4), `TokenGenerator.novo` (Tarefa 4)
- Produces: `EstacaoAdminResponse(String id, String nome, String setor, boolean ativa, String token)`, `CatalogService.regenerateToken(String id): Optional<EstacaoAdminResponse>` — consumido só pelo controller desta tarefa

**Decisão de design (registrada aqui porque não está literal na spec):** `POST`/`PUT /stations` passam a devolver `EstacaoAdminResponse` (com `token`) em vez de `StationResponse` (com `cameras`) — ambos os endpoints já são GESTOR-only (spec §2.6), então expor o token nessas respostas não vaza para `OPERADOR`. Isso é o que torna `EstacaoAdminResponse` "no mesmo espírito de `CameraAdminResponse`" (spec §2.4): cadastro e regenerate são as duas superfícies que a expõem, nunca a lista de navegação (`GET /stations`, que continua `StationResponse`, com `cameras` e sem `token`). Sem essa mudança, um gestor não teria como copiar o token pela primeira vez sem já saber que precisa regenerá-lo — friccão real, não só inconsistência de nomes. Verificado contra o plano irmão do front (`e4c-front-acesso-equipes.md`): `StationsConfigComponent.createStation()`/`updateStation()` só usam a resposta para `.subscribe({ error: ... })`, nunca leem `.cameras()` dela — a mudança de forma é segura.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/main/java/com/dev4/cypher/dto/EstacaoAdminResponse.java` (precisa existir para o teste compilar — DTO puro, sem lógica a testar isoladamente):

```java
package com.dev4.cypher.dto;

/**
 * Estação na superfície de administração — inclui {@code token}, que a lista
 * de navegação (`StationResponse`) omite. Só devolvido por endpoints
 * GESTOR-only: cadastro (create/update) e `/token/regenerate` (spec E4 §2.4).
 */
public record EstacaoAdminResponse(
        String id,
        String nome,
        String setor,
        boolean ativa,
        String token
) {
}
```

Em `src/test/java/com/dev4/cypher/CatalogWriteApiTest.java`, no teste `cadastraEstacaoEDevolve201`, acrescentar as duas asserções finais:

```java
    @Test
    void cadastraEstacaoEDevolve201() throws Exception {
        mvc.perform(post("/api/v1/stations")
                        .contentType(MediaType.APPLICATION_JSON).content(ESTACAO))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("EST-77"))
                .andExpect(jsonPath("$.ativa").value(true))
                .andExpect(jsonPath("$.token").exists())
                .andExpect(jsonPath("$.cameras").doesNotExist());
    }
```

E acrescentar estes dois testes ao final da classe (antes do `}` de fechamento):

```java

    @Test
    void regeneraTokenEDevolveValorDiferenteDoAnterior() throws Exception {
        String criada = mvc.perform(post("/api/v1/stations")
                        .contentType(MediaType.APPLICATION_JSON).content(ESTACAO))
                .andReturn().getResponse().getContentAsString();
        String tokenOriginal = com.jayway.jsonpath.JsonPath.read(criada, "$.token");

        mvc.perform(post("/api/v1/stations/EST-77/token/regenerate"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("EST-77"))
                .andExpect(jsonPath("$.token").value(Matchers.not(tokenOriginal)));
    }

    @Test
    void regenerarTokenDeEstacaoInexistenteDevolve404() throws Exception {
        mvc.perform(post("/api/v1/stations/EST-99/token/regenerate"))
                .andExpect(status().isNotFound());
    }
```

Em `src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java`, trocar o teste `cadastraEstacaoAtivaPorDefault` (a chamada `criada.cameras()` deixa de compilar: `EstacaoAdminResponse` não tem esse campo):

```java
    @Test
    void cadastraEstacaoAtivaPorDefault() {
        EstacaoAdminResponse criada = service.createStation(esteira());

        assertThat(criada.id()).isEqualTo("EST-01");
        assertThat(criada.nome()).isEqualTo("Esteira de montagem");
        assertThat(criada.setor()).isEqualTo("montagem");
        assertThat(criada.ativa()).isTrue();
        assertThat(criada.token()).isNotBlank();
    }
```

No mesmo arquivo, o teste `editaNomeESetor` também deixa de compilar — `updateStation` passa a devolver `Optional<EstacaoAdminResponse>`, então a declaração da variável precisa mudar (o corpo do teste, que só lê `.nome()`/`.setor()`, continua igual):

```java
    @Test
    void editaNomeESetor() {
        service.createStation(esteira());

        Optional<EstacaoAdminResponse> editada = service.updateStation("EST-01",
                new StationRequest("EST-01", "Esteira 1", "montagem final", null));

        assertThat(editada).isPresent();
        assertThat(editada.get().nome()).isEqualTo("Esteira 1");
        assertThat(editada.get().setor()).isEqualTo("montagem final");
    }
```

Os demais usos de `updateStation` no arquivo continuam de pé sem alteração: `editarEstacaoInexistenteDevolveVazio` passa o `Optional` direto para `assertThat` (genérico, sem binding de tipo) e `recusaTentativaDeRenomearOCodigo` usa lambda. Mantenha o import de `StationResponse` — `listaPadraoOmiteEstacaoDesativada` e `estacaoAtivaNaoMostraCameraDesativada` continuam usando-o via `service.stations()`.

E o import no topo do arquivo:

```java
import com.dev4.cypher.dto.EstacaoAdminResponse;
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogWriteApiTest,CatalogWriteServiceTest`
Expected: FAIL — não compila (`CatalogService.createStation` ainda devolve `StationResponse`, endpoint de regenerate não existe)

- [ ] **Step 3: Atualizar `CatalogService`**

Em `src/main/java/com/dev4/cypher/service/CatalogService.java`, importar `com.dev4.cypher.dto.EstacaoAdminResponse` e `com.dev4.cypher.security.TokenGenerator`, trocar as assinaturas e adicionar o mapeador e o novo método:

```java
    @Transactional
    public EstacaoAdminResponse createStation(StationRequest req) {
        if (estacoes.existsById(req.id())) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "Estacao ja cadastrada: " + req.id());
        }
        Estacao nova = new Estacao(req.id(), req.nome(), req.setor(),
                req.ativa() == null || req.ativa(), TokenGenerator.novo("est-tok"));
        return toAdminResponse(estacoes.saveAndFlush(nova));
    }

    @Transactional
    public Optional<EstacaoAdminResponse> updateStation(String id, StationRequest req) {
        exigirMesmoCodigo(id, req.id(), "estacao");
        return estacoes.findById(id).map(estacao -> {
            estacao.setNome(req.nome());
            estacao.setSetor(req.setor());
            if (req.ativa() != null) {
                estacao.setAtiva(req.ativa());
            }
            return toAdminResponse(estacoes.saveAndFlush(estacao));
        });
    }

    /** Rotaciona o token sem recriar a estação (spec E4 §2.4) — GESTOR-only. */
    @Transactional
    public Optional<EstacaoAdminResponse> regenerateToken(String id) {
        return estacoes.findById(id).map(estacao -> {
            estacao.setToken(TokenGenerator.novo("est-tok"));
            return toAdminResponse(estacoes.saveAndFlush(estacao));
        });
    }
```

E acrescentar o mapeador junto dos outros `toResponse`/`toAdminResponse` (seção `Interno`):

```java
    private EstacaoAdminResponse toAdminResponse(Estacao e) {
        return new EstacaoAdminResponse(e.getId(), e.getNome(), e.getSetor(), e.isAtiva(), e.getToken());
    }
```

- [ ] **Step 4: Atualizar `CatalogController`**

Em `src/main/java/com/dev4/cypher/controller/CatalogController.java`, importar `com.dev4.cypher.dto.EstacaoAdminResponse` e trocar as assinaturas de `createStation`/`updateStation`, e adicionar o novo endpoint logo após `deactivateStation`:

```java
    @PostMapping("/stations")
    public ResponseEntity<EstacaoAdminResponse> createStation(@Valid @RequestBody StationRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createStation(req));
    }

    @PutMapping("/stations/{id}")
    public ResponseEntity<EstacaoAdminResponse> updateStation(@PathVariable String id,
                                                              @Valid @RequestBody StationRequest req) {
        return service.updateStation(id, req)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/stations/{id}")
    public ResponseEntity<Void> deactivateStation(@PathVariable String id) {
        return service.deactivateStation(id)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    /** Rotaciona o token de estação; provisionar o kiosk é copiar este valor uma vez (spec E4 §2.4). */
    @PostMapping("/stations/{id}/token/regenerate")
    public ResponseEntity<EstacaoAdminResponse> regenerateStationToken(@PathVariable String id) {
        return service.regenerateToken(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogWriteApiTest,CatalogWriteServiceTest`
Expected: PASS

- [ ] **Step 6: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS

- [ ] **Step 7: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/dto/EstacaoAdminResponse.java \
        src/main/java/com/dev4/cypher/service/CatalogService.java \
        src/main/java/com/dev4/cypher/controller/CatalogController.java \
        src/test/java/com/dev4/cypher/CatalogWriteApiTest.java \
        src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java
git commit -m "feat(security): adiciona EstacaoAdminResponse e POST /stations/{id}/token/regenerate"
```

---

### Task 6: `Camera.apiKey` (sem superfície de leitura)

**Files:**
- Modify: `src/main/java/com/dev4/cypher/model/Camera.java` — campo `apiKey`
- Modify: `src/main/java/com/dev4/cypher/repository/CameraRepository.java` — `findByApiKey`
- Modify: `src/main/java/com/dev4/cypher/config/CatalogSeeder.java` — gera apiKey ao semear
- Modify: `src/main/java/com/dev4/cypher/service/CatalogService.java` — gera apiKey em `createCamera`
- Modify: `src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java` — 9 chamadas de `new Camera(...)` ganham o 7º argumento
- Modify: `src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java` — 4 chamadas de `new Camera(...)` ganham o 7º argumento

**Interfaces:**
- Produces: `Camera.getApiKey()/setApiKey(String)`, `CameraRepository.findByApiKey(String): Optional<Camera>` — consumido por `CypherKeyAuthenticationFilter` (Tarefa 8)
- **Sem DTO, sem endpoint.** `CameraAdminResponse` não ganha campo novo — a chave nunca aparece em nenhuma resposta HTTP nesta entrega. Assimetria deliberada com `Estacao.token` (Tarefa 5): ver Global Constraints e o Self-Review no fim do plano. A lacuna de provisionamento (como alguém lê a chave para configurar o pipeline) fica pendente para a integração com `cypher-capture` (spec E4 §7, order-step 2 — fora deste repositório).

- [ ] **Step 1: Escrever o teste de `findByApiKey` que falha**

Em `src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java`, adicionar ao final da classe (antes do `}` de fechamento, depois do teste `encontraEstacaoPeloToken` da Tarefa 4):

```java

    @Test
    void encontraCameraPelaApiKey() {
        cameras.saveAndFlush(new Camera("CAM-30", "Frontal", "EST-30",
                "http://127.0.0.1:8230/stream", "rtsp://a", true, "key-CAM-30"));

        assertThat(cameras.findByApiKey("key-CAM-30")).isPresent();
        assertThat(cameras.findByApiKey("key-CAM-30").orElseThrow().getId()).isEqualTo("CAM-30");
        assertThat(cameras.findByApiKey("chave-que-nao-existe")).isEmpty();
    }
```

E atualizar as 9 chamadas existentes de `new Camera(...)` nesta classe, acrescentando o 7º argumento (apiKey), com um valor distinto por câmera dentro de cada método de teste (ids repetidos entre métodos diferentes não colidem — `@DataJpaTest` reverte a transação a cada teste):

```java
        cameras.save(new Camera("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://cam1/stream", true, "key-CAM-01"));
        cameras.save(new Camera("CAM-02", "Lateral", "EST-01",
                "http://127.0.0.1:8091/stream", "rtsp://cam2/stream", true, "key-CAM-02"));
        cameras.saveAndFlush(new Camera("CAM-03", "Expedicao", "EST-02",
                "http://127.0.0.1:8092/stream", "0", true, "key-CAM-03"));
```
```java
        cameras.save(new Camera("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://cam1/stream", true, "key-CAM-01"));
        cameras.saveAndFlush(new Camera("CAM-02", "Desativada", "EST-01",
                "http://127.0.0.1:8091/stream", "rtsp://cam2/stream", false, "key-CAM-02"));
```
```java
        cameras.save(new Camera("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://a", true, "key-CAM-01"));
        cameras.save(new Camera("CAM-02", "Inativa", "EST-01",
                "http://127.0.0.1:8091/stream", "rtsp://b", false, "key-CAM-02"));
        cameras.saveAndFlush(new Camera("CAM-03", "Outra estacao", "EST-02",
                "http://127.0.0.1:8092/stream", "rtsp://c", true, "key-CAM-03"));
```
```java
        cameras.saveAndFlush(new Camera("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://a", true, "key-CAM-01"));
```

Em `src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java`, atualizar as 4 chamadas de `new Camera(...)`:

```java
        cameras.save(new Camera("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://a", true, "key-CAM-01"));
        cameras.saveAndFlush(new Camera("CAM-02", "Antiga", "EST-01",
                "http://127.0.0.1:8091/stream", "rtsp://b", false, "key-CAM-02"));
```
(usada duas vezes nesta classe, em `estacaoAtivaNaoMostraCameraDesativada` e em `listaDeCamerasOmiteDesativadas` — mesma substituição nos dois métodos)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogRepositoryTest,CatalogWriteServiceTest`
Expected: FAIL — não compila (`Camera` não tem construtor de 7 argumentos, `findByApiKey` não existe)

- [ ] **Step 3: Acrescentar o campo `apiKey` e o gerador nos pontos de criação**

Em `src/main/java/com/dev4/cypher/model/Camera.java`, acrescentar o campo por último:

```java
    /**
     * Câmera em operação. Desativar tira do heatmap e do seletor de feed sem
     * apagar o histórico: não há chave estrangeira entre incidente e câmera,
     * então apagar de verdade deixaria incidentes órfãos.
     */
    @ColumnDefault("true")
    @Column(nullable = false)
    private boolean ativa;

    /**
     * Opaco, gerado no cadastro (`TokenGenerator`). Ao contrário de
     * `Estacao.token`, não tem nenhuma superfície de leitura nesta entrega —
     * nem em `CameraAdminResponse`, nem endpoint de regenerate (spec E4 §2.3,
     * assimetria deliberada — ver Self-Review).
     */
    @Column(nullable = false, unique = true, length = 80)
    private String apiKey;
```

Em `src/main/java/com/dev4/cypher/repository/CameraRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Camera;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CameraRepository extends JpaRepository<Camera, String> {

    List<Camera> findByEstacaoId(String estacaoId);

    List<Camera> findByAtivaTrue();

    List<Camera> findByEstacaoIdAndAtivaTrue(String estacaoId);

    Optional<Camera> findByStreamUrl(String streamUrl);

    Optional<Camera> findByApiKey(String apiKey);
}
```

Em `src/main/java/com/dev4/cypher/config/CatalogSeeder.java`, trocar a linha que constrói `Camera` (o import de `TokenGenerator` já existe desde a Tarefa 4):

```java
            properties.getCameras().forEach(cfg ->
                    cameras.save(new Camera(cfg.getId(), cfg.getNome(), cfg.getEstacaoId(),
                            cfg.getStreamUrl(), cfg.getFonte(), cfg.isAtiva(),
                            TokenGenerator.novo("cam-key"))));
```

Em `src/main/java/com/dev4/cypher/service/CatalogService.java`, trocar a construção em `createCamera`:

```java
        Camera nova = new Camera(req.id(), req.nome(), req.estacaoId(),
                req.streamUrl(), req.fonte(), req.ativa() == null || req.ativa(),
                TokenGenerator.novo("cam-key"));
        return toAdminResponse(cameras.saveAndFlush(nova));
```

`updateCamera` não muda: `apiKey` não é reatribuída por edição — não há endpoint de regenerate para câmera nesta entrega.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogRepositoryTest,CatalogWriteServiceTest`
Expected: PASS

- [ ] **Step 5: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/model/Camera.java \
        src/main/java/com/dev4/cypher/repository/CameraRepository.java \
        src/main/java/com/dev4/cypher/config/CatalogSeeder.java \
        src/main/java/com/dev4/cypher/service/CatalogService.java \
        src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java \
        src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java
git commit -m "feat(security): adiciona Camera.apiKey, sem superficie de leitura"
```

---

### Task 7: Autenticação por sessão — `GestorAuthentication`/`OperadorAuthentication` + `AuthController` + `POST /api/v1/setup`

**Files:**
- Create: `src/main/java/com/dev4/cypher/security/GestorAuthentication.java`
- Create: `src/main/java/com/dev4/cypher/security/OperadorAuthentication.java`
- Create: `src/main/java/com/dev4/cypher/security/SessionAuthenticator.java`
- Create: `src/main/java/com/dev4/cypher/dto/LoginRequest.java`
- Create: `src/main/java/com/dev4/cypher/dto/LoginEstacaoRequest.java`
- Create: `src/main/java/com/dev4/cypher/dto/AuthResponse.java`
- Create: `src/main/java/com/dev4/cypher/dto/SetupRequest.java`
- Create: `src/main/java/com/dev4/cypher/controller/AuthController.java`
- Modify: `src/main/java/com/dev4/cypher/controller/SetupController.java` — acrescenta `POST /api/v1/setup` (Tarefa 2 só tinha `GET /status`)
- Modify: `src/main/java/com/dev4/cypher/config/SecurityConfig.java` — bean `SecurityContextRepository` + wiring na cadeia
- Modify: `src/main/resources/application.yaml` — `server.servlet.session.cookie.same-site: lax`
- Create: `src/test/java/com/dev4/cypher/security/AuthTestSupport.java`
- Test: `src/test/java/com/dev4/cypher/AuthControllerApiTest.java`
- Modify: `src/test/java/com/dev4/cypher/SetupApiTest.java` — testes de `POST /setup` (criação + sessão + 409)

**Interfaces:**
- Consumes: `Usuario`/`UsuarioRepository` (Tarefa 2), `Estacao.token`/`EstacaoRepository.findByToken` (Tarefa 4), bean `PasswordEncoder` (Tarefa 1)
- Produces: `GestorAuthentication(String username)`, `OperadorAuthentication(String estacaoId)` (ambas `AbstractAuthenticationToken`, autoridades `ROLE_GESTOR`/`ROLE_OPERADOR`) — usadas por todos os controllers que precisam saber o papel/estacaoId da sessão atual (Tarefa 11, Tarefa 12)
- Produces: `SessionAuthenticator.autenticar(Authentication, HttpServletRequest, HttpServletResponse)` — único ponto que grava `SecurityContext` na sessão (via o bean `SecurityContextRepository` desta mesma tarefa), usado por `AuthController.login`/`.loginEstacao` **e** por `SetupController.setup` — nunca duas cópias divergentes da mesma gravação (é exatamente o "reaproveitar o mesmo mecanismo de sessão de `POST /auth/login`, sem duplicar a lógica" da spec E4 §2.5).
- Produces: `POST /api/v1/setup` `{username, password}` → `200 {papel: "GESTOR", username}` + sessão autenticada (mesmo formato de `POST /auth/login`), ou `409` se `usuarioRepository.count() > 0` (execução única — spec E4 §2.5/§2.6). Só existe a partir desta tarefa porque só agora `GestorAuthentication`/`SessionAuthenticator` existem; `GET /setup/status` (Tarefa 2) não muda.
- Produces (teste): `AuthTestSupport.loginGestorBootstrap(MockMvc): MockHttpSession`, `AuthTestSupport.loginGestor(MockMvc, String, String): MockHttpSession`, `AuthTestSupport.loginOperador(MockMvc, String): MockHttpSession` — login real via `MockMvc`, reusado por todo teste de endpoint protegido a partir da Tarefa 9. Sem seeder (Tarefa 2 revisada), `loginGestorBootstrap` é **auto-provisionante**: tenta `POST /api/v1/setup` com a credencial fixa de teste primeiro; só cai para `POST /auth/login` se `/setup` devolver 409 (algum outro teste, no mesmo contexto compartilhado, já criou o gestor bootstrap antes) — nunca lê `UsuarioRepository` diretamente, continua sendo uma classe estática sem `@Autowired`.

- [ ] **Step 1: Escrever o teste do `AuthController` que falha**

Criar `src/test/java/com/dev4/cypher/security/AuthTestSupport.java`:

```java
package com.dev4.cypher.security;

import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Login real via MockMvc para os testes de endpoint protegido — nunca um
 * Authentication ou sessão forjados, para que o teste atravesse a mesma
 * cadeia de filtros que um cliente real atravessaria.
 */
public final class AuthTestSupport {

    /**
     * Credencial fixa de teste do gestor bootstrap. Sem seeder (revisão de
     * design E4 §2.5, Tarefa 2): quem cria esse usuário é
     * {@link #loginGestorBootstrap}, chamando `POST /api/v1/setup` — o
     * mesmo endpoint que o onboarding do front chama uma única vez.
     */
    public static final String GESTOR_USERNAME = "admin";
    public static final String GESTOR_PASSWORD = "admin123";

    private AuthTestSupport() {
    }

    /**
     * Auto-provisionante: tenta criar o gestor bootstrap via `POST /setup`
     * (que já devolve sessão autenticada, Tarefa 7). Se a tabela `usuarios`
     * já não estiver mais vazia — outra classe de teste, no mesmo contexto
     * `@SpringBootTest` compartilhado (H2 com `DB_CLOSE_DELAY=-1`), já
     * chamou este método antes —, `/setup` devolve 409 e este método cai
     * para `POST /auth/login` com a mesma credencial fixa. Isso só é seguro
     * porque `admin`/`GESTOR_USERNAME` é o ÚNICO username que qualquer
     * caminho deste plano usa para o "primeiro" `Usuario` de um contexto
     * (nenhuma outra classe cria um `Usuario` sem antes chamar este
     * método) — ver `AuthControllerApiTest`, que documenta a mesma garantia
     * do lado do teste que exercita `POST /auth/login` diretamente.
     */
    public static MockHttpSession loginGestorBootstrap(MockMvc mvc) throws Exception {
        MockHttpSession session = new MockHttpSession();
        int status = mvc.perform(post("/api/v1/setup").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"%s\", \"password\": \"%s\"}"
                                .formatted(GESTOR_USERNAME, GESTOR_PASSWORD)))
                .andReturn().getResponse().getStatus();
        if (status == 409) {
            return loginGestor(mvc, GESTOR_USERNAME, GESTOR_PASSWORD);
        }
        return session;
    }

    public static MockHttpSession loginGestor(MockMvc mvc, String username, String password) throws Exception {
        MockHttpSession session = new MockHttpSession();
        mvc.perform(post("/api/v1/auth/login").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"%s\", \"password\": \"%s\"}".formatted(username, password)))
                .andExpect(status().isOk());
        return session;
    }

    public static MockHttpSession loginOperador(MockMvc mvc, String token) throws Exception {
        MockHttpSession session = new MockHttpSession();
        mvc.perform(post("/api/v1/auth/login-estacao").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\": \"%s\"}".formatted(token)))
                .andExpect(status().isOk());
        return session;
    }
}
```

Criar `src/test/java/com/dev4/cypher/AuthControllerApiTest.java`:

```java
package com.dev4.cypher;

import com.dev4.cypher.model.Usuario;
import com.dev4.cypher.repository.EstacaoRepository;
import com.dev4.cypher.repository.UsuarioRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import static com.dev4.cypher.security.AuthTestSupport.GESTOR_PASSWORD;
import static com.dev4.cypher.security.AuthTestSupport.GESTOR_USERNAME;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AuthControllerApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private EstacaoRepository estacoes;

    @Autowired
    private UsuarioRepository usuarios;

    @Autowired
    private PasswordEncoder encoder;

    /**
     * Esta classe testa `POST /auth/login` diretamente (não via
     * `AuthTestSupport.loginGestorBootstrap`, que passa por `/setup`) — sem
     * seeder, o gestor bootstrap precisa existir antes. `existsByUsername`
     * evita duplicar (`UNIQUE` em `username`) se outra classe do mesmo
     * contexto compartilhado já o criou primeiro; sempre o mesmo username
     * (`GESTOR_USERNAME`) que `AuthTestSupport` usa, então os dois caminhos
     * nunca colidem em usernames diferentes.
     */
    @BeforeEach
    void garantirGestorBootstrap() {
        if (!usuarios.existsByUsername(GESTOR_USERNAME)) {
            usuarios.save(new Usuario(null, GESTOR_USERNAME, encoder.encode(GESTOR_PASSWORD)));
        }
    }

    @Test
    void loginComCredencialCorretaESessaoSobreviveAProximaRequisicao() throws Exception {
        MockHttpSession session = new MockHttpSession();

        mvc.perform(post("/api/v1/auth/login").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"%s\", \"password\": \"%s\"}"
                                .formatted(GESTOR_USERNAME, GESTOR_PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.papel").value("GESTOR"))
                .andExpect(jsonPath("$.username").value(GESTOR_USERNAME))
                .andExpect(jsonPath("$.estacaoId").doesNotExist());

        // A prova real de que a sessão persistiu: uma SEGUNDA requisição, com o
        // mesmo MockHttpSession, enxerga a autenticação feita na primeira.
        mvc.perform(get("/api/v1/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.papel").value("GESTOR"))
                .andExpect(jsonPath("$.username").value(GESTOR_USERNAME));
    }

    @Test
    void loginComSenhaErradaDevolve401() throws Exception {
        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"%s\", \"password\": \"errada\"}".formatted(GESTOR_USERNAME)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginComUsuarioInexistenteDevolve401() throws Exception {
        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"ninguem\", \"password\": \"x\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginEstacaoComTokenValidoAutenticaComoOperadorESessaoSobrevive() throws Exception {
        mvc.perform(post("/api/v1/stations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"EST-70\", \"nome\": \"Prensa 7\", \"setor\": \"estamparia\"}"));
        String token = estacoes.findById("EST-70").orElseThrow().getToken();
        MockHttpSession session = new MockHttpSession();

        mvc.perform(post("/api/v1/auth/login-estacao").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\": \"%s\"}".formatted(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.papel").value("OPERADOR"))
                .andExpect(jsonPath("$.estacaoId").value("EST-70"))
                .andExpect(jsonPath("$.username").doesNotExist());

        mvc.perform(get("/api/v1/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.papel").value("OPERADOR"))
                .andExpect(jsonPath("$.estacaoId").value("EST-70"));
    }

    @Test
    void loginEstacaoComTokenInvalidoDevolve401() throws Exception {
        mvc.perform(post("/api/v1/auth/login-estacao")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\": \"token-que-nao-existe\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void meSemSessaoDevolve401() throws Exception {
        mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutEncerraASessaoEMeVoltaA401() throws Exception {
        MockHttpSession session = new MockHttpSession();
        mvc.perform(post("/api/v1/auth/login").session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\": \"%s\", \"password\": \"%s\"}"
                        .formatted(GESTOR_USERNAME, GESTOR_PASSWORD)));

        mvc.perform(post("/api/v1/auth/logout").session(session))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/auth/me").session(session))
                .andExpect(status().isUnauthorized());
    }
}
```

Em `src/test/java/com/dev4/cypher/SetupApiTest.java` (criado na Tarefa 2, só com `GET /status`), acrescentar os imports e os testes de `POST /setup`:

```java
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
```

```java

    @Test
    void setupCriaOGestorEDevolveSessaoAutenticada() throws Exception {
        mvc.perform(post("/api/v1/setup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"admin\", \"password\": \"admin123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.papel").value("GESTOR"))
                .andExpect(jsonPath("$.username").value("admin"))
                .andExpect(jsonPath("$.estacaoId").doesNotExist());
    }

    @Test
    void setupSeSegundaVezDevolve409() throws Exception {
        usuarios.saveAndFlush(new com.dev4.cypher.model.Usuario(null, "ja-existe", "hash"));

        mvc.perform(post("/api/v1/setup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"outro\", \"password\": \"x\"}"))
                .andExpect(status().isConflict());
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=AuthControllerApiTest,SetupApiTest`
Expected: FAIL — `com.dev4.cypher.controller.AuthController` e os DTOs não existem; `Estacao.getToken()` existe (Tarefa 4) mas nada popula sessão a partir dele ainda; `POST /api/v1/setup` ainda não existe (Tarefa 2 só criou `GET /status`)

- [ ] **Step 3: Criar os tipos de `Authentication`**

Criar `src/main/java/com/dev4/cypher/security/GestorAuthentication.java`:

```java
package com.dev4.cypher.security;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;

/** Sessão de GESTOR: usuário/senha, sem estacaoId (spec E4 §2.2). */
public class GestorAuthentication extends AbstractAuthenticationToken {

    private final String username;

    public GestorAuthentication(String username) {
        super(List.of(new SimpleGrantedAuthority("ROLE_GESTOR")));
        this.username = username;
        setAuthenticated(true);
    }

    /** Nunca guarda a senha depois de autenticar. */
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
}
```

Criar `src/main/java/com/dev4/cypher/security/OperadorAuthentication.java`:

```java
package com.dev4.cypher.security;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;

/** Sessão de OPERADOR: token de estação, carrega a estacaoId como detalhe (spec E4 §2.2/§2.6). */
public class OperadorAuthentication extends AbstractAuthenticationToken {

    private final String estacaoId;

    public OperadorAuthentication(String estacaoId) {
        super(List.of(new SimpleGrantedAuthority("ROLE_OPERADOR")));
        this.estacaoId = estacaoId;
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
}
```

- [ ] **Step 4: Criar os DTOs**

Criar `src/main/java/com/dev4/cypher/dto/LoginRequest.java`:

```java
package com.dev4.cypher.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(@NotBlank String username, @NotBlank String password) {
}
```

Criar `src/main/java/com/dev4/cypher/dto/LoginEstacaoRequest.java`:

```java
package com.dev4.cypher.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginEstacaoRequest(@NotBlank String token) {
}
```

Criar `src/main/java/com/dev4/cypher/dto/AuthResponse.java`:

```java
package com.dev4.cypher.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Corpo comum de login/me: `papel` sempre presente, `username` OU
 * `estacaoId` conforme o papel — nunca os dois. Espelha os dois DTOs do
 * front (`LoginResponse`/`LoginEstacaoResponse`), unificados aqui porque o
 * backend decide qual campo preencher a partir do tipo de `Authentication`.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuthResponse(String papel, String username, String estacaoId) {

    public static AuthResponse gestor(String username) {
        return new AuthResponse("GESTOR", username, null);
    }

    public static AuthResponse operador(String estacaoId) {
        return new AuthResponse("OPERADOR", null, estacaoId);
    }
}
```

Criar `src/main/java/com/dev4/cypher/dto/SetupRequest.java`:

```java
package com.dev4.cypher.dto;

import jakarta.validation.constraints.NotBlank;

/** Corpo de `POST /api/v1/setup` — mesmo formato de `LoginRequest` (spec E4 §2.5). */
public record SetupRequest(@NotBlank String username, @NotBlank String password) {
}
```

- [ ] **Step 5: Atualizar `SecurityConfig` — bean de `SecurityContextRepository` e wiring**

Em `src/main/java/com/dev4/cypher/config/SecurityConfig.java`, substituir o conteúdo inteiro por:

```java
package com.dev4.cypher.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;

/**
 * Infra de segurança de E4 (spec §2), introduzida em etapas: a Tarefa 1
 * acrescentou o starter com cadeia 100% permissiva; esta tarefa liga a
 * persistência de sessão (`SecurityContextRepository`) usada por
 * `SessionAuthenticator` (por sua vez usado por `AuthController` e
 * `SetupController`) para autenticar GESTOR/OPERADOR. Travar os endpoints já
 * existentes e tornar X-Cypher-Key obrigatório na ingestão continuam sendo
 * sempre as duas últimas tarefas do plano (spec §5/§7) — a cadeia abaixo
 * ainda libera tudo (`permitAll`).
 *
 * <p>{@code securityContextRepository} precisa ser o MESMO bean usado por
 * {@code SessionAuthenticator} para gravar a sessão e pela cadeia (via
 * {@code .securityContext(...)}) para restaurá-la a cada requisição — não
 * duas instâncias equivalentes de {@code HttpSessionSecurityContextRepository}.
 * Senão a gravação explícita do controller e a leitura automática do
 * {@code SecurityContextHolderFilter} são coincidentemente compatíveis, não
 * contratualmente garantidas.
 *
 * <p>{@code frameOptions().sameOrigin()} existe só por causa do
 * /h2-console: o padrão do Spring Security (X-Frame-Options: DENY) quebra
 * a página, que roda dentro de um iframe.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           SecurityContextRepository securityContextRepository) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .securityContext(ctx -> ctx.securityContextRepository(securityContextRepository))
                .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }
}
```

Em `src/main/resources/application.yaml`, acrescentar `server.servlet.session.cookie.same-site` no topo do arquivo (antes de `spring:`) — `HttpOnly` já é o padrão do container, `Secure` fica `false` em dev (HTTP puro) por não ser configurado aqui (spec E4 §2.2: vira `true` em produção via profile, fora do escopo desta entrega):

```yaml
server:
  servlet:
    session:
      cookie:
        same-site: lax

spring:
```

(a linha `spring:` já existe — só a seção `server:` acima dela é nova)

- [ ] **Step 6: Criar `SessionAuthenticator`, `AuthController` e acrescentar `POST /setup` a `SetupController`**

Criar `src/main/java/com/dev4/cypher/security/SessionAuthenticator.java`:

```java
package com.dev4.cypher.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

/**
 * Único ponto que grava um {@code Authentication} na sessão HTTP — usado por
 * {@code AuthController} (`/auth/login`, `/auth/login-estacao`) e por
 * {@code SetupController} (`/setup`), para nunca ter duas cópias divergentes
 * da mesma gravação de {@code SecurityContext} (spec E4 §2.5: "reaproveita a
 * mesma... o mesmo mecanismo de sessão de `POST /auth/login`, sem duplicar a
 * lógica").
 *
 * <p>Precisa do MESMO bean de {@code SecurityContextRepository} usado pela
 * cadeia (via {@code .securityContext(...)} em `SecurityConfig`) para
 * restaurar a sessão a cada requisição — não uma segunda instância
 * equivalente de {@code HttpSessionSecurityContextRepository}.
 */
@Component
public class SessionAuthenticator {

    private final SecurityContextRepository securityContextRepository;

    public SessionAuthenticator(SecurityContextRepository securityContextRepository) {
        this.securityContextRepository = securityContextRepository;
    }

    public void autenticar(Authentication auth, HttpServletRequest request, HttpServletResponse response) {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(auth);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);
    }
}
```

Criar `src/main/java/com/dev4/cypher/controller/AuthController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.AuthResponse;
import com.dev4.cypher.dto.LoginEstacaoRequest;
import com.dev4.cypher.dto.LoginRequest;
import com.dev4.cypher.model.Estacao;
import com.dev4.cypher.model.Usuario;
import com.dev4.cypher.repository.EstacaoRepository;
import com.dev4.cypher.repository.UsuarioRepository;
import com.dev4.cypher.security.GestorAuthentication;
import com.dev4.cypher.security.OperadorAuthentication;
import com.dev4.cypher.security.SessionAuthenticator;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Login/logout/quem-sou-eu para os dois papéis autenticados por sessão (spec E4 §2.2). */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final UsuarioRepository usuarios;
    private final EstacaoRepository estacoes;
    private final PasswordEncoder encoder;
    private final SessionAuthenticator sessionAuthenticator;

    public AuthController(UsuarioRepository usuarios, EstacaoRepository estacoes,
                          PasswordEncoder encoder, SessionAuthenticator sessionAuthenticator) {
        this.usuarios = usuarios;
        this.estacoes = estacoes;
        this.encoder = encoder;
        this.sessionAuthenticator = sessionAuthenticator;
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest req,
                                              HttpServletRequest request, HttpServletResponse response) {
        Usuario usuario = usuarios.findByUsername(req.username()).orElse(null);
        if (usuario == null || !encoder.matches(req.password(), usuario.getPasswordHash())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        sessionAuthenticator.autenticar(new GestorAuthentication(usuario.getUsername()), request, response);
        return ResponseEntity.ok(AuthResponse.gestor(usuario.getUsername()));
    }

    @PostMapping("/login-estacao")
    public ResponseEntity<AuthResponse> loginEstacao(@Valid @RequestBody LoginEstacaoRequest req,
                                                      HttpServletRequest request, HttpServletResponse response) {
        Estacao estacao = estacoes.findByToken(req.token()).orElse(null);
        if (estacao == null || !estacao.isAtiva()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        sessionAuthenticator.autenticar(new OperadorAuthentication(estacao.getId()), request, response);
        return ResponseEntity.ok(AuthResponse.operador(estacao.getId()));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        SecurityContextHolder.clearContext();
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<AuthResponse> me() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof GestorAuthentication g) {
            return ResponseEntity.ok(AuthResponse.gestor(g.getUsername()));
        }
        if (auth instanceof OperadorAuthentication o) {
            return ResponseEntity.ok(AuthResponse.operador(o.getEstacaoId()));
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }
}
```

Substituir o conteúdo inteiro de `src/main/java/com/dev4/cypher/controller/SetupController.java` (criado na Tarefa 2 só com `GET /status`) por:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.AuthResponse;
import com.dev4.cypher.dto.SetupRequest;
import com.dev4.cypher.dto.SetupStatusResponse;
import com.dev4.cypher.model.Usuario;
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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Setup de execução única do gestor mestre (spec E4 §2.5) — substitui o seed
 * estático de `application.yaml` descartado na revisão de design. `POST
 * /setup` reaproveita a mesma validação/hash (`PasswordEncoder`, Tarefa 1) e
 * o mesmo mecanismo de sessão (`SessionAuthenticator`, desta tarefa) de
 * `AuthController.login` — a diferença é só a pré-condição (tabela vazia) e
 * o efeito colateral (cria em vez de autenticar um `Usuario` existente).
 *
 * <p>A spec (E4 §2.5) sugere `UsuarioService.criarPrimeiroGestor(...)` como
 * implementação — não seguido aqui de propósito: `UsuarioService` só existe
 * a partir da Tarefa 10, e este controller precisa compilar já na Tarefa 7.
 * Em vez disso, `SetupController` acessa `UsuarioRepository`/`PasswordEncoder`
 * direto, exatamente como `AuthController` já faz (nenhum dos dois tem
 * service layer) — a "lógica não duplicada" que a spec pede é o
 * `SessionAuthenticator` compartilhado, não uma dependência de
 * `UsuarioService` que criaria um ciclo de tarefas.
 *
 * <p>`@Transactional` no método (não na classe, e sem service dedicado)
 * cobre a janela entre checar `usuarios.count()` e gravar o novo `Usuario` —
 * mesmo padrão de `@Transactional` em método de escrita usado por
 * `CatalogService` (Tarefa 4/5), só que aqui, sem service layer, a anotação
 * fica no próprio controller.
 */
@RestController
@RequestMapping("/api/v1/setup")
public class SetupController {

    private final UsuarioRepository usuarios;
    private final PasswordEncoder encoder;
    private final SessionAuthenticator sessionAuthenticator;

    public SetupController(UsuarioRepository usuarios, PasswordEncoder encoder,
                           SessionAuthenticator sessionAuthenticator) {
        this.usuarios = usuarios;
        this.encoder = encoder;
        this.sessionAuthenticator = sessionAuthenticator;
    }

    @GetMapping("/status")
    public SetupStatusResponse status() {
        return new SetupStatusResponse(usuarios.count() > 0);
    }

    @PostMapping
    @Transactional
    public ResponseEntity<AuthResponse> setup(@Valid @RequestBody SetupRequest req,
                                              HttpServletRequest request, HttpServletResponse response) {
        if (usuarios.count() > 0) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
        Usuario gestor = usuarios.saveAndFlush(
                new Usuario(null, req.username(), encoder.encode(req.password())));
        sessionAuthenticator.autenticar(new GestorAuthentication(gestor.getUsername()), request, response);
        return ResponseEntity.ok(AuthResponse.gestor(gestor.getUsername()));
    }
}
```

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=AuthControllerApiTest,SetupApiTest`
Expected: PASS — em particular, `loginComCredencialCorretaESessaoSobreviveAProximaRequisicao` prova a persistência entre requisições. Se `SecurityConfig` e `SessionAuthenticator` não estiverem usando o mesmo bean de `SecurityContextRepository`, este teste falha especificamente na segunda chamada (`/auth/me` responde 401 mesmo após login bem-sucedido) — é o sintoma de bean divergente descrito no Step 5.

- [ ] **Step 8: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS — nada existente foi restringido ainda, `/auth/*` e `POST /setup` são aditivos; `AuthTestSupport.loginGestorBootstrap` (auto-provisionante desde este step) passa a valer para toda classe que já o chamava

- [ ] **Step 9: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/security/GestorAuthentication.java \
        src/main/java/com/dev4/cypher/security/OperadorAuthentication.java \
        src/main/java/com/dev4/cypher/security/SessionAuthenticator.java \
        src/main/java/com/dev4/cypher/dto/LoginRequest.java \
        src/main/java/com/dev4/cypher/dto/LoginEstacaoRequest.java \
        src/main/java/com/dev4/cypher/dto/AuthResponse.java \
        src/main/java/com/dev4/cypher/dto/SetupRequest.java \
        src/main/java/com/dev4/cypher/controller/AuthController.java \
        src/main/java/com/dev4/cypher/controller/SetupController.java \
        src/main/java/com/dev4/cypher/config/SecurityConfig.java \
        src/main/resources/application.yaml \
        src/test/java/com/dev4/cypher/security/AuthTestSupport.java \
        src/test/java/com/dev4/cypher/AuthControllerApiTest.java \
        src/test/java/com/dev4/cypher/SetupApiTest.java
git commit -m "feat(security): adiciona login/logout/me por sessao e POST /api/v1/setup"
```

---

### Task 8: Filtro `X-Cypher-Key` em modo permissivo (`ROLE_PIPELINE`)

**Files:**
- Create: `src/main/java/com/dev4/cypher/security/PipelineAuthentication.java`
- Create: `src/main/java/com/dev4/cypher/security/CypherKeyAuthenticationFilter.java`
- Modify: `src/main/java/com/dev4/cypher/config/SecurityConfig.java` — registra o filtro na cadeia
- Test: `src/test/java/com/dev4/cypher/security/CypherKeyAuthenticationFilterTest.java`

**Interfaces:**
- Consumes: `Camera.apiKey`/`CameraRepository.findByApiKey` (Tarefa 6)
- Produces: `PipelineAuthentication(String cameraId)` (`ROLE_PIPELINE`), `CypherKeyAuthenticationFilter.HEADER = "X-Cypher-Key"` — a Tarefa 13 modifica esta classe para rejeitar ausência/invalidade nos endpoints de ingestão; a Tarefa 12 usa `hasAnyRole("PIPELINE", "GESTOR")` em `/cameras/{id}/config`

- [ ] **Step 1: Escrever o teste do filtro que falha**

Criar `src/test/java/com/dev4/cypher/security/CypherKeyAuthenticationFilterTest.java`:

```java
package com.dev4.cypher.security;

import com.dev4.cypher.model.Camera;
import com.dev4.cypher.repository.CameraRepository;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * `OncePerRequestFilter` pode ser exercitado direto, sem servlet container:
 * `MockHttpServletRequest`/`MockHttpServletResponse` (do próprio Spring) e um
 * `FilterChain` de uma linha bastam — nenhum framework de mock envolvido.
 */
@DataJpaTest
class CypherKeyAuthenticationFilterTest {

    @Autowired
    private CameraRepository cameras;

    @BeforeEach
    void limparContexto() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void chaveValidaAutenticaComoRolePipeline() throws Exception {
        cameras.saveAndFlush(new Camera("CAM-80", "Frontal", "EST-80",
                "http://127.0.0.1:8180/stream", "rtsp://x", true, "chave-valida"));
        CypherKeyAuthenticationFilter filtro = new CypherKeyAuthenticationFilter(cameras);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(CypherKeyAuthenticationFilter.HEADER, "chave-valida");
        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean[] proximoFiltroChamado = {false};
        FilterChain chain = (req, res) -> proximoFiltroChamado[0] = true;

        filtro.doFilter(request, response, chain);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isInstanceOf(PipelineAuthentication.class);
        assertThat(((PipelineAuthentication) auth).getCameraId()).isEqualTo("CAM-80");
        assertThat(auth.getAuthorities()).extracting(Object::toString).containsExactly("ROLE_PIPELINE");
        assertThat(proximoFiltroChamado[0]).isTrue();
    }

    @Test
    void chaveAusenteSeguePermissivoSemAutenticar() throws Exception {
        CypherKeyAuthenticationFilter filtro = new CypherKeyAuthenticationFilter(cameras);
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean[] proximoFiltroChamado = {false};
        FilterChain chain = (req, res) -> proximoFiltroChamado[0] = true;

        filtro.doFilter(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(proximoFiltroChamado[0]).isTrue();
    }

    @Test
    void chaveInvalidaSeguePermissivoSemAutenticar() throws Exception {
        CypherKeyAuthenticationFilter filtro = new CypherKeyAuthenticationFilter(cameras);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(CypherKeyAuthenticationFilter.HEADER, "chave-que-nao-existe");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> { };

        filtro.doFilter(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CypherKeyAuthenticationFilterTest`
Expected: FAIL — `PipelineAuthentication` e `CypherKeyAuthenticationFilter` não existem

- [ ] **Step 3: Implementar `PipelineAuthentication` e o filtro**

Criar `src/main/java/com/dev4/cypher/security/PipelineAuthentication.java`:

```java
package com.dev4.cypher.security;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;

/** Autenticação sem sessão do pipeline, via X-Cypher-Key validado contra Camera.apiKey (spec E4 §2.3). */
public class PipelineAuthentication extends AbstractAuthenticationToken {

    private final String cameraId;

    public PipelineAuthentication(String cameraId) {
        super(List.of(new SimpleGrantedAuthority("ROLE_PIPELINE")));
        this.cameraId = cameraId;
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
}
```

Criar `src/main/java/com/dev4/cypher/security/CypherKeyAuthenticationFilter.java`:

```java
package com.dev4.cypher.security;

import com.dev4.cypher.model.Camera;
import com.dev4.cypher.repository.CameraRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;

/**
 * Autentica ROLE_PIPELINE a partir do header X-Cypher-Key, validado contra
 * Camera.apiKey (spec E4 §2.3). Nesta tarefa o modo é permissivo: header
 * ausente ou que não bate com nenhuma câmera não rejeita nada, a requisição
 * segue sem autenticação de pipeline — a Tarefa 13 (sempre a última do
 * plano) é quem torna o header obrigatório, e só nos endpoints de ingestão.
 *
 * <p>Nunca toca HttpSession — diferente do login por sessão (GESTOR/OPERADOR
 * via {@code AuthController}), uma requisição de pipeline não carrega
 * cookie, e autenticar aqui não cria nem depende de sessão HTTP.
 *
 * <p>Registrado com {@code addFilterAfter(..., SecurityContextHolderFilter.class)}
 * (Step 4): roda tecnicamente depois do filtro que restaura o contexto a
 * partir da sessão, mas nunca lê a sessão e só sobrescreve o
 * {@code Authentication} quando a chave é válida — é "independente da
 * sessão", o espírito de "antes do filtro de sessão" da spec (E4 §2.3): a
 * autenticação por chave nunca depende do que a sessão carregava.
 */
public class CypherKeyAuthenticationFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Cypher-Key";

    private final CameraRepository cameras;

    public CypherKeyAuthenticationFilter(CameraRepository cameras) {
        this.cameras = cameras;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {
        String chave = request.getHeader(HEADER);
        if (chave != null) {
            Optional<Camera> camera = cameras.findByApiKey(chave);
            camera.ifPresent(c ->
                    SecurityContextHolder.getContext().setAuthentication(new PipelineAuthentication(c.getId())));
        }
        filterChain.doFilter(request, response);
    }
}
```

- [ ] **Step 4: Registrar o filtro em `SecurityConfig`**

Em `src/main/java/com/dev4/cypher/config/SecurityConfig.java`, importar `com.dev4.cypher.repository.CameraRepository`, `com.dev4.cypher.security.CypherKeyAuthenticationFilter` e `org.springframework.security.web.context.SecurityContextHolderFilter`, e trocar a assinatura e o corpo de `filterChain`:

```java
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           SecurityContextRepository securityContextRepository,
                                           CameraRepository cameras) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .securityContext(ctx -> ctx.securityContextRepository(securityContextRepository))
                .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
                .addFilterAfter(new CypherKeyAuthenticationFilter(cameras), SecurityContextHolderFilter.class)
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CypherKeyAuthenticationFilterTest`
Expected: PASS

- [ ] **Step 6: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS — a cadeia continua `permitAll`, o filtro só passa a existir; nenhum endpoint muda de comportamento observável ainda

- [ ] **Step 7: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/security/PipelineAuthentication.java \
        src/main/java/com/dev4/cypher/security/CypherKeyAuthenticationFilter.java \
        src/main/java/com/dev4/cypher/config/SecurityConfig.java \
        src/test/java/com/dev4/cypher/security/CypherKeyAuthenticationFilterTest.java
git commit -m "feat(security): adiciona filtro X-Cypher-Key em modo permissivo (ROLE_PIPELINE)"
```

---

### Task 9: `EquipeService` + `TeamController` (`/api/v1/teams`)

**Files:**
- Create: `src/main/java/com/dev4/cypher/dto/TeamRequest.java`
- Create: `src/main/java/com/dev4/cypher/dto/TeamResponse.java`
- Create: `src/main/java/com/dev4/cypher/service/EquipeService.java`
- Create: `src/main/java/com/dev4/cypher/controller/TeamController.java`
- Test: `src/test/java/com/dev4/cypher/service/EquipeServiceTest.java`
- Test: `src/test/java/com/dev4/cypher/TeamControllerApiTest.java`

**Interfaces:**
- Consumes: `Equipe`/`Turno`/`EquipeRepository` (Tarefa 3), `EstacaoRepository` (existente), `AuthTestSupport.loginGestorBootstrap` (Tarefa 7, só no teste de API)
- Produces: `TeamRequest(String id, String nome, Turno turno, List<String> estacaoIds, Boolean ativa)`, `TeamResponse(String id, String nome, Turno turno, List<String> estacaoIds, boolean ativa)` — sem outro consumidor nesta entrega além do próprio controller

Erros de negócio (código duplicado, estação inexistente, conflito de `(estacaoId, turno)`, tentativa de renomear o código) reaproveitam `com.dev4.cypher.catalog.CatalogValidationException`, já capturada por `CatalogExceptionHandler` (`@RestControllerAdvice` sem escopo de pacote) — mesmo padrão de `CatalogService`.

**Nota sobre os testes de API desta tarefa:** mesmo a cadeia de segurança ainda estando `permitAll` (o lockdown é a Tarefa 12), os testes abaixo já autenticam como GESTOR via `AuthTestSupport.loginGestorBootstrap` — evita que a Tarefa 12 precise voltar a este arquivo só para acrescentar sessão.

- [ ] **Step 1: Escrever o teste de serviço que falha**

Criar `src/test/java/com/dev4/cypher/service/EquipeServiceTest.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.catalog.CatalogValidationException;
import com.dev4.cypher.dto.TeamRequest;
import com.dev4.cypher.dto.TeamResponse;
import com.dev4.cypher.model.Estacao;
import com.dev4.cypher.model.Turno;
import com.dev4.cypher.repository.EquipeRepository;
import com.dev4.cypher.repository.EstacaoRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
class EquipeServiceTest {

    @Autowired
    private EquipeRepository equipes;

    @Autowired
    private EstacaoRepository estacoes;

    private EquipeService service;

    @BeforeEach
    void setUp() {
        service = new EquipeService(equipes, estacoes);
        estacoes.save(new Estacao("EST-01", "Esteira", "montagem", true, "tok-EST-01"));
        estacoes.saveAndFlush(new Estacao("EST-02", "Prensa", "estamparia", true, "tok-EST-02"));
    }

    private TeamRequest equipeA() {
        return new TeamRequest("EQ-01", "Equipe A", Turno.MANHA, List.of("EST-01"), null);
    }

    @Test
    void cadastraEquipeAtivaPorDefault() {
        TeamResponse criada = service.criar(equipeA());

        assertThat(criada.id()).isEqualTo("EQ-01");
        assertThat(criada.turno()).isEqualTo(Turno.MANHA);
        assertThat(criada.estacaoIds()).containsExactly("EST-01");
        assertThat(criada.ativa()).isTrue();
    }

    @Test
    void recusaCodigoDuplicado() {
        service.criar(equipeA());

        assertThatThrownBy(() -> service.criar(equipeA()))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void recusaEstacaoInexistente() {
        assertThatThrownBy(() -> service.criar(
                new TeamRequest("EQ-01", "Equipe A", Turno.MANHA, List.of("EST-99"), null)))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
    }

    @Test
    void recusaConflitoDeEstacaoNoMesmoTurno() {
        service.criar(equipeA());

        assertThatThrownBy(() -> service.criar(
                new TeamRequest("EQ-02", "Equipe B", Turno.MANHA, List.of("EST-01"), null)))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void permiteMesmaEstacaoEmTurnosDiferentes() {
        service.criar(equipeA());

        TeamResponse tarde = service.criar(
                new TeamRequest("EQ-02", "Equipe B", Turno.TARDE, List.of("EST-01"), null));

        assertThat(tarde.turno()).isEqualTo(Turno.TARDE);
    }

    @Test
    void editaNomeEEstacoes() {
        service.criar(equipeA());

        Optional<TeamResponse> editada = service.atualizar("EQ-01",
                new TeamRequest("EQ-01", "Equipe A e B", Turno.MANHA, List.of("EST-01", "EST-02"), null));

        assertThat(editada).isPresent();
        assertThat(editada.get().nome()).isEqualTo("Equipe A e B");
        assertThat(editada.get().estacaoIds()).containsExactlyInAnyOrder("EST-01", "EST-02");
    }

    @Test
    void recusaRenomearOCodigo() {
        service.criar(equipeA());

        assertThatThrownBy(() -> service.atualizar("EQ-01",
                new TeamRequest("EQ-99", "Equipe A", Turno.MANHA, List.of("EST-01"), null)))
                .isInstanceOf(CatalogValidationException.class);
    }

    @Test
    void editarInexistenteDevolveVazio() {
        assertThat(service.atualizar("EQ-99",
                new TeamRequest("EQ-99", "X", Turno.MANHA, List.of("EST-01"), null))).isEmpty();
    }

    @Test
    void removeEquipe() {
        service.criar(equipeA());

        assertThat(service.remover("EQ-01")).isTrue();
        assertThat(equipes.findById("EQ-01")).isEmpty();
    }

    @Test
    void removerInexistenteDevolveFalso() {
        assertThat(service.remover("EQ-99")).isFalse();
    }

    @Test
    void listaTodasAsEquipes() {
        service.criar(equipeA());
        service.criar(new TeamRequest("EQ-02", "Equipe B", Turno.TARDE, List.of("EST-02"), null));

        assertThat(service.listar()).extracting(TeamResponse::id)
                .containsExactlyInAnyOrder("EQ-01", "EQ-02");
    }
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=EquipeServiceTest`
Expected: FAIL — `TeamRequest`, `TeamResponse` e `EquipeService` não existem

- [ ] **Step 3: Implementar os DTOs e o serviço**

Criar `src/main/java/com/dev4/cypher/dto/TeamRequest.java`:

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.catalog.CatalogCodes;
import com.dev4.cypher.model.Turno;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public record TeamRequest(

        @NotBlank
        @Pattern(regexp = CatalogCodes.PADRAO, message = "codigo deve ser MAIUSCULAS-ALFANUM, ex.: EQ-01")
        String id,

        @NotBlank @Size(max = 120) String nome,
        @NotNull Turno turno,
        @NotEmpty List<@NotBlank String> estacaoIds,
        Boolean ativa
) {
}
```

Criar `src/main/java/com/dev4/cypher/dto/TeamResponse.java`:

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.model.Turno;

import java.util.List;

public record TeamResponse(String id, String nome, Turno turno, List<String> estacaoIds, boolean ativa) {
}
```

Criar `src/main/java/com/dev4/cypher/service/EquipeService.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.catalog.CatalogValidationException;
import com.dev4.cypher.dto.TeamRequest;
import com.dev4.cypher.dto.TeamResponse;
import com.dev4.cypher.model.Equipe;
import com.dev4.cypher.model.Turno;
import com.dev4.cypher.repository.EquipeRepository;
import com.dev4.cypher.repository.EstacaoRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** CRUD de equipe e alocação de estações/turno (spec E4 §3). */
@Service
public class EquipeService {

    private final EquipeRepository equipes;
    private final EstacaoRepository estacoes;

    public EquipeService(EquipeRepository equipes, EstacaoRepository estacoes) {
        this.equipes = equipes;
        this.estacoes = estacoes;
    }

    @Transactional(readOnly = true)
    public List<TeamResponse> listar() {
        return equipes.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional
    public TeamResponse criar(TeamRequest req) {
        if (equipes.existsById(req.id())) {
            throw new CatalogValidationException(HttpStatus.CONFLICT, "Equipe ja cadastrada: " + req.id());
        }
        exigirEstacoesExistentes(req.estacaoIds());
        exigirSemConflito(req.estacaoIds(), req.turno(), null);
        Equipe nova = new Equipe(req.id(), req.nome(), req.turno(), List.copyOf(req.estacaoIds()),
                req.ativa() == null || req.ativa());
        return toResponse(equipes.saveAndFlush(nova));
    }

    @Transactional
    public Optional<TeamResponse> atualizar(String id, TeamRequest req) {
        exigirMesmoCodigo(id, req.id());
        return equipes.findById(id).map(equipe -> {
            exigirEstacoesExistentes(req.estacaoIds());
            exigirSemConflito(req.estacaoIds(), req.turno(), id);
            equipe.setNome(req.nome());
            equipe.setTurno(req.turno());
            equipe.setEstacaoIds(List.copyOf(req.estacaoIds()));
            if (req.ativa() != null) {
                equipe.setAtiva(req.ativa());
            }
            return toResponse(equipes.saveAndFlush(equipe));
        });
    }

    @Transactional
    public boolean remover(String id) {
        if (!equipes.existsById(id)) {
            return false;
        }
        equipes.deleteById(id);
        return true;
    }

    private void exigirEstacoesExistentes(List<String> estacaoIds) {
        for (String estacaoId : estacaoIds) {
            if (!estacoes.existsById(estacaoId)) {
                throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Estacao inexistente: " + estacaoId);
            }
        }
    }

    /** (estacaoId, turno) e unico a nivel de aplicacao (spec E4 §3) — nunca constraint de banco. */
    private void exigirSemConflito(List<String> estacaoIds, Turno turno, String idPropria) {
        equipes.findByTurno(turno).stream()
                .filter(outra -> !outra.getId().equals(idPropria))
                .forEach(outra -> {
                    for (String estacaoId : estacaoIds) {
                        if (outra.getEstacaoIds().contains(estacaoId)) {
                            throw new CatalogValidationException(HttpStatus.CONFLICT,
                                    "Estacao %s ja coberta pela equipe %s no turno %s"
                                            .formatted(estacaoId, outra.getId(), turno));
                        }
                    }
                });
    }

    private void exigirMesmoCodigo(String naUrl, String noCorpo) {
        if (noCorpo != null && !noCorpo.equals(naUrl)) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "O codigo de equipe e imutavel: %s nao pode virar %s".formatted(naUrl, noCorpo));
        }
    }

    private TeamResponse toResponse(Equipe e) {
        return new TeamResponse(e.getId(), e.getNome(), e.getTurno(), e.getEstacaoIds(), e.isAtiva());
    }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=EquipeServiceTest`
Expected: PASS

- [ ] **Step 5: Escrever o teste de API que falha**

Criar `src/test/java/com/dev4/cypher/TeamControllerApiTest.java`:

```java
package com.dev4.cypher;

import com.dev4.cypher.repository.EquipeRepository;
import com.dev4.cypher.repository.EstacaoRepository;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static com.dev4.cypher.security.AuthTestSupport.loginGestorBootstrap;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@Transactional
@AutoConfigureMockMvc
class TeamControllerApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private EquipeRepository equipes;

    @Autowired
    private EstacaoRepository estacoes;

    private MockHttpSession gestor;

    private static final String EQUIPE = """
            {"id": "EQ-77", "nome": "Equipe A", "turno": "MANHA", "estacaoIds": ["EST-77"]}
            """;

    @BeforeEach
    void setUp() throws Exception {
        equipes.deleteAll();
        estacoes.deleteAll();
        gestor = loginGestorBootstrap(mvc);
        mvc.perform(post("/api/v1/stations").session(gestor)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"EST-77\", \"nome\": \"Esteira\", \"setor\": \"montagem\"}"));
    }

    @Test
    void cadastraEquipeEDevolve201() throws Exception {
        mvc.perform(post("/api/v1/teams").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON).content(EQUIPE))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("EQ-77"))
                .andExpect(jsonPath("$.turno").value("MANHA"))
                .andExpect(jsonPath("$.ativa").value(true));
    }

    @Test
    void codigoDuplicadoDevolve409() throws Exception {
        mvc.perform(post("/api/v1/teams").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(EQUIPE));

        mvc.perform(post("/api/v1/teams").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON).content(EQUIPE))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.erro").value(Matchers.containsString("EQ-77")));
    }

    @Test
    void listaEquipes() throws Exception {
        mvc.perform(post("/api/v1/teams").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(EQUIPE));

        mvc.perform(get("/api/v1/teams").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("EQ-77"));
    }

    @Test
    void editaEquipe() throws Exception {
        mvc.perform(post("/api/v1/teams").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(EQUIPE));

        mvc.perform(put("/api/v1/teams/EQ-77").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\": \"EQ-77\", \"nome\": \"Equipe A - renomeada\", "
                                + "\"turno\": \"MANHA\", \"estacaoIds\": [\"EST-77\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nome").value("Equipe A - renomeada"));
    }

    @Test
    void editarInexistenteDevolve404() throws Exception {
        mvc.perform(put("/api/v1/teams/EQ-99").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON).content(
                                "{\"id\": \"EQ-99\", \"nome\": \"X\", \"turno\": \"MANHA\", \"estacaoIds\": [\"EST-77\"]}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void removeEquipeEDevolve204() throws Exception {
        mvc.perform(post("/api/v1/teams").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(EQUIPE));

        mvc.perform(delete("/api/v1/teams/EQ-77").session(gestor)).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/teams").session(gestor))
                .andExpect(jsonPath("$[?(@.id=='EQ-77')]").isEmpty());
    }

    @Test
    void removerInexistenteDevolve404() throws Exception {
        mvc.perform(delete("/api/v1/teams/EQ-99").session(gestor)).andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=TeamControllerApiTest`
Expected: FAIL — `TeamController` não existe

- [ ] **Step 7: Implementar `TeamController`**

Criar `src/main/java/com/dev4/cypher/controller/TeamController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.TeamRequest;
import com.dev4.cypher.dto.TeamResponse;
import com.dev4.cypher.service.EquipeService;
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

/** CRUD de equipe — GESTOR-only (spec E4 §2.6/§3), travado pela Tarefa 12. */
@RestController
@RequestMapping("/api/v1/teams")
public class TeamController {

    private final EquipeService service;

    public TeamController(EquipeService service) {
        this.service = service;
    }

    @GetMapping
    public List<TeamResponse> list() {
        return service.listar();
    }

    @PostMapping
    public ResponseEntity<TeamResponse> create(@Valid @RequestBody TeamRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.criar(req));
    }

    @PutMapping("/{id}")
    public ResponseEntity<TeamResponse> update(@PathVariable String id, @Valid @RequestBody TeamRequest req) {
        return service.atualizar(id, req)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        return service.remover(id)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=TeamControllerApiTest`
Expected: PASS

- [ ] **Step 9: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS

- [ ] **Step 10: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/dto/TeamRequest.java \
        src/main/java/com/dev4/cypher/dto/TeamResponse.java \
        src/main/java/com/dev4/cypher/service/EquipeService.java \
        src/main/java/com/dev4/cypher/controller/TeamController.java \
        src/test/java/com/dev4/cypher/service/EquipeServiceTest.java \
        src/test/java/com/dev4/cypher/TeamControllerApiTest.java
git commit -m "feat(security): adiciona EquipeService e TeamController (/api/v1/teams)"
```

---

### Task 10: `UsuarioService` + `UserController` (`/api/v1/users`)

**Files:**
- Create: `src/main/java/com/dev4/cypher/dto/UserRequest.java`
- Create: `src/main/java/com/dev4/cypher/dto/UsuarioResponse.java`
- Create: `src/main/java/com/dev4/cypher/service/UsuarioService.java`
- Create: `src/main/java/com/dev4/cypher/controller/UserController.java`
- Test: `src/test/java/com/dev4/cypher/service/UsuarioServiceTest.java`
- Test: `src/test/java/com/dev4/cypher/UserControllerApiTest.java`

**Interfaces:**
- Consumes: `Usuario`/`UsuarioRepository` (Tarefa 2), bean `PasswordEncoder` (Tarefa 1), `AuthTestSupport.loginGestorBootstrap` (Tarefa 7, só no teste de API)
- Produces: `UserRequest(String username, String papel, String password)` — `password` obrigatória no cadastro, ausente ou vazia em uma edição que não redefine senha (espelha `StationRequest.ativa == null` "não mexer"); `UsuarioResponse(Long id, String username, String papel)` com `papel` sempre `"GESTOR"` (Global Constraints). Contrato fixado pelo plano irmão do front (`e4c-front-acesso-equipes.md`, Global Constraints): `UsuarioPayload = { username, papel, password? }`.

`OPERADOR` nunca é um `Usuario` (Global Constraints) — o serviço rejeita `papel != "GESTOR"` com `CatalogValidationException` 422. Diferente de `Estacao`/`Camera` (soft delete via `ativa`), `Usuario` não tem esse campo: `DELETE` aqui é definitivo — a spec não pede desativação de usuário, só CRUD (spec E4 §2.5/§4.2).

- [ ] **Step 1: Escrever o teste de serviço que falha**

Criar `src/test/java/com/dev4/cypher/service/UsuarioServiceTest.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.catalog.CatalogValidationException;
import com.dev4.cypher.dto.UserRequest;
import com.dev4.cypher.dto.UsuarioResponse;
import com.dev4.cypher.repository.UsuarioRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
class UsuarioServiceTest {

    @Autowired
    private UsuarioRepository usuarios;

    private final PasswordEncoder encoder = new BCryptPasswordEncoder();

    private UsuarioService service;

    @BeforeEach
    void setUp() {
        service = new UsuarioService(usuarios, encoder);
    }

    private UserRequest gestor2() {
        return new UserRequest("gestor2", "GESTOR", "senha123");
    }

    @Test
    void cadastraUsuarioComSenhaHasheada() {
        UsuarioResponse criado = service.criar(gestor2());

        assertThat(criado.username()).isEqualTo("gestor2");
        assertThat(criado.papel()).isEqualTo("GESTOR");
        String hash = usuarios.findByUsername("gestor2").orElseThrow().getPasswordHash();
        assertThat(hash).isNotEqualTo("senha123");
        assertThat(encoder.matches("senha123", hash)).isTrue();
    }

    @Test
    void recusaPapelDiferenteDeGestor() {
        assertThatThrownBy(() -> service.criar(new UserRequest("op1", "OPERADOR", "senha123")))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
    }

    @Test
    void recusaUsernameDuplicado() {
        service.criar(gestor2());

        assertThatThrownBy(() -> service.criar(gestor2()))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void recusaCadastroSemSenha() {
        assertThatThrownBy(() -> service.criar(new UserRequest("gestor2", "GESTOR", null)))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void editaUsernameSemRedefinirSenha() {
        UsuarioResponse criado = service.criar(gestor2());
        String hashOriginal = usuarios.findById(criado.id()).orElseThrow().getPasswordHash();

        Optional<UsuarioResponse> editado = service.atualizar(criado.id(),
                new UserRequest("gestor2-renomeado", "GESTOR", null));

        assertThat(editado).isPresent();
        assertThat(editado.get().username()).isEqualTo("gestor2-renomeado");
        assertThat(usuarios.findById(criado.id()).orElseThrow().getPasswordHash()).isEqualTo(hashOriginal);
    }

    @Test
    void editaRedefinindoSenha() {
        UsuarioResponse criado = service.criar(gestor2());
        String hashOriginal = usuarios.findById(criado.id()).orElseThrow().getPasswordHash();

        service.atualizar(criado.id(), new UserRequest("gestor2", "GESTOR", "novaSenha456"));

        String hashNovo = usuarios.findById(criado.id()).orElseThrow().getPasswordHash();
        assertThat(hashNovo).isNotEqualTo(hashOriginal);
        assertThat(encoder.matches("novaSenha456", hashNovo)).isTrue();
    }

    @Test
    void editarInexistenteDevolveVazio() {
        assertThat(service.atualizar(999L, new UserRequest("x", "GESTOR", null))).isEmpty();
    }

    @Test
    void removeUsuario() {
        UsuarioResponse criado = service.criar(gestor2());

        assertThat(service.remover(criado.id())).isTrue();
        assertThat(usuarios.findById(criado.id())).isEmpty();
    }

    @Test
    void removerInexistenteDevolveFalso() {
        assertThat(service.remover(999L)).isFalse();
    }
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=UsuarioServiceTest`
Expected: FAIL — `UserRequest`, `UsuarioResponse` e `UsuarioService` não existem

- [ ] **Step 3: Implementar os DTOs e o serviço**

Criar `src/main/java/com/dev4/cypher/dto/UserRequest.java`:

```java
package com.dev4.cypher.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * `password` é `String` simples (não `@NotBlank`): obrigatória no cadastro,
 * ausente ou vazia numa edição que não redefine senha — validado em
 * `UsuarioService`, não por anotação, porque o mesmo DTO serve às duas
 * operações (mesmo padrão de `StationRequest.ativa`).
 */
public record UserRequest(
        @NotBlank @Size(max = 60) String username,
        @NotBlank String papel,
        String password
) {
}
```

Criar `src/main/java/com/dev4/cypher/dto/UsuarioResponse.java`:

```java
package com.dev4.cypher.dto;

/** `papel` sempre `"GESTOR"` — é o único papel que `Usuario` representa (spec E4 §2.5). */
public record UsuarioResponse(Long id, String username, String papel) {
}
```

Criar `src/main/java/com/dev4/cypher/service/UsuarioService.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.catalog.CatalogValidationException;
import com.dev4.cypher.dto.UserRequest;
import com.dev4.cypher.dto.UsuarioResponse;
import com.dev4.cypher.model.Usuario;
import com.dev4.cypher.repository.UsuarioRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** CRUD de usuário (sempre GESTOR — spec E4 §2.5). */
@Service
public class UsuarioService {

    private final UsuarioRepository usuarios;
    private final PasswordEncoder encoder;

    public UsuarioService(UsuarioRepository usuarios, PasswordEncoder encoder) {
        this.usuarios = usuarios;
        this.encoder = encoder;
    }

    @Transactional(readOnly = true)
    public List<UsuarioResponse> listar() {
        return usuarios.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional
    public UsuarioResponse criar(UserRequest req) {
        exigirPapelGestor(req.papel());
        if (usuarios.existsByUsername(req.username())) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "Usuario ja cadastrado: " + req.username());
        }
        if (req.password() == null || req.password().isBlank()) {
            throw new CatalogValidationException(HttpStatus.BAD_REQUEST,
                    "password e obrigatoria no cadastro");
        }
        Usuario novo = new Usuario(null, req.username(), encoder.encode(req.password()));
        return toResponse(usuarios.saveAndFlush(novo));
    }

    @Transactional
    public Optional<UsuarioResponse> atualizar(Long id, UserRequest req) {
        exigirPapelGestor(req.papel());
        return usuarios.findById(id).map(usuario -> {
            if (!usuario.getUsername().equals(req.username()) && usuarios.existsByUsername(req.username())) {
                throw new CatalogValidationException(HttpStatus.CONFLICT,
                        "Usuario ja cadastrado: " + req.username());
            }
            usuario.setUsername(req.username());
            // password ausente/vazia = nao redefinir (mesmo padrao de StationRequest.ativa == null).
            if (req.password() != null && !req.password().isBlank()) {
                usuario.setPasswordHash(encoder.encode(req.password()));
            }
            return toResponse(usuarios.saveAndFlush(usuario));
        });
    }

    @Transactional
    public boolean remover(Long id) {
        if (!usuarios.existsById(id)) {
            return false;
        }
        usuarios.deleteById(id);
        return true;
    }

    private void exigirPapelGestor(String papel) {
        if (!"GESTOR".equals(papel)) {
            throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "papel deve ser GESTOR: " + papel);
        }
    }

    private UsuarioResponse toResponse(Usuario u) {
        return new UsuarioResponse(u.getId(), u.getUsername(), "GESTOR");
    }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=UsuarioServiceTest`
Expected: PASS

- [ ] **Step 5: Escrever o teste de API que falha**

Criar `src/test/java/com/dev4/cypher/UserControllerApiTest.java`:

```java
package com.dev4.cypher;

import com.dev4.cypher.repository.UsuarioRepository;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static com.dev4.cypher.security.AuthTestSupport.loginGestorBootstrap;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@Transactional
@AutoConfigureMockMvc
class UserControllerApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private UsuarioRepository usuarios;

    private MockHttpSession gestor;

    private static final String USUARIO = """
            {"username": "gestor2", "papel": "GESTOR", "password": "senha123"}
            """;

    @BeforeEach
    void setUp() throws Exception {
        gestor = loginGestorBootstrap(mvc);
        usuarios.findByUsername("gestor2").ifPresent(u -> usuarios.deleteById(u.getId()));
    }

    @Test
    void cadastraUsuarioEDevolve201SemExporSenha() throws Exception {
        mvc.perform(post("/api/v1/users").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON).content(USUARIO))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("gestor2"))
                .andExpect(jsonPath("$.papel").value("GESTOR"))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void papelOperadorDevolve422() throws Exception {
        mvc.perform(post("/api/v1/users").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"op1\", \"papel\": \"OPERADOR\", \"password\": \"x\"}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void usernameDuplicadoDevolve409() throws Exception {
        mvc.perform(post("/api/v1/users").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(USUARIO));

        mvc.perform(post("/api/v1/users").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON).content(USUARIO))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.erro").value(Matchers.containsString("gestor2")));
    }

    @Test
    void listaUsuarios() throws Exception {
        mvc.perform(post("/api/v1/users").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(USUARIO));

        mvc.perform(get("/api/v1/users").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.username=='gestor2')]").isNotEmpty());
    }

    @Test
    void editaUsernameSemInformarSenha() throws Exception {
        String criado = mvc.perform(post("/api/v1/users").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON).content(USUARIO))
                .andReturn().getResponse().getContentAsString();
        Long id = com.jayway.jsonpath.JsonPath.read(criado, "$.id");

        mvc.perform(put("/api/v1/users/{id}", id).session(gestor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"gestor2-renomeado\", \"papel\": \"GESTOR\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("gestor2-renomeado"));
    }

    @Test
    void removeUsuarioEDevolve204() throws Exception {
        String criado = mvc.perform(post("/api/v1/users").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON).content(USUARIO))
                .andReturn().getResponse().getContentAsString();
        Long id = com.jayway.jsonpath.JsonPath.read(criado, "$.id");

        mvc.perform(delete("/api/v1/users/{id}", id).session(gestor)).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/users").session(gestor))
                .andExpect(jsonPath("$[?(@.id==" + id + ")]").isEmpty());
    }

    @Test
    void removerInexistenteDevolve404() throws Exception {
        mvc.perform(delete("/api/v1/users/999999").session(gestor)).andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=UserControllerApiTest`
Expected: FAIL — `UserController` não existe

- [ ] **Step 7: Implementar `UserController`**

Criar `src/main/java/com/dev4/cypher/controller/UserController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.UserRequest;
import com.dev4.cypher.dto.UsuarioResponse;
import com.dev4.cypher.service.UsuarioService;
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

/** CRUD de usuário (sempre GESTOR) — GESTOR-only (spec E4 §2.6), travado pela Tarefa 12. */
@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UsuarioService service;

    public UserController(UsuarioService service) {
        this.service = service;
    }

    @GetMapping
    public List<UsuarioResponse> list() {
        return service.listar();
    }

    @PostMapping
    public ResponseEntity<UsuarioResponse> create(@Valid @RequestBody UserRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.criar(req));
    }

    @PutMapping("/{id}")
    public ResponseEntity<UsuarioResponse> update(@PathVariable Long id, @Valid @RequestBody UserRequest req) {
        return service.atualizar(id, req)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        return service.remover(id)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=UserControllerApiTest`
Expected: PASS

- [ ] **Step 9: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS

- [ ] **Step 10: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/dto/UserRequest.java \
        src/main/java/com/dev4/cypher/dto/UsuarioResponse.java \
        src/main/java/com/dev4/cypher/service/UsuarioService.java \
        src/main/java/com/dev4/cypher/controller/UserController.java \
        src/test/java/com/dev4/cypher/service/UsuarioServiceTest.java \
        src/test/java/com/dev4/cypher/UserControllerApiTest.java
git commit -m "feat(security): adiciona UsuarioService e UserController (/api/v1/users)"
```

---

### Task 11: OPERADOR restrito à própria `estacaoId` em incidentes

**Files:**
- Modify: `src/main/java/com/dev4/cypher/repository/AlertaRepository.java` — `buscar` ganha filtro por `estacaoId` (subconsulta sobre `Camera`)
- Modify: `src/main/java/com/dev4/cypher/service/IncidentService.java` — `search` repassa o novo parâmetro
- Modify: `src/main/java/com/dev4/cypher/controller/IncidentController.java` — resolve a `estacaoId` da sessão, filtra a lista, 403 em `byId`/`changeStatus`/`stream` fora do escopo
- Modify: `src/main/java/com/dev4/cypher/sse/IncidentSseService.java` — assinatura com escopo opcional (`estacaoId` nulo = sem filtro)
- Modify: `src/test/java/com/dev4/cypher/sse/IncidentSseServiceTest.java` — passa a usar `@DataJpaTest` com `CameraRepository` real
- Test: `src/test/java/com/dev4/cypher/IncidentOperatorScopeApiTest.java`

**Interfaces:**
- Consumes: `OperadorAuthentication` (Tarefa 7), `CameraRepository` (existente)
- Produces: `AlertaRepository.buscar(..., String estacaoId, Pageable)`, `IncidentService.search(..., String estacaoId, Pageable)`, `IncidentSseService.subscribe(String estacaoId): SseEmitter` (`subscribe()` sem argumento continua existindo, delega para `subscribe(null)`), `IncidentSseService.register(SseEmitter, String estacaoId)`

**Decisões de design (não estão literais na spec, registradas para quem for revisar):**
- O filtro de `GET /incidents` entra na *subconsulta do repositório* (`a.cameraId IN (SELECT c.id FROM Camera c WHERE c.estacaoId = :estacaoId)`), não como `.stream().filter()` depois da paginação — um filtro pós-`Page` quebraria `totalElements`/`totalPages` silenciosamente (a página vem de um `LIMIT` do banco; filtrar depois dela produz uma contagem que não bate com o conteúdo).
- `GET /incidents/{id}` e `PUT /incidents/{id}/status` resolvem a estação da câmera do incidente via `CameraRepository` (não via `IncidentResponse`, que não carrega `estacaoId` — o mapeamento incidente↔câmera não muda, `IncidentMapper` permanece sem essa dependência). Câmera desconhecida (não cadastrada) conta como fora do escopo do operador — 403, nunca visível a uma sessão `OPERADOR` (mesma política aplicada à SSE, abaixo).
- `GET /incidents/stream` (SSE) não tem "403": a conexão abre normalmente e o operador recebe um fluxo *filtrado* — só os incidentes da própria estação. `IncidentSseService.broadcast` resolve a `estacaoId` do incidente (via `cameraId`) e só entrega às inscrições cuja `estacaoId` bate (ou cuja inscrição é irrestrita, GESTOR). Isso muda a assinatura de `subscribe`/`register`, e por isso `IncidentSseServiceTest` — que hoje instancia `new IncidentSseService()` sem repositório — precisa virar `@DataJpaTest` com `CameraRepository` real (nunca um dublê).

- [ ] **Step 1: Escrever os testes que falham**

Substituir o conteúdo de `src/test/java/com/dev4/cypher/sse/IncidentSseServiceTest.java` por:

```java
package com.dev4.cypher.sse;

import com.dev4.cypher.dto.IncidentResponse;
import com.dev4.cypher.model.AlertaNivel;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.model.AlertaTipo;
import com.dev4.cypher.model.Camera;
import com.dev4.cypher.repository.CameraRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class IncidentSseServiceTest {

    @Autowired
    private CameraRepository cameras;

    private IncidentSseService service;

    @BeforeEach
    void setUp() {
        service = new IncidentSseService(cameras);
    }

    private IncidentResponse incidenteDe(String cameraId) {
        return new IncidentResponse(1L, "k", cameraId, "run-a", 7,
                AlertaTipo.FALL_RISK, 4, AlertaNivel.ALTO, "descricao",
                "fallen_sustained", "immediate_risk", 11, 4, null, "outside",
                List.of(), List.of(), null,
                OffsetDateTime.of(2026, 8, 10, 14, 31, 2, 0, ZoneOffset.UTC),
                null, null, null, null, AlertaStatus.PENDENTE);
    }

    @Test
    void registraEDesregistraConexoes() {
        List<Runnable> aoConcluir = new ArrayList<>();
        SseEmitter emitter = new SseEmitter(0L) {
            @Override
            public void onCompletion(Runnable callback) {
                aoConcluir.add(callback);
                super.onCompletion(callback);
            }
        };

        service.register(emitter, null);
        assertThat(service.activeConnections()).isEqualTo(1);

        aoConcluir.forEach(Runnable::run);
        assertThat(service.activeConnections()).isZero();
    }

    @Test
    void subscribeSemArgumentoRegistraUmaConexaoIrrestrita() {
        service.subscribe();

        assertThat(service.activeConnections()).isEqualTo(1);
    }

    @Test
    void entregaOIncidenteAUmInscritoIrrestrito() {
        List<Object> recebidos = new ArrayList<>();
        SseEmitter gravador = new SseEmitter(0L) {
            @Override
            public void send(SseEventBuilder builder) {
                recebidos.add(builder.build());
            }
        };
        service.register(gravador, null);

        service.broadcast("incident", incidenteDe("CAM-01"));

        assertThat(recebidos).hasSize(1);
        assertThat(service.activeConnections()).isEqualTo(1);
    }

    @Test
    void removeConexaoQueFalhaAoReceber() {
        SseEmitter quebrado = new SseEmitter(0L) {
            @Override
            public void send(SseEventBuilder builder) throws IOException {
                throw new IOException("cliente desconectou");
            }
        };
        service.register(quebrado, null);
        assertThat(service.activeConnections()).isEqualTo(1);

        service.broadcast("incident", incidenteDe("CAM-01"));

        assertThat(service.activeConnections()).isZero();
    }

    @Test
    void heartbeatRemoveConexaoMorta() {
        SseEmitter quebrado = new SseEmitter(0L) {
            @Override
            public void send(SseEventBuilder builder) throws IOException {
                throw new IOException("cliente desconectou");
            }
        };
        service.register(quebrado, null);

        service.heartbeat();

        assertThat(service.activeConnections()).isZero();
    }

    @Test
    void broadcastSoAlcancaInscritosDaMesmaEstacao() {
        cameras.saveAndFlush(new Camera("CAM-01", "C1", "EST-01",
                "http://x/1", "f", true, "key-CAM-01"));
        cameras.saveAndFlush(new Camera("CAM-02", "C2", "EST-02",
                "http://x/2", "f", true, "key-CAM-02"));
        List<Object> recebidos = new ArrayList<>();
        SseEmitter operadorEst01 = new SseEmitter(0L) {
            @Override
            public void send(SseEventBuilder builder) {
                recebidos.add(builder.build());
            }
        };
        service.register(operadorEst01, "EST-01");

        service.broadcast("incident", incidenteDe("CAM-02"));
        assertThat(recebidos).isEmpty();

        service.broadcast("incident", incidenteDe("CAM-01"));
        assertThat(recebidos).hasSize(1);
    }

    @Test
    void inscritoIrrestritoRecebeIncidenteDeQualquerEstacao() {
        cameras.saveAndFlush(new Camera("CAM-01", "C1", "EST-01",
                "http://x/1", "f", true, "key-CAM-01"));
        List<Object> recebidos = new ArrayList<>();
        SseEmitter gestor = new SseEmitter(0L) {
            @Override
            public void send(SseEventBuilder builder) {
                recebidos.add(builder.build());
            }
        };
        service.register(gestor, null);

        service.broadcast("incident", incidenteDe("CAM-01"));

        assertThat(recebidos).hasSize(1);
    }

    @Test
    void incidenteDeCameraDesconhecidaNaoAlcancaInscritoRestrito() {
        List<Object> recebidos = new ArrayList<>();
        SseEmitter operadorEst01 = new SseEmitter(0L) {
            @Override
            public void send(SseEventBuilder builder) {
                recebidos.add(builder.build());
            }
        };
        service.register(operadorEst01, "EST-01");

        service.broadcast("incident", incidenteDe("CAM-DESCONHECIDA"));

        assertThat(recebidos).isEmpty();
    }
}
```

Criar `src/test/java/com/dev4/cypher/IncidentOperatorScopeApiTest.java`:

```java
package com.dev4.cypher;

import com.dev4.cypher.repository.AlertaRepository;
import com.dev4.cypher.repository.EstacaoRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static com.dev4.cypher.security.AuthTestSupport.loginGestorBootstrap;
import static com.dev4.cypher.security.AuthTestSupport.loginOperador;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@Transactional
@AutoConfigureMockMvc
class IncidentOperatorScopeApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private EstacaoRepository estacoes;

    @Autowired
    private AlertaRepository alertas;

    private MockHttpSession gestor;
    private MockHttpSession operadorEst01;
    private Long idIncidenteEst01;
    private Long idIncidenteEst02;

    @BeforeEach
    void setUp() throws Exception {
        alertas.deleteAll();
        gestor = loginGestorBootstrap(mvc);

        mvc.perform(post("/api/v1/stations").session(gestor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"EST-91\", \"nome\": \"A\", \"setor\": \"s\"}"));
        mvc.perform(post("/api/v1/stations").session(gestor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"EST-92\", \"nome\": \"B\", \"setor\": \"s\"}"));
        mvc.perform(post("/api/v1/cameras").session(gestor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"CAM-91\", \"nome\": \"C1\", \"estacaoId\": \"EST-91\", "
                        + "\"streamUrl\": \"http://127.0.0.1:8291/stream\", \"fonte\": \"f\"}"));
        mvc.perform(post("/api/v1/cameras").session(gestor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"CAM-92\", \"nome\": \"C2\", \"estacaoId\": \"EST-92\", "
                        + "\"streamUrl\": \"http://127.0.0.1:8292/stream\", \"fonte\": \"f\"}"));

        String r1 = mvc.perform(post("/api/v1/incidents").contentType(MediaType.APPLICATION_JSON)
                        .content(incidente("op1", "CAM-91")))
                .andReturn().getResponse().getContentAsString();
        idIncidenteEst01 = ((Number) com.jayway.jsonpath.JsonPath.read(r1, "$.id")).longValue();

        String r2 = mvc.perform(post("/api/v1/incidents").contentType(MediaType.APPLICATION_JSON)
                        .content(incidente("op2", "CAM-92")))
                .andReturn().getResponse().getContentAsString();
        idIncidenteEst02 = ((Number) com.jayway.jsonpath.JsonPath.read(r2, "$.id")).longValue();

        String token = estacoes.findById("EST-91").orElseThrow().getToken();
        operadorEst01 = loginOperador(mvc, token);
    }

    private String incidente(String key, String cameraId) {
        return """
                {
                  "incidentKey": "%s", "cameraId": "%s", "runId": "run-op", "trackId": 1,
                  "type": "FALL_RISK", "severity": 4, "reason": "r",
                  "postureCategory": "immediate_risk", "rebaScore": 11, "actionLevel": 4,
                  "zoneName": null, "zoneStatus": "outside", "epiPresent": [], "epiMissing": [],
                  "detectedAt": "2026-08-10T14:31:02.482-03:00", "snapshotUrl": null
                }
                """.formatted(key, cameraId);
    }

    @Test
    void operadorListaSoOsIncidentesDaPropriaEstacao() throws Exception {
        mvc.perform(get("/api/v1/incidents").session(operadorEst01))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].cameraId").value("CAM-91"));
    }

    @Test
    void gestorListaTodosOsIncidentesSemFiltro() throws Exception {
        mvc.perform(get("/api/v1/incidents").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void operadorLeIncidenteDaPropriaEstacao() throws Exception {
        mvc.perform(get("/api/v1/incidents/{id}", idIncidenteEst01).session(operadorEst01))
                .andExpect(status().isOk());
    }

    @Test
    void operadorRecebe403AoLerIncidenteDeOutraEstacao() throws Exception {
        mvc.perform(get("/api/v1/incidents/{id}", idIncidenteEst02).session(operadorEst01))
                .andExpect(status().isForbidden());
    }

    @Test
    void operadorMudaStatusDeIncidenteDaPropriaEstacao() throws Exception {
        mvc.perform(put("/api/v1/incidents/{id}/status", idIncidenteEst01).session(operadorEst01)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\": \"REVISADO\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void operadorRecebe403AoMudarStatusDeIncidenteDeOutraEstacao() throws Exception {
        mvc.perform(put("/api/v1/incidents/{id}/status", idIncidenteEst02).session(operadorEst01)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\": \"REVISADO\"}"))
                .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentSseServiceTest,IncidentOperatorScopeApiTest`
Expected: FAIL — não compila (`IncidentSseService` ainda não tem construtor com `CameraRepository` nem `register`/`subscribe` com `estacaoId`; a lista de incidentes ainda não filtra, `byId`/`changeStatus` ainda não devolvem 403)

- [ ] **Step 3: Filtro na consulta — `AlertaRepository`**

Em `src/main/java/com/dev4/cypher/repository/AlertaRepository.java`, trocar a query e a assinatura de `buscar`:

```java
    @Query("""
            SELECT a FROM Alerta a
            WHERE (:since IS NULL OR a.dataHora >= :since)
              AND (:cameraId IS NULL OR a.cameraId = :cameraId)
              AND (:severityMin IS NULL OR a.severidade >= :severityMin)
              AND (:status IS NULL OR a.status = :status)
              AND (:estacaoId IS NULL OR a.cameraId IN
                    (SELECT c.id FROM Camera c WHERE c.estacaoId = :estacaoId))
            """)
    Page<Alerta> buscar(@Param("since") OffsetDateTime since,
                        @Param("cameraId") String cameraId,
                        @Param("severityMin") Integer severityMin,
                        @Param("status") AlertaStatus status,
                        @Param("estacaoId") String estacaoId,
                        Pageable pageable);
```

- [ ] **Step 4: Repassar o parâmetro em `IncidentService`**

Em `src/main/java/com/dev4/cypher/service/IncidentService.java`, trocar `search`:

```java
    @Transactional(readOnly = true)
    public Page<IncidentResponse> search(OffsetDateTime since,
                                         String cameraId,
                                         Integer severityMin,
                                         AlertaStatus status,
                                         String estacaoId,
                                         Pageable pageable) {
        return repository.buscar(since, cameraId, severityMin, status, estacaoId, pageable)
                .map(mapper::toResponse);
    }
```

- [ ] **Step 5: Escopo por sessão em `IncidentController`**

Em `src/main/java/com/dev4/cypher/controller/IncidentController.java`, importar `com.dev4.cypher.repository.CameraRepository`, `com.dev4.cypher.security.OperadorAuthentication`, `org.springframework.security.core.Authentication`, `org.springframework.security.core.context.SecurityContextHolder`, `java.util.Optional`; injetar `CameraRepository` no construtor; trocar `list`, `byId`, `changeStatus`, `stream` e adicionar os dois métodos privados:

```java
    private final IncidentService service;
    private final IncidentSseService sse;
    private final CameraRepository cameras;

    public IncidentController(IncidentService service, IncidentSseService sse, CameraRepository cameras) {
        this.service = service;
        this.sse = sse;
        this.cameras = cameras;
    }

    /** Fluxo de incidentes em tempo real; OPERADOR recebe um fluxo já filtrado pela própria estação. */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return sse.subscribe(estacaoIdDoOperadorAtual());
    }
```

```java
    @GetMapping
    public Page<IncidentResponse> list(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since,
            @RequestParam(required = false) String camera,
            @RequestParam(required = false) Integer severityMin,
            @RequestParam(required = false) AlertaStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        Pageable pageable = PageRequest.of(page, size,
                Sort.by(Sort.Direction.DESC, "dataHora"));
        return service.search(since, camera, severityMin, status, estacaoIdDoOperadorAtual(), pageable);
    }

    /** Item individual, para a tela de detalhe sobreviver a refresh/link direto. */
    @GetMapping("/{id}")
    public ResponseEntity<IncidentResponse> byId(@PathVariable Long id) {
        return service.findById(id).map(incident -> foraDoEscopoDoOperador(incident.cameraId())
                        ? ResponseEntity.status(HttpStatus.FORBIDDEN).<IncidentResponse>build()
                        : ResponseEntity.ok(incident))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<IncidentResponse> changeStatus(@PathVariable Long id,
                                                         @Valid @RequestBody StatusRequest req) {
        Optional<IncidentResponse> atual = service.findById(id);
        if (atual.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        if (foraDoEscopoDoOperador(atual.get().cameraId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return service.changeStatus(id, req.status())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** `null` para GESTOR (sem filtro) ou sessão anônima; a própria estacaoId para OPERADOR. */
    private String estacaoIdDoOperadorAtual() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth instanceof OperadorAuthentication operador ? operador.getEstacaoId() : null;
    }

    /**
     * Câmera desconhecida conta como fora do escopo — um OPERADOR nunca vê o
     * que não se sabe de qual estação é (mesma política do broadcast SSE).
     */
    private boolean foraDoEscopoDoOperador(String cameraId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof OperadorAuthentication operador)) {
            return false;
        }
        return cameras.findById(cameraId)
                .map(c -> !c.getEstacaoId().equals(operador.getEstacaoId()))
                .orElse(true);
    }
```

- [ ] **Step 6: Escopo no broadcast — `IncidentSseService`**

Substituir o conteúdo de `src/main/java/com/dev4/cypher/sse/IncidentSseService.java` por:

```java
package com.dev4.cypher.sse;

import com.dev4.cypher.dto.IncidentResponse;
import com.dev4.cypher.repository.CameraRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Registro em memória das conexões SSE abertas, com escopo opcional por
 * estação: uma inscrição `OPERADOR` (estacaoId não nula) só recebe
 * incidentes cuja câmera pertence à mesma estação; uma inscrição irrestrita
 * (GESTOR, estacaoId nula) recebe tudo — mesma política de 403 de
 * `IncidentController`, mas expressa como filtro em vez de rejeição (uma
 * conexão SSE não tem por onde devolver 403 a meio do fluxo).
 *
 * <p>Estado volátil por natureza: reiniciar a aplicação derruba as conexões,
 * não os dados. O broadcast é por instância — adequado ao deploy de instância
 * única previsto para esta entrega.
 */
@Service
public class IncidentSseService {

    private static final long SEM_TIMEOUT = 0L;

    private record Subscription(SseEmitter emitter, String estacaoId) {
    }

    private final CameraRepository cameras;
    private final List<Subscription> subscriptions = new CopyOnWriteArrayList<>();

    public IncidentSseService(CameraRepository cameras) {
        this.cameras = cameras;
    }

    /** Irrestrito — usado por GESTOR e por quem ainda não tem sessão. */
    public SseEmitter subscribe() {
        return subscribe(null);
    }

    /** @param estacaoId nulo = sem filtro (GESTOR); não-nulo = só incidentes dessa estação (OPERADOR). */
    public SseEmitter subscribe(String estacaoId) {
        return register(new SseEmitter(SEM_TIMEOUT), estacaoId);
    }

    public SseEmitter register(SseEmitter emitter, String estacaoId) {
        Subscription subscription = new Subscription(emitter, estacaoId);
        subscriptions.add(subscription);
        emitter.onCompletion(() -> subscriptions.remove(subscription));
        emitter.onTimeout(() -> subscriptions.remove(subscription));
        emitter.onError(e -> subscriptions.remove(subscription));
        return emitter;
    }

    public void broadcast(String eventName, IncidentResponse incident) {
        String estacaoDoIncidente = cameras.findById(incident.cameraId())
                .map(c -> c.getEstacaoId())
                .orElse(null);
        enviarAosQueEnxergam(estacaoDoIncidente, SseEmitter.event().name(eventName).data(incident));
    }

    /** Mantém a conexão viva através de proxies e detecta cliente morto. */
    @Scheduled(fixedRate = 15_000)
    public void heartbeat() {
        enviarATodos(SseEmitter.event().comment("keep-alive"));
    }

    public int activeConnections() {
        return subscriptions.size();
    }

    private void enviarAosQueEnxergam(String estacaoDoIncidente, SseEmitter.SseEventBuilder evento) {
        for (Subscription subscription : subscriptions) {
            boolean enxerga = subscription.estacaoId() == null
                    || subscription.estacaoId().equals(estacaoDoIncidente);
            if (!enxerga) {
                continue;
            }
            enviar(subscription, evento);
        }
    }

    private void enviarATodos(SseEmitter.SseEventBuilder evento) {
        for (Subscription subscription : subscriptions) {
            enviar(subscription, evento);
        }
    }

    private void enviar(Subscription subscription, SseEmitter.SseEventBuilder evento) {
        try {
            subscription.emitter().send(evento);
        } catch (IOException | IllegalStateException desconectado) {
            subscriptions.remove(subscription);
        }
    }
}
```

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentSseServiceTest,IncidentOperatorScopeApiTest`
Expected: PASS

- [ ] **Step 8: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS — os testes existentes de `IncidentQueryApiTest`/`IncidentEventPublicationTest` continuam passando sem sessão: sem `Authentication`, `estacaoIdDoOperadorAtual()` devolve `null` e nada é filtrado, exatamente o comportamento anterior

- [ ] **Step 9: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/repository/AlertaRepository.java \
        src/main/java/com/dev4/cypher/service/IncidentService.java \
        src/main/java/com/dev4/cypher/controller/IncidentController.java \
        src/main/java/com/dev4/cypher/sse/IncidentSseService.java \
        src/test/java/com/dev4/cypher/sse/IncidentSseServiceTest.java \
        src/test/java/com/dev4/cypher/IncidentOperatorScopeApiTest.java
git commit -m "feat(security): restringe OPERADOR a propria estacaoId em incidentes e SSE"
```

---

### Task 12: Trava os endpoints existentes (sessão/papel obrigatórios)

**Files:**
- Modify: `src/main/java/com/dev4/cypher/config/SecurityConfig.java` — cadeia de autorização real (tabela da spec §2.6) + entry point 401
- Modify: `src/test/java/com/dev4/cypher/CatalogApiTest.java` — sessão GESTOR em toda chamada
- Modify: `src/test/java/com/dev4/cypher/CatalogWriteApiTest.java` — sessão GESTOR em toda chamada
- Modify: `src/test/java/com/dev4/cypher/CameraConfigApiTest.java` — sessão GESTOR no setup e nas chamadas de escrita
- Modify: `src/test/java/com/dev4/cypher/SummaryApiTest.java` — sessão GESTOR em toda chamada
- Modify: `src/test/java/com/dev4/cypher/IncidentQueryApiTest.java` — sessão GESTOR nas chamadas de leitura/status
- Modify: `src/test/java/com/dev4/cypher/IncidentEventPublicationTest.java` — sessão GESTOR na chamada de `/incidents/stream`
- Test: `src/test/java/com/dev4/cypher/SecurityLockdownApiTest.java` — prova negativa (401/403) por papel, novo arquivo

**Interfaces:**
- Consumes: `GestorAuthentication`/`OperadorAuthentication`/`PipelineAuthentication` (Tarefas 7/8), `AuthTestSupport` (Tarefa 7)
- Não produz interface nova — esta tarefa só aperta regras de autorização sobre o que já existe

**Por que só agora:** até aqui, toda tarefa deste plano rodou a suíte inteira sem quebrar nada (Global Constraints/Architecture). As tarefas 9, 10 e 11, que criaram endpoints novos, já autenticavam nos próprios testes desde o início — só os arquivos de teste que **antecedem** a existência de `AuthController` (Tarefas 1–6) e os dois arquivos que a Tarefa 5 tocou (mas cujos testes de escrita já existiam antes) precisam ser retroalimentados com sessão agora.

**Por que 401 para anônimo e 403 para papel errado, com as mesmas regras `hasRole`/`hasAnyRole`:** é comportamento embutido do `ExceptionTranslationFilter` do Spring Security — quando uma regra de autorização nega o acesso (`AccessDeniedException`, não importa se veio de `hasRole`, `hasAnyRole` ou `authenticated()`), o filtro olha se a `Authentication` atual está ausente/anônima; se estiver, delega ao `AuthenticationEntryPoint` (que esta tarefa configura para responder 401); se for uma sessão real com papel insuficiente, delega ao `AccessDeniedHandler` padrão (403). Não é preciso desabilitar autenticação anônima nem escrever duas cadeias de regra — só configurar o entry point.

- [ ] **Step 1: Escrever o teste de trava que falha**

Criar `src/test/java/com/dev4/cypher/SecurityLockdownApiTest.java`:

```java
package com.dev4.cypher;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

import static com.dev4.cypher.security.AuthTestSupport.loginGestorBootstrap;
import static com.dev4.cypher.security.AuthTestSupport.loginOperador;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class SecurityLockdownApiTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void healthContinuaPublico() throws Exception {
        mvc.perform(get("/api/v1/health")).andExpect(status().isOk());
    }

    @Test
    void setupStatusContinuaPublico() throws Exception {
        mvc.perform(get("/api/v1/setup/status")).andExpect(status().isOk());
    }

    @Test
    void setupPosConfiguradoDevolve409NaoAutenticacao() throws Exception {
        // Garante que ao menos um Usuario já existe (o gestor bootstrap,
        // idempotente — ver AuthTestSupport). A prova aqui é que a resposta
        // é 409 (endpoint de execução única já fechado), não 401: POST
        // /setup continua público mesmo travado, nunca escondido atrás de
        // sessão/papel (spec E4 §2.5/§2.6).
        loginGestorBootstrap(mvc);

        mvc.perform(post("/api/v1/setup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"outro\", \"password\": \"x\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void summarySemSessaoDevolve401() throws Exception {
        mvc.perform(get("/api/v1/summary")).andExpect(status().isUnauthorized());
    }

    @Test
    void teamsSemSessaoDevolve401() throws Exception {
        mvc.perform(get("/api/v1/teams")).andExpect(status().isUnauthorized());
    }

    @Test
    void usersSemSessaoDevolve401() throws Exception {
        mvc.perform(get("/api/v1/users")).andExpect(status().isUnauthorized());
    }

    @Test
    void summaryComSessaoGestorDevolve200() throws Exception {
        MockHttpSession gestor = loginGestorBootstrap(mvc);

        mvc.perform(get("/api/v1/summary").session(gestor)).andExpect(status().isOk());
    }

    @Test
    void summaryComSessaoOperadorDevolve403() throws Exception {
        MockHttpSession gestor = loginGestorBootstrap(mvc);
        mvc.perform(post("/api/v1/stations").session(gestor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"EST-95\", \"nome\": \"A\", \"setor\": \"s\"}"));
        String token = com.jayway.jsonpath.JsonPath.read(
                mvc.perform(post("/api/v1/stations/EST-95/token/regenerate").session(gestor))
                        .andReturn().getResponse().getContentAsString(),
                "$.token");
        MockHttpSession operador = loginOperador(mvc, token);

        mvc.perform(get("/api/v1/summary").session(operador)).andExpect(status().isForbidden());
    }

    @Test
    void camerasEStationsListaAceitamGestorEOperador() throws Exception {
        MockHttpSession gestor = loginGestorBootstrap(mvc);
        mvc.perform(post("/api/v1/stations").session(gestor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"EST-96\", \"nome\": \"A\", \"setor\": \"s\"}"));
        String token = com.jayway.jsonpath.JsonPath.read(
                mvc.perform(post("/api/v1/stations/EST-96/token/regenerate").session(gestor))
                        .andReturn().getResponse().getContentAsString(),
                "$.token");
        MockHttpSession operador = loginOperador(mvc, token);

        mvc.perform(get("/api/v1/cameras").session(operador)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/stations").session(operador)).andExpect(status().isOk());
    }

    @Test
    void cameraAdminItemExigeGestorNaoOperador() throws Exception {
        MockHttpSession gestor = loginGestorBootstrap(mvc);
        mvc.perform(post("/api/v1/stations").session(gestor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"EST-97\", \"nome\": \"A\", \"setor\": \"s\"}"));
        mvc.perform(post("/api/v1/cameras").session(gestor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"CAM-97\", \"nome\": \"C\", \"estacaoId\": \"EST-97\", "
                        + "\"streamUrl\": \"http://127.0.0.1:8297/stream\", \"fonte\": \"f\"}"));
        String token = com.jayway.jsonpath.JsonPath.read(
                mvc.perform(post("/api/v1/stations/EST-97/token/regenerate").session(gestor))
                        .andReturn().getResponse().getContentAsString(),
                "$.token");
        MockHttpSession operador = loginOperador(mvc, token);

        mvc.perform(get("/api/v1/cameras/CAM-97").session(gestor)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/cameras/CAM-97").session(operador)).andExpect(status().isForbidden());
    }

    @Test
    void cameraConfigSemChaveNemSessaoDevolve401() throws Exception {
        // A propria chave nao tem superficie de leitura (Tarefa 6) — este teste
        // só confirma que, sem sessão E sem X-Cypher-Key, a rota devolve 401;
        // a Tarefa 13 é quem decide o que acontece SEM nenhuma chave nos
        // endpoints de ingestão, não aqui.
        mvc.perform(get("/api/v1/cameras/CAM-99/config")).andExpect(status().isUnauthorized());
    }

    @Test
    void ingestaoContinuaAbertaSemChave() throws Exception {
        // Flip para obrigatorio e a Tarefa 13 — aqui a ingestao ainda aceita
        // sem X-Cypher-Key (spec E4 §5/§7).
        mvc.perform(post("/api/v1/incidents").contentType(MediaType.APPLICATION_JSON).content("""
                {
                  "incidentKey": "CAM-01:run-lock:track-1:20260810T160000000Z",
                  "cameraId": "CAM-01", "runId": "run-lock", "trackId": 1,
                  "type": "FALL_RISK", "severity": 4, "reason": "r",
                  "postureCategory": "immediate_risk", "rebaScore": 11, "actionLevel": 4,
                  "zoneName": null, "zoneStatus": "outside", "epiPresent": [], "epiMissing": [],
                  "detectedAt": "2026-08-10T16:00:00Z", "snapshotUrl": null
                }
                """)).andExpect(status().isCreated());
    }
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SecurityLockdownApiTest`
Expected: FAIL — a cadeia ainda é `permitAll`, então `summarySemSessaoDevolve401` (entre outros) recebe 200 em vez de 401

- [ ] **Step 3: Travar a cadeia em `SecurityConfig`**

Substituir o conteúdo inteiro de `src/main/java/com/dev4/cypher/config/SecurityConfig.java` por:

```java
package com.dev4.cypher.config;

import com.dev4.cypher.repository.CameraRepository;
import com.dev4.cypher.security.CypherKeyAuthenticationFilter;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.cors.CorsUtils;

/**
 * Infra de segurança de E4 (spec §2), completa nesta tarefa: a cadeia
 * abaixo é a tradução direta da tabela de endpoints/proteção (spec §2.6) —
 * cada `requestMatchers` é uma linha da tabela, e o que não está listado
 * explicitamente cai no catch-all GESTOR-only no final (nega por padrão).
 * Ingestão (`POST`/`PATCH /api/v1/incidents`) fica de fora de propósito:
 * continua `permitAll` até a Tarefa 13, sempre a última do plano (spec
 * §5/§7) — exigir X-Cypher-Key antes disso quebraria qualquer pipeline já
 * em produção que ainda não manda o header.
 *
 * <p>{@code exceptionHandling(...)} configura o `AuthenticationEntryPoint`
 * para responder 401: é o que faz o `ExceptionTranslationFilter` do Spring
 * Security devolver 401 a uma sessão anônima (em vez do 403 do
 * `Http403ForbiddenEntryPoint` padrão) e, ao mesmo tempo, continuar
 * devolvendo 403 a uma sessão real com papel insuficiente — o filtro já
 * distingue os dois casos sozinho a partir da mesma `AccessDeniedException`,
 * sem precisar de duas cadeias de regra nem de desabilitar autenticação
 * anônima.
 *
 * <p>{@code securityContextRepository} precisa ser o MESMO bean usado por
 * {@code SessionAuthenticator} para gravar a sessão (Tarefa 7, consumido por
 * {@code AuthController} e {@code SetupController}). {@code
 * frameOptions().sameOrigin()} existe só por causa do /h2-console.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           SecurityContextRepository securityContextRepository,
                                           CameraRepository cameras) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .securityContext(ctx -> ctx.securityContextRepository(securityContextRepository))
                .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
                .addFilterAfter(new CypherKeyAuthenticationFilter(cameras), SecurityContextHolderFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(CorsUtils::isPreFlightRequest).permitAll()
                        // response.sendError(401) no entry point abaixo dispara um
                        // ERROR dispatch para /error num container real (o MockMvc da
                        // suite não reproduz esse redespacho, então os testes desta
                        // tarefa não o exercitam). Sem esta linha, o catch-all
                        // anyRequest().hasRole("GESTOR") avaliaria esse dispatch
                        // anônimo e devolveria 403 no lugar do 401 pretendido.
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/h2-console/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/health").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/setup/status").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/setup").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/login", "/api/v1/auth/login-estacao")
                        .permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/incidents").permitAll()
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/incidents/*").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/logout").hasAnyRole("GESTOR", "OPERADOR")
                        .requestMatchers(HttpMethod.GET, "/api/v1/auth/me").hasAnyRole("GESTOR", "OPERADOR")
                        .requestMatchers(HttpMethod.GET, "/api/v1/cameras/*/config")
                        .hasAnyRole("PIPELINE", "GESTOR")
                        .requestMatchers(HttpMethod.GET, "/api/v1/cameras", "/api/v1/stations")
                        .hasAnyRole("GESTOR", "OPERADOR")
                        .requestMatchers(HttpMethod.GET, "/api/v1/incidents", "/api/v1/incidents/*")
                        .hasAnyRole("GESTOR", "OPERADOR")
                        .requestMatchers(HttpMethod.PUT, "/api/v1/incidents/*/status")
                        .hasAnyRole("GESTOR", "OPERADOR")
                        .anyRequest().hasRole("GESTOR"))
                .exceptionHandling(ex -> ex.authenticationEntryPoint(
                        (request, response, authException) ->
                                response.sendError(HttpServletResponse.SC_UNAUTHORIZED)));
        return http.build();
    }
}
```

- [ ] **Step 4: Rodar o teste de trava isolado e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SecurityLockdownApiTest`
Expected: PASS

- [ ] **Step 5: Rodar a suíte completa e confirmar a quebra esperada**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: FAIL em `CatalogApiTest`, `CatalogWriteApiTest`, `CameraConfigApiTest`, `SummaryApiTest`, `IncidentQueryApiTest`, `IncidentEventPublicationTest` — os únicos arquivos de teste anteriores à Tarefa 7 (`AuthController`) que fazem chamada HTTP sem sessão a um endpoint agora protegido. Nenhum outro arquivo quebra: os criados a partir da Tarefa 9 já autenticam desde o início (Global Constraints).

- [ ] **Step 6: Retroalimentar `CatalogApiTest`**

Substituir o conteúdo inteiro de `src/test/java/com/dev4/cypher/CatalogApiTest.java` por:

```java
package com.dev4.cypher;

import com.dev4.cypher.model.Alerta;
import com.dev4.cypher.model.AlertaNivel;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.model.AlertaTipo;
import com.dev4.cypher.repository.AlertaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

import static com.dev4.cypher.security.AuthTestSupport.loginGestorBootstrap;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "cypher.catalog.stations[0].id=EST-01",
        "cypher.catalog.stations[0].nome=Esteira de montagem",
        "cypher.catalog.stations[0].setor=montagem",
        "cypher.catalog.cameras[0].id=CAM-01",
        "cypher.catalog.cameras[0].nome=Frontal",
        "cypher.catalog.cameras[0].estacaoId=EST-01",
        "cypher.catalog.cameras[0].streamUrl=http://127.0.0.1:8090/stream",
        "cypher.catalog.cameras[0].fonte=rtsp://user:senha@cam/stream",
})
class CatalogApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AlertaRepository alertas;

    private MockHttpSession gestor;

    @BeforeEach
    void autenticar() throws Exception {
        gestor = loginGestorBootstrap(mvc);
    }

    @Test
    void listaCamerasComUrlDeStream() throws Exception {
        mvc.perform(get("/api/v1/cameras").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("CAM-01"))
                .andExpect(jsonPath("$[0].estacaoId").value("EST-01"))
                .andExpect(jsonPath("$[0].streamUrl").value("http://127.0.0.1:8090/stream"));
    }

    @Test
    void naoExpoeAFonteQuePodeConterCredencial() throws Exception {
        mvc.perform(get("/api/v1/cameras").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].fonte").doesNotExist());
    }

    @Test
    void listaEstacoesComSuasCameras() throws Exception {
        mvc.perform(get("/api/v1/stations").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("EST-01"))
                .andExpect(jsonPath("$[0].setor").value("montagem"))
                .andExpect(jsonPath("$[0].cameras[0].id").value("CAM-01"));
    }

    @Test
    @Transactional
    void desativarCameraATiraDaListaSemApagarSeusIncidentes() throws Exception {
        Alerta incidente = new Alerta();
        incidente.setIncidentKey("CAM-01:run-e2:track-1:20260820T120000000Z");
        incidente.setRunId("run-e2");
        incidente.setTrackId(1);
        incidente.setCameraId("CAM-01");
        incidente.setTipo(AlertaTipo.FALL_RISK);
        incidente.setSeveridade(4);
        incidente.setNivel(AlertaNivel.fromSeverity(4));
        incidente.setDescricao("Queda");
        incidente.setReason("fallen_sustained");
        incidente.setPosturaCategoria("immediate_risk");
        incidente.setRebaScore(11);
        incidente.setActionLevel(4);
        incidente.setZoneStatus("outside");
        incidente.setEpiPresent(List.of());
        incidente.setEpiMissing(List.of());
        incidente.setDataHora(OffsetDateTime.now());
        incidente.setStatus(AlertaStatus.PENDENTE);
        alertas.saveAndFlush(incidente);

        mvc.perform(delete("/api/v1/cameras/CAM-01").session(gestor)).andExpect(status().isNoContent());

        // Saiu da navegação...
        mvc.perform(get("/api/v1/cameras").session(gestor))
                .andExpect(jsonPath("$[?(@.id=='CAM-01')]").isEmpty());

        // ...mas o incidente continua consultável.
        mvc.perform(get("/api/v1/incidents").param("camera", "CAM-01").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }
}
```

- [ ] **Step 7: Retroalimentar `CatalogWriteApiTest`**

Substituir o conteúdo inteiro de `src/test/java/com/dev4/cypher/CatalogWriteApiTest.java` por:

```java
package com.dev4.cypher;

import com.dev4.cypher.repository.CameraRepository;
import com.dev4.cypher.repository.EstacaoRepository;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static com.dev4.cypher.security.AuthTestSupport.loginGestorBootstrap;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@Transactional
@AutoConfigureMockMvc
class CatalogWriteApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private EstacaoRepository estacoes;

    @Autowired
    private CameraRepository cameras;

    private MockHttpSession gestor;

    private static final String ESTACAO = """
            {"id": "EST-77", "nome": "Esteira de montagem", "setor": "montagem"}
            """;

    private static final String CAMERA = """
            {
              "id": "CAM-77",
              "nome": "Frontal",
              "estacaoId": "EST-77",
              "streamUrl": "http://127.0.0.1:8177/stream",
              "fonte": "rtsp://${CAM77_USER}:${CAM77_PASS}@10.0.0.7/stream"
            }
            """;

    @BeforeEach
    void limpar() throws Exception {
        gestor = loginGestorBootstrap(mvc);
        cameras.deleteAll();
        estacoes.deleteAll();
    }

    @Test
    void cadastraEstacaoEDevolve201() throws Exception {
        mvc.perform(post("/api/v1/stations").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON).content(ESTACAO))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("EST-77"))
                .andExpect(jsonPath("$.ativa").value(true))
                .andExpect(jsonPath("$.token").exists())
                .andExpect(jsonPath("$.cameras").doesNotExist());
    }

    @Test
    void recusaCodigoComFormatoInvalido() throws Exception {
        mvc.perform(post("/api/v1/stations").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\": \"est_77\", \"nome\": \"X\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void codigoDuplicadoDevolve409ComMensagem() throws Exception {
        mvc.perform(post("/api/v1/stations").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));

        mvc.perform(post("/api/v1/stations").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON).content(ESTACAO))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.erro").value(Matchers.containsString("EST-77")));
    }

    @Test
    void editaEstacao() throws Exception {
        mvc.perform(post("/api/v1/stations").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));

        mvc.perform(put("/api/v1/stations/EST-77").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\": \"EST-77\", \"nome\": \"Esteira 1\", \"setor\": \"final\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nome").value("Esteira 1"));
    }

    @Test
    void renomearCodigoDevolve409() throws Exception {
        mvc.perform(post("/api/v1/stations").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));

        mvc.perform(put("/api/v1/stations/EST-77").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\": \"EST-88\", \"nome\": \"Esteira\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void editarEstacaoInexistenteDevolve404() throws Exception {
        mvc.perform(put("/api/v1/stations/EST-99").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\": \"EST-99\", \"nome\": \"X\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void desativaEstacaoEDevolve204() throws Exception {
        mvc.perform(post("/api/v1/stations").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));

        mvc.perform(delete("/api/v1/stations/EST-77").session(gestor)).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/stations").session(gestor))
                .andExpect(jsonPath("$[?(@.id=='EST-77')]").isEmpty());
        mvc.perform(get("/api/v1/stations").session(gestor).param("incluirInativas", "true"))
                .andExpect(jsonPath("$[?(@.id=='EST-77')].ativa").value(false));
    }

    @Test
    void cadastraCameraEDevolve201ComFonte() throws Exception {
        mvc.perform(post("/api/v1/stations").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));

        mvc.perform(post("/api/v1/cameras").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON).content(CAMERA))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("CAM-77"))
                .andExpect(jsonPath("$.fonte").value(Matchers.containsString("CAM77_USER")));
    }

    @Test
    void cameraDeEstacaoInexistenteDevolve422() throws Exception {
        mvc.perform(post("/api/v1/cameras").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON).content(CAMERA))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.erro").value(Matchers.containsString("EST-77")));
    }

    @Test
    void itemIndividualTrazFonteMasAListaNao() throws Exception {
        mvc.perform(post("/api/v1/stations").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));
        mvc.perform(post("/api/v1/cameras").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(CAMERA));

        mvc.perform(get("/api/v1/cameras/CAM-77").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fonte").exists());

        mvc.perform(get("/api/v1/cameras").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].fonte").doesNotExist());
    }

    @Test
    void cameraDesativadaSaiDaListaMasContinuaAcessivelPorId() throws Exception {
        mvc.perform(post("/api/v1/stations").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));
        mvc.perform(post("/api/v1/cameras").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(CAMERA));

        mvc.perform(delete("/api/v1/cameras/CAM-77").session(gestor)).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/cameras").session(gestor))
                .andExpect(jsonPath("$[?(@.id=='CAM-77')]").isEmpty());
        mvc.perform(get("/api/v1/cameras/CAM-77").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativa").value(false));
    }

    @Test
    void cameraInexistenteDevolve404() throws Exception {
        mvc.perform(get("/api/v1/cameras/CAM-99").session(gestor)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/cameras/CAM-99").session(gestor)).andExpect(status().isNotFound());
    }

    @Test
    void listaDeCamerasIncluiInativasSoComOptIn() throws Exception {
        mvc.perform(post("/api/v1/stations").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));
        mvc.perform(post("/api/v1/cameras").session(gestor)
                .contentType(MediaType.APPLICATION_JSON).content(CAMERA));

        mvc.perform(delete("/api/v1/cameras/CAM-77").session(gestor)).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/cameras").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='CAM-77')]").isEmpty());
        mvc.perform(get("/api/v1/cameras").session(gestor).param("incluirInativas", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='CAM-77')]").isEmpty());
        mvc.perform(get("/api/v1/cameras").session(gestor).param("incluirInativas", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='CAM-77')]").isNotEmpty());
    }

    @Test
    void regeneraTokenEDevolveValorDiferenteDoAnterior() throws Exception {
        String criada = mvc.perform(post("/api/v1/stations").session(gestor)
                        .contentType(MediaType.APPLICATION_JSON).content(ESTACAO))
                .andReturn().getResponse().getContentAsString();
        String tokenOriginal = com.jayway.jsonpath.JsonPath.read(criada, "$.token");

        mvc.perform(post("/api/v1/stations/EST-77/token/regenerate").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("EST-77"))
                .andExpect(jsonPath("$.token").value(Matchers.not(tokenOriginal)));
    }

    @Test
    void regenerarTokenDeEstacaoInexistenteDevolve404() throws Exception {
        mvc.perform(post("/api/v1/stations/EST-99/token/regenerate").session(gestor))
                .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 8: Retroalimentar `CameraConfigApiTest`**

Substituir o conteúdo inteiro de `src/test/java/com/dev4/cypher/CameraConfigApiTest.java` por:

```java
package com.dev4.cypher;

import com.dev4.cypher.repository.CameraRepository;
import com.dev4.cypher.repository.EstacaoRepository;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static com.dev4.cypher.security.AuthTestSupport.loginGestorBootstrap;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@Transactional
@AutoConfigureMockMvc
class CameraConfigApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private EstacaoRepository estacoes;

    @Autowired
    private CameraRepository cameras;

    private MockHttpSession gestor;

    @BeforeEach
    void cadastrar() throws Exception {
        gestor = loginGestorBootstrap(mvc);
        cameras.deleteAll();
        estacoes.deleteAll();

        mvc.perform(post("/api/v1/stations").session(gestor)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"EST-55\", \"nome\": \"Prensa\", \"setor\": \"estamparia\"}"));

        mvc.perform(post("/api/v1/cameras").session(gestor)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "id": "CAM-55",
                          "nome": "Prensa - lateral",
                          "estacaoId": "EST-55",
                          "streamUrl": "http://127.0.0.1:8155/stream",
                          "fonte": "rtsp://${CAM55_USER}:${CAM55_PASS}@10.0.0.9/stream"
                        }
                        """));
    }

    @Test
    void devolveFonteComPlaceholderEPortaDerivadaDaUrl() throws Exception {
        mvc.perform(get("/api/v1/cameras/CAM-55/config").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.codigo").value("CAM-55"))
                .andExpect(jsonPath("$.estacaoId").value("EST-55"))
                .andExpect(jsonPath("$.streamPort").value(8155))
                .andExpect(jsonPath("$.ativa").value(true))
                .andExpect(jsonPath("$.fonte").value(
                        "rtsp://${CAM55_USER}:${CAM55_PASS}@10.0.0.9/stream"));
    }

    @Test
    void naoDevolveStreamUrlBruta() throws Exception {
        mvc.perform(get("/api/v1/cameras/CAM-55/config").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.streamUrl").doesNotExist());
    }

    @Test
    void cameraDesativadaDevolve409() throws Exception {
        mvc.perform(delete("/api/v1/cameras/CAM-55").session(gestor)).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/cameras/CAM-55/config").session(gestor))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.erro").value(Matchers.containsString("CAM-55")));
    }

    @Test
    void cameraInexistenteDevolve404() throws Exception {
        mvc.perform(get("/api/v1/cameras/CAM-99/config").session(gestor))
                .andExpect(status().isNotFound());
    }

    @Test
    void estacaoDesativadaDevolve409MesmoComCameraAtiva() throws Exception {
        mvc.perform(delete("/api/v1/stations/EST-55").session(gestor)).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/cameras/CAM-55/config").session(gestor))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.erro").value(Matchers.containsString("EST-55")));
    }
}
```

- [ ] **Step 9: Retroalimentar `SummaryApiTest`**

Em `src/test/java/com/dev4/cypher/SummaryApiTest.java`, acrescentar os imports (`org.junit.jupiter.api.BeforeEach` já está importado; adicionar):

```java
import org.springframework.mock.web.MockHttpSession;

import static com.dev4.cypher.security.AuthTestSupport.loginGestorBootstrap;
```

Acrescentar o campo e atualizar o `@BeforeEach` (o corpo de `semear()` não muda, só o que vem antes):

```java
    @Autowired
    private AlertaRepository repository;

    private MockHttpSession gestor;

    private Alerta incidente(String key, String camera, int severidade, OffsetDateTime quando) {
```

```java
    @BeforeEach
    void semear() throws Exception {
        gestor = loginGestorBootstrap(mvc);
        repository.deleteAll();
        OffsetDateTime agora = OffsetDateTime.now();
        repository.save(incidente("s1", "CAM-01", 4, agora.minusHours(1)));
        repository.save(incidente("s2", "CAM-01", 2, agora.minusHours(2)));
        repository.save(incidente("s3", "CAM-02", 3, agora.minusHours(3)));
        repository.saveAndFlush(incidente("s4", "CAM-01", 1, agora.minusDays(1)));
    }
```

E acrescentar `.session(gestor)` às 4 chamadas `mvc.perform(get("/api/v1/summary"))` existentes (uma por teste: `contaIncidentesDeHojeEDeOntem`, `contaCriticosEPendentes`, `heatmapAgregaPorEstacaoIncluindoAsSemIncidente`, `serieDeSeteDiasTemUmPontoPorDia`):

```java
        mvc.perform(get("/api/v1/summary").session(gestor))
```

- [ ] **Step 10: Retroalimentar `IncidentQueryApiTest`**

Em `src/test/java/com/dev4/cypher/IncidentQueryApiTest.java`, acrescentar os imports:

```java
import org.springframework.mock.web.MockHttpSession;

import static com.dev4.cypher.security.AuthTestSupport.loginGestorBootstrap;
```

Acrescentar o campo e trocar o `@BeforeEach` (a ingestão via POST continua sem sessão — só as chamadas de leitura/status precisam dela):

```java
    @Autowired
    private AlertaRepository repository;

    private MockHttpSession gestor;

    private String incidente(String key, String camera, int severidade,
```

```java
    @BeforeEach
    void semear() throws Exception {
        gestor = loginGestorBootstrap(mvc);
        repository.deleteAll();
        mvc.perform(post("/api/v1/incidents").contentType(MediaType.APPLICATION_JSON)
                .content(incidente("q1", "CAM-01", 4, "FALL_RISK", "2026-08-10T08:00:00-03:00")));
        mvc.perform(post("/api/v1/incidents").contentType(MediaType.APPLICATION_JSON)
                .content(incidente("q2", "CAM-02", 2, "ERGONOMIC_RISK", "2026-08-10T09:00:00-03:00")));
        mvc.perform(post("/api/v1/incidents").contentType(MediaType.APPLICATION_JSON)
                .content(incidente("q3", "CAM-01", 3, "ZONE_VIOLATION", "2026-08-10T10:00:00-03:00")));
    }
```

E acrescentar `.session(gestor)` a cada uma das 8 chamadas `mvc.perform(get(...))`/`mvc.perform(put(...))` que restam nos `@Test` (todas exceto as `POST /incidents` do `@BeforeEach`, que ficam como estão):

```java
        mvc.perform(get("/api/v1/incidents").session(gestor))
```
```java
        mvc.perform(get("/api/v1/incidents").param("camera", "CAM-01").session(gestor))
```
```java
        mvc.perform(get("/api/v1/incidents").param("severityMin", "3").session(gestor))
```
```java
        mvc.perform(get("/api/v1/incidents").param("since", "2026-08-10T09:30:00-03:00").session(gestor))
```
```java
        mvc.perform(get("/api/v1/incidents").param("size", "2").param("page", "0").session(gestor))
```
```java
        String lista = mvc.perform(get("/api/v1/incidents").param("camera", "CAM-02").session(gestor))
```
(em `operadorReconheceIncidente`, seguido de)
```java
        mvc.perform(put("/api/v1/incidents/{id}/status", id).session(gestor)
```
```java
        mvc.perform(put("/api/v1/incidents/{id}/status", 999999).session(gestor)
```
(em `statusDeIncidenteInexistenteDevolve404`)
```java
        String lista = mvc.perform(get("/api/v1/incidents").param("camera", "CAM-01").session(gestor))
```
(em `buscaIncidentePorId`, seguido de)
```java
        mvc.perform(get("/api/v1/incidents/{id}", id).session(gestor))
```
```java
        mvc.perform(get("/api/v1/incidents/{id}", 999999).session(gestor))
```

- [ ] **Step 11: Retroalimentar `IncidentEventPublicationTest`**

Em `src/test/java/com/dev4/cypher/IncidentEventPublicationTest.java`, acrescentar os imports:

```java
import org.springframework.mock.web.MockHttpSession;

import static com.dev4.cypher.security.AuthTestSupport.loginGestorBootstrap;
```

E no teste `streamAbreConexaoSse`, autenticar antes de abrir a conexão:

```java
    @Test
    void streamAbreConexaoSse() throws Exception {
        MockHttpSession gestor = loginGestorBootstrap(mvc);

        mvc.perform(get("/api/v1/incidents/stream").session(gestor))
                .andExpect(status().isOk());
    }
```

(os dois testes de publicação de evento, que só fazem `POST /api/v1/incidents`, ficam como estão — ingestão continua sem sessão até a Tarefa 13)

- [ ] **Step 12: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS

- [ ] **Step 13: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/config/SecurityConfig.java \
        src/test/java/com/dev4/cypher/SecurityLockdownApiTest.java \
        src/test/java/com/dev4/cypher/CatalogApiTest.java \
        src/test/java/com/dev4/cypher/CatalogWriteApiTest.java \
        src/test/java/com/dev4/cypher/CameraConfigApiTest.java \
        src/test/java/com/dev4/cypher/SummaryApiTest.java \
        src/test/java/com/dev4/cypher/IncidentQueryApiTest.java \
        src/test/java/com/dev4/cypher/IncidentEventPublicationTest.java
git commit -m "feat(security): trava sessao/papel em todos os endpoints existentes (spec E4 sec2.6)"
```

---

### Task 13: Flip final — `X-Cypher-Key` obrigatório na ingestão (última tarefa do plano)

**Files:**
- Modify: `src/main/java/com/dev4/cypher/security/CypherKeyAuthenticationFilter.java` — rejeita com 401 nos endpoints de ingestão quando a chave está ausente/inválida
- Modify: `src/test/java/com/dev4/cypher/security/CypherKeyAuthenticationFilterTest.java` — testes do novo comportamento
- Modify: `src/test/java/com/dev4/cypher/IncidentIngestionApiTest.java` — todo `POST`/`PATCH /api/v1/incidents` ganha o header
- Modify: `src/test/java/com/dev4/cypher/IncidentQueryApiTest.java` — as 3 chamadas de ingestão do `@BeforeEach` ganham o header
- Modify: `src/test/java/com/dev4/cypher/IncidentEventPublicationTest.java` — as 3 chamadas de ingestão ganham o header (uma em `publicaEventoSomenteDepoisDoCommit`, duas em `retryNaoRepublicaOEvento`)
- Modify: `src/test/java/com/dev4/cypher/IncidentOperatorScopeApiTest.java` — as 2 chamadas de ingestão do `@BeforeEach` ganham o header
- Modify: `src/test/java/com/dev4/cypher/SecurityLockdownApiTest.java` — o teste `ingestaoContinuaAbertaSemChave` (Tarefa 12) é substituído pelo comportamento oposto

**Interfaces:** não produz nada novo — só aperta o comportamento de `CypherKeyAuthenticationFilter` (Tarefa 8) no único ponto que ele já documentava como pendente ("a Tarefa 13 é quem torna o header obrigatório").

**Por que só `POST`/`PATCH /api/v1/incidents` (nunca `PUT /incidents/{id}/status`):** os três vivem em `IncidentController`, mas só os dois primeiros são ingestão do pipeline (spec E4 §5) — `PUT .../status` é a ação do operador humano (reconhecimento, E3), já protegida por sessão desde a Tarefa 12. Confundir os dois travaria o reconhecimento de incidente atrás de uma chave de API que nenhum operador tem.

**Por que a rejeição vive no filtro, não em `SecurityConfig`:** as duas rotas de ingestão continuam `permitAll()` na cadeia de autorização (Tarefa 12) — é o filtro, registrado mais cedo na cadeia, que escreve 401 e nunca chama `filterChain.doFilter(...)` quando a chave falta ou não bate com nenhuma câmera, encerrando a requisição antes que `authorizeHttpRequests` a veja. Girar a regra para dentro de `SecurityConfig` (ex.: `hasRole("PIPELINE")` nessas rotas) devolveria 403 para chave ausente (a mesma ambiguidade 401-vs-403 discutida na Tarefa 12), não o 401 que a spec pede.

- [ ] **Step 1: Escrever os testes do filtro que falham**

Em `src/test/java/com/dev4/cypher/security/CypherKeyAuthenticationFilterTest.java`, acrescentar ao final da classe (antes do `}` de fechamento), junto com o import `org.springframework.http.HttpStatus` no topo:

```java

    @Test
    void ingestaoPostSemChaveDevolve401ENaoChamaProximoFiltro() throws Exception {
        CypherKeyAuthenticationFilter filtro = new CypherKeyAuthenticationFilter(cameras);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/incidents");
        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean[] proximoFiltroChamado = {false};
        FilterChain chain = (req, res) -> proximoFiltroChamado[0] = true;

        filtro.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(proximoFiltroChamado[0]).isFalse();
    }

    @Test
    void ingestaoPatchSemChaveDevolve401() throws Exception {
        CypherKeyAuthenticationFilter filtro = new CypherKeyAuthenticationFilter(cameras);
        MockHttpServletRequest request = new MockHttpServletRequest(
                "PATCH", "/api/v1/incidents/CAM-01:run:track:20260810T000000000Z");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> { };

        filtro.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void ingestaoComChaveValidaSeguePraFrente() throws Exception {
        cameras.saveAndFlush(new Camera("CAM-81", "Frontal", "EST-81",
                "http://127.0.0.1:8181/stream", "rtsp://x", true, "chave-ingestao-valida"));
        CypherKeyAuthenticationFilter filtro = new CypherKeyAuthenticationFilter(cameras);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/incidents");
        request.addHeader(CypherKeyAuthenticationFilter.HEADER, "chave-ingestao-valida");
        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean[] proximoFiltroChamado = {false};
        FilterChain chain = (req, res) -> proximoFiltroChamado[0] = true;

        filtro.doFilter(request, response, chain);

        assertThat(proximoFiltroChamado[0]).isTrue();
    }

    @Test
    void rotaQueNaoEDeIngestaoContinuaPermissivaSemChave() throws Exception {
        CypherKeyAuthenticationFilter filtro = new CypherKeyAuthenticationFilter(cameras);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/cameras/CAM-01/config");
        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean[] proximoFiltroChamado = {false};
        FilterChain chain = (req, res) -> proximoFiltroChamado[0] = true;

        filtro.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
        assertThat(proximoFiltroChamado[0]).isTrue();
    }

    @Test
    void statusDeIncidenteAcaoDoOperadorNaoEIngestaoENaoExigeChave() throws Exception {
        // PUT .../status e o reconhecimento humano (E3), nao a ingestao do
        // pipeline — nunca deve exigir X-Cypher-Key.
        CypherKeyAuthenticationFilter filtro = new CypherKeyAuthenticationFilter(cameras);
        MockHttpServletRequest request = new MockHttpServletRequest("PUT", "/api/v1/incidents/1/status");
        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean[] proximoFiltroChamado = {false};
        FilterChain chain = (req, res) -> proximoFiltroChamado[0] = true;

        filtro.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
        assertThat(proximoFiltroChamado[0]).isTrue();
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CypherKeyAuthenticationFilterTest`
Expected: FAIL — o filtro ainda é permissivo em toda rota, `ingestaoPostSemChaveDevolve401ENaoChamaProximoFiltro` recebe status 200 (default do `MockHttpServletResponse`) em vez de 401

- [ ] **Step 3: Tornar o filtro obrigatório na ingestão**

Substituir o conteúdo inteiro de `src/main/java/com/dev4/cypher/security/CypherKeyAuthenticationFilter.java` por:

```java
package com.dev4.cypher.security;

import com.dev4.cypher.model.Camera;
import com.dev4.cypher.repository.CameraRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;

/**
 * Autentica ROLE_PIPELINE a partir do header X-Cypher-Key, validado contra
 * Camera.apiKey (spec E4 §2.3). Nas rotas de ingestão (POST/PATCH
 * /api/v1/incidents — nunca PUT .../status, que é ação do operador humano,
 * E3) o header agora é OBRIGATÓRIO: ausente ou inválido devolve 401 e
 * encerra a cadeia aqui, sem chamar {@code filterChain.doFilter}. Em
 * qualquer outra rota o comportamento continua exatamente como a Tarefa 8
 * deixou — autentica se a chave bater, segue adiante de qualquer forma.
 *
 * <p>Este é o flip final do plano (spec §5/§7): o pipeline Python
 * (`cypher-capture`) só passa a enviar o header numa entrega separada
 * (order-step 2), e essa mudança tem que já estar implantada antes deste
 * flip — por isso esta é sempre a última tarefa.
 *
 * <p>Nunca toca HttpSession — uma requisição de pipeline não carrega
 * cookie, e autenticar/rejeitar aqui não cria nem depende de sessão HTTP.
 *
 * <p>Registrado com {@code addFilterAfter(..., SecurityContextHolderFilter.class)}
 * (`SecurityConfig`, Tarefa 8): roda tecnicamente depois do filtro que
 * restaura o contexto a partir da sessão, mas nunca lê a sessão — é
 * "independente da sessão", o espírito de "antes do filtro de sessão" da
 * spec (E4 §2.3).
 */
public class CypherKeyAuthenticationFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Cypher-Key";

    private final CameraRepository cameras;

    public CypherKeyAuthenticationFilter(CameraRepository cameras) {
        this.cameras = cameras;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {
        String chave = request.getHeader(HEADER);
        Optional<Camera> camera = chave != null ? cameras.findByApiKey(chave) : Optional.empty();
        camera.ifPresent(c ->
                SecurityContextHolder.getContext().setAuthentication(new PipelineAuthentication(c.getId())));

        if (isRotaDeIngestao(request) && camera.isEmpty()) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        filterChain.doFilter(request, response);
    }

    /** POST /api/v1/incidents (criação) ou PATCH /api/v1/incidents/{incidentKey} (fechamento). */
    private boolean isRotaDeIngestao(HttpServletRequest request) {
        String metodo = request.getMethod();
        String caminho = request.getRequestURI();
        if ("POST".equals(metodo) && "/api/v1/incidents".equals(caminho)) {
            return true;
        }
        return "PATCH".equals(metodo) && caminho.startsWith("/api/v1/incidents/");
    }
}
```

- [ ] **Step 4: Rodar o teste do filtro isolado e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CypherKeyAuthenticationFilterTest`
Expected: PASS

- [ ] **Step 5: Rodar a suíte completa e confirmar a quebra esperada**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: FAIL em `IncidentIngestionApiTest`, `IncidentQueryApiTest` (no `@BeforeEach`), `IncidentEventPublicationTest`, `IncidentOperatorScopeApiTest` (no `@BeforeEach`) e `SecurityLockdownApiTest` (`ingestaoContinuaAbertaSemChave`) — os únicos arquivos que chamam `POST`/`PATCH /api/v1/incidents` sem o header

- [ ] **Step 6: Retroalimentar `IncidentIngestionApiTest`**

Substituir o conteúdo inteiro de `src/test/java/com/dev4/cypher/IncidentIngestionApiTest.java` por:

```java
package com.dev4.cypher;

import com.dev4.cypher.model.Camera;
import com.dev4.cypher.repository.CameraRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static com.dev4.cypher.security.CypherKeyAuthenticationFilter.HEADER;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class IncidentIngestionApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private CameraRepository cameras;

    private static final String CHAVE = "chave-ingestao-teste";

    private static final String QUEDA = """
            {
              "incidentKey": "CAM-01:run-api:track-7:20260810T143102482Z",
              "cameraId": "CAM-01",
              "runId": "run-api",
              "trackId": 7,
              "type": "FALL_RISK",
              "severity": 4,
              "reason": "fallen_sustained",
              "postureCategory": "immediate_risk",
              "rebaScore": 11,
              "actionLevel": 4,
              "zoneName": null,
              "zoneStatus": "outside",
              "epiPresent": ["HELMET", "VEST"],
              "epiMissing": [],
              "detectedAt": "2026-08-10T14:31:02.482-03:00",
              "snapshotUrl": null
            }
            """;

    /**
     * Upsert, nunca `deleteAll`: outras classes de teste do contexto padrão
     * também escrevem câmera/estação — apagar tudo aqui derrubaria fixture
     * de quem rodou antes na mesma suíte. A chave é reaproveitada por
     * qualquer câmera cadastrada (o filtro não compara com `cameraId` do
     * corpo — spec E4 §2.3).
     */
    @BeforeEach
    void garantirCameraDeIngestao() {
        if (cameras.findById("CAM-INGESTAO-TESTE").isEmpty()) {
            cameras.saveAndFlush(new Camera("CAM-INGESTAO-TESTE", "Camera de teste", "EST-INGESTAO-TESTE",
                    "http://127.0.0.1:8999/stream", "f", true, CHAVE));
        }
    }

    @Test
    void criaIncidenteEDevolve201() throws Exception {
        mvc.perform(post("/api/v1/incidents").header(HEADER, CHAVE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(QUEDA))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.type").value("FALL_RISK"))
                .andExpect(jsonPath("$.nivel").value("ALTO"))
                .andExpect(jsonPath("$.severity").value(4))
                .andExpect(jsonPath("$.status").value("PENDENTE"))
                .andExpect(jsonPath("$.zoneName").doesNotExist());
    }

    @Test
    void ingestaoSemChaveDevolve401() throws Exception {
        mvc.perform(post("/api/v1/incidents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(QUEDA.replace("run-api", "run-sem-chave")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void ingestaoComChaveInvalidaDevolve401() throws Exception {
        mvc.perform(post("/api/v1/incidents").header(HEADER, "chave-que-nao-existe")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(QUEDA.replace("run-api", "run-chave-invalida")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void ingestaoRepetidaDevolve200ComOMesmoId() throws Exception {
        String corpo = QUEDA.replace("run-api", "run-retry");

        String primeiro = mvc.perform(post("/api/v1/incidents").header(HEADER, CHAVE)
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        Integer idOriginal = com.jayway.jsonpath.JsonPath.read(primeiro, "$.id");

        mvc.perform(post("/api/v1/incidents").header(HEADER, CHAVE)
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(idOriginal));
    }

    @Test
    void rejeitaSeveridadeForaDaFaixa() throws Exception {
        mvc.perform(post("/api/v1/incidents").header(HEADER, CHAVE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(QUEDA.replace("\"severity\": 4", "\"severity\": 9")
                                .replace("run-api", "run-invalido")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejeitaPayloadSemChaveDeIdempotencia() throws Exception {
        mvc.perform(post("/api/v1/incidents").header(HEADER, CHAVE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(QUEDA.replace(
                                "\"incidentKey\": \"CAM-01:run-api:track-7:20260810T143102482Z\"",
                                "\"incidentKey\": \"\"")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void fechaIncidenteComDuracaoEPico() throws Exception {
        String corpo = QUEDA.replace("run-api", "run-close");
        mvc.perform(post("/api/v1/incidents").header(HEADER, CHAVE)
                .contentType(MediaType.APPLICATION_JSON).content(corpo));

        mvc.perform(patch("/api/v1/incidents/CAM-01:run-close:track-7:20260810T143102482Z")
                        .header(HEADER, CHAVE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "endedAt": "2026-08-10T14:31:09.140-03:00",
                                  "durationSeconds": 6.6,
                                  "peakSeverity": 4,
                                  "closedReason": "STATE_EXIT"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.durationSeconds").value(6.6))
                .andExpect(jsonPath("$.closedReason").value("STATE_EXIT"));
    }

    @Test
    void fechamentoSemChaveDevolve401() throws Exception {
        mvc.perform(patch("/api/v1/incidents/nao-importa")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"durationSeconds\": 1.0}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void fechamentoDeChaveInexistenteDevolve404() throws Exception {
        mvc.perform(patch("/api/v1/incidents/nao-existe").header(HEADER, CHAVE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"durationSeconds\": 1.0}"))
                .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 7: Retroalimentar `IncidentQueryApiTest`**

Em `src/test/java/com/dev4/cypher/IncidentQueryApiTest.java`, acrescentar os imports:

```java
import com.dev4.cypher.model.Camera;
import com.dev4.cypher.repository.CameraRepository;

import static com.dev4.cypher.security.CypherKeyAuthenticationFilter.HEADER;
```

E acrescentar `.header(HEADER, "chave-ingestao-teste")` às 3 chamadas de ingestão do `@BeforeEach` (a mesma câmera `CAM-INGESTAO-TESTE`/chave `chave-ingestao-teste` da Tarefa 13, Step 6, já existe no banco compartilhado a essa altura da suíte — mas para não depender de ordem de execução entre classes, acrescentar aqui também a garantia local):

```java
    @Autowired
    private CameraRepository cameras;

    @BeforeEach
    void semear() throws Exception {
        gestor = loginGestorBootstrap(mvc);
        if (cameras.findById("CAM-INGESTAO-TESTE").isEmpty()) {
            cameras.saveAndFlush(new Camera("CAM-INGESTAO-TESTE", "Camera de teste",
                    "EST-INGESTAO-TESTE", "http://127.0.0.1:8999/stream", "f", true, "chave-ingestao-teste"));
        }
        repository.deleteAll();
        mvc.perform(post("/api/v1/incidents").header(HEADER, "chave-ingestao-teste")
                .contentType(MediaType.APPLICATION_JSON)
                .content(incidente("q1", "CAM-01", 4, "FALL_RISK", "2026-08-10T08:00:00-03:00")));
        mvc.perform(post("/api/v1/incidents").header(HEADER, "chave-ingestao-teste")
                .contentType(MediaType.APPLICATION_JSON)
                .content(incidente("q2", "CAM-02", 2, "ERGONOMIC_RISK", "2026-08-10T09:00:00-03:00")));
        mvc.perform(post("/api/v1/incidents").header(HEADER, "chave-ingestao-teste")
                .contentType(MediaType.APPLICATION_JSON)
                .content(incidente("q3", "CAM-01", 3, "ZONE_VIOLATION", "2026-08-10T10:00:00-03:00")));
    }
```

- [ ] **Step 8: Retroalimentar `IncidentEventPublicationTest`**

Em `src/test/java/com/dev4/cypher/IncidentEventPublicationTest.java`, acrescentar os imports:

```java
import com.dev4.cypher.model.Camera;
import com.dev4.cypher.repository.CameraRepository;

import static com.dev4.cypher.security.CypherKeyAuthenticationFilter.HEADER;
```

Acrescentar o campo e um `@BeforeEach` (a classe não tinha nenhum até aqui):

```java
    @Autowired
    private CameraRepository cameras;

    @BeforeEach
    void garantirCameraDeIngestao() {
        if (cameras.findById("CAM-INGESTAO-TESTE").isEmpty()) {
            cameras.saveAndFlush(new Camera("CAM-INGESTAO-TESTE", "Camera de teste", "EST-INGESTAO-TESTE",
                    "http://127.0.0.1:8999/stream", "f", true, "chave-ingestao-teste"));
        }
    }
```

E acrescentar `.header(HEADER, "chave-ingestao-teste")` às 3 chamadas `mvc.perform(post("/api/v1/incidents")...)` (uma em `publicaEventoSomenteDepoisDoCommit`, duas em `retryNaoRepublicaOEvento`):

```java
        mvc.perform(post("/api/v1/incidents").header(HEADER, "chave-ingestao-teste")
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
```

(a chamada de `GET /incidents/stream` em `streamAbreConexaoSse`, já com `.session(gestor)` desde a Tarefa 12, não muda — não é rota de ingestão)

- [ ] **Step 9: Retroalimentar `IncidentOperatorScopeApiTest`**

Em `src/test/java/com/dev4/cypher/IncidentOperatorScopeApiTest.java`, acrescentar os imports:

```java
import com.dev4.cypher.repository.CameraRepository;

import static com.dev4.cypher.security.CypherKeyAuthenticationFilter.HEADER;
```

Acrescentar o campo e usar a `apiKey` real da câmera `CAM-91` (gerada pela Tarefa 6, não um literal) nas duas chamadas de ingestão do `setUp`:

```java
    @Autowired
    private AlertaRepository alertas;

    @Autowired
    private CameraRepository cameras;
```

```java
        String chave = cameras.findById("CAM-91").orElseThrow().getApiKey();

        String r1 = mvc.perform(post("/api/v1/incidents").header(HEADER, chave)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(incidente("op1", "CAM-91")))
                .andReturn().getResponse().getContentAsString();
        idIncidenteEst01 = ((Number) com.jayway.jsonpath.JsonPath.read(r1, "$.id")).longValue();

        String r2 = mvc.perform(post("/api/v1/incidents").header(HEADER, chave)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(incidente("op2", "CAM-92")))
                .andReturn().getResponse().getContentAsString();
        idIncidenteEst02 = ((Number) com.jayway.jsonpath.JsonPath.read(r2, "$.id")).longValue();
```

(a `chave` de `CAM-91` autentica igualmente para o incidente postado com `cameraId: "CAM-92"` — o filtro nunca compara a chave com o `cameraId` do corpo, spec E4 §2.3; reaproveitar uma única chave para as duas chamadas é deliberado, não descuido)

- [ ] **Step 10: Retroalimentar `SecurityLockdownApiTest`**

Em `src/test/java/com/dev4/cypher/SecurityLockdownApiTest.java`, trocar o teste `ingestaoContinuaAbertaSemChave` (cujo nome e comportamento eram específicos da Tarefa 12, antes do flip) por:

```java
    @Test
    void ingestaoSemChaveDevolve401AposOFlipFinal() throws Exception {
        mvc.perform(post("/api/v1/incidents").contentType(MediaType.APPLICATION_JSON).content("""
                {
                  "incidentKey": "CAM-01:run-lock:track-1:20260810T160000000Z",
                  "cameraId": "CAM-01", "runId": "run-lock", "trackId": 1,
                  "type": "FALL_RISK", "severity": 4, "reason": "r",
                  "postureCategory": "immediate_risk", "rebaScore": 11, "actionLevel": 4,
                  "zoneName": null, "zoneStatus": "outside", "epiPresent": [], "epiMissing": [],
                  "detectedAt": "2026-08-10T16:00:00Z", "snapshotUrl": null
                }
                """)).andExpect(status().isUnauthorized());
    }
```

- [ ] **Step 11: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS

- [ ] **Step 12: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/security/CypherKeyAuthenticationFilter.java \
        src/test/java/com/dev4/cypher/security/CypherKeyAuthenticationFilterTest.java \
        src/test/java/com/dev4/cypher/IncidentIngestionApiTest.java \
        src/test/java/com/dev4/cypher/IncidentQueryApiTest.java \
        src/test/java/com/dev4/cypher/IncidentEventPublicationTest.java \
        src/test/java/com/dev4/cypher/IncidentOperatorScopeApiTest.java \
        src/test/java/com/dev4/cypher/SecurityLockdownApiTest.java
git commit -m "feat(security): torna X-Cypher-Key obrigatorio na ingestao (flip final)"
```

---

## Self-Review

**Cobertura da spec (`docs/superpowers/specs/2026-08-23-acesso-e-equipes-e4-design.md`):**

- §2.1 `HttpSession`/`JSESSIONID`, sem JWT → Tarefa 7 (`SecurityContextRepository` + `AuthController`); cookie `SameSite=Lax` configurado em `application.yaml` na mesma tarefa.
- §2.2 dois papéis/dois endpoints de login, corpo de resposta `{papel, username|estacaoId}` → Tarefa 7 (`AuthResponse.gestor`/`.operador`, `LoginRequest`/`LoginEstacaoRequest`), `POST /auth/logout` e `GET /auth/me` também na Tarefa 7, travados como GESTOR-ou-OPERADOR na Tarefa 12.
- §2.3 `X-Cypher-Key` por câmera, filtro antes do que a sessão restaura, `ROLE_PIPELINE` → Tarefa 6 (`Camera.apiKey`), Tarefa 8 (filtro permissivo), Tarefa 13 (obrigatório só na ingestão).
- §2.4 `Estacao.token`, `EstacaoAdminResponse`, `/token/regenerate` → Tarefas 4 e 5. Decisão de design registrada na Tarefa 5 (createStation/updateStation passam a devolver `EstacaoAdminResponse`) documentada e verificada contra o plano irmão do front.
- §2.5 `Usuario` só GESTOR, setup de execução única no lugar do seed estático descartado (nota "Revisado em 2026-08-23, segunda rodada de design") → Tarefa 2 (`Usuario`/`UsuarioRepository` + `GET /setup/status`) e Tarefa 7 (`POST /setup`, que só pode existir depois que `GestorAuthentication`/`SessionAuthenticator` existem — por isso o endpoint fica partido entre as duas tarefas, documentado em ambas). `409` em `POST /setup` já configurado → Tarefa 7 e reforçado na Tarefa 12 (`setupPosConfiguradoDevolve409NaoAutenticacao`, provando que o 409 vem da regra de negócio, não do muro de sessão). `papel` sempre `"GESTOR"` na resposta → Tarefa 10 (`UsuarioResponse`/`UsuarioService.toResponse`) e Tarefa 7 (`AuthResponse.gestor`, reaproveitado por `SetupController.setup`).
- §2.6 tabela completa de endpoints/proteção → Tarefa 12 traduz cada linha em `requestMatchers`; a restrição de `estacaoId` para OPERADOR (linha "restrito à própria estacaoId") é a Tarefa 11, que precisa vir antes para a Tarefa 12 ter o que travar de fato. Verificado linha a linha:
  - `/health` público → Tarefa 12 (permitAll).
  - `/setup/status` público, `/setup` público-execução-única → Tarefa 2 (`GET /status`) + Tarefa 7 (`POST`) + Tarefa 12 (permitAll nos dois, ao lado de `/auth/login`).
  - `/auth/login`, `/auth/login-estacao` público → Tarefa 12 (permitAll).
  - `/auth/logout`, `/auth/me` GESTOR-ou-OPERADOR → Tarefa 12 (`hasAnyRole`).
  - `/incidents` POST/PATCH chave de câmera → permissivo na Tarefa 8, obrigatório na Tarefa 13.
  - `/incidents` GET, `/incidents/stream`, `/incidents/{id}`, `/incidents/{id}/status` GESTOR ou OPERADOR-restrito → Tarefa 11 (filtro/403) + Tarefa 12 (`hasAnyRole` na cadeia).
  - `/summary` GESTOR → Tarefa 12 (catch-all).
  - `/cameras`, `/stations` GET lista GESTOR-ou-OPERADOR, sem filtro de `estacaoId` → Tarefa 12 (`hasAnyRole`); a ausência de filtro é a mesma dos endpoints hoje — nenhuma tarefa deste plano adiciona um.
  - `/cameras/{id}` GET GESTOR → Tarefa 12 (catch-all, nenhum `requestMatchers` explícito cobre essa rota).
  - `/cameras`, `/stations` POST/PUT/DELETE GESTOR → Tarefa 12 (catch-all).
  - `/cameras/{id}/config` GET chave-ou-GESTOR → Tarefa 12 (`hasAnyRole("PIPELINE", "GESTOR")`).
  - `/stations/{id}/token/regenerate` POST GESTOR → Tarefa 5 (endpoint) + Tarefa 12 (catch-all).
  - `/teams` GESTOR → Tarefa 9 (endpoint) + Tarefa 12 (catch-all).
  - `/users` GESTOR → Tarefa 10 (endpoint) + Tarefa 12 (catch-all).
- §3 `Equipe` (id, nome, `Turno`, `estacaoIds`, `ativa`) e unicidade `(estacaoId, turno)` a nível de aplicação → Tarefa 3 (entidade/repositório, campos idênticos ao snippet da spec) + Tarefa 9 (`EquipeService.exigirSemConflito`, nunca constraint de banco).
- §5/§7 sequenciamento (backend em modo permissivo primeiro, capture depois, front depois, flip final por último) → Global Constraints já fixava isso antes da Tarefa 1; este plano cobre só o passo 1 e o passo 4 de §7 (capture e front são os planos irmãos) — Tarefas 1–12 são o passo 1 (permissivo), Tarefa 13 é o passo 4 (flip), sempre por último.
- §6 fora de escopo → nada implementado aqui contradiz a lista: sem tela de "esqueci senha" (não existe endpoint de recuperação), sem auto-registro público além do bootstrap único (`POST /setup`, Tarefa 7, fecha com 409 depois do primeiro uso — não é um `/register` reaberto, mesma leitura da spec E4 §6) + CRUD GESTOR-only (Tarefa 10), sem escala por data (`Equipe.estacaoIds` é alocação estática, sem campo de data), sem rotação automática de token (só `/token/regenerate` manual, Tarefa 5), sem rate limiting de login (nenhuma tarefa adiciona), sem papel além de GESTOR/OPERADOR/PIPELINE (`Usuario` não tem coluna de papel — Tarefa 2).

**Placeholders:** nenhum — todo passo tem código completo, comandos `Run:` reais com critério de PASS/FAIL explícito, e nenhuma referência a método/tipo não definido em alguma tarefa deste arquivo.

**Consistência de tipos e assinaturas entre tarefas:**
- `TokenGenerator.novo(String): String` (Tarefa 4) é a única fonte de token opaco — reusado sem reimplementação em `CatalogService.createStation`/`regenerateToken` (Tarefa 5) e `CatalogService.createCamera` (Tarefa 6), e nos dois seeders (`CatalogSeeder`, Tarefa 4/6).
- `Estacao(String id, String nome, String setor, boolean ativa, String token)` — 5 argumentos a partir da Tarefa 4 — usado com essa mesma aridade em `CatalogSeeder`, `CatalogService`, `CatalogRepositoryTest` (Tarefa 4) e `EquipeServiceTest`/`TeamControllerApiTest`/`IncidentOperatorScopeApiTest` (Tarefas 9/11, só via `POST /stations`, nunca construtor direto). `Camera(..., boolean ativa, String apiKey)` — 7 argumentos a partir da Tarefa 6 — mesma disciplina: todo `new Camera(...)` direto em teste (Tarefas 6, 8, 11, 13) usa os 7 argumentos.
- `GestorAuthentication.getUsername()`/`OperadorAuthentication.getEstacaoId()`/`PipelineAuthentication.getCameraId()` (Tarefa 7/8) são lidos com a mesma assinatura em `AuthController.me()` (Tarefa 7), `IncidentController` (Tarefa 11, `estacaoIdDoOperadorAtual`/`foraDoEscopoDoOperador`) e nos testes de filtro (Tarefa 8/13) — nenhuma leitura alternativa (ex.: via `getPrincipal()` desencapsulado) aparece em nenhuma tarefa.
- `AuthResponse.gestor(String)`/`.operador(String)` (Tarefa 7) são os únicos construtores de resposta usados por `AuthController` — nenhuma tarefa monta um `AuthResponse` com o construtor canônico dos 3 argumentos fora desses dois métodos de fábrica.
- `IncidentService.search(OffsetDateTime, String, Integer, AlertaStatus, String estacaoId, Pageable)` (Tarefa 11, 6 parâmetros) é chamado com essa assinatura só por `IncidentController.list` — nenhum outro chamador existe, então não há assinatura desatualizada para reconciliar.
- `IncidentSseService.subscribe(String)`/`.register(SseEmitter, String)` (Tarefa 11) substituem por completo as assinaturas de 1 argumento de `register` da Tarefa 1 original (o `IncidentSseServiceTest` é reescrito por inteiro na própria Tarefa 11, não deixa nenhuma chamada da forma antiga) — `subscribe()` sem argumento continua existindo como sobrecarga, chamado por `IncidentEventPublicationTest`/testes que não passam `estacaoId`.
- `CypherKeyAuthenticationFilter.HEADER` (Tarefa 8) é a única fonte do literal `"X-Cypher-Key"` — toda tarefa que precisa do nome do header (Tarefa 13, em 4 arquivos de teste) importa a constante em vez de repetir a string, exceto onde o valor da PRÓPRIA constante está sendo testado (`CypherKeyAuthenticationFilterTest`, que usa `CypherKeyAuthenticationFilter.HEADER` também).
- `UserRequest(String username, String papel, String password)`/`UsuarioResponse(Long id, String username, String papel)` (Tarefa 10) batem exatamente com o contrato `UsuarioPayload = { username, papel, password? }` fixado pelo plano irmão do front (`e4c-front-acesso-equipes.md`, Global Constraints) — `password` ausente/vazia em edição sem redefinição, presente e obrigatória na criação, mesma regra dos dois lados.
- `TeamRequest`/`TeamResponse` (Tarefa 9) espelham o `Equipe` da Tarefa 3 campo a campo (`id`, `nome`, `turno`, `estacaoIds`, `ativa`) — nenhum campo renomeado entre entidade e DTO.
- `SessionAuthenticator.autenticar(Authentication, HttpServletRequest, HttpServletResponse)` (Tarefa 7) é o ÚNICO ponto que grava `SecurityContext` na sessão — `AuthController.login`/`.loginEstacao` e `SetupController.setup` chamam o mesmo bean, nenhuma tarefa reimplementa a gravação inline (a versão original do `AuthController`, antes da revisão, tinha um método privado `autenticar` fazendo isso só para si; a extração existe precisamente para que `SetupController` não precisasse duplicá-lo, mesmo risco de bean divergente que a Tarefa 7/12 já documentavam para `SecurityContextRepository`).
- `AuthTestSupport.loginGestorBootstrap(MockMvc)` (Tarefa 7) é auto-provisionante desde a revisão que removeu o seed: tenta `POST /setup` e cai para `POST /auth/login` só em 409. Todo `Usuario` "primeiro" de um contexto de teste nasce por esse caminho ou pelo fallback idempotente equivalente em `AuthControllerApiTest` (`existsByUsername` antes de `save`) — nenhuma classe deste plano cria um `Usuario` com um username diferente de `admin` antes de uma dessas duas chamadas, o que é a garantia de que o fallback para `/auth/login` sempre encontra a credencial fixa esperada, independente da ordem de execução entre classes de teste.

**Risco que este plano assume conscientemente:** a Tarefa 12 retroalimenta 6 arquivos de teste pré-existentes (os únicos anteriores à Tarefa 7 que fazem chamada HTTP a um endpoint agora protegido) com sessão GESTOR; a Tarefa 13 retroalimenta mais 5 (os que chamam ingestão sem header). Nenhuma tarefa entre a 8 e a 11 toca esses arquivos — cada uma delas continua rodando a suíte inteira e confirmando `BUILD SUCCESS` sem eles, então uma regressão de esquecer um arquivo apareceria imediatamente na Tarefa seguinte (mesmo padrão de detecção rápida usado pelo plano irmão do front para a evolução de `/auth/login`). A escolha de fazer `CypherKeyAuthenticationFilter` decidir sozinho quando rejeitar (em vez de mover a regra para `SecurityConfig`) é a peça mais fácil de "simplificar por engano" numa revisão futura — o comentário na Tarefa 13 e a Global Constraint sobre 401-vs-403 (Tarefa 12) explicam por que a rejeição não pode virar `hasRole("PIPELINE")` na cadeia sem perder o código de status certo.

**Risco assumido na revisão do setup (Tarefa 2/2026-08-23):** `POST /api/v1/setup` foi originalmente cogitado inteiro na Tarefa 2, mas precisa de `GestorAuthentication` e do bean `SecurityContextRepository`, que só existem a partir da Tarefa 7 — colocá-lo todo na Tarefa 2 quebraria a compilação da suíte TDD nesse ponto. A resolução foi partir o endpoint: `GET /setup/status` (sem dependência de sessão) fica na Tarefa 2 junto com `Usuario`/`UsuarioRepository`; `POST /setup` é acrescentado ao mesmo `SetupController` na Tarefa 7, na mesma tarefa que cria o mecanismo de sessão de que ele depende. `AuthTestSupport.loginGestorBootstrap`, que dezenas de testes de tarefas posteriores chamam, também é reescrito nessa mesma tarefa para não depender de nenhum seed — sem isso, toda tarefa a partir da 9 quebraria por falta do gestor bootstrap.
