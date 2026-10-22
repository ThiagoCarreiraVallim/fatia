#!/usr/bin/env bash
# pnpm ui:snap <etapa> — fotografa todas as telas em celular e desktop (ADR 029).
#
#   pnpm ui:snap 00-baseline
#   pnpm ui:snap 01-bugs-nutricao
#   pnpm ui:compare 00-baseline 01-bugs-nutricao
#
# Pressupõe API + web + Logto de pé e `pnpm logto:bootstrap` já rodado.
set -euo pipefail
STAGE="${1:-adhoc}"
cd "$(dirname "$0")/.."
UI_STAGE="$STAGE" npx playwright test "${@:2}"
echo "Screenshots em e2e/screenshots/$STAGE/{mobile,desktop}"
