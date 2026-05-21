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

## 6. Grant the apps access to the API resource

By default a Logto app cannot mint tokens for any API resource — you have to attach them.

For **both** apps (`Fatia Web` and `Fatia MCP`):

1. Open the app's settings → **API resources** tab.
2. Click **Assign API resources** → pick `Fatia API`.

If you skip this step the API will reject every token with `aud mismatch`.

---

## 7. Finish the `.env`

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

---

## 8. Create a user

You also need a **user** (the human who'll log in), separate from the admin from step 2:

1. In the Logto admin console, **User management → Add user**.
2. Set a username + password.
3. Sign into <http://localhost:3030> with that user — the API will lazily provision a matching row in the `User` table (see `UserProvisioningService`).

You're done. Authenticated endpoints should now return data instead of 401.

---

## Minting an access token by hand

For scripts and curl, you can grab a Logto access token without going through the PWA. The simplest path is the **password grant**, which Logto exposes for first-party apps:

```bash
TOKEN=$(curl -sS -X POST http://localhost:3001/oidc/token \
  -u "$LOGTO_APP_ID:$LOGTO_APP_SECRET" \
  -d 'grant_type=password' \
  -d "username=$USERNAME" \
  -d "password=$PASSWORD" \
  -d 'resource=https://api.fatia.local' \
  -d 'scope=openid profile' \
  | jq -r '.access_token')

# Smoke-test the MCP server
TOKEN="$TOKEN" pnpm mcp:smoke
```

If your tenant doesn't have password grant enabled, paste the access token Chrome stores after a normal login: open DevTools → Application → Cookies → `logtoAccessToken`.

---

## Resetting Logto

`pnpm reset:db` drops the Postgres volume, which also wipes Logto's database (it lives in the same Postgres). After a reset you have to re-do steps 2–6.

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
