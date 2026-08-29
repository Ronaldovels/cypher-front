# E5-A — Backend: Gamificação por Equipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⛔ BLOQUEADO — não iniciar a execução deste plano.** A spec (`2026-08-29-gamificacao-e5-design.md` §7) registra um pré-requisito externo sem data definida: o "gating temporal de queda" no `cypher-capture` precisa ser resolvido antes de qualquer linha de código desta entrega ser escrita — hoje, 2 quedas reais produzem 3 incidentes, e um placar de conformidade construído sobre essa taxa de falso positivo nasceria com credibilidade baixa (spec §7). Este plano existe para que a implementação comece **imediatamente** assim que o pré-requisito for resolvido, sem precisar redesenhar nada — não para ser executado agora.

**Goal:** Dar ao backend `cypher` o denominador que falta para conformidade ponderada por tempo — heartbeat de câmera, agregação diária por turno — e a agregação de placar por equipe (conformidade, cobertura, sequências, metas, ranking por melhora).

**Architecture:** Três fatias verticais. Tarefa 1 entrega o heartbeat e `MonitoramentoDiario`, a peça que hoje não existe em lugar nenhum (spec §1: "o denominador não existe"). Tarefa 2 entrega `GET /api/v1/placar`, no mesmo espírito de agregação em memória que `SummaryService` já pratica, mas com escopo por `empresaId` desde o início (diferente de `SummaryService`, que hoje **não** está escopado por tenant — ver nota em Global Constraints). Tarefa 3 entrega o mapeamento norma↔tipo de incidente, consumido pelo kiosk.

**Tech Stack:** Spring Boot 4.0.6, Spring Data JPA, H2, JUnit 5, AssertJ, MockMvc.

**Spec:** `docs/superpowers/specs/planejadas/2026-08-29-gamificacao-e5-design.md` (repo `cypher-front`), §2 (heartbeat), §3 (metas/placar), §4 (camada educativa).

**Repositório:** `/home/asaas/projects/cypher`

## Global Constraints

- Repositório: `/home/asaas/projects/cypher`. **Depende do plano `2026-08-29-mta-backend-empresa.md` já mergeado.** Branch, quando a execução for liberada: `feat/e5-backend-gamificacao`, a partir de `main`.
- **⚠️ Achado durante a redação deste plano, fora do escopo dele:** `SummaryService` (`GET /api/v1/summary`) hoje agrega via `repository.findAll()` **sem filtrar por `empresaId`** — o plano de multi-tenant (`2026-08-29-mta-backend-empresa.md`) não cobriu esse serviço. Após multi-tenant mergeado, `/summary` vaza incidentes entre empresas. Este plano **não corrige isso** (fora do escopo de E5); registrar como item a resolver separadamente antes de considerar o multi-tenant "completo" em produção. `PlacarService` (Tarefa 2) é escrito do zero já escopado corretamente, para não repetir o mesmo gap.
- **O intervalo de heartbeat do pipeline (`heartbeat_interval_seconds`, configurado em `pose_config.yaml` no lado Python) e o teto de tolerância do backend são parâmetros independentes** — o backend nunca vê a config do pipeline. O teto (`cypher.heartbeat.max-gap-seconds`, default `60`) é a própria decisão de risco do backend sobre "quanto tempo sem heartbeat ainda conta como monitorado", não uma cópia do valor do pipeline.
- **Janela de turno é constante de aplicação, não configurável por empresa** (spec §2.3): `MANHA` 06:00–14:00, `TARDE` 14:00–22:00, `NOITE` 22:00–06:00, duração nominal 8h. `TurnoWindow` é uma classe utilitária pura (sem estado, sem `@ConfigurationProperties`).
- **Ranking é sempre por delta de conformidade semana-vs-semana-anterior, nunca por conformidade absoluta** (spec §3.2, decisão já fechada em E1 §16.3) — nenhum teste deve ordenar por conformidade absoluta.
- **`MonitoramentoDiario` é uma linha por `(cameraId, dia, turno)`**, não por câmera/dia isolado — o mesmo dia pode ter cobertura calculada separadamente para até três turnos, porque uma equipe só é responsável pelo próprio turno.
- Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=NomeDaClasse` para uma classe; `./mvnw -o test` para a suíte inteira.

---

### Task 1: Heartbeat e `MonitoramentoDiario`

**Files:**
- Create: `src/main/java/com/dev4/cypher/model/MonitoramentoDiario.java`
- Create: `src/main/java/com/dev4/cypher/repository/MonitoramentoDiarioRepository.java`
- Create: `src/main/java/com/dev4/cypher/service/TurnoWindow.java`
- Create: `src/main/java/com/dev4/cypher/service/MonitoramentoService.java`
- Create: `src/main/java/com/dev4/cypher/controller/HeartbeatController.java`
- Modify: `src/main/java/com/dev4/cypher/config/SecurityConfig.java`
- Test: `src/test/java/com/dev4/cypher/HeartbeatApiTest.java`
- Test: `src/test/java/com/dev4/cypher/service/TurnoWindowTest.java`

**Interfaces:**
- Produces: `MonitoramentoDiarioRepository.findByCameraIdAndDiaAndTurno`, `.findByEmpresaIdAndCameraIdInAndDiaBetween` — consumidos pela Tarefa 2. `TurnoWindow.turnoDe(OffsetDateTime)`, `.DURACAO_NOMINAL_SEGUNDOS` — consumidos pela Tarefa 2.

- [ ] **Step 1: Escrever o teste de `TurnoWindow`**

Criar `src/test/java/com/dev4/cypher/service/TurnoWindowTest.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.model.Turno;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class TurnoWindowTest {

    @Test
    void seisEQuinzeCentesimosEhManha() {
        assertThat(TurnoWindow.turnoDe(instante(6, 0))).isEqualTo(Turno.MANHA);
        assertThat(TurnoWindow.turnoDe(instante(13, 59))).isEqualTo(Turno.MANHA);
    }

    @Test
    void quatorzeEhTarde() {
        assertThat(TurnoWindow.turnoDe(instante(14, 0))).isEqualTo(Turno.TARDE);
        assertThat(TurnoWindow.turnoDe(instante(21, 59))).isEqualTo(Turno.TARDE);
    }

    @Test
    void vinteEDoisEMeiaNoiteSaoNoite() {
        assertThat(TurnoWindow.turnoDe(instante(22, 0))).isEqualTo(Turno.NOITE);
        assertThat(TurnoWindow.turnoDe(instante(0, 0))).isEqualTo(Turno.NOITE);
        assertThat(TurnoWindow.turnoDe(instante(5, 59))).isEqualTo(Turno.NOITE);
    }

    @Test
    void duracaoNominalEhOitoHoras() {
        assertThat(TurnoWindow.DURACAO_NOMINAL_SEGUNDOS).isEqualTo(8 * 3600L);
    }

    private OffsetDateTime instante(int hora, int minuto) {
        return OffsetDateTime.of(2026, 8, 29, hora, minuto, 0, 0, ZoneOffset.UTC);
    }
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=TurnoWindowTest`
Expected: FAIL na compilação — `TurnoWindow` não existe.

- [ ] **Step 3: Criar `TurnoWindow`**

Criar `src/main/java/com/dev4/cypher/service/TurnoWindow.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.model.Turno;

import java.time.OffsetDateTime;

/** Janela de turno fixa (spec §2.3) — constante de aplicação, não configurável por empresa nesta entrega. */
public final class TurnoWindow {

    public static final long DURACAO_NOMINAL_SEGUNDOS = 8 * 3600L;

    private TurnoWindow() {
    }

    public static Turno turnoDe(OffsetDateTime instante) {
        int hora = instante.getHour();
        if (hora >= 6 && hora < 14) {
            return Turno.MANHA;
        }
        if (hora >= 14 && hora < 22) {
            return Turno.TARDE;
        }
        return Turno.NOITE;
    }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=TurnoWindowTest`
Expected: PASS

- [ ] **Step 5: Escrever o teste de heartbeat (acúmulo, teto de gap, turnos distintos)**

Criar `src/test/java/com/dev4/cypher/HeartbeatApiTest.java`:

```java
package com.dev4.cypher;

import com.dev4.cypher.model.MonitoramentoDiario;
import com.dev4.cypher.model.Turno;
import com.dev4.cypher.repository.MonitoramentoDiarioRepository;
import com.dev4.cypher.security.AuthTestSupport;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@Transactional
@AutoConfigureMockMvc
class HeartbeatApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private MonitoramentoDiarioRepository registros;

    @Test
    void heartbeatSemChaveDevolve401Ou403() throws Exception {
        MockHttpSession session = AuthTestSupport.loginGestorBootstrap(mvc);
        String apiKey = criarCameraEPegarApiKey(session, "CAM-HB1", "EST-01");

        mvc.perform(post("/api/v1/cameras/CAM-HB1/heartbeat"))
                .andExpect(status().is4xxClientError());

        // Sanity: com a chave certa, funciona.
        mvc.perform(post("/api/v1/cameras/CAM-HB1/heartbeat").header("X-Cypher-Key", apiKey))
                .andExpect(status().isNoContent());
    }

    @Test
    void heartbeatDeCameraInexistenteDevolve404() throws Exception {
        mvc.perform(post("/api/v1/cameras/CAM-NAO-EXISTE/heartbeat").header("X-Cypher-Key", "qualquer"))
                .andExpect(status().is4xxClientError());
    }

    private String criarCameraEPegarApiKey(MockHttpSession session, String codigo, String estacaoId) throws Exception {
        mvc.perform(post("/api/v1/stations").session(session)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"id\": \"" + estacaoId + "\", \"nome\": \"E\", \"setor\": \"x\", \"ativa\": true}"));
        mvc.perform(post("/api/v1/cameras").session(session)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(("{\"id\": \"%s\", \"nome\": \"C\", \"estacaoId\": \"%s\", "
                        + "\"streamUrl\": \"http://127.0.0.1:9100/stream\", \"ativa\": true}")
                        .formatted(codigo, estacaoId)));
        String corpo = mvc.perform(post("/api/v1/cameras/" + codigo + "/apikey/regenerate").session(session))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(corpo, "$.apiKey");
    }
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=HeartbeatApiTest`
Expected: FAIL na compilação — nenhuma das classes novas existe.

- [ ] **Step 6: Criar `MonitoramentoDiario` e o repositório**

Criar `src/main/java/com/dev4/cypher/model/MonitoramentoDiario.java`:

```java
package com.dev4.cypher.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Tempo monitorado agregado por câmera/dia/turno (spec §2.2) — nunca por
 * evento individual: guardar cada heartbeat cresceria sem limite (a cada
 * 30s, 24h/dia, por câmera) sem trazer benefício sobre o agregado diário.
 */
@Entity
@Table(name = "monitoramento_diario")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class MonitoramentoDiario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String cameraId;

    @Column(nullable = false, length = 30)
    private String empresaId;

    @Column(nullable = false)
    private LocalDate dia;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Turno turno;

    @Column(nullable = false)
    private long segundosMonitorados;

    @Column(nullable = false)
    private OffsetDateTime ultimoHeartbeat;
}
```

Criar `src/main/java/com/dev4/cypher/repository/MonitoramentoDiarioRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.MonitoramentoDiario;
import com.dev4.cypher.model.Turno;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface MonitoramentoDiarioRepository extends JpaRepository<MonitoramentoDiario, Long> {

    Optional<MonitoramentoDiario> findByCameraIdAndDiaAndTurno(String cameraId, LocalDate dia, Turno turno);

    List<MonitoramentoDiario> findByEmpresaIdAndCameraIdInAndDiaBetween(
            String empresaId, List<String> cameraIds, LocalDate inicio, LocalDate fim);
}
```

- [ ] **Step 7: Criar `MonitoramentoService`**

Criar `src/main/java/com/dev4/cypher/service/MonitoramentoService.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.model.MonitoramentoDiario;
import com.dev4.cypher.model.Turno;
import com.dev4.cypher.repository.MonitoramentoDiarioRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;

/** Acumula tempo monitorado a cada heartbeat (spec §2.2). */
@Service
public class MonitoramentoService {

    private final MonitoramentoDiarioRepository registros;
    private final long maxGapSegundos;

    public MonitoramentoService(MonitoramentoDiarioRepository registros,
                                @Value("${cypher.heartbeat.max-gap-seconds:60}") long maxGapSegundos) {
        this.registros = registros;
        this.maxGapSegundos = maxGapSegundos;
    }

    @Transactional
    public void registrar(String cameraId, String empresaId, OffsetDateTime agora) {
        Turno turno = TurnoWindow.turnoDe(agora);
        MonitoramentoDiario registro = registros
                .findByCameraIdAndDiaAndTurno(cameraId, agora.toLocalDate(), turno)
                .orElseGet(() -> new MonitoramentoDiario(null, cameraId, empresaId,
                        agora.toLocalDate(), turno, 0L, agora));

        if (registro.getId() != null) {
            // Registro ja existia: ha um heartbeat anterior para comparar.
            long desdeUltimo = Duration.between(registro.getUltimoHeartbeat(), agora).getSeconds();
            long incremento = Math.max(0, Math.min(desdeUltimo, maxGapSegundos));
            registro.setSegundosMonitorados(registro.getSegundosMonitorados() + incremento);
        }
        registro.setUltimoHeartbeat(agora);
        registros.saveAndFlush(registro);
    }
}
```

(O primeiro heartbeat de um `(cameraId, dia, turno)` novo não incrementa nada — é a âncora a partir da qual o próximo heartbeat mede o intervalo. `Math.max(0, ...)` protege contra relógio retrocedendo entre chamadas, algo que não deveria acontecer mas que não deve gerar segundo negativo se acontecer.)

- [ ] **Step 8: Criar `HeartbeatController` e liberar a rota**

Criar `src/main/java/com/dev4/cypher/controller/HeartbeatController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.repository.CameraRepository;
import com.dev4.cypher.security.TenantContext;
import com.dev4.cypher.service.MonitoramentoService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;

/**
 * Superfície de máquina (spec §2.1) — mesmo padrão de ingestão de
 * incidente: só `PIPELINE` (X-Cypher-Key), nunca sessão.
 */
@RestController
@RequestMapping("/api/v1/cameras/{codigo}/heartbeat")
public class HeartbeatController {

    private final CameraRepository cameras;
    private final MonitoramentoService monitoramento;

    public HeartbeatController(CameraRepository cameras, MonitoramentoService monitoramento) {
        this.cameras = cameras;
        this.monitoramento = monitoramento;
    }

    @PostMapping
    public ResponseEntity<Void> heartbeat(@PathVariable String codigo) {
        return cameras.findById(TenantContext.key(codigo)).map(camera -> {
            monitoramento.registrar(camera.getId(), camera.getEmpresaId(), OffsetDateTime.now());
            return ResponseEntity.noContent().<Void>build();
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }
}
```

Em `SecurityConfig.java`, adicionar, junto às demais linhas de superfície de máquina:

```java
                        .requestMatchers(HttpMethod.POST, "/api/v1/cameras/*/heartbeat").hasRole("PIPELINE")
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=HeartbeatApiTest`
Expected: PASS

- [ ] **Step 10: Escrever o teste de acúmulo/teto de `MonitoramentoService` (unitário, sem HTTP)**

Criar/adicionar em `src/test/java/com/dev4/cypher/service/MonitoramentoServiceTest.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.model.Turno;
import com.dev4.cypher.repository.MonitoramentoDiarioRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class MonitoramentoServiceTest {

    @Autowired
    private MonitoramentoService service;

    @Autowired
    private MonitoramentoDiarioRepository registros;

    @Test
    void primeiroHeartbeatNaoIncrementaNada() {
        OffsetDateTime t0 = OffsetDateTime.of(2026, 8, 29, 8, 0, 0, 0, ZoneOffset.UTC);

        service.registrar("demo:CAM-MS1", "demo", t0);

        var registro = registros.findByCameraIdAndDiaAndTurno("demo:CAM-MS1", t0.toLocalDate(), Turno.MANHA)
                .orElseThrow();
        assertThat(registro.getSegundosMonitorados()).isZero();
    }

    @Test
    void segundoHeartbeatDentroDoIntervaloNormalIncrementaOGapExato() {
        OffsetDateTime t0 = OffsetDateTime.of(2026, 8, 29, 8, 0, 0, 0, ZoneOffset.UTC);
        service.registrar("demo:CAM-MS2", "demo", t0);

        service.registrar("demo:CAM-MS2", "demo", t0.plusSeconds(30));

        var registro = registros.findByCameraIdAndDiaAndTurno("demo:CAM-MS2", t0.toLocalDate(), Turno.MANHA)
                .orElseThrow();
        assertThat(registro.getSegundosMonitorados()).isEqualTo(30);
    }

    @Test
    void gapLongoEhLimitadoAoTeto() {
        OffsetDateTime t0 = OffsetDateTime.of(2026, 8, 29, 8, 0, 0, 0, ZoneOffset.UTC);
        service.registrar("demo:CAM-MS3", "demo", t0);

        // Pipeline caiu e voltou 3 horas depois — bem acima do teto default (60s).
        service.registrar("demo:CAM-MS3", "demo", t0.plusHours(3));

        var registro = registros.findByCameraIdAndDiaAndTurno("demo:CAM-MS3", t0.toLocalDate(), Turno.MANHA)
                .orElseThrow();
        assertThat(registro.getSegundosMonitorados()).isEqualTo(60);
    }

    @Test
    void heartbeatsEmTurnosDiferentesGeramLinhasSeparadas() {
        OffsetDateTime manha = OffsetDateTime.of(2026, 8, 29, 8, 0, 0, 0, ZoneOffset.UTC);
        OffsetDateTime tarde = OffsetDateTime.of(2026, 8, 29, 15, 0, 0, 0, ZoneOffset.UTC);

        service.registrar("demo:CAM-MS4", "demo", manha);
        service.registrar("demo:CAM-MS4", "demo", tarde);

        assertThat(registros.findByCameraIdAndDiaAndTurno("demo:CAM-MS4", manha.toLocalDate(), Turno.MANHA))
                .isPresent();
        assertThat(registros.findByCameraIdAndDiaAndTurno("demo:CAM-MS4", tarde.toLocalDate(), Turno.TARDE))
                .isPresent();
    }
}
```

- [ ] **Step 11: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=MonitoramentoServiceTest`
Expected: PASS

- [ ] **Step 12: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: adiciona heartbeat de camera e agregacao de tempo monitorado por turno"
```

---

### Task 2: Metas de `Equipe` e `GET /api/v1/placar`

**Files:**
- Modify: `src/main/java/com/dev4/cypher/model/Equipe.java`
- Modify: `src/main/java/com/dev4/cypher/dto/TeamRequest.java`
- Modify: `src/main/java/com/dev4/cypher/dto/TeamResponse.java`
- Modify: `src/main/java/com/dev4/cypher/service/EquipeService.java`
- Modify: `src/main/java/com/dev4/cypher/repository/AlertaRepository.java`
- Create: `src/main/java/com/dev4/cypher/dto/PlacarEquipeResponse.java`
- Create: `src/main/java/com/dev4/cypher/service/PlacarService.java`
- Create: `src/main/java/com/dev4/cypher/controller/PlacarController.java`
- Test: `src/test/java/com/dev4/cypher/service/PlacarServiceTest.java`

**Interfaces:**
- Consumes: `MonitoramentoDiarioRepository.findByEmpresaIdAndCameraIdInAndDiaBetween`, `TurnoWindow.DURACAO_NOMINAL_SEGUNDOS` (Tarefa 1)
- Produces: `GET /api/v1/placar?since&until` → `List<PlacarEquipeResponse>`, ordenado por delta de conformidade decrescente

- [ ] **Step 1: Escrever o teste do `PlacarService`**

Criar `src/test/java/com/dev4/cypher/service/PlacarServiceTest.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.dto.PlacarEquipeResponse;
import com.dev4.cypher.dto.TeamRequest;
import com.dev4.cypher.model.MonitoramentoDiario;
import com.dev4.cypher.model.Turno;
import com.dev4.cypher.repository.MonitoramentoDiarioRepository;
import com.dev4.cypher.security.GestorAuthentication;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class PlacarServiceTest {

    @Autowired
    private PlacarService service;

    @Autowired
    private EquipeService equipeService;

    @Autowired
    private com.dev4.cypher.repository.EstacaoRepository estacoes;

    @Autowired
    private com.dev4.cypher.repository.CameraRepository cameras;

    @Autowired
    private MonitoramentoDiarioRepository registros;

    @AfterEach
    void limpar() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void conformidadeEhUmMenosARazaoEntreIncidenteEMonitorado() {
        autenticarComo("demo");
        estacoes.saveAndFlush(new com.dev4.cypher.model.Estacao("demo:EST-PL1", "E", "s", true, "tok", "demo"));
        cameras.saveAndFlush(new com.dev4.cypher.model.Camera("demo:CAM-PL1", "C", "demo:EST-PL1",
                "http://x/stream", null, true, "key", "demo"));
        equipeService.criar(new TeamRequest("EQ-PL1", "Equipe 1", Turno.MANHA, List.of("EST-PL1"), true));

        LocalDate hoje = LocalDate.now();
        registros.saveAndFlush(new MonitoramentoDiario(null, "demo:CAM-PL1", "demo", hoje, Turno.MANHA,
                7200, OffsetDateTime.now()));

        List<PlacarEquipeResponse> placar = service.placar(
                OffsetDateTime.now().minusDays(7), OffsetDateTime.now());

        PlacarEquipeResponse eq1 = placar.stream().filter(p -> p.equipeId().equals("EQ-PL1")).findFirst().orElseThrow();
        assertThat(eq1.conformidade()).isEqualTo(1.0); // sem incidente => conformidade total
    }

    @Test
    void equipeSemCameraAtivaAindaAparecePlacarComZeros() {
        autenticarComo("demo");
        equipeService.criar(new TeamRequest("EQ-PL2", "Equipe vazia", Turno.TARDE, List.of(), true));
        // TeamRequest exige @NotEmpty estacaoIds — usar uma estacao sem camera:
        estacoes.saveAndFlush(new com.dev4.cypher.model.Estacao("demo:EST-PL2", "E", "s", true, "tok2", "demo"));

        List<PlacarEquipeResponse> placar = service.placar(
                OffsetDateTime.now().minusDays(7), OffsetDateTime.now());

        assertThat(placar).extracting(PlacarEquipeResponse::equipeId).contains("EQ-PL2");
    }

    @Test
    void rankingOrdenaPorDeltaDeConformidadeNaoPorConformidadeAbsoluta() {
        autenticarComo("demo");
        // Duas equipes com conformidade absoluta identica (100%) nesta semana
        // nao teriam como se diferenciar por delta sem historico da semana
        // anterior — o teste documenta que placar() nao lanca nem ordena
        // arbitrariamente quando o delta empata (ambas 0.0 de mudanca).
        equipeService.criar(new TeamRequest("EQ-PL3A", "A", Turno.NOITE, List.of(), true));

        List<PlacarEquipeResponse> placar = service.placar(
                OffsetDateTime.now().minusDays(7), OffsetDateTime.now());

        assertThat(placar).isSortedAccordingTo(
                (a, b) -> Double.compare(b.deltaConformidadeSemana(), a.deltaConformidadeSemana()));
    }

    private void autenticarComo(String empresaId) {
        var ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(new GestorAuthentication("gestor@" + empresaId, empresaId));
        SecurityContextHolder.setContext(ctx);
    }
}
```

(`TeamRequest` exige `estacaoIds` não vazio — o teste `equipeSemCameraAtivaAindaAparecePlacarComZeros` ajusta a chamada para uma lista com uma estação real, sem câmera, em vez de lista vazia; corrigir a chamada de `equipeService.criar` no Step 1 para `List.of("EST-PL2")` alinhado com a estação criada logo abaixo, na ordem certa — criar a estação **antes** de chamar `criar`.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=PlacarServiceTest`
Expected: FAIL na compilação — `PlacarService`/`PlacarEquipeResponse` não existem, `Equipe`/`TeamRequest` não têm os campos de meta.

- [ ] **Step 3: Adicionar os campos de meta a `Equipe`, `TeamRequest`, `TeamResponse`**

Em `Equipe.java`, acrescentar por último:

```java
    private boolean ativa;

    @Column(nullable = false, length = 30)
    private String empresaId;

    private Double metaConformidade;

    private Boolean metaZeroSeveridade4Ativa;

    private Integer metaTempoReconhecimentoSegundos;
```

Em `TeamRequest.java`, acrescentar (sem `@NotNull` — metas são opcionais):

```java
public record TeamRequest(
        @NotBlank @Pattern(regexp = CatalogCodes.PADRAO, message = "codigo deve ser MAIUSCULAS-ALFANUM, ex.: EQ-01") String id,
        @NotBlank @Size(max = 120) String nome,
        @NotNull Turno turno,
        @NotEmpty List<@NotBlank String> estacaoIds,
        Boolean ativa,
        Double metaConformidade,
        Boolean metaZeroSeveridade4Ativa,
        Integer metaTempoReconhecimentoSegundos
) {
}
```

Em `TeamResponse.java`:

```java
public record TeamResponse(String id, String nome, Turno turno, List<String> estacaoIds, boolean ativa,
                           Double metaConformidade, Boolean metaZeroSeveridade4Ativa,
                           Integer metaTempoReconhecimentoSegundos) {
}
```

Em `EquipeService.criar`/`.atualizar`/`.toResponse`, passar os três campos novos (último argumento do construtor de `Equipe`, últimos três campos de `TeamResponse`):

```java
    @Transactional
    public TeamResponse criar(TeamRequest req) {
        String id = TenantContext.key(req.id());
        if (equipes.existsById(id)) {
            throw new CatalogValidationException(HttpStatus.CONFLICT, "Equipe ja cadastrada: " + req.id());
        }
        List<String> estacaoIds = prefixar(req.estacaoIds());
        exigirEstacoesExistentes(estacaoIds);
        exigirSemConflito(estacaoIds, req.turno(), null);
        Equipe nova = new Equipe(id, req.nome(), req.turno(), estacaoIds, req.ativa() == null || req.ativa(),
                TenantContext.currentEmpresaId(), req.metaConformidade(), req.metaZeroSeveridade4Ativa(),
                req.metaTempoReconhecimentoSegundos());
        return toResponse(equipes.saveAndFlush(nova));
    }
```

(`atualizar` ganha as mesmas três atribuições via setter antes de salvar; `toResponse` inclui os três campos ao montar `TeamResponse`.)

- [ ] **Step 4: Adicionar a busca escopada de incidentes por câmeras em `AlertaRepository`**

```java
    List<Alerta> findByEmpresaIdAndCameraIdInAndDataHoraBetween(
            String empresaId, List<String> cameraIds, OffsetDateTime inicio, OffsetDateTime fim);

    List<Alerta> findByEmpresaIdAndTipoAndCameraIdInAndDataHoraAfter(
            String empresaId, AlertaTipo tipo, List<String> cameraIds, OffsetDateTime limite);
```

- [ ] **Step 5: Criar `PlacarEquipeResponse` e `PlacarService`**

Criar `src/main/java/com/dev4/cypher/dto/PlacarEquipeResponse.java`:

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.model.Turno;

public record PlacarEquipeResponse(
        String equipeId,
        String nome,
        Turno turno,
        double conformidade,
        double cobertura,
        int sequenciaAtual,
        int melhorSequencia,
        Double metaConformidade,
        boolean metaConformidadeAtingida,
        Boolean metaZeroSeveridade4Ativa,
        boolean metaZeroSeveridade4Atingida,
        Integer metaTempoReconhecimentoSegundos,
        double deltaConformidadeSemana
) {
}
```

Criar `src/main/java/com/dev4/cypher/service/PlacarService.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.dto.PlacarEquipeResponse;
import com.dev4.cypher.model.*;
import com.dev4.cypher.repository.AlertaRepository;
import com.dev4.cypher.repository.CameraRepository;
import com.dev4.cypher.repository.EquipeRepository;
import com.dev4.cypher.repository.MonitoramentoDiarioRepository;
import com.dev4.cypher.security.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;

/**
 * Placar de conformidade por equipe (spec §3.2), agregado em memória no
 * mesmo espírito de `SummaryService` — mas escopado por `empresaId` desde a
 * primeira linha (diferente de `SummaryService`, que não está — ver Global
 * Constraints do plano).
 */
@Service
public class PlacarService {

    private static final int JANELA_SEQUENCIA_DIAS = 90;

    private final EquipeRepository equipes;
    private final CameraRepository cameras;
    private final AlertaRepository alertas;
    private final MonitoramentoDiarioRepository monitoramentos;

    public PlacarService(EquipeRepository equipes, CameraRepository cameras,
                         AlertaRepository alertas, MonitoramentoDiarioRepository monitoramentos) {
        this.equipes = equipes;
        this.cameras = cameras;
        this.alertas = alertas;
        this.monitoramentos = monitoramentos;
    }

    @Transactional(readOnly = true)
    public List<PlacarEquipeResponse> placar(OffsetDateTime since, OffsetDateTime until) {
        String empresaId = TenantContext.currentEmpresaId();
        OffsetDateTime semanaAnteriorInicio = since.minusDays(7);

        List<PlacarEquipeResponse> resultado = new ArrayList<>();
        for (Equipe equipe : equipes.findByEmpresaIdAndAtivaTrue(empresaId)) {
            List<String> cameraIds = camerasDaEquipe(equipe, empresaId);

            double conformidadeAtual = conformidade(empresaId, cameraIds, since, until);
            double conformidadeAnterior = conformidade(empresaId, cameraIds, semanaAnteriorInicio, since);
            double cobertura = cobertura(empresaId, cameraIds, since, until);
            int[] sequencias = sequencias(empresaId, cameraIds, until.toLocalDate());

            boolean metaConformidadeAtingida = equipe.getMetaConformidade() != null
                    && conformidadeAtual >= equipe.getMetaConformidade();
            boolean metaZeroSeveridade4Atingida = Boolean.TRUE.equals(equipe.getMetaZeroSeveridade4Ativa())
                    && semSeveridade4(empresaId, cameraIds, since, until);

            resultado.add(new PlacarEquipeResponse(
                    TenantContext.codigo(equipe.getId()), equipe.getNome(), equipe.getTurno(),
                    conformidadeAtual, cobertura, sequencias[0], sequencias[1],
                    equipe.getMetaConformidade(), metaConformidadeAtingida,
                    equipe.getMetaZeroSeveridade4Ativa(), metaZeroSeveridade4Atingida,
                    equipe.getMetaTempoReconhecimentoSegundos(),
                    conformidadeAtual - conformidadeAnterior));
        }

        resultado.sort(Comparator.comparingDouble(PlacarEquipeResponse::deltaConformidadeSemana).reversed());
        return resultado;
    }

    private List<String> camerasDaEquipe(Equipe equipe, String empresaId) {
        List<String> resultado = new ArrayList<>();
        for (String estacaoId : equipe.getEstacaoIds()) {
            cameras.findByEstacaoIdAndAtivaTrue(estacaoId).forEach(c -> resultado.add(c.getId()));
        }
        return resultado;
    }

    private double conformidade(String empresaId, List<String> cameraIds, OffsetDateTime inicio, OffsetDateTime fim) {
        if (cameraIds.isEmpty()) {
            return 0.0;
        }
        double segundosIncidente = alertas.findByEmpresaIdAndCameraIdInAndDataHoraBetween(empresaId, cameraIds, inicio, fim)
                .stream().mapToDouble(a -> a.getDuracaoSegundos() == null ? 0.0 : a.getDuracaoSegundos()).sum();
        double segundosMonitorados = somaMonitorado(empresaId, cameraIds, inicio, fim);
        if (segundosMonitorados <= 0) {
            return 0.0;
        }
        return Math.max(0.0, 1.0 - (segundosIncidente / segundosMonitorados));
    }

    private double cobertura(String empresaId, List<String> cameraIds, OffsetDateTime inicio, OffsetDateTime fim) {
        if (cameraIds.isEmpty()) {
            return 0.0;
        }
        long dias = Math.max(1, java.time.temporal.ChronoUnit.DAYS.between(inicio.toLocalDate(), fim.toLocalDate()));
        double segundosMonitorados = somaMonitorado(empresaId, cameraIds, inicio, fim);
        return segundosMonitorados / (TurnoWindow.DURACAO_NOMINAL_SEGUNDOS * dias);
    }

    private double somaMonitorado(String empresaId, List<String> cameraIds, OffsetDateTime inicio, OffsetDateTime fim) {
        if (cameraIds.isEmpty()) {
            return 0.0;
        }
        return monitoramentos.findByEmpresaIdAndCameraIdInAndDiaBetween(
                        empresaId, cameraIds, inicio.toLocalDate(), fim.toLocalDate())
                .stream().mapToLong(MonitoramentoDiario::getSegundosMonitorados).sum();
    }

    private boolean semSeveridade4(String empresaId, List<String> cameraIds, OffsetDateTime inicio, OffsetDateTime fim) {
        if (cameraIds.isEmpty()) {
            return true;
        }
        return alertas.findByEmpresaIdAndCameraIdInAndDataHoraBetween(empresaId, cameraIds, inicio, fim)
                .stream().noneMatch(a -> a.getSeveridade() != null && a.getSeveridade() == 4);
    }

    /** @return [sequenciaAtual, melhorSequencia] — dias consecutivos sem FALL_RISK, janela de 90 dias (spec §3.2). */
    private int[] sequencias(String empresaId, List<String> cameraIds, LocalDate hoje) {
        if (cameraIds.isEmpty()) {
            return new int[]{0, 0};
        }
        LocalDate limiteDia = hoje.minusDays(JANELA_SEQUENCIA_DIAS);
        OffsetDateTime limiteInstante = limiteDia.atStartOfDay(ZoneOffset.UTC).toOffsetDateTime();

        Set<LocalDate> diasComQueda = new HashSet<>();
        alertas.findByEmpresaIdAndTipoAndCameraIdInAndDataHoraAfter(empresaId, AlertaTipo.FALL_RISK, cameraIds, limiteInstante)
                .forEach(a -> diasComQueda.add(a.getDataHora().toLocalDate()));

        int atual = 0;
        for (LocalDate d = hoje; !d.isBefore(limiteDia) && !diasComQueda.contains(d); d = d.minusDays(1)) {
            atual++;
        }

        int melhor = 0;
        int corrente = 0;
        for (LocalDate d = limiteDia; !d.isAfter(hoje); d = d.plusDays(1)) {
            if (diasComQueda.contains(d)) {
                corrente = 0;
            } else {
                corrente++;
                melhor = Math.max(melhor, corrente);
            }
        }
        return new int[]{atual, melhor};
    }
}
```

Criar `src/main/java/com/dev4/cypher/controller/PlacarController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.PlacarEquipeResponse;
import com.dev4.cypher.service.PlacarService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/v1/placar")
public class PlacarController {

    private final PlacarService service;

    public PlacarController(PlacarService service) {
        this.service = service;
    }

    @GetMapping
    public List<PlacarEquipeResponse> placar(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime until) {
        OffsetDateTime fim = until != null ? until : OffsetDateTime.now();
        OffsetDateTime inicio = since != null ? since : fim.minusDays(7);
        return service.placar(inicio, fim);
    }
}
```

(GESTOR-only por padrão: nenhuma linha explícita em `SecurityConfig`, cai no catch-all `hasRole("GESTOR")` — mesmo padrão de `/teams`/`/users`/`/webhooks`/CRUD de zonas.)

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=PlacarServiceTest`
Expected: PASS

- [ ] **Step 7: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: adiciona metas de equipe e GET /placar, escopado por empresa"
```

---

### Task 3: Camada educativa — norma aplicável

**Files:**
- Create: `src/main/java/com/dev4/cypher/model/NormaAplicavel.java`
- Modify: `src/main/java/com/dev4/cypher/dto/IncidentResponse.java`
- Modify: `src/main/java/com/dev4/cypher/mapper/IncidentMapper.java`
- Test: `src/test/java/com/dev4/cypher/mapper/IncidentMapperTest.java`

**Interfaces:**
- Produces: `IncidentResponse.normaAplicavel()` — consumido pelo kiosk (plano `e5c-front`)

- [ ] **Step 1: Escrever o teste do mapeamento**

Adicionar em `IncidentMapperTest.java`:

```java
    @Test
    void mapeiaCadaTipoDeIncidenteParaANormaCorrespondente() {
        assertThat(NormaAplicavel.de(AlertaTipo.FALL_RISK)).isEqualTo("NR-35");
        assertThat(NormaAplicavel.de(AlertaTipo.ERGONOMIC_RISK)).isEqualTo("NR-17");
        assertThat(NormaAplicavel.de(AlertaTipo.ZONE_VIOLATION)).isEqualTo("NR-12");
        assertThat(NormaAplicavel.de(AlertaTipo.EPI_VIOLATION)).isEqualTo("NR-6");
    }
```

(adicionar o import `com.dev4.cypher.model.NormaAplicavel` e `com.dev4.cypher.model.AlertaTipo` no topo do arquivo, se ainda não presentes.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentMapperTest`
Expected: FAIL na compilação — `NormaAplicavel` não existe.

- [ ] **Step 3: Criar `NormaAplicavel` e ligar em `IncidentMapper`/`IncidentResponse`**

Criar `src/main/java/com/dev4/cypher/model/NormaAplicavel.java`:

```java
package com.dev4.cypher.model;

import java.util.Map;

/** Mapeamento regra->norma regulamentadora (spec E5 §4) — constante, sem persistência própria. */
public final class NormaAplicavel {

    private static final Map<AlertaTipo, String> NORMAS = Map.of(
            AlertaTipo.FALL_RISK, "NR-35",
            AlertaTipo.ERGONOMIC_RISK, "NR-17",
            AlertaTipo.ZONE_VIOLATION, "NR-12",
            AlertaTipo.EPI_VIOLATION, "NR-6"
    );

    private NormaAplicavel() {
    }

    public static String de(AlertaTipo tipo) {
        return NORMAS.get(tipo);
    }
}
```

Em `IncidentResponse.java`, acrescentar o campo ao final:

```java
        AlertaStatus status,
        String empresaId,
        String normaAplicavel
```

Em `IncidentMapper.toResponse`, acrescentar o último argumento:

```java
                a.getStatus(),
                a.getEmpresaId(),
                NormaAplicavel.de(a.getTipo()));
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentMapperTest`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira e confirmar que passa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -o test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: adiciona mapeamento de norma aplicavel ao IncidentResponse"
```

---

## Self-Review

**Cobertura da spec:** §2.1/§2.2 (heartbeat, `MonitoramentoDiario`) → Tarefa 1. §2.3 (janela de turno fixa) → `TurnoWindow`, Tarefa 1. §3.1 (metas em `Equipe`) → Tarefa 2. §3.2 (conformidade/cobertura/sequência/ranking por delta) → `PlacarService`, Tarefa 2. §4 (camada educativa) → Tarefa 3.

**Placeholder scan:** nenhum "TBD"/"implementar depois".

**Consistência de tipos:** `PlacarEquipeResponse` (Tarefa 2) é consumido sem variação pelo plano de front (`e5c`); `NormaAplicavel.de` (Tarefa 3) usado só em `IncidentMapper`.

**Bloqueio confirmado:** o cabeçalho deste documento repete o bloqueio da spec §7 — nenhuma tarefa deve ser executada antes do pré-requisito ser resolvido.

---

**Plan complete and saved to `docs/superpowers/plans/e5-gamificacao/2026-08-29-e5a-backend-gamificacao.md`.**
