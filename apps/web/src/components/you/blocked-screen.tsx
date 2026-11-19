'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserX } from 'lucide-react';
import { blocksApi, relativeTime, type BlockedUser } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

export const BLOCKS_KEY = ['blocks'] as const;

/**
 * Pessoas bloqueadas (Você > Conta). O bloqueio vale em todas as comunidades;
 * desbloquear devolve os posts, comentários e reações dos dois lados.
 */
export function BlockedScreen() {
  const qc = useQueryClient();
  const [alvo, setAlvo] = useState<BlockedUser | null>(null);
  const lista = useQuery({ queryKey: BLOCKS_KEY, queryFn: () => blocksApi.list() });
  const desbloquear = useMutation({
    mutationFn: (b: BlockedUser) => blocksApi.unblock(b.id),
    onSuccess: (_, b) => {
      setAlvo(null);
      toast(`${b.label} desbloqueado(a).`);
      void qc.invalidateQueries({ queryKey: BLOCKS_KEY });
      void qc.invalidateQueries({ queryKey: ['community'] });
    },
    onError: () => toast('Não deu para desbloquear agora.'),
  });

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 pt-4">
      <p className="text-sm text-muted-foreground">
        Quem você bloqueou não vê seus posts, comentários e reações, e você não vê os dela, em
        nenhuma comunidade. A pessoa não é avisada.
      </p>
      {lista.isPending && <Skeleton className="h-24 rounded-2xl bg-card" />}
      {lista.isError && (
        <EmptyState
          title="Não deu para carregar"
          action={
            <Button variant="outline" onClick={() => void lista.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {lista.data && lista.data.length === 0 && (
        <EmptyState
          icon={UserX}
          title="Ninguém bloqueado"
          description="Para bloquear, use o menu de um post ou comentário no mural."
        />
      )}
      {lista.data && lista.data.length > 0 && (
        <ul aria-label="Pessoas bloqueadas" className="flex flex-col gap-2">
          {lista.data.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-3 rounded-card bg-card px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-foreground">{b.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {[b.groupName, `bloqueado ${relativeTime(b.createdAt)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <Button variant="outline" size="sm" onClick={() => setAlvo(b)}>
                Desbloquear
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={alvo !== null}
        onOpenChange={(o) => !o && setAlvo(null)}
        title={alvo ? `Desbloquear ${alvo.label}?` : ''}
        description="Vocês voltam a ver os posts, comentários e reações um do outro nas comunidades em comum."
        confirmLabel="Desbloquear"
        pending={desbloquear.isPending}
        onConfirm={() => alvo && desbloquear.mutate(alvo)}
      />
    </div>
  );
}
