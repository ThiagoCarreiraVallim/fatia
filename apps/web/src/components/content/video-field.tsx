'use client';

import { useId, useRef, useState } from 'react';
import { Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, formatBytes, uploadMedia, VIDEO_MIMES, videoProblem } from '@fatia/api-client';
import { Button } from '@/components/ui/button';

export interface VideoValue {
  fileId: string;
  url: string | null;
}

/**
 * `PUT` com progresso. O `fetch` não conta bytes enviados, e um vídeo de
 * 150 MB sem barra parece travado.
 */
export function putWithProgress(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
    xhr.onerror = () => reject(new Error('O envio do vídeo caiu.'));
    xhr.send(body);
  });
}

/**
 * O vídeo do tutorial: vai direto do navegador ao bucket (ADR 028), sem
 * conversão, e só abre por URL assinada.
 */
export function VideoField({
  groupId,
  value,
  onChange,
}: {
  groupId: string;
  value: VideoValue | null;
  onChange: (next: VideoValue | null) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState<number | null>(null);

  async function enviar(file: File) {
    const problema = videoProblem(file);
    if (problema) {
      toast(problema);
      return;
    }
    setProgresso(0);
    try {
      const view = await uploadMedia(
        { purpose: 'exercise_video', groupId, mime: file.type, bytes: file.size },
        (url, headers) => putWithProgress(url, file, headers, setProgresso),
      );
      onChange({ fileId: view.id, url: view.url });
    } catch (err) {
      toast(
        err instanceof ApiError && err.status === 503
          ? 'O envio de vídeos não está disponível agora.'
          : err instanceof ApiError && err.status === 400 && err.message
            ? err.message
            : 'Não deu para enviar o vídeo. Tente de novo.',
      );
    } finally {
      setProgresso(null);
      if (input.current) input.current.value = '';
    }
  }

  const enviando = progresso !== null;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        Vídeo
      </label>
      {value?.url && (
        <video
          src={value.url}
          controls
          playsInline
          preload="metadata"
          aria-label="Vídeo do tutorial"
          className="aspect-video w-full max-w-md rounded-xl border border-subtle bg-black"
        />
      )}
      {enviando ? (
        <div className="max-w-md space-y-1" role="status">
          <div
            role="progressbar"
            aria-label="Enviando o vídeo"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progresso * 100)}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary" style={{ width: `${progresso * 100}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Enviando… {Math.round(progresso * 100)}%</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            <Video className="h-4 w-4" aria-hidden />
            {value ? 'Trocar vídeo' : 'Escolher vídeo'}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Tirar vídeo
            </Button>
          )}
        </div>
      )}
      <input
        ref={input}
        id={id}
        type="file"
        accept={VIDEO_MIMES.join(',')}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            toast(`Enviando ${formatBytes(file.size)}. Não feche a página.`);
            void enviar(file);
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        MP4 ou MOV até 200 MB. O vídeo vai como foi gravado: prefira trechos curtos.
      </p>
    </div>
  );
}
