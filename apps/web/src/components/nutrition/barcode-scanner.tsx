'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { isValidBarcode } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { startBarcodeReader, type BarcodeReader } from '@/lib/barcode-reader';

export type BarcodeSource = 'camera' | 'typed';

interface Props {
  onCode: (code: string, source: BarcodeSource) => void;
}

type CameraState = { kind: 'starting' } | { kind: 'on' } | { kind: 'off'; message: string };

function cameraMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Sem permissão para usar a câmera. Libere nas configurações do navegador ou digite o código.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Nenhuma câmera encontrada. Digite o código que está embaixo das barras.';
  }
  if (name === 'NotReadableError') {
    return 'A câmera está em uso por outro app. Feche-o ou digite o código.';
  }
  return 'Não foi possível abrir a câmera. Digite o código que está embaixo das barras.';
}

/**
 * Câmera apontada para a embalagem, com o código digitado sempre à mão.
 *
 * O campo não é plano B escondido: código amassado, câmera de notebook sem foco
 * e navegador sem permissão são o caso comum na web, e nenhum deles deveria
 * travar o registro.
 */
export function BarcodeScanner({ onCode }: Props) {
  const id = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  // O laço da câmera vive mais que um render: a ref evita reabrir a câmera a cada
  // `onCode` novo que o pai passar.
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });
  const [camera, setCamera] = useState<CameraState>({ kind: 'starting' });
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let reader: BarcodeReader | null = null;

    const start = async () => {
      if (!window.isSecureContext) {
        setCamera({ kind: 'off', message: 'A câmera só abre em conexão segura (https).' });
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera({
          kind: 'off',
          message: 'Este navegador não dá acesso à câmera. Digite o código.',
        });
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        const video = videoRef.current;
        if (cancelled || !video) return;
        video.srcObject = stream;
        await video.play();
        const started = await startBarcodeReader(video, (code) =>
          onCodeRef.current(code, 'camera'),
        );
        if (cancelled) {
          started.stop();
          return;
        }
        reader = started;
        setCamera({ kind: 'on' });
      } catch (error) {
        if (!cancelled) setCamera({ kind: 'off', message: cameraMessage(error) });
      }
    };
    void start();

    return () => {
      cancelled = true;
      reader?.stop();
      // Sem isto a luz da câmera fica acesa depois que o drawer fecha.
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const code = typed.replace(/\s/g, '');
    if (!isValidBarcode(code)) {
      setTypedError('O código tem de 8 a 14 números.');
      return;
    }
    setTypedError(undefined);
    onCode(code, 'typed');
  };

  return (
    <div className="my-3 space-y-4">
      {camera.kind === 'off' ? (
        <p role="status" className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
          {camera.message}
        </p>
      ) : (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Câmera"
            className="aspect-[4/3] w-full object-cover"
          />
          {/* A mira diz onde pôr as barras; sem ela a pessoa afasta demais o celular. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80"
          />
          <p className="absolute inset-x-0 bottom-0 bg-black/50 px-3 py-2 text-center text-xs text-white">
            {camera.kind === 'starting' ? 'Abrindo a câmera...' : 'Enquadre as barras na moldura.'}
          </p>
        </div>
      )}

      <form onSubmit={submitTyped} noValidate className="space-y-1">
        <label htmlFor={`${id}-code`} className="text-sm font-medium">
          Digitar o código
        </label>
        <div className="flex gap-2">
          <Input
            id={`${id}-code`}
            inputMode="numeric"
            autoComplete="off"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              setTypedError(undefined);
            }}
            placeholder="Ex.: 7891000100103"
            maxLength={20}
            aria-invalid={typedError ? true : undefined}
            aria-describedby={typedError ? `${id}-code-erro` : undefined}
          />
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </div>
        {typedError && (
          <p id={`${id}-code-erro`} className="text-xs text-rose-500">
            {typedError}
          </p>
        )}
      </form>
    </div>
  );
}
