import { BadRequestException } from '@nestjs/common';
import type { DiscoveryService } from '@nestjs/core';
import { PrismaService } from '../../../common/prisma.service';
import { McpToolRegistry } from '../../../mcp/mcp-tool.registry';
import type { McpMetricsService } from '../../../observability/mcp-metrics.service';
import { LogMealTool } from '../../../nutrition/mcp/log-meal.tool';
import { ListMealsTool } from '../../../nutrition/mcp/list-meals.tool';
import { CompleteGoalTool } from '../../../goals/mcp/complete-goal.tool';
import { ForgetMemoryTool } from '../../../chat/memory/mcp/forget-memory.tool';
import { CopyMealTool } from '../../../nutrition/mcp/copy-meal.tool';
import { CopyDayTool } from '../../../nutrition/mcp/copy-day.tool';
import { LogMealTemplateTool } from '../../../nutrition/mcp/log-meal-template.tool';
import { SetGroupSharingTool } from '../../../sharing/mcp/set-group-sharing.tool';
import { AcceptGroupInviteTool } from '../../../sharing/mcp/accept-group-invite.tool';
import { JoinGroupChallengeTool } from '../../../sharing/mcp/join-group-challenge.tool';
import { VoteGroupPollTool } from '../../../sharing/mcp/vote-group-poll.tool';
import { BlockUserTool } from '../../../sharing/mcp/block-user.tool';
import { UnblockUserTool } from '../../../sharing/mcp/unblock-user.tool';
import { CommentOnGroupPostTool } from '../../../sharing/mcp/comment-on-group-post.tool';
import { hashInviteToken } from '../../../sharing/invite.service';
import { AcceptNutritionPlanTool } from '../../../nutrition/mcp/accept-nutrition-plan.tool';
import { LogPlanMealTool } from '../../../nutrition/mcp/log-plan-meal.tool';
import { SwapPlanItemTool } from '../../../nutrition/mcp/swap-plan-item.tool';
import { UndoPlanSwapTool } from '../../../nutrition/mcp/undo-plan-swap.tool';
import { AcceptPlanOfferTool } from '../../../sharing/mcp/accept-plan-offer.tool';
import { DeclinePlanOfferTool } from '../../../sharing/mcp/decline-plan-offer.tool';
import { AdoptGroupPlanTool } from '../../../sharing/mcp/adopt-group-plan.tool';
import { ReschedulePlannedSessionTool } from '../../../workout/mcp/reschedule-planned-session.tool';
import { CreateGroupPostTool } from '../../../sharing/mcp/create-group-post.tool';
import { DeleteMealTool } from '../../../nutrition/mcp/delete-meal.tool';
import { DeleteMealPhotoTool } from '../../../nutrition/mcp/delete-meal-photo.tool';
import { DeleteMealTemplateTool } from '../../../nutrition/mcp/delete-meal-template.tool';
import { DeleteCustomFoodTool } from '../../../nutrition/mcp/delete-custom-food.tool';
import { DeleteFoodPortionTool } from '../../../nutrition/mcp/delete-food-portion.tool';
import { DeleteNutrientTargetTool } from '../../../nutrition/mcp/delete-nutrient-target.tool';
import { DeleteWaterLogTool } from '../../../progress/mcp/delete-water-log.tool';
import { DeleteTrainingBlockTool } from '../../../workout/mcp/delete-training-block.tool';
import { DeleteCustomExerciseTool } from '../../../workout/mcp/delete-custom-exercise.tool';
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
  const classes = [
    LogMealTool,
    ListMealsTool,
    CompleteGoalTool,
    ForgetMemoryTool,
    CopyMealTool,
    CopyDayTool,
    LogMealTemplateTool,
    SetGroupSharingTool,
    AcceptGroupInviteTool,
    JoinGroupChallengeTool,
    CommentOnGroupPostTool,
    VoteGroupPollTool,
    BlockUserTool,
    UnblockUserTool,
    AcceptNutritionPlanTool,
    LogPlanMealTool,
    SwapPlanItemTool,
    UndoPlanSwapTool,
    AcceptPlanOfferTool,
    DeclinePlanOfferTool,
    ReschedulePlannedSessionTool,
    AdoptGroupPlanTool,
    CreateGroupPostTool,
    DeleteMealTool,
    DeleteMealPhotoTool,
    DeleteMealTemplateTool,
    DeleteCustomFoodTool,
    DeleteFoodPortionTool,
    DeleteNutrientTargetTool,
    DeleteWaterLogTool,
    DeleteTrainingBlockTool,
    DeleteCustomExerciseTool,
  ];
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
  let medidaDoDono = '';
  let medidaDoOutro = '';
  let refeicaoDoDono = '';
  let modeloDoDono = '';
  let comunidade = '';
  const TOKEN = 'a'.repeat(40) + 'bcd';
  const TOKEN_VENCIDO = 'z'.repeat(40) + 'xyw';

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
    medidaDoDono = (
      await prisma.foodPortion.create({
        data: {
          foodId: alimentoDoDono,
          label: 'colher de sopa',
          grams: 25,
          createdByUserId: dono.id,
        },
      })
    ).id;
    medidaDoOutro = (
      await prisma.foodPortion.create({
        data: { foodId: alimentoDoDono, label: 'concha', grams: 140, createdByUserId: outro.id },
      })
    ).id;
    refeicaoDoDono = (
      await prisma.meal.create({
        data: {
          userId: dono.id,
          mealType: 'LUNCH',
          eatenAt: new Date('2026-09-24T15:30:00.000Z'),
          items: {
            create: [
              { foodName: 'Feijão', grams: 100, kcal: 76, proteinG: 4.8, carbsG: 13.6, fatG: 0.5 },
            ],
          },
        },
      })
    ).id;
    modeloDoDono = (
      await prisma.mealTemplate.create({
        data: {
          userId: dono.id,
          name: 'Café de sempre',
          mealType: 'BREAKFAST',
          items: {
            create: [
              {
                position: 0,
                foodName: 'Pão francês',
                grams: 50,
                kcal: 150,
                proteinG: 4,
                carbsG: 29,
                fatG: 1,
              },
              {
                position: 1,
                foodName: 'Café com leite',
                grams: 200,
                kcal: 80,
                proteinG: 4,
                carbsG: 8,
                fatG: 3,
              },
            ],
          },
        },
      })
    ).id;
    comunidade = (
      await prisma.group.create({
        data: {
          type: 'SPONSORED',
          name: 'Academia da Prévia',
          slug: `${stamp}-academia`,
          ownerId: outro.id,
          memberships: {
            create: [
              { userId: outro.id, role: 'OWNER', status: 'ACTIVE' },
              { userId: dono.id, role: 'MEMBER', status: 'ACTIVE' },
            ],
          },
          invites: {
            create: [
              {
                tokenHash: hashInviteToken(TOKEN),
                role: 'MEMBER',
                expiresAt: new Date('2026-10-01T00:00:00.000Z'),
              },
              {
                tokenHash: hashInviteToken(TOKEN_VENCIDO),
                role: 'MEMBER',
                expiresAt: new Date('2026-09-20T00:00:00.000Z'),
              },
            ],
          },
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
    await prisma.group.deleteMany({ where: { id: comunidade } });
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

  it('item em medida caseira aparece como foi dito, com as gramas ao lado', async () => {
    const previa = await previas.previa(
      dono,
      'log_meal',
      {
        mealType: 'LUNCH',
        eatenAt: '2026-09-25T15:30:00.000Z',
        items: [{ foodId: alimentoDoDono, portionId: medidaDoDono, quantity: 2 }],
      },
      AGORA,
    );

    expect(previa.linhas.at(-1)).toEqual({
      rotulo: 'Item',
      valor: '2 × colher de sopa (50 g) de Arroz branco cozido',
    });
  });

  it('medida de outra conta não é lida: o resumo recusa', async () => {
    const previa = await previas.previa(
      dono,
      'log_meal',
      {
        mealType: 'LUNCH',
        eatenAt: '2026-09-25T15:30:00.000Z',
        items: [{ foodId: alimentoDoDono, portionId: medidaDoOutro, quantity: 1 }],
      },
      AGORA,
    );

    expect(previa.valida).toBe(false);
    expect(JSON.stringify(previa)).not.toContain('concha');
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

  it('copiar refeição: qual refeição e para que dia', async () => {
    await expect(
      previas.previa(dono, 'copy_meal', { mealId: refeicaoDoDono, toDate: '2026-09-25' }, AGORA),
    ).resolves.toEqual({
      valida: true,
      linhas: [
        { rotulo: 'Refeição', valor: 'Almoço de ontem, 12:30' },
        { rotulo: 'Copiar para', valor: 'hoje' },
      ],
    });
    const alheia = await previas.previa(
      outro,
      'copy_meal',
      { mealId: refeicaoDoDono, toDate: '2026-09-25' },
      AGORA,
    );
    expect(alheia.valida).toBe(false);
  });

  it('plano alimentar (#376): cada id vira nome, e só para o dono do plano', async () => {
    const plano = await prisma.nutritionPlan.create({
      data: {
        userId: dono.id,
        version: 2,
        status: 'SENT',
        kcalMin: 1760,
        kcalMax: 1920,
        proteinMinG: 130,
        proteinMaxG: 150,
        carbsMinG: 175,
        carbsMaxG: 205,
        fatMinG: 52,
        fatMaxG: 64,
        meals: {
          create: {
            mealType: 'BREAKFAST',
            name: 'Café da manhã',
            position: 0,
            options: {
              create: {
                position: 0,
                items: {
                  create: {
                    position: 0,
                    foodName: 'Pão integral',
                    grams: 50,
                    kcal: 124,
                    proteinG: 4,
                    carbsG: 25,
                    fatG: 1,
                    equivalents: {
                      create: {
                        position: 0,
                        foodName: 'Tapioca',
                        grams: 40,
                        kcal: 136,
                        proteinG: 0,
                        carbsG: 34,
                        fatG: 0,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      include: {
        meals: { include: { options: { include: { items: { include: { equivalents: true } } } } } },
      },
    });
    const refeicao = plano.meals[0];
    const opcao = refeicao.options[0];
    const item = opcao.items[0];
    const equivalente = item.equivalents[0];
    const troca = await prisma.nutritionSwap.create({
      data: {
        planId: plano.id,
        itemId: item.id,
        equivalentId: equivalente.id,
        date: '2026-09-25',
        foodName: 'Tapioca',
        grams: 40,
        kcal: 136,
      },
    });

    const casos: Array<
      [string, Record<string, unknown>, Array<{ rotulo: string; valor: string }>]
    > = [
      [
        'accept_nutrition_plan',
        { planId: plano.id },
        [{ rotulo: 'Plano alimentar', valor: 'Plano alimentar v2' }],
      ],
      [
        'log_plan_meal',
        { planMealId: refeicao.id, optionId: opcao.id },
        [
          { rotulo: 'Refeição do plano', valor: 'Café da manhã' },
          { rotulo: 'Opção', valor: 'Opção 1: Pão integral' },
        ],
      ],
      [
        'swap_plan_item',
        { itemId: item.id, equivalentId: equivalente.id },
        [
          { rotulo: 'Item do plano', valor: '50 g de Pão integral (Café da manhã)' },
          { rotulo: 'Trocar por', valor: '40 g de Tapioca' },
        ],
      ],
      [
        'undo_plan_swap',
        { swapId: troca.id },
        [{ rotulo: 'Troca', valor: 'Tapioca no lugar de Pão integral' }],
      ],
    ];
    for (const [tool, args, linhas] of casos) {
      await expect(previas.previa(dono, tool, args)).resolves.toEqual({ valida: true, linhas });
      const alheia = await previas.previa(outro, tool, args);
      expect(alheia.valida).toBe(false);
      expect(JSON.stringify(alheia)).not.toMatch(/Pão|Tapioca|Café/);
    }
  });

  it('plano recebido e agenda (#379): o título, a versão e a sessão, só para o dono', async () => {
    const helena = await prisma.user.create({
      data: {
        logtoSub: `previa-helena-${Date.now()}`,
        email: `previa-helena-${Date.now()}@test.local`,
        name: 'Helena',
        timezone: TZ,
      },
    });
    const offer = await prisma.planOffer.create({
      data: {
        userId: dono.id,
        authorId: helena.id,
        versions: {
          create: [
            {
              version: 1,
              status: 'SUPERSEDED',
              title: 'Inferior',
              snapshot: {},
              snapshotVersion: 1,
              schedule: 'FLEXIBLE',
            },
            {
              version: 2,
              status: 'PENDING',
              title: 'Inferior',
              snapshot: {},
              snapshotVersion: 1,
              schedule: 'FLEXIBLE',
            },
          ],
        },
      },
      include: { versions: { orderBy: { version: 'asc' } } },
    });
    const v2 = offer.versions[1]!;
    const plano = await prisma.workoutPlan.create({ data: { userId: dono.id, name: 'Superior' } });
    const sessao = await prisma.plannedSession.create({
      data: { userId: dono.id, planId: plano.id, date: '2026-09-24', order: 3 },
    });

    const casos: Array<
      [string, Record<string, unknown>, Array<{ rotulo: string; valor: string }>]
    > = [
      [
        'accept_plan_offer',
        { offerId: offer.id, versionId: v2.id },
        [
          { rotulo: 'Plano recebido', valor: 'Inferior, de Helena' },
          { rotulo: 'Versão', valor: 'Inferior v2' },
        ],
      ],
      [
        'decline_plan_offer',
        { offerId: offer.id, versionId: v2.id },
        [
          { rotulo: 'Plano recebido', valor: 'Inferior, de Helena' },
          { rotulo: 'Versão', valor: 'Inferior v2' },
        ],
      ],
      [
        'reschedule_planned_session',
        { id: sessao.id, date: '2026-09-25' },
        [
          { rotulo: 'Sessão da agenda', valor: 'Superior, sessão 3, ontem' },
          { rotulo: 'Dia', valor: 'hoje' },
        ],
      ],
    ];
    for (const [tool, args, linhas] of casos) {
      await expect(previas.previa(dono, tool, args, AGORA)).resolves.toEqual({
        valida: true,
        linhas,
      });
      const alheia = await previas.previa(outro, tool, args, AGORA);
      expect(alheia.valida).toBe(false);
      expect(JSON.stringify(alheia)).not.toMatch(/Inferior|Superior|Helena/);
    }
    await prisma.user.delete({ where: { id: helena.id } });
  });

  it('copiar dia: de quando para quando', async () => {
    await expect(
      previas.previa(dono, 'copy_day', { fromDate: '2026-09-24', toDate: '2026-09-25' }, AGORA),
    ).resolves.toEqual({
      valida: true,
      linhas: [
        { rotulo: 'Copiar de', valor: 'ontem' },
        { rotulo: 'Copiar para', valor: 'hoje' },
      ],
    });
  });

  it('refeição salva aparece pelo nome e pelos itens, só para a dona', async () => {
    const previa = await previas.previa(
      dono,
      'log_meal_template',
      { templateId: modeloDoDono, eatenAt: '2026-09-25T11:00:00.000Z' },
      AGORA,
    );
    expect(previa).toEqual({
      valida: true,
      linhas: [
        {
          rotulo: 'Refeição salva',
          valor: 'Café de sempre: 50 g de Pão francês, 200 g de Café com leite',
        },
        { rotulo: 'Quando', valor: 'hoje, 08:00' },
      ],
    });
    const alheia = await previas.previa(
      outro,
      'log_meal_template',
      { templateId: modeloDoDono, eatenAt: '2026-09-25T11:00:00.000Z' },
      AGORA,
    );
    expect(alheia.valida).toBe(false);
    expect(JSON.stringify(alheia)).not.toContain('Café');
  });

  it('entrar num desafio: o nome do desafio e o apelido; de quem não é membro, nada', async () => {
    const desafio = await prisma.groupChallenge.create({
      data: {
        groupId: comunidade,
        title: 'Outubro ativo',
        metric: 'ACTIVE_DAYS',
        startsAt: new Date('2026-10-01T03:00:00.000Z'),
        endsAt: new Date('2026-11-01T03:00:00.000Z'),
        timezone: TZ,
      },
    });
    const estranho = await prisma.user.create({
      data: {
        logtoSub: `previa-desafio-${Date.now()}`,
        email: `previa-desafio-${Date.now()}@test.local`,
        name: 'estranho',
      },
    });
    try {
      await expect(
        previas.previa(dono, 'join_group_challenge', {
          groupId: comunidade,
          challengeId: desafio.id,
          displayName: 'Ana',
        }),
      ).resolves.toEqual({
        valida: true,
        linhas: [
          { rotulo: 'Comunidade', valor: 'Academia da Prévia' },
          { rotulo: 'Desafio', valor: 'Outubro ativo' },
          { rotulo: 'Apelido na comunidade', valor: 'Ana' },
        ],
      });
      // Membro de OUTRA comunidade, com o id do desafio desta: a comunidade dele
      // resolve, o desafio não.
      const daOutra = await prisma.group.create({
        data: {
          type: 'SPONSORED',
          name: 'Outra Academia',
          slug: `previa-outra-${Date.now()}`,
          ownerId: estranho.id,
          memberships: { create: [{ userId: estranho.id, role: 'OWNER', status: 'ACTIVE' }] },
        },
      });
      const deFora = await previas.previa(
        { id: estranho.id, timezone: TZ },
        'join_group_challenge',
        {
          groupId: daOutra.id,
          challengeId: desafio.id,
        },
      );
      expect(deFora.valida).toBe(false);
      expect(JSON.stringify(deFora)).not.toContain('Outubro ativo');
    } finally {
      await prisma.user.delete({ where: { id: estranho.id } });
    }
  });

  it('adotar plano da comunidade (#396): trocar as metas mostra o antes e o depois', async () => {
    const metasDoPlano = {
      kcalMin: 1700,
      kcalMax: 1900,
      proteinMinG: 130,
      proteinMaxG: 160,
      carbsMinG: 150,
      carbsMaxG: 200,
      fatMinG: 45,
      fatMaxG: 65,
    };
    const modelo = await prisma.groupPlanTemplate.create({
      data: {
        groupId: comunidade,
        authorId: outro.id,
        kind: 'NUTRITION',
        title: 'Cutting 1.800 kcal',
        snapshot: { version: 1, goals: metasDoPlano, meals: [] },
        snapshotVersion: 1,
        publishedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    await prisma.userGoals.upsert({
      where: { userId: dono.id },
      create: {
        userId: dono.id,
        kcalMin: 1800,
        kcalMax: 2200,
        proteinMinG: 120,
        proteinMaxG: 160,
        carbsMinG: 150,
        carbsMaxG: 200,
        fatMinG: 50,
        fatMaxG: 75,
      },
      update: {},
    });
    try {
      const comMetas = await previas.previa(dono, 'adopt_group_plan', {
        groupId: comunidade,
        templateId: modelo.id,
        applyGoals: true,
        saveMeals: false,
      });
      expect(comMetas).toEqual({
        valida: true,
        linhas: expect.arrayContaining([
          { rotulo: 'Plano da comunidade', valor: 'Cutting 1.800 kcal' },
          { rotulo: 'Calorias', valor: '1.800–2.200 kcal → 1.700–1.900 kcal' },
          { rotulo: 'Proteína', valor: '120–160 g → 130–160 g' },
          { rotulo: 'Carboidrato', valor: '150–200 g (igual)' },
          { rotulo: 'Gordura', valor: '50–75 g → 45–65 g' },
        ]),
      });
      // Sem trocar as metas, nada de antes e depois.
      const semMetas = await previas.previa(dono, 'adopt_group_plan', {
        groupId: comunidade,
        templateId: modelo.id,
        applyGoals: false,
      });
      expect(JSON.stringify(semMetas)).not.toContain('→');
    } finally {
      await prisma.groupPlanTemplate.delete({ where: { id: modelo.id } });
      await prisma.userGoals.deleteMany({ where: { userId: dono.id } });
    }
  });

  it('comentar no mural: o trecho do post; removido ou de outra comunidade, nada', async () => {
    const m = await prisma.groupMembership.findFirstOrThrow({
      where: { groupId: comunidade, userId: dono.id },
    });
    const post = await prisma.groupPost.create({
      data: { groupId: comunidade, membershipId: m.id, body: 'Treino de pernas hoje às 18h' },
    });
    const removido = await prisma.groupPost.create({
      data: { groupId: comunidade, membershipId: m.id, body: 'Post tirado', removedAt: new Date() },
    });
    const estranho = await prisma.user.create({
      data: {
        logtoSub: `previa-post-${Date.now()}`,
        email: `previa-post-${Date.now()}@test.local`,
        name: 'estranho',
      },
    });
    try {
      await expect(
        previas.previa(dono, 'comment_on_group_post', {
          groupId: comunidade,
          postId: post.id,
          body: 'Bora!',
        }),
      ).resolves.toEqual({
        valida: true,
        linhas: [
          { rotulo: 'Comunidade', valor: 'Academia da Prévia' },
          { rotulo: 'Post', valor: 'Treino de pernas hoje às 18h' },
          { rotulo: 'Texto', valor: 'Bora!' },
        ],
      });
      const doRemovido = await previas.previa(dono, 'comment_on_group_post', {
        groupId: comunidade,
        postId: removido.id,
        body: 'x',
      });
      expect(doRemovido.valida).toBe(false);

      const daOutra = await prisma.group.create({
        data: {
          type: 'SPONSORED',
          name: 'Outra Academia',
          slug: `previa-post-outra-${Date.now()}`,
          ownerId: estranho.id,
          memberships: { create: [{ userId: estranho.id, role: 'OWNER', status: 'ACTIVE' }] },
        },
      });
      const deFora = await previas.previa(
        { id: estranho.id, timezone: TZ },
        'comment_on_group_post',
        { groupId: daOutra.id, postId: post.id, body: 'x' },
      );
      expect(deFora.valida).toBe(false);
      expect(JSON.stringify(deFora)).not.toContain('Treino de pernas');
    } finally {
      await prisma.groupPost.deleteMany({ where: { id: { in: [post.id, removido.id] } } });
      await prisma.user.delete({ where: { id: estranho.id } });
    }
  });

  it('mural (#394): opção da enquete no cartão; post de quem tem bloqueio não aparece', async () => {
    const m = await prisma.groupMembership.findFirstOrThrow({
      where: { groupId: comunidade, userId: dono.id },
    });
    const gabi = await prisma.user.create({
      data: {
        logtoSub: `previa-gabi-${Date.now()}`,
        email: `previa-gabi-${Date.now()}@test.local`,
        name: 'Gabi Torres',
      },
    });
    const mg = await prisma.groupMembership.create({
      data: { groupId: comunidade, userId: gabi.id, role: 'MEMBER', status: 'ACTIVE' },
    });
    const enquete = await prisma.groupPost.create({
      data: {
        groupId: comunidade,
        membershipId: m.id,
        kind: 'POLL',
        body: '',
        poll: {
          create: {
            question: 'Qual horário do aulão?',
            closesAt: new Date(Date.now() + 86_400_000),
            options: {
              create: [
                { label: '8h', order: 0 },
                { label: '9h', order: 1 },
              ],
            },
          },
        },
      },
      include: { poll: { include: { options: true } } },
    });
    const daGabi = await prisma.groupPost.create({
      data: { groupId: comunidade, membershipId: mg.id, body: 'Recorde no agachamento' },
    });
    const extras: string[] = [];
    try {
      await expect(
        previas.previa(dono, 'vote_group_poll', {
          groupId: comunidade,
          postId: enquete.id,
          optionId: enquete.poll!.options[0]!.id,
        }),
      ).resolves.toEqual({
        valida: true,
        linhas: [
          { rotulo: 'Comunidade', valor: 'Academia da Prévia' },
          { rotulo: 'Post', valor: 'Qual horário do aulão?' },
          { rotulo: 'Opção', valor: '8h' },
        ],
      });
      // Bloquear é só no app (#481): o bloqueio entra direto no banco, e o cartão de
      // comentar não mostra o trecho do post de quem tem bloqueio com a pessoa.
      await prisma.userBlock.create({
        data: { blockerId: dono.id, blockedId: gabi.id, label: 'Gabi' },
      });
      const comentar = await previas.previa(dono, 'comment_on_group_post', {
        groupId: comunidade,
        postId: daGabi.id,
        body: 'Boa!',
      });
      expect(comentar.valida).toBe(false);
      expect(JSON.stringify(comentar)).not.toContain('agachamento');

      // A opção da enquete de quem tem bloqueio também não aparece no cartão,
      // nem quando o post pedido é outro, visível (o modelo pode trocar ids).
      const enqueteDaGabi = await prisma.groupPost.create({
        data: {
          groupId: comunidade,
          membershipId: mg.id,
          kind: 'POLL',
          body: '',
          poll: {
            create: {
              question: 'Treino de sábado?',
              closesAt: new Date(Date.now() + 86_400_000),
              options: {
                create: [
                  { label: 'Corrida no parque', order: 0 },
                  { label: 'Funcional', order: 1 },
                ],
              },
            },
          },
        },
        include: { poll: { include: { options: true } } },
      });
      extras.push(enqueteDaGabi.id);
      const voto = await previas.previa(dono, 'vote_group_poll', {
        groupId: comunidade,
        postId: enquete.id,
        optionId: enqueteDaGabi.poll!.options[0]!.id,
      });
      expect(voto.valida).toBe(false);
      expect(JSON.stringify(voto)).not.toContain('Corrida no parque');
    } finally {
      await prisma.groupPost.deleteMany({
        where: { id: { in: [enquete.id, daGabi.id, ...extras] } },
      });
      await prisma.user.delete({ where: { id: gabi.id } });
    }
  });

  it('comunidade de que a pessoa não é membro não ganha nome no cartão', async () => {
    const estranho = await prisma.user.create({
      data: {
        logtoSub: `previa-estranho-${Date.now()}`,
        email: `previa-estranho-${Date.now()}@test.local`,
        name: 'estranho',
      },
    });
    try {
      const previa = await previas.previa({ id: estranho.id, timezone: TZ }, 'create_group_post', {
        groupId: comunidade,
        body: 'Oi, gente',
      });
      expect(previa.valida).toBe(false);
      expect(JSON.stringify(previa)).not.toContain('Academia da Prévia');
    } finally {
      await prisma.user.delete({ where: { id: estranho.id } });
    }
  });

  it('tool que não pede confirmação não tem resumo', async () => {
    await expect(previas.previa(dono, 'list_meals', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(previas.previa(dono, 'nao_existe', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('consentir, entrar por convite e bloquear não têm cartão: são só no app (#481)', async () => {
    const pedidos: Array<[string, Record<string, unknown>]> = [
      ['set_group_sharing', { groupId: comunidade, scopes: ['WORKOUT'], statsOptIn: false }],
      ['accept_group_invite', { token: TOKEN, scopes: [], statsOptIn: false }],
      ['block_user', { groupId: comunidade, postId: comunidade }],
      ['unblock_user', { blockId: comunidade }],
    ];
    for (const [nome, args] of pedidos) {
      expect(registry.buscar(nome)).toBeDefined();
      await expect(previas.previa(dono, nome, args)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  describe('apagar (#481): o cartão nomeia o que vai sumir, e só o que é da pessoa', () => {
    it('refeição e refeição salva', async () => {
      const refeicao = await previas.previa(dono, 'delete_meal', { id: refeicaoDoDono });
      expect(refeicao.valida).toBe(true);
      expect(refeicao.linhas).toHaveLength(1);
      expect(refeicao.linhas[0]?.rotulo).toBe('Refeição');
      expect(refeicao.linhas[0]?.valor).toMatch(/^Almoço de /);
      expect((await previas.previa(outro, 'delete_meal', { id: refeicaoDoDono })).valida).toBe(
        false,
      );

      await expect(
        previas.previa(dono, 'delete_meal_template', { id: modeloDoDono }),
      ).resolves.toEqual({
        valida: true,
        linhas: [{ rotulo: 'Refeição salva', valor: expect.stringMatching(/^Café de sempre: /) }],
      });
    });

    it('foto da refeição: só a refeição que tem foto', async () => {
      const semFoto = await previas.previa(dono, 'delete_meal_photo', { id: refeicaoDoDono });
      expect(semFoto.valida).toBe(false);
    });

    it('alimento e medida: só os que a pessoa criou, nunca os do catálogo', async () => {
      await expect(
        previas.previa(dono, 'delete_custom_food', { id: alimentoDoDono }),
      ).resolves.toEqual({
        valida: true,
        linhas: [{ rotulo: 'Alimento', valor: 'Arroz branco cozido' }],
      });
      expect(
        (await previas.previa(outro, 'delete_custom_food', { id: alimentoDoDono })).valida,
      ).toBe(false);
      const doCatalogo = await prisma.food.findFirstOrThrow({
        where: { createdByUserId: null },
        select: { id: true },
      });
      expect((await previas.previa(dono, 'delete_custom_food', { id: doCatalogo.id })).valida).toBe(
        false,
      );

      await expect(
        previas.previa(dono, 'delete_food_portion', { id: medidaDoDono }),
      ).resolves.toEqual({
        valida: true,
        linhas: [{ rotulo: 'Medida', valor: 'colher de sopa (25 g) de Arroz branco cozido' }],
      });
      expect(
        (await previas.previa(dono, 'delete_food_portion', { id: medidaDoOutro })).valida,
      ).toBe(false);
    });

    it('meta de nutriente: o nome e o limite, pela chave da própria pessoa', async () => {
      await prisma.nutrientTarget.create({
        data: { userId: dono.id, nutrientKey: 'sodium_mg', label: 'Sódio', unit: 'mg', max: 2000 },
      });
      try {
        await expect(
          previas.previa(dono, 'delete_nutrient_target', { nutrientKey: 'sodium_mg' }),
        ).resolves.toEqual({
          valida: true,
          linhas: [{ rotulo: 'Meta de nutriente', valor: 'Sódio (até 2.000 mg)' }],
        });
        expect(
          (await previas.previa(outro, 'delete_nutrient_target', { nutrientKey: 'sodium_mg' }))
            .valida,
        ).toBe(false);
      } finally {
        await prisma.nutrientTarget.deleteMany({ where: { userId: dono.id } });
      }
    });

    it('água, bloco e exercício criado pela pessoa', async () => {
      const agua = await prisma.waterLog.create({
        data: { userId: dono.id, ml: 500, date: '2026-09-25' },
      });
      const bloco = await prisma.trainingBlock.create({
        data: { userId: dono.id, kind: 'hypertrophy', startDate: '2026-09-01', weeksTotal: 4 },
      });
      const exercicio = await prisma.exercise.create({
        data: { name: 'Remada do dono', muscleGroup: 'costas', createdByUserId: dono.id },
      });
      const doCatalogo = await prisma.exercise.findFirstOrThrow({
        where: { createdByUserId: null },
        select: { id: true },
      });
      try {
        await expect(previas.previa(dono, 'delete_water_log', { id: agua.id })).resolves.toEqual({
          valida: true,
          linhas: [{ rotulo: 'Registro de água', valor: expect.stringMatching(/^500 ml, /) }],
        });
        const blocoDoDono = await previas.previa(dono, 'delete_training_block', {
          blockId: bloco.id,
        });
        expect(blocoDoDono.linhas).toEqual([
          {
            rotulo: 'Bloco de treino',
            valor: expect.stringMatching(/^Hipertrofia, 4 semanas, desde /),
          },
        ]);
        expect(
          (await previas.previa(outro, 'delete_training_block', { blockId: bloco.id })).valida,
        ).toBe(false);
        await expect(
          previas.previa(dono, 'delete_custom_exercise', { id: exercicio.id }),
        ).resolves.toEqual({
          valida: true,
          linhas: [{ rotulo: 'Exercício', valor: 'Remada do dono' }],
        });
        expect(
          (await previas.previa(dono, 'delete_custom_exercise', { id: doCatalogo.id })).valida,
        ).toBe(false);
      } finally {
        await prisma.waterLog.deleteMany({ where: { id: agua.id } });
        await prisma.trainingBlock.deleteMany({ where: { id: bloco.id } });
        await prisma.exercise.deleteMany({ where: { id: exercicio.id } });
      }
    });
  });

  it('meta de nutriente pela chave que a tool aceita (normalizada) também ganha cartão', async () => {
    await prisma.nutrientTarget.create({
      data: { userId: dono.id, nutrientKey: 'sodium_mg', label: 'Sódio', unit: 'mg', max: 2000 },
    });
    try {
      // `NutrientTargetService.delete` normaliza "Sodium mg" para "sodium_mg" e apaga.
      const r = await previas.previa(dono, 'delete_nutrient_target', { nutrientKey: 'Sodium mg' });
      expect(r.valida).toBe(true);
    } finally {
      await prisma.nutrientTarget.deleteMany({ where: { userId: dono.id } });
    }
  });
});
