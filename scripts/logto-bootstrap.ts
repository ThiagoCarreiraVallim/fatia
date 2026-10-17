/**
 * Configura o Logto por código (ADR 029).
 *
 * Tudo o que `docs/LOCAL_AUTH.md` mandava clicar no console vira chamada à
 * Management API, idempotente: rodar de novo não duplica nada, só reaplica.
 *
 *   1. API resource (`LOGTO_AUDIENCE`);
 *   2. apps OIDC: Fatia Web (Traditional), Fatia MCP (Traditional), Fatia Mobile (Native);
 *   3. conector de e-mail (SMTP) com templates em pt-BR, se EMAIL_SMTP_HOST estiver definido;
 *   4. experiência de login: marca, pt-BR, termos, cadastro e "esqueci minha senha";
 *   5. usuário demo e usuário da equipe (só fora de produção), usados pelo Playwright e
 *      pelo seed-demo — a equipe é a dona da "Academia Demo" e grava `EQUIPE_LOGTO_ID`.
 *
 * Pré-requisito: um app M2M com a role "Logto Management API access" em
 * LOGTO_M2M_APP_ID/SECRET. Local: `bash scripts/logto-seed-m2m.sh`. Produção: console.
 *
 * Grava no `.env` os IDs/secrets dos apps criados (só os que estão vazios ou com
 * placeholder do `.env.example` — nunca sobrescreve um valor real).
 *
 * Uso: pnpm logto:bootstrap
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const ENV_PATH = resolve(ROOT, '.env');
const MOBILE_ENV_PATH = resolve(ROOT, 'apps/mobile/.env');

const env = (name: string, fallback = ''): string => process.env[name] ?? fallback;

const ENDPOINT = env('LOGTO_ENDPOINT', 'http://localhost:3001').replace(/\/$/, '');
const MANAGEMENT_RESOURCE = env('LOGTO_MANAGEMENT_RESOURCE', 'https://default.logto.app/api');
const AUDIENCE = env('LOGTO_AUDIENCE', 'https://api.fatia.local');
const WEB_BASE = env('LOGTO_BASE_URL', 'http://localhost:3030').replace(/\/$/, '');
const API_BASE = env('API_PUBLIC_URL', `http://localhost:${env('API_PORT', '3000')}`).replace(
  /\/$/,
  '',
);
const IS_PRODUCTION = env('NODE_ENV') === 'production';

export const DEMO_USER = {
  username: env('DEMO_USERNAME', 'demo'),
  email: env('DEMO_EMAIL', 'demo@fatia.local'),
  password: env('DEMO_PASSWORD', 'Fatia-demo-2026!'),
  name: 'Ana Demo',
};

/** Dona da "Academia Demo" do seed: convida, aprova e lê com consentimento no E2E. */
export const TEAM_USER = {
  username: env('EQUIPE_USERNAME', 'equipe'),
  email: env('EQUIPE_EMAIL', 'equipe@fatia.local'),
  password: env('EQUIPE_PASSWORD', 'Fatia-equipe-2026!'),
  name: 'Bruno Equipe',
};

const PLACEHOLDER = /^(|replace_.*)$/;

function say(msg: string) {
  console.log(`\x1b[1;36m▶ ${msg}\x1b[0m`);
}

// ---------------------------------------------------------------------------
// .env
// ---------------------------------------------------------------------------

function readEnvFile(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function envFileGet(content: string, key: string): string {
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

/** Grava sempre: para o que deriva do Logto (um id), e não para segredo escolhido à mão. */
function envFileSet(path: string, key: string, value: string) {
  let content = readEnvFile(path);
  const line = `${key}=${value}`;
  content = new RegExp(`^${key}=`, 'm').test(content)
    ? content.replace(new RegExp(`^${key}=.*$`, 'm'), line)
    : `${content.replace(/\n?$/, '\n')}${line}\n`;
  writeFileSync(path, content);
}

/** Grava só quando o valor atual é vazio ou placeholder. Devolve o valor efetivo. */
function envFileSetIfPlaceholder(path: string, key: string, value: string): string {
  let content = readEnvFile(path);
  const current = envFileGet(content, key);
  if (!PLACEHOLDER.test(current)) return current;
  const line = `${key}=${value}`;
  content = new RegExp(`^${key}=`, 'm').test(content)
    ? content.replace(new RegExp(`^${key}=.*$`, 'm'), line)
    : `${content.replace(/\n?$/, '\n')}${line}\n`;
  writeFileSync(path, content);
  return value;
}

// ---------------------------------------------------------------------------
// Management API
// ---------------------------------------------------------------------------

async function managementToken(): Promise<string> {
  const id = env('LOGTO_M2M_APP_ID');
  const secret = env('LOGTO_M2M_APP_SECRET');
  if (!id || !secret) {
    throw new Error(
      'LOGTO_M2M_APP_ID/SECRET vazios. Local: `bash scripts/logto-seed-m2m.sh`. Produção: crie o app M2M no console.',
    );
  }
  const res = await fetch(`${ENDPOINT}/oidc/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: MANAGEMENT_RESOURCE,
      scope: 'all',
    }),
  });
  if (!res.ok) throw new Error(`token M2M: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

type Api = <T>(method: string, path: string, body?: unknown) => Promise<T>;

function managementApi(token: string): Api {
  return async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${ENDPOINT}/api${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  };
}

// ---------------------------------------------------------------------------
// Passos
// ---------------------------------------------------------------------------

async function ensureResource(api: Api) {
  const resources = await api<Array<{ indicator: string }>>('GET', '/resources');
  if (resources.some((r) => r.indicator === AUDIENCE)) {
    say(`API resource ${AUDIENCE} já existe`);
    return;
  }
  await api('POST', '/resources', { name: 'Fatia API', indicator: AUDIENCE });
  say(`API resource ${AUDIENCE} criado`);
}

interface App {
  id: string;
  name: string;
  type: string;
}

async function ensureApp(
  api: Api,
  spec: {
    name: string;
    type: 'Traditional' | 'Native';
    redirectUris: string[];
    postLogoutRedirectUris: string[];
  },
): Promise<App> {
  const apps = await api<App[]>('GET', '/applications?page_size=100');
  const metadata = {
    redirectUris: spec.redirectUris,
    postLogoutRedirectUris: spec.postLogoutRedirectUris,
  };
  const existing = apps.find((a) => a.name === spec.name && a.type === spec.type);
  if (existing) {
    // Reaplica as URIs: mudar porta ou domínio no .env e rodar de novo basta.
    const updated = await api<App>('PATCH', `/applications/${existing.id}`, {
      oidcClientMetadata: metadata,
    });
    say(`App ${spec.name} já existe (${existing.id}) — URIs reaplicadas`);
    return updated;
  }
  const created = await api<App>('POST', '/applications', {
    name: spec.name,
    type: spec.type,
    oidcClientMetadata: metadata,
  });
  say(`App ${spec.name} criado (${created.id})`);
  return created;
}

/**
 * O secret de verdade de um app confidencial.
 *
 * Desde o Logto 1.2x o campo `secret` do app é um marcador `#internal:…`; os
 * secrets utilizáveis moram em `/applications/:id/secrets`. Reaproveita o
 * primeiro existente e só cria um quando não há nenhum.
 */
async function appSecret(api: Api, appId: string): Promise<string> {
  const secrets = await api<Array<{ name: string; value: string }>>(
    'GET',
    `/applications/${appId}/secrets`,
  );
  if (secrets[0]) return secrets[0].value;
  const created = await api<{ value: string }>('POST', `/applications/${appId}/secrets`, {
    name: 'fatia-bootstrap',
  });
  return created.value;
}

// ---------------------------------------------------------------------------
// E-mail: conector SMTP + templates em pt-BR
// ---------------------------------------------------------------------------

const SMTP = {
  host: env('EMAIL_SMTP_HOST'),
  port: Number(env('EMAIL_SMTP_PORT', '587')),
  user: env('EMAIL_SMTP_USER'),
  pass: env('EMAIL_SMTP_PASS'),
  secure: env('EMAIL_SMTP_SECURE') === 'true',
  from: env('EMAIL_FROM', 'Fatia <nao-responda@fatia.local>'),
};

function emailHtml(title: string, lead: string): string {
  return `<div style="font-family:Inter,Arial,sans-serif;background:#131313;padding:32px">
  <div style="max-width:440px;margin:0 auto;background:#1e1e1e;border-radius:12px;padding:32px;color:#eeeeee">
    <div style="font-size:22px;font-weight:700;color:#2ce500;margin-bottom:24px">Fatia</div>
    <div style="font-size:18px;font-weight:600;margin-bottom:8px">${title}</div>
    <div style="font-size:14px;color:#bbbbbb;margin-bottom:24px">${lead}</div>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#131313;border-radius:8px;padding:16px;text-align:center">{{code}}</div>
    <div style="font-size:12px;color:#888888;margin-top:24px">O código vale por 10 minutos. Se não foi você, ignore este e-mail — nada muda na sua conta.</div>
  </div>
</div>`;
}

const EMAIL_TEMPLATES = [
  ['SignIn', 'Seu código de acesso ao Fatia', 'Entrar no Fatia', 'Use este código para entrar.'],
  [
    'Register',
    'Confirme seu e-mail no Fatia',
    'Bem-vindo ao Fatia',
    'Use este código para confirmar seu e-mail e terminar o cadastro.',
  ],
  [
    'ForgotPassword',
    'Redefinir sua senha do Fatia',
    'Redefinir senha',
    'Recebemos um pedido para redefinir sua senha. Use este código para criar uma nova.',
  ],
  ['Generic', 'Seu código do Fatia', 'Código de verificação', 'Use este código para continuar.'],
].map(([usageType, subject, title, lead]) => ({
  usageType,
  subject,
  contentType: 'text/html',
  content: emailHtml(title!, lead!),
}));

/** Cria ou atualiza o conector SMTP. Devolve `false` quando não há SMTP configurado. */
async function ensureEmailConnector(api: Api): Promise<boolean> {
  if (!SMTP.host) {
    say('EMAIL_SMTP_HOST vazio — sem conector de e-mail (sem recuperação de senha)');
    return false;
  }
  const config = {
    host: SMTP.host,
    port: SMTP.port,
    auth: { type: 'login', user: SMTP.user, pass: SMTP.pass },
    fromEmail: SMTP.from,
    secure: SMTP.secure,
    templates: EMAIL_TEMPLATES,
  };
  const connectors = await api<Array<{ id: string; connectorId: string }>>('GET', '/connectors');
  const existing = connectors.find((c) => c.connectorId === 'simple-mail-transfer-protocol');
  if (existing) {
    await api('PATCH', `/connectors/${existing.id}`, { config });
    say(`Conector SMTP atualizado (${SMTP.host}:${SMTP.port})`);
  } else {
    await api('POST', '/connectors', { connectorId: 'simple-mail-transfer-protocol', config });
    say(`Conector SMTP criado (${SMTP.host}:${SMTP.port})`);
  }
  return true;
}

/**
 * Com e-mail: cadastro por e-mail verificado e "esqueci minha senha" por código.
 * Sem e-mail: cadastro por nome de usuário, sem recuperação (o Logto recusa
 * verificação sem conector).
 */
async function configureSignInExperience(api: Api, hasEmail: boolean) {
  const passwordMethod = (identifier: 'email' | 'username') => ({
    identifier,
    password: true,
    verificationCode: identifier === 'email' && hasEmail,
    isPasswordPrimary: true,
  });
  await api('PATCH', '/sign-in-exp', {
    color: { primaryColor: '#1f9e00', isDarkModeEnabled: true, darkPrimaryColor: '#2ce500' },
    branding: {
      logoUrl: `${WEB_BASE}/icons/icon-192.png`,
      darkLogoUrl: `${WEB_BASE}/icons/icon-192.png`,
    },
    languageInfo: { autoDetect: false, fallbackLanguage: 'pt-BR' },
    termsOfUseUrl: `${WEB_BASE}/terms`,
    privacyPolicyUrl: `${WEB_BASE}/privacy`,
    signInMode: 'SignInAndRegister',
    signUp: hasEmail
      ? { identifiers: ['email'], password: true, verify: true }
      : { identifiers: ['username'], password: true, verify: false },
    signIn: { methods: [passwordMethod('email'), passwordMethod('username')] },
    forgotPasswordMethods: hasEmail ? ['EmailVerificationCode'] : [],
    // Explícita para não depender do default do Logto. `pwned` consulta o Have I
    // Been Pwned (k-anonimidade: só os 5 primeiros caracteres do hash saem).
    passwordPolicy: {
      length: { min: 8, max: 256 },
      characterTypes: { min: 1 },
      rejects: { pwned: true, repetitionAndSequence: true, userInfo: true, words: [] },
    },
  });
  say(
    hasEmail
      ? 'Experiência de login: pt-BR, cadastro por e-mail verificado, "esqueci minha senha" ligado'
      : 'Experiência de login: pt-BR, cadastro por usuário e senha (sem e-mail)',
  );
}

/** Cria ou reaplica a senha de um usuário de teste. Devolve o id no Logto (o `sub`). */
async function ensureUser(api: Api, user: typeof DEMO_USER, label: string): Promise<string> {
  const found = await api<Array<{ id: string }>>(
    'GET',
    `/users?search=${encodeURIComponent(user.email)}&mode.primaryEmail=exact`,
  );
  if (found.length > 0) {
    await api('PATCH', `/users/${found[0]!.id}/password`, { password: user.password });
    say(`Usuário ${label} ${user.email} já existe — senha reaplicada`);
    return found[0]!.id;
  }
  const created = await api<{ id: string }>('POST', '/users', {
    username: user.username,
    primaryEmail: user.email,
    password: user.password,
    name: user.name,
  });
  say(`Usuário ${label} ${user.email} criado`);
  return created.id;
}

async function main() {
  const api = managementApi(await managementToken());

  await ensureResource(api);

  const web = await ensureApp(api, {
    name: 'Fatia Web',
    type: 'Traditional',
    redirectUris: [`${WEB_BASE}/api/logto/callback`],
    postLogoutRedirectUris: [WEB_BASE],
  });
  const mcp = await ensureApp(api, {
    name: 'Fatia MCP',
    type: 'Traditional',
    redirectUris: [`${API_BASE}/oauth/callback`],
    postLogoutRedirectUris: [],
  });
  const mobile = await ensureApp(api, {
    name: 'Fatia Mobile',
    type: 'Native',
    redirectUris: ['fatia://auth/callback'],
    postLogoutRedirectUris: ['fatia://auth/callback'],
  });

  envFileSetIfPlaceholder(ENV_PATH, 'LOGTO_APP_ID', web.id);
  envFileSetIfPlaceholder(ENV_PATH, 'LOGTO_APP_SECRET', await appSecret(api, web.id));
  envFileSetIfPlaceholder(ENV_PATH, 'LOGTO_MCP_APP_ID', mcp.id);
  envFileSetIfPlaceholder(ENV_PATH, 'LOGTO_MCP_APP_SECRET', await appSecret(api, mcp.id));
  envFileSetIfPlaceholder(ENV_PATH, 'LOGTO_COOKIE_SECRET', randomBytes(32).toString('base64'));
  if (existsSync(MOBILE_ENV_PATH)) {
    envFileSetIfPlaceholder(MOBILE_ENV_PATH, 'EXPO_PUBLIC_LOGTO_APP_ID', mobile.id);
  }

  await configureSignInExperience(api, await ensureEmailConnector(api));
  if (IS_PRODUCTION) {
    say('NODE_ENV=production — usuários de teste NÃO são criados');
  } else {
    await ensureUser(api, DEMO_USER, 'demo');
    // O seed cria a conta da equipe no banco antes do primeiro login dela, e o
    // `logtoSub` tem de ser este id: com outro, o login dela bateria no e-mail
    // já usado e não entraria.
    envFileSet(ENV_PATH, 'EQUIPE_LOGTO_ID', await ensureUser(api, TEAM_USER, 'da equipe'));
  }

  say('Logto pronto.');
}

main().catch((err: unknown) => {
  console.error(`\x1b[1;31m✗ ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
  process.exit(1);
});
