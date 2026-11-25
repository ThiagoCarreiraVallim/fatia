import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma.service';
import type { LogtoManagementService } from '../../auth/logto-management.service';
import type { CheckpointPurgeService } from '../../chat/checkpoint-purge.service';
import { AccountService, DELETE_CONFIRMATION } from '../account.service';

const makePrisma = () => ({
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  // A demo da pessoa (#412) e o lote que apaga a conta.
  group: { findUnique: jest.fn().mockResolvedValue(null) },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  userGoals: { findUnique: jest.fn().mockResolvedValue(null) },
  userGoalsHistory: { findMany: jest.fn().mockResolvedValue([]) },
  nutrientTarget: { findMany: jest.fn().mockResolvedValue([]) },
  goal: { findMany: jest.fn().mockResolvedValue([]) },
  meal: { findMany: jest.fn().mockResolvedValue([]) },
  food: { findMany: jest.fn().mockResolvedValue([]) },
  exercise: { findMany: jest.fn().mockResolvedValue([]) },
  workoutPlan: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
  workoutSession: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
  weightLog: { findMany: jest.fn().mockResolvedValue([]) },
  stepLog: { findMany: jest.fn().mockResolvedValue([]) },
  waterLog: { findMany: jest.fn().mockResolvedValue([]) },
  userAchievement: { findMany: jest.fn().mockResolvedValue([]) },
  trainingBlock: { findMany: jest.fn().mockResolvedValue([]) },
  professionalLink: { findMany: jest.fn().mockResolvedValue([]) },
  professionalAccessLog: { findMany: jest.fn().mockResolvedValue([]) },
  conversation: { findMany: jest.fn().mockResolvedValue([]) },
  userMemory: { findMany: jest.fn().mockResolvedValue([]) },
  favoriteFood: { findMany: jest.fn().mockResolvedValue([]) },
  favoriteExercise: { findMany: jest.fn().mockResolvedValue([]) },
  foodPortion: { findMany: jest.fn().mockResolvedValue([]) },
  mealTemplate: { findMany: jest.fn().mockResolvedValue([]) },
  nutritionPlan: { findMany: jest.fn().mockResolvedValue([]) },
  planOffer: { findMany: jest.fn().mockResolvedValue([]) },
  memberNote: { findMany: jest.fn().mockResolvedValue([]) },
  sessionFeedback: { findMany: jest.fn().mockResolvedValue([]) },
  reviewSeen: { findMany: jest.fn().mockResolvedValue([]) },
  plannedSession: { findMany: jest.fn().mockResolvedValue([]) },
  userSubscription: { findMany: jest.fn().mockResolvedValue([]) },
  groupMembership: { findMany: jest.fn().mockResolvedValue([]) },
  groupInvite: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
  groupAuditLog: { findMany: jest.fn().mockResolvedValue([]) },
  groupPlanTemplate: { findMany: jest.fn().mockResolvedValue([]) },
  groupTip: { findMany: jest.fn().mockResolvedValue([]) },
  groupExerciseGuide: { findMany: jest.fn().mockResolvedValue([]) },
  groupChallenge: { findMany: jest.fn().mockResolvedValue([]) },
  mediaFile: { findMany: jest.fn().mockResolvedValue([]) },
  userDevice: { findMany: jest.fn().mockResolvedValue([]) },
  notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
  webPushSubscription: { findMany: jest.fn().mockResolvedValue([]) },
  userNewsRead: { findMany: jest.fn().mockResolvedValue([]) },
  userTutorialSeen: { findMany: jest.fn().mockResolvedValue([]) },
  feedbackIdea: { findMany: jest.fn().mockResolvedValue([]) },
  dataExport: { findMany: jest.fn().mockResolvedValue([]) },
  mcpOAuthConnection: { findMany: jest.fn().mockResolvedValue([]) },
  userBlock: { findMany: jest.fn().mockResolvedValue([]) },
  inboxNotice: { findMany: jest.fn().mockResolvedValue([]) },
  reminder: { findMany: jest.fn().mockResolvedValue([]) },
  aiConsent: { findMany: jest.fn().mockResolvedValue([]) },
  aiWriteModeSetting: { findMany: jest.fn().mockResolvedValue([]) },
  aiAutoWrite: { findMany: jest.fn().mockResolvedValue([]) },
  groupOfferPurchase: { findMany: jest.fn().mockResolvedValue([]) },
});

const SCHEMA = resolve(__dirname, '../../../../../packages/db/prisma/schema.prisma');

/**
 * Relação do `User` no schema → chave no payload `fatia-export-v1`.
 *
 * O mapa é conferido CONTRA o schema logo abaixo, e é isso que o separa da lista à mão que
 * existia aqui antes: aquela enumerava os modelos que o export já buscava, então uma tabela
 * nova que ficasse de fora do export ficava de fora do teste junto e nada acusava. Foi assim
 * que `UserAchievement` — inclusive o `context` de `first_pr`, com exercício e carga — passou
 * despercebida pela portabilidade que o README promete como "devolve tudo".
 */
const CHAVE_NO_EXPORT: Record<string, string> = {
  // A demo que a pessoa criou (#412): o nome e a aluna fictícia, sem o conteúdo inventado.
  demoCommunity: 'demoCommunity',
  goals: 'nutritionGoals',
  // As metas de antes de cada troca (#396), inclusive a troca por um plano da comunidade.
  goalsHistory: 'nutritionGoalsHistory',
  personalGoals: 'personalGoals',
  meals: 'meals',
  workoutPlans: 'workoutPlans',
  workoutSessions: 'workoutSessions',
  // As respostas do fim do treino (#377) saem dentro de cada sessão (`checkin`).
  workoutCheckins: 'workoutSessions',
  weightLogs: 'weightLogs',
  stepLogs: 'stepLogs',
  waterLogs: 'waterLogs',
  customFoods: 'customFoods',
  favoriteFoods: 'favoriteFoods',
  foodPortions: 'foodPortions',
  mealTemplates: 'mealTemplates',
  // Plano alimentar recebido da equipe (#376): é do aluno, com as trocas e o "comi isso".
  nutritionPlans: 'nutritionPlans',
  // Plano de treino recebido da equipe (#379), com as versões, e a agenda.
  planOffers: 'planOffers',
  // Anotações da equipe sobre a pessoa (#402): ela já lê no app.
  memberNotes: 'memberNotes',
  // O que a pessoa, na equipe, comentou nos treinos dos alunos e marcou como visto (#399).
  sessionFeedbackAuthored: 'sessionFeedbackWritten',
  reviewSeen: 'reviewSeen',
  plannedSessions: 'plannedSessions',
  customExercises: 'customExercises',
  // Favoritos de exercício (#378): o atalho que a pessoa marcou no Como fazer.
  favoriteExercises: 'favoriteExercises',
  nutrientTargets: 'nutrientTargets',
  achievements: 'achievements',
  trainingBlocks: 'trainingBlocks',
  // B2B (#155): o consentimento é um ato do titular e a trilha é a resposta a "quem olhou meu
  // dado". Os dois entram no export por LGPD art. 18 V — ficaram de fora na #153 com o argumento
  // de que seriam consultados na tela de compartilhamento, e "está na tela" não é portabilidade.
  linksAsSubject: 'professionalLinks',
  // Só a linha da própria pessoa, com o consentimento e o assento (ADR 025/026).
  memberships: 'communityMemberships',
  // O que a pessoa comprou das ofertas de uma comunidade (#403): oferta, valor e situação.
  offerPurchases: 'offerPurchases',
  invitesCreated: 'invitesCreated',
  // Convites que a pessoa recebeu e aceitou (#401): comunidade, papel e datas.
  invitesAccepted: 'invitesReceived',
  // Ações em massa que a pessoa fez num painel (#401): o que fez, quando e em quantos.
  groupAuditLogs: 'panelActions',
  planTemplates: 'contentPublished',
  tipsAuthored: 'contentPublished',
  guidesAuthored: 'contentPublished',
  authoredChallenges: 'contentPublished',
  mediaFiles: 'mediaUploaded',
  devices: 'devices',
  notificationPreferences: 'notificationPreferences',
  // Só as datas de cada navegador; o endpoint fica de fora (Fase 9g).
  webPushSubscriptions: 'webPushSubscriptions',
  inboxNotices: 'inboxNotices',
  // Lembretes pessoais (#389): a regra inteira; o contador do teto fica de fora.
  reminders: 'reminders',
  accessLogs: 'accessLogs',
  // Chat com a IA hospedada (#249): o que a pessoa escreveu sobre a própria saúde, em prosa.
  conversations: 'conversations',
  // O que o assistente guardou sobre a pessoa, com o texto que ela aprovou.
  memories: 'memories',
  // Plano Free/PRO (ADR 024): o histórico de assinatura é um contrato da pessoa.
  subscriptions: 'subscriptions',
  // Você (#387): a foto de perfil é um arquivo enviado (metadados em `mediaUploaded`), o que a
  // pessoa leu e assistiu, as ideias que mandou e os pedidos de exportação.
  avatarFile: 'mediaUploaded',
  newsReads: 'newsRead',
  tutorialsSeen: 'tutorialsSeen',
  feedbackIdeas: 'ideas',
  dataExports: 'dataExports',
  aiConsents: 'aiConsents',
  // Configurações da IA (#385): o modo de cada categoria e as gravações automáticas com o
  // retrato do Desfazer — dado de saúde da pessoa, então dela no export.
  aiWriteModes: 'aiWriteModes',
  aiAutoWrites: 'aiAutoWrites',
  // Conectar sua IA (#388): qual app de IA a pessoa ligou e quando. Sem o hash do token.
  mcpConnections: 'mcpConnections',
  // Bloqueios (#394): quem a pessoa bloqueou, com o nome que aparecia.
  blocksMade: 'blocks',
};

/**
 * Relações que NÃO entram no export, cada uma com o motivo. Ficar de fora é uma decisão
 * legítima; ficar de fora em silêncio não é.
 */
const FORA_DO_EXPORT: Record<string, string> = {
  demoGroup:
    'Só a aluna fictícia da demo (#412) tem: ela não exporta, e a dona leva a demo em `demoCommunity`.',
  demoSessions:
    'Sessão de 30 min da aluna fictícia (#412), só o hash do token; sai na próxima sessão e com a demo.',
  demoSessionsMade:
    'Sessão de 30 min que a dona abriu na demo (#412), só o hash do token; sai na próxima sessão e com a demo.',
  ownedGroups: 'B2B (ADR 014): o grupo é do profissional, não dado pessoal de saúde do titular.',
  linksAsProfessional: 'B2B: lista os PACIENTES do profissional — dado de terceiro.',
  reviewedCheckins:
    'Check-ins de desafio que a pessoa revisou como equipe (#395): cada um é dado de quem fez ' +
    'o check-in e sai no export DELE. Apagar a conta de quem revisou só zera o revisor.',
  nutritionPlansAuthored:
    'Planos alimentares que a pessoa escreveu como profissional (#376): cada um é dado do ' +
    'aluno que o recebeu e sai no export DELE. Apagar a conta do autor só zera o autor.',
  nutritionPlansEdited:
    'Versões de plano alimentar que a pessoa salvou na cópia de um aluno (#407): dado do ' +
    'aluno, que sai no export DELE sem o id de quem editou. Apagar a conta só zera o editor.',
  memberNotesAuthored:
    'Anotações que a pessoa, como equipe, escreveu sobre outros membros (#402): dado de terceiro.',
  reviewSeenAbout:
    'O "Visto" que a equipe marcou sobre a pessoa (#399): estado de trabalho da equipe. A ' +
    'leitura em si já está na trilha (`accessLogs`), e a linha some quando ela sai.',
  planOffersAuthored:
    'Planos de treino que a pessoa ofereceu como profissional (#379): cada um é dado do ' +
    'aluno que o recebeu e sai no export DELE. Apagar a conta do autor só zera o autor.',
  aiUsage:
    'Livro-caixa da inferência que a Fatia pagou (#249): modelo e custo, nada do titular. ' +
    'A linha sobrevive à exclusão da conta de propósito — é fatura, não dado pessoal.',
  blocksReceived:
    'Quem bloqueou a pessoa (#394): o bloqueio é invisível para quem foi bloqueado, e contar ' +
    'quem foi seria dizer. Apaga com a conta (cascata dos dois lados).',
  benefitsCreated:
    'Benefícios de parceiros que o dono cadastrou para a comunidade (#393): texto, cupom e ' +
    'link do parceiro, conteúdo B2B do grupo, nada do titular. Apagar a conta só zera o autor.',
  pendingNotices:
    'Contagem de avisos esperando o fim de uma janela de 10 minutos (Fase 9g): estado de ' +
    'entrega que some sozinho, sem nada do conteúdo — e apaga com a conta.',
  emailChangeRequests:
    'Pedido de troca de e-mail (ADR 050): estado de segurança de 15 minutos, com o hash de um ' +
    'nonce e o e-mail de destino. O e-mail atual já sai no perfil; apaga com a conta.',
  apiKeysCreated:
    'Chaves de API que a pessoa criou como dona da comunidade (#413): credencial B2B do ' +
    'grupo (nome, hash e 4 últimos caracteres), nada do titular. Apagar a conta só zera o autor.',
};

/** Nomes de model do schema, para separar campo de relação de campo escalar. */
function modelosDoSchema(schema: string): Set<string> {
  return new Set(Array.from(schema.matchAll(/^model\s+(\w+)\s*\{/gm), (m) => m[1]));
}

/** Campos do `User` cujo tipo é outro model — ou seja, dado pendurado no titular. */
function relacoesDoUser(schema: string): string[] {
  const bloco = /^model\s+User\s*\{([\s\S]*?)^\}/m.exec(schema);
  if (!bloco) throw new Error('model User não encontrado no schema.prisma');
  const modelos = modelosDoSchema(schema);

  return bloco[1]
    .split('\n')
    .map((linha) => /^\s*(\w+)\s+(\w+)(\[\])?\??/.exec(linha))
    .filter((m): m is RegExpExecArray => m !== null)
    .filter((m) => modelos.has(m[2]))
    .map((m) => m[1]);
}

const makeLogto = () => ({
  isConfigured: jest.fn().mockReturnValue(true),
  deleteUser: jest.fn().mockResolvedValue(true),
});

const USER = {
  id: 'user-A',
  email: 'a@test.local',
  name: 'A',
  logtoSub: 'logto|abc',
  role: 'USER',
  timezone: 'America/Sao_Paulo',
  heightCm: 180,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
};

describe('AccountService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let logto: ReturnType<typeof makeLogto>;
  let service: AccountService;
  let purga: { apagarDoUsuario: jest.Mock };

  beforeEach(() => {
    prisma = makePrisma();
    logto = makeLogto();
    purga = { apagarDoUsuario: jest.fn(async (_userId: string) => undefined) };
    service = new AccountService(
      prisma as unknown as PrismaService,
      logto as unknown as LogtoManagementService,
      purga as unknown as CheckpointPurgeService,
    );
  });

  describe('exportData', () => {
    it('escopa toda consulta ao usuário do contexto', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      await service.exportData('user-A');

      // A garantia que importa: nenhuma das 11 consultas pode escapar do userId.
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-A' } }),
      );
      for (const model of [
        'nutrientTarget',
        'goal',
        'meal',
        'workoutPlan',
        'workoutSession',
        'weightLog',
        'stepLog',
        'waterLog',
        'favoriteFood',
        'favoriteExercise',
        'inboxNotice',
        'reminder',
        'nutritionPlan',
        'planOffer',
        'plannedSession',
        'mcpOAuthConnection',
      ] as const) {
        expect(prisma[model].findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ userId: 'user-A' }) }),
        );
      }
      // Catálogo custom é escopado por createdByUserId, não userId.
      for (const model of ['food', 'exercise', 'foodPortion'] as const) {
        expect(prisma[model].findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { createdByUserId: 'user-A' } }),
        );
      }
    });

    it('leva a etapa e o rascunho do onboarding (#371)', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      await service.exportData('user-A');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            onboardingStep: true,
            onboardingDraft: true,
            firstStepsSince: true,
            firstStepsDoneAt: true,
          }),
        }),
      );
    });

    it('devolve toda relação do User que não esteja declarada como fora', async () => {
      // A guarda é derivada do `schema.prisma`, não de uma lista escrita aqui: tabela nova
      // pendurada no `User` quebra este caso até alguém decidir, por escrito, se ela é dado do
      // titular. "Devolve tudo" é o que o README promete e o que a LGPD cobra.
      prisma.user.findUnique.mockResolvedValue(USER);
      const schema = readFileSync(SCHEMA, 'utf8');
      const relacoes = relacoesDoUser(schema);

      // Sanidade: se o parse do schema quebrar, os `expect` abaixo passariam vazios.
      expect(relacoes.length).toBeGreaterThan(10);

      const naoDecididas = relacoes.filter((r) => !CHAVE_NO_EXPORT[r] && !FORA_DO_EXPORT[r]);
      expect(naoDecididas).toEqual([]);

      const result = (await service.exportData('user-A')) as unknown as Record<string, unknown>;

      const ausentes = relacoes
        .filter((r) => CHAVE_NO_EXPORT[r])
        .filter((r) => !(CHAVE_NO_EXPORT[r] in result));
      expect(ausentes).toEqual([]);

      // Decisão que sumiu do schema vira permissão silenciosa para a próxima relação homônima.
      const orfas = [...Object.keys(CHAVE_NO_EXPORT), ...Object.keys(FORA_DO_EXPORT)]
        .filter((r) => !relacoes.includes(r))
        .sort();
      expect(orfas).toEqual([]);
    });

    it('exporta as conquistas com o contexto do desbloqueio', async () => {
      // O `context` de `first_pr` carrega exercício e carga — dado de saúde, e o único lugar
      // onde a conquista guarda algo que não dá para reconstruir a partir das outras tabelas.
      prisma.user.findUnique.mockResolvedValue(USER);
      prisma.userAchievement.findMany.mockResolvedValue([
        {
          key: 'first_pr',
          unlockedAt: new Date('2026-01-10'),
          context: { exerciseId: 7, exerciseName: 'Supino reto', weightKg: 80 },
        },
      ]);

      const result = await service.exportData('user-A');

      expect(prisma.userAchievement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-A' }) }),
      );
      expect(result.achievements).toEqual([
        expect.objectContaining({
          key: 'first_pr',
          context: { exerciseId: 7, exerciseName: 'Supino reto', weightKg: 80 },
        }),
      ]);
      expect(result.counts.achievements).toBe(1);
    });

    it('não seleciona logtoSub no export', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      await service.exportData('user-A');

      // A garantia está no `select`, não no shape do retorno: logtoSub é
      // identificador de infraestrutura de auth, não dado do usuário. Asseverar
      // sobre o select testa o código; asseverar sobre o retorno testaria o mock,
      // que ignora `select`.
      const { select } = prisma.user.findUnique.mock.calls[0][0];
      expect(select).not.toHaveProperty('logtoSub');
      expect(select).toMatchObject({ id: true, email: true, name: true });
    });

    it('exporta o perfil do onboarding (sexo, nascimento, atividade, objetivo)', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      await service.exportData('user-A');

      const { select } = prisma.user.findUnique.mock.calls[0][0];
      expect(select).toMatchObject({
        sex: true,
        birthDate: true,
        activityLevel: true,
        objective: true,
        onboardedAt: true,
      });
    });

    it('exporta consentimento e trilha do titular, com nome em vez de id do profissional', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      prisma.professionalLink.findMany.mockResolvedValue([
        { id: 'link-1', scopes: ['WORKOUT'], professional: { name: 'Personal' } },
      ]);
      prisma.professionalAccessLog.findMany.mockResolvedValue([
        {
          at: new Date('2026-03-01'),
          action: 'probe',
          scope: 'WORKOUT',
          denied: true,
          professionalId: 'pro-1',
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'pro-1', name: 'Personal' }]);

      const result = await service.exportData('user-A');

      // As duas consultas são escopadas pelo TITULAR, não por `userId` — a
      // coluna se chama `subjectUserId`, e um `where: { userId }` copiado das
      // vizinhas nem compilaria, mas um `where: {}` esquecido devolveria a
      // trilha do produto inteiro dentro do export de uma pessoa.
      for (const model of ['professionalLink', 'professionalAccessLog'] as const) {
        expect(prisma[model].findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { subjectUserId: 'user-A' } }),
        );
      }

      // O `professionalId` some do payload: o export é do titular, e o id interno
      // de outra pessoa não acrescenta nada a ele. O nome, sim — sem ele "quem
      // olhou meu dado" fica sem resposta, que é o motivo de a trilha existir.
      expect(result.accessLogs).toEqual([
        expect.objectContaining({ action: 'probe', denied: true, professionalName: 'Personal' }),
      ]);
      expect(result.accessLogs[0]).not.toHaveProperty('professionalId');
      expect(result.counts.professionalLinks).toBe(1);
      expect(result.counts.accessLogs).toBe(1);
    });

    it('inclui contagens para o cliente resumir sem varrer o payload', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      prisma.meal.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
      prisma.weightLog.findMany.mockResolvedValue([{ id: 'w1' }]);

      const result = await service.exportData('user-A');

      expect(result.counts.meals).toBe(2);
      expect(result.counts.weightLogs).toBe(1);
      expect(result.format).toBe('fatia-export-v1');
      expect(result.exportedAt).toBeTruthy();
    });

    it('leva as compras de oferta e o período do assento de programa (#403)', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      prisma.groupOfferPurchase.findMany.mockResolvedValue([
        { offer: { title: 'Verão 21', group: { name: 'Academia' } }, amountCents: 14_900 },
      ]);

      const result = (await service.exportData('user-A')) as unknown as {
        offerPurchases: unknown[];
        counts: Record<string, number>;
      };

      expect(prisma.groupOfferPurchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-A' } }),
      );
      // Sem o link de pagamento nem o id do provedor.
      const select = prisma.groupOfferPurchase.findMany.mock.calls[0][0].select;
      expect(select.paymentUrl).toBeUndefined();
      expect(select.providerPaymentId).toBeUndefined();
      expect(result.offerPurchases).toHaveLength(1);
      expect(result.counts.offerPurchases).toBe(1);
      const membros = prisma.groupMembership.findMany.mock.calls[0][0];
      expect(membros.select.seatAssignments.select).toMatchObject({
        startsAt: true,
        endsAt: true,
        program: { select: { name: true } },
      });
    });

    it('gravação automática: o pedido, os retratos e o cartão enquanto guardados, e o que sobra depois (#385)', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      await service.exportData('user-A');
      const { select } = prisma.aiAutoWrite.findMany.mock.calls[0][0] as {
        select: Record<string, boolean>;
      };
      // Depois da janela de 24 h, `input`, `result`, `before`, `after` e `card` voltam nulos — o
      // export devolve o que ainda está guardado, e os metadados que ficam para sempre.
      expect(Object.keys(select).sort()).toEqual(
        [
          'after',
          'before',
          'card',
          'category',
          'clearedAt',
          'conversationId',
          'createdAt',
          'doneAt',
          'input',
          'result',
          'tool',
          'undoneAt',
        ].sort(),
      );
    });

    it('falha quando o usuário não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.exportData('fantasma')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAccount', () => {
    it('recusa sem a confirmação exata e não toca no banco', async () => {
      await expect(service.deleteAccount('user-A', 'sim')).rejects.toThrow(BadRequestException);
      await expect(service.deleteAccount('user-A', '')).rejects.toThrow(BadRequestException);
      // Caixa e espaços importam — a trava não deve ser frouxa.
      await expect(service.deleteAccount('user-A', 'deletar minha conta')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.deleteAccount('user-A', ` ${DELETE_CONFIRMATION} `)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(logto.deleteUser).not.toHaveBeenCalled();
    });

    it('apaga o usuário local e a identidade no Logto', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      const result = await service.deleteAccount('user-A', DELETE_CONFIRMATION);

      expect(logto.deleteUser).toHaveBeenCalledWith('logto|abc');
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-A' } });
      expect(result).toMatchObject({ deleted: true, logtoIdentityDeleted: true });
    });

    it('apaga o e-mail da pessoa dos convites que ela recebeu, e o convite em aberto deixa de valer (#401)', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      await service.deleteAccount('user-A', DELETE_CONFIRMATION);

      const chamadas = prisma.groupInvite.updateMany.mock.calls.map(
        (c: unknown[]) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> },
      );
      const doEmail = { equals: 'a@test.local', mode: 'insensitive' };
      // Em aberto: some o e-mail E o convite é revogado (sem e-mail ele viraria link aberto).
      expect(chamadas).toContainEqual({
        where: { email: doEmail, revokedAt: null },
        data: { email: null, revokedAt: expect.any(Date) },
      });
      expect(chamadas).toContainEqual({ where: { email: doEmail }, data: { email: null } });
    });

    it('revoga os convites ainda abertos que a pessoa criou (DATA_RETENTION, #401)', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);

      await service.deleteAccount('user-A', DELETE_CONFIRMATION);

      const chamadas = prisma.groupInvite.updateMany.mock.calls.map(
        (c: unknown[]) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> },
      );
      // Sem isto, o link de quem saiu continuaria abrindo a comunidade (o autor vira nulo).
      expect(chamadas).toContainEqual({
        where: { createdById: 'user-A', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('apaga o Logto ANTES do banco — identidade órfã reprovisionaria conta vazia', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      const order: string[] = [];
      logto.deleteUser.mockImplementation(async () => {
        order.push('logto');
        return true;
      });
      prisma.user.delete.mockImplementation(async () => {
        order.push('prisma');
        return USER;
      });

      await service.deleteAccount('user-A', DELETE_CONFIRMATION);

      expect(order).toEqual(['logto', 'prisma']);
    });

    it('apaga o estado do agente antes do usuário — o cascade não alcança o schema dele', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      const order: string[] = [];
      purga.apagarDoUsuario.mockImplementation(async () => {
        order.push('checkpoint');
      });
      prisma.user.delete.mockImplementation(async () => {
        order.push('prisma');
        return USER;
      });

      await service.deleteAccount('user-A', DELETE_CONFIRMATION);

      expect(purga.apagarDoUsuario).toHaveBeenCalledWith('user-A');
      expect(order).toEqual(['checkpoint', 'prisma']);
    });

    it('roda os ganchos antes de apagar, e um gancho que falha aborta tudo (ADR 024)', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      const gancho = { beforeDelete: jest.fn(async (_id: string) => undefined) };
      const comGancho = new AccountService(
        prisma as unknown as PrismaService,
        logto as unknown as LogtoManagementService,
        purga as unknown as CheckpointPurgeService,
        [gancho],
      );

      await comGancho.deleteAccount('user-A', DELETE_CONFIRMATION);
      expect(gancho.beforeDelete).toHaveBeenCalledWith('user-A');
      expect(prisma.user.delete).toHaveBeenCalled();

      prisma.user.delete.mockClear();
      logto.deleteUser.mockClear();
      gancho.beforeDelete.mockRejectedValueOnce(new Error('Asaas fora do ar'));
      await expect(comGancho.deleteAccount('user-A', DELETE_CONFIRMATION)).rejects.toThrow(
        'Asaas fora do ar',
      );
      // Nada foi apagado: nem identidade, nem dados. A assinatura continua
      // cancelável e a pessoa tenta de novo.
      expect(logto.deleteUser).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('se a purga do agente falhar, a conta fica inteira e o erro sobe', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      purga.apagarDoUsuario.mockRejectedValueOnce(new Error('banco fora'));

      await expect(service.deleteAccount('user-A', DELETE_CONFIRMATION)).rejects.toThrow();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('não desfaz nada se o Logto falhar — apaga local e avisa', async () => {
      prisma.user.findUnique.mockResolvedValue(USER);
      logto.deleteUser.mockResolvedValue(false);

      const result = await service.deleteAccount('user-A', DELETE_CONFIRMATION);

      // O dado pessoal tem de ir embora mesmo sem a Management API configurada.
      expect(prisma.user.delete).toHaveBeenCalled();
      expect(result.logtoIdentityDeleted).toBe(false);
      expect(result.message).toContain('não pôde ser removida');
    });

    it('falha quando o usuário não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteAccount('fantasma', DELETE_CONFIRMATION)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });
  });
});
