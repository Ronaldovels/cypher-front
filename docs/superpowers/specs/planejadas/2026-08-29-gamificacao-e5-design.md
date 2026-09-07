# Cypher E5 — Gamificação por Equipe

**Data:** 2026-08-29
**Status:** aprovado (design) — **implementação bloqueada** (ver §7)
**Escopo:** **Entrega E5** do roteiro (`2026-08-10-notificacao-de-incidentes-design.md` §14): placar de conformidade ponderada por tempo, metas, sequências e camada educativa por equipe.

**Depende de:** `2026-08-29-multi-tenant-design.md` implementado (`Equipe`/`Camera` já escopadas por `empresaId`). **E6** (relatórios) depende desta spec para o CSV de placar.

As decisões de fundo já foram tomadas em E1 §16 e não são reabertas aqui: a unidade é a equipe, não a pessoa (`person_id` não é identidade persistente); a métrica é conformidade ponderada por tempo, escolhida por ser imune ao incentivo de "tapar a câmera"; ranking é por melhora sobre a própria linha de base, nunca por total absoluto.

---

## 1. Contexto e diagnóstico

`Equipe` já existe (E4 §3): `id`, `nome`, `turno` (enum `MANHA`/`TARDE`/`NOITE`), `estacaoIds` (lista solta), `ativa`. O numerador da fórmula de conformidade (`detectedAt`/`endedAt`/`duracaoSegundos` de `Alerta`) já é persistido desde E1. **O denominador não existe:** não há hoje nenhum mecanismo de heartbeat — nada reporta periodicamente que uma câmera está processando, então "tempo monitorado" não pode ser calculado.

`GET /api/v1/summary` (`SummaryService`) é o precedente mais próximo de agregação para um placar: cruza `Alerta.cameraId → estacaoId` via `CatalogService` e agrega em memória (`AlertaRepository.findAll()` filtrado por janela), preenchendo zeros explicitamente onde não há incidente. O placar de E5 estende esse mesmo padrão um nível além: `estacaoId → equipeId` via `Equipe.estacaoIds` + `turno`.

`docs/taxonomy.md` (`cypher-capture`) já mapeia regra de detecção a norma regulamentadora para ergonomia (NR-17, com parágrafos específicos por regra) — a camada educativa de §16.3 formaliza esse mapeamento para os demais tipos.

---

## 2. Heartbeat e "tempo monitorado"

### 2.1 Endpoint novo

`POST /api/v1/cameras/{codigo}/heartbeat` (`X-Cypher-Key`, superfície de máquina — mesmo padrão de ingestão de incidente). O pipeline chama a cada `heartbeat_interval_seconds` (proposta: 30s, configurável em `pose_config.yaml`, mesmo padrão de `merge_window_seconds`).

### 2.2 Armazenamento agregado, não por evento

Uma tabela nova, `MonitoramentoDiario(cameraId, empresaId, dia, segundosMonitorados)`, incrementada a cada heartbeat recebido: soma `min(segundosDesdeUltimoHeartbeat, heartbeat_interval_seconds × 2)`. O teto evita que um gap longo (pipeline caiu, voltou horas depois) infle o tempo monitorado com tempo em que não havia captura de verdade. Guardar cada heartbeat como linha própria cresceria sem limite (heartbeat a cada 30s, 24h/dia, por câmera) sem trazer benefício — o agregado diário já é suficiente para o cálculo de conformidade/cobertura.

### 2.3 Janela de turno fixa

`MANHA` 06:00–14:00, `TARDE` 14:00–22:00, `NOITE` 22:00–06:00 — constante de aplicação (`application.yaml`), **não configurável por empresa nesta entrega** (decisão consciente de escopo, não esquecimento — turnos diferentes por empresa ficam para quando alguém pedir). Cobertura de um turno = `segundosMonitorados` dentro da janela ÷ duração nominal do turno (8h).

---

## 3. Metas e placar

### 3.1 Campos novos em `Equipe`

Sem entidade própria — mesmo raciocínio de manter `setor` como campo texto simples em vez de nova tabela (E1 §12):

```java
private Double metaConformidade;              // ex.: 0.98
private Boolean metaZeroSeveridade4Ativa;     // liga/desliga o acompanhamento desse objetivo
private Integer metaTempoReconhecimentoSegundos;
```

### 3.2 `GET /api/v1/placar`

Agregação em memória a partir de `AlertaRepository` + `MonitoramentoDiario`, no mesmo espírito de `SummaryService`. Por equipe ativa, no turno/período consultado:

- **Conformidade:** `1 − (soma de duracaoSegundos dos incidentes das câmeras das estações da equipe) ÷ (soma de segundosMonitorados das mesmas câmeras)`.
- **Cobertura:** `segundosMonitorados ÷ duração nominal do turno` — sempre ao lado da conformidade (E1 §16.2: sem esse par, o placar é gamificável — equipe com cobertura baixa aparece como "dados insuficientes", não sobe no ranking).
- **Sequência atual / melhor sequência:** dias consecutivos sem incidente `FALL_RISK` nas câmeras da equipe, computado varrendo os dias anteriores em memória (mesmo padrão de `SummaryService`, sem tabela de streak dedicada) — sequência atual é a contagem regressiva a partir de hoje; melhor sequência é o maior trecho encontrado numa janela de 90 dias.
- **Progresso das metas:** comparação direta dos três campos de `Equipe` (§3.1) contra os números computados acima.
- **Ranking por melhora:** delta de conformidade desta semana vs. semana anterior, ordenado decrescente — nunca por conformidade absoluta (E1 §16.3: contagem absoluta ranquearia periculosidade herdada, não o que a equipe controla).

---

## 4. Camada educativa

Mapeamento regra → norma, formalizado como constante no backend (junto ao enum `AlertaTipo`), devolvido no `IncidentResponse` como campo `normaAplicavel`:

| `type` | Norma |
|---|---|
| `FALL_RISK` | NR-35 (Trabalho em Altura) |
| `ERGONOMIC_RISK` | NR-17 (Ergonomia) |
| `ZONE_VIOLATION` | NR-12 (Segurança em Máquinas) |
| `EPI_VIOLATION` | NR-6 (EPI) — mapeamento pronto, ainda sem incidente real disparando (E1 §4.6) |

Exibido no **kiosk** (`StationKioskComponent`, seção "eventos recentes", E3 §2.4), estendendo o card de incidente já existente com a norma e uma linha estática de "o que fazer diferente" por tipo (texto fixo, sem geração dinâmica) — não é tela nova, é campo a mais no card que já existe.

---

## 5. Front

**Nota de design:** toda peça nova desta seção reaproveita os primitivos globais já existentes em `src/styles.scss` (`.panel`, `.chip`, `.list-row`, `.field`, `.input`, `.btn`) e o padrão de formulário "signal de rascunho + `patch()`" já usado no resto do app — mesmo princípio seguido em E3 §0, E4 §4 e nas specs de multi-tenant/webhook/zonas desta rodada. Nenhum componente de gráfico/biblioteca de charting nova é introduzido; barras de progresso e badges de sequência são elementos simples (`div` com largura proporcional), não um widget novo.

**`/placar`** (`PlacarComponent`, rota já mapeada em E1 §14.1): ranking de equipes por melhora, cada linha mostrando conformidade atual, cobertura, progresso das três metas e o par sequência-atual/melhor-sequência ("sequência interrompida não vira alerta vermelho — vira 'melhor sequência: 14 · atual: 0'", E1 §16.3).

Campos de meta novos em `/config/equipe`, aba Equipes (formulário existente ganha três campos).

---

## 6. Fora de escopo

- Configuração de janelas de turno por empresa — fixo globalmente nesta entrega (§2.3).
- Notificação/alerta quando uma meta não é atingida — o placar só exibe progresso, não empurra aviso.
- Exportação do placar — cabe em E6 (`2026-08-29-relatorios-e6-design.md`).
- Edição do texto "o que fazer diferente" pela interface — estático, hardcoded por tipo.
- Reconhecimento individual de trabalhador — decisão dura já registrada (E1 §16.1): sem identidade persistente de pessoa.
- Heartbeat por pessoa/track — é por câmera, a mesma granularidade de todo o resto do catálogo.

---

## 7. Pré-requisito bloqueante

**A implementação não deve começar antes do "gating temporal de queda" ser resolvido no `cypher-capture`** (item do cronograma pós-NEXT, sem data definida — `docs/apresentacao-esqueleto.md`). Hoje, mesmo com a janela de merge de 15s, 2 quedas reais produzem 3 incidentes (E1 §4.1.2) — um placar de conformidade construído sobre essa taxa de falso positivo nasceria com credibilidade baixa, e placar não tem segunda chance (E1 §14). Este documento fica pronto e revisado para que a implementação comece assim que a calibração for concluída, sem precisar redesenhar nada.

**Resolução (2026-09-07) — desbloqueado com ressalva.** O gating temporal de queda foi implementado no `cypher-capture` (spec `planejadas/2026-09-05-gating-temporal-queda-design.md`, plano `plans/gating-temporal-queda/`, PR [#10](https://github.com/lucvs07/cypher-capture/pull/10)). Validação empírica (Tarefas 4–5 do plano GTQ): **precisão de `immediate_risk` melhorou de forma mensurável — 0,581 → 0,680 no caminho oficial (0,418 → 0,680 vs baseline do sweep), com zero falso `immediate_risk` novo em `cenario.mp4`.** No caminho de produção (`run_pipeline.py`), as 2 quedas reais geram alerta `FALL_RISK` com cobertura contínua — nenhuma queda inteira perdida. A taxa de falso positivo que motivava este bloqueio caiu; o placar de conformidade nasce com credibilidade aceitável. **Ressalva registrada:** o recall frame-level de `immediate_risk` ficou em 0,915, abaixo do piso literal de 0,95 da spec GTQ §5 — a causa é latência de borda de subida (~0,8 s numa única queda), não queda perdida, e a alavanca real (sensibilidade dos cues `person_fallen`) está fora do escopo do plano GTQ. Follow-up recomendado **não bloqueante**: se o placar E5 pontuar tempo-até-alerta ou contar número de incidentes de queda, revisitar (a) afrouxar os cues `person_fallen` com validação anti-overfitting própria e (b) fixar `merge_window_seconds` para estabilizar a contagem entre hosts CPU/GPU. A implementação da E5 pode começar assim que o PR #10 do `cypher-capture` for mergeado.

---

## 8. Premissas

- Multi-tenant (`2026-08-29-multi-tenant-design.md`) já implementado.
- Gating temporal de queda resolvido antes do início da implementação (§7).
- Deploy de instância única (mesma premissa de sempre).

---

## 9. Estratégia de testes

**Java** — cálculo de conformidade/cobertura/sequência sobre fixtures determinísticas de `Alerta` + `MonitoramentoDiario`; ranking por delta, não por total; agregação `estacaoId → equipeId` correta quando uma estação não tem equipe alocada ("sem equipe", E4 §3).

**Python** — cliente de heartbeat enviando no intervalo configurado, sem travar o pipeline se a API estiver fora (mesma tolerância a falha já aplicada em `HttpIncidentSink`).

**Angular** — `PlacarComponent` renderizando ranking e progresso de metas; campos de meta em `/config/equipe`; card de incidente no kiosk exibindo norma aplicável.

**Ponta a ponta** — pipeline enviando heartbeat + incidentes reais por alguns turnos simulados, confirmando que o placar reflete conformidade e cobertura corretas, e que desligar a captura reduz a cobertura (não o incidente) — validando a propriedade central da métrica (E1 §16.2).

---

## 10. Ordem de implementação

1. **Backend — heartbeat.** Endpoint, `MonitoramentoDiario`, jobs de agregação. Verificável com `curl`.
2. **Backend — metas e placar.** Campos em `Equipe`, `GET /api/v1/placar`, mapeamento de norma em `IncidentResponse`.
3. **Frontend.** `PlacarComponent`, campos de meta em `/config/equipe`, card de norma no kiosk.
4. **Ponta a ponta.** Turnos simulados, validação da propriedade anti-gaming da métrica.

Nenhum passo começa antes do pré-requisito de §7 estar resolvido.
