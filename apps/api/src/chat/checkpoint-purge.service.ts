import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * Apaga o estado que o agente guardou de uma conversa (ADR 023).
 *
 * O checkpointer do agente grava no schema `agent_checkpoint` deste mesmo
 * Postgres, numa thread `{userId}:{conversationId}` (`thread_da_conversa` em
 * `apps/agent/.../chat/checkpointer.py` — os dois lados têm de casar o formato).
 * O `onDelete: Cascade` a partir de `User` **não** alcança essas tabelas, que o
 * Prisma não conhece. Sem esta purga, apagar a conversa ou a conta deixaria a
 * conversa inteira — falas, chamadas de tool e resultados — viva no banco.
 *
 * Por SQL daqui, e não por uma chamada ao agente: a eliminação não pode depender
 * de outro serviço estar no ar, e a conta pode ser apagada numa instância que
 * nem tem agente. Instância sem o schema (o agente nunca subiu) é um no-op.
 */

const TABELAS = ['checkpoint_writes', 'checkpoint_blobs', 'checkpoints'] as const;

@Injectable()
export class CheckpointPurgeService {
  private readonly logger = new Logger(CheckpointPurgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** A thread de uma conversa. */
  async apagarConversa(userId: string, conversationId: string): Promise<void> {
    await this.apagar('thread_id = $1', [`${userId}:${conversationId}`]);
  }

  /**
   * Todas as threads de uma pessoa — pelo prefixo exato, e não por `LIKE`: o `_`
   * é curinga no `LIKE`, e um id com ele casaria com threads de outra pessoa.
   */
  async apagarDoUsuario(userId: string): Promise<void> {
    await this.apagar("split_part(thread_id, ':', 1) = $1", [userId]);
  }

  private async apagar(condicao: string, parametros: string[]): Promise<void> {
    if (!(await this.existe())) return;
    // As três numa transação: uma purga pela metade deixaria o checkpoint sem
    // os blobs de que ele depende, e o agente estouraria ao ler a thread.
    await this.prisma.$transaction(
      TABELAS.map((tabela) =>
        // `$executeRawUnsafe` só pelo nome da tabela, que é uma constante acima;
        // o valor vai sempre como parâmetro.
        this.prisma.$executeRawUnsafe(
          `DELETE FROM "agent_checkpoint"."${tabela}" WHERE ${condicao}`,
          ...parametros,
        ),
      ),
    );
    this.logger.log({ event: 'agent_checkpoint_purged' });
  }

  private async existe(): Promise<boolean> {
    const [linha] = await this.prisma.$queryRaw<{ existe: boolean }[]>`
      SELECT to_regclass('agent_checkpoint.checkpoints') IS NOT NULL AS existe
    `;
    return linha?.existe === true;
  }
}
