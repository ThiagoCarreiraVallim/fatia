import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// O vaul chama `setPointerCapture`, que o jsdom não tem; o arrasto não importa aqui.
vi.mock('@/components/ui/drawer', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Pass,
    DrawerHeader: Pass,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  };
});

import { PersonalNotice } from '@/components/ui/personal-notice';
import { AiGenerate } from '@/components/ui/ai-generate';
import { ShareSheet } from '@/components/sharing/share-sheet';

describe('aviso "recebido do seu personal"', () => {
  it('as 4 variantes, com o botão certo', async () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <PersonalNotice
        notice={{
          kind: 'workout',
          planName: 'Hipertrofia A/B',
          from: 'Helena Prado',
          when: 'agora',
        }}
        onAction={onAction}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Novo treino: Hipertrofia A/B');
    await userEvent.click(
      screen.getByRole('button', { name: 'Ver: Novo treino: Hipertrofia A/B' }),
    );
    expect(onAction).toHaveBeenCalled();

    rerender(
      <PersonalNotice
        notice={{ kind: 'nutrition-plan', kcal: 1800, from: 'Helena', when: '2 h' }}
        onAction={onAction}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Plano alimentar · 1.800 kcal');
    rerender(<PersonalNotice notice={{ kind: 'assessment', due: 'sexta' }} onAction={onAction} />);
    expect(screen.getByRole('button', { name: /^Registrar/ })).toBeInTheDocument();
    rerender(
      <PersonalNotice notice={{ kind: 'checkin', questions: 5, minutes: 1 }} onAction={onAction} />,
    );
    expect(screen.getByRole('button', { name: /^Responder/ })).toBeInTheDocument();
  });
});

describe('Gerar com IA', () => {
  it('gerando: linhas pulsando no lugar do conteúdo, botão respirando e bloqueado', () => {
    render(
      <AiGenerate title="Novo plano de treino" state="generating" onGenerate={() => {}}>
        <p>conteúdo</p>
      </AiGenerate>,
    );
    const area = screen.getByRole('region', { name: 'Novo plano de treino' });
    expect(area).toHaveAttribute('aria-busy', 'true');
    expect(within(area).getByRole('status', { name: 'Gerando o rascunho' })).toBeInTheDocument();
    expect(screen.queryByText('conteúdo')).toBeNull();
    const button = screen.getByRole('button', { name: 'Gerando…' });
    expect(button).toBeDisabled();
    expect(button.className).toContain('anim-breathe');
  });

  it('o resultado entra como rascunho, e o botão só respira enquanto gera', () => {
    render(
      <AiGenerate title="Novo plano de treino" state="draft" onGenerate={() => {}}>
        <p>conteúdo</p>
      </AiGenerate>,
    );
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar de novo' }).className).not.toContain(
      'anim-breathe',
    );
  });
});

describe('folha Compartilhar', () => {
  it('"Aparecer como" troca o nome no cartão, e o destino recebe a escolha', async () => {
    const onShare = vi.fn();
    render(
      <ShareSheet
        open
        onOpenChange={() => {}}
        data={{ kind: 'streak', headline: '12 dias', caption: 'Sequência' }}
        person={{ name: 'Ana', handle: 'anademo' }}
        onShare={onShare}
      />,
    );
    const card = screen.getByRole('figure');
    expect(card).toHaveTextContent('Ana');
    await userEvent.click(screen.getByRole('radio', { name: 'Ninguém' }));
    expect(screen.getByRole('figure')).not.toHaveTextContent('Ana');
    await userEvent.click(screen.getByRole('button', { name: 'WhatsApp' }));
    expect(onShare).toHaveBeenCalledWith('whatsapp', { as: 'none' });
  });
});
