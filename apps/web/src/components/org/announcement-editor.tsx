'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, Mail, Pin } from 'lucide-react';
import {
  ANNOUNCEMENT_TITLE_MAX,
  announcementSlots,
  announcementsApi,
  ApiError,
  lockScreenPreview,
  PIN_DAY_OPTIONS,
  POST_BODY_MAX,
  pushQuotaHint,
  repeatOptions,
  teamRoleLabel,
  usersApi,
  type AnnouncementRepeat,
  type MyGroup,
} from '@fatia/api-client';
import { communityKeys, orgKeys } from '@/components/community/query-keys';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function Chave({
  icon: Icone,
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  icon: typeof Pin;
  title: React.ReactNode;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={cn('flex items-center gap-3 text-sm', disabled && 'opacity-60')}>
      <Icone aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        label={typeof title === 'string' ? title : 'Também por e-mail'}
      />
    </div>
  );
}

/**
 * O editor do comunicado (pranchas Pn-01 e Pn-01b), no painel lateral ou na
 * página de comunicados. As regras são as da #394 (mural, fixar, notificação,
 * agendar em blocos de 15 min, repetir); aqui entram o e-mail, o limite da
 * semana e a prévia no mural ou na tela bloqueada.
 */
export function AnnouncementEditor({
  group,
  onDone,
  className,
}: {
  group: Pick<MyGroup, 'id' | 'name' | 'role'>;
  onDone: () => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const ajustes = useQuery({
    queryKey: orgKeys.announcementSettings(group.id),
    queryFn: () => announcementsApi.settings(group.id),
  });

  const [comoGrupo, setComoGrupo] = useState<'group' | 'me'>('group');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [fixar, setFixar] = useState(true);
  const [prazo, setPrazo] = useState<string>('7');
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);
  const [quando, setQuando] = useState<'now' | 'later'>('now');
  const [dia, setDia] = useState(() => toDateInput(new Date()));
  const [slot, setSlot] = useState('');
  const [repetir, setRepetir] = useState<AnnouncementRepeat>('NONE');
  const [previa, setPrevia] = useState<'mural' | 'lock'>('mural');

  const diaDate = useMemo(() => {
    const [y, m, d] = dia.split('-').map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1);
  }, [dia]);
  const slots = useMemo(() => announcementSlots(diaDate), [diaDate]);
  const slotIso = slots.find((s) => s.iso === slot)?.iso ?? null;
  const repetirOpts = repeatOptions(slotIso ? new Date(slotIso) : diaDate);
  const emailOk = ajustes.data?.emailAvailable ?? false;
  const semVaga = ajustes.data
    ? ajustes.data.pushUsedThisWeek >= ajustes.data.pushWeeklyLimit
    : false;

  const enviar = useMutation({
    mutationFn: () =>
      announcementsApi.create(group.id, {
        title: titulo.trim(),
        body: texto.trim(),
        publishedAs: comoGrupo === 'group' ? 'GROUP' : 'PERSON',
        pin: fixar,
        pinDays: fixar ? (prazo === 'none' ? null : Number(prazo)) : null,
        push,
        alsoEmail: emailOk && email,
        at: quando === 'later' ? slotIso : null,
        repeat: quando === 'later' ? repetir : 'NONE',
      }),
    onSuccess: (a) => {
      toast(
        quando === 'later'
          ? 'Comunicado agendado.'
          : a.pushSkipped
            ? 'Comunicado publicado no mural. O limite da semana segurou a notificação.'
            : 'Comunicado publicado no mural.',
      );
      void qc.invalidateQueries({ queryKey: orgKeys.announcements(group.id) });
      void qc.invalidateQueries({ queryKey: communityKeys.feed(group.id) });
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

  const autor = me.data?.name ?? 'Você';
  const quandoTexto =
    quando === 'later' && slotIso
      ? new Date(slotIso).toLocaleDateString('pt-BR', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
      : 'agora';
  const trava = lockScreenPreview({
    groupName: group.name,
    title: titulo.trim() || 'Título',
    body: texto.trim() || 'Texto do comunicado',
  });
  const horaTrava = slotIso
    ? new Date(slotIso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const diaTrava = (
    slotIso && quando === 'later' ? new Date(slotIso) : new Date()
  ).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <form
      aria-label="Novo comunicado"
      className={cn('flex min-h-0 flex-1 flex-col', className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (!problema) enviar.mutate();
      }}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <Segmented
          label="Publicar como"
          value={comoGrupo}
          options={[
            { value: 'group', label: group.name },
            { value: 'me', label: autor },
          ]}
          onChange={setComoGrupo}
        />
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Título</span>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={ANNOUNCEMENT_TITLE_MAX}
            placeholder="Feriado de sexta"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Texto</span>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={POST_BODY_MAX}
            rows={4}
            placeholder="Aceita **negrito**, _itálico_, - lista e [texto](link)."
          />
        </label>
        <p className="-mt-3 text-xs text-muted-foreground">
          Sem peso, medidas ou dados de saúde de membros. O mural é para toda a comunidade.
        </p>

        <div className="space-y-4 rounded-2xl p-3 shadow-[inset_0_0_0_1px_hsl(var(--border))]">
          <Chave
            icon={Pin}
            title="Fixar no topo do mural"
            hint={
              fixar
                ? 'Entra no carrossel de avisos, com até 3 fixados'
                : 'Entra no mural como post comum'
            }
            checked={fixar}
            onChange={setFixar}
          />
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
          <Chave
            icon={Bell}
            title="Avisar por notificação"
            hint={
              push
                ? 'Vai para quem deixou “Comunicados da comunidade” ligado'
                : 'Ninguém recebe notificação'
            }
            checked={push}
            onChange={setPush}
          />
          <Chave
            icon={Mail}
            title={
              <>
                Também por e-mail{' '}
                <span className="font-normal text-muted-foreground">· opcional</span>
              </>
            }
            hint={
              !emailOk
                ? 'E-mail indisponível nesta instalação'
                : email
                  ? 'Vai também para quem aceita comunicados, com link para sair da lista'
                  : 'Desligado: só no app'
            }
            checked={emailOk && email}
            disabled={!emailOk}
            onChange={setEmail}
          />
          {ajustes.data && (push || email) && (
            <p className={cn('text-xs', semVaga ? 'text-warning' : 'text-muted-foreground')}>
              {pushQuotaHint(ajustes.data)}
            </p>
          )}
        </div>

        <div className="space-y-3">
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
              <Segmented
                label="Repetir"
                value={repetir}
                options={repetirOpts}
                onChange={setRepetir}
              />
            </div>
          )}
        </div>

        <section aria-label="Prévia" className="space-y-3">
          <Segmented
            label="Prévia"
            value={previa}
            options={[
              { value: 'mural', label: 'No mural' },
              { value: 'lock', label: 'Tela bloqueada' },
            ]}
            onChange={setPrevia}
          />
          {previa === 'mural' ? (
            <div
              aria-label="Prévia no mural"
              className="space-y-1 rounded-2xl bg-card p-4 shadow-[inset_0_0_0_1px_hsl(var(--border))]"
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-primary-text">
                {fixar ? 'Aviso da equipe · fixado' : 'Aviso da equipe'}
              </p>
              <p className="font-display font-semibold">{titulo || 'Título'}</p>
              {texto.trim() ? (
                <MarkdownLite source={texto} />
              ) : (
                <p className="text-sm text-muted-foreground">Nada para mostrar ainda.</p>
              )}
              <p className="text-xs text-muted-foreground">
                {(comoGrupo === 'group'
                  ? group.name
                  : `${autor} · ${teamRoleLabel(group.role).toLowerCase()}`) + ` · ${quandoTexto}`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                aria-label="Prévia na tela bloqueada"
                className="rounded-[28px] bg-sunken px-4 pb-5 pt-6 text-center shadow-[inset_0_0_0_1px_hsl(var(--border))]"
              >
                <p className="text-xs capitalize text-muted-foreground">{diaTrava}</p>
                <p className="font-display text-4xl font-semibold tabular-nums">{horaTrava}</p>
                <div className="mt-4 rounded-2xl bg-card/90 p-3 text-left">
                  <p className="flex justify-between text-[10.5px] font-bold tracking-wide text-muted-foreground">
                    <span>{trava.app}</span>
                    <span>agora</span>
                  </p>
                  <p className="text-sm font-semibold">{trava.title}</p>
                  <p className="text-sm text-muted-foreground">{trava.body}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {push
                  ? 'Assim chega para quem tem notificações ligadas.'
                  : 'Com a notificação desligada, ninguém vê isto.'}
              </p>
            </div>
          )}
        </section>

        {problema && (titulo || texto) && (
          <p role="alert" className="text-xs text-danger">
            {problema}
          </p>
        )}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-background px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
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
