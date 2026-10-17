import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render as renderBase, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ChatActionPreview, ChatConfirmAction, ChatInterruptValue } from '@fatia/api-client';

const previewChatAction = vi.fn<(tool: string, args: unknown) => Promise<ChatActionPreview>>();

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    previewChatAction: (tool: string, args: unknown) => previewChatAction(tool, args),
  };
});

const { AskUser, normalizarCampos } = await import('../ask-user');

function render(elemento: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderBase(<QueryClientProvider client={client}>{elemento}</QueryClientProvider>);
}

beforeEach(() => {
  previewChatAction.mockReset();
  previewChatAction.mockResolvedValue({
    valida: true,
    linhas: [
      { rotulo: 'Refeição', valor: 'Almoço' },
      { rotulo: 'Item', valor: '200 g de Frango grelhado' },
    ],
  });
});

const escrita = (id: string, tool = 'log_meal'): ChatConfirmAction => ({
  kind: 'confirm',
  toolCallId: id,
  tool,
  title: tool === 'log_meal' ? 'Registrar refeição' : 'Registrar peso',
  prompt: 'x',
  arguments: { grams: 200 },
});

describe('AskUser — confirmação', () => {
  it('uma escrita só responde no clique, com o sim para aquele tool_call_id', async () => {
    const onResponder = vi.fn();
    const pausa: ChatInterruptValue = { kind: 'confirm', prompt: 'x', actions: [escrita('c1')] };
    render(<AskUser pausa={pausa} ocupado={false} onResponder={onResponder} />);

    await userEvent.click(screen.getByRole('button', { name: 'Recusar' }));

    expect(onResponder).toHaveBeenCalledWith({ approvals: { c1: false }, answers: {} });
  });

  it('"Confirmar" recebe o foco quando o resumo chega: quem usa teclado estava no campo', async () => {
    const pausa: ChatInterruptValue = { kind: 'confirm', prompt: 'x', actions: [escrita('c1')] };
    render(<AskUser pausa={pausa} ocupado={false} onResponder={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus());
  });

  it('mostra o resumo em português, e nunca o nome técnico nem o JSON da chamada', async () => {
    const pausa: ChatInterruptValue = { kind: 'confirm', prompt: 'x', actions: [escrita('c1')] };
    const { container } = render(<AskUser pausa={pausa} ocupado={false} onResponder={vi.fn()} />);

    expect(await screen.findByText('200 g de Frango grelhado')).toBeInTheDocument();
    expect(screen.getByText('Almoço')).toBeInTheDocument();
    expect(previewChatAction).toHaveBeenCalledWith('log_meal', { grams: 200 });
    expect(container.textContent).not.toMatch(/log_meal|\{|grams/);
  });

  it('não deixa confirmar antes de o resumo chegar', () => {
    previewChatAction.mockReturnValue(new Promise(() => {}));
    const pausa: ChatInterruptValue = { kind: 'confirm', prompt: 'x', actions: [escrita('c1')] };
    render(<AskUser pausa={pausa} ocupado={false} onResponder={vi.fn()} />);

    expect(screen.getByText('Preparando o resumo…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeEnabled();
  });

  it('escrita que a tool recusaria mostra o que falta e só deixa recusar', async () => {
    previewChatAction.mockResolvedValue({
      valida: false,
      linhas: [],
      problema: 'Faltou informar: quando. Peça de novo ao assistente.',
    });
    const onResponder = vi.fn();
    const pausa: ChatInterruptValue = { kind: 'confirm', prompt: 'x', actions: [escrita('c1')] };
    render(<AskUser pausa={pausa} ocupado={false} onResponder={onResponder} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Faltou informar: quando');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    expect(onResponder).toHaveBeenCalledWith({ approvals: { c1: false }, answers: {} });
  });

  it('sem resumo (API fora), avisa e deixa a pessoa decidir', async () => {
    previewChatAction.mockRejectedValue(new Error('fora do ar'));
    const pausa: ChatInterruptValue = { kind: 'confirm', prompt: 'x', actions: [escrita('c1')] };
    render(<AskUser pausa={pausa} ocupado={false} onResponder={vi.fn()} />);

    // Uma segunda tentativa antes de desistir: o prazo cobre o intervalo dela.
    expect(
      await screen.findByText(/Não consegui mostrar os detalhes/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  });

  it('duas escritas são decididas uma a uma e enviadas juntas', async () => {
    const onResponder = vi.fn();
    const pausa: ChatInterruptValue = {
      kind: 'confirm',
      prompt: 'x',
      actions: [escrita('c1'), escrita('c2', 'log_weight')],
    };
    render(<AskUser pausa={pausa} ocupado={false} onResponder={onResponder} />);

    const enviar = screen.getByRole('button', { name: 'Enviar' });
    expect(enviar).toBeDisabled();

    await screen.findAllByText('200 g de Frango grelhado');
    const [confirmar1, confirmar2] = screen.getAllByRole('button', { name: 'Confirmar' });
    const [, recusar2] = screen.getAllByRole('button', { name: 'Recusar' });
    await userEvent.click(confirmar1);
    await userEvent.click(recusar2);
    expect(confirmar2).toBeInTheDocument();
    await userEvent.click(enviar);

    expect(onResponder).toHaveBeenCalledWith({
      approvals: { c1: true, c2: false },
      answers: {},
    });
  });
});

describe('AskUser — pergunta', () => {
  it('monta o formulário e responde por tool_call_id, com o rótulo do campo', async () => {
    const onResponder = vi.fn();
    const pausa: ChatInterruptValue = {
      kind: 'question',
      prompt: 'Quantas gramas?',
      actions: [
        {
          kind: 'question',
          toolCallId: 'q1',
          messageId: 'tool-q1',
          prompt: 'Quantas gramas?',
          fields: [{ name: 'g', label: 'Gramas', type: 'number', required: true }],
        },
      ],
    };
    render(<AskUser pausa={pausa} ocupado={false} onResponder={onResponder} />);

    await userEvent.type(screen.getByLabelText(/Gramas/), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(onResponder).toHaveBeenCalledWith({ approvals: {}, answers: { q1: { Gramas: '150' } } });
  });

  it('pergunta sem campos vira resposta livre', async () => {
    const onResponder = vi.fn();
    const pausa: ChatInterruptValue = {
      kind: 'question',
      prompt: 'Qual refeição?',
      actions: [
        {
          kind: 'question',
          toolCallId: 'q1',
          messageId: 'm',
          prompt: 'Qual refeição?',
          fields: [],
        },
      ],
    };
    render(<AskUser pausa={pausa} ocupado={false} onResponder={onResponder} />);

    await userEvent.type(screen.getByLabelText('Sua resposta'), 'o jantar');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(onResponder).toHaveBeenCalledWith({ approvals: {}, answers: { q1: 'o jantar' } });
  });
});

describe('normalizarCampos', () => {
  it('campo torto do modelo não derruba o formulário', () => {
    expect(
      normalizarCampos(['Gramas', { name: 'x', type: 'cor' }, { label: '' }, 42, null]),
    ).toEqual([
      { name: 'campo_0', label: 'Gramas', type: 'text' },
      { name: 'x', label: 'x', type: 'text', required: false },
    ]);
  });
});
