import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { failedQuestion, canDrainQueue, useMessageQueue } from '../fila';

type Props = { conversa: string; livre: boolean; falhou?: boolean };

function montar(inicial: { conversa?: string; livre?: boolean } = {}) {
  const enviar = vi.fn();
  const hook = renderHook(
    ({ conversa, livre, falhou }: Props) =>
      useMessageQueue({ conversa, livre, enviar, falhou: falhou ?? false }),
    {
      initialProps: {
        conversa: inicial.conversa ?? 'c1',
        livre: inicial.livre ?? false,
      } as Props,
    },
  );
  return { ...hook, enviar };
}

describe('canDrainQueue', () => {
  it('só com a conversa livre: sem resposta correndo, sem pausa e já aberta', () => {
    expect(canDrainQueue({ rodando: false, pausado: false, abrindo: false })).toBe(true);
    expect(canDrainQueue({ rodando: true, pausado: false, abrindo: false })).toBe(false);
    // A pausa segura a fila: a mensagem dela abandonaria a confirmação aberta.
    expect(canDrainQueue({ rodando: false, pausado: true, abrindo: false })).toBe(false);
    expect(canDrainQueue({ rodando: false, pausado: false, abrindo: true })).toBe(false);
  });

  it('enquanto o servidor ainda fecha a resposta parada, a fila espera', () => {
    expect(canDrainQueue({ rodando: false, pausado: false, abrindo: false, parando: true })).toBe(
      false,
    );
  });
});

describe('useMessageQueue', () => {
  it('guarda o que foi escrito durante a resposta e manda quando ela termina', () => {
    const { result, rerender, enviar } = montar();

    act(() => result.current.enfileirar('  e o jantar?  '));
    expect(result.current.itens.map((i) => i.texto)).toEqual(['e o jantar?']);
    expect(enviar).not.toHaveBeenCalled();

    rerender({ conversa: 'c1', livre: true });

    expect(enviar).toHaveBeenCalledExactlyOnceWith('e o jantar?');
    expect(result.current.itens).toEqual([]);
  });

  it('manda uma por vez: a segunda espera a resposta da primeira', () => {
    const { result, rerender, enviar } = montar();
    act(() => {
      result.current.enfileirar('primeira');
      result.current.enfileirar('segunda');
    });

    rerender({ conversa: 'c1', livre: true });
    expect(enviar.mock.calls).toEqual([['primeira']]);

    // A primeira saiu e a resposta dela começou: a conversa não está livre.
    rerender({ conversa: 'c1', livre: false });
    expect(enviar).toHaveBeenCalledTimes(1);

    rerender({ conversa: 'c1', livre: true });
    expect(enviar.mock.calls).toEqual([['primeira'], ['segunda']]);
  });

  it('tirar da fila descarta sem mandar', () => {
    const { result, rerender, enviar } = montar();
    act(() => result.current.enfileirar('desisti'));

    act(() => result.current.tirar(result.current.itens[0].id));
    rerender({ conversa: 'c1', livre: true });

    expect(enviar).not.toHaveBeenCalled();
  });

  it('trocar de conversa descarta a fila, que era do assunto anterior', () => {
    const { result, rerender, enviar } = montar();
    act(() => result.current.enfileirar('sobre a conversa 1'));

    rerender({ conversa: 'c2', livre: true });

    expect(result.current.itens).toEqual([]);
    expect(enviar).not.toHaveBeenCalled();
  });

  it('texto vazio não entra', () => {
    const { result } = montar();
    act(() => result.current.enfileirar('   '));
    expect(result.current.itens).toEqual([]);
  });

  it('depois de uma resposta que falhou, a fila para: nada sai sozinho', () => {
    const { result, rerender, enviar } = montar();
    act(() => {
      result.current.enfileirar('primeira');
      result.current.enfileirar('segunda');
    });

    rerender({ conversa: 'c1', livre: true, falhou: true });

    expect(enviar).not.toHaveBeenCalled();
    expect(result.current.parada).toBe(true);
    expect(result.current.itens.map((i) => i.texto)).toEqual(['primeira', 'segunda']);
  });

  it('parada, "Enviar" manda só aquele item; "Descartar" tira sem mandar', () => {
    const { result, rerender, enviar } = montar();
    act(() => {
      result.current.enfileirar('primeira');
      result.current.enfileirar('segunda');
    });
    rerender({ conversa: 'c1', livre: true, falhou: true });

    act(() => result.current.mandar(result.current.itens[1].id));
    expect(enviar.mock.calls).toEqual([['segunda']]);
    expect(result.current.itens.map((i) => i.texto)).toEqual(['primeira']);

    act(() => result.current.tirar(result.current.itens[0].id));
    expect(result.current.itens).toEqual([]);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});

describe('failedQuestion', () => {
  const m = (id: string, role: 'user' | 'assistant', texto: string) => ({
    id,
    role,
    content: [{ type: 'text' as const, text: texto }],
  });
  const conversa = [
    m('u1', 'user', 'quanto comi?'),
    m('a1', 'assistant', ''),
    m('u2', 'user', 'e de proteína?'),
    m('a2', 'assistant', 'ok'),
  ];

  it('a resposta que falhou reenvia a pergunta dela, e não a última da conversa', () => {
    expect(failedQuestion(conversa, 'a1')).toBe('quanto comi?');
    expect(failedQuestion(conversa, 'a2')).toBe('e de proteína?');
  });

  it('sem mensagem (o erro do turno no fim), é a última pergunta', () => {
    expect(failedQuestion(conversa)).toBe('e de proteína?');
    expect(failedQuestion([])).toBe('');
  });
});
