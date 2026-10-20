import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WaterCard } from '../water-card';

/** O litro com vírgula, como o app mostra — o PWA mostrava "1.5 L". */
describe('WaterCard', () => {
  it('mostra litros com vírgula decimal', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WaterCard data={{ todayMl: 1500, targetMl: 2000, goalReached: false, logged: true }} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('1,5 L')).toBeInTheDocument();
    expect(screen.queryByText('1.5 L')).not.toBeInTheDocument();
  });
});
