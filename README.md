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

`[PREENCHER: descrever as ≥2 telas/fluxos novos adicionados ao Figma e a justificativa de cada mudança — feedback recebido, requisito não coberto anteriormente, ou melhoria de usabilidade]`

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
