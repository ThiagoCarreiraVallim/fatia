import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UNKNOWN_CHAT_ARTIFACT_TEXT, type ChatArtifact } from '@fatia/api-client';
import { ChatArtifactCard } from '../artefato';

/** Um formato que este PWA não conhece (API mais nova) mostra o aviso, sem derrubar a conversa. */
describe('ChatArtifactCard com formato desconhecido', () => {
  it('kind novo vira o aviso neutro', () => {
    const novo = { kind: 'mapa', pontos: [] } as unknown as ChatArtifact;
    render(<ChatArtifactCard artifact={novo} toolTitle="Mapa" />);
    expect(screen.getByText(UNKNOWN_CHAT_ARTIFACT_TEXT)).toBeTruthy();
  });

  it('formato conhecido sem o campo principal também', () => {
    const quebrado = { kind: 'bars' } as unknown as ChatArtifact;
    render(<ChatArtifactCard artifact={quebrado} />);
    expect(screen.getByText(UNKNOWN_CHAT_ARTIFACT_TEXT)).toBeTruthy();
  });

  it('formato conhecido desenha normalmente', () => {
    render(
      <ChatArtifactCard
        artifact={{
          toolCallId: 't1',
          kind: 'instructions',
          label: 'Agachamento',
          steps: ['Desça devagar'],
        }}
      />,
    );
    expect(screen.getByText('Desça devagar')).toBeTruthy();
  });
});
