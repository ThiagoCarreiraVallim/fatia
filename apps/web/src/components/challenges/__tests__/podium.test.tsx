import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LeaderboardEntry } from '@fatia/api-client';
import { Podium } from '../challenge-ui';

const linha = (over: Partial<LeaderboardEntry>): LeaderboardEntry => ({
  displayName: 'X',
  score: 5,
  rank: 1,
  isMe: false,
  medal: 'gold',
  streak: 0,
  ...over,
});

/** O pódio do encerrado (Cm-11), na revisão da #395 (M7). */
describe('Podium', () => {
  it('quem fez 0 não sobe no pódio', () => {
    render(
      <Podium
        entries={[
          linha({ displayName: 'Ana', score: 4, rank: 1, medal: 'gold' }),
          linha({ displayName: 'Bia', score: 0, rank: 2, medal: null }),
        ]}
      />,
    );
    const podio = screen.getByRole('list', { name: 'Pódio' });
    expect(within(podio).getByText('Ana')).toBeInTheDocument();
    expect(within(podio).queryByText('Bia')).not.toBeInTheDocument();
  });

  it('empate divide o degrau: os dois primeiros aparecem em 1º', () => {
    render(
      <Podium
        entries={[
          linha({ displayName: 'Ana', score: 4, rank: 1, medal: 'gold' }),
          linha({ displayName: 'Bia', score: 4, rank: 1, medal: 'gold' }),
          linha({ displayName: 'Caio', score: 2, rank: 3, medal: 'bronze' }),
        ]}
      />,
    );
    const podio = screen.getByRole('list', { name: 'Pódio' });
    expect(within(podio).getByText('Ana')).toBeInTheDocument();
    expect(within(podio).getByText('Bia')).toBeInTheDocument();
    expect(within(podio).getAllByText('1º')).toHaveLength(2);
    expect(within(podio).getByText('3º')).toBeInTheDocument();
  });

  it('o troféu tem contraste no tema claro (não é o amarelo claro sobre branco)', () => {
    const { container } = render(
      <Podium entries={[linha({ displayName: 'Ana', score: 4, rank: 1, medal: 'gold' })]} />,
    );
    const trofeu = container.querySelector('[data-podium-trophy]');
    expect(trofeu).not.toBeNull();
    expect(trofeu!.getAttribute('class')).toMatch(/text-\[#b45309\]/);
    expect(trofeu!.getAttribute('class')).toMatch(/dark:text-\[#fbbf24\]/);
  });
});
