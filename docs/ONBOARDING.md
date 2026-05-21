# Onboarding

Get from `git clone` to a running API + Web + MCP stack in one command, and learn how to drive the MCP server with Claude (or any MCP-capable client) locally.

> If you only want to run the app, follow the **Quick start** below. If you're contributing code, also read [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the workflow, commit conventions, and PR expectations.

---

## Prerequisites

| Tool                        | Version | How to install                                                                                                                         |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js**                 | `>= 20` | We ship `.nvmrc` — run `nvm use` (or install Node 20+ any other way you like).                                                         |
| **pnpm**                    | `9`     | `corepack enable` — version is pinned by `packageManager` in `package.json`. Do not install pnpm globally with `npm i -g pnpm`.        |
| **Docker** + Docker Compose | latest  | Docker Desktop on macOS / Windows, or the Docker engine + compose plugin on Linux. Used for Postgres (and optionally Logto, API, Web). |
| **A POSIX shell**           | —       | macOS / Linux work out of the box. **Windows: use WSL2.**                                                                              |

Verify:

```bash
node -v          # v20.x
corepack -v      # any version, just present
docker --version
docker compose version
```

---

## Quick start

```bash
git clone https://github.com/ThiagoCarreiraVallim/fatia.git
cd fatia
pnpm bootstrap
```

`pnpm bootstrap` runs `scripts/setup.sh`, which:

1. enables Corepack (so the pinned pnpm version is used);
2. installs workspace dependencies;
3. copies `.env.example` → `.env` if it doesn't exist;
4. starts the Postgres **and Logto** containers (`infra/docker-compose.yml`);
5. waits for Postgres to be healthy;
6. generates the Prisma client;
7. runs `prisma migrate dev`;
8. seeds the database with TACO foods and the exercise catalog;
9. waits for Logto's admin console to respond (first boot is ~30s — Logto runs its own migrations + seed).

After it finishes, start the app:

```bash
pnpm dev
```

- API: <http://localhost:3000>
- Web: <http://localhost:3030>
- MCP: <http://localhost:3000/mcp>
- Logto: <http://localhost:3001>
- Logto admin: <http://localhost:3002>

> Auth (Logto) is required for any non-public endpoint to respond. See [`LOCAL_AUTH.md`](LOCAL_AUTH.md).

---

## Development modes

There are two ways to run the stack locally — pick whichever fits the task.

### Mode A — host `pnpm dev` + dockerized DB (default, fastest feedback)

Postgres + Logto run in Docker; API and Web run on the host with Turbo + hot reload. `pnpm dev` handles all of this in one command — it brings up the Docker services (idempotent — no-op if already running), waits for them, and then runs `turbo run dev` in the foreground.

```bash
pnpm dev   # postgres + logto + api + web — one command, hot reload
```

If you want the pieces separately:

```bash
pnpm infra:up      # postgres + logto only
pnpm infra:up:db   # postgres only (skip Logto)
pnpm dev:apps      # turbo run dev only (api + web, assumes infra is up)
```

Best for day-to-day backend or frontend work — the Node processes restart in milliseconds.

### Mode B — full stack in Docker

The whole stack runs in containers (closer to production).

```bash
pnpm infra:up:full   # postgres + logto + api + web
```

Best when reproducing a production-only bug, or when validating Dockerfile changes. Builds are slower — no hot reload.

Tear everything down with `pnpm infra:down`.

---

## Useful scripts

| Command              | What it does                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm bootstrap`     | Run the full bootstrap (idempotent — safe to re-run). Named `bootstrap` (not `setup`) to avoid pnpm's built-in `setup` command. |
| `pnpm reset:db`      | **Destructive.** Drop the Postgres volume and re-seed from scratch.                                                             |
| `pnpm mcp:smoke`     | Curl the MCP discovery endpoint and (with a `TOKEN`) hit `tools/list` / `get_me`. See [`MCP_LOCAL.md`](MCP_LOCAL.md).           |
| `pnpm dev`           | One-command dev: ensures Postgres + Logto are up, then runs API + Web with hot reload.                                          |
| `pnpm dev:apps`      | Just `turbo run dev` (skip the infra check) — use when infra is already up.                                                     |
| `pnpm infra:up`      | Start Postgres + Logto (the dependencies `pnpm dev` needs).                                                                     |
| `pnpm infra:up:db`   | Start Postgres only (skip Logto — useful if you don't need auth).                                                               |
| `pnpm infra:up:full` | Start the full stack in Docker (postgres + logto + api + web).                                                                  |
| `pnpm infra:down`    | Stop all containers.                                                                                                            |
| `pnpm infra:logs`    | Tail logs from the running containers.                                                                                          |
| `pnpm db:migrate`    | Apply Prisma migrations in dev (`prisma migrate dev`).                                                                          |
| `pnpm db:seed`       | Re-run the seeds (TACO foods + exercises).                                                                                      |
| `pnpm db:studio`     | Open Prisma Studio.                                                                                                             |
| `pnpm lint`          | ESLint across the monorepo.                                                                                                     |
| `pnpm typecheck`     | `tsc --noEmit` across the monorepo.                                                                                             |
| `pnpm test`          | Run tests in every package that defines them.                                                                                   |

---

## Editor setup (VS Code)

When you open the repo, VS Code prompts you to install the workspace-recommended extensions defined in [`.vscode/extensions.json`](../.vscode/extensions.json):

- ESLint, Prettier, Prisma, Tailwind CSS IntelliSense, Docker, EditorConfig.

Format-on-save and `source.fixAll.eslint` are pre-configured in [`.vscode/settings.json`](../.vscode/settings.json) so the pre-commit hook never has anything to do.

Other editors are fine — the lint-staged Husky hook will format on commit either way.

---

## Auth & MCP

These two paths are documented separately because each is a small project of its own:

- [`LOCAL_AUTH.md`](LOCAL_AUTH.md) — Logto local setup: create the dev tenant, the PWA app, the MCP app, and the API resource; copy credentials into `.env`. (We deliberately did **not** add a `DEV_AUTH` bypass — it's tracked as future work; running real Logto locally keeps dev close to prod.)
- [`MCP_LOCAL.md`](MCP_LOCAL.md) — point Claude Desktop, Claude Code, or any MCP-capable open client at `http://localhost:3000/mcp`, plus a `curl`-only smoke test you can run without any LLM.

---

## Troubleshooting

**"`pnpm` command not found"**
Corepack isn't enabled. Run `corepack enable`. If you previously installed pnpm globally, uninstall it (`npm rm -g pnpm`) so corepack's pinned version takes over.

**"`docker exec fatia-postgres ...` fails"**
The container isn't running yet. Run `pnpm infra:up` and wait for the healthcheck (`docker ps` should show `(healthy)`). `setup.sh` does this for you with a 30-second timeout.

**"`P1001: Can't reach database server at localhost:5432`"**
Either Postgres isn't up or another process is using port 5432. Check `docker ps`; override with `POSTGRES_PORT=5433 pnpm infra:up` if needed and update `DATABASE_URL` accordingly.

**"`Migration … failed to apply cleanly`"**
For dev only: `pnpm reset:db`. In production, write a follow-up migration instead.

**"401 Unauthorized on every API call"**
You're hitting an authenticated endpoint without a token. See [`LOCAL_AUTH.md`](LOCAL_AUTH.md) for how to mint a Logto access token in dev.

**"Web app shows a Logto login loop"**
`LOGTO_APP_ID` / `LOGTO_APP_SECRET` are still the placeholder values from `.env.example`. Create the PWA app in the Logto console and copy them in (see [`LOCAL_AUTH.md`](LOCAL_AUTH.md)).

**Port collisions (3000 / 3001 / 3002 / 3030 / 5432)**
Override via env: `API_PORT`, `WEB_PORT`, `LOGTO_PORT`, `LOGTO_ADMIN_PORT`, `POSTGRES_PORT`. All have sensible defaults in `.env.example`.

---

## What's next

- New here? Pick up a [`good first issue`](https://github.com/ThiagoCarreiraVallim/fatia/labels/good%20first%20issue).
- Want to add an MCP tool? Read [`docs/MCP.md`](MCP.md) for the spec and [`docs/CLAUDE.md`](CLAUDE.md) for the coding conventions.
- Want to ship a UI feature? Start at [`docs/DESIGN.md`](DESIGN.md).
