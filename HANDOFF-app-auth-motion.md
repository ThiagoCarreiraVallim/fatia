# HANDOFF — app-auth-motion

Pacote de melhorias do app (itens 1 a 8 do pedido). Um PR só, branch `feat/app-auth-motion`.

## Estado

- Spike da Experience API do Logto (1.36 local): **funciona** sem navegador.
  - `GET /oidc/auth?...&response_mode=form_post` (guarda o cookie `_interaction`).
  - `PUT /api/experience {interactionEvent}` → verificação (`/verification/password` ou
    `/verification/verification-code` + `/verify`) → `/identification` → `/profile` (senha,
    `extraProfile {name}`) → `/submit` → `redirectTo`.
  - Seguir `redirectTo`; se cair em `/consent`, `POST /api/interaction/consent` e seguir o novo
    `redirectTo`. Com `form_post`, o último passo é 200 com HTML contendo `code` e `state` em
    `<input hidden>` — sem redirect para `fatia://`/`exp://` (o fetch do RN não segue esquema
    próprio de forma confiável no iOS).
  - Reset: `ForgotPassword` → código → `/identification` → `PUT /profile/password` → `submit` (204).
  - Erros: `session.invalid_credentials` (422), `verification_code.code_mismatch` (400),
    `user.missing_profile` (422, `data.missingProfile`).
  - Público: `GET /api/.well-known/sign-in-exp` (conectores sociais, política de senha, signUp).
- Logto 1.30 (imagem `svhd/logto:1.30.0`) tem as rotas `/api/experience`, `extraProfile` e
  `/api/interaction/consent` (conferido no build).
- RN: Android guarda cookie sempre; iOS só com `credentials: 'include'`.
- Banco de teste `fatia_tauth` criado, migrado e com seeds.

## Divisão

- Eu (principal): itens 1 e 2 (auth).
- Sub-worktrees (forks), mergeadas depois nesta branch:
  - `app-auth-motion-nav`: itens 4, 5 e 6.
  - `app-auth-motion-video`: item 8.
  - `app-auth-motion-misc`: itens 3 e 7.

## Feito (itens 1 e 2)

- api-client `auth-experience.ts` (+testes), live contra Logto 1.36 e 1.30 (container
  `fatia-logto130-spike` na 3101, database `logto130` — apagar no fim).
- API: `POST /users/me/identity`, troca de e-mail (M2M), nome ao Logto (M2M), `LOGTO_MOBILE_APP_ID`.
  Provado com API do worktree na 3010 (`scratchpad/run-api.sh`), sem M2M.
- Mobile: telas de conta, código, esqueci a senha, trocar e-mail; IdentitySync.
- Web: botões sociais só com conector.
- Docs: ADR 050, OPERATIONS, LOCAL_AUTH, TESTAR_O_APP.

## Próximo passo

Validar no emulador (Metro 8082, API 3010); depois mergear os forks nav/video/misc.
