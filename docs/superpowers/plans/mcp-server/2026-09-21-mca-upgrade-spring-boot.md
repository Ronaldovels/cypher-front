# MCA — Upgrade Spring Boot 4.0.6 → 4.1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promover para o branch principal o upgrade do `spring-boot-starter-parent` de `4.0.6` para `4.1.1` no backend `cypher` — pré-requisito para usar `spring-ai-starter-mcp-server-webmvc` (MCD), que exige Spring Boot 4.1+.

**Architecture:** Mudança de uma linha no `pom.xml`. Já foi validada empiricamente num spike isolado (branch `spike/spring-boot-4.1`, worktree `.worktrees/spring-boot-4.1-spike` no repo `cypher`): compilação limpa e suíte completa (409/409 testes) passando sem nenhuma alteração de código além do bump de versão. Esta task só formaliza essa mudança no fluxo normal (branch dedicada a partir de `main`, não reaproveitando o worktree do spike).

**Tech Stack:** Maven, Spring Boot.

**Spec:** `docs/superpowers/specs/planejadas/2026-09-20-mcp-server-design.md`

## Global Constraints

- Versão alvo exata: `4.1.1` (última patch da série 4.1 confirmada disponível em setembro/2026).
- Nenhuma alteração de código além do `pom.xml` — o spike já confirmou que não é necessária.
- A suíte completa de testes deve passar antes de considerar a task concluída.

---

### Task 1: Bump da versão do `spring-boot-starter-parent`

**Files:**
- Modify: `/home/asaas/projects/cypher/pom.xml:8`

**Interfaces:**
- Produces: repo `cypher` compila e roda em Spring Boot 4.1.1 — pré-requisito consumido por MCD (adição do `spring-ai-starter-mcp-server-webmvc`).

- [ ] **Step 1: Criar a branch a partir de `main`**

```bash
cd /home/asaas/projects/cypher
git checkout main
git pull
git checkout -b feat/upgrade-spring-boot-4.1
```

- [ ] **Step 2: Alterar a versão no `pom.xml`**

Em `pom.xml`, linha 8, trocar:

```xml
		<version>4.0.6</version>
```

por:

```xml
		<version>4.1.1</version>
```

- [ ] **Step 3: Compilar**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q -DskipTests compile`
Expected: sem output (compilação limpa, sem erros)

- [ ] **Step 4: Rodar a suíte completa**

Run: `cd /home/asaas/projects/cypher && ./mvnw -q test`
Expected: build conclui sem lançar erro. Confirmar com:

```bash
grep -h "Tests run" target/surefire-reports/*.txt | awk -F'[, ]+' '{tests+=$3; fail+=$5; err+=$7} END{print "Total:",tests," Failures:",fail," Errors:",err}'
```

Expected: `Failures: 0` e `Errors: 0` (baseline conhecido: 409 testes).

- [ ] **Step 5: Commit**

```bash
cd /home/asaas/projects/cypher
git add pom.xml
git commit -m "chore: atualiza Spring Boot para 4.1.1

Pre-requisito para o servidor MCP (spring-ai-starter-mcp-server-webmvc
exige Spring Boot 4.1+). Validado em spike isolado: suite completa
(409/409 testes) passa sem nenhuma outra alteracao de codigo."
```

## Self-Review

- **Cobertura da spec:** cobre o pré-requisito descrito no §Contexto da spec ("upgrade é considerado seguro e é pré-requisito desta feature") e o sub-projeto MCA da tabela.
- **Placeholders:** nenhum — mudança de uma linha, já validada empiricamente no spike.
- **Consistência de tipos:** N/A (não há código de aplicação alterado).
