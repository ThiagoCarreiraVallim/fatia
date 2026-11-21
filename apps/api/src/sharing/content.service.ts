import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AutoPostKind,
  GroupRole,
  MembershipStatus,
  PlanTemplateKind,
  Prisma,
  type GroupPlanTemplate,
  type GroupTip,
  type MediaFile,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { publishAutoPost } from './auto-post';
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
import {
  assertCanEditContent,
  authorRoles,
  canEditContent,
  requireContentRole,
} from './content-roles';
import { CATALOG_EXERCISE } from '../workout/helpers/exercise-access';
import { PlanMaterializerService } from './plan-materializer.service';
import { buildPlanSnapshot, PLAN_SNAPSHOT_VERSION } from './plan-snapshot';
import {
  MAX_PLAN_TAGS,
  MAX_TAG_LENGTH,
  parsePlanSnapshot,
  PLAN_SNAPSHOT_V2,
  sessionExercises,
  sessionLetter,
} from './plan-snapshot-v2';
import {
  documentToSnapshot,
  parsePlanDocument,
  snapshotToDocument,
  type PlanDocumentView,
} from './plan-document';
import {
  documentToNutritionSnapshot,
  keepRanges,
  legacyNutritionView,
  NUTRITION_SNAPSHOT_V2,
  nutritionDocumentView,
  parseNutritionDocument,
  readNutritionSnapshot,
  type NutritionDocumentView,
} from './nutrition-document';
import { assertDay } from '../common/dates';

/**
 * As quatro da prancha Pn-10 (treino, nutrição, hábitos, recuperação) e a
 * `GENERAL` de antes da #408, que segue valendo para as dicas antigas.
 */
export const TIP_CATEGORIES = ['WORKOUT', 'NUTRITION', 'HABITS', 'RECOVERY', 'GENERAL'] as const;
export type TipCategory = (typeof TIP_CATEGORIES)[number];
export const PLAN_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
/** O texto da dica (#408, Pn-10: "156 de 600 caracteres"). */
export const MAX_TIP_BODY = 600;
/**
 * O teto de antes da #408. A dica antiga mais longa continua salvando enquanto
 * o texto não muda; mudar o texto passa a valer os 600.
 */
export const MAX_TIP_BODY_LEGACY = 4000;

export interface TemplateMeta {
  /** Rascunho (#405): não vai para a comunidade nem é enviado. */
  draft?: boolean;
  title?: string;
  description?: string | null;
  level?: string | null;
  coverFileId?: string | null;
}

/** O que o editor de treino (#406, Pn-09) grava além do título e do nível. */
export interface WorkoutPlanFields {
  /** O plano inteiro do editor: sessões, exercícios e circuitos. */
  document?: unknown;
  tags?: string[];
  schedule?: 'CALENDAR' | 'FLEXIBLE' | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface CreateWorkoutTemplateInput extends TemplateMeta, WorkoutPlanFields {
  /** "A partir do seu plano": congela um plano do autor. Sem ele, vem o `document`. */
  planId?: string;
}

export interface CreateNutritionTemplateInput extends TemplateMeta {
  title: string;
  /** O editor (#407, Pn-24): metas, refeições com opções e grupos de equivalentes. */
  document?: unknown;
  /** Fase 7: metas em faixa e refeições salvas do autor. Sem `document`. */
  goals?: NutritionGoals | null;
  mealTemplateIds?: string[];
}

export interface TemplateReach {
  band: 'none' | 'few' | 'many';
  count: number | null;
}

export interface UpdateTemplateInput extends TemplateMeta, WorkoutPlanFields {
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
  /**
   * O exercício do catálogo geral ou da comunidade, para o atalho "guia" (#396).
   * `null` no exercício próprio do autor: o membro não abre o de outra pessoa.
   */
  exerciseId: number | null;
  /** A comunidade tem guia dela (vídeo, fotos, dica) para este exercício. */
  hasGuide: boolean;
  name: string;
  muscleGroup: string | null;
  targetSets: number;
  targetReps: string;
  /** Sessão do plano (#406): "A · Legs". Nulo no plano de uma sessão só. */
  session: string | null;
}

export interface TemplateView {
  id: string;
  kind: PlanTemplateKind;
  title: string;
  description: string | null;
  level: string | null;
  cover: MediaView | null;
  authorName: string;
  /** O papel de hoje do autor nesta comunidade (#396): "Bruno (dono)". `null` se saiu. */
  authorRole: GroupRole | null;
  publishedAt: Date | null;
  /** Rascunho (#405): só a equipe vê e ainda não se envia. */
  draft?: boolean;
  /**
   * "Com quem" (#405), só para a equipe: pessoas distintas com uma cópia
   * (adotou ou recebeu). Abaixo de 5 pessoas o número não sai.
   */
  withWhom?: TemplateReach;
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
  /** Treino (#406): etiquetas, agenda × sequência e período sugerido. */
  tags: string[];
  schedule: 'CALENDAR' | 'FLEXIBLE' | null;
  startDate: string | null;
  endDate: string | null;
  /** Quantas sessões o plano de treino tem. */
  sessionCount: number;
  /** Só para a equipe, no treino: o plano inteiro para o editor. */
  document?: PlanDocumentView | null;
  /** Só para a equipe, na alimentação (#407): o plano inteiro para o editor. */
  nutritionDocument?: NutritionDocumentView | null;
}

/** Um grupo da tela Modelos (Al-T23): a comunidade e os modelos de treino dela. */
export interface WorkoutTemplatesByGroup {
  group: { id: string; name: string };
  templates: Array<{
    id: string;
    title: string;
    level: string | null;
    authorName: string;
    exerciseCount: number;
    setCount: number;
    adoptedPlanId: string | null;
  }>;
}

export interface TipView {
  id: string;
  title: string;
  body: string;
  category: TipCategory;
  image: MediaView | null;
  pinned: boolean;
  authorName: string;
  /** O papel de hoje do autor nesta comunidade (#396). `null` se saiu. */
  authorRole: GroupRole | null;
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
  /**
   * As metas que valiam antes da troca (#396), para o "antes → depois" de quem
   * confirmou. Ficam também no histórico de metas. `null` sem troca ou sem metas antes.
   */
  previousGoals: NutritionGoals | null;
  /** As metas de antes foram para o histórico (havia metas e alguma mudou). */
  goalsHistoryWritten: boolean;
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

/** As oito faixas de macro das metas, sem água, passos e treinos. */
function macrosOf(g: NutritionGoals): NutritionGoals {
  return {
    kcalMin: g.kcalMin,
    kcalMax: g.kcalMax,
    proteinMinG: g.proteinMinG,
    proteinMaxG: g.proteinMaxG,
    carbsMinG: g.carbsMinG,
    carbsMaxG: g.carbsMaxG,
    fatMinG: g.fatMinG,
    fatMaxG: g.fatMaxG,
  };
}

/** "Com quem" (#405): abaixo disto o número não sai, como nos agregados do painel. */
export const REACH_MIN_CELL = 5;

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
    const papeis = await authorRoles(
      this.prisma,
      groupId,
      rows.map((r) => r.authorId),
    );
    const alcance = await this.reachOf(rows.map((r) => r.id));
    return Promise.all(
      rows.map(async (r) => ({
        ...(await this.templateView(r, userId, eu, papeis)),
        withWhom: alcance.get(r.id) ?? { band: 'none' as const, count: null },
      })),
    );
  }

  /**
   * "Com quem" (#405, Pn-08): pessoas distintas com uma cópia de cada modelo,
   * adotada na comunidade ou recebida da equipe (treino ou alimentação). É só
   * uma contagem: abaixo de 5 pessoas o número não sai, e nunca sai quem.
   * Oferta apagada da pessoa (#402) e plano alimentar cancelado antes do
   * aceite não contam.
   */
  private async reachOf(templateIds: string[]): Promise<Map<string, TemplateReach>> {
    const out = new Map<string, TemplateReach>();
    if (templateIds.length === 0) return out;
    const ids = { in: templateIds };
    const [adotados, ofertas, refeicoes, alimentares] = await Promise.all([
      this.prisma.workoutPlan.findMany({
        where: { fromTemplateId: ids },
        select: { fromTemplateId: true, userId: true },
      }),
      this.prisma.planOffer.findMany({
        where: { sourceTemplateId: ids, removedAt: null },
        select: { sourceTemplateId: true, userId: true },
      }),
      this.prisma.mealTemplate.findMany({
        where: { fromTemplateId: ids },
        select: { fromTemplateId: true, userId: true },
      }),
      this.prisma.nutritionPlan.findMany({
        where: {
          sourceTemplateId: ids,
          OR: [{ status: { not: 'SUPERSEDED' } }, { acceptedAt: { not: null } }],
        },
        select: { sourceTemplateId: true, userId: true },
      }),
    ]);
    const pessoas = new Map<string, Set<string>>();
    const conta = (templateId: string | null, userId: string) => {
      if (!templateId) return;
      const set = pessoas.get(templateId) ?? new Set<string>();
      set.add(userId);
      pessoas.set(templateId, set);
    };
    for (const r of adotados) conta(r.fromTemplateId, r.userId);
    for (const r of ofertas) conta(r.sourceTemplateId, r.userId);
    for (const r of refeicoes) conta(r.fromTemplateId, r.userId);
    for (const r of alimentares) conta(r.sourceTemplateId, r.userId);
    for (const id of templateIds) {
      const n = pessoas.get(id)?.size ?? 0;
      out.set(
        id,
        n === 0
          ? { band: 'none', count: null }
          : n < REACH_MIN_CELL
            ? { band: 'few', count: null }
            : { band: 'many', count: n },
      );
    }
    return out;
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
    if (Boolean(input.planId) === (input.document !== undefined)) {
      throw new BadRequestException(
        'Monte o plano no editor ou escolha um plano seu, um dos dois.',
      );
    }
    let snapshot: unknown;
    let snapshotVersion = PLAN_SNAPSHOT_V2;
    let title = input.title ?? '';
    let sourcePlanId: string | null = null;
    if (input.planId) {
      // `findById` com o `userId` de quem publica: plano de outra pessoa é 404.
      const plano = await this.plans.findById(userId, input.planId);
      snapshot = buildPlanSnapshot(plano, groupId);
      snapshotVersion = PLAN_SNAPSHOT_VERSION;
      title = input.title ?? plano.name;
      sourcePlanId = plano.id;
    } else {
      snapshot = await documentToSnapshot(
        this.prisma,
        parsePlanDocument(input.document),
        this.title(title),
        { editorId: userId, groupId, groupByValue: false },
      );
    }
    const coverFileId = await this.resolveCover(groupId, input.coverFileId);
    const row = await this.prisma.groupPlanTemplate.create({
      data: {
        groupId,
        authorId: userId,
        kind: PlanTemplateKind.WORKOUT,
        title: this.title(title),
        description: this.description(input.description),
        level: this.level(input.level),
        coverFileId,
        snapshot: snapshot as Prisma.InputJsonValue,
        snapshotVersion,
        sourcePlanId,
        draft: input.draft === true,
        ...this.workoutFields(input),
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
    let snapshot: unknown;
    let snapshotVersion = NUTRITION_SNAPSHOT_VERSION;
    if (input.document !== undefined) {
      if (input.goals !== undefined || input.mealTemplateIds !== undefined) {
        throw new BadRequestException(
          'Monte o plano no editor ou use metas e refeições salvas, um dos dois.',
        );
      }
      // O editor (#407): metas, refeições com opções e grupos de equivalentes.
      snapshot = await documentToNutritionSnapshot(
        this.prisma,
        parseNutritionDocument(input.document),
      );
      snapshotVersion = NUTRITION_SNAPSHOT_V2;
    } else {
      snapshot = await this.buildNutrition(
        userId,
        input.goals ?? null,
        input.mealTemplateIds ?? [],
      );
    }
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
        snapshot: snapshot as Prisma.InputJsonValue,
        snapshotVersion,
        draft: input.draft === true,
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
    if (input.draft !== undefined) {
      // Rascunho nunca está na comunidade (o banco também confere).
      if (input.draft && atual.publishedAt) {
        throw new ConflictException('Tire da comunidade antes de voltar o plano a rascunho.');
      }
      data.draft = input.draft;
    }
    if (input.title !== undefined) data.title = this.title(input.title);
    if (input.description !== undefined) data.description = this.description(input.description);
    if (input.level !== undefined) data.level = this.level(input.level);

    if (atual.kind === PlanTemplateKind.WORKOUT) {
      if (input.goals !== undefined || input.mealTemplateIds !== undefined) {
        throw new BadRequestException('Metas e refeições são de plano de nutrição.');
      }
      if (input.planId !== undefined && input.document !== undefined) {
        throw new BadRequestException('Mande o plano do editor ou um plano seu, um dos dois.');
      }
      if (input.planId !== undefined) {
        const plano = await this.plans.findById(userId, input.planId);
        data.snapshot = buildPlanSnapshot(plano, groupId) as unknown as Prisma.InputJsonValue;
        data.snapshotVersion = PLAN_SNAPSHOT_VERSION;
        data.sourcePlanId = plano.id;
      }
      if (input.document !== undefined) {
        // O editor (#406) grava o retrato direto; o plano de origem deixa de valer.
        data.snapshot = (await documentToSnapshot(
          this.prisma,
          parsePlanDocument(input.document),
          this.title(input.title ?? atual.title),
          { editorId: userId, groupId, groupByValue: false },
        )) as unknown as Prisma.InputJsonValue;
        data.snapshotVersion = PLAN_SNAPSHOT_V2;
        data.sourcePlanId = null;
      } else if (input.title !== undefined && atual.snapshotVersion === PLAN_SNAPSHOT_V2) {
        // O nome do retrato acompanha o título (é o nome do plano na conta de quem recebe).
        const snap = parsePlanSnapshot(atual.snapshot);
        if (snap)
          data.snapshot = { ...snap, name: this.title(input.title) } as Prisma.InputJsonValue;
      }
      Object.assign(data, this.workoutFields(input));
    } else {
      if (input.planId !== undefined) {
        throw new BadRequestException('Plano de treino só entra em modelo de treino.');
      }
      if (
        input.tags !== undefined ||
        input.schedule !== undefined ||
        input.startDate !== undefined ||
        input.endDate !== undefined
      ) {
        throw new BadRequestException('Etiquetas, agenda e período são do plano de treino.');
      }
      const legado = input.goals !== undefined || input.mealTemplateIds !== undefined;
      if (input.document !== undefined) {
        if (legado) {
          throw new BadRequestException(
            'Mande o plano do editor ou metas e refeições salvas, um dos dois.',
          );
        }
        const doc = parseNutritionDocument(input.document);
        const snap = await documentToNutritionSnapshot(this.prisma, doc);
        // O editor reabre as faixas pelo meio delas: metas que voltam iguais
        // mantêm as faixas exatas do modelo (as que o autor v1 escreveu).
        const ranges = keepRanges(doc.targets, storedRanges(atual.snapshot));
        if (ranges) snap.ranges = ranges;
        data.snapshot = snap as unknown as Prisma.InputJsonValue;
        data.snapshotVersion = NUTRITION_SNAPSHOT_V2;
      } else if (legado && atual.snapshotVersion === NUTRITION_SNAPSHOT_V2) {
        // O retrato do editor não volta ao formato da Fase 7 por um PATCH parcial.
        throw new BadRequestException('Este plano é do editor: mande o plano inteiro.');
      } else if (legado) {
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
    opts: { announce?: boolean } = {},
  ): Promise<TemplateView> {
    const eu = await this.assertPublisher(userId, groupId);
    const atual = await this.findTemplate(groupId, id);
    this.assertCanEdit(eu, userId, atual.authorId);
    if (published && atual.draft) {
      throw new ConflictException('Termine o rascunho antes de publicar na comunidade.');
    }
    const row = await this.prisma.groupPlanTemplate.update({
      where: { id: atual.id },
      // Republicar não muda a data: "novo" na lista do membro é o que estreou agora.
      data: { publishedAt: published ? (atual.publishedAt ?? new Date()) : null },
      include: TEMPLATE_INCLUDE,
    });
    // "Anunciar no mural" (Pn-08c): ligado posta mesmo com o post automático
    // de plano desligado; desligado não posta; sem a escolha, vale a configuração.
    if (published && !atual.publishedAt && opts.announce !== false) {
      await publishAutoPost(this.prisma, {
        groupId,
        actorUserId: userId,
        kind: AutoPostKind.PLAN,
        refId: row.id,
        title: row.title,
        meta: row.kind === PlanTemplateKind.WORKOUT ? 'plano de treino' : 'plano alimentar',
        force: opts.announce === true,
      });
    }
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
    const papeis = await authorRoles(
      this.prisma,
      groupId,
      rows.map((r) => r.authorId),
    );
    return Promise.all(rows.map((r) => this.tipView(r, userId, eu, papeis)));
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

    const data: Prisma.GroupTipUpdateInput = this.tipFields(
      {
        title: input.title ?? atual.title,
        body: input.body ?? atual.body,
        category: input.category ?? (atual.category as TipCategory),
      },
      atual.body,
    );
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
    opts: { announce?: boolean } = {},
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
    // "Anunciar no mural" (#408, Pn-10), como na #405: true força o post,
    // false não posta, ausente segue o `autoPosts` da comunidade.
    if (state.published && !atual.publishedAt && opts.announce !== false) {
      await publishAutoPost(this.prisma, {
        groupId,
        actorUserId: userId,
        force: opts.announce === true,
        kind: AutoPostKind.TIP,
        refId: row.id,
        title: row.title,
        meta: row.category ? String(row.category).toLowerCase() : null,
      });
    }
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
    const papeis = await authorRoles(
      this.prisma,
      groupId,
      rows.map((r) => r.authorId),
    );
    return Promise.all(rows.map((r) => this.templateView(r, userId, null, papeis)));
  }

  /**
   * Os modelos de treino publicados de todas as comunidades em que a pessoa é
   * membro ativo, agrupados por comunidade (Al-T23, #379). Só a lista: o
   * detalhe e a adoção continuam pela comunidade do modelo.
   */
  async listWorkoutTemplatesForMe(userId: string): Promise<WorkoutTemplatesByGroup[]> {
    const memberships = await this.prisma.groupMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      select: { group: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    if (memberships.length === 0) return [];
    const groupIds = memberships.map((m) => m.group.id);
    const rows = await this.prisma.groupPlanTemplate.findMany({
      where: {
        groupId: { in: groupIds },
        kind: PlanTemplateKind.WORKOUT,
        publishedAt: { not: null },
      },
      include: { author: { select: { name: true } } },
      orderBy: { publishedAt: 'desc' },
    });
    const adopted = await this.prisma.workoutPlan.findMany({
      where: { userId, fromTemplateId: { in: rows.map((r) => r.id) } },
      select: { id: true, fromTemplateId: true },
      // Modelo com sessões vira um plano por sessão: o adotado é o da sessão A.
      orderBy: [{ sessionIndex: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    });
    const adoptedOf = new Map<string | null, string>();
    for (const p of adopted) {
      if (!adoptedOf.has(p.fromTemplateId)) adoptedOf.set(p.fromTemplateId, p.id);
    }
    return memberships
      .map(({ group }) => ({
        group,
        templates: rows
          .filter((r) => r.groupId === group.id)
          .map((r) => {
            const snap = parsePlanSnapshot(r.snapshot);
            const items = snap ? snap.sessions.flatMap(sessionExercises) : [];
            return {
              id: r.id,
              title: r.title,
              level: r.level,
              authorName: r.author?.name ?? TEAM_AUTHOR,
              exerciseCount: items.length,
              setCount: items.reduce((n, e) => n + e.targetSets, 0),
              adoptedPlanId: adoptedOf.get(r.id) ?? null,
            };
          }),
      }))
      .filter((g) => g.templates.length > 0);
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
    const papeis = await authorRoles(
      this.prisma,
      groupId,
      rows.map((r) => r.authorId),
    );
    return Promise.all(rows.map((r) => this.tipView(r, userId, null, papeis)));
  }

  /** Uma dica publicada (Cm-15, #396), buscada com o `groupId` da URL. */
  async getTipForMember(userId: string, groupId: string, id: string): Promise<TipView> {
    await this.assertMember(userId, groupId);
    const row = await this.prisma.groupTip.findFirst({
      where: { id, groupId, publishedAt: { not: null } },
      include: TIP_INCLUDE,
    });
    if (!row) throw new NotFoundException('Tip not found');
    return this.tipView(row, userId, null);
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
      const plano = await this.materializer.materialize(
        userId,
        modelo.snapshot,
        modelo.id,
        modelo.groupId,
      );
      return {
        kind: modelo.kind,
        planId: plano.id,
        goalsApplied: false,
        mealsSaved: 0,
        mealsAlreadySaved: false,
        previousGoals: null,
        goalsHistoryWritten: false,
      };
    }

    // v1 como foi gravado; v2 (#407) pela primeira opção de cada refeição.
    const snap = legacyNutritionView(modelo.snapshot);
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
    let previousGoals: NutritionGoals | null = null;
    let goalsHistoryWritten = false;
    if (applyGoals && snap.goals) {
      // O "antes" vem da mesma transação que troca e grava o histórico.
      const r = await this.goals.upsert(userId, snap.goals, {
        source: 'group_plan',
        templateId: modelo.id,
        templateTitle: modelo.title,
      });
      previousGoals = r.previous ? macrosOf(r.previous) : null;
      goalsHistoryWritten = r.historyWritten;
    }

    return {
      kind: modelo.kind,
      planId: null,
      goalsApplied: applyGoals,
      mealsSaved,
      mealsAlreadySaved,
      previousGoals,
      goalsHistoryWritten,
    };
  }

  // ---------------------------------------------------------------- apoio

  private assertMember(userId: string, groupId: string): Promise<GroupRole> {
    return requireContentRole(this.prisma, userId, groupId, 'content.read', 'Forbidden');
  }

  private assertPublisher(userId: string, groupId: string): Promise<GroupRole> {
    return requireContentRole(this.prisma, userId, groupId, 'content.publish');
  }

  private assertCanEdit(role: GroupRole, userId: string, authorId: string | null) {
    assertCanEditContent(role, userId, authorId);
  }

  private canEdit(role: GroupRole | null, userId: string, authorId: string | null): boolean {
    return canEditContent(role, userId, authorId);
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

  private async authorRole(
    groupId: string,
    authorId: string | null,
    papeis?: Map<string, GroupRole>,
  ): Promise<GroupRole | null> {
    if (!authorId) return null;
    if (papeis) return papeis.get(authorId) ?? null;
    return (await authorRoles(this.prisma, groupId, [authorId])).get(authorId) ?? null;
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

  /** `previousBody`: o texto que já estava, que pode passar dos 600 se não mudar. */
  private tipFields(input: TipInput, previousBody?: string) {
    const title = this.title(input.title);
    const body = input.body.trim();
    if (!body) throw new BadRequestException('Escreva a dica.');
    const antigo = previousBody !== undefined && body === previousBody.trim();
    if (body.length > (antigo ? MAX_TIP_BODY_LEGACY : MAX_TIP_BODY)) {
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

  /** `papeis`: os papéis dos autores já buscados em lote pela lista (#396). */
  private async templateView(
    row: TemplateRow,
    userId: string,
    teamRole: GroupRole | null,
    papeis?: Map<string, GroupRole>,
  ): Promise<TemplateView> {
    // O plano inteiro do editor só sai no detalhe (#406), não na lista.
    const withDocument = papeis === undefined;
    const base = {
      id: row.id,
      kind: row.kind,
      title: row.title,
      description: row.description,
      level: row.level,
      cover: await this.media.viewOrNull(row.cover),
      authorName: row.author?.name ?? TEAM_AUTHOR,
      authorRole: await this.authorRole(row.groupId, row.authorId, papeis),
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      tags: row.tags,
      schedule: row.schedule,
      startDate: row.startDate,
      endDate: row.endDate,
      sessionCount: 0,
      ...(teamRole
        ? {
            draft: row.draft,
            sourcePlanId: row.sourcePlanId,
            canEdit: this.canEdit(teamRole, userId, row.authorId),
          }
        : {}),
    };

    if (row.kind === PlanTemplateKind.WORKOUT) {
      const adotado = await this.prisma.workoutPlan.findFirst({
        where: { userId, fromTemplateId: row.id },
        orderBy: { sessionIndex: { sort: 'asc', nulls: 'first' } },
        select: { id: true },
      });
      const snap = parsePlanSnapshot(row.snapshot);
      return {
        ...base,
        sessionCount: snap?.sessions.length ?? 0,
        ...(teamRole && withDocument
          ? { document: snap ? await snapshotToDocument(this.prisma, snap, row.groupId) : null }
          : {}),
        exercises: await this.exercisesOf(row.snapshot, row.groupId),
        goals: null,
        meals: [],
        adoptedPlanId: adotado?.id ?? null,
      };
    }

    const snap = legacyNutritionView(row.snapshot);
    return {
      ...base,
      ...(teamRole && withDocument
        ? { nutritionDocument: nutritionDocumentView(readNutritionSnapshot(row.snapshot)) }
        : {}),
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
  private async exercisesOf(snapshot: unknown, groupId: string): Promise<TemplateExerciseView[]> {
    const snap = parsePlanSnapshot(snapshot);
    if (!snap) return [];
    const multi = snap.sessions.length > 1;
    const items = snap.sessions.flatMap((s, i) =>
      sessionExercises(s).map((e) => ({
        ...e,
        session: multi
          ? s.name.trim()
            ? `${sessionLetter(i)} · ${s.name.trim()}`
            : `Sessão ${sessionLetter(i)}`
          : null,
      })),
    );
    const ids = items.flatMap((e) => (e.source === 'catalog' ? [e.catalogExerciseId] : []));
    const daComunidade = items.flatMap((e) => (e.source === 'group' ? [e.groupExerciseId] : []));
    const catalogo =
      ids.length || daComunidade.length
        ? await this.prisma.exercise.findMany({
            where: {
              OR: [
                { id: { in: ids }, ...CATALOG_EXERCISE },
                { id: { in: daComunidade }, groupOwned: true, groupId },
              ],
            },
            select: { id: true, name: true, muscleGroup: true },
          })
        : [];
    const porId = new Map(catalogo.map((e) => [e.id, e]));
    const comGuia = new Set(
      catalogo.length
        ? (
            await this.prisma.groupExerciseGuide.findMany({
              where: { groupId, exerciseId: { in: catalogo.map((e) => e.id) } },
              select: { exerciseId: true },
            })
          ).map((g) => g.exerciseId)
        : [],
    );
    return items.map((e) => {
      const ex =
        e.source === 'catalog'
          ? porId.get(e.catalogExerciseId)
          : e.source === 'group'
            ? porId.get(e.groupExerciseId)
            : { id: null, name: e.exercise.name, muscleGroup: e.exercise.muscleGroup };
      const exerciseId = ex?.id ?? null;
      return {
        exerciseId,
        hasGuide: exerciseId !== null && comGuia.has(exerciseId),
        name: ex?.name ?? 'Exercício',
        muscleGroup: ex?.muscleGroup ?? null,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        session: e.session,
      };
    });
  }

  /** Etiquetas, agenda e período do editor (#406), conferidos. */
  private workoutFields(input: WorkoutPlanFields): {
    tags?: string[];
    schedule?: 'CALENDAR' | 'FLEXIBLE' | null;
    startDate?: string | null;
    endDate?: string | null;
  } {
    const data: ReturnType<ContentService['workoutFields']> = {};
    if (input.tags !== undefined) {
      const tags = [
        ...new Set(input.tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0)),
      ];
      if (tags.length > MAX_PLAN_TAGS || tags.some((t) => t.length > MAX_TAG_LENGTH)) {
        throw new BadRequestException(
          `Até ${MAX_PLAN_TAGS} etiquetas, de até ${MAX_TAG_LENGTH} letras.`,
        );
      }
      data.tags = tags;
    }
    if (input.schedule !== undefined) data.schedule = input.schedule;
    const start =
      input.startDate === undefined
        ? undefined
        : input.startDate && assertDay(input.startDate, 'startDate');
    const end =
      input.endDate === undefined
        ? undefined
        : input.endDate && assertDay(input.endDate, 'endDate');
    if (start && end && end < start) {
      throw new BadRequestException('O fim do período vem depois do começo.');
    }
    if (start !== undefined) data.startDate = start || null;
    if (end !== undefined) data.endDate = end || null;
    return data;
  }

  private async tipView(
    row: TipRow,
    userId: string,
    teamRole: GroupRole | null,
    papeis?: Map<string, GroupRole>,
  ): Promise<TipView> {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      category: row.category as TipCategory,
      image: await this.media.viewOrNull(row.image),
      pinned: row.pinned,
      authorName: row.author?.name ?? TEAM_AUTHOR,
      authorRole: await this.authorRole(row.groupId, row.authorId, papeis),
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      ...(teamRole ? { canEdit: this.canEdit(teamRole, userId, row.authorId) } : {}),
    };
  }
}

/** As faixas guardadas no retrato atual; retrato que não se lê não tem nenhuma. */
function storedRanges(raw: unknown) {
  try {
    return readNutritionSnapshot(raw).ranges;
  } catch {
    return undefined;
  }
}
