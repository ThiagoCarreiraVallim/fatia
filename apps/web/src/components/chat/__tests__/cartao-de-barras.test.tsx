import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatArtifactCard } from '../artefato';

const dias = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(2026, 9, 19 + i)).toISOString().slice(0, 10),
  );

/** Conferência da etapa 6: 28 barras de água desenhavam "1 2 2 … C C C" embaixo. */
describe('cartão de barras — rótulos do eixo', () => {
  it('com muitas barras, só início, meio e fim legíveis', () => {
    render(
      <ChatArtifactCard
        artifact={{
          toolCallId: 't1',
          kind: 'bars',
          label: 'Água nos últimos 28 dias',
          unit: 'ml',
          bars: dias(28).map((label, i) => ({ label, value: 1000 + i })),
        }}
      />,
    );
    const eixo = screen.getByTestId('bars-axis');
    expect([...eixo.children].map((c) => c.textContent)).toEqual(['19 out', '1 nov', '15 nov']);
  });

  it('com poucas barras, um rótulo por barra', () => {
    render(
      <ChatArtifactCard
        artifact={{
          toolCallId: 't2',
          kind: 'bars',
          label: 'Treinos por semana',
          bars: ['Sem 1', 'Sem 2', 'Sem 3'].map((label) => ({ label, value: 2 })),
        }}
      />,
    );
    const eixo = screen.getByTestId('bars-axis');
    expect([...eixo.children].map((c) => c.textContent)).toEqual(['Sem 1', 'Sem 2', 'Sem 3']);
  });
});
