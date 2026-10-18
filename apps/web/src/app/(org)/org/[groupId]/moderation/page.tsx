'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import {
  ApiError,
  moderationApi,
  orgApi,
  POST_POLICY_LABEL,
  relativeTime,
  REPORT_REASON_LABEL,
  reportSummary,
  type PostPolicy,
  type ReportQueueItem,
} from '@fatia/api-client';
import { communityKeys, orgKeys } from '@/components/community/query-keys';
import { useOrgGroup } from '@/components/org/org-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

const POLITICAS: PostPolicy[] = ['ALL_MEMBERS', 'TEAM_ONLY'];

/**
 * Moderação do mural (Fase 8b, ADR 032): quem publica, a fila de denúncias, os
 * removidos dos últimos 30 dias e os banidos. Só o dono abre esta seção.
 */
export default function OrgModerationPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const [banir, setBanir] = useState<ReportQueueItem | null>(null);

  const fila = useQuery({
    queryKey: orgKeys.reports(g.id),
    queryFn: () => moderationApi.reports(g.id),
  });
  const removidos = useQuery({
    queryKey: orgKeys.removedPosts(g.id),
    queryFn: () => moderationApi.removed(g.id),
  });
  const banidos = useQuery({
    queryKey: orgKeys.bans(g.id),
    queryFn: () => moderationApi.bans(g.id),
  });
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: orgKeys.moderation(g.id) });
    void qc.invalidateQueries({ queryKey: communityKeys.feed(g.id) });
  };

  const politica = useMutation({
    mutationFn: (postPolicy: PostPolicy) => orgApi.update(g.id, { postPolicy }),
    onSuccess: () => {
      toast('Regra do mural salva.');
      void qc.invalidateQueries({ queryKey: orgKeys.group(g.id) });
      void qc.invalidateQueries({ queryKey: communityKeys.feed(g.id) });
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para salvar agora.')),
  });
  const resolver = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'remove' | 'dismiss' }) =>
      moderationApi.resolve(g.id, id, action),
    onSuccess: (_, { action }) => {
      toast(action === 'remove' ? 'Removido do mural.' : 'Denúncia descartada. O post continua.');
      recarregar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para resolver agora.')),
  });
  const restaurar = useMutation({
    mutationFn: (id: string) => moderationApi.restorePost(g.id, id),
    onSuccess: () => {
      toast('Post de volta ao mural.');
      recarregar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para restaurar agora.')),
  });
  const ban = useMutation({
    mutationFn: (membershipId: string) => moderationApi.ban(g.id, membershipId),
    onSuccess: () => {
      setBanir(null);
      toast('Pessoa banida. Ela saiu da comunidade e não entra de novo.');
      recarregar();
      void qc.invalidateQueries({ queryKey: orgKeys.members(g.id) });
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para banir agora.')),
  });
  const desbanir = useMutation({
    mutationFn: (membershipId: string) => moderationApi.unban(g.id, membershipId),
    onSuccess: () => {
      toast('Banimento desfeito. A pessoa pode pedir para entrar de novo.');
      recarregar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para desfazer agora.')),
  });

  return (
    <div className="max-w-3xl space-y-6">
      <section className="space-y-2" aria-labelledby="quem-publica">
        <h2 id="quem-publica" className="text-sm font-semibold">
          Quem publica no mural
        </h2>
        <div role="radiogroup" aria-labelledby="quem-publica" className="flex flex-wrap gap-2">
          {POLITICAS.map((p) => (
            <Button
              key={p}
              role="radio"
              aria-checked={g.postPolicy === p}
              variant={g.postPolicy === p ? 'default' : 'outline'}
              size="sm"
              disabled={politica.isPending}
              onClick={() => g.postPolicy !== p && politica.mutate(p)}
            >
              {POST_POLICY_LABEL[p]}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Reagir, comentar e denunciar fica aberto a todos os membros nas duas opções.
        </p>
      </section>

      <section className="space-y-2" aria-labelledby="denuncias">
        <h2 id="denuncias" className="text-sm font-semibold">
          Denúncias
        </h2>
        {fila.isPending ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : fila.data?.length ? (
          <ul className="space-y-2" aria-label="Denúncias abertas">
            {fila.data.map((item) => (
              <li
                key={item.reportId}
                className="space-y-2 rounded-2xl border border-subtle bg-card p-4"
              >
                <p className="text-xs font-semibold text-danger">{reportSummary(item)}</p>
                <p className="text-xs text-muted-foreground">
                  {`${item.commentId ? 'Comentário' : 'Post'} de ${item.author.displayName}${
                    item.author.team ? ' (equipe)' : ''
                  } · ${relativeTime(item.firstReportedAt)}`}
                </p>
                <blockquote className="whitespace-pre-line border-l-2 border-subtle pl-3 text-sm">
                  {item.excerpt || '(só imagens)'}
                </blockquote>
                {item.images > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {item.images === 1 ? 'Com 1 imagem.' : `Com ${item.images} imagens.`}
                  </p>
                )}
                {item.notes.length > 0 && (
                  <ul className="space-y-1 text-xs text-muted-foreground" aria-label="Observações">
                    {item.notes.map((n, i) => (
                      <li key={i}>“{n}”</li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-danger"
                    disabled={resolver.isPending}
                    onClick={() => resolver.mutate({ id: item.reportId, action: 'remove' })}
                  >
                    Remover
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolver.isPending}
                    onClick={() => resolver.mutate({ id: item.reportId, action: 'dismiss' })}
                  >
                    Manter
                  </Button>
                  {!item.author.team && (
                    <Button size="sm" variant="ghost" onClick={() => setBanir(item)}>
                      {`Banir ${item.author.displayName}`}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title="Nenhuma denúncia aberta"
            description="Quando alguém denunciar um post ou comentário, aparece aqui, sem o nome de quem denunciou."
          />
        )}
      </section>

      <section className="space-y-2" aria-labelledby="removidos">
        <h2 id="removidos" className="text-sm font-semibold">
          Removidos nos últimos 30 dias
        </h2>
        {removidos.data?.length ? (
          <ul
            className="divide-y rounded-2xl border border-subtle bg-card"
            aria-label="Posts removidos"
          >
            {removidos.data.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0 space-y-1 text-sm">
                  <span className="block truncate">{p.excerpt || '(só imagens)'}</span>
                  <span className="block text-xs text-muted-foreground">
                    {`${p.author.displayName} · ${
                      p.reason ? REPORT_REASON_LABEL[p.reason] : 'sem motivo'
                    } · ${relativeTime(p.removedAt)}`}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={restaurar.isPending}
                  onClick={() => restaurar.mutate(p.id)}
                >
                  Restaurar
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nada removido.</p>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="banidos">
        <h2 id="banidos" className="text-sm font-semibold">
          Banidos
        </h2>
        {banidos.data?.length ? (
          <ul
            className="divide-y rounded-2xl border border-subtle bg-card"
            aria-label="Pessoas banidas"
          >
            {banidos.data.map((b) => (
              <li
                key={b.membershipId}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="text-sm">
                  {b.name}
                  {b.displayName && (
                    <span className="text-xs text-muted-foreground">{` · ${b.displayName}`}</span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={desbanir.isPending}
                  onClick={() => desbanir.mutate(b.membershipId)}
                >
                  Desfazer
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Ninguém banido.</p>
        )}
      </section>

      <ConfirmDialog
        open={banir !== null}
        onOpenChange={(o) => !o && setBanir(null)}
        title={`Banir ${banir?.author.displayName ?? ''}?`}
        description="A pessoa sai da comunidade, a equipe perde o acesso ao que ela compartilhava, e o código e os convites não a deixam voltar. Os posts dela continuam até você remover."
        confirmLabel="Banir"
        pendingLabel="Banindo..."
        pending={ban.isPending}
        onConfirm={() => banir && ban.mutate(banir.author.membershipId)}
      />
    </div>
  );
}
