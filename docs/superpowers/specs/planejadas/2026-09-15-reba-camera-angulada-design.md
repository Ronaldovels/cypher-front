# REBA invariante a câmera angulada — spike para teste na SPI

**Repositórios:** `cypher` (backend), `cypher-capture` (pipeline Python), `cypher-front` (cadastro de câmera)
**Origem:** cards Trello "SPI review — Rotação de câmera personalizável (backend)" e "SPI review — REBA com câmera angulada + zona restringindo pipeline + rotação (capture)"
**Natureza:** spike/PoC para testar em campo na SPI no dia seguinte à escrita deste documento — profundidade de código real (não descartável), mas sem suíte de testes de integração completa; validação final acontece em campo.

## Contexto

Hoje o pipeline de captura assume:
1. Rotação de câmera só via flag manual `--rotate` da CLI (não vem do cadastro).
2. `trunk_flexion` (ângulo de tronco usado no REBA) assume câmera com roll ≈ 0 — câmera fisicamente torta lateralmente gera REBA incorreto.
3. Keypoint de pose ausente/oculto faz o score REBA daquela articulação virar `1` (risco mínimo) silenciosamente, em vez de indeterminado — viés sistemático de sub-notificação de risco.
4. REBA é calculado cru a cada frame, sem suavização — jitter de pose vira ruído no score.
5. `ZoneDetector.check()` calcula `in_zone` mas nada no pipeline usa esse flag para restringir quando um alerta ergonômico (REBA) deve valer.
6. Threshold de confiança de keypoint (`0.5`) é hard-coded, sem como recalibrar em campo sem redeploy.

## Decisões de design

**Vetor de verticalidade, não ângulo cru.** `trunk_flexion` passa a comparar o vetor tronco (quadril→ombro) contra uma referência de "vertical do mundo" fornecida externamente, não mais contra o eixo Y da imagem hard-coded. Hoje essa referência é uma constante derivada de um valor manual de roll (`anguloCameraGraus`); a interface (`vertical_from_roll` em `angles.py`) é o único ponto que uma futura calibração por aresta vertical (item descartado deste spike, ver "Fora de escopo") precisaria substituir — sem tocar no resto de `angles.py`.

**Dois campos de câmera, não um.** `rotacao` (0/90/180/270, já corrige múltiplos de 90° via `apply_rotation` no frame inteiro) e `anguloCameraGraus` (roll fino, -45 a 45, corrige só o cálculo de `trunk_flexion`) são conceitos independentes. Um não substitui o outro.

**Indeterminado, não risco mínimo.** Keypoint ausente em uma articulação usada por uma tabela REBA (tronco/pescoço/pernas para Tabela A; braço para Tabela B) marca o frame como `REBAScore.indeterminate = True`. A suavização temporal (média móvel/mediana de `final_score`) ignora frames indeterminados e mantém o último valor válido, em vez de deixar um `1` silencioso contaminar a média.

**Gate de zona só na avaliação ergonômica, nunca na detecção de queda.** Quando a câmera tem ao menos uma zona cadastrada, alertas de `ERGONOMICALLY_INADEQUATE` (REBA/postura sustentada) só disparam para quem está dentro da zona. Câmeras sem nenhuma zona cadastrada continuam avaliando todo mundo (sem regressão). Detecção de queda (`IMMEDIATE_RISK`) e entrada em zona crítica (`CRITICAL_ZONE`) nunca são gateadas por isso — são checagens de segurança que já têm sua própria lógica de zona e não podem depender de zona de trabalho estar configurada.

## Limitações explícitas (fora de escopo deste spike)

- **Pitch/perspectiva:** a correção de roll (`anguloCameraGraus`) resolve câmera torta lateralmente, não câmera olhando de cima em ângulo (perspectiva/foreshortening). Fica para entrega futura, condicionado a um pipeline de pose 3D — avaliado e descartado para a fase atual do projeto.
- **Calibração automática de verticalidade** (capturar uma aresta vertical real da cena via clique no editor de zona): é droppable neste spike. O campo manual `anguloCameraGraus` já entrega o teste de campo completo (digitar o valor medido e observar o REBA mudar). Se sobrar tempo, é a última tarefa a considerar — não faz parte dos planos abaixo.
- **Referencial de gravidade real via calibração de câmera (RANSAC/homografia)** e **correção sistemática do viés de oclusão em produção**: ambos ficam cobertos pelos itens 3 (indeterminado) e no próprio dia — não são adiados, mas o alcance é o descrito acima (indeterminado + suavização), não uma reestruturação do REBA.
- **ROI crop no pipeline** (recortar o frame pela bounding box das zonas antes de rodar pose/EPI, para ganho real de inferência): documentado como próxima etapa depois do gate funcional, não implementado agora.

## Sub-projetos

| Código | Repo | Escopo | Plano |
|---|---|---|---|
| RCA | `cypher` | Campos `rotacao`/`anguloCameraGraus` em `Camera`/DTOs, wiring em `CatalogService` | `docs/superpowers/plans/reba-camera-angulada/2026-09-15-rca-backend-camera.md` |
| RCB | `cypher-front` | Expor os 2 campos no formulário de cadastro de câmera | `docs/superpowers/plans/reba-camera-angulada/2026-09-15-rcb-front-camera-form.md` |
| RCC | `cypher-capture` | Rotação/roll vindos da config, threshold configurável, REBA indeterminado+suavizado, gate de zona | `docs/superpowers/plans/reba-camera-angulada/2026-09-15-rcc-capture-angulo-camera.md` |

Ordem de implementação: RCA → RCB → RCC (RCC depende dos campos existirem na API; dentro de RCC, a ordem interna está detalhada no próprio plano, com a UI de calibração como último item — e esse item nem está nos planos, é droppable por definição).
