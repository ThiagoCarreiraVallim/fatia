import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupRole,
  MembershipStatus,
  PlanTemplateKind,
  Prisma,
  type GroupPlanTemplate,
  type GroupTip,
  type MediaFile,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { snapshotOf } from '../nutrition/helpers/meal-snapshot';
import { MealTemplateService } from '../nutrition/meal-template.service';
import { UserGoalsService } from '../nutrition/user-goals.service';
import { MediaService, type MediaView } from '../storage/media.service';
import { WorkoutPlanService } from '../workout/workout-plan.service';
import {
  NUTRITION_SNAPSHOT_VERSION,
  parseNutritionSnapshot,
  type NutritionGoals,
  type NutritionSnapshot,
  type SuggestedMealItem,
} from './nutrition-snapshot';
import { can } from './permissions';
import { PlanMaterializerService } from './plan-materializer.service';
import { buildPlanSnapshot, PLAN_SNAPSHOT_VERSION, planSnapshotSchema } from './plan-snapshot';

export const TIP_CATEGORIES = ['WORKOUT', 'NUTRITION', 'HABITS', 'GENERAL'] as const;
export type TipCategory = (typeof TIP_CATEGORIES)[number];
export const PLAN_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const MAX_TIP_BODY = 4000;

export interface TemplateMeta {
  title?: string;
  description?: string | null;
  level?: string | null;
  coverFileId?: string | null;
}

export interface CreateWorkoutTemplateInput extends TemplateMeta {
  planId: string;
}

export interface CreateNutritionTemplateInput extends TemplateMeta {
  title: string;
  goals?: NutritionGoals | null;
  mealTemplateIds?: string[];
}

export interface UpdateTemplateInput extends TemplateMeta {
  /** Treino: congela de novo a partir deste plano do autor. */
  planId?: string;
  /** Nutrição: troca metas e refeições do retrato. */
  goals?: NutritionGoals | null;
  mealTemplateIds?: string[];
}

export interface TipInput {
  title: string;
  body: string;
  category: TipCategory;
  imageFileId?: string | null;
}

export interface AdoptInput {
  /** Nutrição: aplicar as metas do plano às minhas. */
  applyGoals?: boolean;
  /** Nutrição: guardar as refeições sugeridas como refeições salvas. */
  saveMeals?: boolean;
}

/** Resumo de exercício no retrato, com o nome resolvido para a prévia. */
export interface TemplateExerciseView {
  name: string;
  muscleGroup: string | null;
  targetSets: number;
  targetReps: string;
}

export interface TemplateView {
  id: string;
  kind: PlanTemplateKind;
  title: string;
  description: string | null;
  level: string | null;
  cover: MediaView | null;
  authorName: string;
  publishedAt: Date | null;
  updatedAt: Date;
  /** Treino: os exercícios na ordem. Nutrição: vazio. */
  exercises: TemplateExerciseView[];
  /** Nutrição: as metas e as refeições sugeridas. */
  goals: NutritionGoals | null;
  meals: { name: string; mealType: string | null; kcal: number; items: SuggestedMealItem[] }[];
  /** Só para quem pergunta: o plano que ele já adotou deste modelo. */
  adoptedPlanId: string | null;
  /** Só para a equipe: dá para atualizar a partir do plano de origem. */
  sourcePlanId?: string | null;
  canEdit?: boolean;
}

export interface TipView {
  id: string;
  title: string;
  body: string;
  category: TipCategory;
  image: MediaView | null;
  pinned: boolean;
  authorName: string;
  publishedAt: Date | null;
  updatedAt: Date;
  canEdit?: boolean;
}

export interface AdoptResult {
  kind: PlanTemplateKind;
  /** Treino: o plano criado na conta de quem adotou. */
  planId: string | null;
  goalsApplied: boolean;
  /** Refeições salvas criadas agora. */
  mealsSaved: number;
  /** Já havia cópias das refeições deste plano; nada foi duplicado. */
  mealsAlreadySaved: boolean;
}

const TEMPLATE_INCLUDE = {
  cover: true,
  author: { select: { name: true } },
} satisfies Prisma.GroupPlanTemplateInclude;

const TIP_INCLUDE = {
  image: true,
  author: { select: { name: true } },
} satisfies Prisma.GroupTipInclude;

type TemplateRow = GroupPlanTemplate & { cover: MediaFile | null; author: { name: string } | null };
type TipRow = GroupTip & { image: MediaFile | null; author: { name: string } | null };

/** Autor que apagou a conta aparece como a equipe: o conteúdo é da comunidade. */
const TEAM_AUTHOR = 'Equipe';

/**
 * Planos prontos e dicas da comunidade (Fase 7a).
 *
 * **A equipe publica, o membro adota.** Publicar congela um retrato do plano do
 * autor; adotar copia o retrato para a conta de quem adota pelo
 * `PlanMaterializerService` — a mesma máquina da oferta do profissional —, e a
 * cópia é dela. Editar ou despublicar o modelo depois não mexe em cópia nenhuma.
 *
 * **Tudo é buscado com o `groupId` da URL.** `templateId` e `tipId` chegam por
 * input; um id de outra comunidade responde como inexistente, e para o membro
 * só existe o que está publicado.
 *
 * O guarda da rota confere o papel; este service confere de novo (associação
 * ativa e ação), porque também é chamado pelas tools MCP.
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: WorkoutPlanService,
    private readonly mealTemplates: MealTemplateService,
    private readonly goals: UserGoalsService,
    private readonly materializer: PlanMaterializerService,
    private readonly media: MediaService,
  ) {}

  // ---------------------------------------------------------------- equipe

  async listTemplatesForTeam(userId: string, groupId: string): Promise<TemplateView[]> {
    const eu = await this.assertPublisher(userId, groupId);
    const rows = await this.prisma.groupPlanTemplate.findMany({
      where: { groupId },
      include: TEMPLATE_INCLUDE,
      orderBy: [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { updatedAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.templateView(r, userId, eu)));
  }

  async getTemplateForTeam(userId: string, groupId: string, id: string): Promise<TemplateView> {
    const eu = await this.assertPublisher(userId, groupId);
    return this.templateView(await this.findTemplate(groupId, id), userId, eu);
  }

  /** Congela um plano de treino do próprio autor. Nasce rascunho. */
  async createWorkoutTemplate(
    userId: string,
    groupId: string,
    input: CreateWorkoutTemplateInput,
  ): Promise<TemplateView> {
    const eu = await this.assertPublisher(userId, groupId);
    // `findById` com o `userId` de quem publica: plano de outra pessoa é 404.
    const plano = await this.plans.findById(userId, input.planId);
    const snapshot = buildPlanSnapshot(plano);
    const coverFileId = await this.resolveCover(groupId, input.coverFileId);
    const row = await this.prisma.groupPlanTemplate.create({
      data: {
        groupId,
        authorId: userId,
        kind: PlanTemplateKind.WORKOUT,
        title: this.title(input.title ?? plano.name),
        description: this.description(input.description),
        level: this.level(input.level),
        coverFileId,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        snapshotVersion: PLAN_SNAPSHOT_VERSION,
        sourcePlanId: plano.id,
      },
      include: TEMPLATE_INCLUDE,
    });
    return this.templateView(row, userId, eu);
  }

  /** Metas e refeições salvas do próprio autor viram um plano de nutrição. */
  async createNutritionTemplate(
    userId: string,
    groupId: string,
    input: CreateNutritionTemplateInput,
  ): Promise<TemplateView> {
    const eu = await this.assertPublisher(userId, groupId);
    const snapshot = await this.buildNutrition(
      userId,
      input.goals ?? null,
      input.mealTemplateIds ?? [],
    );
    const coverFileId = await this.resolveCover(groupId, input.coverFileId);
    const row = await this.prisma.groupPlanTemplate.create({
      data: {
        groupId,
        authorId: userId,
        kind: PlanTemplateKind.NUTRITION,
        title: this.title(input.title),
        description: this.description(input.description),
        level: this.level(input.level),
        coverFileId,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        snapshotVersion: NUTRITION_SNAPSHOT_VERSION,
      },
      include: TEMPLATE_INCLUDE,
    });
    return this.templateView(row, userId, eu);
  }

  async updateTemplate(
    userId: string,
    groupId: string,
    id: string,
    input: UpdateTemplateInput,
  ): Promise<TemplateView> {
    const eu = await this.assertPublisher(userId, groupId);
    const atual = await this.findTemplate(groupId, id);
    this.assertCanEdit(eu, userId, atual.authorId);

    const data: Prisma.GroupPlanTemplateUpdateInput = {};
    if (input.title !== undefined) data.title = this.title(input.title);
    if (input.description !== undefined) data.description = this.description(input.description);
    if (input.level !== undefined) data.level = this.level(input.level);

    if (atual.kind === PlanTemplateKind.WORKOUT) {
      if (input.goals !== undefined || input.mealTemplateIds !== undefined) {
        throw new BadRequestException('Metas e refeições são de plano de nutrição.');
      }
      if (input.planId !== undefined) {
        const plano = await this.plans.findById(userId, input.planId);
        data.snapshot = buildPlanSnapshot(plano) as unknown as Prisma.InputJsonValue;
        data.snapshotVersion = PLAN_SNAPSHOT_VERSION;
        data.sourcePlanId = plano.id;
      }
    } else {
      if (input.planId !== undefined) {
        throw new BadRequestException('Plano de treino só entra em modelo de treino.');
      }
      if (input.goals !== undefined || input.mealTemplateIds !== undefined) {
        const anterior = parseNutritionSnapshot(atual.snapshot, true);
        const snapshot =
          input.mealTemplateIds !== undefined
            ? await this.buildNutrition(
                userId,
                input.goals !== undefined ? input.goals : anterior.goals,
                input.mealTemplateIds,
              )
            : this.checkNutrition({ ...anterior, goals: input.goals ?? null });
        data.snapshot = snapshot as unknown as Prisma.InputJsonValue;
      }
    }

    let descartar: string | null = null;
    if (input.coverFileId !== undefined && input.coverFileId !== atual.coverFileId) {
      const novo = await this.resolveCover(groupId, input.coverFileId);
      data.cover = novo ? { connect: { id: novo } } : { disconnect: true };
      descartar = atual.coverFileId;
    }

    const row = await this.prisma.groupPlanTemplate.update({
      where: { id: atual.id },
      data,
      include: TEMPLATE_INCLUDE,
    });
    await this.media.discardById(descartar);
    return this.templateView(row, userId, eu);
  }

  async setTemplatePublished(
    userId: string,
    groupId: string,
    id: string,
    published: boolean,
  ): Promise<TemplateView> {
    const eu = await this.assertPublisher(userId, groupId);
    const atual = await this.findTemplate(groupId, id);
    this.assertCanEdit(eu, userId, atual.authorId);
    const row = await this.prisma.groupPlanTemplate.update({
      where: { id: atual.id },
      // Republicar não muda a data: "novo" na lista do membro é o que estreou agora.
      data: { publishedAt: published ? (atual.publishedAt ?? new Date()) : null },
      include: TEMPLATE_INCLUDE,
    });
    return this.templateView(row, userId, eu);
  }

  /** Apaga o modelo. As cópias adotadas continuam, só perdem a proveniência. */
  async deleteTemplate(userId: string, groupId: string, id: string): Promise<{ id: string }> {
    const eu = await this.assertPublisher(userId, groupId);
    const atual = await this.findTemplate(groupId, id);
    this.assertCanEdit(eu, userId, atual.authorId);
    await this.prisma.groupPlanTemplate.delete({ where: { id: atual.id } });
    await this.media.discardById(atual.coverFileId);
    return { id: atual.id };
  }

  async listTipsForTeam(userId: string, groupId: string): Promise<TipView[]> {
    const eu = await this.assertPublisher(userId, groupId);
    const rows = await this.prisma.groupTip.findMany({
      where: { groupId },
      include: TIP_INCLUDE,
      orderBy: [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { updatedAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.tipView(r, userId, eu)));
  }

  async createTip(userId: string, groupId: string, input: TipInput): Promise<TipView> {
    const eu = await this.assertPublisher(userId, groupId);
    const imageFileId = await this.resolveCover(groupId, input.imageFileId);
    const row = await this.prisma.groupTip.create({
      data: {
        groupId,
        authorId: userId,
        ...this.tipFields(input),
        imageFileId,
      },
      include: TIP_INCLUDE,
    });
    return this.tipView(row, userId, eu);
  }

  async updateTip(
    userId: string,
    groupId: string,
    id: string,
    input: Partial<TipInput>,
  ): Promise<TipView> {
    const eu = await this.assertPublisher(userId, groupId);
    const atual = await this.findTip(groupId, id);
    this.assertCanEdit(eu, userId, atual.authorId);

    const data: Prisma.GroupTipUpdateInput = this.tipFields({
      title: input.title ?? atual.title,
      body: input.body ?? atual.body,
      category: input.category ?? (atual.category as TipCategory),
    });
    let descartar: string | null = null;
    if (input.imageFileId !== undefined && input.imageFileId !== atual.imageFileId) {
      const nova = await this.resolveCover(groupId, input.imageFileId);
      data.image = nova ? { connect: { id: nova } } : { disconnect: true };
      descartar = atual.imageFileId;
    }
    const row = await this.prisma.groupTip.update({
      where: { id: atual.id },
      data,
      include: TIP_INCLUDE,
    });
    await this.media.discardById(descartar);
    return this.tipView(row, userId, eu);
  }

  async setTipState(
    userId: string,
    groupId: string,
    id: string,
    state: { published?: boolean; pinned?: boolean },
  ): Promise<TipView> {
    const eu = await this.assertPublisher(userId, groupId);
    const atual = await this.findTip(groupId, id);
    this.assertCanEdit(eu, userId, atual.authorId);
    const row = await this.prisma.groupTip.update({
      where: { id: atual.id },
      data: {
        ...(state.published !== undefined
          ? { publishedAt: state.published ? (atual.publishedAt ?? new Date()) : null }
          : {}),
        ...(state.pinned !== undefined ? { pinned: state.pinned } : {}),
      },
      include: TIP_INCLUDE,
    });
    return this.tipView(row, userId, eu);
  }

  async deleteTip(userId: string, groupId: string, id: string): Promise<{ id: string }> {
    const eu = await this.assertPublisher(userId, groupId);
    const atual = await this.findTip(groupId, id);
    this.assertCanEdit(eu, userId, atual.authorId);
    await this.prisma.groupTip.delete({ where: { id: atual.id } });
    await this.media.discardById(atual.imageFileId);
    return { id: atual.id };
  }

  // ---------------------------------------------------------------- membro

  /** Planos publicados, para qualquer membro ativo. Rascunho não existe aqui. */
  async listTemplatesForMember(userId: string, groupId: string): Promise<TemplateView[]> {
    await this.assertMember(userId, groupId);
    const rows = await this.prisma.groupPlanTemplate.findMany({
      where: { groupId, publishedAt: { not: null } },
      include: TEMPLATE_INCLUDE,
      orderBy: { publishedAt: 'desc' },
    });
    return Promise.all(rows.map((r) => this.templateView(r, userId, null)));
  }

  async getTemplateForMember(userId: string, groupId: string, id: string): Promise<TemplateView> {
    await this.assertMember(userId, groupId);
    return this.templateView(await this.findTemplate(groupId, id, true), userId, null);
  }

  async listTipsForMember(userId: string, groupId: string): Promise<TipView[]> {
    await this.assertMember(userId, groupId);
    const rows = await this.prisma.groupTip.findMany({
      where: { groupId, publishedAt: { not: null } },
      include: TIP_INCLUDE,
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.tipView(r, userId, null)));
  }

  /**
   * Adota um plano publicado. Treino vira plano da pessoa (uma vez só: a
   * segunda tentativa responde 409 com o plano que ela já tem). Nutrição aplica
   * as metas **só se ela pedir** e guarda as refeições sugeridas como refeições
   * salvas dela, sem duplicar.
   */
  async adopt(
    userId: string,
    groupId: string,
    id: string,
    input: AdoptInput = {},
  ): Promise<AdoptResult> {
    await this.assertMember(userId, groupId);
    const modelo = await this.findTemplate(groupId, id, true);

    if (modelo.kind === PlanTemplateKind.WORKOUT) {
      const existente = await this.prisma.workoutPlan.findFirst({
        where: { userId, fromTemplateId: modelo.id },
        select: { id: true },
      });
      if (existente) {
        throw new ConflictException({
          message: 'Você já adotou este plano.',
          planId: existente.id,
        });
      }
      const plano = await this.materializer.materialize(userId, modelo.snapshot, modelo.id);
      return {
        kind: modelo.kind,
        planId: plano.id,
        goalsApplied: false,
        mealsSaved: 0,
        mealsAlreadySaved: false,
      };
    }

    const snap = parseNutritionSnapshot(modelo.snapshot, false);
    const applyGoals = input.applyGoals === true && snap.goals !== null;
    const saveMeals = input.saveMeals !== false && snap.meals.length > 0;
    if (!applyGoals && !saveMeals) {
      throw new BadRequestException('Escolha aplicar as metas ou salvar as refeições.');
    }

    let mealsSaved = 0;
    let mealsAlreadySaved = false;
    if (saveMeals) {
      const ja = await this.prisma.mealTemplate.count({
        where: { userId, fromTemplateId: modelo.id },
      });
      if (ja > 0) {
        mealsAlreadySaved = true;
      } else {
        const meals = await this.sanitizeMeals(snap.meals);
        for (const meal of meals) {
          await this.mealTemplates.createFromSuggestion(
            userId,
            { name: meal.name, mealType: meal.mealType, items: meal.items.map(snapshotOf) },
            modelo.id,
          );
          mealsSaved += 1;
        }
      }
    }
    if (applyGoals && snap.goals) await this.goals.upsert(userId, snap.goals);

    return {
      kind: modelo.kind,
      planId: null,
      goalsApplied: applyGoals,
      mealsSaved,
      mealsAlreadySaved,
    };
  }

  // ---------------------------------------------------------------- apoio

  private async membership(userId: string, groupId: string) {
    const m = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true, status: true },
    });
    // Não membro, pendente e grupo inexistente respondem igual (#92).
    if (!m || m.status !== MembershipStatus.ACTIVE) throw new NotFoundException('Group not found');
    return m;
  }

  private async assertMember(userId: string, groupId: string): Promise<GroupRole> {
    const m = await this.membership(userId, groupId);
    if (!can(m.role, 'content.read')) throw new ForbiddenException();
    return m.role;
  }

  private async assertPublisher(userId: string, groupId: string): Promise<GroupRole> {
    const m = await this.membership(userId, groupId);
    if (!can(m.role, 'content.publish')) {
      throw new ForbiddenException('Seu papel não publica conteúdo nesta comunidade');
    }
    return m.role;
  }

  /** O autor edita o que é dele; quem modera edita o de todo mundo. */
  private assertCanEdit(role: GroupRole, userId: string, authorId: string | null) {
    if (authorId === userId || can(role, 'content.moderate')) return;
    throw new ForbiddenException('Só quem publicou, ou o dono, muda este conteúdo');
  }

  private canEdit(role: GroupRole | null, userId: string, authorId: string | null): boolean {
    if (!role) return false;
    return authorId === userId || can(role, 'content.moderate');
  }

  private async findTemplate(groupId: string, id: string, onlyPublished = false) {
    const row = await this.prisma.groupPlanTemplate.findFirst({
      where: { id, groupId, ...(onlyPublished ? { publishedAt: { not: null } } : {}) },
      include: TEMPLATE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Plan template not found');
    return row;
  }

  private async findTip(groupId: string, id: string) {
    const row = await this.prisma.groupTip.findFirst({
      where: { id, groupId },
      include: TIP_INCLUDE,
    });
    if (!row) throw new NotFoundException('Tip not found');
    return row;
  }

  private async resolveCover(groupId: string, fileId: string | null | undefined) {
    if (!fileId) return null;
    return (await this.media.resolveForGroup(groupId, fileId, 'group_content')).id;
  }

  private title(raw: string): string {
    const t = raw.trim();
    if (!t) throw new BadRequestException('Dê um título.');
    if (t.length > 100) throw new BadRequestException('O título vai até 100 caracteres.');
    return t;
  }

  private description(raw: string | null | undefined): string | null {
    const d = raw?.trim() ?? '';
    if (d.length > 1000) throw new BadRequestException('A descrição vai até 1.000 caracteres.');
    return d || null;
  }

  private level(raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (!(PLAN_LEVELS as readonly string[]).includes(raw)) {
      throw new BadRequestException('Nível desconhecido.');
    }
    return raw;
  }

  private tipFields(input: TipInput) {
    const title = this.title(input.title);
    const body = input.body.trim();
    if (!body) throw new BadRequestException('Escreva a dica.');
    if (body.length > MAX_TIP_BODY) {
      throw new BadRequestException(
        `A dica vai até ${MAX_TIP_BODY.toLocaleString('pt-BR')} caracteres.`,
      );
    }
    if (!(TIP_CATEGORIES as readonly string[]).includes(input.category)) {
      throw new BadRequestException('Categoria desconhecida.');
    }
    return { title, body, category: input.category };
  }

  /** Monta o retrato da nutrição a partir das refeições salvas do autor. */
  private async buildNutrition(
    userId: string,
    goals: NutritionGoals | null,
    mealTemplateIds: string[],
  ): Promise<NutritionSnapshot> {
    const ids = [...new Set(mealTemplateIds)];
    const meals = [];
    for (const mealId of ids) {
      // `get` com o `userId` do autor: refeição de outra pessoa é 404.
      const t = await this.mealTemplates.get(userId, mealId);
      meals.push({
        name: t.name,
        mealType: t.mealType,
        items: t.items.map((i) => ({
          foodId: i.foodId,
          groupId: i.groupId,
          foodName: i.foodName,
          grams: i.grams,
          kcal: i.kcal,
          proteinG: i.proteinG,
          carbsG: i.carbsG,
          fatG: i.fatG,
          nutrients: (i.nutrients as Record<string, number> | null) ?? null,
          portionLabel: i.portionLabel,
          portionQuantity: i.portionQuantity,
        })),
      });
    }
    const snapshot = this.checkNutrition({ version: NUTRITION_SNAPSHOT_VERSION, goals, meals });
    return { ...snapshot, meals: await this.sanitizeMeals(snapshot.meals) };
  }

  private checkNutrition(raw: unknown): NutritionSnapshot {
    return parseNutritionSnapshot(raw, true);
  }

  /**
   * Alimento personalizado é de quem o criou: no retrato e na adoção, o item
   * só mantém `foodId` de alimento do catálogo público, e `groupId` de grupo
   * alimentar que existe. Na adoção isto roda de novo — o retrato veio de uma
   * coluna `Json`, e um id forjado não pode pôr o alimento de outra pessoa na
   * refeição salva de quem adota.
   */
  private async sanitizeMeals(
    meals: NutritionSnapshot['meals'],
  ): Promise<NutritionSnapshot['meals']> {
    const foodIds = [
      ...new Set(meals.flatMap((m) => m.items.flatMap((i) => (i.foodId ? [i.foodId] : [])))),
    ];
    const groupIds = [
      ...new Set(meals.flatMap((m) => m.items.flatMap((i) => (i.groupId ? [i.groupId] : [])))),
    ];
    const [publicos, grupos] = await Promise.all([
      foodIds.length
        ? this.prisma.food.findMany({
            where: { id: { in: foodIds }, createdByUserId: null },
            select: { id: true },
          })
        : [],
      groupIds.length
        ? this.prisma.foodGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true } })
        : [],
    ]);
    const foodOk = new Set(publicos.map((f) => f.id));
    const groupOk = new Set(grupos.map((g) => g.id));
    return meals.map((m) => ({
      ...m,
      items: m.items.map((i) => ({
        ...i,
        foodId: i.foodId && foodOk.has(i.foodId) ? i.foodId : null,
        groupId: i.groupId && groupOk.has(i.groupId) ? i.groupId : null,
      })),
    }));
  }

  private async templateView(
    row: TemplateRow,
    userId: string,
    teamRole: GroupRole | null,
  ): Promise<TemplateView> {
    const base = {
      id: row.id,
      kind: row.kind,
      title: row.title,
      description: row.description,
      level: row.level,
      cover: await this.media.viewOrNull(row.cover),
      authorName: row.author?.name ?? TEAM_AUTHOR,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      ...(teamRole
        ? { sourcePlanId: row.sourcePlanId, canEdit: this.canEdit(teamRole, userId, row.authorId) }
        : {}),
    };

    if (row.kind === PlanTemplateKind.WORKOUT) {
      const adotado = await this.prisma.workoutPlan.findFirst({
        where: { userId, fromTemplateId: row.id },
        select: { id: true },
      });
      return {
        ...base,
        exercises: await this.exercisesOf(row.snapshot),
        goals: null,
        meals: [],
        adoptedPlanId: adotado?.id ?? null,
      };
    }

    const snap = parseNutritionSnapshot(row.snapshot, false);
    return {
      ...base,
      exercises: [],
      goals: snap.goals,
      meals: snap.meals.map((m) => ({
        name: m.name,
        mealType: m.mealType,
        kcal: Math.round(m.items.reduce((s, i) => s + i.kcal, 0)),
        items: m.items,
      })),
      adoptedPlanId: null,
    };
  }

  /** Os exercícios do retrato com nome, para a prévia. Retrato inválido mostra lista vazia. */
  private async exercisesOf(snapshot: unknown): Promise<TemplateExerciseView[]> {
    const parsed = planSnapshotSchema.safeParse(snapshot);
    if (!parsed.success) return [];
    const ids = parsed.data.exercises.flatMap((e) =>
      e.source === 'catalog' ? [e.catalogExerciseId] : [],
    );
    const catalogo = ids.length
      ? await this.prisma.exercise.findMany({
          where: { id: { in: ids }, createdByUserId: null },
          select: { id: true, name: true, muscleGroup: true },
        })
      : [];
    const porId = new Map(catalogo.map((e) => [e.id, e]));
    return [...parsed.data.exercises]
      .sort((a, b) => a.order - b.order)
      .map((e) => {
        const ex =
          e.source === 'catalog'
            ? porId.get(e.catalogExerciseId)
            : { name: e.exercise.name, muscleGroup: e.exercise.muscleGroup };
        return {
          name: ex?.name ?? 'Exercício',
          muscleGroup: ex?.muscleGroup ?? null,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
        };
      });
  }

  private async tipView(row: TipRow, userId: string, teamRole: GroupRole | null): Promise<TipView> {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      category: row.category as TipCategory,
      image: await this.media.viewOrNull(row.image),
      pinned: row.pinned,
      authorName: row.author?.name ?? TEAM_AUTHOR,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      ...(teamRole ? { canEdit: this.canEdit(teamRole, userId, row.authorId) } : {}),
    };
  }
}
