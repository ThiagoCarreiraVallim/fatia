'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  approvalResume,
  getConversation,
  listConversations,
  openInterrupt,
  pendingCardMode,
  previewChatAction,
  streamChat,
  textoDeErroDoChat,
  undoableWrite,
  undoWrite,
  type ChatStreamError,
  type ChatStreamFrame,
  type UndoableWrite,
} from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { toastDuration } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { AI_WAITING_KEY } from './use-ai-state';

/**
 * Responde à pausa com "Gravar assim" e lê o stream até o fim. Lança o erro
 * do turno, se houve: 409 quando a conversa andou desde a pausa (o agente
 * confere o `interruptId`), cota, rede. Devolve o registro criado, quando dá
 * para desfazê-lo (`undoableWrite`).
 */
async function approve(
  conversationId: string,
  resume: ReturnType<typeof approvalResume>,
  toolCallId: string | undefined,
): Promise<UndoableWrite | null> {
  let error: ChatStreamError | null = null;
  const frames: ChatStreamFrame[] = [];
  for await (const frame of streamChat({ conversationId, resume })) {
    if (frame.event === 'error') error = frame.data as ChatStreamError;
    else if (frame.event === 'updates') frames.push(frame);
  }
  if (error) throw new Error(textoDeErroDoChat(error));
  return toolCallId ? undoableWrite(frames, toolCallId) : null;
}

/**
 * "Fatia · esperando você" (prancha `Al-H6c8`): a escrita que a IA pausou para
 * confirmar, fora da conversa, acima da barra. Só aprova com a prévia
 * **inteira** no cartão e uma escrita só (`pendingCardMode`, ADR 039 §6); fora
 * disso o botão principal vira "Abrir conversa". "Lembrar depois" esconde o
 * cartão desta pausa até a próxima.
 *
 * Depois de gravar, o aviso "Almoço gravado" traz "Desfazer" (5 s): o id do
 * registro vem no resultado da tool, no próprio stream do turno, e o desfazer
 * apaga pelo endpoint do recurso, que confere o dono pelo token.
 */
export function AiPendingCard({ enabled, bottom }: { enabled: boolean; bottom: number }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  const waiting = useQuery({
    queryKey: AI_WAITING_KEY,
    queryFn: () => listConversations({ state: 'waiting', limit: 1 }),
    enabled,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const conversationId = waiting.data?.[0]?.id;
  const conversation = useQuery({
    queryKey: [...AI_WAITING_KEY, conversationId],
    queryFn: () => getConversation(conversationId!),
    enabled: enabled && Boolean(conversationId),
    retry: false,
  });
  const interrupt = conversation.data ? openInterrupt(conversation.data) : null;
  const action = interrupt?.value.actions[0];
  const confirm = action?.kind === 'confirm' ? action : null;
  const preview = useQuery({
    queryKey: ['chat', 'preview', interrupt?.id],
    queryFn: () => previewChatAction(confirm!.tool, confirm!.arguments),
    enabled: Boolean(confirm) && interrupt!.value.actions.length === 1,
    retry: false,
    staleTime: Infinity,
  });

  const save = useMutation({
    mutationFn: () => approve(conversationId!, approvalResume(interrupt!), confirm?.toolCallId),
    onSuccess: (written) => {
      void qc.invalidateQueries();
      if (!written) {
        toast(`Gravado: ${confirm?.title ?? 'registro'}`, { duration: toastDuration(false) });
        return;
      }
      toast(written.message, {
        duration: toastDuration(true),
        action: {
          label: 'Desfazer',
          onClick: () => {
            undoWrite(written)
              .then(() => {
                void qc.invalidateQueries();
                toast('Desfeito', { duration: toastDuration(false) });
              })
              .catch(() => toast.error('Não deu para desfazer.'));
          },
        },
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });

  if (!enabled || !conversationId || !interrupt || dismissed.has(interrupt.id)) return null;

  const mode = save.isError ? 'open' : pendingCardMode(interrupt.value, preview.data);
  const title = conversation.data?.title ?? 'Conversa';
  const openConversation = () => router.push(`/chat/${conversationId}`);
  const lines = preview.data?.linhas ?? [];

  return (
    <div
      role="status"
      aria-label="Fatia esperando você"
      style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom))` }}
      className="anim-up fixed inset-x-4 z-50 mx-auto flex max-w-md flex-col gap-3 rounded-3xl bg-card p-3.5 shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.45),0_16px_30px_-12px_rgba(0,0,0,0.8)] md:hidden"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Icon name="spark" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted-foreground">Fatia · esperando você</p>
          <p className="text-[15px] font-bold text-foreground">{interrupt.value.prompt || title}</p>
        </div>
        <button
          type="button"
          aria-label="Lembrar depois"
          onClick={() => setDismissed((s) => new Set(s).add(interrupt.id))}
          className="-me-1.5 -mt-1.5 flex h-11 w-11 items-center justify-center rounded-full text-faint"
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      {mode === 'approve' && lines.length > 0 && (
        <dl className="rounded-2xl bg-muted px-3 py-0.5">
          {lines.map((l, i) => (
            <div
              key={`${l.rotulo}-${i}`}
              className={cn(
                'flex min-h-9 items-center justify-between gap-3',
                i > 0 && 'shadow-[inset_0_1px_0_hsl(var(--border))]',
              )}
            >
              <dt className="text-[13px] text-muted-foreground">{l.rotulo}</dt>
              <dd className="text-right text-[13px] font-semibold tabular-nums text-foreground">
                {l.valor}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {save.isError && (
        <p role="alert" className="text-sm text-danger">
          {save.error instanceof Error ? save.error.message : 'Não deu para gravar.'}
        </p>
      )}

      <div className="flex gap-2">
        {mode === 'approve' ? (
          <>
            <button
              type="button"
              onClick={openConversation}
              className="anim-press h-11 flex-1 rounded-full bg-foreground text-sm font-bold text-background"
            >
              Responder
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className="anim-press h-11 rounded-full bg-muted px-5 text-sm font-bold text-foreground disabled:opacity-60"
            >
              {save.isPending ? 'Gravando…' : 'Gravar assim'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={openConversation}
            className="anim-press h-11 flex-1 rounded-full bg-foreground text-sm font-bold text-background"
          >
            Abrir conversa
          </button>
        )}
      </div>
    </div>
  );
}
