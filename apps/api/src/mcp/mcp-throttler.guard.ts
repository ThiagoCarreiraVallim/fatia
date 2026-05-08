import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

/**
 * Rate limit por usuário (não por IP). McpAuthGuard popula `req.user` antes
 * deste guard rodar, então `getTracker` consegue chavear por userId.
 */
@Injectable()
export class McpThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    const user = (req as Request & { user?: CurrentUserPayload }).user;
    return Promise.resolve(user?.id ?? req.ip ?? 'anon');
  }
}
