# Runbook — cadastro de credenciais MCP pela interface

Complementa `e1-runbook-local.md` (como subir os 3 projetos) e
`empresa-demo-runbook.md` (dados da empresa `demo`). Este documento descreve
como cadastrar uma credencial de acesso ao servidor MCP (`/mcp`, exposto pelo
backend) **pela tela**, sem precisar chamar a API na mão, e como usar essa
credencial num cliente MCP (Claude Code, Claude Desktop, etc.).

**Nunca commitar uma chave real aqui.** A `apiKey` é exibida **uma única vez**,
no momento da criação — o backend guarda só o hash (BCrypt). Se perder o
valor, a única saída é revogar a credencial e gerar outra.

---

## 1. Pré-requisitos

- Backend (`cypher`) e front (`cypher-front`) de pé — ver `e1-runbook-local.md`.
- Login como **gestor** (`GESTOR`). A tela de credenciais MCP não aparece para
  sessão de operador.

## 2. Onde fica a tela

```
/dashboard → Config → aba "MCP"   (rota: /config/mcp)
```

Mesma casca de `Config` que Estações/EPIs/CAs/Equipe/Webhooks — a aba "MCP"
fica ao lado de "Webhooks" no menu de configurações.

## 3. Gerar uma credencial

1. Em **Config › MCP**, preencha **Nome da credencial** com algo que
   identifique quem/o que vai usar a chave (ex.: `Claude Desktop do Lucas`,
   `agente de suporte`). O nome só precisa ser único dentro da empresa.
2. Clique em **Gerar credencial**.
3. A chave aparece uma vez só, num quadro destacado no topo da tela:
   *"Copie a chave agora — ela não será exibida novamente"*. Copie o valor do
   campo (formato `<id>.mcp-key-<hash>`) antes de clicar em **entendi, fechar**
   — depois de fechado, esse valor não volta a aparecer em lugar nenhum
   (nem recarregando a página).
4. A credencial nova aparece na lista abaixo, com status `ativa`.

## 4. Revogar uma credencial

Na lista de credenciais, clique em **revogar** ao lado da credencial ativa.
O status muda para `revogada` e a chave para de autenticar no `/mcp`
imediatamente — não há como reativá-la, só gerar uma nova.

## 5. Usar a credencial num cliente MCP

O servidor MCP fala Streamable-HTTP em `http://localhost:8080/mcp` (ou o host
onde o backend estiver rodando), autenticado pelo header
`X-Cypher-Mcp-Key: <chave gerada no passo 3>`.

### Claude Code (CLI)

```bash
claude mcp add --transport http cypher-mcp http://localhost:8080/mcp \
  -H "X-Cypher-Mcp-Key: <chave gerada no passo 3>"
```

Por padrão isso registra em escopo `local` (privado, não versionado em
`.mcp.json`). Verificar conexão:

```bash
claude mcp get cypher-mcp
```

### curl (handshake manual, para depurar)

```bash
curl -i -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Cypher-Mcp-Key: <chave>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"teste","version":"1.0"}}}'
```

Guarde o header `Mcp-Session-Id` da resposta e reuse-o (mesmo header) nas
chamadas seguintes de `tools/list` e `tools/call`.

### Tools expostas

`list_cameras`, `list_stations`, `get_placar`, `get_summary`,
`list_incidents`, `get_incident`, `get_incident_analysis`,
`analyze_incident` — cada uma escopada pela empresa (`empresaId`) dona da
credencial usada; uma credencial nunca enxerga dados de outra empresa.

`analyze_incident` só funciona para incidentes que já têm `snapshotUrl`
(pipeline de captura precisa ter rodado e gerado a imagem) — sem imagem, a
tool responde com erro em vez de chamar o LLM.

---

## Referências

- Spec de design: `docs/superpowers/specs/planejadas/2026-09-20-mcp-server-design.md`
- Planos de implementação: `docs/superpowers/plans/mcp-server/`
