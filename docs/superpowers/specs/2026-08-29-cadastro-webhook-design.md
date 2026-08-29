# Cypher — Cadastro de Webhook pela Interface

**Data:** 2026-08-29
**Status:** aprovado (design)
**Escopo:** CRUD de `WebhookSubscription` pela interface (GESTOR-only) + tela em `/config` para cadastrar assinantes e consultar o histórico de `WebhookDelivery`. Fecha o gap registrado em `2026-08-10-notificacao-de-incidentes-design.md` §9 ("Interface de cadastro de webhook").

**Depende de:** `2026-08-29-multi-tenant-design.md` implementado — este documento assume que `Empresa`/`empresaId` já existem e que `WebhookSubscription.empresaId` já está no modelo. Todo escopo por tenant descrito aqui é herdado do mecanismo já definido naquela spec (`TenantContext.currentEmpresaId()`), sem trabalho adicional específico de multi-tenant nesta entrega.

---

## 1. Contexto e diagnóstico

Hoje `WebhookSubscription` (`url`, `secret`, `minSeverity`, `ativo`) só é populada via `cypher.catalog.webhooks` no `application.yaml`, carregada pelo `CatalogSeeder` no boot — sem endpoint (`WebhookController` não existe) nem tela no front. Cadastrar ou trocar um assinante hoje exige editar o YAML e reiniciar o backend. O mecanismo de disparo funciona e já foi validado ponta a ponta (HMAC-SHA256 válido, entrega confirmada) — o gap é puramente de superfície administrativa, não de funcionalidade.

`WebhookDispatcher` (`webhook/WebhookDispatcher.java`) escuta `IncidentCreatedEvent` via `@TransactionalEventListener(phase = AFTER_COMMIT)` + `@Async`, filtra por `WebhookSubscription.minSeverity` e usa `WebhookSubscriptionRepository.findByAtivoTrue()` — já lê da tabela, não do YAML diretamente; o YAML só popula a tabela no bootstrap. `WebhookSigner` assina com HMAC-SHA256 sobre `timestamp + "." + body`, headers `X-Cypher-Signature`/`X-Cypher-Timestamp`. Retry: `WebhookDelivery` com `tentativas`/`status`/`proximaTentativa`, backoff exponencial hardcoded (30s/60s/120s/240s/480s), `@Scheduled(fixedRate=30_000)`, `MAX_TENTATIVAS = 6`.

O `CatalogSeeder` hoje faz upsert por `url` (checa se já existe antes de inserir) e **nunca atualiza** um registro existente — diferente da correção que E2 §5.4 precisou aplicar a `Estacao`/`Camera` (que faziam upsert a cada boot e desfaziam edições feitas pela interface). Para webhooks, o comportamento atual já é seguro: editar ou desativar um assinante seedado sobrevive a um restart sem risco de o YAML sobrescrever a edição. **Nenhuma correção de seeder é necessária nesta entrega.**

---

## 2. Backend — endpoints

```
GET    /api/v1/webhooks                    lista assinantes
POST   /api/v1/webhooks                    cadastrar
PUT    /api/v1/webhooks/{id}               editar url, secret, minSeverity, ativo
DELETE /api/v1/webhooks/{id}               desativar (soft delete)
GET    /api/v1/webhooks/{id}/deliveries    histórico paginado de entregas
```

Mesmo padrão de `TeamController`/`UserController`: nenhum `@PreAuthorize` no controller — a proteção é centralizada em `SecurityConfig` (`SecurityFilterChain`), e como `/api/v1/webhooks` não recebe linha explícita, cai no catch-all `anyRequest().hasRole("GESTOR")`, igual a `/teams` e `/users` hoje.

DTOs próprios, seguindo o padrão já estabelecido no projeto (entidade JPA nunca exposta diretamente):

```java
public record WebhookRequest(@NotBlank @Size(max=500) String url, @NotBlank @Size(max=200) String secret,
        @NotNull @Min(0) @Max(4) Integer minSeverity, Boolean ativo)
public record WebhookResponse(Long id, String url, String secret, Integer minSeverity, boolean ativo)
public record WebhookDeliveryResponse(Long id, String incidentKey, DeliveryStatus status,
        int tentativas, String ultimoErro, OffsetDateTime proximaTentativa)
```

`WebhookResponse` inclui `secret` — diferente de `Camera.fonte` (nunca exposto, por conter credencial de terceiro que trafega em rede aberta), o segredo do webhook é conhecido e configurado pelo próprio `GESTOR` que o cadastrou, e só ele (papel já confiável, mesmo nível de quem vê `Camera.fonte` na superfície de administração) consegue consultá-lo.

### 2.1 Segredo: digitado pelo gestor, não gerado pelo sistema

Diferente do token de estação e da API key de câmera (gerados via `TokenGenerator` no cadastro), o segredo do webhook frequentemente é ditado pelo sistema externo que vai receber o payload — é um valor combinado fora do Cypher, não algo que o Cypher inventa e distribui. Mantém o mesmo comportamento já existente hoje via `application.yaml` (`WebhookConfig.secret`), só que editável pela tela em vez de arquivo+restart.

**Consequência:** não existe endpoint de "regenerate" como `/stations/{id}/token/regenerate`. Trocar o segredo é só um `PUT` normal — não há dispositivo físico provisionado que precise ser reconfigurado, diferente do token de estação (que é colado uma vez no kiosk).

### 2.2 `DELETE` é soft delete

`ativo = false`, mesmo padrão de `Camera`/`Estacao` (E2 §5.3). `WebhookDelivery.subscriptionId` referencia o assinante como campo solto (sem FK, mesmo padrão do resto do projeto) — apagar de verdade deixaria entregas antigas órfãs e o histórico inexplicável. `WebhookDispatcher.findByAtivoTrue()` já ignora assinantes desativados; nenhuma mudança necessária ali.

### 2.3 Histórico de entregas

`WebhookDeliveryRepository` ganha `findBySubscriptionId(Long, Pageable)` (hoje só tem `findByStatusAndProximaTentativaBefore` e `findByIncidentKey`). Resposta paginada, mesmo padrão de `GET /api/v1/incidents`.

---

## 3. Front — nova aba em `/config`

### 3.1 Rota e navegação

Entrada nova em `TABS` (`SettingsPageComponent`, `src/app/config/settings/settings-page.component.ts`): `{ path: 'webhooks', label: 'Webhooks' }`, mais um ícone no `@switch` do template e uma rota filha em `app.routes.ts`:

```ts
{ path: 'webhooks', component: WebhooksTabComponent }
```

Mesmo padrão de `estacoes`/`identidade`/`epis`/`cas`/`equipe` — sem layout próprio, herdando o `.cat-rail`/`.cat-item` já existente.

### 3.2 Duas sub-áreas, uma tela

Seguindo o precedente de `EquipeUsuariosTabComponent` (sub-abas locais via signal, sem rota própria): **Assinantes** (lista + formulário de cadastro/edição) e **Histórico** (entregas do assinante selecionado). Evita duas rotas para um conceito que sempre se consulta em conjunto — quem olha histórico normalmente acabou de olhar o assinante.

### 3.3 `WebhookService`

`src/app/shared/webhook.service.ts`, mesmo esqueleto de `TeamService` (`src/app/shared/team.service.ts`): signal privado `_assinantes` (`.asReadonly()`), `load()`/`create()`/`update()`/`deactivate()` com `tap(() => this.load())` recarregando tudo após cada escrita, `withCredentials: true` em toda chamada.

Método próprio `deliveries(id, page, size)` **não** entra no store compartilhado — mesma razão do `search()` de incidentes em E3 §4: é consulta paginada sob demanda, não dado "ao vivo" para manter em memória.

### 3.4 Listagem e formulário

Listagem reproduz o padrão visual já usado em equipes/estações: `@for` sobre `.list-row` com classes globais (`.chip`, `.status`, `.ph-meta`, `.vazio`) — sem componente de tabela genérico novo (não há precedente disso no projeto).

Formulário com campos `url`, `secret`, `minSeverity` (0–4), `ativa`, seguindo o padrão signal-de-rascunho + `patch()` já usado em `identity-tab.component.ts` — sem `ReactiveFormsModule`, sem CSS por componente.

### 3.5 Modo mock

`mock-api.interceptor.ts` ganha seção `// ---------------- webhooks ----------------`, arrays mutáveis `WEBHOOKS_MUTAVEL`/`WEBHOOK_DELIVERIES_MUTAVEL`, handlers `GET/POST/PUT/DELETE` sobre o primeiro e `GET` paginado sobre o segundo — mesmo esqueleto das seções de equipes/usuários já existentes no mesmo arquivo.

---

## 4. Comportamento sob falha

| Situação | Comportamento |
|---|---|
| URL duplicada | `409` (constraint já existe hoje) |
| `minSeverity` fora de 0–4 | `422` |
| `secret` vazio | `422` |
| Assinante desativado | Some da listagem principal por padrão; `WebhookDispatcher` já ignora no disparo, sem mudança |
| Sem entregas para o assinante | Estado vazio explícito no histórico ("nenhuma entrega registrada"), mesmo padrão de E3 §5 |

---

## 5. Estratégia de testes

**Java** — CRUD completo; `409` de URL duplicada; `422` de `minSeverity`/`secret` inválidos; soft delete removendo o assinante do `findByAtivoTrue()` usado pelo dispatcher; paginação do histórico de entregas; escopo por `empresaId` (assinante de uma empresa não aparece, não edita e não desativa por outra empresa).

**Angular** — spec do `WebhookService` via `HttpTestingController`; spec do componente cobrindo cadastro, edição, desativação e troca de sub-aba para histórico; interceptor mock respondendo `GET/POST/PUT/DELETE` e o histórico paginado.

**Ponta a ponta** — cadastrar um assinante pela tela, provocar um incidente real, confirmar entrega HMAC válida (mesmo roteiro já usado na verificação de E1: "testado ponta a ponta: HMAC-SHA256 válido, entrega confirmada"); depois desativar o assinante e confirmar que o próximo incidente não gera nova entrega.

---

## 6. Fora de escopo

- Reenvio manual de uma entrega com `status = FALHA` (botão "tentar de novo") — o `@Scheduled` de retry automático já cobre o caso funcional; ação manual fica para quando alguém pedir.
- Teste de conectividade no cadastro ("enviar webhook de teste") — bonito de ter, não bloqueia o caso de uso.
- Alerta/notificação para o gestor quando um assinante atinge `MAX_TENTATIVAS` e vira `FALHA` definitivo — hoje só fica visível olhando o histórico.
- Qualquer canal de notificação além de webhook HTTP (e-mail, Telegram) — já registrado como fora do produto em E1 §9.
- Verificação de replay window no lado servidor a partir de `X-Cypher-Timestamp` — o header já existe para permitir isso no receptor; validar no Cypher em si não foi pedido.

---

## 7. Ordem de implementação

1. **Backend.** `WebhookController` (CRUD), `WebhookDeliveryRepository.findBySubscriptionId`, DTOs, testes de `409`/`422`/soft delete/escopo por empresa. Verificável com `curl`.
2. **Frontend.** `WebhookService`, `WebhooksTabComponent` (assinantes + histórico), rota/aba em `/config`, mock interceptor.
3. **Ponta a ponta.** Cadastro pela tela → incidente real → entrega confirmada → desativação → ausência de nova entrega.

`cypher-capture` não é tocado — o pipeline não conhece webhook, só dispara incidentes; quem lê `WebhookSubscription` é só o backend.
