import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MemoryCategory } from '@prisma/client';
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

  async list(userId: string) {
    return this.prisma.userMemory.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, content: true, category: true, createdAt: true },
    });
  }

  /** O "n de 50" da tela (Al-M9). */
  count(userId: string): Promise<number> {
    return this.prisma.userMemory.count({ where: { userId } });
  }

  async remember(userId: string, conteudo: string, category?: MemoryCategory) {
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
        `Já há ${TETO_DE_MEMORIAS} memórias guardadas, o limite. Pergunte à pessoa qual apagar ` +
          '(forget_memory) antes de guardar outra; não apague por conta própria.',
      );
    }
    return this.prisma.userMemory.create({
      data: { userId, content: texto, ...(category ? { category } : {}) },
      select: { id: true, content: true, category: true, createdAt: true },
    });
  }

  /** Pelo par, e não pelo id sozinho: o id vem do modelo, ou da URL. */
  async forget(userId: string, id: string): Promise<{ forgotten: true }> {
    const { count } = await this.prisma.userMemory.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Memória não encontrada.');
    return { forgotten: true };
  }

  /** "Apagar todas" (Al-M9). Só pela tela: não há tool que faça isso (#385). */
  async forgetAll(userId: string): Promise<{ forgotten: number }> {
    const { count } = await this.prisma.userMemory.deleteMany({ where: { userId } });
    return { forgotten: count };
  }
}
