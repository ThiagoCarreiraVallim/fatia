import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { CurrentUserPayload } from './decorators/current-user.decorator';

/**
 * Teto por **usuário** (e não por IP) para rotas autenticadas que custam algo
 * do lado de fora, como abrir checkout no provedor de pagamento. Mesma mecânica
 * do `InferenceThrottlerGuard`: `req.user` já vem do guard global.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    const user = (req as Request & { user?: CurrentUserPayload }).user;
    return Promise.resolve(user?.id ?? req.ip ?? 'anon');
  }
}
