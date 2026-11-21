import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, uploadMedia: vi.fn() };
});

import { uploadMedia } from '@fatia/api-client';
import { VideoField } from '../video-field';

const mp4 = () => new File(['x'], 'agachamento.mp4', { type: 'video/mp4' });

describe('VideoField: o vídeo do exercício vai até 60 s (#408)', () => {
  afterEach(() => vi.clearAllMocks());

  it('vídeo de 75 s nem sobe', async () => {
    render(
      <VideoField groupId="g1" value={null} onChange={vi.fn()} readSeconds={async () => 75} />,
    );
    fireEvent.change(screen.getByLabelText('Vídeo'), { target: { files: [mp4()] } });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('O vídeo vai até 60 s. Corte e envie de novo.'),
    );
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it('sem duração lida, sobe e a API confere', async () => {
    vi.mocked(uploadMedia).mockResolvedValue({ id: 'f1', url: 'https://x/f1' } as never);
    const onChange = vi.fn();
    render(
      <VideoField
        groupId="g1"
        value={null}
        onChange={onChange}
        readSeconds={async () => Number.NaN}
      />,
    );
    fireEvent.change(screen.getByLabelText('Vídeo'), { target: { files: [mp4()] } });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ fileId: 'f1', url: 'https://x/f1' }),
    );
  });
});
