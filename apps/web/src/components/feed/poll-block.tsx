'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import {
  feedApi,
  pollClosesLabel,
  pollResultNote,
  type Post,
  type PollView,
} from '@fatia/api-client';
import { communityKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { apiMessage } from './feed-ui';

/**
 * A enquete no mural (pranchas Cm-21, 21b, 21c e 21d). Antes de votar, as
 * opções são botões; depois, barras com as % que a API mandar. Com menos de 5
 * votos a API não manda nem o total, e a tela diz por quê.
 */
export function PollBlock({
  groupId,
  post,
  poll,
}: {
  groupId: string;
  post: Post;
  poll: PollView;
}) {
  const qc = useQueryClient();
  const recarregar = () => void qc.invalidateQueries({ queryKey: communityKeys.feed(groupId) });
  const votar = useMutation({
    mutationFn: (optionId: string | null) => feedApi.vote(groupId, post.id, optionId),
    onSuccess: recarregar,
    onError: (err) => toast(apiMessage(err, 'Não deu para votar agora.')),
  });
  const encerrar = useMutation({
    mutationFn: () => feedApi.closePoll(groupId, post.id),
    onSuccess: () => {
      toast('Enquete encerrada.');
      recarregar();
    },
    onError: (err) => toast(apiMessage(err, 'Não deu para encerrar agora.')),
  });

  const votando = !poll.closed && !poll.myOptionId;
  const ocupado = votar.isPending || encerrar.isPending;

  return (
    <section aria-label={`Enquete: ${poll.question}`} className="space-y-3">
      <p className="font-semibold">{poll.question}</p>
      {votando ? (
        <div role="group" aria-label="Opções" className="grid gap-2">
          {poll.options.map((o) => (
            <Button
              key={o.id}
              variant="outline"
              className="justify-start"
              disabled={ocupado}
              onClick={() => votar.mutate(o.id)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      ) : (
        <ul aria-label="Resultado" className="grid gap-2">
          {poll.options.map((o) => {
            const minha = poll.myOptionId === o.id;
            return (
              <li
                key={o.id}
                className={cn(
                  'relative overflow-hidden rounded-xl border px-3 py-2 text-sm',
                  minha ? 'border-primary' : 'border-subtle',
                )}
              >
                {o.percent !== null && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-primary/15"
                    style={{ width: `${o.percent}%` }}
                  />
                )}
                <span className="relative flex items-center justify-between gap-2">
                  <span className={cn(minha && 'font-semibold')}>
                    {o.label}
                    {minha && <span className="sr-only"> (seu voto)</span>}
                  </span>
                  {o.percent !== null && (
                    <span className="tabular-nums text-muted-foreground">{o.percent}%</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {pollResultNote(poll)} · {pollClosesLabel(poll)}
      </p>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Lock size={12} aria-hidden />
        Seu voto é anônimo · Ninguém vê em quem você votou, nem a equipe.
      </p>
      {(poll.myOptionId && !poll.closed) || (poll.canClose && !poll.closed) ? (
        <div className="flex flex-wrap gap-2">
          {poll.myOptionId && !poll.closed && (
            <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => votar.mutate(null)}>
              Mudar voto
            </Button>
          )}
          {poll.canClose && !poll.closed && (
            <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => encerrar.mutate()}>
              Encerrar enquete
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
