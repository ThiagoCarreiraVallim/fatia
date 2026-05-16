# Security Policy

We take the security of Fatia seriously. This document explains which versions are supported, how to report a vulnerability, and what to expect from us.

## Supported versions

Fatia is in early development and does not yet ship tagged releases. Security fixes are applied to the `main` branch. Once we begin tagging releases, this section will list the supported versions.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |

## Reporting a vulnerability

**Please do not open a public GitHub issue, pull request, or Discussion to report a security vulnerability.** Public disclosure before a fix is available puts users at risk.

Instead, use one of the following private channels:

1. **GitHub Security Advisories (preferred):** open a private advisory at
   <https://github.com/ThiagoCarreiraVallim/fatia/security/advisories/new>.
   This keeps the entire discussion private until a fix is published.
2. **Email:** if you cannot use GitHub Advisories, contact the maintainer at
   **thiagocvallim@gmail.com** with the subject `[SECURITY] Fatia: <short summary>`.
   If you would like to encrypt the report, request a PGP key in the first message.

When reporting, please include as much of the following as you can:

- A clear description of the vulnerability and its impact.
- Steps to reproduce, ideally with a minimal proof of concept.
- The affected component (API, Web, MCP server, Prisma layer, infra, …).
- The affected commit / branch and your environment (Node version, OS).
- Any suggested mitigation or patch, if you have one.

## What to expect

- **Acknowledgement:** we aim to acknowledge new reports within **3 business days**.
- **Triage:** we will confirm the issue, assess severity (CVSS where applicable), and let you know our plan within **7 business days**.
- **Fix and disclosure:** we coordinate a fix and a disclosure timeline with you. Default target is **90 days** from report to public disclosure, sooner for critical issues.
- **Credit:** with your permission, we credit you in the advisory and release notes. Anonymous reports are welcome too.

## Scope

In scope:

- The Fatia API (`apps/api`), including the MCP server endpoints.
- The Fatia Web PWA (`apps/web`).
- The shared database layer (`packages/db`) and migrations.
- Build and release infrastructure shipped in this repository (`infra/`, GitHub workflows).

Out of scope:

- Third-party services that Fatia integrates with (Claude, Logto, hosting providers). Report those directly to the respective vendor.
- Vulnerabilities that require physical access to a user's device or already-compromised credentials.
- Issues in dependencies that have no exploitable impact on Fatia — report those upstream.
- Self-hosted deployments running modified code.

## Areas of particular concern

If you are looking for things to audit, these areas are sensitive:

- **Authentication and session handling** — JWT issuance/validation, Logto integration.
- **MCP server** (`apps/api/src/**/mcp`) — tools execute privileged actions on behalf of the authenticated user; authorization checks must be enforced per tool.
- **Multi-tenant isolation** — every query must scope by the authenticated user; cross-user data leaks are critical.
- **Input validation** — DTOs, MCP tool schemas, file/image handling.
- **Secrets handling** — anything reading from `.env` or logging request bodies.

## Safe harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to follow this policy.
- Avoid privacy violations, destruction of data, and interruption or degradation of our services.
- Do not exploit the vulnerability beyond what is necessary to demonstrate it.
- Give us a reasonable time to remediate before any public disclosure.

Thank you for helping keep Fatia and its users safe.
