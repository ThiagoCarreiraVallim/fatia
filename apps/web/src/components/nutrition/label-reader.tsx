'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Camera, Lock } from 'lucide-react';
import {
  ApiError,
  aiLock,
  customFoodFormFromLabel,
  nutritionApi,
  planHref,
  type CustomFoodForm,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { AiConsentCard } from '@/components/chat/aceite';

/** Foto → JPEG em base64, no máximo 1600 px no lado maior: o rótulo tem letra miúda. */
async function labelPhotoToBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1] ?? '';
}

export const LABEL_STATUS_KEY = ['nutrition', 'photo-recognition'] as const;

/** Se a aba "Rótulo" aparece: some sem IA no servidor, como a foto do prato. */
export function useLabelReading() {
  const status = useQuery({
    queryKey: LABEL_STATUS_KEY,
    queryFn: () => nutritionApi.photoRecognitionStatus(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return aiLock(status.data);
}

interface Props {
  /** O código lido antes, quando o produto não estava em lugar nenhum. */
  barcode?: string;
  locked: boolean;
  /** Os valores lidos, para conferir no formulário de alimento próprio. Nada foi salvo. */
  onRead: (form: CustomFoodForm) => void;
}

/**
 * Ler a tabela nutricional por foto (#375, Al-N11 pela câmera). A IA só
 * devolve os valores; quem salva é a pessoa, depois de conferir. A foto não é
 * guardada em lugar nenhum (ADR 017).
 */
export function LabelReader({ barcode = '', locked, onRead }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [planRequired, setPlanRequired] = useState(false);
  const [consentRequired, setConsentRequired] = useState(false);

  const read = useMutation({
    mutationFn: async (file: File) => nutritionApi.readLabel(await labelPhotoToBase64(file)),
    onSuccess: (reading) => onRead(customFoodFormFromLabel(reading, barcode)),
    onError: (error) => {
      if (error instanceof ApiError && error.isPlanRequired) setPlanRequired(true);
      if (error instanceof ApiError && error.isAiConsentRequired) setConsentRequired(true);
    },
  });

  if (locked || planRequired) {
    return (
      <div className="my-3 space-y-3 rounded-2xl bg-card p-4 text-center">
        <Lock size={20} className="mx-auto text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Ler o rótulo pela foto é do plano PRO</p>
        <p className="text-xs text-muted-foreground">
          No Free, digite os valores da tabela: dá o mesmo resultado.
        </p>
        <Button asChild className="w-full">
          <Link href={planHref('foto')}>Ver o plano PRO</Link>
        </Button>
      </div>
    );
  }

  if (consentRequired) {
    // Sem o aceite da IA a foto nem sai (403): aceitar e fotografar de novo.
    return (
      <AiConsentCard
        className="mx-0 my-3"
        onDecline={() => {
          setConsentRequired(false);
          read.reset();
        }}
        onAccepted={() => {
          setConsentRequired(false);
          read.reset();
        }}
      />
    );
  }

  const failure =
    read.error &&
    !(
      read.error instanceof ApiError &&
      (read.error.isPlanRequired || read.error.isAiConsentRequired)
    )
      ? read.error instanceof ApiError && read.error.status !== 500
        ? read.error.message
        : 'Não deu para ler o rótulo. Tente outra foto, com a tabela inteira e sem reflexo.'
      : null;

  return (
    <div className="my-3 space-y-3">
      <div className="rounded-2xl bg-card p-4 text-sm">
        <p className="font-medium">Fotografe a tabela nutricional</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A IA lê os valores e você confere antes de salvar. A foto não fica guardada.
        </p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Foto do rótulo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) read.mutate(file);
        }}
      />
      {failure && (
        <p role="alert" className="rounded-lg bg-muted px-3 py-3 text-sm">
          {failure}
        </p>
      )}
      <Button
        className="min-h-12 w-full"
        disabled={read.isPending}
        onClick={() => fileRef.current?.click()}
      >
        <Camera size={18} aria-hidden />
        {read.isPending
          ? 'Lendo o rótulo...'
          : failure
            ? 'Tentar outra foto'
            : 'Tirar foto do rótulo'}
      </Button>
    </div>
  );
}
