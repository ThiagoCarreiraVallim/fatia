'use client';

import { useId, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  IMAGE_MIMES,
  imageProblem,
  MAX_GUIDE_PHOTOS,
  uploadMedia,
  type MediaPurpose,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import type { ImageValue } from './image-field';

/**
 * Até quatro fotos, na ordem em que foram escolhidas: as do tutorial (Fase 7b)
 * e as do post no mural (Fase 8b).
 */
export function PhotosField({
  groupId,
  value,
  onChange,
  purpose = 'exercise_photo',
  max = MAX_GUIDE_PHOTOS,
  label = 'Fotos',
  listLabel = 'Fotos do tutorial',
  addLabel = 'Adicionar fotos',
  hint = `Até ${MAX_GUIDE_PHOTOS} fotos, JPEG, PNG ou WebP. Localização e dados da câmera são apagados.`,
}: {
  groupId: string;
  value: ImageValue[];
  onChange: (next: ImageValue[]) => void;
  purpose?: MediaPurpose;
  max?: number;
  label?: string;
  listLabel?: string;
  addLabel?: string;
  hint?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const cheio = value.length >= max;

  async function enviar(files: File[]) {
    const vagas = files.slice(0, max - value.length);
    if (vagas.length < files.length) toast(`Até ${max} imagens.`);
    setEnviando(true);
    const novas: ImageValue[] = [];
    try {
      for (const file of vagas) {
        const problema = imageProblem(file);
        if (problema) {
          toast(problema);
          continue;
        }
        const view = await uploadMedia(
          { purpose, groupId, mime: file.type, bytes: file.size },
          (url, headers) => fetch(url, { method: 'PUT', body: file, headers }),
        );
        novas.push({ fileId: view.id, url: view.url });
      }
    } catch (err) {
      toast(
        err instanceof ApiError && err.status === 503
          ? 'O envio de imagens não está disponível agora.'
          : 'Não deu para enviar a foto. Tente de novo.',
      );
    } finally {
      if (novas.length) onChange([...value, ...novas]);
      setEnviando(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {value.length > 0 && (
        <ul className="grid max-w-md grid-cols-2 gap-2 sm:grid-cols-4" aria-label={listLabel}>
          {value.map((f, i) => (
            <li key={f.fileId} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta, fora do otimizador */}
              <img
                src={f.url ?? undefined}
                alt={`Foto ${i + 1}`}
                className="aspect-square w-full rounded-xl border border-subtle object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x.fileId !== f.fileId))}
                aria-label={`Tirar a foto ${i + 1}`}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!cheio && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={enviando}
          onClick={() => input.current?.click()}
        >
          <ImagePlus className="h-4 w-4" aria-hidden />
          {enviando ? 'Enviando…' : addLabel}
        </Button>
      )}
      <input
        ref={input}
        id={id}
        type="file"
        multiple
        accept={IMAGE_MIMES.join(',')}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void enviar(files);
        }}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
