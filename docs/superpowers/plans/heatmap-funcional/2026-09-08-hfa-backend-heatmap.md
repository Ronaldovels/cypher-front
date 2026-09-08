# HF-A — Backend: Heatmap funcional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/v1/summary` ganha seis parâmetros opcionais (`since`, `until`, `turno`, `setor`, `epi`, `detalhado`) que tornam o heatmap espacial filtrável e adicionam duas agregações novas (`distribuicaoTemporal`, `historicoAnual`), sem quebrar nenhum consumidor existente. `GET /reports/summary.pdf` (E6) passa a repassar `turno`/`setor`/`epi` também, pro heatmap dentro do PDF bater com o que está filtrado na tela.

**Architecture:** Tudo em `SummaryService.build(...)` — o método já carrega `findByEmpresaId` inteiro em memória e filtra com streams (comentário da própria classe: "sete dias é curto o bastante pra caber em memória"). Os filtros novos (turno/setor/epi) e a janela generalizada (since/until) são predicados adicionais sobre a mesma lista, não uma consulta nova ao banco. `historicoAnual` é uma segunda passada sobre a mesma lista `doTenant`, com sua própria janela (ano corrente, fixa) e os mesmos filtros de turno/setor/epi — mas **sem** `since`/`until`. A Task 6 é a única que toca `ReportController` (E6, já mergeado) — só repassa os parâmetros novos pro `SummaryService` que as Tasks 1–5 constroem.

**Tech Stack:** Spring Boot 4.0.6, JUnit 5, MockMvc, AssertJ.

**Spec:** `docs/superpowers/specs/planejadas/2026-09-08-heatmap-funcional-design.md` (repo `cypher-front`), §1 (backend) e §7 (PDF).

**Repositório:** `/home/asaas/projects/cypher`

## Global Constraints

- Repositório: `/home/asaas/projects/cypher`. **Branch local (não worktree):** `git checkout -b feat/hf-backend-heatmap` a partir de `main`, dentro do próprio diretório do repo.
- **Nenhum parâmetro é obrigatório** — `GET /summary` sem query string continua devolvendo exatamente o mesmo shape de hoje (spec §1). Todo teste existente em `SummaryApiTest` continua passando sem alteração.
- **`incidentesHoje`/`incidentesOntem`/`criticosHoje`/`ultimosSeteDias`/`pendentes` nunca mudam** — os parâmetros novos só afetam `heatmap`, `distribuicaoTemporal` e `historicoAnual` (spec §1.1).
- **Erros de validação usam `CatalogValidationException`** (`com.dev4.cypher.catalog.CatalogValidationException`, já existente, tratada globalmente por `CatalogExceptionHandler` → `{"erro": "..."}` no corpo) — mesmo padrão já usado por `EquipeService`/`UsuarioService`/`WebhookService`, apesar do nome da classe.
- **`turno`**: `A` (06–14h), `B` (14–22h), `N` (22–06h, cruza a meia-noite) — calculado da hora local de `Alerta.dataHora` (`ZoneId.systemDefault()`, mesma zona já usada em `SummaryService`), sem vínculo com `Equipe`/`Turno` da E5. Valor fora desses três → `400`.
- **`epi`**: só os quatro valores do mapa abaixo são aceitos; qualquer outro → `400` (spec §1.4, não é resultado vazio silencioso):
  ```java
  private static final Map<String, String> EPI_PARA_VIOLACAO = Map.of(
      "capacete", "no_helmet",
      "oculos",   "no_goggle",
      "luvas",    "no_gloves",
      "botas",    "no_boots"
  );
  ```
- **`historicoAnual` ignora `since`/`until`** — é sempre `LocalDate.now(zona).getYear()` inteiro, Jan 1 a Dez 31, mas respeita `turno`/`setor`/`epi` (spec §1.5).
- **Task 6 toca `ReportController` (E6, já mergeado em `main`)** — único ponto deste plano fora de `SummaryService`/`SummaryResponse`/`SummaryController`. `PdfReportBuilder`/`PlacarService` não mudam; só o `ReportController.summaryPdf` passa a ler 3 parâmetros a mais e repassá-los pro `SummaryService.build(...)` que as Tasks 1–5 já constroem (spec §7).
- Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=NomeDaClasse` para uma classe; `./mvnw -o test` para a suíte inteira.

---

### Task 1: `since`/`until` — generaliza a janela do heatmap espacial

**Files:**
- Modify: `src/main/java/com/dev4/cypher/service/SummaryService.java`
- Modify: `src/main/java/com/dev4/cypher/controller/SummaryController.java`
- Test: `src/test/java/com/dev4/cypher/SummaryApiTest.java`

**Interfaces:**
- Produces: `SummaryService.build(OffsetDateTime since, OffsetDateTime until, String turno, String setor, String epi, boolean detalhado)` — assinatura final que as próximas tasks só preenchem; `SummaryService.build()` (sem argumento, mantido) delega para `build(null, null, null, null, null, false)`.
- Produces: `GET /api/v1/summary?since&until&turno&setor&epi&detalhado`

- [ ] **Step 1: Escrever o teste**

Adicionar em `SummaryApiTest.java` (usa o `incidente(...)` e `semear()` já existentes no arquivo — `EST-01`/`CAM-01` e `EST-02`/`CAM-02` do tenant `acme-test`):

```java
    @Test
    void heatmapRespeitaSinceEUntilQuandoInformados() throws Exception {
        // semear() já grava s1/s2/s3 "hoje" (CAM-01 x2, CAM-02 x1) e s4 "ontem" (CAM-01).
        // Pedindo desde ontem 00h ate agora, o heatmap de EST-01 passa a incluir s4.
        OffsetDateTime desde = OffsetDateTime.now().minusDays(1).withHour(0).withMinute(0).withSecond(0).withNano(0);

        mvc.perform(get("/api/v1/summary")
                        .param("since", desde.toString())
                        .session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-01')].incidentes").value(3))
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-02')].incidentes").value(1));
    }

    @Test
    void semSinceNemUntilHeatmapContinuaSendoSoHoje() throws Exception {
        // Mesmo teste de sempre (heatmapAgregaPorEstacaoIncluindoAsSemIncidente),
        // reafirmado apos a Task 1 para provar que nada mudou por default.
        mvc.perform(get("/api/v1/summary").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-01')].incidentes").value(2))
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-02')].incidentes").value(1));
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SummaryApiTest#heatmapRespeitaSinceEUntilQuandoInformados`
Expected: FAIL — `heatmapRespeitaSinceEUntilQuandoInformados` falha porque `since` ainda não é lido; `semSinceNemUntilHeatmapContinuaSendoSoHoje` deve já passar (não muda comportamento).

- [ ] **Step 3: Reescrever `SummaryService.build`**

Em `src/main/java/com/dev4/cypher/service/SummaryService.java`, substituir a assinatura e o corpo do método (mantendo tudo que já existe para `incidentesHoje`/`incidentesOntem`/`criticosHoje`/`ultimosSeteDias`/`pendentes` intocado):

```java
    @Transactional(readOnly = true)
    public SummaryResponse build() {
        return build(null, null, null, null, null, false);
    }

    @Transactional(readOnly = true)
    public SummaryResponse build(OffsetDateTime since, OffsetDateTime until,
                                  String turno, String setor, String epi, boolean detalhado) {
        ZoneId zona = ZoneId.systemDefault();
        LocalDate hoje = LocalDate.now(zona);
        LocalDate ontem = hoje.minusDays(1);
        OffsetDateTime inicioDaJanela = hoje.minusDays(6).atStartOfDay(zona).toOffsetDateTime();

        // Escopado por tenant (achado de segurança carregado da Tarefa 4):
        // sem isso, todo GESTOR enxergava as contagens/heatmap de QUALQUER
        // empresa. Uma única busca alimenta tanto a janela de 7 dias quanto
        // os pendentes — ambos eram `findAll()` antes desta correção.
        List<Alerta> doTenant = repository.findByEmpresaId(TenantContext.currentEmpresaId());

        List<Alerta> janela = doTenant.stream()
                .filter(a -> !a.getDataHora().isBefore(inicioDaJanela))
                .toList();

        Map<String, String> estacaoPorCamera = new HashMap<>();
        Map<String, StationResponse> estacoes = new HashMap<>();
        for (StationResponse estacao : catalogo.stations()) {
            estacoes.put(estacao.id(), estacao);
            for (CameraResponse camera : estacao.cameras()) {
                estacaoPorCamera.put(camera.id(), estacao.id());
            }
        }

        int incidentesHoje = 0;
        int incidentesOntem = 0;
        int criticosHoje = 0;
        Map<LocalDate, Integer> porDia = new HashMap<>();

        for (Alerta a : janela) {
            LocalDate dia = a.getDataHora().atZoneSameInstant(zona).toLocalDate();
            porDia.merge(dia, 1, Integer::sum);

            if (dia.equals(hoje)) {
                incidentesHoje++;
                if (a.getSeveridade() >= 3) {
                    criticosHoje++;
                }
            } else if (dia.equals(ontem)) {
                incidentesOntem++;
            }
        }

        // Janela do heatmap espacial (e, na Task 4, de distribuicaoTemporal):
        // "hoje" continua sendo o default quando since/until nao vem, mas
        // agora e um parametro, nao mais hardcoded (spec SS1.1).
        OffsetDateTime desde = since != null ? since : hoje.atStartOfDay(zona).toOffsetDateTime();
        OffsetDateTime ate = until != null ? until : OffsetDateTime.now(zona);

        Map<String, Integer> porEstacaoNaJanela = new HashMap<>();
        for (Alerta a : doTenant) {
            if (a.getDataHora().isBefore(desde) || a.getDataHora().isAfter(ate)) {
                continue;
            }
            String estacaoId = estacaoPorCamera.get(TenantContext.codigo(a.getCameraId()));
            if (estacaoId != null) {
                porEstacaoNaJanela.merge(estacaoId, 1, Integer::sum);
            }
        }

        // Estações sem incidente aparecem com zero: uma célula ausente e uma
        // célula zerada significam coisas diferentes no heatmap.
        List<SummaryResponse.StationCell> heatmap = estacoes.values().stream()
                .map(e -> new SummaryResponse.StationCell(e.id(), e.nome(), e.setor(),
                        porEstacaoNaJanela.getOrDefault(e.id(), 0)))
                .sorted((a, b) -> a.estacaoId().compareTo(b.estacaoId()))
                .toList();

        List<SummaryResponse.DayCount> serie = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            LocalDate dia = hoje.minusDays(i);
            serie.add(new SummaryResponse.DayCount(dia, porDia.getOrDefault(dia, 0)));
        }

        int pendentes = (int) doTenant.stream()
                .filter(a -> a.getStatus() == AlertaStatus.PENDENTE)
                .count();

        return new SummaryResponse(incidentesHoje, incidentesOntem, criticosHoje,
                pendentes, heatmap, serie, null, null);
    }
```

(`turno`/`setor`/`epi`/`detalhado` ainda não são usados no corpo — entram nas Tasks 2–5. Os dois `null` finais em `new SummaryResponse(...)` são `distribuicaoTemporal`/`historicoAnual`, que a Task 3 do DTO abaixo introduz.)

- [ ] **Step 4: Adicionar os dois campos novos a `SummaryResponse`**

Em `src/main/java/com/dev4/cypher/dto/SummaryResponse.java`:

```java
package com.dev4.cypher.dto;

import java.time.LocalDate;
import java.util.List;

/** Agregados que alimentam o dashboard sem que o browser precise contar nada. */
public record SummaryResponse(
        int incidentesHoje,
        int incidentesOntem,
        int criticosHoje,
        int pendentes,
        List<StationCell> heatmap,
        List<DayCount> ultimosSeteDias,
        List<TemporalCell> distribuicaoTemporal,
        List<DayCount> historicoAnual
) {

    /** Célula do heatmap: uma estação e sua contagem na janela filtrada. */
    public record StationCell(String estacaoId, String nome, String setor, int incidentes) {
    }

    public record DayCount(LocalDate dia, int incidentes) {
    }

    /** Célula do painel Temporal: dia da semana (0=Seg..6=Dom) x faixa de 2h (0..11). */
    public record TemporalCell(int diaSemana, int faixa2h, int incidentes) {
    }
}
```

- [ ] **Step 5: Atualizar `SummaryController`**

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.SummaryResponse;
import com.dev4.cypher.service.SummaryService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/v1")
public class SummaryController {

    private final SummaryService service;

    public SummaryController(SummaryService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    public SummaryResponse summary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime until,
            @RequestParam(required = false) String turno,
            @RequestParam(required = false) String setor,
            @RequestParam(required = false) String epi,
            @RequestParam(required = false, defaultValue = "false") boolean detalhado) {
        return service.build(since, until, turno, setor, epi, detalhado);
    }
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SummaryApiTest`
Expected: PASS (todos os testes existentes do arquivo + os dois novos)

- [ ] **Step 7: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/main/java/com/dev4/cypher/service/SummaryService.java \
        src/main/java/com/dev4/cypher/dto/SummaryResponse.java \
        src/main/java/com/dev4/cypher/controller/SummaryController.java \
        src/test/java/com/dev4/cypher/SummaryApiTest.java
git commit -m "feat: generaliza janela do heatmap espacial com since/until"
```

---

### Task 2: `turno` e `setor`

**Files:**
- Modify: `src/main/java/com/dev4/cypher/service/SummaryService.java`
- Test: `src/test/java/com/dev4/cypher/SummaryApiTest.java`

**Interfaces:**
- Consumes: `SummaryService.build(...)` de Task 1
- Produces: `GET /summary?turno=A|B|N` e `GET /summary?setor=<valor>` filtram `heatmap`

- [ ] **Step 1: Escrever os testes**

```java
    @Test
    void heatmapFiltraPorTurno() throws Exception {
        // s1 (CAM-01) foi gravado 1h atras por semear() -- pode cair em
        // qualquer turno dependendo da hora local do teste, entao gravamos
        // um incidente com hora conhecida para nao depender do relogio real.
        Alerta madrugada = incidente("turno-n", "CAM-01", 3,
                java.time.LocalDate.now().atTime(23, 0).atZone(java.time.ZoneId.systemDefault()).toOffsetDateTime());
        repository.saveAndFlush(madrugada);

        mvc.perform(get("/api/v1/summary").param("turno", "N").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-01')].incidentes").value(1));
    }

    @Test
    void turnoInvalidoDevolve400() throws Exception {
        mvc.perform(get("/api/v1/summary").param("turno", "X").session(gestor))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.erro").exists());
    }

    @Test
    void heatmapFiltraPorSetor() throws Exception {
        mvc.perform(get("/api/v1/summary").param("setor", "montagem").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-01')].incidentes").value(2))
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-02')].incidentes").value(0));
    }

    @Test
    void heatmapComSetorInexistenteFicaTodoZerado() throws Exception {
        mvc.perform(get("/api/v1/summary").param("setor", "setor-que-nao-existe").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-01')].incidentes").value(0))
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-02')].incidentes").value(0));
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SummaryApiTest`
Expected: FAIL nos quatro testes novos — `turno`/`setor` ainda não filtram nada e não validam.

- [ ] **Step 3: Adicionar os predicados em `SummaryService`**

No topo da classe, adicionar a constante e o método privado:

```java
    private static final Set<String> TURNOS_VALIDOS = Set.of("A", "B", "N");

    private static boolean noTurno(OffsetDateTime dataHora, String turno, ZoneId zona) {
        if (turno == null) {
            return true;
        }
        int hora = dataHora.atZoneSameInstant(zona).getHour();
        return switch (turno) {
            case "A" -> hora >= 6 && hora < 14;
            case "B" -> hora >= 14 && hora < 22;
            case "N" -> hora >= 22 || hora < 6;
            default -> throw new CatalogValidationException(HttpStatus.BAD_REQUEST,
                    "turno invalido: " + turno + " (esperado A, B ou N)");
        };
    }
```

(import `com.dev4.cypher.catalog.CatalogValidationException`, `org.springframework.http.HttpStatus`, `java.util.Set`.)

Em `build(...)`, logo após montar `estacoes`/`estacaoPorCamera` e antes do loop que monta `porEstacaoNaJanela`, validar o turno cedo (para o `400` sair mesmo que a janela filtrada dê vazio antes de qualquer predicado rodar):

```java
        if (turno != null && !TURNOS_VALIDOS.contains(turno)) {
            throw new CatalogValidationException(HttpStatus.BAD_REQUEST,
                    "turno invalido: " + turno + " (esperado A, B ou N)");
        }
```

E no loop de `porEstacaoNaJanela`, acrescentar os dois filtros:

```java
        Map<String, Integer> porEstacaoNaJanela = new HashMap<>();
        for (Alerta a : doTenant) {
            if (a.getDataHora().isBefore(desde) || a.getDataHora().isAfter(ate)) {
                continue;
            }
            if (!noTurno(a.getDataHora(), turno, zona)) {
                continue;
            }
            String estacaoId = estacaoPorCamera.get(TenantContext.codigo(a.getCameraId()));
            if (estacaoId == null) {
                continue;
            }
            if (setor != null && !setor.equals(estacoes.get(estacaoId).setor())) {
                continue;
            }
            porEstacaoNaJanela.merge(estacaoId, 1, Integer::sum);
        }
```

(a validação de `turno` movida pro topo do método deixa `noTurno` livre pra nunca lançar — simplifica a função pra só decidir sim/não, sem duplicar a checagem de validade dentro do loop.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SummaryApiTest`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/dev4/cypher/service/SummaryService.java src/test/java/com/dev4/cypher/SummaryApiTest.java
git commit -m "feat: adiciona filtros de turno e setor ao heatmap espacial"
```

---

### Task 3: `epi`

**Files:**
- Modify: `src/main/java/com/dev4/cypher/service/SummaryService.java`
- Test: `src/test/java/com/dev4/cypher/SummaryApiTest.java`

**Interfaces:**
- Consumes: `SummaryService.build(...)` de Task 2
- Produces: `GET /summary?epi=capacete|oculos|luvas|botas` filtra `heatmap` por `Alerta.epiMissing`; qualquer outro valor → `400`

- [ ] **Step 1: Escrever os testes**

```java
    @Test
    void heatmapFiltraPorEpi() throws Exception {
        Alerta semCapacete = incidente("epi-1", "CAM-01", 2, OffsetDateTime.now());
        semCapacete.setEpiMissing(List.of("no_helmet"));
        repository.saveAndFlush(semCapacete);

        mvc.perform(get("/api/v1/summary").param("epi", "capacete").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-01')].incidentes").value(1))
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-02')].incidentes").value(0));
    }

    @Test
    void epiForaDoMapaDevolve400() throws Exception {
        mvc.perform(get("/api/v1/summary").param("epi", "colete").session(gestor))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.erro").exists());
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SummaryApiTest`
Expected: FAIL — `epi` ainda não é lido nem validado.

- [ ] **Step 3: Adicionar o mapa e o filtro em `SummaryService`**

```java
    private static final Map<String, String> EPI_PARA_VIOLACAO = Map.of(
            "capacete", "no_helmet",
            "oculos",   "no_goggle",
            "luvas",    "no_gloves",
            "botas",    "no_boots"
    );
```

Logo após a validação de `turno` (Task 2, Step 3), validar `epi` e resolver o rótulo de violação:

```java
        String violacaoAlvo = null;
        if (epi != null) {
            violacaoAlvo = EPI_PARA_VIOLACAO.get(epi);
            if (violacaoAlvo == null) {
                throw new CatalogValidationException(HttpStatus.BAD_REQUEST,
                        "epi invalido: " + epi + " (esperado um de " + EPI_PARA_VIOLACAO.keySet() + ")");
            }
        }
```

E no loop de `porEstacaoNaJanela`, mais um filtro (`final` local pro uso em lambda não é necessário aqui, é um `for` comum):

```java
            if (violacaoAlvo != null && !a.getEpiMissing().contains(violacaoAlvo)) {
                continue;
            }
```

(inserir logo depois do `if (!noTurno(...)) continue;` e antes de resolver `estacaoId`.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SummaryApiTest`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/dev4/cypher/service/SummaryService.java src/test/java/com/dev4/cypher/SummaryApiTest.java
git commit -m "feat: adiciona filtro de epi ao heatmap espacial, com validacao 400"
```

---

### Task 4: `detalhado=true` → `distribuicaoTemporal`

**Files:**
- Modify: `src/main/java/com/dev4/cypher/service/SummaryService.java`
- Test: `src/test/java/com/dev4/cypher/SummaryApiTest.java`

**Interfaces:**
- Consumes: `SummaryService.build(...)` de Task 3, `SummaryResponse.TemporalCell` de Task 1
- Produces: `distribuicaoTemporal` preenchido quando `detalhado=true`, respeitando os mesmos filtros de `heatmap` (since/until/turno/setor/epi)

- [ ] **Step 1: Escrever o teste**

```java
    @Test
    void distribuicaoTemporalAgregaPorDiaDaSemanaEFaixaDe2h() throws Exception {
        // Quarta-feira (diaSemana=2, 0=Seg) as 23h -> faixa2h = 23/2 = 11.
        java.time.LocalDate quartaConhecida = java.time.LocalDate.of(2026, 9, 9); // e uma quarta
        assert quartaConhecida.getDayOfWeek() == java.time.DayOfWeek.WEDNESDAY;
        OffsetDateTime as23h = quartaConhecida.atTime(23, 0)
                .atZone(java.time.ZoneId.systemDefault()).toOffsetDateTime();
        repository.saveAndFlush(incidente("temporal-1", "CAM-01", 2, as23h));

        mvc.perform(get("/api/v1/summary")
                        .param("since", quartaConhecida.atStartOfDay().atZone(java.time.ZoneId.systemDefault()).toOffsetDateTime().toString())
                        .param("until", quartaConhecida.plusDays(1).atStartOfDay().atZone(java.time.ZoneId.systemDefault()).toOffsetDateTime().toString())
                        .param("detalhado", "true")
                        .session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.distribuicaoTemporal[?(@.diaSemana==2 && @.faixa2h==11)].incidentes").value(1));
    }

    @Test
    void semDetalhadoDistribuicaoTemporalVemNula() throws Exception {
        mvc.perform(get("/api/v1/summary").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.distribuicaoTemporal").doesNotExist());
    }
```

(`doesNotExist()` do JsonPath aceita tanto ausência de chave quanto valor `null` — cobre a convenção "Jackson serializa `null` explícito" da spec §1.5 sem prender o teste a um dos dois formatos.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SummaryApiTest`
Expected: FAIL — `distribuicaoTemporal` sempre vem `null`, mesmo com `detalhado=true`.

- [ ] **Step 3: Calcular `distribuicaoTemporal` em `SummaryService`**

Depois de montar `heatmap` (mesma janela `desde`/`ate` e os mesmos filtros de turno/setor/epi — a spec §1.5 exige a mesma janela filtrada), adicionar:

```java
        List<SummaryResponse.TemporalCell> distribuicaoTemporal = null;
        if (detalhado) {
            Map<String, Integer> porBucket = new HashMap<>();
            for (Alerta a : doTenant) {
                if (a.getDataHora().isBefore(desde) || a.getDataHora().isAfter(ate)) {
                    continue;
                }
                if (!noTurno(a.getDataHora(), turno, zona)) {
                    continue;
                }
                if (violacaoAlvo != null && !a.getEpiMissing().contains(violacaoAlvo)) {
                    continue;
                }
                String estacaoId = estacaoPorCamera.get(TenantContext.codigo(a.getCameraId()));
                if (estacaoId == null || (setor != null && !setor.equals(estacoes.get(estacaoId).setor()))) {
                    continue;
                }
                var zoned = a.getDataHora().atZoneSameInstant(zona);
                int diaSemana = zoned.getDayOfWeek().getValue() - 1; // 0=Seg .. 6=Dom
                int faixa2h = zoned.getHour() / 2;
                porBucket.merge(diaSemana + ":" + faixa2h, 1, Integer::sum);
            }
            distribuicaoTemporal = new ArrayList<>();
            for (int dia = 0; dia < 7; dia++) {
                for (int faixa = 0; faixa < 12; faixa++) {
                    int contagem = porBucket.getOrDefault(dia + ":" + faixa, 0);
                    distribuicaoTemporal.add(new SummaryResponse.TemporalCell(dia, faixa, contagem));
                }
            }
        }
```

(o loop repete o mesmo filtro do heatmap espacial em vez de reaproveitar `porEstacaoNaJanela` porque a granularidade final é diferente — por bucket dia×hora, não por estação; extrair um `Predicate<Alerta>` comum é um refactor razoável, mas fica fora desta task para não acoplar as duas saídas antes de ambas existirem — ver Task 5, que enfrenta a mesma decisão para `historicoAnual` e é o momento natural de extrair o predicado se o padrão se repetir uma terceira vez.)

Atualizar o `return` do método para passar `distribuicaoTemporal` no lugar do `null` fixo:

```java
        return new SummaryResponse(incidentesHoje, incidentesOntem, criticosHoje,
                pendentes, heatmap, serie, distribuicaoTemporal, null);
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SummaryApiTest`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/dev4/cypher/service/SummaryService.java src/test/java/com/dev4/cypher/SummaryApiTest.java
git commit -m "feat: adiciona distribuicaoTemporal ao summary, atras de detalhado=true"
```

---

### Task 5: `detalhado=true` → `historicoAnual`

**Files:**
- Modify: `src/main/java/com/dev4/cypher/service/SummaryService.java`
- Test: `src/test/java/com/dev4/cypher/SummaryApiTest.java`

**Interfaces:**
- Consumes: `SummaryService.build(...)` de Task 4
- Produces: `historicoAnual` preenchido quando `detalhado=true` — ano corrente inteiro (ignora `since`/`until`), respeita `turno`/`setor`/`epi`

- [ ] **Step 1: Escrever os testes**

```java
    @Test
    void historicoAnualTemUmaLinhaPorDiaDoAnoCorrenteEIgnoraSinceUntil() throws Exception {
        int anoCorrente = java.time.LocalDate.now().getYear();
        java.time.LocalDate diaNoAno = java.time.LocalDate.of(anoCorrente, 3, 15);
        repository.saveAndFlush(incidente("anual-1", "CAM-01", 2,
                diaNoAno.atTime(10, 0).atZone(java.time.ZoneId.systemDefault()).toOffsetDateTime()));

        // since/until aqui apontam pra HOJE -- historicoAnual deve ignorar e
        // trazer o ano inteiro (incluindo 15/mar, fora dessa janela).
        mvc.perform(get("/api/v1/summary")
                        .param("since", OffsetDateTime.now().toString())
                        .param("detalhado", "true")
                        .session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.historicoAnual.length()")
                        .value(anoCorrente % 4 == 0 && (anoCorrente % 100 != 0 || anoCorrente % 400 == 0) ? 366 : 365))
                .andExpect(jsonPath("$.historicoAnual[?(@.dia=='" + diaNoAno + "')].incidentes").value(1));
    }

    @Test
    void semDetalhadoHistoricoAnualVemNulo() throws Exception {
        mvc.perform(get("/api/v1/summary").session(gestor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.historicoAnual").doesNotExist());
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SummaryApiTest`
Expected: FAIL — `historicoAnual` sempre vem `null`.

- [ ] **Step 3: Calcular `historicoAnual` em `SummaryService`**

Depois do bloco de `distribuicaoTemporal` (Task 4), adicionar:

```java
        List<SummaryResponse.DayCount> historicoAnual = null;
        if (detalhado) {
            LocalDate anoInicio = LocalDate.of(hoje.getYear(), 1, 1);
            LocalDate anoFim = LocalDate.of(hoje.getYear(), 12, 31);
            Map<LocalDate, Integer> porDiaDoAno = new HashMap<>();
            for (Alerta a : doTenant) {
                LocalDate dia = a.getDataHora().atZoneSameInstant(zona).toLocalDate();
                if (dia.isBefore(anoInicio) || dia.isAfter(anoFim)) {
                    continue;
                }
                if (!noTurno(a.getDataHora(), turno, zona)) {
                    continue;
                }
                if (violacaoAlvo != null && !a.getEpiMissing().contains(violacaoAlvo)) {
                    continue;
                }
                String estacaoId = estacaoPorCamera.get(TenantContext.codigo(a.getCameraId()));
                if (estacaoId == null || (setor != null && !setor.equals(estacoes.get(estacaoId).setor()))) {
                    continue;
                }
                porDiaDoAno.merge(dia, 1, Integer::sum);
            }
            historicoAnual = new ArrayList<>();
            for (LocalDate dia = anoInicio; !dia.isAfter(anoFim); dia = dia.plusDays(1)) {
                historicoAnual.add(new SummaryResponse.DayCount(dia, porDiaDoAno.getOrDefault(dia, 0)));
            }
        }
```

Atualizar o `return` final:

```java
        return new SummaryResponse(incidentesHoje, incidentesOntem, criticosHoje,
                pendentes, heatmap, serie, distribuicaoTemporal, historicoAnual);
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SummaryApiTest`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/dev4/cypher/service/SummaryService.java src/test/java/com/dev4/cypher/SummaryApiTest.java
git commit -m "feat: adiciona historicoAnual ao summary, atras de detalhado=true"
```

---

### Task 6: `GET /reports/summary.pdf` também respeita turno/setor/epi

> **Achado depois dos planos escritos (2026-09-08):** o botão "Exportar PDF" fica ao lado da barra de filtros no Heatmap — mas o heatmap por estação dentro do PDF sempre veio de `summaryService.build()` sem argumento nenhum, sempre "hoje", sem filtro nenhum. Esta task fecha esse descompasso. Ver spec §7.

**Files:**
- Modify: `src/main/java/com/dev4/cypher/controller/ReportController.java`
- Test: `src/test/java/com/dev4/cypher/ReportControllerApiTest.java`

**Interfaces:**
- Consumes: `SummaryService.build(OffsetDateTime, OffsetDateTime, String, String, String, boolean)` de Task 5, `PlacarService.janelaPadrao(OffsetDateTime, OffsetDateTime)` (já existente)
- Produces: `GET /reports/summary.pdf?since&until&turno&setor&epi` — o heatmap dentro do PDF passa a refletir os quatro filtros; KPIs ("Indicadores (hoje)") continuam sempre hoje, sem mudança

- [ ] **Step 1: Escrever os testes**

Adicionar em `ReportControllerApiTest.java`, logo após `pdfDeResumoEscapaCaracteresHtmlDeNomeDeEquipe` (usa `criarCameraEPegarApiKey`/`payloadDeIncidente` já existentes no arquivo):

```java
    @Test
    void pdfDeResumoRepassaSetorAoHeatmap() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);
        mvc.perform(post("/api/v1/stations").session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"EST-PDF-A\", \"nome\": \"Estacao Pdf A\", \"setor\": \"pdf-setor-a\", \"ativa\": true}"));
        String apiKey = criarCameraEPegarApiKey(session, "CAM-PDF-A", "EST-PDF-A");
        mvc.perform(post("/api/v1/incidents").header("X-Cypher-Key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(payloadDeIncidente("CAM-PDF-A", "incident-pdf-a")));

        // payloadDeIncidente grava detectedAt fixo em 2026-08-29T10:00:00Z (ver
        // helper no fim do arquivo) -- since aqui ancora nesse dia pra nao
        // depender de o teste rodar exatamente "hoje".
        byte[] pdfDoSetorCerto = mvc.perform(get("/api/v1/reports/summary.pdf")
                        .param("since", "2026-08-29T00:00:00Z")
                        .param("setor", "pdf-setor-a")
                        .session(session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        byte[] pdfDeOutroSetor = mvc.perform(get("/api/v1/reports/summary.pdf")
                        .param("since", "2026-08-29T00:00:00Z")
                        .param("setor", "pdf-setor-que-nao-existe")
                        .session(session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();

        // Com o setor errado, a contagem de EST-PDF-A no heatmap do PDF zera --
        // os dois documentos deixam de ser identicos.
        assertThat(pdfDoSetorCerto).isNotEqualTo(pdfDeOutroSetor);
    }

    @Test
    void pdfDeResumoDevolve400ParaTurnoInvalido() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);

        mvc.perform(get("/api/v1/reports/summary.pdf").param("turno", "X").session(session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.erro").exists());
    }

    @Test
    void pdfDeResumoDevolve400ParaEpiInvalido() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);

        mvc.perform(get("/api/v1/reports/summary.pdf").param("epi", "colete").session(session))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.erro").exists());
    }
```

(adicionar o import estático `org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath` se ainda não estiver no arquivo — os outros testes de CSV/PDF já usam `status()`, conferir se `jsonPath` já é importado antes de duplicar o import.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=ReportControllerApiTest`
Expected: FAIL — `summary.pdf` ainda não aceita `turno`/`setor`/`epi`; os dois PDFs do primeiro teste saem idênticos (sem filtro nenhum aplicado); os dois testes de `400` recebem `200` porque o parâmetro é ignorado.

- [ ] **Step 3: Atualizar `ReportController.summaryPdf`**

Em `src/main/java/com/dev4/cypher/controller/ReportController.java`, substituir o método:

```java
    @GetMapping("/summary.pdf")
    public ResponseEntity<byte[]> summaryPdf(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime until,
            @RequestParam(required = false) String turno,
            @RequestParam(required = false) String setor,
            @RequestParam(required = false) String epi) throws IOException {
        OffsetDateTime[] janela = PlacarService.janelaPadrao(since, until);
        byte[] pdf = PdfReportBuilder.resumoExecutivo(
                summaryService.build(janela[0], janela[1], turno, setor, epi, false),
                placarService.placar(janela[0], janela[1]));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=resumo.pdf")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }
```

(`janela[0]`/`janela[1]` agora alimentam tanto `placarService.placar(...)` quanto o heatmap dentro de `summaryService.build(...)` — antes só o placar usava essa janela; o heatmap do PDF ficava preso a "hoje". Os KPIs de `SummaryResponse` — `incidentesHoje`/`incidentesOntem`/`criticosHoje`/`ultimosSeteDias` — continuam calculados sem depender de `since`/`until`/`janela`, dentro do próprio `SummaryService.build(...)`, então "Indicadores (hoje)" no PDF não muda.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=ReportControllerApiTest`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/dev4/cypher/controller/ReportController.java src/test/java/com/dev4/cypher/ReportControllerApiTest.java
git commit -m "feat: liga turno/setor/epi ao heatmap do PDF de resumo executivo"
```

---

## Self-Review

**Cobertura da spec:** §1.1 (since/until) → Task 1. §1.2 (turno) e §1.3 (setor) → Task 2. §1.4 (epi + validação 400) → Task 3. §1.5 (`detalhado`, `distribuicaoTemporal` respeitando os mesmos filtros, `historicoAnual` ignorando since/until) → Tasks 4 e 5. §1.6 (custo conhecido de carregar o ano em memória) → refletido no comentário da Task 5, não endereçado por decisão da própria spec. §3 (comportamento sob falha/vazio) → coberto pelos testes de setor/epi inexistente (vazio, não erro) e epi/turno inválido (400). §7 (`GET /reports/summary.pdf` repassa turno/setor/epi, mesma janela do placar alimenta o heatmap do PDF) → Task 6.

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** `SummaryService.build(OffsetDateTime, OffsetDateTime, String, String, String, boolean)` é a única assinatura nova introduzida, estável da Task 1 em diante; `SummaryResponse.TemporalCell(int, int, int)` e o `DayCount` reaproveitado de `ultimosSeteDias` são os únicos tipos novos, ambos definidos na Task 1 e usados sem alteração nas Tasks 4/5.

---

**Plan complete and saved to `docs/superpowers/plans/heatmap-funcional/2026-09-08-hfa-backend-heatmap.md`.**
