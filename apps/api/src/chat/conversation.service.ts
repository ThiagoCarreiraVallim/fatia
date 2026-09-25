import { Injectable, NotFoundException } from '@nestjs/common';
import { MessageRole, Prisma } from '@prisma/client';
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

/** O fim de um turno do assistente, como `leitor-do-turno.ts` o leu. */
export type RespostaDoTurno = {
  texto: string;
  tools: ToolChamada[];
  status: 'completed' | 'interrupted' | 'error';
  pausa: { id: string; value: unknown } | null;
  runId: string | null;
};

/** O que a tela manda sobre uma resposta. `review: null` desfaz o voto. */
export type VotoNaResposta = {
  review: 'like' | 'dislike' | null;
  reasons?: string[];
  note?: string;
};

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
  async listar(userId: string, busca?: string) {
    const termo = busca?.trim();
    return this.prisma.conversation.findMany({
      where: {
        userId,
        ...(termo ? { title: { contains: termo, mode: Prisma.QueryMode.insensitive } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  /**
   * A conversa desta pessoa com este id, ou `null` se ainda não existe.
   *
   * `null` só quando **ninguém** tem o id: o PWA gera o id da conversa nova, e a
   * primeira mensagem é que a cria. Um id que já é de outra pessoa é o mesmo 404
   * de `assertDaPessoa` — senão a primeira mensagem viraria um jeito de escrever
   * na conversa alheia.
   */
  async encontrar(userId: string, conversationId: string) {
    const conversa = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversa) return null;
    if (conversa.userId !== userId) throw new NotFoundException('Conversa não encontrada.');
    return conversa;
  }

  /**
   * Troca o título provisório (o recorte da primeira mensagem) pelo que o agente
   * gerou — **só se ninguém mexeu nele antes**. A pessoa pode renomear enquanto
   * o título ainda está sendo gerado, e o nome dela ganha.
   */
  async titularSeProvisorio(
    userId: string,
    conversationId: string,
    primeira: string,
    title: string,
  ) {
    await this.prisma.conversation.updateMany({
      where: { id: conversationId, userId, title: tituloDe(primeira) },
      data: { title },
    });
  }

  async renomear(userId: string, conversationId: string, title: string) {
    await this.assertDaPessoa(userId, conversationId);
    await this.prisma.conversation.updateMany({
      where: { id: conversationId, userId },
      data: { title },
    });
    return { id: conversationId, title };
  }

  async obterComMensagens(userId: string, conversationId: string) {
    const conversa = await this.assertDaPessoa(userId, conversationId);
    const messages = await this.prisma.message.findMany({
      // `conversationId` já saiu de `assertDaPessoa`: é a conversa desta pessoa,
      // e não o id que veio da URL.
      where: { conversationId: conversa.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        tools: true,
        metadata: true,
        runId: true,
        review: true,
        createdAt: true,
      },
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
   *
   * **Mensagem sem texto fica de fora.** `concluirTurno` grava o turno que só
   * chamou tool, com `content: ''`, de propósito — é o vestígio de que a IA agiu
   * (ver lá). Mas o agente recusa `content` vazio com 422, e um 422 no histórico
   * é **permanente**: a conversa morreria para sempre a partir daquele turno, e
   * quem estivesse conversando não teria nenhuma forma de consertar. Filtrar
   * aqui mantém as duas propriedades — a linha continua no banco, auditável, e
   * não vai para o prompt, onde ela não diz nada mesmo.
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
    return ultimas.reverse().filter((m) => m.content.trim() !== '');
  }

  /**
   * Abre a conversa do turno e grava a mensagem da pessoa, numa transação.
   *
   * `conversationId` ausente cria conversa nova; presente **precisa** ser desta
   * pessoa. O `userId` vem do `@CurrentUser()` e nunca do corpo.
   */
  async iniciarTurno(
    userId: string,
    conversationId: string,
    texto: string,
  ): Promise<{ conversationId: string }> {
    const conversa = await this.encontrar(userId, conversationId);

    return this.prisma.$transaction(async (tx) => {
      const alvo =
        conversa ??
        (await tx.conversation.create({
          data: { id: conversationId, userId, title: tituloDe(texto) },
        }));

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
   * Tira a pausa das respostas anteriores — o turno de agora a resolveu.
   *
   * Vale para a retomada **e** para a mensagem nova: quem escreve outra coisa em
   * vez de responder ao card também encerra a pausa (o agente a descarta). E os
   * argumentos de uma escrita proposta não ficam no banco depois disso — ver o
   * comentário de `Message.metadata`.
   */
  async limparPausas(userId: string, conversationId: string): Promise<void> {
    const conversa = await this.assertDaPessoa(userId, conversationId);
    const pausadas = await this.prisma.message.findMany({
      where: {
        conversationId: conversa.id,
        role: MessageRole.assistant,
        metadata: { path: ['status'], equals: 'interrupted' },
      },
      select: { id: true },
    });
    for (const { id } of pausadas) {
      await this.prisma.message.update({
        where: { id },
        data: { metadata: { status: 'resolved' } },
      });
    }
  }

  /**
   * Grava a resposta do assistente e devolve o id da linha — ou `null` quando não
   * havia o que gravar.
   *
   * Uma pausa é gravada mesmo sem texto: é ela que traz o card de volta depois de
   * um F5, e um turno que só pediu uma confirmação não escreveu nada.
   */
  async concluirTurno(
    userId: string,
    conversationId: string,
    resposta: RespostaDoTurno,
  ): Promise<string | null> {
    // De novo pelo par, e não pelo id sozinho: este método é chamado com um id
    // que atravessou o streaming inteiro, e reconferir custa uma linha.
    const conversa = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conversa) return null;

    const vazia = resposta.texto.trim() === '' && resposta.tools.length === 0;
    if (vazia && !resposta.pausa) return null;

    const linha = await this.prisma.message.create({
      data: {
        conversationId: conversa.id,
        role: MessageRole.assistant,
        content: resposta.texto,
        tools:
          resposta.tools.length > 0
            ? (resposta.tools as unknown as Prisma.InputJsonValue)
            : undefined,
        metadata: {
          status: resposta.status,
          ...(resposta.pausa ? { interrupt: resposta.pausa } : {}),
        } as Prisma.InputJsonValue,
        runId: resposta.runId,
      },
      select: { id: true },
    });
    await this.prisma.conversation.update({
      where: { id: conversa.id },
      data: { updatedAt: new Date() },
    });
    return linha.id;
  }

  /** O voto da pessoa numa resposta do assistente **desta** conversa. */
  async votar(
    userId: string,
    conversationId: string,
    messageId: string,
    voto: VotoNaResposta,
  ): Promise<void> {
    const conversa = await this.assertDaPessoa(userId, conversationId);
    const { count } = await this.prisma.message.updateMany({
      where: { id: messageId, conversationId: conversa.id, role: MessageRole.assistant },
      data: {
        review: voto.review,
        reviewReasons: voto.review === 'dislike' ? (voto.reasons ?? []) : [],
        reviewNote: voto.review === 'dislike' ? (voto.note ?? null) : null,
      },
    });
    if (count === 0) throw new NotFoundException('Mensagem não encontrada.');
  }
}

function tituloDe(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  return limpo.length <= TETO_DO_TITULO ? limpo : `${limpo.slice(0, TETO_DO_TITULO - 1)}…`;
}
