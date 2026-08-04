import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

/**
 * Rate limit da rota de reconhecimento por foto (#139), chaveado por **usuário**.
 *
 * O `ThrottlerModule` está montado no `AppModule`, mas nunca foi registrado como
 * `APP_GUARD` — o único guard global do projeto é o de autenticação. Sem este
 * guard aqui, a rota de inferência não tinha teto **nenhum**: um token válido em
 * laço dispara inferência paga sem limite, e não há `AiUsage` para cobrar depois
 * (a cota é a #135, e depende de tabela que não existe na `main`). Um teto por
 * rota é a mitigação barata enquanto a cota não vem.
 *
 * Por usuário e não por IP porque o custo é por usuário: atrás de um CGNAT ou de
 * um proxy corporativo, chavear por IP faria uma pessoa consumir o teto de todas
 * as outras — negação de serviço acidental numa funcionalidade que já degrada
 * para o registro manual.
 *
 * `req.user` já está populado quando este guard roda: o guard global de
 * autenticação corre antes dos guards de rota. É a mesma mecânica do
 * `McpThrottlerGuard`, que continua separado de propósito — ele tem o `/mcp` como
 * contexto e um teto diferente, e juntar os dois só para não repetir seis linhas
 * acoplaria dois limites que não têm motivo para mudar juntos.
 */
@Injectable()
export class InferenceThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    const user = (req as Request & { user?: CurrentUserPayload }).user;
    return Promise.resolve(user?.id ?? req.ip ?? 'anon');
  }
}
