/**
 * Conectar sua IA (Você › IA, pranchas Al-V6 a Al-V6e, #388): o texto e as
 * contas da tela, iguais no app e no PWA.
 *
 * A pessoa escolhe a IA, segue quatro passos, copia o endereço e testa com uma
 * pergunta. O endereço vem da API (`serverUrl`, da configuração do servidor),
 * nunca escrito aqui. "Conectado" é uma conexão que o servidor viu nascer no
 * login do app de IA (`McpOAuthConnection`), com o último acesso.
 *
 * O Fatia não desconecta a IA: os tokens são do Logto e o facade não revoga
 * (`docs/MCP_OAUTH.md`). Por isso a tela manda remover o conector no app da IA.
 */
import { apiFetch } from './http';

export type AiProvider = 'claude' | 'chatgpt' | 'other';

export const AI_PROVIDER_OPTIONS: { value: AiProvider; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'other', label: 'Outro app' },
];

export interface ConnectStep {
  title: string;
  detail: string;
}

/**
 * Os passos de cada IA, com as palavras que aparecem na tela dela (o Claude em
 * inglês, o ChatGPT em português). O do ChatGPT segue a prancha e ainda precisa
 * do teste com conta de verdade antes do lançamento (REDESIGN_PROGRESS, #388).
 */
const STEPS: Record<AiProvider, [string, string][]> = {
  claude: [
    ['Abra Settings → Connectors', 'No Claude, na web ou no app do computador.'],
    ['Add custom connector', 'Nome: Fatia. Endereço: o link abaixo.'],
    ['Cole o endereço', 'Use o botão copiar para não faltar nenhum pedaço.'],
  ],
  chatgpt: [
    ['Abra Configurações → Apps e conectores', 'No ChatGPT, na web.'],
    ['Ative o modo desenvolvedor', 'Em Avançado. Só precisa fazer uma vez.'],
    ['Crie um conector', 'Nome: Fatia. Endereço: o link abaixo.'],
  ],
  other: [
    [
      'Abra as configurações de MCP',
      'Cada app chama de um jeito: conectores, ferramentas ou servidores.',
    ],
    ['Adicione um servidor remoto', 'Tipo HTTP. Nome: Fatia.'],
    ['Cole o endereço', 'O link abaixo, inteiro.'],
  ],
};

export function connectSteps(provider: AiProvider, email: string | null): ConnectStep[] {
  return [
    ...STEPS[provider].map(([title, detail]) => ({ title, detail })),
    {
      title: 'Entre e autorize',
      detail: email
        ? `Com o mesmo e-mail desta conta: ${email}.`
        : 'Com o mesmo e-mail desta conta.',
    },
  ];
}

/** A pergunta do teste: passa pela tool `get_today_summary` e devolve o dia da pessoa. */
export const VERIFY_PROMPT = 'Qual é meu resumo de hoje?';
export const VERIFY_HINT = 'Se ele responder com seus números, está conectado.';

/** Um exemplo do que a IA responde, para a pessoa reconhecer que deu certo. */
export const CONNECTED_EXAMPLE =
  '“Hoje: 1.066 kcal restantes de 1.840, 1,2 L de água e o treino de pernas pendente.”';

/**
 * Aviso de privacidade da tela: a IA de fora só vê o que é da pessoa, e o que
 * ela lê passa pela política de privacidade do app dela.
 */
export const CONNECT_PRIVACY_NOTE =
  'A IA conectada lê e registra só os seus dados, e só quando você pede. O que ela lê passa também pela política de privacidade do app dela.';

export const NO_MCP_TITLE = 'Este app não aceita MCP';
export const NO_MCP_BODY =
  'Alguns apps ou planos não deixam conectar ferramentas de fora. Você ainda pode usar a IA do próprio Fatia ou exportar seus dados.';

/** Uma conexão de app de IA, como `GET /users/me/mcp-connections` devolve. */
export interface McpConnection {
  id: string;
  /** O nome que o app mandou ao se registrar. Pode faltar. */
  clientName: string | null;
  connectedAt: string;
  lastUsedAt: string;
}

export interface McpConnectionsOverview {
  /** O endereço para colar no app de IA: `API_PUBLIC_URL` + `/mcp`. */
  serverUrl: string;
  connections: McpConnection[];
}

export const mcpConnectionsApi = {
  overview: () => apiFetch<McpConnectionsOverview>('/api/users/me/mcp-connections'),
};

/** Qual IA é, pelo nome que o app mandou no registro. */
export function providerOfClient(clientName: string | null): AiProvider {
  if (!clientName) return 'other';
  if (/claude/i.test(clientName)) return 'claude';
  if (/chatgpt|openai/i.test(clientName)) return 'chatgpt';
  return 'other';
}

/** A conexão mais recente daquela IA, ou nada. */
export function connectionFor(
  provider: AiProvider,
  connections: readonly McpConnection[],
): McpConnection | null {
  let best: McpConnection | null = null;
  for (const c of connections) {
    if (providerOfClient(c.clientName) !== provider) continue;
    if (!best || Date.parse(c.lastUsedAt) > Date.parse(best.lastUsedAt)) best = c;
  }
  return best;
}

/** A tela abre na IA que a pessoa usou por último; sem nenhuma, no Claude. */
export function initialProvider(connections: readonly McpConnection[]): AiProvider {
  let latest: McpConnection | null = null;
  for (const c of connections) {
    if (!latest || Date.parse(c.lastUsedAt) > Date.parse(latest.lastUsedAt)) latest = c;
  }
  return latest ? providerOfClient(latest.clientName) : 'claude';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "agora", "há 20 min", "há 3 h", "ontem", "há 4 dias", "em 02/10". */
export function lastAccessLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const diff = Math.max(0, now.getTime() - at.getTime());
  if (diff < 2 * MINUTE) return 'agora';
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`;
  const days = Math.round((startOfDay(now) - startOfDay(at)) / (24 * HOUR));
  if (days === 0) return `há ${Math.floor(diff / HOUR)} h`;
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  const dd = String(at.getDate()).padStart(2, '0');
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  return `em ${dd}/${mm}`;
}

export function connectedTitle(provider: AiProvider, connection: McpConnection): string {
  if (provider === 'claude') return 'Conectado ao Claude';
  if (provider === 'chatgpt') return 'Conectado ao ChatGPT';
  return connection.clientName ? `${connection.clientName} conectado` : 'App conectado';
}

/** O rodapé do estado conectado. Não promete desconectar pelo Fatia (não há revogação aqui). */
export function connectedFootnote(lastUsedAt: string, now: Date = new Date()): string {
  return `Último acesso ${lastAccessLabel(lastUsedAt, now)} · para desconectar, remova o conector no app da sua IA.`;
}

const CHAT_TIP: Record<AiProvider, string> = {
  claude: 'No Claude, ligue o Fatia no menu de ferramentas da conversa antes de perguntar',
  chatgpt: 'No ChatGPT, ative o conector na conversa antes de perguntar',
  other: 'No seu app, deixe o servidor do Fatia ligado na conversa antes de perguntar',
};

/** As três verificações do "Não funcionou?" (Al-V6d). */
export function failureChecks(
  provider: AiProvider,
  serverUrl: string,
  email: string | null,
): string[] {
  return [
    `Confira se o link está inteiro: ${serverUrl}`,
    email
      ? `Entre com o mesmo e-mail desta conta: ${email}`
      : 'Entre com o mesmo e-mail desta conta',
    CHAT_TIP[provider],
  ];
}
