import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Achievement, StreakResult, TodaySummary } from '@fatia/api-client';
import { StreakCard } from '../streak-card';

/**
 * O card é a entrega visível da issue #147: até esta PR o `streak` era computado a cada abertura
 * do app e jogado fora — `grep -rni streak apps/web/src` devolvia zero.
 *
 * As asserções procuram o texto exato de propósito. `toHaveTextContent('4')` casaria com "14" e
 * com "40", e é assim que um card com o número errado passa verde.
 */
const vazio: StreakResult = {
  periodos: 0,
  faltasUsadas: 0,
  faltasPermitidas: 0,
  periodoCorrenteEmAberto: false,
  janelaEsgotada: false,
};

function resumo(parcial: Partial<TodaySummary['streak']> = {}): TodaySummary['streak'] {
  return {
    activeDays: vazio,
    nutritionDays: vazio,
    workoutWeeks: vazio,
    stepsDays: vazio,
    stepsTargetSet: true,
    ...parcial,
  };
}

const conquista = (parcial: Partial<Achievement>): Achievement => ({
  key: 'first_meal',
  title: 'Primeira refeição',
  description: 'Você registrou sua primeira refeição.',
  unlockedAt: null,
  context: null,
  ...parcial,
});

describe('StreakCard', () => {
  it('mostra a sequência de dias ATIVOS, não a de nutrição', () => {
    // O número grande é o OR das três pernas. Mostrar o de nutrição empurraria a pessoa a
    // registrar qualquer coisa para não perder a sequência.
    render(
      <StreakCard
        streak={resumo({
          activeDays: { ...vazio, periodos: 12 },
          nutritionDays: { ...vazio, periodos: 3 },
        })}
        achievements={[]}
      />,
    );

    expect(screen.getByText('12 dias')).toBeInTheDocument();
    expect(screen.getByText('3 dias')).toBeInTheDocument();
  });

  it('explica a falta usada em vez de deixar o número parecer inventado', () => {
    render(
      <StreakCard
        streak={resumo({
          activeDays: { ...vazio, periodos: 4, faltasUsadas: 1, faltasPermitidas: 2 },
        })}
        achievements={[]}
      />,
    );

    expect(screen.getByText('4 dias')).toBeInTheDocument();
    expect(screen.getByText('1 de 2 faltas usadas — a sequência segue.')).toBeInTheDocument();
  });

  it('apresenta treino em SEMANAS, não em dias', () => {
    // Streak de treino é semanal e os outros dois são diários. Rotular tudo de "dias" faria o
    // mesmo número significar coisas diferentes na mesma linha.
    render(
      <StreakCard streak={resumo({ workoutWeeks: { ...vazio, periodos: 3 } })} achievements={[]} />,
    );

    expect(screen.getByText('3 semanas')).toBeInTheDocument();
  });

  it('diz "sem meta" em vez de "0 dias" quando o usuário não tem UserGoals', () => {
    // Estado de todo usuário novo. "0 dias" leria como fracasso numa meta que ele nunca definiu.
    render(<StreakCard streak={resumo({ stepsTargetSet: false })} achievements={[]} />);

    expect(screen.getByText('sem meta')).toBeInTheDocument();
  });

  it('mostra o catálogo inteiro e conta só o que foi desbloqueado', () => {
    render(
      <StreakCard
        streak={resumo()}
        achievements={[
          conquista({ key: 'first_meal', unlockedAt: '2026-01-02T12:00:00.000Z' }),
          conquista({ key: 'first_pr', title: 'Primeiro recorde' }),
        ]}
      />,
    );

    expect(screen.getByText('1/2 conquistas')).toBeInTheDocument();
    // A bloqueada aparece: a tela precisa mostrar o alvo, não só o troféu.
    expect(screen.getByText('Primeiro recorde')).toBeInTheDocument();
  });
});
