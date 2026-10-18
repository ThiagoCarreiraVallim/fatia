import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { MembershipStatus, type Exercise, type Prisma } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { normalizeSearchText, rankByRelevance } from '../common/search-text';
import { MediaService, type MediaView } from '../storage/media.service';
import type {
  CreateCustomExerciseDto,
  SearchExercisesDto,
  UpdateCustomExerciseDto,
} from './dto/exercise.dto';
import { BODYWEIGHT } from './helpers/equipment';
import { readableExercises, searchableExercises } from './helpers/exercise-access';

/** O tutorial que a comunidade da pessoa pôs no exercício (Fase 7b, ADR 030). */
export interface CommunityGuideView {
  groupId: string;
  groupName: string;
  video: MediaView | null;
  photos: MediaView[];
  tips: string | null;
}

/** O mesmo, para o agente: sem URL assinada, que não serve a ele e só ocupa contexto. */
export interface CommunityGuideSummary {
  groupName: string;
  tips: string | null;
  hasVideo: boolean;
  photoCount: number;
}

export type ExerciseListItem = Exercise & {
  /** A comunidade que destaca este exercício (é dela ou tem tutorial dela). */
  communityName: string | null;
};

/** As comunidades ativas da pessoa, na ordem em que ela entrou, e o que elas destacam. */
interface CommunityContext {
  groupIds: string[];
  equipment: string[];
  /** Exercício → nome da primeira comunidade (na ordem de entrada) que o destaca. */
  featured: Map<number, string>;
}

@Injectable()
export class ExerciseService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly media?: MediaService,
  ) {}

  /**
   * Esconde da listagem os exercícios base que o usuário já clonou — a cópia
   * editável passa a aparecer no lugar da base.
   */
  private notClonedByUser(userId: string) {
    return { NOT: { clones: { some: { createdByUserId: userId } } } };
  }

  /**
   * Busca por nome, sobre `searchName` (sem acento, sem pontuação) e ordenada
   * por relevância — ver `common/search-text.ts`.
   *
   * Com termo, o `take` do banco sai de propósito: cortar antes do ranqueamento
   * devolveria os 20 primeiros **em ordem alfabética**, que foi como "supino"
   * passou a trazer "Arremesso Supino" e esconder "Supino Reto".
   *
   * **Comunidade primeiro** (Fase 7b): o que a academia da pessoa criou ou
   * gravou aparece antes, e `onlyMyGym` deixa só isso mais o que dá para fazer
   * com o equipamento que ela marcou. Quem não está em comunidade nenhuma vê a
   * busca de sempre.
   */
  async search(userId: string, params: SearchExercisesDto): Promise<ExerciseListItem[]> {
    const limit = Math.min(params.limit ?? 20, 50);
    const term = params.q ? normalizeSearchText(params.q) : '';
    const ctx = await this.communityContext(userId);

    const where: Prisma.ExerciseWhereInput = {
      AND: [
        searchableExercises(userId),
        this.notClonedByUser(userId),
        ...(term ? [{ searchName: { contains: term } }] : []),
        ...(params.muscleGroup ? [{ muscleGroup: params.muscleGroup }] : []),
        ...(params.onlyMyGym && ctx.groupIds.length ? [this.myGymFilter(ctx)] : []),
      ],
    };
    const destaque = [...ctx.featured.keys()];
    const marcar = (ex: Exercise): ExerciseListItem => ({
      ...ex,
      communityName: ctx.featured.get(ex.id) ?? null,
    });

    if (term) {
      const matches = await this.prisma.exercise.findMany({ where, orderBy: { name: 'asc' } });
      const primeiro = matches.filter((ex) => ctx.featured.has(ex.id));
      const resto = matches.filter((ex) => !ctx.featured.has(ex.id));
      return [
        ...rankByRelevance(primeiro, term, (ex) => ex.name, limit),
        ...rankByRelevance(resto, term, (ex) => ex.name, limit),
      ]
        .slice(0, limit)
        .map(marcar);
    }

    const primeiro = destaque.length
      ? await this.prisma.exercise.findMany({
          where: { AND: [where, { id: { in: destaque } }] },
          orderBy: { name: 'asc' },
          take: limit,
        })
      : [];
    const resto =
      primeiro.length < limit
        ? await this.prisma.exercise.findMany({
            where: destaque.length ? { AND: [where, { id: { notIn: destaque } }] } : where,
            orderBy: { name: 'asc' },
            take: limit - primeiro.length,
          })
        : [];
    return [...primeiro, ...resto].map(marcar);
  }

  async listByMuscle(userId: string, muscleGroup: string) {
    return this.prisma.exercise.findMany({
      where: { AND: [searchableExercises(userId), this.notClonedByUser(userId), { muscleGroup }] },
      orderBy: { name: 'asc' },
    });
  }

  /** Para o agente (MCP): o tutorial da comunidade vem resumido, sem URL. */
  async get(userId: string, id: number) {
    const ex = await this.findReadable(userId, id);
    const guia = await this.guideRow(userId, ex);
    return {
      ...ex,
      community: guia
        ? {
            groupName: guia.groupName,
            tips: guia.tips,
            hasVideo: guia.video !== null,
            photoCount: guia.photos.length,
          }
        : null,
    } satisfies Exercise & { community: CommunityGuideSummary | null };
  }

  /** Para as telas: o tutorial da comunidade com as URLs assinadas do vídeo e das fotos. */
  async getWithMedia(userId: string, id: number) {
    const ex = await this.findReadable(userId, id);
    const guia = await this.guideRow(userId, ex);
    let community: CommunityGuideView | null = null;
    if (guia) {
      community = {
        groupId: guia.groupId,
        groupName: guia.groupName,
        tips: guia.tips,
        video: this.media ? await this.media.viewOrNull(guia.video) : null,
        photos: this.media ? await Promise.all(guia.photos.map((f) => this.media!.view(f))) : [],
      };
    }
    return { ...ex, community };
  }

  private async findReadable(userId: string, id: number): Promise<Exercise> {
    const ex = await this.prisma.exercise.findFirst({
      where: { id, ...readableExercises(userId) },
    });
    if (!ex) throw new NotFoundException('Exercise not found');
    return ex;
  }

  /**
   * As comunidades ativas da pessoa, o equipamento que elas marcaram e os
   * exercícios que elas destacam. Uma pessoa em duas academias vê o destaque
   * da que ela entrou primeiro.
   */
  private async communityContext(userId: string): Promise<CommunityContext> {
    const vinculos = await this.prisma.groupMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      select: { groupId: true, group: { select: { name: true, equipment: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const groupIds = vinculos.map((v) => v.groupId);
    const featured = new Map<number, string>();
    if (groupIds.length === 0) return { groupIds, equipment: [], featured };

    const [proprios, guias] = await Promise.all([
      this.prisma.exercise.findMany({
        where: { groupOwned: true, groupId: { in: groupIds } },
        select: { id: true, groupId: true },
      }),
      this.prisma.groupExerciseGuide.findMany({
        where: { groupId: { in: groupIds } },
        select: { exerciseId: true, groupId: true },
      }),
    ]);
    const nomePor = new Map(vinculos.map((v) => [v.groupId, v.group.name]));
    const ordem = new Map(groupIds.map((g, i) => [g, i]));
    const pares = [
      ...proprios.map((e) => ({ exerciseId: e.id, groupId: e.groupId! })),
      ...guias,
    ].sort((a, b) => ordem.get(a.groupId)! - ordem.get(b.groupId)!);
    for (const par of pares) {
      if (!featured.has(par.exerciseId)) featured.set(par.exerciseId, nomePor.get(par.groupId)!);
    }
    const equipment = [...new Set(vinculos.flatMap((v) => v.group.equipment))];
    return { groupIds, equipment, featured };
  }

  /** "Na minha academia": o que ela destaca, mais o que dá para fazer com o equipamento dela. */
  private myGymFilter(ctx: CommunityContext): Prisma.ExerciseWhereInput {
    return {
      OR: [
        { id: { in: [...ctx.featured.keys()] } },
        { equipment: { in: [...ctx.equipment, BODYWEIGHT] } },
      ],
    };
  }

  /** O tutorial da primeira comunidade ativa da pessoa que tem um para este exercício. */
  private async guideRow(userId: string, ex: Exercise) {
    const vinculos = await this.prisma.groupMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      select: { groupId: true, group: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (vinculos.length === 0) return null;
    const guias = await this.prisma.groupExerciseGuide.findMany({
      where: { exerciseId: ex.id, groupId: { in: vinculos.map((v) => v.groupId) } },
      include: { video: true, photos: { include: { file: true }, orderBy: { order: 'asc' } } },
    });
    for (const v of vinculos) {
      const guia = guias.find((g) => g.groupId === v.groupId);
      if (guia) {
        return {
          groupId: v.groupId,
          groupName: v.group.name,
          tips: guia.tips,
          video: guia.video,
          photos: guia.photos.map((p) => p.file),
        };
      }
      // Exercício da própria comunidade, ainda sem tutorial: o nome dela aparece mesmo assim.
      if (ex.groupOwned && ex.groupId === v.groupId) {
        return { groupId: v.groupId, groupName: v.group.name, tips: null, video: null, photos: [] };
      }
    }
    return null;
  }

  /**
   * Antes de apagar a comunidade (ADR 030): o exercício dela que ninguém usa
   * sai junto. O que alguém usa fica, solto (o FK cai em SetNull), no
   * histórico de quem treinou — e fora do catálogo público pelo `groupOwned`.
   * Vídeo e fotos saem com a mídia da comunidade.
   */
  async beforeDeleteGroup(groupId: string): Promise<void> {
    await this.prisma.exercise.deleteMany({
      where: {
        groupOwned: true,
        groupId,
        planExercises: { none: {} },
        sessionSets: { none: {} },
      },
    });
  }

  /** As comunidades de que a pessoa é dona caem em cascata com a conta. */
  async beforeDeleteAccount(userId: string): Promise<void> {
    const grupos = await this.prisma.group.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    for (const g of grupos) await this.beforeDeleteGroup(g.id);
  }

  async findByName(userId: string, name: string) {
    const results = await this.prisma.exercise.findMany({
      where: {
        AND: [searchableExercises(userId), { searchName: { contains: normalizeSearchText(name) } }],
      },
      orderBy: { name: 'asc' },
    });
    if (results.length === 0) throw new NotFoundException(`Exercise not found: ${name}`);
    return rankByRelevance(results, name, (ex) => ex.name, 5);
  }

  /** Como executar: os exercícios que casam com o nome, só com o que descreve a execução. */
  async explainForm(userId: string, name: string) {
    const matches = await this.findByName(userId, name);
    return matches.map((ex) => ({
      id: ex.id,
      name: ex.name,
      primaryMuscles: ex.primaryMuscles,
      secondaryMuscles: ex.secondaryMuscles,
      equipment: ex.equipment,
      level: ex.level,
      mechanic: ex.mechanic,
      instructions: ex.instructions,
    }));
  }

  async createCustom(userId: string, dto: CreateCustomExerciseDto) {
    try {
      return await this.prisma.exercise.create({
        data: { ...dto, searchName: normalizeSearchText(dto.name), createdByUserId: userId },
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Exercise name already in use');
      }
      throw err;
    }
  }

  async updateCustom(userId: string, id: number, dto: UpdateCustomExerciseDto) {
    // Lido com o filtro de acesso: o exercício de uma comunidade de que a
    // pessoa não faz parte responde como inexistente, não como "somente leitura".
    const ex = await this.prisma.exercise.findFirst({
      where: { id, ...readableExercises(userId) },
    });
    if (!ex) throw new NotFoundException('Exercise not found');
    // Exercícios base (createdByUserId === null) são SÓ-LEITURA: para editar um base,
    // o usuário deve cloná-lo (cloneForEdit) e editar a cópia. A mensagem é
    // explícita porque o catálogo base é público — não há existência a esconder,
    // e dizer o caminho evita o cliente ficar tentando.
    if (ex.createdByUserId === null) {
      throw new ConflictException(
        'Exercício do catálogo base é somente leitura. Use clone_exercise para criar uma cópia editável e edite a cópia.',
      );
    }
    // Custom de outro usuário responde como inexistente: os IDs de Exercise são
    // inteiros sequenciais, então distinguir vazaria a existência (#92).
    if (ex.createdByUserId !== userId) throw new NotFoundException('Exercise not found');
    try {
      return await this.prisma.exercise.update({
        where: { id },
        // `searchName` acompanha o nome, senão a busca continua achando o
        // exercício pelo nome antigo.
        data: { ...dto, ...(dto.name ? { searchName: normalizeSearchText(dto.name) } : {}) },
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Exercise name already in use');
      }
      throw err;
    }
  }

  /**
   * Cria (ou reaproveita) uma cópia editável de um exercício base para o usuário.
   * A cópia herda todos os campos do base e fica com clonedFromId = base.id, o que faz
   * a base sumir das listagens do usuário (passa a aparecer a cópia). Aplica overrides
   * opcionais (ex.: já editar no mesmo passo).
   */
  async cloneForEdit(userId: string, baseId: number, overrides?: UpdateCustomExerciseDto) {
    const base = await this.prisma.exercise.findFirst({
      where: { id: baseId, ...readableExercises(userId) },
    });
    if (!base) throw new NotFoundException('Exercise not found');

    // Já existe cópia desse base para o usuário? edita/retorna ela (idempotente).
    const existing = await this.prisma.exercise.findFirst({
      where: { createdByUserId: userId, clonedFromId: baseId },
    });
    if (existing) {
      return overrides && Object.keys(overrides).length
        ? this.updateCustom(userId, existing.id, overrides)
        : existing;
    }

    // Copia os campos do base (menos identidade/auditoria) para a nova cópia custom.
    const {
      id: _id,
      createdAt: _createdAt,
      createdByUserId: _owner,
      clonedFromId: _cf,
      // A cópia é da pessoa. Herdar a marca de comunidade a deixaria fora do
      // alcance dela (e o CHECK do banco recusaria a linha).
      groupOwned: _daComunidade,
      groupId: _comunidade,
      ...fields
    } = base;
    void _id;
    void _createdAt;
    void _owner;
    void _cf;
    void _daComunidade;
    void _comunidade;
    try {
      const name = overrides?.name ?? fields.name;
      return await this.prisma.exercise.create({
        data: {
          ...fields,
          ...overrides,
          searchName: normalizeSearchText(name),
          createdByUserId: userId,
          clonedFromId: baseId,
        },
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Você já tem um exercício com esse nome');
      }
      throw err;
    }
  }

  async deleteCustom(userId: string, id: number): Promise<void> {
    const ex = await this.prisma.exercise.findFirst({
      where: { id, ...readableExercises(userId) },
    });
    if (!ex) throw new NotFoundException('Exercise not found');
    // Ver updateCustom: base é público e a mensagem pode ser explícita; custom de
    // outro usuário responde como inexistente.
    if (ex.createdByUserId === null) {
      throw new ConflictException(
        'Exercício do catálogo base não pode ser removido. Ele é compartilhado entre todos os usuários.',
      );
    }
    if (ex.createdByUserId !== userId) throw new NotFoundException('Exercise not found');
    const uses = await this.prisma.sessionSet.count({ where: { exerciseId: id } });
    if (uses > 0) throw new ConflictException('Exercise is in use by existing session sets');
    await this.prisma.exercise.delete({ where: { id } });
  }
}
