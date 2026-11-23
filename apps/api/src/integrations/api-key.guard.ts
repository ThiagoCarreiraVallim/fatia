import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiKeyService, type ApiKeyContext } from './api-key.service';

export type ApiKeyRequest = Request & { apiKey?: ApiKeyContext };

/**
 * A porta da API das integrações (#413): a chave no `Authorization: Bearer`,
 * conferida a cada chamada (revogar vale na hora). Sem login do Fatia: a rota
 * é `@Public()` para o guarda de JWT, e este guarda é quem barra.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeyService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ApiKeyRequest>();
    const auth = req.headers.authorization;
    const raw = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
    req.apiKey = await this.keys.authenticate(raw);
    return true;
  }
}

/**
 * Teto por **chave** por minuto, além da cota do mês: um laço num Zap não
 * queima a cota da comunidade em minutos. Roda depois do `ApiKeyGuard`.
 */
@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    const key = (req as ApiKeyRequest).apiKey;
    return Promise.resolve(key ? `apikey:${key.keyId}` : (req.ip ?? 'anon'));
  }
}
