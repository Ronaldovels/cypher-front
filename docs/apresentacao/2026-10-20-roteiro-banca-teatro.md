# Roteiro — Banca final no ambiente simulado em teatro

**Data:** 2026-10-20
**Contexto:** formato de apresentação definido pela coordenação (bloco A/B/C cronometrado, com câmeras reais ligadas por cabo de rede e saída de vídeo por HDMI para o telão). Este documento traduz esse formato genérico para os 3 repositórios do Cypher e para o cenário físico do teatro (3 câmeras IP Intelbras VIPC-1230-B-G2 em dois switches Tenda TX2Pro).
**Squad:** Felipe Wapf Fettback (RM 557217), Lucas Rodrigues Grecco (RM 558261), Monique Ferreira dos Anjos (RM 558262), Ronaldo Veloso Filho (RM 556445), Tiago Brito Nário (RM 558248), Rafael Augusto Oliveira Silva (RM 555154).

---

## 0. Papéis sugeridos

| Papel | Responsabilidade |
|---|---|
| **Operador técnico** | 1 pessoa no notebook: sobe/verifica backend+front+capture, conecta o HDMI, monitora os logs durante B e C. |
| **Narrador** | Explica o que o sistema está mostrando em tempo real (dashboard/timeline), sem slides, durante os 2 minutos iniciais de C. |
| **Atores do grupo** | Vestem/removem EPI e assumem posturas de risco dentro das áreas fabris durante C (2 min iniciais), de forma coreografada com o narrador. |
| **"Estranhos"** | Pessoas fora do grupo (ou do próprio grupo, mas sem aviso prévio ao narrador) que entram nas áreas fabris/circulação no minuto final de C, para testar reação a evento não roteirizado. |

Essencial: quem estiver no notebook durante B **não precisa reiniciar nada** — só reconectar o cabo de rede (ver §2). O pipeline reconecta sozinho.

---

## 1. Pré-banca (antes do bloco A, com antecedência)

Fazer isso **fora do tempo cronometrado**, idealmente no dia anterior ou na chegada ao teatro:

1. `git pull` nos 3 repositórios (`cypher`, `cypher-front`, `cypher-capture`) — confirma que está rodando a última versão.
2. Verificar `cypher-capture/.env`: `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `CYPHER_GESTOR_USER/PASSWORD`, e as credenciais RTSP de cada câmera do teatro (`CYPHER_TEATRO_USER/PASS` e eventuais variáveis específicas por câmera, se as credenciais não forem as mesmas nas 3 — ver §5, risco aberto).
3. Conectar o notebook ao switch do teatro pelo `enp3s0` e confirmar que os 3 IPs das câmeras respondem na porta 554:
   ```bash
   for ip in 192.168.50.121 192.168.1.104 192.168.1.108; do nc -z -w2 "$ip" 554 && echo "$ip ok"; done
   ```
4. Rodar `cypher/scripts/preparar-demo-banca.sh` **uma vez**, para fechar alertas de teste antigos e zerar o ruído do dashboard (hoje há ~29 incidentes de teste com `snapshotUrl: null` da fase de validação da CAM-TEATRO1 — ver achado em `docs/empresa-demo-runbook.md`).
5. Confirmar login `gestor@demo` / senha combinada, e deixar o front **já logado** numa aba, parado na tela que for abrir em B (sugestão: `/estacoes` ou `/dashboard`).

---

## 2. Bloco A — Configurações prévias (10 min)

Cada grupo conecta o sistema às câmeras, ajusta zonas, e **ao final desconecta o cabo de rede das câmeras** (backend/front/capture continuam rodando — só o cabo físico sai).

1. Subir backend + front (ficam de pé até o fim de B/C, não derrubar entre os blocos):
   ```bash
   cd ~/projects/cypher
   export CYPHER_FRONT_DIR=~/projects/challenge/cypher-front
   export CYPHER_CAPTURE_DIR=~/projects/challenge/cypher-capture
   ./scripts/subir-empresa-demo.sh start --no-capture
   ```
2. Subir a captura das câmeras do teatro — **um processo dedicado por câmera** (não usar `--orchestrator`: o limite padrão de 2 concorrentes deixaria câmera de fora). Sempre exportando o `.env` primeiro (lembrete já documentado no script e no runbook — sem isso não sobe foto pro Cloudinary nem expande a senha RTSP):
   ```bash
   cd ~/projects/challenge/cypher-capture
   set -a && source .env && set +a

   nohup ./venv/bin/python src/run_pipeline.py --camera-id CAM-TEATRO1 \
     --api-url http://localhost:8080/api/v1 --stream-port 8102 --device cpu --no-display \
     > ~/.cypher-demo/capture-teatro1.log 2>&1 & disown

   nohup ./venv/bin/python src/run_pipeline.py --camera-id CAM-TEATRO2 \
     --api-url http://localhost:8080/api/v1 --stream-port 8103 --device cpu --no-display \
     > ~/.cypher-demo/capture-teatro2.log 2>&1 & disown

   nohup ./venv/bin/python src/run_pipeline.py --camera-id CAM-TEATRO3 \
     --api-url http://localhost:8080/api/v1 --stream-port 8104 --device cpu --no-display \
     > ~/.cypher-demo/capture-teatro3.log 2>&1 & disown
   ```
3. No front (`localhost:4200`, logado como `gestor@demo`), confirmar as 3 câmeras "ao vivo" em `/estacoes` (ou no card de live feed do dashboard).
4. Ajustar as zonas de risco de cada câmera (`/config/estacoes` → selecionar a câmera → editor de zonas) para marcar **área fabril** e **área de circulação** conforme o cenário montado no teatro. Isso grava no banco — não precisa repetir em B/C.
5. Validar rapidamente que o sistema reage (um dos atores entra no quadro sem EPI por alguns segundos e confere se o incidente aparece em `/incidentes`).
6. **Ao final:** desconectar o cabo de rede das câmeras (ou do switch). **Não** encerrar os processos — deixar backend, front e os 3 `run_pipeline.py` rodando. A captura vai detectar a queda de conexão e entrar em modo de reconexão com backoff automático (até 10s entre tentativas) — é esperado aparecer "câmera indisponível" no front durante a desconexão.

---

## 3. Bloco B — Preparação (2 min)

1. Reconectar o cabo de rede ao switch das câmeras. As capturas reconectam sozinhas (backoff ≤ 10s) — **não precisa reiniciar nenhum processo nem re-exportar o `.env`**, pois eles nunca foram encerrados.
2. Conectar o cabo HDMI no telão e abrir a janela do front já logada na tela escolhida em §1.5.
3. Conferir em `/estacoes` que as 3 câmeras voltaram para "ao vivo" (pode levar alguns segundos após o cabo entrar).
4. Atores vestem EPI e se posicionam nas áreas fabris, a critério do grupo.

Se alguma câmera não voltar a tempo (ex.: problema de credencial ainda não resolvido na CAM-TEATRO2/3 — ver §5), seguir com as câmeras que estiverem de pé; o sistema funciona com 1 câmera só.

---

## 4. Bloco C — Apresentação (3 min)

Objetivo da guiada (0:00–2:00): não narrar tela por tela sem propósito — cada tela escolhida prova um ponto-chave do projeto (tempo real via SSE, múltiplos tipos de risco com REBA/NR, evidência fotográfica, visão agregada por estação, gamificação). O ator e o narrador trabalham em paralelo: a ação física do ator é o gatilho, a troca de tela é a prova.

**Antes de abrir a fala:** front já parado em `/dashboard`, logado como `gestor@demo`, com a câmera ao vivo visível no card de live feed (deixar assim desde o fim do Bloco B).

| Tempo | Tela | Ação do ator | Fala do narrador (ponto-chave) |
|---|---|---|---|
| 0:00–0:15 | `/dashboard` (abertura) | — | Aponta o card de câmera ao vivo e o KPI "incidentes hoje" zerado/baixo. Ponto-chave: sistema já está processando o vídeo em tempo real, antes de qualquer incidente acontecer. |
| 0:15–0:40 | `/dashboard` (mesma tela, sem navegar) | Ator 1 remove um EPI obrigatório (colete/capacete) dentro da área fabril e permanece ~10s | Narrador aponta o KPI "incidentes hoje" incrementando e o card de incidentes recentes preenchendo **sem recarregar a página**. Ponto-chave: SSE — o evento chega ao vivo, não é polling. |
| 0:40–1:00 | clica no incidente recém-aberto → `/incidentes/:id` | — | Mostra o snapshot (Cloudinary), o score REBA + nível de ação, a zona detectada e o EPI ausente, e lê a norma aplicável (`NR-6`). Ponto-chave: não é só "detectou algo" — tem evidência fotográfica e fundamentação regulatória por trás de cada alerta. |
| 1:00–1:25 | volta para `/incidentes` (timeline) | Ator 2 assume postura de risco ergonômico (braço elevado ou tronco fletido) por ~10s | Aponta o novo item entrando na lista ao vivo, cita REBA e `NR-17`. Ponto-chave: o mesmo pipeline cobre EPI **e** ergonomia, com um motor de scoring (REBA), não é uma regra solta por tipo de risco. |
| 1:25–1:45 | navega para `/heatmap` | Ator 3 simula queda controlada (ao chão, de forma segura) | Aponta a célula da estação ficando "quente" e cita `NR-35`. Ponto-chave: visão agregada por estação — útil pro gestor que não está olhando câmera por câmera. |
| 1:45–2:00 | navega para `/placar` | — | Menciona rapidamente a gamificação por equipe (conformidade, sequência sem queda). Ponto-chave: o sistema não é só reativo (alerta → fecha) — gera um indicador contínuo que incentiva a equipe a manter o padrão, antes do incidente acontecer de novo. |

Se algum alerta não tiver aberto ainda no tempo previsto (histerese de 2–4s para abrir, atores com folga), o narrador segue na tela atual até o card atualizar — não navegar para a tela seguinte sem o gatilho ter disparado, senão a tela de destino fica vazia.

**2:00–3:00 — evento não roteirizado.** Ficar parado em `/incidentes` (timeline) ou `/dashboard` — qualquer uma mostra a entrada de um novo item via SSE sem precisar navegar, o que importa aqui é não estar no meio de uma transição de tela quando o evento acontecer. Pessoas fora do combinado com o narrador ("estranhos") entram na área fabril e/ou de circulação e fazem algo imprevisto. Narrador observa a reação do sistema ao vivo (zona de risco acionada, novo incidente, severidade) e explica para a banca o que está acontecendo, sem preparo prévio do que vai aparecer.

---

## 5. Riscos abertos / pontos de atenção

- **Credencial RTSP da CAM-TEATRO2 (192.168.1.104) e CAM-TEATRO3 (192.168.1.108) ainda não validada.** As mesmas credenciais da CAM-TEATRO1 (`alunos3EC`/`FiapSPI@2026`) devolveram 401/403 nessas duas — pode ser credencial diferente por câmera ou bloqueio temporário por tentativa. **Resolver antes do dia da banca** (ver `docs/empresa-demo-runbook.md` e a conversa de depuração — checar etiqueta física, app Intelbras, ou resetar a câmera). Enquanto não resolvido, o plano B é apresentar só com a CAM-TEATRO1.
- **Renotificação a cada 120s:** se um ator ficar parado sem EPI por mais de 2 minutos, o sistema abre um alerta novo (comportamento esperado, documentado em `empresa-demo-runbook.md` §6) — bom o narrador saber disso para não parecer bug.
- **`.env` não é carregado automaticamente** pelo `run_pipeline.py`/orquestrador — se precisar subir a captura de novo no meio do evento (ex.: processo caiu), **lembrar de `source .env`** antes, senão some o upload pro Cloudinary e a fonte RTSP não expande a senha (ver lembrete em `scripts/subir-empresa-demo.sh` e `empresa-demo-runbook.md`).
- **Snapshot no Cloudinary:** alertas abertos antes do `source .env` ficam com `snapshotUrl: null` para sempre (não há upload retroativo) — se aparecer algum "processando imagem" preso na tela de detalhe, é esse caso, não bug novo.

---

## 6. Comandos de referência rápida

```bash
# status dos 3 projetos
cd ~/projects/cypher && CYPHER_FRONT_DIR=~/projects/challenge/cypher-front \
  CYPHER_CAPTURE_DIR=~/projects/challenge/cypher-capture ./scripts/subir-empresa-demo.sh status

# ver se as 3 câmeras do teatro estão respondendo a 554
for ip in 192.168.50.121 192.168.1.104 192.168.1.108; do nc -z -w2 "$ip" 554 && echo "$ip ok"; done

# conferir incidentes recentes de uma câmera (gestor@demo logado em $COOKIE)
curl -s "localhost:8080/api/v1/incidents?camera=CAM-TEATRO1" -b "$COOKIE" | python3 -m json.tool | head -40

# encerrar tudo ao final do evento
pkill -f "run_pipeline.py --camera-id CAM-TEATRO"
cd ~/projects/cypher && CYPHER_FRONT_DIR=~/projects/challenge/cypher-front \
  CYPHER_CAPTURE_DIR=~/projects/challenge/cypher-capture ./scripts/subir-empresa-demo.sh stop
```
