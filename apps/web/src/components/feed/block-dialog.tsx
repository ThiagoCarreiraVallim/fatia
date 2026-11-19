'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { blocksApi } from '@fatia/api-client';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { apiMessage } from './feed-ui';

/**
 * "Bloquear" (prancha Cm-07): vale em todas as comunidades e nos dois
 * sentidos; a outra pessoa não é avisada. Desfaz em Você > Conta.
 */
export function BlockDialog({
  groupId,
  postId,
  commentId,
  name,
  onClose,
}: {
  groupId: string;
  postId: string;
  commentId?: string;
  name: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const bloquear = useMutation({
    mutationFn: () => blocksApi.block({ groupId, postId, commentId: commentId ?? null }),
    onSuccess: () => {
      toast(`${name} bloqueado(a). Dá para desfazer em Você, na seção Conta.`);
      onClose();
      // O bloqueio vale em todas as comunidades: tudo de comunidade recarrega.
      void qc.invalidateQueries({ queryKey: ['community'] });
      void qc.invalidateQueries({ queryKey: ['blocks'] });
    },
    onError: (err) => toast(apiMessage(err, 'Não deu para bloquear agora.')),
  });
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Bloquear ${name}?`}
      description={`Você deixa de ver os posts, comentários e reações de ${name} em todas as comunidades, e ${name} deixa de ver os seus. Ninguém é avisado. Dá para desfazer em Você, na seção Conta.`}
      confirmLabel="Bloquear"
      pending={bloquear.isPending}
      onConfirm={() => bloquear.mutate()}
    />
  );
}
