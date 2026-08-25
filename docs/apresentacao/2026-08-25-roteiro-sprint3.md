# Roteiro — Mentoria Sprint 3 (5 minutos)

**Data:** 2026-08-25
**Contexto:** checkpoint de mentoria do Challenge SPI/FIAP, cobrindo a evolução entregue até a Entrega E4 (acesso e equipes) e a gestão ágil da Sprint 3.
**Formato:** pitch cronometrado de 5 minutos, todos os integrantes falam. Slides de código-fonte (item 6 do formato longo) ficam como apêndice, fora do timer — mostrados só se sobrar tempo ou a banca pedir.

---

## 0:00 – 0:30 · Hook + contexto

**Frase de impacto (sugestão):** *"Todo acidente que a gente detecta em tempo real é um acidente que não vira estatística."*

- Identificação do grupo: Cypher — Industrial Vision AI, Challenge SPI/FIAP, squad [PREENCHER: nomes completos + RM de cada integrante].
- Fase atual: Entrega E4 concluída (acesso, papéis e equipes) — quarta de uma série de entregas incrementais (E1 notificação de incidentes → E2 cadastro/câmeras → E3 operação/timeline → E4 acesso/equipes).
- Problema atacado nesta fase: até E3, qualquer pessoa com a URL acessava dashboard, câmeras e dados de incidentes — não havia login, papel ou proteção de endpoint. E4 fecha esse buraco antes de levar o sistema para a Metaindústria.

---

## 0:30 – 1:30 · Solução proposta

**Visão geral da arquitetura (uma frase por camada):**
- `cypher-capture` (Python): visão computacional em tempo real — YOLOv8 (EPIs) + YOLO11-pose/ByteTrack (postura e queda) — decide quando um incidente começa e termina, e agora assina cada notificação com uma API key por câmera (`X-Cypher-Key`).
- `cypher` (Spring Boot 4 / Java 21): recebe, persiste e expõe os incidentes via REST + SSE; ganhou nesta entrega `Usuario`, `Equipe`, sessão `HttpSession`/cookie `JSESSIONID` e proteção por papel em todo endpoint.
- `cypher-front` (Angular 21, standalone + signals): dashboard, heatmap, timeline de incidentes, cadastro e agora telas de login (`/login`, `/login-estacao`) com navegação (dock) condicionada ao papel da sessão, não mais à rota.

**Decisões-chave e justificativas:**
- **Dois papéis, dois fluxos de login** (`GESTOR` por usuário/senha, `OPERADOR` por token de estação) em vez de um endpoint polimórfico — a mesma assimetria deliberada já usada em outras partes do contrato (mais fácil de validar que um corpo genérico).
- **Sessão em cookie `HttpOnly`, não JWT** — deploy de instância única, `EventSource` (SSE) não aceita header customizado, então cookie é a única opção que cobre autenticação e stream ao mesmo tempo.
- **Onboarding virou setup de execução única**: em vez de seed via `application.yaml` (exigiria acesso ao servidor), a primeira tela do sistema cria o gestor mestre — a credencial nasce na mesma sessão em que a empresa é configurada.

**Diagrama em uma única figura:** ver `docs/superpowers/specs/2026-08-23-acesso-e-equipes-e4-design.md` §1 (estado dos três repositórios) e §2.6 (tabela de endpoints e proteção) como fonte para o diagrama de integração a desenhar no Figma (câmera → capture → backend → front, com os três mecanismos de autenticação — chave de API, sessão de gestor, sessão de operador — como três setas distintas chegando no backend).

---

## 1:30 – 3:30 · Demo / resultados

**Roteiro de demo sugerido (vídeo curto ou ao vivo):**
1. Login do gestor (`/login`) → dashboard com KPIs e heatmap reais.
2. Pipeline real processando `cenario2.mp4` → incidente aparece na timeline (`/incidentes`) segundos depois, com SSE atualizando ao vivo.
3. Abrir o incidente (`/incidentes/:id`): severidade, categoria de postura, score REBA, EPIs ausentes.
4. Trocar de sessão para `/login-estacao` (token da estação) → mostrar que o operador só vê a própria estação e não tem acesso ao dashboard do gestor (dock muda por papel, não por rota).
5. `/config/equipe` — cadastro de equipes com alocação de estações e turno.

**Métricas reais (usar como texto na tela, não só falado):**
- Recall de risco imediato (queda): **0,986** — meta era 0,90.
- Latência de inferência (GPU, p95): **39,6–44,9 ms**, dentro do orçamento de 200ms end-to-end.
- Testes automatizados (contagem atual, pós-E4, executados em 2026-08-25): **388/388** (backend) + **282/282** (front) + **214/214** (capture) — todos verdes. A verificação ponta a ponta com os três serviços rodando simultaneamente (E3, antes de E4 adicionar segurança) está em `docs/e3-verificacao.md`, com contagens da época (138/169).

**Casos de borda a mencionar:**
- `snapshotUrl: null` quando o Cloudinary não está configurado — a tela de detalhe mostra "processando imagem" em vez de quebrar.
- Câmera sem pipeline rodando mostra "câmera indisponível" na grade de estações — comportamento esperado, não bug.
- Acurácia de ergonomia cai para 0,78 em filmagem frontal (limitação 2D, documentada, plano é refilmar de perfil).

---

## 3:30 – 4:30 · Out of the Box

O que não é óbvio e diferencia de "qualquer time poderia ter feito isso":

- **A agregação frame→incidente já validada por 89 testes foi deliberadamente mantida em Python**, em vez de reescrita em Java — decisão consciente para não jogar fora a lógica mais testada do projeto (histerese assimétrica, `enter_frames_risk=2`/`exit_frames=45`) só por purismo de arquitetura em camadas.
- **O onboarding, uma tela que hoje só gravava em `localStorage`, virou o mecanismo real de bootstrap de segurança** do sistema — em vez de criar uma tela nova de "criar admin", reaproveitou-se um fluxo que já existia e já fazia sentido para o usuário (configurar a empresa na primeira execução).
- **Autenticação com três mecanismos coexistindo sem se atropelar**: chave de API (máquina, sem sessão), sessão de gestor, sessão de operador restrita à própria estação — tudo na mesma cadeia de filtros do Spring Security, sem introduzir JWT ou um segundo servidor de autenticação.
- **Honestidade metodológica como prática, não discurso**: limitações reais (acurácia 2D, snapshot ausente sem Cloudinary) são documentadas e demonstradas, não escondidas — inclusive achados de revisão de segurança (bypass de path percent-encoded no filtro de API key) foram corrigidos e registrados no histórico, não varridos para debaixo do tapete.

---

## 4:30 – 5:00 · Próximos passos

- **Plano para a fase seguinte:** evoluir o protótipo Figma com os fluxos que E4 introduziu (login, cadastro de equipes) e formalizar a gestão da Sprint 3 no Trello (Product Backlog, Sprint Backlog, cerimônias documentadas — ver `docs/scrum/sprint-3/`).
- **Riscos identificados:**
  - Multi-empresa (multi-tenant) nunca virou spec — registrado para avaliação futura, hoje o sistema é single-tenant por decisão consciente.
  - Cadastro de webhook só existe via `application.yaml` + restart, sem tela — se a Metaindústria pedir configuração self-service, isso vira gap.
  - Rotação/expiração automática de token de estação e rate limiting de login ainda não existem.
- **Ask explícito:** feedback da banca sobre priorizar, na próxima entrega, (a) interface de cadastro de webhook ou (b) endurecer segurança (rate limiting, rotação automática de token) antes de ir para validação industrial na Metaindústria.

---

## Apêndice (fora do timer, se sobrar tempo)

- **Principais códigos desenvolvidos:** `PostureClassifier` (máquina de histerese, `cypher-capture/src/fusion/`), `CypherKeyAuthenticationFilter`/`SecurityConfig` (autenticação por papel e por chave de API, `cypher/src/main/java/com/dev4/cypher/security/`), `AuthService`/guards funcionais (`cypher-front/src/app/shared/auth/`).
- Convite para abrir o repositório e navegar pelos specs de design (`docs/superpowers/specs/`) que documentam cada decisão citada acima.
