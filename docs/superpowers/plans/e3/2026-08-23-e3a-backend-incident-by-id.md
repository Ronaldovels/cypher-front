# E3-A — Backend: GET /incidents/{id} Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar `GET /api/v1/incidents/{id}` ao backend `cypher`, para que a tela de detalhe de incidente (E3-B, `cypher-front`) funcione em navegação direta e refresh de página, sem depender do cache de 100 itens em memória do front.

**Architecture:** Uma única mudança aditiva: `IncidentService.findById(Long id): Optional<IncidentResponse>` reaproveitando `AlertaRepository.findById` e o `IncidentMapper` já existentes, exposta por um novo método no `IncidentController` já existente. Nenhuma migração, nenhuma entidade nova, nenhum evento novo — `changeStatus` já publica `IncidentChangedEvent` e já aceita qualquer transição de status.

**Tech Stack:** Spring Boot, Spring Data JPA, MockMvc + `@SpringBootTest` para o teste de integração, `@DataJpaTest` para o teste de serviço, JUnit 5, AssertJ.

**Spec:** `docs/superpowers/specs/2026-08-23-operacao-e3-design.md` (repo `cypher-front`), §3 "Backend — mudança única".

**Repositório:** `/home/asaas/projects/cypher`

## Global Constraints

- Repositório: `/home/asaas/projects/cypher`. Branch: `feat/e3a-backend-incident-by-id`, criada a partir de `dev` — **não** usar worktree, apenas `git checkout -b`.
- Sem migração de banco: `Alerta`/`AlertaRepository`/`IncidentMapper`/`IncidentResponse` já existem e não mudam de forma.
- Sem alterar `changeStatus`, `search`, `ingest` ou `close` — já implementam tudo que a spec de E3 precisa deles.
- Comentários no código só quando o "porquê" não for óbvio pelo nome, no mesmo estilo do resto do arquivo (ver `IncidentController.java`/`IncidentService.java` atuais).

---

### Task 1: `GET /api/v1/incidents/{id}`

**Files:**
- Modify: `src/main/java/com/dev4/cypher/service/IncidentService.java` — novo método `findById`
- Modify: `src/main/java/com/dev4/cypher/controller/IncidentController.java` — novo endpoint `GET /{id}`
- Test: `src/test/java/com/dev4/cypher/service/IncidentServiceTest.java` — teste do método de serviço
- Test: `src/test/java/com/dev4/cypher/IncidentQueryApiTest.java` — teste HTTP do endpoint

**Interfaces:**
- Produces: `IncidentService.findById(Long id): Optional<IncidentResponse>`
- Produces: `GET /api/v1/incidents/{id}` → `200` com `IncidentResponse` no corpo, ou `404` sem corpo

- [ ] **Step 0: Criar a branch**

```bash
cd /home/asaas/projects/cypher
git checkout dev
git pull
git checkout -b feat/e3a-backend-incident-by-id
```

- [ ] **Step 1: Escrever o teste de serviço que falha**

Em `src/test/java/com/dev4/cypher/service/IncidentServiceTest.java`, adicionar ao final da classe (antes do `}` de fechamento), logo depois do teste `mudaStatusDoIncidente`:

```java
    @Test
    void buscaIncidentePorId() {
        Long id = service.ingest(queda("k1")).incident().id();

        Optional<com.dev4.cypher.dto.IncidentResponse> encontrado = service.findById(id);

        assertThat(encontrado).isPresent();
        assertThat(encontrado.get().id()).isEqualTo(id);
        assertThat(encontrado.get().incidentKey()).isEqualTo("k1");
    }

    @Test
    void buscaPorIdInexistenteDevolveVazio() {
        assertThat(service.findById(999999L)).isEmpty();
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentServiceTest`
Expected: FAIL — `cannot find symbol: method findById(Long)` (não compila, porque o método ainda não existe em `IncidentService`)

- [ ] **Step 3: Implementar `IncidentService.findById`**

Em `src/main/java/com/dev4/cypher/service/IncidentService.java`, adicionar logo após o método `search` (antes de `changeStatus`):

```java
    @Transactional(readOnly = true)
    public Optional<IncidentResponse> findById(Long id) {
        return repository.findById(id).map(mapper::toResponse);
    }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentServiceTest`
Expected: PASS — todos os testes da classe, incluindo os dois novos

- [ ] **Step 5: Escrever o teste HTTP que falha**

Em `src/test/java/com/dev4/cypher/IncidentQueryApiTest.java`, adicionar ao final da classe (antes do `}` de fechamento), depois de `statusDeIncidenteInexistenteDevolve404`:

```java
    @Test
    void buscaIncidentePorId() throws Exception {
        String lista = mvc.perform(get("/api/v1/incidents").param("camera", "CAM-01"))
                .andReturn().getResponse().getContentAsString();
        Integer id = com.jayway.jsonpath.JsonPath.read(lista, "$.content[0].id");

        mvc.perform(get("/api/v1/incidents/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.cameraId").value("CAM-01"));
    }

    @Test
    void buscaPorIdInexistenteDevolve404() throws Exception {
        mvc.perform(get("/api/v1/incidents/{id}", 999999))
                .andExpect(status().isNotFound());
    }
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentQueryApiTest`
Expected: FAIL — `buscaIncidentePorId` e `buscaPorIdInexistenteDevolve404` devolvem `404`/erro de rota, porque o endpoint ainda não existe (o `GET /{id}` cai em nenhum mapeamento, já que o único `GET` sem sufixo é a listagem em `/incidents`, que não aceita segmento extra)

- [ ] **Step 7: Implementar o endpoint no controller**

Em `src/main/java/com/dev4/cypher/controller/IncidentController.java`, adicionar logo após o método `list` (antes de `changeStatus`):

```java
    /** Item individual, para a tela de detalhe sobreviver a refresh/link direto. */
    @GetMapping("/{id}")
    public ResponseEntity<IncidentResponse> byId(@PathVariable Long id) {
        return service.findById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentQueryApiTest`
Expected: PASS — todos os testes da classe

- [ ] **Step 9: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: BUILD SUCCESS, sem regressão em nenhuma classe de teste existente

- [ ] **Step 10: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/service/IncidentService.java \
        src/main/java/com/dev4/cypher/controller/IncidentController.java \
        src/test/java/com/dev4/cypher/service/IncidentServiceTest.java \
        src/test/java/com/dev4/cypher/IncidentQueryApiTest.java
git commit -m "feat: adiciona GET /incidents/{id} para busca individual"
```

---

## Self-Review

**Cobertura da spec:** §3 do spec de E3 pede exatamente `GET /api/v1/incidents/{id}` → 200/404, sem outra mudança de backend — Task 1 cobre isso integralmente, e reafirma explicitamente (nos Global Constraints) que `changeStatus`/`search` não mudam.

**Placeholders:** nenhum — todo passo tem código completo e comando de execução.

**Consistência de tipos:** `IncidentService.findById(Long id): Optional<IncidentResponse>` é o único símbolo novo, usado de forma idêntica no controller e no teste de serviço.
