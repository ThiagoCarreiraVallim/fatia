import { apiFetch } from './http';

/**
 * Integrações e API (#413, pranchas Pn-38 e Pn-38b): as chaves da comunidade,
 * a cota do mês e as receitas prontas para Zapier e Make. Só o dono vê e mexe
 * (`integration.manage`); a API é o portão.
 *
 * A chave lê convites, membros (nome e papel) e envios. Nunca dado de saúde.
 */
export type ApiKeyScope = 'INVITES' | 'MEMBERS' | 'SENDS';
export type ApiQuotaState = 'ok' | 'near' | 'limit';

export interface ApiKey {
  id: string;
  name: string;
  /** Os 4 últimos caracteres: o segredo só aparece na criação. */
  lastFour: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  createdBy: string | null;
  lastUsedAt: string | null;
  callsThisMonth: number;
  revokedAt: string | null;
}

export interface ApiQuota {
  /** AAAA-MM, no fuso da comunidade. */
  month: string;
  used: number;
  limit: number;
  /** AAAA-MM-DD. */
  renewsOn: string;
  state: ApiQuotaState;
}

export interface ApiKeysView {
  keys: ApiKey[];
  quota: ApiQuota;
}

export interface CreatedApiKey {
  key: ApiKey;
  /** A chave inteira, só nesta resposta. */
  secret: string;
}

export const API_KEY_PREFIX = 'fatia_live_';
export const API_KEY_NAME_MAX = 60;

export const API_KEY_SCOPE_LABEL: Record<ApiKeyScope, string> = {
  INVITES: 'Convites',
  MEMBERS: 'Membros (nome e papel)',
  SENDS: 'Envios',
};

export const API_KEYS_HINT =
  'As chaves leem convites, membros (nome e papel) e envios. Dados de saúde só saem com o consentimento de cada aluno.';

const base = '/api/groups';

export const apiKeysApi = {
  list: (groupId: string) => apiFetch<ApiKeysView>(`${base}/${groupId}/api-keys`),
  create: (groupId: string, input: { name: string; scopes?: ApiKeyScope[] }) =>
    apiFetch<CreatedApiKey>(`${base}/${groupId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  revoke: (groupId: string, keyId: string) =>
    apiFetch<ApiKey>(`${base}/${groupId}/api-keys/${keyId}`, { method: 'DELETE' }),
};

/** "fatia_live_…8f2a". */
export function apiKeyMask(lastFour: string): string {
  return `${API_KEY_PREFIX}…${lastFour}`;
}

export function apiKeyNameError(name: string): string | null {
  const t = name.trim();
  if (!t) return 'Dê um nome à chave';
  if (t.length > API_KEY_NAME_MAX) return `Até ${API_KEY_NAME_MAX} caracteres`;
  return null;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const milhar = (n: number) => n.toLocaleString('pt-BR');

/** "1 dez", de um AAAA-MM-DD. */
function diaMes(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return m && d ? `${d} ${MESES[m - 1]}` : day;
}

/** "3 nov", a data de criação da chave no fuso de quem vê. */
export function apiKeyDateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** "3.210 de 10.000". */
export function quotaLabel(q: ApiQuota): string {
  return `${milhar(q.used)} de ${milhar(q.limit)}`;
}

export function quotaPercent(q: ApiQuota): number {
  if (q.limit <= 0) return 100;
  return Math.min(100, Math.round((q.used / q.limit) * 100));
}

export function quotaRenewsLabel(q: ApiQuota): string {
  return `renova ${diaMes(q.renewsOn)}`;
}

export function quotaHint(q: ApiQuota): string {
  const dia = diaMes(q.renewsOn);
  if (q.state === 'limit') {
    return `A cota do mês acabou. As chamadas pausam até ${dia}; nada no app muda.`;
  }
  if (q.state === 'near') {
    return `Quase no limite. Ao chegar, as chamadas pausam até ${dia}; nada no app muda.`;
  }
  return 'chamadas de API neste mês';
}

// ---------------------------------------------------------------- Receitas

export interface IntegrationRecipe {
  id: string;
  tool: 'Zapier' | 'Make';
  title: string;
  body: string;
  /** A rota da API, com a consulta. */
  path: string;
  /** Onde a receita começa, na ferramenta. */
  url: string;
  /** O gatilho na ferramenta, em palavras dela. */
  trigger: string;
  /** O que fazer com cada item. */
  action: string;
}

export const INTEGRATION_RECIPES: readonly IntegrationRecipe[] = [
  {
    id: 'new-member-sheet',
    tool: 'Zapier',
    title: 'Novo membro → planilha',
    body: 'Cada pessoa que entra vira uma linha (nome, origem, data).',
    path: '/integrations/v1/members',
    url: 'https://zapier.com/app/zaps',
    trigger: 'Crie um Zap com o gatilho "Webhooks by Zapier › Retrieve Poll".',
    action:
      'Ação: "Google Sheets › Create Spreadsheet Row", com as colunas name, origin e joinedAt.',
  },
  {
    id: 'pending-invite-whatsapp',
    tool: 'Make',
    title: 'Convite sem aceite → WhatsApp',
    body: 'Depois de 2 dias, manda lembrete pelo seu número.',
    path: '/integrations/v1/invites?pending=true',
    url: 'https://www.make.com/en/login',
    trigger: 'Crie um cenário com o módulo "HTTP › Make a request", agendado uma vez por dia.',
    action:
      'Ação: "WhatsApp Business Cloud › Send a Message" pelo seu número, para cada convite da lista.',
  },
  {
    id: 'program-sale-welcome',
    tool: 'Zapier',
    title: 'Programa vendido → e-mail de boas-vindas',
    body: 'Quando alguém compra uma oferta.',
    path: '/integrations/v1/sends?kind=PROGRAM_SALE',
    url: 'https://zapier.com/app/zaps',
    trigger: 'Crie um Zap com o gatilho "Webhooks by Zapier › Retrieve Poll".',
    action: 'Ação: "Gmail › Send Email" para o e-mail de quem comprou, com o nome do programa.',
  },
];

/**
 * O passo a passo de uma receita: a URL inteira e o cabeçalho. A chave nunca
 * entra no texto: a dona cola a dela, que só aparece na criação.
 */
export function recipeSteps(recipe: IntegrationRecipe, apiBase: string): string[] {
  const url = `${apiBase.replace(/\/+$/, '')}${recipe.path}`;
  return [
    `No ${recipe.tool}: ${recipe.trigger}`,
    `URL: ${url}`,
    'Cabeçalho: Authorization: Bearer <a sua chave>',
    recipe.tool === 'Zapier'
      ? 'Em "Key", escreva items: cada item novo dispara o Zap uma vez (pelo id).'
      : 'Ligue "Parse response" e passe items por um "Iterator": um item por vez.',
    recipe.action,
    'Cada chamada conta na cota do mês. Os itens já vistos voltam com ?since=<data da última leitura>.',
  ];
}
