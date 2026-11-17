import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AiWriteCategory, AiWriteMode, Prisma } from '@prisma/client';
import type { McpToolContext, McpToolDef } from '../../common/decorators/tool.decorator';
import { PrismaService } from '../../common/prisma.service';
import { McpToolRegistry, type McpAutoWriter } from '../../mcp/mcp-tool.registry';
import { ChatRunRegistry } from '../chat-run.registry';
import { PreviaDaAcaoService } from '../previa/previa-da-acao.service';
import { CAMPOS, type ContextoDoFormato } from '../previa/rotulos';
import { AUTO_UNDO, itemsTouched, stableJson, stateOf, type UndoSpec } from './undo-specs';

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
/** O Desfazer recusado porque o registro mudou depois da gravação: desfazer apagaria a mudança. */
export const AUTO_WRITE_CHANGED = 'AUTO_WRITE_CHANGED';
/**
 * A consulta pelo id da chamada não sabe dizer se gravou (linha em andamento ou inexistente). O
 * agente não repete nem pede OK às cegas: diz que pode não ter gravado e pergunta.
 */
export const AUTO_WRITE_UNKNOWN = 'AUTO_WRITE_UNKNOWN';
/** De quanto em quanto tempo a faxina das cópias roda. */
export const AUTO_WRITE_PURGE_INTERVAL_MS = 10 * 60 * 1000;
/** Quantas gravações recentes a faxina confere por rodada (as que ainda têm cópia). */
const PURGE_BATCH = 500;

/** As cinco cópias de dado de saúde de uma gravação, apagadas de uma vez. */
const SEM_COPIAS = {
  input: Prisma.DbNull,
  result: Prisma.DbNull,
  before: Prisma.DbNull,
  after: Prisma.DbNull,
  card: Prisma.DbNull,
} as const;

export interface SavedLine {
  label: string;
  before?: string;
  after: string;
}

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

const changed = () =>
  new ConflictException({
    code: AUTO_WRITE_CHANGED,
    message: 'O registro mudou depois da gravação. Nada foi desfeito; mude pela tela do registro.',
  });

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
export class AutoWriteService implements McpAutoWriter, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoWriteService.name);
  private purgeTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: McpToolRegistry,
    private readonly previas: PreviaDaAcaoService,
    private readonly runs: ChatRunRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.useAutoWriter(this);
    const rodar = () =>
      void this.purge().catch((err: unknown) =>
        this.logger.warn(
          `Faxina das gravações automáticas falhou: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    this.purgeTimer = setInterval(rodar, AUTO_WRITE_PURGE_INTERVAL_MS);
    this.purgeTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    this.purgeTimer = null;
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

    // Só o turno que a API abriu para esta pessoa e esta conversa, e que ainda está correndo.
    const turno = this.runs.active(userId, pedido.conversationId, pedido.runId);
    if (!turno) throw needsOk('Não há um turno ativo desta conversa para gravar sozinho.');

    if (!autoEligible(tool)) throw needsOk(`${tool.name} nunca grava sozinha.`);
    const category = tool.aiCategory as AiWriteCategory;
    const modo = (await this.modes(userId))[category];
    if (modo !== AiWriteMode.AUTO) throw needsOk('A categoria não está em Automático.');
    if (itemsTouched(input) > AUTO_WRITE_MAX_ITEMS) {
      throw needsOk(`A ação mexe em mais de ${AUTO_WRITE_MAX_ITEMS} itens.`);
    }

    const repetida = await this.prisma.aiAutoWrite.findUnique({
      where: { userId_toolCallId: { userId, toolCallId: pedido.toolCallId } },
    });
    if (repetida) {
      // A mesma chamada de novo (o agente repetiu depois de uma queda): o mesmo "Gravado".
      // Qualquer outra coisa com o mesmo id não grava sozinha.
      if (
        repetida.doneAt &&
        repetida.input !== null &&
        repetida.conversationId === pedido.conversationId &&
        stableJson(repetida.input) === stableJson(comoJsonPuro(input))
      ) {
        return { data: repetida.result, artifact: this.cartao(repetida) };
      }
      throw needsOk('Esta chamada já foi usada com outro pedido.');
    }

    const feitas = await this.prisma.aiAutoWrite.count({
      where: { userId, conversationId: pedido.conversationId, answerKey: turno.answerKey },
    });
    if (feitas >= AUTO_WRITE_MAX_PER_ANSWER) {
      throw needsOk(`Já foram ${AUTO_WRITE_MAX_PER_ANSWER} gravações nesta resposta.`);
    }

    const spec = AUTO_UNDO[tool.name];
    const formato: ContextoDoFormato = { timezone: ctx.timezone || 'UTC', agora: new Date() };
    // Antes de gravar: a prévia resolve os ids pelo estado de antes, e o retrato é o de antes.
    const previa = await this.previas
      .previa({ id: userId, timezone: ctx.timezone }, tool.name, input)
      .catch(() => null);
    const before = spec.before ? await spec.before(this.prisma, input, userId) : null;

    // A linha nasce antes da escrita: trava a mesma chamada em paralelo e, se o processo cair no
    // meio, a consulta diz "não sei" em vez de "não gravou".
    let linha;
    try {
      linha = await this.prisma.aiAutoWrite.create({
        data: {
          userId,
          conversationId: pedido.conversationId,
          runId: pedido.runId,
          answerKey: turno.answerKey,
          toolCallId: pedido.toolCallId,
          tool: tool.name,
          category,
          input: comoJson(input),
          before: comoJson(before),
        },
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw needsOk('Esta chamada já está sendo gravada.');
      }
      throw erro;
    }

    let data: unknown;
    try {
      data = await tool.execute(input as never, ctx);
    } catch (erro) {
      // Não gravou: a linha de controle não pode sobrar como "talvez".
      await this.prisma.aiAutoWrite.delete({ where: { id: linha.id } }).catch(() => undefined);
      throw erro;
    }

    const after = await stateOf(this.prisma, spec, { input, result: data }, userId);
    const card = linhasDoCartao(spec, before, after, previa?.linhas ?? [], formato);
    const pronta = await this.prisma.aiAutoWrite.update({
      where: { id: linha.id },
      data: {
        result: comoJson(data),
        after: comoJson(after),
        card: comoJson(card),
        doneAt: new Date(),
      },
    });
    return { data, artifact: this.cartao(pronta) };
  }

  /**
   * O que aconteceu com uma chamada automática, pelo id dela — para o agente que perdeu a resposta
   * (timeout, conexão caída). Feita: o mesmo resultado e o mesmo "Gravado". Em andamento ou
   * inexistente: `AUTO_WRITE_UNKNOWN`, e o agente pergunta à pessoa em vez de repetir.
   */
  async lookup(
    userId: string,
    conversationId: string,
    toolCallId: string,
  ): Promise<{ data: unknown; artifact: Record<string, unknown> }> {
    const linha = await this.prisma.aiAutoWrite.findFirst({
      where: { userId, conversationId, toolCallId },
    });
    if (!linha || !linha.doneAt || linha.clearedAt) {
      throw new ConflictException(
        `${AUTO_WRITE_UNKNOWN}: não dá para saber se esta gravação aconteceu. Não repita; ` +
          'diga à pessoa que pode não ter gravado e pergunte antes de tentar de novo.',
      );
    }
    return { data: linha.result, artifact: this.cartao(linha) };
  }

  /** O estado do Desfazer de uma gravação, para a tela que recarrega o cartão. */
  async status(
    userId: string,
    id: string,
  ): Promise<{ state: 'active' | 'undone' | 'expired' | 'pending' }> {
    const linha = await this.prisma.aiAutoWrite.findFirst({
      where: { id, userId },
      select: { undoneAt: true, createdAt: true, doneAt: true, clearedAt: true },
    });
    if (!linha) throw new NotFoundException('Gravação não encontrada.');
    if (linha.undoneAt) return { state: 'undone' };
    if (!linha.doneAt) return { state: 'pending' };
    if (linha.clearedAt || Date.now() - linha.createdAt.getTime() > AUTO_WRITE_UNDO_MS) {
      return { state: 'expired' };
    }
    return { state: 'active' };
  }

  private cartao(linha: {
    id: string;
    createdAt: Date;
    card: Prisma.JsonValue;
  }): Record<string, unknown> {
    return {
      kind: 'saved',
      label: 'Gravado',
      at: linha.createdAt.toISOString(),
      lines: Array.isArray(linha.card) ? linha.card : [],
      undoable: true,
      autoWriteId: linha.id,
    };
  }

  /**
   * O Desfazer do cartão "Gravado": a inversa da tool, a partir do retrato. Só do dono, uma vez,
   * dentro do prazo, e só se o registro ainda está como a gravação o deixou — mexido depois pela
   * pessoa (ou por outra gravação), recusa com `AUTO_WRITE_CHANGED` e não muda nada. Tudo numa
   * transação: conferir, desfazer, marcar e apagar as cópias.
   */
  async undo(userId: string, id: string): Promise<{ undone: true }> {
    const linha = await this.prisma.aiAutoWrite.findFirst({ where: { id, userId } });
    if (!linha) throw new NotFoundException('Gravação não encontrada.');
    if (linha.undoneAt) throw new ConflictException('Esta gravação já foi desfeita.');
    if (
      !linha.doneAt ||
      linha.clearedAt ||
      Date.now() - linha.createdAt.getTime() > AUTO_WRITE_UNDO_MS
    ) {
      throw new ConflictException('Passou o prazo do Desfazer. Mude pela tela do registro.');
    }
    const spec = AUTO_UNDO[linha.tool];
    if (!spec) throw new ConflictException('Esta gravação não tem Desfazer.');
    const record = {
      input: (linha.input ?? {}) as Record<string, unknown>,
      result: linha.result,
      before: linha.before,
    };

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.aiAutoWrite.updateMany({
        where: { id, userId, undoneAt: null },
        data: { undoneAt: new Date(), clearedAt: new Date(), ...SEM_COPIAS },
      });
      if (count === 0) throw new ConflictException('Esta gravação já foi desfeita.');
      const agora = await stateOf(tx, spec, record, userId);
      if (stableJson(agora) !== stableJson(linha.after)) throw changed();
      await spec.revert(tx, record, userId);
    });
    return { undone: true };
  }

  /**
   * A faxina das cópias de dado de saúde (#385): somem quando o prazo do Desfazer acaba e quando o
   * registro já não existe (apagado pela tela). Fica o metadado: tool, categoria, quando, desfeita.
   */
  async purge(agora = new Date()): Promise<{ cleared: number }> {
    const limite = new Date(agora.getTime() - AUTO_WRITE_UNDO_MS);
    const vencidas = await this.prisma.aiAutoWrite.updateMany({
      where: { clearedAt: null, createdAt: { lt: limite } },
      data: { clearedAt: agora, ...SEM_COPIAS },
    });
    let sumidas = 0;
    const recentes = await this.prisma.aiAutoWrite.findMany({
      where: { clearedAt: null, doneAt: { not: null }, undoneAt: null },
      select: { id: true, userId: true, tool: true, input: true, result: true },
      orderBy: { createdAt: 'asc' },
      take: PURGE_BATCH,
    });
    for (const linha of recentes) {
      const spec = AUTO_UNDO[linha.tool];
      if (!spec) continue;
      const record = {
        input: (linha.input ?? {}) as Record<string, unknown>,
        result: linha.result,
      };
      const atual = await stateOf(this.prisma, spec, record, linha.userId).catch(() => undefined);
      if (atual !== null) continue;
      await this.prisma.aiAutoWrite.update({
        where: { id: linha.id },
        data: { clearedAt: agora, ...SEM_COPIAS },
      });
      sumidas += 1;
    }
    return { cleared: vencidas.count + sumidas };
  }
}

const comoJsonPuro = (valor: unknown): unknown => JSON.parse(JSON.stringify(valor ?? null));

/**
 * As linhas do "Gravado". Mudança: o que mudou, "antes → depois", pelos rótulos do cartão de
 * confirmação (ADR 039, item 3). Criação: o que foi gravado, pela prévia.
 */
function linhasDoCartao(
  spec: UndoSpec,
  before: unknown,
  after: unknown,
  previa: { rotulo: string; valor: string }[],
  ctx: ContextoDoFormato,
): SavedLine[] {
  const depoisDaPrevia = previa.map((l) => ({ label: l.rotulo, after: l.valor }));
  if (!spec.before || !before || !after || typeof after !== 'object') return depoisDaPrevia;
  const antes = comoJsonPuro(before) as Record<string, unknown>;
  const depois = after as Record<string, unknown>;
  const linhas: SavedLine[] = [];
  for (const campo of Object.keys(antes)) {
    const rotulo = CAMPOS[campo];
    if (!rotulo || stableJson(antes[campo]) === stableJson(depois[campo])) continue;
    const fmt = (v: unknown) =>
      v === null || v === undefined
        ? '—'
        : ((rotulo.formato ? rotulo.formato(v, ctx) : null) ?? String(v));
    linhas.push({ label: rotulo.rotulo, before: fmt(antes[campo]), after: fmt(depois[campo]) });
  }
  return linhas.length ? linhas : depoisDaPrevia;
}
