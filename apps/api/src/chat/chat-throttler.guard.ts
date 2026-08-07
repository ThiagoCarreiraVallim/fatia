import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

/**
 * Teto de turnos de chat por **usuário** e janela.
 *
 * Chaveado por usuário, e não por IP, pela mesma razão do `/mcp` e do
 * reconhecimento por foto: o custo é por pessoa, e atrás de um CGNAT o teto por
 * IP faria uma consumir o limite de todas.
 *
 * Não substitui a cota da #135, e nem tenta: a cota mede **dinheiro** na janela
 * do dia e é ela quem protege a margem. Este guard corta o laço automatizado nos
 * primeiros segundos, antes de sessenta requisições virarem sessenta inferências
 * cujo custo só apareceria na soma do dia seguinte.
 */
@Injectable()
export class ChatThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    const user = (req as Request & { user?: CurrentUserPayload }).user;
    return Promise.resolve(user?.id ?? req.ip ?? 'anon');
  }
}
