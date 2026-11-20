'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import {
  ApiError,
  contentApi,
  emptyNutritionDocument,
  NUTRITION_DISCLAIMER,
  nutritionDocumentProblems,
  PLAN_LEVEL_LABEL,
  PLAN_LEVELS,
  toNutritionInput,
  type PlanLevel,
  type PlanTemplate,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { DeleteButton } from '@/components/content/content-ui';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { SendPlanForm } from '@/components/org/send-plan-form';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/selection';
import { Textarea } from '@/components/ui/textarea';
import { NutritionDocumentEditor } from './nutrition-document-editor';

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

/** O editor do plano alimentar da biblioteca (#407, Pn-24). */
export function NutritionTemplateEditor({
  groupId,
  template,
  canSend = false,
}: {
  groupId: string;
  template: PlanTemplate | null;
  /** Quem envia planos a alunos (dono e profissionais) vê "Enviar para…". */
  canSend?: boolean;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const canEdit = template === null || template.canEdit !== false;
  useTopBarTitle(template?.title ?? 'Novo plano alimentar');
  const ids = { title: useId(), description: useId(), level: useId() };

  const [form, setForm] = useState(() => ({
    title: template?.title ?? '',
    description: template?.description ?? '',
    level: (template?.level ?? 'none') as PlanLevel | 'none',
    document: template?.nutritionDocument ?? emptyNutritionDocument(),
  }));
  const [saved, setSaved] = useState(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const [problems, setProblems] = useState<string[]>([]);
  const [unpublishing, setUnpublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sending, setSending] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const invalidate = () => qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });

  function check(): string[] {
    const out: string[] = [];
    if (!form.title.trim()) out.push('Dê um nome ao plano.');
    return [...out, ...nutritionDocumentProblems(form.document)];
  }

  const save = useMutation({
    mutationFn: async (sent: typeof form) => {
      const body = {
        title: sent.title.trim(),
        description: sent.description.trim() || null,
        level: sent.level === 'none' ? null : sent.level,
        document: toNutritionInput(sent.document),
      };
      return template === null
        ? contentApi.createNutrition(groupId, body)
        : contentApi.updateNutrition(groupId, template.id, body);
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

  const published = Boolean(template?.publishedAt);
  const isDraft = template?.draft === true;
  const sendBlocked = dirty ? 'Salve antes de enviar.' : isDraft ? 'Termine o rascunho.' : null;

  return (
    <>
      <form
        className="max-w-6xl space-y-4"
        aria-label="Plano alimentar"
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
                placeholder="Ex.: Hipertrofia 2.000 kcal"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {template && canSend && (
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={sendBlocked !== null}
                  title={sendBlocked ?? undefined}
                  onClick={() => setSending(true)}
                >
                  <Send aria-hidden />
                  Enviar para…
                </Button>
              )}
              <Button type="submit" size="lg" disabled={!dirty || save.isPending}>
                {template === null ? 'Criar plano' : save.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {template
              ? `Plano alimentar · por ${template.authorName} · alimentos e medidas caseiras da TACO`
              : 'Plano alimentar · alimentos e medidas caseiras da TACO'}
          </p>

          {problems.length > 0 && (
            <div
              role="alert"
              className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm"
            >
              <ul className="list-disc space-y-0.5 pl-4">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          <NutritionDocumentEditor value={form.document} onChange={(d) => set('document', d)} />

          <section
            aria-label="Dados do plano"
            className="grid gap-4 rounded-2xl border border-subtle bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div className="space-y-1.5">
              <Label htmlFor={ids.level} className="text-xs text-muted-foreground">
                Nível
              </Label>
              <Select
                value={form.level}
                onValueChange={(v) => set('level', v as PlanLevel | 'none')}
              >
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
              <span className="block text-xs font-medium text-muted-foreground">Comunidade</span>
              {template && canEdit ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">
                      {published ? 'Publicado na comunidade' : 'Só na biblioteca'}
                    </span>
                    <Switch
                      label="Na comunidade"
                      checked={published}
                      disabled={publish.isPending || (!published && (dirty || isDraft))}
                      onCheckedChange={(on) => (on ? publish.mutate(true) : setUnpublishing(true))}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {published
                      ? 'Membros podem adotar; quem já adotou fica com a cópia.'
                      : isDraft
                        ? 'Termine o rascunho antes de publicar.'
                        : dirty
                          ? 'Salve antes: vai a versão salva.'
                          : 'Publique para os membros adotarem.'}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {template
                    ? 'Só quem publicou, ou o dono, publica.'
                    : 'Crie o plano para publicar.'}
                </p>
              )}
            </div>
            <div className="space-y-1 md:col-span-2">
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
        </fieldset>

        <p className="text-xs text-muted-foreground">{NUTRITION_DISCLAIMER}</p>

        {template && canEdit && (
          <section
            aria-label="Rascunho e apagar"
            className="flex flex-col gap-4 rounded-2xl border border-subtle bg-card p-4 md:flex-row md:items-center md:justify-between"
          >
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
      {/* Fora do formulário: o envio do diálogo não pode disparar o "Salvar". */}
      {template && (
        <Dialog open={sending} onOpenChange={setSending}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{`Enviar ${template.title}`}</DialogTitle>
            </DialogHeader>
            {sending && (
              <SendPlanForm
                groupId={groupId}
                template={template}
                onDone={() => setSending(false)}
                onCancel={() => setSending(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
