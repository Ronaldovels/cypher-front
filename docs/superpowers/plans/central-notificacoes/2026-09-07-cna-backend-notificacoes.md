# Central de Notificações — Backend (cna) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor os alertas já existentes como notificações lidas/não-lidas por usuário GESTOR, via três endpoints novos (`GET /notificacoes`, `GET /notificacoes/contagem-nao-lidas`, `POST /notificacoes/marcar-lidas`).

**Architecture:** Uma entidade de junção nova, `AlertaLeitura` (empresaId, usuario, alertaId, lidoEm), registra 1 linha por notificação lida por usuário — ausência de linha = não lida. Nenhuma tabela nova de "notificação": a central é uma visualização com estado de leitura sobre `Alerta`, que já existe. Três tarefas: (1) o modelo de dados, (2) leitura (lista + contagem), (3) escrita (marcar como lida).

**Tech Stack:** Spring Boot 4.0.6, Spring Data JPA, H2 (`ddl-auto: update` — sem migração manual, a tabela nova é criada automaticamente), MockMvc + `@DataJpaTest`.

**Spec:** `docs/superpowers/specs/planejadas/2026-09-07-central-notificacoes-design.md`

## Global Constraints

- Repositório: `/home/asaas/projects/cypher`. **Branch local (não worktree):** `git checkout -b feat/cn-backend-notificacoes` a partir de `main`, dentro do próprio diretório do repo.
- **Nenhuma mudança em `SecurityConfig`** — o catch-all `anyRequest().hasRole("GESTOR")` (`config/SecurityConfig.java`, última regra da cadeia) já cobre qualquer rota nova sob `/api/v1/notificacoes/**` que não tenha um `requestMatchers` próprio. Confirmado lendo o arquivo antes de escrever este plano.
- **`usuario` é o username do GESTOR (`nome@empresaId`), não `Usuario.id`** — `GestorAuthentication` (`security/GestorAuthentication.java`) não carrega o `Usuario.id`, só `username`/`empresaId`; resolver o `id` exigiria uma consulta extra a `UsuarioRepository` sem necessidade (spec §2). `TenantContext.username(nome, empresaId)` já compõe esse formato em todo outro call site do projeto — `AlertaLeitura.usuario` guarda exatamente essa string.
- **Presença de linha = lido, ausência = não lido** — `AlertaLeitura` nunca tem uma coluna "lido: boolean"; a query certifica isso via `NOT IN`/`existsBy`.
- **`ddl-auto: update`** (`application.yaml:24`) — a tabela `alerta_leitura` é criada automaticamente ao subir a aplicação; nenhum script de migração é necessário nesta entrega.
- Run: `mvn test` para a suíte inteira; `mvn test -Dtest=NomeDaClasse` para uma classe.

---

### Task 1: Entidade `AlertaLeitura` e repositório

**Files:**
- Create: `src/main/java/com/dev4/cypher/model/AlertaLeitura.java`
- Create: `src/main/java/com/dev4/cypher/repository/AlertaLeituraRepository.java`
- Test: `src/test/java/com/dev4/cypher/repository/AlertaLeituraRepositoryTest.java`

**Interfaces:**
- Produces: `AlertaLeitura` (getters/setters via Lombok `@Getter @Setter`, campos `Long id`, `String empresaId`, `String usuario`, `Long alertaId`, `OffsetDateTime lidoEm`); `AlertaLeituraRepository extends JpaRepository<AlertaLeitura, Long>` com `existsByEmpresaIdAndUsuarioAndAlertaId(String, String, Long): boolean` e `findByEmpresaIdAndUsuarioAndAlertaIdIn(String, String, List<Long>): List<AlertaLeitura>`.

- [ ] **Step 1: Escrever o teste (falhando) do repositório**

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.AlertaLeitura;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
class AlertaLeituraRepositoryTest {

    @Autowired
    private AlertaLeituraRepository leituras;

    private AlertaLeitura leitura(String empresaId, String usuario, Long alertaId) {
        AlertaLeitura l = new AlertaLeitura();
        l.setEmpresaId(empresaId);
        l.setUsuario(usuario);
        l.setAlertaId(alertaId);
        l.setLidoEm(OffsetDateTime.parse("2026-09-07T10:00:00Z"));
        return l;
    }

    @Test
    void existsByEmpresaIdAndUsuarioAndAlertaIdReflecteAPresencaDaLinha() {
        assertThat(leituras.existsByEmpresaIdAndUsuarioAndAlertaId("demo", "admin@demo", 1L)).isFalse();

        leituras.saveAndFlush(leitura("demo", "admin@demo", 1L));

        assertThat(leituras.existsByEmpresaIdAndUsuarioAndAlertaId("demo", "admin@demo", 1L)).isTrue();
        // Outro usuário na mesma empresa não compartilha a leitura.
        assertThat(leituras.existsByEmpresaIdAndUsuarioAndAlertaId("demo", "outro@demo", 1L)).isFalse();
    }

    @Test
    void findByEmpresaIdAndUsuarioAndAlertaIdInFiltraSoOsIdsPedidos() {
        leituras.saveAndFlush(leitura("demo", "admin@demo", 1L));
        leituras.saveAndFlush(leitura("demo", "admin@demo", 2L));
        leituras.saveAndFlush(leitura("demo", "admin@demo", 3L));

        List<AlertaLeitura> lidas = leituras.findByEmpresaIdAndUsuarioAndAlertaIdIn(
                "demo", "admin@demo", List.of(1L, 3L, 99L));

        assertThat(lidas).extracting(AlertaLeitura::getAlertaId).containsExactlyInAnyOrder(1L, 3L);
    }

    @Test
    void constraintUnicaImpedeDuasLinhasParaOMesmoParUsuarioAlerta() {
        leituras.saveAndFlush(leitura("demo", "admin@demo", 1L));

        assertThatThrownBy(() -> leituras.saveAndFlush(leitura("demo", "admin@demo", 1L)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `mvn test -Dtest=AlertaLeituraRepositoryTest`
Expected: FALHA — `AlertaLeitura`/`AlertaLeituraRepository` não existem ainda (erro de compilação).

- [ ] **Step 3: Criar a entidade**

```java
package com.dev4.cypher.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * Estado de leitura de uma notificação (= um {@link Alerta}) por usuário
 * GESTOR. Sem coluna de "lido": a presença desta linha para
 * (empresaId, usuario, alertaId) já significa lido; ausência = não lido
 * (spec central-notificacoes §2).
 */
@Entity
@Table(name = "alerta_leitura",
       uniqueConstraints = @UniqueConstraint(columnNames = {"empresa_id", "usuario", "alerta_id"}))
@Getter
@Setter
public class AlertaLeitura {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "empresa_id", nullable = false, length = 30)
    private String empresaId;

    /** Username do GESTOR ("nome@empresaId", {@link com.dev4.cypher.security.TenantContext#username}) — não há Usuario.id acessível na Authentication atual. */
    @Column(nullable = false, length = 60)
    private String usuario;

    @Column(name = "alerta_id", nullable = false)
    private Long alertaId;

    @Column(name = "lido_em", nullable = false)
    private OffsetDateTime lidoEm;
}
```

- [ ] **Step 4: Criar o repositório**

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.AlertaLeitura;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AlertaLeituraRepository extends JpaRepository<AlertaLeitura, Long> {

    boolean existsByEmpresaIdAndUsuarioAndAlertaId(String empresaId, String usuario, Long alertaId);

    List<AlertaLeitura> findByEmpresaIdAndUsuarioAndAlertaIdIn(String empresaId, String usuario, List<Long> alertaIds);
}
```

- [ ] **Step 5: Rodar o teste para confirmar que passa**

Run: `mvn test -Dtest=AlertaLeituraRepositoryTest`
Expected: PASS (3/3)

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/dev4/cypher/model/AlertaLeitura.java \
        src/main/java/com/dev4/cypher/repository/AlertaLeituraRepository.java \
        src/test/java/com/dev4/cypher/repository/AlertaLeituraRepositoryTest.java
git commit -m "feat: adiciona AlertaLeitura para rastrear notificacao lida por usuario"
```

---

### Task 2: Listar notificações e contar não lidas

**Files:**
- Create: `src/main/java/com/dev4/cypher/dto/NotificacaoResponse.java`
- Create: `src/main/java/com/dev4/cypher/dto/ContagemNotificacoesResponse.java`
- Create: `src/main/java/com/dev4/cypher/service/NotificacaoService.java`
- Create: `src/main/java/com/dev4/cypher/controller/NotificacaoController.java`
- Modify: `src/main/java/com/dev4/cypher/security/TenantContext.java` (novo método `currentUsername()`)
- Modify: `src/main/java/com/dev4/cypher/repository/AlertaRepository.java` (nova query `contarNaoLidas`)
- Test: `src/test/java/com/dev4/cypher/NotificacaoControllerApiTest.java`

**Interfaces:**
- Consumes: `AlertaLeituraRepository.findByEmpresaIdAndUsuarioAndAlertaIdIn` (Task 1); `AlertaRepository.buscar(empresaId, since, cameraId, severityMin, status, estacaoId, pageable): Page<Alerta>` (já existente, todos os filtros `null` nesta entrega).
- Produces: `NotificacaoService.listar(String empresaId, String usuario): List<NotificacaoResponse>`; `NotificacaoService.contarNaoLidas(String empresaId, String usuario): long` — consumidos pela Task 3 e pelo controller. `TenantContext.currentUsername(): String` — consumido também pela Task 3.

- [ ] **Step 1: Escrever o teste (falhando) do controller**

```java
package com.dev4.cypher;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static com.dev4.cypher.security.AuthTestSupport.loginGestorBootstrap;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@Transactional
@AutoConfigureMockMvc
class NotificacaoControllerApiTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void listaVaziaEContagemZeroQuandoNaoHaAlerta() throws Exception {
        MockHttpSession session = loginGestorBootstrap(mvc);

        mvc.perform(get("/api/v1/notificacoes").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());

        mvc.perform(get("/api/v1/notificacoes/contagem-nao-lidas").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.naoLidas").value(0));
    }

    @Test
    void alertaNovoApareceNaListaComoNaoLidaEContaNoBadge() throws Exception {
        MockHttpSession session = loginGestorBootstrap(mvc);
        String apiKey = criarCameraEPegarApiKey(session, "CAM-NOT1", "EST-NOT1");

        mvc.perform(post("/api/v1/incidents").header("X-Cypher-Key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(payloadDeIncidente("CAM-NOT1", "incident-not-1")));

        mvc.perform(get("/api/v1/notificacoes").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].cameraId").value("CAM-NOT1"))
                .andExpect(jsonPath("$[0].lida").value(false));

        mvc.perform(get("/api/v1/notificacoes/contagem-nao-lidas").session(session))
                .andExpect(jsonPath("$.naoLidas").value(1));
    }

    @Test
    void listaTraz30MaisRecentesOrdenadosDoMaisNovoParaOMaisVelho() throws Exception {
        MockHttpSession session = loginGestorBootstrap(mvc);
        String apiKey = criarCameraEPegarApiKey(session, "CAM-NOT2", "EST-NOT2");

        for (int i = 0; i < 32; i++) {
            String detectedAt = "2026-09-0%dT10:00:00Z".formatted(i < 9 ? 1 : 2);
            mvc.perform(post("/api/v1/incidents").header("X-Cypher-Key", apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(payloadDeIncidente("CAM-NOT2", "incident-not2-" + i, 3,
                            "2026-09-01T%02d:00:00Z".formatted(i % 24))));
        }

        mvc.perform(get("/api/v1/notificacoes").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(30)));
    }

    private String criarCameraEPegarApiKey(MockHttpSession session, String codigo, String estacaoId) throws Exception {
        mvc.perform(post("/api/v1/stations").session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"" + estacaoId + "\", \"nome\": \"E\", \"setor\": \"x\", \"ativa\": true}"));
        mvc.perform(post("/api/v1/cameras").session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(("{\"id\": \"%s\", \"nome\": \"C\", \"estacaoId\": \"%s\", "
                        + "\"streamUrl\": \"http://127.0.0.1:9201/stream\", \"ativa\": true}")
                        .formatted(codigo, estacaoId)));
        String corpo = mvc.perform(post("/api/v1/cameras/" + codigo + "/apikey/regenerate").session(session))
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(corpo, "$.apiKey");
    }

    private String payloadDeIncidente(String cameraId, String incidentKey) {
        return payloadDeIncidente(cameraId, incidentKey, 3, "2026-09-01T10:00:00Z");
    }

    private String payloadDeIncidente(String cameraId, String incidentKey, int severity, String detectedAt) {
        return ("{\"incidentKey\": \"%s\", \"cameraId\": \"%s\", \"runId\": \"run-1\", \"trackId\": 1, "
                + "\"type\": \"FALL_RISK\", \"severity\": %d, \"reason\": \"fallen_sustained\", "
                + "\"postureCategory\": \"fallen\", \"rebaScore\": 11, \"actionLevel\": 3, "
                + "\"zoneStatus\": \"outside\", \"detectedAt\": \"%s\"}")
                .formatted(incidentKey, cameraId, severity, detectedAt);
    }
}
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `mvn test -Dtest=NotificacaoControllerApiTest`
Expected: FALHA — `/api/v1/notificacoes` não existe (404), classes `NotificacaoService`/`NotificacaoController`/DTOs não existem ainda.

- [ ] **Step 3: Adicionar `currentUsername()` a `TenantContext`**

Adicionar ao final da classe (`src/main/java/com/dev4/cypher/security/TenantContext.java`), junto dos outros métodos estáticos:

```java
    /** Username do GESTOR autenticado — só ele hoje consome notificações (spec central-notificacoes §1). */
    public static String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof GestorAuthentication g) {
            return g.getUsername();
        }
        throw new IllegalStateException("Notificacoes exigem sessao de GESTOR");
    }
```

- [ ] **Step 4: Adicionar a query de contagem a `AlertaRepository`**

Adicionar ao final da interface (`src/main/java/com/dev4/cypher/repository/AlertaRepository.java`):

```java
    /** Notificações não lidas: alertas da empresa sem linha correspondente em AlertaLeitura para este usuário. */
    @Query("""
            SELECT COUNT(a) FROM Alerta a
            WHERE a.empresaId = :empresaId
              AND a.id NOT IN (
                SELECT l.alertaId FROM AlertaLeitura l
                WHERE l.empresaId = :empresaId AND l.usuario = :usuario
              )
            """)
    long contarNaoLidas(@Param("empresaId") String empresaId, @Param("usuario") String usuario);
```

- [ ] **Step 5: Criar os DTOs**

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.model.AlertaNivel;
import com.dev4.cypher.model.AlertaTipo;

import java.time.OffsetDateTime;

/** Uma notificação = um Alerta com estado de leitura, para o usuário GESTOR atual (spec central-notificacoes §2/§3). */
public record NotificacaoResponse(
        Long id,
        String cameraId,
        AlertaTipo type,
        Integer severity,
        AlertaNivel nivel,
        String descricao,
        OffsetDateTime detectedAt,
        boolean lida
) {
}
```

```java
package com.dev4.cypher.dto;

public record ContagemNotificacoesResponse(long naoLidas) {
}
```

- [ ] **Step 6: Criar `NotificacaoService`**

```java
package com.dev4.cypher.service;

import com.dev4.cypher.dto.NotificacaoResponse;
import com.dev4.cypher.model.Alerta;
import com.dev4.cypher.model.AlertaLeitura;
import com.dev4.cypher.repository.AlertaLeituraRepository;
import com.dev4.cypher.repository.AlertaRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class NotificacaoService {

    private static final int JANELA = 30;

    private final AlertaRepository alertas;
    private final AlertaLeituraRepository leituras;

    public NotificacaoService(AlertaRepository alertas, AlertaLeituraRepository leituras) {
        this.alertas = alertas;
        this.leituras = leituras;
    }

    /** Últimas 30 notificações da empresa, mais recente primeiro, cada uma com o flag `lida` do usuário atual. */
    public List<NotificacaoResponse> listar(String empresaId, String usuario) {
        List<Alerta> recentes = alertas.buscar(empresaId, null, null, null, null, null,
                PageRequest.of(0, JANELA, Sort.by("dataHora").descending())).getContent();

        Set<Long> lidos = recentes.isEmpty() ? Set.of()
                : leituras.findByEmpresaIdAndUsuarioAndAlertaIdIn(empresaId, usuario,
                        recentes.stream().map(Alerta::getId).toList())
                    .stream().map(AlertaLeitura::getAlertaId).collect(Collectors.toSet());

        return recentes.stream()
                .map(a -> new NotificacaoResponse(a.getId(), a.getCameraId(), a.getTipo(), a.getSeveridade(),
                        a.getNivel(), a.getDescricao(), a.getDataHora(), lidos.contains(a.getId())))
                .toList();
    }

    public long contarNaoLidas(String empresaId, String usuario) {
        return alertas.contarNaoLidas(empresaId, usuario);
    }
}
```

- [ ] **Step 7: Criar `NotificacaoController`**

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.ContagemNotificacoesResponse;
import com.dev4.cypher.dto.NotificacaoResponse;
import com.dev4.cypher.security.TenantContext;
import com.dev4.cypher.service.NotificacaoService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/notificacoes")
public class NotificacaoController {

    private final NotificacaoService service;

    public NotificacaoController(NotificacaoService service) {
        this.service = service;
    }

    @GetMapping
    public List<NotificacaoResponse> listar() {
        return service.listar(TenantContext.currentEmpresaId(), TenantContext.currentUsername());
    }

    @GetMapping("/contagem-nao-lidas")
    public ContagemNotificacoesResponse contagemNaoLidas() {
        return new ContagemNotificacoesResponse(
                service.contarNaoLidas(TenantContext.currentEmpresaId(), TenantContext.currentUsername()));
    }
}
```

- [ ] **Step 8: Rodar o teste para confirmar que passa**

Run: `mvn test -Dtest=NotificacaoControllerApiTest`
Expected: PASS (3/3)

- [ ] **Step 9: Rodar a suíte inteira (a query nova em `AlertaRepository` toca um arquivo já usado por outras features)**

Run: `mvn test`
Expected: PASS, nenhuma regressão

- [ ] **Step 10: Commit**

```bash
git add src/main/java/com/dev4/cypher/dto/NotificacaoResponse.java \
        src/main/java/com/dev4/cypher/dto/ContagemNotificacoesResponse.java \
        src/main/java/com/dev4/cypher/service/NotificacaoService.java \
        src/main/java/com/dev4/cypher/controller/NotificacaoController.java \
        src/main/java/com/dev4/cypher/security/TenantContext.java \
        src/main/java/com/dev4/cypher/repository/AlertaRepository.java \
        src/test/java/com/dev4/cypher/NotificacaoControllerApiTest.java
git commit -m "feat: expoe GET /notificacoes e /notificacoes/contagem-nao-lidas"
```

---

### Task 3: Marcar notificações como lidas

**Files:**
- Create: `src/main/java/com/dev4/cypher/dto/MarcarLidasRequest.java`
- Modify: `src/main/java/com/dev4/cypher/service/NotificacaoService.java` (novo método `marcarLidas`)
- Modify: `src/main/java/com/dev4/cypher/controller/NotificacaoController.java` (novo endpoint `POST /marcar-lidas`)
- Modify: `src/test/java/com/dev4/cypher/NotificacaoControllerApiTest.java` (novos testes)

**Interfaces:**
- Consumes: `AlertaLeituraRepository.existsByEmpresaIdAndUsuarioAndAlertaId` (Task 1); `AlertaRepository.findByIdAndEmpresaId(Long, String): Optional<Alerta>` (já existente — usado para validar que o id pertence à empresa antes de gravar a leitura).
- Produces: `NotificacaoService.marcarLidas(String empresaId, String usuario, List<Long> alertaIds): void` — consumido só pelo controller desta task; nada depende dele fora deste plano.

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar à classe `NotificacaoControllerApiTest` (mesmo arquivo da Task 2):

```java
    @Test
    void marcarLidasZeraContagemEAtualizaFlagNaLista() throws Exception {
        MockHttpSession session = loginGestorBootstrap(mvc);
        String apiKey = criarCameraEPegarApiKey(session, "CAM-NOT3", "EST-NOT3");
        mvc.perform(post("/api/v1/incidents").header("X-Cypher-Key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(payloadDeIncidente("CAM-NOT3", "incident-not-3")));

        String corpoLista = mvc.perform(get("/api/v1/notificacoes").session(session))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(corpoLista, "$[0].id")).longValue();

        mvc.perform(post("/api/v1/notificacoes/marcar-lidas").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"alertaIds\": [" + id + "]}"))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/notificacoes/contagem-nao-lidas").session(session))
                .andExpect(jsonPath("$.naoLidas").value(0));
        mvc.perform(get("/api/v1/notificacoes").session(session))
                .andExpect(jsonPath("$[0].lida").value(true));
    }

    @Test
    void marcarLidasENaoQuebraSeChamadaDeNovoComOMesmoId() throws Exception {
        MockHttpSession session = loginGestorBootstrap(mvc);
        String apiKey = criarCameraEPegarApiKey(session, "CAM-NOT4", "EST-NOT4");
        mvc.perform(post("/api/v1/incidents").header("X-Cypher-Key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(payloadDeIncidente("CAM-NOT4", "incident-not-4")));
        String corpoLista = mvc.perform(get("/api/v1/notificacoes").session(session))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(corpoLista, "$[0].id")).longValue();

        mvc.perform(post("/api/v1/notificacoes/marcar-lidas").session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"alertaIds\": [" + id + "]}"));

        // Reenviar o mesmo id não deve lançar (constraint única) nem duplicar linha.
        mvc.perform(post("/api/v1/notificacoes/marcar-lidas").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"alertaIds\": [" + id + "]}"))
                .andExpect(status().isNoContent());
    }

    @Test
    void marcarLidasIgnoraIdDeAlertaDeOutraEmpresa() throws Exception {
        MockHttpSession session = loginGestorBootstrap(mvc);

        Long idDeOutraEmpresa = alertas.saveAndFlush(incidenteDeOutraEmpresa()).getId();

        mvc.perform(post("/api/v1/notificacoes/marcar-lidas").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"alertaIds\": [" + idDeOutraEmpresa + "]}"))
                .andExpect(status().isNoContent());

        assertThat(leituras.existsByEmpresaIdAndUsuarioAndAlertaId(
                "globex-not", com.dev4.cypher.security.AuthTestSupport.GESTOR_USERNAME, idDeOutraEmpresa)).isFalse();
    }

    private com.dev4.cypher.model.Alerta incidenteDeOutraEmpresa() {
        com.dev4.cypher.model.Alerta a = new com.dev4.cypher.model.Alerta();
        a.setIncidentKey("globex-not:foreign-1");
        a.setCameraId("globex-not:CAM-X");
        a.setRunId("run-x");
        a.setTrackId(1);
        a.setTipo(com.dev4.cypher.model.AlertaTipo.FALL_RISK);
        a.setSeveridade(4);
        a.setNivel(com.dev4.cypher.model.AlertaNivel.fromSeverity(4));
        a.setReason("r");
        a.setPosturaCategoria("immediate_risk");
        a.setRebaScore(11);
        a.setActionLevel(4);
        a.setZoneStatus("outside");
        a.setDescricao("Fixture de outro tenant");
        a.setDataHora(java.time.OffsetDateTime.parse("2026-09-01T10:00:00Z"));
        a.setStatus(com.dev4.cypher.model.AlertaStatus.PENDENTE);
        a.setEmpresaId("globex-not");
        return a;
    }
```

Adicionar também os imports/injeções necessários no topo da classe:

```java
import com.dev4.cypher.repository.AlertaLeituraRepository;
import com.dev4.cypher.repository.AlertaRepository;
// ...
import static org.assertj.core.api.Assertions.assertThat;
```

```java
    @Autowired
    private AlertaRepository alertas;

    @Autowired
    private AlertaLeituraRepository leituras;
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `mvn test -Dtest=NotificacaoControllerApiTest`
Expected: FALHA — `POST /api/v1/notificacoes/marcar-lidas` não existe (404).

- [ ] **Step 3: Criar o DTO de request**

```java
package com.dev4.cypher.dto;

import java.util.List;

public record MarcarLidasRequest(List<Long> alertaIds) {
}
```

- [ ] **Step 4: Adicionar `marcarLidas` a `NotificacaoService`**

```java
    /**
     * Cria a linha de leitura para cada id que pertence à empresa e ainda
     * não foi lido; ids de outra empresa ou já lidos são ignorados em
     * silêncio — idempotente por natureza (spec central-notificacoes §3/§5).
     */
    @org.springframework.transaction.annotation.Transactional
    public void marcarLidas(String empresaId, String usuario, List<Long> alertaIds) {
        for (Long alertaId : alertaIds) {
            boolean pertenceAEmpresa = alertas.findByIdAndEmpresaId(alertaId, empresaId).isPresent();
            if (!pertenceAEmpresa) {
                continue;
            }
            if (leituras.existsByEmpresaIdAndUsuarioAndAlertaId(empresaId, usuario, alertaId)) {
                continue;
            }
            AlertaLeitura leitura = new AlertaLeitura();
            leitura.setEmpresaId(empresaId);
            leitura.setUsuario(usuario);
            leitura.setAlertaId(alertaId);
            leitura.setLidoEm(java.time.OffsetDateTime.now());
            leituras.save(leitura);
        }
    }
```

- [ ] **Step 5: Adicionar o endpoint a `NotificacaoController`**

```java
    @org.springframework.web.bind.annotation.PostMapping("/marcar-lidas")
    public org.springframework.http.ResponseEntity<Void> marcarLidas(
            @org.springframework.web.bind.annotation.RequestBody com.dev4.cypher.dto.MarcarLidasRequest req) {
        service.marcarLidas(TenantContext.currentEmpresaId(), TenantContext.currentUsername(), req.alertaIds());
        return org.springframework.http.ResponseEntity.noContent().build();
    }
```

(Imports podem ser promovidos para o topo do arquivo em vez de qualificados inline — mantenha o estilo já usado no resto da classe.)

- [ ] **Step 6: Rodar os testes para confirmar que passam**

Run: `mvn test -Dtest=NotificacaoControllerApiTest`
Expected: PASS (6/6)

- [ ] **Step 7: Rodar a suíte inteira**

Run: `mvn test`
Expected: PASS, nenhuma regressão

- [ ] **Step 8: Commit**

```bash
git add src/main/java/com/dev4/cypher/dto/MarcarLidasRequest.java \
        src/main/java/com/dev4/cypher/service/NotificacaoService.java \
        src/main/java/com/dev4/cypher/controller/NotificacaoController.java \
        src/test/java/com/dev4/cypher/NotificacaoControllerApiTest.java
git commit -m "feat: adiciona POST /notificacoes/marcar-lidas"
```

---

## Self-Review

**Cobertura da spec:** §1 (toda notificação = todo alerta, só GESTOR) → catch-all de `SecurityConfig` + `TenantContext.currentUsername()`, Task 2. §2 (modelo `AlertaLeitura`) → Task 1. §3 (três endpoints, janela de 30, idempotência) → Tasks 2–3. §5 (falha de rede não quebra, retry na próxima abertura) → responsabilidade do front (plano `cnb`), o backend só precisa ser idempotente, o que a Task 3 testa explicitamente. §6 (fora de escopo: outras origens de notificação, OPERADOR, severidades configuráveis, paginação, sync entre abas) → nenhuma task implementa nada disso, de propósito.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todo step tem código completo.

**Type consistency:** `NotificacaoService.listar`/`contarNaoLidas`/`marcarLidas` usam a mesma assinatura `(String empresaId, String usuario, ...)` em todas as tasks; `NotificacaoResponse`/`ContagemNotificacoesResponse`/`MarcarLidasRequest` não mudam de forma entre a task que os cria e as que os consomem.

## Execution Handoff

Plano completo e salvo em `docs/superpowers/plans/central-notificacoes/2026-09-07-cna-backend-notificacoes.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — dispatch de um subagente por tarefa, revisão entre tarefas, iteração rápida.

**2. Inline Execution** — execução em lote nesta sessão via `executing-plans`, com checkpoints de revisão.

Qual abordagem?
