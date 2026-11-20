'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Info } from 'lucide-react';
import {
  ApiError,
  NUTRITION_DISCLAIMER,
  nutritionCopyApi,
  nutritionDocumentProblems,
  toNutritionInput,
  type NutritionCopy,
  type NutritionDocument,
} from '@fatia/api-client';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { fileKeys } from '@/components/org/member-file/keys';
import { NutritionDocumentEditor } from '@/components/org/nutrition-editor/nutrition-document-editor';
import { useOrgGroup } from '@/components/org/org-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/selection';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Editar a alimentação da pessoa (#407, Pn-24c): a cópia que ela recebeu, não
 * o modelo da biblioteca. Salvar vira uma versão nova, que vale no aceite.
 */
export default function MemberNutritionCopyPage() {
  const g = useOrgGroup();
  const { membershipId, planId } = useParams<{ membershipId: string; planId: string }>();
  const copy = useQuery({
    queryKey: [...fileKeys.file(g.id, membershipId), 'nutrition-copy', planId],
    queryFn: () => nutritionCopyApi.get(g.id, membershipId, planId),
    retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2,
  });
  useTopBarTitle(
    copy.data ? `Alimentação de ${firstName(copy.data.studentName)}` : 'Cópia do plano alimentar',
  );

  if (copy.isPending) return <Skeleton className="h-64 max-w-6xl rounded-2xl" />;
  if (copy.isError || !copy.data) {
    const denied = copy.error instanceof ApiError && copy.error.status < 500;
    return (
      <EmptyState
        title={denied ? 'Não dá para abrir este plano alimentar' : 'Não deu para abrir agora'}
        description={
          denied
            ? 'Sem acesso à alimentação desta pessoa, ou o plano não existe mais.'
            : 'Tente de novo em instantes.'
        }
        action={
          <Link
            href={`/org/${g.id}/members/${membershipId}`}
            className={buttonVariants({ variant: 'outline' })}
          >
            Voltar à ficha
          </Link>
        }
      />
    );
  }
  return <CopyEditor key={copy.data.version.id} groupId={g.id} data={copy.data} />;
}

function CopyEditor({ groupId, data }: { groupId: string; data: NutritionCopy }) {
  const qc = useQueryClient();
  const first = firstName(data.studentName);
  const noteId = useId();
  const [doc, setDoc] = useState<NutritionDocument>(data.document);
  const [saved, setSaved] = useState<NutritionDocument>(data.document);
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [base, setBase] = useState(data.version.id);
  const [conflict, setConflict] = useState(false);
  const dirty = JSON.stringify(doc) !== JSON.stringify(saved);
  const fileHref = `/org/${groupId}/members/${data.membershipId}`;
  const title = data.template?.title ?? data.title;

  const save = useMutation({
    mutationFn: (sent: NutritionDocument) =>
      nutritionCopyApi.save(groupId, data.membershipId, data.planId, {
        document: toNutritionInput(sent),
        baseVersionId: base,
        notify,
        ...(note.trim() ? { changeNote: note.trim() } : {}),
      }),
    onSuccess: (r, sent) => {
      setSaved(sent);
      setBase(r.planId);
      setNote('');
      toast(
        notify
          ? `Salvo como v${r.version}. A ${first} recebe um aviso para aceitar.`
          : `Salvo como v${r.version}, sem aviso. A ${first} vê ao abrir a alimentação.`,
      );
      void qc.invalidateQueries({ queryKey: fileKeys.file(groupId, data.membershipId) });
    },
    onError: (err) => {
      // Outra pessoa da equipe salvou esta cópia depois que ela abriu aqui.
      if (err instanceof ApiError && err.status === 409) {
        setConflict(true);
        return;
      }
      toast(
        err instanceof ApiError && err.status < 500 && err.message
          ? err.message
          : 'Não deu para salvar agora.',
      );
    },
  });

  const submit = () => {
    const p = nutritionDocumentProblems(doc);
    setProblems(p);
    if (p.length === 0) save.mutate(doc);
  };

  return (
    <div className="max-w-6xl space-y-4">
      <section
        aria-label="Sobre esta cópia"
        className="flex flex-wrap gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4"
      >
        <div className="flex min-w-0 flex-1 basis-64 gap-3">
          <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-primary" />
          <div className="min-w-0 space-y-1 text-sm">
            <p className="font-bold text-foreground">{`Editando a cópia da ${first}`}</p>
            <p className="text-muted-foreground">
              {`Vale só para ela. O ${title} da biblioteca não muda. As trocas que ela já fez continuam${
                data.swapsKept > 0 ? ` (${data.swapsKept} de hoje em diante)` : ''
              }.`}
            </p>
            <p className="text-muted-foreground">
              {`${data.title} · v${data.version.version}${data.authorName ? ` · por ${data.authorName}` : ''}. O que você salvar vira uma versão nova, que vale quando a ${first} aceitar.`}
            </p>
            {data.pendingUpdate && (
              <p className="text-warning">
                {`Há uma versão esperando a ${first} aceitar: salvar aqui a substitui.`}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-2 sm:ml-auto">
          {data.template && (
            <Link
              href={`/org/${groupId}/content/plans/${data.template.id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Ver original
            </Link>
          )}
          <Link href={fileHref} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            <ArrowLeft aria-hidden />
            Voltar à ficha
          </Link>
        </div>
      </section>

      {conflict && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm"
        >
          <span className="min-w-0 flex-1">
            Outra pessoa salvou esta cópia; recarregue para ver a versão nova. O que você mudou aqui
            não foi salvo.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void qc.invalidateQueries({ queryKey: fileKeys.file(groupId, data.membershipId) })
            }
          >
            Recarregar
          </Button>
        </div>
      )}

      {problems.length > 0 && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <NutritionDocumentEditor value={doc} onChange={setDoc} copy />

      <section
        aria-label="Salvar na cópia"
        className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{`Avisar a ${first} no app`}</span>
            <span className="block text-xs text-muted-foreground">
              Sem aviso, ela vê o plano novo na próxima vez que abrir a alimentação.
            </span>
          </span>
          <Switch label={`Avisar a ${first} no app`} checked={notify} onCheckedChange={setNotify} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={noteId} className="text-xs text-muted-foreground">
            O que mudou
          </Label>
          <Textarea
            id={noteId}
            rows={2}
            maxLength={500}
            placeholder="Ex.: mais carboidrato no almoço dos dias de treino."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="lg" disabled={!dirty || save.isPending} onClick={submit}>
            {save.isPending ? 'Salvando...' : `Salvar na cópia da ${first}`}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="ghost"
            disabled={!dirty || save.isPending}
            onClick={() => {
              setDoc(saved);
              setProblems([]);
            }}
          >
            Descartar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{NUTRITION_DISCLAIMER}</p>
      </section>
    </div>
  );
}
