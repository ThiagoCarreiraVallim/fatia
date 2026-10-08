'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, Trash2 } from 'lucide-react';
import { deleteChatMemory, listChatMemories, type ChatMemory } from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { ghostButton } from '@/components/elements/surfaces';
import { CHAVE_DAS_MEMORIAS } from './chat-runtime-provider';

/**
 * O que o assistente guardou sobre a pessoa, com o apagar à mão.
 *
 * Guardar só acontece pelo chat, e com confirmação (`save_memory` é confirmável,
 * ADR 022). Esquecer pode ser pelo chat ou aqui — aqui sem cartão, porque o
 * toque duplo já é a confirmação, como na gaveta de conversas.
 */

function Item({ memoria }: { memoria: ChatMemory }) {
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const esquecer = useMutation({
    mutationFn: () => deleteChatMemory(memoria.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CHAVE_DAS_MEMORIAS }),
  });

  return (
    <li className="flex items-start gap-2 rounded-lg px-2 py-2">
      <p className="min-w-0 flex-1 text-sm text-foreground">{memoria.content}</p>
      <button
        type="button"
        aria-label={confirmando ? 'Confirmar: esquecer' : `Esquecer: ${memoria.content}`}
        disabled={esquecer.isPending}
        onClick={() => (confirmando ? esquecer.mutate() : setConfirmando(true))}
        onBlur={() => setConfirmando(false)}
        className={cn(
          ghostButton,
          'shrink-0 rounded p-1.5',
          confirmando ? 'text-rose-500' : 'text-foreground/50',
        )}
      >
        {confirmando ? (
          <span className="text-xs font-semibold">Esquecer?</span>
        ) : (
          <Trash2 size={14} aria-hidden />
        )}
      </button>
    </li>
  );
}

export function GavetaDeMemorias() {
  const [visivel, setVisivel] = useState(false);
  const {
    data: memorias = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: CHAVE_DAS_MEMORIAS,
    queryFn: listChatMemories,
    enabled: visivel,
  });

  return (
    <Drawer open={visivel} onOpenChange={setVisivel}>
      <DrawerTrigger
        aria-label="Memórias do assistente"
        className={cn(ghostButton, 'rounded-full p-2 text-foreground/70')}
      >
        <Brain size={20} aria-hidden />
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>O que o assistente lembra</DrawerTitle>
          <DrawerDescription>
            Peça no chat para lembrar de uma preferência ou restrição. Entra em toda conversa.
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-2 pb-6">
          {isLoading ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Carregando…</p>
          ) : isError ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Não deu para carregar agora.</p>
          ) : memorias.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Nada guardado ainda.</p>
          ) : (
            <ul aria-label="Memórias">
              {memorias.map((memoria) => (
                <Item key={memoria.id} memoria={memoria} />
              ))}
            </ul>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
