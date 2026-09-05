# Cypher — Gating Temporal de Queda

**Data:** 2026-09-05
**Status:** aprovado (design)
**Escopo:** eliminar a oscilação de categoria `IMMEDIATE_RISK` (queda) no `PostureClassifier` do `cypher-capture` que hoje faz uma única queda real virar mais de um incidente no dashboard — item registrado como "Pós-NEXT" em `docs/apresentacao-esqueleto.md` e citado como bloqueio explícito da E5 (`docs/superpowers/specs/planejadas/2026-08-29-gamificacao-e5-design.md` §7).

**Repositório:** `cypher-capture` (nenhuma mudança em `cypher`/`cypher-front`).

**Motivação:** a E5 (gamificação por equipe) constrói um placar de conformidade sobre a contagem de incidentes — um placar calculado sobre uma taxa de falso positivo conhecida (2 quedas reais → 3 incidentes) nasceria com credibilidade baixa e não tem segunda chance de recuperar confiança do usuário. Esta spec resolve essa causa raiz para destravar a E5.

---

## 1. Contexto e diagnóstico

`PostureClassifier` (`src/pose/classifier.py`) classifica `IMMEDIATE_RISK` por três gatilhos independentes (OR), avaliados frame a frame em `_evaluate_rules`:

- `person_fallen` (`_detect_fallen`) — cues geométricos independentes de velocidade: aspect ratio da bbox, `trunk_flexion`, `vertical_extent`. Confirma que a pessoa está deitada/caída *neste frame*.
- `fall_velocity` — `TemporalAnalyzer.update` (`src/pose/temporal.py`) mede velocidade/aceleração do centro do quadril; dispara quando a queda está *em andamento*, antes da pessoa necessariamente terminar deitada.
- `balance_loss_risk` (`_detect_instability`) — torção brusca do tronco. Fora do escopo desta spec.

A histerese atual (`_apply_hysteresis`) entra em `IMMEDIATE_RISK` rápido (`enter_frames_risk = 2`, prioriza recall) mas só sai depois de 15 frames consecutivos em `NORMAL`. Numa queda real, o sinal de `fall_velocity`/`person_fallen` pode cair abaixo do limiar por alguns frames intermitentes sem chegar a 15 seguidos — mas quando isso se soma ao pipeline real rodando mais devagar que o vídeo de origem, o intervalo entre uma reabertura e outra do mesmo track pode ultrapassar a janela de merge do `IncidentTracker` (`merge_window_seconds = 15s`), e a mesma queda física vira dois incidentes na notificação em vez de um. Combinado com um episódio de `ERGONOMIC_RISK` genuíno entre as duas quedas do cenário medido, o resultado documentado (`docs/e1b-verificacao.md`) é **2 quedas reais → 3 incidentes**.

O `IncidentTracker` (`src/notify/tracker.py`) não é o lugar certo para corrigir isso: ele só recebe a categoria já decidida pelo classificador (via `PersonEvent.posture`), sem acesso aos sinais brutos que diferenciam "queda em andamento" de "queda confirmada". A correção pertence ao classificador.

---

## 2. Mecanismo: confirmação de queda antes de reportar

Quando `_evaluate_rules` decide `IMMEDIATE_RISK` **via `fall_velocity` sem `person_fallen` já verdadeiro naquele mesmo frame**, o classificador não reporta a transição publicamente ainda — entra num estado de confirmação pendente por track (`person_id`):

1. **Início da janela:** no frame em que `fall_velocity` dispara pela primeira vez (e `person_fallen` ainda é falso), a categoria pública reportada permanece a que já estava vigente antes (não muda para `IMMEDIATE_RISK` neste instante).
2. **Durante a janela** (`fall_confirm_seconds`, default `1.0`, convertido para frames via `target_fps` do config — mesmo padrão de conversão tempo→frames já usado em `merge_window_seconds`): o classificador continua avaliando `_detect_fallen` a cada frame. Se `person_fallen` se tornar verdadeiro **antes** do fim da janela, a confirmação é antecipada — não precisa esperar o `fall_confirm_seconds` inteiro se a pessoa já demonstrou postura caída sustentada.
3. **Ao fim da janela** (ou na antecipação do passo 2): reavalia `_detect_fallen` no frame corrente.
   - **Verdadeiro** → confirma `IMMEDIATE_RISK` (motivo `person_fallen`), reporta a transição publicamente a partir deste frame. O `IncidentTracker` abre o incidente normalmente, sem nenhuma mudança de código no tracker.
   - **Falso** → descarta o episódio. A categoria pública segue o que a avaliação instantânea de `_evaluate_rules` decidir para aquele frame (`NORMAL`, `ERGONOMICALLY_INADEQUATE` etc.) — o gatilho `fall_velocity` momentâneo nunca chega a ser visível fora do classificador.

**Quando `person_fallen` já é verdadeiro desde o primeiro frame do gatilho** (pessoa já caída, sem uma fase de "queda em andamento" capturada — ex.: já estava fora do enquadramento e reaparece caída), não há janela de confirmação: reporta `IMMEDIATE_RISK` imediatamente, como hoje. A confirmação só existe para o caminho `fall_velocity`-primeiro.

`balance_loss_risk` e as demais categorias (`ERGONOMICALLY_INADEQUATE`, `CRITICAL_ZONE`) não são afetadas — a histerese delas continua exatamente como está.

### 2.1 Decisão de trade-off: recall vs. precisão

Um tropeço real onde a pessoa se recupera sozinha antes do fim da janela de confirmação **deixa de contar como `IMMEDIATE_RISK`** — pode virar `ERGONOMIC_RISK` ou nenhuma categoria de risco, dependendo dos ângulos daquele frame. Esta é uma escolha deliberada (não um efeito colateral): resolve a causa raiz do bug medido, na linha do que `docs/metricas-dia2.md` já propunha ("queda só conta se terminar em postura caída"), aceitando que a métrica de recall pode cair marginalmente em troca de eliminar o incidente espúrio. O impacto real precisa ser medido contra o conjunto de validação existente (§5) antes do merge — se o recall cair abaixo de um limiar aceitável, a janela (`fall_confirm_seconds`) é o parâmetro de ajuste, não o mecanismo.

### 2.2 Custo de latência

Uma queda real confirmada demora até `fall_confirm_seconds` (1.0s) a mais para virar incidente, comparado a hoje. Nas quedas medidas em `cenario2.mp4` (~4.5–4.8s de duração cada), isso é uma fração pequena do episódio. Registrado explicitamente porque é um sistema de segurança — 1s de atraso na notificação é um custo real, não zero, mesmo sendo pequeno frente à duração típica de uma queda.

---

## 3. Configuração

Novo campo em `pose_config.yaml`, seção `pipeline` (mesmo nível de `conf_epi`/`conf_pose`):

```yaml
pipeline:
  fall_confirm_seconds: 1.0   # janela de confirmacao antes de reportar IMMEDIATE_RISK via fall_velocity
```

Convertido para frames internamente via `target_fps` (mesmo padrão de `merge_window_seconds` → frames já usado em outras partes do pipeline). Sem CLI flag nova — é parâmetro de calibração de modelo, não de execução por câmera.

---

## 4. Comportamento sob falha / casos

| Situação | Comportamento |
|---|---|
| `fall_velocity` dispara, `person_fallen` confirma antes do fim da janela | Confirma `IMMEDIATE_RISK` na antecipação, não espera o resto da janela |
| `fall_velocity` dispara, `person_fallen` nunca confirma dentro da janela | Descartado — nunca reporta `IMMEDIATE_RISK` para este episódio |
| `person_fallen` verdadeiro já no primeiro frame do gatilho | Confirma imediato, sem janela — mesmo comportamento de hoje |
| Track perdido (pessoa sai de quadro) durante a janela de confirmação pendente | Episódio pendente descartado junto com o track — mesmo espírito de `_evict_lost_tracks` do tracker, mas dentro do classificador |
| `balance_loss_risk` (torção) | Inalterado — fora do escopo desta spec |

---

## 5. Estratégia de testes

**Unitário (`tests/test_classifier.py`)** — novos testes cobrindo: (a) `fall_velocity` seguido de `person_fallen` confirmado dentro da janela → `IMMEDIATE_RISK` reportado; (b) `fall_velocity` sem confirmação dentro da janela → nunca reporta `IMMEDIATE_RISK`; (c) `person_fallen` verdadeiro desde o primeiro frame → confirma imediato, sem esperar a janela; (d) confirmação antecipada quando `person_fallen` vira verdadeiro antes do fim da janela.

**Fixture/regressão (`tests/test_incident_tracker.py`, `tests/fixtures/cenario2_transitions.json`)** — a fixture de transições precisa ser regravada rodando o classificador atualizado contra `data/validation/cenario2.mp4`, já que as transições brutas mudam (menos oscilações chegando ao tracker). O teste `test_cenario2_produz_dois_incidentes_para_duas_quedas` precisa continuar verde.

**Validação de recall (`data/validation/`)** — reexecutar a suíte de medição existente (mesma usada em `docs/metricas-dia2.md`) contra o classificador atualizado, comparando recall antes/depois. Critério de aceite: recall não regride abaixo do que já está documentado como baseline aceito, ou a regressão é pequena o bastante para ser uma troca consciente e documentada (não uma surpresa).

**Ponta a ponta** — rodar `cenario2.mp4` real (não a fixture, o vídeo) através do pipeline completo (`run_pipeline.py`) e confirmar que o resultado final é **2 incidentes `FALL_RISK`**, não 3 — a divergência exata que motivou esta spec (`docs/e1b-verificacao.md`).

---

## 6. Fora de escopo

- Gating temporal para `balance_loss_risk` (torção) — só queda, conforme o item original do roadmap.
- Retreino do modelo de pose/EPI — esta mudança é lógica de regras determinística sobre sinais já extraídos, não toca a rede neural.
- Mudança no `IncidentTracker`/`merge_window_seconds` — o mecanismo de merge por tempo de relógio continua como está; o gating resolve a causa na origem (classificador), não no paliativo de notificação.
- Configuração de `fall_confirm_seconds` por câmera/empresa — é parâmetro global de calibração de modelo, mesmo nível de `conf_epi`/`conf_pose`.

---

## 7. Premissas

- Correção acontece só no `cypher-capture`; nenhuma mudança em `cypher`/`cypher-front`.
- Uma vez validado (recall aceitável + `cenario2.mp4` produzindo 2 incidentes), o bloqueio §7 da spec de gamificação (E5) é considerado resolvido — decisão de desbloqueio cabe a quem revisar os números de validação, não é automática só por este código existir.

---

## 8. Ordem de implementação

1. **Classificador.** Estado de confirmação pendente em `PostureClassifier`/`_apply_hysteresis`, config `fall_confirm_seconds`. Testes unitários dos 4 casos de §5.
2. **Regravar fixture.** Rodar `cenario2.mp4` contra o classificador atualizado, regravar `cenario2_transitions.json`, confirmar `test_incident_tracker.py` verde.
3. **Validação de recall.** Reexecutar a suíte de medição contra `data/validation/`, comparar com o baseline documentado.
4. **Ponta a ponta.** `cenario2.mp4` via `run_pipeline.py` completo, confirmar 2 incidentes `FALL_RISK`.
5. **Decisão de desbloqueio da E5** com base nos números de (3) e (4).
