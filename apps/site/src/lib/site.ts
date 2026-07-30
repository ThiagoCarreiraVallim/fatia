/**
 * URLs do produto, resolvidas em build time.
 *
 * O site é estático (`output: 'export'`), então não há env em runtime — os
 * valores são embedados no bundle. Em produção o Dockerfile recebe
 * `NEXT_PUBLIC_DOMAIN` como build arg, vindo do `${DOMAIN}` do compose. Os
 * defaults abaixo são o domínio real, para o build local não sair quebrado.
 */
const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN ?? 'fat.ia.br';

export const site = {
  domain: DOMAIN,
  name: 'Fatia',
  /** Onde o usuário usa o produto. */
  appUrl: `https://app.${DOMAIN}`,
  /** Base da API. O endpoint MCP é este + `/mcp`. */
  apiUrl: `https://api.${DOMAIN}`,
  /** É esta URL que a pessoa cola no Claude ao adicionar o conector. */
  mcpUrl: `https://api.${DOMAIN}/mcp`,
  repoUrl: 'https://github.com/ThiagoCarreiraVallim/fatia',
  privacyUrl: `https://app.${DOMAIN}/privacy`,
  termsUrl: `https://app.${DOMAIN}/terms`,
} as const;
