# Cypher Front

🔐 **Cypher** é uma aplicação Angular 21 inovadora que oferece ferramentas avançadas de análise e visualização de dados. O projeto implementa um onboarding interativo, um dashboard dinâmico e um heatmap visual para monitoramento e análise de informações críticas.

## 📋 Sobre o Projeto

Cypher Front é a interface frontend de uma suite de análise desenvolvida com Angular 21, apresentando:

- **Onboarding Interativo**: Experiência de entrada intuitiva e guiada para novos usuários
- **Dashboard**: Visualização consolidada de métricas e dados em tempo real
- **Heatmap Dinâmico**: Mapa de calor com paleta de cores personalizável para análise visual
- **Chrome TopBar**: Componente de navegação integrado ao estilo Chrome
- **Dock de Navegação**: Interface flutuante para acesso rápido a funcionalidades

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

Inicie o servidor local:

```bash
ng serve
```

Abra seu navegador e acesse `http://localhost:4200/`. A aplicação recarregará automaticamente quando você modificar os arquivos.

## 🏗️ Estrutura do Projeto

```
src/app/
├── onboarding/          # Módulo de onboarding com overlay interativo
├── dashboard/           # Componente do dashboard principal
├── heatmap/            # Componente de heatmap visual
├── shared/             # Serviços e componentes compartilhados
│   ├── chrome-topbar/  # Barra de navegação estilo Chrome
│   ├── dock/           # Dock de navegação flutuante
│   └── config.service.ts # Serviço de configuração
└── Cypher/             # Componentes legacy em JSX
```

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

- **Board Trello:** `[PREENCHER: link do board Trello, com permissão de visualização]`
- **Protótipo Figma (atualizado):** `[PREENCHER: link do protótipo Figma]`
- **Documento de cerimônias Scrum:** [docs/scrum/sprint-3/cerimonias.md](docs/scrum/sprint-3/cerimonias.md)
- **Product Backlog / Sprint Backlog / DoD:** [docs/scrum/sprint-3/](docs/scrum/sprint-3/)
- **Roteiro de apresentação (5 min):** [docs/apresentacao/2026-08-25-roteiro-sprint3.md](docs/apresentacao/2026-08-25-roteiro-sprint3.md)

### Evolução do protótipo nesta Sprint

O protótipo original (Sprints 1–2) cobria onboarding, dashboard e heatmap — nenhuma tela de controle de acesso, porque o produto ainda não tinha login nem papéis. A Entrega E4 introduziu autenticação e permissões, um requisito que simplesmente não existia nas Sprints anteriores; as telas abaixo evoluem o Figma para acompanhar esse código já implementado e mergeado (`cypher-front` PR #4):

1. **Tela de login do gestor (`/login`)** — campo de usuário/senha, alternância de tema claro/escuro, e um link de saída ("Entrar como operador de estação →") para o fluxo de kiosk. *Justificativa:* requisito não coberto anteriormente — o protótipo das Sprints 1–2 não tinha nenhuma tela de autenticação, porque o produto ainda não distinguia papéis de usuário.
2. **Tela de login do kiosk / operador de estação (`/login-estacao`)** — fluxo deliberadamente separado do login de gestor: só um campo de token da estação, sem usuário/senha, porque quem opera o kiosk é o dispositivo fixo da estação, não uma pessoa autenticando-se individualmente. *Justificativa:* melhoria de usabilidade — um único formulário de login para dois públicos diferentes (gestor remoto vs. kiosk fixo na estação) forçaria campos irrelevantes em um dos dois fluxos.
3. **Tela `/config/equipe` (sub-abas Equipes/Usuários)** — cadastro de equipe com código, nome, turno e as estações cobertas (seleção por chip), mais a sub-aba de usuários do sistema. *Justificativa:* requisito não coberto anteriormente — a gamificação por equipe (E5, já especificada) e a própria E4 exigem que equipes existam como entidade de primeira classe, o que não fazia parte do modelo de dados nem da tela nas Sprints anteriores.

Nenhuma das três introduz um padrão visual novo — todas reaproveitam os mesmos primitivos já usados no restante da aplicação (`.panel`, `.field`, `.input`, `.btn`, `.chip`, `.list-row`, `.status`), consistente com a convenção de design já registrada nas specs do projeto (`docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md` §4).

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

Este projeto é propriedade da Asaas.

---

**Versão**: Angular 21.2.11  
**Última atualização**: 2026-06-24
