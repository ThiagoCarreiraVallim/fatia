import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
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
   * **Falha de escrita da trilha derruba a leitura** (#155). A versão anterior
   * engolia o erro para "não derrubar o painel do profissional", e o resultado
   * era o pior possível: o profissional lia o histórico de saúde da aluna e a
   * linha que registraria isso nunca existia — sem nada na resposta, e sem nada
   * na trilha que o titular consulta. Um profissional receber erro é melhor do
   * que um titular perder o registro de que foi lido.
   *
   * O erro sobe como `503` e **não** como a recusa comum: quem chamou não pode
   * confundir "não pude registrar" com "não autorizado", e o log da aplicação
   * guarda o motivo real. Fica uma diferença observável — associação
   * inexistente continua respondendo a recusa de sempre, porque ali não há
   * titular a quem atribuir a tentativa e nada é escrito. Explorá-la exigiria
   * derrubar *só* a tabela da trilha, e durante essa janela toda leitura de
   * associação existente falha do mesmo jeito; é preço menor do que a trilha
   * sumir em silêncio no dia a dia.
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
      // Mensagem genérica: o detalhe do banco fica no log, não na resposta.
      throw new ServiceUnavailableException('Não foi possível registrar o acesso');
    }
  }
}
