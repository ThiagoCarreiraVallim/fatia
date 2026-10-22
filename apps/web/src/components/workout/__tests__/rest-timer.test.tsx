import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RestTimer } from '../rest-timer';
import { useRestTimer } from '../use-rest-timer';

/**
 * Os controles do descanso que vieram do app: `+30s`, pausar, retomar e pular.
 *
 * Relógio falso porque a contagem vem de `Date.now()` contra um instante-alvo,
 * e o que se afirma aqui é justamente o número que sobra depois de cada toque.
 * `fireEvent` e não `userEvent`: este não anda com o relógio falso sozinho.
 */
function Harness({ idleSeconds }: { idleSeconds?: number }) {
  const timer = useRestTimer();
  return <RestTimer timer={timer} idleSeconds={idleSeconds} />;
}

const shown = (text: string) => expect(screen.getByText(text)).toBeInTheDocument();
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('RestTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parado, mostra o descanso prescrito e começa por ele', () => {
    render(<Harness idleSeconds={120} />);
    shown('02:00');
    expect(screen.queryByRole('button', { name: 'Pular descanso' })).toBeNull();

    press('Iniciar descanso');
    advance(10_000);
    shown('01:50');
  });

  it('+30s soma ao que falta, sem recomeçar a contagem', () => {
    render(<Harness idleSeconds={90} />);
    press('Iniciar descanso');
    advance(10_000);
    shown('01:20');

    press('Somar 30 segundos ao descanso');
    shown('01:50');
    advance(5_000);
    shown('01:45');
  });

  it('pausado, o tempo não corre; retomado, continua de onde parou', () => {
    render(<Harness idleSeconds={60} />);
    press('Iniciar descanso');
    advance(15_000);
    shown('00:45');

    press('Pausar descanso');
    advance(30_000);
    shown('00:45');

    press('Retomar descanso');
    advance(5_000);
    shown('00:40');
  });

  it('pular encerra o descanso e volta ao mostrador parado', () => {
    render(<Harness idleSeconds={90} />);
    press('Iniciar descanso');
    advance(20_000);

    press('Pular descanso');
    shown('01:30');
    expect(screen.getByRole('button', { name: 'Iniciar descanso' })).toBeInTheDocument();
  });

  it('avisa o fim pela região viva e trava o pausar no zero', () => {
    render(<Harness idleSeconds={30} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    press('Iniciar descanso');
    advance(31_000);

    shown('00:00');
    expect(screen.getByRole('status')).toHaveTextContent('Descanso terminado');
    expect(screen.getByRole('button', { name: 'Retomar descanso' })).toBeDisabled();
    // Ainda dá para esticar: quem não terminou de beber água ganha mais meio
    // minuto, e o descanso volta a correr sem pedir um "retomar".
    press('Somar 30 segundos ao descanso');
    shown('00:30');
    advance(5_000);
    shown('00:25');
  });
});
