import type { Request } from 'express';
import { OAuthDiscoveryController } from '../oauth-discovery.controller';
import { OAuthError } from '../oauth-error';

/**
 * Exigências específicas do diretório de conectores da Anthropic (issue #170).
 *
 * A #91 provou que o fluxo OAuth funciona. Este spec cobre o que a doc de
 * `authentication` pede **além** da spec MCP genérica — o que um reviewer
 * encontra ao tentar conectar, ou o que quebra quando o conector ganha tração.
 */

const req = (host = 'api.fat.ia.br') =>
  ({ headers: { host, 'x-forwarded-proto': 'https' }, protocol: 'https' }) as unknown as Request;

describe('exigências do diretório de conectores', () => {
  describe('metadata do protected resource (A3)', () => {
    const controller = new OAuthDiscoveryController();

    it('devolve `resource` igual à URL que o usuário digita, com path', () => {
      // A doc é explícita: tem de bater exatamente com a URL do servidor MCP
      // "as the user enters it". Quem cola `https://api.fat.ia.br/mcp` precisa
      // ver esse mesmo valor aqui — publicar a raiz reprova no review.
      expect(controller.oauthProtectedResource(req()).resource).toBe('https://api.fat.ia.br/mcp');
    });

    it('não devolve o LOGTO_AUDIENCE no lugar do resource', () => {
      // Regressão do bug original: `resource` vinha do audience do Logto, que é
      // outro conceito (o `aud` do JWT) e não tem o path.
      const { resource } = controller.oauthProtectedResource(req());
      expect(resource.endsWith('/mcp')).toBe(true);
    });

    it('respeita o host de trás do proxy', () => {
      expect(controller.oauthProtectedResource(req('outro.exemplo.com')).resource).toBe(
        'https://outro.exemplo.com/mcp',
      );
    });

    it('anuncia o authorization server na raiz, não no /mcp', () => {
      // O recurso protegido tem path; o authorization server não.
      expect(controller.oauthProtectedResource(req()).authorization_servers).toEqual([
        'https://api.fat.ia.br',
      ]);
    });

    it('anuncia PKCE S256 e client sem secret no authorization server', () => {
      const meta = controller.oauthAuthorizationServer(req());
      expect(meta.code_challenge_methods_supported).toEqual(['S256']);
      expect(meta.token_endpoint_auth_methods_supported).toEqual(['none']);
    });
  });

  describe('erros no formato RFC 6749 (A4)', () => {
    // O Claude decide o que fazer pelo campo `error`. Com `invalid_grant` ele
    // descarta o refresh token e refaz o consentimento; com um formato que não
    // reconhece, repete a chamada e falha em laço até alguém desconectar na mão.

    it('serializa como { error, error_description }, não { statusCode, message }', () => {
      const body = new OAuthError('invalid_grant', 'Code already used').getResponse();
      expect(body).toEqual({ error: 'invalid_grant', error_description: 'Code already used' });
    });

    it('usa 400 para erro de grant e 401 para erro de cliente', () => {
      expect(new OAuthError('invalid_grant', 'x').getStatus()).toBe(400);
      expect(new OAuthError('invalid_request', 'x').getStatus()).toBe(400);
      // RFC 6749 §5.2: invalid_client responde 401.
      expect(new OAuthError('invalid_client', 'x').getStatus()).toBe(401);
      expect(new OAuthError('unauthorized_client', 'x').getStatus()).toBe(401);
    });

    it('mantém a descrição legível em `message`, para o log', () => {
      // O HttpException só usa a resposta como `message` quando ela é string.
      // Com o objeto da RFC, `message` viraria "Auth Error" — e é justamente no
      // log e na stack trace que se precisa saber o que aconteceu.
      expect(new OAuthError('invalid_grant', 'Code already used').message).toBe(
        'Code already used',
      );
    });

    it('não vaza detalhe interno na descrição', () => {
      const body = new OAuthError('invalid_grant', 'Code expired').getResponse() as {
        error_description: string;
      };
      expect(body.error_description).not.toMatch(/prisma|sql|stack|at .*\.ts:/i);
    });
  });
});
