import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OAuthError } from './oauth-error';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { OAuthFacadeService } from './oauth-facade.service';

// Limite próprio e generoso: o egress da Anthropic é uma faixa de IP
// compartilhada por todos os usuários do conector, então o balde padrão de
// 100/min por IP seria estourado pelo tráfego legítimo agregado.
@Throttle({ oauth: { ttl: 60_000, limit: 600 } })
@Controller('oauth')
export class OAuthFacadeController {
  constructor(private readonly facade: OAuthFacadeService) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  async register(
    @Body() body: { redirect_uris?: unknown; client_name?: unknown; [k: string]: unknown },
  ) {
    const redirectUris = Array.isArray(body.redirect_uris)
      ? (body.redirect_uris as unknown[]).filter((u): u is string => typeof u === 'string')
      : [];
    const clientName = typeof body.client_name === 'string' ? body.client_name : undefined;
    return this.facade.registerClient({ redirectUris, clientName });
  }

  @Public()
  @Get('authorize')
  async authorize(
    @Req() req: Request,
    @Res() res: Response,
    @Query('response_type') responseType: string,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('state') state: string | undefined,
    @Query('scope') scope: string | undefined,
    @Query('resource') resource: string | undefined,
    @Query('code_challenge') codeChallenge: string,
    @Query('code_challenge_method') codeChallengeMethod: string,
  ) {
    if (responseType !== 'code')
      throw new OAuthError('invalid_request', 'Only response_type=code supported');
    if (!clientId) throw new OAuthError('invalid_request', 'client_id required');
    if (!redirectUri) throw new OAuthError('invalid_request', 'redirect_uri required');
    if (codeChallengeMethod !== 'S256') {
      throw new OAuthError('invalid_request', 'Only code_challenge_method=S256 supported');
    }
    const callback = this.callbackUrl(req);
    const { logtoAuthorizeUrl } = await this.facade.startAuthorization(
      {
        clientId,
        redirectUri,
        clientState: state,
        clientCodeChallenge: codeChallenge,
        scope,
        resource,
      },
      callback,
    );
    res.redirect(302, logtoAuthorizeUrl);
  }

  @Public()
  @Get('callback')
  async callback(
    @Res() res: Response,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
  ) {
    if (error) {
      throw new OAuthError(
        'invalid_grant',
        `Authorization failed: ${error} ${errorDescription ?? ''}`,
      );
    }
    if (!code || !state) throw new OAuthError('invalid_grant', 'Missing code or state');
    const { redirectUrl } = await this.facade.handleCallback(state, code);
    res.redirect(302, redirectUrl);
  }

  @Public()
  @Post('token')
  @HttpCode(200)
  async token(
    @Req() req: Request,
    @Body()
    body: {
      grant_type?: string;
      code?: string;
      redirect_uri?: string;
      client_id?: string;
      code_verifier?: string;
      refresh_token?: string;
      resource?: string;
      scope?: string;
    },
  ) {
    if (body.grant_type === 'authorization_code') {
      if (!body.code || !body.redirect_uri || !body.client_id || !body.code_verifier) {
        throw new OAuthError('invalid_request', 'Missing parameters for authorization_code grant');
      }
      return this.facade.exchangeCode(
        {
          code: body.code,
          redirectUri: body.redirect_uri,
          clientId: body.client_id,
          codeVerifier: body.code_verifier,
        },
        this.callbackUrl(req),
      );
    }
    if (body.grant_type === 'refresh_token') {
      if (!body.refresh_token) throw new OAuthError('invalid_request', 'refresh_token required');
      return this.facade.refreshToken({
        refreshToken: body.refresh_token,
        resource: body.resource,
        scope: body.scope,
      });
    }
    throw new OAuthError(
      'unsupported_grant_type',
      `Unsupported grant_type: ${body.grant_type ?? '(ausente)'}`,
    );
  }

  private callbackUrl(req: Request): string {
    const proto =
      (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    return `${proto}://${host}/oauth/callback`;
  }
}
