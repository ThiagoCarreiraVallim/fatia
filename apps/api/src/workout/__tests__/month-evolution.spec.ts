import { monthEvolution, pickHighlight } from '../helpers/month-evolution';

/**
 * "Maior evolução do mês" (#382, prancha Al-G5): o 1RM estimado do começo e do fim dos últimos
 * 30 dias, em %. Em % para comparar exercícios de cargas bem diferentes (leg press × rosca).
 */
describe('monthEvolution', () => {
  const agora = new Date('2026-11-16T12:00:00.000Z');
  const dia = (n: number) => new Date(agora.getTime() - n * 86_400_000);

  it('compara o melhor 1RM da primeira sessão com o da última, dentro de 30 dias', () => {
    const r = monthEvolution(
      [
        { sessionId: 'a', at: dia(28), e1rm: 80 },
        { sessionId: 'a', at: dia(28), e1rm: 89 },
        { sessionId: 'b', at: dia(10), e1rm: 95 },
        { sessionId: 'c', at: dia(2), e1rm: 102 },
      ],
      agora,
    );

    expect(r).toEqual({ startE1RM: 89, endE1RM: 102, percent: 14.6 });
  });

  it('o que veio antes dos 30 dias fica de fora', () => {
    const r = monthEvolution(
      [
        { sessionId: 'velha', at: dia(40), e1rm: 50 },
        { sessionId: 'a', at: dia(20), e1rm: 90 },
        { sessionId: 'b', at: dia(1), e1rm: 99 },
      ],
      agora,
    );

    expect(r?.startE1RM).toBe(90);
  });

  it('uma sessão só no período não tem evolução', () => {
    expect(monthEvolution([{ sessionId: 'a', at: dia(3), e1rm: 90 }], agora)).toBeNull();
  });

  it('cair também é evolução (negativa), sem esconder', () => {
    const r = monthEvolution(
      [
        { sessionId: 'a', at: dia(20), e1rm: 100 },
        { sessionId: 'b', at: dia(1), e1rm: 95 },
      ],
      agora,
    );

    expect(r?.percent).toBe(-5);
  });
});

describe('pickHighlight', () => {
  it('é o exercício de maior % positiva', () => {
    const h = pickHighlight([
      { exerciseId: 1, monthEvolution: { startE1RM: 68, endE1RM: 75, percent: 10.3 } },
      { exerciseId: 2, monthEvolution: { startE1RM: 89, endE1RM: 102, percent: 14.6 } },
      { exerciseId: 3, monthEvolution: null },
    ]);

    expect(h?.exerciseId).toBe(2);
  });

  it('sem nenhuma evolução positiva, não há destaque', () => {
    expect(
      pickHighlight([
        { exerciseId: 1, monthEvolution: { startE1RM: 70, endE1RM: 70, percent: 0 } },
      ]),
    ).toBeNull();
  });
});
