# Cypher Front

🔐 **Cypher** é um sistema de monitoramento de segurança industrial por visão computacional — detecta em tempo real uso de EPI, postura de risco e quedas, para a Metaindústria (Challenge SPI/FIAP). Este repositório é o frontend (Angular 21) de um sistema com 3 repositórios (ver [Arquitetura](docs/arquitetura.md)).

## 📋 Sobre o Projeto

Cypher Front é a interface de gestão e operação do sistema Cypher, apresentando:

- **Onboarding**: primeira execução — cria o gestor mestre e configura a empresa
- **Login** (gestor e kiosk de estação): dois fluxos separados por papel, sem JWT — sessão em cookie `HttpOnly`
- **Dashboard**: KPIs, heatmap mini e alertas em tempo real (SSE)
- **Heatmap**: mapa de calor por estação/setor, distribuição temporal e histórico anual, com filtros reais (Período/Setor/EPI/Turno)
- **Incidentes**: timeline, detalhe com análise de risco por LLM (Claude/Gemini) no snapshot
- **Ao Vivo**: grade de câmeras por estação, agrupada por setor
- **Placar**: gamificação por equipe (conformidade, cobertura, sequência, ranking)
- **Config**: cadastro de estações/câmeras, zonas de risco (editor de polígono em canvas), equipes/usuários, webhooks
- **Central de notificações**: alertas lidos/não-lidos por usuário
- **Relatórios**: exportação de CSV/PDF
- **Chrome TopBar / Dock**: navegação persistente, condicionada ao papel da sessão

## 🚀 Começando

### Instalação

Certifique-se de ter o Node.js e Angular CLI instalados:

```bash
npm install -g @angular/cli@21
```

Clone o repositório e instale as dependências:

```bash
git clone <repo-url>
cd cypher-front
npm install
```

### Servidor de Desenvolvimento

Inicie o servidor local (só o front, precisa do backend rodando à parte para dado real):

```bash
ng serve
```

Abra seu navegador e acesse `http://localhost:4200/`. A aplicação recarregará automaticamente quando você modificar os arquivos.

### Subindo os 3 projetos juntos (backend + front + captura)

Este repositório é um dos três que compõem o sistema (ver [Arquitetura](docs/arquitetura.md)). Para rodar tudo com dado real da empresa de demonstração, use o script `scripts/subir-empresa-demo.sh` (presente também nos outros dois repositórios — pode rodar a partir de qualquer um deles):

```bash
./scripts/subir-empresa-demo.sh start   # sobe backend, semeia a empresa demo, sobe o front e a webcam
./scripts/subir-empresa-demo.sh status  # o que está no ar
./scripts/subir-empresa-demo.sh logs    # acompanha os 3 logs
./scripts/subir-empresa-demo.sh stop    # derruba tudo
```

Por padrão ele assume os repositórios em `~/projects/cypher`, `~/projects/challenge/cypher-front` e `~/projects/challenge/cypher-capture` (configurável por variável de ambiente — ver o cabeçalho do script). Passo a passo manual e detalhes de cada etapa: [`docs/arquitetura.md`](docs/arquitetura.md) §4, [`docs/e1-runbook-local.md`](docs/e1-runbook-local.md) e [`docs/empresa-demo-runbook.md`](docs/empresa-demo-runbook.md).

## 🏗️ Estrutura do Projeto

```
src/app/
├── onboarding/          # Primeira execução — cria gestor mestre e empresa
├── auth/                # Login (gestor / kiosk de estação), guards por papel
├── dashboard/           # KPIs, heatmap mini, alertas em tempo real
├── heatmap/             # Heatmap com filtros reais (Período/Setor/EPI/Turno)
├── incidentes/          # Timeline, detalhe, análise de risco por LLM
├── ao-vivo/             # Grade de câmeras por estação/setor
├── placar/              # Gamificação por equipe (E5)
├── config/              # Estações, câmeras, zonas de risco, equipes/usuários, webhooks
├── shared/              # Serviços e componentes compartilhados
│   ├── chrome-topbar/   # Barra de navegação + central de notificações
│   ├── dock/            # Dock de navegação flutuante
│   ├── auth/            # AuthService, guards funcionais
│   └── config.service.ts
└── Cypher/              # Componentes legacy em JSX
```

Design system (tokens, primitivos, convenções): [`docs/design-system.md`](docs/design-system.md), gerado a partir de `src/styles.scss` (fonte única, nenhum token documentado aqui que não esteja implementado).

## 🛠️ Comandos Principais

### Gerar Componentes

```bash
ng generate component nome-componente
```

Para listar todas as opções disponíveis:

```bash
ng generate --help
```

### Build para Produção

```bash
ng build
```

Os artefatos serão armazenados no diretório `dist/`. A build de produção otimiza automaticamente o desempenho da aplicação.

### Testes Unitários

Execute testes com [Vitest](https://vitest.dev/):

```bash
ng test
```

### Testes End-to-End

Para testes E2E:

```bash
ng e2e
```

## 🗂️ Gestão Ágil (Sprint 3)

- **Board Trello:** [trello.com/b/AqgHhHCP/dev4-cypher-challenge](https://trello.com/b/AqgHhHCP/dev4-cypher-challenge) (visualização pública)
- **Protótipo Figma — Interface (atualizado):** [figma.com/design/kyeXTO2Uw0lkm8DPK2a22v/Interface](https://www.figma.com/design/kyeXTO2Uw0lkm8DPK2a22v/Interface?node-id=48-2)
- **Figma — Exploração de estilos:** [figma.com/design/nPjn6ULYdgGZDGlrjz5fhG/cypher---rascunhos-de-telas](https://www.figma.com/design/nPjn6ULYdgGZDGlrjz5fhG/cypher---rascunhos-de-telas)
- **Documento de cerimônias Scrum:** [docs/scrum/sprint-3/cerimonias.md](docs/scrum/sprint-3/cerimonias.md)
- **Product Backlog / Sprint Backlog / DoD:** [docs/scrum/sprint-3/](docs/scrum/sprint-3/)
- **Design system:** [docs/design-system.md](docs/design-system.md)
- **Arquitetura (3 repositórios + como subir localmente):** [docs/arquitetura.md](docs/arquitetura.md)
- **Fluxo de telas implementadas (evolução do protótipo):** [docs/fluxo-de-telas.md](docs/fluxo-de-telas.md)
- **Roteiro de apresentação (5 min):** [docs/apresentacao/2026-08-25-roteiro-sprint3.md](docs/apresentacao/2026-08-25-roteiro-sprint3.md)

**As telas são demonstradas rodando no projeto local** (ver [docs/e1-runbook-local.md](docs/e1-runbook-local.md) e [docs/empresa-demo-runbook.md](docs/empresa-demo-runbook.md)), com dado real da empresa `demo` — o Figma documenta o desenho de alta fidelidade das telas originais (Sprints 1–2); a evolução desta Sprint é código real, mapeada em `docs/fluxo-de-telas.md`.

### 🎥 Vídeo de demonstração

https://github.com/user-attachments/assets/da582c0c-9bc6-4ca3-9de6-844e875141b9

Vídeo curto (gravado com os 3 projetos rodando localmente — ver [`scripts/subir-empresa-demo.sh`](scripts/subir-empresa-demo.sh)) navegando pelas principais telas do sistema, com dado real da empresa `demo`. Roteiro sugerido (ver [`docs/fluxo-de-telas.md`](docs/fluxo-de-telas.md) para o mapa completo):

- [ ] Login do gestor (`/login`) → Dashboard (KPIs, heatmap mini, alertas em tempo real)
- [ ] Heatmap (`/heatmap`) — filtros por Período/Setor/EPI/Turno, painéis Temporal e Anual
- [ ] Incidentes (`/incidentes`) — timeline, detalhe de um incidente, análise de risco por IA
- [ ] Ao Vivo (`/estacoes`) — grade de câmeras agrupada por setor
- [ ] Placar (`/placar`) — gamificação por equipe
- [ ] Config — zonas de risco (editor de polígono), equipes/usuários, webhooks
- [ ] Central de notificações (sino no topbar)
- [ ] Login do kiosk (`/login-estacao`) → operação de estação, sem acesso ao dashboard do gestor

### Evolução do protótipo nesta Sprint

O protótipo em alta fidelidade no Figma (`Interface`) documentou o desenho de Onboarding, Dashboard e Heatmap nas Sprints 1–2. A partir da E4 o projeto entrou em fase de implementação — cada tela nova nasceu direto como componente Angular real (seguindo os primitivos do [design system](docs/design-system.md)), em vez de primeiro virar artboard no Figma. O mapeamento completo do fluxo de telas implementadas, com justificativa por tela, está em **[`docs/fluxo-de-telas.md`](docs/fluxo-de-telas.md)** — 6 telas/fluxos novos em relação ao protótipo original: login do gestor, login do kiosk, `/config/equipe`, `/placar` (gamificação), `/config/webhooks` e o editor de zonas de risco.

Nenhuma delas introduz um padrão visual novo — todas reaproveitam os mesmos primitivos já usados no restante da aplicação (`.panel`, `.field`, `.input`, `.btn`, `.chip`, `.list-row`, `.status`), consistente com a convenção de design já registrada nas specs do projeto (`docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md` §4) — única exceção documentada é o canvas do editor de zonas de risco.

## 📁 Branches

- **main**: Produção estável
- **dev**: Desenvolvimento ativo com features em progresso
- **hml**: Homologação/staging

## 🔄 Fluxo de Trabalho

1. Desenvolva na branch **dev**
2. Crie pull requests para revisão
3. Após aprovação, realize merge para **main**
4. Deploy automático ou manual para produção

## 📚 Recursos Adicionais

- [Documentação Angular CLI](https://angular.dev/tools/cli)
- [Angular 21 Guide](https://angular.dev)
- [Vitest Documentation](https://vitest.dev/)

## 📝 Licença

Projeto acadêmico — Challenge SPI/FIAP.

---

**Versão**: Angular 21.2.11
**Última atualização**: 2026-09-14
