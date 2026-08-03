import { MAX_MISSED_WEEKS, reconcileBlock, type PlannedWeek } from '../helpers/reconcile-block';
import { BLOCK_TEMPLATE } from '../helpers/block-template';

/** Bloco ancorado na segunda 2026-01-05. As semanas caem em 05, 12, 19 e 26/01. */
function planejado(sessionsTarget = 3): PlannedWeek[] {
  return BLOCK_TEMPLATE.map((week) => ({
    weekNumber: week.weekNumber,
    focus: week.focus,
    intensityFactor: week.intensityFactor,
    volumeFactor: week.volumeFactor,
    weekStart: ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'][week.weekNumber - 1],
    sessionsTarget,
  }));
}

const porNumero = (resultado: ReturnType<typeof reconcileBlock>, n: number) =>
  resultado.weeks.find((w) => w.weekNumber === n)!;

describe('reconcileBlock', () => {
  it('não julga a semana corrente: a janela ainda está aberta', () => {
    // Segunda-feira de manhã sem treino não é semana perdida.
    const resultado = reconcileBlock({
      weeks: planejado(),
      today: '2026-01-05',
      completedDates: [],
    });

    expect(resultado.currentWeekNumber).toBe(1);
    expect(porNumero(resultado, 1).state).toBe('current');
    expect(porNumero(resultado, 1).shiftedWeeks).toBe(0);
  });

  it('semana cheia fecha e avança sem mexer no calendário', () => {
    const resultado = reconcileBlock({
      weeks: planejado(3),
      today: '2026-01-14',
      completedDates: ['2026-01-05', '2026-01-07', '2026-01-09'],
    });

    expect(porNumero(resultado, 1).state).toBe('done');
    expect(porNumero(resultado, 1).sessionsDone).toBe(3);
    expect(resultado.currentWeekNumber).toBe(2);
    expect(porNumero(resultado, 2).effectiveWeekStart).toBe('2026-01-12');
  });

  it('semana zerada empurra o bloco 7 dias e a semana 2 continua sendo a semana 2', () => {
    // O caso que a issue chama de comum: viagem. O bloco espera; ninguém pula a
    // semana 1 nem perde a 2.
    const resultado = reconcileBlock({
      weeks: planejado(3),
      today: '2026-01-14',
      completedDates: [],
    });

    const semana1 = porNumero(resultado, 1);
    expect(resultado.currentWeekNumber).toBe(1);
    expect(semana1.effectiveWeekStart).toBe('2026-01-12');
    expect(semana1.shiftedWeeks).toBe(1);

    const semana2 = porNumero(resultado, 2);
    expect(semana2.weekNumber).toBe(2);
    expect(semana2.effectiveWeekStart).toBe('2026-01-19');
    // O bloco passa a ocupar 5 semanas de calendário e continua com 4 de treino.
    expect(porNumero(resultado, 4).effectiveWeekStart).toBe('2026-02-02');
  });

  it('empurra uma vez por semana perdida, não uma vez por leitura', () => {
    // O risco é a reancoragem infinita: se o empurrão não fosse idempotente
    // dentro da mesma semana, o bloco andaria para frente a cada request e nunca
    // acabaria. Três leituras em dias diferentes da MESMA semana têm de dar o
    // mesmo `effectiveWeekStart`.
    const deslocamentos = ['2026-01-12', '2026-01-14', '2026-01-18'].map((today) => {
      const semana1 = porNumero(
        reconcileBlock({ weeks: planejado(), today, completedDates: [] }),
        1,
      );
      return [semana1.effectiveWeekStart, semana1.shiftedWeeks];
    });

    expect(deslocamentos).toEqual([
      ['2026-01-12', 1],
      ['2026-01-12', 1],
      ['2026-01-12', 1],
    ]);
  });

  it('semana parcial conta como cumprida e NÃO empurra o resto', () => {
    // Empurrar por sessão perdida transformaria o plano num relógio impossível.
    const resultado = reconcileBlock({
      weeks: planejado(3),
      today: '2026-01-14',
      completedDates: ['2026-01-06'],
    });

    const semana1 = porNumero(resultado, 1);
    expect(semana1.state).toBe('partial');
    expect(semana1.sessionsDone).toBe(1);
    expect(semana1.shiftedWeeks).toBe(0);
    expect(resultado.currentWeekNumber).toBe(2);
    expect(porNumero(resultado, 2).effectiveWeekStart).toBe('2026-01-12');
  });

  it('abandona depois de três semanas seguidas sem nenhuma sessão', () => {
    const resultado = reconcileBlock({
      weeks: planejado(),
      today: '2026-01-28',
      completedDates: [],
    });

    expect(resultado.status).toBe('abandoned');
    expect(resultado.currentWeekNumber).toBeNull();
    expect(porNumero(resultado, 1).shiftedWeeks).toBe(MAX_MISSED_WEEKS);
  });

  it('duas semanas perdidas ainda deixam o bloco de pé', () => {
    // O limite é 3; provar o lado que NÃO abandona impede que o caso acima passe
    // por um `status` que já nascesse abandonado.
    const resultado = reconcileBlock({
      weeks: planejado(),
      today: '2026-01-21',
      completedDates: [],
    });

    expect(resultado.status).toBe('active');
    expect(resultado.currentWeekNumber).toBe(1);
    expect(porNumero(resultado, 1).shiftedWeeks).toBe(2);
  });

  it('uma semana treinada zera a contagem de ausências da seguinte', () => {
    // A regra é "três SEGUIDAS". Semana 1 vazia, semana 1 (reancorada) treinada,
    // semana 2 vazia: são duas ausências, não três — o bloco continua vivo.
    const resultado = reconcileBlock({
      weeks: planejado(3),
      today: '2026-01-28',
      completedDates: ['2026-01-13'],
    });

    expect(resultado.status).toBe('active');
    expect(porNumero(resultado, 1).shiftedWeeks).toBe(1);
    expect(porNumero(resultado, 2).shiftedWeeks).toBe(1);
    expect(resultado.currentWeekNumber).toBe(2);
  });

  it('fecha o bloco quando a última semana passa com treino', () => {
    const resultado = reconcileBlock({
      weeks: planejado(1),
      today: '2026-02-05',
      completedDates: ['2026-01-06', '2026-01-13', '2026-01-20', '2026-01-27'],
    });

    expect(resultado.status).toBe('completed');
    expect(resultado.currentWeekNumber).toBeNull();
    expect(resultado.weeks.map((w) => w.state)).toEqual(['done', 'done', 'done', 'done']);
  });

  it('conta cada sessão em uma semana só', () => {
    // Domingo é o último dia da semana e segunda é o primeiro da seguinte. Uma
    // fronteira `<=`/`<` trocada faria a sessão de domingo contar duas vezes.
    const resultado = reconcileBlock({
      weeks: planejado(3),
      today: '2026-01-20',
      completedDates: ['2026-01-11', '2026-01-12'],
    });

    expect([porNumero(resultado, 1).sessionsDone, porNumero(resultado, 2).sessionsDone]).toEqual([
      1, 1,
    ]);
  });
});
