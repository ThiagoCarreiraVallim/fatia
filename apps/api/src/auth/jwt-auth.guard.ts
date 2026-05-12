import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtValidationService } from './jwt-validation.service';
import { UserProvisioningService } from './user-provisioning.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly validation: JwtValidationService,
    private readonly provisioning: UserProvisioningService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const token = this.extractToken(req);
    if (!token) {
      this.setChallenge(req, res);
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.validation.verify(token);
      const user = await this.provisioning.provision(payload);
      (req as Request & { user: CurrentUserPayload }).user = user;
      return true;
    } catch (err) {
      this.setChallenge(req, res, 'invalid_token');
      throw err;
    }
  }

  private setChallenge(req: Request, res: Response, error?: string) {
    const proto =
      (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    if (!host) return;
    const resourceMetadata = `${proto}://${host}/.well-known/oauth-protected-resource`;
    const parts = [`Bearer resource_metadata="${resourceMetadata}"`];
    if (error) parts.push(`error="${error}"`);
    res.setHeader('WWW-Authenticate', parts.join(', '));
  }

  private extractToken(req: Request): string | null {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
    return null;
  }
}
