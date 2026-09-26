import { BadRequestException } from '@nestjs/common';
import type { DiscoveryService } from '@nestjs/core';
import { PrismaService } from '../../../common/prisma.service';
import { McpToolRegistry } from '../../../mcp/mcp-tool.registry';
import type { McpMetricsService } from '../../../observability/mcp-metrics.service';
import { LogMealTool } from '../../../nutrition/mcp/log-meal.tool';
import { ListMealsTool } from '../../../nutrition/mcp/list-meals.tool';
import { CompleteGoalTool } from '../../../goals/mcp/complete-goal.tool';
import { ForgetMemoryTool } from '../../../chat/memory/mcp/forget-memory.tool';
import { PreviaDaAcaoService } from '../previa-da-acao.service';

/**
 * O resumo do cartão de confirmação, contra Postgres real.
 *
 * Real, e não dublê, porque a afirmação que importa é sobre o `where`: o nome
 * que aparece no cartão sai de uma leitura restrita à conta de quem pergunta, e
 * um dublê de Prisma aceitaria qualquer filtro.
 */

const TZ = 'America/Sao_Paulo';
// 25/09/2026 às 15:00 em São Paulo.
const AGORA = new Date('2026-09-25T18:00:00.000Z');

describe('PreviaDaAcaoService', () => {
  const prisma = new PrismaService();
  const classes = [LogMealTool, ListMealsTool, CompleteGoalTool, ForgetMemoryTool];
  const discovery = {
    getProviders: () =>
      classes.map((Classe) => ({ metatype: Classe, instance: new Classe(undefined as never) })),
  } as unknown as DiscoveryService;
  const registry = new McpToolRegistry(discovery, {} as McpMetricsService);
  registry.onModuleInit();
  const previas = new PreviaDaAcaoService(registry, prisma);

  let dono = { id: '', timezone: TZ };
  let outro = { id: '', timezone: TZ };
  let alimentoDoDono = 0;
  let metaDoOutro = '';

  beforeAll(async () => {
    const stamp = `previa-${Date.now()}`;
    const criar = (sufixo: string) =>
      prisma.user.create({
        data: {
          logtoSub: `${stamp}-${sufixo}`,
          email: `${stamp}-${sufixo}@test.local`,
          name: sufixo,
          timezone: TZ,
        },
      });
    dono = { id: (await criar('dono')).id, timezone: TZ };
    outro = { id: (await criar('outro')).id, timezone: TZ };
    alimentoDoDono = (
      await prisma.food.create({
        data: {
          name: 'Arroz branco cozido',
          searchName: 'arroz branco cozido',
          source: 'CUSTOM',
          createdByUserId: dono.id,
          kcalPer100g: 128,
          proteinPer100g: 2.5,
          carbsPer100g: 28,
          fatPer100g: 0.2,
        },
      })
    ).id;
    metaDoOutro = (
      await prisma.goal.create({
        data: {
          userId: outro.id,
          kind: 'weight',
          title: 'Chegar a 70 kg',
          startValue: 80,
          targetValue: 70,
          unit: 'kg',
        },
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.food.deleteMany({ where: { id: alimentoDoDono } });
    await prisma.user.deleteMany({ where: { id: { in: [dono.id, outro.id] } } });
    await prisma.$disconnect();
  });

  it('descreve a refeição em português: tipo, quando e o alimento pelo nome', async () => {
    const previa = await previas.previa(
      dono,
      'log_meal',
      {
        mealType: 'LUNCH',
        eatenAt: '2026-09-25T15:30:00.000Z',
        items: [{ foodId: alimentoDoDono, grams: 150 }],
      },
      AGORA,
    );

    expect(previa).toEqual({
      valida: true,
      linhas: [
        { rotulo: 'Refeição', valor: 'Almoço' },
        { rotulo: 'Quando', valor: 'hoje, 12:30' },
        { rotulo: 'Item', valor: '150 g de Arroz branco cozido' },
      ],
    });
  });

  it('nada do resumo é código: nem id, nem enum, nem data ISO', async () => {
    const previa = await previas.previa(
      dono,
      'log_meal',
      {
        mealType: 'DINNER',
        eatenAt: '2026-09-24T23:00:00.000Z',
        items: [
          { foodId: alimentoDoDono, grams: 90 },
          { foodName: 'Tapioca', grams: 80, kcal: 219.6 },
        ],
      },
      AGORA,
    );
    const texto = JSON.stringify(previa.linhas);

    // Os valores exatos abaixo já provam que o id não aparece; procurar o número
    // como substring daria falso alarme quando ele coincide com uma hora ("20:00").
    expect(texto).not.toMatch(/DINNER|2026-09|foodId/);
    expect(previa.linhas.map((l) => l.valor)).toEqual([
      'Jantar',
      'ontem, 20:00',
      '90 g de Arroz branco cozido',
      '80 g de Tapioca (220 kcal)',
    ]);
  });

  it('argumento que o /mcp recusaria vem como inválido, com o campo em português', async () => {
    const previa = await previas.previa(
      dono,
      'log_meal',
      { mealType: 'LUNCH', items: [{ foodId: alimentoDoDono, grams: 150 }] },
      AGORA,
    );

    expect(previa.valida).toBe(false);
    expect(previa).toMatchObject({ problema: expect.stringContaining('Faltou informar: quando') });
  });

  it('o alimento de outra conta não é lido: o resumo recusa em vez de mostrar o nome', async () => {
    const previa = await previas.previa(
      outro,
      'log_meal',
      {
        mealType: 'LUNCH',
        eatenAt: '2026-09-25T15:30:00.000Z',
        items: [{ foodId: alimentoDoDono, grams: 150 }],
      },
      AGORA,
    );

    expect(previa.valida).toBe(false);
    expect(JSON.stringify(previa)).not.toContain('Arroz');
  });

  it('a meta aparece pelo título para o dono e não resolve para outra pessoa', async () => {
    await expect(previas.previa(outro, 'complete_goal', { goalId: metaDoOutro })).resolves.toEqual({
      valida: true,
      linhas: [{ rotulo: 'Meta', valor: 'Chegar a 70 kg' }],
    });
    const alheia = await previas.previa(dono, 'complete_goal', { goalId: metaDoOutro });
    expect(alheia.valida).toBe(false);
    expect(JSON.stringify(alheia)).not.toContain('70 kg');
  });

  it('tool que não pede confirmação não tem resumo', async () => {
    await expect(previas.previa(dono, 'list_meals', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(previas.previa(dono, 'nao_existe', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
