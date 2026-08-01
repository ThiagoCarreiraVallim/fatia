import { configureApiClient, type ApiTransport } from '@fatia/api-client';
import { env } from '@/env';

/**
 * Transporte do app nativo.
 *
 * Ao contrário do PWA, aqui não existe proxy: a chamada sai do aparelho direto
 * para a API pública, com o `Bearer` lido do cofre do sistema.
 *
 * Duas consequências que valem registrar:
 *
 * - **CORS não se aplica.** Requisição nativa não manda `Origin` de navegador e
 *   não passa por preflight. A lista de origens da API continua valendo para o
 *   PWA e não precisa ganhar entrada nenhuma por causa do app.
 * - **O token está no aparelho.** É a mudança de modelo de ameaça da #120, e o
 *   que justifica `WHEN_UNLOCKED_THIS_DEVICE_ONLY` no `token-store`.
 */
export function installMobileApiTransport(deps: {
  getAccessToken: () => Promise<string | null>;
  onSessionEnded: () => void;
}): void {
  const transport: ApiTransport = {
    resolveUrl: (path) => `${env.apiUrl}${path}`,

    headers: async () => {
      const token = await deps.getAccessToken();
      return token ? { Authorization: `Bearer ${token}` } : undefined;
    },

    // Rede móvel é pior que Wi-Fi de escritório. 15 s é o padrão do pacote e o
    // que o PWA usa; aqui vale mais folga antes de dizer que deu erro.
    timeoutMs: 25_000,

    // Chegar aqui significa que o token que o SessionManager considerou válido
    // foi recusado pela API — revogação no servidor, ou relógio do aparelho
    // fora de hora. Renovar não resolve; o caminho é login novo.
    onUnauthorized: () => deps.onSessionEnded(),
  };

  configureApiClient(transport);
}
