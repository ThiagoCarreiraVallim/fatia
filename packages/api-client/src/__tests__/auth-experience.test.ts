import { describe, expect, it } from 'vitest';
import {
  ExperienceError,
  buildNativeAuthorizeUrl,
  completePasswordReset,
  completeSignup,
  createExperienceClient,
  experienceErrorMessage,
  parseFormPostCallback,
  passwordIssueMessage,
  passwordIssues,
  requestPasswordResetCode,
  requestSignupCode,
  signInWithPassword,
  socialTargets,
  type PasswordPolicy,
} from '../auth-experience';

const POLICY: PasswordPolicy = {
  length: { min: 8, max: 256 },
  characterTypes: { min: 1 },
  rejects: { pwned: true, repetitionAndSequence: true, userInfo: true, words: [] },
};

const AUTHORIZE = 'http://logto.test/oidc/auth?client_id=app';
const FORM_POST = `<!DOCTYPE html><html><head><title>Submitting Callback</title></head><body>
<form method="post" action="fatia://auth/callback">
<input type="hidden" name="code" value="abc-123_x"/>
<input type="hidden" name="state" value="st&amp;1"/>
<input type="hidden" name="iss" value="http://logto.test/oidc"/>
</form></body></html>`;

interface Call {
  method: string;
  url: string;
  body: unknown;
  credentials: RequestCredentials | undefined;
}

type Reply = { status: number; body?: unknown; text?: string };

/**
 * Um Logto de mentira: responde por "MÉTODO caminho" e grava as chamadas. O
 * fetch do app segue redirects sozinho, então cada resposta aqui já é a do fim
 * da cadeia, como no aparelho.
 */
function fakeLogto(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const queues = new Map(
    Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]),
  );
  const fetchImpl = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const key = `${method} ${url.pathname}`;
    calls.push({
      method,
      url: input,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      credentials: init.credentials,
    });
    const queue = queues.get(key);
    const reply = queue && queue.length > 1 ? queue.shift()! : queue?.[0];
    if (!reply) throw new Error(`rota inesperada: ${key}`);
    const text = reply.text ?? (reply.body === undefined ? '' : JSON.stringify(reply.body));
    return new Response(text || null, { status: reply.status });
  };
  return { calls, fetch: fetchImpl as unknown as typeof fetch };
}

describe('buildNativeAuthorizeUrl', () => {
  it('pede form_post, PKCE S256, os escopos de perfil e força o login', () => {
    const url = new URL(
      buildNativeAuthorizeUrl({
        authorizationEndpoint: 'http://logto.test/oidc/auth',
        clientId: 'app',
        redirectUri: 'fatia://auth/callback',
        codeChallenge: 'chal',
        state: 'st',
        resource: 'https://api.fatia.local',
      }),
    );
    const p = url.searchParams;
    expect(p.get('response_mode')).toBe('form_post');
    expect(p.get('response_type')).toBe('code');
    expect(p.get('code_challenge')).toBe('chal');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('scope')).toBe('openid offline_access profile email');
    expect(p.get('prompt')).toBe('login consent');
    expect(p.get('resource')).toBe('https://api.fatia.local');
    expect(p.get('redirect_uri')).toBe('fatia://auth/callback');
  });
});

describe('parseFormPostCallback', () => {
  it('lê code e state do HTML do form_post, desfazendo entidades', () => {
    expect(parseFormPostCallback(FORM_POST)).toEqual({ code: 'abc-123_x', state: 'st&1' });
  });

  it('devolve null quando a página não é o callback', () => {
    expect(parseFormPostCallback('<html><body>consent</body></html>')).toBeNull();
  });

  it('lê também o erro devolvido pelo servidor', () => {
    const html = FORM_POST.replace('name="code" value="abc-123_x"', 'name="error" value="access_denied"');
    expect(() => parseFormPostCallback(html)).toThrow(ExperienceError);
  });
});

describe('passwordIssues — as mesmas regras do Logto, sem a consulta de vazamento', () => {
  it('aceita uma senha boa', () => {
    expect(passwordIssues(POLICY, 'Xq7!pera-uva-42', { email: 'maria@x.com', name: 'Maria' })).toEqual(
      [],
    );
  });

  it('acusa tamanho mínimo e máximo', () => {
    expect(passwordIssues(POLICY, 'ab1', {})).toContain('too_short');
    expect(passwordIssues({ ...POLICY, length: { min: 8, max: 10 } }, 'abcdefghijkx9', {})).toContain(
      'too_long',
    );
  });

  it('recusa acento e cedilha, que o Logto não aceita', () => {
    expect(passwordIssues(POLICY, 'coração-forte9', {})).toContain('unsupported_characters');
  });

  it('exige os tipos de caractere da política', () => {
    const policy = { ...POLICY, characterTypes: { min: 3 } };
    expect(passwordIssues(policy, 'somenteletras', {})).toContain('character_types');
    expect(passwordIssues(policy, 'Letras-e-9', {})).toEqual([]);
  });

  it('recusa senha feita quase só de repetição ou sequência', () => {
    expect(passwordIssues(POLICY, 'aaaaaaaa1', {})).toContain('restricted.repetition');
    expect(passwordIssues(POLICY, '12345678', {})).toContain('restricted.sequence');
    expect(passwordIssues(POLICY, 'qwertyuiop', {})).toContain('restricted.sequence');
  });

  it('tolera um trecho de sequência numa senha que não é só isso', () => {
    expect(passwordIssues(POLICY, 'gato-azul-123', {})).toEqual([]);
  });

  it('recusa nome ou e-mail como senha', () => {
    expect(passwordIssues(POLICY, 'mariasilva1', { name: 'Maria Silva' })).toContain(
      'restricted.user_info',
    );
    expect(passwordIssues(POLICY, 'joao.p1990', { email: 'joao.p1990@x.com' })).toContain(
      'restricted.user_info',
    );
  });

  it('desliga as regras que a política desliga', () => {
    const lax = {
      ...POLICY,
      rejects: { pwned: false, repetitionAndSequence: false, userInfo: false, words: [] },
    };
    expect(passwordIssues(lax, '12345678', { name: '12345678' })).toEqual([]);
  });
});

describe('mensagens em português', () => {
  it('explica cada regra da senha', () => {
    expect(passwordIssueMessage('too_short', POLICY)).toBe(
      'A senha precisa ter pelo menos 8 caracteres.',
    );
    expect(passwordIssueMessage('pwned', POLICY)).toMatch(/vazamento/);
    expect(passwordIssueMessage('unsupported_characters', POLICY)).toMatch(/acento/);
  });

  it('traduz os erros do Logto', () => {
    expect(experienceErrorMessage(new ExperienceError('session.invalid_credentials', 422))).toBe(
      'E-mail ou senha incorretos.',
    );
    expect(
      experienceErrorMessage(new ExperienceError('verification_code.code_mismatch', 400)),
    ).toMatch(/Código incorreto/);
    expect(experienceErrorMessage(new ExperienceError('user.email_already_in_use', 422))).toMatch(
      /já tem conta/,
    );
    expect(
      experienceErrorMessage(
        new ExperienceError('password.rejected', 422, [{ code: 'password_rejected.pwned' }]),
        POLICY,
      ),
    ).toMatch(/vazamento/);
    expect(experienceErrorMessage(new ExperienceError('qualquer.coisa', 500))).toBe(
      'Não foi possível concluir agora. Tente de novo.',
    );
    expect(experienceErrorMessage(new ExperienceError('x', 429))).toMatch(/Muitas tentativas/);
    expect(experienceErrorMessage(new TypeError('Network request failed'))).toMatch(/conexão/);
  });
});

describe('socialTargets', () => {
  it('lista só os conectores sociais configurados no Logto', () => {
    expect(
      socialTargets({
        socialConnectors: [
          { id: 'a', target: 'google' },
          { id: 'b', target: 'github' },
        ],
      }),
    ).toEqual(['google']);
    expect(socialTargets({})).toEqual([]);
  });
});

describe('fluxos da Experience API', () => {
  const ok = { status: 204 };
  const submit = { status: 200, body: { redirectTo: 'http://logto.test/oidc/auth/uid1' } };

  it('entra com e-mail e senha, passando pelo consentimento, e devolve o code', async () => {
    const logto = fakeLogto({
      'GET /oidc/auth': { status: 200, text: '<html>sign-in</html>' },
      'PUT /api/experience': ok,
      'POST /api/experience/verification/password': { status: 200, body: { verificationId: 'v1' } },
      'POST /api/experience/identification': ok,
      'POST /api/experience/submit': submit,
      'GET /oidc/auth/uid1': { status: 200, text: '<html>consent</html>' },
      'POST /api/interaction/consent': {
        status: 200,
        body: { redirectTo: 'http://logto.test/oidc/auth/uid2' },
      },
      'GET /oidc/auth/uid2': { status: 200, text: FORM_POST },
    });
    const client = createExperienceClient({ endpoint: 'http://logto.test/', fetch: logto.fetch });

    const result = await signInWithPassword(client, {
      authorizeUrl: AUTHORIZE,
      email: ' Maria@X.com ',
      password: 'segredo',
    });

    expect(result).toEqual({ code: 'abc-123_x', state: 'st&1' });
    expect(logto.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'GET /oidc/auth',
      'PUT /api/experience',
      'POST /api/experience/verification/password',
      'POST /api/experience/identification',
      'POST /api/experience/submit',
      'GET /oidc/auth/uid1',
      'POST /api/interaction/consent',
      'GET /oidc/auth/uid2',
    ]);
    expect(logto.calls[1]!.body).toEqual({ interactionEvent: 'SignIn' });
    expect(logto.calls[2]!.body).toEqual({
      identifier: { type: 'email', value: 'maria@x.com' },
      password: 'segredo',
    });
    expect(logto.calls[3]!.body).toEqual({ verificationId: 'v1' });
    // iOS só manda o cookie da interação com credentials: 'include'.
    expect(logto.calls.every((c) => c.credentials === 'include')).toBe(true);
  });

  it('senha errada vira ExperienceError com o código do Logto', async () => {
    const logto = fakeLogto({
      'GET /oidc/auth': { status: 200, text: '' },
      'PUT /api/experience': ok,
      'POST /api/experience/verification/password': {
        status: 422,
        body: { code: 'session.invalid_credentials', message: 'Incorrect' },
      },
    });
    const client = createExperienceClient({ endpoint: 'http://logto.test', fetch: logto.fetch });
    await expect(
      signInWithPassword(client, { authorizeUrl: AUTHORIZE, email: 'a@b.co', password: 'x' }),
    ).rejects.toMatchObject({ code: 'session.invalid_credentials', status: 422 });
  });

  it('cadastra: código no e-mail, depois senha e nome, e devolve o code', async () => {
    const logto = fakeLogto({
      'GET /oidc/auth': { status: 200, text: '' },
      'PUT /api/experience': ok,
      'POST /api/experience/verification/verification-code': {
        status: 200,
        body: { verificationId: 'c1' },
      },
      'POST /api/experience/verification/verification-code/verify': {
        status: 200,
        body: { verificationId: 'c1' },
      },
      'POST /api/experience/identification': [
        {
          status: 422,
          body: { code: 'user.missing_profile', data: { missingProfile: ['password'] } },
        },
        { status: 201 },
      ],
      'POST /api/experience/profile': ok,
      'POST /api/experience/submit': submit,
      'GET /oidc/auth/uid1': { status: 200, text: FORM_POST },
    });
    const client = createExperienceClient({ endpoint: 'http://logto.test', fetch: logto.fetch });

    const pending = await requestSignupCode(client, { authorizeUrl: AUTHORIZE, email: 'ana@x.com' });
    expect(pending).toEqual({ email: 'ana@x.com', verificationId: 'c1' });

    const result = await completeSignup(client, {
      ...pending,
      code: '123456',
      password: 'Xq7!pera-uva-42',
      name: '  Ana   Souza ',
    });
    expect(result.code).toBe('abc-123_x');

    const bodies = logto.calls.map((c) => [`${c.method} ${new URL(c.url).pathname}`, c.body]);
    expect(bodies).toContainEqual(['PUT /api/experience', { interactionEvent: 'Register' }]);
    expect(bodies).toContainEqual([
      'POST /api/experience/verification/verification-code',
      { identifier: { type: 'email', value: 'ana@x.com' }, interactionEvent: 'Register' },
    ]);
    expect(bodies).toContainEqual([
      'POST /api/experience/verification/verification-code/verify',
      { identifier: { type: 'email', value: 'ana@x.com' }, verificationId: 'c1', code: '123456' },
    ]);
    expect(bodies).toContainEqual([
      'POST /api/experience/profile',
      { type: 'password', value: 'Xq7!pera-uva-42' },
    ]);
    expect(bodies).toContainEqual([
      'POST /api/experience/profile',
      { type: 'extraProfile', values: { name: 'Ana Souza' } },
    ]);
  });

  it('cadastro segue mesmo se o Logto recusar o nome no perfil (versão sem o campo)', async () => {
    const logto = fakeLogto({
      'POST /api/experience/verification/verification-code/verify': {
        status: 200,
        body: { verificationId: 'c1' },
      },
      'POST /api/experience/identification': [
        {
          status: 422,
          body: { code: 'user.missing_profile', data: { missingProfile: ['password'] } },
        },
        { status: 201 },
      ],
      'POST /api/experience/profile': [
        { status: 204 },
        { status: 400, body: { code: 'guard.invalid_input' } },
      ],
      'POST /api/experience/submit': submit,
      'GET /oidc/auth/uid1': { status: 200, text: FORM_POST },
    });
    const client = createExperienceClient({ endpoint: 'http://logto.test', fetch: logto.fetch });
    const result = await completeSignup(client, {
      email: 'ana@x.com',
      verificationId: 'c1',
      code: '123456',
      password: 'Xq7!pera-uva-42',
      name: 'Ana',
    });
    expect(result.code).toBe('abc-123_x');
  });

  it('esqueci a senha: código, nova senha e submit sem redirect', async () => {
    const logto = fakeLogto({
      'GET /oidc/auth': { status: 200, text: '' },
      'PUT /api/experience': ok,
      'POST /api/experience/verification/verification-code': {
        status: 200,
        body: { verificationId: 'r1' },
      },
      'POST /api/experience/verification/verification-code/verify': {
        status: 200,
        body: { verificationId: 'r1' },
      },
      'POST /api/experience/identification': ok,
      'PUT /api/experience/profile/password': ok,
      'POST /api/experience/submit': { status: 204 },
    });
    const client = createExperienceClient({ endpoint: 'http://logto.test', fetch: logto.fetch });
    const pending = await requestPasswordResetCode(client, {
      authorizeUrl: AUTHORIZE,
      email: 'ana@x.com',
    });
    await completePasswordReset(client, { ...pending, code: '654321', password: 'Nova!senha-77x' });

    const bodies = logto.calls.map((c) => [`${c.method} ${new URL(c.url).pathname}`, c.body]);
    expect(bodies).toContainEqual(['PUT /api/experience', { interactionEvent: 'ForgotPassword' }]);
    expect(bodies).toContainEqual([
      'PUT /api/experience/profile/password',
      { password: 'Nova!senha-77x' },
    ]);
    expect(bodies[bodies.length - 1]![0]).toBe('POST /api/experience/submit');
  });

  it('segue o redirectTo pelo endereço que o app usa, não pelo ENDPOINT interno do Logto', async () => {
    const logto = fakeLogto({
      'POST /api/experience/submit': {
        status: 200,
        body: { redirectTo: 'http://localhost:3001/oidc/auth/uid1?x=1' },
      },
      'GET /oidc/auth/uid1': { status: 200, text: FORM_POST },
    });
    const client = createExperienceClient({
      endpoint: 'http://192.168.0.10:3001',
      fetch: logto.fetch,
    });
    await client.submitAndCollectCode();
    expect(logto.calls[1]!.url).toBe('http://192.168.0.10:3001/oidc/auth/uid1?x=1');
  });

  it('desiste depois de poucas voltas se o Logto nunca devolver o callback', async () => {
    const logto = fakeLogto({
      'POST /api/experience/submit': submit,
      'GET /oidc/auth/uid1': { status: 200, text: '<html>consent</html>' },
      'POST /api/interaction/consent': {
        status: 200,
        body: { redirectTo: 'http://logto.test/oidc/auth/uid1' },
      },
    });
    const client = createExperienceClient({ endpoint: 'http://logto.test', fetch: logto.fetch });
    await expect(client.submitAndCollectCode()).rejects.toBeInstanceOf(ExperienceError);
  });
});
