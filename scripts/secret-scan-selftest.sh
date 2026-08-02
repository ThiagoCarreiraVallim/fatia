#!/usr/bin/env bash
# Autoteste do `scripts/secret-scan.sh` — roda o script de verdade, com o mesmo
# gitleaks, sobre repositórios sintéticos de resultado conhecido.
#
# Existe por causa de um verde silencioso: `gitleaks git --log-opts=--all` roda
# `git log -p` por baixo, e `git log -p` não emite diff de merge commit. Segredo
# posto na resolução de um conflito passava verde, e a guarda de "0 commits" não
# acusava — os outros commits mantinham a contagem acima de zero. O caso 2 abaixo
# fica vermelho se alguém tirar o `-m` do `--log-opts`.
#
# Uso:
#   pnpm secrets:scan:selftest

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

failures=0

pass() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
fail() {
  printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2
  failures=$((failures + 1))
}

command -v docker >/dev/null 2>&1 || {
  printf '\033[1;31m✗ docker é necessário para o autoteste\033[0m\n' >&2
  exit 1
}

SCAN="$REPO_ROOT/scripts/secret-scan.sh"

# O job chama `./scripts/secret-scan.sh` direto, então o bit de execução faz
# parte do contrato. Sem esta checagem, perder o modo 100755 aparece lá embaixo
# como "segredo passou despercebido (exit 126)" — diagnóstico errado para um
# problema trivial.
[ -x "$SCAN" ] || {
  printf '\033[1;31m✗ %s não está executável (git update-index --chmod=+x)\033[0m\n' "$SCAN" >&2
  exit 1
}

# Token sintético no formato de PAT do GitHub, montado em duas partes: escrito
# inteiro, esta linha viraria achado na varredura do próprio repositório — o
# autoteste do detector não pode disparar o detector.
SEGREDO_PLANTADO="ghp_$(printf '%s' 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8')"

# Repositório com um merge de conflito real, cuja resolução recebe o conteúdo
# passado em $2. Esse conteúdo existe em um único ponto do histórico: nenhum dos
# dois pais tem a linha, então só o diff do merge a revela.
make_repo_with_evil_merge() {
  local dir="$1" resolution="$2"

  mkdir -p "$dir/scripts"
  cp "$SCAN" "$dir/scripts/secret-scan.sh"

  git -C "$dir" init -q -b main
  git -C "$dir" config user.email 'selftest@fatia.local'
  git -C "$dir" config user.name 'Selftest'
  git -C "$dir" config commit.gpgsign false

  printf 'github_token = PLACEHOLDER\n' >"$dir/credentials.txt"
  git -C "$dir" add -A
  git -C "$dir" commit -qm 'base'

  git -C "$dir" checkout -q -b topic
  printf 'github_token = FROM_TOPIC\n' >"$dir/credentials.txt"
  git -C "$dir" commit -qam 'topic'

  git -C "$dir" checkout -q main
  printf 'github_token = FROM_MAIN\n' >"$dir/credentials.txt"
  git -C "$dir" commit -qam 'main'

  git -C "$dir" merge --no-commit topic >/dev/null 2>&1 || true
  printf '%s\n' "$resolution" >"$dir/credentials.txt"
  git -C "$dir" add -A
  git -C "$dir" commit -qm 'merge topic (resolvendo conflito)'
}

# Roda o secret-scan.sh copiado para dentro do repositório sintético — é assim
# que ele descobre o próprio REPO_ROOT, sem precisar de parâmetro novo.
run_scan() {
  local dir="$1"
  shift
  env "$@" "$dir/scripts/secret-scan.sh" 2>&1
}

# --- Caso 1: histórico limpo passa (guarda do guarda) ---------------------
#
# Sem este caso, um script que falhasse sempre passaria no caso 2.
clean="$TMP_ROOT/limpo"
make_repo_with_evil_merge "$clean" 'github_token = PLACEHOLDER'

status=0
out=$(run_scan "$clean") || status=$?

if [ "$status" -ne 0 ]; then
  fail "histórico sem segredo deveria passar verde, saiu $status:
$out"
elif [ "${out#*gitleaks limpo}" = "$out" ]; then
  fail "histórico limpo saiu 0, mas sem a mensagem de sucesso:
$out"
else
  pass 'histórico sem segredo passa verde'
fi

# --- Caso 2: segredo que só existe no merge commit é encontrado -----------
leaky="$TMP_ROOT/vazado"
make_repo_with_evil_merge "$leaky" "github_token = ${SEGREDO_PLANTADO}"

status=0
out=$(run_scan "$leaky") || status=$?

if [ "$status" -eq 1 ] && [ "${out#*encontrou segredo}" != "$out" ]; then
  pass 'segredo posto na resolução de conflito é encontrado'
else
  fail "segredo só no merge commit passou despercebido (exit $status).
  É o modo de falha do \`git log -p\` sem \`-m\` no --log-opts. Saída:
$out"
fi

# --- Caso 3: falha de infra não é reportada como vazamento ----------------
#
# Rate limit do Docker Hub em runner anônimo cai aqui. Dizer "encontrou segredo"
# manda alguém abrir resposta a incidente por indisponibilidade de registry.
status=0
out=$(run_scan "$clean" GITLEAKS_VERSION=v0.0.0-inexistente GITLEAKS_DIGEST=) || status=$?

if [ "$status" -eq 0 ]; then
  fail "imagem inexistente deveria falhar:
$out"
elif [ "${out#*encontrou segredo}" != "$out" ]; then
  fail "falha de infra reportada como vazamento (exit $status):
$out"
elif [ "${out#*a varredura NÃO rodou}" != "$out" ]; then
  pass 'falha de infra é reportada como varredura não executada'
else
  fail "falha de infra sem diagnóstico reconhecível (exit $status):
$out"
fi

if [ "$failures" -gt 0 ]; then
  printf '\033[1;31m✗ autoteste do secret-scan: %s caso(s) com falha\033[0m\n' "$failures" >&2
  exit 1
fi

printf '\033[1;32m✓ autoteste do secret-scan: 3/3\033[0m\n'
