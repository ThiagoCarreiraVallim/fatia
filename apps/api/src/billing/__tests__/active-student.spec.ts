import { usuariosAtivos, type AtividadeDb } from '../active-student';

/** Os seis domínios que a regra publicada nomeia como atividade própria. */
const DOMINIOS = ['meal', 'workoutSession', 'weightLog', 'stepLog', 'waterLog', 'goal'] as const;

type Dominio = (typeof DOMINIOS)[number];

type MockDb = Record<Dominio, { findMany: jest.Mock }>;

const makeDb = (): MockDb =>
  Object.fromEntries(DOMINIOS.map((d) => [d, { findMany: jest.fn(async () => []) }])) as MockDb;

const DE = new Date('2026-07-02T03:00:00Z');
const ATE = new Date('2026-08-01T03:00:00Z');

const como = (db: MockDb) => db as unknown as AtividadeDb;

describe('usuariosAtivos', () => {
  let db: MockDb;

  beforeEach(() => {
    db = makeDb();
  });

  it.each(DOMINIOS)('conta o aluno que registrou em %s', async (dominio) => {
    db[dominio].findMany.mockResolvedValue([{ userId: 'aluno-1' }]);

    const ativos = await usuariosAtivos(como(db), ['aluno-1', 'aluno-2'], DE, ATE);

    expect(ativos.has('aluno-1')).toBe(true);
    expect(ativos.has('aluno-2')).toBe(false);
  });

  it('não conta quem não registrou nada na janela', async () => {
    // O aluno que só conversou com a IA cai aqui: uso de IA não é atividade, em
    // nenhuma direção. Quem traz a própria IA (#164) conta pela associação e
    // pelo registro que ele fizer, igual a todo mundo.
    const ativos = await usuariosAtivos(como(db), ['so-usou-ia'], DE, ATE);

    expect(ativos.size).toBe(0);
  });

  it('devolve um Set de ids e nada além disso', async () => {
    db.meal.findMany.mockResolvedValue([{ userId: 'aluno-1' }, { userId: 'aluno-1' }]);
    db.stepLog.findMany.mockResolvedValue([{ userId: 'aluno-2' }]);

    const ativos = await usuariosAtivos(como(db), ['aluno-1', 'aluno-2'], DE, ATE);

    expect(ativos).toBeInstanceOf(Set);
    expect([...ativos].sort()).toEqual(['aluno-1', 'aluno-2']);
    expect([...ativos].every((v) => typeof v === 'string')).toBe(true);
  });

  it('lê apenas o id: nenhum registro, nenhum timestamp, nenhum conteúdo sai daqui', async () => {
    await usuariosAtivos(como(db), ['aluno-1'], DE, ATE);

    // O `select` é o contrato de privacidade da contagem. Um `select` que
    // trouxesse `eatenAt` ou `notes` daria a quem chama material para saber o
    // que a pessoa faz — e a fatura é lida pelo dono da academia.
    for (const dominio of DOMINIOS) {
      const args = db[dominio].findMany.mock.calls[0][0];
      expect(args.select).toEqual({ userId: true });
      expect(args.distinct).toEqual(['userId']);
      expect(args.include).toBeUndefined();
    }
  });

  it('corta a janela pelos instantes recebidos, em todos os domínios', async () => {
    await usuariosAtivos(como(db), ['aluno-1'], DE, ATE);

    const janela = { gte: DE, lt: ATE };
    expect(db.meal.findMany.mock.calls[0][0].where.createdAt).toEqual(janela);
    expect(db.workoutSession.findMany.mock.calls[0][0].where.startedAt).toEqual(janela);
    expect(db.weightLog.findMany.mock.calls[0][0].where.createdAt).toEqual(janela);
    expect(db.stepLog.findMany.mock.calls[0][0].where.loggedAt).toEqual(janela);
    expect(db.waterLog.findMany.mock.calls[0][0].where.loggedAt).toEqual(janela);
    // Meta criada **ou** concluída: quem fechou no ciclo uma meta antiga usou o
    // app, e olhar só para `createdAt` o deixaria de fora.
    expect(db.goal.findMany.mock.calls[0][0].where.OR).toEqual([
      { createdAt: janela },
      { completedAt: janela },
    ]);
  });

  it('procura só entre os candidatos recebidos, nunca no banco inteiro', async () => {
    await usuariosAtivos(como(db), ['aluno-1', 'aluno-2'], DE, ATE);

    for (const dominio of DOMINIOS) {
      expect(db[dominio].findMany.mock.calls[0][0].where.userId).toEqual({
        in: ['aluno-1', 'aluno-2'],
      });
    }
  });

  it('não vai ao banco quando não há candidato', async () => {
    const ativos = await usuariosAtivos(como(db), [], DE, ATE);

    expect(ativos.size).toBe(0);
    for (const dominio of DOMINIOS) {
      expect(db[dominio].findMany).not.toHaveBeenCalled();
    }
  });

  it('não altera a lista de candidatos de quem chamou', async () => {
    const candidatos = ['aluno-1'];
    await usuariosAtivos(como(db), candidatos, DE, ATE);

    expect(candidatos).toEqual(['aluno-1']);
  });
});
