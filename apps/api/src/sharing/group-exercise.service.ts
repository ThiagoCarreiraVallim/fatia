import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type GroupRole, type MediaFile } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { normalizeSearchText } from '../common/search-text';
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
import { assertCanEditContent, canEditContent, requireContentRole } from './content-roles';
import { planSnapshotSchema } from './plan-snapshot';

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
  updatedAt: Date;
  /** Só para a equipe. */
  canEdit?: boolean;
}

const GUIDE_INCLUDE = {
  exercise: true,
  video: true,
  photos: { include: { file: true }, orderBy: { order: 'asc' } },
  author: { select: { name: true } },
} satisfies Prisma.GroupExerciseGuideInclude;

type GuideRow = Prisma.GroupExerciseGuideGetPayload<{ include: typeof GUIDE_INCLUDE }>;

const TEAM_AUTHOR = 'Equipe';

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

  async listForTeam(userId: string, groupId: string) {
    const eu = await requireContentRole(this.prisma, userId, groupId, 'content.publish');
    const [grupo, guias] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({
        where: { id: groupId },
        select: { equipment: true, customEquipment: true },
      }),
      this.prisma.groupExerciseGuide.findMany({
        where: { groupId },
        include: GUIDE_INCLUDE,
        orderBy: { exercise: { name: 'asc' } },
      }),
    ]);
    return {
      equipment: grupo.equipment,
      customEquipment: grupo.customEquipment,
      items: await Promise.all(guias.map((g) => this.view(g, userId, eu))),
    };
  }

  async getForTeam(userId: string, groupId: string, exerciseId: number) {
    const eu = await requireContentRole(this.prisma, userId, groupId, 'content.publish');
    return this.view(await this.findGuide(groupId, exerciseId), userId, eu);
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
    return Promise.all(guias.map((g) => this.view(g, userId, null)));
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
        const snap = planSnapshotSchema.safeParse(m.snapshot);
        return (
          snap.success &&
          snap.data.exercises.some((e) => e.source === 'group' && e.groupExerciseId === exerciseId)
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
  ): Promise<GroupExerciseView> {
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
      updatedAt: g.updatedAt,
      ...(teamRole ? { canEdit: canEditContent(teamRole, userId, g.authorId) } : {}),
    };
  }
}
