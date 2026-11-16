import { createDockStore, dockLayout } from '../session-dock-store';

describe('o "Concluir série" preso embaixo (#377, pedido do dono)', () => {
  it('a loja leva o botão do card para o rodapé e avisa quem desenha', () => {
    const store = createDockStore<string>();
    const seen: (string | null)[] = [];
    const off = store.subscribe(() => seen.push(store.get()));
    expect(store.get()).toBeNull();
    store.set('Concluir série 1');
    store.set('Concluir série 1'); // o mesmo de novo não redesenha
    store.set('Concluir série 2');
    store.set(null);
    off();
    store.set('depois de sair');
    expect(seen).toEqual(['Concluir série 1', 'Concluir série 2', null]);
  });

  it('o botão fica acima da área segura e o fim da rolagem reserva o espaço dele', () => {
    // Botão de 60 px, 16 px acima da área segura de 24 px.
    const withButton = dockLayout({ safeBottom: 24, dockHeight: 60 });
    expect(withButton.bottom).toBe(24 + 16);
    // O último item termina acima do botão, com folga: nada fica atrás dele.
    expect(withButton.scrollPaddingBottom).toBeGreaterThanOrEqual(24 + 16 + 60 + 16);
  });

  it('sem botão (descanso, escolha do próximo) a rolagem só respeita a área segura', () => {
    expect(dockLayout({ safeBottom: 24, dockHeight: 0 }).scrollPaddingBottom).toBe(24 + 32);
  });
});
