import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../health.controller';
import type { PrismaService } from '../../common/prisma.service';

/**
 * O `/health` já respondeu `{ status: 'ok' }` fixo, sem tocar em nada.
 *
 * Isso não é apenas incompleto — é um monitor que mente, e o custo aparece no pior momento
 * possível. O passo 10 do runbook de desastre (`docs/OPERATIONS.md`) manda dar `curl` neste
 * endpoint como smoke test **logo depois de restaurar o dump**, para confirmar que a stack
 * voltou. Com a resposta fixa, aquele `curl` retornava 200 mesmo com o Postgres fora do ar, e
 * o runbook seguia para "confirmar o TLS" achando que o banco estava de pé.
 *
 * O que este spec protege, portanto, não é o caminho feliz — é o caminho de falha. Um refactor
 * que volte a responder 200 incondicionalmente tem que quebrar aqui.
 */
describe('HealthController', () => {
  /** Dobra só do que o controller usa; o PrismaClient inteiro é irrelevante aqui. */
  function build(queryRaw: jest.Mock) {
    return new HealthController({ $queryRaw: queryRaw } as unknown as PrismaService);
  }

  it('consulta o banco de verdade antes de responder ok', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

    const result = await build(queryRaw).check();

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('falha com 503 quando o banco está fora — não responde ok', async () => {
    const queryRaw = jest.fn().mockRejectedValue(new Error("Can't reach database server"));

    // O caso que o endpoint anterior deixava passar: sem isto, o smoke test do runbook de
    // desastre aprova uma restauração que não restaurou nada.
    await expect(build(queryRaw).check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('não vaza a mensagem do driver na resposta pública', async () => {
    // A rota é `@Public()`. O erro do Prisma carrega host, porta e nome do banco na mensagem,
    // e devolver isso a quem não está autenticado entrega topologia de graça.
    const queryRaw = jest
      .fn()
      .mockRejectedValue(new Error('Can not reach database server at db-prod-01:5432'));

    const error = await build(queryRaw)
      .check()
      .catch((e: ServiceUnavailableException) => e);

    const body = JSON.stringify((error as ServiceUnavailableException).getResponse());
    expect(body).not.toContain('db-prod-01');
    expect(body).not.toContain('5432');
    expect(body).toContain('down');
  });
});
