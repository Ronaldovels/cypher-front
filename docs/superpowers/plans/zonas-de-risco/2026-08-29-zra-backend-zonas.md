# ZR-A — Backend: Zonas de Risco Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir `Zona` no backend `cypher` — CRUD GESTOR-only aninhado em `/api/v1/cameras/{codigo}/zones`, mais a superfície de máquina `.../zones/config` consumida pelo pipeline (`X-Cypher-Key` ou `GESTOR`). Zonas hoje não existem em lugar nenhum remoto — este plano cria a entidade e a API do zero (spec §1.2).

**Architecture:** Uma fatia vertical (mesmo formato do plano de webhook): `Zona`, `PontoNormalizado` (`@Embeddable`), `ZoneType` (enum), `ZonaRepository`, `ZonaService` (validação + escopo por câmera+empresa), `ZonaController` fino por cima. Tarefa 1 entrega o CRUD administrativo completo; Tarefa 2 entrega a superfície de máquina `.../zones/config`. Coordenadas são sempre normalizadas (fração 0.0–1.0) no banco — nenhuma conversão para pixel acontece neste repositório (spec §3.2: quem converte é o pipeline, que é o único que conhece a resolução real do frame).

**Tech Stack:** Spring Boot 4.0.6, Spring Data JPA, H2, Spring Security (sessão), Lombok, MockMvc + `@SpringBootTest`, JUnit 5, AssertJ.

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-zonas-de-risco-design.md` (repo `cypher-front`), §2 (`Zona`/endpoints), §2.1 (id gerado), §2.2 (soft delete), §5 (comportamento sob falha).

**Repositório:** `/home/asaas/projects/cypher`

## Global Constraints

- Repositório: `/home/asaas/projects/cypher`. **Depende do plano `2026-08-29-mta-backend-empresa.md` já mergeado** (ou rodando localmente na mesma branch) — este plano assume `Camera.id` armazenado como `empresaId:codigo`, `TenantContext.key(codigo)`/`.currentEmpresaId()` já existentes. Se `main` ainda não tem essas peças, ramificar a partir de `feat/mt-backend-empresa`.
- Branch: `feat/zr-backend-zonas` — **não** usar worktree, apenas `git checkout -b`.
- **Toda anotação de formato no corpo (`@NotBlank`/`@Size`/`@Min`/`@Max`) devolve `400`, nunca `422`** (mesma convenção já consolidada nos planos de multi-tenant/webhook — confirmado por `CatalogWriteApiTest`, nenhum handler de `MethodArgumentNotValidException` existe no projeto). `422` (via `CatalogValidationException`) fica reservado a checagem de negócio entre entidades — nenhuma existe aqui.
- **`cameraId` da URL resolve via `TenantContext.key(codigo)`** — uma câmera inexistente OU de outra empresa devolve `404` de forma indistinguível (mesmo espírito de isolamento já usado em `IncidentController`/`WebhookService`), nunca `403` nem vazamento de dado.
- **`DELETE` é soft delete** (`ativa = false`), mesmo padrão de `Camera`/`Estacao`/`WebhookSubscription`.
- **`id` de `Zona` é gerado (`IDENTITY`), nunca digitado** (spec §2.1) — diferente de `Estacao`/`Camera`, que têm código escolhido pelo operador.
- **A ordem dos vértices do polígono importa** — `@ElementCollection` em `Zona.polygon` usa `@OrderColumn`, para não embaralhar a forma ao recarregar do banco.
- Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=NomeDaClasse` para uma classe; `./mvnw -o test` para a suíte inteira.

---

### Task 1: CRUD de `Zona` — `ZonaService` + `ZonaController`

**Files:**
- Create: `src/main/java/com/dev4/cypher/model/ZoneType.java`
- Create: `src/main/java/com/dev4/cypher/model/PontoNormalizado.java`
- Create: `src/main/java/com/dev4/cypher/model/Zona.java`
- Create: `src/main/java/com/dev4/cypher/repository/ZonaRepository.java`
- Create: `src/main/java/com/dev4/cypher/dto/PontoRequest.java`
- Create: `src/main/java/com/dev4/cypher/dto/ZoneRequest.java`
- Create: `src/main/java/com/dev4/cypher/dto/ZoneResponse.java`
- Create: `src/main/java/com/dev4/cypher/service/ZonaService.java`
- Create: `src/main/java/com/dev4/cypher/controller/ZonaController.java`
- Test: `src/test/java/com/dev4/cypher/ZonaControllerApiTest.java`

**Interfaces:**
- Produces: `ZonaService.listar(codigo)`, `.criar(codigo, ZoneRequest)`, `.atualizar(codigo, id, ZoneRequest)`, `.desativar(codigo, id)`, helpers `camera(codigo)`/`doTenant(codigo, id)` — consumidos pela Tarefa 2

- [ ] **Step 1: Escrever o teste de CRUD, validação e isolamento**

Criar `src/test/java/com/dev4/cypher/ZonaControllerApiTest.java`:

```java
package com.dev4.cypher;

import com.dev4.cypher.security.AuthTestSupport;
import com.jayway.jsonpath.JsonPath;
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
class ZonaControllerApiTest {

    @Autowired
    private MockMvc mvc;

    private static final String POLIGONO_VALIDO =
            "[{\"x\":0.2,\"y\":0.2},{\"x\":0.6,\"y\":0.2},{\"x\":0.6,\"y\":0.6}]";

    @Test
    void cadastraListaEEditaUmaZona() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);
        criarCamera(session, "CAM-ZR1", "EST-01");

        mvc.perform(post("/api/v1/cameras/CAM-ZR1/zones").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"nome\": \"Area da prensa\", \"zoneType\": \"RESTRICTED\", "
                                + "\"polygon\": %s, \"severity\": 4, \"requiredPpe\": [\"capacete\"]}")
                                .formatted(POLIGONO_VALIDO)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.nome").value("Area da prensa"))
                .andExpect(jsonPath("$.polygon.length()").value(3));

        String corpo = mvc.perform(get("/api/v1/cameras/CAM-ZR1/zones").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andReturn().getResponse().getContentAsString();
        Number id = JsonPath.read(corpo, "$[0].id");

        mvc.perform(put("/api/v1/cameras/CAM-ZR1/zones/" + id).session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"nome\": \"Area critica\", \"zoneType\": \"ATTENTION\", "
                                + "\"polygon\": %s, \"severity\": 2, \"requiredPpe\": []}")
                                .formatted(POLIGONO_VALIDO)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nome").value("Area critica"))
                .andExpect(jsonPath("$.zoneType").value("ATTENTION"));
    }

    @Test
    void poligonoComMenosDeTresVerticesDevolve400() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);
        criarCamera(session, "CAM-ZR2", "EST-01");

        mvc.perform(post("/api/v1/cameras/CAM-ZR2/zones").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\": \"x\", \"zoneType\": \"RESTRICTED\", "
                                + "\"polygon\": [{\"x\":0.1,\"y\":0.1},{\"x\":0.2,\"y\":0.2}], "
                                + "\"severity\": 2, \"requiredPpe\": []}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void severityForaDeFaixaDevolve400() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);
        criarCamera(session, "CAM-ZR3", "EST-01");

        mvc.perform(post("/api/v1/cameras/CAM-ZR3/zones").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"nome\": \"x\", \"zoneType\": \"RESTRICTED\", "
                                + "\"polygon\": %s, \"severity\": 5, \"requiredPpe\": []}")
                                .formatted(POLIGONO_VALIDO)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cameraInexistenteDevolve404() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);

        mvc.perform(post("/api/v1/cameras/CAM-NAO-EXISTE/zones").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"nome\": \"x\", \"zoneType\": \"RESTRICTED\", "
                                + "\"polygon\": %s, \"severity\": 2, \"requiredPpe\": []}")
                                .formatted(POLIGONO_VALIDO)))
                .andExpect(status().isNotFound());
    }

    @Test
    void desativarEhSoftDeleteEDesapareceDaListagem() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);
        criarCamera(session, "CAM-ZR4", "EST-01");
        String corpo = mvc.perform(post("/api/v1/cameras/CAM-ZR4/zones").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"nome\": \"x\", \"zoneType\": \"RESTRICTED\", "
                                + "\"polygon\": %s, \"severity\": 2, \"requiredPpe\": []}")
                                .formatted(POLIGONO_VALIDO)))
                .andReturn().getResponse().getContentAsString();
        Number id = JsonPath.read(corpo, "$.id");

        mvc.perform(delete("/api/v1/cameras/CAM-ZR4/zones/" + id).session(session))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/cameras/CAM-ZR4/zones").session(session))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void zonaDeCameraDeUmaEmpresaNaoApareceOuEditaPorOutra() throws Exception {
        MockHttpSession sessaoAcme = setupEmpresa("acme-zr", "Acme");
        MockHttpSession sessaoGlobex = setupEmpresa("globex-zr", "Globex");
        criarCamera(sessaoAcme, "CAM-01", "EST-01");
        criarCamera(sessaoGlobex, "CAM-01", "EST-01");

        String corpo = mvc.perform(post("/api/v1/cameras/CAM-01/zones").session(sessaoAcme)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"nome\": \"Da Acme\", \"zoneType\": \"RESTRICTED\", "
                                + "\"polygon\": %s, \"severity\": 2, \"requiredPpe\": []}")
                                .formatted(POLIGONO_VALIDO)))
                .andReturn().getResponse().getContentAsString();
        Number idDaAcme = JsonPath.read(corpo, "$.id");

        mvc.perform(get("/api/v1/cameras/CAM-01/zones").session(sessaoGlobex))
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(put("/api/v1/cameras/CAM-01/zones/" + idDaAcme).session(sessaoGlobex)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"nome\": \"roubada\", \"zoneType\": \"RESTRICTED\", "
                                + "\"polygon\": %s, \"severity\": 2, \"requiredPpe\": []}")
                                .formatted(POLIGONO_VALIDO)))
                .andExpect(status().isNotFound());
    }

    private void criarCamera(MockHttpSession session, String codigo, String estacaoId) throws Exception {
        mvc.perform(post("/api/v1/stations").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\": \"" + estacaoId + "\", \"nome\": \"Estacao\", \"setor\": \"x\", \"ativa\": true}"));
        mvc.perform(post("/api/v1/cameras").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"id\": \"%s\", \"nome\": \"Camera\", \"estacaoId\": \"%s\", "
                                + "\"streamUrl\": \"http://127.0.0.1:9000/stream\", \"ativa\": true}")
                                .formatted(codigo, estacaoId)));
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

(`criarCamera` ignora eventuais `409`/erros de estação já existente entre testes da mesma classe — o que interessa é a câmera existir ao final; se a suíte reclamar de reaproveitamento entre métodos, usar um código de estação diferente por teste, como já feito com `estacaoId` variando pouco acima.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=ZonaControllerApiTest`
Expected: FAIL na compilação — nenhuma das classes novas existe.

- [ ] **Step 3: Criar `ZoneType` e `PontoNormalizado`**

Criar `src/main/java/com/dev4/cypher/model/ZoneType.java`:

```java
package com.dev4.cypher.model;

public enum ZoneType {
    RESTRICTED,
    ATTENTION
}
```

Criar `src/main/java/com/dev4/cypher/model/PontoNormalizado.java`:

```java
package com.dev4.cypher.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Vértice de polígono em fração 0.0–1.0 da largura/altura do frame — nunca pixel absoluto (spec §2). */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class PontoNormalizado {

    @Column(nullable = false)
    private double x;

    @Column(nullable = false)
    private double y;
}
```

- [ ] **Step 4: Criar `Zona`**

Criar `src/main/java/com/dev4/cypher/model/Zona.java`:

```java
package com.dev4.cypher.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Zona de risco desenhada sobre uma câmera. `id` é gerado — diferente de
 * `Estacao`/`Camera`, zona não tem contraparte física com nome prévio (spec
 * §2.1). `cameraId` guarda a chave já prefixada de `Camera.id`
 * (`empresaId:codigo`), mesma referência solta sem FK usada em todo o resto
 * do projeto.
 */
@Entity
@Table(name = "zonas")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Zona {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String cameraId;

    @Column(nullable = false, length = 120)
    private String nome;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ZoneType zoneType;

    /** Ordem importa — `@OrderColumn` preserva a sequência dos vértices ao recarregar. */
    @ElementCollection
    @CollectionTable(name = "zona_polygon", joinColumns = @JoinColumn(name = "zona_id"))
    @OrderColumn(name = "posicao")
    private List<PontoNormalizado> polygon = new ArrayList<>();

    @Column(nullable = false)
    private int severity;

    @ElementCollection
    @CollectionTable(name = "zona_required_ppe", joinColumns = @JoinColumn(name = "zona_id"))
    @Column(name = "ppe")
    private List<String> requiredPpe = new ArrayList<>();

    @Column(nullable = false)
    private boolean ativa;

    @Column(nullable = false, length = 30)
    private String empresaId;
}
```

- [ ] **Step 5: Criar `ZonaRepository`**

Criar `src/main/java/com/dev4/cypher/repository/ZonaRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Zona;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ZonaRepository extends JpaRepository<Zona, Long> {

    List<Zona> findByCameraIdAndEmpresaId(String cameraId, String empresaId);

    List<Zona> findByCameraIdAndEmpresaIdAndAtivaTrue(String cameraId, String empresaId);
}
```

- [ ] **Step 6: Criar os DTOs**

Criar `src/main/java/com/dev4/cypher/dto/PontoRequest.java`:

```java
package com.dev4.cypher.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

public record PontoRequest(
        @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double x,
        @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double y
) {
}
```

Criar `src/main/java/com/dev4/cypher/dto/ZoneRequest.java`:

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.model.ZoneType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ZoneRequest(
        @NotBlank @Size(max = 120) String nome,
        @NotNull ZoneType zoneType,
        @NotNull @Size(min = 3, message = "poligono precisa de ao menos 3 vertices") List<@Valid @NotNull PontoRequest> polygon,
        @NotNull @Min(1) @Max(4) Integer severity,
        List<String> requiredPpe
) {
}
```

Criar `src/main/java/com/dev4/cypher/dto/ZoneResponse.java`:

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.model.ZoneType;

import java.util.List;

public record ZoneResponse(
        Long id,
        String cameraId,
        String nome,
        ZoneType zoneType,
        List<PontoRequest> polygon,
        int severity,
        List<String> requiredPpe,
        boolean ativa
) {
}
```

- [ ] **Step 7: Criar `ZonaService`**

Criar `src/main/java/com/dev4/cypher/service/ZonaService.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.dto.PontoRequest;
import com.dev4.cypher.dto.ZoneRequest;
import com.dev4.cypher.dto.ZoneResponse;
import com.dev4.cypher.model.Camera;
import com.dev4.cypher.model.PontoNormalizado;
import com.dev4.cypher.model.Zona;
import com.dev4.cypher.repository.CameraRepository;
import com.dev4.cypher.repository.ZonaRepository;
import com.dev4.cypher.security.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** CRUD de zona de risco (spec §2), aninhado numa câmera e escopado por empresa. */
@Service
public class ZonaService {

    private final ZonaRepository zonas;
    private final CameraRepository cameras;

    public ZonaService(ZonaRepository zonas, CameraRepository cameras) {
        this.zonas = zonas;
        this.cameras = cameras;
    }

    @Transactional(readOnly = true)
    public Optional<List<ZoneResponse>> listar(String codigo) {
        return camera(codigo).map(camera ->
                zonas.findByCameraIdAndEmpresaId(camera.getId(), TenantContext.currentEmpresaId())
                        .stream().map(this::toResponse).toList());
    }

    @Transactional
    public Optional<ZoneResponse> criar(String codigo, ZoneRequest req) {
        return camera(codigo).map(camera -> {
            Zona nova = new Zona(null, camera.getId(), req.nome(), req.zoneType(),
                    toPontos(req.polygon()), req.severity(),
                    req.requiredPpe() == null ? List.of() : List.copyOf(req.requiredPpe()),
                    true, TenantContext.currentEmpresaId());
            return toResponse(zonas.saveAndFlush(nova));
        });
    }

    @Transactional
    public Optional<ZoneResponse> atualizar(String codigo, Long id, ZoneRequest req) {
        return doTenant(codigo, id).map(zona -> {
            zona.setNome(req.nome());
            zona.setZoneType(req.zoneType());
            zona.setPolygon(toPontos(req.polygon()));
            zona.setSeverity(req.severity());
            zona.setRequiredPpe(req.requiredPpe() == null ? List.of() : List.copyOf(req.requiredPpe()));
            return toResponse(zonas.saveAndFlush(zona));
        });
    }

    @Transactional
    public Optional<Boolean> desativar(String codigo, Long id) {
        return doTenant(codigo, id).map(zona -> {
            zona.setAtiva(false);
            zonas.saveAndFlush(zona);
            return true;
        });
    }

    /** Devolve a câmera só se pertencer ao tenant atual — resolve o código puro da URL para a chave prefixada. */
    Optional<Camera> camera(String codigo) {
        return cameras.findById(TenantContext.key(codigo));
    }

    /** Devolve a zona só se pertencer à câmera E ao tenant informados na URL. */
    Optional<Zona> doTenant(String codigo, Long id) {
        return camera(codigo).flatMap(camera ->
                zonas.findById(id).filter(z -> z.getCameraId().equals(camera.getId())));
    }

    private List<PontoNormalizado> toPontos(List<PontoRequest> polygon) {
        return polygon.stream().map(p -> new PontoNormalizado(p.x(), p.y())).toList();
    }

    ZoneResponse toResponse(Zona z) {
        List<PontoRequest> polygon = z.getPolygon().stream()
                .map(p -> new PontoRequest(p.getX(), p.getY())).toList();
        return new ZoneResponse(z.getId(), TenantContext.codigo(z.getCameraId()), z.getNome(), z.getZoneType(),
                polygon, z.getSeverity(), z.getRequiredPpe(), z.isAtiva());
    }
}
```

`camera`/`doTenant`/`toResponse` ficam com visibilidade de pacote (não `private`) porque a Tarefa 2 os reaproveita a partir do mesmo arquivo. `desativar` devolve `Optional<Boolean>` em vez de `boolean` para diferenciar "câmera/zona não encontrada" (Optional vazio, controller devolve 404) de um booleano de sucesso — mesmo motivo de todo outro `Optional<...>` de escrita neste projeto.

- [ ] **Step 8: Criar `ZonaController`**

Criar `src/main/java/com/dev4/cypher/controller/ZonaController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.ZoneRequest;
import com.dev4.cypher.dto.ZoneResponse;
import com.dev4.cypher.service.ZonaService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * CRUD de zona de risco (spec §2) — GESTOR-only, sem `@PreAuthorize`: mesma
 * proteção centralizada em `SecurityConfig` que já cobre `/teams`/`/users`/`/webhooks`
 * (nenhuma linha explicita para o CRUD, cai no catch-all `anyRequest().hasRole("GESTOR")`).
 * O endpoint de máquina `.../zones/config` é a exceção, tratada na Tarefa 2.
 */
@RestController
@RequestMapping("/api/v1/cameras/{codigo}/zones")
public class ZonaController {

    private final ZonaService service;

    public ZonaController(ZonaService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<ZoneResponse>> list(@PathVariable String codigo) {
        return service.listar(codigo).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<ZoneResponse> create(@PathVariable String codigo, @Valid @RequestBody ZoneRequest req) {
        return service.criar(codigo, req)
                .map(z -> ResponseEntity.status(HttpStatus.CREATED).body(z))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<ZoneResponse> update(@PathVariable String codigo, @PathVariable Long id,
                                               @Valid @RequestBody ZoneRequest req) {
        return service.atualizar(codigo, id, req)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deactivate(@PathVariable String codigo, @PathVariable Long id) {
        return service.desativar(codigo, id)
                .map(ok -> ResponseEntity.noContent().<Void>build())
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=ZonaControllerApiTest`
Expected: PASS

- [ ] **Step 10: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: adiciona CRUD de zona de risco, aninhado por camera e escopado por empresa"
```

---

### Task 2: Superfície de máquina `.../zones/config`

**Files:**
- Modify: `src/main/java/com/dev4/cypher/service/ZonaService.java`
- Modify: `src/main/java/com/dev4/cypher/controller/ZonaController.java`
- Modify: `src/main/java/com/dev4/cypher/config/SecurityConfig.java`
- Test: `src/test/java/com/dev4/cypher/ZonaControllerApiTest.java`

**Interfaces:**
- Consumes: `ZonaService.camera(String)` (Tarefa 1)
- Produces: `GET /api/v1/cameras/{codigo}/zones/config` → `List<ZoneResponse>` (só zonas ativas), acessível por `X-Cypher-Key` ou `GESTOR`

- [ ] **Step 1: Escrever o teste do endpoint de máquina**

Adicionar em `ZonaControllerApiTest.java`:

```java
    @Test
    void configSoDevolveZonasAtivasEAceitaChaveDePipeline() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);
        criarCamera(session, "CAM-CFG1", "EST-01");
        String corpoAtiva = mvc.perform(post("/api/v1/cameras/CAM-CFG1/zones").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"nome\": \"Ativa\", \"zoneType\": \"RESTRICTED\", "
                                + "\"polygon\": %s, \"severity\": 2, \"requiredPpe\": []}")
                                .formatted(POLIGONO_VALIDO)))
                .andReturn().getResponse().getContentAsString();
        String corpoInativa = mvc.perform(post("/api/v1/cameras/CAM-CFG1/zones").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"nome\": \"Inativa\", \"zoneType\": \"RESTRICTED\", "
                                + "\"polygon\": %s, \"severity\": 2, \"requiredPpe\": []}")
                                .formatted(POLIGONO_VALIDO)))
                .andReturn().getResponse().getContentAsString();
        Number idInativa = JsonPath.read(corpoInativa, "$.id");
        mvc.perform(delete("/api/v1/cameras/CAM-CFG1/zones/" + idInativa).session(session));

        // Acesso GESTOR (sessão).
        mvc.perform(get("/api/v1/cameras/CAM-CFG1/zones/config").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].nome").value("Ativa"));

        // Acesso por X-Cypher-Key da propria camera, sem sessao.
        String apiKey = com.jayway.jsonpath.JsonPath.read(
                mvc.perform(get("/api/v1/cameras/CAM-CFG1").session(session))
                        .andReturn().getResponse().getContentAsString(), "$.id") != null
                ? apiKeyDeCamera(session, "CAM-CFG1") : null;
        mvc.perform(get("/api/v1/cameras/CAM-CFG1/zones/config").header("X-Cypher-Key", apiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    private String apiKeyDeCamera(MockHttpSession session, String codigo) throws Exception {
        String corpo = mvc.perform(post("/api/v1/cameras/" + codigo + "/apikey/regenerate").session(session))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(corpo, "$.apiKey");
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=ZonaControllerApiTest`
Expected: FAIL — `GET .../zones/config` não existe (404 genérico do Spring, não o 404 esperado do teste com corpo/asserção específica); ou, se a rota cair no catch-all `hasRole("GESTOR")`, a chamada por `X-Cypher-Key` sem sessão falha com 403/401.

- [ ] **Step 3: Adicionar `config` a `ZonaService`**

Em `ZonaService.java`:

```java
    @Transactional(readOnly = true)
    public Optional<List<ZoneResponse>> config(String codigo) {
        return camera(codigo).map(camera ->
                zonas.findByCameraIdAndEmpresaIdAndAtivaTrue(camera.getId(), TenantContext.currentEmpresaId())
                        .stream().map(this::toResponse).toList());
    }
```

- [ ] **Step 4: Adicionar o endpoint ao controller**

Em `ZonaController.java`:

```java
    @GetMapping("/config")
    public ResponseEntity<List<ZoneResponse>> config(@PathVariable String codigo) {
        return service.config(codigo).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
```

(o Spring MVC casa `/config` antes de tentar `/{id}` como segmento fixo mais específico — mesmo comportamento já confirmado em `CatalogController`, onde `/cameras/{id}/config` convive com `/cameras/{id}` sem ambiguidade.)

- [ ] **Step 5: Liberar a rota para `PIPELINE` em `SecurityConfig`**

Em `SecurityConfig.java`, logo após a linha já existente `.requestMatchers(HttpMethod.GET, "/api/v1/cameras/*/config").hasAnyRole("PIPELINE", "GESTOR")`, adicionar:

```java
                        .requestMatchers(HttpMethod.GET, "/api/v1/cameras/*/zones/config")
                        .hasAnyRole("PIPELINE", "GESTOR")
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=ZonaControllerApiTest`
Expected: PASS

- [ ] **Step 7: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: adiciona superficie de maquina zones/config, acessivel por X-Cypher-Key ou GESTOR"
```

---

## Self-Review

**Cobertura da spec:** §2 (`Zona`/endpoints) → Tarefas 1 e 2. §2.1 (id gerado) → `Zona.id` com `@GeneratedValue`, nunca aceito do corpo da requisição. §2.2 (soft delete) → `ZonaService.desativar`. §3.2 ("conversão acontece no pipeline, não no backend") → nenhum código deste plano converte normalizado→pixel; `PontoRequest`/`PontoNormalizado` sempre em fração 0.0–1.0, validado por `@DecimalMin`/`@DecimalMax`. §5 (comportamento sob falha) → cada linha da tabela tem teste correspondente.

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** `ZonaService.camera`/`doTenant`/`toResponse` (Tarefa 1) reaproveitados sem renomear na Tarefa 2.

**Fora de escopo confirmado:** nenhuma tarefa deste plano toca `cypher-capture` (fica para o plano `zrb`) nem implementa hot-reload — consistente com spec §7.

---

**Plan complete and saved to `docs/superpowers/plans/zonas-de-risco/2026-08-29-zra-backend-zonas.md`.**
