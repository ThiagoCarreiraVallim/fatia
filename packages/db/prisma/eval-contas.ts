/**
 * Contas do Logto para o eval da fronteira de tools — roda **uma vez** por ambiente.
 *
 * O `/mcp` valida JWT pelo JWKS do Logto, e o eval precisa de um token de usuário
 * de verdade para cada persona, renovável ao longo de uma rodada de horas. Um
 * emissor de teste aceito pela API resolveria isso mais rápido, e é um bypass de
 * autenticação esperando para ser ligado em produção por engano (ver
 * `docs/LOCAL_AUTH.md`). O caminho aqui é o que o Logto já oferece:
 *
 * - duas contas reais no Logto de desenvolvimento, uma por persona;
 * - um **personal access token** de cada, com validade de 30 dias;
 * - um app `Fatia Eval` com token exchange ligado, que troca o PAT por um access
 *   token da API — é o que o runner faz, e refaz quando o token vence.
 *
 * Imprime as variáveis que o `seed-eval.ts` e o runner leem. Rodar de novo cria um
 * PAT novo; os anteriores continuam valendo até vencer.
 *
 * Uso: pnpm db:eval:contas
 * Exige LOGTO_ENDPOINT, LOGTO_M2M_APP_ID e LOGTO_M2M_APP_SECRET (o app M2M da
 * Management API, o mesmo que a deleção de conta usa).
 */

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', 'logto']);
const VALIDADE_DO_PAT_DIAS = 30;
const APP_NOME = 'Fatia Eval';

const CONTAS = [
  { persona: 'USUARIO', username: 'fatia_eval_usuario', name: 'Bia Souza (eval)' },
  { persona: 'PROFISSIONAL', username: 'fatia_eval_profissional', name: 'Carlos Mendes (eval)' },
] as const;

function exigir(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`${nome} não definido.`);
  return valor;
}

/**
 * PAT de 30 dias é credencial de longa duração. Num Logto de produção, ele valeria
 * contra dado de gente de verdade — por isso só local.
 */
function endpointLocal(): string {
  const endpoint = exigir('LOGTO_ENDPOINT').replace(/\/+$/, '');
  const host = new URL(endpoint).hostname;
  if (!HOSTS_LOCAIS.has(host)) {
    throw new Error(`eval-contas só roda contra Logto local; LOGTO_ENDPOINT aponta para ${host}.`);
  }
  return endpoint;
}

async function tokenDeGestao(endpoint: string): Promise<string> {
  const credencial = Buffer.from(
    `${exigir('LOGTO_M2M_APP_ID')}:${exigir('LOGTO_M2M_APP_SECRET')}`,
  ).toString('base64');
  const resposta = await fetch(`${endpoint}/oidc/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credencial}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: process.env.LOGTO_MANAGEMENT_RESOURCE ?? 'https://default.logto.app/api',
      scope: 'all',
    }),
  });
  if (!resposta.ok) {
    throw new Error(
      `Logto recusou o token da Management API: ${resposta.status} ${await resposta.text()}`,
    );
  }
  return ((await resposta.json()) as { access_token: string }).access_token;
}

function gestao(endpoint: string, token: string) {
  return async <T>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    const resposta = await fetch(`${endpoint}/api${caminho}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!resposta.ok) {
      throw new Error(
        `${init.method ?? 'GET'} ${caminho}: ${resposta.status} ${await resposta.text()}`,
      );
    }
    return (await resposta.json()) as T;
  };
}

type App = { id: string; secret: string; customClientMetadata: { allowTokenExchange?: boolean } };

async function appDeTroca(api: ReturnType<typeof gestao>): Promise<App> {
  const achados = await api<App[]>(
    `/applications?types=Traditional&search.name=${encodeURIComponent(APP_NOME)}&mode.name=exact`,
  );
  const existente = achados[0];
  if (existente) {
    // Token exchange nasce desligado no Logto. Um app achado com ele desligado é um app que alguém
    // mexeu à mão; religar aqui é o que o nome do app promete.
    if (!existente.customClientMetadata.allowTokenExchange) {
      await api(`/applications/${existente.id}`, {
        method: 'PATCH',
        body: {
          customClientMetadata: { ...existente.customClientMetadata, allowTokenExchange: true },
        },
      });
    }
    return api<App>(`/applications/${existente.id}`);
  }
  return api<App>('/applications', {
    method: 'POST',
    body: {
      name: APP_NOME,
      type: 'Traditional',
      description: 'Troca o PAT das contas de avaliação por access token. Só em ambiente local.',
      // O app nunca faz login interativo; o Logto exige ao menos uma URI de redirecionamento.
      oidcClientMetadata: {
        redirectUris: ['http://localhost:9/nao-usado'],
        postLogoutRedirectUris: [],
      },
      customClientMetadata: { allowTokenExchange: true },
    },
  });
}

async function conta(
  api: ReturnType<typeof gestao>,
  username: string,
  name: string,
): Promise<string> {
  const achados = await api<Array<{ id: string }>>(
    `/users?search.username=${encodeURIComponent(username)}&mode.username=exact`,
  );
  if (achados[0]) return achados[0].id;
  return (await api<{ id: string }>('/users', { method: 'POST', body: { username, name } })).id;
}

export async function runEvalContas(): Promise<void> {
  const endpoint = endpointLocal();
  const api = gestao(endpoint, await tokenDeGestao(endpoint));

  const app = await appDeTroca(api);
  const linhas = [`EVAL_LOGTO_APP_ID=${app.id}`, `EVAL_LOGTO_APP_SECRET=${app.secret}`];

  const expiresAt = Date.now() + VALIDADE_DO_PAT_DIAS * 24 * 60 * 60 * 1000;
  for (const c of CONTAS) {
    const sub = await conta(api, c.username, c.name);
    const pat = await api<{ value: string }>(`/users/${sub}/personal-access-tokens`, {
      method: 'POST',
      body: { name: `eval-${new Date().toISOString()}`, expiresAt },
    });
    linhas.push(`EVAL_SUB_${c.persona}=${sub}`, `EVAL_PAT_${c.persona}=${pat.value}`);
  }

  console.log('# Contas de avaliação — cole no .env (que não vai para o git).');
  console.log(`# PATs válidos até ${new Date(expiresAt).toISOString().slice(0, 10)}.`);
  console.log(linhas.join('\n'));
}

if (require.main === module) {
  runEvalContas().catch((err) => {
    console.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
