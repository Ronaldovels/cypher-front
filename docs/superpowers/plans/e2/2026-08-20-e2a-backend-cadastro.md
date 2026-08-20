# E2-A · Backend de Cadastro e Config de Câmera — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o catálogo de estações e câmeras editável pela API, e servir ao pipeline a fonte de captura com placeholder de credencial e a porta de stream derivada do cadastro.

**Architecture:** `CatalogService` deixa de ser somente leitura e ganha escrita com validação de código, integridade referencial e desativação em vez de exclusão. Três superfícies de leitura passam a existir — lista (navegação, sem fonte), item (administração, com fonte) e config (máquina, com fonte e porta). O `CatalogSeeder` vira bootstrap para não sobrescrever edição da interface a cada boot.

**Tech Stack:** Java 21, Spring Boot 4.0.6, Spring Web MVC, Spring Data JPA, Hibernate, H2, Lombok, Bean Validation, Maven.

**Spec:** `docs/superpowers/specs/2026-08-20-cadastro-e-cameras-design.md` §4, §5, §8, §9.

**Destrava:** E2-B (passo 3 da §12 — `CameraConfigClient` precisa de `/cameras/{id}/config`) e E2-C (passo 5 — o formulário precisa das escritas).

## Global Constraints

- **Repositório:** `/home/asaas/projects/cypher`. Todos os caminhos são relativos a essa raiz.
- **Branch de partida:** `feat/e1a-backend-incidentes`. E1-A não foi mergeado; este plano continua de onde ele parou.
- **Pacote base:** `com.dev4.cypher`. Prefixo de rota: `/api/v1`.
- **Imports de teste do Spring Boot 4** — os pacotes mudaram em relação ao Boot 3, e o código de E1 já usa os novos. Use exatamente estes:
  - `org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest`
  - `org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc`
  - `org.springframework.boot.test.context.SpringBootTest`
- **`id` é o nome do campo no fio, não `codigo`.** A spec escreve as rotas como `{codigo}`; o plano usa `{id}`. Motivo: `StationResponse` e `CameraResponse` já expõem `id`, e o front entregue em E1-C lê `camera.id`. Renomear o campo quebraria o front sem ganho nenhum — "código" continua sendo o conceito, `id` continua sendo o nome. A única exceção é `CameraConfigResponse.codigo`, que é contrato novo e não tem consumidor antigo.
- **O código é imutável** (spec §4). `PUT` com `id` no corpo diferente do da URL responde `409`.
- **Ingestão permissiva, cadastro estrito** (spec §5.3). Nada neste plano pode fazer `POST /incidents` recusar câmera desconhecida.
- **Testes nunca escrevem no banco de desenvolvimento** — `src/test/resources/application.yaml` já aponta para H2 em memória.
- **Maven offline:** `./mvnw -o`.
- **Não use `curl ... | interpretador`.** Um hook do ambiente bloqueia pipe de download para intérprete. Para inspecionar JSON, grave com `-o` e rode o formatador sobre o arquivo.
- **Commits:** um por tarefa, em português, formato `tipo(escopo): descrição`.

---

## Estrutura de arquivos

```
src/main/java/com/dev4/cypher/
├── model/
│   ├── Camera.java                     MODIFICAR  + campo ativa
│   └── Estacao.java                    —          sem mudança
├── repository/
│   ├── CameraRepository.java           MODIFICAR  + findByAtivaTrue, findByStreamUrl
│   └── EstacaoRepository.java          MODIFICAR  + findByAtivaTrue
├── dto/
│   ├── StationRequest.java             CRIAR      escrita de estação
│   ├── CameraRequest.java              CRIAR      escrita de câmera
│   ├── CameraAdminResponse.java        CRIAR      item individual, COM fonte
│   ├── CameraConfigResponse.java       CRIAR      config do pipeline
│   ├── CameraResponse.java             —          lista, permanece sem fonte
│   └── StationResponse.java            —          sem mudança
├── catalog/
│   ├── CatalogCodes.java               CRIAR      regex do código e porta do stream
│   └── CatalogValidationException.java CRIAR      erro de negócio com status
├── service/
│   └── CatalogService.java             MODIFICAR  escrita, item, config
├── controller/
│   ├── CatalogController.java          MODIFICAR  escritas + item + config
│   └── CatalogExceptionHandler.java    CRIAR      traduz erro de negócio em status
└── config/
    ├── CatalogProperties.java          MODIFICAR  + ativa em CameraConfig
    └── CatalogSeeder.java              MODIFICAR  bootstrap em vez de upsert

src/test/java/com/dev4/cypher/
├── catalog/CatalogCodesTest.java             CRIAR
├── repository/CatalogRepositoryTest.java     MODIFICAR  construtor de Camera
├── service/CatalogWriteServiceTest.java      CRIAR
├── CatalogWriteApiTest.java                  CRIAR
├── CameraConfigApiTest.java                  CRIAR
├── CatalogSeederTest.java                    MODIFICAR  + caso de tabela populada
└── CatalogApiTest.java                       MODIFICAR  + regressão do soft delete
```

**Por que `catalog/` novo.** A validação de código e o erro de negócio são compartilhados por serviço e controller, e não pertencem a nenhum dos dois. Deixá-los no serviço obrigaria o handler de exceção a importar do serviço para saber traduzir status — acoplamento na direção errada.

---

## Task 1: Câmera ganha estado ativo

**Files:**
- Modify: `src/main/java/com/dev4/cypher/model/Camera.java`
- Modify: `src/main/java/com/dev4/cypher/repository/CameraRepository.java`
- Modify: `src/main/java/com/dev4/cypher/repository/EstacaoRepository.java`
- Modify: `src/main/java/com/dev4/cypher/config/CatalogProperties.java`
- Modify: `src/main/java/com/dev4/cypher/config/CatalogSeeder.java`
- Test: `src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java`

**Interfaces:**
- Consumes: `Camera`, `Estacao`, repositórios (E1-A).
- Produces:
  - `Camera(String id, String nome, String estacaoId, String streamUrl, String fonte, boolean ativa)` — construtor de **6** argumentos.
  - `CameraRepository.findByAtivaTrue() -> List<Camera>`, `findByEstacaoIdAndAtivaTrue(String) -> List<Camera>`, `findByStreamUrl(String) -> Optional<Camera>`.
  - `EstacaoRepository.findByAtivaTrue() -> List<Estacao>`.
  - `CatalogProperties.CameraConfig.isAtiva()`.

`Estacao` já tem `ativa`; `Camera` não. Sem esse campo não existe soft delete de câmera, e apagar de verdade deixaria incidentes apontando para código inexistente (spec §5.3).

**Atenção:** o `@AllArgsConstructor` de `Camera` passa de 5 para 6 argumentos. Dois lugares existentes o chamam e vão parar de compilar — `CatalogSeeder` e `CatalogRepositoryTest`. Os dois são corrigidos nesta tarefa.

- [ ] **Step 1: Escrever o teste que falha**

Substituir `src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Camera;
import com.dev4.cypher.model.Estacao;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

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
                "http://127.0.0.1:8090/stream", "rtsp://cam1/stream", true));
        cameras.save(new Camera("CAM-02", "Lateral", "EST-01",
                "http://127.0.0.1:8091/stream", "rtsp://cam2/stream", true));
        cameras.saveAndFlush(new Camera("CAM-03", "Expedicao", "EST-02",
                "http://127.0.0.1:8092/stream", "0", true));

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

    @Test
    void listaApenasCamerasAtivas() {
        cameras.save(new Camera("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://cam1/stream", true));
        cameras.saveAndFlush(new Camera("CAM-02", "Desativada", "EST-01",
                "http://127.0.0.1:8091/stream", "rtsp://cam2/stream", false));

        assertThat(cameras.findByAtivaTrue()).extracting(Camera::getId)
                .containsExactly("CAM-01");
    }

    @Test
    void listaCamerasAtivasDeUmaEstacao() {
        cameras.save(new Camera("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://a", true));
        cameras.save(new Camera("CAM-02", "Inativa", "EST-01",
                "http://127.0.0.1:8091/stream", "rtsp://b", false));
        cameras.saveAndFlush(new Camera("CAM-03", "Outra estacao", "EST-02",
                "http://127.0.0.1:8092/stream", "rtsp://c", true));

        assertThat(cameras.findByEstacaoIdAndAtivaTrue("EST-01"))
                .extracting(Camera::getId).containsExactly("CAM-01");
    }

    @Test
    void encontraCameraPelaUrlDeStream() {
        cameras.saveAndFlush(new Camera("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://a", true));

        assertThat(cameras.findByStreamUrl("http://127.0.0.1:8090/stream"))
                .isPresent();
        assertThat(cameras.findByStreamUrl("http://127.0.0.1:9999/stream"))
                .isEmpty();
    }

    @Test
    void listaApenasEstacoesAtivas() {
        estacoes.save(new Estacao("EST-01", "Ativa", "montagem", true));
        estacoes.saveAndFlush(new Estacao("EST-02", "Inativa", "montagem", false));

        assertThat(estacoes.findByAtivaTrue()).extracting(Estacao::getId)
                .containsExactly("EST-01");
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogRepositoryTest
```

Esperado: FALHA de compilação — construtor de `Camera` não aceita 6 argumentos, e `findByAtivaTrue` não existe.

- [ ] **Step 3: Implementar o mínimo**

Em `src/main/java/com/dev4/cypher/model/Camera.java`, acrescentar o campo ao final da classe, depois de `fonte`:

```java
    /**
     * Câmera em operação. Desativar tira do heatmap e do seletor de feed sem
     * apagar o histórico: não há chave estrangeira entre incidente e câmera,
     * então apagar de verdade deixaria incidentes órfãos.
     */
    @Column(nullable = false)
    private boolean ativa;
```

Substituir `src/main/java/com/dev4/cypher/repository/CameraRepository.java`:

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
}
```

Substituir `src/main/java/com/dev4/cypher/repository/EstacaoRepository.java`:

```java
package com.dev4.cypher.repository;

import com.dev4.cypher.model.Estacao;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EstacaoRepository extends JpaRepository<Estacao, String> {

    List<Estacao> findByAtivaTrue();
}
```

Em `src/main/java/com/dev4/cypher/config/CatalogProperties.java`, dentro da classe interna `CameraConfig`, acrescentar o campo:

```java
        private boolean ativa = true;
```

Em `src/main/java/com/dev4/cypher/config/CatalogSeeder.java`, o `forEach` de câmeras passa a informar o novo argumento:

```java
        properties.getCameras().forEach(cfg ->
                cameras.save(new Camera(cfg.getId(), cfg.getNome(), cfg.getEstacaoId(),
                        cfg.getStreamUrl(), cfg.getFonte(), cfg.isAtiva())));
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogRepositoryTest
```

Esperado: PASSA, 6 testes.

- [ ] **Step 5: Confirmar que nada de E1 quebrou**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test
```

Esperado: PASSA — toda a suíte de E1-A continua verde. O default `ativa = true` em `CameraConfig` é o que mantém `CatalogApiTest` e `SummaryApiTest` inalterados.

- [ ] **Step 6: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/model/Camera.java \
        src/main/java/com/dev4/cypher/repository/CameraRepository.java \
        src/main/java/com/dev4/cypher/repository/EstacaoRepository.java \
        src/main/java/com/dev4/cypher/config/CatalogProperties.java \
        src/main/java/com/dev4/cypher/config/CatalogSeeder.java \
        src/test/java/com/dev4/cypher/repository/CatalogRepositoryTest.java
git commit -m "feat(model): camera ganha estado ativo para desativacao sem perda de historico"
```

---

## Task 2: Validação de código e DTOs de escrita

**Files:**
- Create: `src/main/java/com/dev4/cypher/catalog/CatalogCodes.java`
- Create: `src/main/java/com/dev4/cypher/catalog/CatalogValidationException.java`
- Create: `src/main/java/com/dev4/cypher/dto/StationRequest.java`
- Create: `src/main/java/com/dev4/cypher/dto/CameraRequest.java`
- Test: `src/test/java/com/dev4/cypher/catalog/CatalogCodesTest.java`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `CatalogCodes.PADRAO` = `"^[A-Z0-9]{2,10}-[A-Z0-9]{1,8}$"`.
  - `CatalogCodes.valido(String) -> boolean`.
  - `CatalogCodes.portaDe(String streamUrl) -> int` — lança `CatalogValidationException` se a URL não tiver porta explícita.
  - `CatalogValidationException(HttpStatus status, String mensagem)`, com `getStatus()`.
  - `StationRequest(String id, String nome, String setor, Boolean ativa)`.
  - `CameraRequest(String id, String nome, String estacaoId, String streamUrl, String fonte, Boolean ativa)`.

`ativa` é `Boolean` e não `boolean` nos requests de propósito: `null` significa "não mexer", que é o que permite `PUT` parcial sem reativar câmera por acidente.

A porta explícita é exigida porque `streamPort` é derivado da URL (spec §5.5). Sem a regra, `http://host/stream` teria de virar porta 80 por convenção, que não é onde o MJPEG serve.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/catalog/CatalogCodesTest.java`:

```java
package com.dev4.cypher.catalog;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CatalogCodesTest {

    @ParameterizedTest
    @ValueSource(strings = {"EST-01", "CAM-01", "GALPAO1-A", "AB-1", "ABCDEFGHIJ-12345678"})
    void aceitaCodigosBemFormados(String codigo) {
        assertThat(CatalogCodes.valido(codigo)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "est-01",        // minúscula
            "EST01",         // sem hífen
            "EST-",          // sufixo vazio
            "-01",           // prefixo vazio
            "E-1",           // prefixo curto demais
            "EST_01",        // separador errado
            "EST-01-A",      // dois hífens
            "ABCDEFGHIJK-1", // prefixo longo demais
            "EST-123456789", // sufixo longo demais
            "EST 01",        // espaço
    })
    void recusaCodigosMalFormados(String codigo) {
        assertThat(CatalogCodes.valido(codigo)).isFalse();
    }

    @Test
    void recusaCodigoNulo() {
        assertThat(CatalogCodes.valido(null)).isFalse();
    }

    @Test
    void extraiPortaExplicitaDaUrlDeStream() {
        assertThat(CatalogCodes.portaDe("http://127.0.0.1:8090/stream")).isEqualTo(8090);
        assertThat(CatalogCodes.portaDe("http://camera.local:9000/mjpeg")).isEqualTo(9000);
    }

    @Test
    void exigePortaExplicita() {
        assertThatThrownBy(() -> CatalogCodes.portaDe("http://127.0.0.1/stream"))
                .isInstanceOf(CatalogValidationException.class)
                .hasMessageContaining("porta");
    }

    @Test
    void recusaUrlIlegivel() {
        assertThatThrownBy(() -> CatalogCodes.portaDe("nao e uma url"))
                .isInstanceOf(CatalogValidationException.class);
    }

    @Test
    void erroDeValidacaoCarregaOStatusQueOClienteDeveVer() {
        CatalogValidationException erro =
                new CatalogValidationException(HttpStatus.CONFLICT, "duplicado");

        assertThat(erro.getStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(erro.getMessage()).isEqualTo("duplicado");
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogCodesTest
```

Esperado: FALHA de compilação — `CatalogCodes` e `CatalogValidationException` não existem.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/catalog/CatalogValidationException.java`:

```java
package com.dev4.cypher.catalog;

import org.springframework.http.HttpStatus;

/**
 * Erro de negócio do cadastro, carregando o status que o cliente deve ver.
 *
 * <p>Existe para que o serviço decida o significado (duplicado é 409, estação
 * inexistente é 422) sem que o controller precise reinterpretar mensagens.
 */
public class CatalogValidationException extends RuntimeException {

    private final HttpStatus status;

    public CatalogValidationException(HttpStatus status, String mensagem) {
        super(mensagem);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
```

Criar `src/main/java/com/dev4/cypher/catalog/CatalogCodes.java`:

```java
package com.dev4.cypher.catalog;

import org.springframework.http.HttpStatus;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.regex.Pattern;

/**
 * Regras de forma do catálogo, compartilhadas por serviço e controller.
 *
 * <p>O código corresponde a algo físico — placa na estação, etiqueta na
 * câmera — e é imutável depois de criado, porque está embutido no
 * {@code incidentKey} de todo incidente já gravado.
 */
public final class CatalogCodes {

    /** Maiúsculas e dígitos, um hífen obrigatório, 4 a 19 caracteres. */
    public static final String PADRAO = "^[A-Z0-9]{2,10}-[A-Z0-9]{1,8}$";

    private static final Pattern COMPILADO = Pattern.compile(PADRAO);

    private CatalogCodes() {
    }

    public static boolean valido(String codigo) {
        return codigo != null && COMPILADO.matcher(codigo).matches();
    }

    /**
     * Porta em que o pipeline deve servir o MJPEG, extraída do streamUrl.
     *
     * <p>A porta explícita é exigida para que a derivação seja inequívoca: o
     * MJPEG não serve em 80 nem em 443, então cair na porta default do esquema
     * produziria uma config silenciosamente errada.
     */
    public static int portaDe(String streamUrl) {
        if (streamUrl == null) {
            throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "streamUrl e obrigatoria");
        }
        URI uri;
        try {
            uri = new URI(streamUrl);
        } catch (URISyntaxException e) {
            throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "streamUrl nao e uma URL valida: " + streamUrl);
        }
        int porta = uri.getPort();
        if (porta == -1) {
            throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "streamUrl precisa de porta explicita, ex.: http://127.0.0.1:8090/stream");
        }
        return porta;
    }
}
```

Criar `src/main/java/com/dev4/cypher/dto/StationRequest.java`:

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.catalog.CatalogCodes;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Escrita de estação.
 *
 * <p>{@code ativa} é {@code Boolean} e não {@code boolean}: {@code null}
 * significa "não mexer", que é o que permite um PUT parcial sem reativar por
 * acidente. Reativar é justamente enviar {@code true}.
 */
public record StationRequest(

        @NotBlank
        @Pattern(regexp = CatalogCodes.PADRAO,
                message = "codigo deve ser MAIUSCULAS-ALFANUM, ex.: EST-01")
        String id,

        @NotBlank @Size(max = 120) String nome,
        @Size(max = 120) String setor,
        Boolean ativa
) {
}
```

Criar `src/main/java/com/dev4/cypher/dto/CameraRequest.java`:

```java
package com.dev4.cypher.dto;

import com.dev4.cypher.catalog.CatalogCodes;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Escrita de câmera.
 *
 * <p>{@code fonte} guarda placeholders, nunca segredo: o pipeline expande
 * {@code ${VAR}} do próprio ambiente (spec §3).
 */
public record CameraRequest(

        @NotBlank
        @Pattern(regexp = CatalogCodes.PADRAO,
                message = "codigo deve ser MAIUSCULAS-ALFANUM, ex.: CAM-01")
        String id,

        @NotBlank @Size(max = 120) String nome,
        @NotBlank String estacaoId,
        @NotBlank @Size(max = 500) String streamUrl,
        @Size(max = 500) String fonte,
        Boolean ativa
) {
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogCodesTest
```

Esperado: PASSA, 20 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/catalog/ \
        src/main/java/com/dev4/cypher/dto/StationRequest.java \
        src/main/java/com/dev4/cypher/dto/CameraRequest.java \
        src/test/java/com/dev4/cypher/catalog/CatalogCodesTest.java
git commit -m "feat(catalog): validacao de codigo, porta de stream e erro de negocio tipado"
```

---

## Task 3: Escrita de estação no serviço

**Files:**
- Modify: `src/main/java/com/dev4/cypher/service/CatalogService.java`
- Test: `src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java`

**Interfaces:**
- Consumes: `StationRequest` (Task 2), repositórios (Task 1), `CatalogValidationException`.
- Produces:
  - `CatalogService.createStation(StationRequest) -> StationResponse`
  - `CatalogService.updateStation(String id, StationRequest) -> Optional<StationResponse>`
  - `CatalogService.deactivateStation(String id) -> boolean`
  - `CatalogService.stations()` passa a devolver **somente ativas**, com câmeras ativas.
  - `CatalogService.stations(boolean incluirInativas) -> List<StationResponse>`
  - `CatalogService.cameras()` passa a devolver **somente ativas**.

`stations()` filtrar inativas é o que faz a estação desativada sair do heatmap: o `SummaryService` monta as células a partir desse método, então o comportamento vem de graça.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.catalog.CatalogValidationException;
import com.dev4.cypher.dto.StationRequest;
import com.dev4.cypher.dto.StationResponse;
import com.dev4.cypher.model.Camera;
import com.dev4.cypher.repository.CameraRepository;
import com.dev4.cypher.repository.EstacaoRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.http.HttpStatus;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
class CatalogWriteServiceTest {

    @Autowired
    private EstacaoRepository estacoes;

    @Autowired
    private CameraRepository cameras;

    private CatalogService service;

    @BeforeEach
    void setUp() {
        service = new CatalogService(estacoes, cameras);
    }

    private StationRequest esteira() {
        return new StationRequest("EST-01", "Esteira de montagem", "montagem", null);
    }

    @Test
    void cadastraEstacaoAtivaPorDefault() {
        StationResponse criada = service.createStation(esteira());

        assertThat(criada.id()).isEqualTo("EST-01");
        assertThat(criada.nome()).isEqualTo("Esteira de montagem");
        assertThat(criada.setor()).isEqualTo("montagem");
        assertThat(criada.ativa()).isTrue();
        assertThat(criada.cameras()).isEmpty();
    }

    @Test
    void recusaCodigoDuplicado() {
        service.createStation(esteira());

        assertThatThrownBy(() -> service.createStation(esteira()))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void editaNomeESetor() {
        service.createStation(esteira());

        Optional<StationResponse> editada = service.updateStation("EST-01",
                new StationRequest("EST-01", "Esteira 1", "montagem final", null));

        assertThat(editada).isPresent();
        assertThat(editada.get().nome()).isEqualTo("Esteira 1");
        assertThat(editada.get().setor()).isEqualTo("montagem final");
    }

    @Test
    void recusaTentativaDeRenomearOCodigo() {
        service.createStation(esteira());

        assertThatThrownBy(() -> service.updateStation("EST-01",
                new StationRequest("EST-99", "Esteira", "montagem", null)))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void editarEstacaoInexistenteDevolveVazio() {
        assertThat(service.updateStation("EST-99",
                new StationRequest("EST-99", "X", null, null))).isEmpty();
    }

    @Test
    void ativaNuloNaoMexeNoEstado() {
        service.createStation(esteira());
        service.deactivateStation("EST-01");

        service.updateStation("EST-01",
                new StationRequest("EST-01", "Esteira", "montagem", null));

        assertThat(estacoes.findById("EST-01").orElseThrow().isAtiva()).isFalse();
    }

    @Test
    void reativarEhUmPutComAtivaVerdadeira() {
        service.createStation(esteira());
        service.deactivateStation("EST-01");

        service.updateStation("EST-01",
                new StationRequest("EST-01", "Esteira", "montagem", true));

        assertThat(estacoes.findById("EST-01").orElseThrow().isAtiva()).isTrue();
    }

    @Test
    void desativarNaoApaga() {
        service.createStation(esteira());

        assertThat(service.deactivateStation("EST-01")).isTrue();

        assertThat(estacoes.findById("EST-01")).isPresent();
        assertThat(estacoes.findById("EST-01").orElseThrow().isAtiva()).isFalse();
    }

    @Test
    void desativarInexistenteDevolveFalso() {
        assertThat(service.deactivateStation("EST-99")).isFalse();
    }

    @Test
    void listaPadraoOmiteEstacaoDesativada() {
        service.createStation(esteira());
        service.createStation(new StationRequest("EST-02", "Prensa", "estamparia", null));
        service.deactivateStation("EST-02");

        assertThat(service.stations()).extracting(StationResponse::id)
                .containsExactly("EST-01");
        assertThat(service.stations(true)).extracting(StationResponse::id)
                .containsExactlyInAnyOrder("EST-01", "EST-02");
    }

    @Test
    void estacaoAtivaNaoMostraCameraDesativada() {
        service.createStation(esteira());
        cameras.save(new Camera("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://a", true));
        cameras.saveAndFlush(new Camera("CAM-02", "Antiga", "EST-01",
                "http://127.0.0.1:8091/stream", "rtsp://b", false));

        StationResponse estacao = service.stations().get(0);

        assertThat(estacao.cameras()).hasSize(1);
        assertThat(estacao.cameras().get(0).id()).isEqualTo("CAM-01");
    }

    @Test
    void listaDeCamerasOmiteDesativadas() {
        cameras.save(new Camera("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://a", true));
        cameras.saveAndFlush(new Camera("CAM-02", "Antiga", "EST-01",
                "http://127.0.0.1:8091/stream", "rtsp://b", false));

        assertThat(service.cameras()).hasSize(1);
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogWriteServiceTest
```

Esperado: FALHA de compilação — `createStation` não existe.

- [ ] **Step 3: Implementar o mínimo**

Substituir `src/main/java/com/dev4/cypher/service/CatalogService.java`:

```java
package com.dev4.cypher.service;

import com.dev4.cypher.catalog.CatalogValidationException;
import com.dev4.cypher.dto.CameraResponse;
import com.dev4.cypher.dto.StationRequest;
import com.dev4.cypher.dto.StationResponse;
import com.dev4.cypher.model.Camera;
import com.dev4.cypher.model.Estacao;
import com.dev4.cypher.repository.CameraRepository;
import com.dev4.cypher.repository.EstacaoRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Catálogo de lugar: estações e as câmeras que as cobrem.
 *
 * <p>As listas devolvem apenas registros ativos, o que é o que faz uma estação
 * desativada sair do heatmap — o {@code SummaryService} monta as células a
 * partir daqui.
 */
@Service
public class CatalogService {

    private final EstacaoRepository estacoes;
    private final CameraRepository cameras;

    public CatalogService(EstacaoRepository estacoes, CameraRepository cameras) {
        this.estacoes = estacoes;
        this.cameras = cameras;
    }

    // ------------------------------------------------------------------
    // Leitura
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<CameraResponse> cameras() {
        return cameras.findByAtivaTrue().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<StationResponse> stations() {
        return stations(false);
    }

    @Transactional(readOnly = true)
    public List<StationResponse> stations(boolean incluirInativas) {
        List<Estacao> base = incluirInativas ? estacoes.findAll() : estacoes.findByAtivaTrue();
        return base.stream().map(this::toResponse).toList();
    }

    // ------------------------------------------------------------------
    // Escrita de estação
    // ------------------------------------------------------------------

    @Transactional
    public StationResponse createStation(StationRequest req) {
        if (estacoes.existsById(req.id())) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "Estacao ja cadastrada: " + req.id());
        }
        Estacao nova = new Estacao(req.id(), req.nome(), req.setor(),
                req.ativa() == null || req.ativa());
        return toResponse(estacoes.saveAndFlush(nova));
    }

    @Transactional
    public Optional<StationResponse> updateStation(String id, StationRequest req) {
        exigirMesmoCodigo(id, req.id(), "estacao");
        return estacoes.findById(id).map(estacao -> {
            estacao.setNome(req.nome());
            estacao.setSetor(req.setor());
            // ativa nulo significa "nao mexer": evita reativar por acidente
            // num PUT que so queria corrigir o nome.
            if (req.ativa() != null) {
                estacao.setAtiva(req.ativa());
            }
            return toResponse(estacoes.saveAndFlush(estacao));
        });
    }

    @Transactional
    public boolean deactivateStation(String id) {
        return estacoes.findById(id).map(estacao -> {
            estacao.setAtiva(false);
            estacoes.saveAndFlush(estacao);
            return true;
        }).orElse(false);
    }

    // ------------------------------------------------------------------
    // Interno
    // ------------------------------------------------------------------

    /**
     * O código é imutável: está embutido no incidentKey de todo incidente já
     * gravado, então renomear reescreveria histórico.
     */
    void exigirMesmoCodigo(String naUrl, String noCorpo, String entidade) {
        if (noCorpo != null && !noCorpo.equals(naUrl)) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "O codigo de %s e imutavel: %s nao pode virar %s"
                            .formatted(entidade, naUrl, noCorpo));
        }
    }

    private StationResponse toResponse(Estacao e) {
        return new StationResponse(e.getId(), e.getNome(), e.getSetor(), e.isAtiva(),
                cameras.findByEstacaoIdAndAtivaTrue(e.getId()).stream()
                        .map(this::toResponse).toList());
    }

    private CameraResponse toResponse(Camera c) {
        return new CameraResponse(c.getId(), c.getNome(), c.getEstacaoId(), c.getStreamUrl());
    }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogWriteServiceTest
```

Esperado: PASSA, 12 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/service/CatalogService.java \
        src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java
git commit -m "feat(service): escrita de estacao com codigo imutavel e desativacao"
```

---

## Task 4: Escrita de câmera no serviço

**Files:**
- Modify: `src/main/java/com/dev4/cypher/service/CatalogService.java`
- Create: `src/main/java/com/dev4/cypher/dto/CameraAdminResponse.java`
- Modify: `src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java`

**Interfaces:**
- Consumes: `CameraRequest`, `CatalogCodes.portaDe` (Task 2), tudo da Task 3.
- Produces:
  - `CameraAdminResponse(String id, String nome, String estacaoId, String streamUrl, String fonte, boolean ativa)`.
  - `CatalogService.createCamera(CameraRequest) -> CameraAdminResponse`
  - `CatalogService.updateCamera(String id, CameraRequest) -> Optional<CameraAdminResponse>`
  - `CatalogService.deactivateCamera(String id) -> boolean`
  - `CatalogService.camera(String id) -> Optional<CameraAdminResponse>` — responde também para câmera desativada.

Câmera exige estação existente (`422`). Isso não contradiz a permissividade da ingestão: ingestão nunca pode perder dado, cadastro é ação humana deliberada onde falhar rápido é o certo (spec §5.3).

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java`, com os imports novos no topo — `com.dev4.cypher.dto.CameraAdminResponse` e `com.dev4.cypher.dto.CameraRequest`:

```java
    private CameraRequest frontal() {
        return new CameraRequest("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream",
                "rtsp://${CAM01_USER}:${CAM01_PASS}@10.0.0.7/stream", null);
    }

    @Test
    void cadastraCameraNaEstacaoExistente() {
        service.createStation(esteira());

        CameraAdminResponse criada = service.createCamera(frontal());

        assertThat(criada.id()).isEqualTo("CAM-01");
        assertThat(criada.estacaoId()).isEqualTo("EST-01");
        assertThat(criada.ativa()).isTrue();
        assertThat(criada.fonte()).contains("${CAM01_USER}");
    }

    @Test
    void recusaCameraDeEstacaoInexistente() {
        assertThatThrownBy(() -> service.createCamera(frontal()))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
    }

    @Test
    void recusaCodigoDeCameraDuplicado() {
        service.createStation(esteira());
        service.createCamera(frontal());

        assertThatThrownBy(() -> service.createCamera(frontal()))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void recusaStreamUrlDuplicada() {
        service.createStation(esteira());
        service.createCamera(frontal());

        assertThatThrownBy(() -> service.createCamera(new CameraRequest(
                "CAM-02", "Lateral", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://outra", null)))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void recusaStreamUrlSemPortaExplicita() {
        service.createStation(esteira());

        assertThatThrownBy(() -> service.createCamera(new CameraRequest(
                "CAM-02", "Lateral", "EST-01",
                "http://127.0.0.1/stream", "rtsp://x", null)))
                .isInstanceOf(CatalogValidationException.class)
                .satisfies(e -> assertThat(((CatalogValidationException) e).getStatus())
                        .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
    }

    @Test
    void recusaRenomearCodigoDeCamera() {
        service.createStation(esteira());
        service.createCamera(frontal());

        assertThatThrownBy(() -> service.updateCamera("CAM-01", new CameraRequest(
                "CAM-99", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://x", null)))
                .isInstanceOf(CatalogValidationException.class);
    }

    @Test
    void editaCameraMantendoAMesmaUrl() {
        service.createStation(esteira());
        service.createCamera(frontal());

        Optional<CameraAdminResponse> editada = service.updateCamera("CAM-01",
                new CameraRequest("CAM-01", "Frontal HD", "EST-01",
                        "http://127.0.0.1:8090/stream", "rtsp://nova", null));

        assertThat(editada).isPresent();
        assertThat(editada.get().nome()).isEqualTo("Frontal HD");
        assertThat(editada.get().fonte()).isEqualTo("rtsp://nova");
    }

    @Test
    void desativarCameraNaoApagaEContinuaVisivelPorId() {
        service.createStation(esteira());
        service.createCamera(frontal());

        assertThat(service.deactivateCamera("CAM-01")).isTrue();

        // A câmera precisa continuar visível para poder ser reativada.
        assertThat(service.camera("CAM-01")).isPresent();
        assertThat(service.camera("CAM-01").orElseThrow().ativa()).isFalse();
        assertThat(service.cameras()).isEmpty();
    }

    @Test
    void reativarCameraEhUmPutComAtivaVerdadeira() {
        service.createStation(esteira());
        service.createCamera(frontal());
        service.deactivateCamera("CAM-01");

        service.updateCamera("CAM-01", new CameraRequest("CAM-01", "Frontal", "EST-01",
                "http://127.0.0.1:8090/stream", "rtsp://x", true));

        assertThat(service.cameras()).extracting(c -> c.id()).containsExactly("CAM-01");
    }

    @Test
    void cameraInexistenteDevolveVazio() {
        assertThat(service.camera("CAM-99")).isEmpty();
        assertThat(service.deactivateCamera("CAM-99")).isFalse();
    }
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogWriteServiceTest
```

Esperado: FALHA de compilação — `createCamera` e `CameraAdminResponse` não existem.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/dto/CameraAdminResponse.java`:

```java
package com.dev4.cypher.dto;

/**
 * Câmera na superfície de administração — inclui {@code fonte}, que a lista
 * de navegação omite.
 *
 * <p>A fonte carrega placeholders, não segredo, mas revela topologia interna
 * (host, nomes de variável) que o dashboard não tem uso para. Separar as duas
 * representações é a fronteira que E4 vai proteger.
 */
public record CameraAdminResponse(
        String id,
        String nome,
        String estacaoId,
        String streamUrl,
        String fonte,
        boolean ativa
) {
}
```

Acrescentar a `src/main/java/com/dev4/cypher/service/CatalogService.java` os imports `com.dev4.cypher.catalog.CatalogCodes`, `com.dev4.cypher.dto.CameraAdminResponse` e `com.dev4.cypher.dto.CameraRequest`, mais os métodos:

```java
    @Transactional(readOnly = true)
    public Optional<CameraAdminResponse> camera(String id) {
        // Responde também para câmera desativada: é preciso poder vê-la para
        // reativá-la. Quem filtra por ativa é a lista, não o item.
        return cameras.findById(id).map(this::toAdminResponse);
    }

    @Transactional
    public CameraAdminResponse createCamera(CameraRequest req) {
        if (cameras.existsById(req.id())) {
            throw new CatalogValidationException(HttpStatus.CONFLICT,
                    "Camera ja cadastrada: " + req.id());
        }
        exigirEstacao(req.estacaoId());
        exigirUrlLivre(req.streamUrl(), req.id());
        CatalogCodes.portaDe(req.streamUrl());

        Camera nova = new Camera(req.id(), req.nome(), req.estacaoId(),
                req.streamUrl(), req.fonte(), req.ativa() == null || req.ativa());
        return toAdminResponse(cameras.saveAndFlush(nova));
    }

    @Transactional
    public Optional<CameraAdminResponse> updateCamera(String id, CameraRequest req) {
        exigirMesmoCodigo(id, req.id(), "camera");
        return cameras.findById(id).map(camera -> {
            exigirEstacao(req.estacaoId());
            exigirUrlLivre(req.streamUrl(), id);
            CatalogCodes.portaDe(req.streamUrl());

            camera.setNome(req.nome());
            camera.setEstacaoId(req.estacaoId());
            camera.setStreamUrl(req.streamUrl());
            camera.setFonte(req.fonte());
            if (req.ativa() != null) {
                camera.setAtiva(req.ativa());
            }
            return toAdminResponse(cameras.saveAndFlush(camera));
        });
    }

    @Transactional
    public boolean deactivateCamera(String id) {
        return cameras.findById(id).map(camera -> {
            camera.setAtiva(false);
            cameras.saveAndFlush(camera);
            return true;
        }).orElse(false);
    }

    /**
     * Cadastro é estrito onde a ingestão é permissiva: um incidente de câmera
     * desconhecida é aceito (nunca perder dado), mas cadastrar câmera de
     * estação inexistente falha rápido, porque é ação humana deliberada.
     */
    private void exigirEstacao(String estacaoId) {
        if (!estacoes.existsById(estacaoId)) {
            throw new CatalogValidationException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Estacao inexistente: " + estacaoId);
        }
    }

    /**
     * Duas câmeras com o mesmo streamUrl fariam dois pipelines disputar o
     * mesmo bind, e um deles morreria no boot.
     */
    private void exigirUrlLivre(String streamUrl, String idPropria) {
        cameras.findByStreamUrl(streamUrl)
                .filter(outra -> !outra.getId().equals(idPropria))
                .ifPresent(outra -> {
                    throw new CatalogValidationException(HttpStatus.CONFLICT,
                            "streamUrl ja usada pela camera " + outra.getId());
                });
    }

    private CameraAdminResponse toAdminResponse(Camera c) {
        return new CameraAdminResponse(c.getId(), c.getNome(), c.getEstacaoId(),
                c.getStreamUrl(), c.getFonte(), c.isAtiva());
    }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogWriteServiceTest
```

Esperado: PASSA, 22 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/service/CatalogService.java \
        src/main/java/com/dev4/cypher/dto/CameraAdminResponse.java \
        src/test/java/com/dev4/cypher/service/CatalogWriteServiceTest.java
git commit -m "feat(service): escrita de camera com integridade referencial e url unica"
```

---

## Task 5: Rotas de escrita do catálogo

**Files:**
- Modify: `src/main/java/com/dev4/cypher/controller/CatalogController.java`
- Create: `src/main/java/com/dev4/cypher/controller/CatalogExceptionHandler.java`
- Test: `src/test/java/com/dev4/cypher/CatalogWriteApiTest.java`

**Interfaces:**
- Consumes: `CatalogService` (Tasks 3–4), `StationRequest`, `CameraRequest`.
- Produces:
  - `POST /api/v1/stations` → `201`; `PUT /api/v1/stations/{id}` → `200`/`404`; `DELETE` → `204`/`404`.
  - `POST /api/v1/cameras` → `201`; `GET /api/v1/cameras/{id}` → `200`/`404`; `PUT` → `200`/`404`; `DELETE` → `204`/`404`.
  - `GET /api/v1/stations?incluirInativas=true`.
  - `CatalogExceptionHandler` traduzindo `CatalogValidationException` no status que ela carrega, com corpo `{"erro": "<mensagem>"}`.

O corpo de erro tem uma chave só porque o front precisa exibir a mensagem ao gestor: `409` e `422` sem texto viram "algo deu errado", que é falha silenciosa com outra roupa.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/CatalogWriteApiTest.java`:

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
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class CatalogWriteApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private EstacaoRepository estacoes;

    @Autowired
    private CameraRepository cameras;

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
    void limpar() {
        cameras.deleteAll();
        estacoes.deleteAll();
    }

    @Test
    void cadastraEstacaoEDevolve201() throws Exception {
        mvc.perform(post("/api/v1/stations")
                        .contentType(MediaType.APPLICATION_JSON).content(ESTACAO))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("EST-77"))
                .andExpect(jsonPath("$.ativa").value(true));
    }

    @Test
    void recusaCodigoComFormatoInvalido() throws Exception {
        mvc.perform(post("/api/v1/stations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\": \"est_77\", \"nome\": \"X\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void codigoDuplicadoDevolve409ComMensagem() throws Exception {
        mvc.perform(post("/api/v1/stations")
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));

        mvc.perform(post("/api/v1/stations")
                        .contentType(MediaType.APPLICATION_JSON).content(ESTACAO))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.erro").value(Matchers.containsString("EST-77")));
    }

    @Test
    void editaEstacao() throws Exception {
        mvc.perform(post("/api/v1/stations")
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));

        mvc.perform(put("/api/v1/stations/EST-77")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\": \"EST-77\", \"nome\": \"Esteira 1\", \"setor\": \"final\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nome").value("Esteira 1"));
    }

    @Test
    void renomearCodigoDevolve409() throws Exception {
        mvc.perform(post("/api/v1/stations")
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));

        mvc.perform(put("/api/v1/stations/EST-77")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\": \"EST-88\", \"nome\": \"Esteira\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void editarEstacaoInexistenteDevolve404() throws Exception {
        mvc.perform(put("/api/v1/stations/EST-99")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\": \"EST-99\", \"nome\": \"X\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void desativaEstacaoEDevolve204() throws Exception {
        mvc.perform(post("/api/v1/stations")
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));

        mvc.perform(delete("/api/v1/stations/EST-77")).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/stations"))
                .andExpect(jsonPath("$[?(@.id=='EST-77')]").isEmpty());
        mvc.perform(get("/api/v1/stations").param("incluirInativas", "true"))
                .andExpect(jsonPath("$[?(@.id=='EST-77')].ativa").value(false));
    }

    @Test
    void cadastraCameraEDevolve201ComFonte() throws Exception {
        mvc.perform(post("/api/v1/stations")
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));

        mvc.perform(post("/api/v1/cameras")
                        .contentType(MediaType.APPLICATION_JSON).content(CAMERA))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("CAM-77"))
                .andExpect(jsonPath("$.fonte").value(Matchers.containsString("CAM77_USER")));
    }

    @Test
    void cameraDeEstacaoInexistenteDevolve422() throws Exception {
        mvc.perform(post("/api/v1/cameras")
                        .contentType(MediaType.APPLICATION_JSON).content(CAMERA))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.erro").value(Matchers.containsString("EST-77")));
    }

    @Test
    void itemIndividualTrazFonteMasAListaNao() throws Exception {
        mvc.perform(post("/api/v1/stations")
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));
        mvc.perform(post("/api/v1/cameras")
                .contentType(MediaType.APPLICATION_JSON).content(CAMERA));

        mvc.perform(get("/api/v1/cameras/CAM-77"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fonte").exists());

        mvc.perform(get("/api/v1/cameras"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].fonte").doesNotExist());
    }

    @Test
    void cameraDesativadaSaiDaListaMasContinuaAcessivelPorId() throws Exception {
        mvc.perform(post("/api/v1/stations")
                .contentType(MediaType.APPLICATION_JSON).content(ESTACAO));
        mvc.perform(post("/api/v1/cameras")
                .contentType(MediaType.APPLICATION_JSON).content(CAMERA));

        mvc.perform(delete("/api/v1/cameras/CAM-77")).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/cameras"))
                .andExpect(jsonPath("$[?(@.id=='CAM-77')]").isEmpty());
        mvc.perform(get("/api/v1/cameras/CAM-77"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativa").value(false));
    }

    @Test
    void cameraInexistenteDevolve404() throws Exception {
        mvc.perform(get("/api/v1/cameras/CAM-99")).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/cameras/CAM-99")).andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogWriteApiTest
```

Esperado: FALHA — `405`/`404` nas rotas de escrita, que ainda não existem.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/controller/CatalogExceptionHandler.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.catalog.CatalogValidationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/**
 * Traduz erro de negócio do cadastro no status que ele carrega.
 *
 * <p>O corpo traz a mensagem porque o gestor precisa ler o motivo: um 409 sem
 * texto vira "algo deu errado" na tela, que é falha silenciosa com outra roupa.
 */
@RestControllerAdvice
public class CatalogExceptionHandler {

    @ExceptionHandler(CatalogValidationException.class)
    public ResponseEntity<Map<String, String>> onValidation(CatalogValidationException e) {
        return ResponseEntity.status(e.getStatus()).body(Map.of("erro", e.getMessage()));
    }
}
```

Substituir `src/main/java/com/dev4/cypher/controller/CatalogController.java`:

```java
package com.dev4.cypher.controller;

import com.dev4.cypher.dto.CameraAdminResponse;
import com.dev4.cypher.dto.CameraRequest;
import com.dev4.cypher.dto.CameraResponse;
import com.dev4.cypher.dto.StationRequest;
import com.dev4.cypher.dto.StationResponse;
import com.dev4.cypher.service.CatalogService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class CatalogController {

    private final CatalogService service;

    public CatalogController(CatalogService service) {
        this.service = service;
    }

    // ---------------- navegação ----------------

    /** Lista consumida pelo dashboard: somente ativas, sem fonte. */
    @GetMapping("/cameras")
    public List<CameraResponse> cameras() {
        return service.cameras();
    }

    @GetMapping("/stations")
    public List<StationResponse> stations(
            @RequestParam(defaultValue = "false") boolean incluirInativas) {
        return service.stations(incluirInativas);
    }

    // ---------------- administração ----------------

    /** Item individual: inclui fonte e responde também para câmera desativada. */
    @GetMapping("/cameras/{id}")
    public ResponseEntity<CameraAdminResponse> camera(@PathVariable String id) {
        return service.camera(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/stations")
    public ResponseEntity<StationResponse> createStation(@Valid @RequestBody StationRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createStation(req));
    }

    @PutMapping("/stations/{id}")
    public ResponseEntity<StationResponse> updateStation(@PathVariable String id,
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

    @PostMapping("/cameras")
    public ResponseEntity<CameraAdminResponse> createCamera(@Valid @RequestBody CameraRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createCamera(req));
    }

    @PutMapping("/cameras/{id}")
    public ResponseEntity<CameraAdminResponse> updateCamera(@PathVariable String id,
                                                            @Valid @RequestBody CameraRequest req) {
        return service.updateCamera(id, req)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/cameras/{id}")
    public ResponseEntity<Void> deactivateCamera(@PathVariable String id) {
        return service.deactivateCamera(id)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogWriteApiTest
```

Esperado: PASSA, 12 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/controller/ \
        src/test/java/com/dev4/cypher/CatalogWriteApiTest.java
git commit -m "feat(api): rotas de escrita do catalogo e item individual com fonte"
```

---

## Task 6: Seeder vira bootstrap

**Files:**
- Modify: `src/main/java/com/dev4/cypher/config/CatalogSeeder.java`
- Modify: `src/test/java/com/dev4/cypher/CatalogSeederTest.java`

**Interfaces:**
- Consumes: `CatalogProperties`, repositórios.
- Produces: nenhuma interface nova — muda o comportamento no boot.

Este é o defeito que E2 introduziria sem correção: o seeder faz upsert a cada boot, então editar uma estação pela interface e reiniciar a aplicação desfaz a edição **em silêncio** (spec §5.4). A correção é popular somente quando a tabela está vazia.

- [ ] **Step 1: Escrever o teste que falha**

Substituir `src/test/java/com/dev4/cypher/CatalogSeederTest.java`:

```java
package com.dev4.cypher;

import com.dev4.cypher.config.CatalogSeeder;
import com.dev4.cypher.model.Camera;
import com.dev4.cypher.model.Estacao;
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

    @Autowired
    private CatalogSeeder seeder;

    @Test
    void populaCatalogoAPartirDaConfiguracao() {
        assertThat(estacoes.findById("EST-01")).isPresent();

        Camera cam = cameras.findById("CAM-01").orElseThrow();
        assertThat(cam.getEstacaoId()).isEqualTo("EST-01");
        assertThat(cam.getStreamUrl()).isEqualTo("http://127.0.0.1:8090/stream");
        assertThat(cam.isAtiva()).isTrue();
    }

    @Test
    void naoSobrescreveEdicaoFeitaPelaInterface() {
        // Simula o que a interface faria: renomear a estação semeada.
        Estacao editada = estacoes.findById("EST-01").orElseThrow();
        editada.setNome("Esteira 1 - renomeada");
        estacoes.saveAndFlush(editada);

        // Reiniciar a aplicação executaria o seeder de novo.
        seeder.run(null);

        assertThat(estacoes.findById("EST-01").orElseThrow().getNome())
                .isEqualTo("Esteira 1 - renomeada");
    }

    @Test
    void naoReativaRegistroQueAInterfaceDesativou() {
        Camera desativada = cameras.findById("CAM-01").orElseThrow();
        desativada.setAtiva(false);
        cameras.saveAndFlush(desativada);

        seeder.run(null);

        assertThat(cameras.findById("CAM-01").orElseThrow().isAtiva()).isFalse();
    }

    @Test
    void semearDeNovoNaoDuplica() {
        long estacoesAntes = estacoes.count();
        long camerasAntes = cameras.count();

        seeder.run(null);

        assertThat(estacoes.count()).isEqualTo(estacoesAntes);
        assertThat(cameras.count()).isEqualTo(camerasAntes);
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogSeederTest
```

Esperado: FALHA em `naoSobrescreveEdicaoFeitaPelaInterface` — o nome volta a "Esteira de montagem", porque o seeder faz upsert.

- [ ] **Step 3: Implementar o mínimo**

Em `src/main/java/com/dev4/cypher/config/CatalogSeeder.java`, acrescentar os imports do SLF4J e o campo de log:

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
```

```java
    private static final Logger log = LoggerFactory.getLogger(CatalogSeeder.class);
```

E substituir o método `run` inteiro:

```java
    /**
     * Bootstrap, não sincronização: popula somente quando a tabela está vazia.
     *
     * <p>Antes de E2 isto era upsert a cada boot, o que significa que — com o
     * cadastro pela interface existindo — editar uma estação e reiniciar a
     * aplicação desfaria a edição em silêncio.
     */
    @Override
    public void run(ApplicationArguments args) {
        if (estacoes.count() == 0) {
            properties.getStations().forEach(cfg ->
                    estacoes.save(new Estacao(cfg.getId(), cfg.getNome(), cfg.getSetor(),
                            cfg.isAtiva())));
            log.info("Catalogo: {} estacao(oes) semeada(s) da configuracao",
                    properties.getStations().size());
        } else {
            log.info("Catalogo: {} estacao(oes) ja no banco, configuracao ignorada",
                    estacoes.count());
        }

        if (cameras.count() == 0) {
            properties.getCameras().forEach(cfg ->
                    cameras.save(new Camera(cfg.getId(), cfg.getNome(), cfg.getEstacaoId(),
                            cfg.getStreamUrl(), cfg.getFonte(), cfg.isAtiva())));
            log.info("Catalogo: {} camera(s) semeada(s) da configuracao",
                    properties.getCameras().size());
        } else {
            log.info("Catalogo: {} camera(s) ja no banco, configuracao ignorada",
                    cameras.count());
        }

        // Assinaturas de webhook seguem por URL: são infraestrutura de
        // integração, não cadastro editável pela interface.
        properties.getWebhooks().forEach(cfg -> {
            boolean jaExiste = webhooks.findAll().stream()
                    .anyMatch(w -> w.getUrl().equals(cfg.getUrl()));
            if (!jaExiste) {
                webhooks.save(new WebhookSubscription(null, cfg.getUrl(), cfg.getSecret(),
                        cfg.getMinSeverity(), cfg.isAtivo()));
            }
        });
    }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogSeederTest
```

Esperado: PASSA, 4 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/config/CatalogSeeder.java \
        src/test/java/com/dev4/cypher/CatalogSeederTest.java
git commit -m "fix(config): seeder vira bootstrap e para de sobrescrever edicao da interface"
```

---

## Task 7: Config da câmera para o pipeline

**Files:**
- Create: `src/main/java/com/dev4/cypher/dto/CameraConfigResponse.java`
- Modify: `src/main/java/com/dev4/cypher/service/CatalogService.java`
- Modify: `src/main/java/com/dev4/cypher/controller/CatalogController.java`
- Test: `src/test/java/com/dev4/cypher/CameraConfigApiTest.java`

**Interfaces:**
- Consumes: `CatalogCodes.portaDe` (Task 2), `CatalogService` (Task 4).
- Produces:
  - `CameraConfigResponse(String codigo, String nome, String estacaoId, String fonte, int streamPort, boolean ativa)`.
  - `CatalogService.cameraConfig(String id) -> Optional<CameraConfigResponse>`.
  - `GET /api/v1/cameras/{id}/config` → `200` / `404` / `409` (câmera desativada).

Este é o endpoint que destrava E2-B. `streamPort` é derivado do `streamUrl` cadastrado, o que elimina a duplicação entre `application.yaml` e `pose_config.yaml` (spec §5.5).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/test/java/com/dev4/cypher/CameraConfigApiTest.java`:

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
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class CameraConfigApiTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private EstacaoRepository estacoes;

    @Autowired
    private CameraRepository cameras;

    @BeforeEach
    void cadastrar() throws Exception {
        cameras.deleteAll();
        estacoes.deleteAll();

        mvc.perform(post("/api/v1/stations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\": \"EST-55\", \"nome\": \"Prensa\", \"setor\": \"estamparia\"}"));

        mvc.perform(post("/api/v1/cameras")
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
        mvc.perform(get("/api/v1/cameras/CAM-55/config"))
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
        // O pipeline precisa da porta para servir, não da URL que o browser usa.
        mvc.perform(get("/api/v1/cameras/CAM-55/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.streamUrl").doesNotExist());
    }

    @Test
    void cameraDesativadaDevolve409() throws Exception {
        mvc.perform(delete("/api/v1/cameras/CAM-55")).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/cameras/CAM-55/config"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.erro").value(Matchers.containsString("CAM-55")));
    }

    @Test
    void cameraInexistenteDevolve404() throws Exception {
        mvc.perform(get("/api/v1/cameras/CAM-99/config"))
                .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CameraConfigApiTest
```

Esperado: FALHA — `404` em `/config`, rota inexistente.

- [ ] **Step 3: Implementar o mínimo**

Criar `src/main/java/com/dev4/cypher/dto/CameraConfigResponse.java`:

```java
package com.dev4.cypher.dto;

/**
 * Config que o pipeline lê no boot.
 *
 * <p>{@code fonte} vem com placeholders {@code ${VAR}}: o segredo vive no
 * ambiente do host do pipeline e nunca atravessa a rede (spec §3).
 *
 * <p>{@code streamPort} é derivado do {@code streamUrl} cadastrado, o que
 * elimina a duplicação em que a porta era declarada em dois arquivos
 * independentes e podia divergir.
 */
public record CameraConfigResponse(
        String codigo,
        String nome,
        String estacaoId,
        String fonte,
        int streamPort,
        boolean ativa
) {
}
```

Acrescentar a `src/main/java/com/dev4/cypher/service/CatalogService.java`, com o import de `com.dev4.cypher.dto.CameraConfigResponse`:

```java
    /**
     * Config do pipeline. Câmera desativada é conflito, não sucesso: o
     * pipeline não deve subir apontando para câmera tirada de operação.
     */
    @Transactional(readOnly = true)
    public Optional<CameraConfigResponse> cameraConfig(String id) {
        return cameras.findById(id).map(camera -> {
            if (!camera.isAtiva()) {
                throw new CatalogValidationException(HttpStatus.CONFLICT,
                        "Camera desativada: " + camera.getId());
            }
            return new CameraConfigResponse(
                    camera.getId(),
                    camera.getNome(),
                    camera.getEstacaoId(),
                    camera.getFonte(),
                    CatalogCodes.portaDe(camera.getStreamUrl()),
                    camera.isAtiva());
        });
    }
```

Acrescentar a `src/main/java/com/dev4/cypher/controller/CatalogController.java`, com o import de `com.dev4.cypher.dto.CameraConfigResponse`:

```java
    /** Superfície de máquina: consumida pelo pipeline no boot. */
    @GetMapping("/cameras/{id}/config")
    public ResponseEntity<CameraConfigResponse> cameraConfig(@PathVariable String id) {
        return service.cameraConfig(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CameraConfigApiTest
```

Esperado: PASSA, 4 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/main/java/com/dev4/cypher/dto/CameraConfigResponse.java \
        src/main/java/com/dev4/cypher/service/CatalogService.java \
        src/main/java/com/dev4/cypher/controller/CatalogController.java \
        src/test/java/com/dev4/cypher/CameraConfigApiTest.java
git commit -m "feat(api): config de camera para o pipeline com porta derivada do cadastro"
```

---

## Task 8: Regressão do soft delete e verificação manual

**Files:**
- Modify: `src/test/java/com/dev4/cypher/CatalogApiTest.java`

**Interfaces:**
- Consumes: tudo das Tasks 1–7.
- Produces: confirmação de que desativar não apaga histórico — a razão de ser do soft delete.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `src/test/java/com/dev4/cypher/CatalogApiTest.java` o campo do repositório de incidentes e o teste. Imports a acrescentar no topo: `com.dev4.cypher.model.Alerta`, `com.dev4.cypher.model.AlertaNivel`, `com.dev4.cypher.model.AlertaStatus`, `com.dev4.cypher.model.AlertaTipo`, `com.dev4.cypher.repository.AlertaRepository`, `java.time.OffsetDateTime`, `java.util.List`, e o `delete` de `MockMvcRequestBuilders`.

```java
    @Autowired
    private AlertaRepository alertas;

    @Test
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

        mvc.perform(delete("/api/v1/cameras/CAM-01")).andExpect(status().isNoContent());

        // Saiu da navegação...
        mvc.perform(get("/api/v1/cameras"))
                .andExpect(jsonPath("$[?(@.id=='CAM-01')]").isEmpty());

        // ...mas o incidente continua consultável. É a razão de ser do soft
        // delete: não há FK entre incidente e câmera, então apagar de verdade
        // deixaria o histórico apontando para um código inexistente.
        mvc.perform(get("/api/v1/incidents").param("camera", "CAM-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }
```

- [ ] **Step 2: Rodar o teste e confirmar que ele realmente testa**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test -Dtest=CatalogApiTest
```

Se passar de primeira, confirmar que não está passando por acidente: comentar temporariamente a linha `camera.setAtiva(false);` em `CatalogService.deactivateCamera` e rodar de novo — a primeira asserção deve falhar. Descomentar depois e rodar mais uma vez.

- [ ] **Step 3: Rodar a suíte inteira**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o test
```

Esperado: PASSA — toda a suíte de E1-A mais a de E2-A, zero falhas. `SummaryApiTest` continua verde porque as estações semeadas são ativas e `stations()` só passou a filtrar inativas.

- [ ] **Step 4: Verificação manual de ponta a ponta**

```bash
cd /home/asaas/projects/cypher && ./mvnw -o spring-boot:run
```

Noutro terminal, exercitar o fluxo que E2-B e E2-C vão consumir:

```bash
curl -i -X POST http://localhost:8080/api/v1/stations \
  -H 'Content-Type: application/json' \
  -d '{"id":"EST-10","nome":"Solda robotizada","setor":"montagem"}'

curl -i -X POST http://localhost:8080/api/v1/cameras \
  -H 'Content-Type: application/json' \
  -d '{"id":"CAM-10","nome":"Solda - frontal","estacaoId":"EST-10",
       "streamUrl":"http://127.0.0.1:8110/stream",
       "fonte":"rtsp://${CAM10_USER}:${CAM10_PASS}@10.0.0.10/stream"}'
```

Inspecionar a config gravando em arquivo primeiro — **não use pipe para intérprete**, um hook do ambiente bloqueia:

```bash
curl -s http://localhost:8080/api/v1/cameras/CAM-10/config -o /tmp/cam10.json
python3 -m json.tool /tmp/cam10.json
```

Confirmar: `streamPort` é `8110`, e a `fonte` volta com `${CAM10_USER}` literal — o placeholder não é expandido pelo servidor.

Erros esperados:

```bash
curl -i -X POST http://localhost:8080/api/v1/cameras \
  -H 'Content-Type: application/json' \
  -d '{"id":"CAM-11","nome":"X","estacaoId":"EST-999",
       "streamUrl":"http://127.0.0.1:8111/stream"}'

curl -i -X PUT http://localhost:8080/api/v1/stations/EST-10 \
  -H 'Content-Type: application/json' \
  -d '{"id":"EST-11","nome":"X"}'
```

O primeiro deve dar `422` e o segundo `409`, ambos com corpo `{"erro": "..."}` legível.

Por último, **reiniciar a aplicação** e confirmar que `EST-10` e `CAM-10` continuam lá com os valores cadastrados. É o teste vivo da correção do seeder: antes de E2, o boot desfaria isso.

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add src/test/java/com/dev4/cypher/CatalogApiTest.java
git commit -m "test(api): desativar camera preserva o historico de incidentes"
```

---

## Estado ao fim deste plano

A API de cadastro está pronta para os outros dois planos de E2:

- **E2-B (cypher-capture)** consome `GET /api/v1/cameras/{id}/config`.
- **E2-C (cypher-front)** consome as escritas, `GET /api/v1/cameras/{id}` e `GET /api/v1/stations?incluirInativas=true`.

Fora do escopo deste plano, por decisão registrada na spec: autenticação da superfície de máquina (E4 — o endpoint de config fica aberto até lá, sob a premissa de rede local), versionamento otimista em edição concorrente (§8 da spec), e `/config/epis` (adiado, condicionado ao retreino do detector com classes `no_*`).
