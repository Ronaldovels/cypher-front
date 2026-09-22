# Servidor MCP para integração com agentes de IA

**Repositórios:** `cypher` (backend — servidor MCP, credenciais, API de gestão), `cypher-front` (tela de gestão de credenciais MCP)
**Origem:** avaliação de viabilidade solicitada por Lucas — análise dos três repositórios (`cypher-front`, `cypher-capture`, `cypher`) concluiu que o backend Spring Boot é o único lugar com superfície de API adequada para expor tools MCP; `cypher-capture` só oferece observabilidade local (sem plano de controle) e `cypher-front` é puro consumidor.
**Natureza:** feature de produto (prova de conceito para o Challenge/FIAP, mas implementada com profundidade real — CRUD persistido, autenticação própria, testes — não descartável).

## Contexto

O sistema Cypher (monitoramento de segurança industrial por visão computacional) tem hoje três mecanismos de autenticação no backend, nenhum adequado para um agente de IA externo de longa duração:

- Sessão cookie `JSESSIONID` (`GestorAuthentication`/`OperadorAuthentication`, GESTOR/OPERADOR) — pensada para humano logado via browser, frágil para processo automatizado; além disso, `EventSource` (usado pelo SSE de incidentes) não aceita headers customizados, o que empurrou o projeto pra cookie em vez de bearer token — não é um mecanismo que um cliente MCP simples reproduziria à toa.
- `X-Cypher-Key` (`PipelineAuthentication`, `ROLE_PIPELINE`) — escopada a uma única câmera (um filtro adicional em `IncidentController` trava ainda mais: só age sobre incidentes da própria câmera), sem acesso a incidentes/summary/placar de forma ampla.

`TenantContext.currentEmpresaId()` é o ponto único que resolve o tenant a partir da `Authentication` atual, e hoje lança `IllegalStateException` para qualquer tipo que não seja um dos três já existentes — é o ponto de inserção para um novo mecanismo.

Spring Boot está em 4.0.6. O servidor MCP oficial do ecossistema Spring (`spring-ai-starter-mcp-server-webmvc`) requer Spring Boot 4.1. Um spike isolado (branch `spike/spring-boot-4.1`, worktree `.worktrees/spring-boot-4.1-spike` no repo `cypher`) confirmou compilação limpa e suíte completa (409/409 testes) passando sem nenhuma alteração de código além do bump de versão — o upgrade é considerado seguro e é pré-requisito desta feature.

## Decisões de design

**Servidor MCP in-process, não um processo separado.** O servidor MCP roda dentro do próprio backend `cypher`, usando `spring-ai-starter-mcp-server-webmvc` com protocolo `STREAMABLE` (SSE está deprecated na versão atual do Spring AI). As tools (`@McpTool`) chamam os services de domínio diretamente (`IncidentService`, `CatalogService`, `SummaryService`, `PlacarService`, `LlmAnalysisService`), reaproveitando o isolamento de tenant que `TenantContext` já garante — sem duplicar lógica de negócio numa camada HTTP intermediária.

**`McpCredential` como entidade própria, espelhando `WebhookSubscription`.** Cada empresa pode ter múltiplas credenciais MCP nomeadas (ex.: "Claude Desktop do Lucas", "Agente de demo"), criadas/revogadas independentemente — mesmo modelo de "lista de assinantes" que o webhook já usa, em vez de uma chave única por empresa (que seria mais parecida com o token de estação). Diferente de `Camera.apiKey` (texto puro), o secret da credencial MCP é guardado como **hash BCrypt**; o valor em texto puro só existe na resposta do `POST` de criação, nunca mais depois disso — padrão usual de gestão de API key (GitHub, Stripe etc.), escolhido por essa credencial ser voltada a agentes externos, não a um dispositivo de borda já fisicamente controlado como a câmera.

**Novo mecanismo de autenticação, não reaproveita os três existentes.** `McpKeyAuthenticationFilter` (mesmo padrão de `CypherKeyAuthenticationFilter`) lê o header `X-Cypher-Mcp-Key` no formato `{id}.{secret}`, resolve a `McpCredential` pelo `id`, valida o hash, checa `ativa = true`, e autentica como `McpAuthentication` (`ROLE_MCP`) carregando o `empresaId`. Registrado apenas no path do endpoint MCP (`/mcp/**`). `TenantContext.currentEmpresaId()` ganha um quarto branch para esse tipo.

**Tela de gestão dentro da área de configuração da empresa, seguindo o padrão que o webhook já tem hoje.** O webhook já tem CRUD completo pela interface (`WebhookController` + tela `config/webhooks/`, ver `docs/superpowers/specs/implementadas/2026-08-29-cadastro-webhook-design.md`) — a credencial MCP replica essa mesma estrutura: `McpCredentialController` (GESTOR-only) expõe `GET/POST/DELETE /api/v1/mcp-keys`, consumido por uma tela nova em `cypher-front` (`src/app/config/mcp/`), ao lado de `config/webhooks/`, visível apenas na área de configuração da empresa já onboardada. Revogação é soft-delete (`ativa = false`), preservando histórico — mesmo espírito de zonas e webhooks.

**Escopo de tools: leitura + uma ação, nada de escrita administrativa.** Oito tools na primeira versão:

| Tool | Service | Observação |
|---|---|---|
| `list_incidents` | `IncidentService` | filtros since/camera/severityMin/status |
| `get_incident` | `IncidentService` | |
| `get_incident_analysis` | `LlmAnalysisService` | leitura cacheada, sem chamar o LLM — tool de leitura padrão |
| `analyze_incident` | `LlmAnalysisService` | chamada real ao LLM (até ~1min); descrição da tool marca explicitamente como operação lenta |
| `list_cameras` | `CatalogService` | |
| `list_stations` | `CatalogService` | |
| `get_summary` | `SummaryService` | heatmap/agregados do dashboard |
| `get_placar` | `PlacarService` | gamificação |

Nenhuma tool de create/update/delete de câmeras, equipes, zonas, webhooks etc. nesta versão — mutação de cadastro fica fora de escopo até haver necessidade concreta validada em uso.

## Tratamento de erros

- Autenticação inválida/revogada no endpoint MCP → 401 padrão do Spring Security, sem detalhar qual parte da chave falhou.
- `analyze_incident` reaproveita o `RetryComBackoff` e `AnalysisStatus.ERRO_PARSE` já existentes no `LlmAnalysisService` — a tool só repassa o status estruturado, nunca deixa a chamada MCP travar além do timeout de 20s/tentativa já configurado.
- Tools de leitura sobre recurso inexistente retornam erro MCP padrão (`isError: true` com mensagem), nunca 500 cru.
- Criação de credencial com nome duplicado na mesma empresa → validação inline no formulário, mesmo padrão dos outros formulários de `config/`.

## Limitações explícitas (fora de escopo)

- **Sem granularidade de permissão por credencial** (ex.: uma chave só-leitura vs. uma com `analyze_incident`) — todas as credenciais MCP de uma empresa têm acesso às mesmas oito tools. Se necessário, é extensão futura no modelo `McpCredential` (campo de escopo).
- **Sem exposição do stream SSE de incidentes (`/incidents/stream`) via MCP** — as tools MCP são request/response; um agente que queira eventos em tempo real continuaria consumindo o SSE existente separadamente, fora do escopo desta feature.
- **Sem multi-tenant além do que já existe** — cada credencial MCP pertence a uma empresa, seguindo o isolamento que já existe hoje; nenhuma mudança no modelo de tenant em si.

## Sub-projetos

| Código | Repo | Escopo |
|---|---|---|
| MCA | `cypher` | Upgrade Spring Boot 4.0.6 → 4.1.1 (promoção do spike já validado) |
| MCB | `cypher` | `McpCredential` (model/repository/service), `McpCredentialController` (CRUD GESTOR-only) |
| MCC | `cypher` | `McpKeyAuthenticationFilter`, `McpAuthentication`, branch em `TenantContext` |
| MCD | `cypher` | Servidor MCP (`spring-ai-starter-mcp-server-webmvc`, protocolo STREAMABLE) com as 8 tools |
| MCE | `cypher-front` | Tela `config/mcp/` (listagem, criação com exibição única do secret, revogação) |

Ordem de implementação: MCA → MCB → MCC → MCD (cada uma depende da anterior) → MCE (pode começar em paralelo a MCD assim que MCB/MCC estiverem prontos, já que consome só a API de gestão, não o MCP em si).
