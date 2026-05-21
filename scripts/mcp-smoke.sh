#!/usr/bin/env bash
# Quick smoke test for the local MCP server.
#
# Probes the discovery endpoint and (optionally) calls a tool. Useful to
# validate the server is reachable without an LLM in the loop.
#
# Usage:
#   ./scripts/mcp-smoke.sh                  # discovery only (no token needed)
#   TOKEN=<jwt> ./scripts/mcp-smoke.sh      # also lists tools and calls get_me

set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
MCP_URL="${MCP_URL:-$API_URL/mcp}"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required"

say "GET $API_URL/.well-known/oauth-protected-resource"
if curl -fsS "$API_URL/.well-known/oauth-protected-resource" | head -c 400; then
  printf '\n'
  ok "discovery endpoint reachable"
else
  die "discovery endpoint not reachable. Is the API running? (pnpm dev)"
fi

if [ -z "${TOKEN:-}" ]; then
  cat <<'EOF'

No TOKEN provided — stopping at the discovery check.

To exercise the MCP transport, set TOKEN to a valid Logto access token:
  TOKEN=<jwt> ./scripts/mcp-smoke.sh

See docs/LOCAL_AUTH.md for how to mint one in dev.
EOF
  exit 0
fi

say "POST $MCP_URL  (tools/list)"
curl -fsS -X POST "$MCP_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 800
printf '\n'
ok "tools/list returned"

say "POST $MCP_URL  (tools/call get_me)"
curl -fsS -X POST "$MCP_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_me","arguments":{}}}' | head -c 800
printf '\n'
ok "tools/call get_me returned"
