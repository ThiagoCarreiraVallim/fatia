/** Onde a API é alcançada de fora (`API_PUBLIC_URL`). Sem a env, o endereço do dev. */
export function apiPublicUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.API_PUBLIC_URL?.trim();
  return (url || `http://localhost:${env.API_PORT || 3000}`).replace(/\/+$/, '');
}

/**
 * O endereço do servidor MCP que a pessoa cola no Claude ou no ChatGPT
 * ("Conectar sua IA", #388). É o `resource` do metadata OAuth para quem chega
 * pelo endereço público (`oauth-discovery.controller.ts`): o cliente compara os
 * dois, com o path. O `/mcp` é o `@Controller('mcp')`, sem sub-rota.
 */
export function mcpPublicUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `${apiPublicUrl(env)}/mcp`;
}
