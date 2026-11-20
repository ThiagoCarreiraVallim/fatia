'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  contentApi,
  groupCan,
  sendsApi,
  sentLine,
  sentProgressLine,
  sentStatus,
  type SentItem,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { useOrgGroup } from '@/components/org/org-shell';
import { PanelPageHead, StatusChip } from '@/components/org/panel-bits';
import { apiErrorText } from '@/components/org/seat-forms';
import { SendPlanForm } from '@/components/org/send-plan-form';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Enviar para alunos (#405, Pn-18): o plano da biblioteca vira uma cópia para
 * cada pessoa escolhida, que aceita na aba Para você. Hábito, questionário e
 * recomendação aparecem desligados até as issues deles (#390/#391).
 */
export default function OrgSendPage() {
  const g = useOrgGroup();
  const plans = useQuery({
    queryKey: orgKeys.contentPlans(g.id),
    queryFn: () => contentApi.plans(g.id),
  });

  if (!groupCan(g, 'member.plans')) {
    return (
      <EmptyState
        title="Só o dono e os profissionais enviam planos"
        description="Peça ao dono da comunidade se precisar mandar um plano para alguém."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PanelPageHead
        title="Enviar para alunos"
        subtitle="Chega na aba Para você do aluno e no Hoje. Cada pessoa aceita no app."
      />
      {plans.isPending ? (
        <Skeleton className="h-96 rounded-2xl bg-card" />
      ) : plans.isError ? (
        <EmptyState
          title="Não deu para carregar a biblioteca"
          action={
            <Button variant="outline" onClick={() => plans.refetch()}>
              Tentar novamente
            </Button>
          }
        />
      ) : (
        <SendPlanForm
          groupId={g.id}
          templates={plans.data}
          aside={<RecentlySent groupId={g.id} />}
        />
      )}
    </div>
  );
}

function RecentlySent({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const [revoking, setRevoking] = useState<SentItem | null>(null);
  const list = useQuery({
    queryKey: orgKeys.sends(groupId),
    queryFn: () => sendsApi.list(groupId),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => sendsApi.revoke(groupId, id),
    onSuccess: () => {
      setRevoking(null);
      toast('Envio cancelado.');
      void qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });
    },
    onError: (err) => toast(apiErrorText(err, 'Não deu para cancelar agora.')),
  });

  return (
    <section aria-labelledby="enviados" className="space-y-2">
      <h2 id="enviados" className="text-sm font-semibold">
        Enviados recentemente
      </h2>
      {list.isPending ? (
        <Skeleton className="h-24 rounded-2xl bg-card" />
      ) : list.isError ? (
        <p className="text-sm text-warning">Não deu para carregar os envios.</p>
      ) : list.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Você ainda não enviou planos por aqui.</p>
      ) : (
        <ul
          aria-label="Enviados recentemente"
          className="divide-y divide-subtle rounded-2xl border border-subtle bg-card"
        >
          {list.data.items.map((i) => {
            const st = sentStatus(i.status);
            const progress = sentProgressLine(i);
            return (
              <li key={i.id} className="space-y-1 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <b className="min-w-0 flex-1 truncate text-sm">{i.title}</b>
                  <StatusChip label={st.label} tone={st.tone} />
                </div>
                <p className="text-xs text-muted-foreground">{sentLine(i)}</p>
                {progress && <p className="text-xs font-medium">{progress}</p>}
                {i.canRevoke && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 px-2 text-xs"
                    aria-label={`Cancelar envio para ${i.name}`}
                    onClick={() => setRevoking(i)}
                  >
                    Cancelar envio
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Cancelar este envio?"
        description="A pessoa deixa de ver o plano em Para você. Dá para enviar de novo depois."
        confirmLabel="Cancelar envio"
        pendingLabel="Cancelando…"
        pending={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </section>
  );
}
