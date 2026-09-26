import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CheckpointPurgeService } from '../checkpoint-purge.service';
import { ConversationService, type RespostaDoTurno } from '../conversation.service';

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

const resposta = (parcial: Partial<RespostaDoTurno>): RespostaDoTurno => ({
  texto: '',
  tools: [],
  status: 'completed',
  pausa: null,
  runId: null,
  ...parcial,
});

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
      randomUUID(),
      'registra 200g de arroz',
    );

    // O caso real: o agente decide a tool, executa, e o stream cai antes do
    // primeiro token. A refeição foi registrada **de verdade** no domínio de
    // destino; descartar a mensagem aqui deixaria a ação sem nenhum vestígio no
    // único lugar onde a pessoa poderia auditá-la.
    await conversas.concluirTurno(
      userId,
      conversationId,
      resposta({ tools: [{ name: 'log_meal' }] }),
    );

    const mensagens = await mensagensDe(conversationId);
    expect(mensagens.map((m) => m.role)).toEqual(['user', 'assistant']);
    // E a tool volta da leitura, que é o que o `schema.prisma` promete: a coluna
    // sobrevive ao recarregar a página.
    expect(mensagens[1].tools).toEqual([{ name: 'log_meal' }]);
    expect(mensagens[1].content).toBe('');
  });

  it('turno sem texto E sem tool não deixa mensagem em branco no histórico', async () => {
    const { conversationId } = await conversas.iniciarTurno(userId, randomUUID(), 'oi');

    // Sem texto e sem tool não há o que auditar: uma mensagem vazia do assistente
    // é ruído no histórico e ainda vira entrada paga no turno seguinte, porque a
    // conversa inteira é reenviada ao agente a cada mensagem.
    await conversas.concluirTurno(userId, conversationId, resposta({ texto: '   ' }));

    expect((await mensagensDe(conversationId)).map((m) => m.role)).toEqual(['user']);
  });

  it('turno com texto e tool grava os dois na mesma mensagem', async () => {
    const { conversationId } = await conversas.iniciarTurno(userId, randomUUID(), 'e aí?');

    await conversas.concluirTurno(
      userId,
      conversationId,
      resposta({ texto: 'Registrei.', tools: [{ name: 'log_meal' }] }),
    );

    const mensagens = await mensagensDe(conversationId);
    expect(mensagens[1].content).toBe('Registrei.');
    expect(mensagens[1].tools).toEqual([{ name: 'log_meal' }]);
  });

  /**
   * O par do teste acima, e o mais caro dos dois se quebrar.
   *
   * A mensagem sem texto **fica no banco** (é o vestígio da ação) e **não vai
   * para o agente**: o `ChatMessage` de lá exige `content` com pelo menos um
   * caractere, e um 422 causado pelo histórico é permanente — a conversa
   * morreria a partir daquele turno, para sempre, sem nada que quem está
   * conversando pudesse fazer. As duas propriedades juntas são o motivo de o
   * filtro morar aqui e não no `concluirTurno`.
   */
  it('o histórico que vai ao agente pula a mensagem sem texto', async () => {
    const { conversationId } = await conversas.iniciarTurno(
      userId,
      randomUUID(),
      'registra o arroz',
    );
    await conversas.concluirTurno(
      userId,
      conversationId,
      resposta({ tools: [{ name: 'log_meal' }] }),
    );

    const historico = await conversas.historicoParaOAgente(userId, conversationId);

    expect(historico).toEqual([{ role: 'user', content: 'registra o arroz' }]);
    // E ela continua no banco: o filtro é do prompt, não do histórico.
    expect((await mensagensDe(conversationId)).length).toBe(2);
  });

  it('a conversa nasce com o id que o PWA gerou', async () => {
    const id = randomUUID();
    const { conversationId } = await conversas.iniciarTurno(userId, id, 'oi');

    expect(conversationId).toBe(id);
    expect(await conversas.encontrar(userId, id)).toMatchObject({ id, title: 'oi' });
  });

  it('uma pausa sem texto é gravada, e sai da linha no turno seguinte', async () => {
    const { conversationId } = await conversas.iniciarTurno(userId, randomUUID(), 'almocei');
    const pausa = {
      id: 'pausa-1',
      value: { kind: 'confirm', actions: [{ arguments: { g: 200 } }] },
    };

    const linha = await conversas.concluirTurno(
      userId,
      conversationId,
      resposta({ tools: [{ name: 'log_meal' }], status: 'interrupted', pausa }),
    );
    expect(linha).toEqual(expect.any(String));
    const gravada = await prisma.message.findUniqueOrThrow({ where: { id: linha! } });
    expect(gravada.metadata).toEqual({ status: 'interrupted', interrupt: pausa });

    await conversas.limparPausas(userId, conversationId);

    // Os argumentos da escrita proposta não sobrevivem à resposta da pessoa.
    const depois = await prisma.message.findUniqueOrThrow({ where: { id: linha! } });
    expect(depois.metadata).toEqual({ status: 'resolved' });
  });

  it('o voto vai para a resposta do assistente, e o motivo só no 👎', async () => {
    const { conversationId } = await conversas.iniciarTurno(userId, randomUUID(), 'oi');
    const linha = await conversas.concluirTurno(
      userId,
      conversationId,
      resposta({ texto: 'Oi!', runId: 'run-1' }),
    );

    await conversas.votar(userId, conversationId, linha!, {
      review: 'dislike',
      reasons: ['incorrect'],
      note: 'errou a data',
    });
    expect(
      await prisma.message.findUniqueOrThrow({
        where: { id: linha! },
        select: { review: true, reviewReasons: true, reviewNote: true, runId: true },
      }),
    ).toEqual({
      review: 'dislike',
      reviewReasons: ['incorrect'],
      reviewNote: 'errou a data',
      runId: 'run-1',
    });

    await conversas.votar(userId, conversationId, linha!, { review: 'like', reasons: ['x'] });
    expect(
      await prisma.message.findUniqueOrThrow({
        where: { id: linha! },
        select: { review: true, reviewReasons: true, reviewNote: true },
      }),
    ).toEqual({ review: 'like', reviewReasons: [], reviewNote: null });
  });

  it('não vota na fala da pessoa, só na resposta do assistente', async () => {
    const { conversationId } = await conversas.iniciarTurno(userId, randomUUID(), 'oi');
    const [fala] = await prisma.message.findMany({ where: { conversationId } });

    await expect(
      conversas.votar(userId, conversationId, fala.id, { review: 'like' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('o título do agente só substitui o provisório — o nome da pessoa ganha', async () => {
    const primeira = 'registra 200 g de frango no almoço';
    const intacta = await conversas.iniciarTurno(userId, randomUUID(), primeira);
    const renomeada = await conversas.iniciarTurno(userId, randomUUID(), primeira);
    await conversas.renomear(userId, renomeada.conversationId, 'Meu almoço');

    await conversas.titularSeProvisorio(userId, intacta.conversationId, primeira, 'Almoço');
    await conversas.titularSeProvisorio(userId, renomeada.conversationId, primeira, 'Almoço');

    expect((await conversas.encontrar(userId, intacta.conversationId))?.title).toBe('Almoço');
    expect((await conversas.encontrar(userId, renomeada.conversationId))?.title).toBe('Meu almoço');
  });

  it('renomeia e acha pela busca no título, sem diferenciar maiúscula', async () => {
    const { conversationId } = await conversas.iniciarTurno(userId, randomUUID(), 'qualquer');
    await conversas.renomear(userId, conversationId, 'Plano de Cutting');

    const achadas = await conversas.listar(userId, 'cutting');
    expect(achadas.map((c) => c.id)).toContain(conversationId);
    expect((await conversas.listar(userId, 'bulking')).map((c) => c.id)).not.toContain(
      conversationId,
    );
  });
});

/**
 * A purga do estado do agente (ADR 023), contra Postgres real.
 *
 * O schema do agente é criado pelo próprio agente (`AsyncPostgresSaver.setup`),
 * que o CI da API não sobe. Quando ele não existe, o teste cria só o que a purga
 * toca — as três tabelas, com `thread_id` — e apaga no fim. Quando existe (um
 * banco de desenvolvimento com o agente rodando), usa o de verdade e só mexe nas
 * threads que ele mesmo criou.
 */
describe('CheckpointPurgeService', () => {
  const prisma = new PrismaService();
  const purga = new CheckpointPurgeService(prisma);
  const TABELAS = ['checkpoints', 'checkpoint_blobs', 'checkpoint_writes'];
  let criouOSchema = false;
  const ana = randomUUID();
  const bia = randomUUID();

  beforeAll(async () => {
    const [{ existe }] = await prisma.$queryRaw<{ existe: boolean }[]>`
      SELECT to_regclass('agent_checkpoint.checkpoints') IS NOT NULL AS existe`;
    if (!existe) {
      criouOSchema = true;
      await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS agent_checkpoint');
      for (const tabela of TABELAS) {
        await prisma.$executeRawUnsafe(
          `CREATE TABLE agent_checkpoint.${tabela} (thread_id TEXT NOT NULL, marca TEXT)`,
        );
      }
    }
  });

  afterAll(async () => {
    if (criouOSchema) await prisma.$executeRawUnsafe('DROP SCHEMA agent_checkpoint CASCADE');
    await prisma.$disconnect();
  });

  const semear = async (thread: string) => {
    for (const tabela of TABELAS) {
      const colunas = criouOSchema
        ? '(thread_id, marca)'
        : tabela === 'checkpoints'
          ? '(thread_id, checkpoint_ns, checkpoint_id, checkpoint, metadata)'
          : tabela === 'checkpoint_blobs'
            ? '(thread_id, checkpoint_ns, channel, version, type)'
            : '(thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, blob)';
      const valores = criouOSchema
        ? `('${thread}', 'x')`
        : tabela === 'checkpoints'
          ? `('${thread}', '', '${randomUUID()}', '{}', '{}')`
          : tabela === 'checkpoint_blobs'
            ? `('${thread}', '', 'messages', '1', 'empty')`
            : `('${thread}', '', '${randomUUID()}', 't', 0, 'messages', ''::bytea)`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO agent_checkpoint.${tabela} ${colunas} VALUES ${valores}`,
      );
    }
  };

  const contar = async (condicao: string, valor: string) => {
    let total = 0;
    for (const tabela of TABELAS) {
      const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM agent_checkpoint.${tabela} WHERE ${condicao}`,
        valor,
      );
      total += Number(n);
    }
    return total;
  };

  it('apaga a thread da conversa e deixa as outras', async () => {
    await semear(`${ana}:c1`);
    await semear(`${ana}:c2`);

    await purga.apagarConversa(ana, 'c1');

    expect(await contar('thread_id = $1', `${ana}:c1`)).toBe(0);
    expect(await contar('thread_id = $1', `${ana}:c2`)).toBe(3);
  });

  it('apaga todas as threads da pessoa, e só dela', async () => {
    await semear(`${ana}:c3`);
    await semear(`${bia}:c3`);

    await purga.apagarDoUsuario(ana);

    expect(await contar("split_part(thread_id, ':', 1) = $1", ana)).toBe(0);
    expect(await contar("split_part(thread_id, ':', 1) = $1", bia)).toBe(3);
    await purga.apagarDoUsuario(bia);
  });
});
