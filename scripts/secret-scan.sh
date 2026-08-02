#!/usr/bin/env bash
# Varredura de segredo com gitleaks sobre o histórico COMPLETO do repositório.
#
# Mesmo comando no CI (.github/workflows/secret-scan.yml) e na máquina do
# contribuidor (`pnpm secrets:scan`) — vermelho do CI se reproduz local.
#
# Uso:
#   pnpm secrets:scan
#   GITLEAKS_VERSION=v8.29.0 GITLEAKS_DIGEST= pnpm secrets:scan

set -euo pipefail

GITLEAKS_VERSION="${GITLEAKS_VERSION:-v8.28.0}"

# Pinado por digest, não só pela tag: tag é ponteiro mutável e quem tem push no
# namespace pode reapontar `v8.28.0` para outra imagem — a mesma superfície que
# levou a preferir a imagem à action de terceiro. A tag continua na string por
# legibilidade; o digest é o que o docker resolve. Para trocar de versão, passe
# o digest novo (ou `GITLEAKS_DIGEST=` vazio para voltar a resolver pela tag).
GITLEAKS_DIGEST="${GITLEAKS_DIGEST-sha256:cdbb7c955abce02001a9f6c9f602fb195b7fadc1e812065883f695d1eeaba854}"
GITLEAKS_IMAGE="zricethezav/gitleaks:${GITLEAKS_VERSION}${GITLEAKS_DIGEST:+@${GITLEAKS_DIGEST}}"
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
#
# `-m` no --log-opts porque por baixo o gitleaks roda `git log -p`, e `git log -p`
# NÃO emite diff de merge commit. Sem ele, segredo que entra na resolução de um
# conflito nunca é lido — e a guarda de "0 commits" abaixo não acusa, porque os
# outros commits mantêm a contagem > 0. Aqui são 60 merges em 283 commits: 21%
# do histórico que o job dizia ter olhado. Com `-m` o diff sai contra cada pai.
output=$(docker run "${docker_args[@]}" "$GITLEAKS_IMAGE" \
  git /repo --log-opts="--all -m" --redact --no-color --no-banner 2>&1) && status=0 || status=$?

printf '%s\n' "$output"

# Só exit 1 é achado — é o código que o gitleaks reserva para "leaks found".
# Qualquer outro (125 do docker, 128 do git, 137 de OOM) é varredura que não
# rodou: rate limit do Docker Hub em runner anônimo cai aqui, e anunciar isso
# como vazamento manda alguém abrir resposta a incidente por indisponibilidade
# de registry. Falha nos dois casos, com o diagnóstico certo em cada um.
[ "$status" -ne 1 ] || die "gitleaks encontrou segredo no histórico"
[ "$status" -eq 0 ] || die "a varredura NÃO rodou (exit $status) — não é achado de segredo.
  Causas comuns: imagem indisponível ou rate limit do registry, docker sem
  permissão, timeout. Corrija e rode de novo; o histórico segue não varrido."

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
