import {
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { AiWriteCategory, AiWriteMode, Prisma } from '@prisma/client';
import type { McpToolContext, McpToolDef } from '../../common/decorators/tool.decorator';
import { PrismaService } from '../../common/prisma.service';
import { McpToolRegistry, type McpAutoWriter } from '../../mcp/mcp-tool.registry';
import { PreviaDaAcaoService } from '../previa/previa-da-acao.service';
import { AUTO_UNDO, itemsTouched } from './undo-specs';

/** No máximo 5 gravações automáticas por resposta da IA (ADR 039, item 4). */
export const AUTO_WRITE_MAX_PER_ANSWER = 5;
/** Uma ação que mexe em mais de 10 itens volta a pedir OK (ADR 039, item 4). */
export const AUTO_WRITE_MAX_ITEMS = 10;
/**
 * Por quanto tempo o "Desfazer" do cartão "Gravado" vale. Depois disso a linha passa a ser só
 * histórico, e mudar o registro é pela tela de sempre: um Desfazer de dias atrás apagaria por
 * cima do que a pessoa fez à mão nesse meio-tempo.
 */
export const AUTO_WRITE_UNDO_MS = 24 * 60 * 60 * 1000;
/**
 * O marcador da recusa que manda o agente voltar a pedir o OK, em vez de dar a escrita como
 * falha. O agente procura este texto no resultado (`auto_write.py`).
 */
export const AUTO_WRITE_NEEDS_OK = 'AUTO_WRITE_NEEDS_OK';

export const AI_WRITE_CATEGORIES = Object.values(AiWriteCategory);

export type AiWriteModes = Record<AiWriteCategory, AiWriteMode>;

/** O que o agente recebe a cada turno: as tools que gravam sozinhas e as que saem do catálogo. */
export interface TurnToolModes {
  auto: string[];
  off: string[];
}

/**
 * Pode gravar sem pedir OK, se a pessoa quiser? Confirmável, com categoria, com a operação
 * inversa, e nunca o que apaga (ADR 039, item 2). As restritas não são confirmáveis, então
 * ficam fora pela primeira condição.
 */
export function autoEligible(tool: McpToolDef): boolean {
  const a = tool.annotations;
  return (
    a.confirmableHint === true &&
    a.readOnlyHint !== true &&
    a.destructiveHint !== true &&
    !!tool.aiCategory &&
    !/^(delete|forget)_/.test(tool.name) &&
    Object.prototype.hasOwnProperty.call(AUTO_UNDO, tool.name)
  );
}

const needsOk = (motivo: string) =>
  new ConflictException(`${AUTO_WRITE_NEEDS_OK}: ${motivo} Peça a confirmação da pessoa.`);

const comoJson = (valor: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  valor === null || valor === undefined
    ? Prisma.DbNull
    : (JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue);

/**
 * O modo da IA por categoria e a gravação automática com Desfazer (ADR 039, #385).
 *
 * A decisão de gravar sem perguntar é do agente, que recebe a lista do turno (`turnModes`); a
 * **garantia** é daqui: o `/mcp` só executa com o header de gravação automática depois de conferir
 * a conversa, o modo, os limites e a inversa, e grava o retrato antes. Agente com defeito, ou
 * modo trocado no meio do turno, cai na recusa `AUTO_WRITE_NEEDS_OK`, e a escrita volta ao
 * cartão de confirmação.
 */
@Injectable()
export class AutoWriteService implements McpAutoWriter, OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: McpToolRegistry,
    private readonly previas: PreviaDaAcaoService,
  ) {}

  onModuleInit(): void {
    this.registry.useAutoWriter(this);
  }

  /** Os quatro modos, com o padrão (Perguntar antes) onde não há linha. */
  async modes(userId: string): Promise<AiWriteModes> {
    const linhas = await this.prisma.aiWriteModeSetting.findMany({ where: { userId } });
    const modos = Object.fromEntries(
      AI_WRITE_CATEGORIES.map((c) => [c, AiWriteMode.ASK]),
    ) as AiWriteModes;
    for (const linha of linhas) modos[linha.category] = linha.mode;
    return modos;
  }

  async setMode(userId: string, category: AiWriteCategory, mode: AiWriteMode) {
    if (mode === AiWriteMode.ASK) {
      // O padrão não é gravado: sem linha é Perguntar antes.
      await this.prisma.aiWriteModeSetting.deleteMany({ where: { userId, category } });
    } else {
      await this.prisma.aiWriteModeSetting.upsert({
        where: { userId_category: { userId, category } },
        create: { userId, category, mode },
        update: { mode },
      });
    }
    return this.modes(userId);
  }

  /**
   * O que vai ao agente no turno: em Automático, as tools elegíveis da categoria; em Desligado,
   * as **escritas** da categoria, que saem do catálogo do modelo (ADR 039, item 5). A leitura
   * continua: "Desligado" é a IA não mexer, e não a IA não saber.
   */
  async turnModes(userId: string): Promise<TurnToolModes> {
    const modos = await this.modes(userId);
    const auto: string[] = [];
    const off: string[] = [];
    for (const tool of this.registry.entidades()) {
      if (!tool.aiCategory || tool.annotations.confirmableHint !== true) continue;
      const modo = modos[tool.aiCategory];
      if (modo === AiWriteMode.OFF) off.push(tool.name);
      else if (modo === AiWriteMode.AUTO && autoEligible(tool)) auto.push(tool.name);
    }
    return { auto: auto.sort(), off: off.sort() };
  }

  async run(
    tool: McpToolDef,
    input: Record<string, unknown>,
    ctx: McpToolContext,
  ): Promise<{ data: unknown; artifact: Record<string, unknown> }> {
    const pedido = ctx.autoWrite;
    if (!pedido) throw new Error('Gravação automática sem o pedido.');
    const { userId } = ctx;

    // Conversa alheia é 404 como qualquer recurso alheio (ADR 010): o id vem do header.
    const conversa = await this.prisma.conversation.findFirst({
      where: { id: pedido.conversationId, userId },
      select: { id: true },
    });
    if (!conversa) throw new NotFoundException('Conversa não encontrada.');

    if (!autoEligible(tool)) throw needsOk(`${tool.name} nunca grava sozinha.`);
    const modo = (await this.modes(userId))[tool.aiCategory as AiWriteCategory];
    if (modo !== AiWriteMode.AUTO) throw needsOk('A categoria não está em Automático.');
    if (itemsTouched(input) > AUTO_WRITE_MAX_ITEMS) {
      throw needsOk(`A ação mexe em mais de ${AUTO_WRITE_MAX_ITEMS} itens.`);
    }
    const feitas = await this.prisma.aiAutoWrite.count({
      where: { userId, conversationId: pedido.conversationId, runId: pedido.runId },
    });
    if (feitas >= AUTO_WRITE_MAX_PER_ANSWER) {
      throw needsOk(`Já foram ${AUTO_WRITE_MAX_PER_ANSWER} gravações nesta resposta.`);
    }
    const repetida = await this.prisma.aiAutoWrite.findUnique({
      where: { userId_toolCallId: { userId, toolCallId: pedido.toolCallId } },
      select: { id: true },
    });
    // A mesma chamada duas vezes seria a mesma refeição duas vezes.
    if (repetida) throw new ConflictException('Esta chamada já foi gravada.');

    const spec = AUTO_UNDO[tool.name];
    // Antes de gravar: a prévia resolve os ids pelo estado de antes, e o retrato é o de antes.
    const previa = await this.previas
      .previa({ id: userId, timezone: ctx.timezone }, tool.name, input)
      .catch(() => null);
    const before = spec.before ? await spec.before(this.prisma, input, userId) : null;

    const data = await tool.execute(input as never, ctx);
    const linha = await this.prisma.aiAutoWrite.create({
      data: {
        userId,
        conversationId: pedido.conversationId,
        runId: pedido.runId,
        toolCallId: pedido.toolCallId,
        tool: tool.name,
        input: comoJson(input) as Prisma.InputJsonValue,
        result: comoJson(data),
        before: comoJson(before),
      },
    });
    return {
      data,
      artifact: {
        kind: 'saved',
        label: 'Gravado',
        at: linha.createdAt.toISOString(),
        lines: (previa?.linhas ?? []).map((l) => ({ label: l.rotulo, after: l.valor })),
        undoable: true,
        autoWriteId: linha.id,
      },
    };
  }

  /**
   * O Desfazer do cartão "Gravado": a inversa da tool, a partir do retrato. Só do dono, uma vez,
   * dentro do prazo. A linha é marcada antes de desfazer (dois toques não desfazem duas vezes) e
   * desmarcada se a inversa falhar.
   */
  async undo(userId: string, id: string): Promise<{ undone: true }> {
    const linha = await this.prisma.aiAutoWrite.findFirst({ where: { id, userId } });
    if (!linha) throw new NotFoundException('Gravação não encontrada.');
    if (linha.undoneAt) throw new ConflictException('Esta gravação já foi desfeita.');
    if (Date.now() - linha.createdAt.getTime() > AUTO_WRITE_UNDO_MS) {
      throw new ConflictException('Passou o prazo do Desfazer. Mude pela tela do registro.');
    }
    const spec = AUTO_UNDO[linha.tool];
    if (!spec) throw new ConflictException('Esta gravação não tem Desfazer.');

    const { count } = await this.prisma.aiAutoWrite.updateMany({
      where: { id, userId, undoneAt: null },
      data: { undoneAt: new Date() },
    });
    if (count === 0) throw new ConflictException('Esta gravação já foi desfeita.');
    try {
      await spec.revert(
        this.prisma,
        {
          input: (linha.input ?? {}) as Record<string, unknown>,
          result: linha.result,
          before: linha.before,
        },
        userId,
      );
    } catch (erro) {
      await this.prisma.aiAutoWrite.update({ where: { id }, data: { undoneAt: null } });
      throw erro;
    }
    // Desfeita, a cópia do dado de saúde não serve a mais nada.
    await this.prisma.aiAutoWrite.update({
      where: { id },
      data: { before: Prisma.DbNull, result: Prisma.DbNull },
    });
    return { undone: true };
  }
}
