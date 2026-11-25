import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/** O uso por chave fica 90 dias (DATA_RETENTION.md). */
export const API_CALL_RETENTION_DAYS = 90;
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Apaga as linhas de uso das chaves com mais de 90 dias, de 6 em 6 horas. */
@Injectable()
export class ApiCallRetention implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApiCallRetention.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const run = () =>
      void this.purge(new Date()).catch((err: unknown) =>
        this.logger.warn({ err }, 'Falha ao apagar o uso antigo das chaves de API'),
      );
    this.timer = setInterval(run, PURGE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async purge(now: Date): Promise<number> {
    const limite = new Date(now.getTime() - API_CALL_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.groupApiCall.deleteMany({ where: { at: { lt: limite } } });
    return count;
  }
}
