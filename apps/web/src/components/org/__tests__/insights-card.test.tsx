import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, insightsApi: { ...actual.insightsApi, cuts: vi.fn(), aggregate: vi.fn() } };
});

import { insightsApi } from '@fatia/api-client';
import { InsightsCard } from '../insights-card';

function abrir(exportable = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InsightsCard groupId="g1" panel="behavior" title="Comportamento" exportable={exportable} />
    </QueryClientProvider>,
  );
}

describe('InsightsCard', () => {
  it('célula suprimida aparece como "menos de 5 pessoas", nunca zero', async () => {
    vi.mocked(insightsApi.cuts).mockResolvedValue({ cuts: ['sessions_by_week'] });
    vi.mocked(insightsApi.aggregate).mockResolvedValue({
      cut: 'sessions_by_week',
      period: 'last_90_days',
      insufficientSample: false,
      cells: [
        { key: '2026-10-05', value: 12, n: 6, suppressed: false },
        { key: '2026-10-12', value: null, n: null, suppressed: true },
      ],
    });
    abrir(true);
    expect(await screen.findByLabelText('5 out: 12')).toBeInTheDocument();
    expect(screen.getByLabelText('12 out: menos de 5 pessoas')).toBeInTheDocument();
    expect(insightsApi.aggregate).toHaveBeenCalledWith(
      'g1',
      'behavior',
      'sessions_by_week',
      'last_90_days',
    );
    expect(screen.getByRole('link', { name: /Exportar CSV/ })).toHaveAttribute(
      'href',
      '/api/proxy/groups/g1/insights/behavior/export?cut=sessions_by_week&period=last_90_days',
    );
  });

  it('amostra insuficiente diz isso, sem barras', async () => {
    vi.mocked(insightsApi.cuts).mockResolvedValue({ cuts: ['sessions_by_week'] });
    vi.mocked(insightsApi.aggregate).mockResolvedValue({
      cut: 'sessions_by_week',
      period: 'last_90_days',
      insufficientSample: true,
      cells: [{ key: '2026-10-05', value: null, n: null, suppressed: true }],
    });
    abrir();
    expect(await screen.findByText(/Amostra insuficiente/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/5 out/)).toBeNull();
  });
});
