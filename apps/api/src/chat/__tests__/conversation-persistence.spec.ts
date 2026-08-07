import { PrismaService } from '../../common/prisma.service';
import { ConversationService } from '../conversation.service';

/**
 * O que `concluirTurno` grava e o que ele descarta, contra Postgres real (#249).
 *
 * Contra o banco de verdade, e não sobre um dublê de Prisma, porque a afirmação
 * aqui é sobre a **linha que sobra depois de recarregar a página** — que é a
 * promessa do `Message.tools` no `schema.prisma`. Um dublê provaria que
 * `message.create` foi chamado; ele não provaria que a coluna `tools` volta da
 * leitura com o que foi gravado.
 *
 * O isolamento deste serviço fica em `common/__tests__/user-isolation.spec.ts`,
 * junto com o resto da matriz do `THREAT_MODEL.md`. Aqui é só persistência.
 *
 * Requer `DATABASE_URL` com as migrations aplicadas — o mesmo que o job `test`
 * do CI já provisiona.
 */

const TZ = 'America/Sao_Paulo';

describe('ConversationService — o que sobra do turno', () => {
  const prisma = new PrismaService();
  const conversas = new ConversationService(prisma);

  let userId = '';

  beforeAll(async () => {
    const stamp = `conv-persist-${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        logtoSub: stamp,
        email: `${stamp}@test.local`,
        name: 'Dono da conversa',
        timezone: TZ,
      },
    });
    userId = user.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const mensagensDe = (conversationId: string) =>
    prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, tools: true },
    });

  it('turno que só chamou tool, sem chegar a falar, fica no histórico', async () => {
    const { conversationId } = await conversas.iniciarTurno(
      userId,
      undefined,
      'registra 200g de arroz',
    );

    // O caso real: o agente decide a tool, executa, e o stream cai antes do
    // primeiro token. A refeição foi registrada **de verdade** no domínio de
    // destino; descartar a mensagem aqui deixaria a ação sem nenhum vestígio no
    // único lugar onde a pessoa poderia auditá-la.
    await conversas.concluirTurno(userId, conversationId, {
      texto: '',
      tools: [{ name: 'log_meal' }],
    });

    const mensagens = await mensagensDe(conversationId);
    expect(mensagens.map((m) => m.role)).toEqual(['user', 'assistant']);
    // E a tool volta da leitura, que é o que o `schema.prisma` promete: a coluna
    // sobrevive ao recarregar a página.
    expect(mensagens[1].tools).toEqual([{ name: 'log_meal' }]);
    expect(mensagens[1].content).toBe('');
  });

  it('turno sem texto E sem tool não deixa mensagem em branco no histórico', async () => {
    const { conversationId } = await conversas.iniciarTurno(userId, undefined, 'oi');

    // Sem texto e sem tool não há o que auditar: uma mensagem vazia do assistente
    // é ruído no histórico e ainda vira entrada paga no turno seguinte, porque a
    // conversa inteira é reenviada ao agente a cada mensagem.
    await conversas.concluirTurno(userId, conversationId, { texto: '   ', tools: [] });

    expect((await mensagensDe(conversationId)).map((m) => m.role)).toEqual(['user']);
  });

  it('turno com texto e tool grava os dois na mesma mensagem', async () => {
    const { conversationId } = await conversas.iniciarTurno(userId, undefined, 'e aí?');

    await conversas.concluirTurno(userId, conversationId, {
      texto: 'Registrei.',
      tools: [{ name: 'log_meal' }],
    });

    const mensagens = await mensagensDe(conversationId);
    expect(mensagens[1].content).toBe('Registrei.');
    expect(mensagens[1].tools).toEqual([{ name: 'log_meal' }]);
  });
});
