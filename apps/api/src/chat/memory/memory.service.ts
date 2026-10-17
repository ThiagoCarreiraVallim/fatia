import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

/**
 * O que o assistente do chat guarda sobre a pessoa, a pedido dela.
 *
 * Os tetos existem porque toda memória entra em **todo** prompt do chat: acima de
 * algumas dezenas, a lista deixa de ser "o que importa lembrar" e vira um segundo
 * histórico pago a cada mensagem. O agente recusa acima do mesmo teto
 * (`ChatRequest.memories` em `apps/agent/.../api.py`).
 */
export const TETO_DE_MEMORIAS = 50;
export const TETO_DA_MEMORIA = 500;

@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(userId: string) {
    return this.prisma.userMemory.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, content: true, createdAt: true },
    });
  }

  async lembrar(userId: string, conteudo: string) {
    const texto = conteudo.replace(/\s+/g, ' ').trim();
    if (!texto) throw new BadRequestException('A memória não pode ser vazia.');
    if (texto.length > TETO_DA_MEMORIA) {
      throw new BadRequestException(
        `A memória tem ${texto.length} caracteres e o limite é ${TETO_DA_MEMORIA}. Resuma.`,
      );
    }
    const total = await this.prisma.userMemory.count({ where: { userId } });
    if (total >= TETO_DE_MEMORIAS) {
      throw new BadRequestException(
        `Já há ${TETO_DE_MEMORIAS} memórias guardadas. Esqueça uma antes de guardar outra.`,
      );
    }
    return this.prisma.userMemory.create({
      data: { userId, content: texto },
      select: { id: true, content: true, createdAt: true },
    });
  }

  /** Pelo par, e não pelo id sozinho: o id vem do modelo, ou da URL. */
  async esquecer(userId: string, id: string): Promise<{ forgotten: true }> {
    const { count } = await this.prisma.userMemory.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Memória não encontrada.');
    return { forgotten: true };
  }
}
