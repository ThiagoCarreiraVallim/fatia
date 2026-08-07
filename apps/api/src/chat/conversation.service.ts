import { Injectable, NotFoundException } from '@nestjs/common';
import { MessageRole, type Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

/**
 * Persistência da conversa com a IA hospedada (#249).
 *
 * **Este serviço é a fronteira de isolamento do chat.** O agente não fala com o
 * banco (ADR 015) e não há RLS (ADR 010), então o `userId` verificado tem de
 * entrar em todo `where` daqui — e é isso que o `user-isolation.spec.ts` exercita
 * contra Postgres de verdade.
 *
 * A regra que governa o arquivo: **nenhum método aceita `conversationId` sem
 * aceitar o `userId` junto, e nenhum usa o id sem casar os dois no mesmo
 * `where`.** Foi o descuido oposto que produziu escrita entre contas na #204 —
 * ali o dono do recurso da URL foi checado e o id do filho, vindo do corpo, não.
 * Aqui o "filho" é a mensagem, e ela não tem dono próprio: quem tem é a conversa
 * (ver o comentário de `Message` no `schema.prisma`).
 */

/** Quantas mensagens do histórico vão para o agente a cada turno. */
const TETO_DO_HISTORICO = 40;

/** Título derivado da primeira mensagem — cabe numa linha da lista. */
const TETO_DO_TITULO = 60;

export type MensagemDoHistorico = { role: MessageRole; content: string };

export type ToolChamada = { name: string };

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A conversa, se ela é desta pessoa. Se não é — ou não existe — `NOT_FOUND`.
   *
   * A mensagem é **idêntica** nos dois casos, e isso não é preguiça (#92):
   * distinguir "não existe" de "existe e não é sua" transforma a rota num oráculo
   * de ids alheios.
   */
  async assertDaPessoa(userId: string, conversationId: string) {
    const conversa = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conversa) throw new NotFoundException('Conversa não encontrada.');
    return conversa;
  }

  /** Conversas da pessoa, mais recente primeiro. Sem as mensagens. */
  async listar(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  /** Uma conversa com o histórico completo, em ordem cronológica. */
  async obterComMensagens(userId: string, conversationId: string) {
    const conversa = await this.assertDaPessoa(userId, conversationId);
    const messages = await this.prisma.message.findMany({
      // `conversationId` já saiu de `assertDaPessoa`: é a conversa desta pessoa,
      // e não o id que veio da URL.
      where: { conversationId: conversa.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, tools: true, createdAt: true },
    });
    return { ...conversa, messages };
  }

  async apagar(userId: string, conversationId: string): Promise<void> {
    await this.assertDaPessoa(userId, conversationId);
    // `deleteMany` com os dois campos, e não `delete({ where: { id } })`: entre a
    // checagem e a escrita existe uma janela, e repetir o `userId` fecha o
    // TOCTOU sem custo. As mensagens vão junto pelo `onDelete: Cascade`.
    await this.prisma.conversation.deleteMany({ where: { id: conversationId, userId } });
  }

  /**
   * Últimas mensagens da conversa, no formato que vai para o agente.
   *
   * Cortadas em `TETO_DO_HISTORICO` porque o histórico é **entrada paga**: cada
   * turno reenvia a conversa inteira, então uma conversa longa custa mais a cada
   * mensagem, quadraticamente. O corte pega as mais recentes e devolve em ordem
   * cronológica — o começo de uma conversa velha é o que menos importa para a
   * próxima resposta.
   */
  async historicoParaOAgente(
    userId: string,
    conversationId: string,
  ): Promise<MensagemDoHistorico[]> {
    await this.assertDaPessoa(userId, conversationId);
    const ultimas = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: TETO_DO_HISTORICO,
      select: { role: true, content: true },
    });
    return ultimas.reverse();
  }

  /**
   * Abre a conversa do turno e grava a mensagem da pessoa, numa transação.
   *
   * `conversationId` ausente cria conversa nova; presente **precisa** ser desta
   * pessoa. O `userId` vem do `@CurrentUser()` e nunca do corpo.
   */
  async iniciarTurno(
    userId: string,
    conversationId: string | undefined,
    texto: string,
  ): Promise<{ conversationId: string }> {
    const conversa = conversationId ? await this.assertDaPessoa(userId, conversationId) : null;

    return this.prisma.$transaction(async (tx) => {
      const alvo =
        conversa ?? (await tx.conversation.create({ data: { userId, title: tituloDe(texto) } }));

      await tx.message.create({
        data: { conversationId: alvo.id, role: MessageRole.user, content: texto },
      });

      await tx.conversation.update({
        where: { id: alvo.id },
        data: {
          updatedAt: new Date(),
          // Conversa que nasceu sem título (não deveria acontecer) ganha um na
          // primeira mensagem seguinte, em vez de ficar sem nome para sempre.
          ...(alvo.title ? {} : { title: tituloDe(texto) }),
        },
      });

      return { conversationId: alvo.id };
    });
  }

  /**
   * Grava a resposta do agente. Chamado quando o stream termina — **inclusive
   * quando ele termina mal**, com o pedaço que chegou.
   *
   * Persistir o parcial é deliberado: a pessoa leu aquele texto na tela, e uma
   * conversa que perde no F5 o que estava escrito ali é indistinguível de dado
   * corrompido. Turno sem nenhum texto não grava nada — uma mensagem vazia do
   * assistente é ruído no histórico e vira entrada paga no próximo turno.
   */
  async concluirTurno(
    userId: string,
    conversationId: string,
    resposta: { texto: string; tools: ToolChamada[] },
  ): Promise<void> {
    // De novo pelo par, e não pelo id sozinho: este método é chamado com um id
    // que atravessou o streaming inteiro, e reconferir custa uma linha.
    const conversa = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conversa) return;

    if (resposta.texto.trim() === '') return;

    await this.prisma.message.create({
      data: {
        conversationId: conversa.id,
        role: MessageRole.assistant,
        content: resposta.texto,
        tools:
          resposta.tools.length > 0
            ? (resposta.tools as unknown as Prisma.InputJsonValue)
            : undefined,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversa.id },
      data: { updatedAt: new Date() },
    });
  }
}

function tituloDe(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  return limpo.length <= TETO_DO_TITULO ? limpo : `${limpo.slice(0, TETO_DO_TITULO - 1)}…`;
}
