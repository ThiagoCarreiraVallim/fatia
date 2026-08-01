/**
 * Configuração vinda do ambiente.
 *
 * `EXPO_PUBLIC_*` é inlinado pelo Metro em tempo de bundle — não existe leitura
 * em runtime, então referenciar `process.env.EXPO_PUBLIC_X` dinamicamente (por
 * exemplo `process.env[nome]`) devolve `undefined`. Por isso cada variável
 * aparece aqui escrita por extenso.
 *
 * Nada de segredo entra em `EXPO_PUBLIC_*`: tudo isso vai para dentro do binário
 * e é legível por quem baixar o app. O `appId` do Logto é público por desenho
 * (cliente nativo é público, sem secret, e é justamente por isso que o fluxo
 * exige PKCE).
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Variável ${name} não definida. Copie apps/mobile/.env.example para ` +
        `apps/mobile/.env e preencha — veja apps/mobile/README.md.`,
    );
  }
  return value.replace(/\/+$/, '');
}

export const env = {
  /** Base da API. Em produção: https://api.fat.ia.br */
  get apiUrl(): string {
    return required(process.env.EXPO_PUBLIC_API_URL, 'EXPO_PUBLIC_API_URL');
  },
  /** Endpoint do Logto. Em produção: https://auth.fat.ia.br */
  get logtoEndpoint(): string {
    return required(process.env.EXPO_PUBLIC_LOGTO_ENDPOINT, 'EXPO_PUBLIC_LOGTO_ENDPOINT');
  },
  /** App ID da Application do tipo **Native** criada no Logto. */
  get logtoAppId(): string {
    return required(process.env.EXPO_PUBLIC_LOGTO_APP_ID, 'EXPO_PUBLIC_LOGTO_APP_ID');
  },
  /**
   * Identificador do recurso protegido (audience do JWT). Precisa ser idêntico
   * ao `LOGTO_AUDIENCE` da API — o Logto faz match exato e recusa com
   * `invalid_target` se sobrar uma barra.
   */
  get logtoAudience(): string {
    return required(process.env.EXPO_PUBLIC_LOGTO_AUDIENCE, 'EXPO_PUBLIC_LOGTO_AUDIENCE');
  },
  /** URL do conector MCP mostrada na tela de perfil. */
  get mcpUrl(): string {
    return `${env.apiUrl}/mcp`;
  },
};

/**
 * Diz se a configuração está completa, sem lançar. A tela de login usa para
 * mostrar o que falta em vez de uma tela branca com erro no console.
 */
export function missingEnvVars(): string[] {
  const entries: Array<[string, string | undefined]> = [
    ['EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL],
    ['EXPO_PUBLIC_LOGTO_ENDPOINT', process.env.EXPO_PUBLIC_LOGTO_ENDPOINT],
    ['EXPO_PUBLIC_LOGTO_APP_ID', process.env.EXPO_PUBLIC_LOGTO_APP_ID],
    ['EXPO_PUBLIC_LOGTO_AUDIENCE', process.env.EXPO_PUBLIC_LOGTO_AUDIENCE],
  ];
  return entries.filter(([, value]) => !value).map(([name]) => name);
}
