# Cypher

**Cypher** monitora a segurança em chão de fábrica por visão computacional. Ele detecta, em tempo real, o uso de EPI, posturas de risco e quedas, e avisa o operador e o gestor no momento em que acontecem. Foi construído para a Metaindústria no Challenge SPI/FIAP.

Este repositório (`cypher-front`, Angular 21) é o **repositório principal da entrega final** e a porta de entrada da documentação. O sistema tem três repositórios:

| Repositório | Papel | Stack |
|---|---|---|
| [`cypher-front`](https://github.com/Ronaldovels/cypher-front) (este) | Dashboard, heatmap, incidentes, ao vivo, placar, configuração e kiosk do operador | Angular 21 |
| [`Cypher-Api`](https://github.com/lucvs07/Cypher-Api) | Backend: incidentes, autenticação por papel, multi-empresa, relatórios, análise por IA, servidor MCP | Spring Boot 4.1, Java 21, H2 |
| [`cypher-capture`](https://github.com/lucvs07/cypher-capture) | Visão computacional: um processo por câmera decide quando um incidente começa e termina | Python, YOLO (EPI), YOLO-pose (postura e queda) |

## Links

- **Vídeo de pitch final (YouTube, não listado):** https://youtu.be/RNXN9POxUuM
- **Board Trello:** https://trello.com/b/AqgHhHCP/dev4-cypher-challenge
- **Protótipo Figma (interface):** https://www.figma.com/design/kyeXTO2Uw0lkm8DPK2a22v/Interface?node-id=48-2
- **Figma (exploração de estilos):** https://www.figma.com/design/nPjn6ULYdgGZDGlrjz5fhG/cypher---rascunhos-de-telas

## Proposta de solução

**O problema.** Na Metaindústria, a conferência de EPI e de postura depende de alguém olhar. Quando um capacete falta ou alguém se agacha por muito tempo numa posição ruim, o registro costuma acontecer depois do fato, e uma queda pode passar sem resposta imediata.

**A abordagem.** O Cypher é proativo. Cada câmera tem um pipeline que roda o detector de EPI e a estimativa de pose, aplica as regras de segurança (EPI exigido por zona ou por checklist da empresa, REBA para ergonomia, queda, zona de risco) e só abre um incidente depois de confirmar que ele persiste, para não alarmar à toa. O incidente chega ao kiosk do operador e ao painel do gestor por SSE, com o quadro que o provocou. O gestor pode pedir uma análise de risco por IA sobre esse quadro.

**O que o gestor ganha.** Dashboard em tempo real, heatmap por estação, setor e turno, histórico de incidentes com reconhecimento de status, placar de conformidade por equipe, relatórios em CSV e PDF, webhooks para sistemas externos e um servidor MCP para agentes de IA consultarem os dados.

**Normas cobertas.** NR-6 (EPI) e NR-35 (queda) com detecção medida; NR-12 e NR-17 (ergonomia) pelo motor de regras. As métricas do modelo, cada uma com a fonte, estão em [`cypher-capture/docs/metricas-finais.md`](https://github.com/lucvs07/cypher-capture/blob/main/docs/metricas-finais.md).

## Vídeos do pitch final (Fase 4)

Gravados em 29/09/2026 com os 3 projetos rodando sobre a empresa `demo`. Eles não têm áudio e servem de apoio visual e de backup da demonstração ao vivo. O vídeo narrado pelo grupo é o do YouTube, citado acima.

| Vídeo | Duração |
|---|---|
| Demonstração ao vivo | 60 s |
| Tour pelas telas | 1min45 |
| Apresentação completa | 2min45 |

https://github.com/user-attachments/assets/1eafada7-b96e-4b8e-9615-0f337889741e

https://github.com/user-attachments/assets/d2439482-547c-42e5-b491-f5240e6f2619

https://github.com/user-attachments/assets/ad56a7dd-3999-4b73-a855-ad9485288213

Arquivos originais e como foram gravados: [`docs/apresentacao/videos`](docs/apresentacao/videos/README.md).

## Como instalar e executar

Você vai precisar de **Java 21**, **Node.js 20 ou superior** (com npm) e **Python 3.11 ou superior**. Não precisa de webcam, de GPU nem de chave de LLM: o sistema usa um vídeo de demonstração e roda em CPU.

**1. Clone os três repositórios lado a lado.** O script de demonstração procura os outros pela pasta vizinha.

```bash
mkdir cypher-projeto && cd cypher-projeto
git clone https://github.com/Ronaldovels/cypher-front.git
git clone https://github.com/lucvs07/Cypher-Api.git cypher
git clone https://github.com/lucvs07/cypher-capture.git
```

**2. Prepare o ambiente Python do capture** (uma vez; leva alguns minutos e precisa de internet):

```bash
cd cypher-capture
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
python -c "from ultralytics import YOLO; YOLO('yolo11s-pose.pt')"
cd ..
```

**3. Instale as dependências do front:**

```bash
cd cypher-front
npm install
```

**4. Suba tudo com um comando** (a partir de `cypher-front`):

```bash
./scripts/subir-empresa-demo.sh start
```

O script sobe o backend, cria a empresa `demo` com dados simulados (câmeras, equipes, operadores e 14 dias de histórico), sobe o front e inicia o pipeline de captura sobre o vídeo `cypher-capture/data/demo/validacao-camera-2026-10-14.mp4`. Na primeira vez o backend baixa o Maven, então espere alguns minutos. O script avisa quando tudo está no ar.

**5. Acesse** `http://localhost:4200`.

| Papel | Como entrar | Credenciais |
|---|---|---|
| Gestor | `/login` | `gestor@demo` / `demo12345` |
| Operador (kiosk) | `/login-estacao` | usuário e senha do operador criado pelo seed (`operador123`); o usuário de cada estação aparece em [`docs/empresa-demo-runbook.md`](docs/empresa-demo-runbook.md) |

Em alguns segundos de pipeline, a câmera `CAM-WEBCAM` gera incidentes novos (ergonomia, EPI) que aparecem ao vivo no dashboard e em **Incidentes**. A detecção em CPU processa poucos quadros por segundo, o que é esperado.

```bash
./scripts/subir-empresa-demo.sh status   # o que está no ar
./scripts/subir-empresa-demo.sh logs     # acompanha os 3 logs
./scripts/subir-empresa-demo.sh stop     # derruba tudo
```

**Opções do `start`:** `--source 0` usa a webcam em vez do vídeo; `--device cuda` força a GPU (por padrão ele usa CUDA só se o PyTorch enxergar a GPU); `--orchestrator` reconcilia o catálogo completo de câmeras (as câmeras RTSP reais só respondem na rede da SPI). Para outro layout de pastas, defina `CYPHER_BACKEND_DIR`, `CYPHER_FRONT_DIR` e `CYPHER_CAPTURE_DIR`.

**Sem chave de LLM** tudo funciona. Só o botão "Analisar com IA" no detalhe do incidente exige `CYPHER_CLAUDE_API_KEY` ou `CYPHER_GEMINI_API_KEY` no ambiente do backend.

**Só o front**, apontando para um backend já rodando em `localhost:8080`: `npm start`.

### Testes e build

```bash
npm test          # testes unitários do front (Vitest)
npm run build     # build de produção em dist/
```

Backend: `./mvnw test` na pasta do `Cypher-Api`. Capture: `pytest` dentro do venv (449 passaram e 2 foram pulados, ver [`cypher-capture/docs/metricas-finais.md`](https://github.com/lucvs07/cypher-capture/blob/main/docs/metricas-finais.md)).

## Telas

O front tem 7 telas e fluxos que não existiam no protótipo do Figma, detalhados em [`docs/fluxo-de-telas.md`](docs/fluxo-de-telas.md) e explicados para o usuário final em [`docs/manual-de-uso.md`](docs/manual-de-uso.md):

1. Login do gestor e do kiosk (`/login`, `/login-estacao`)
2. Equipes e usuários (`/config/equipe`)
3. Placar de gamificação (`/placar`)
4. Webhooks (`/config/webhooks`)
5. Editor de zonas de risco (em `/config/estacoes`)
6. Central de notificações (global, no topo)
7. Credenciais MCP (`/config/mcp`)

Além delas, o front tem onboarding, dashboard, heatmap, incidentes (com análise por IA), ao vivo, estações, EPIs, CAs, identidade da empresa e relatórios.

## Estrutura do código

```
src/app/
├── onboarding/   # primeira execução: cria o gestor mestre e a empresa
├── auth/         # login do gestor e do kiosk, guards por papel
├── dashboard/    # KPIs, heatmap mini, alertas em tempo real
├── heatmap/      # filtros de período, setor, EPI e turno
├── incidents/    # timeline, detalhe e análise por IA
├── stations/     # grade ao vivo e kiosk da estação
├── placar/       # gamificação por equipe
├── config/       # estações, zonas, EPIs, CAs, equipes, webhooks, MCP
└── shared/       # chrome (topbar e dock), serviços e guards
```

Design system: [`docs/design-system.md`](docs/design-system.md).

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/arquitetura.md`](docs/arquitetura.md) | Arquitetura final: visão geral, stack com justificativas, decisões por Sprint, gaps |
| [`docs/manual-de-uso.md`](docs/manual-de-uso.md) | Manual para o gestor de SSMA e o operador |
| [`docs/fluxo-de-telas.md`](docs/fluxo-de-telas.md) | Mapa das telas e evolução em relação ao protótipo |
| [`docs/empresa-demo-runbook.md`](docs/empresa-demo-runbook.md) | Dados simulados da empresa `demo` |
| [`docs/mcp-runbook.md`](docs/mcp-runbook.md) | Servidor MCP |
| [`docs/scrum/`](docs/scrum/) | Artefatos Scrum das Sprints 3 e 4, incluindo a [matriz de rastreabilidade](docs/scrum/sprint-4/rastreabilidade.md) |

## Resumo das entregas por Sprint

| Sprint | Foco | Entregas |
|---|---|---|
| 1 e 2 | Desenho do produto | Protótipo de alta fidelidade no Figma (onboarding, dashboard e heatmap), citado em [`docs/fluxo-de-telas.md`](docs/fluxo-de-telas.md) |
| 3 | Implementação e gestão ágil | Login por papel, multi-empresa, cadastro de câmeras, estações e equipes, timeline de incidentes, kiosk, webhooks, zonas de risco, placar, relatórios, análise por IA, orquestrador de pipelines, board Trello e cerimônias ([`docs/scrum/sprint-3`](docs/scrum/sprint-3/)) |
| 4 | Entrega final | REBA com câmera angulada, checklist global de EPI, servidor MCP e correções de tracker e webhook; vídeos motion; instalação limpa sem webcam, GPU ou chave de LLM; métricas do modelo com fonte; arquitetura final, manual de uso, rastreabilidade e artefatos Scrum ([`docs/scrum/sprint-4`](docs/scrum/sprint-4/)) |

A evolução de protótipo para produto está em [`docs/fluxo-de-telas.md`](docs/fluxo-de-telas.md), e o caminho de cada requisito até o código e o teste está na [matriz de rastreabilidade](docs/scrum/sprint-4/rastreabilidade.md).

## Integrantes

| Integrante | Frente na Sprint 4 |
|---|---|
| Lucas Rodrigues Grecco | PO e Scrum Master, vídeos motion, edição do pitch, Review e entrega |
| Felipe Wapf Fettback | Teste de instalação limpa, métricas do modelo |
| Monique Ferreira dos Anjos | Manual de uso, fluxo de telas |
| Rafael Augusto Oliveira Silva | README, matriz de rastreabilidade |
| Ronaldo Veloso Filho | READMEs técnicos dos repositórios, correções de instalação |
| Tiago Brito Nário | Documento de arquitetura final |

Divisão detalhada, status e revisores: [`docs/scrum/sprint-4/sprint-backlog.md`](docs/scrum/sprint-4/sprint-backlog.md).

## Licença

Projeto acadêmico, Challenge SPI/FIAP.
