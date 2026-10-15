import { leArgumentos } from '../grant-pro';

describe('billing:grant-pro — argumentos', () => {
  it('lê e-mail, prazo e revogação', () => {
    expect(leArgumentos(['Demo@Fatia.local', '--days', '30'])).toEqual({
      email: 'demo@fatia.local',
      dias: 30,
      revogar: false,
    });
    expect(leArgumentos(['demo@fatia.local', '--revoke'])).toMatchObject({
      revogar: true,
      dias: null,
    });
  });

  it('recusa sem e-mail e prazo que não é inteiro positivo', () => {
    expect(() => leArgumentos([])).toThrow(/Uso/);
    expect(() => leArgumentos(['a@b.c', '--days', '0'])).toThrow(/inteiro positivo/);
    expect(() => leArgumentos(['a@b.c', '--days', ''])).toThrow(/inteiro positivo/);
  });
});
