# Testing MCP tools locally

The whole point of MCP-first is letting an AI agent drive the API. This page shows how to register the local MCP server (`http://localhost:3000/mcp`) with several clients, plus a `curl`-only smoke test that doesn't need an LLM at all.

> Before you start, the MCP server must be running. `pnpm dev` does that.
> Auth must be configured — see [`LOCAL_AUTH.md`](LOCAL_AUTH.md). The MCP server validates Logto JWTs on every request.

---

## TL;DR

| Client                             | How to point it at `localhost:3000/mcp`                                                                                                                                                         | Notes                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Claude Desktop**                 | Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%/Claude/claude_desktop_config.json` (Windows), `~/.config/Claude/claude_desktop_config.json` (Linux). | Uses an OAuth flow.                     |
| **Claude Code** (CLI)              | `claude mcp add` or a project-local `.mcp.json`.                                                                                                                                                | Most ergonomic option for contributors. |
| **Cline / Continue.dev** (VS Code) | Add an MCP server entry in the extension's settings, transport `http`.                                                                                                                          | Open-source, works with local LLMs.     |
| **`curl`**                         | `pnpm mcp:smoke` (or run `scripts/mcp-smoke.sh` directly).                                                                                                                                      | No LLM — validates the server itself.   |

---

## Smoke test (`curl`)

Fastest way to confirm the server is up and the auth pipeline accepts your token:

```bash
# Discovery only — no token needed
pnpm mcp:smoke

# With a token — also calls tools/list and get_me
TOKEN="<paste a Logto access token>" pnpm mcp:smoke
```

[`scripts/mcp-smoke.sh`](../scripts/mcp-smoke.sh) is short — read it; it's three `curl` calls.

If you want to invoke it by hand:

```bash
curl -fsS http://localhost:3000/.well-known/oauth-protected-resource

curl -fsS -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

curl -fsS -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_me","arguments":{}}}'
```

See [`LOCAL_AUTH.md`](LOCAL_AUTH.md#minting-an-access-token-by-hand) for how to mint a token.

---

## Claude Code (this CLI)

If you have the Claude Code CLI installed, point it at the local server:

```bash
# inside the repo root
claude mcp add fatia-local --transport http http://localhost:3000/mcp
```

Or commit a project-local `.mcp.json` (not committed in this repo — add to your fork or to a local profile):

```json
{
  "mcpServers": {
    "fatia-local": {
      "transport": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

On first use Claude Code opens the Logto consent screen in your browser, you sign in, and it stores the token. From then on you can ask the model things like "summarize my last week of training" and it'll call MCP tools.

---

## Claude Desktop

Open the config file for your OS and add the `fatia-local` server. **The path varies:**

| OS      | Path                                                              |
| ------- | ----------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json`                     |
| Linux   | `~/.config/Claude/claude_desktop_config.json`                     |

```json
{
  "mcpServers": {
    "fatia-local": {
      "transport": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Restart Claude Desktop. The first message that triggers a Fatia tool kicks off an OAuth flow (same Logto credentials as the PWA).

> Some older Claude Desktop builds only support stdio MCP servers. If you can't pick "http" in the UI, upgrade Claude Desktop or use Claude Code / Cline instead.

---

## Local / open-source clients

You don't need a Claude subscription to exercise the server. Anything that speaks the **Streamable HTTP** MCP transport works.

### Cline (VS Code extension)

Install **Cline** from the Marketplace, open the Cline panel → **Settings → MCP Servers → Add**, and use:

```json
{
  "name": "fatia-local",
  "transport": "http",
  "url": "http://localhost:3000/mcp",
  "headers": {
    "Authorization": "Bearer <paste token>"
  }
}
```

You can plug Cline into a local Ollama / LM Studio model — it'll call MCP tools from there.

### Continue.dev (VS Code / JetBrains)

Continue added MCP support in late 2024. In `~/.continue/config.yaml`:

```yaml
mcpServers:
  - name: fatia-local
    transport: http
    url: http://localhost:3000/mcp
    headers:
      Authorization: Bearer <paste token>
```

### Ollama / LM Studio (directly)

Neither speaks MCP natively — pair them with a client that does (Cline, Continue, or your own MCP-aware wrapper). The MCP server itself is model-agnostic.

### Confirmed-working clients

The MCP server uses the **Streamable HTTP** transport from `@modelcontextprotocol/sdk`. The following are known to work as of writing:

- Claude Desktop (recent builds with HTTP transport)
- Claude Code CLI
- Cline (VS Code)
- Continue.dev (VS Code, JetBrains)
- The official `@modelcontextprotocol/inspector` CLI

If you get a different client working, please add it here in a PR.

---

## Inspector (no IDE, no LLM)

The official MCP **inspector** is a TUI that talks the protocol directly — great for poking at a single tool:

```bash
npx @modelcontextprotocol/inspector \
  http://localhost:3000/mcp \
  --header "Authorization: Bearer $TOKEN"
```

It opens a browser, lists every registered tool with its Zod schema, and lets you call them interactively. This is the fastest way to debug a new tool you just added.

---

## When things go wrong

**`401 Unauthorized`**
Token expired or wrong audience. Mint a fresh one with the snippet in `LOCAL_AUTH.md`.

**`Connection refused`**
API isn't running. `pnpm dev`.

**`Method not found: tools/list`**
You're hitting the wrong path. The MCP endpoint is `POST /mcp`, not `/api/mcp`. The discovery endpoint at `/.well-known/oauth-protected-resource` is a `GET`.

**Client lists 0 tools**
Probably a silent auth failure — the server returns an empty response when the token's `sub` can't be provisioned. Tail the API logs (`pnpm infra:logs` for Docker, or watch `pnpm dev`) for the underlying error.

**Tool calls hang in the IDE client**
Some clients don't surface tool errors well. Run the same call via `pnpm mcp:smoke` or the inspector — those return the error verbatim.
