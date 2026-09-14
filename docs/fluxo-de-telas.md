# Fluxo de telas — evolução do protótipo (Sprint 3)

**Por que este documento existe:** o protótipo em alta fidelidade no Figma (`Interface`) cobriu a fase de desenho das telas nas Sprints 1–2. A partir da E4, o projeto entrou em fase de implementação — cada tela nova nasceu direto como componente Angular real, seguindo os primitivos do [design system](design-system.md), em vez de primeiro ser desenhada no Figma e só depois implementada. Este documento mapeia o fluxo de telas **realmente implementadas e rodando** (verificável em `src/app/app.routes.ts` e em cada componente), como evidência da evolução do protótipo desta Sprint — a demonstração na defesa é feita rodando a aplicação local (ver [`e1-runbook-local.md`](e1-runbook-local.md)/[`empresa-demo-runbook.md`](empresa-demo-runbook.md)), não apenas por artboards estáticos.

Todas as telas reaproveitam os primitivos globais do design system (`.panel`, `.field`, `.btn`, `.chip`, `.filterbar` etc.) — nenhuma introduz padrão visual próprio, com a única exceção documentada do editor de polígono de zonas de risco.

---

## 1. Fluxo de entrada (sem sessão)

```
/  (LandingComponent)
 └─▶ /onboarding  (primeira execução: cria gestor mestre + empresa)
 └─▶ /login  (gestor: usuário/senha)
 └─▶ /login-estacao  (kiosk: token da estação, sem usuário/senha)
```

| Tela | Rota | Desde | Justificativa da existência |
|---|---|---|---|
| Landing | `/` | Sprint 1 | ponto de entrada, decide onboarding vs. login conforme empresa já configurada |
| Onboarding | `/onboarding` | Sprint 1, reaproveitado como bootstrap de segurança na E4 | criação do gestor mestre passou a acontecer na mesma sessão de configuração da empresa (E4) — nenhuma tela nova de "criar admin" |
| Login gestor | `/login` | **Nova na E4** | requisito não coberto antes — produto não distinguia papéis de usuário nas Sprints 1–2 |
| Login kiosk/operador | `/login-estacao` | **Nova na E4** | fluxo deliberadamente separado: só token da estação, sem campos de usuário/senha irrelevantes para um dispositivo fixo |

## 2. Fluxo do gestor (sessão `GESTOR`)

```
/dashboard ─┬─▶ /heatmap ─▶ /incidentes ─▶ /incidentes/:id (+ análise por IA)
            ├─▶ /placar
            ├─▶ /estacoes ─▶ /estacao/:id (kiosk, também acessível por OPERADOR)
            └─▶ /config ─┬─▶ /config/estacoes  (+ editor de zonas de risco)
                          ├─▶ /config/identidade
                          ├─▶ /config/epis
                          ├─▶ /config/cas
                          ├─▶ /config/equipe   (abas Equipes / Usuários)
                          └─▶ /config/webhooks
```

Navegação persistente por dock (`chrome-topbar` + `dock`), condicionada ao papel da sessão — não à rota. Central de notificações (offcanvas) acessível de qualquer tela do chrome.

| Tela | Rota | Desde | Justificativa da existência |
|---|---|---|---|
| Dashboard | `/dashboard` | Sprint 1 | KPIs e heatmap mini em tempo real (SSE) |
| Heatmap | `/heatmap` | Sprint 1, **funcional desde `hfb`** | filtros (Período/Setor/EPI/Turno) e painéis Temporal/Anual passaram de decorativos para dado real — achado no teste manual da E6 |
| Incidentes (timeline) | `/incidentes` | Sprint 3 (E3) | requisito de operação — reconhecimento de status, histórico |
| Detalhe do incidente | `/incidentes/:id` | E3, **+ análise por IA na Sprint 3** | painel "Analisar com IA" (Claude/Gemini) sobre o snapshot — prazo acadêmico próprio |
| Placar | `/placar` | **Nova (E5, gamificação)** | requisito não coberto antes — conformidade/cobertura/sequência/ranking por equipe |
| Estações (grade) | `/estacoes` | E2 | cadastro de câmeras/estações |
| Kiosk de estação | `/estacao/:id` | E3 | operação — feed ao vivo, checklist de EPI, reconhecimento de status |
| Config › Estações | `/config/estacoes` | E2, **+ editor de zonas de risco na Sprint 3** | única peça do front sem primitivo global equivalente — canvas de polígono sobre frame congelado |
| Config › Identidade | `/config/identidade` | Sprint 1 (onboarding) | reaproveitada como tela de edição pós-onboarding |
| Config › EPIs | `/config/epis` | E2 | catálogo de EPIs obrigatórios |
| Config › CAs | `/config/cas` | E2 | certificados de aprovação dos EPIs |
| Config › Equipe | `/config/equipe` | **Nova na E4** | equipes como entidade de primeira classe — exigido por E4 e pela gamificação (E5) |
| Config › Webhooks | `/config/webhooks` | **Nova na Sprint 3** | fecha o gap de "só cadastrável via `application.yaml`+restart" registrado desde E1 §9 |

## 3. Fluxo do operador (sessão `OPERADOR`, restrita à própria estação)

```
/login-estacao ─▶ /estacao/:id  (kiosk — sem acesso a /dashboard, /config, etc.)
```

O dock muda de conteúdo por papel: o operador nunca vê os itens de gestor, mesmo tentando acessar a rota diretamente (guards funcionais em `shared/auth/`).

## 4. Evolução em relação ao protótipo Figma original (Sprints 1–2)

O Figma (`Interface`) documentou o desenho de alta fidelidade de Onboarding, Dashboard e Heatmap. As telas abaixo não existiam no protótipo original — nasceram direto como implementação a partir da E4, acompanhando requisitos que o produto ainda não tinha:

1. **Login (gestor e kiosk)** — dois fluxos, `/login` e `/login-estacao` (E4).
2. **`/config/equipe`** — cadastro de equipes, abas Equipes/Usuários (E4).
3. **`/placar`** — gamificação por equipe (E5).
4. **`/config/webhooks`** — cadastro de assinantes de webhook pela interface (Sprint 3, fecha gap de E1).
5. **Editor de zonas de risco** (dentro de `/config/estacoes`) — canvas de polígono (Sprint 3).
6. **Central de notificações** (offcanvas, global no chrome) — Sprint 3.

Cada uma tem razão registrada nas specs de design (`docs/superpowers/specs/`) e no changelog do Sprint Backlog (`docs/scrum/sprint-3/sprint-backlog.md`) — nenhuma foi adicionada "porque sim".
