#!/usr/bin/env bash
# Exporta os incidentes da empresa demo (tabela `alertas`) em CSV, usando o
# endpoint de relatório já existente no backend Cypher
# (GET /api/v1/reports/incidents.csv — ReportController).
#
# Pré-requisito: backend rodando com a empresa demo semeada
# (ver ./scripts/subir-empresa-demo.sh start).
#
# Uso:
#   ./scripts/exportar-incidentes-csv.sh [caminho-de-saida.csv]
#
# Variáveis de ambiente (todas opcionais, com default):
#   CYPHER_API_URL         default: http://localhost:8080/api/v1
#   CYPHER_GESTOR_USER     default: gestor@demo
#   CYPHER_GESTOR_PASSWORD default: demo12345

set -uo pipefail

API_URL="${CYPHER_API_URL:-http://localhost:8080/api/v1}"
GESTOR_USER="${CYPHER_GESTOR_USER:-gestor@demo}"
GESTOR_PASSWORD="${CYPHER_GESTOR_PASSWORD:-demo12345}"
OUT_FILE="${1:-./data-export/incidentes.csv}"

log()  { echo "[exportar-incidentes-csv] $*"; }
die()  { echo "[exportar-incidentes-csv] ERRO: $*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl não encontrado"

curl -sf "$API_URL/health" >/dev/null 2>&1 \
  || die "backend não respondeu em $API_URL/health — suba com ./scripts/subir-empresa-demo.sh start"

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

log "autenticando como $GESTOR_USER em $API_URL/auth/login"
LOGIN_STATUS="$(curl -s -o /dev/null -w '%{http_code}' \
  -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$GESTOR_USER\",\"password\":\"$GESTOR_PASSWORD\"}" \
  "$API_URL/auth/login")"
[ "$LOGIN_STATUS" = "200" ] || die "login falhou (HTTP $LOGIN_STATUS) — confira CYPHER_GESTOR_USER/CYPHER_GESTOR_PASSWORD"

mkdir -p "$(dirname "$OUT_FILE")"

log "baixando incidents.csv"
DOWNLOAD_STATUS="$(curl -s -o "$OUT_FILE" -w '%{http_code}' \
  -b "$COOKIE_JAR" \
  "$API_URL/reports/incidents.csv")"
[ "$DOWNLOAD_STATUS" = "200" ] || die "download falhou (HTTP $DOWNLOAD_STATUS)"

LINES="$(wc -l < "$OUT_FILE")"
log "ok — $OUT_FILE ($LINES linhas, incluindo cabeçalho)"
