# Contributing to Fatia

Thanks for your interest in contributing! This document explains how to get the project running locally, the conventions we follow, and how to submit a contribution.

By participating in this project you agree to abide by our [Code of Conduct](.github/CODE_OF_CONDUCT.md).

---

## Table of contents

- [Ways to contribute](#ways-to-contribute)
- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Branching model](#branching-model)
- [Commit message convention](#commit-message-convention)
- [Running tests, lint and typecheck](#running-tests-lint-and-typecheck)
- [Opening a Pull Request](#opening-a-pull-request)
- [Reporting bugs / requesting features](#reporting-bugs--requesting-features)
- [Labels](#labels)
- [Project structure](#project-structure)

---

## Ways to contribute

- Report bugs and request features via [issues](../../issues/new/choose).
- Improve documentation (`README`, `docs/`).
- Pick up a [`good first issue`](../../labels/good%20first%20issue) or [`help wanted`](../../labels/help%20wanted).
- Add or improve MCP tools, API endpoints, or PWA screens.
- Add tests for existing functionality.

If you're planning a larger change, please open an issue first to discuss it — this avoids duplicated work.

---

## Getting started

### Prerequisites

- **Node.js** `>= 20` (we ship a `.nvmrc` — run `nvm use`).
- **pnpm** `9` (enable via `corepack enable` — the version is pinned by `packageManager` in `package.json`).
- **Docker** + **Docker Compose** (for Postgres).
- A POSIX shell. Windows users: use WSL2.

### First-time setup

```bash
# 1. Fork the repo on GitHub and clone your fork
git clone https://github.com/<your-username>/fatia.git
cd fatia

# 2. Add the upstream remote
git remote add upstream https://github.com/ThiagoCarreiraVallim/fatia.git

# 3. Install dependencies
pnpm install

# 4. Copy the env file and fill in any required values
cp .env.example .env

# 5. Start Postgres
pnpm infra:up

# 6. Run migrations + seeds (TACO foods + exercises)
pnpm db:migrate
pnpm db:seed

# 7. Run API + Web in parallel
pnpm dev
```

The API runs on `http://localhost:3000`, the Web app on `http://localhost:3001`, and the MCP server on `http://localhost:3000/mcp`.

---

## Development workflow

1. Sync your fork: `git fetch upstream && git checkout main && git merge --ff-only upstream/main`.
2. Create a topic branch from `main` (see [Branching model](#branching-model)): `git checkout -b feat/<short-description>`.
3. Make your changes, keeping commits small and focused.
4. Run `pnpm lint && pnpm typecheck && pnpm test` before pushing.
5. Push to your fork and open a Pull Request against `main`.

---

## Branching model

We follow [**GitHub Flow**](https://docs.github.com/en/get-started/using-github/github-flow): a single long-lived branch (`main`) with short-lived topic branches merged via Pull Request.

- `main` — protected, always deployable. **All PRs target `main`.**
- Feature branches: `feat/<short-description>` (e.g. `feat/log-meal-tool`).
- Bug fix branches: `fix/<short-description>` (e.g. `fix/macro-calculation`).
- Docs / chore / refactor: `docs/<...>`, `chore/<...>`, `refactor/<...>`.

Keep branches short-lived and focused. Rebase on top of `main` instead of merging it back in when possible. Releases are marked with Git tags (`v0.1.0`, `v0.2.0`, …) — there is no separate release branch.

---

## Commit message convention

We use [**Conventional Commits**](https://www.conventionalcommits.org/). The format is:

```
<type>(<optional scope>): <subject>

<optional body>

<optional footer>
```

**Allowed types:**

| Type       | When to use                                              |
| ---------- | -------------------------------------------------------- |
| `feat`     | A new user-facing feature.                               |
| `fix`      | A bug fix.                                               |
| `docs`     | Documentation only changes.                              |
| `refactor` | Code change that neither fixes a bug nor adds a feature. |
| `perf`     | Performance improvement.                                 |
| `test`     | Adding or updating tests.                                |
| `chore`    | Build process, tooling, dependencies, configs.           |
| `ci`       | CI configuration changes.                                |
| `style`    | Formatting, missing semicolons, etc. (no code change).   |
| `revert`   | Reverts a previous commit.                               |

**Scopes** are optional but encouraged. Common ones: `api`, `web`, `db`, `mcp`, `auth`, `workout`, `nutrition`, `infra`.

**Examples:**

```
feat(workout): add reorder_plan_exercises MCP tool
fix(nutrition): correct macro calc when serving size is zero
docs: explain MCP server setup in README
chore(deps): bump prisma to 5.20
```

Breaking changes: append `!` after the type/scope and add a `BREAKING CHANGE:` footer.

```
feat(api)!: drop legacy /meals endpoint

BREAKING CHANGE: clients must migrate to /nutrition/meals.
```

---

## Running tests, lint and typecheck

From the repo root (uses Turborepo, so commands run across all packages):

```bash
pnpm lint        # ESLint across the monorepo
pnpm typecheck   # tsc --noEmit across the monorepo
pnpm test        # runs tests in each package that defines them
pnpm format      # Prettier write
```

A pre-commit hook (Husky + lint-staged) runs `eslint --fix` and `prettier --write` on staged files. Don't bypass it with `--no-verify` unless you have a good reason and explain it in the PR.

### Database changes

If your change touches the Prisma schema:

1. Edit `packages/db/prisma/schema.prisma`.
2. Run `pnpm db:migrate` and give the migration a descriptive name.
3. Commit both the schema and the generated migration files.
4. Call this out in the PR description so reviewers run the migration locally.

---

## Opening a Pull Request

1. Make sure CI passes locally (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`).
2. Push to your fork and open a PR against `main`.
3. Fill in the [PR template](.github/pull_request_template.md) — especially the **Changes** section, which feeds into release notes.
4. Link the related issue with `Closes #123`.
5. Mark as **Draft** if you're still iterating; mark **Ready for review** when CI is green.
6. Be responsive to review comments. Push fixups as new commits — we squash on merge.

PRs should be **small and focused**. If you're touching more than one concern, split into multiple PRs.

---

## Reporting bugs / requesting features

- **Bugs:** use the [bug report template](../../issues/new?template=bug_report.md). Include repro steps and environment info.
- **Features:** use the [feature request template](../../issues/new?template=feature_request.md). Explain the problem first, then the proposed solution.
- **Security issues:** **do not open a public issue.** See [SECURITY.md](SECURITY.md).
- **Questions / ideas:** use [GitHub Discussions](../../discussions).

---

## Labels

All GitHub labels are managed declaratively in [`.github/labels.yml`](.github/labels.yml). A workflow ([`.github/workflows/labels.yml`](.github/workflows/labels.yml)) syncs them automatically on every push to `main` that changes the YAML file — **do not edit labels directly in the GitHub UI**, the next sync will overwrite manual changes.

To propose a new label, open a PR editing `.github/labels.yml`.

### Label groups

Labels are namespaced by purpose. Most PRs and issues get at least one **type** + one **area** label. Maintainers add the rest.

| Group       | Purpose                                                  | Examples                                                                                                |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `type:`     | What kind of change.                                     | `type: bug`, `type: feature`, `type: docs`, `type: security`                                            |
| `area:`     | Which part of the codebase.                              | `area: api`, `area: web`, `area: mcp`, `area: db`, `area: infra`                                        |
| `status:`   | Where it sits in the workflow.                           | `status: needs triage`, `status: in progress`, `status: blocked`                                        |
| `priority:` | How urgent.                                              | `priority: critical`, `priority: high`, `priority: medium`, `priority: low`                             |
| `release:`  | Drives semver bump and changelog. Applied to merged PRs. | `release: major`, `release: minor`, `release: patch`, `release: skip`                                   |
| `deploy:`   | Controls what the deploy pipeline does for the PR.       | `deploy: staging`, `deploy: production`, `deploy: hotfix`, `deploy: skip-ci`, `deploy: needs-migration` |
| Community   | Newcomer-friendly and contribution signals.              | `good first issue`, `help wanted`, `question`, `duplicate`, `wontfix`                                   |

### How `release:` labels work

When a PR is merged into `main`, the `release:` label tells release tooling (`release-please` / `semantic-release` — to be wired up) how to bump the version and whether to include the PR in the changelog:

- `release: major` — breaking change, bumps `X.0.0`.
- `release: minor` — new backwards-compatible feature, bumps `0.X.0`.
- `release: patch` — backwards-compatible fix, bumps `0.0.X`.
- `release: skip` — internal change that should not appear in release notes (e.g. CI tweaks).

If no `release:` label is set, the type label drives the default (`type: feature` → minor, `type: bug`/`type: perf` → patch, `type: docs`/`type: chore`/`type: refactor`/`type: test` → skip).

### How `deploy:` labels work

The deploy pipeline (to be wired up) reads `deploy:` labels on merged PRs:

- `deploy: staging` — deploy to the staging environment on merge to `main`.
- `deploy: production` — promote to production after successful staging deploy.
- `deploy: hotfix` — urgent fix for production. Fast-tracked: smaller test matrix, deploys straight to prod after CI passes. Use sparingly.
- `deploy: needs-migration` — runs `pnpm db:migrate:deploy` as part of the deploy. **Required** whenever the PR touches `packages/db/prisma/`.
- `deploy: skip-ci` — skip the deploy pipeline entirely (docs-only or trivial changes).

### Triage flow

1. New issue → maintainer applies `type:`, `area:`, `priority:` and removes `status: needs triage`.
2. PR opened → contributor or maintainer applies `type:` and `area:`. CI runs on every PR regardless of labels.
3. Before merge → maintainer ensures `release:` is set (or relies on the default mapping above). If the PR touches the schema, applies `deploy: needs-migration`.
4. On merge → deploy pipeline reads `deploy:` labels and acts accordingly.

## Project structure

```
fatia/
├── apps/
│   ├── api/           # NestJS (REST + MCP server)
│   └── web/           # Next.js 15 PWA
├── packages/
│   └── db/            # Prisma schema + shared client
├── infra/             # docker-compose, infra scripts
├── docs/              # PRD, ARCHITECTURE, MCP spec, ADRs
└── .github/           # Issue / PR templates, workflows
```

For deeper context, read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/MCP.md`](docs/MCP.md), and the ADRs in [`docs/ADR/`](docs/ADR/).

---

Thanks again for contributing! ❤️
