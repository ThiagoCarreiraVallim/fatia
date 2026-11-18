'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Megaphone, Vote } from 'lucide-react';
import {
  ANNOUNCEMENT_TITLE_MAX,
  announcementSlots,
  announcementsApi,
  ApiError,
  feedApi,
  moderationApi,
  PIN_DAY_OPTIONS,
  POLL_MAX_OPTIONS,
  POLL_MIN_VOTES,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  POST_BODY_MAX,
  pollProblem,
  pollClosesLabel,
  repeatOptions,
  type Announcement,
  type AnnouncementRepeat,
} from '@fatia/api-client';
import { communityKeys, orgKeys } from '@/components/community/query-keys';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { useOrgGroup } from '@/components/org/org-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

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

const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Novo comunicado (prancha Pn-14): agora ou agendado, com repetição, aviso fixado e notificação. */
function NovoComunicado({
  groupId,
  groupName,
  onDone,
}: {
  groupId: string;
  groupName: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [comoGrupo, setComoGrupo] = useState<'group' | 'me'>('group');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [vista, setVista] = useState<'write' | 'preview'>('write');
  const [fixar, setFixar] = useState(true);
  const [prazo, setPrazo] = useState<string>('7');
  const [push, setPush] = useState(true);
  const [quando, setQuando] = useState<'now' | 'later'>('now');
  const [dia, setDia] = useState(() => toDateInput(new Date()));
  const [slot, setSlot] = useState('');
  const [repetir, setRepetir] = useState<AnnouncementRepeat>('NONE');

  const diaDate = useMemo(() => {
    const [y, m, d] = dia.split('-').map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1);
  }, [dia]);
  const slots = useMemo(() => announcementSlots(diaDate), [diaDate]);
  const slotIso = slots.find((s) => s.iso === slot)?.iso ?? null;
  const repetirOpts = repeatOptions(slotIso ? new Date(slotIso) : diaDate);

  const enviar = useMutation({
    mutationFn: () =>
      announcementsApi.create(groupId, {
        title: titulo.trim(),
        body: texto.trim(),
        publishedAs: comoGrupo === 'group' ? 'GROUP' : 'PERSON',
        pin: fixar,
        pinDays: fixar ? (prazo === 'none' ? null : Number(prazo)) : null,
        push,
        at: quando === 'later' ? slotIso : null,
        repeat: quando === 'later' ? repetir : 'NONE',
      }),
    onSuccess: () => {
      toast(quando === 'later' ? 'Comunicado agendado.' : 'Comunicado publicado no mural.');
      void qc.invalidateQueries({ queryKey: orgKeys.announcements(groupId) });
      void qc.invalidateQueries({ queryKey: communityKeys.feed(groupId) });
      onDone();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para mandar o comunicado agora.')),
  });

  const problema = !titulo.trim()
    ? 'Escreva o título.'
    : !texto.trim()
      ? 'Escreva o texto.'
      : quando === 'later' && !slotIso
        ? 'Escolha o horário.'
        : null;

  return (
    <form
      aria-label="Novo comunicado"
      className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problema) enviar.mutate();
      }}
    >
      <Segmented
        label="Publicar como"
        value={comoGrupo}
        options={[
          { value: 'group', label: groupName },
          { value: 'me', label: 'Eu' },
        ]}
        onChange={setComoGrupo}
      />
      <Input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        maxLength={ANNOUNCEMENT_TITLE_MAX}
        aria-label="Título"
        placeholder="Título"
      />
      <Segmented
        label="Modo do texto"
        value={vista}
        options={[
          { value: 'write', label: 'Escrever' },
          { value: 'preview', label: 'Prévia' },
        ]}
        onChange={setVista}
      />
      {vista === 'write' ? (
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={POST_BODY_MAX}
          rows={4}
          aria-label="Texto"
          placeholder="Texto. Aceita **negrito**, _itálico_, # título, - lista, > citação e [texto](link)."
        />
      ) : (
        <div
          aria-label="Prévia do comunicado"
          className="space-y-1 rounded-xl border border-dashed border-subtle p-3"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
            {fixar ? 'Aviso da equipe · fixado' : 'Aviso da equipe'}
          </p>
          <p className="font-display font-semibold">{titulo || 'Título'}</p>
          {texto.trim() ? (
            <MarkdownLite source={texto} />
          ) : (
            <p className="text-sm text-muted-foreground">Nada para mostrar ainda.</p>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Sem peso, medidas ou dados de saúde de membros. O mural é para toda a comunidade.
      </p>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="block font-medium">Fixar no topo do mural</span>
          <span className="block text-xs text-muted-foreground">
            {fixar
              ? 'Entra no carrossel de avisos, com até 3 fixados'
              : 'Entra no mural como post comum'}
          </span>
        </span>
        <Switch checked={fixar} onCheckedChange={setFixar} label="Fixar no topo do mural" />
      </div>
      {fixar && (
        <Segmented
          label="Fica no topo por"
          value={prazo}
          options={PIN_DAY_OPTIONS.map((o) => ({
            value: o.days ? String(o.days) : 'none',
            label: o.label,
          }))}
          onChange={setPrazo}
        />
      )}
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="block font-medium">Avisar por notificação</span>
          <span className="block text-xs text-muted-foreground">
            {push
              ? 'Vai para quem deixou “Comunicados da comunidade” ligado'
              : 'Ninguém recebe notificação'}
          </span>
        </span>
        <Switch checked={push} onCheckedChange={setPush} label="Avisar por notificação" />
      </div>

      <Segmented
        label="Quando"
        value={quando}
        options={[
          { value: 'now', label: 'Agora' },
          { value: 'later', label: 'Agendar' },
        ]}
        onChange={setQuando}
      />
      {quando === 'later' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              type="date"
              value={dia}
              min={toDateInput(new Date())}
              onChange={(e) => {
                setDia(e.target.value);
                setSlot('');
              }}
              aria-label="Dia"
              className="w-auto"
            />
            <select
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              aria-label="Horário"
              className="h-10 rounded-field border border-subtle bg-background px-3 text-sm text-foreground"
            >
              <option value="">Horário</option>
              {slots.map((s) => (
                <option key={s.iso} value={s.iso}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">Horário em blocos de 15 minutos.</p>
          <Segmented label="Repetir" value={repetir} options={repetirOpts} onChange={setRepetir} />
        </div>
      )}

      {problema && (titulo || texto) && (
        <p role="alert" className="text-xs text-danger">
          {problema}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={Boolean(problema) || enviar.isPending}>
          {quando === 'later'
            ? repetir !== 'NONE'
              ? 'Agendar e repetir'
              : 'Agendar'
            : 'Publicar agora'}
        </Button>
      </div>
    </form>
  );
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
        <Button onClick={() => setAberto('announcement')} disabled={aberto !== null}>
          <Megaphone size={16} aria-hidden /> Novo comunicado
        </Button>
        <Button variant="outline" onClick={() => setAberto('poll')} disabled={aberto !== null}>
          <Vote size={16} aria-hidden /> Nova enquete
        </Button>
      </div>

      {aberto === 'announcement' && (
        <NovoComunicado groupId={g.id} groupName={g.name} onDone={() => setAberto(null)} />
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
