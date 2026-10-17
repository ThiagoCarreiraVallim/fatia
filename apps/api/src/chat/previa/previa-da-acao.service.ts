import { BadRequestException, Injectable } from '@nestjs/common';
import { z, type ZodError } from 'zod';
import { PrismaService } from '../../common/prisma.service';
import { McpToolRegistry } from '../../mcp/mcp-tool.registry';
import { TIPO_DA_REFEICAO } from '../../nutrition/mcp/list-meals.tool';
import {
  CAMPOS,
  COMPOSTOS,
  OCULTOS,
  ROTULO_DO_REGISTRO,
  dataEHora,
  dia,
  tipoDoCampo,
  type ContextoDoFormato,
  type TipoDeRegistro,
} from './rotulos';

export interface LinhaDaPrevia {
  rotulo: string;
  valor: string;
}

export type PreviaDaAcao =
  | { valida: true; linhas: LinhaDaPrevia[] }
  | { valida: false; linhas: LinhaDaPrevia[]; problema: string };

const numero = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * O que uma escrita pausada vai fazer, em português de gente (ADR 022).
 *
 * O cartão de confirmação mostrava os argumentos crus — `mealType: LUNCH`,
 * `[{"foodId":163,"grams":150}]` —, e quem confirma é quem menos sabe ler isso.
 * Aqui os argumentos passam pelo **mesmo** `inputSchema` que o `/mcp` aplica na
 * execução, os campos viram rótulos (`rotulos.ts`) e cada id vira o nome do que
 * ele aponta, lido só dentro da conta de quem pergunta.
 *
 * O resumo **descreve** a chamada; não a altera. O que executa continua sendo o
 * `tool_call` guardado no checkpoint do agente (ADR 023).
 *
 * Argumento que o `/mcp` recusaria volta como `valida: false`: sem isto a pessoa
 * confirmava uma escrita que falharia de qualquer jeito, e só descobria depois.
 */
@Injectable()
export class PreviaDaAcaoService {
  constructor(
    private readonly registry: McpToolRegistry,
    private readonly prisma: PrismaService,
  ) {}

  async previa(
    usuario: { id: string; timezone: string },
    nome: string,
    argumentos: unknown,
    agora: Date = new Date(),
  ): Promise<PreviaDaAcao> {
    const tool = this.registry.buscar(nome);
    if (!tool || tool.annotations?.confirmableHint !== true) {
      throw new BadRequestException('Esta ação não pede confirmação.');
    }
    const lido = z.object(tool.inputSchema).safeParse(argumentos ?? {});
    if (!lido.success) {
      return { valida: false, linhas: [], problema: problemaDe(lido.error) };
    }

    const ctx: ContextoDoFormato = { timezone: usuario.timezone || 'UTC', agora };
    const linhas: LinhaDaPrevia[] = [];
    for (const [campo, valor] of Object.entries(lido.data as Record<string, unknown>)) {
      if (valor === undefined || valor === null || OCULTOS.has(campo)) continue;

      if (campo === 'items' && Array.isArray(valor)) {
        for (const item of valor) {
          const descricao = await this.itemDeRefeicao(usuario.id, item as Record<string, unknown>);
          if (descricao === null) return naoEncontrado(linhas);
          linhas.push({ rotulo: 'Item', valor: descricao });
        }
        continue;
      }
      if (campo === 'exercises' && Array.isArray(valor)) {
        const ordem = await this.novaOrdem(usuario.id, valor as { id: string; order: number }[]);
        if (ordem === null) return naoEncontrado(linhas);
        linhas.push({ rotulo: 'Nova ordem', valor: ordem });
        continue;
      }

      const tipo = tipoDoCampo(nome, campo);
      if (tipo) {
        const descricao = await this.resolver(tipo, valor, usuario.id, ctx);
        if (descricao === null) return naoEncontrado(linhas);
        linhas.push({ rotulo: ROTULO_DO_REGISTRO[tipo], valor: descricao });
        continue;
      }

      const definicao = CAMPOS[campo];
      if (!definicao || COMPOSTOS.has(campo)) continue;
      const formatado = definicao.formato ? definicao.formato(valor, ctx) : String(valor);
      if (formatado) linhas.push({ rotulo: definicao.rotulo, valor: formatado });
    }
    return { valida: true, linhas };
  }

  private async itemDeRefeicao(userId: string, item: Record<string, unknown>) {
    const gramas = typeof item.grams === 'number' ? `${numero(item.grams)} g de ` : '';
    if (typeof item.foodId === 'number') {
      const nome = await this.resolver('alimento', item.foodId, userId);
      return nome === null ? null : `${gramas}${nome}`;
    }
    const nome =
      typeof item.foodName === 'string' && item.foodName.trim() ? item.foodName.trim() : null;
    if (!nome) return null;
    // Fora do catálogo, as calorias são as que o assistente estimou: é o número
    // que vai ser gravado, e quem confirma precisa vê-lo.
    const kcal = typeof item.kcal === 'number' ? ` (${Math.round(item.kcal)} kcal)` : '';
    return `${gramas}${nome}${kcal}`;
  }

  private async novaOrdem(userId: string, exercicios: { id: string; order: number }[]) {
    const nomes: string[] = [];
    for (const exercicio of [...exercicios].sort((a, b) => a.order - b.order)) {
      const nome = await this.resolver('exercicioDoPlano', exercicio.id, userId);
      if (nome === null) return null;
      nomes.push(nome);
    }
    return nomes.map((nome, i) => `${i + 1}. ${nome}`).join(' · ');
  }

  /** O nome do registro, ou `null` se ele não existe **para esta pessoa**. */
  private async resolver(
    tipo: TipoDeRegistro,
    valor: unknown,
    userId: string,
    ctx: ContextoDoFormato = { timezone: 'UTC', agora: new Date() },
  ): Promise<string | null> {
    const id = valor as never;
    switch (tipo) {
      case 'alimento': {
        const food = await this.prisma.food.findFirst({
          where: { id, OR: [{ createdByUserId: null }, { createdByUserId: userId }] },
          select: { name: true },
        });
        return food?.name ?? null;
      }
      case 'grupo': {
        const grupo = await this.prisma.foodGroup.findUnique({
          where: { id },
          select: { name: true },
        });
        return grupo?.name ?? null;
      }
      case 'exercicio': {
        const exercicio = await this.prisma.exercise.findFirst({
          where: { id, OR: [{ createdByUserId: null }, { createdByUserId: userId }] },
          select: { name: true },
        });
        return exercicio?.name ?? null;
      }
      case 'plano': {
        const plano = await this.prisma.workoutPlan.findFirst({
          where: { id, userId },
          select: { name: true },
        });
        return plano?.name ?? null;
      }
      case 'treino': {
        const sessao = await this.prisma.workoutSession.findFirst({
          where: { id, userId },
          select: { startedAt: true, plan: { select: { name: true } } },
        });
        if (!sessao) return null;
        const quando = dataEHora(sessao.startedAt.toISOString(), ctx);
        return sessao.plan ? `${sessao.plan.name} (${quando})` : `Treino de ${quando}`;
      }
      case 'refeicao': {
        const refeicao = await this.prisma.meal.findFirst({
          where: { id, userId },
          select: { mealType: true, eatenAt: true },
        });
        if (!refeicao) return null;
        return `${TIPO_DA_REFEICAO[refeicao.mealType] ?? 'Refeição'} de ${dataEHora(refeicao.eatenAt.toISOString(), ctx)}`;
      }
      case 'itemDaRefeicao': {
        const item = await this.prisma.mealItem.findFirst({
          where: { id, meal: { userId } },
          select: { foodName: true, grams: true },
        });
        return item ? `${numero(item.grams)} g de ${item.foodName}` : null;
      }
      case 'meta': {
        const meta = await this.prisma.goal.findFirst({
          where: { id, userId },
          select: { title: true },
        });
        return meta?.title ?? null;
      }
      case 'memoria': {
        const memoria = await this.prisma.userMemory.findFirst({
          where: { id, userId },
          select: { content: true },
        });
        return memoria?.content ?? null;
      }
      case 'profissional': {
        const vinculo = await this.prisma.professionalLink.findFirst({
          where: { id, subjectUserId: userId },
          select: { professional: { select: { name: true } } },
        });
        return vinculo?.professional.name ?? null;
      }
      case 'peso': {
        const registro = await this.prisma.weightLog.findFirst({
          where: { id, userId },
          select: { weightKg: true, loggedAt: true },
        });
        return registro
          ? `${numero(registro.weightKg)} kg, ${dataEHora(registro.loggedAt.toISOString(), ctx)}`
          : null;
      }
      case 'passos': {
        const registro = await this.prisma.stepLog.findFirst({
          where: { id, userId },
          select: { steps: true, date: true },
        });
        return registro
          ? `${registro.steps.toLocaleString('pt-BR')} passos, ${dia(registro.date, ctx)}`
          : null;
      }
      case 'agua': {
        const registro = await this.prisma.waterLog.findFirst({
          where: { id, userId },
          select: { ml: true, date: true },
        });
        return registro
          ? `${registro.ml.toLocaleString('pt-BR')} ml, ${dia(registro.date, ctx)}`
          : null;
      }
      case 'serie': {
        const serie = await this.prisma.sessionSet.findFirst({
          where: { id, session: { userId } },
          select: { setNumber: true, exercise: { select: { name: true } } },
        });
        return serie ? `${serie.exercise.name}, série ${serie.setNumber}` : null;
      }
      case 'exercicioDoPlano': {
        const doPlano = await this.prisma.workoutPlanExercise.findFirst({
          where: { id, plan: { userId } },
          select: { exercise: { select: { name: true } } },
        });
        return doPlano?.exercise.name ?? null;
      }
    }
  }
}

function naoEncontrado(linhas: LinhaDaPrevia[]): PreviaDaAcao {
  return {
    valida: false,
    linhas,
    problema: 'Não encontrei o registro que esta ação altera. Peça de novo ao assistente.',
  };
}

/** "Faltou informar: quando" — com o nome do campo em português, nunca o da tool. */
function problemaDe(erro: ZodError): string {
  const faltando = new Set<string>();
  const errados = new Set<string>();
  for (const issue of erro.issues) {
    const campo = String(issue.path.find((parte) => typeof parte === 'string') ?? '');
    const rotulo = (
      CAMPOS[campo]?.rotulo ?? (campo === 'items' ? 'itens' : 'um dado')
    ).toLowerCase();
    const ausente = issue.code === 'invalid_type' && issue.received === 'undefined';
    (ausente ? faltando : errados).add(rotulo);
  }
  const partes: string[] = [];
  if (faltando.size) partes.push(`Faltou informar: ${[...faltando].join(', ')}.`);
  if (errados.size) partes.push(`Não está certo: ${[...errados].join(', ')}.`);
  return `${partes.join(' ')} Peça de novo ao assistente.`;
}
