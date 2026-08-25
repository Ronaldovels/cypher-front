# Cerimônias Scrum — Sprint 3

**Grupo:** Cypher — Challenge SPI/FIAP
**Sprint:** 3 · 2026-08-23 a 2026-09-01
**Formato:** cerimônias assíncronas (registradas por texto), conforme permitido pela tarefa.

---

## 1. Ata do Sprint Planning

**Data:** 2026-08-25
**Participantes:** `[PREENCHER: nomes presentes]`

### Contexto de entrada
A implementação de E4 (acesso, papéis, guards e cadastro de equipes) começou em 2026-08-23 e foi mergeada nos três repositórios (`cypher` PR #5, `cypher-capture` PR #7, `cypher-front` PR #4) em 2026-08-25, dentro desta mesma janela de Sprint. O trabalho está descrito em `docs/superpowers/specs/2026-08-23-acesso-e-equipes-e4-design.md`. A Sprint 3 cobre esse código como trabalho já puxado e concluído, e soma a ele o trabalho de gestão ágil que ainda falta: Figma, Trello e os artefatos deste documento.

### Sprint Goal
Fechar E4 nos três repositórios, evoluir o protótipo Figma com as telas que E4 introduziu (login e cadastro de equipes) e deixar o board Trello + os artefatos Scrum em condição de serem avaliados — refletindo trabalho real, não genérico.

### Itens puxados do Product Backlog para esta Sprint
Ver `docs/scrum/sprint-3/sprint-backlog.md` — os 8 itens de 6 a 9 do Product Backlog.

### Capacidade e divisão de trabalho
`[PREENCHER: quem fica com Figma, quem fica com Trello/documentação de cerimônias, quem fica com o README]` — a divisão real deve ser refletida nos responsáveis de cada card do Trello.

### Riscos identificados no planning
- Prazo curto (1 semana) para 3 telas novas em alta fidelidade + configuração completa do Trello.
- Board Trello "vazio ou genérico" é motivo de reprovação nos critérios de avaliação — decisão do planning: cada card deve nascer com descrição específica do projeto, não um título curto.

---

## 2. Dailies (registro resumido, assíncrono)

Registro por texto, um bloco por dia com o formato: **feito / próximo / bloqueio**.

### 2026-08-25
- `[PREENCHER: nome]` — feito: `[PREENCHER]`; próximo: `[PREENCHER]`; bloqueio: `[PREENCHER]`
- `[PREENCHER: nome]` — feito: `[PREENCHER]`; próximo: `[PREENCHER]`; bloqueio: `[PREENCHER]`

### 2026-08-26
- `[PREENCHER]`

### 2026-08-27
- `[PREENCHER]`

*(adicionar uma seção por dia útil da sprint; o mínimo exigido pela tarefa é "ao menos uma rodada" — preencher conforme o grupo avança.)*

---

## 3. Ata do Sprint Review

**Data:** `[PREENCHER: data de encerramento da sprint, prevista 2026-09-01]`
**Participantes:** `[PREENCHER]`

### Entregue nesta Sprint — código (E4, PRs #5/#7/#4)
- Login de gestor e de operador, guards por papel, dock condicionado à sessão.
- Cadastro de equipes (`/config/equipe`) com alocação de estações e turno.
- Chave de API por câmera para ingestão autenticada do pipeline.
- Suíte de testes pós-E4, executada em 2026-08-25: 388/388 backend, 282/282 front, 214/214 capture, todos verdes; recall de risco imediato 0,986 medido em `docs/e3-verificacao.md` (ciclo anterior a E4) — não re-medido contra o pipeline após E4, só a suíte de testes unitários/integração foi reexecutada.

### Entregue nesta Sprint (prospectivo — artefatos de gestão)
- [ ] Protótipo Figma evoluído com as telas de login e cadastro de equipes — `[PREENCHER: link]`
- [ ] Board Trello configurado e compartilhado — `[PREENCHER: link]`
- [ ] Este documento de cerimônias
- [ ] README atualizado com os três links

### O que não foi concluído / passa para o backlog
`[PREENCHER: itens do Sprint Backlog que não fecharam a tempo, com o motivo]`

### Feedback recebido (da banca/mentoria, se houver)
`[PREENCHER]`

### Próximos passos definidos na Review
`[PREENCHER: o que entra no planning da próxima sprint]`
