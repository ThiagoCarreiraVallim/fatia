import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SessionSet } from '@fatia/api-client';
import { SetChips } from '../set-chips';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, usersApi: { ...actual.usersApi, me: vi.fn(() => new Promise(() => {})) } };
});

function set(n: number): SessionSet {
  return {
    id: `s${n}`,
    sessionId: 'sessao',
    exerciseId: 1,
    setNumber: n,
    weightKg: 55,
    reps: 11,
    rpe: 7,
    durationSeconds: null,
    distanceMeters: null,
    avgHeartRate: null,
    kcalBurned: null,
    notes: null,
  } as SessionSet;
}

// Sem layout no jsdom: a faixa tem 300 px e cada chip 100 px com 8 de vão,
// lidos do `data-chip` de cada um.
const CHIP = 100;
const GAP = 8;
let scrollTo: ReturnType<typeof vi.fn>;
const original = {
  rect: HTMLElement.prototype.getBoundingClientRect,
  scrollTo: HTMLElement.prototype.scrollTo,
};

beforeEach(() => {
  scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const i = this.dataset.chip;
    const left = i == null ? 0 : Number(i) * (CHIP + GAP);
    const width = i == null ? 300 : CHIP;
    return {
      left,
      right: left + width,
      width,
      top: 0,
      bottom: 40,
      height: 40,
      x: left,
      y: 0,
    } as DOMRect;
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return this.tagName === 'UL' ? 300 : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() {
      return this.tagName === 'UL' ? 4 * CHIP + 3 * GAP : 0;
    },
  });
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = original.rect;
  HTMLElement.prototype.scrollTo = original.scrollTo;
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
});

function renderChips(done: number) {
  const client = new QueryClient();
  const ui = (n: number) => (
    <QueryClientProvider client={client}>
      <SetChips
        sessionId="sessao"
        sets={Array.from({ length: n }, (_, i) => set(i + 1))}
        isCardio={false}
        targetSets={4}
        onAll={() => undefined}
      />
    </QueryClientProvider>
  );
  const view = render(ui(done));
  return { rerender: (n: number) => view.rerender(ui(n)) };
}

describe('SetChips — o chip da vez sempre à vista (pedido do dono)', () => {
  it('na série 4 de 4 a faixa rola até o "4 agora", sem precisar do "Todas"', () => {
    renderChips(3);
    // O 4º chip vai de 324 a 424; a faixa mostra 300: rola até o fim (124).
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 124, behavior: 'smooth' });
  });

  it('acompanha a cada série registrada', () => {
    const { rerender } = renderChips(0);
    // "1 agora" já está à vista: não rola.
    expect(scrollTo).not.toHaveBeenCalled();
    rerender(3);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 124, behavior: 'smooth' });
  });
});
