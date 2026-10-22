import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GroupAgent, MyGroup } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, groupAgentApi: { get: vi.fn(), put: vi.fn() } };
});

import { groupAgentApi } from '@fatia/api-client';
import OrgAgentPage from '../page';

const agente = (p: Partial<GroupAgent> = {}): GroupAgent => ({
  configured: true,
  name: 'Treinador Demo',
  instructions: 'Fale de treino.',
  enabled: true,
  avatar: { id: 'av1', kind: 'IMAGE', url: 'https://cdn.test/av1.webp', width: 1, height: 1 },
  updatedAt: '2026-10-17T00:00:00Z',
  ...p,
});

function abrir(role: MyGroup['role'] = 'OWNER', atual: GroupAgent = agente()) {
  ctx.group = grupo({ role });
  vi.mocked(groupAgentApi.get).mockResolvedValue(atual);
  vi.mocked(groupAgentApi.put).mockImplementation(async (_g, input) =>
    agente({ ...input, avatar: atual.avatar }),
  );
  return renderWithClient(<OrgAgentPage />);
}

describe('painel › agente', () => {
  afterEach(() => vi.clearAllMocks());

  it('sem configuração, sugere o nome da comunidade e já vem ligado', async () => {
    abrir(
      'OWNER',
      agente({ configured: false, name: '', instructions: '', enabled: false, avatar: null }),
    );

    expect(await screen.findByLabelText('Nome')).toHaveValue('Assistente Academia Demo');
    expect(screen.getByRole('switch', { name: /Ligado no chat/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  it('salva só o que mudou, sem mexer no avatar que ficou', async () => {
    abrir();
    const orientacoes = await screen.findByLabelText('Orientações');
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled();

    await userEvent.clear(orientacoes);
    await userEvent.type(orientacoes, '  Sugira os planos da casa.  ');
    await userEvent.click(screen.getByRole('switch', { name: /Ligado no chat/ }));
    await userEvent.click(salvar);

    await waitFor(() =>
      expect(groupAgentApi.put).toHaveBeenCalledWith('g1', {
        name: 'Treinador Demo',
        instructions: 'Sugira os planos da casa.',
        enabled: false,
      }),
    );
  });

  it('nome com quebra de linha ou < > não sai da tela', async () => {
    abrir();
    const nome = await screen.findByLabelText('Nome');
    await userEvent.clear(nome);
    await userEvent.type(nome, 'Coach <<<');

    expect(screen.getByRole('alert')).toHaveTextContent('nem < ou >');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('profissional não configura: a página diz que é do dono e nem busca', async () => {
    abrir('PROFESSIONAL');

    expect(screen.getByText('Só o dono configura o agente')).toBeInTheDocument();
    expect(groupAgentApi.get).not.toHaveBeenCalled();
  });
});
