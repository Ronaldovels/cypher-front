# Cypher — Análise de Risco com LLM Multimodal

**Data:** 2026-09-01
**Status:** aprovado (design)
**Escopo:** ação sob demanda "Analisar com IA" na tela de detalhe do incidente (GESTOR-only) — envia o snapshot já armazenado do incidente para um LLM multimodal (Claude ou Gemini, alternável por config) e exibe uma análise de risco estruturada como apoio à decisão do gestor. Entrega acadêmica da Sprint 3 da disciplina de Inteligência Artificial, com prazo em 21/09.

**Depende de:** nada do roteiro planejado (`2026-08-29-roteiro-de-entregas.md`). Roda sobre o modelo single-tenant atual — não precisa de `Empresa`/`empresaId`. Não toca `cypher-capture`.

---

## 1. Contexto e diagnóstico

O trabalho da Sprint 3 pede para evoluir a solução de visão computacional (Sprints 1-2) com um LLM multimodal capaz de interpretar a cena além da simples detecção de objetos, produzindo uma análise estruturada de risco. A arquitetura já oferecida pelo enunciado como alternativa válida é:

```
Câmera → Captura → Modelo de Visão Computacional → LLM Multimodal → Análise de risco → Dashboard/BD
```

O Cypher já cobre a primeira metade desse fluxo (Sprints 1-2 do curso == E1-E4 do produto): o pipeline em `cypher-capture` detecta o incidente, e o backend (`cypher`) já armazena um snapshot da cena em `Alerta.snapshotUrl` (`model/Alerta.java:95-96`), exposto ao front via `IncidentResponse.snapshotUrl` (`dto/IncidentResponse.java`) e já renderizado hoje em `IncidentDetailComponent` (`src/app/incidents/incident-detail.component.html:21-27`).

Isso significa que **o LLM não precisa ser conectado ao pipeline de captura** para atender ao enunciado — pode ser conectado ao ponto onde um humano já revisa o incidente: a tela de detalhe que o gestor abre. Essa escolha tem uma vantagem pedagógica direta: o enunciado pede para discutir por que "decisões críticas não devem depender exclusivamente da resposta de um LLM sem mecanismos adicionais de validação" — aqui isso é literal, o LLM só sugere, o gestor decide se age.

---

## 2. Backend — endpoint de análise

```
POST /api/v1/incidents/{id}/analyze     roda a análise e devolve o resultado estruturado
```

Segue exatamente o padrão já usado por `changeStatus` em `IncidentController.java:115-128`: busca via `service.findById(id)` (`Optional<IncidentResponse>`), 404 via `ResponseEntity.notFound().build()` em `orElseGet`, escopo verificado com o mesmo helper `foraDoEscopoDoOperador`. Diferença: este endpoint é **GESTOR-only** (não `hasAnyRole("GESTOR", "OPERADOR")` como o resto de `/incidents`), então um `OPERADOR` nem chega ao controller — barrado direto pelo Spring Security.

### 2.1 `SecurityConfig`

Nova linha inserida entre a regra de `PUT .../status` (`SecurityConfig.java:94-95`) e o catch-all (`:96`):

```java
.requestMatchers(HttpMethod.PUT, "/api/v1/incidents/*/status")
        .hasAnyRole("GESTOR", "OPERADOR")
.requestMatchers(HttpMethod.POST, "/api/v1/incidents/*/analyze")
        .hasRole("GESTOR")
.anyRequest().hasRole("GESTOR")
```

Tecnicamente redundante com o catch-all (que já é GESTOR-only), mas mantém a convenção já documentada no cabeçalho da classe de que cada `requestMatchers` é uma linha explícita da tabela de proteção do endpoint (spec de E4 §2.6).

### 2.2 DTOs

```java
public record RiskAnalysisResponse(
        String situacao,
        List<String> episIdentificados,
        List<String> episAusentes,
        boolean riscoIdentificado,
        String tipoRisco,
        String nivelRisco,
        String justificativa,
        String acaoRecomendada,
        String provider,
        String promptVersion,
        AnalysisStatus status,
        OffsetDateTime geradoEm
)
```

`AnalysisStatus` é um enum novo: `OK`, `ERRO_PARSE` (o LLM respondeu, mas o texto não veio no JSON esperado — todos os campos de conteúdo vêm `null`/vazios, só `status` e `provider`/`promptVersion`/`geradoEm` são confiáveis nesse caso), e `ERRO_API` (a chamada ao provedor falhou — rede, timeout, 5xx).

As chaves do JSON que o **prompt pede ao modelo** usam os nomes exatos do exemplo do enunciado (`situacao`, `epis_identificados`, `epis_ausentes`, `risco_identificado`, `tipo_risco`, `nivel_risco`, `justificativa`, `acao_recomendada` — snake_case, porque é o que está no enunciado) — o parser (`LlmResponseParser`, ver §2.5) faz o mapeamento para os nomes camelCase do DTO, do mesmo jeito que o resto do projeto já renomeia entre a entidade (`tipo`, `posturaCategoria`) e o DTO de saída (`type`, `postureCategory`).

### 2.3 Entidade de auditoria: `IncidentLlmAnalysis`

Guarda cada chamada feita, no formato estrutural de `WebhookDelivery` (`model/WebhookDelivery.java`):

```java
@Entity
@Table(name = "incident_llm_analyses")
public class IncidentLlmAnalysis {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long alertaId;          // referência solta, sem FK — mesmo padrão do resto do projeto
    private String provider;        // "claude" ou "gemini"
    private String promptVersion;   // "v1" ou "v2"

    @Enumerated(EnumType.STRING)
    private AnalysisStatus status;

    @Lob
    private String respostaJson;    // JSON estruturado devolvido (ou o texto bruto, se ERRO_PARSE)

    private String erro;            // mensagem truncada, preenchido só em ERRO_API/ERRO_PARSE

    private OffsetDateTime criadoEm;
}
```

`IncidentLlmAnalysisRepository extends JpaRepository<IncidentLlmAnalysis, Long>` — sem query customizada nesta entrega (nenhum endpoint de histórico é exposto; ver §6 "Fora de escopo"). A gravação serve para auditoria e como evidência bruta para o relatório técnico (item 4 dos entregáveis: "resposta estruturada… que possa posteriormente ser utilizada por outros componentes").

### 2.4 `MultimodalRiskClient` — interface alternável entre provedores

```java
public interface MultimodalRiskClient {
    /** Devolve o texto bruto respondido pelo modelo; pode não ser JSON válido. */
    String analisar(String imagemUrl, String prompt);
}
```

Duas implementações, cada uma ativada por config via `@ConditionalOnProperty`:

```java
@Component
@ConditionalOnProperty(name = "cypher.llm.provider", havingValue = "claude")
public class ClaudeVisionClient implements MultimodalRiskClient { ... }

@Component
@ConditionalOnProperty(name = "cypher.llm.provider", havingValue = "gemini")
public class GeminiVisionClient implements MultimodalRiskClient { ... }
```

`LlmAnalysisService` injeta só a interface — não sabe qual dos dois está ativo. Trocar de provedor é mudar `cypher.llm.provider` no `application.yaml` e reiniciar; nenhum código muda. Isso é o que permite o item 6 do enunciado (comparar abordagens) ser feito rodando a mesma cena pelos dois provedores de verdade, não só na teoria.

Cada implementação usa `RestClient`, mesmo estilo de `WebhookDispatcher.java:44` (`http.post().uri(...).header(...).body(...).retrieve()...`), mas — diferente do dispatcher, que é assíncrono e fire-and-forget — aqui a chamada é **síncrona** (o gestor clica no botão e espera o resultado), então o `RestClient` é construído com timeout explícito via `ClientHttpRequestFactorySettings` usando `cypher.llm.timeout-seconds` (default 20s), para não deixar a requisição HTTP do gestor pendurada indefinidamente se o provedor não responder.

Payload de cada provedor (formato de mensagem com imagem) é responsabilidade de cada implementação — a imagem é referenciada pela própria `snapshotUrl` (ambas as APIs aceitam imagem por URL ou base64; usar por URL evita ter que baixar e reenviar o binário pelo backend).

### 2.5 `LlmAnalysisService` — orquestração

```java
public RiskAnalysisResponse analisar(Long alertaId) {
    Alerta alerta = alertas.findById(alertaId)
            .orElseThrow(() -> new NoSuchElementException("Incidente nao encontrado"));

    if (alerta.getSnapshotUrl() == null) {
        throw new CatalogValidationException("Nenhuma imagem disponivel para analise deste incidente");
    }

    String prompt = promptBuilder.montar(alerta, config.getPromptVersion());
    RiskAnalysisResponse resultado;
    try {
        String bruto = client.analisar(alerta.getSnapshotUrl(), prompt);
        resultado = parser.parse(bruto, config.getProvider(), config.getPromptVersion());
    } catch (Exception falhaApi) {
        resultado = RiskAnalysisResponse.erroApi(config.getProvider(), config.getPromptVersion());
    }

    analyses.save(toEntity(alertaId, resultado));
    return resultado;
}
```

- **`snapshotUrl` ausente → `CatalogValidationException`** — reaproveita o `@RestControllerAdvice` já existente (`CatalogExceptionHandler`) que traduz essa exceção para **422**, exatamente o significado já estabelecido no projeto para regras de negócio entre entidades (não é violação de formato de campo, é "esse incidente não tem imagem pra analisar"). Alerta não encontrado → 404, tratado no controller com o mesmo `Optional`/`orElseGet` de sempre.
- **Falha na chamada ao provedor (rede, timeout, 5xx)** — nunca propaga como erro HTTP 5xx pro gestor; vira um `RiskAnalysisResponse` com `status = ERRO_API`, devolvido com `200 OK`. O front mostra "não foi possível analisar agora, tente novamente" e reabilita o botão — mesma filosofia de degradação graciosa já usada em outras partes do projeto (o heartbeat sender e o `CameraConfigClient` também nunca deixam uma falha de rede virar uma exceção não tratada).
- **Resposta do LLM que não é o JSON esperado** — `LlmResponseParser` tenta decodificar; se falhar, devolve `status = ERRO_PARSE` com o texto bruto preservado em `respostaJson` (útil tanto para o gestor ver que algo veio, quanto para o relatório técnico, que precisa discutir um caso de interpretação incorreta/ambígua).

### 2.6 Prompt — duas versões documentadas

`PromptBuilder.montar(Alerta, String versao)`:

- **v1 (mínimo):** só pede pro modelo analisar a imagem e responder no formato JSON pedido pelo enunciado — sem nenhum contexto adicional do que a visão computacional já sabe.
- **v2 (com contexto da CV):** inclui no prompt os sinais que o pipeline já calculou para aquele incidente — `postureCategory`, `zoneName`, `epiPresent`/`epiMissing`, `rebaScore`, `severity` — pedindo ao modelo para **confirmar, refinar ou contestar** esses sinais, não analisar do zero.

`cypher.llm.prompt-version` escolhe qual versão está ativa; comparar a mesma cena com v1 vs v2 é o material para o requisito do enunciado de documentar duas versões de prompt e como a mudança afetou o resultado.

### 2.7 Configuração (`application.yaml`)

Novo bloco `cypher.llm`, irmão de `cypher.cors`/`cypher.catalog` já existentes:

```yaml
cypher:
  llm:
    provider: claude              # ou gemini
    prompt-version: v2            # ou v1
    timeout-seconds: 20
    claude:
      api-key: ${CYPHER_CLAUDE_API_KEY:}
      model: claude-sonnet-5
      base-url: https://api.anthropic.com
    gemini:
      api-key: ${CYPHER_GEMINI_API_KEY:}
      model: gemini-2.5-flash
      base-url: https://generativelanguage.googleapis.com
```

`base-url` configurável (não fixo no código) é o que permite testar `ClaudeVisionClient`/`GeminiVisionClient` do mesmo jeito que o projeto já testa `WebhookDispatcher` — apontando para um `HttpServer` local embutido no teste, em vez de mockar o `RestClient` (este projeto não usa Mockito em nenhum teste existente; ver `WebhookDispatcherTest`).

**Nota:** este é o primeiro segredo do projeto injetado via variável de ambiente (`${VAR}`) — hoje o segredo de webhook e a API key de câmera ficam como valor literal em YAML/banco. Desvio deliberado e documentado: uma chave de API de terceiro não deve ser commitada em texto puro, diferente dos segredos internos já existentes (gerados e controlados pelo próprio Cypher).

---

## 3. Front — botão "Analisar com IA" no detalhe do incidente

**Nota de design:** reaproveita 100% os primitivos globais já existentes (`.panel`, `.chip`, `.status`, `.btn`) — nenhum CSS novo, nenhuma biblioteca de UI.

### 3.1 Posição na tela

Em `incident-detail.component.html`, logo após o bloco `.detail-snapshot` (linha 27) e antes de `.detail-grid` (linha 29) — mantém o botão visualmente ligado à imagem que ele analisa. Gated pela mesma condição já usada para o dock nesta tela (`@if (auth.role() === 'GESTOR')`, linha 55), já que a ação é GESTOR-only.

### 3.2 `IncidentDetailComponent` — novo estado

```ts
private readonly llmService = inject(LlmAnalysisService);
readonly analisando = signal(false);
readonly analiseResultado = signal<RiskAnalysisResponse | null>(null);
readonly analiseErro = signal<string | null>(null);

analisarComIa(): void {
  this.analisando.set(true);
  this.analiseErro.set(null);
  this.llmService.analisar(this.id).subscribe({
    next: (resultado) => { this.analiseResultado.set(resultado); this.analisando.set(false); },
    error: () => { this.analiseErro.set('Não foi possível analisar agora. Tente novamente.'); this.analisando.set(false); },
  });
}
```

### 3.3 `LlmAnalysisService`

`src/app/shared/llm-analysis.service.ts` — serviço simples, sem signal/store compartilhado (é uma ação pontual por incidente, não dado "ao vivo" a manter em memória, mesma razão de `deliveries()` em webhook §3.3):

```ts
analisar(id: number): Observable<RiskAnalysisResponse> {
  return this.http.post<RiskAnalysisResponse>(`${base}/incidents/${id}/analyze`, {}, { withCredentials: true });
}
```

### 3.4 Painel de resultado

Renderizado logo abaixo do botão quando `analiseResultado()` não é nulo: situação (texto), EPIs identificados/ausentes (`.chip` por item, mesmo padrão já usado nos campos EPI do `.detail-grid`), risco identificado (`.status` colorido conforme `nivelRisco`), justificativa e ação recomendada (texto). Quando `status === 'ERRO_PARSE'`, mostra um aviso explícito ("o modelo respondeu, mas não no formato esperado") em vez de tentar renderizar campos vazios como se fossem dados válidos.

### 3.5 `RiskAnalysisResponse` (TS) e modo mock

`src/app/shared/llm-analysis.models.ts` espelha o DTO Java (mesmos nomes de campo, camelCase). `mock-api.interceptor.ts` ganha um novo handler, no mesmo estilo do bloco de `PUT .../status` (linhas 388-398): prefixo/sufixo `/incidents/`/`/analyze`, extrai o id, localiza o incidente em `[...INCIDENTS, ...EMITIDOS]`, devolve um `RiskAnalysisResponse` fixo (derivado da severidade do próprio incidente mockado, para o mock parecer plausível) — sem chamar nenhum provedor de verdade em modo mock.

---

## 4. Comportamento sob falha

| Situação | Comportamento |
|---|---|
| Incidente inexistente | `404` |
| `OPERADOR` tentando chamar o endpoint | `403` (barrado pelo Spring Security antes do controller — regra explícita em `SecurityConfig`) |
| Incidente sem `snapshotUrl` | `422` via `CatalogValidationException` — mesma convenção já usada no projeto para regra de negócio entre entidades |
| Provedor (Claude/Gemini) indisponível, timeout ou erro de rede | `200 OK` com `status: "ERRO_API"` — nunca propaga como erro HTTP; front mostra mensagem e permite tentar de novo |
| Resposta do modelo não é o JSON esperado | `200 OK` com `status: "ERRO_PARSE"`, texto bruto preservado em `respostaJson` para auditoria/relatório |

---

## 5. Estratégia de testes

**Java** — `LlmAnalysisService` com `MultimodalRiskClient` mockado: caminho feliz (JSON válido → `status = OK`), JSON malformado (→ `ERRO_PARSE`), exceção do client (→ `ERRO_API`), `snapshotUrl` nulo (→ `422`), incidente inexistente (→ `404`); teste de `SecurityConfig` confirmando `403` para `OPERADOR` e `GESTOR` autorizado.

**Angular** — spec do `LlmAnalysisService` via `HttpTestingController`; spec do `IncidentDetailComponent` cobrindo clique no botão → estado de carregando → renderização do resultado, e o caminho de erro (mensagem + botão reabilitado); interceptor mock respondendo o novo `POST .../analyze`.

**Manual/demonstração (para os entregáveis do trabalho, não parte do plano de implementação):** selecionar três cenas dos vídeos já existentes em `cypher-capture/data/validation/` (uma seguramente segura, uma com risco claro, uma ambígua), disponibilizar cada imagem numa URL acessível (mesma infraestrutura de upload de snapshot já usada hoje), criar um incidente de teste apontando pra cada URL (via `POST /api/v1/incidents`) e clicar em "Analisar com IA" em cada um — essas três execuções, com print e JSON de saída, são os "exemplos de entrada e saída" pedidos no entregável 3, e a comparação Claude vs Gemini (trocando `cypher.llm.provider`) alimenta o entregável 5 (comparação com a Sprint 2 e discussão de limitações).

---

## 6. Fora de escopo

- Endpoint de histórico de análises (`GET .../analyze` ou lista) — a entidade `IncidentLlmAnalysis` é gravada para auditoria/evidência, mas não é exposta por API nesta entrega; ninguém pediu consultar análises passadas pela tela ainda.
- Qualquer mudança em `cypher-capture` — o LLM não participa do pipeline de captura, só do fluxo de revisão do gestor.
- Qualquer mudança de modelo multi-tenant — roda sobre o modelo single-tenant atual, sem `empresaId`.
- Disparo automático da análise no momento em que o incidente é criado — é uma ação explícita do gestor, sob demanda, por desenho (mantém o humano no controle, ver §1).
- Redigir o relatório técnico, o diagrama de arquitetura atualizado e a apresentação da Sprint — são entregáveis do trabalho acadêmico, mas são documentos escritos pelo aluno a partir do que foi construído aqui, não tarefas de implementação. Ficam fora do plano de implementação que segue este spec.

---

## 7. Ordem de implementação

1. **Backend.** `MultimodalRiskClient` (interface + `ClaudeVisionClient`), `PromptBuilder` (v1/v2), `LlmResponseParser`, `IncidentLlmAnalysis`/`IncidentLlmAnalysisRepository`, `LlmAnalysisService`, `IncidentController` (`POST /{id}/analyze`), `SecurityConfig`. `GeminiVisionClient` pode entrar num segundo momento — a interface já permite isso sem tocar no resto.
2. **Frontend.** `LlmAnalysisService`, botão + painel em `IncidentDetailComponent`, mock interceptor.
3. **Demonstração.** Três cenas (segura/risco/ambígua) via vídeos de validação existentes → três chamadas reais → prints e JSON coletados para o relatório.

`cypher-capture` não é tocado em nenhuma etapa.
