import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../common/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O check toca o Postgres de propósito.
   *
   * O passo 10 do runbook de desastre (`docs/OPERATIONS.md`) usa este endpoint como smoke test
   * logo depois de restaurar o dump. Um `{ status: 'ok' }` fixo passaria com o banco fora do ar,
   * que é exatamente o cenário que o runbook está tentando descartar.
   */
  @Public()
  @Get('health')
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // A causa não sai na resposta: o endpoint é público e o erro do driver carrega host,
      // porta e nome do banco.
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
        timestamp: new Date().toISOString(),
      });
    }

    return { status: 'ok', database: 'up', timestamp: new Date().toISOString() };
  }
}
