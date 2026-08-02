#!/usr/bin/env bash
# Varredura de segredo com gitleaks sobre o histórico COMPLETO do repositório.
#
# Mesmo comando no CI (.github/workflows/secret-scan.yml) e na máquina do
# contribuidor (`pnpm secrets:scan`) — vermelho do CI se reproduz local.
#
# Uso:
#   pnpm secrets:scan
#   GITLEAKS_VERSION=v8.29.0 pnpm secrets:scan

set -euo pipefail

GITLEAKS_VERSION="${GITLEAKS_VERSION:-v8.28.0}"
GITLEAKS_IMAGE="zricethezav/gitleaks:${GITLEAKS_VERSION}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

die() {
  printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || die "docker é necessário para rodar o gitleaks"

# O container roda com um uid que não é o dono do bind mount. Sem isto o git de
# dentro recusa o repositório por "dubious ownership" — e o modo como ele recusa
# é o problema: o gitleaks trata o erro como fim de varredura, imprime
# "0 commits scanned / no leaks found" e SAI COM 0. Verde silencioso sobre
# histórico nenhum é pior que varredura nenhuma, porque ninguém volta a olhar.
docker_args=(
  --rm
  -e GIT_CONFIG_COUNT=1
  -e GIT_CONFIG_KEY_0=safe.directory
  -e GIT_CONFIG_VALUE_0=/repo
  -v "${REPO_ROOT}:/repo:ro"
)

# `--redact` porque o log do CI deste repositório é público: achado que imprime
# o segredo em claro vaza exatamente o que veio detectar.
output=$(docker run "${docker_args[@]}" "$GITLEAKS_IMAGE" \
  git /repo --log-opts=--all --redact --no-color --no-banner 2>&1) && status=0 || status=$?

printf '%s\n' "$output"

[ "$status" -eq 0 ] || die "gitleaks encontrou segredo no histórico (exit $status)"

# Guarda do guarda: confirma que a varredura de fato olhou commit. Cobre o caso
# acima e qualquer outro em que o gitleaks termine limpo por não ter lido nada
# (clone raso no CI, --log-opts inválido, mount vazio).
scanned=$(printf '%s\n' "$output" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) commits scanned.*/\1/p' | tail -1)

[ -n "$scanned" ] || die "não achei a contagem de commits na saída do gitleaks — varredura não confirmada"
[ "$scanned" -gt 0 ] || die "gitleaks varreu 0 commits — passou verde sem olhar o histórico.
  Causas conhecidas: clone raso (no CI, use actions/checkout com fetch-depth: 0)
  ou git worktree, cujo .git é um arquivo apontando para fora do bind mount —
  neste caso rode a varredura a partir do clone principal."

printf '\033[1;32m✓ gitleaks limpo em %s commits\033[0m\n' "$scanned"
