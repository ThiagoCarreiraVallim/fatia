import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '../../common/prisma.service';
import type { MediaService } from '../../storage/media.service';
import { CreateGroupExerciseDto, EquipmentDto } from '../dto/group-exercise.dto';
import { GroupExerciseService } from '../group-exercise.service';

/**
 * O equipamento da academia: a lista ampliada, os equipamentos próprios e o
 * equipamento do exercício da casa. O filtro "Na minha academia" no Postgres
 * está em `group-exercises.integration.spec.ts`.
 */
const GROUP = '11111111-1111-4111-8111-111111111111';
const OWNER = 'dona';

function makePrisma(role: 'OWNER' | 'PROFESSIONAL' = 'OWNER', custom: string[] = []) {
  return {
    groupMembership: {
      findUnique: jest.fn().mockResolvedValue({ role, status: 'ACTIVE' }),
    },
    group: {
      update: jest.fn(({ data }) =>
        Promise.resolve({
          equipment: data.equipment,
          customEquipment: data.customEquipment ?? custom,
        }),
      ),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ customEquipment: custom }),
    },
    exercise: { create: jest.fn().mockResolvedValue({ id: 7 }) },
    groupExerciseGuide: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'guia',
        groupId: GROUP,
        authorId: OWNER,
        video: null,
        photos: [],
        tips: null,
        author: { name: 'Dona' },
        updatedAt: new Date(),
        exercise: {
          id: 7,
          name: 'Hack da casa',
          muscleGroup: 'pernas',
          equipment: null,
          level: null,
          mechanic: null,
          primaryMuscles: [],
          secondaryMuscles: [],
          instructions: [],
          groupOwned: true,
        },
      }),
    },
  };
}

const media = { viewOrNull: jest.fn().mockResolvedValue(null), view: jest.fn() };
const service = (prisma: ReturnType<typeof makePrisma>) =>
  new GroupExerciseService(prisma as unknown as PrismaService, media as unknown as MediaService);

describe('equipamento da academia', () => {
  it('marca os itens novos da lista', async () => {
    const prisma = makePrisma();
    await expect(
      service(prisma).setEquipment(OWNER, GROUP, ['smith', 'leg press', 'esteira']),
    ).resolves.toEqual({ equipment: ['smith', 'leg press', 'esteira'], customEquipment: [] });
  });

  it('guarda os equipamentos próprios limpos, sem repetir', async () => {
    const prisma = makePrisma();
    const r = await service(prisma).setEquipment(
      OWNER,
      GROUP,
      ['halteres'],
      ['  Hack 45°  da casa ', 'hack 45° DA CASA', 'Remada cavalinho'],
    );
    expect(r.customEquipment).toEqual(['Hack 45° da casa', 'Remada cavalinho']);
    expect(prisma.group.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: GROUP } }),
    );
  });

  it('sem customEquipment, os próprios que já estão ficam', async () => {
    const prisma = makePrisma('OWNER', ['Hack da casa']);
    await service(prisma).setEquipment(OWNER, GROUP, ['halteres']);
    expect(prisma.group.update.mock.calls[0][0].data).not.toHaveProperty('customEquipment');
  });

  it('[] apaga os próprios', async () => {
    const prisma = makePrisma('OWNER', ['Hack da casa']);
    await service(prisma).setEquipment(OWNER, GROUP, [], []);
    expect(prisma.group.update.mock.calls[0][0].data.customEquipment).toEqual([]);
  });

  it('nome próprio que já está na lista é recusado', async () => {
    const prisma = makePrisma();
    await expect(
      service(prisma).setEquipment(OWNER, GROUP, [], ['Leg Press']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.group.update).not.toHaveBeenCalled();
  });

  it('só o dono muda', async () => {
    const prisma = makePrisma('PROFESSIONAL');
    await expect(
      service(prisma).setEquipment('prof', GROUP, [], ['Hack da casa']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('equipamento do exercício da casa', () => {
  const criar = (prisma: ReturnType<typeof makePrisma>, equipment: string) =>
    service(prisma).create(OWNER, GROUP, {
      name: 'Hack da casa',
      muscleGroup: 'pernas',
      equipment,
    });

  it('aceita item da lista ampliada, na grafia da lista', async () => {
    const prisma = makePrisma();
    await criar(prisma, 'Leg Press');
    expect(prisma.exercise.create.mock.calls[0][0].data.equipment).toBe('leg press');
  });

  it('aceita o equipamento próprio desta academia, na grafia guardada', async () => {
    const prisma = makePrisma('OWNER', ['Hack 45° da casa']);
    await criar(prisma, 'hack 45° DA CASA');
    expect(prisma.exercise.create.mock.calls[0][0].data.equipment).toBe('Hack 45° da casa');
    // A lista própria é lida da academia da URL, e não de outra.
    expect(prisma.group.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: GROUP } }),
    );
  });

  it('recusa equipamento que a academia não cadastrou', async () => {
    const prisma = makePrisma('OWNER', []);
    await expect(criar(prisma, 'Hack 45° da casa')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.exercise.create).not.toHaveBeenCalled();
  });
});

describe('validação do corpo', () => {
  const erros = async (cls: new () => object, body: object) =>
    (await validate(plainToInstance(cls, body))).map((e) => e.property);

  it('equipment só aceita chave da lista', async () => {
    expect(await erros(EquipmentDto, { equipment: ['smith', 'esteira'] })).toEqual([]);
    expect(await erros(EquipmentDto, { equipment: ['nave espacial'] })).toEqual(['equipment']);
  });

  it('customEquipment: até 30 nomes de 1 a 40 caracteres', async () => {
    expect(await erros(EquipmentDto, { equipment: [], customEquipment: ['Hack'] })).toEqual([]);
    expect(
      await erros(EquipmentDto, {
        equipment: [],
        customEquipment: Array.from({ length: 31 }, (_, i) => `e${i}`),
      }),
    ).toEqual(['customEquipment']);
    expect(await erros(EquipmentDto, { equipment: [], customEquipment: ['x'.repeat(41)] })).toEqual(
      ['customEquipment'],
    );
    expect(await erros(EquipmentDto, { equipment: [], customEquipment: [''] })).toEqual([
      'customEquipment',
    ]);
    expect(await erros(EquipmentDto, { equipment: [], customEquipment: [3] })).toEqual([
      'customEquipment',
    ]);
  });

  it('o exercício da casa aceita equipamento fora da lista fixa (quem confere é o service)', async () => {
    const base = { name: 'Hack', muscleGroup: 'pernas' };
    expect(await erros(CreateGroupExerciseDto, { ...base, equipment: 'Hack 45° da casa' })).toEqual(
      [],
    );
    expect(await erros(CreateGroupExerciseDto, { ...base, equipment: null })).toEqual([]);
    expect(await erros(CreateGroupExerciseDto, { ...base, equipment: 'x'.repeat(41) })).toEqual([
      'equipment',
    ]);
  });
});
