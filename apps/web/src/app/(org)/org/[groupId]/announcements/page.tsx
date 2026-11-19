'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Megaphone, Vote } from 'lucide-react';
import {
  announcementsApi,
  announcementDeliveryLine,
  ApiError,
  feedApi,
  moderationApi,
  POLL_MAX_OPTIONS,
  POLL_MIN_VOTES,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  pollProblem,
  pollClosesLabel,
  type Announcement,
  type AnnouncementRepeat,
} from '@fatia/api-client';
import { communityKeys, orgKeys } from '@/components/community/query-keys';
import { AnnouncementEditor } from '@/components/org/announcement-editor';
import { useOrgGroup } from '@/components/org/org-shell';
import { useOptionalSidePanel } from '@/components/org/side-panel';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

const REPEAT_TEXT: Record<AnnouncementRepeat, string> = {
  NONE: '',
  DAILY: 'todo dia',
  WEEKLY: 'toda semana',
  MONTHLY: 'todo mês',
};

/** "Treino da semana · toda semana · 07:00 · notificação". */
function scheduledLine(a: Announcement): string {
  const quando = a.nextRunAt ? new Date(a.nextRunAt) : null;
  const hora = quando
    ? `${quando.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : '';
  return [
    REPEAT_TEXT[a.repeat],
    hora,
    a.push ? 'notificação' : 'só no mural',
    a.pin ? 'fixado' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const POLL_DAYS = [
  { value: '1', label: '1 dia' },
  { value: '3', label: '3 dias' },
  { value: '7', label: '1 semana' },
];

/** Nova enquete pelo painel (prancha Pn-26b): sai no mural em nome da comunidade. */
function NovaEnquete({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [pergunta, setPergunta] = useState('');
  const [opcoes, setOpcoes] = useState(['', '']);
  const [dias, setDias] = useState('3');
  const publicar = useMutation({
    mutationFn: () =>
      feedApi.create(groupId, {
        kind: 'POLL',
        publishedAs: 'GROUP',
        poll: {
          question: pergunta.trim(),
          options: opcoes.map((o) => o.trim()).filter(Boolean),
          days: Number(dias),
        },
      }),
    onSuccess: () => {
      toast('Enquete publicada no mural.');
      void qc.invalidateQueries({ queryKey: orgKeys.polls(groupId) });
      void qc.invalidateQueries({ queryKey: communityKeys.feed(groupId) });
      onDone();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para publicar a enquete agora.')),
  });
  const problema = pollProblem(pergunta, opcoes);
  return (
    <form
      aria-label="Nova enquete"
      className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problema) publicar.mutate();
      }}
    >
      <Input
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        maxLength={POLL_QUESTION_MAX}
        aria-label="Pergunta"
        placeholder="Pergunta"
      />
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground">
          Opções · de 2 a {POLL_MAX_OPTIONS}
        </legend>
        {opcoes.map((o, i) => (
          <Input
            key={i}
            value={o}
            onChange={(e) => setOpcoes(opcoes.map((x, j) => (j === i ? e.target.value : x)))}
            maxLength={POLL_OPTION_MAX}
            aria-label={`Opção ${i + 1}`}
            placeholder="Opção"
          />
        ))}
        {opcoes.length < POLL_MAX_OPTIONS && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpcoes([...opcoes, ''])}
          >
            Adicionar opção
          </Button>
        )}
      </fieldset>
      <Segmented label="Prazo" value={dias} options={POLL_DAYS} onChange={setDias} />
      <p className="text-xs text-muted-foreground">
        Em %, sem nomes. Com menos de {POLL_MIN_VOTES} votos o resultado fica oculto para todos,
        inclusive a equipe. O aluno pode mudar o voto até o prazo.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={Boolean(problema) || publicar.isPending}>
          Publicar no mural
        </Button>
      </div>
    </form>
  );
}

/**
 * Comunicados e enquetes (#394, pranchas Pn-14 e Pn-26): o dono e o
 * profissional mandam comunicados (agora ou agendados, com repetição) e
 * acompanham as enquetes. O resultado só aparece com 5 votos ou mais, para
 * todo mundo, inclusive a equipe.
 */
export default function OrgAnnouncementsPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<'announcement' | 'poll' | null>(null);
  const [cancelar, setCancelar] = useState<Announcement | null>(null);

  const painel = useOptionalSidePanel();
  const novoComunicado = () => {
    if (!painel) return setAberto('announcement');
    painel.open({
      title: 'Novo comunicado',
      subtitle: `Mural de ${g.name}`,
      body: <AnnouncementEditor group={g} onDone={painel.close} />,
    });
  };

  const recentes = useQuery({
    queryKey: orgKeys.announcementsRecent(g.id),
    queryFn: () => announcementsApi.recent(g.id),
  });
  const agendados = useQuery({
    queryKey: orgKeys.announcements(g.id),
    queryFn: () => announcementsApi.list(g.id),
  });
  const enquetes = useQuery({
    queryKey: orgKeys.polls(g.id),
    queryFn: () => moderationApi.polls(g.id),
  });
  const cancela = useMutation({
    mutationFn: (id: string) => announcementsApi.cancel(g.id, id),
    onSuccess: () => {
      setCancelar(null);
      toast('Comunicado cancelado. Nada mais sai dele.');
      void qc.invalidateQueries({ queryKey: orgKeys.announcements(g.id) });
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para cancelar agora.')),
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={novoComunicado} disabled={aberto !== null}>
          <Megaphone size={16} aria-hidden /> Novo comunicado
        </Button>
        <Button variant="outline" onClick={() => setAberto('poll')} disabled={aberto !== null}>
          <Vote size={16} aria-hidden /> Nova enquete
        </Button>
      </div>

      {aberto === 'announcement' && (
        <div className="overflow-hidden rounded-2xl border border-subtle bg-card">
          <AnnouncementEditor group={g} onDone={() => setAberto(null)} />
        </div>
      )}
      {aberto === 'poll' && <NovaEnquete groupId={g.id} onDone={() => setAberto(null)} />}

      <section className="space-y-2" aria-labelledby="agendados">
        <h2 id="agendados" className="text-sm font-semibold">
          Agendados
        </h2>
        {agendados.isPending ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : agendados.data?.length ? (
          <ul
            aria-label="Comunicados agendados"
            className="divide-y rounded-2xl border border-subtle bg-card"
          >
            {agendados.data.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-semibold">{a.title}</span>
                  <span className="block text-xs text-muted-foreground">{scheduledLine(a)}</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => setCancelar(a)}>
                  Cancelar
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nada agendado.</p>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="enviados">
        <h2 id="enviados" className="text-sm font-semibold">
          Enviados
        </h2>
        {recentes.isPending ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : recentes.data?.length ? (
          <ul
            aria-label="Comunicados enviados"
            className="divide-y rounded-2xl border border-subtle bg-card"
          >
            {recentes.data.map((a) => (
              <li key={a.id} className="px-4 py-3 text-sm">
                <span className="block truncate font-semibold">{a.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {[
                    a.lastRunAt
                      ? new Date(a.lastRunAt).toLocaleDateString('pt-BR', {
                          day: 'numeric',
                          month: 'short',
                        })
                      : null,
                    announcementDeliveryLine(a),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum comunicado saiu ainda.</p>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="enquetes">
        <h2 id="enquetes" className="text-sm font-semibold">
          Enquetes
        </h2>
        <p className="text-xs text-muted-foreground">
          Pergunte à comunidade. O resultado sai em %, sem nomes.
        </p>
        {enquetes.isPending ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : enquetes.data?.length ? (
          <ul aria-label="Enquetes do mural" className="space-y-2">
            {enquetes.data.map((p) => (
              <li key={p.postId} className="space-y-2 rounded-2xl border border-subtle bg-card p-4">
                <p className="font-semibold">{p.question}</p>
                <p className="text-xs text-muted-foreground">
                  {`por ${p.author} · ${p.options.length} opções · ${pollClosesLabel(p)}`}
                </p>
                {p.totalVotes === null ? (
                  <p className="text-xs text-muted-foreground">
                    Resultado oculto · aparece com {POLL_MIN_VOTES} votos ou mais.
                  </p>
                ) : (
                  <ul aria-label={`Resultado: ${p.question}`} className="space-y-1 text-sm">
                    {p.options.map((o) => (
                      <li key={o.label} className="flex justify-between gap-2">
                        <span>{o.label}</span>
                        <span className="tabular-nums text-muted-foreground">{o.percent}%</span>
                      </li>
                    ))}
                    <li className="text-xs text-muted-foreground">
                      {`${p.totalVotes} votos · sem nomes. Ninguém vê em quem cada pessoa votou.`}
                    </li>
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Vote}
            title="Nenhuma enquete ainda"
            description="A enquete vira um cartão de voto no mural."
          />
        )}
      </section>

      <ConfirmDialog
        open={cancelar !== null}
        onOpenChange={(o) => !o && setCancelar(null)}
        title={`Cancelar “${cancelar?.title ?? ''}”?`}
        description="O que já saiu continua no mural. Os próximos disparos não acontecem."
        confirmLabel="Cancelar comunicado"
        pending={cancela.isPending}
        onConfirm={() => cancelar && cancela.mutate(cancelar.id)}
      />
    </div>
  );
}
