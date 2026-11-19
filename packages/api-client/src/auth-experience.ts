/**
 * Cadastro, login e "esqueci minha senha" dentro do app, pela Experience API do
 * Logto (ADR 050) — sem a tela do Logto e sem navegador.
 *
 * O caminho, conferido contra o Logto 1.36 (e as rotas existem no 1.30):
 *
 * 1. `GET /oidc/auth?…&response_mode=form_post` abre uma interação OIDC com PKCE
 *    e deixa o cookie `_interaction` no cookie jar do `fetch` nativo;
 * 2. `PUT /api/experience` escolhe o evento (entrar, cadastrar, recuperar);
 * 3. verificação (senha ou código no e-mail), identificação e perfil;
 * 4. `POST /api/experience/submit` devolve um `redirectTo`, que seguimos (com o
 *    consentimento automático do app próprio no meio) até a página do
 *    `form_post`, que traz `code` e `state` num `<input hidden>`.
 *
 * O `form_post` existe por causa do último passo: com `response_mode=query` o
 * Logto responderia 303 para `fatia://…` ou `exp://…`, e o `fetch` do React
 * Native não segue (nem devolve) redirect para esquema próprio de forma
 * confiável no iOS. Com `form_post` a resposta é 200 com o HTML, igual nos dois.
 *
 * Tudo aqui é função pura sobre um `fetch` injetado: testável sem aparelho.
 * A senha só passa por `fetch` direto para o Logto, por TLS em produção; nada
 * aqui a guarda ou a registra.
 */

export interface PasswordPolicy {
  length: { min: number; max: number };
  characterTypes: { min: number };
  rejects: { pwned: boolean; repetitionAndSequence: boolean; userInfo: boolean; words: string[] };
}

/** O que a página pública do Logto (`/api/.well-known/sign-in-exp`) diz e o app usa. */
export interface PublicSignInExperience {
  socialConnectors?: Array<{ id: string; target: string }>;
  passwordPolicy?: PasswordPolicy;
  signUp?: { identifiers: string[]; password: boolean; verify: boolean };
  forgotPassword?: { email: boolean; phone: boolean };
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  length: { min: 8, max: 256 },
  characterTypes: { min: 1 },
  rejects: { pwned: true, repetitionAndSequence: true, userInfo: true, words: [] },
};

export type SocialTarget = 'google' | 'apple';

/** Google e Apple que o Logto tem configurados; sem conector, o botão some. */
export function socialTargets(exp: PublicSignInExperience): SocialTarget[] {
  const targets = new Set((exp.socialConnectors ?? []).map((c) => c.target));
  return (['google', 'apple'] as const).filter((t) => targets.has(t));
}

/** Erro da Experience API, com o código do Logto (`session.invalid_credentials`…). */
export class ExperienceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly data: unknown = undefined,
  ) {
    super(code);
    this.name = 'ExperienceError';
  }
}

export const NATIVE_SCOPES = ['openid', 'offline_access', 'profile', 'email'];

/**
 * A autorização sem navegador. `prompt=login` ignora sessão que o cookie jar
 * ainda tenha; `consent` libera o refresh token (`offline_access`).
 */
export function buildNativeAuthorizeUrl(params: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  resource: string;
}): string {
  const url = new URL(params.authorizationEndpoint);
  const q = url.searchParams;
  q.set('client_id', params.clientId);
  q.set('redirect_uri', params.redirectUri);
  q.set('response_type', 'code');
  q.set('response_mode', 'form_post');
  q.set('scope', NATIVE_SCOPES.join(' '));
  q.set('code_challenge', params.codeChallenge);
  q.set('code_challenge_method', 'S256');
  q.set('state', params.state);
  q.set('prompt', 'login consent');
  q.set('resource', params.resource);
  return url.toString();
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  '#x27': "'",
  '#x2F': '/',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#?\w+);/g, (match, name: string) => ENTITIES[name] ?? match);
}

function hiddenInput(html: string, name: string): string | null {
  const tag = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`, 'i'))?.[0];
  const value = tag?.match(/value="([^"]*)"/i)?.[1];
  return value === undefined ? null : decodeEntities(value);
}

/**
 * `code` e `state` da página do `form_post`; `null` se a página é outra (o
 * consentimento, por exemplo). Erro do servidor (`error=access_denied`) lança.
 */
export function parseFormPostCallback(html: string): { code: string; state: string } | null {
  if (!/<form[^>]*method="post"/i.test(html)) return null;
  const error = hiddenInput(html, 'error');
  if (error)
    throw new ExperienceError(`oidc.${error}`, 400, hiddenInput(html, 'error_description'));
  const code = hiddenInput(html, 'code');
  if (!code) return null;
  return { code, state: hiddenInput(html, 'state') ?? '' };
}

// ---------------------------------------------------------------------------
// Regras de senha: as do Logto (`@logto/core-kit`, `PasswordPolicyChecker`,
// licença MPL-2.0), portadas para avisar enquanto a pessoa digita. Fica de fora
// só a consulta ao Have I Been Pwned — essa o Logto faz no envio, e a mensagem
// volta por `experienceErrorMessage`.
// ---------------------------------------------------------------------------

export type PasswordIssueCode =
  | 'too_short'
  | 'too_long'
  | 'character_types'
  | 'unsupported_characters'
  | 'pwned'
  | 'restricted.repetition'
  | 'restricted.sequence'
  | 'restricted.user_info'
  | 'restricted.words';

const SYMBOLS = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ ';
const SEQUENCES = [
  '0123456789',
  'abcdefghijklmnopqrstuvwxyz',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  '1qaz',
  '2wsx',
  '3edc',
  '4rfv',
  '5tgb',
  '6yhn',
  '7ujm',
  '8ik',
  '9ol',
];
const THRESHOLD = 3;
/** Quantos caracteres "restritos" a senha tolera antes de ser recusada. */
const TOLERANCE = 3;

function characterTypesOk(password: string, min: number): boolean | 'unsupported' {
  const types = new Set<string>();
  for (const char of password) {
    if (char >= 'a' && char <= 'z') types.add('lower');
    else if (char >= 'A' && char <= 'Z') types.add('upper');
    else if (char >= '0' && char <= '9') types.add('digit');
    else if (SYMBOLS.includes(char)) types.add('symbol');
    else return 'unsupported';
  }
  return types.size >= min;
}

function repetitionLength(s: string): number {
  const first = s[0];
  if (first === undefined) return 0;
  let length = 0;
  for (const char of s) {
    if (char !== first) break;
    length += 1;
  }
  return length >= THRESHOLD ? length : 0;
}

function isSequential(value: string): boolean {
  return SEQUENCES.some((seq) => {
    const reversed = [...seq].reverse().join('');
    return [seq, reversed, seq.toUpperCase(), reversed.toUpperCase()].some((item) =>
      item.includes(value),
    );
  });
}

function sequenceLength(s: string): number {
  let value = '';
  let length = 0;
  for (const char of s) {
    if (!value || isSequential(value + char)) {
      value += char;
      length += 1;
    } else break;
  }
  return length >= THRESHOLD ? length : 0;
}

export interface PasswordUserInfo {
  name?: string;
  email?: string;
  username?: string;
}

function userInfoLength(s: string, info: PasswordUserInfo): number {
  const lower = s.toLowerCase();
  let length = 0;
  const take = (n: number) => {
    if (n > length) length = n;
  };
  const { name, username, email } = info;
  if (name) {
    const joined = name.replace(/\s+/g, '');
    if (lower.startsWith(name.toLowerCase())) take(name.length);
    else {
      if (joined && lower.startsWith(joined.toLowerCase())) take(joined.length);
      for (const word of name.split(' ')) {
        if (word && lower.startsWith(word.toLowerCase())) take(word.length);
      }
    }
  }
  if (username && lower.startsWith(username.toLowerCase())) take(username.length);
  const prefix = email?.split('@')[0];
  if (prefix && lower.startsWith(prefix.toLowerCase())) take(prefix.length);
  return length;
}

function wordLength(s: string, words: string[]): number {
  const lower = s.toLowerCase();
  return words.reduce(
    (max, w) => (w && lower.startsWith(w.toLowerCase()) && w.length > max ? w.length : max),
    0,
  );
}

/** As regras que a senha quebra, na política do Logto. Vazio = pode enviar. */
export function passwordIssues(
  policy: PasswordPolicy,
  password: string,
  info: PasswordUserInfo,
): PasswordIssueCode[] {
  const issues: PasswordIssueCode[] = [];
  if (password.length < policy.length.min) issues.push('too_short');
  else if (password.length > policy.length.max) issues.push('too_long');

  const types = characterTypesOk(password, policy.characterTypes.min);
  if (types === 'unsupported') issues.push('unsupported_characters');
  else if (!types) issues.push('character_types');

  const marked = new Array<boolean>(password.length).fill(false);
  const found = new Set<PasswordIssueCode>();
  const mark = (start: number, length: number, code: PasswordIssueCode) => {
    if (length <= 0) return;
    for (let i = start; i < start + length; i += 1) marked[i] = true;
    found.add(code);
  };
  const { repetitionAndSequence, userInfo, words } = policy.rejects;
  for (let i = 0; i < password.length; i += 1) {
    const rest = password.slice(i);
    if (repetitionAndSequence) {
      mark(i, repetitionLength(rest), 'restricted.repetition');
      mark(i, sequenceLength(rest), 'restricted.sequence');
    }
    if (words.length > 0) mark(i, wordLength(rest, words), 'restricted.words');
    if (userInfo) mark(i, userInfoLength(rest, info), 'restricted.user_info');
  }
  const restricted = marked.filter(Boolean).length;
  if (restricted > Math.max(1, password.length - TOLERANCE)) issues.push(...found);
  return issues;
}

export function passwordIssueMessage(code: PasswordIssueCode, policy: PasswordPolicy): string {
  switch (code) {
    case 'too_short':
      return `A senha precisa ter pelo menos ${policy.length.min} caracteres.`;
    case 'too_long':
      return `A senha pode ter no máximo ${policy.length.max} caracteres.`;
    case 'character_types':
      return `Misture pelo menos ${policy.characterTypes.min} tipos: minúsculas, maiúsculas, números e símbolos.`;
    case 'unsupported_characters':
      return 'Use letras sem acento, números e símbolos comuns (sem acento nem ç).';
    case 'pwned':
      return 'Esta senha já apareceu em vazamentos de outros sites. Escolha outra.';
    case 'restricted.repetition':
      return 'Evite repetir o mesmo caractere (como "aaaa").';
    case 'restricted.sequence':
      return 'Evite sequências (como "1234", "abcd" ou "qwerty").';
    case 'restricted.user_info':
      return 'Não use seu nome ou e-mail como senha.';
    case 'restricted.words':
      return 'Esta senha usa uma palavra que não é aceita.';
  }
}

const MESSAGES: Record<string, string> = {
  'session.invalid_credentials': 'E-mail ou senha incorretos.',
  'verification_code.code_mismatch': 'Código incorreto. Confira o e-mail e tente de novo.',
  'verification_code.expired': 'Este código expirou. Peça outro.',
  'verification_code.exceed_max_try': 'Muitas tentativas com este código. Peça um novo.',
  'verification_code.not_found': 'Este código expirou. Peça outro.',
  'user.email_already_in_use': 'Este e-mail já tem conta. Entre com a sua senha.',
  'user.email_exists_register': 'Este e-mail já tem conta. Entre com a sua senha.',
  'user.user_not_exist': 'Não achamos conta com este e-mail.',
  'user.suspended': 'Esta conta está suspensa.',
  'user.identity_not_exist': 'Não achamos conta com este e-mail.',
  'guard.invalid_input': 'Confira os dados digitados.',
  'connector.not_found': 'Este servidor ainda não envia e-mail. Fale com quem administra a Fatia.',
  'session.not_supported_for_forgot_password':
    'A recuperação de senha não está ligada neste servidor.',
  'user.sign_up_method_not_enabled': 'O cadastro por e-mail não está ligado neste servidor.',
  'user.sign_in_method_not_enabled': 'O login por e-mail não está ligado neste servidor.',
  'request.invalid_input': 'Confira os dados digitados.',
};

const EXPIRED = /session\.(not_found|verification_session_not_found|interaction_not_found)|oidc\./;

/** A mensagem para a tela, em português, de qualquer falha destes fluxos. */
export function experienceErrorMessage(
  err: unknown,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): string {
  if (err instanceof ExperienceError) {
    if (err.status === 429 || /too_many|blocked|exceed/.test(err.code)) {
      return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
    }
    if (err.code === 'password.rejected' && Array.isArray(err.data)) {
      const first = (err.data as Array<{ code?: string }>)[0]?.code?.replace(
        'password_rejected.',
        '',
      );
      if (first) return passwordIssueMessage(first as PasswordIssueCode, policy);
    }
    const known = MESSAGES[err.code];
    if (known) return known;
    if (EXPIRED.test(err.code)) return 'O tempo para concluir acabou. Comece de novo.';
    return 'Não foi possível concluir agora. Tente de novo.';
  }
  if (err instanceof TypeError) return 'Sem conexão com o servidor. Confira a internet.';
  return 'Não foi possível concluir agora. Tente de novo.';
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

type Fetch = typeof fetch;
type Identifier = { type: 'email'; value: string };
export type InteractionEvent = 'SignIn' | 'Register' | 'ForgotPassword';
/** Quantas páginas seguimos depois do submit até achar o `form_post`. */
const MAX_HOPS = 4;

export interface ExperienceClient {
  begin(authorizeUrl: string): Promise<void>;
  start(event: InteractionEvent): Promise<void>;
  verifyPassword(email: string, password: string): Promise<string>;
  sendEmailCode(email: string, event: InteractionEvent): Promise<string>;
  verifyEmailCode(email: string, verificationId: string, code: string): Promise<void>;
  /** `missingProfile` quando o Logto pede mais dado antes de concluir (cadastro). */
  identify(verificationId?: string): Promise<{ missingProfile: string[] }>;
  setPassword(password: string): Promise<void>;
  setName(name: string): Promise<void>;
  resetPassword(password: string): Promise<void>;
  submitAndCollectCode(): Promise<{ code: string; state: string }>;
  submit(): Promise<void>;
}

export function createExperienceClient(opts: {
  endpoint: string;
  fetch?: Fetch;
}): ExperienceClient {
  const base = opts.endpoint.replace(/\/+$/, '');
  const fetchImpl: Fetch = opts.fetch ?? fetch;

  /**
   * O Logto monta `redirectTo` com o próprio `ENDPOINT`, que pode ser um
   * endereço que só existe do lado do servidor (`localhost` no dev). O caminho
   * é o que importa; o endereço é o que o app já usa.
   */
  const sameOrigin = (url: string) => {
    const parsed = new URL(url, base);
    return `${base}${parsed.pathname}${parsed.search}`;
  };

  async function call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; text: string; json: Record<string, unknown> | null }> {
    const res = await fetchImpl(path.startsWith('http') ? path : `${base}${path}`, {
      method,
      // iOS só envia e guarda o cookie da interação com `include`.
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/html',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, unknown> | null;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }
    if (res.status >= 400) {
      const code = typeof json?.code === 'string' ? json.code : `http_${res.status}`;
      throw new ExperienceError(code, res.status, json?.data);
    }
    return { status: res.status, text, json };
  }

  const verificationIdOf = (json: Record<string, unknown> | null): string => {
    const id = json?.verificationId;
    if (typeof id !== 'string') throw new ExperienceError('verification.missing_id', 500);
    return id;
  };

  const email = (value: string): Identifier => ({ type: 'email', value: normalizeEmail(value) });

  return {
    async begin(authorizeUrl) {
      await call('GET', authorizeUrl);
    },
    async start(event) {
      await call('PUT', '/api/experience', { interactionEvent: event });
    },
    async verifyPassword(address, password) {
      const { json } = await call('POST', '/api/experience/verification/password', {
        identifier: email(address),
        password,
      });
      return verificationIdOf(json);
    },
    async sendEmailCode(address, event) {
      const { json } = await call('POST', '/api/experience/verification/verification-code', {
        identifier: email(address),
        interactionEvent: event,
      });
      return verificationIdOf(json);
    },
    async verifyEmailCode(address, verificationId, code) {
      await call('POST', '/api/experience/verification/verification-code/verify', {
        identifier: email(address),
        verificationId,
        code: code.trim(),
      });
    },
    async identify(verificationId) {
      try {
        await call(
          'POST',
          '/api/experience/identification',
          verificationId ? { verificationId } : {},
        );
        return { missingProfile: [] };
      } catch (err) {
        if (err instanceof ExperienceError && err.code === 'user.missing_profile') {
          const missing = (err.data as { missingProfile?: unknown } | undefined)?.missingProfile;
          return { missingProfile: Array.isArray(missing) ? missing.map(String) : [] };
        }
        throw err;
      }
    },
    async setPassword(password) {
      await call('POST', '/api/experience/profile', { type: 'password', value: password });
    },
    async setName(name) {
      await call('POST', '/api/experience/profile', {
        type: 'extraProfile',
        values: { name },
      });
    },
    async resetPassword(password) {
      await call('PUT', '/api/experience/profile/password', { password });
    },
    async submit() {
      await call('POST', '/api/experience/submit');
    },
    async submitAndCollectCode() {
      const { json } = await call('POST', '/api/experience/submit');
      let next = typeof json?.redirectTo === 'string' ? json.redirectTo : null;
      for (let hop = 0; next && hop < MAX_HOPS; hop += 1) {
        const page = await call('GET', sameOrigin(next));
        const callback = parseFormPostCallback(page.text);
        if (callback) return callback;
        // Não é o callback: é o consentimento. O app é próprio (first-party), e
        // a tela do Logto também consente sozinha nesse caso.
        const consent = await call('POST', '/api/interaction/consent', {});
        next = typeof consent.json?.redirectTo === 'string' ? consent.json.redirectTo : null;
      }
      throw new ExperienceError('oidc.callback_not_reached', 500);
    },
  };
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 80);
}

export async function signInWithPassword(
  client: ExperienceClient,
  input: { authorizeUrl: string; email: string; password: string },
): Promise<{ code: string; state: string }> {
  await client.begin(input.authorizeUrl);
  await client.start('SignIn');
  const verificationId = await client.verifyPassword(input.email, input.password);
  await client.identify(verificationId);
  return client.submitAndCollectCode();
}

export interface PendingCode {
  email: string;
  verificationId: string;
}

/** Cadastro, parte 1: abre a interação e manda o código ao e-mail. */
export async function requestSignupCode(
  client: ExperienceClient,
  input: { authorizeUrl: string; email: string },
): Promise<PendingCode> {
  await client.begin(input.authorizeUrl);
  await client.start('Register');
  const verificationId = await client.sendEmailCode(input.email, 'Register');
  return { email: normalizeEmail(input.email), verificationId };
}

/**
 * Cadastro, parte 2, na mesma interação: confere o código, grava senha e nome e
 * conclui. O nome no Logto é cortesia (o perfil da Fatia recebe o nome pelo
 * ID token ou pela tela); se esta versão do Logto recusar `extraProfile`, segue.
 */
export async function completeSignup(
  client: ExperienceClient,
  input: PendingCode & { code: string; password: string; name: string },
): Promise<{ code: string; state: string }> {
  await client.verifyEmailCode(input.email, input.verificationId, input.code);
  const { missingProfile } = await client.identify(input.verificationId);
  if (missingProfile.includes('password')) {
    await client.setPassword(input.password);
  }
  const name = cleanName(input.name);
  if (name) {
    try {
      await client.setName(name);
    } catch (err) {
      if (!(err instanceof ExperienceError) || err.status >= 500) throw err;
    }
  }
  await client.identify();
  return client.submitAndCollectCode();
}

/** "Esqueci minha senha", parte 1. */
export async function requestPasswordResetCode(
  client: ExperienceClient,
  input: { authorizeUrl: string; email: string },
): Promise<PendingCode> {
  await client.begin(input.authorizeUrl);
  await client.start('ForgotPassword');
  const verificationId = await client.sendEmailCode(input.email, 'ForgotPassword');
  return { email: normalizeEmail(input.email), verificationId };
}

/** Parte 2: código e senha nova. Depois disso o app entra com a senha nova. */
export async function completePasswordReset(
  client: ExperienceClient,
  input: PendingCode & { code: string; password: string },
): Promise<void> {
  await client.verifyEmailCode(input.email, input.verificationId, input.code);
  await client.identify(input.verificationId);
  await client.resetPassword(input.password);
  await client.submit();
}
