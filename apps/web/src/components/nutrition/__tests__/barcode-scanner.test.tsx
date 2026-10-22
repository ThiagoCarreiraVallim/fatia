import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BarcodeScanner } from '../barcode-scanner';

vi.mock('@/lib/barcode-reader', () => ({ startBarcodeReader: vi.fn() }));

import { startBarcodeReader } from '@/lib/barcode-reader';

const startReader = vi.mocked(startBarcodeReader);
const originalMediaDevices = navigator.mediaDevices;
const originalSecure = window.isSecureContext;

function setCamera(getUserMedia: (() => Promise<MediaStream>) | undefined) {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: getUserMedia ? { getUserMedia } : undefined,
    configurable: true,
  });
}

describe('BarcodeScanner', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', { value: originalSecure, configurable: true });
  });

  it('sem acesso à câmera no navegador, diz isso e deixa digitar', async () => {
    setCamera(undefined);
    const onCode = vi.fn();
    const user = userEvent.setup();
    render(<BarcodeScanner onCode={onCode} />);

    expect(
      await screen.findByText('Este navegador não dá acesso à câmera. Digite o código.'),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Digitar o código'), '7891 000 100103');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(onCode).toHaveBeenCalledWith('7891000100103', 'typed');
  });

  it('permissão negada vira instrução, não erro técnico', async () => {
    setCamera(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    render(<BarcodeScanner onCode={vi.fn()} />);

    expect(await screen.findByText(/Sem permissão para usar a câmera/)).toBeInTheDocument();
  });

  it('código lido pela câmera chega marcado como da câmera', async () => {
    const stop = vi.fn();
    setCamera(() => Promise.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream));
    let detected: ((code: string) => void) | undefined;
    startReader.mockImplementation(async (_video, onCode) => {
      detected = onCode;
      return { stop: vi.fn() };
    });
    const onCode = vi.fn();
    render(<BarcodeScanner onCode={onCode} />);

    expect(await screen.findByText('Enquadre as barras na moldura.')).toBeInTheDocument();
    detected?.('7891000100103');

    expect(onCode).toHaveBeenCalledWith('7891000100103', 'camera');
  });

  it('ao sair, desliga a câmera e o leitor', async () => {
    const stopTrack = vi.fn();
    const stopReader = vi.fn();
    setCamera(() =>
      Promise.resolve({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream),
    );
    startReader.mockResolvedValue({ stop: stopReader });
    const { unmount } = render(<BarcodeScanner onCode={vi.fn()} />);

    await screen.findByText('Enquadre as barras na moldura.');
    unmount();

    await waitFor(() => expect(stopTrack).toHaveBeenCalled());
    expect(stopReader).toHaveBeenCalled();
  });
});
