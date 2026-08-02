import { Injectable, Logger } from '@nestjs/common';
import type { ShareScope } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';

export interface AccessAuditEntry {
  /** Nulo na negativa: não havia vínculo a citar. */
  linkId: string | null;
  professionalId: string;
  subjectUserId: string;
  scope: ShareScope;
  /** Vocabulário do produto: "list_workout_sessions", "get_student_progress". */
  action: string;
  denied: boolean;
}

/**
 * Trilha de "quem leu o dado de quem, quando" — a única do produto (ADR 014).
 *
 * Só o `ProfessionalAccessService` escreve aqui. Registrar de vários lugares
 * garantiria, com o tempo, um caminho de leitura sem registro.
 */
@Injectable()
export class AccessAuditService {
  private readonly logger = new Logger(AccessAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra a tentativa, autorizada ou não.
   *
   * Falha de escrita da trilha **não** derruba a requisição: um erro aqui não
   * pode virar negação de serviço no painel do profissional, e a decisão de
   * autorização já foi tomada por quem chamou. O erro vai para o log da
   * aplicação para não sumir em silêncio.
   */
  async record(entry: AccessAuditEntry): Promise<void> {
    try {
      await this.prisma.professionalAccessLog.create({ data: entry });
    } catch (err: unknown) {
      this.logger.error({
        event: 'professional_access_log_write_failed',
        action: entry.action,
        denied: entry.denied,
        professionalId: entry.professionalId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
