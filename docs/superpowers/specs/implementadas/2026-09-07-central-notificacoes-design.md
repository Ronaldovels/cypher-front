# Central de notificações — design

**Data:** 2026-09-07
**Repositórios:** `cypher` (backend), `cypher-front` (frontend)

## Contexto

O sino de notificações já existe no chrome do front (`chrome-topbar.component.ts:59-66`), com um badge (`notifBadge`, `input<number>(0)`) — mas é um stub morto: não abre nada ao ser clicado, e o número que ele mostra hoje é só `pendentes` (alertas aguardando revisão) vindo de `GET /api/v1/summary`, exposto apenas na página do Dashboard (`dashboard.component.html:3`); todas as outras páginas (`incident-timeline`, `incident-detail`, `station-kiosk`, `stations-grid`) passam `[notifBadge]="0"` fixo.

Não existe hoje, em nenhum dos dois repositórios, uma entidade de notificação, estado de lido/não-lido, ou uma spec cobrindo esse fluxo — a spec `2026-08-10-notificacao-de-incidentes-design.md` (apesar do nome) documenta a arquitetura de ingestão/SSE/webhook, não uma UI de notificações.

Esta spec cobre: transformar esse sino morto numa central de notificações real — lista das últimas notificações (offcanvas), com estado de lido/não-lido persistido por usuário, badge global reativo em tempo real.

## 1. O que é uma notificação

Todo alerta novo emitido vira uma notificação. Não há um conceito de notificação separado do `Alerta` — a central é uma nova visualização (com estado de leitura) sobre o mesmo `Alerta` que já alimenta Dashboard, Timeline e SSE. Nenhuma outra origem (falha de webhook, câmera offline, etc.) gera notificação nesta entrega — fora de escopo (§6).

**Quem recebe:** apenas usuários com `papel = "GESTOR"`. `OPERADOR` não tem essa tela hoje e fica fora desta entrega.

## 2. Modelo de dados (backend)

Nova entidade `AlertaLeitura`:

```java
@Entity
@Table(name = "alerta_leitura", uniqueConstraints = @UniqueConstraint(columnNames = {"empresa_id", "usuario", "alerta_id"}))
public class AlertaLeitura {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "empresa_id", nullable = false, length = 30)
    private String empresaId;
    @Column(nullable = false, length = 60)
    private String usuario; // username do GestorAuthentication — não há Usuario.id acessível na Authentication hoje
    @Column(name = "alerta_id", nullable = false)
    private Long alertaId;
    @Column(name = "lido_em", nullable = false)
    private OffsetDateTime lidoEm;
}
```

- Presença de uma linha `(empresaId, usuario, alertaId)` = lido. Ausência = não lido. Não há coluna de "não lido" — é inferido pela ausência.
- Este é um padrão novo no projeto: hoje só existe `@ElementCollection` (`Equipe.estacaoIds`, `Alerta.epiPresent`/`epiMissing`) para coleções simples, nunca uma entidade de junção com repositório próprio. Justificativa: granularidade por-notificação (decisão explícita, não cursor único) exige uma linha por par usuário×alerta, o que `@ElementCollection` não modela bem.
- `usuario` é o `username` do `GestorAuthentication` (`security/GestorAuthentication.java`), não um `Long id` — a `Authentication` atual não carrega o `Usuario.id` (`GestorAuthentication.getPrincipal()` retorna a string do username). Usar `Long usuarioId` exigiria uma consulta adicional a `UsuarioRepository` só para resolver o id; usar o username evita essa dependência extra e já é único por empresa (login).
- `AlertaLeituraRepository extends JpaRepository<AlertaLeitura, Long>`, com `existsByEmpresaIdAndUsuarioAndAlertaId(...)` e `findByEmpresaIdAndUsuarioAndAlertaIdIn(...)` (para resolver o flag `lida` de um lote de alertas de uma vez, evitando N+1).

## 3. Endpoints (backend)

- **`GET /api/v1/notificacoes`** — retorna os últimos 30 `Alerta` da empresa do usuário autenticado (mesmo escopo de `TenantContext.currentEmpresaId()`), ordenados por `dataHora desc`, cada um com um campo `lida: boolean` calculado via `AlertaLeituraRepository.findByEmpresaIdAndUsuarioAndAlertaIdIn`. Sem paginação — janela fixa de 30; histórico completo continua na Timeline de Incidentes (que já tem filtros/paginação).
- **`POST /api/v1/notificacoes/marcar-lidas`** — corpo `{ "alertaIds": [1, 2, 3] }`. Para cada id ainda não lido pelo usuário atual, insere uma linha `AlertaLeitura`. Idempotente: reenviar um id já lido não gera erro nem duplicata (checa `existsBy...` antes de inserir, protegido também pela constraint única contra corrida).
- **`GET /api/v1/notificacoes/contagem-nao-lidas`** — retorna `{ "naoLidas": <int> }`, contando os `Alerta` da empresa sem `AlertaLeitura` correspondente para o usuário atual. Usado pelo badge global. `SummaryResponse` **não** ganha esse campo — o badge sai do `/summary` (que hoje só alimenta o Dashboard) e vira uma consulta própria, disponível em qualquer página.
- Todos os três endpoints exigem papel `GESTOR` (mesma proteção de rota que já existe para os endpoints de revisão de alerta).

## 4. Frontend

- **Novo `NotificationCenterComponent`** (offcanvas), aberto pelo sino em `chrome-topbar.component.ts`. Passa a existir em todas as páginas que usam o chrome, não só no Dashboard.
- **`IncidentService` ganha:**
  - `loadNotificacoes()` → `GET /notificacoes`, retorna a lista com `lida`.
  - `marcarLidas(alertaIds: number[])` → `POST /notificacoes/marcar-lidas`.
  - Um signal `naoLidas`, incrementado em +1 a cada evento novo recebido pelo SSE já existente (`incident.service.ts`) — sem round-trip extra por evento.
- **`chrome-topbar.component.ts`**: `notifBadge` deixa de ser `input()` alimentado por página; passa a ler `incidentService.naoLidas()` diretamente (removendo a necessidade de cada página passar o valor manualmente — hoje só o Dashboard passava o valor certo, as outras hardcodavam `0`). O próprio `ChromeTopbarComponent` dispara `loadNaoLidas()` quando `auth.role() === 'GESTOR'` — não há bootstrap automático dentro do serviço, para não disparar a chamada (que exige papel GESTOR) também para sessões de OPERADOR, que também renderizam o chrome (ex: `station-kiosk`).
- **Ao abrir o offcanvas:** dispara `loadNotificacoes()`; assim que a lista chega, dispara `marcarLidas(ids retornados)` automaticamente (sem ação do usuário) — zera `naoLidas` para os itens carregados. Compensa a lacuna entre o incremento otimista do SSE e a contagem real do backend re-sincronizando a cada abertura.
- **Cada item da lista linka para o alerta**, reaproveitando a navegação que a Timeline de Incidentes já usa hoje para abrir o detalhe.
- **Estado vazio:** mensagem simples ("Nenhuma notificação por aqui") quando a lista vier vazia.
- **Consistência de design (roteiro §4):** a lista de notificações reaproveita `.list-row`/`.chip` já existentes em `src/styles.scss`. O offcanvas em si (painel deslizante + backdrop) é um primitivo visual novo — não há equivalente hoje no projeto — mesma exceção já registrada para o canvas de zonas de risco (`2026-08-29-zonas-de-risco-design.md` §4.3). Por ser primitivo novo, o plano de implementação inclui uma revisão de design dedicada com a skill `frontend-design` antes do PR.

## 5. Comportamento de falha

- **`marcarLidas` falha (rede):** o item permanece não lido no backend; sem retry automático — a próxima abertura do offcanvas tenta de novo (chama `loadNotificacoes` + `marcarLidas` do zero).
- **Múltiplas abas abertas:** não há sincronização em tempo real entre abas — abrir a central em uma aba não atualiza o badge de outra aba já aberta até a próxima carga/reload dela.
- **SSE desconectado:** o incremento otimista do badge para de acontecer, mas abrir o offcanvas sempre busca a contagem/lista reais do backend, corrigindo a divergência.

## 6. Fora de escopo

- Notificações de outras origens (falha de webhook, câmera offline, limites de plano, etc.) — só `Alerta` gera notificação nesta entrega.
- Papel `OPERADOR` recebendo notificações.
- Configuração de quais severidades/tipos de alerta notificam — todo alerta notifica.
- Paginação da central além das últimas 30 — histórico completo continua sendo a Timeline de Incidentes.
- Sincronização de leitura em tempo real entre abas/dispositivos abertos simultaneamente — cada aba resolve seu próprio estado ao carregar/reabrir.

## 7. Premissas confirmadas com o usuário

- Toda notificação = todo alerta novo emitido (não um subconjunto).
- Estado de lido/não-lido persiste no backend, por usuário (não localStorage).
- Granularidade por notificação individual (não cursor único de "última vista").
- Marcação como lida é automática ao abrir/ver a central (não exige ação explícita do usuário).
- Apenas GESTOR recebe notificações.
- Janela fixa de 30 notificações mais recentes, sem paginação.
