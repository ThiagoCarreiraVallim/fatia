import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mesmo dublê do `food-search-drawer.test.tsx`: o vaul chama
// `setPointerCapture`, que o jsdom não implementa, e nada do que se testa aqui
// depende do arrasto. `open` continua governando a montagem do conteúdo, que é a
// única coisa do drawer que importa para estes casos.
vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DrawerClose: Passthrough,
  };
});

import { EditHeightDrawer } from '../edit-height-drawer';

/**
 * O que este arquivo protege é o momento em que o campo é preenchido.
 *
 * A #187 tirou o `useEffect(..., [open, currentHeightCm])` daqui e pôs um ajuste
 * durante o render. A troca tem uma armadilha: o efeito rodava **também** na
 * montagem, e o ajuste durante o render só roda quando a comparação com o estado
 * anterior acusa diferença. Semear esse estado anterior com os valores atuais —
 * que é a forma mais natural de escrever — faz o drawer montado já aberto nascer
 * com o campo vazio, silenciosamente. Daí a semente ser "fechado, sem estatura",
 * e daí estes testes.
 *
 * Dez drawers no web e no mobile passaram pela mesma conversão; este é o que tem
 * o caso das duas dependências.
 */
function renderDrawer(props: { open: boolean; currentHeightCm: number | null }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EditHeightDrawer onClose={() => undefined} {...props} />
    </QueryClientProvider>,
  );
}

const field = () => screen.getByLabelText('Altura (cm)') as HTMLInputElement;

describe('EditHeightDrawer', () => {
  it('monta já aberto com a estatura atual no campo', () => {
    renderDrawer({ open: true, currentHeightCm: 182 });
    // `toBe` e não `toContain`: '182'.includes('8') passaria com o campo errado.
    expect(field().value).toBe('182');
  });

  it('monta já aberto sem estatura cadastrada com o campo vazio', () => {
    renderDrawer({ open: true, currentHeightCm: null });
    expect(field().value).toBe('');
  });

  it('preenche o campo quando a estatura chega com o drawer já aberto', () => {
    // O drawer aberto enquanto `users/me` ainda carrega: `currentHeightCm` chega
    // `null` e vira número depois, com `open` parado em `true`. É o único caso
    // que exige a **segunda** dependência da comparação — só com `previous.open
    // !== open` o campo ficaria vazio para sempre.
    const { rerender } = renderDrawer({ open: true, currentHeightCm: null });
    expect(field().value).toBe('');

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <EditHeightDrawer open onClose={() => undefined} currentHeightCm={182} />
      </QueryClientProvider>,
    );
    expect(field().value).toBe('182');
  });

  it('preenche o campo ao abrir depois de montado fechado', () => {
    const { rerender } = renderDrawer({ open: false, currentHeightCm: 175 });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <EditHeightDrawer open onClose={() => undefined} currentHeightCm={175} />
      </QueryClientProvider>,
    );
    expect(field().value).toBe('175');
  });

  it('não atropela o que a pessoa digitou enquanto o drawer segue aberto', async () => {
    const user = userEvent.setup();
    const { rerender } = renderDrawer({ open: true, currentHeightCm: 182 });

    await user.clear(field());
    await user.type(field(), '184');
    expect(field().value).toBe('184');

    // Um re-render do pai com as mesmas props não pode reespelhar o valor antigo:
    // nada mudou, então o ajuste durante o render não tem de entrar. É o laço que
    // uma comparação mal feita criaria.
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <EditHeightDrawer open onClose={() => undefined} currentHeightCm={182} />
      </QueryClientProvider>,
    );
    expect(field().value).toBe('184');
  });
});
