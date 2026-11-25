import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type MyGroup } from '@fatia/api-client';
import { grupo, membro, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null, replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: ctx.replace }) }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    orgApi: {
      members: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      transferOwner: vi.fn(),
      setCover: vi.fn(),
    },
  };
});

import { orgApi } from '@fatia/api-client';
import { toast } from 'sonner';
import OrgSettingsPage from '../page';

function abrir(p: Partial<MyGroup> = {}) {
  ctx.group = grupo(p);
  vi.mocked(orgApi.members).mockResolvedValue([
    membro({ name: 'Bruno', role: 'OWNER', membershipId: 'mo' }),
    membro({ name: 'Helena', role: 'PROFESSIONAL' }),
    membro({ name: 'Carla', role: 'MEMBER' }),
  ]);
  vi.mocked(orgApi.update).mockResolvedValue({} as never);
  return renderWithClient(<OrgSettingsPage />);
}

describe('painel › configurações (#413, Pn-15)', () => {
  afterEach(() => vi.clearAllMocks());

  it('um Salvar no topo, desligado até mudar algo; manda só o que mudou', async () => {
    abrir();
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument();
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Descrição'));
    await userEvent.click(screen.getByRole('radio', { name: 'Só convite' }));
    expect(screen.getByText('Só entra quem recebe um convite.')).toBeInTheDocument();
    await userEvent.click(salvar);
    await waitFor(() =>
      expect(orgApi.update).toHaveBeenCalledWith('g1', {
        description: null,
        joinPolicy: 'INVITE_ONLY',
      }),
    );
    expect(toast).toHaveBeenCalledWith('Configurações salvas');
  });

  it('o que o membro precisa compartilhar: fotos das refeições não trava', async () => {
    abrir();
    const card = screen.getByRole('group', { name: 'O que o membro precisa compartilhar' });
    expect(within(card).getByText(/Vale para quem entrar daqui em diante/)).toBeInTheDocument();
    const fotos = within(card).getByRole('checkbox', { name: /Fotos das refeições/ });
    await userEvent.click(fotos);
    expect(toast).toHaveBeenCalledWith('Fotos das refeições não pode ser obrigatória');
    expect(fotos).not.toBeChecked();
    await userEvent.click(within(card).getByRole('checkbox', { name: /Treino/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(orgApi.update).toHaveBeenCalledWith('g1', { requiredSharingScopes: ['WORKOUT'] }),
    );
  });

  it('fotos das refeições já marcada (comunidade antiga) desmarca: a trava vale só para marcar', async () => {
    abrir({ requiredSharingScopes: ['WORKOUT', 'MEAL_PHOTOS'] });
    const card = screen.getByRole('group', { name: 'O que o membro precisa compartilhar' });
    const fotos = within(card).getByRole('checkbox', { name: /Fotos das refeições/ });
    expect(fotos).toBeChecked();
    await userEvent.click(fotos);
    expect(fotos).not.toBeChecked();
    expect(toast).not.toHaveBeenCalledWith('Fotos das refeições não pode ser obrigatória');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(orgApi.update).toHaveBeenCalledWith('g1', { requiredSharingScopes: ['WORKOUT'] }),
    );
  });

  it('esconder uma seção salva na hora e promete que nada some do app do aluno', async () => {
    abrir({ hiddenSections: ['FEED'] });
    const card = screen.getByRole('group', { name: 'Seções da comunidade' });
    expect(within(card).getByText(/Nunca desliga nada do app do aluno/)).toBeInTheDocument();
    expect(within(card).getByRole('switch', { name: 'Mural' })).not.toBeChecked();
    await userEvent.click(within(card).getByRole('switch', { name: 'Desafios' }));
    await waitFor(() =>
      expect(orgApi.update).toHaveBeenCalledWith('g1', {
        hiddenSections: ['CHALLENGES', 'FEED'],
      }),
    );
    expect(toast).toHaveBeenCalledWith('Desafios escondida · nada some do app do aluno');
    expect(within(card).getAllByText('escondida para os membros')).toHaveLength(2);
  });

  it('cor da marca vai no mesmo Salvar; apagar a cor volta à padrão', async () => {
    abrir({ brandColor: '#1d4ed8' });
    const cor = screen.getByLabelText('Cor da comunidade');
    await userEvent.clear(cor);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(orgApi.update).toHaveBeenCalledWith('g1', { brandColor: null }));
  });

  it('o resumo da equipe e o código de entrada', async () => {
    abrir();
    expect(screen.getByText('academia-demo')).toBeInTheDocument();
    expect(await screen.findByText('2 pessoas · 1 dono, 1 profissional')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Equipe e permissões' })).toHaveAttribute(
      'href',
      '/org/g1/team',
    );
  });

  it('o dono vê Integrações, passar adiante e apagar; o admin não', async () => {
    abrir();
    expect(screen.getByRole('link', { name: /Integrações e API/ })).toHaveAttribute(
      'href',
      '/org/g1/integrations',
    );
    expect(screen.getByRole('button', { name: 'Transferir para…' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Social' })).toBeEnabled();
  });

  it('admin: sem Integrações, sem passar adiante; o tipo aparece, mas só o dono muda', () => {
    abrir({ role: 'ADMIN', actions: undefined });
    expect(screen.queryByRole('link', { name: /Integrações e API/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Transferir para…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apagar comunidade' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Social' })).toBeDisabled();
    expect(screen.getByText('Só o dono muda o tipo.')).toBeInTheDocument();
  });

  it('apagar exige digitar o nome; 503 avisa que nada foi apagado', async () => {
    vi.mocked(orgApi.remove).mockRejectedValue(new ApiError('indisponível', 503));
    abrir();
    await userEvent.click(screen.getByRole('button', { name: 'Apagar comunidade' }));
    const dialogo = await screen.findByRole('dialog');
    const apagar = within(dialogo).getByRole('button', { name: 'Apagar' });
    expect(apagar).toBeDisabled();
    await userEvent.type(within(dialogo).getByLabelText(/Digite o nome/), 'Academia Demo');
    await userEvent.click(apagar);
    await waitFor(() => expect(orgApi.remove).toHaveBeenCalledWith('g1'));
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Nada foi apagado/));
    expect(ctx.replace).not.toHaveBeenCalled();
  });

  it('tipo para Social com assentos: a recusa da API aparece', async () => {
    abrir();
    vi.mocked(orgApi.update).mockRejectedValue(
      new ApiError('Cancele os assentos antes de virar Social', 409),
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Social' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Cancele os assentos antes de virar Social'),
    );
  });
});
