import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { MediaFile } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { LogtoManagementService } from '../auth/logto-management.service';
import { CheckpointPurgeService } from '../chat/checkpoint-purge.service';
import { ACCOUNT_DELETION_HOOKS, type AccountDeletionHook } from './account-deletion.hook';
import { ITENS_EM_ORDEM } from '../nutrition/itens-em-ordem';
import { presentMeal } from '../nutrition/meal-presenter';
import { MediaService } from '../storage/media.service';

/**
 * Frase exata que o `delete_my_account` (MCP) exige. Longa de propósito: quem
 * chama é um LLM, e a frase obriga a intenção a ser inequívoca.
 */
export const DELETE_CONFIRMATION = 'DELETAR MINHA CONTA';

/**
 * O que a pessoa digita no app e na web para apagar (prancha Al-V8: "Digite
 * APAGAR para confirmar"). Vale só no `DELETE /users/me`.
 */
export const APP_DELETE_CONFIRMATION = 'APAGAR';

/**
 * Export e deleção de conta — direitos de portabilidade e eliminação da LGPD
 * (issue #95). Também expostos como tools MCP, então o usuário exerce os dois
 * direitos conversando com o Claude, sem abrir terminal nem formulário.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logtoManagement: LogtoManagementService,
    private readonly checkpoints: CheckpointPurgeService,
    @Optional()
    @Inject(ACCOUNT_DELETION_HOOKS)
    private readonly ganchos: AccountDeletionHook[] = [],
    /** Os links das fotos das refeições no arquivo de exportação (ADR 038). */
    @Optional() private readonly media?: MediaService,
  ) {}

  /**
   * Todos os dados do usuário em JSON. Inclui o catálogo custom que ele criou
   * (alimentos e exercícios), porque é conteúdo autoral dele — mas não o catálogo
   * público TACO, que não é dado pessoal e tornaria o export inútil de tamanho.
   */
  async exportData(userId: string, opts: { photoLinks?: boolean } = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        timezone: true,
        heightCm: true,
        sex: true,
        birthDate: true,
        activityLevel: true,
        objective: true,
        onboardedAt: true,
        // Retomada do onboarding (#371): a etapa, o rascunho (peso e metas ainda
        // não confirmados) e o cartão "Primeiros passos".
        onboardingStep: true,
        onboardingDraft: true,
        firstStepsSince: true,
        firstStepsDoneAt: true,
        // Você (#387): o perfil das comunidades, as preferências e as unidades.
        // A foto entra em `mediaUploaded` (propósito `user_avatar`).
        nickname: true,
        bio: true,
        avatarVisibility: true,
        keepMealPhotos: true,
        whatsapp: true,
        whatsappOptIn: true,
        loadUnit: true,
        distanceUnit: true,
        // Silêncio noturno (#389), em minutos do dia no fuso da pessoa.
        quietHoursEnabled: true,
        quietFrom: true,
        quietTo: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const [
      nutritionGoals,
      nutrientTargets,
      personalGoals,
      meals,
      customFoods,
      favoriteFoods,
      foodPortions,
      mealTemplates,
      nutritionPlans,
      planOffers,
      plannedSessions,
      customExercises,
      favoriteExercises,
      workoutPlans,
      workoutSessions,
      weightLogs,
      stepLogs,
      waterLogs,
      achievements,
      trainingBlocks,
      professionalLinks,
      accessLogs,
      conversations,
      memories,
      subscriptions,
      communityMemberships,
      invitesCreated,
      contentPublished,
      mediaUploaded,
      devices,
      notificationPreferences,
      webPushSubscriptions,
      newsRead,
      tutorialsSeen,
      ideas,
      dataExports,
      inboxNotices,
      reminders,
      mcpConnections,
    ] = await Promise.all([
      this.prisma.userGoals.findUnique({ where: { userId } }),
      this.prisma.nutrientTarget.findMany({ where: { userId }, orderBy: { label: 'asc' } }),
      this.prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.meal.findMany({
        where: { userId },
        include: { ...ITENS_EM_ORDEM, photoFile: true },
        orderBy: { eatenAt: 'asc' },
      }),
      this.prisma.food.findMany({
        where: { createdByUserId: userId },
        orderBy: { name: 'asc' },
      }),
      // O nome junto do id: o id de um alimento público só faz sentido dentro desta instância.
      this.prisma.favoriteFood.findMany({
        where: { userId },
        select: { foodId: true, food: { select: { name: true } }, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Medidas que a pessoa criou ("minha concha = 140 g"); as do catálogo não têm dono.
      this.prisma.foodPortion.findMany({
        where: { createdByUserId: userId },
        select: {
          foodId: true,
          food: { select: { name: true } },
          label: true,
          grams: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Refeições salvas, com o retrato dos itens.
      this.prisma.mealTemplate.findMany({
        where: { userId },
        include: { items: { orderBy: { position: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
      // Plano alimentar recebido da equipe (#376): é da pessoa, com as refeições,
      // opções, itens, equivalentes, o "comi isso" e as trocas (inclusive as
      // desfeitas). O autor vai pelo nome, nunca pelo id de outra conta.
      this.prisma.nutritionPlan.findMany({
        where: { userId },
        omit: { authorId: true },
        include: {
          author: { select: { name: true } },
          meals: {
            orderBy: { position: 'asc' },
            include: {
              logs: { orderBy: { date: 'asc' } },
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
          swaps: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
        },
        orderBy: { sentAt: 'asc' },
      }),
      // Plano de treino recebido da equipe (#379): a oferta, cada versão com o
      // retrato e a resposta, e a agenda. O autor vai pelo nome.
      this.prisma.planOffer.findMany({
        where: { userId },
        omit: { authorId: true },
        include: {
          author: { select: { name: true } },
          group: { select: { name: true } },
          versions: { orderBy: { version: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.plannedSession.findMany({
        where: { userId },
        orderBy: [{ date: 'asc' }, { order: 'asc' }],
      }),
      this.prisma.exercise.findMany({
        where: { createdByUserId: userId },
        orderBy: { name: 'asc' },
      }),
      // Favoritos de exercício (#378), com o nome pelo mesmo motivo do favorito de alimento.
      this.prisma.favoriteExercise.findMany({
        where: { userId },
        select: { exerciseId: true, exercise: { select: { name: true } }, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // A linha do plano leva a configuração inteira (descanso, técnica, carga
      // inicial, meta de cardio, bi-set) e a série por série (#378).
      this.prisma.workoutPlan.findMany({
        where: { userId },
        include: {
          // Circuito (#380): formato e tempos; o resultado vem na sessão (`circuit`).
          circuit: true,
          exercises: {
            include: {
              exercise: { select: { id: true, name: true } },
              sets: { orderBy: { order: 'asc' } },
            },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // A sensação vem na própria linha; as respostas do fim do treino (#377) vêm junto.
      this.prisma.workoutSession.findMany({
        where: { userId },
        include: {
          sets: { include: { exercise: { select: { id: true, name: true } } } },
          checkin: true,
        },
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.weightLog.findMany({ where: { userId }, orderBy: { loggedAt: 'asc' } }),
      this.prisma.stepLog.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
      this.prisma.waterLog.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
      // O `context` do desbloqueio (exercício e carga do primeiro recorde, por exemplo) é dado
      // de saúde e não existe em nenhuma outra tabela — sem esta consulta a portabilidade
      // devolveria menos do que "tudo".
      this.prisma.userAchievement.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'asc' },
      }),
      // O bloco de periodização é plano que o titular aceitou, com os multiplicadores
      // congelados naquele dia (ADR 019). Não dá para reconstruí-lo a partir das sessões:
      // sem as semanas junto, o export devolveria o treino feito sem o treino combinado.
      this.prisma.trainingBlock.findMany({
        where: { userId },
        include: { weeks: { orderBy: { weekNumber: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
      // B2B (#155): consentimento que o titular concedeu, e a trilha de quem leu
      // o dado dele. Os dois são dado do titular — o primeiro é um ato dele, o
      // segundo é o que responde "quem olhou meu dado" —, e a LGPD art. 18 V
      // cobra os dois no export. Ficaram de fora na #153 com o argumento de que
      // seriam consultados na tela de compartilhamento; a tela existe agora, e
      // "está na tela" nunca foi resposta para portabilidade.
      //
      // O que NÃO entra: `linksAsProfessional`. Ali o titular é o profissional,
      // e a lista é de PACIENTES dele — dado de terceiro, e exportá-lo entregaria
      // a composição da clientela a quem pedisse o próprio arquivo.
      this.prisma.professionalLink.findMany({
        where: { subjectUserId: userId },
        select: {
          id: true,
          groupId: true,
          group: { select: { name: true } },
          // Nome, e não o `userId` do profissional: o export é do titular, e um
          // identificador interno de outra pessoa não acrescenta nada a ele.
          professional: { select: { name: true } },
          scopes: true,
          grantedAt: true,
          revokedAt: true,
          revokedReason: true,
        },
        orderBy: { grantedAt: 'asc' },
      }),
      this.prisma.professionalAccessLog.findMany({
        where: { subjectUserId: userId },
        select: { at: true, action: true, scope: true, denied: true, professionalId: true },
        orderBy: { at: 'asc' },
      }),
      // Chat com a IA hospedada (#249). É o dado mais íntimo do produto: as
      // outras tabelas guardam número, esta guarda o que a pessoa escreveu sobre
      // a própria saúde, em prosa. Deixá-la fora seria devolver menos do que
      // "tudo" no lugar em que "tudo" mais importa.
      //
      // O que NÃO entra junto é `AiUsage`: ali não há nada do titular — modelo e
      // custo do que a instância pagou —, e a linha inclusive sobrevive à
      // exclusão da conta de propósito (ver o `onDelete: SetNull` no schema).
      this.prisma.conversation.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          // De qual comunidade era o agente da conversa (Fase 7c); nulo é o da Fatia.
          agentGroupId: true,
          createdAt: true,
          messages: {
            select: {
              role: true,
              content: true,
              tools: true,
              review: true,
              reviewReasons: true,
              reviewNote: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // O que o assistente guardou sobre a pessoa a pedido dela. É texto que ela
      // aprovou, e entra em toda conversa — a portabilidade cobre os dois.
      this.prisma.userMemory.findMany({
        where: { userId },
        select: { content: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Histórico do plano (ADR 024). Sem `paymentUrl`, que é link de cobrança
      // temporário, e sem nada do provedor além do id.
      this.prisma.userSubscription.findMany({
        where: { userId },
        select: {
          tier: true,
          source: true,
          status: true,
          interval: true,
          productId: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      // As próprias associações a comunidades, com o consentimento registrado
      // (ADR 026) e o assento de IA (ADR 025). Só a linha da pessoa: quem mais
      // está no grupo é dado de terceiro e não sai daqui.
      this.prisma.groupMembership.findMany({
        where: { userId },
        select: {
          group: { select: { name: true, slug: true } },
          role: true,
          status: true,
          invitedAt: true,
          joinedAt: true,
          leftAt: true,
          consentScopes: true,
          consentAt: true,
          statsOptIn: true,
          displayName: true,
          seatAssignments: { select: { assignedAt: true, revokedAt: true } },
          // Os desafios em que a pessoa entrou (Fase 8a): o apelido, a pontuação
          // e a posição dela. O ranking dos outros é dado de terceiro.
          challengeEntries: {
            select: {
              displayName: true,
              score: true,
              finalRank: true,
              joinedAt: true,
              challenge: { select: { title: true, metric: true, startsAt: true, endsAt: true } },
            },
            orderBy: { joinedAt: 'asc' },
          },
          // O mural (Fase 8b): o que a pessoa escreveu, como reagiu e o que
          // denunciou. Os posts e comentários dos outros são dado de terceiro.
          posts: {
            select: {
              body: true,
              createdAt: true,
              pinnedAt: true,
              removedAt: true,
              removedReason: true,
              _count: { select: { images: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          postComments: {
            select: { body: true, createdAt: true, removedAt: true },
            orderBy: { createdAt: 'asc' },
          },
          postReactions: { select: { kind: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
          reportsMade: {
            select: {
              reason: true,
              note: true,
              createdAt: true,
              resolvedAt: true,
              resolution: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Convites que a pessoa criou. Sem o e-mail do convidado (dado de
      // terceiro) e sem o hash do token.
      this.prisma.groupInvite.findMany({
        where: { createdById: userId },
        select: {
          group: { select: { name: true } },
          role: true,
          maxUses: true,
          uses: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      // O que a pessoa publicou numa comunidade (Fase 7): só os metadados. O
      // conteúdo é da comunidade e fica lá depois que a conta some.
      Promise.all([
        this.prisma.groupPlanTemplate.findMany({
          where: { authorId: userId },
          select: {
            group: { select: { name: true } },
            kind: true,
            title: true,
            publishedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.groupTip.findMany({
          where: { authorId: userId },
          select: {
            group: { select: { name: true } },
            title: true,
            publishedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        // Tutoriais de exercício do catálogo da comunidade (Fase 7b).
        this.prisma.groupExerciseGuide.findMany({
          where: { authorId: userId },
          select: {
            group: { select: { name: true } },
            exercise: { select: { name: true } },
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        // Desafios que a pessoa marcou (Fase 8a). O ranking é dos participantes.
        this.prisma.groupChallenge.findMany({
          where: { authorId: userId },
          select: {
            group: { select: { name: true } },
            title: true,
            metric: true,
            startsAt: true,
            endsAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
      ]).then(([plans, tips, exerciseGuides, challenges]) => ({
        plans,
        tips,
        exerciseGuides,
        challenges,
      })),
      // Os arquivos enviados (ADR 028): metadados, sem o arquivo.
      this.prisma.mediaFile.findMany({
        where: { uploaderId: userId },
        select: {
          group: { select: { name: true } },
          purpose: true,
          kind: true,
          mime: true,
          bytes: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Avisos no celular (ADR 033): a plataforma e as datas. O token fica de
      // fora: é o endereço do aparelho na Expo, sem uso para a pessoa.
      this.prisma.userDevice.findMany({
        where: { userId },
        select: { platform: true, createdAt: true, lastSeenAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.notificationPreference.findMany({
        where: { userId },
        select: { kind: true, enabled: true, updatedAt: true },
        orderBy: { kind: 'asc' },
      }),
      // Só as datas: o endpoint identifica o navegador e não serve a ninguém fora daqui.
      this.prisma.webPushSubscription.findMany({
        where: { userId },
        select: { createdAt: true, lastSeenAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Você (#387): o que a pessoa leu e assistiu, as ideias que mandou e
      // quando pediu exportações (sem o hash do token, que é segredo de uso).
      this.prisma.userNewsRead.findMany({
        where: { userId },
        select: { newsId: true, readAt: true },
        orderBy: { readAt: 'asc' },
      }),
      this.prisma.userTutorialSeen.findMany({
        where: { userId },
        select: { tutorialId: true, seenAt: true },
        orderBy: { seenAt: 'asc' },
      }),
      this.prisma.feedbackIdea.findMany({
        where: { userId },
        select: { body: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.dataExport.findMany({
        where: { userId },
        select: { createdAt: true, expiresAt: true, downloadedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // A central de avisos do sino (#373): o que chegou para a pessoa e quando
      // ela leu. Sem o id, que só serve para marcar como lido aqui dentro.
      this.prisma.inboxNotice.findMany({
        where: { userId },
        select: { kind: true, title: true, body: true, url: true, readAt: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Lembretes pessoais (#389): a regra inteira e quando saiu o último. O
      // contador do teto do dia fica de fora: é controle interno do envio.
      this.prisma.reminder.findMany({
        where: { userId },
        select: {
          kind: true,
          mode: true,
          everyHours: true,
          fromMinute: true,
          toMinute: true,
          times: true,
          weekdays: true,
          stepsBelow: true,
          enabled: true,
          lastSentAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Conectar sua IA (#388): o app e as datas. O hash do token fica de fora.
      this.prisma.mcpOAuthConnection.findMany({
        where: { userId },
        select: { createdAt: true, lastUsedAt: true, client: { select: { clientName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // `ProfessionalAccessLog.professionalId` é string pura, sem FK — é o que faz
    // a trilha do titular sobreviver ao profissional apagar a conta. O preço é
    // resolver o nome à parte e aceitar que ele pode não existir mais.
    const idsDeProfissional = [...new Set(accessLogs.map((l) => l.professionalId))];
    const nomesDeProfissional = new Map(
      idsDeProfissional.length === 0
        ? []
        : (
            await this.prisma.user.findMany({
              where: { id: { in: idsDeProfissional } },
              select: { id: true, name: true },
            })
          ).map((u) => [u.id, u.name] as const),
    );

    return {
      // `exportedAt` é gerado no servidor de propósito: o cliente não deve poder
      // datar o próprio export.
      exportedAt: new Date().toISOString(),
      format: 'fatia-export-v1',
      user,
      nutritionGoals,
      nutrientTargets,
      personalGoals,
      meals: await Promise.all(
        meals.map((meal) => this.exportMeal(meal, opts.photoLinks === true)),
      ),
      customFoods,
      favoriteFoods,
      foodPortions,
      mealTemplates,
      nutritionPlans,
      planOffers,
      plannedSessions,
      customExercises,
      favoriteExercises,
      workoutPlans,
      workoutSessions,
      weightLogs,
      stepLogs,
      waterLogs,
      achievements,
      trainingBlocks,
      professionalLinks,
      conversations,
      memories,
      subscriptions,
      communityMemberships,
      invitesCreated,
      contentPublished,
      mediaUploaded,
      devices,
      notificationPreferences,
      webPushSubscriptions,
      newsRead,
      tutorialsSeen,
      ideas,
      dataExports,
      inboxNotices,
      reminders,
      mcpConnections: mcpConnections.map((c) => ({
        clientName: c.client.clientName,
        connectedAt: c.createdAt,
        lastUsedAt: c.lastUsedAt,
      })),
      accessLogs: accessLogs.map(({ professionalId, ...linha }) => ({
        ...linha,
        professionalName: nomesDeProfissional.get(professionalId) ?? null,
      })),
      counts: {
        achievements: achievements.length,
        conversations: conversations.length,
        memories: memories.length,
        subscriptions: subscriptions.length,
        communityMemberships: communityMemberships.length,
        challengeEntries: communityMemberships.reduce((n, m) => n + m.challengeEntries.length, 0),
        posts: communityMemberships.reduce((n, m) => n + m.posts.length, 0),
        postComments: communityMemberships.reduce((n, m) => n + m.postComments.length, 0),
        invitesCreated: invitesCreated.length,
        contentPublished:
          contentPublished.plans.length +
          contentPublished.tips.length +
          contentPublished.exerciseGuides.length +
          contentPublished.challenges.length,
        mediaUploaded: mediaUploaded.length,
        devices: devices.length,
        webPushSubscriptions: webPushSubscriptions.length,
        newsRead: newsRead.length,
        tutorialsSeen: tutorialsSeen.length,
        ideas: ideas.length,
        inboxNotices: inboxNotices.length,
        reminders: reminders.length,
        mcpConnections: mcpConnections.length,
        professionalLinks: professionalLinks.length,
        accessLogs: accessLogs.length,
        meals: meals.length,
        customFoods: customFoods.length,
        favoriteFoods: favoriteFoods.length,
        foodPortions: foodPortions.length,
        mealTemplates: mealTemplates.length,
        nutritionPlans: nutritionPlans.length,
        nutritionSwaps: nutritionPlans.reduce((n, plan) => n + plan.swaps.length, 0),
        planOffers: planOffers.length,
        planOfferVersions: planOffers.reduce((n, offer) => n + offer.versions.length, 0),
        plannedSessions: plannedSessions.length,
        customExercises: customExercises.length,
        favoriteExercises: favoriteExercises.length,
        workoutPlans: workoutPlans.length,
        workoutSessions: workoutSessions.length,
        weightLogs: weightLogs.length,
        stepLogs: stepLogs.length,
        waterLogs: waterLogs.length,
        personalGoals: personalGoals.length,
        nutrientTargets: nutrientTargets.length,
      },
    };
  }

  /**
   * Apaga a conta e todos os dados. Exige confirmação textual explícita porque a
   * operação é irreversível e o chamador pode ser um LLM interpretando uma frase
   * ambígua do usuário — a confirmação força a intenção a ser inequívoca.
   *
   * A deleção no Postgres é garantida pelos `onDelete: Cascade` a partir de
   * `User`. A identidade no Logto é apagada em seguida, num passo separado que
   * pode falhar sem desfazer o cascade — ver o comentário abaixo.
   */

  /**
   * A refeição no export: a foto entra como os dados do arquivo e, no arquivo
   * baixado pelo link de exportação, um link assinado para baixá-la (ADR 038,
   * item 5). Pelo MCP vai só o `hasPhoto`: nenhuma tool leva a foto à IA.
   */
  private async exportMeal<
    M extends Parameters<typeof presentMeal>[0] & {
      photoFile: MediaFile | null;
    },
  >(meal: M, photoLinks: boolean) {
    const { photoFile, ...rest } = meal;
    const photo = photoFile
      ? {
          mime: photoFile.mime,
          bytes: photoFile.bytes,
          width: photoFile.width,
          height: photoFile.height,
          ...(photoLinks && this.media ? { url: await this.media.exportUrl(photoFile) } : {}),
        }
      : null;
    return { ...presentMeal(rest), photo };
  }
  async deleteAccount(userId: string, confirmation: string, expected = DELETE_CONFIRMATION) {
    if (confirmation !== expected) {
      throw new BadRequestException(
        `Confirmação inválida. Para apagar a conta, envie confirmation exatamente como "${expected}". ` +
          'Confirme com o usuário antes de repetir — a operação é irreversível.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, logtoSub: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Antes de tudo, e podendo abortar: encerrar a assinatura paga (ADR 024).
    // Se o provedor não responder, a conta fica inteira e o erro sobe — apagar
    // a conta e seguir cobrando seria o pior resultado possível.
    for (const gancho of this.ganchos ?? []) await gancho.beforeDelete(userId);

    // Ordem deliberada: Logto primeiro. Se apagássemos o User local antes e o
    // Logto falhasse, a identidade órfã voltaria a provisionar um User novo no
    // próximo login — o usuário "renasceria" vazio em vez de ver um erro. Falhar
    // aqui deixa tudo intacto e retornável.
    const logtoDeleted = await this.logtoManagement.deleteUser(user.logtoSub);

    // O estado que o agente guardou das conversas (ADR 023) mora num schema que o
    // cascade não alcança. Antes do `delete`, e não depois: se a purga falhar, a
    // conta continua inteira e o erro sobe — um checkpoint sobrevivendo à conta
    // seria dado de saúde sem dono e sem como ser apagado pela pessoa.
    await this.checkpoints.apagarDoUsuario(userId);

    await this.prisma.user.delete({ where: { id: userId } });

    this.logger.log({
      event: 'account_deleted',
      userId,
      logtoDeleted,
      // Sem e-mail nem nome: o log não deve sobreviver ao dado que foi apagado.
    });

    return {
      deleted: true as const,
      logtoIdentityDeleted: logtoDeleted,
      message: logtoDeleted
        ? 'Conta e todos os dados apagados. A identidade de login também foi removida.'
        : 'Conta e todos os dados apagados. A identidade de login não pôde ser removida automaticamente — ' +
          'ela não dá mais acesso a nenhum dado, mas peça ao suporte para removê-la se quiser.',
    };
  }
}
