# Cypher — Multi-tenant (Empresa)

**Data:** 2026-08-29
**Status:** aprovado (design)
**Escopo:** introduzir `Empresa` como unidade de isolamento (tenant), permitindo que múltiplas empresas usem a mesma instância do Cypher sem enxergar dados umas das outras. Motivação: vender o Cypher como SaaS para múltiplos clientes.

**Depende de:** E1–E4 completas (entregues e mergeadas nos três repositórios — ver gitStatus/histórico de `dev`/`main` em cada repo).

Este item estava registrado como "fora de escopo, avaliação futura" em `2026-08-23-acesso-e-equipes-e4-design.md` §6 ("Multi-empresa (multi-tenant)") e `2026-08-10-notificacao-de-incidentes-design.md` §6 (setor como campo texto, não entidade — decisão que este documento não reabre). Este documento é a avaliação futura que aquele registro previa.

---

## 1. Contexto e diagnóstico

### 1.1 Estado atual (single-tenant)

Levantamento no backend (`cypher`, Spring Boot) confirma um padrão consistente em toda a base: **nenhuma entidade tem `@ManyToOne`/FK real entre si** — tudo é referência solta (`String`/`Long`) validada em nível de serviço, nunca constraint de banco (ex.: unicidade de `estacaoId+turno` em `Equipe`, validada em `EquipeService`, não no schema). Este documento segue o mesmo padrão para `empresaId`, em vez de introduzir um mecanismo novo.

- `Estacao`, `Camera`, `Equipe` têm PK `String` escolhida pelo usuário (`EST-01`, `CAM-01`, `EQ-01`), globalmente única hoje.
- `Usuario` (`username` único, `papel`, `estacaoId` opcional) e `Alerta` (`incidentKey` único) têm PK `Long` gerada.
- `POST /api/v1/setup` cria **exatamente um** `Usuario` mestre e fecha para sempre (`usuarios.count() > 0` → `409`) — decisão consciente de E4, registrada como o ponto que multi-tenant precisaria reabrir.
- `IncidentSseService` já filtra por `estacaoId` (OPERADOR só recebe incidentes da própria estação); é o modelo direto para o filtro por `empresaId`.
- `SessionAuthenticator` + `GestorAuthentication`/`OperadorAuthentication`/`PipelineAuthentication` (todos `AbstractAuthenticationToken` customizados) carregam estado próprio (`estacaoId`, por exemplo) diretamente na instância serializada na sessão — sem `AuthenticationDetailsSource` genérico. É o mecanismo que ganha `empresaId`.
- `CatalogSeeder` semeia `Estacao`/`Camera` de `application.yaml` só quando a tabela está vazia (bootstrap único, não upsert contínuo — correção feita em E2 para não desfazer edições feitas pela interface).

### 1.2 Por que "schema compartilhado com coluna solta" e não outra topologia

| Abordagem | Avaliação |
|---|---|
| **A. Schema compartilhado, `empresaId` solto em cada entidade** | **Escolhida.** Consistente com o padrão já estabelecido (nada de FK); zero infraestrutura nova de autenticação (mesmo mecanismo de campo-na-instância já usado para `estacaoId`); zero mudança de banco (continua H2 em arquivo único). |
| B. Schema por tenant (schema Postgres separado por empresa) | Rejeitada. Exigiria trocar de H2 para um banco com múltiplos schemas e um `DataSource` roteável — complexidade desproporcional ao estágio do produto e contradiz a premissa de instância única já assumida em todas as specs anteriores. |
| C. Banco por tenant (arquivo H2 dedicado por empresa) | Rejeitada. Provisionamento dinâmico de banco a cada sign-up (criar arquivo, rodar migração, gerenciar backup por banco) é operacionalmente pesado e não combina com o deploy de instância única já assumido (E1 §10, E4 §2.1). |

---

## 2. Modelo de dados

### 2.1 `Empresa` (entidade nova)

```java
@Entity
public class Empresa {
    @Id
    private String id;       // slug: "acme" — escolhido pela empresa no sign-up, validado por formato/unicidade
    private String nome;     // razão social / nome fantasia
    private boolean ativa;
}
```

`id` é o slug, não `@GeneratedValue` — mesma filosofia de `EST-01`/`CAM-01`: legível, escolhido pelo usuário, formato `^[a-z0-9-]{2,30}$`. **É imutável após criado**, pelo mesmo motivo que código de estação/câmera é imutável (E2 §4): compõe o `username` (`gestor@acme`) e o `incidentKey`; renomear reescreveria identidade em todo o histórico.

### 2.2 Entidades existentes ganham `empresaId`

| Entidade | Mudança |
|---|---|
| `Estacao` | `empresaId` (String, not null, campo solto — sem FK, mesmo padrão do resto). PK vira composta: `(empresaId, id)` via `@IdClass`. |
| `Camera` | `empresaId` (String, not null). PK vira composta: `(empresaId, id)`. `estacaoId` continua referência solta, implicitamente no mesmo tenant (validado em `CameraService`). |
| `Equipe` | `empresaId` (String, not null). PK vira composta: `(empresaId, id)`. |
| `Usuario` | `empresaId` (String, not null). PK continua `Long` gerado — não precisa compor, porque `username` (`nome@empresa`) já é globalmente único por construção. |
| `Alerta` | `empresaId` (String, not null, carimbado a partir da câmera que gerou o incidente). PK continua `Long`. `incidentKey` ganha `empresaId` como parte da string (`empresaId:cameraId:runId:trackId:timestamp`) — mesmo motivo do `cameraId` já estar lá: chave de depuração legível, e não pode colidir entre empresas. |
| `WebhookSubscription` | `empresaId` (String, not null). |
| `WebhookDelivery` | Sem campo próprio — herda o escopo via `subscriptionId` (mesmo padrão de referência solta já usado). |

`@IdClass` foi escolhido em vez de `@EmbeddedId` por ser mais direto de mapear em cima dos repositórios `String`-based que já existem (menos código de adaptação nos DTOs/services atuais).

### 2.3 Chave composta: por que não manter `codigo` como PK simples

Alternativa considerada: manter `codigo` como PK simples e só adicionar `empresaId` como coluna comum, com unicidade composta validada em serviço (mesmo padrão de `estacaoId+turno` em `Equipe`). Rejeitada: duas empresas diferentes quase certamente vão querer usar `EST-01` — deixar `codigo` como PK simples criaria contenção entre clientes que não se conhecem (empresa nova não pode usar um código que outra já usou), o que é inaceitável num SaaS multi-cliente.

---

## 3. Autenticação e escopo por sessão

### 3.1 Formato de username

`nome@empresa` (ex.: `gestor@acme`) — resolve o tenant a partir do próprio username no login, sem campo extra na tela. `Usuario.username` é a string completa, única globalmente (a unicidade dela garante que duas empresas não colidem, mesmo com `nome` repetido). `/login` e `/login-estacao` **não mudam** de formato — continuam um único campo de usuário/senha ou token; `nome@empresa` é convenção de conteúdo, não campo novo.

### 3.2 `Authentication` customizados ganham `empresaId`

Cada um dos três tipos já existentes (`GestorAuthentication`, `OperadorAuthentication`, `PipelineAuthentication`) ganha um campo `empresaId`, resolvido no momento da autenticação:

| Tipo | Origem do `empresaId` |
|---|---|
| `GestorAuthentication` | `Usuario.empresaId`, no `AuthController.login` |
| `OperadorAuthentication` | `Estacao.empresaId`, resolvida pelo token no `login-estacao` |
| `PipelineAuthentication` | `Camera.empresaId`, resolvida pela `X-Cypher-Key` no filtro de ingestão |

Nenhuma infraestrutura nova: mesmo padrão já usado para `estacaoId` (campo na própria classe de `Authentication`, persistido porque a instância inteira é serializada na sessão via `SessionAuthenticator`).

### 3.3 Escopo de query

Um helper único (`TenantContext.currentEmpresaId()`, lê `SecurityContextHolder` e faz `instanceof` nos três tipos) é chamado no início de todo método de service que lista/busca/cria recurso: `EstacaoService`, `CameraService`, `EquipeService`, `UsuarioService`, `AlertaService`/serviço de incidentes, `WebhookSubscriptionService`. Cada repositório ganha `findByEmpresaIdAnd...` no lugar do `find...` puro.

`POST /api/v1/setup`: a checagem `usuarios.count() > 0` vira `usuarios.countByEmpresaId(slugDigitadoNoFormulario) > 0` — nesse ponto específico ainda não existe sessão, então o "empresaId" é o slug recém-digitado no formulário de sign-up, não um valor de contexto.

### 3.4 SSE

Generaliza o filtro que já existe (`Subscription(emitter, estacaoId)`, em `IncidentSseService`) para `Subscription(emitter, empresaId, estacaoId)` — mesmo mecanismo, mais um nível de filtro aplicado antes do de estação.

---

## 4. `cypher-capture`: nenhuma mudança

O pipeline já se autentica só por `X-Cypher-Key` (segredo por câmera, já globalmente único hoje, independente de empresa). Com chave composta no backend, `GET /api/v1/cameras/{codigo}/config` resolve `(empresaId da chave, codigo da URL)` — o `codigo`, que seria ambíguo entre empresas, deixa de ser ambíguo porque a própria API key já fixa o tenant antes do path param ser interpretado. `CameraConfigClient`, `--camera-id`, cache local (`outputs/camera-config-cache.json`): tudo continua igual.

---

## 5. `cypher-front`: o que muda

- **Onboarding — passo "Identidade da empresa":** hoje só grava nome/CNPJ/cor em `localStorage`, sem efeito no backend (E4 §6). Ganha o campo slug e passa a criar a `Empresa` de verdade via backend.
- **Rota `''`:** hoje consulta `GET /api/v1/setup/status` (flag global "já existe algum Usuario?") via guard `canActivateOnboarding` para decidir entre onboarding e `/login` (E4 §4.2/§4.3). Deixa de fazer sentido em multi-tenant — sempre vai existir "algum Usuario" assim que a primeira empresa se cadastrar, e isso não pode bloquear a segunda. `GET /api/v1/setup/status` e `canActivateOnboarding` são **removidos**. `''` vira uma tela simples com duas ações lado a lado: "Criar empresa" (abre o wizard) / "Entrar" (`/login`).
- **`AuthService`/`GET /auth/me`:** corpo de resposta ganha `empresaId`/`empresaNome`, para exibir o nome da empresa na topbar (mesmo padrão de já exibir `papel`/`estacaoId`).
- **`IncidentService`, `CatalogService`, `TeamService`:** não mudam. O escopo por empresa é resolvido inteiramente no backend a partir da sessão; o front nunca envia nem precisa saber `empresaId` explicitamente em nenhuma chamada.

---

## 6. Migração e seed

O H2 atual (`data/cypherdb.mv.db`) contém só dado de demonstração — mesmo tratamento já aplicado em E1 §5.2: apagar e deixar o Hibernate recriar o schema com as colunas novas (`ddl-auto: update` não relaxa `NOT NULL` em coluna existente, então não há caminho incremental). `CatalogSeeder` precisa de uma `Empresa` "demo" para semear as 4 estações/câmeras de `application.yaml` sob ela — vira o único lugar onde uma empresa é criada fora do fluxo de sign-up, exclusivamente para ambiente de desenvolvimento.

---

## 7. Comportamento sob falha

| Falha | Comportamento |
|---|---|
| Slug de empresa já existe no sign-up | `POST /api/v1/setup` responde `409`, mesmo contrato de hoje — só que a checagem passa a ser por slug, não global |
| Slug com formato inválido | `422`, mesmo padrão de `EST-01`/`CAM-01` (E2 §4) |
| Código de estação/câmera duplicado dentro da mesma empresa | `409`, como hoje |
| Mesmo código em empresas diferentes | Aceito — chave composta os distingue |
| `X-Cypher-Key` de câmera de uma empresa usada para acessar recurso doutra | Nunca ocorre — a chave já resolve o `empresaId`, e todo lookup subsequente é escopado por ele; não há como uma chave "vazar" para fora do próprio tenant |
| GESTOR de uma empresa tenta acessar recurso doutra (ex.: manipular URL com `codigo` de estação alheia) | `404`/`403` — `TenantContext.currentEmpresaId()` escopa a busca antes de checar existência |

---

## 8. Estratégia de testes

**Java** — isolamento entre tenants é o eixo central: duas empresas com o mesmo `codigo` de estação/câmera não colidem; GESTOR de uma empresa não lista/acessa recursos de outra (todas as combinações de `GET`/`PUT`/`DELETE` de catálogo, equipes, usuários, incidentes); SSE não vaza evento de uma empresa para assinante de outra; `POST /api/v1/setup` aceita slugs diferentes em paralelo e rejeita (`409`) o mesmo slug duas vezes; `TenantContext` resolvendo corretamente a partir dos três tipos de `Authentication`.

**Angular** — passo de onboarding criando `Empresa` real; rota `''` mostrando as duas ações em vez do guard; topbar exibindo `empresaNome` vindo de `/auth/me`.

**Ponta a ponta** — duas empresas cadastradas via sign-up, cada uma com sua própria estação/câmera/equipe, confirmando que o dashboard de uma nunca mostra incidente da outra, mesmo com códigos de câmera idênticos entre elas.

---

## 9. Fora de escopo

- Painel de super-admin para visualizar/gerenciar empresas entre si (suporte, billing) — não foi pedido.
- Cobrança/planos por empresa.
- Branding avançado por empresa (logo, domínio próprio) — os campos `nome`/`cor` do onboarding já existem e continuam como estão.
- **Cadastro de webhook pela interface** — gap separado, registrado em `2026-08-10-...` §9. Fica de fora desta entrega; `WebhookSubscription.empresaId` já fica pronto para quando essa tela for construída.
- Migração de dado real de produção existente (o H2 atual só tem dado de demonstração — ver §6).
- Papel de administrador de sistema separado de `GESTOR` (mencionado como fora de escopo em E4 §6, não reaberto aqui).

---

## 10. Premissas

- Deploy de instância única continua valendo (mesma premissa de E1 §10 e E4 §2.1) — SSE por instância, sem particionamento entre nós.
- H2 em arquivo permanece a persistência; nenhuma migração de banco nesta entrega.
- O slug da empresa, uma vez usado em produção real, nunca muda — mesma garantia dada a códigos de estação/câmera.

---

## 11. Ordem de implementação

O contrato de `Empresa` + `empresaId` em cada entidade (§2) é o ponto de sincronização.

1. **Backend — modelo.** `Empresa`, `empresaId` em todas as entidades, chaves compostas, migração/recriação do H2, seed de empresa "demo" no `CatalogSeeder`.
2. **Backend — autenticação.** `empresaId` nos três `Authentication`, `TenantContext`, `POST /api/v1/setup` reescrito para escopo por slug.
3. **Backend — escopo de query.** Todo repositório/service filtrando por `empresaId`; SSE filtrando por `empresaId`.
4. **Frontend.** Passo de onboarding com slug, rota `''` com as duas ações, `AuthService` exibindo empresa.
5. **Ponta a ponta.** Duas empresas simultâneas, confirmando isolamento total.

`cypher-capture` não é tocado (§4) — sem branch dedicada.
