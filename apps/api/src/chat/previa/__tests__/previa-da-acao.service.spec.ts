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
import { hashInviteToken } from '../../../sharing/invite.service';
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

  it('consentimento à comunidade: o nome dela e as categorias, nunca o grupo de alimento', async () => {
    // `groupId` é grupo de alimento no resto do catálogo; aqui é a comunidade.
    await expect(
      previas.previa(dono, 'set_group_sharing', {
        groupId: comunidade,
        scopes: ['WORKOUT', 'HABITS'],
        statsOptIn: false,
      }),
    ).resolves.toEqual({
      valida: true,
      linhas: [
        { rotulo: 'Comunidade', valor: 'Academia da Prévia' },
        { rotulo: 'Compartilha com a equipe', valor: 'Treino, Água e passos' },
        { rotulo: 'Estatísticas agregadas', valor: 'Não participa' },
      ],
    });
    const semNada = await previas.previa(dono, 'set_group_sharing', {
      groupId: comunidade,
      scopes: [],
      statsOptIn: true,
    });
    expect(semNada.linhas).toContainEqual({ rotulo: 'Compartilha com a equipe', valor: 'Nada' });
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
          { rotulo: 'Apelido no ranking', valor: 'Ana' },
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

  it('comunidade de que a pessoa não é membro não ganha nome no cartão', async () => {
    const estranho = await prisma.user.create({
      data: {
        logtoSub: `previa-estranho-${Date.now()}`,
        email: `previa-estranho-${Date.now()}@test.local`,
        name: 'estranho',
      },
    });
    try {
      const previa = await previas.previa({ id: estranho.id, timezone: TZ }, 'set_group_sharing', {
        groupId: comunidade,
        scopes: ['BODY'],
        statsOptIn: false,
      });
      expect(previa.valida).toBe(false);
      expect(JSON.stringify(previa)).not.toContain('Academia da Prévia');
    } finally {
      await prisma.user.delete({ where: { id: estranho.id } });
    }
  });

  it('aceitar convite mostra a comunidade, e convite vencido recusa o resumo', async () => {
    await expect(
      previas.previa(
        dono,
        'accept_group_invite',
        { token: TOKEN, scopes: ['NUTRITION'], statsOptIn: true },
        AGORA,
      ),
    ).resolves.toEqual({
      valida: true,
      linhas: [
        { rotulo: 'Comunidade', valor: 'Academia da Prévia' },
        { rotulo: 'Compartilha com a equipe', valor: 'Alimentação' },
        { rotulo: 'Estatísticas agregadas', valor: 'Participa' },
      ],
    });
    const vencido = await previas.previa(
      dono,
      'accept_group_invite',
      { token: TOKEN_VENCIDO, scopes: [], statsOptIn: false },
      AGORA,
    );
    expect(vencido.valida).toBe(false);
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
