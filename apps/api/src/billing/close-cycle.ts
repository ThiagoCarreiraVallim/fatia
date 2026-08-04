import { GroupRole, GroupType, MembershipStatus, type PrismaClient } from '@fatia/db';
import { usuariosAtivos, type AtividadeDb } from './active-student';
import {
  janelaDeAtividade,
  periodoDeCobranca,
  proRataMilli,
  valorDaLinhaCents,
  type PeriodoDeCobranca,
} from './cycle';

/**
 * O fechamento do ciclo (#158): conta cabeças, aplica pró-rata, monta a fatura.
 *
 * Função e não service porque, sem a persistência (`GroupSubscription`,
 * `BillingInvoice`), não há o que injetar — e porque é assim que o comando
 * `pnpm billing:dry-run` consegue rodar o fechamento **de verdade**, com o banco
 * de verdade, sem subir o Nest e sem tocar o provedor de pagamento.
 *
 * Quando a migration entrar, o service que grava chama esta função e persiste o
 * que ela devolve. O cálculo não muda de lugar.
 */

export interface ParametrosDeCobranca {
  groupId: string;
  /** Faixa contratada. Define preço por aluno e, na #135, a cota de IA. */
  tier: string;
  /** Dinheiro em inteiro, sempre. */
  pricePerStudentCents: number;
  /** Dia do fechamento, 1..28. */
  cycleDay: number;
  currency?: string;
}

/**
 * Uma linha da fatura.
 *
 * **O que existe aqui é a lista inteira do que a academia recebe sobre um
 * aluno.** `membershipId` para ela reconciliar com a própria lista, o nome que o
 * aluno já exibe no grupo, a fração do ciclo e o valor.
 *
 * O que deliberadamente NÃO existe, e não é esquecimento: data da última
 * atividade, contagem de sessões, dias sem treinar, faixa de horário, qualquer
 * sinal de comportamento. A academia audita a **conta**, não o aluno — e quem lê
 * a fatura é o dono da academia, que pela matriz da #156 não tem acesso a dado
 * nenhum de saúde. Uma coluna "último acesso" entregaria por vias transversas o
 * que a porta da frente nega, e ninguém consentiu.
 *
 * `no-billing-in-student-surface.spec.ts` falha se este tipo ganhar campo novo.
 */
export interface LinhaDeFatura {
  /** Sem FK e sem `userId`: a fatura é documento e sobrevive ao aluno sair. */
  membershipId: string;
  /** Congelado na emissão. Renomear depois não reescreve documento emitido. */
  displayName: string;
  /** Fração do ciclo em milésimos. `1000` = ciclo inteiro. */
  proRataMilli: number;
  amountCents: number;
}

export interface FaturaFechada {
  groupId: string;
  tier: string;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  /** Os dias do ciclo, para a academia conferir o denominador da pró-rata. */
  periodDays: number;
  /**
   * Cabeças contadas no fechamento. Redundante com `lines.length` de propósito:
   * é ele que será gravado, e recontar semanas depois daria outro número quando
   * alguém sair do grupo. Fatura emitida não se recalcula.
   */
  activeCount: number;
  subtotalCents: number;
  totalCents: number;
  lines: LinhaDeFatura[];
}

/**
 * Grupo que não gera cobrança.
 *
 * Erro, e não fatura vazia: "cobrei zero" e "não devia cobrar" são estados
 * diferentes, e só o segundo é a regra do produto. Grupo social **nunca** entra
 * na cobrança, de ninguém.
 */
export class GrupoNaoFaturavelError extends Error {
  constructor(
    readonly groupId: string,
    motivo: string,
  ) {
    super(`Grupo ${groupId} não gera cobrança: ${motivo}`);
    this.name = 'GrupoNaoFaturavelError';
  }
}

export type CicloDb = AtividadeDb & Pick<PrismaClient, 'group' | 'groupMembership'>;

export async function fecharCiclo(
  db: CicloDb,
  params: ParametrosDeCobranca,
  referencia: Date = new Date(),
): Promise<FaturaFechada> {
  if (!Number.isInteger(params.pricePerStudentCents) || params.pricePerStudentCents < 0) {
    throw new RangeError(
      `pricePerStudentCents precisa ser inteiro não negativo; recebido: ${params.pricePerStudentCents}`,
    );
  }

  const grupo = await db.group.findUnique({
    where: { id: params.groupId },
    select: { id: true, type: true, owner: { select: { timezone: true } } },
  });

  // Inexistente e social recebem a mesma recusa: nos dois casos não há fatura a
  // emitir, e distinguir aqui não serviria a ninguém.
  if (!grupo) throw new GrupoNaoFaturavelError(params.groupId, 'grupo inexistente');
  if (grupo.type !== GroupType.SPONSORED) {
    throw new GrupoNaoFaturavelError(params.groupId, `tipo ${grupo.type} não é patrocinado`);
  }

  // O fuso é o do dono, que é quem lê a fatura e quem fecha o mês. `Group` não
  // tem fuso próprio no schema, e esta fatia não mexe em `schema.prisma` — a
  // coluna está proposta na PR. Enquanto ela não existe, o fuso do dono é a
  // melhor aproximação disponível e está declarada, não escondida.
  const periodo = periodoDeCobranca(params.cycleDay, grupo.owner.timezone, referencia);

  const membresias = await membresiasDoCiclo(db, params.groupId, periodo);
  const janela = janelaDeAtividade(periodo);
  const ativos = await usuariosAtivos(
    db,
    membresias.map((m) => m.userId),
    janela.start,
    janela.end,
  );

  const lines = membresias
    .filter((m) => ativos.has(m.userId))
    .map((m) => {
      const proRata = proRataMilli(periodo, m);
      return {
        membershipId: m.id,
        displayName: m.user.name,
        proRataMilli: proRata,
        amountCents: valorDaLinhaCents(params.pricePerStudentCents, proRata),
      };
    })
    // Ordem estável para a conferência: duas execuções do mesmo ciclo produzem a
    // mesma fatura, linha por linha.
    .sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName, 'pt-BR') ||
        a.membershipId.localeCompare(b.membershipId),
    );

  const subtotalCents = lines.reduce((soma, linha) => soma + linha.amountCents, 0);

  return {
    groupId: params.groupId,
    tier: params.tier,
    currency: params.currency ?? 'BRL',
    periodStart: periodo.start,
    periodEnd: periodo.end,
    periodDays: periodo.dias.length,
    activeCount: lines.length,
    subtotalCents,
    totalCents: subtotalCents,
    lines,
  };
}

/**
 * As associações que o ciclo pode cobrar: papel `MEMBER`, que entrou antes do
 * fechamento e que não tinha saído antes de o ciclo começar.
 *
 * Só `MEMBER`. `OWNER`, `PROFESSIONAL` e `CREATOR` não são alunos — cobrar o
 * próprio dono como aluno é o erro que a academia percebe na primeira fatura, e
 * cobrar o personal dela é o que ela percebe depois de pagar.
 */
async function membresiasDoCiclo(db: CicloDb, groupId: string, periodo: PeriodoDeCobranca) {
  return db.groupMembership.findMany({
    where: {
      groupId,
      role: GroupRole.MEMBER,
      // `status` guarda só o estado de hoje, então quem saiu no meio do ciclo
      // aparece como LEFT/REMOVED: filtrar por `ACTIVE` puro perderia justamente
      // a pró-rata de saída. Quem saiu antes do início do ciclo fica de fora
      // pelo `leftAt`, e quem nunca entrou (INVITED, `joinedAt` nulo) também.
      joinedAt: { not: null, lt: periodo.end },
      OR: [
        { status: MembershipStatus.ACTIVE },
        {
          status: { in: [MembershipStatus.LEFT, MembershipStatus.REMOVED] },
          leftAt: { gt: periodo.start },
        },
      ],
    },
    select: {
      id: true,
      userId: true,
      joinedAt: true,
      leftAt: true,
      user: { select: { name: true } },
    },
  });
}
