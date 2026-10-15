# Runbook — empresa `demo` para testes locais

Complementa `e1-runbook-local.md` (como subir os 3 projetos). Este documento
descreve o que existe na empresa `demo` para teste local — câmeras reais da
meta indústria, webcam do notebook, equipes/operadores da gamificação (E5) —
além de como reconstruir esses dados do zero e preparar a banca final.

## Origem dos dados (simulados)

Os dados da empresa `demo` são **simulados** e existem só para demonstração.
O catálogo (estações, câmeras, equipes, operadores) e o histórico dos últimos
14 dias (incidentes, alertas, cobertura por turno e o histórico de gamificação)
são criados por `scripts/seed-empresa-demo.sh` e `seed_gamificacao_demo.py` no
repositório do backend, a partir de regras fixas e sem dado pessoal real:
colaboradores aparecem só por equipe e estação, nunca por nome (LGPD). Os
incidentes novos que aparecem durante a demonstração vêm do pipeline real do
`cypher-capture` rodando sobre o vídeo de demonstração versionado em
`cypher-capture/data/demo/`.

**Nunca commitar segredo real aqui.** `data/cypherdb.mv.db` (`cypher`) é
gitignorado de propósito — carrega tokens de estação e api-keys de câmera em
texto puro (ver comentário no `.gitignore` do repo). Este documento também
não guarda esses valores: eles são gerados pelo próprio backend a cada seed
e você os lê localmente (via UI ou API) quando precisar.

---

## 1. Reconstruir os dados

```bash
cd ~/projects/cypher
./mvnw spring-boot:run &      # backend precisa estar de pé

CYPHER_DEMO_GESTOR_PASSWORD=demo12345 \
CYPHER_DEMO_OPERADOR_PASSWORD=operador123 \
  ./scripts/seed-empresa-demo.sh
```

O script (`scripts/seed-empresa-demo.sh` + `scripts/seed_gamificacao_demo.py`)
é idempotente para estação/câmera/equipe/usuário (a API devolve 409 se já
existir, o script segue). **O histórico sintético de gamificação não é** —
rode uma vez só (ver aviso no cabeçalho do `.py`).

---

## 2. Login de gestor

| Campo | Valor |
|---|---|
| Username | `gestor@demo` |
| Senha | a que você passou em `CYPHER_DEMO_GESTOR_PASSWORD` (`demo12345` no exemplo acima) |
| Empresa | `demo` — "Empresa de demonstracao" (seedada pelo `CatalogSeeder`, não pelo script) |

Login em `/login` no front (`localhost:4200`).

---

## 3. Operadores (login por usuário/senha OU token de estação no kiosk)

| Username | Estação | Senha (default do script) |
|---|---|---|
| `operador.esteira@demo` | EST-01 — Esteira de montagem | `CYPHER_DEMO_OPERADOR_PASSWORD` (`operador123`) |
| `operador.prensa@demo` | EST-02 — Prensa 3 | idem |
| `operador.expedicao@demo` | EST-03 — Expedição | idem |
| `operador.solda@demo` | EST-04 — Solda robotizada | idem |

Essas 4 estações são as usadas pelas equipes de teste da E5 (§5). Cada
operador também pode entrar pelo kiosk (`/login-estacao`) usando o **token**
da própria estação em vez de usuário/senha — o token é gerado pela API na
criação e não é reproduzido aqui; para consultar o atual:

```bash
# logado como gestor@demo (cookie de sessão em $COOKIE):
curl -s -X PUT localhost:8080/api/v1/stations/EST-01 -b $COOKIE \
  -H "Content-Type: application/json" \
  -d '{"id":"EST-01","nome":"Esteira de montagem","setor":"montagem"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])"
```

(PUT sem tocar `ativa` não roda nem invalida o token atual — só devolve o
que já existe. Rotacionar de verdade é `POST /stations/{id}/token/regenerate`.)

---

## 4. Câmeras reais da meta indústria

Cadastradas na empresa `demo`, `fonte` com placeholder — a senha RTSP real
(`SIDI2023`) vive só no `.env` do `cypher-capture` (`CYPHER_RTSP_USER`/
`CYPHER_RTSP_PASS`), nunca no banco:

| Câmera | Estação | Host RTSP |
|---|---|---|
| `CAM-FRESA1` | EST-FRESA1 — Fresa 1 (usinagem) | `10.14.22.97` |
| `CAM-FRESA2` | EST-FRESA2 — Fresa 2 (usinagem) | `10.14.22.98` |
| `CAM-TENDA` | EST-TENDA — Tenda | `10.14.22.99` |
| `CAM-SALA4` | EST-SALA4 — Sala 4 | `10.14.24.6` |
| `CAM-SICK` | EST-SICK — SICK Visionary-B (sem credencial, sem local físico definido — renomear a estação quando souber onde vai) | `10.14.22.96` |
| `CAM-WEBCAM` | EST-WEBCAM — Webcam do notebook | `--source 0` local (não é RTSP) |

Api-key de cada câmera (`X-Cypher-Key`, usada pelo `cypher-capture` para
ingestão/heartbeat) é gerada no cadastro e fica só no cache local do
pipeline (`outputs/apikey-cache.json`, gitignorado) ou pode ser
reprovisionada a qualquer momento via `POST /cameras/{id}/apikey/regenerate`.

Setor de Tenda/Sala 4/SICK não veio na especificação original — em branco,
editável em `/config/estacoes`.

---

## 5. Equipes da gamificação (E5)

Desde a preparação da banca final (§6), as equipes do placar ficam nas
**estações reais**, e os alertas dos testes na meta indústria contam no
placar. Só a cobertura (`monitoramento_diario`) é sintética nas câmeras
reais: 14 dias contados a partir do dia em que o script roda, e só nos dias
e turnos sem heartbeat real.

| Equipe | Turno | Estações | Origem dos incidentes |
|---|---|---|---|
| `EQ-DEMOA` Usinagem - Manhã | MANHA | Fresa 1 + Fresa 2 | alertas reais dos testes |
| `EQ-DEMOB` Montagem - Manhã | MANHA | Tenda + Sala 4 | alertas reais dos testes |
| `EQ-DEMOC` Usinagem - Noite | NOITE | Fresa 1 + Fresa 2 | nenhum, sem cobertura: aparece como "dados insuficientes" |
| `EQ-DEMOD` Produção - Tarde | TARDE | EST-03 + EST-04 (`CAM-03`/`CAM-04`, vídeos de dataset) | sintéticos: mais incidentes na semana anterior, menos na atual |

A `EQ-DEMOD` existe porque os alertas reais caem todos na mesma semana. Sem
ela, nenhuma equipe apareceria melhorando. Os incidentes fictícios ficam nas
câmeras genéricas, nunca nas reais.

A tendência das equipes reais depende do dia em que o placar é consultado.
Ensaiado em 22/09 com o script rodado para 23/09:

| Equipe | Placar em 23/09 |
|---|---|
| Produção - Tarde | 99,9%, melhora +2,9 pp |
| Montagem - Manhã | 99,6%, piora −0,4 pp, 7 dias sem queda |
| Usinagem - Manhã | 98,5%, piora −1,5 pp, 7 dias sem queda |
| Usinagem - Noite | dados insuficientes |

Ver `GET /api/v1/placar` (logado como `gestor@demo`) ou `/placar` no front.

---

## 6. Preparar para a banca final da SPI

Roda em cima do banco local atual, sem recriar nada:

```bash
cd ~/projects/cypher
./scripts/subir-empresa-demo.sh start     # backend + front + webcam (o seed antigo é pulado)
./scripts/preparar-demo-banca.sh          # prepara a demo e mostra o placar no fim
```

O que o `preparar-demo-banca.sh` (com `scripts/demo_banca.py`) faz:

1. Grava um backup consistente em `data.bak-<data-hora>/cypherdb.zip`, fora de `data/` e gitignorado.
2. Fecha com `PIPELINE_STOPPED` os alertas testados que ficaram abertos, porque o pipeline parou sem mandar o fechamento. O fim registrado é o último instante daquela execução. Sem isso, eles apareceriam como incidentes ativos no painel.
3. Apaga o histórico sintético antigo (`run_id = seed-run-1` e o heartbeat sintético das `CAM-01..04`). Esse histórico foi datado no dia em que foi gerado e ficou fora das duas semanas que o placar compara.
4. Coloca as equipes nas estações da §5 e reativa `CAM-03`/`CAM-04`, porque o placar só conta câmera ativa.
5. Recria a cobertura e os incidentes sintéticos relativos a hoje.

Pode rodar mais de uma vez, e com o backend no ar ou parado. O que é sintético
é identificável e recriado a cada execução:

- incidentes com `run_id = seed-banca`;
- linhas de `monitoramento_diario` com `ultimo_heartbeat` terminando em `.987654` segundos.

Para ensaiar outra data, use `CYPHER_DEMO_HOJE=AAAA-MM-DD ./scripts/preparar-demo-banca.sh`.

Para voltar ao backup, pare o backend e rode:

```bash
java -cp <h2.jar> org.h2.tools.Restore -file data.bak-<...>/cypherdb.zip -dir data -db cypherdb
```

**Pontos de atenção na apresentação:**

- O dashboard mostra cerca de 500 alertas pendentes, porque os alertas dos testes nunca foram reconhecidos.
- A renotificação está ligada (`cypher-capture#13`). Uma violação que continua na webcam gera um alerta novo a cada 120 s.
- `CAM-03`/`CAM-04` aparecem no painel e ficam offline no modo webcam. Com `--orchestrator`, o pipeline passa a rodar `cenario3.mp4`/`cenario4.mp4` nelas.

---

## 7. Referências

- `e1-runbook-local.md` — como subir os 3 projetos (backend, capture, front).
- `docs/superpowers/specs/planejadas/2026-08-29-gamificacao-e5-design.md` — design da E5, incluindo o piso de cobertura (0,5) que define "dados insuficientes".
- `scripts/seed-empresa-demo.sh` / `scripts/seed_gamificacao_demo.py` (repo `cypher`) — reconstroem o cadastro da demo do zero (§1).
- `scripts/preparar-demo-banca.sh` / `scripts/demo_banca.py` (repo `cypher`) — preparação da banca (§5 e §6).
