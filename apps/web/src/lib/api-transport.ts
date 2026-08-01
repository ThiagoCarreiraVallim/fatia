import { configureApiClient, type ApiTransport } from '@fatia/api-client';

/**
 * Transporte do PWA.
 *
 * No web o access token **nunca chega ao navegador**: fica na sessão em cookie
 * `httpOnly`, e o proxy do Next (`src/app/api/proxy/[...path]/route.ts`) injeta
 * o `Authorization` no servidor. Por isso este transporte não tem `headers()` —
 * ele só reescreve o caminho e manda o cookie junto.
 *
 * Esse conhecimento vive aqui, e não em `@fatia/api-client`, de propósito: o app
 * nativo não tem proxy nenhum e faria a coisa errada se herdasse isto.
 */
export const webTransport: ApiTransport = {
  resolveUrl: (path) =>
    path.startsWith('/api/') ? `/api/proxy${path.slice('/api'.length)}` : path,

  requestInit: () => ({ credentials: 'include' }),

  // Não redireciona automaticamente — durante debug, isso só atrapalha. Apenas
  // registra a falha; a pessoa pode clicar em "Sair" se precisar refazer login.
  onUnauthorized: ({ path, body }) => {
    if (typeof window === 'undefined') return;
    const source = (body as { source?: string } | null)?.source;
    console.error('[apiFetch] 401 — sessão pode ter expirado', {
      path,
      body,
      hint:
        source === 'proxy-no-token'
          ? 'Proxy não conseguiu obter access token do Logto (verifique LOGTO_AUDIENCE / faça sign-out + sign-in).'
          : 'Backend rejeitou o JWT (token inválido / expirado / audience errado).',
    });
  },
};

export function installWebApiTransport(): void {
  configureApiClient(webTransport);
}
