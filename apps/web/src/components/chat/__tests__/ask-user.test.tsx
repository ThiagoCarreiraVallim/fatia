import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatConfirmAction, ChatInterruptValue } from '@fatia/api-client';
import { AskUser, normalizarCampos } from '../ask-user';

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

  it('"Confirmar" recebe o foco: quem usa teclado estava no campo de texto', () => {
    const pausa: ChatInterruptValue = { kind: 'confirm', prompt: 'x', actions: [escrita('c1')] };
    render(<AskUser pausa={pausa} ocupado={false} onResponder={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus();
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
