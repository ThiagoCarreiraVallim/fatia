/**
 * URLs do produto, resolvidas em build time.
 *
 * O site é estático, então não há env em runtime — os valores entram no HTML
 * durante o build. Em produção o Dockerfile recebe `PUBLIC_DOMAIN` como build
 * arg, vindo do `${DOMAIN}` do compose. O default é o domínio real, para o build
 * local não sair quebrado.
 */
const DOMAIN = import.meta.env.PUBLIC_DOMAIN ?? 'fat.ia.br';

export const site = {
  domain: DOMAIN,
  name: 'Fatia',
  /** Onde o usuário usa o produto. */
  appUrl: `https://app.${DOMAIN}`,
  /** Base da API. O endpoint MCP é este + `/mcp`. */
  apiUrl: `https://api.${DOMAIN}`,
  /** É esta URL que a pessoa cola no Claude ao adicionar o conector. */
  mcpUrl: `https://api.${DOMAIN}/mcp`,
  /** Fluxo guiado de conexão dentro do app (#164), para onde a landing empurra quem já tem conta. */
  connectGuideUrl: `https://app.${DOMAIN}/profile/connect`,
  repoUrl: 'https://github.com/ThiagoCarreiraVallim/fatia',
  privacyUrl: `https://app.${DOMAIN}/privacy`,
  termsUrl: `https://app.${DOMAIN}/terms`,
  /**
   * Onde a pessoa apaga a conta sem o app (#387). `fat.ia.br/apagar-conta` é o link público que
   * o Google Play pede; a página dele explica e leva para cá, que pede login e confirma.
   */
  deleteAccountUrl: `https://app.${DOMAIN}/apagar-conta`,
  /**
   * Onde a assinatura da web começa (#386, Si-04). O site não tem sessão: a página /pro escolhe
   * período e forma de pagamento e manda para cá, que passa pelo login quando preciso e chega ao
   * Meu plano, que pede o CPF e abre o Asaas.
   */
  subscribeUrl: `https://app.${DOMAIN}/assinar`,
  /**
   * Preços do PRO na web, em centavos. Vêm do mesmo `BILLING_PRO_*_CENTS` que a API cobra (build
   * args do compose); o valor que vale é o que o Meu plano mostra antes de pagar.
   */
  proPrices: {
    monthlyCents: Number(import.meta.env.PUBLIC_PRO_MONTHLY_CENTS ?? 1990),
    yearlyCents: Number(import.meta.env.PUBLIC_PRO_YEARLY_CENTS ?? 17900),
  },
} as const;
