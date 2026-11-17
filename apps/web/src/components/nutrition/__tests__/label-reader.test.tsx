import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LabelReader } from '../label-reader';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    nutritionApi: { readLabel: vi.fn() },
    acceptAiConsent: vi.fn(),
    getAiConsent: vi.fn(),
  };
});

import {
  AI_CONSENT_TEXTS,
  ApiError,
  acceptAiConsent,
  getAiConsent,
  nutritionApi,
} from '@fatia/api-client';

const semAceite = () =>
  new ApiError('Aceite pendente', 403, { code: 'AI_CONSENT_REQUIRED', message: 'Aceite pendente' });

function renderReader() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LabelReader locked={false} onRead={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('LabelReader sem o aceite da IA', () => {
  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10 }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,AAA',
    );
    vi.mocked(nutritionApi.readLabel).mockReset().mockRejectedValue(semAceite());
    vi.mocked(getAiConsent).mockResolvedValue({
      chat: { accepted: false, version: 'v', acceptedAt: null },
      webSearch: { accepted: false, version: 'v', acceptedAt: null },
      webSearchEnabled: false,
      processor: { provider: 'OpenRouter', model: 'GLM 5.3 Flash, da Z.ai', searchEngine: 'Exa' },
    });
    vi.mocked(acceptAiConsent)
      .mockReset()
      .mockResolvedValue({
        chat: { accepted: true, version: 'v' },
        webSearch: { accepted: false, version: 'v' },
        webSearchEnabled: false,
      } as never);
  });

  it('o 403 AI_CONSENT_REQUIRED abre o aceite, e aceitar o fecha', async () => {
    renderReader();
    await userEvent.upload(
      screen.getByLabelText('Foto do rótulo'),
      new File(['x'], 'r.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByRole('dialog', { name: AI_CONSENT_TEXTS.chat.title })).toBeTruthy();
    expect(screen.queryByText('Aceite pendente')).toBeNull();
    expect(await screen.findByText(/GLM 5\.3 Flash/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: AI_CONSENT_TEXTS.chat.accept }));
    expect(acceptAiConsent).toHaveBeenCalledWith('chat');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
