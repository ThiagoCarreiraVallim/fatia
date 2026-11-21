import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AutoPostKind,
  MembershipStatus,
  PlanLoadMode,
  Prisma,
  type Exercise,
  type GroupRole,
  type MediaFile,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { publishAutoPost } from './auto-post';
import { normalizeSearchText, rankByRelevance } from '../common/search-text';
import { MediaService, type MediaView } from '../storage/media.service';
import {
  BODYWEIGHT,
  cleanCustomEquipment,
  equipmentKey,
  GYM_EQUIPMENT,
  MAX_CUSTOM_EQUIPMENT,
  OTHER_EQUIPMENT,
} from '../workout/helpers/equipment';
import { CATALOG_EXERCISE } from '../workout/helpers/exercise-access';
import {
  assertCanEditContent,
  authorRoles,
  canEditContent,
  requireContentRole,
} from './content-roles';
import { parsePlanSnapshot, sessionExercises } from './plan-snapshot-v2';

/** Abaixo disto, "em N planos" não diz o número (como o "Com quem" da #405). */
const USAGE_MIN_CELL = 5;
const CATALOG_PAGE = 60;
const CATALOG_PAGE_MAX = 200;
const MAX_DEFAULT_SETS = 20;
const MAX_DEFAULT_REST = 900;
const REPS_PATTERN = /^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/;
const LOAD_MODES = Object.values(PlanLoadMode) as string[];

export const MAX_GUIDE_PHOTOS = 4;
export const MAX_GUIDE_TIPS = 2000;

/** Os campos de um exercício que a comunidade cria (os mesmos do exercício pessoal). */
export interface GroupExerciseInput {
  name: string;
  muscleGroup: string;
  equipment?: string | null;
  level?: string | null;
  mechanic?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
}

export interface GuideInput {
  videoFileId?: string | null;
  photoFileIds?: string[];
  tips?: string | null;
  /** "Como fazer" da casa (#408): um passo por item. */
  steps?: string[];
  commonMistakes?: string[];
  /** "Dá para fazer em casa": o selo DA CASA. */
  homeFriendly?: boolean;
  defaultSets?: number | null;
  defaultReps?: string | null;
  defaultRestSeconds?: number | null;
  defaultLoadMode?: PlanLoadMode | null;
}

export const MAX_GUIDE_STEPS = 12;
export const MAX_GUIDE_MISTAKES = 8;
export const MAX_GUIDE_LINE = 300;
/** O vídeo do exercício (#408): uma regra só, no guia e no editor. */
export const EXERCISE_VIDEO_MAX_SECONDS = 60;

/** O padrão ao entrar num plano (#408, Pn-11b). Nulo = o de sempre do editor. */
export interface PlanDefaults {
  sets: number | null;
  reps: string | null;
  restSeconds: number | null;
  loadMode: PlanLoadMode | null;
}

/** Filtros do catálogo da equipe (#408, Pn-11). */
export interface CatalogFilters {
  q?: string;
  muscle?: string;
  equipment?: string;
  /** Só o que dá para fazer em casa. */
  house?: boolean;
  /** Só os favoritos da equipe. */
  favorite?: boolean;
  limit?: number;
  offset?: number;
}

/** Uma linha do catálogo: o exercício e o que a comunidade pôs nele. */
export interface CatalogItem {
  exerciseId: number;
  name: string;
  muscleGroup: string;
  equipment: string | null;
  ownedByCommunity: boolean;
  favorite: boolean;
  homeFriendly: boolean;
  hasGuide: boolean;
  hasVideo: boolean;
  photoCount: number;
  hasTips: boolean;
  defaults: PlanDefaults | null;
}

export interface CatalogPage {
  equipment: string[];
  customEquipment: string[];
  /** O catálogo inteiro da comunidade (geral + da casa). */
  total: number;
  /** O que casa com os filtros. */
  count: number;
  /** Quantos casam por músculo e por equipamento, com os outros filtros. */
  facets: { muscles: Record<string, number>; equipment: Record<string, number> };
  items: CatalogItem[];
}

/** "Em N planos" (#408): os modelos da biblioteca e os planos dos membros. */
export interface ExerciseUsage {
  templates: number;
  plans: { band: 'none' | 'few' | 'many'; count: number | null };
}

export interface GroupExerciseView {
  exerciseId: number;
  name: string;
  muscleGroup: string;
  equipment: string | null;
  level: string | null;
  mechanic: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  /** Criado pela comunidade (e não um exercício do catálogo geral com tutorial dela). */
  ownedByCommunity: boolean;
  video: MediaView | null;
  photos: MediaView[];
  tips: string | null;
  authorName: string;
  /** O papel de hoje de quem escreveu, nesta comunidade (#396); `null` se saiu. */
  authorRole: GroupRole | null;
  updatedAt: Date;
  /** "Como fazer" da casa; vazio = os passos do exercício (`instructions`). */
  steps: string[];
  commonMistakes: string[];
  homeFriendly: boolean;
  defaults: PlanDefaults | null;
  /** Só para a equipe. */
  canEdit?: boolean;
  /** Só para a equipe: favorito da equipe. */
  favorite?: boolean;
  /** Só para a equipe: o exercício já tem guia da comunidade. */
  hasGuide?: boolean;
  /** Só para a equipe, no detalhe. */
  usage?: ExerciseUsage;
}

const GUIDE_INCLUDE = {
  exercise: true,
  video: true,
  photos: { include: { file: true }, orderBy: { order: 'asc' } },
  author: { select: { name: true } },
} satisfies Prisma.GroupExerciseGuideInclude;

type GuideRow = Prisma.GroupExerciseGuideGetPayload<{ include: typeof GUIDE_INCLUDE }>;

const TEAM_AUTHOR = 'Equipe';

/** O padrão no plano do guia; nulo quando nenhum campo foi preenchido. */
export function defaultsOf(g: {
  defaultSets: number | null;
  defaultReps: string | null;
  defaultRestSeconds: number | null;
  defaultLoadMode: PlanLoadMode | null;
}): PlanDefaults | null {
  if (
    g.defaultSets === null &&
    g.defaultReps === null &&
    g.defaultRestSeconds === null &&
    g.defaultLoadMode === null
  ) {
    return null;
  }
  return {
    sets: g.defaultSets,
    reps: g.defaultReps,
    restSeconds: g.defaultRestSeconds,
    loadMode: g.defaultLoadMode,
  };
}

/**
 * O catálogo de exercícios da comunidade (Fase 7b, ADR 030).
 *
 * Cada item é um **tutorial** (`GroupExerciseGuide`): vídeo, fotos e dicas da
 * comunidade por cima de um exercício — do catálogo geral ("o supino, do nosso
 * jeito") ou criado por ela ("a máquina da casa", `Exercise.groupOwned`).
 * Exercício criado pela comunidade sempre nasce com o tutorial dele, que é onde
 * fica o autor.
 *
 * Quem treina continua apontando para o mesmo `exerciseId`: o tutorial é
 * sobreposição, e por isso trocar o vídeo não mexe em plano nem em histórico
 * de ninguém.
 *
 * **Tudo é buscado com o `groupId` da URL.** `exerciseId` chega por input e é
 * inteiro sequencial: o exercício de outra comunidade responde como
 * inexistente (#92).
 */
@Injectable()
export class GroupExerciseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  // ---------------------------------------------------------------- equipe

  /**
   * O catálogo da equipe (#408, Pn-11): o catálogo geral inteiro mais o da
   * casa, com o que a comunidade pôs em cada um. Filtra em memória: são
   * algumas centenas de linhas, e as facetas precisam de todas.
   *
   * Ordem: favoritos da equipe, depois o que tem guia ou é da casa, depois o
   * resto; com termo, por relevância dentro de cada faixa.
   */
  async listForTeam(
    userId: string,
    groupId: string,
    filters: CatalogFilters = {},
  ): Promise<CatalogPage> {
    await requireContentRole(this.prisma, userId, groupId, 'content.publish');
    const [grupo, todos, guias, favoritos] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({
        where: { id: groupId },
        select: { equipment: true, customEquipment: true },
      }),
      this.prisma.exercise.findMany({
        where: this.visibleTo(groupId),
        select: {
          id: true,
          name: true,
          searchName: true,
          muscleGroup: true,
          equipment: true,
          groupOwned: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.groupExerciseGuide.findMany({
        where: { groupId },
        select: {
          exerciseId: true,
          videoFileId: true,
          tips: true,
          homeFriendly: true,
          defaultSets: true,
          defaultReps: true,
          defaultRestSeconds: true,
          defaultLoadMode: true,
          _count: { select: { photos: true } },
        },
      }),
      this.prisma.groupExerciseFavorite.findMany({
        where: { groupId },
        select: { exerciseId: true },
      }),
    ]);
    const guiaPor = new Map(guias.map((g) => [g.exerciseId, g]));
    const fav = new Set(favoritos.map((f) => f.exerciseId));
    const term = filters.q ? normalizeSearchText(filters.q) : '';
    const equip = filters.equipment ? equipmentKey(filters.equipment) : '';

    type Row = (typeof todos)[number];
    const passa = (e: Row, skip: 'muscle' | 'equipment' | null) =>
      (!term || e.searchName.includes(term)) &&
      (skip === 'muscle' || !filters.muscle || e.muscleGroup === filters.muscle) &&
      (skip === 'equipment' ||
        !equip ||
        (e.equipment !== null && equipmentKey(e.equipment) === equip)) &&
      (!filters.house || guiaPor.get(e.id)?.homeFriendly === true) &&
      (!filters.favorite || fav.has(e.id));

    const muscles: Record<string, number> = {};
    const equipment: Record<string, number> = {};
    for (const e of todos) {
      if (passa(e, 'muscle')) muscles[e.muscleGroup] = (muscles[e.muscleGroup] ?? 0) + 1;
      if (e.equipment && passa(e, 'equipment')) {
        equipment[e.equipment] = (equipment[e.equipment] ?? 0) + 1;
      }
    }

    const casam = todos.filter((e) => passa(e, null));
    const faixa = (e: Row) => (fav.has(e.id) ? 0 : guiaPor.has(e.id) || e.groupOwned ? 1 : 2);
    const ordenados = [0, 1, 2].flatMap((f) => {
      const daFaixa = casam.filter((e) => faixa(e) === f);
      return term ? rankByRelevance(daFaixa, term, (e) => e.name, daFaixa.length) : daFaixa;
    });
    const limit = Math.min(Math.max(filters.limit ?? CATALOG_PAGE, 1), CATALOG_PAGE_MAX);
    const offset = Math.max(filters.offset ?? 0, 0);

    return {
      equipment: grupo.equipment,
      customEquipment: grupo.customEquipment,
      total: todos.length,
      count: casam.length,
      facets: { muscles, equipment },
      items: ordenados.slice(offset, offset + limit).map((e) => {
        const g = guiaPor.get(e.id);
        return {
          exerciseId: e.id,
          name: e.name,
          muscleGroup: e.muscleGroup,
          equipment: e.equipment,
          ownedByCommunity: e.groupOwned,
          favorite: fav.has(e.id),
          homeFriendly: g?.homeFriendly ?? false,
          hasGuide: g !== undefined,
          hasVideo: Boolean(g?.videoFileId),
          photoCount: g?._count.photos ?? 0,
          hasTips: Boolean(g?.tips),
          defaults: g ? defaultsOf(g) : null,
        };
      }),
    };
  }

  /**
   * O exercício no painel (Pn-11b): com guia ou ainda sem (exercício do
   * catálogo geral que a equipe vai abrir agora), o favorito e "em N planos".
   */
  async getForTeam(
    userId: string,
    groupId: string,
    exerciseId: number,
  ): Promise<GroupExerciseView> {
    const eu = await requireContentRole(this.prisma, userId, groupId, 'content.publish');
    const ex = await this.findVisible(groupId, exerciseId);
    const [guia, favorito, usage] = await Promise.all([
      this.prisma.groupExerciseGuide.findUnique({
        where: { groupId_exerciseId: { groupId, exerciseId } },
        include: GUIDE_INCLUDE,
      }),
      this.prisma.groupExerciseFavorite.count({ where: { groupId, exerciseId } }),
      this.usage(groupId, exerciseId),
    ]);
    const base = guia ? await this.view(guia, userId, eu) : this.bareView(ex);
    return { ...base, favorite: favorito > 0, hasGuide: guia !== null, usage };
  }

  /** Exercício novo, só desta comunidade. Nasce com o tutorial (vazio ou não). */
  async create(
    userId: string,
    groupId: string,
    input: GroupExerciseInput & GuideInput,
  ): Promise<GroupExerciseView> {
    const eu = await requireContentRole(this.prisma, userId, groupId, 'content.publish');
    const equipment = await this.resolveEquipment(groupId, input.equipment);
    const midia = await this.resolveMedia(groupId, input);
    // Exercício e tutorial numa escrita só (`create` aninhado): exercício da
    // comunidade sem tutorial ficaria sem autor e sem como ser editado.
    let exercicio;
    try {
      exercicio = await this.prisma.exercise.create({
        data: {
          ...this.exerciseData({ ...input, equipment }),
          name: input.name.trim(),
          searchName: normalizeSearchText(input.name),
          muscleGroup: input.muscleGroup,
          groupOwned: true,
          groupId,
          groupGuides: {
            create: {
              groupId,
              authorId: userId,
              videoFileId: midia.videoFileId ?? null,
              tips: this.tips(input.tips),
              ...this.guideFields(input),
              photos: {
                create: (midia.photoFileIds ?? []).map((fileId, order) => ({ fileId, order })),
              },
            },
          },
        },
      });
    } catch (err) {
      throw this.conflict(err);
    }
    await publishAutoPost(this.prisma, {
      groupId,
      actorUserId: userId,
      kind: AutoPostKind.EXERCISE,
      refId: String(exercicio.id),
      title: exercicio.name,
      meta: exercicio.muscleGroup,
    });
    const guia = await this.findGuide(groupId, exercicio.id);
    return this.view(guia, userId, eu);
  }

  /** Dados do exercício criado pela comunidade. Exercício do catálogo geral não muda. */
  async update(
    userId: string,
    groupId: string,
    exerciseId: number,
    input: Partial<GroupExerciseInput>,
  ): Promise<GroupExerciseView> {
    const eu = await requireContentRole(this.prisma, userId, groupId, 'content.publish');
    const guia = await this.findGuide(groupId, exerciseId);
    assertCanEditContent(eu, userId, guia.authorId);
    if (!guia.exercise.groupOwned) {
      throw new BadRequestException(
        'Exercício do catálogo geral não muda: a comunidade muda o tutorial dele.',
      );
    }
    // O equipamento que já está fica, mesmo que a academia o tenha tirado da
    // lista própria depois: salvar o nome sem mexer nele não pode falhar.
    const equipment =
      input.equipment === guia.exercise.equipment
        ? undefined
        : await this.resolveEquipment(groupId, input.equipment);
    try {
      await this.prisma.exercise.update({
        where: { id: exerciseId },
        data: {
          ...this.exerciseData({ ...input, equipment }),
          ...(input.name !== undefined
            ? { name: input.name.trim(), searchName: normalizeSearchText(input.name) }
            : {}),
          ...(input.muscleGroup !== undefined ? { muscleGroup: input.muscleGroup } : {}),
        },
      });
    } catch (err) {
      throw this.conflict(err);
    }
    return this.view(await this.findGuide(groupId, exerciseId), userId, eu);
  }

  /**
   * O tutorial da comunidade para um exercício: do catálogo geral (cria se não
   * houver) ou dela. Vídeo e fotos trocados saem do bucket.
   */
  async setGuide(
    userId: string,
    groupId: string,
    exerciseId: number,
    input: GuideInput,
  ): Promise<GroupExerciseView> {
    const eu = await requireContentRole(this.prisma, userId, groupId, 'content.publish');
    const existente = await this.prisma.groupExerciseGuide.findUnique({
      where: { groupId_exerciseId: { groupId, exerciseId } },
      include: GUIDE_INCLUDE,
    });
    if (existente) {
      assertCanEditContent(eu, userId, existente.authorId);
    } else {
      // Só o catálogo geral ganha tutorial novo: o exercício pessoal de alguém
      // e o de outra comunidade respondem como inexistentes.
      const doCatalogo = await this.prisma.exercise.count({
        where: { id: exerciseId, ...CATALOG_EXERCISE },
      });
      if (!doCatalogo) throw new NotFoundException('Exercise not found');
    }
    const midia = await this.resolveMedia(groupId, input);

    const sai: Pick<MediaFile, 'id' | 'key'>[] = [];
    if (existente && input.videoFileId !== undefined && existente.video) {
      if (existente.video.id !== input.videoFileId) sai.push(existente.video);
    }
    if (existente && input.photoFileIds !== undefined) {
      const ficam = new Set(input.photoFileIds);
      sai.push(...existente.photos.map((p) => p.file).filter((f) => !ficam.has(f.id)));
    }

    const dados = {
      ...(input.videoFileId !== undefined ? { videoFileId: midia.videoFileId ?? null } : {}),
      ...(input.tips !== undefined ? { tips: this.tips(input.tips) } : {}),
      ...this.guideFields(input),
    };
    const fotos =
      input.photoFileIds !== undefined
        ? (midia.photoFileIds ?? []).map((fileId, order) => ({ fileId, order }))
        : undefined;

    let guia: GuideRow;
    try {
      guia = existente
        ? await this.prisma.groupExerciseGuide.update({
            where: { id: existente.id },
            data: {
              ...dados,
              ...(fotos ? { photos: { deleteMany: {}, create: fotos } } : {}),
            },
            include: GUIDE_INCLUDE,
          })
        : await this.prisma.groupExerciseGuide.create({
            data: {
              groupId,
              exerciseId,
              authorId: userId,
              ...dados,
              ...(fotos ? { photos: { create: fotos } } : {}),
            },
            include: GUIDE_INCLUDE,
          });
    } catch (err) {
      throw this.conflict(err);
    }
    await this.media.discard(sai);
    return this.view(guia, userId, eu);
  }

  /**
   * Tira o exercício do catálogo da comunidade.
   *
   * - Do catálogo geral: sai só o tutorial; o exercício é de todo mundo.
   * - Da comunidade e ninguém usa: apaga.
   * - Da comunidade e já está no plano ou no histórico de alguém: sai da
   *   comunidade (`groupId` nulo) e some da busca, mas quem treinou com ele
   *   continua vendo o que fez. O `groupOwned` o mantém fora do catálogo público.
   *
   * Plano pronto que usa o exercício segura a remoção: sem ele, a adoção
   * daquele plano passaria a falhar para todo mundo.
   */
  async remove(userId: string, groupId: string, exerciseId: number): Promise<{ id: number }> {
    const eu = await requireContentRole(this.prisma, userId, groupId, 'content.publish');
    const guia = await this.findGuide(groupId, exerciseId);
    assertCanEditContent(eu, userId, guia.authorId);

    if (guia.exercise.groupOwned) {
      const modelos = await this.templatesUsing(groupId, exerciseId);
      if (modelos.length) {
        throw new ConflictException(
          `Este exercício está no plano pronto "${modelos[0]}". Tire de lá antes de apagar.`,
        );
      }
    }

    const arquivos = [...(guia.video ? [guia.video] : []), ...guia.photos.map((p) => p.file)];
    await this.prisma.groupExerciseGuide.delete({ where: { id: guia.id } });
    if (guia.exercise.groupOwned) {
      const [emPlano, emSerie] = await Promise.all([
        this.prisma.workoutPlanExercise.count({ where: { exerciseId } }),
        this.prisma.sessionSet.count({ where: { exerciseId } }),
      ]);
      if (emPlano + emSerie > 0) {
        await this.prisma.exercise.update({ where: { id: exerciseId }, data: { groupId: null } });
      } else {
        await this.prisma.exercise.delete({ where: { id: exerciseId } });
      }
    }
    await this.media.discard(arquivos);
    return { id: exerciseId };
  }

  /**
   * Favorito da equipe (#408): da comunidade, não de quem marcou. Idempotente
   * nos dois sentidos. Só o que a comunidade enxerga: o exercício de outra
   * comunidade e o pessoal de alguém respondem como inexistentes (#92).
   */
  async setFavorite(
    userId: string,
    groupId: string,
    exerciseId: number,
    favorite: boolean,
  ): Promise<{ exerciseId: number; favorite: boolean }> {
    await requireContentRole(this.prisma, userId, groupId, 'content.publish');
    if (!favorite) {
      await this.prisma.groupExerciseFavorite.deleteMany({ where: { groupId, exerciseId } });
      return { exerciseId, favorite };
    }
    await this.findVisible(groupId, exerciseId);
    try {
      await this.prisma.groupExerciseFavorite.upsert({
        where: { groupId_exerciseId: { groupId, exerciseId } },
        create: { groupId, exerciseId },
        update: {},
      });
    } catch (err) {
      // Dois toques ao mesmo tempo: o outro já gravou, que é o que se queria.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
    }
    return { exerciseId, favorite };
  }

  /**
   * "Duplicar" (#408, Pn-11b): uma cópia da casa, com os dados do exercício e
   * o guia (passos, erros, dica, selo e padrão). Vídeo e fotos não vêm: cada
   * arquivo é de um guia só, e copiar no bucket dobraria o que se guarda.
   */
  async duplicate(userId: string, groupId: string, exerciseId: number): Promise<GroupExerciseView> {
    const eu = await requireContentRole(this.prisma, userId, groupId, 'content.publish');
    const ex = await this.findVisible(groupId, exerciseId);
    const guia = await this.prisma.groupExerciseGuide.findUnique({
      where: { groupId_exerciseId: { groupId, exerciseId } },
    });
    const nomes = new Set(
      (
        await this.prisma.exercise.findMany({
          where: { groupId, name: { startsWith: `${ex.name} (cópia` } },
          select: { name: true },
        })
      ).map((e) => e.name),
    );
    let name = `${ex.name} (cópia)`;
    for (let i = 2; nomes.has(name); i++) name = `${ex.name} (cópia ${i})`;

    let copia: Exercise;
    try {
      copia = await this.prisma.exercise.create({
        data: {
          name,
          searchName: normalizeSearchText(name),
          muscleGroup: ex.muscleGroup,
          equipment: ex.equipment,
          level: ex.level,
          mechanic: ex.mechanic,
          primaryMuscles: ex.primaryMuscles,
          secondaryMuscles: ex.secondaryMuscles,
          instructions: ex.instructions,
          groupOwned: true,
          groupId,
          clonedFromId: ex.id,
          groupGuides: {
            create: {
              groupId,
              authorId: userId,
              tips: guia?.tips ?? null,
              steps: guia?.steps ?? [],
              commonMistakes: guia?.commonMistakes ?? [],
              homeFriendly: guia?.homeFriendly ?? false,
              defaultSets: guia?.defaultSets ?? null,
              defaultReps: guia?.defaultReps ?? null,
              defaultRestSeconds: guia?.defaultRestSeconds ?? null,
              defaultLoadMode: guia?.defaultLoadMode ?? null,
            },
          },
        },
      });
    } catch (err) {
      throw this.conflict(err);
    }
    return this.view(await this.findGuide(groupId, copia.id), userId, eu);
  }

  /**
   * O equipamento que a academia tem, para o filtro "Na minha academia": o da
   * lista e o que ela nomeou por conta própria. `customEquipment` ausente mantém
   * os próprios que já estão.
   */
  async setEquipment(
    userId: string,
    groupId: string,
    equipment: string[],
    customEquipment?: string[],
  ): Promise<{ equipment: string[]; customEquipment: string[] }> {
    await requireContentRole(
      this.prisma,
      userId,
      groupId,
      'group.update',
      'Só o dono muda o equipamento da academia',
    );
    const validos = new Set<string>(GYM_EQUIPMENT);
    const desconhecido = equipment.find((e) => !validos.has(e));
    if (desconhecido !== undefined) {
      throw new BadRequestException(`Equipamento desconhecido: ${desconhecido}`);
    }
    let proprios: string[] | undefined;
    if (customEquipment !== undefined) {
      const limpos = cleanCustomEquipment(customEquipment);
      if (limpos.inList !== null) {
        throw new BadRequestException(
          `"${limpos.inList}" já está na lista de equipamentos: marque por lá.`,
        );
      }
      if (limpos.names.length > MAX_CUSTOM_EQUIPMENT) {
        throw new BadRequestException(`Até ${MAX_CUSTOM_EQUIPMENT} equipamentos próprios.`);
      }
      proprios = limpos.names;
    }
    const g = await this.prisma.group.update({
      where: { id: groupId },
      data: {
        equipment: [...new Set(equipment)],
        ...(proprios !== undefined ? { customEquipment: proprios } : {}),
      },
      select: { equipment: true, customEquipment: true },
    });
    return { equipment: g.equipment, customEquipment: g.customEquipment };
  }

  // ---------------------------------------------------------------- membro

  /** O catálogo da comunidade, para quem é dela. */
  async listForMember(userId: string, groupId: string): Promise<GroupExerciseView[]> {
    await requireContentRole(this.prisma, userId, groupId, 'content.read', 'Forbidden');
    const guias = await this.prisma.groupExerciseGuide.findMany({
      where: { groupId },
      include: GUIDE_INCLUDE,
      orderBy: { exercise: { name: 'asc' } },
    });
    const papeis = await authorRoles(
      this.prisma,
      groupId,
      guias.map((g) => g.authorId),
    );
    return Promise.all(guias.map((g) => this.view(g, userId, null, papeis)));
  }

  /** Um guia da academia (Cm-16), só para quem é da comunidade e só desta comunidade. */
  async getForMember(
    userId: string,
    groupId: string,
    exerciseId: number,
  ): Promise<GroupExerciseView> {
    await requireContentRole(this.prisma, userId, groupId, 'content.read', 'Forbidden');
    const guia = await this.findGuide(groupId, exerciseId);
    const papeis = await authorRoles(this.prisma, groupId, [guia.authorId]);
    return this.view(guia, userId, null, papeis);
  }

  /** "Equipamentos da academia" (Cm-12): o marcado da lista e o próprio dela. */
  async equipmentForMember(
    userId: string,
    groupId: string,
  ): Promise<{ equipment: string[]; customEquipment: string[] }> {
    await requireContentRole(this.prisma, userId, groupId, 'content.read', 'Forbidden');
    return this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { equipment: true, customEquipment: true },
    });
  }

  // ---------------------------------------------------------------- apoio

  private async findGuide(groupId: string, exerciseId: number): Promise<GuideRow> {
    const guia = await this.prisma.groupExerciseGuide.findUnique({
      where: { groupId_exerciseId: { groupId, exerciseId } },
      include: GUIDE_INCLUDE,
    });
    if (!guia) throw new NotFoundException('Exercise not found');
    return guia;
  }

  /** Os títulos dos planos prontos da comunidade que levam o exercício dela. */
  private async templatesUsing(groupId: string, exerciseId: number): Promise<string[]> {
    const modelos = await this.prisma.groupPlanTemplate.findMany({
      where: { groupId, kind: 'WORKOUT' },
      select: { title: true, snapshot: true },
    });
    return modelos
      .filter((m) => {
        const snap = parsePlanSnapshot(m.snapshot);
        return (
          snap !== null &&
          snap.sessions
            .flatMap(sessionExercises)
            .some((e) => e.source === 'group' && e.groupExerciseId === exerciseId)
        );
      })
      .map((m) => m.title);
  }

  /**
   * O equipamento do exercício da casa: da lista, peso corporal, outro ou um
   * equipamento próprio **desta** academia (a da URL). Volta na grafia
   * guardada, para o filtro casar; vazio vira `null`.
   */
  private async resolveEquipment(
    groupId: string,
    equipment: string | null | undefined,
  ): Promise<string | null | undefined> {
    if (equipment === undefined || equipment === null) return equipment;
    const chave = equipmentKey(equipment);
    if (!chave) return null;
    const lista = [...GYM_EQUIPMENT, BODYWEIGHT, OTHER_EQUIPMENT];
    const daLista = lista.find((e) => equipmentKey(e) === chave);
    if (daLista) return daLista;
    const g = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { customEquipment: true },
    });
    const proprio = g.customEquipment.find((e) => equipmentKey(e) === chave);
    if (proprio) return proprio;
    throw new BadRequestException(
      `Equipamento desconhecido: ${equipment}. Cadastre-o no equipamento da academia antes.`,
    );
  }

  /** Vídeo e fotos: prontos, desta comunidade e enviados para isto. */
  private async resolveMedia(groupId: string, input: GuideInput): Promise<GuideInput> {
    const fotos = input.photoFileIds;
    if (fotos && fotos.length > MAX_GUIDE_PHOTOS) {
      throw new BadRequestException(`Até ${MAX_GUIDE_PHOTOS} fotos por exercício.`);
    }
    if (fotos && new Set(fotos).size !== fotos.length) {
      throw new BadRequestException('A mesma foto aparece duas vezes.');
    }
    return {
      videoFileId: input.videoFileId
        ? (await this.media.resolveForGroup(groupId, input.videoFileId, 'exercise_video')).id
        : input.videoFileId,
      photoFileIds: fotos
        ? await Promise.all(
            fotos.map(
              async (id) => (await this.media.resolveForGroup(groupId, id, 'exercise_photo')).id,
            ),
          )
        : undefined,
    };
  }

  private exerciseData(input: Partial<GroupExerciseInput>) {
    return {
      ...(input.equipment !== undefined ? { equipment: input.equipment || null } : {}),
      ...(input.level !== undefined ? { level: input.level || null } : {}),
      ...(input.mechanic !== undefined ? { mechanic: input.mechanic || null } : {}),
      ...(input.primaryMuscles !== undefined ? { primaryMuscles: input.primaryMuscles } : {}),
      ...(input.secondaryMuscles !== undefined ? { secondaryMuscles: input.secondaryMuscles } : {}),
      ...(input.instructions !== undefined
        ? { instructions: input.instructions.map((s) => s.trim()).filter(Boolean) }
        : {}),
    };
  }

  private tips(tips: string | null | undefined): string | null {
    const t = tips?.trim() ?? '';
    if (t.length > MAX_GUIDE_TIPS) {
      throw new BadRequestException(
        `As dicas vão até ${MAX_GUIDE_TIPS.toLocaleString('pt-BR')} caracteres.`,
      );
    }
    return t || null;
  }

  /** O que a comunidade enxerga: o catálogo geral e o que é dela. */
  private visibleTo(groupId: string): Prisma.ExerciseWhereInput {
    return { OR: [CATALOG_EXERCISE, { groupOwned: true, groupId }] };
  }

  private async findVisible(groupId: string, exerciseId: number): Promise<Exercise> {
    const ex = await this.prisma.exercise.findFirst({
      where: { id: exerciseId, ...this.visibleTo(groupId) },
    });
    if (!ex) throw new NotFoundException('Exercise not found');
    return ex;
  }

  /**
   * "Em N planos" (#408): os modelos da biblioteca desta comunidade e os
   * planos dos membros ativos dela. Abaixo de 5 planos, sem o número.
   */
  private async usage(groupId: string, exerciseId: number): Promise<ExerciseUsage> {
    const [modelos, planos] = await Promise.all([
      this.prisma.groupPlanTemplate.findMany({
        where: { groupId, kind: 'WORKOUT' },
        select: { snapshot: true },
      }),
      this.prisma.workoutPlan.count({
        where: {
          exercises: { some: { exerciseId } },
          user: { memberships: { some: { groupId, status: MembershipStatus.ACTIVE } } },
        },
      }),
    ]);
    const templates = modelos.filter((m) => {
      const snap = parsePlanSnapshot(m.snapshot);
      return (
        snap !== null &&
        snap.sessions
          .flatMap(sessionExercises)
          .some(
            (e) =>
              (e.source === 'group' && e.groupExerciseId === exerciseId) ||
              (e.source === 'catalog' && e.catalogExerciseId === exerciseId),
          )
      );
    }).length;
    return {
      templates,
      plans:
        planos === 0
          ? { band: 'none', count: null }
          : planos < USAGE_MIN_CELL
            ? { band: 'few', count: null }
            : { band: 'many', count: planos },
    };
  }

  /** Os campos novos do guia (#408), limpos e conferidos. Ausente não mexe. */
  private guideFields(input: GuideInput) {
    const linhas = (v: string[] | undefined, max: number, rotulo: string) => {
      if (v === undefined) return undefined;
      const limpas = v.map((l) => l.trim()).filter(Boolean);
      if (limpas.length > max) throw new BadRequestException(`Até ${max} ${rotulo}.`);
      if (limpas.some((l) => l.length > MAX_GUIDE_LINE)) {
        throw new BadRequestException(`Cada linha vai até ${MAX_GUIDE_LINE} caracteres.`);
      }
      return limpas;
    };
    const steps = linhas(input.steps, MAX_GUIDE_STEPS, 'passos');
    const commonMistakes = linhas(input.commonMistakes, MAX_GUIDE_MISTAKES, 'erros comuns');
    if (
      input.defaultSets != null &&
      (!Number.isInteger(input.defaultSets) ||
        input.defaultSets < 1 ||
        input.defaultSets > MAX_DEFAULT_SETS)
    ) {
      throw new BadRequestException(`Séries: de 1 a ${MAX_DEFAULT_SETS}.`);
    }
    let defaultReps = input.defaultReps;
    if (defaultReps != null) {
      const m = REPS_PATTERN.exec(defaultReps.trim());
      if (!m || Number(m[1]) < 1 || (m[2] !== undefined && Number(m[2]) < Number(m[1]))) {
        throw new BadRequestException('Repetições: um número ou uma faixa, como 8 ou 6-8.');
      }
      defaultReps = m[2] !== undefined ? `${m[1]}-${m[2]}` : m[1]!;
    }
    if (
      input.defaultRestSeconds != null &&
      (!Number.isInteger(input.defaultRestSeconds) ||
        input.defaultRestSeconds < 0 ||
        input.defaultRestSeconds > MAX_DEFAULT_REST)
    ) {
      throw new BadRequestException('Descanso: de 0 a 15 minutos.');
    }
    if (input.defaultLoadMode != null && !LOAD_MODES.includes(input.defaultLoadMode)) {
      throw new BadRequestException('Carga desconhecida.');
    }
    return {
      ...(steps !== undefined ? { steps } : {}),
      ...(commonMistakes !== undefined ? { commonMistakes } : {}),
      ...(input.homeFriendly !== undefined ? { homeFriendly: input.homeFriendly } : {}),
      ...(input.defaultSets !== undefined ? { defaultSets: input.defaultSets } : {}),
      ...(defaultReps !== undefined ? { defaultReps } : {}),
      ...(input.defaultRestSeconds !== undefined
        ? { defaultRestSeconds: input.defaultRestSeconds }
        : {}),
      ...(input.defaultLoadMode !== undefined ? { defaultLoadMode: input.defaultLoadMode } : {}),
    };
  }

  /** O exercício do catálogo geral ainda sem guia desta comunidade. */
  private bareView(ex: Exercise): GroupExerciseView {
    return {
      exerciseId: ex.id,
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      equipment: ex.equipment,
      level: ex.level,
      mechanic: ex.mechanic,
      primaryMuscles: ex.primaryMuscles,
      secondaryMuscles: ex.secondaryMuscles,
      instructions: ex.instructions,
      ownedByCommunity: ex.groupOwned,
      video: null,
      photos: [],
      tips: null,
      authorName: TEAM_AUTHOR,
      authorRole: null,
      updatedAt: ex.createdAt,
      steps: [],
      commonMistakes: [],
      homeFriendly: false,
      defaults: null,
      // Ninguém escreveu ainda: quem publica conteúdo abre o primeiro guia.
      canEdit: true,
    };
  }

  /** `P2002` aqui é nome repetido no catálogo da comunidade, ou arquivo já usado em outro exercício. */
  private conflict(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const alvo = JSON.stringify(err.meta?.target ?? '');
      return new ConflictException(
        alvo.includes('name')
          ? 'A comunidade já tem um exercício com esse nome.'
          : 'Este vídeo ou foto já está em outro exercício.',
      );
    }
    return err;
  }

  private async view(
    g: GuideRow,
    userId: string,
    teamRole: GroupRole | null,
    papeis?: Map<string, GroupRole>,
  ): Promise<GroupExerciseView> {
    const roles = papeis ?? (await authorRoles(this.prisma, g.groupId, [g.authorId]));
    const ex = g.exercise;
    return {
      exerciseId: ex.id,
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      equipment: ex.equipment,
      level: ex.level,
      mechanic: ex.mechanic,
      primaryMuscles: ex.primaryMuscles,
      secondaryMuscles: ex.secondaryMuscles,
      instructions: ex.instructions,
      ownedByCommunity: ex.groupOwned,
      video: await this.media.viewOrNull(g.video),
      photos: await Promise.all(g.photos.map((p) => this.media.view(p.file))),
      tips: g.tips,
      authorName: g.author?.name ?? TEAM_AUTHOR,
      authorRole: g.authorId ? (roles.get(g.authorId) ?? null) : null,
      updatedAt: g.updatedAt,
      steps: g.steps,
      commonMistakes: g.commonMistakes,
      homeFriendly: g.homeFriendly,
      defaults: defaultsOf(g),
      ...(teamRole ? { canEdit: canEditContent(teamRole, userId, g.authorId) } : {}),
    };
  }
}
