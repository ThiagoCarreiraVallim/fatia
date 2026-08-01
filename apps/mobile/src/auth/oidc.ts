/**
 * Conversas com o servidor OIDC do Logto.
 *
 * Funções puras sobre `fetch`, sem estado e sem React — é o que torna a lógica
 * de sessão testável sem simulador.
 */

export interface OidcEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  endSessionEndpoint: string | null;
  userinfoEndpoint: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/**
 * Erro devolvido pelo endpoint de token, no envelope da RFC 6749 §5.2.
 *
 * O `code` importa: `invalid_grant` significa que o refresh token morreu e a
 * única saída é login novo. Qualquer outro erro pode ser transitório e não
 * justifica derrubar a sessão de quem está no meio de um treino.
 */
export class OidcError extends Error {
  constructor(
    readonly code: string,
    description: string,
  ) {
    super(description || code);
    this.name = 'OidcError';
  }

  /** Só isto significa "a sessão acabou, faça login de novo". */
  get requiresReauthentication(): boolean {
    return this.code === 'invalid_grant';
  }
}

export async function discover(endpoint: string, fetchImpl = fetch): Promise<OidcEndpoints> {
  const url = `${endpoint.replace(/\/+$/, '')}/oidc/.well-known/openid-configuration`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Não foi possível ler a configuração do Logto (${res.status}) em ${url}`);
  }
  const doc = (await res.json()) as Record<string, string | undefined>;
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error(`Configuração OIDC incompleta em ${url}`);
  }
  return {
    authorizationEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
    endSessionEndpoint: doc.end_session_endpoint ?? null,
    userinfoEndpoint: doc.userinfo_endpoint ?? null,
  };
}

async function postToken(
  tokenEndpoint: string,
  body: Record<string, string>,
  fetchImpl = fetch,
): Promise<TokenResponse> {
  const res = await fetchImpl(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new OidcError(
      typeof json.error === 'string' ? json.error : `http_${res.status}`,
      typeof json.error_description === 'string' ? json.error_description : '',
    );
  }
  return json as unknown as TokenResponse;
}

/**
 * Troca o `code` do callback por tokens.
 *
 * Não vai `client_secret`: o cliente é público (o app é distribuído, qualquer um
 * pode extrair o que estiver dentro dele). É exatamente por isso que o fluxo
 * exige PKCE — o `code_verifier` prova que quem troca o código é quem iniciou o
 * pedido.
 */
export function exchangeCode(
  tokenEndpoint: string,
  params: {
    clientId: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
    resource: string;
  },
  fetchImpl = fetch,
): Promise<TokenResponse> {
  return postToken(
    tokenEndpoint,
    {
      grant_type: 'authorization_code',
      client_id: params.clientId,
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
      resource: params.resource,
    },
    fetchImpl,
  );
}

export function refreshTokens(
  tokenEndpoint: string,
  params: { clientId: string; refreshToken: string; resource: string },
  fetchImpl = fetch,
): Promise<TokenResponse> {
  return postToken(
    tokenEndpoint,
    {
      grant_type: 'refresh_token',
      client_id: params.clientId,
      refresh_token: params.refreshToken,
      resource: params.resource,
    },
    fetchImpl,
  );
}
