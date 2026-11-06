import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { podeEscoar, useFilaDeMensagens } from '../fila';

function montar(inicial: { conversa?: string; livre?: boolean } = {}) {
  const enviar = vi.fn();
  const hook = renderHook(
    ({ conversa, livre }: { conversa: string; livre: boolean }) =>
      useFilaDeMensagens({ conversa, livre, enviar }),
    { initialProps: { conversa: inicial.conversa ?? 'c1', livre: inicial.livre ?? false } },
  );
  return { ...hook, enviar };
}

describe('podeEscoar', () => {
  it('só com a conversa livre: sem resposta correndo, sem pausa e já aberta', () => {
    expect(podeEscoar({ rodando: false, pausado: false, abrindo: false })).toBe(true);
    expect(podeEscoar({ rodando: true, pausado: false, abrindo: false })).toBe(false);
    // A pausa segura a fila: a mensagem dela abandonaria a confirmação aberta.
    expect(podeEscoar({ rodando: false, pausado: true, abrindo: false })).toBe(false);
    expect(podeEscoar({ rodando: false, pausado: false, abrindo: true })).toBe(false);
  });
});

describe('useFilaDeMensagens', () => {
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
});
