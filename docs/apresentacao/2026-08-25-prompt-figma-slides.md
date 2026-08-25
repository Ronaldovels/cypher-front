# Prompt — Geração de Slides (Figma Slides / Claude Design)

**Como usar:** cole o bloco abaixo, inteiro, na ferramenta de geração (Figma Slides com Claude Design, ou equivalente). O conteúdo de cada slide vem do roteiro em `docs/apresentacao/2026-08-25-roteiro-sprint3.md` — não invente dados além do que está ali; onde houver `[PREENCHER]`, deixe o placeholder visível no slide em vez de inventar um valor.

---

## PROMPT

Gere uma apresentação de slides para o Challenge SPI/FIAP, projeto **Cypher — Industrial Vision AI**, seguindo a identidade visual já usada na apresentação anterior do grupo (Sprint 1+2). Não crie uma nova identidade — reaproveite exatamente esta:

**Paleta de cores**
- Primário: `#FF6A1E` (laranja Cypher)
- Secundário: `#ED145B` (rosa FIAP)
- Fundo escuro: `#0a0a0f`
- Texto claro: `#e8e6e0`

**Tipografia**
- Headlines: Courier New (monospace), bold, 28–32px
- Corpo de texto: Calibri, regular, 13–14px
- Dados/métricas em destaque: Courier New, 11–12px, cor primária ou secundária

**Tom visual:** industrial, técnico, escuro — não corporativo genérico. Métricas reais aparecem grandes e em destaque (não escondidas em texto corrido). Nenhum ícone de estoque genérico de "IA" (cérebros, robôs) — prefira elementos ligados a visão computacional real (bounding boxes, keypoints de pose, heatmap) quando ilustrar.

**Logos a incluir:** Cypher, FIAP, SPI Integração (usar placeholder de logo onde o arquivo não estiver disponível).

### Estrutura dos slides (mapeada ao roteiro de 5 minutos)

1. **Capa** — título "Cypher — Industrial Vision AI", subtítulo "Sprint 3 · Challenge SPI/FIAP", nomes do grupo com RM (`[PREENCHER]` onde faltar), logos.
2. **Hook + contexto** (0:00–0:30) — frase de impacto em destaque tipográfico grande; abaixo, uma linha do tempo compacta E1→E2→E3→**E4 (atual)** com um rótulo curto por entrega.
3. **Solução — arquitetura** (0:30–1:30, parte 1/2) — diagrama único mostrando as três frentes (`cypher-capture` → `cypher` → `cypher-front`) e as três formas de autenticação chegando no backend (chave de API da câmera, sessão de gestor, sessão de operador). Usar o diagrama de integração descrito no roteiro §"Solução proposta".
4. **Solução — decisões-chave** (0:30–1:30, parte 2/2) — 3 bullets curtos, cada um com a decisão em negrito e a justificativa em uma linha (sessão por cookie vs. JWT; onboarding como setup único; dois endpoints de login).
5. **Demo — fluxo** (1:30–3:30, parte 1/2) — sequência de 4-5 miniaturas de tela (login → dashboard → incidente detectado → detalhe do incidente → kiosk do operador) com uma legenda curta cada, para acompanhar vídeo ou demo ao vivo.
6. **Demo — métricas reais** (1:30–3:30, parte 2/2) — 3 números grandes em destaque: recall 0,986, latência p95 ~40ms, testes 388+282+214 verdes (backend+front+capture, pós-E4). Uma linha pequena abaixo de cada número explicando o que ele mede.
7. **Out of the Box** (3:30–4:30) — 4 cards curtos, um por diferencial (agregação mantida em Python; onboarding virou bootstrap de segurança; três mecanismos de auth coexistindo; honestidade metodológica com achados de revisão documentados).
8. **Próximos passos** (4:30–5:00) — três colunas: "Plano" (Figma + Trello + cerimônias Sprint 3), "Riscos" (multi-tenant fora de escopo, webhook sem UI, sem rate limiting), "Ask" (pergunta explícita à banca, em destaque).
9. **Apêndice — código** (fora do timer) — 2-3 trechos de código reais (nome do arquivo + poucas linhas), não o arquivo inteiro: `PostureClassifier`, `CypherKeyAuthenticationFilter`, `AuthService`.

### Regras de conteúdo
- Todo número apresentado deve vir do roteiro ou dos docs de verificação do projeto (`docs/e3-verificacao.md`) — nenhuma métrica fabricada.
- Onde um dado depender de link externo ainda não criado (Trello, Figma atualizado), usar `[PREENCHER: <o quê>]` visível no slide, nunca um link fictício.
- Manter no máximo ~9 slides no corpo principal (itens 1–8) para caber em 5 minutos reais de fala; o apêndice (item 9) é opcional e só entra se sobrar tempo.
