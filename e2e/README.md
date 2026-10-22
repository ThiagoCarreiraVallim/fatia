# e2e — Playwright (ADR 029)

Dois usos:

- **`pnpm ui:snap <etapa>`** — fotografa todas as telas do PWA em celular (Pixel 7) e desktop
  (1440×900) e salva em `e2e/screenshots/<etapa>/{mobile,desktop}/`. Rode **antes** de mexer em
  UI (`00-baseline`) e **depois de cada etapa** (`01-…`, `02-…`).
- **`pnpm ui:compare <etapa-a> <etapa-b>`** — gera `e2e/screenshots/compare-<a>-vs-<b>.html`, lado
  a lado, para anexar à revisão.

Os screenshots ficam fora do git.

## Pré-requisitos

```bash
pnpm infra:up                     # Postgres + Logto
pnpm db:migrate:deploy && pnpm db:seed
pnpm logto:seed-m2m && pnpm logto:bootstrap
pnpm dev:apps                     # API :3000 + web :3030
```

O `auth.setup.ts` faz login **real** no Logto com o usuário demo (sem bypass), e em seguida roda
`pnpm db:seed:demo`, que recria 30 dias de refeições, treinos, água, passos, peso e metas
(determinístico, para os screenshots serem comparáveis). `E2E_SKIP_SEED=1` pula o seed.

Fluxos: `tests/reset-password.spec.ts` faz o "esqueci minha senha" inteiro — pede o código, lê o
e-mail no Mailpit (`MAILPIT_URL`, padrão `http://localhost:8025`), define uma senha nova, entra
com ela e devolve a senha do demo.

Variáveis úteis: `E2E_BASE_URL` (padrão `http://localhost:3030`), `PW_CHROMIUM_PATH` (Chromium
já instalado), `DEMO_EMAIL`/`DEMO_PASSWORD`.
