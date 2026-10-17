'use client';

import { useId, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  IMAGE_MIMES,
  imageProblem,
  uploadMedia,
  type MediaPurpose,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';

export interface ImageValue {
  fileId: string;
  url: string | null;
}

/**
 * Escolher e enviar uma imagem da comunidade. O arquivo vai direto do
 * navegador ao bucket pela URL assinada; a API só registra e confirma
 * (ADR 028). O item que usa a imagem guarda o `fileId` ao salvar.
 */
export function ImageField({
  groupId,
  purpose = 'group_content',
  label,
  value,
  onChange,
  aspect = 'aspect-video',
}: {
  groupId: string;
  purpose?: MediaPurpose;
  label: string;
  value: ImageValue | null;
  onChange: (next: ImageValue | null) => void;
  aspect?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(file: File) {
    const problema = imageProblem(file);
    if (problema) {
      toast(problema);
      return;
    }
    setEnviando(true);
    try {
      const view = await uploadMedia(
        { purpose, groupId, mime: file.type, bytes: file.size },
        (url, headers) => fetch(url, { method: 'PUT', body: file, headers }),
      );
      onChange({ fileId: view.id, url: view.url });
    } catch (err) {
      toast(
        err instanceof ApiError && err.status === 503
          ? 'O envio de imagens não está disponível agora.'
          : 'Não deu para enviar a imagem. Tente de novo.',
      );
    } finally {
      setEnviando(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {value?.url ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta, fora do otimizador */}
          <img
            src={value.url}
            alt=""
            className={`${aspect} w-full max-w-sm rounded-xl border border-subtle object-cover`}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={enviando}
              onClick={() => input.current?.click()}
            >
              Trocar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Tirar imagem
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={enviando}
          onClick={() => input.current?.click()}
        >
          <ImagePlus className="h-4 w-4" aria-hidden />
          {enviando ? 'Enviando…' : 'Escolher imagem'}
        </Button>
      )}
      <input
        ref={input}
        id={id}
        type="file"
        accept={IMAGE_MIMES.join(',')}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void enviar(file);
        }}
      />
      <p className="text-xs text-muted-foreground">
        JPEG, PNG ou WebP até 10 MB. Localização e dados da câmera são apagados.
      </p>
    </div>
  );
}
