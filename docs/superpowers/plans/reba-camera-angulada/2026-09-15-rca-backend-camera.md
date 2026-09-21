# RCA — Rotação e ângulo de câmera (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar os campos `rotacao` (0/90/180/270) e `anguloCameraGraus` (-45 a 45) à câmera, expostos em `GET /api/v1/cameras/{id}/config` para o `cypher-capture` consumir, e no cadastro/admin para o front editar.

**Architecture:** Dois campos primitivos novos em `Camera` (Hibernate `ddl-auto: update` cria as colunas, sem migration manual). Constructor `@AllArgsConstructor` do Lombok passa a ter 10 parâmetros; um construtor manual de 8 parâmetros preserva compatibilidade com as ~20 chamadas de teste existentes que usam `new Camera(...)` com a assinatura antiga.

**Tech Stack:** Spring Boot, Lombok, Jakarta Validation, JUnit 5, MockMvc (padrão já usado no repo).

**Spec:** `docs/superpowers/specs/planejadas/2026-09-15-reba-camera-angulada-design.md`

## Global Constraints

- `rotacao`: inteiro, valores permitidos exatamente `{0, 90, 180, 270}`, default `0`.
- `anguloCameraGraus`: inteiro, intervalo `[-45, 45]`, default `0`.
- Nenhuma migration manual — Hibernate `ddl-auto: update` (já configurado em `src/main/resources/application.yaml`) cria as colunas.
- Não quebrar nenhuma chamada existente de `new Camera(...)` nos testes (repositório usa esse construtor posicional em ~20 lugares).

---

### Task 1: Campo `rotacao`/`anguloCameraGraus` na entidade `Camera`

**Files:**
- Modify: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/model/Camera.java`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java`

**Interfaces:**
- Produces: `Camera` ganha `getRotacao()/setRotacao(int)` e `getAnguloCameraGraus()/setAnguloCameraGraus(int)` (via Lombok `@Getter/@Setter` já presentes na classe), e um construtor manual de 8 argumentos (assinatura antiga) além do `@AllArgsConstructor` gerado (agora 10 argumentos).

- [ ] **Step 1: Adicionar os campos na entidade**

Em `Camera.java`, logo após o campo `empresaId` (linha 66), adicionar:

```java
    /** Graus horários para corrigir câmera montada virada; aplicado ao frame inteiro pelo pipeline. */
    @ColumnDefault("0")
    @Column(nullable = false)
    private int rotacao;

    /** Roll fino (-45 a 45) usado só no cálculo de flexão de tronco do REBA, não gira o frame. */
    @ColumnDefault("0")
    @Column(nullable = false)
    private int anguloCameraGraus;
```

- [ ] **Step 2: Adicionar o construtor de compatibilidade com a assinatura antiga (8 args)**

Logo abaixo dos campos, antes do fechamento da classe:

```java
    /**
     * Construtor de compatibilidade com o formato anterior (sem rotacao/anguloCameraGraus),
     * usado pelos testes existentes. Lombok gera separadamente o @AllArgsConstructor com os
     * 10 campos atuais — os dois convivem porque têm aridade diferente.
     */
    public Camera(String id, String nome, String estacaoId, String streamUrl, String fonte,
                  boolean ativa, String apiKey, String empresaId) {
        this(id, nome, estacaoId, streamUrl, fonte, ativa, apiKey, empresaId, 0, 0);
    }
```

- [ ] **Step 3: Rodar a suite de testes existente pra confirmar que nada quebrou**

Run: `cd /home/asaas/projects/cypher && mvn -q -Dtest=CatalogRepositoryTest test`
Expected: PASS (nenhuma mudança de comportamento, só uma coluna nova com default 0)

- [ ] **Step 4: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/model/Camera.java
git commit -m "feat: adiciona campos rotacao e anguloCameraGraus em Camera"
```

---

### Task 2: `CameraRequest`, `CameraConfigResponse`, `CameraAdminResponse` — DTOs

**Files:**
- Modify: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/dto/CameraRequest.java`
- Modify: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/dto/CameraConfigResponse.java`
- Modify: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/dto/CameraAdminResponse.java`

**Interfaces:**
- Consumes: `Camera.getRotacao()/getAnguloCameraGraus()` (Task 1).
- Produces: `CameraRequest.rotacao()` → `Integer` (nullable: `null` só é aceito em create, tratado como 0; em update, `null` significa "não mexer", mesmo padrão de `ativa`). `CameraRequest.anguloCameraGraus()` → `Integer`, mesma semântica. `CameraConfigResponse.rotacao()`/`.anguloCameraGraus()` → `int` (sempre presentes, nunca null). `CameraAdminResponse.rotacao()`/`.anguloCameraGraus()` → `int`.

- [ ] **Step 1: `CameraRequest` — adicionar os dois campos com validação de intervalo**

Em `CameraRequest.java`, adicionar ao record (após `ativa`):

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.catalog.CatalogCodes;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CameraRequest(

        @NotBlank
        @Pattern(regexp = CatalogCodes.PADRAO,
                message = "codigo deve ser MAIUSCULAS-ALFANUM, ex.: CAM-01")
        String id,

        @NotBlank @Size(max = 120) String nome,
        @NotBlank String estacaoId,
        @NotBlank @Size(max = 500) String streamUrl,
        @Size(max = 500) String fonte,
        Boolean ativa,
        Integer rotacao,
        @Min(-45) @Max(45) Integer anguloCameraGraus
) {
}
```

Nota: `rotacao` não usa `@Min/@Max` porque o conjunto válido não é um intervalo contínuo (`{0,90,180,270}`) — a validação de pertencimento ao conjunto acontece em `CatalogService` (Task 3), mesmo padrão já usado ali para `CatalogCodes.portaDe`.

- [ ] **Step 2: `CameraConfigResponse` — adicionar os dois campos**

```java
package com.dev4.cypher.dto;

public record CameraConfigResponse(
        String codigo,
        String nome,
        String estacaoId,
        String fonte,
        int streamPort,
        boolean ativa,
        int rotacao,
        int anguloCameraGraus
) {
}
```

- [ ] **Step 3: `CameraAdminResponse` — adicionar os dois campos**

```java
package com.dev4.cypher.dto;

public record CameraAdminResponse(
        String id,
        String nome,
        String estacaoId,
        String streamUrl,
        String fonte,
        boolean ativa,
        int rotacao,
        int anguloCameraGraus
) {
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/dto/CameraRequest.java \
        src/main/java/com/dev4/cypher/dto/CameraConfigResponse.java \
        src/main/java/com/dev4/cypher/dto/CameraAdminResponse.java
git commit -m "feat: expoe rotacao e anguloCameraGraus nos DTOs de camera"
```

(Este commit não compila sozinho — `CatalogService` ainda constrói esses records com a assinatura antiga. Task 3 conserta isso. Se quiser manter cada commit compilável, junte Task 2 e Task 3 num só commit.)

---

### Task 3: `CatalogService` — validação e wiring

**Files:**
- Modify: `/home/asaas/projects/cypher/src/main/java/com/dev4/cypher/service/CatalogService.java`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java`
- Test: `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/CameraConfigApiTest.java`

**Interfaces:**
- Consumes: `CameraRequest.rotacao()/.anguloCameraGraus()` (Task 2), `Camera` construtor de 10 args (Task 1).
- Produces: `CatalogService.createCamera`/`updateCamera` validam e persistem os dois campos; `cameraConfig()` os inclui na resposta.

- [ ] **Step 1: Escrever o teste que falha — valores inválidos de `rotacao` são rejeitados**

Em `CatalogWriteServiceTest.java`, adicionar (seguindo o padrão dos testes de validação já existentes no arquivo — ver os testes de `streamUrl`/`estacaoId` duplicados para o padrão de `assertThatThrownBy`/`CatalogValidationException`):

```java
@Test
void rejeitaRotacaoForaDoConjuntoPermitido() {
    var req = new CameraRequest("CAM-ROT", "Rot", "EST-01",
            "rtsp://x/rot", null, true, 45, 0);

    assertThatThrownBy(() -> service.createCamera(req))
            .isInstanceOf(CatalogValidationException.class)
            .hasMessageContaining("rotacao");
}
```

(Ajuste os imports/setup de `EST-01` para o padrão já usado no restante da classe de teste — o arquivo já tem uma estação de apoio criada em `@BeforeEach`.)

- [ ] **Step 2: Rodar o teste, confirmar que falha**

Run: `cd /home/asaas/projects/cypher && mvn -q -Dtest=CatalogWriteServiceTest#rejeitaRotacaoForaDoConjuntoPermitido test`
Expected: FAIL (o construtor de `CameraRequest` ainda não compila com 8 posições, ou o service não lança a exceção)

- [ ] **Step 3: Implementar a validação e o wiring em `CatalogService`**

Adicionar método privado (perto de `exigirEstacao`/`exigirUrlLivre`, linhas 246-264):

```java
    private static final java.util.Set<Integer> ROTACOES_VALIDAS = java.util.Set.of(0, 90, 180, 270);

    private int validarRotacao(Integer rotacao) {
        int valor = rotacao == null ? 0 : rotacao;
        if (!ROTACOES_VALIDAS.contains(valor)) {
            throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "rotacao deve ser 0, 90, 180 ou 270: " + valor);
        }
        return valor;
    }
```

Modificar `createCamera` (linhas 136-151) para:

```java
    @Transactional
    public CameraAdminResponse createCamera(CameraRequest req) {
        String id = TenantContext.key(req.id());
        if (cameras.existsById(id)) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "Camera ja cadastrada: " + req.id());
        }
        String estacaoId = TenantContext.key(req.estacaoId());
        exigirEstacao(estacaoId);
        exigirUrlLivre(req.streamUrl(), id);
        CatalogCodes.portaDe(req.streamUrl());
        int rotacao = validarRotacao(req.rotacao());
        int angulo = req.anguloCameraGraus() == null ? 0 : req.anguloCameraGraus();

        Camera nova = new Camera(id, req.nome(), estacaoId,
                req.streamUrl(), req.fonte(), req.ativa() == null || req.ativa(),
                TokenGenerator.novo("cam-key"), TenantContext.currentEmpresaId(),
                rotacao, angulo);
        return toAdminResponse(cameras.saveAndFlush(nova));
    }
```

Modificar `updateCamera` (linhas 153-172): dentro do `.map(camera -> { ... })`, após `exigirUrlLivre`/`portaDe` (linha 161), adicionar antes do `return`:

```java
            if (req.rotacao() != null) {
                camera.setRotacao(validarRotacao(req.rotacao()));
            }
            if (req.anguloCameraGraus() != null) {
                camera.setAnguloCameraGraus(req.anguloCameraGraus());
            }
```

Modificar `cameraConfig()` (linhas 202-223), no `new CameraConfigResponse(...)`:

```java
            return new CameraConfigResponse(
                    TenantContext.codigo(camera.getId()),
                    camera.getNome(),
                    TenantContext.codigo(camera.getEstacaoId()),
                    camera.getFonte(),
                    CatalogCodes.portaDe(camera.getStreamUrl()),
                    camera.isAtiva(),
                    camera.getRotacao(),
                    camera.getAnguloCameraGraus());
```

Modificar `toAdminResponse(Camera c)` (linhas 281-284):

```java
    private CameraAdminResponse toAdminResponse(Camera c) {
        return new CameraAdminResponse(TenantContext.codigo(c.getId()), c.getNome(),
                TenantContext.codigo(c.getEstacaoId()), c.getStreamUrl(), c.getFonte(), c.isAtiva(),
                c.getRotacao(), c.getAnguloCameraGraus());
    }
```

- [ ] **Step 4: Rodar o teste, confirmar que passa**

Run: `cd /home/asaas/projects/cypher && mvn -q -Dtest=CatalogWriteServiceTest test`
Expected: PASS

- [ ] **Step 5: Atualizar `CameraConfigApiTest` para o novo shape de `CameraConfigResponse`**

Leia `/home/asaas/projects/cypher/src/test/java/com/dev4/cypher/CameraConfigApiTest.java` antes de editar — os asserts de JSON precisam checar `rotacao`/`anguloCameraGraus` (esperar `0` para câmeras criadas sem esses campos no request de teste). Ajuste os `jsonPath` existentes adicionando:

```java
.andExpect(jsonPath("$.rotacao").value(0))
.andExpect(jsonPath("$.anguloCameraGraus").value(0))
```

nos mesmos testes que já verificam `codigo`/`streamPort`/`ativa`.

- [ ] **Step 6: Rodar a suíte completa do backend**

Run: `cd /home/asaas/projects/cypher && mvn -q test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/service/CatalogService.java \
        src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java \
        src/test/java/com/dev4/cypher/CameraConfigApiTest.java
git commit -m "feat: valida e persiste rotacao/anguloCameraGraus no cadastro de camera"
```

## Self-Review

- **Cobertura da spec:** campos em `Camera` (Task 1), nos 3 DTOs relevantes (Task 2), validação + wiring em create/update/config (Task 3) — cobre a seção RCA da spec por completo.
- **Placeholders:** nenhum — todo trecho de código é literal, com paths e linhas exatas do estado atual do repositório (lido em 2026-09-15).
- **Consistência de tipos:** `Camera.getRotacao()`/`getAnguloCameraGraus()` retornam `int` primitivo (Task 1) e são consumidos como `int` em `CameraConfigResponse`/`CameraAdminResponse` (Task 3) — sem unboxing implícito problemático. `CameraRequest.rotacao()/.anguloCameraGraus()` são `Integer` (nullable, Task 2) e tratados com null-check antes de qualquer uso primitivo (Task 3) — consistente.
