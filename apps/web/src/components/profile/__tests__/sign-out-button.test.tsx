import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignOutButton } from '../sign-out-button';

/**
 * Sair da conta pergunta antes (como no app) e, ao confirmar, tira este
 * navegador dos avisos com a sessão ainda viva, antes de ir ao handler de saída.
 */

const unsubscribeWebPush = vi.hoisted(() => vi.fn());
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, notificationsApi: { unsubscribeWebPush } };
});

const assign = vi.fn();
const browserUnsubscribe = vi.fn(async () => true);
const order: string[] = [];

beforeEach(() => {
  order.length = 0;
  unsubscribeWebPush.mockImplementation(async () => {
    order.push('api');
    return { removed: true };
  });
  assign.mockImplementation(() => order.push('sign-out'));
  vi.stubGlobal('location', { ...window.location, assign });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => ({
        pushManager: {
          getSubscription: async () => ({
            endpoint: 'https://fcm.googleapis.com/x',
            unsubscribe: browserUnsubscribe,
          }),
        },
      }),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('SignOutButton', () => {
  it('pergunta antes de sair, e cancelar não sai', async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);
    await user.click(screen.getByRole('button', { name: 'Sair da conta' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Você vai precisar entrar de novo para usar o Fatia.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(assign).not.toHaveBeenCalled();
    expect(unsubscribeWebPush).not.toHaveBeenCalled();
  });

  it('ao confirmar, sai dos avisos deste navegador e depois da conta', async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);
    await user.click(screen.getByRole('button', { name: 'Sair da conta' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/api/logto/sign-out'));
    expect(unsubscribeWebPush).toHaveBeenCalledWith('https://fcm.googleapis.com/x');
    expect(browserUnsubscribe).toHaveBeenCalled();
    expect(order).toEqual(['api', 'sign-out']);
  });

  it('sai da conta mesmo se a API dos avisos falhar', async () => {
    unsubscribeWebPush.mockRejectedValue(new Error('fora do ar'));
    const user = userEvent.setup();
    render(<SignOutButton />);
    await user.click(screen.getByRole('button', { name: 'Sair da conta' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/api/logto/sign-out'));
  });
});
