import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ShareScope, type NutritionPlanStatus } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { NutritionPlanService } from '../nutrition/nutrition-plan.service';
import { rangesToTargets, type GoalRanges, type KeyMacro } from '../nutrition/helpers/equivalents';
import { todayInTz } from '../progress/helpers/date-tz';
import { MAX_CHANGE_NOTE } from './dto/plan-send.dto';
import { resolveMemberTarget } from './member-file-target';
import {
  buildNutritionSendInput,
  documentToNutritionSnapshot,
  groupSnapSchema,
  keepRanges,
  loadBaseFoods,
  parseNutritionDocument,
  snapshotFoodIds,
  type EquivalenceGroupSnap,
  type NutritionDocumentView,
  type NutritionFoodSnap,
} from './nutrition-document';
import { nutritionPlanSentNotice } from './plan-offer-notices';
import { ProfessionalAccessService } from './professional-access.service';

/** Ações da trilha (`ProfessionalAccessLog.action`) da cópia do plano alimentar. */
export const NUTRITION_COPY_READ_ACTION = 'open_nutrition_copy';
export const NUTRITION_COPY_EDIT_ACTION = 'edit_nutrition_copy';

const PLAN_NOT_FOUND = 'Nutrition plan not found';
const DEFAULT_TITLE = 'Plano alimentar';

export interface NutritionCopyView {
  planId: string;
  membershipId: string;
  studentName: string;
  /** O título do modelo de onde a cópia saiu, ou "Plano alimentar". */
  title: string;
  /** Quem mandou o plano; nulo se apagou a conta. */
  authorName: string | null;
  /** "Ver original": o modelo da biblioteca. */
  template: { id: string; title: string } | null;
  /** A versão que o editor abre: a última da linhagem. */
  version: { id: string; version: number; status: NutritionPlanStatus };
  /** Há uma versão nova esperando o aceite da pessoa. */
  pendingUpdate: boolean;
  document: NutritionDocumentView;
  /** Trocas de hoje em diante que a pessoa já fez e que seguem na versão nova. */
  swapsKept: number;
}

export interface SaveNutritionCopyInput {
  document: unknown;
  changeNote?: string | null;
  /** "Avisar a Ana no app". Padrão: avisa. */
  notify?: boolean;
  /** A versão que o editor abriu: outra salva depois dela dá 409. */
  baseVersionId?: string;
}

const COPY_INCLUDE = {
  user: { select: { name: true, timezone: true } },
  author: { select: { name: true } },
  sourceTemplate: { select: { id: true, title: true } },
  meals: {
    orderBy: { position: 'asc' },
    include: {
      options: {
        orderBy: { position: 'asc' },
        include: {
          items: {
            orderBy: { position: 'asc' },
            include: { equivalents: { orderBy: { position: 'asc' } } },
          },
        },
      },
    },
  },
} satisfies Prisma.NutritionPlanInclude;

type CopyRow = Prisma.NutritionPlanGetPayload<{ include: typeof COPY_INCLUDE }>;
type FoodRow = CopyRow['meals'][number]['options'][number]['items'][number]['equivalents'][number];

function foodSnapOf(row: Omit<FoodRow, 'id' | 'itemId' | 'position'>): NutritionFoodSnap {
  return {
    foodId: row.foodId,
    groupId: row.groupId,
    foodName: row.foodName,
    grams: row.grams,
    kcal: row.kcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    nutrients: (row.nutrients as Record<string, number> | null) ?? null,
    portionLabel: row.portionLabel,
    portionQuantity: row.portionQuantity,
  };
}

/** O macro que mais pesa nas kcal do item: o macro-chave do grupo refeito. */
function dominantMacro(i: { proteinG: number; carbsG: number; fatG: number }): KeyMacro {
  const pesos: Array<[KeyMacro, number]> = [
    ['carbs', i.carbsG * 4],
    ['protein', i.proteinG * 4],
    ['fat', i.fatG * 9],
  ];
  return pesos.sort((a, b) => b[1] - a[1])[0]![0];
}

/**
 * O plano da pessoa como documento do editor. Refeição e item sem chave (plano
 * de antes do editor) usam o próprio id como chave: é por ela que o aceite da
 * versão nova leva as trocas. Os grupos vêm como o editor os gravou; sem eles
 * (plano antigo), são refeitos a partir dos equivalentes de cada item.
 */
export function copyDocument(plan: CopyRow): NutritionDocumentView {
  const gravados = z.array(groupSnapSchema).safeParse(plan.equivalenceGroups);
  const groups: EquivalenceGroupSnap[] = gravados.success ? gravados.data : [];
  const conhecidos = new Set(groups.map((g) => g.key));
  const meals = plan.meals.map((m) => ({
    key: m.key ?? m.id,
    name: m.name,
    time: m.time,
    mealType: m.mealType,
    options: m.options.map((o) => ({
      items: o.items.map((it) => {
        let groupKey = it.groupKey && conhecidos.has(it.groupKey) ? it.groupKey : null;
        if (!groupKey && it.equivalents.length > 0) {
          groupKey = `g-${it.id}`;
          const vistos = new Set<number | null>();
          const foods = [it, ...it.equivalents].filter((f) => {
            if (vistos.has(f.foodId)) return false;
            vistos.add(f.foodId);
            return true;
          });
          groups.push({
            key: groupKey,
            name: (it.equivalenceGroup ?? `Troca de ${it.foodName}`).slice(0, 40),
            keyMacro: dominantMacro(it),
            foods: foods.map(foodSnapOf),
          });
          conhecidos.add(groupKey);
        }
        return { ...foodSnapOf(it), key: it.key ?? it.id, groupKey };
      }),
    })),
  }));
  return {
    targets: rangesToTargets(plan),
    // A cópia já é desta pessoa: não se ajusta de novo.
    adjustToStudent: false,
    meals,
    groups,
  };
}

/**
 * Editar a cópia do plano alimentar de um aluno (#407, Pn-24c). A cópia é o
 * `NutritionPlan` da pessoa (#376): o editor abre a última versão da mesma
 * linhagem (pessoa, autor e modelo), e salvar grava uma versão nova pelo fluxo
 * de versão — a pessoa vê o que mudou e aceita; o modelo da biblioteca, a
 * versão em uso até o aceite e tudo o que ela registrou ficam como estão. No
 * aceite, as trocas e o "comi isso" de hoje em diante seguem na versão nova.
 *
 * Exige `member.plans` no papel, a pessoa ativa nesta comunidade e a porta de
 * leitura de Alimentação de quem edita (vínculo ativo, especialidade e "só quem
 * acompanha"): ler e salvar ficam na trilha da pessoa (`ProfessionalAccessLog`).
 * Sem administração pelo MCP.
 */
/** Só os oito campos das faixas, sem o resto da linha do plano. */
function pickRanges(r: GoalRanges): GoalRanges {
  return {
    kcalMin: r.kcalMin,
    kcalMax: r.kcalMax,
    proteinMinG: r.proteinMinG,
    proteinMaxG: r.proteinMaxG,
    carbsMinG: r.carbsMinG,
    carbsMaxG: r.carbsMaxG,
    fatMinG: r.fatMinG,
    fatMaxG: r.fatMaxG,
  };
}

@Injectable()
export class NutritionCopyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: NutritionPlanService,
    private readonly access: ProfessionalAccessService,
    private readonly notifications: NotificationService,
  ) {}

  async get(
    viewerId: string,
    groupId: string,
    membershipId: string,
    planId: string,
  ): Promise<NutritionCopyView> {
    const { latest, subjectId } = await this.resolve(
      viewerId,
      groupId,
      membershipId,
      planId,
      NUTRITION_COPY_READ_ACTION,
    );
    const aceita = await this.prisma.nutritionPlan.findFirst({
      where: {
        userId: subjectId,
        authorId: latest.authorId,
        sourceTemplateId: latest.sourceTemplateId,
        status: 'ACCEPTED',
      },
      select: { id: true },
    });
    const swapsKept = aceita
      ? await this.prisma.nutritionSwap.count({
          where: {
            planId: aceita.id,
            undoneAt: null,
            date: { gte: todayInTz(latest.user.timezone) },
          },
        })
      : 0;
    return {
      planId,
      membershipId,
      studentName: latest.user.name,
      title: latest.sourceTemplate?.title ?? DEFAULT_TITLE,
      authorName: latest.author?.name ?? null,
      template: latest.sourceTemplate
        ? { id: latest.sourceTemplate.id, title: latest.sourceTemplate.title }
        : null,
      version: { id: latest.id, version: latest.version, status: latest.status },
      pendingUpdate: latest.status === 'SENT' && aceita !== null,
      document: copyDocument(latest),
      swapsKept,
    };
  }

  async save(
    viewerId: string,
    groupId: string,
    membershipId: string,
    planId: string,
    input: SaveNutritionCopyInput,
  ): Promise<{ planId: string; version: number }> {
    const doc = parseNutritionDocument(input.document);
    const { latest, subjectId } = await this.resolve(
      viewerId,
      groupId,
      membershipId,
      planId,
      NUTRITION_COPY_EDIT_ACTION,
    );
    if (latest.status === 'SUPERSEDED') {
      throw new ConflictException('Esse plano não está mais em uso: mande um novo.');
    }
    const snap = await documentToNutritionSnapshot(this.prisma, {
      ...doc,
      adjustToStudent: false,
    });
    // Metas que voltam como abriram (o meio das faixas) mantêm as faixas do plano.
    const ranges = keepRanges(doc.targets, latest);
    if (ranges) snap.ranges = pickRanges(ranges);
    const foods = await loadBaseFoods(this.prisma, snapshotFoodIds(snap));
    const plano = buildNutritionSendInput(snap, foods, { note: latest.note });
    plano.applyGoals = latest.applyGoals;
    const changeNote = input.changeNote?.trim()
      ? input.changeNote.trim().slice(0, MAX_CHANGE_NOTE)
      : null;
    const r = await this.plans.writeCopyVersion(
      // Autor que apagou a conta: quem edita assume a linhagem.
      latest.authorId ?? viewerId,
      { userId: subjectId, groupId },
      plano,
      {
        sourceTemplateId: latest.sourceTemplateId,
        changeNote,
        editedById: viewerId,
        baseVersionId: input.baseVersionId,
      },
    );
    if (input.notify !== false) {
      const editor = await this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { name: true },
      });
      this.notifications.notify(
        [subjectId],
        nutritionPlanSentNotice({ authorName: editor?.name ?? 'A equipe', update: true }),
      );
    }
    return { planId: r.plan.id, version: r.plan.version };
  }

  /**
   * O plano amarrado à pessoa da URL e à comunidade, e a porta de leitura de
   * Alimentação de quem olha (grava a trilha, inclusive a recusa). Plano de
   * outra pessoa ou de outra comunidade responde como inexistente.
   */
  private async resolve(
    viewerId: string,
    groupId: string,
    membershipId: string,
    planId: string,
    action: string,
  ) {
    const target = await resolveMemberTarget(
      this.prisma,
      viewerId,
      groupId,
      membershipId,
      'member.plans',
    );
    const plan = await this.prisma.nutritionPlan.findFirst({
      where: { id: planId, userId: target.subjectUserId, groupId },
      select: { authorId: true, sourceTemplateId: true },
    });
    if (!plan) throw new NotFoundException(PLAN_NOT_FOUND);
    const subjectId = await this.access.assertReadable(
      viewerId,
      membershipId,
      ShareScope.NUTRITION,
      action,
    );
    const latest = await this.prisma.nutritionPlan.findFirstOrThrow({
      where: {
        userId: subjectId,
        groupId,
        authorId: plan.authorId,
        sourceTemplateId: plan.sourceTemplateId,
      },
      orderBy: { version: 'desc' },
      include: COPY_INCLUDE,
    });
    return { latest, subjectId };
  }
}
