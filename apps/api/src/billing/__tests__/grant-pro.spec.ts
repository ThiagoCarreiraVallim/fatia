import { concederOuRevogar, leArgumentos } from '../grant-pro';

describe('billing:grant-pro — argumentos', () => {
  it('lê e-mail, prazo e revogação', () => {
    expect(leArgumentos(['Demo@Fatia.local', '--days', '30'])).toEqual({
      email: 'demo@fatia.local',
      dias: 30,
      revogar: false,
      apagar: false,
    });
    expect(leArgumentos(['demo@fatia.local', '--revoke'])).toMatchObject({
      revogar: true,
      dias: null,
    });
  });

  it('--purge apaga só as cortesias da pessoa, e não combina com --revoke', async () => {
    expect(leArgumentos(['demo@fatia.local', '--purge'])).toMatchObject({ apagar: true });
    expect(() => leArgumentos(['demo@fatia.local', '--purge', '--revoke'])).toThrow(/Uso/);

    const deleteMany = jest.fn(async () => ({ count: 2 }));
    const prisma = {
      user: { findUnique: jest.fn(async () => ({ id: 'u1' })) },
      userSubscription: { deleteMany },
    } as unknown as Parameters<typeof concederOuRevogar>[0];

    const saida = await concederOuRevogar(prisma, leArgumentos(['demo@fatia.local', '--purge']));

    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', source: 'MANUAL' } });
    expect(saida).toMatch(/2 cortesia/);
  });

  it('recusa sem e-mail e prazo que não é inteiro positivo', () => {
    expect(() => leArgumentos([])).toThrow(/Uso/);
    expect(() => leArgumentos(['a@b.c', '--days', '0'])).toThrow(/inteiro positivo/);
    expect(() => leArgumentos(['a@b.c', '--days', ''])).toThrow(/inteiro positivo/);
  });
});
