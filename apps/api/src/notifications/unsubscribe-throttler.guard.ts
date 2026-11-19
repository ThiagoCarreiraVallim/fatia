import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Teto do descadastro do comunicado contado **por link** (#398). O IP não
 * serve: a API não confia no `x-forwarded-for` e a página da web chama a API
 * pelo servidor, então todo mundo chegaria com o mesmo IP. O balde é a pessoa
 * que o token nomeia (a parte antes do ponto), só como hash: abusar de um link
 * não trava o de outra pessoa. Um token forjado só gasta o próprio balde e
 * cai na assinatura.
 */
@Injectable()
export class UnsubscribeThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    const doCorpo = (req.body as { t?: unknown } | undefined)?.t;
    const daQuery = req.query?.t;
    const t = typeof doCorpo === 'string' ? doCorpo : typeof daQuery === 'string' ? daQuery : '';
    const pessoa = t.split('.')[0] ?? '';
    return Promise.resolve(
      `unsub:${createHash('sha256').update(pessoa).digest('hex').slice(0, 32)}`,
    );
  }
}
