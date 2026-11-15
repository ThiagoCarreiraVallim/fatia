import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Teto do download público da exportação contado **por link**. O IP não serve:
 * a API não confia no `x-forwarded-for` (ver `log-serializers.ts`), então todo
 * pedido chega com o IP do Traefik. O token entra só como hash no balde.
 */
@Injectable()
export class ExportTokenThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    const token = typeof req.params?.token === 'string' ? req.params.token : '';
    return Promise.resolve(
      `export:${createHash('sha256').update(token).digest('hex').slice(0, 32)}`,
    );
  }
}
