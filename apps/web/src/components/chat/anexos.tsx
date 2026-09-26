'use client';

import { useEffect, useMemo } from 'react';
import Image from 'next/image';
import { XIcon } from 'lucide-react';
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState,
} from '@assistant-ui/react';
import { cn } from '@/lib/utils';
import { field } from '@/components/elements/surfaces';

/**
 * A miniatura de uma foto do turno: do arquivo escolhido enquanto está no
 * composer, da parte de imagem recodificada depois de enviada. Nenhuma das duas
 * sai desta aba — depois de recarregar, a fala mostra só o aviso de que a foto
 * existiu (`AVISO_DE_FOTO`).
 */
function Miniatura({ className }: { className?: string }) {
  const arquivo = useAuiState((s) => s.attachment.file);
  const enviada = useAuiState((s) => {
    const parte = s.attachment.content?.find((p) => p.type === 'image');
    return parte && parte.type === 'image' ? parte.image : undefined;
  });
  const local = useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : undefined), [arquivo]);
  useEffect(
    () => () => {
      if (local) URL.revokeObjectURL(local);
    },
    [local],
  );

  const src = enviada ?? local;
  if (!src) return <div className={cn(field, 'rounded-lg', className)} aria-hidden />;
  return (
    <Image
      src={src}
      alt="Foto anexada"
      width={64}
      height={64}
      unoptimized
      className={cn('rounded-lg object-cover', className)}
    />
  );
}

/** As fotos escolhidas, acima do campo, com o botão de tirar cada uma. */
export function AnexosDoComposer() {
  const tem = useAuiState((s) => s.composer.attachments.length > 0);
  if (!tem) return null;
  return (
    <div className="flex gap-2" aria-label="Fotos anexadas">
      <ComposerPrimitive.Attachments>
        {() => (
          <AttachmentPrimitive.Root className="relative">
            <Miniatura className="size-16" />
            <AttachmentPrimitive.Remove
              aria-label="Tirar foto"
              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background"
            >
              <XIcon size={12} aria-hidden />
            </AttachmentPrimitive.Remove>
          </AttachmentPrimitive.Root>
        )}
      </ComposerPrimitive.Attachments>
    </div>
  );
}

/** As fotos na bolha da pessoa, enquanto a conversa está aberta nesta aba. */
export function AnexosDaMensagem() {
  return (
    <div className="flex justify-end gap-2">
      <MessagePrimitive.Attachments>
        {() => (
          <AttachmentPrimitive.Root>
            <Miniatura className="size-24" />
          </AttachmentPrimitive.Root>
        )}
      </MessagePrimitive.Attachments>
    </div>
  );
}
