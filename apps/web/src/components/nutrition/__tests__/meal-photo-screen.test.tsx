import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MealRecognition } from '@fatia/api-client';

const rec: MealRecognition = {
  observacao: null,
  photoFileId: 'foto-1',
  itens: [
    {
      nomeReconhecido: 'arroz',
      foodId: 1,
      nomeDoCatalogo: 'Arroz, tipo 1, cozido',
      grams: 120,
      confidence: 0.9,
      estimado: false,
      kcal: 150,
      proteinG: 3,
      carbsG: 33,
      fatG: 0.3,
    },
    {
      nomeReconhecido: 'feijão',
      foodId: 2,
      nomeDoCatalogo: 'Feijão, carioca, cozido',
      grams: 80,
      confidence: 0.8,
      estimado: false,
      kcal: 60,
      proteinG: 4,
      carbsG: 11,
      fatG: 0.4,
    },
  ],
};

const h = vi.hoisted(() => ({
  consent: { chat: { accepted: true }, webSearch: { accepted: false }, webSearchEnabled: false },
  keep: true as boolean | null,
  getAiConsent: vi.fn(),
  acceptAiConsent: vi.fn(),
  me: vi.fn(),
  updateMe: vi.fn(),
  recognize: vi.fn(),
  createMeal: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    getAiConsent: h.getAiConsent,
    acceptAiConsent: h.acceptAiConsent,
    usersApi: { ...actual.usersApi, me: h.me, updateMe: h.updateMe },
    nutritionApi: {
      ...actual.nutritionApi,
      recognizeMealPhoto: h.recognize,
      createMeal: h.createMeal,
    },
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push, back: vi.fn() }) }));
vi.mock('@/components/chat/foto', () => ({
  recodificarFoto: vi.fn(async (b: Blob) => b),
}));

const { MealPhotoScreen } = await import('../meal-photo-screen');
const { ApiError } = await import('@fatia/api-client');

beforeEach(() => {
  vi.clearAllMocks();
  h.getAiConsent.mockImplementation(async () => h.consent);
  h.acceptAiConsent.mockImplementation(async () => ({
    ...h.consent,
    chat: { accepted: true },
  }));
  h.me.mockImplementation(async () => ({ id: 'u1', keepMealPhotos: h.keep }));
  h.updateMe.mockImplementation(async (b: { keepMealPhotos: boolean }) => ({
    id: 'u1',
    keepMealPhotos: b.keepMealPhotos,
  }));
  h.recognize.mockResolvedValue(rec);
  h.createMeal.mockResolvedValue({ id: 'meal-1' });
  global.URL.createObjectURL = vi.fn(() => 'blob:foto');
  global.URL.revokeObjectURL = vi.fn();
});

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MealPhotoScreen />
    </QueryClientProvider>,
  );
}

async function escolherFoto(user: ReturnType<typeof userEvent.setup>) {
  const foto = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'prato.jpg', { type: 'image/jpeg' });
  await user.upload(await screen.findByLabelText('Escolher foto do prato'), foto);
}

describe('foto do prato no PWA (Al-M12 e Al-M10, por arquivo)', () => {
  it('antes da primeira foto diz o provedor; o aceite libera e a revisão grava só o marcado', async () => {
    h.consent = { ...h.consent, chat: { accepted: false } };
    const user = userEvent.setup();
    montar();
    await escolherFoto(user);

    expect(await screen.findByText(/A foto vai para o OpenRouter/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Como tratamos seus dados' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    await user.click(screen.getByRole('button', { name: 'Concordo e usar foto' }));
    await waitFor(() => expect(h.acceptAiConsent).toHaveBeenCalledWith('chat'));

    expect(await screen.findByText(/Achei 2 itens no seu prato/)).toBeInTheDocument();
    expect(
      screen.getByText('A porção costuma errar 20–30%. Ajuste antes de gravar.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Total: 210 kcal')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /feijão/ }));
    expect(screen.getByLabelText('Total: 150 kcal')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mais 10 g de arroz' }));
    expect(
      within(screen.getByRole('listitem', { name: /arroz/ })).getByText('130 g'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Gravar no / }));
    await waitFor(() => expect(h.createMeal).toHaveBeenCalled());
    const corpo = h.createMeal.mock.calls[0]![0];
    expect(corpo.photoFileId).toBe('foto-1');
    expect(corpo.items).toEqual([{ foodId: 1, grams: 130, source: 'AI' }]);
    h.consent = { ...h.consent, chat: { accepted: true } };
  });

  it('na primeira foto pergunta se guarda; "Agora não" grava a escolha e a foto é descartada', async () => {
    h.keep = null;
    const user = userEvent.setup();
    montar();
    await escolherFoto(user);
    await user.click(await screen.findByRole('button', { name: 'Usar foto' }));

    expect(await screen.findByText('Guardar as fotos das refeições?')).toBeInTheDocument();
    expect(h.recognize).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Agora não' }));

    await waitFor(() => expect(h.updateMe).toHaveBeenCalledWith({ keepMealPhotos: false }));
    await waitFor(() => expect(h.recognize).toHaveBeenCalled());
    expect(
      await screen.findByText('Fotos das refeições: não guardadas. Esta foi descartada.'),
    ).toBeInTheDocument();
    h.keep = true;
  });

  it('o 403 do aceite traz o aviso do provedor de volta, em vez de um erro', async () => {
    h.recognize.mockRejectedValueOnce(new ApiError('aceite', 403, { code: 'AI_CONSENT_REQUIRED' }));
    const user = userEvent.setup();
    montar();
    await escolherFoto(user);
    await user.click(await screen.findByRole('button', { name: 'Usar foto' }));

    expect(await screen.findByRole('button', { name: 'Concordo e usar foto' })).toBeInTheDocument();
    expect(screen.getByText(/A foto vai para o OpenRouter/)).toBeInTheDocument();
  });
});
