# Local auth setup (Logto)

Fatia uses [Logto](https://logto.io) self-hosted as the identity provider — both for the PWA and for the MCP server (see [ADR 008](ADR/008-logto-auth.md) for the rationale). To run the app locally with real users you need a local Logto instance + a handful of `.env` values.

This page walks through the one-time setup. Re-running `pnpm bootstrap` or `pnpm reset:db` does **not** reset Logto's own DB unless you also drop the volume — see [Resetting Logto](#resetting-logto) below.

> Time budget: ~10 minutes the first time. Zero on subsequent runs.

---

## Why Logto in dev?

Two options were considered for this issue:

1. **Run real Logto locally** (this guide). Pros: dev mirrors prod exactly — same JWT validation, same OAuth flows, same JWKS rotation. Cons: a couple of console clicks the first time.
2. **`DEV_AUTH=true` bypass** that accepts a hard-coded user. Pros: zero setup. Cons: a misconfigured production deploy could silently disable auth. **Not implemented in this repo** — if added later it must be gated by `NODE_ENV !== 'production'` _and_ refuse to start in containers where `NODE_ENV` is unset, and the decision should be captured in an ADR.

If you only need to exercise the database or render the PWA shell, you can also point Prisma at the local DB and skip Logto entirely. But every authenticated endpoint will 401, so the auth-required happy path needs Logto running.

---

## 1. Start Logto

Logto is already part of [`infra/docker-compose.yml`](../infra/docker-compose.yml). Bring it up alongside Postgres:

```bash
docker compose -f infra/docker-compose.yml up -d postgres logto
```

(`pnpm infra:up:full` brings up everything; if you just want Logto + DB, the command above is enough.)

On first boot Logto runs its own migrations and the Swedish seed; expect **~30 seconds** before it responds.

```bash
docker compose -f infra/docker-compose.yml logs -f logto
# wait until you see: "logto server listening on port 3001"
```

URLs once it's up:

- Public OIDC endpoint: <http://localhost:3001>
- Admin console: <http://localhost:3002>

---

## 2. Create your admin account

1. Open <http://localhost:3002>.
2. Click **Create account** on the first-run screen and pick an email + password. This is the **Logto admin** — not a user of Fatia.
3. You'll land on the Logto dashboard.

---

## 3. Create the API resource

The NestJS API validates JWTs by `aud` claim. That `aud` is the **identifier** of an API resource you register in Logto.

1. Go to **API resources → Create API resource**.
2. **Name:** `Fatia API`
3. **API identifier:** `https://api.fatia.local`
   This must match `LOGTO_AUDIENCE` in `.env`.
4. **Save.**

---

## 4. Create the PWA app (Traditional Web)

This is the OIDC client the Next.js app uses.

1. Go to **Applications → Create application → Traditional Web** → name it `Fatia Web`.
2. **Redirect URIs:** `http://localhost:3030/api/logto/callback`
3. **Post sign-out redirect URIs:** `http://localhost:3030`
4. Save.
5. From the app's **Settings** tab, copy:
   - **App ID** → `LOGTO_APP_ID` in `.env`
   - **App secret** → `LOGTO_APP_SECRET` in `.env`

---

## 5. Create the MCP app (Traditional Web)

The MCP server fronts a second OAuth app so Claude can drive it via standard OAuth 2.1 / Dynamic Client Registration.

1. Go to **Applications → Create application → Traditional Web** → name it `Fatia MCP`.
2. **Redirect URIs:** `http://localhost:3000/oauth/callback`
3. Save.
4. Copy:
   - **App ID** → `LOGTO_MCP_APP_ID`
   - **App secret** → `LOGTO_MCP_APP_SECRET`

> The MCP app exists separately from the PWA app so the two can be revoked / rotated independently and so consents are tracked per surface.

---

## 6. Create the mobile app (Native)

The React Native app (`apps/mobile`) needs its own application. It **cannot** reuse
the PWA's: a native app is a _public_ client — it ships to devices, so anything
inside it is extractable, and it has no `client_secret`. That is exactly why the
flow requires PKCE.

1. **Applications → Create application → Native** → name it `Fatia Mobile`.
2. **Redirect URIs:** `fatia://auth/callback`
3. **Post sign-out redirect URIs:** `fatia://auth/callback`
4. Save and copy the **App ID** → `EXPO_PUBLIC_LOGTO_APP_ID` in `apps/mobile/.env`.
   There is no secret to copy, and that is not an oversight.

> **Running through Expo Go?** Add a second redirect URI. Expo Go does not use
> `fatia://` — it uses an `exp://` URL with your machine's IP, which changes with
> the network. Tap **Entrar** in the app and copy the `[auth] redirect_uri: …`
> line the Metro terminal prints. A development build uses `fatia://` for real
> and needs no extra entry. Details in [`apps/mobile/README.md`](../apps/mobile/README.md).

---

## 7. There is no step to "grant" apps access to the API resource

Earlier versions of this guide told you to open the app's **API resources** tab
and assign `Fatia API`. **That tab does not exist**, and no such association
does either — verified against the admin API of the Logto this repo runs
(1.36.0): the only things you can attach to an application are M2M roles and
consent scopes.

Here is what actually puts the right `aud` in the token:

- the client sends `resource=<identifier>` in the authorization request;
- Logto mints an access token whose `aud` is that identifier;
- the API validates it against `LOGTO_AUDIENCE`.

Nothing to click. Each client already sends it:

| Client | Where                                                                                     |
| ------ | ----------------------------------------------------------------------------------------- |
| PWA    | `resources: [LOGTO_AUDIENCE]` in `apps/web/src/lib/logto.ts`                              |
| MCP    | `resolveResource()` in `apps/api/src/auth/oauth-facade.service.ts`                        |
| Mobile | `extraParams: { resource: env.logtoAudience }` in `apps/mobile/src/auth/auth-context.tsx` |

**Assignment only exists for machine-to-machine apps**, which get API permissions
through M2M roles. None of the three clients here is M2M.

If you do get `aud mismatch`, the cause is a value mismatch, not a missing
grant: `LOGTO_AUDIENCE`, the API identifier in Logto, and
`EXPO_PUBLIC_LOGTO_AUDIENCE` must be byte-identical — Logto matches exactly, and
a trailing slash is enough to break it with `invalid_target`.

---

## 8. Finish the `.env`

Open `.env` (created by `pnpm bootstrap`) and fill in:

```dotenv
LOGTO_ENDPOINT=http://localhost:3001
LOGTO_AUDIENCE=https://api.fatia.local

LOGTO_APP_ID=<from step 4>
LOGTO_APP_SECRET=<from step 4>

LOGTO_MCP_APP_ID=<from step 5>
LOGTO_MCP_APP_SECRET=<from step 5>

# 32-byte random string, used by the Next.js Logto SDK for cookie encryption.
LOGTO_COOKIE_SECRET=$(openssl rand -base64 32)
```

Restart `pnpm dev` after editing `.env`.

For the native app, `apps/mobile/.env` is separate (copy from `.env.example`).
Point it at your machine's LAN IP, not `localhost` — the phone cannot reach the
computer's loopback:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.0.10:3000
EXPO_PUBLIC_LOGTO_ENDPOINT=http://192.168.0.10:3001
EXPO_PUBLIC_LOGTO_AUDIENCE=https://api.fatia.local
EXPO_PUBLIC_LOGTO_APP_ID=<from step 6>
```

`EXPO_PUBLIC_LOGTO_AUDIENCE` keeps the **identifier**, not a reachable URL — it
is the same string as `LOGTO_AUDIENCE`, and swapping it for the IP makes Logto
reject the request with `invalid_target`.

---

## 9. Create a user

You also need a **user** (the human who'll log in), separate from the admin from step 2:

1. In the Logto admin console, **User management → Add user**.
2. Set a username + password.
3. Sign into <http://localhost:3030> with that user — the API will lazily provision a matching row in the `User` table (see `UserProvisioningService`).

You're done. Authenticated endpoints should now return data instead of 401.

---

## Minting an access token by hand

For scripts and curl you need a token without going through the PWA.

**The password grant does not work here.** An earlier version of this guide
suggested it; ask this Logto what it supports and the list comes back without
it:

```bash
curl -s http://localhost:3001/oidc/.well-known/openid-configuration \
  | jq -r '.grant_types_supported[]'
# implicit
# authorization_code
# refresh_token
# client_credentials
# urn:ietf:params:oauth:grant-type:token-exchange
```

Two paths that do work:

**1. Log into the PWA and take the token from the proxy.** The browser never
sees the access token — it lives in the server-side session — so reading a
cookie will not give it to you. Log in at <http://localhost:3030>, then ask the
API for something through the proxy and read the `Authorization` header from
the API log; or add a temporary route that returns `getApiAccessToken()`.

**2. Client credentials, with a machine-to-machine app.** This is the honest way
for a script, and the _only_ place where "assign the API resource" is a real
step:

1. **Applications → Create application → Machine-to-machine** → `Fatia Scripts`.
2. **Roles →** create a role with the permissions of `Fatia API` and assign it
   to the app. Without a role the token comes back without the scopes.
3. Then:

```bash
TOKEN=$(curl -sS -X POST http://localhost:3001/oidc/token \
  -u "$M2M_APP_ID:$M2M_APP_SECRET" \
  -d 'grant_type=client_credentials' \
  -d 'resource=https://api.fatia.local' \
  | jq -r '.access_token')

TOKEN="$TOKEN" pnpm mcp:smoke
```

Note what this token is **not**: it has no `sub` of a human, so anything scoped
by user returns empty. It is useful to prove the API accepts the token, not to
exercise a user's data.

---

## Resetting Logto

`pnpm reset:db` drops the Postgres volume, which also wipes Logto's database (it lives in the same Postgres). After a reset you have to re-do steps 2–9.

If you want to keep Logto state but reset Fatia data, run the SQL by hand inside the container:

```bash
docker exec -it fatia-postgres psql -U fatia -d fatia \
  -c 'TRUNCATE "User", "Meal", "WorkoutSession" RESTART IDENTITY CASCADE;'
```

---

## Common errors

| Symptom                                                   | Likely cause                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `WWW-Authenticate: Bearer ... error="invalid_token"`      | Token is expired, wrong audience, or wrong issuer. Mint a fresh one (step "Minting" above) and check `LOGTO_AUDIENCE`. |
| `400 invalid_grant: expired code`                         | OAuth code was reused. Just retry the login.                                                                           |
| Logto admin console loads but the OIDC endpoint times out | Logto is still running its first-boot migration. Watch the logs for 30–60s.                                            |
| `Failed to fetch JWKS`                                    | API can't reach Logto. Verify `LOGTO_ENDPOINT` matches the container's exposed port.                                   |
| Login loop on the PWA                                     | `LOGTO_APP_ID` / `LOGTO_APP_SECRET` are still placeholders.                                                            |
| `invalid_target` when requesting a token                  | The `resource` sent does not match the API identifier byte for byte. A trailing slash is enough.                       |
| `invalid_redirect_uri` from the mobile app                | Through Expo Go the redirect is an `exp://` with your IP, not `fatia://`. Register the URI the Metro terminal prints.  |
| Mobile app cannot reach the API, PWA can                  | `apps/mobile/.env` points at `localhost`. The phone needs your machine's LAN IP.                                       |
