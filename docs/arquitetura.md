# Arquitetura — Cypher (3 repositórios)

**Domínio:** monitoramento de segurança industrial (uso de EPI, postura de risco, quedas) por visão computacional, para a Metaindústria (Challenge SPI/FIAP).

Este documento liga os três repositórios que compõem o sistema e explica como subi-los juntos localmente. Complementa (não substitui) os runbooks já existentes:
- `docs/e1-runbook-local.md` — passo a passo de subir os três projetos com vídeo real.
- `docs/empresa-demo-runbook.md` — dados de demonstração (empresa `demo`, câmeras reais da meta indústria, equipes de teste).
- `docs/superpowers/specs/2026-08-29-roteiro-de-entregas.md` — histórico completo de decisões de arquitetura e ordem de entregas.

---

## 1. Os três repositórios

| Repositório | Papel | Stack | Onde roda |
|---|---|---|---|
| [`cypher-capture`](https://github.com/lucvs07/cypher-capture) | Visão computacional em tempo real — decide quando um incidente começa e termina | Python, YOLOv8 (EPI) + YOLO11-pose/ByteTrack (postura e queda) | um processo por câmera, na borda (junto da câmera/estação) ou num host de captura |
| [`cypher`](https://github.com/lucvs07/Cypher-Api) (backend) | Recebe, persiste e expõe incidentes; autenticação, papéis, multi-tenant, relatórios, análise por LLM | Spring Boot 4 / Java 21, H2 embarcado | um processo central, um por instância (mono-tenant por instância de orquestrador, multi-tenant por `Empresa` dentro do backend) |
| [`cypher-front`](https://github.com/Ronaldovels/cypher-front) | Dashboard, heatmap, timeline de incidentes, cadastro, placar de gamificação, central de notificações | Angular 21 (standalone + signals) | SPA servida separadamente (`ng serve`/build estático) |

## 2. Diagrama de integração

```
┌──────────────────┐        HTTPS (REST, autenticado)        ┌──────────────────┐
│  cypher-capture   │ ───────────────────────────────────────▶│      cypher       │
│  (por câmera)      │  X-Cypher-Key (chave de API da câmera) │   (Spring Boot)    │
│                    │◀─────────────────────────────────────── │                    │
│  orchestrator/     │   GET /cameras/{id}/config              │  Usuario/Equipe/   │
│  (sobe/derruba      │   GET /cameras/{id}/zones/config        │  Empresa/Camera/   │
│  processos, 1 por   │   POST /incidents (novo incidente)      │  Estacao/Zona/     │
│  câmera)            │   POST /cameras/{id}/heartbeat (E5)     │  Alerta/Webhook    │
└──────────────────┘                                          └─────────┬─────────┘
                                                                          │
                                              HTTPS (REST + SSE)         │
                                              cookie HttpOnly            │
                                              (sessão GESTOR/OPERADOR)   │
                                                                          ▼
                                                                ┌──────────────────┐
                                                                │   cypher-front     │
                                                                │   (Angular SPA)    │
                                                                │  Dashboard/Heatmap/ │
                                                                │  Incidentes/Placar/ │
                                                                │  Config/Notificações│
                                                                └──────────────────┘
```

Três mecanismos de autenticação coexistem na mesma cadeia de filtros do backend, sem JWT nem servidor de autenticação separado:
1. **Chave de API por câmera** (`X-Cypher-Key`) — `cypher-capture` → `cypher`, sem sessão, uma chave por câmera, rotacionável.
2. **Sessão de gestor** (cookie `HttpOnly`) — `cypher-front` → `cypher`, acesso completo ao tenant (`Empresa`) do gestor.
3. **Sessão de operador** (cookie `HttpOnly`, via usuário/senha ou token de estação no kiosk) — `cypher-front` → `cypher`, restrita à própria `Estacao`.

Cookie (não JWT) por decisão de design: o `EventSource` do SSE (atualização em tempo real do dashboard/timeline/notificações) não aceita header customizado, então cookie é a única opção que cobre autenticação HTTP e stream ao mesmo tempo.

## 3. Multi-tenant

O backend isola dados por `Empresa` (chave primária prefixada `empresaId:codigo` nas entidades `Estacao`/`Camera`/`Equipe`/`Zona`/`Alerta`/`WebhookSubscription`). O orquestrador de pipelines (`cypher-capture`) é **mono-tenant por instância** — rodar câmeras de duas empresas no mesmo host exige dois processos de orquestrador, cada um com sua própria conta de serviço `GESTOR`. Decisão de design registrada, não uma limitação a resolver depois.

## 4. Subindo os três projetos localmente

Pré-requisitos: Java 21, Node 20+/Angular CLI 21, Python 3.11+ com `venv`, GPU CUDA opcional (acelera a inferência do `cypher-capture`, não é obrigatória).

**Caminho rápido:** `scripts/subir-empresa-demo.sh start` (mesmo script, copiado nos 3 repositórios — roda a partir de qualquer um deles) sobe os três processos em sequência, semeia a empresa `demo` na primeira vez e inicia um pipeline na webcam local. `./scripts/subir-empresa-demo.sh stop`/`status`/`logs` gerenciam os processos depois. Ver o cabeçalho do script para variáveis de ambiente (caminhos dos repositórios, senha do gestor, `--orchestrator` para reconciliar o catálogo completo em vez de só a webcam).

**Passo a passo manual** (o que o script acima automatiza):

```bash
# 1. Backend
cd ~/projects/cypher
./mvnw spring-boot:run
# pronto quando logar "Started ... in Xs" — confira com:
curl -s localhost:8080/api/v1/cameras

# 2. Front
cd ~/projects/challenge/cypher-front
npm install   # primeira vez
npm start     # serve em http://localhost:4200

# 3. Capture (um processo por câmera)
cd ~/projects/challenge/cypher-capture
./venv/bin/python src/run_pipeline.py \
  --source <arquivo.mp4 ou 0 para webcam> \
  --device cuda --no-display \
  --camera-id CAM-01 \
  --api-url http://localhost:8080/api/v1 \
  --stream-port 8090
```

Para dados de demonstração prontos (câmeras reais da meta indústria, equipes de teste, gestor/operadores seedados), rode `scripts/seed-empresa-demo.sh` do repo `cypher` — ver `docs/empresa-demo-runbook.md` para o passo a passo completo e a pegadinha de qual câmera o dashboard renderiza por padrão (`cameras()[0]`).

Para produção/orquestração contínua (sem subir cada câmera manualmente), o `cypher-capture` inclui `src/orchestrator/` (`python -m src.orchestrator`) — reconcilia o catálogo de câmeras do backend com os processos rodando, sobe/derruba/reinicia automaticamente.

## 5. Convenções compartilhadas entre repositórios

- **Design consistente no front**: toda tela nova reaproveita os primitivos globais de `src/styles.scss` (ver [`design-system.md`](design-system.md)) — nenhuma biblioteca de UI externa, nenhum CSS solto por componente além de layout local.
- **TDD tarefa-a-tarefa**: toda entrega nos três repositórios segue spec (`docs/superpowers/specs/`) → plano de implementação com tarefas testadas uma a uma (`docs/superpowers/plans/`) → revisão de branch inteira antes do PR.
- **Testes automatizados por repositório, sem mocks entre serviços na integração real**: os specs automatizados usam `HttpTestingController`/mock interceptor (front) e `HttpServer` local embutido (backend, para chamadas ao `cypher-capture`/LLM), mas toda entrega recebe também um teste manual ponta a ponta com os três processos rodando de verdade antes do merge.
- **Segredos nunca versionados**: `data/cypherdb.mv.db` (backend) e `outputs/apikey-cache.json`/`.env` (capture) são gitignorados de propósito — carregam tokens de estação, api-keys de câmera e credenciais RTSP em texto puro.

## 6. Gaps arquiteturais conhecidos (registrados, sem spec)

- Painel de super-admin multi-empresa (gestão entre empresas, billing) — não foi pedido, registrado em `2026-08-29-multi-tenant-design.md` §9.
- Rotação de câmera personalizável, correção de perspectiva no REBA para câmeras anguladas, e zona restringindo de fato o processamento de pose/EPI (hoje `ZoneDetector` só alimenta um flag, não recorta o frame) — achados da review da SPI (2026-09-08), ainda sem spec, registrados em `docs/scrum/sprint-3/sprint-backlog.md`.
- Rotação/expiração automática de token de estação e rate limiting de login — fora de escopo desde E4.
