import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Student } from '@fatia/api-client';
import { ProfessionalPanelLink } from '../professional-panel-link';

/**
 * A porta de entrada do painel (#157).
 *
 * O painel foi entregue sem link nenhum: `/students` só abria digitando o
 * endereço. O caso confere as duas metades da decisão — aparece para quem
 * atende, e **não** aparece para quem não atende —, porque só a primeira
 * deixaria passar um item de menu no perfil de todo usuário do app.
 */

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, professionalApi: { listStudents: vi.fn(), readStudent: vi.fn() } };
});

import { professionalApi } from '@fatia/api-client';

const listStudents = vi.mocked(professionalApi.listStudents);

function aluno(membershipId: string, name: string): Student {
  return {
    membershipId,
    name,
    groupId: 'grp-1',
    groupName: 'Academia',
    joinedAt: null,
    scopesGrantedToMe: [],
  };
}

function renderLink() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfessionalPanelLink />
    </QueryClientProvider>,
  );
}

describe('entrada do painel do profissional', () => {
  it('leva a /students quem atende alguém', async () => {
    listStudents.mockResolvedValue([aluno('mem-a', 'Ana'), aluno('mem-b', 'Bia')]);

    renderLink();

    const link = await screen.findByRole('link', { name: /Meus alunos/ });
    expect(link).toHaveAttribute('href', '/students');
    // O contador é o que distingue "tem painel" de "tem painel com gente
    // dentro"; sem ele o item viraria decoração.
    expect(link.textContent).toMatch(/2 alunos atendidos/);
  });

  it('não aparece para quem não atende ninguém', async () => {
    // A API devolve `[]` — e não 403 — para quem não é PROFESSIONAL em grupo
    // nenhum. Renderizar mesmo assim poria "Meus alunos" no perfil de todo
    // usuário do app, que é o oposto do que a lista vazia quer dizer.
    listStudents.mockResolvedValue([]);

    const { container } = renderLink();

    await waitFor(() => expect(listStudents).toHaveBeenCalled());
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('lista que falha não deixa resto de item no perfil', async () => {
    listStudents.mockRejectedValue(new Error('rede'));

    const { container } = renderLink();

    await waitFor(() => expect(listStudents).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
