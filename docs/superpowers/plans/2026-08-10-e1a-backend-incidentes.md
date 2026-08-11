# E1-A · Backend de Incidentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a API Spring Boot num hub de incidentes: ingestão idempotente vinda do pipeline de visão computacional, histórico consultável, agregados para o dashboard e push por SSE publicado somente após o commit.

**Architecture:** A entidade `Alerta` é evoluída (não substituída) para representar um incidente com ciclo de vida. Entram `Estacao` e `Camera` como modelo de lugar, populadas por configuração. A camada REST fala **inglês** (contrato de fio: `incidentKey`, `cameraId`) e a camada de persistência mantém o **português** do time (`Alerta`, `nivel`, `zona`); um mapper faz a fronteira. Eventos de domínio publicados com `@TransactionalEventListener(AFTER_COMMIT)` alimentam o SSE, de modo que um rollback nunca produza push de incidente inexistente.

**Tech Stack:** Java 21, Spring Boot 4.0.6, Spring Web MVC, Spring Data JPA, Hibernate, H2 (file em dev, memória em teste), Lombok, Bean Validation (Hibernate Validator), Maven.

**Spec:** `docs/superpowers/specs/2026-08-10-notificacao-de-incidentes-design.md` §3, §5, §7, §8, §12 (parte "o que E1 constrói"), §15 (apenas a restrição sobre CORS/credenciais).

## Global Constraints

- **Repositório:** `/home/asaas/projects/cypher`. Todos os caminhos deste plano são relativos a essa raiz.
- **Pacote base:** `com.dev4.cypher`.
- **Prefixo de rota:** todos os endpoints novos ficam sob `/api/v1`.
- **Persistência em português, contrato em inglês.** Campos de entidade seguem o vocabulário existente (`nivel`, `zona`, `dataHora`); campos de DTO seguem o contrato da spec §3.1 (`incidentKey`, `cameraId`, `detectedAt`). O `IncidentMapper` é a única fronteira entre os dois.
- **Nenhum endpoint é protegido nesta entrega.** Spring Security não entra no `pom.xml` (spec §15).
- **Um incidente jamais é recusado por falha de cadastro.** `cameraId` desconhecido é aceito normalmente; não existe FK entre `Alerta.cameraId` e `Camera.id` (spec §12).
- **Testes nunca escrevem no banco de desenvolvimento.** `data/cypherdb.mv.db` é o banco de dev; testes usam H2 em memória.
- **Lombok:** usar `@Getter`/`@Setter`/`@NoArgsConstructor`/`@AllArgsConstructor` como no código existente. DTOs são `record` (Java 21), sem Lombok.
- **Commits:** um por tarefa, mensagem em português no formato `tipo(escopo): descrição`, seguindo o histórico do repo (`feat(model):`, `fix(reba):`).
- **Executar Maven offline:** `./mvnw -o` — todas as dependências necessárias já estão no `~/.m2`.

---

## Estrutura de arquivos

```
src/main/java/com/dev4/cypher/
├── model/
│   ├── Alerta.java                  MODIFICAR  entidade de incidente com ciclo de vida
│   ├── AlertaTipo.java              MODIFICAR  + FALL_RISK, ERGONOMIC_RISK
│   ├── AlertaNivel.java             MODIFICAR  + fromSeverity(int)
│   ├── AlertaStatus.java            —          sem mudança
│   ├── ClosedReason.java            CRIAR      state_exit | escalated | track_lost | pipeline_stopped
│   ├── Estacao.java                 CRIAR      unidade de lugar
│   └── Camera.java                  CRIAR      pertence a uma estação
├── repository/
│   ├── AlertaRepository.java        MODIFICAR  + findByIncidentKey, busca filtrada, agregados
│   ├── EstacaoRepository.java       CRIAR
│   └── CameraRepository.java        CRIAR
├── dto/
│   ├── IncidentRequest.java         CRIAR      payload de ingestão (spec §3.1)
│   ├── IncidentCloseRequest.java    CRIAR      payload de fechamento (spec §3.3)
│   ├── IncidentResponse.java        CRIAR      representação de saída
│   ├── StatusRequest.java           CRIAR      mudança de status pelo operador
│   ├── CameraResponse.java          CRIAR
│   ├── StationResponse.java         CRIAR
│   └── SummaryResponse.java         CRIAR      KPIs + heatmap + série de 7 dias
├── mapper/
│   └── IncidentMapper.java          CRIAR      única fronteira inglês/português
├── service/
│   ├── AlertaService.java           REMOVER    substituído por IncidentService
│   ├── IncidentService.java         CRIAR      ingestão idempotente, fechamento, status, busca
│   ├── CatalogService.java          CRIAR      estações e câmeras
│   └── SummaryService.java          CRIAR      agregações do dashboard
├── event/
│   ├── IncidentCreatedEvent.java    CRIAR
│   └── IncidentChangedEvent.java    CRIAR      fechamento, snapshot, mudança de status
├── sse/
│   ├── IncidentSseService.java      CRIAR      registro de emitters, broadcast, heartbeat
│   └── IncidentEventListener.java   CRIAR      @TransactionalEventListener(AFTER_COMMIT)
├── controller/
│   ├── AlertaController.java        REMOVER    substituído por IncidentController
│   ├── IncidentController.java      CRIAR      POST, PATCH, GET, PUT status, GET stream
│   ├── CatalogController.java       CRIAR      /cameras, /stations
│   └── SummaryController.java       CRIAR      /summary
├── config/
│   ├── CorsConfig.java              CRIAR
│   ├── CatalogProperties.java       CRIAR      @ConfigurationProperties("cypher.catalog")
│   └── CatalogSeeder.java           CRIAR      popula estações/câmeras no boot
└── CypherApplication.java           MODIFICAR  + @EnableScheduling

src/main/resources/
└── application.yaml                 MODIFICAR  + jackson ISO, + cypher.catalog

src/test/resources/
└── application.yaml                 CRIAR      H2 em memória para @SpringBootTest

src/test/java/com/dev4/cypher/
├── model/AlertaNivelTest.java              CRIAR
├── repository/AlertaRepositoryTest.java    CRIAR
├── repository/CatalogRepositoryTest.java   CRIAR
├── mapper/IncidentMapperTest.java          CRIAR
├── service/IncidentServiceTest.java        CRIAR
├── sse/IncidentSseServiceTest.java         CRIAR
├── IncidentIngestionApiTest.java           CRIAR
├── IncidentQueryApiTest.java               CRIAR
├── CatalogApiTest.java                     CRIAR
├── SummaryApiTest.java                     CRIAR
└── IncidentEventPublicationTest.java       CRIAR
```

**Por que essa divisão.** `IncidentService` concentra o ciclo de vida do incidente e nada mais; `CatalogService` e `SummaryService` são responsabilidades distintas com consultas distintas e mudam por motivos diferentes. O `sse/` é isolado porque é a única parte com estado em memória, e mantê-lo separado deixa claro que reiniciar a aplicação perde as conexões (não os dados). O `IncidentMapper` existe para que a decisão "inglês no fio, português no banco" tenha exatamente um lugar onde é aplicada.

---

## Task 1: Derivação de nível e tipos de incidente

**Files:**
- Modify: `src/main/java/com/dev4/cypher/model/AlertaTipo.java`
- Modify: `src/main/java/com/dev4/cypher/model/AlertaNivel.java`
- Test: `src/test/java/com/dev4/cypher/model/AlertaNivelTest.java`

**Interfaces:**
- Consumes: nada.
- Produces: `AlertaTipo.FALL_RISK`, `AlertaTipo.ERGONOMIC_RISK`; `AlertaNivel.fromSeverity(int severidade) -> AlertaNivel`.

Contexto: hoje `AlertaTipo` só cobre `EPI_VIOLATION` e `ZONE_VIOLATION`, e a capacidade mais bem validada do projeto (queda) não tem tipo onde aterrissar. O mapeamento de severidade para nível está na spec §3.4: 0–1 → `BAIXO`, 2 → `MEDIO`, 3–4 → `ALTO`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/model/AlertaNivelTest.java`:

```java
package com.dev4.cypher.model;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AlertaNivelTest {

    @ParameterizedTest
    @CsvSource({
            "0, BAIXO",
            "1, BAIXO",
            "2, MEDIO",
            "3, ALTO",
            "4, ALTO",
    })
    void derivaNivelAPartirDaSeveridade(int severidade, AlertaNivel esperado) {
        assertThat(AlertaNivel.fromSeverity(severidade)).isEqualTo(esperado);
    }

    @Test
    void rejeitaSeveridadeForaDaFaixa() {
        assertThatThrownBy(() -> AlertaNivel.fromSeverity(-1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AlertaNivel.fromSeverity(5))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void tiposDeIncidenteCobremQuedaEErgonomia() {
        assertThat(AlertaTipo.valueOf("FALL_RISK")).isNotNull();
        assertThat(AlertaTipo.valueOf("ERGONOMIC_RISK")).isNotNull();
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=AlertaNivelTest
```

Esperado: FALHA de compilação — `cannot find symbol: method fromSeverity(int)`.

- [ ] **Step 3: Implementar o mínimo**

Substituir `src/main/java/com/dev4/cypher/model/AlertaTipo.java`:

```java
package com.dev4.cypher.model;

/**
 * Natureza do incidente detectado.
 *
 * <p>EPI_VIOLATION existe no contrato mas não é gerado nesta entrega: o modelo
 * de detecção só possui classes de presença de EPI, sem classes de violação.
 * Ver spec §4.6.
 */
public enum AlertaTipo {
    FALL_RISK,
    ERGONOMIC_RISK,
    ZONE_VIOLATION,
    EPI_VIOLATION
}
```

Substituir `src/main/java/com/dev4/cypher/model/AlertaNivel.java`:

```java
package com.dev4.cypher.model;

/**
 * Nível legível para humanos, derivado da severidade 0–4 do pipeline.
 *
 * <p>A severidade crua é preservada no incidente; este enum existe para
 * leitura e compatibilidade com o vocabulário anterior do projeto.
 */
public enum AlertaNivel {
    BAIXO,
    MEDIO,
    ALTO;

    public static AlertaNivel fromSeverity(int severidade) {
        if (severidade < 0 || severidade > 4) {
            throw new IllegalArgumentException(
                    "Severidade fora da faixa 0-4: " + severidade);
        }
        if (severidade <= 1) {
            return BAIXO;
        }
        if (severidade == 2) {
            return MEDIO;
        }
        return ALTO;
    }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=AlertaNivelTest
```

Esperado: PASSA, 7 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/model/AlertaTipo.java \
        src/main/java/com/dev4/cypher/model/AlertaNivel.java \
        src/test/java/com/dev4/cypher/model/AlertaNivelTest.java
git commit -m "feat(model): tipos de queda e ergonomia e derivacao de nivel por severidade"
```

---

## Task 2: Entidade de incidente com ciclo de vida

**Files:**
- Create: `src/main/java/com/dev4/cypher/model/ClosedReason.java`
- Modify: `src/main/java/com/dev4/cypher/model/Alerta.java`
- Modify: `src/main/java/com/dev4/cypher/repository/AlertaRepository.java`
- Create: `src/test/resources/application.yaml`
- Test: `src/test/java/com/dev4/cypher/repository/AlertaRepositoryTest.java`

**Interfaces:**
- Consumes: `AlertaTipo`, `AlertaNivel`, `AlertaStatus` (Task 1).
- Produces: entidade `Alerta` com os campos abaixo e `AlertaRepository.findByIncidentKey(String) -> Optional<Alerta>`.

Cinco correções obrigatórias da spec §5.2, todas bloqueios reais: `zona` deixa de ser `NOT NULL` (uma queda fora de zona é hoje impersistível), `cameraId` idem, `dataHora` vira `OffsetDateTime`, entra `severidade` crua junto do `nivel` derivado, e `incidentKey` ganha unicidade.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/resources/application.yaml` (impede que qualquer `@SpringBootTest` escreva no banco de desenvolvimento):

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:cyphertest;DB_CLOSE_DELAY=-1
    driver-class-name: org.h2.Driver
    username: sa
    password: ""

  h2:
    console:
      enabled: false

  jpa:
    hibernate:
      ddl-auto: create-drop
    show-sql: false
    database-platform: org.hibernate.dialect.H2Dialect

  jackson:
    serialization:
      write-dates-as-timestamps: false

cypher:
  catalog:
    stations: []
    cameras: []
```

Criar `src/test/java/com/dev4/cypher/repository/AlertaRepositoryTest.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Alerta;
import com.dev4.cypher.model.AlertaNivel;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.model.AlertaTipo;
import com.dev4.cypher.model.ClosedReason;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.TestPropertySource;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class AlertaRepositoryTest {

    @Autowired
    private AlertaRepository repository;

    private Alerta quedaForaDeZona() {
        Alerta a = new Alerta();
        a.setIncidentKey("CAM-01:run-a:track-7:20260810T143102482Z");
        a.setRunId("run-a");
        a.setTrackId(7);
        a.setCameraId("CAM-01");
        a.setTipo(AlertaTipo.FALL_RISK);
        a.setSeveridade(4);
        a.setNivel(AlertaNivel.fromSeverity(4));
        a.setDescricao("Queda detectada na camera CAM-01");
        a.setReason("fallen_sustained");
        a.setPosturaCategoria("immediate_risk");
        a.setRebaScore(11);
        a.setActionLevel(4);
        a.setZona(null);
        a.setZoneStatus("outside");
        a.setEpiPresent(List.of("HELMET", "VEST"));
        a.setEpiMissing(List.of());
        a.setDataHora(OffsetDateTime.of(2026, 8, 10, 14, 31, 2, 0, ZoneOffset.ofHours(-3)));
        a.setStatus(AlertaStatus.PENDENTE);
        return a;
    }

    @Test
    void persisteQuedaForaDeQualquerZona() {
        Alerta salvo = repository.save(quedaForaDeZona());

        assertThat(salvo.getId()).isNotNull();
        assertThat(salvo.getZona()).isNull();
        assertThat(salvo.getEpiPresent()).containsExactly("HELMET", "VEST");
    }

    @Test
    void preservaOffsetDoTimestamp() {
        repository.saveAndFlush(quedaForaDeZona());

        Alerta lido = repository.findAll().get(0);
        assertThat(lido.getDataHora().toInstant())
                .isEqualTo(OffsetDateTime.of(2026, 8, 10, 14, 31, 2, 0, ZoneOffset.ofHours(-3)).toInstant());
    }

    @Test
    void encontraPorIncidentKey() {
        repository.saveAndFlush(quedaForaDeZona());

        Optional<Alerta> achado = repository.findByIncidentKey(
                "CAM-01:run-a:track-7:20260810T143102482Z");

        assertThat(achado).isPresent();
        assertThat(achado.get().getTipo()).isEqualTo(AlertaTipo.FALL_RISK);
    }

    @Test
    void rejeitaIncidentKeyDuplicada() {
        repository.saveAndFlush(quedaForaDeZona());

        assertThatThrownBy(() -> repository.saveAndFlush(quedaForaDeZona()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void guardaDadosDeFechamento() {
        Alerta a = repository.saveAndFlush(quedaForaDeZona());

        a.setEncerradoEm(a.getDataHora().plusSeconds(7));
        a.setDuracaoSegundos(6.6);
        a.setSeveridadePico(4);
        a.setClosedReason(ClosedReason.STATE_EXIT);
        repository.saveAndFlush(a);

        Alerta lido = repository.findById(a.getId()).orElseThrow();
        assertThat(lido.getDuracaoSegundos()).isEqualTo(6.6);
        assertThat(lido.getClosedReason()).isEqualTo(ClosedReason.STATE_EXIT);
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=AlertaRepositoryTest
```

Esperado: FALHA de compilação — `ClosedReason` não existe, `setIncidentKey` não existe.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/model/ClosedReason.java`:

```java
package com.dev4.cypher.model;

/**
 * Por que o episódio foi encerrado.
 *
 * <p>TRACK_LOST e PIPELINE_STOPPED indicam duração de confiança menor: o risco
 * pode não ter cessado, o sistema é que deixou de observar. Ver spec §3.3.
 */
public enum ClosedReason {
    STATE_EXIT,
    ESCALATED,
    TRACK_LOST,
    PIPELINE_STOPPED
}
```

Substituir `src/main/java/com/dev4/cypher/model/Alerta.java`:

```java
package com.dev4.cypher.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Incidente de segurança detectado pelo pipeline de visão computacional.
 *
 * <p>Representa um episódio com início e fim, não um fato pontual: o pipeline
 * abre o incidente na confirmação do alarme e o fecha quando o risco cessa.
 *
 * <p>{@code cameraId} não tem chave estrangeira para {@link Camera} de
 * propósito — um incidente vindo de câmera não cadastrada é aceito
 * normalmente (spec §12).
 */
@Entity
@Table(name = "alertas")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Alerta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Chave de idempotência: cameraId:runId:trackId:timestampDeAbertura. */
    @Column(nullable = false, unique = true, length = 200)
    private String incidentKey;

    /** UUID da execução do pipeline; trackId só é único dentro dele. */
    @Column(nullable = false, length = 64)
    private String runId;

    @Column(nullable = false)
    private Integer trackId;

    @Column(nullable = false, length = 64)
    private String cameraId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AlertaTipo tipo;

    /** Severidade crua 0–4 vinda do motor de decisão. */
    @Column(nullable = false)
    private Integer severidade;

    /** Derivado de severidade via AlertaNivel.fromSeverity. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AlertaNivel nivel;

    @Column(nullable = false, length = 300)
    private String descricao;

    /** Rótulo da regra que disparou: fallen_sustained, reba_11, … */
    @Column(nullable = false, length = 100)
    private String reason;

    @Column(nullable = false, length = 50)
    private String posturaCategoria;

    @Column(nullable = false)
    private Integer rebaScore;

    @Column(nullable = false)
    private Integer actionLevel;

    /** Nome da zona crítica; nulo quando a pessoa está fora de qualquer zona. */
    @Column(length = 120)
    private String zona;

    @Column(nullable = false, length = 20)
    private String zoneStatus;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "alerta_epi_present", joinColumns = @JoinColumn(name = "alerta_id"))
    @Column(name = "epi")
    private List<String> epiPresent = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "alerta_epi_missing", joinColumns = @JoinColumn(name = "alerta_id"))
    @Column(name = "epi")
    private List<String> epiMissing = new ArrayList<>();

    @Column(length = 500)
    private String snapshotUrl;

    @Column(nullable = false)
    private OffsetDateTime dataHora;

    private OffsetDateTime encerradoEm;

    private Double duracaoSegundos;

    private Integer severidadePico;

    @Enumerated(EnumType.STRING)
    private ClosedReason closedReason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AlertaStatus status;
}
```

Substituir `src/main/java/com/dev4/cypher/repository/AlertaRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Alerta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface AlertaRepository extends JpaRepository<Alerta, Long> {

    Optional<Alerta> findByIncidentKey(String incidentKey);
}
```

Apagar o banco de desenvolvimento, porque `ddl-auto: update` adiciona colunas mas não relaxa `NOT NULL` em coluna existente (spec §5.2). O conteúdo é dado de teste do commit `CHORE: DB testing`:

```bash
cd /home/asaas/projects/cypher && rm -f data/cypherdb.mv.db data/cypherdb.trace.db
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=AlertaRepositoryTest
```

Esperado: PASSA, 5 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/model/ \
        src/main/java/com/dev4/cypher/repository/AlertaRepository.java \
        src/test/resources/application.yaml \
        src/test/java/com/dev4/cypher/repository/AlertaRepositoryTest.java
git add -u data/ 2>/dev/null || true
git commit -m "feat(model): incidente com ciclo de vida, chave idempotente e zona opcional"
```

---

## Task 3: Modelo de lugar — estação e câmera

**Files:**
- Create: `src/main/java/com/dev4/cypher/model/Estacao.java`
- Create: `src/main/java/com/dev4/cypher/model/Camera.java`
- Create: `src/main/java/com/dev4/cypher/repository/EstacaoRepository.java`
- Create: `src/main/java/com/dev4/cypher/repository/CameraRepository.java`
- Test: `src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java`

**Interfaces:**
- Consumes: nada.
- Produces: `Estacao(String id, String nome, String setor, boolean ativa)`, `Camera(String id, String nome, String estacaoId, String streamUrl, String fonte)`, `CameraRepository.findByEstacaoId(String) -> List<Camera>`.

Modelo de dois níveis da spec §12. Setor permanece campo texto na estação, sem entidade própria — decisão consciente, com a fragilidade a erro de digitação aceita em troca de não modelar uma terceira entidade agora.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Camera;
import com.dev4.cypher.model.Estacao;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class CatalogRepositoryTest {

    @Autowired
    private EstacaoRepository estacoes;

    @Autowired
    private CameraRepository cameras;

    @Test
    void umaEstacaoEhCobertaPorVariasCameras() {
        estacoes.save(new Estacao("EST-01", "Esteira de montagem", "montagem", true));
        cameras.save(new Camera("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://cam1/stream"));
        cameras.save(new Camera("CAM-02", "Lateral", "EST-01",
                "http://127.0.0.1:8091/stream", "rtsp://cam2/stream"));
        cameras.saveAndFlush(new Camera("CAM-03", "Expedicao", "EST-02",
                "http://127.0.0.1:8092/stream", "0"));

        List<Camera> daEstacao = cameras.findByEstacaoId("EST-01");

        assertThat(daEstacao).extracting(Camera::getId)
                .containsExactlyInAnyOrder("CAM-01", "CAM-02");
    }

    @Test
    void estacaoGuardaSetorEEstadoAtivo() {
        estacoes.saveAndFlush(new Estacao("EST-09", "Prensa 3", "estamparia", false));

        Estacao lida = estacoes.findById("EST-09").orElseThrow();
        assertThat(lida.getSetor()).isEqualTo("estamparia");
        assertThat(lida.isAtiva()).isFalse();
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogRepositoryTest
```

Esperado: FALHA de compilação — `Estacao` e `Camera` não existem.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/model/Estacao.java`:

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
 * Unidade de lugar: uma máquina ou posto de trabalho, coberto por uma ou mais
 * câmeras. É a célula do heatmap e o eixo do mapa da fábrica.
 *
 * <p>{@code setor} é campo texto livre, sem entidade própria (spec §12).
 */
@Entity
@Table(name = "estacoes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Estacao {

    /** Identificador legível, ex.: EST-01. */
    @Id
    @Column(length = 64)
    private String id;

    @Column(nullable = false, length = 120)
    private String nome;

    @Column(length = 120)
    private String setor;

    @Column(nullable = false)
    private boolean ativa;
}
```

Criar `src/main/java/com/dev4/cypher/model/Camera.java`:

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
 * Câmera vinculada a uma estação.
 *
 * <p>{@code streamUrl} é o MJPEG servido pelo próprio pipeline Python e
 * consumido direto pelo browser; {@code fonte} é o que o pipeline abre
 * (índice de webcam, caminho de arquivo ou URL RTSP) e só passa a ser usado
 * em E2.
 */
@Entity
@Table(name = "cameras")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Camera {

    /** Identificador legível, ex.: CAM-01. */
    @Id
    @Column(length = 64)
    private String id;

    @Column(nullable = false, length = 120)
    private String nome;

    @Column(nullable = false, length = 64)
    private String estacaoId;

    @Column(length = 500)
    private String streamUrl;

    @Column(length = 500)
    private String fonte;
}
```

Criar `src/main/java/com/dev4/cypher/repository/EstacaoRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Estacao;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface EstacaoRepository extends JpaRepository<Estacao, String> {
}
```

Criar `src/main/java/com/dev4/cypher/repository/CameraRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Camera;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CameraRepository extends JpaRepository<Camera, String> {

    List<Camera> findByEstacaoId(String estacaoId);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogRepositoryTest
```

Esperado: PASSA, 2 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/model/Estacao.java \
        src/main/java/com/dev4/cypher/model/Camera.java \
        src/main/java/com/dev4/cypher/repository/EstacaoRepository.java \
        src/main/java/com/dev4/cypher/repository/CameraRepository.java \
        src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java
git commit -m "feat(model): estacao e camera como modelo de lugar"
```

---

## Task 4: Catálogo populado por configuração

**Files:**
- Create: `src/main/java/com/dev4/cypher/config/CatalogProperties.java`
- Create: `src/main/java/com/dev4/cypher/config/CatalogSeeder.java`
- Modify: `src/main/resources/application.yaml`
- Test: `src/test/java/com/dev4/cypher/CatalogSeederTest.java`

**Interfaces:**
- Consumes: `Estacao`, `Camera`, `EstacaoRepository`, `CameraRepository` (Task 3).
- Produces: propriedades `cypher.catalog.stations[]` e `cypher.catalog.cameras[]`; catálogo presente no banco após o boot.

E1 popula o catálogo por configuração; o cadastro pela interface é E2 (spec §12). O seeder faz upsert idempotente, então reiniciar a aplicação não duplica nem apaga o que já existe.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/CatalogSeederTest.java`:

```java
package com.dev4.cypher;

import com.dev4.cypher.model.Camera;
import com.dev4.cypher.repository.CameraRepository;
import com.dev4.cypher.repository.EstacaoRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@TestPropertySource(properties = {
        "cypher.catalog.stations[0].id=EST-01",
        "cypher.catalog.stations[0].nome=Esteira de montagem",
        "cypher.catalog.stations[0].setor=montagem",
        "cypher.catalog.cameras[0].id=CAM-01",
        "cypher.catalog.cameras[0].nome=Frontal",
        "cypher.catalog.cameras[0].estacaoId=EST-01",
        "cypher.catalog.cameras[0].streamUrl=http://127.0.0.1:8090/stream",
        "cypher.catalog.cameras[0].fonte=data/validation/cenario2.mp4",
})
class CatalogSeederTest {

    @Autowired
    private EstacaoRepository estacoes;

    @Autowired
    private CameraRepository cameras;

    @Test
    void populaCatalogoAPartirDaConfiguracao() {
        assertThat(estacoes.findById("EST-01")).isPresent();

        Camera cam = cameras.findById("CAM-01").orElseThrow();
        assertThat(cam.getEstacaoId()).isEqualTo("EST-01");
        assertThat(cam.getStreamUrl()).isEqualTo("http://127.0.0.1:8090/stream");
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogSeederTest
```

Esperado: FALHA — `estacoes.findById("EST-01")` vazio, porque nada popula o catálogo.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/config/CatalogProperties.java`:

```java
package com.dev4.cypher.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Catálogo de estações e câmeras vindo de configuração.
 *
 * <p>Em E1 esta é a única origem do catálogo; E2 substitui por cadastro na
 * interface. Nada aqui autoriza ingestão: um incidente de câmera não
 * cadastrada é aceito do mesmo jeito (spec §12).
 */
@Component
@ConfigurationProperties(prefix = "cypher.catalog")
@Getter
@Setter
public class CatalogProperties {

    private List<StationConfig> stations = new ArrayList<>();
    private List<CameraConfig> cameras = new ArrayList<>();

    @Getter
    @Setter
    public static class StationConfig {
        private String id;
        private String nome;
        private String setor;
        private boolean ativa = true;
    }

    @Getter
    @Setter
    public static class CameraConfig {
        private String id;
        private String nome;
        private String estacaoId;
        private String streamUrl;
        private String fonte;
    }
}
```

Criar `src/main/java/com/dev4/cypher/config/CatalogSeeder.java`:

```java
package com.dev4.cypher.config;

import com.dev4.cypher.model.Camera;
import com.dev4.cypher.model.Estacao;
import com.dev4.cypher.repository.CameraRepository;
import com.dev4.cypher.repository.EstacaoRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Aplica o catálogo de configuração ao banco no boot, por upsert: reiniciar a
 * aplicação não duplica registros nem apaga o que já existe.
 */
@Component
public class CatalogSeeder implements ApplicationRunner {

    private final CatalogProperties properties;
    private final EstacaoRepository estacoes;
    private final CameraRepository cameras;

    public CatalogSeeder(CatalogProperties properties,
                         EstacaoRepository estacoes,
                         CameraRepository cameras) {
        this.properties = properties;
        this.estacoes = estacoes;
        this.cameras = cameras;
    }

    @Override
    public void run(ApplicationArguments args) {
        properties.getStations().forEach(cfg ->
                estacoes.save(new Estacao(cfg.getId(), cfg.getNome(), cfg.getSetor(), cfg.isAtiva())));

        properties.getCameras().forEach(cfg ->
                cameras.save(new Camera(cfg.getId(), cfg.getNome(), cfg.getEstacaoId(),
                        cfg.getStreamUrl(), cfg.getFonte())));
    }
}
```

Substituir `src/main/resources/application.yaml`:

```yaml
spring:
  application:
    name: cypher

  datasource:
    url: jdbc:h2:file:./data/cypherdb;AUTO_SERVER=TRUE
    driver-class-name: org.h2.Driver
    username: sa
    password: ""

  h2:
    console:
      enabled: true
      path: /h2-console

  jpa:
    hibernate:
      ddl-auto: update
    show-sql: true
    database-platform: org.hibernate.dialect.H2Dialect

  jackson:
    serialization:
      write-dates-as-timestamps: false

cypher:
  cors:
    allowed-origins:
      - http://localhost:4200
  catalog:
    stations:
      - id: EST-01
        nome: Esteira de montagem
        setor: montagem
      - id: EST-02
        nome: Prensa 3
        setor: estamparia
      - id: EST-03
        nome: Expedicao
        setor: logistica
      - id: EST-04
        nome: Solda robotizada
        setor: montagem
    cameras:
      - id: CAM-01
        nome: Esteira - frontal
        estacaoId: EST-01
        streamUrl: http://127.0.0.1:8090/stream
        fonte: data/validation/cenario.mp4
      - id: CAM-02
        nome: Prensa - lateral
        estacaoId: EST-02
        streamUrl: http://127.0.0.1:8091/stream
        fonte: data/validation/cenario2.mp4
      - id: CAM-03
        nome: Expedicao - alto
        estacaoId: EST-03
        streamUrl: http://127.0.0.1:8092/stream
        fonte: data/validation/cenario3.mp4
      - id: CAM-04
        nome: Solda - frontal
        estacaoId: EST-04
        streamUrl: http://127.0.0.1:8093/stream
        fonte: data/validation/cenario4.mp4
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogSeederTest
```

Esperado: PASSA, 1 teste.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/config/ \
        src/main/resources/application.yaml \
        src/test/java/com/dev4/cypher/CatalogSeederTest.java
git commit -m "feat(config): catalogo de estacoes e cameras populado por configuracao"
```

---

## Task 5: DTOs e mapper

**Files:**
- Create: `src/main/java/com/dev4/cypher/dto/IncidentRequest.java`
- Create: `src/main/java/com/dev4/cypher/dto/IncidentCloseRequest.java`
- Create: `src/main/java/com/dev4/cypher/dto/IncidentResponse.java`
- Create: `src/main/java/com/dev4/cypher/mapper/IncidentMapper.java`
- Modify: `pom.xml`
- Test: `src/test/java/com/dev4/cypher/mapper/IncidentMapperTest.java`

**Interfaces:**
- Consumes: `Alerta`, `AlertaTipo`, `AlertaNivel`, `ClosedReason` (Tasks 1–2).
- Produces:
  - `IncidentRequest` — record com `incidentKey, cameraId, runId, trackId, type, severity, reason, postureCategory, rebaScore, actionLevel, zoneName, zoneStatus, epiPresent, epiMissing, detectedAt, snapshotUrl`.
  - `IncidentCloseRequest` — record com `endedAt, durationSeconds, peakSeverity, closedReason, snapshotUrl` (todos opcionais).
  - `IncidentResponse` — record de saída, inclui `id`, `nivel`, `status`, `descricao`.
  - `IncidentMapper.toEntity(IncidentRequest) -> Alerta`, `IncidentMapper.toResponse(Alerta) -> IncidentResponse`, `IncidentMapper.descricaoDe(AlertaTipo, String reason, String cameraId) -> String`.

O controller atual recebe e devolve a entidade JPA direta, então hoje um cliente pode enviar `{"id": 42, "status": "RESOLVIDO"}` e sobrescrever registro (spec §5.2). Os DTOs fecham isso.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/mapper/IncidentMapperTest.java`:

```java
package com.dev4.cypher.mapper;

import com.dev4.cypher.dto.IncidentRequest;
import com.dev4.cypher.dto.IncidentResponse;
import com.dev4.cypher.model.Alerta;
import com.dev4.cypher.model.AlertaNivel;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.model.AlertaTipo;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class IncidentMapperTest {

    private final IncidentMapper mapper = new IncidentMapper();

    private IncidentRequest queda() {
        return new IncidentRequest(
                "CAM-01:run-a:track-7:20260810T143102482Z",
                "CAM-01",
                "run-a",
                7,
                AlertaTipo.FALL_RISK,
                4,
                "fallen_sustained",
                "immediate_risk",
                11,
                4,
                null,
                "outside",
                List.of("HELMET", "VEST"),
                List.of(),
                OffsetDateTime.of(2026, 8, 10, 14, 31, 2, 0, ZoneOffset.ofHours(-3)),
                null);
    }

    @Test
    void derivaNivelStatusEDescricaoNaEntrada() {
        Alerta alerta = mapper.toEntity(queda());

        assertThat(alerta.getNivel()).isEqualTo(AlertaNivel.ALTO);
        assertThat(alerta.getStatus()).isEqualTo(AlertaStatus.PENDENTE);
        assertThat(alerta.getSeveridade()).isEqualTo(4);
        assertThat(alerta.getDescricao()).contains("Queda").contains("CAM-01");
    }

    @Test
    void naoConfiaEmIdNemStatusVindosDoCliente() {
        Alerta alerta = mapper.toEntity(queda());

        assertThat(alerta.getId()).isNull();
        assertThat(alerta.getStatus()).isEqualTo(AlertaStatus.PENDENTE);
    }

    @Test
    void listasNulasViramListasVazias() {
        IncidentRequest semEpi = new IncidentRequest(
                "k", "CAM-01", "run-a", 1, AlertaTipo.ERGONOMIC_RISK, 2,
                "reba_9", "ergonomically_inadequate", 9, 3, null, "outside",
                null, null,
                OffsetDateTime.of(2026, 8, 10, 10, 0, 0, 0, ZoneOffset.UTC), null);

        Alerta alerta = mapper.toEntity(semEpi);

        assertThat(alerta.getEpiPresent()).isEmpty();
        assertThat(alerta.getEpiMissing()).isEmpty();
    }

    @Test
    void converteEntidadeParaRespostaPreservandoSeveridadeCrua() {
        Alerta alerta = mapper.toEntity(queda());
        alerta.setId(42L);

        IncidentResponse response = mapper.toResponse(alerta);

        assertThat(response.id()).isEqualTo(42L);
        assertThat(response.incidentKey()).isEqualTo("CAM-01:run-a:track-7:20260810T143102482Z");
        assertThat(response.severity()).isEqualTo(4);
        assertThat(response.nivel()).isEqualTo(AlertaNivel.ALTO);
        assertThat(response.zoneName()).isNull();
    }

    @Test
    void descricaoDescreveCadaTipoDeIncidente() {
        assertThat(mapper.descricaoDe(AlertaTipo.ERGONOMIC_RISK, "reba_11", "CAM-02"))
                .contains("ergonom");
        assertThat(mapper.descricaoDe(AlertaTipo.ZONE_VIOLATION, "zone", "CAM-02"))
                .contains("zona");
        assertThat(mapper.descricaoDe(AlertaTipo.EPI_VIOLATION, "no_helmet", "CAM-02"))
                .contains("EPI");
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentMapperTest
```

Esperado: FALHA de compilação — `IncidentRequest`, `IncidentResponse`, `IncidentMapper` não existem.

- [ ] **Step 3: Implementar o mínimo**

Adicionar Bean Validation ao `pom.xml`, logo após a dependência `spring-boot-starter-webmvc`:

```xml
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-validation</artifactId>
		</dependency>
```

Criar `src/main/java/com/dev4/cypher/dto/IncidentRequest.java`:

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.model.AlertaTipo;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;
import java.util.List;

/** Payload de ingestão vindo do pipeline (spec §3.1). */
public record IncidentRequest(

        @NotBlank String incidentKey,
        @NotBlank String cameraId,
        @NotBlank String runId,
        @NotNull Integer trackId,
        @NotNull AlertaTipo type,
        @NotNull @Min(0) @Max(4) Integer severity,
        @NotBlank String reason,
        @NotBlank String postureCategory,
        @NotNull Integer rebaScore,
        @NotNull Integer actionLevel,
        String zoneName,
        @NotBlank String zoneStatus,
        List<String> epiPresent,
        List<String> epiMissing,
        @NotNull OffsetDateTime detectedAt,
        String snapshotUrl
) {
}
```

Criar `src/main/java/com/dev4/cypher/dto/IncidentCloseRequest.java`:

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.model.ClosedReason;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.OffsetDateTime;

/**
 * Fechamento do episódio e/ou chegada tardia do snapshot (spec §3.3).
 * Todos os campos são opcionais e aplicados individualmente.
 */
public record IncidentCloseRequest(
        OffsetDateTime endedAt,
        Double durationSeconds,
        @Min(0) @Max(4) Integer peakSeverity,
        ClosedReason closedReason,
        String snapshotUrl
) {
}
```

Criar `src/main/java/com/dev4/cypher/dto/IncidentResponse.java`:

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.model.AlertaNivel;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.model.AlertaTipo;
import com.dev4.cypher.model.ClosedReason;

import java.time.OffsetDateTime;
import java.util.List;

/** Representação de saída de um incidente. */
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
        AlertaStatus status
) {
}
```

Criar `src/main/java/com/dev4/cypher/mapper/IncidentMapper.java`:

```java
package com.dev4.cypher.mapper;

import com.dev4.cypher.dto.IncidentRequest;
import com.dev4.cypher.dto.IncidentResponse;
import com.dev4.cypher.model.Alerta;
import com.dev4.cypher.model.AlertaNivel;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.model.AlertaTipo;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Única fronteira entre o contrato de fio (inglês) e a persistência
 * (português). Nada além desta classe deve traduzir nomes de campo.
 */
@Component
public class IncidentMapper {

    public Alerta toEntity(IncidentRequest req) {
        Alerta a = new Alerta();
        a.setIncidentKey(req.incidentKey());
        a.setCameraId(req.cameraId());
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
        // Status é sempre atribuído pelo servidor; nunca vem do cliente.
        a.setStatus(AlertaStatus.PENDENTE);
        return a;
    }

    public IncidentResponse toResponse(Alerta a) {
        return new IncidentResponse(
                a.getId(),
                a.getIncidentKey(),
                a.getCameraId(),
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
                a.getStatus());
    }

    /** Texto legível exibido no painel; gerado no servidor, nunca enviado pelo cliente. */
    public String descricaoDe(AlertaTipo tipo, String reason, String cameraId) {
        String assunto = switch (tipo) {
            case FALL_RISK -> "Queda ou risco imediato detectado";
            case ERGONOMIC_RISK -> "Postura ergonomicamente inadequada";
            case ZONE_VIOLATION -> "Pessoa em zona critica";
            case EPI_VIOLATION -> "EPI obrigatorio ausente";
        };
        return "%s (%s) na camera %s".formatted(assunto, reason, cameraId);
    }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentMapperTest
```

Esperado: PASSA, 5 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add pom.xml src/main/java/com/dev4/cypher/dto/ \
        src/main/java/com/dev4/cypher/mapper/ \
        src/test/java/com/dev4/cypher/mapper/IncidentMapperTest.java
git commit -m "feat(dto): contrato de incidente com validacao e mapper de fronteira"
```

---

## Task 6: Ingestão idempotente

**Files:**
- Create: `src/main/java/com/dev4/cypher/event/IncidentCreatedEvent.java`
- Create: `src/main/java/com/dev4/cypher/event/IncidentChangedEvent.java`
- Create: `src/main/java/com/dev4/cypher/service/IncidentService.java`
- Test: `src/test/java/com/dev4/cypher/service/IncidentServiceTest.java`

**Interfaces:**
- Consumes: `AlertaRepository`, `IncidentMapper`, `IncidentRequest`, `IncidentCloseRequest`, `Alerta` (Tasks 2, 5).
- Produces:
  - `IncidentService.ingest(IncidentRequest) -> IngestResult`, onde `IngestResult` é o record aninhado `IncidentService.IngestResult(IncidentResponse incident, boolean created)`.
  - `IncidentService.close(String incidentKey, IncidentCloseRequest) -> Optional<IncidentResponse>`.
  - `IncidentService.changeStatus(Long id, AlertaStatus) -> Optional<IncidentResponse>`.
  - `IncidentCreatedEvent(IncidentResponse incident)`, `IncidentChangedEvent(IncidentResponse incident)`.

`trackId` é um id do ByteTrack que reinicia a cada execução do pipeline, então a chave composta com `runId` é o que torna a idempotência confiável (spec §3.2). Um POST repetido depois de um timeout onde a resposta se perdeu devolve o existente em vez de criar duplicata.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/service/IncidentServiceTest.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.dto.IncidentCloseRequest;
import com.dev4.cypher.dto.IncidentRequest;
import com.dev4.cypher.mapper.IncidentMapper;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.model.AlertaTipo;
import com.dev4.cypher.model.ClosedReason;
import com.dev4.cypher.repository.AlertaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.ApplicationEventPublisher;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class IncidentServiceTest {

    @Autowired
    private AlertaRepository repository;

    private IncidentService service;

    @BeforeEach
    void setUp() {
        // Publisher no-op: a publicação de eventos é verificada em
        // IncidentEventPublicationTest, que exercita o commit real.
        ApplicationEventPublisher noop = event -> { };
        service = new IncidentService(repository, new IncidentMapper(), noop);
    }

    private IncidentRequest queda(String key) {
        return new IncidentRequest(
                key, "CAM-01", "run-a", 7, AlertaTipo.FALL_RISK, 4,
                "fallen_sustained", "immediate_risk", 11, 4, null, "outside",
                List.of("HELMET"), List.of(),
                OffsetDateTime.of(2026, 8, 10, 14, 31, 2, 0, ZoneOffset.ofHours(-3)),
                null);
    }

    @Test
    void criaIncidenteNaPrimeiraIngestao() {
        IncidentService.IngestResult resultado = service.ingest(queda("k1"));

        assertThat(resultado.created()).isTrue();
        assertThat(resultado.incident().id()).isNotNull();
        assertThat(resultado.incident().status()).isEqualTo(AlertaStatus.PENDENTE);
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    void ingestaoRepetidaDevolveOExistenteSemDuplicar() {
        IncidentService.IngestResult primeiro = service.ingest(queda("k1"));
        IncidentService.IngestResult segundo = service.ingest(queda("k1"));

        assertThat(segundo.created()).isFalse();
        assertThat(segundo.incident().id()).isEqualTo(primeiro.incident().id());
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    void aceitaIncidenteDeCameraNaoCadastrada() {
        IncidentRequest desconhecida = new IncidentRequest(
                "k-x", "CAM-99", "run-a", 1, AlertaTipo.ERGONOMIC_RISK, 2,
                "reba_9", "ergonomically_inadequate", 9, 3, null, "outside",
                List.of(), List.of(),
                OffsetDateTime.of(2026, 8, 10, 10, 0, 0, 0, ZoneOffset.UTC), null);

        IncidentService.IngestResult resultado = service.ingest(desconhecida);

        assertThat(resultado.created()).isTrue();
        assertThat(resultado.incident().cameraId()).isEqualTo("CAM-99");
    }

    @Test
    void fechaEpisodioComDuracaoEPico() {
        service.ingest(queda("k1"));

        Optional<com.dev4.cypher.dto.IncidentResponse> fechado = service.close("k1",
                new IncidentCloseRequest(
                        OffsetDateTime.of(2026, 8, 10, 14, 31, 9, 0, ZoneOffset.ofHours(-3)),
                        6.6, 4, ClosedReason.STATE_EXIT, null));

        assertThat(fechado).isPresent();
        assertThat(fechado.get().durationSeconds()).isEqualTo(6.6);
        assertThat(fechado.get().peakSeverity()).isEqualTo(4);
        assertThat(fechado.get().closedReason()).isEqualTo(ClosedReason.STATE_EXIT);
    }

    @Test
    void aplicaApenasOsCamposPresentesNoFechamento() {
        service.ingest(queda("k1"));
        service.close("k1", new IncidentCloseRequest(null, null, null, null,
                "https://cdn/snap.jpg"));

        Optional<com.dev4.cypher.dto.IncidentResponse> lido = service.close("k1",
                new IncidentCloseRequest(null, null, null, null, null));

        assertThat(lido).isPresent();
        assertThat(lido.get().snapshotUrl()).isEqualTo("https://cdn/snap.jpg");
        assertThat(lido.get().endedAt()).isNull();
    }

    @Test
    void fechamentoDeChaveInexistenteDevolveVazio() {
        assertThat(service.close("nao-existe",
                new IncidentCloseRequest(null, null, null, null, null))).isEmpty();
    }

    @Test
    void mudaStatusDoIncidente() {
        Long id = service.ingest(queda("k1")).incident().id();

        Optional<com.dev4.cypher.dto.IncidentResponse> revisado =
                service.changeStatus(id, AlertaStatus.REVISADO);

        assertThat(revisado).isPresent();
        assertThat(revisado.get().status()).isEqualTo(AlertaStatus.REVISADO);
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentServiceTest
```

Esperado: FALHA de compilação — `IncidentService` não existe.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/event/IncidentCreatedEvent.java`:

```java
package com.dev4.cypher.event;

import com.dev4.cypher.dto.IncidentResponse;

/** Publicado quando um incidente novo é persistido. */
public record IncidentCreatedEvent(IncidentResponse incident) {
}
```

Criar `src/main/java/com/dev4/cypher/event/IncidentChangedEvent.java`:

```java
package com.dev4.cypher.event;

import com.dev4.cypher.dto.IncidentResponse;

/** Publicado em fechamento, chegada de snapshot ou mudança de status. */
public record IncidentChangedEvent(IncidentResponse incident) {
}
```

Criar `src/main/java/com/dev4/cypher/service/IncidentService.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.dto.IncidentCloseRequest;
import com.dev4.cypher.dto.IncidentRequest;
import com.dev4.cypher.dto.IncidentResponse;
import com.dev4.cypher.event.IncidentChangedEvent;
import com.dev4.cypher.event.IncidentCreatedEvent;
import com.dev4.cypher.mapper.IncidentMapper;
import com.dev4.cypher.model.Alerta;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.repository.AlertaRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/** Ciclo de vida do incidente: abertura idempotente, fechamento e status. */
@Service
public class IncidentService {

    private final AlertaRepository repository;
    private final IncidentMapper mapper;
    private final ApplicationEventPublisher publisher;

    public IncidentService(AlertaRepository repository,
                           IncidentMapper mapper,
                           ApplicationEventPublisher publisher) {
        this.repository = repository;
        this.mapper = mapper;
        this.publisher = publisher;
    }

    /** @param created false quando a chave já existia (retry do pipeline). */
    public record IngestResult(IncidentResponse incident, boolean created) {
    }

    @Transactional
    public IngestResult ingest(IncidentRequest req) {
        Optional<Alerta> existente = repository.findByIncidentKey(req.incidentKey());
        if (existente.isPresent()) {
            return new IngestResult(mapper.toResponse(existente.get()), false);
        }

        Alerta salvo;
        try {
            salvo = repository.saveAndFlush(mapper.toEntity(req));
        } catch (DataIntegrityViolationException corrida) {
            // Dois POSTs concorrentes com a mesma chave: quem perdeu relê o vencedor.
            Alerta vencedor = repository.findByIncidentKey(req.incidentKey())
                    .orElseThrow(() -> corrida);
            return new IngestResult(mapper.toResponse(vencedor), false);
        }

        IncidentResponse response = mapper.toResponse(salvo);
        publisher.publishEvent(new IncidentCreatedEvent(response));
        return new IngestResult(response, true);
    }

    @Transactional
    public Optional<IncidentResponse> close(String incidentKey, IncidentCloseRequest req) {
        return repository.findByIncidentKey(incidentKey).map(alerta -> {
            // Cada campo é opcional e aplicado individualmente: o mesmo endpoint
            // serve ao fechamento do episódio e à chegada tardia do snapshot.
            if (req.endedAt() != null) {
                alerta.setEncerradoEm(req.endedAt());
            }
            if (req.durationSeconds() != null) {
                alerta.setDuracaoSegundos(req.durationSeconds());
            }
            if (req.peakSeverity() != null) {
                alerta.setSeveridadePico(req.peakSeverity());
            }
            if (req.closedReason() != null) {
                alerta.setClosedReason(req.closedReason());
            }
            if (req.snapshotUrl() != null) {
                alerta.setSnapshotUrl(req.snapshotUrl());
            }
            IncidentResponse response = mapper.toResponse(repository.saveAndFlush(alerta));
            publisher.publishEvent(new IncidentChangedEvent(response));
            return response;
        });
    }

    @Transactional
    public Optional<IncidentResponse> changeStatus(Long id, AlertaStatus status) {
        return repository.findById(id).map(alerta -> {
            alerta.setStatus(status);
            IncidentResponse response = mapper.toResponse(repository.saveAndFlush(alerta));
            publisher.publishEvent(new IncidentChangedEvent(response));
            return response;
        });
    }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentServiceTest
```

Esperado: PASSA, 7 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/event/ \
        src/main/java/com/dev4/cypher/service/IncidentService.java \
        src/test/java/com/dev4/cypher/service/IncidentServiceTest.java
git commit -m "feat(service): ingestao idempotente e ciclo de vida do incidente"
```

---

## Task 7: Endpoints de ingestão e fechamento

**Files:**
- Create: `src/main/java/com/dev4/cypher/controller/IncidentController.java`
- Delete: `src/main/java/com/dev4/cypher/controller/AlertaController.java`
- Delete: `src/main/java/com/dev4/cypher/service/AlertaService.java`
- Test: `src/test/java/com/dev4/cypher/IncidentIngestionApiTest.java`

**Interfaces:**
- Consumes: `IncidentService` (Task 6), `IncidentRequest`, `IncidentCloseRequest` (Task 5).
- Produces: `POST /api/v1/incidents` (201 na criação, 200 no retry), `PATCH /api/v1/incidents/{incidentKey}` (200 ou 404).

O `AlertaController` e o `AlertaService` antigos saem aqui: expõem a entidade JPA direta e servem `/alertas`, que nada consome.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/IncidentIngestionApiTest.java`:

```java
package com.dev4.cypher;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class IncidentIngestionApiTest {

    @Autowired
    private MockMvc mvc;

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

    @Test
    void criaIncidenteEDevolve201() throws Exception {
        mvc.perform(post("/api/v1/incidents")
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
    void ingestaoRepetidaDevolve200ComOMesmoId() throws Exception {
        String corpo = QUEDA.replace("run-api", "run-retry");

        String primeiro = mvc.perform(post("/api/v1/incidents")
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        mvc.perform(post("/api/v1/incidents")
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(
                        com.jayway.jsonpath.JsonPath.read(primeiro, "$.id")));
    }

    @Test
    void rejeitaSeveridadeForaDaFaixa() throws Exception {
        mvc.perform(post("/api/v1/incidents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(QUEDA.replace("\"severity\": 4", "\"severity\": 9")
                                .replace("run-api", "run-invalido")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejeitaPayloadSemChaveDeIdempotencia() throws Exception {
        mvc.perform(post("/api/v1/incidents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(QUEDA.replace(
                                "\"incidentKey\": \"CAM-01:run-api:track-7:20260810T143102482Z\"",
                                "\"incidentKey\": \"\"")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void fechaIncidenteComDuracaoEPico() throws Exception {
        String corpo = QUEDA.replace("run-api", "run-close");
        mvc.perform(post("/api/v1/incidents")
                .contentType(MediaType.APPLICATION_JSON).content(corpo));

        mvc.perform(patch("/api/v1/incidents/CAM-01:run-close:track-7:20260810T143102482Z")
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
    void fechamentoDeChaveInexistenteDevolve404() throws Exception {
        mvc.perform(patch("/api/v1/incidents/nao-existe")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"durationSeconds\": 1.0}"))
                .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentIngestionApiTest
```

Esperado: FALHA — 404 em todas as rotas, porque `IncidentController` não existe.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/controller/IncidentController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.IncidentCloseRequest;
import com.dev4.cypher.dto.IncidentRequest;
import com.dev4.cypher.dto.IncidentResponse;
import com.dev4.cypher.service.IncidentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/incidents")
public class IncidentController {

    private final IncidentService service;

    public IncidentController(IncidentService service) {
        this.service = service;
    }

    /**
     * Ingestão vinda do pipeline. Idempotente por {@code incidentKey}: um retry
     * após timeout devolve 200 com o incidente existente, em vez de duplicar.
     */
    @PostMapping
    public ResponseEntity<IncidentResponse> ingest(@Valid @RequestBody IncidentRequest req) {
        IncidentService.IngestResult resultado = service.ingest(req);
        HttpStatus status = resultado.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(resultado.incident());
    }

    /** Fechamento do episódio e/ou chegada tardia do snapshot. */
    @PatchMapping("/{incidentKey}")
    public ResponseEntity<IncidentResponse> close(@PathVariable String incidentKey,
                                                  @Valid @RequestBody IncidentCloseRequest req) {
        return service.close(incidentKey, req)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
```

Remover o CRUD antigo, que expunha a entidade JPA e servia uma rota sem consumidor:

```bash
cd /home/asaas/projects/cypher
rm src/main/java/com/dev4/cypher/controller/AlertaController.java
rm src/main/java/com/dev4/cypher/service/AlertaService.java
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentIngestionApiTest
```

Esperado: PASSA, 6 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add -A src/main/java/com/dev4/cypher/controller/ \
           src/main/java/com/dev4/cypher/service/ \
           src/test/java/com/dev4/cypher/IncidentIngestionApiTest.java
git commit -m "feat(controller): endpoints de ingestao e fechamento de incidente"
```

---

## Task 8: Histórico filtrado e mudança de status

**Files:**
- Modify: `src/main/java/com/dev4/cypher/repository/AlertaRepository.java`
- Modify: `src/main/java/com/dev4/cypher/service/IncidentService.java`
- Modify: `src/main/java/com/dev4/cypher/controller/IncidentController.java`
- Create: `src/main/java/com/dev4/cypher/dto/StatusRequest.java`
- Test: `src/test/java/com/dev4/cypher/IncidentQueryApiTest.java`

**Interfaces:**
- Consumes: tudo das Tasks 6–7.
- Produces:
  - `AlertaRepository.buscar(OffsetDateTime since, String cameraId, Integer severityMin, AlertaStatus status, Pageable) -> Page<Alerta>`.
  - `IncidentService.search(...) -> Page<IncidentResponse>`.
  - `GET /api/v1/incidents?since&camera&severityMin&status&page&size`, `PUT /api/v1/incidents/{id}/status`.
  - `StatusRequest(AlertaStatus status)`.

O `since` não é conveniência: quando o SSE cai e reconecta, o front busca por ele para cobrir a lacuna (spec §6.3).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/IncidentQueryApiTest.java`:

```java
package com.dev4.cypher;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.dev4.cypher.repository.AlertaRepository;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class IncidentQueryApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AlertaRepository repository;

    private String incidente(String key, String camera, int severidade,
                             String tipo, String instante) {
        return """
                {
                  "incidentKey": "%s",
                  "cameraId": "%s",
                  "runId": "run-q",
                  "trackId": 1,
                  "type": "%s",
                  "severity": %d,
                  "reason": "regra",
                  "postureCategory": "immediate_risk",
                  "rebaScore": 9,
                  "actionLevel": 3,
                  "zoneName": null,
                  "zoneStatus": "outside",
                  "epiPresent": [],
                  "epiMissing": [],
                  "detectedAt": "%s",
                  "snapshotUrl": null
                }
                """.formatted(key, camera, tipo, severidade, instante);
    }

    @BeforeEach
    void semear() throws Exception {
        repository.deleteAll();
        mvc.perform(post("/api/v1/incidents").contentType(MediaType.APPLICATION_JSON)
                .content(incidente("q1", "CAM-01", 4, "FALL_RISK", "2026-08-10T08:00:00-03:00")));
        mvc.perform(post("/api/v1/incidents").contentType(MediaType.APPLICATION_JSON)
                .content(incidente("q2", "CAM-02", 2, "ERGONOMIC_RISK", "2026-08-10T09:00:00-03:00")));
        mvc.perform(post("/api/v1/incidents").contentType(MediaType.APPLICATION_JSON)
                .content(incidente("q3", "CAM-01", 3, "ZONE_VIOLATION", "2026-08-10T10:00:00-03:00")));
    }

    @Test
    void listaMaisRecentesPrimeiro() throws Exception {
        mvc.perform(get("/api/v1/incidents"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.content[0].incidentKey").value("q3"));
    }

    @Test
    void filtraPorCamera() throws Exception {
        mvc.perform(get("/api/v1/incidents").param("camera", "CAM-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void filtraPorSeveridadeMinima() throws Exception {
        mvc.perform(get("/api/v1/incidents").param("severityMin", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void filtraPorInstanteParaCobrirLacunaDoSse() throws Exception {
        mvc.perform(get("/api/v1/incidents").param("since", "2026-08-10T09:30:00-03:00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].incidentKey").value("q3"));
    }

    @Test
    void pagina() throws Exception {
        mvc.perform(get("/api/v1/incidents").param("size", "2").param("page", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    @Test
    void operadorReconheceIncidente() throws Exception {
        String lista = mvc.perform(get("/api/v1/incidents").param("camera", "CAM-02"))
                .andReturn().getResponse().getContentAsString();
        Integer id = com.jayway.jsonpath.JsonPath.read(lista, "$.content[0].id");

        mvc.perform(put("/api/v1/incidents/{id}/status", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"REVISADO\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVISADO"));
    }

    @Test
    void statusDeIncidenteInexistenteDevolve404() throws Exception {
        mvc.perform(put("/api/v1/incidents/{id}/status", 999999)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"RESOLVIDO\"}"))
                .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentQueryApiTest
```

Esperado: FALHA — 404/405 nas rotas `GET` e `PUT`, que ainda não existem.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/dto/StatusRequest.java`:

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.model.AlertaStatus;
import jakarta.validation.constraints.NotNull;

/** Reconhecimento do incidente pelo operador. */
public record StatusRequest(@NotNull AlertaStatus status) {
}
```

Substituir `src/main/java/com/dev4/cypher/repository/AlertaRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Alerta;
import com.dev4.cypher.model.AlertaStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.Optional;

@Repository
public interface AlertaRepository extends JpaRepository<Alerta, Long> {

    Optional<Alerta> findByIncidentKey(String incidentKey);

    /**
     * Busca com filtros opcionais. Cada parâmetro nulo desliga seu próprio
     * predicado, o que evita quatro métodos derivados quase idênticos.
     */
    @Query("""
            SELECT a FROM Alerta a
            WHERE (:since IS NULL OR a.dataHora >= :since)
              AND (:cameraId IS NULL OR a.cameraId = :cameraId)
              AND (:severityMin IS NULL OR a.severidade >= :severityMin)
              AND (:status IS NULL OR a.status = :status)
            """)
    Page<Alerta> buscar(@Param("since") OffsetDateTime since,
                        @Param("cameraId") String cameraId,
                        @Param("severityMin") Integer severityMin,
                        @Param("status") AlertaStatus status,
                        Pageable pageable);
}
```

Adicionar a `IncidentService` (importar `org.springframework.data.domain.Page`, `Pageable`, `java.time.OffsetDateTime`):

```java
    @Transactional(readOnly = true)
    public Page<IncidentResponse> search(OffsetDateTime since,
                                         String cameraId,
                                         Integer severityMin,
                                         AlertaStatus status,
                                         Pageable pageable) {
        return repository.buscar(since, cameraId, severityMin, status, pageable)
                .map(mapper::toResponse);
    }
```

Adicionar a `IncidentController` (importar `Page`, `Pageable`, `PageRequest`, `Sort`, `OffsetDateTime`, `AlertaStatus`, `StatusRequest`, `GetMapping`, `PutMapping`, `RequestParam`, `DateTimeFormat`):

```java
    /**
     * Histórico com filtros opcionais, mais recentes primeiro.
     *
     * <p>{@code since} é o que o front usa para cobrir a lacuna depois de o SSE
     * cair e reconectar.
     */
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
        return service.search(since, camera, severityMin, status, pageable);
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<IncidentResponse> changeStatus(@PathVariable Long id,
                                                         @Valid @RequestBody StatusRequest req) {
        return service.changeStatus(id, req.status())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
```

Os imports completos a acrescentar no topo de `IncidentController.java`:

```java
import com.dev4.cypher.dto.StatusRequest;
import com.dev4.cypher.model.AlertaStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.time.OffsetDateTime;
```

E em `IncidentService.java`:

```java
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.OffsetDateTime;
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentQueryApiTest
```

Esperado: PASSA, 7 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/repository/AlertaRepository.java \
        src/main/java/com/dev4/cypher/service/IncidentService.java \
        src/main/java/com/dev4/cypher/controller/IncidentController.java \
        src/main/java/com/dev4/cypher/dto/StatusRequest.java \
        src/test/java/com/dev4/cypher/IncidentQueryApiTest.java
git commit -m "feat(api): historico filtrado com paginacao e reconhecimento de incidente"
```

---

## Task 9: Catálogo exposto ao front

**Files:**
- Create: `src/main/java/com/dev4/cypher/dto/CameraResponse.java`
- Create: `src/main/java/com/dev4/cypher/dto/StationResponse.java`
- Create: `src/main/java/com/dev4/cypher/service/CatalogService.java`
- Create: `src/main/java/com/dev4/cypher/controller/CatalogController.java`
- Test: `src/test/java/com/dev4/cypher/CatalogApiTest.java`

**Interfaces:**
- Consumes: `EstacaoRepository`, `CameraRepository` (Task 3).
- Produces:
  - `CameraResponse(String id, String nome, String estacaoId, String streamUrl)`.
  - `StationResponse(String id, String nome, String setor, boolean ativa, List<CameraResponse> cameras)`.
  - `CatalogService.cameras() -> List<CameraResponse>`, `CatalogService.stations() -> List<StationResponse>`.
  - `GET /api/v1/cameras`, `GET /api/v1/stations`.

`fonte` fica fora da resposta de propósito: pode conter credencial embutida na URL RTSP e o browser não tem uso para ela. Quem precisa de `fonte` é o pipeline, em E2.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/CatalogApiTest.java`:

```java
package com.dev4.cypher;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

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

    @Test
    void listaCamerasComUrlDeStream() throws Exception {
        mvc.perform(get("/api/v1/cameras"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("CAM-01"))
                .andExpect(jsonPath("$[0].estacaoId").value("EST-01"))
                .andExpect(jsonPath("$[0].streamUrl").value("http://127.0.0.1:8090/stream"));
    }

    @Test
    void naoExpoeAFonteQuePodeConterCredencial() throws Exception {
        mvc.perform(get("/api/v1/cameras"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].fonte").doesNotExist());
    }

    @Test
    void listaEstacoesComSuasCameras() throws Exception {
        mvc.perform(get("/api/v1/stations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("EST-01"))
                .andExpect(jsonPath("$[0].setor").value("montagem"))
                .andExpect(jsonPath("$[0].cameras[0].id").value("CAM-01"));
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogApiTest
```

Esperado: FALHA — 404 nas duas rotas.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/dto/CameraResponse.java`:

```java
package com.dev4.cypher.dto;

/**
 * Câmera como o front a enxerga.
 *
 * <p>{@code fonte} é omitida de propósito: pode conter credencial embutida na
 * URL RTSP, e o browser consome apenas {@code streamUrl}.
 */
public record CameraResponse(
        String id,
        String nome,
        String estacaoId,
        String streamUrl
) {
}
```

Criar `src/main/java/com/dev4/cypher/dto/StationResponse.java`:

```java
package com.dev4.cypher.dto;

import java.util.List;

/** Estação com as câmeras que a cobrem. É a célula do heatmap. */
public record StationResponse(
        String id,
        String nome,
        String setor,
        boolean ativa,
        List<CameraResponse> cameras
) {
}
```

Criar `src/main/java/com/dev4/cypher/service/CatalogService.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.dto.CameraResponse;
import com.dev4.cypher.dto.StationResponse;
import com.dev4.cypher.model.Camera;
import com.dev4.cypher.repository.CameraRepository;
import com.dev4.cypher.repository.EstacaoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class CatalogService {

    private final EstacaoRepository estacoes;
    private final CameraRepository cameras;

    public CatalogService(EstacaoRepository estacoes, CameraRepository cameras) {
        this.estacoes = estacoes;
        this.cameras = cameras;
    }

    @Transactional(readOnly = true)
    public List<CameraResponse> cameras() {
        return cameras.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<StationResponse> stations() {
        Map<String, List<CameraResponse>> porEstacao = cameras.findAll().stream()
                .collect(Collectors.groupingBy(Camera::getEstacaoId,
                        Collectors.mapping(this::toResponse, Collectors.toList())));

        return estacoes.findAll().stream()
                .map(e -> new StationResponse(e.getId(), e.getNome(), e.getSetor(), e.isAtiva(),
                        porEstacao.getOrDefault(e.getId(), List.of())))
                .toList();
    }

    private CameraResponse toResponse(Camera c) {
        return new CameraResponse(c.getId(), c.getNome(), c.getEstacaoId(), c.getStreamUrl());
    }
}
```

Criar `src/main/java/com/dev4/cypher/controller/CatalogController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.CameraResponse;
import com.dev4.cypher.dto.StationResponse;
import com.dev4.cypher.service.CatalogService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class CatalogController {

    private final CatalogService service;

    public CatalogController(CatalogService service) {
        this.service = service;
    }

    @GetMapping("/cameras")
    public List<CameraResponse> cameras() {
        return service.cameras();
    }

    @GetMapping("/stations")
    public List<StationResponse> stations() {
        return service.stations();
    }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogApiTest
```

Esperado: PASSA, 3 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/dto/CameraResponse.java \
        src/main/java/com/dev4/cypher/dto/StationResponse.java \
        src/main/java/com/dev4/cypher/service/CatalogService.java \
        src/main/java/com/dev4/cypher/controller/CatalogController.java \
        src/test/java/com/dev4/cypher/CatalogApiTest.java
git commit -m "feat(api): catalogo de cameras e estacoes exposto ao front"
```

---

## Task 10: Agregados do dashboard

**Files:**
- Create: `src/main/java/com/dev4/cypher/dto/SummaryResponse.java`
- Create: `src/main/java/com/dev4/cypher/service/SummaryService.java`
- Create: `src/main/java/com/dev4/cypher/controller/SummaryController.java`
- Test: `src/test/java/com/dev4/cypher/SummaryApiTest.java`

**Interfaces:**
- Consumes: `AlertaRepository` (Task 8), `CatalogService` (Task 9).
- Produces:
  - `SummaryResponse(int incidentesHoje, int incidentesOntem, int criticosHoje, int pendentes, List<StationCell> heatmap, List<DayCount> ultimosSeteDias)`.
  - `SummaryResponse.StationCell(String estacaoId, String nome, String setor, int incidentes)`.
  - `SummaryResponse.DayCount(LocalDate dia, int incidentes)`.
  - `GET /api/v1/summary`.

Sem este endpoint, o Angular teria que baixar todo o histórico e contar no browser. O `GROUP BY` resolve no banco (spec §5.1).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/SummaryApiTest.java`:

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
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "cypher.catalog.stations[0].id=EST-01",
        "cypher.catalog.stations[0].nome=Esteira de montagem",
        "cypher.catalog.stations[0].setor=montagem",
        "cypher.catalog.stations[1].id=EST-02",
        "cypher.catalog.stations[1].nome=Prensa 3",
        "cypher.catalog.stations[1].setor=estamparia",
        "cypher.catalog.cameras[0].id=CAM-01",
        "cypher.catalog.cameras[0].nome=Frontal",
        "cypher.catalog.cameras[0].estacaoId=EST-01",
        "cypher.catalog.cameras[1].id=CAM-02",
        "cypher.catalog.cameras[1].nome=Lateral",
        "cypher.catalog.cameras[1].estacaoId=EST-02",
})
class SummaryApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AlertaRepository repository;

    private Alerta incidente(String key, String camera, int severidade, OffsetDateTime quando) {
        Alerta a = new Alerta();
        a.setIncidentKey(key);
        a.setRunId("run-s");
        a.setTrackId(1);
        a.setCameraId(camera);
        a.setTipo(AlertaTipo.FALL_RISK);
        a.setSeveridade(severidade);
        a.setNivel(AlertaNivel.fromSeverity(severidade));
        a.setDescricao("teste");
        a.setReason("regra");
        a.setPosturaCategoria("immediate_risk");
        a.setRebaScore(9);
        a.setActionLevel(3);
        a.setZoneStatus("outside");
        a.setEpiPresent(List.of());
        a.setEpiMissing(List.of());
        a.setDataHora(quando);
        a.setStatus(AlertaStatus.PENDENTE);
        return a;
    }

    @BeforeEach
    void semear() {
        repository.deleteAll();
        OffsetDateTime agora = OffsetDateTime.now();
        repository.save(incidente("s1", "CAM-01", 4, agora.minusHours(1)));
        repository.save(incidente("s2", "CAM-01", 2, agora.minusHours(2)));
        repository.save(incidente("s3", "CAM-02", 3, agora.minusHours(3)));
        repository.saveAndFlush(incidente("s4", "CAM-01", 1, agora.minusDays(1)));
    }

    @Test
    void contaIncidentesDeHojeEDeOntem() throws Exception {
        mvc.perform(get("/api/v1/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.incidentesHoje").value(3))
                .andExpect(jsonPath("$.incidentesOntem").value(1));
    }

    @Test
    void contaCriticosEPendentes() throws Exception {
        mvc.perform(get("/api/v1/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.criticosHoje").value(2))
                .andExpect(jsonPath("$.pendentes").value(4));
    }

    @Test
    void heatmapAgregaPorEstacaoIncluindoAsSemIncidente() throws Exception {
        mvc.perform(get("/api/v1/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.heatmap.length()").value(2))
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-01')].incidentes").value(2))
                .andExpect(jsonPath("$.heatmap[?(@.estacaoId=='EST-02')].incidentes").value(1));
    }

    @Test
    void serieDeSeteDiasTemUmPontoPorDia() throws Exception {
        mvc.perform(get("/api/v1/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ultimosSeteDias.length()").value(7));
    }
}
```

Nota sobre o heatmap: `EST-01` conta 2 (os dois incidentes de hoje na `CAM-01`; o de ontem fica fora da janela) e `EST-02` conta 1.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SummaryApiTest
```

Esperado: FALHA — 404 em `/api/v1/summary`.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/dto/SummaryResponse.java`:

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
        List<DayCount> ultimosSeteDias
) {

    /** Célula do heatmap: uma estação e sua contagem de hoje. */
    public record StationCell(String estacaoId, String nome, String setor, int incidentes) {
    }

    public record DayCount(LocalDate dia, int incidentes) {
    }
}
```

Criar `src/main/java/com/dev4/cypher/service/SummaryService.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.dto.CameraResponse;
import com.dev4.cypher.dto.StationResponse;
import com.dev4.cypher.dto.SummaryResponse;
import com.dev4.cypher.model.Alerta;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.repository.AlertaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Agregações do dashboard.
 *
 * <p>A janela de sete dias é curta o bastante para carregar os incidentes do
 * período em memória e contar em Java. Se o volume crescer, a substituição é
 * por consultas de agregação — mas otimizar antes disso seria adivinhação.
 */
@Service
public class SummaryService {

    private final AlertaRepository repository;
    private final CatalogService catalogo;

    public SummaryService(AlertaRepository repository, CatalogService catalogo) {
        this.repository = repository;
        this.catalogo = catalogo;
    }

    @Transactional(readOnly = true)
    public SummaryResponse build() {
        ZoneId zona = ZoneId.systemDefault();
        LocalDate hoje = LocalDate.now(zona);
        LocalDate ontem = hoje.minusDays(1);
        OffsetDateTime inicioDaJanela = hoje.minusDays(6).atStartOfDay(zona).toOffsetDateTime();

        List<Alerta> janela = repository.findAll().stream()
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
        Map<String, Integer> porEstacaoHoje = new HashMap<>();
        Map<LocalDate, Integer> porDia = new HashMap<>();

        for (Alerta a : janela) {
            LocalDate dia = a.getDataHora().atZoneSameInstant(zona).toLocalDate();
            porDia.merge(dia, 1, Integer::sum);

            if (dia.equals(hoje)) {
                incidentesHoje++;
                if (a.getSeveridade() >= 3) {
                    criticosHoje++;
                }
                String estacaoId = estacaoPorCamera.get(a.getCameraId());
                if (estacaoId != null) {
                    porEstacaoHoje.merge(estacaoId, 1, Integer::sum);
                }
            } else if (dia.equals(ontem)) {
                incidentesOntem++;
            }
        }

        // Estações sem incidente aparecem com zero: uma célula ausente e uma
        // célula zerada significam coisas diferentes no heatmap.
        List<SummaryResponse.StationCell> heatmap = estacoes.values().stream()
                .map(e -> new SummaryResponse.StationCell(e.id(), e.nome(), e.setor(),
                        porEstacaoHoje.getOrDefault(e.id(), 0)))
                .sorted((a, b) -> a.estacaoId().compareTo(b.estacaoId()))
                .toList();

        List<SummaryResponse.DayCount> serie = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            LocalDate dia = hoje.minusDays(i);
            serie.add(new SummaryResponse.DayCount(dia, porDia.getOrDefault(dia, 0)));
        }

        int pendentes = (int) repository.findAll().stream()
                .filter(a -> a.getStatus() == AlertaStatus.PENDENTE)
                .count();

        return new SummaryResponse(incidentesHoje, incidentesOntem, criticosHoje,
                pendentes, heatmap, serie);
    }
}
```

Criar `src/main/java/com/dev4/cypher/controller/SummaryController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.SummaryResponse;
import com.dev4.cypher.service.SummaryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class SummaryController {

    private final SummaryService service;

    public SummaryController(SummaryService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    public SummaryResponse summary() {
        return service.build();
    }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=SummaryApiTest
```

Esperado: PASSA, 4 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/dto/SummaryResponse.java \
        src/main/java/com/dev4/cypher/service/SummaryService.java \
        src/main/java/com/dev4/cypher/controller/SummaryController.java \
        src/test/java/com/dev4/cypher/SummaryApiTest.java
git commit -m "feat(api): agregados de KPI, heatmap por estacao e serie de sete dias"
```

---

## Task 11: Registro de conexões SSE

**Files:**
- Create: `src/main/java/com/dev4/cypher/sse/IncidentSseService.java`
- Modify: `src/main/java/com/dev4/cypher/CypherApplication.java`
- Test: `src/test/java/com/dev4/cypher/sse/IncidentSseServiceTest.java`

**Interfaces:**
- Consumes: `IncidentResponse` (Task 5).
- Produces: `IncidentSseService.subscribe() -> SseEmitter`, `IncidentSseService.register(SseEmitter) -> SseEmitter`, `IncidentSseService.broadcast(String eventName, IncidentResponse) -> void`, `IncidentSseService.heartbeat() -> void`, `IncidentSseService.activeConnections() -> int`.

Sem remoção do emitter em `onCompletion`/`onTimeout`/`onError`, a lista vaza uma entrada a cada refresh do browser (spec §5.3). O heartbeat existe para atravessar proxies e é também o que detecta conexão morta.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/sse/IncidentSseServiceTest.java`:

```java
package com.dev4.cypher.sse;

import com.dev4.cypher.dto.IncidentResponse;
import com.dev4.cypher.model.AlertaNivel;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.model.AlertaTipo;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class IncidentSseServiceTest {

    private final IncidentSseService service = new IncidentSseService();

    private IncidentResponse incidente() {
        return new IncidentResponse(1L, "k", "CAM-01", "run-a", 7,
                AlertaTipo.FALL_RISK, 4, AlertaNivel.ALTO, "descricao",
                "fallen_sustained", "immediate_risk", 11, 4, null, "outside",
                List.of(), List.of(), null,
                OffsetDateTime.of(2026, 8, 10, 14, 31, 2, 0, ZoneOffset.UTC),
                null, null, null, null, AlertaStatus.PENDENTE);
    }

    @Test
    void registraEDesregistraConexoes() {
        SseEmitter emitter = service.subscribe();
        assertThat(service.activeConnections()).isEqualTo(1);

        emitter.complete();
        assertThat(service.activeConnections()).isZero();
    }

    @Test
    void entregaOIncidenteAosInscritos() {
        List<Object> recebidos = new java.util.ArrayList<>();
        SseEmitter gravador = new SseEmitter(0L) {
            @Override
            public void send(SseEventBuilder builder) {
                recebidos.add(builder.build());
            }
        };
        service.register(gravador);

        service.broadcast("incident", incidente());

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
        service.register(quebrado);
        assertThat(service.activeConnections()).isEqualTo(1);

        service.broadcast("incident", incidente());

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
        service.register(quebrado);

        service.heartbeat();

        assertThat(service.activeConnections()).isZero();
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentSseServiceTest
```

Esperado: FALHA de compilação — `IncidentSseService` não existe.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/sse/IncidentSseService.java`:

```java
package com.dev4.cypher.sse;

import com.dev4.cypher.dto.IncidentResponse;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Registro em memória das conexões SSE abertas.
 *
 * <p>Estado volátil por natureza: reiniciar a aplicação derruba as conexões,
 * não os dados. O broadcast é por instância — adequado ao deploy de instância
 * única previsto para esta entrega.
 */
@Service
public class IncidentSseService {

    /** Sem timeout: quem decide encerrar é o cliente ou o heartbeat. */
    private static final long SEM_TIMEOUT = 0L;

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter subscribe() {
        return register(new SseEmitter(SEM_TIMEOUT));
    }

    /**
     * Registra um emitter já construído. Sem a remoção nos três callbacks, a
     * lista vaza uma entrada a cada refresh do browser.
     */
    public SseEmitter register(SseEmitter emitter) {
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));
        return emitter;
    }

    public void broadcast(String eventName, IncidentResponse incident) {
        enviarATodos(SseEmitter.event().name(eventName).data(incident));
    }

    /** Mantém a conexão viva através de proxies e detecta cliente morto. */
    @Scheduled(fixedRate = 15_000)
    public void heartbeat() {
        enviarATodos(SseEmitter.event().comment("keep-alive"));
    }

    public int activeConnections() {
        return emitters.size();
    }

    private void enviarATodos(SseEmitter.SseEventBuilder evento) {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(evento);
            } catch (IOException | IllegalStateException desconectado) {
                emitters.remove(emitter);
            }
        }
    }
}
```

Modificar `src/main/java/com/dev4/cypher/CypherApplication.java` para habilitar o agendamento do heartbeat:

```java
package com.dev4.cypher;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class CypherApplication {

	public static void main(String[] args) {
		SpringApplication.run(CypherApplication.class, args);
	}

}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentSseServiceTest
```

Esperado: PASSA, 4 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/sse/IncidentSseService.java \
        src/main/java/com/dev4/cypher/CypherApplication.java \
        src/test/java/com/dev4/cypher/sse/IncidentSseServiceTest.java
git commit -m "feat(sse): registro de conexoes com heartbeat e limpeza de emitter morto"
```

---

## Task 12: Push publicado somente após o commit

**Files:**
- Create: `src/main/java/com/dev4/cypher/sse/IncidentEventListener.java`
- Modify: `src/main/java/com/dev4/cypher/controller/IncidentController.java`
- Test: `src/test/java/com/dev4/cypher/IncidentEventPublicationTest.java`

**Interfaces:**
- Consumes: `IncidentCreatedEvent`, `IncidentChangedEvent` (Task 6), `IncidentSseService` (Task 11).
- Produces: `GET /api/v1/incidents/stream` devolvendo `SseEmitter`; eventos SSE nomeados `incident` (criação) e `incident-changed` (fechamento, snapshot, status).

Se o push acontecesse dentro da transação, um rollback deixaria o operador vendo no painel um incidente que não existe no banco (spec §5.4). O teste abaixo prova que a publicação só ocorre depois do commit.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/IncidentEventPublicationTest.java`:

```java
package com.dev4.cypher;

import com.dev4.cypher.event.IncidentCreatedEvent;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.concurrent.CopyOnWriteArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Import(IncidentEventPublicationTest.Espiao.class)
class IncidentEventPublicationTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private Espiao espiao;

    /**
     * Registra o que chega depois do commit — nunca durante a transação.
     * A própria classe @TestConfiguration vira bean ao ser importada, então
     * o @Autowired acima a resolve sem método de fábrica.
     */
    @TestConfiguration
    static class Espiao {

        final List<String> recebidosAposCommit = new CopyOnWriteArrayList<>();

        @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
        public void onCreated(IncidentCreatedEvent event) {
            recebidosAposCommit.add(event.incident().incidentKey());
        }
    }

    @Test
    void publicaEventoSomenteDepoisDoCommit() throws Exception {
        String corpo = """
                {
                  "incidentKey": "CAM-01:run-evt:track-1:20260810T150000000Z",
                  "cameraId": "CAM-01",
                  "runId": "run-evt",
                  "trackId": 1,
                  "type": "FALL_RISK",
                  "severity": 4,
                  "reason": "fallen_sustained",
                  "postureCategory": "immediate_risk",
                  "rebaScore": 11,
                  "actionLevel": 4,
                  "zoneName": null,
                  "zoneStatus": "outside",
                  "epiPresent": [],
                  "epiMissing": [],
                  "detectedAt": "2026-08-10T15:00:00Z",
                  "snapshotUrl": null
                }
                """;

        mvc.perform(post("/api/v1/incidents")
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isCreated());

        assertThat(espiao.recebidosAposCommit)
                .contains("CAM-01:run-evt:track-1:20260810T150000000Z");
    }

    @Test
    void retryNaoRepublicaOEvento() throws Exception {
        String corpo = """
                {
                  "incidentKey": "CAM-01:run-retry-evt:track-1:20260810T150000000Z",
                  "cameraId": "CAM-01",
                  "runId": "run-retry-evt",
                  "trackId": 1,
                  "type": "FALL_RISK",
                  "severity": 4,
                  "reason": "fallen_sustained",
                  "postureCategory": "immediate_risk",
                  "rebaScore": 11,
                  "actionLevel": 4,
                  "zoneName": null,
                  "zoneStatus": "outside",
                  "epiPresent": [],
                  "epiMissing": [],
                  "detectedAt": "2026-08-10T15:00:00Z",
                  "snapshotUrl": null
                }
                """;

        mvc.perform(post("/api/v1/incidents")
                .contentType(MediaType.APPLICATION_JSON).content(corpo));
        mvc.perform(post("/api/v1/incidents")
                .contentType(MediaType.APPLICATION_JSON).content(corpo));

        long publicacoes = espiao.recebidosAposCommit.stream()
                .filter(k -> k.contains("run-retry-evt"))
                .count();
        assertThat(publicacoes).isEqualTo(1);
    }

    @Test
    void streamAbreConexaoSse() throws Exception {
        mvc.perform(get("/api/v1/incidents/stream"))
                .andExpect(status().isOk());
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentEventPublicationTest
```

Esperado: FALHA — `streamAbreConexaoSse` recebe 404, porque a rota não existe.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/sse/IncidentEventListener.java`:

```java
package com.dev4.cypher.sse;

import com.dev4.cypher.event.IncidentChangedEvent;
import com.dev4.cypher.event.IncidentCreatedEvent;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Ponte entre os eventos de domínio e o push.
 *
 * <p>AFTER_COMMIT é essencial: dentro da transação, um rollback deixaria o
 * operador vendo no painel um incidente que não existe no banco.
 */
@Component
public class IncidentEventListener {

    private final IncidentSseService sse;

    public IncidentEventListener(IncidentSseService sse) {
        this.sse = sse;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCreated(IncidentCreatedEvent event) {
        sse.broadcast("incident", event.incident());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onChanged(IncidentChangedEvent event) {
        sse.broadcast("incident-changed", event.incident());
    }
}
```

Adicionar a `IncidentController` o endpoint de stream, mais o campo e a injeção do `IncidentSseService`:

```java
    private final IncidentSseService sse;

    public IncidentController(IncidentService service, IncidentSseService sse) {
        this.service = service;
        this.sse = sse;
    }

    /** Fluxo de incidentes em tempo real consumido pelo dashboard. */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return sse.subscribe();
    }
```

Imports a acrescentar em `IncidentController.java`:

```java
import com.dev4.cypher.sse.IncidentSseService;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
```

O construtor antigo de um argumento é substituído pelo de dois acima.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=IncidentEventPublicationTest
```

Esperado: PASSA, 3 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/sse/IncidentEventListener.java \
        src/main/java/com/dev4/cypher/controller/IncidentController.java \
        src/test/java/com/dev4/cypher/IncidentEventPublicationTest.java
git commit -m "feat(sse): push de incidente publicado apos o commit da transacao"
```

---

## Task 13: CORS e verificação de ponta a ponta

**Files:**
- Create: `src/main/java/com/dev4/cypher/config/CorsConfig.java`
- Test: `src/test/java/com/dev4/cypher/CorsConfigTest.java`

**Interfaces:**
- Consumes: propriedade `cypher.cors.allowed-origins` (Task 4).
- Produces: cabeçalhos CORS nas rotas `/api/**`, com credenciais permitidas.

Sem CORS o Angular não conversa com a API nem em desenvolvimento. `allowCredentials(true)` é exigência de §15: o front usa cookie de sessão, e com credenciais a origem não pode ser `*`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/CorsConfigTest.java`:

```java
package com.dev4.cypher;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "cypher.cors.allowed-origins=http://localhost:4200")
class CorsConfigTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void liberaOrigemDoAngularComCredenciais() throws Exception {
        mvc.perform(options("/api/v1/incidents")
                        .header("Origin", "http://localhost:4200")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:4200"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }

    @Test
    void naoLiberaOrigemDesconhecida() throws Exception {
        mvc.perform(options("/api/v1/incidents")
                        .header("Origin", "http://exemplo-malicioso.invalid")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CorsConfigTest
```

Esperado: FALHA — sem configuração de CORS, o preflight da origem permitida é rejeitado.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/config/CorsConfig.java`:

```java
package com.dev4.cypher.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * Libera a origem do Angular.
 *
 * <p>{@code allowCredentials(true)} porque o front usa cookie de sessão
 * (spec §15) — e com credenciais a origem não pode ser curinga.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final List<String> origensPermitidas;

    public CorsConfig(@Value("${cypher.cors.allowed-origins}") List<String> origensPermitidas) {
        this.origensPermitidas = origensPermitidas;
    }

    @Override
    public void addCorsMappings(@NonNull CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(origensPermitidas.toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }
}
```

Acrescentar ao `src/test/resources/application.yaml`, no fim do arquivo:

```yaml
  cors:
    allowed-origins:
      - http://localhost:4200
```

Atenção à indentação: essa chave é filha de `cypher`, no mesmo nível de `catalog`.

- [ ] **Step 4: Rodar a suíte inteira e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test
```

Esperado: PASSA — todas as classes de teste das Tasks 1–13 verdes, zero falhas, incluindo o `contextLoads` que já existia.

- [ ] **Step 5: Verificação manual de ponta a ponta**

Subir a aplicação e exercitar o fluxo real com `curl`:

```bash
cd /home/asaas/projects/cypher && ./mvnw -o spring-boot:run
```

Em outro terminal, abrir o stream e deixá-lo rodando:

```bash
curl -N http://localhost:8080/api/v1/incidents/stream
```

Num terceiro, ingerir um incidente:

```bash
curl -i -X POST http://localhost:8080/api/v1/incidents \
  -H 'Content-Type: application/json' \
  -d '{
    "incidentKey": "CAM-01:manual:track-1:20260810T160000000Z",
    "cameraId": "CAM-01", "runId": "manual", "trackId": 1,
    "type": "FALL_RISK", "severity": 4, "reason": "fallen_sustained",
    "postureCategory": "immediate_risk", "rebaScore": 11, "actionLevel": 4,
    "zoneName": null, "zoneStatus": "outside",
    "epiPresent": ["HELMET"], "epiMissing": [],
    "detectedAt": "2026-08-10T16:00:00-03:00", "snapshotUrl": null
  }'
```

Confirmar, nesta ordem: o `POST` devolve `201`; o terminal do `curl -N` imprime um evento `incident` com o mesmo `incidentKey`; repetir o mesmo `POST` devolve `200` e **não** gera segundo evento no stream. Depois:

```bash
curl -s http://localhost:8080/api/v1/summary
curl -s http://localhost:8080/api/v1/stations
curl -s 'http://localhost:8080/api/v1/incidents?severityMin=3'
```

Confirmar que `/summary` conta o incidente na estação `EST-01` do heatmap.

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/config/CorsConfig.java \
        src/test/resources/application.yaml \
        src/test/java/com/dev4/cypher/CorsConfigTest.java
git commit -m "feat(config): CORS para o Angular com credenciais habilitadas"
```

---

## Task 14: Assinaturas de webhook e assinatura HMAC

> **Ordem de execução:** as Tasks 14 e 15 são o passo 6 da spec §11 e podem ser executadas **depois** dos planos E1-B e E1-C. As Tasks 1–13 são o que destrava os outros dois planos.

**Files:**
- Create: `src/main/java/com/dev4/cypher/model/WebhookSubscription.java`
- Create: `src/main/java/com/dev4/cypher/model/WebhookDelivery.java`
- Create: `src/main/java/com/dev4/cypher/model/DeliveryStatus.java`
- Create: `src/main/java/com/dev4/cypher/repository/WebhookSubscriptionRepository.java`
- Create: `src/main/java/com/dev4/cypher/repository/WebhookDeliveryRepository.java`
- Create: `src/main/java/com/dev4/cypher/webhook/WebhookSigner.java`
- Modify: `src/main/java/com/dev4/cypher/config/CatalogProperties.java`
- Modify: `src/main/java/com/dev4/cypher/config/CatalogSeeder.java`
- Test: `src/test/java/com/dev4/cypher/webhook/WebhookSignerTest.java`

**Interfaces:**
- Consumes: `CatalogProperties` (Task 4).
- Produces:
  - `WebhookSubscription(Long id, String url, String secret, Integer minSeverity, boolean ativo)`.
  - `WebhookDelivery(Long id, Long subscriptionId, String incidentKey, String payload, DeliveryStatus status, int tentativas, String ultimoErro, OffsetDateTime proximaTentativa)`.
  - `DeliveryStatus` = `PENDENTE | ENTREGUE | FALHA`.
  - `WebhookSigner.sign(String secret, String timestamp, String body) -> String` (formato `sha256=<hex>`).
  - `WebhookDeliveryRepository.findByStatusAndProximaTentativaBefore(DeliveryStatus, OffsetDateTime) -> List<WebhookDelivery>`.
  - Propriedade `cypher.catalog.webhooks[]` com `url`, `secret`, `minSeverity`, `ativo`.

A tabela de delivery é o que permite responder "o alerta chegou ao cliente?" — pergunta inevitável sobre uma funcionalidade descrita como vital (spec §5.5).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/webhook/WebhookSignerTest.java`:

```java
package com.dev4.cypher.webhook;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class WebhookSignerTest {

    private final WebhookSigner signer = new WebhookSigner();

    @Test
    void assinaturaEhDeterministica() {
        String a = signer.sign("segredo", "1786000000", "{\"x\":1}");
        String b = signer.sign("segredo", "1786000000", "{\"x\":1}");

        assertThat(a).isEqualTo(b);
        assertThat(a).startsWith("sha256=");
    }

    @Test
    void corpoDiferenteProduzAssinaturaDiferente() {
        String a = signer.sign("segredo", "1786000000", "{\"x\":1}");
        String b = signer.sign("segredo", "1786000000", "{\"x\":2}");

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void timestampEntraNaAssinaturaParaImpedirReplay() {
        String a = signer.sign("segredo", "1786000000", "{\"x\":1}");
        String b = signer.sign("segredo", "1786000099", "{\"x\":1}");

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void segredoDiferenteProduzAssinaturaDiferente() {
        String a = signer.sign("segredo-a", "1786000000", "{\"x\":1}");
        String b = signer.sign("segredo-b", "1786000000", "{\"x\":1}");

        assertThat(a).isNotEqualTo(b);
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=WebhookSignerTest
```

Esperado: FALHA de compilação — `WebhookSigner` não existe.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/model/DeliveryStatus.java`:

```java
package com.dev4.cypher.model;

public enum DeliveryStatus {
    PENDENTE,
    ENTREGUE,
    FALHA
}
```

Criar `src/main/java/com/dev4/cypher/model/WebhookSubscription.java`:

```java
package com.dev4.cypher.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Assinante externo que recebe incidentes por webhook. */
@Entity
@Table(name = "webhook_subscriptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class WebhookSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 500)
    private String url;

    @Column(nullable = false, length = 200)
    private String secret;

    /** Só incidentes com severidade ≥ este valor são entregues. */
    @Column(nullable = false)
    private Integer minSeverity;

    @Column(nullable = false)
    private boolean ativo;
}
```

Criar `src/main/java/com/dev4/cypher/model/WebhookDelivery.java`:

```java
package com.dev4.cypher.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * Registro de uma tentativa de entrega. Existe para que a pergunta "o alerta
 * chegou ao cliente?" tenha resposta.
 */
@Entity
@Table(name = "webhook_deliveries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class WebhookDelivery {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long subscriptionId;

    @Column(nullable = false, length = 200)
    private String incidentKey;

    @Lob
    @Column(nullable = false)
    private String payload;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DeliveryStatus status;

    @Column(nullable = false)
    private int tentativas;

    @Column(length = 500)
    private String ultimoErro;

    private OffsetDateTime proximaTentativa;
}
```

Criar `src/main/java/com/dev4/cypher/repository/WebhookSubscriptionRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.WebhookSubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WebhookSubscriptionRepository extends JpaRepository<WebhookSubscription, Long> {

    List<WebhookSubscription> findByAtivoTrue();
}
```

Criar `src/main/java/com/dev4/cypher/repository/WebhookDeliveryRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.DeliveryStatus;
import com.dev4.cypher.model.WebhookDelivery;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;

@Repository
public interface WebhookDeliveryRepository extends JpaRepository<WebhookDelivery, Long> {

    List<WebhookDelivery> findByStatusAndProximaTentativaBefore(DeliveryStatus status,
                                                               OffsetDateTime limite);

    List<WebhookDelivery> findByIncidentKey(String incidentKey);
}
```

Criar `src/main/java/com/dev4/cypher/webhook/WebhookSigner.java`:

```java
package com.dev4.cypher.webhook;

import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Assina o corpo cru do webhook com HMAC-SHA256.
 *
 * <p>O timestamp entra na mensagem assinada para que uma requisição capturada
 * não possa ser reenviada indefinidamente.
 */
@Component
public class WebhookSigner {

    private static final String ALGORITMO = "HmacSHA256";

    public String sign(String secret, String timestamp, String body) {
        try {
            Mac mac = Mac.getInstance(ALGORITMO);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), ALGORITMO));
            byte[] digest = mac.doFinal(
                    (timestamp + "." + body).getBytes(StandardCharsets.UTF_8));
            return "sha256=" + HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("Falha ao assinar webhook", e);
        }
    }
}
```

Acrescentar a `CatalogProperties` a lista de assinantes, junto das já existentes:

```java
    private List<WebhookConfig> webhooks = new ArrayList<>();

    @Getter
    @Setter
    public static class WebhookConfig {
        private String url;
        private String secret;
        private Integer minSeverity = 3;
        private boolean ativo = true;
    }
```

Acrescentar ao `CatalogSeeder` o campo, a injeção e o upsert. O construtor passa a receber quatro argumentos:

```java
    private final WebhookSubscriptionRepository webhooks;

    public CatalogSeeder(CatalogProperties properties,
                         EstacaoRepository estacoes,
                         CameraRepository cameras,
                         WebhookSubscriptionRepository webhooks) {
        this.properties = properties;
        this.estacoes = estacoes;
        this.cameras = cameras;
        this.webhooks = webhooks;
    }
```

e, ao final de `run`:

```java
        properties.getWebhooks().forEach(cfg -> {
            boolean jaExiste = webhooks.findAll().stream()
                    .anyMatch(w -> w.getUrl().equals(cfg.getUrl()));
            if (!jaExiste) {
                webhooks.save(new WebhookSubscription(null, cfg.getUrl(), cfg.getSecret(),
                        cfg.getMinSeverity(), cfg.isAtivo()));
            }
        });
```

Imports a acrescentar em `CatalogSeeder.java`:

```java
import com.dev4.cypher.model.WebhookSubscription;
import com.dev4.cypher.repository.WebhookSubscriptionRepository;
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=WebhookSignerTest
```

Esperado: PASSA, 4 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/model/Webhook*.java \
        src/main/java/com/dev4/cypher/model/DeliveryStatus.java \
        src/main/java/com/dev4/cypher/repository/Webhook*.java \
        src/main/java/com/dev4/cypher/webhook/ \
        src/main/java/com/dev4/cypher/config/ \
        src/test/java/com/dev4/cypher/webhook/WebhookSignerTest.java
git commit -m "feat(webhook): assinaturas, registro de entrega e assinatura HMAC"
```

---

## Task 15: Entrega assíncrona com retry

**Files:**
- Create: `src/main/java/com/dev4/cypher/webhook/WebhookDispatcher.java`
- Modify: `src/main/java/com/dev4/cypher/CypherApplication.java`
- Modify: `pom.xml` (apenas se Awaitility não vier transitivamente — ver passo 1)
- Test: `src/test/java/com/dev4/cypher/webhook/WebhookDispatcherTest.java`

**Interfaces:**
- Consumes: `IncidentCreatedEvent` (Task 6), `WebhookSubscriptionRepository`, `WebhookDeliveryRepository`, `WebhookSigner` (Task 14).
- Produces: `WebhookDispatcher.onIncidentCreated(IncidentCreatedEvent)` (`@Async` + `AFTER_COMMIT`), `WebhookDispatcher.reenviarPendentes()` (`@Scheduled`).

Falha de entrega não pode afetar a ingestão nem o dashboard: o dispatcher grava a delivery como pendente e um varredor agendado tenta de novo com backoff (spec §5.5, §7).

O teste sobe um servidor HTTP de verdade com `com.sun.net.httpserver.HttpServer`, embutido no JDK — sem dependência nova e sem rede externa.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/webhook/WebhookDispatcherTest.java`:

```java
package com.dev4.cypher.webhook;

import com.dev4.cypher.dto.IncidentResponse;
import com.dev4.cypher.event.IncidentCreatedEvent;
import com.dev4.cypher.model.AlertaNivel;
import com.dev4.cypher.model.AlertaStatus;
import com.dev4.cypher.model.AlertaTipo;
import com.dev4.cypher.model.DeliveryStatus;
import com.dev4.cypher.model.WebhookSubscription;
import com.dev4.cypher.repository.WebhookDeliveryRepository;
import com.dev4.cypher.repository.WebhookSubscriptionRepository;
import com.sun.net.httpserver.HttpServer;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class WebhookDispatcherTest {

    @Autowired
    private WebhookDispatcher dispatcher;

    @Autowired
    private WebhookSubscriptionRepository assinaturas;

    @Autowired
    private WebhookDeliveryRepository entregas;

    private HttpServer servidor;
    private final List<String> assinaturasRecebidas = new CopyOnWriteArrayList<>();
    private volatile int statusDeResposta = 200;

    @BeforeEach
    void subirAssinante() throws IOException {
        assinaturas.deleteAll();
        entregas.deleteAll();
        assinaturasRecebidas.clear();
        statusDeResposta = 200;

        servidor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        servidor.createContext("/hook", troca -> {
            assinaturasRecebidas.add(troca.getRequestHeaders()
                    .getFirst("X-Cypher-Signature"));
            troca.sendResponseHeaders(statusDeResposta, -1);
            troca.close();
        });
        servidor.start();

        assinaturas.save(new WebhookSubscription(null,
                "http://127.0.0.1:" + servidor.getAddress().getPort() + "/hook",
                "segredo", 3, true));
    }

    @AfterEach
    void derrubarAssinante() {
        servidor.stop(0);
    }

    private IncidentResponse incidente(int severidade) {
        return new IncidentResponse(1L, "k-hook", "CAM-01", "run-a", 7,
                AlertaTipo.FALL_RISK, severidade, AlertaNivel.fromSeverity(severidade),
                "descricao", "fallen_sustained", "immediate_risk", 11, 4, null, "outside",
                List.of(), List.of(), null,
                OffsetDateTime.of(2026, 8, 10, 14, 31, 2, 0, ZoneOffset.UTC),
                null, null, null, null, AlertaStatus.PENDENTE);
    }

    @Test
    void entregaIncidenteAssinadoAoAssinante() {
        dispatcher.onIncidentCreated(new IncidentCreatedEvent(incidente(4)));

        Awaitility.await().atMost(Duration.ofSeconds(5))
                .untilAsserted(() -> assertThat(assinaturasRecebidas).hasSize(1));

        assertThat(assinaturasRecebidas.get(0)).startsWith("sha256=");
        assertThat(entregas.findByIncidentKey("k-hook"))
                .singleElement()
                .satisfies(d -> assertThat(d.getStatus()).isEqualTo(DeliveryStatus.ENTREGUE));
    }

    @Test
    void naoEntregaAbaixoDaSeveridadeMinima() {
        dispatcher.onIncidentCreated(new IncidentCreatedEvent(incidente(2)));

        assertThat(assinaturasRecebidas).isEmpty();
        assertThat(entregas.findByIncidentKey("k-hook")).isEmpty();
    }

    @Test
    void registraFalhaComoPendenteParaRetry() {
        statusDeResposta = 500;

        dispatcher.onIncidentCreated(new IncidentCreatedEvent(incidente(4)));

        Awaitility.await().atMost(Duration.ofSeconds(5))
                .untilAsserted(() -> assertThat(entregas.findByIncidentKey("k-hook"))
                        .singleElement()
                        .satisfies(d -> {
                            assertThat(d.getStatus()).isEqualTo(DeliveryStatus.PENDENTE);
                            assertThat(d.getTentativas()).isEqualTo(1);
                            assertThat(d.getProximaTentativa()).isNotNull();
                        }));
    }

    @Test
    void varredorReenviaPendenteEMarcaEntregue() {
        statusDeResposta = 500;
        dispatcher.onIncidentCreated(new IncidentCreatedEvent(incidente(4)));
        Awaitility.await().atMost(Duration.ofSeconds(5))
                .untilAsserted(() -> assertThat(entregas.findByIncidentKey("k-hook")).hasSize(1));

        // Antecipa a próxima tentativa e volta o assinante ao normal.
        entregas.findByIncidentKey("k-hook").forEach(d -> {
            d.setProximaTentativa(OffsetDateTime.now().minusMinutes(1));
            entregas.save(d);
        });
        statusDeResposta = 200;

        dispatcher.reenviarPendentes();

        Awaitility.await().atMost(Duration.ofSeconds(5))
                .untilAsserted(() -> assertThat(entregas.findByIncidentKey("k-hook"))
                        .singleElement()
                        .satisfies(d -> assertThat(d.getStatus())
                                .isEqualTo(DeliveryStatus.ENTREGUE)));
    }
}
```

Este teste usa Awaitility, que já vem transitivamente com `spring-boot-starter-test`. Confirmar antes de rodar:

```bash
cd /home/asaas/projects/cypher && ./mvnw -o dependency:tree | grep -i awaitility
```

Se não aparecer, acrescentar ao `pom.xml`, dentro de `<dependencies>`:

```xml
		<dependency>
			<groupId>org.awaitility</groupId>
			<artifactId>awaitility</artifactId>
			<scope>test</scope>
		</dependency>
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=WebhookDispatcherTest
```

Esperado: FALHA de compilação — `WebhookDispatcher` não existe.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/webhook/WebhookDispatcher.java`:

```java
package com.dev4.cypher.webhook;

import com.dev4.cypher.dto.IncidentResponse;
import com.dev4.cypher.event.IncidentCreatedEvent;
import com.dev4.cypher.model.DeliveryStatus;
import com.dev4.cypher.model.WebhookDelivery;
import com.dev4.cypher.model.WebhookSubscription;
import com.dev4.cypher.repository.WebhookDeliveryRepository;
import com.dev4.cypher.repository.WebhookSubscriptionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.client.RestClient;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Fan-out de incidentes para assinantes externos.
 *
 * <p>Assíncrono de propósito: uma falha de entrega registra a delivery como
 * pendente e não afeta a ingestão nem o dashboard. O varredor agendado
 * retenta com backoff exponencial.
 */
@Component
public class WebhookDispatcher {

    private static final Logger log = LoggerFactory.getLogger(WebhookDispatcher.class);
    private static final int MAX_TENTATIVAS = 6;

    private final WebhookSubscriptionRepository assinaturas;
    private final WebhookDeliveryRepository entregas;
    private final WebhookSigner signer;
    private final ObjectMapper objectMapper;
    private final RestClient http = RestClient.create();

    public WebhookDispatcher(WebhookSubscriptionRepository assinaturas,
                             WebhookDeliveryRepository entregas,
                             WebhookSigner signer,
                             ObjectMapper objectMapper) {
        this.assinaturas = assinaturas;
        this.entregas = entregas;
        this.signer = signer;
        this.objectMapper = objectMapper;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onIncidentCreated(IncidentCreatedEvent event) {
        IncidentResponse incidente = event.incident();
        String payload = serializar(incidente);

        for (WebhookSubscription assinatura : assinaturas.findByAtivoTrue()) {
            if (incidente.severity() < assinatura.getMinSeverity()) {
                continue;
            }
            WebhookDelivery entrega = new WebhookDelivery(null, assinatura.getId(),
                    incidente.incidentKey(), payload, DeliveryStatus.PENDENTE, 0, null, null);
            tentarEntregar(entrega, assinatura);
        }
    }

    /** Retenta entregas pendentes cuja próxima tentativa já venceu. */
    @Scheduled(fixedRate = 30_000)
    public void reenviarPendentes() {
        List<WebhookDelivery> pendentes = entregas
                .findByStatusAndProximaTentativaBefore(DeliveryStatus.PENDENTE, OffsetDateTime.now());

        for (WebhookDelivery entrega : pendentes) {
            assinaturas.findById(entrega.getSubscriptionId())
                    .ifPresent(assinatura -> tentarEntregar(entrega, assinatura));
        }
    }

    private void tentarEntregar(WebhookDelivery entrega, WebhookSubscription assinatura) {
        String timestamp = String.valueOf(OffsetDateTime.now().toEpochSecond());
        entrega.setTentativas(entrega.getTentativas() + 1);

        try {
            http.post()
                    .uri(assinatura.getUrl())
                    .header("Content-Type", "application/json")
                    .header("X-Cypher-Timestamp", timestamp)
                    .header("X-Cypher-Signature",
                            signer.sign(assinatura.getSecret(), timestamp, entrega.getPayload()))
                    .body(entrega.getPayload())
                    .retrieve()
                    .toBodilessEntity();

            entrega.setStatus(DeliveryStatus.ENTREGUE);
            entrega.setUltimoErro(null);
            entrega.setProximaTentativa(null);
        } catch (Exception falha) {
            entrega.setUltimoErro(truncar(falha.getMessage()));
            if (entrega.getTentativas() >= MAX_TENTATIVAS) {
                entrega.setStatus(DeliveryStatus.FALHA);
                entrega.setProximaTentativa(null);
                log.warn("Webhook desistiu apos {} tentativas: incidente {} para {}",
                        entrega.getTentativas(), entrega.getIncidentKey(), assinatura.getUrl());
            } else {
                entrega.setStatus(DeliveryStatus.PENDENTE);
                // Backoff exponencial: 30s, 60s, 120s, 240s, 480s.
                long segundos = 30L * (1L << (entrega.getTentativas() - 1));
                entrega.setProximaTentativa(OffsetDateTime.now().plusSeconds(segundos));
            }
        }

        entregas.save(entrega);
    }

    private String serializar(IncidentResponse incidente) {
        try {
            return objectMapper.writeValueAsString(incidente);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Falha ao serializar incidente para webhook", e);
        }
    }

    private String truncar(String mensagem) {
        if (mensagem == null) {
            return "erro sem mensagem";
        }
        return mensagem.length() <= 500 ? mensagem : mensagem.substring(0, 500);
    }
}
```

Habilitar execução assíncrona em `src/main/java/com/dev4/cypher/CypherApplication.java` — a anotação entra junto da que já existe:

```java
package com.dev4.cypher;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableAsync
public class CypherApplication {

	public static void main(String[] args) {
		SpringApplication.run(CypherApplication.class, args);
	}

}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=WebhookDispatcherTest
```

Esperado: PASSA, 4 testes.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test
```

Esperado: PASSA — todas as classes de teste das Tasks 1–15 verdes, zero falhas.

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/webhook/WebhookDispatcher.java \
        src/main/java/com/dev4/cypher/CypherApplication.java \
        pom.xml \
        src/test/java/com/dev4/cypher/webhook/WebhookDispatcherTest.java
git commit -m "feat(webhook): entrega assincrona assinada com retry e backoff"
```

---

## Estado ao fim deste plano

A API está pronta para os outros dois planos de E1:

- **E1-B (cypher-capture)** consome `POST /api/v1/incidents` e `PATCH /api/v1/incidents/{key}`.
- **E1-C (cypher-front)** consome `GET /api/v1/incidents`, `/summary`, `/cameras`, `/stations`, `PUT /{id}/status` e o stream SSE.

As Tasks 1–13 destravam os dois. As Tasks 14–15 (webhook) são o passo 6 da spec §11 e podem ser executadas por último, sem bloquear ninguém.

Fora do escopo deste plano, por decisão registrada na spec: autenticação e proteção de endpoints (E4), cadastro de estações e câmeras pela interface (E2), hardening de RTSP (E2).
