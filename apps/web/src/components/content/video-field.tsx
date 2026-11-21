'use client';

import { useId, useRef, useState } from 'react';
import { Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  formatBytes,
  uploadMedia,
  VIDEO_MIMES,
  videoDurationProblem,
  videoProblem,
} from '@fatia/api-client';
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
 * A duração pelo próprio navegador, antes de subir 200 MB à toa. `NaN` quando
 * não deu para ler (formato que o navegador não abre, jsdom): a API confere no
 * confirm, pelo `mvhd`.
 */
export function readVideoSeconds(file: File): Promise<number> {
  if (typeof URL.createObjectURL !== 'function') return Promise.resolve(Number.NaN);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (seconds: number) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    const timer = setTimeout(() => done(Number.NaN), 5000);
    video.preload = 'metadata';
    video.onloadedmetadata = () => done(video.duration);
    video.onerror = () => done(Number.NaN);
    video.src = url;
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
  readSeconds = readVideoSeconds,
  hint = 'MP4 ou MOV, até 60 s e 200 MB.',
}: {
  groupId: string;
  value: VideoValue | null;
  onChange: (next: VideoValue | null) => void;
  /** Para o teste: o jsdom não lê vídeo. */
  readSeconds?: (file: File) => Promise<number>;
  hint?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function upload(file: File) {
    const problem = videoProblem(file) ?? videoDurationProblem(await readSeconds(file));
    if (problem) {
      toast(problem);
      if (input.current) input.current.value = '';
      return;
    }
    toast(`Enviando ${formatBytes(file.size)}. Não feche a página.`);
    setProgress(0);
    try {
      const view = await uploadMedia(
        { purpose: 'exercise_video', groupId, mime: file.type, bytes: file.size },
        (url, headers) => putWithProgress(url, file, headers, setProgress),
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
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }

  const uploading = progress !== null;

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
      {uploading ? (
        <div className="max-w-md space-y-1" role="status">
          <div
            role="progressbar"
            aria-label="Enviando o vídeo"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Enviando… {Math.round(progress * 100)}%</p>
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
          if (file) void upload(file);
        }}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
