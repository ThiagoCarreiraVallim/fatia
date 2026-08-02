/**
 * Endereço do servidor que o cliente de IA precisa receber, montado num lugar só.
 *
 * Existe porque a alternativa já falhou: o app teve, ao mesmo tempo, uma tela mostrando a URL
 * montada de `NEXT_PUBLIC_API_URL` e outra mandando colar `https://seu-dominio.com/mcp/sse` —
 * domínio de exemplo e sub-rota que nunca existiu. Quem seguia a segunda não conectava, e o erro
 * aparecia do lado do Claude, longe daqui.
 *
 * O caminho `/mcp` não é escolha desta camada: é o `@Controller('mcp')` da API, com um único
 * `@All()` e nenhuma sub-rota. `apps/web/src/app/(app)/profile/connect/__tests__/mcp-url.test.ts`
 * lê o controller de verdade e confere.
 */
export function mcpServerUrl(apiUrl?: string): string {
  const base = apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  // Barra sobrando no env viraria `//mcp`, que é outra rota para o servidor.
  return `${base.replace(/\/+$/, '')}/mcp`;
}
