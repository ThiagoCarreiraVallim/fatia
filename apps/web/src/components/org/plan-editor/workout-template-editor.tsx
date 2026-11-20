'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import {
  ApiError,
  contentApi,
  documentProblems,
  MAX_PLAN_TAGS,
  MAX_TAG_LENGTH,
  normalizeTags,
  PLAN_LEVEL_LABEL,
  PLAN_LEVELS,
  toDocumentInput,
  type PlanDocumentView,
  type PlanLevel,
  type PlanTemplate,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { DeleteButton } from '@/components/content/content-ui';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Segmented, Switch } from '@/components/ui/selection';
import { Textarea } from '@/components/ui/textarea';
import { PlanDocumentEditor } from './plan-document-editor';

type Agenda = 'CALENDAR' | 'FLEXIBLE' | 'NONE';

const AGENDAS: { value: Agenda; label: string }[] = [
  { value: 'CALENDAR', label: 'Datas' },
  { value: 'FLEXIBLE', label: 'Flexível' },
  { value: 'NONE', label: 'Sem agenda' },
];

const AGENDA_HINT: Record<Agenda, string> = {
  CALENDAR: 'Cada sessão tem o seu dia da semana.',
  FLEXIBLE: 'Sem dia fixo: o aluno faz a próxima sessão do rodízio.',
  NONE: 'Quem envia escolhe a agenda.',
};

const EMPTY_DOC: PlanDocumentView = { sessions: [{ name: '', weekday: null, items: [] }] };

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

/** Os dias só valem na agenda por datas; nas outras, saem do documento. */
function withAgenda(doc: PlanDocumentView, agenda: Agenda): PlanDocumentView {
  if (agenda === 'CALENDAR') return doc;
  return { sessions: doc.sessions.map((s) => ({ ...s, weekday: null })) };
}

/** O editor do modelo de treino da biblioteca (#406, Pn-09). */
export function WorkoutTemplateEditor({
  groupId,
  template,
}: {
  groupId: string;
  template: PlanTemplate | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const canEdit = template === null || template.canEdit !== false;
  useTopBarTitle(template?.title ?? 'Novo plano de treino');
  const ids = { title: useId(), description: useId(), level: useId(), tag: useId() };

  const [form, setForm] = useState(() => ({
    title: template?.title ?? '',
    description: template?.description ?? '',
    level: (template?.level ?? 'none') as PlanLevel | 'none',
    tags: template?.tags ?? [],
    agenda: (template?.schedule ?? (template ? 'NONE' : 'CALENDAR')) as Agenda,
    startDate: template?.startDate ?? '',
    endDate: template?.endDate ?? '',
    document: template?.document ?? EMPTY_DOC,
  }));
  const [saved, setSaved] = useState(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const [tagDraft, setTagDraft] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [unpublishing, setUnpublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const invalidate = () => qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });

  function check(): string[] {
    const out: string[] = [];
    if (!form.title.trim()) out.push('Dê um nome ao plano.');
    if (
      form.agenda === 'CALENDAR' &&
      form.startDate &&
      form.endDate &&
      form.endDate < form.startDate
    ) {
      out.push('O fim do período vem antes do início.');
    }
    return [...out, ...documentProblems(form.document)];
  }

  const save = useMutation({
    mutationFn: async (sent: typeof form) => {
      const body = {
        title: sent.title.trim(),
        description: sent.description.trim() || null,
        level: sent.level === 'none' ? null : sent.level,
        tags: normalizeTags(sent.tags),
        schedule: sent.agenda === 'NONE' ? null : sent.agenda,
        startDate: sent.agenda === 'CALENDAR' ? sent.startDate || null : null,
        endDate: sent.agenda === 'CALENDAR' ? sent.endDate || null : null,
        document: toDocumentInput(withAgenda(sent.document, sent.agenda)),
      };
      return template === null
        ? contentApi.createWorkout(groupId, body)
        : contentApi.updatePlan(groupId, template.id, body);
    },
    onSuccess: (t, sent) => {
      setSaved(sent);
      toast(
        template === null
          ? 'Plano criado. Já dá para enviar para alunos; a comunidade é à parte.'
          : 'Plano salvo. As cópias já enviadas não mudam.',
      );
      void invalidate();
      if (template === null) router.replace(`/org/${groupId}/content/plans/${t.id}`);
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para salvar agora.')),
  });

  const publish = useMutation({
    mutationFn: (on: boolean) => contentApi.publishPlan(groupId, template!.id, on),
    onSuccess: (t) => {
      setUnpublishing(false);
      toast(t.publishedAt ? 'Na comunidade.' : 'Saiu da comunidade. Quem já adotou continua.');
      void invalidate();
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para mudar agora.')),
  });

  const draft = useMutation({
    mutationFn: (on: boolean) => contentApi.updatePlan(groupId, template!.id, { draft: on }),
    onSuccess: (t) => {
      toast(t.draft ? 'Marcado como rascunho.' : 'Rascunho terminado.');
      void invalidate();
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para mudar agora.')),
  });

  const remove = useMutation({
    mutationFn: () => contentApi.deletePlan(groupId, template!.id),
    onSuccess: () => {
      toast('Plano apagado. As cópias de quem recebeu continuam.');
      void invalidate();
      router.replace(`/org/${groupId}/content`);
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para apagar agora.')),
  });

  const addTag = () => {
    const next = normalizeTags([...form.tags, tagDraft]);
    set('tags', next);
    setTagDraft('');
  };

  const published = Boolean(template?.publishedAt);
  const isDraft = template?.draft === true;

  return (
    <form
      className="max-w-6xl space-y-4"
      aria-label="Plano de treino"
      onSubmit={(e) => {
        e.preventDefault();
        const p = check();
        setProblems(p);
        if (p.length === 0) save.mutate(form);
      }}
    >
      {!canEdit && (
        <p className="rounded-xl bg-muted p-3 text-sm">
          Só quem publicou, ou o dono, muda este plano.
        </p>
      )}
      <fieldset disabled={!canEdit} className="contents">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-64 space-y-1">
            <Label htmlFor={ids.title} className="text-xs text-muted-foreground">
              Nome do plano
            </Label>
            <Input
              id={ids.title}
              size="xl"
              maxLength={100}
              placeholder="Ex.: Inferior · hipertrofia"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={!dirty || save.isPending}>
              {template === null ? 'Criar plano' : save.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>

        {problems.length > 0 && (
          <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
            <ul className="list-disc space-y-0.5 pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        <section
          aria-label="Dados do plano"
          className="grid gap-4 rounded-2xl border border-subtle bg-card p-4 md:grid-cols-2 xl:grid-cols-4"
        >
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Agenda</span>
            <Segmented
              label="Agenda"
              options={AGENDAS}
              value={form.agenda}
              onChange={(a) => set('agenda', a)}
            />
            <p className="text-xs text-muted-foreground">{AGENDA_HINT[form.agenda]}</p>
          </div>
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Período</span>
            {form.agenda === 'CALENDAR' ? (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  aria-label="Início"
                  value={form.startDate}
                  onChange={(e) => set('startDate', e.target.value)}
                />
                <span aria-hidden className="text-muted-foreground">
                  –
                </span>
                <Input
                  type="date"
                  aria-label="Fim"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(e) => set('endDate', e.target.value)}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Só na agenda por datas.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.level} className="text-xs text-muted-foreground">
              Nível
            </Label>
            <Select value={form.level} onValueChange={(v) => set('level', v as PlanLevel | 'none')}>
              <SelectTrigger id={ids.level}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem nível</SelectItem>
                {PLAN_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {PLAN_LEVEL_LABEL[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Etiquetas</span>
            {form.tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {form.tags.map((t) => (
                  <li
                    key={t}
                    className="flex items-center gap-1 rounded-chip bg-muted py-1 pl-2.5 pr-1 text-xs font-medium"
                  >
                    {t}
                    <button
                      type="button"
                      aria-label={`Tirar a etiqueta ${t}`}
                      onClick={() =>
                        set(
                          'tags',
                          form.tags.filter((x) => x !== t),
                        )
                      }
                      className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface-3"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Input
              id={ids.tag}
              aria-label="Nova etiqueta"
              value={tagDraft}
              maxLength={MAX_TAG_LENGTH}
              disabled={form.tags.length >= MAX_PLAN_TAGS}
              placeholder="hipertrofia, iniciante... (Enter)"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  if (tagDraft.trim()) addTag();
                }
              }}
              onBlur={() => tagDraft.trim() && addTag()}
            />
          </div>
          <div className="space-y-1 md:col-span-2 xl:col-span-4">
            <Label htmlFor={ids.description} className="text-xs text-muted-foreground">
              Descrição
            </Label>
            <Textarea
              id={ids.description}
              rows={2}
              maxLength={1000}
              placeholder="Para quem é, o que esperar."
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
        </section>

        <PlanDocumentEditor
          groupId={groupId}
          value={form.document}
          onChange={(d) => set('document', d)}
          showWeekdays={form.agenda === 'CALENDAR'}
        />
      </fieldset>

      {template && canEdit && (
        <section
          aria-label="Publicação"
          className="flex flex-col gap-4 rounded-2xl border border-subtle bg-card p-4 md:flex-row md:items-center"
        >
          <div className="flex flex-1 items-start gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Na comunidade</span>
              <span className="block text-xs text-muted-foreground">
                {isDraft
                  ? 'Termine o rascunho antes de publicar.'
                  : dirty
                    ? 'Salve antes: vai para a comunidade a versão salva.'
                    : 'Os membros veem e podem adotar. Enviar para um aluno é à parte.'}
              </span>
            </span>
            <Switch
              label="Na comunidade"
              checked={published}
              disabled={publish.isPending || (!published && (dirty || isDraft))}
              onCheckedChange={(on) => (on ? publish.mutate(true) : setUnpublishing(true))}
            />
          </div>
          {!published && (
            <div className="flex flex-1 items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Rascunho</span>
                <span className="block text-xs text-muted-foreground">
                  Não se envia para alunos nem vai para a comunidade.
                </span>
              </span>
              <Switch
                label="Rascunho"
                checked={isDraft}
                disabled={draft.isPending}
                onCheckedChange={(on) => draft.mutate(on)}
              />
            </div>
          )}
          <DeleteButton label="Apagar plano" onClick={() => setDeleting(true)} />
        </section>
      )}

      <ConfirmDialog
        open={unpublishing}
        onOpenChange={setUnpublishing}
        title="Tirar este plano da comunidade?"
        description="Ele some para os membros. Quem já adotou continua com a cópia."
        confirmLabel="Tirar"
        pendingLabel="Tirando..."
        pending={publish.isPending}
        onConfirm={() => publish.mutate(false)}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Apagar este plano?"
        description="Ele some da biblioteca. As cópias de quem recebeu continuam."
        confirmLabel="Apagar"
        pendingLabel="Apagando..."
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </form>
  );
}
