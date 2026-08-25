# Sprint Backlog — Sprint 3

**Período:** 2026-08-23 a 2026-09-01
**Sprint Goal:** Fechar a Entrega E4 (acesso, papéis e cadastro de equipes) nos três repositórios e, na sequência, evoluir o protótipo Figma para acompanhar esses fluxos novos, com a gestão do grupo formalizada em Scrum visível no Trello e as cerimônias documentadas.

Board Trello: `[PREENCHER: link do board Trello, com permissão de visualização]`

---

## Colunas do board

`Product Backlog` → `Sprint Backlog` → `Em andamento` → `Em revisão` → `Concluído`

## Cards da Sprint 3

### Código (concluído — evidenciado pelo histórico de commits/PRs, 2026-08-23 a 2026-08-25)

| Card | Descrição | Responsável | Status |
|---|---|---|---|
| Backend — `Usuario`, `Equipe`, sessão e guards de segurança | Spring Security com `HttpSession`, `/auth/*`, `/setup`, restrição de OPERADOR à própria `estacaoId` — PR [#5](https://github.com/lucvs07/Cypher-Api/pull/5) | Lucas Grecco | ✅ Concluído |
| Capture — chave de API por câmera na ingestão | `X-Cypher-Key` via `api_key_env`, provisionamento automático via login de gestor — PR [#7](https://github.com/lucvs07/cypher-capture/pull/7) | Lucas Grecco | ✅ Concluído |
| Front — login (gestor/kiosk), guards, dock por papel, `/config/equipe` | Telas `/login`, `/login-estacao`, abas Equipes/Usuários — PR [#4](https://github.com/Ronaldovels/cypher-front/pull/4) | Lucas Grecco | ✅ Concluído |

### Gestão ágil e protótipo (em andamento — objeto real desta Sprint)

| Card | Descrição | Responsável | Status |
|---|---|---|---|
| Evoluir Figma — tela de login (gestor) | Alta fidelidade, mesma linha de design das telas existentes | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Evoluir Figma — tela de login do kiosk (`/login-estacao`) | Fluxo separado, sem campo de senha, token da estação | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Evoluir Figma — tela `/config/equipe` (abas Equipes/Usuários) | Cobre o cadastro de equipe introduzido em E4 | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Configurar board Trello | Colunas do Scrum + Product Backlog + Sprint Backlog importados | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Documentar Planning da Sprint 3 | Ata registrada em `docs/scrum/sprint-3/cerimonias.md` | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Registrar Dailies resumidas | Ao menos uma rodada, assíncrona (texto ou vídeo curto) | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Documentar Review da Sprint 3 | Ata cobrindo o que foi entregue nesta janela | `[PREENCHER]` | `[PREENCHER: status atual]` |
| Atualizar README | Links de Trello, Figma atualizado e documento de cerimônias | `[PREENCHER]` | `[PREENCHER: status atual]` |

**Nota sobre este arquivo:** este documento é o conteúdo de referência do Sprint Backlog — os campos `[PREENCHER]` (responsável e status) devem ser preenchidos no Trello real, que é a fonte de verdade viva; este markdown existe para o README linkar e para constar no repositório caso o board mude.

## Definição de pronto desta Sprint

Ver `docs/scrum/sprint-3/definition-of-done.md`.
