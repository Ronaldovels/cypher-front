# Cypher E4 — Acesso e Equipes

**Data:** 2026-08-23
**Status:** aprovado (design)
**Escopo:** **Entrega E4** do roteiro (`2026-08-10-notificacao-de-incidentes-design.md` §14): login, papéis, guards, proteção de endpoints e cadastro de equipes com alocação a estações e turno.

Este documento é o contrato de sincronização entre as três frentes (`cypher` backend, `cypher-capture`, `cypher-front`), no mesmo papel que §3 cumpriu para E1: fixado aqui, os três planos avançam sem precisar reinventar a mesma decisão de formas diferentes.

---

## 1. Ponto de partida

As decisões de E1 (`2026-08-10-...` §15) e a restrição descoberta em E3 (mesma spec, nota de 2026-08-23 no fim de §15) já estão fixadas e **não são reabertas aqui**:

- Sessão por cookie `HttpOnly` para o front inteiro (`EventSource` não aceita header customizado).
- Três tipos de cliente, três mecanismos: pipeline por chave de API, gestor por usuário/senha, kiosk por token de estação.
- Único endpoint público hoje seria `/login`; não existe health check ainda (novo nesta entrega, §5).
- O dock do kiosk precisa migrar de "escondido por rota" para "escondido por papel de sessão".

Estado real dos três repositórios (levantado em 2026-08-23, antes de qualquer código de E4):

**`cypher` (backend, `/home/asaas/projects/cypher`, Spring Boot 4.0.6 / Java 21).** Nenhuma dependência de segurança no `pom.xml`, nenhuma classe de usuário/papel/equipe. `CorsConfig` já está com `allowCredentials(true)` e um comentário citando §15 — só falta a autenticação em si. `CameraAdminResponse` (`dto/CameraAdminResponse.java`) já documenta a intenção: *"Separar as duas representações é a fronteira que E4 vai proteger."* `CatalogSeeder` popula `Estacao`/`Camera` a partir de `application.yaml` (`cypher.catalog.stations`/`cameras`) — é o padrão a seguir para o usuário-semente. Não existe `/actuator` nem qualquer health check.

**`cypher-capture` (`/home/asaas/projects/challenge/cypher-capture`, Python).** `HttpIncidentSink`/`RequestsTransport` (`src/notify/sink.py`) fazem `POST`/`PATCH` sem nenhum header. `NotifyConfig` (`src/notify/__init__.py`) não tem campo de chave. O precedente de segredo já existe: `CameraConfigClient` (`src/capture/config_client.py`) resolve placeholders `${VAR}` a partir de variáveis de ambiente (`.env`, gitignorado), nunca grava segredo em YAML.

**`cypher-front` (`/home/asaas/projects/challenge/cypher-front`, Angular standalone + signals, branch atual `dev`).** Zero guards, zero rotas protegidas (`app.routes.ts`). O dock hoje é escondido por composição: `StationKioskComponent` simplesmente não importa `<app-dock>` — é esse o ponto exato que migra para decisão por papel. `IncidentService` já manda `withCredentials: true` em toda chamada. Nenhum `FormGroup`/`ReactiveFormsModule` no app — o padrão de formulário é signal de rascunho + `patch()` (`config/settings/identity-tab.component.ts`). `DockComponent` já tem um item "Colaboradores" sem rota — gancho natural para `/config/equipe`.

---

## 2. Modelo de acesso

### 2.1 Mecanismo de sessão

**Decisão (confirmada com o usuário): `HttpSession` padrão do Spring Security, cookie `JSESSIONID`.** Não JWT. O deploy é de instância única (mesma premissa de §5.3/§9 da spec de E1 — SSE já só funciona numa instância), então sessão em memória nunca fica presa na instância errada. Nenhuma dependência nova além de `spring-boot-starter-security`.

### 2.2 Dois papéis, dois fluxos de login

| Papel | Entra por | Endpoint | O que autentica |
|---|---|---|---|
| `GESTOR` | usuário + senha | `POST /api/v1/auth/login` | `Usuario` (nova entidade) |
| `OPERADOR` | token de estação | `POST /api/v1/auth/login-estacao` | `Estacao.token` (novo campo) |

Os dois terminam no mesmo lugar: uma `HttpSession` autenticada, cookie `JSESSIONID` `HttpOnly`, `SameSite=Lax` (front em `localhost:4200` e backend em `localhost:8080` são origens diferentes mas **mesmo site** — `SameSite=Lax` já cobre XHR/fetch e `EventSource` cross-origin-mesmo-site; não precisa de `SameSite=None`+`Secure`). `Secure` fica `false` em dev (HTTP puro) e `true` em produção via profile.

Por que dois endpoints e não um polimórfico: a assimetria já é o padrão do projeto (spec de E1 §3.4, "A assimetria é deliberada" para `PATCH` vs `PUT`). Um corpo só com `username`/`password` **ou** `token` é mais difícil de validar com Bean Validation do que dois DTOs simples.

```
POST /api/v1/auth/login
{ "username": "gestor1", "password": "..." }
→ 200, Set-Cookie: JSESSIONID=...; HttpOnly; SameSite=Lax
  body: { "papel": "GESTOR", "username": "gestor1" }
→ 401 se credencial inválida

POST /api/v1/auth/login-estacao
{ "token": "est-tok-a3f9c2..." }
→ 200, Set-Cookie: JSESSIONID=...
  body: { "papel": "OPERADOR", "estacaoId": "EST-04" }
→ 401 se token inválido ou estação inativa

POST /api/v1/auth/logout
→ 204, invalida a sessão

GET /api/v1/auth/me
→ 200 com o mesmo formato de body do login, a partir da sessão atual
→ 401 se não autenticado
```

`GET /api/v1/auth/me` existe porque o cookie por si só não diz nada ao Angular — é a chamada que o `AuthService` faz no boot da aplicação para descobrir "quem sou eu" depois de um refresh de página, exatamente o papel que `/summary` cumpre para os KPIs.

### 2.3 Terceiro mecanismo: chave de API do pipeline

Sem sessão, sem cookie — o pipeline Python é uma máquina, roda sem browser. Header `X-Cypher-Key` (nomenclatura consistente com `X-Cypher-Signature`/`X-Cypher-Timestamp`, já usados por `WebhookDispatcher`). A chave é **por câmera**, não global: `Camera` ganha uma coluna `apiKey` (gerada no cadastro, mesmo padrão de token de estação em §2.4). Um filtro dedicado (antes do filtro de sessão na cadeia) valida `X-Cypher-Key` contra `CameraRepository` nos endpoints de ingestão (`POST`/`PATCH /api/v1/incidents`) e, se válido, autentica com uma authority própria (`ROLE_PIPELINE`) sem tocar a sessão HTTP.

### 2.4 Token de estação

`Estacao` ganha uma coluna `token` (string opaca, gerada no cadastro — mesmo gerador de `UUID`/`SecureRandom` usado para `apiKey` de câmera). Exposto só na superfície de administração: `EstacaoAdminResponse` (novo DTO, no mesmo espírito de `CameraAdminResponse` — separa o que o dashboard vê do que a tela de cadastro vê). Endpoint `POST /api/v1/stations/{id}/token/regenerate` (só `GESTOR`) para rotacionar sem recriar a estação. Provisionar o kiosk é: gestor abre `/config/estacoes` (tela já existente de E2), copia o token, cola uma vez na tela de login do dispositivo (`/login-estacao` no front, §4.2).

### 2.5 `Usuario` e o problema do primeiro acesso

**Revisado em 2026-08-23, segunda rodada de design.** A resolução original (seed estático a partir de `application.yaml`) foi descartada: o onboarding já existente (`cypher-front`, rota `''`) é a superfície natural para criar o gestor mestre — é a tela que já configura a empresa (identidade, estações, EPIs, CAs) na primeira execução, e hoje grava só em `localStorage`, sem nenhum efeito no backend.

**Decisão:** o onboarding deixa de ser uma tela que roda em toda visita e passa a ser um **setup de execução única**. Um passo novo do wizard ("Usuário mestre", logo após "Identidade da empresa") coleta usuário/senha do gestor. Ao concluir (`launch()`), o front chama um endpoint de bootstrap novo que cria o `Usuario` mestre e autentica a sessão de resposta — a demonstração cai direto em `/dashboard` sem passar por `/login`. Esse é o único usuário criado fora do CRUD de `/config/equipe`; todo gestor seguinte é cadastrado pelo mestre já autenticado.

```
GET  /api/v1/setup/status
→ 200 { "configured": false }   — nenhum Usuario existe ainda, front mostra o onboarding
→ 200 { "configured": true }    — já existe ≥1 Usuario, front redireciona '' → /login
     público, sem sessão

POST /api/v1/setup
{ "username": "admin", "password": "..." }
→ 200, Set-Cookie: JSESSIONID=...; HttpOnly; SameSite=Lax
  body: { "papel": "GESTOR", "username": "admin" }     — mesmo formato de /auth/login
→ 409 se já existe qualquer Usuario (endpoint de execução única, não um segundo /register)
     público, sem sessão — é o único jeito de criar o primeiro Usuario
```

`POST /api/v1/setup` reaproveita a mesma validação/hash (BCrypt) e o mesmo mecanismo de sessão de `POST /api/v1/auth/login` — a diferença é só a pré-condição (tabela vazia) e o efeito colateral (cria em vez de autenticar um existente). Implementação sugerida: `UsuarioService.criarPrimeiroGestor(...)` chamado por um `SetupController` dedicado, sem duplicar a lógica de hash/sessão do `AuthController`.

**Por que não um seed de config:** um seed em `application.yaml` exige alguém com acesso ao servidor para trocar a credencial antes do deploy — não existe tela nenhuma para isso. Com o setup vivendo no onboarding, a credencial do gestor mestre é definida pela mesma pessoa que configura a empresa, na mesma sessão, sem tocar em arquivo de configuração.

**Consequência para a rota `''` do front (§4.2):** deixa de ser "sempre mostra o onboarding" e passa a consultar `GET /api/v1/setup/status` antes de decidir entre onboarding e `/login`.

### 2.6 Endpoints e proteção

| Endpoint | Método | Público / Papel | Observação |
|---|---|---|---|
| `/api/v1/health` | GET | público | novo, hand-rolled (`{"status":"UP"}`) — não existe hoje |
| `/api/v1/setup/status` | GET | público | novo (§2.5) — sinaliza se o onboarding já rodou |
| `/api/v1/setup` | POST | público, execução única | novo (§2.5) — 409 se já existe `Usuario` |
| `/api/v1/auth/login` | POST | público | |
| `/api/v1/auth/login-estacao` | POST | público | |
| `/api/v1/auth/logout` | POST | GESTOR ou OPERADOR | |
| `/api/v1/auth/me` | GET | GESTOR ou OPERADOR | |
| `/api/v1/incidents` | POST/PATCH | `X-Cypher-Key` (câmera) | ingestão — sessão não se aplica |
| `/api/v1/incidents` | GET | GESTOR; OPERADOR restrito à própria `estacaoId` | |
| `/api/v1/incidents/stream` | GET (SSE) | GESTOR; OPERADOR restrito à própria `estacaoId` | motivo original da decisão de cookie (§15 de E1) |
| `/api/v1/incidents/{id}` | GET | GESTOR; OPERADOR restrito à própria `estacaoId` | |
| `/api/v1/incidents/{id}/status` | PUT | GESTOR; OPERADOR restrito à própria `estacaoId` | reconhecimento pelo operador (E3) continua funcionando |
| `/api/v1/summary` | GET | GESTOR | dashboard do gestor |
| `/api/v1/cameras`, `/api/v1/stations` | GET (lista) | GESTOR ou OPERADOR | navegação |
| `/api/v1/cameras/{id}` | GET | GESTOR | admin, inclui `fonte` — fronteira que `CameraAdminResponse` já anunciava |
| `/api/v1/cameras`, `/api/v1/stations` | POST/PUT/DELETE | GESTOR | cadastro (E2) |
| `/api/v1/cameras/{id}/config` | GET | `X-Cypher-Key` (câmera) ou GESTOR | superfície de máquina (pipeline no boot) |
| `/api/v1/stations/{id}/token/regenerate` | POST | GESTOR | novo |
| `/api/v1/teams` | GET/POST/PUT/DELETE | GESTOR | novo (§3) |
| `/api/v1/users` | GET/POST/PUT/DELETE | GESTOR | novo (§2.5) |

Restrição "OPERADOR restrito à própria `estacaoId`" não é só UI: o backend filtra/rejeita — a sessão do operador carrega a `estacaoId` como detalhe da autenticação (implementação de `Authentication` customizada ou `AuthenticationDetailsSource`), e cada controller que lista/retorna incidente ou câmera compara contra ela antes de responder.

---

## 3. `Equipe` — modelo de dados

Conforme §16.1 da spec de E1: a unidade é a equipe, não a pessoa; alocação estática, sem escala por data; setor é campo texto livre na estação (não uma entidade própria — mesma decisão de §12).

```java
@Entity
@Table(name = "equipes")
public class Equipe {
    @Id
    private String id;          // ex.: EQ-01

    @Column(nullable = false)
    private String nome;        // "Equipe A"

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Turno turno;        // MANHA, TARDE, NOITE

    @ElementCollection
    @CollectionTable(name = "equipe_estacoes", joinColumns = @JoinColumn(name = "equipe_id"))
    @Column(name = "estacao_id")
    private List<String> estacaoIds;  // uma equipe cobre uma ou mais estações, num turno

    private boolean ativa;
}
```

Uma equipe cobre uma ou mais estações **dentro de um único turno** — reflete o wireframe (equipe do turno da manhã cobre um conjunto de estações). Não há relação inversa obrigatória: uma estação pode não ter equipe alocada (aparece como "sem equipe" no cadastro) e, em tese, mais de uma equipe pode cobrir a mesma estação em turnos diferentes — a unicidade é `(estacaoId, turno)` a nível de aplicação, validada no `EquipeService`, não como constraint de banco (mesma escolha feita para `setor` em §12 da spec de E1: fragilidade aceita conscientemente em troca de não modelar mais uma entidade agora).

---

## 4. `cypher-front` — o que muda

**Padrão de design, vale para toda tela nova desta seção (o novo passo de onboarding, `/login`, `/login-estacao`, as abas Equipes/Usuários):** reaproveitar 100% os primitivos globais já existentes em `src/styles.scss` (`.field`, `.input`, `.select`, `.btn`, `.panel`, `.field-error`, `eyebrow-accent`) e o padrão de formulário "signal de rascunho + `patch()`" já usado por `identity-tab.component.ts` e pelos steps de onboarding — nenhum CSS por componente (`styleUrl`), nenhum `ReactiveFormsModule`, nenhuma biblioteca de UI nova. Nenhuma tela de E4 introduz um padrão visual próprio; todas herdam o que já existe.

### 4.1 Dock por papel, não por rota

Hoje: `StationKioskComponent` não importa `<app-dock>` — é a única tela sem navegação por composição direta. Isso continua sendo a decisão de layout do kiosk (a spec de E1 §14.1 já diz "o kiosk é a única tela sem navegação"), mas o *motivo* pelo qual ele não tem dock deixa de ser "essa página nunca importa o componente" e passa a ser "esta sessão é `OPERADOR`". Concretamente: um `AuthService` novo expõe `role: Signal<'GESTOR' | 'OPERADOR' | null>`; páginas que hoje sempre renderizam `<app-dock>` passam a fazer `@if (auth.role() === 'GESTOR')`. Isso não é reabrir E3 — nenhuma tela de E3 muda de layout por si, só o `*ngIf`/`@if` ao redor de `<app-dock>` em cada uma delas ganha a condição.

### 4.2 Rotas novas

```
/login             GESTOR faz login (usuário/senha)
/login-estacao     kiosk faz login (token da estação) — tela separada, sem campo de senha
```

A rota `''` (hoje sempre `OnboardingComponent`) passa a consultar `GET /api/v1/setup/status` antes de renderizar: `configured: false` mostra o wizard; `configured: true` redireciona para `/login`. Essa checagem é resolvida por um guard funcional (`canActivateOnboarding`) na própria entrada da rota `''`, seguindo o mesmo formato `CanActivateFn` de §4.3 — não uma condição dentro do componente.

`/config/equipe` (já prevista no mapa de telas, §14.1 da spec de E1) ganha duas abas, seguindo o padrão de abas já usado em `SettingsPageComponent` (`identidade`, `epis`, `cas`, `estacoes`): **Equipes** (CRUD de `Equipe`, alocação de estações e turno) e **Usuários** (CRUD de `Usuario` — só nome de usuário e papel; redefinição de senha é a única ação sensível, sem tela de "esqueci minha senha" nesta entrega).

### 4.2.1 Onboarding: novo passo "Usuário mestre"

O wizard (`STEPS` em `onboarding/models/onboarding.models.ts`) ganha um sexto passo, logo após "Identidade da empresa" e antes de "Estações e câmeras": pede `username`/`password` do gestor mestre, com a mesma validação por chave já usada por `OnboardingService.validateStep` (nunca por índice — ver comentário existente no serviço). O componente do passo (`step-master-user`, ao lado de `step1-identity`, `step2-epis` etc.) segue exatamente o padrão de `Step1IdentityComponent`: `state = inject(OnboardingService)`, template usando `.field`/`.input`/`.field-error` do design system global, sem `styleUrl` próprio.

No `launch()` (`OnboardingService`), a chamada a `persistConfig()` (hoje só `localStorage`) passa a ser precedida por `POST /api/v1/setup` com o usuário/senha coletados no novo passo — sucesso autentica a sessão e o fluxo segue para `/dashboard` como já acontece hoje; falha (409, ou erro de rede) mantém o usuário no passo de confirmação com um erro visível, sem avançar.

Isso é uma mudança de escopo do onboarding, não só de conteúdo: a tela deixa de ser cosmética (grava local, sem consumidor) e passa a ter um efeito real e único no backend. O restante dos dados do wizard (identidade, estações, EPIs, CAs) continua sendo gravado como hoje nesta entrega — E4 não estende o onboarding para persistir catálogo no backend, só o usuário mestre.

### 4.3 Guards

```typescript
canActivateGestor: CanActivateFn      // redireciona para /login se auth.role() !== 'GESTOR'
canActivateOperador: CanActivateFn    // redireciona para /login-estacao se auth.role() !== 'OPERADOR', valida :id contra auth.estacaoId()
canActivateAutenticado: CanActivateFn // qualquer papel — usado em nada por enquanto, mas existe para simetria
canActivateOnboarding: CanActivateFn  // consulta GET /api/v1/setup/status; false → deixa passar (mostra o wizard); true → redireciona para /login
```

`/estacao/:id` usa `canActivateOperador` **ou** libera para `GESTOR` (a restrição descoberta em E3, registrada em 2026-08-23 na spec de E1: um gestor autenticado pode supervisionar qualquer estação, mantendo o dock).

### 4.4 `AuthService`

Segue o padrão de `IncidentService`/`ConfigService`: store de signals, `withCredentials: true` em toda chamada. No boot do `APP_INITIALIZER` (ou resolvido lazily no primeiro guard), chama `GET /api/v1/auth/me`; `401` vira `role: null` sem lançar erro — silêncio aqui não é falha, é "ainda não logado".

---

## 5. `cypher-capture` — o que muda

`NotifyConfig` ganha um campo (`api_key_env`, não `api_key`) apontando para o nome de uma variável de ambiente — mesmo padrão de `expand_placeholders` já usado por `config_client.py` para credencial de câmera, nunca a chave em texto puro no YAML versionado:

```yaml
notify:
  camera_id: CAM-01
  api_url: http://localhost:8080/api/v1
  api_key_env: CYPHER_KEY_CAM01   # nome da env var; o valor vem do .env do host
```

`RequestsTransport.post`/`.patch` (`src/notify/sink.py`) passam a mandar `headers={"X-Cypher-Key": resolved_key}` quando configurado. Sem `api_key_env` configurado, nenhum header é enviado — mesmo comportamento de hoje, para não quebrar quem ainda não migrou.

**Risco de sequenciamento, vale para as três frentes:** no momento em que o backend passa a **exigir** `X-Cypher-Key` (em vez de só aceitar quando presente), qualquer pipeline sem a env var configurada começa a receber `401` na ingestão. A ordem correta: (1) capture manda o header sempre que configurado — inofensivo enquanto o backend não exige; (2) backend valida e aceita quando presente, mas só passa a **rejeitar ausência** depois que (1) já estiver implantado. O plano do backend deve tratar a obrigatoriedade como o último passo, não o primeiro.

---

## 6. Fora de escopo de E4

- Tela de "esqueci minha senha" / recuperação de conta.
- Auto-registro público de gestor além do bootstrap único (`POST /api/v1/setup`, §2.5) — esse endpoint cria exatamente um `Usuario` e se fecha (409) depois disso; não é um `/register` reaberto.
- Escala de equipe por data (§16.1 da spec de E1: alocação estática).
- Expiração/rotação automática de token de estação (só rotação manual via `/token/regenerate`).
- Rate limiting de login.
- Papel adicional além de `GESTOR`/`OPERADOR` (ex.: administrador de sistema separado do gestor).

## 7. Ordem de implementação sugerida

1. **Backend — `Usuario`, `/api/v1/setup` + `/setup/status`, `Equipe`, `Estacao.token`, `Camera.apiKey`, Spring Security com sessão, `/auth/*`, filtro de `X-Cypher-Key` em modo permissivo (aceita se presente, não exige).** Verificável com `curl` isolado do resto.
2. **Capture — envia `X-Cypher-Key` quando configurado.** Não quebra nada porque o backend ainda não exige (passo 1).
3. **Front — `AuthService`, guards (incluindo `canActivateOnboarding`), `/login`, `/login-estacao`, passo de onboarding "Usuário mestre", dock por papel, `/config/equipe` (equipes + usuários).**
4. **Backend — flip final: `X-Cypher-Key` obrigatório na ingestão; todos os demais endpoints deixam de responder sem sessão.** Só depois que 2 e 3 estiverem implantados.

Os passos 1–3 são demonstráveis e reversíveis independentemente; o passo 4 é o único que quebra quem não migrou, e por isso vem por último.
