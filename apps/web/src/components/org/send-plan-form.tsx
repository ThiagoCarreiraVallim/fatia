'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  canSendTemplate,
  libraryFormat,
  recipientFilters,
  SEND_KINDS,
  SEND_STARTS,
  sendButtonLabel,
  sendPreview,
  sendSuccessToast,
  sendsApi,
  validateSendForm,
  WEEKDAY_NAMES,
  type PlanTemplate,
  type SendKind,
  type SendPlansInput,
  type SendStart,
  type TemplateKind,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { apiErrorText } from '@/components/org/seat-forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox, Chip, Segmented } from '@/components/ui/selection';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Schedule = 'CALENDAR' | 'FLEXIBLE';
type Group = 'all' | 'mine' | 'noPlan';

const SCHEDULES: { value: Schedule; label: string }[] = [
  { value: 'CALENDAR', label: 'Calendário (datas)' },
  { value: 'FLEXIBLE', label: 'Flexível' },
];
const SCHEDULE_HINT: Record<Schedule, string> = {
  CALENDAR: 'Cada treino cai num dia da semana; o aluno vê a data no Hoje.',
  FLEXIBLE: 'Sem dia marcado: o aluno faz a próxima sessão quando treinar.',
};
const DEFAULT_WEEKDAYS = [1, 3, 5];
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

/**
 * Formulário de "Enviar para alunos" (#405). Na biblioteca (Pn-08b) o plano
 * já vem escolhido e ele mora no painel lateral; na página Enviar (Pn-18) a
 * pessoa escolhe o tipo e o plano, e a prévia "Como chega" vai ao lado.
 *
 * Quem pode receber vem da API (membros ativos com vínculo ativo com quem
 * envia); a tela não decide isso, só mostra.
 */
export function SendPlanForm({
  groupId,
  template,
  templates = [],
  onDone,
  onCancel,
  aside,
}: {
  groupId: string;
  /** Plano fixo (biblioteca). Sem ele, a pessoa escolhe tipo e plano. */
  template?: PlanTemplate;
  templates?: PlanTemplate[];
  onDone?: () => void;
  onCancel?: () => void;
  /** Coluna ao lado da prévia, na página (os enviados recentemente). */
  aside?: ReactNode;
}) {
  const qc = useQueryClient();
  const ids = { search: useId(), change: useId(), note: useId(), end: useId(), start: useId() };
  const page = !template;
  const [kind, setKind] = useState<TemplateKind>(template?.kind ?? 'WORKOUT');
  const [templateId, setTemplateId] = useState(template?.id ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<Group>('all');
  const [schedule, setSchedule] = useState<Schedule>('CALENDAR');
  const [start, setStart] = useState<SendStart>('TODAY');
  const [startDate, setStartDate] = useState('');
  const [weeks, setWeeks] = useState('4');
  const [weekdays, setWeekdays] = useState<number[]>(DEFAULT_WEEKDAYS);
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [changeNote, setChangeNote] = useState('');

  const options = templates.filter((t) => t.kind === kind && canSendTemplate(t));
  const chosen = template ?? options.find((t) => t.id === templateId) ?? null;

  const recipients = useQuery({
    queryKey: orgKeys.sendRecipients(groupId, templateId || '-'),
    queryFn: () => sendsApi.recipients(groupId, templateId || undefined),
  });
  const people = useMemo(() => recipients.data?.recipients ?? [], [recipients.data]);
  const byId = new Map(people.map((r) => [r.membershipId, r]));
  const filters = recipientFilters(people);
  const mine = filters.find((f) => f.key === 'mine')!;
  const inGroup = new Set(filters.find((f) => f.key === group)!.ids);
  const q = query.trim().toLowerCase();
  const shown = people.filter(
    (r) => inGroup.has(r.membershipId) && (!q || r.name.toLowerCase().includes(q)),
  );
  const names = selected.map((id) => byId.get(id)?.name ?? '').filter(Boolean);
  const needsChange = selected.some((id) => byId.get(id)?.alreadyHas);
  // Quem segue um flexível sem fim não tem "depois do plano atual" (#461): a
  // opção desliga e a escolha volta para "Hoje".
  const openEnded = selected.map((id) => byId.get(id)).filter((r) => r?.openEnded);
  const startValue: SendStart = openEnded.length && start === 'AFTER_CURRENT' ? 'TODAY' : start;
  const workout = kind === 'WORKOUT';

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const addAll = (list: string[]) =>
    setSelected((s) => [...s, ...list.filter((id) => !s.includes(id))]);

  const send = useMutation({
    mutationFn: (body: SendPlansInput) => sendsApi.send(groupId, body),
    onSuccess: (r) => {
      toast(sendSuccessToast(r));
      setSelected([]);
      setChangeNote('');
      void qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });
      onDone?.();
    },
    onError: (err) => toast(apiErrorText(err, 'Não deu para enviar agora.')),
  });

  function submit() {
    const problem = validateSendForm({
      kind,
      templateId: chosen?.id ?? null,
      membershipIds: selected,
      schedule,
      start: startValue,
      startDate,
      weeks: Number(weeks) || null,
      weekdays,
    });
    if (problem) {
      toast(problem);
      return;
    }
    const body: SendPlansInput = { templateId: chosen!.id, membershipIds: selected };
    if (workout) {
      body.schedule = schedule;
      if (schedule === 'CALENDAR') {
        body.start = startValue;
        if (startValue === 'DATE') body.startDate = startDate;
        body.weeks = Number(weeks);
        body.weekdays = [...weekdays].sort((a, b) => a - b);
      } else if (endDate) {
        body.endDate = endDate;
      }
    }
    if (note.trim()) body.note = note.trim();
    if (needsChange && changeNote.trim()) body.changeNote = changeNote.trim();
    send.mutate(body);
  }

  const actions = (
    <div className="flex flex-wrap justify-end gap-2">
      {onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      )}
      <Button
        type="button"
        disabled={selected.length === 0 || !chosen || send.isPending}
        onClick={submit}
      >
        {send.isPending ? 'Enviando…' : sendButtonLabel(names)}
      </Button>
    </div>
  );

  const fields = (
    <div className="space-y-5">
      {page && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">O que enviar</legend>
          <div
            role="radiogroup"
            aria-label="O que enviar"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5"
          >
            {SEND_KINDS.map((k) => (
              <KindOption
                key={k.key}
                kind={k}
                checked={k.key === kind}
                onSelect={() => {
                  setKind(k.key as TemplateKind);
                  setTemplateId('');
                }}
              />
            ))}
          </div>
        </fieldset>
      )}

      {page && (
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Plano</span>
          <select
            aria-label="Plano"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="">Escolha o plano</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} · {libraryFormat(t)}
              </option>
            ))}
          </select>
          {options.length === 0 && (
            <span className="block text-xs text-muted-foreground">
              Nenhum plano pronto deste tipo na biblioteca. Rascunho não se envia.
            </span>
          )}
        </label>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Para quem</legend>
        <div className="flex flex-wrap gap-2">
          {mine.count > 0 && (
            <Chip type="button" tone="primary" onClick={() => addAll(mine.ids)}>
              Todos que eu acompanho ({mine.count})
            </Chip>
          )}
          {filters.map((f) => (
            <Chip
              key={f.key}
              type="button"
              selected={group === f.key}
              aria-pressed={group === f.key}
              onClick={() => setGroup(f.key)}
            >
              {f.label} {f.count}
            </Chip>
          ))}
        </div>
        <label htmlFor={ids.search} className="relative block">
          <span className="sr-only">Buscar membro</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={ids.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar membro"
            className="pl-9"
          />
        </label>
        {recipients.isPending ? (
          <p className="text-sm text-muted-foreground">Carregando quem pode receber…</p>
        ) : recipients.isError ? (
          <p className="text-sm text-warning">Não deu para carregar os membros.</p>
        ) : people.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguém acompanhado por você nesta comunidade ainda. O aluno precisa ter vínculo com
            você para receber.
          </p>
        ) : (
          <ul
            aria-label="Quem pode receber"
            className="max-h-72 divide-y divide-subtle overflow-y-auto rounded-xl border border-subtle"
          >
            {shown.map((r) => (
              <li key={r.membershipId} className="flex items-center gap-3 px-3 py-2.5">
                <Checkbox
                  checked={selected.includes(r.membershipId)}
                  onCheckedChange={() => toggle(r.membershipId)}
                  label={r.alreadyHas ? `${r.name}, já tem este plano` : r.name}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[r.accompaniedByMe ? 'acompanho' : null, r.hasPlan ? null : 'sem plano']
                      .filter(Boolean)
                      .join(' · ') || 'com plano'}
                  </span>
                </span>
                {r.alreadyHas && (
                  <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    já tem
                  </span>
                )}
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-3 py-2.5 text-sm text-muted-foreground">Ninguém nesse filtro.</li>
            )}
          </ul>
        )}
      </fieldset>

      {needsChange && (
        <div className="space-y-1.5 rounded-xl bg-[hsl(var(--info)/0.08)] p-3">
          <label htmlFor={ids.change} className="text-sm font-semibold">
            O que mudou · substitui a versão atual
          </label>
          <Textarea
            id={ids.change}
            value={changeNote}
            maxLength={500}
            rows={2}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="Ex.: troquei o leg press por agachamento búlgaro."
          />
          <p className="text-xs text-muted-foreground">
            Quem já tem este plano recebe uma versão nova e vê este texto. A versão que a pessoa usa
            hoje continua até ela aceitar.
          </p>
        </div>
      )}

      {workout && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <span className="text-sm font-semibold">Como segue</span>
            <Segmented
              label="Como segue"
              options={SCHEDULES}
              value={schedule}
              onChange={setSchedule}
            />
            <p className="text-xs text-muted-foreground">{SCHEDULE_HINT[schedule]}</p>
          </div>
          {schedule === 'CALENDAR' ? (
            <>
              <div className="space-y-1.5">
                <span className="text-sm font-semibold">Começa</span>
                <Segmented
                  label="Começa"
                  options={SEND_STARTS.map((s) => ({
                    value: s.key,
                    label: s.label,
                    disabled: s.key === 'AFTER_CURRENT' && openEnded.length > 0,
                  }))}
                  value={startValue}
                  onChange={setStart}
                />
                {openEnded.length > 0 && (
                  <p className="text-xs text-warning">
                    {openEnded.length === 1
                      ? `${firstName(openEnded[0]!.name)} segue um plano flexível sem data de fim: não há "depois" para esperar. Escolha hoje ou uma data.`
                      : `${openEnded.length} pessoas seguem um plano flexível sem data de fim: não há "depois" para esperar. Escolha hoje ou uma data.`}
                  </p>
                )}
                {startValue === 'DATE' && (
                  <Input
                    aria-label="Dia de começar"
                    id={ids.start}
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                )}
                {startValue === 'AFTER_CURRENT' && (
                  <p className="text-xs text-muted-foreground">
                    Para cada pessoa, no dia seguinte ao fim do plano que ela segue agora; quem não
                    tem plano começa hoje.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <label className="block w-28 space-y-1.5">
                  <span className="text-sm font-semibold">Semanas</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={52}
                    value={weeks}
                    onChange={(e) => setWeeks(e.target.value)}
                  />
                </label>
                <div className="space-y-1.5">
                  <span className="text-sm font-semibold">Dias</span>
                  <div className="flex gap-1" role="group" aria-label="Dias da semana">
                    {WEEKDAY_NAMES.map((n, i) => {
                      const d = i + 1;
                      const on = weekdays.includes(d);
                      return (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={on}
                          aria-label={n}
                          onClick={() =>
                            setWeekdays((w) => (on ? w.filter((x) => x !== d) : [...w, d]))
                          }
                          className={cn(
                            'h-9 w-9 rounded-full text-xs font-semibold',
                            on ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                          )}
                        >
                          {n.slice(0, 1)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <label htmlFor={ids.end} className="block space-y-1.5">
              <span className="text-sm font-semibold">Termina em</span>
              <Input
                id={ids.end}
                aria-label="Termina em"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <span className="block text-xs text-muted-foreground">
                Opcional. Sem data, segue até você mandar outro.
              </span>
            </label>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={ids.note} className="text-sm font-semibold">
          Nota no plano (opcional)
        </label>
        <Textarea
          id={ids.note}
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {page
          ? 'Cada pessoa recebe uma cópia. Mudar o modelo depois não mexe na cópia de ninguém.'
          : 'Cada pessoa recebe a própria cópia e aceita no app. Para ajustar só para alguém, abra a ficha dela.'}
      </p>
      {page && actions}
    </div>
  );

  if (!page) {
    // No painel lateral o formulário rola e os botões ficam fixos embaixo.
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{fields}</div>
        <div className="border-t border-border p-3">{actions}</div>
      </div>
    );
  }

  const preview = sendPreview({
    kind,
    title: chosen?.title ?? 'Escolha o plano',
    changeNote: needsChange ? changeNote : null,
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Enviar" className="rounded-2xl border border-subtle bg-card p-4">
        {fields}
      </section>
      <div className="space-y-4">
        <section aria-labelledby="como-chega" className="space-y-2">
          <h2 id="como-chega" className="text-sm font-semibold">
            Como chega para {names[0] ? firstName(names[0]) : 'o aluno'}
          </h2>
          <div
            aria-label="Prévia do cartão"
            className="space-y-1.5 rounded-2xl border border-subtle bg-card p-4"
          >
            <span className="block text-[11px] font-extrabold uppercase tracking-[0.06em] text-primary">
              {preview.eyebrow}
            </span>
            <b className="block font-display text-lg">{preview.title}</b>
            <span className="block text-sm text-muted-foreground">{preview.body}</span>
            <span className="mt-2 inline-flex h-9 items-center rounded-pill bg-primary px-4 text-sm font-semibold text-primary-foreground">
              {preview.button}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Chega na aba Para você e no Hoje do aluno.
          </p>
        </section>
        {aside}
      </div>
    </div>
  );
}

function KindOption({
  kind,
  checked,
  onSelect,
}: {
  kind: { key: SendKind; label: string; enabled: boolean; soon?: string };
  checked: boolean;
  onSelect: () => void;
}) {
  const soonId = useId();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={!kind.enabled}
      aria-describedby={kind.soon ? soonId : undefined}
      onClick={onSelect}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'border-primary bg-primary/5' : 'border-subtle',
      )}
    >
      <span className="text-sm font-semibold">{kind.label}</span>
      {kind.soon && (
        <span id={soonId} className="text-xs text-muted-foreground">
          {kind.soon}
        </span>
      )}
    </button>
  );
}
