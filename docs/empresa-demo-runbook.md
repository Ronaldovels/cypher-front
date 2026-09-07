# Runbook — empresa `demo` para testes locais

Complementa `e1-runbook-local.md` (como subir os 3 projetos). Este documento
descreve o que existe na empresa `demo` para teste local — câmeras reais da
meta indústria, webcam do notebook, equipes/operadores da gamificação (E5) —
e como reconstruir esses dados do zero.

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

## 5. Equipes de teste da E5 (gamificação)

Populadas com 14 dias de heartbeat/incidente sintético nas câmeras
**genéricas** (`CAM-01`–`04`, seed padrão do `CatalogSeeder`) — nunca nas
câmeras reais da fábrica, para não misturar dado fictício com o que vira
histórico de produção real quando o pipeline rodar lá de verdade.

| Equipe | Turno | Estações | Estado no placar |
|---|---|---|---|
| `EQ-DEMOA` | MANHA | EST-01/EST-02 | conformidade melhorou semana a semana, 1º no ranking, metas atingidas |
| `EQ-DEMOB` | TARDE | EST-03/EST-04 | conformidade piorou, 2º no ranking |
| `EQ-DEMOC` | NOITE | EST-01/EST-02 (mesmas estações, turno sem heartbeat) | "dados insuficientes" — fora do ranking |

Ver `GET /api/v1/placar` (logado como `gestor@demo`) ou `/placar` no front.

---

## 6. Referências

- `e1-runbook-local.md` — como subir os 3 projetos (backend, capture, front).
- `docs/superpowers/specs/planejadas/2026-08-29-gamificacao-e5-design.md` — design da E5, incluindo o piso de cobertura (0,5) que define "dados insuficientes".
- `scripts/seed-empresa-demo.sh` / `scripts/seed_gamificacao_demo.py` (repo `cypher`) — fonte de verdade reproduzível deste documento.
