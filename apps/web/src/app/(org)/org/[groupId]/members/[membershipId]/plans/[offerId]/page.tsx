'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Info } from 'lucide-react';
import {
  ApiError,
  documentProblems,
  planCopyApi,
  toDocumentInput,
  type PlanCopy,
  type PlanDocumentView,
} from '@fatia/api-client';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { fileKeys } from '@/components/org/member-file/keys';
import { useOrgGroup } from '@/components/org/org-shell';
import { PlanDocumentEditor } from '@/components/org/plan-editor/plan-document-editor';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/selection';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Editar a cópia da pessoa (#406, Pn-09e): o plano que ela recebeu, não o da biblioteca. */
export default function MemberPlanCopyPage() {
  const g = useOrgGroup();
  const { membershipId, offerId } = useParams<{ membershipId: string; offerId: string }>();
  const copy = useQuery({
    queryKey: [...fileKeys.file(g.id, membershipId), 'plan-copy', offerId],
    queryFn: () => planCopyApi.get(g.id, membershipId, offerId),
    retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2,
  });
  useTopBarTitle(copy.data ? `Cópia de ${firstName(copy.data.studentName)}` : 'Cópia do plano');

  if (copy.isPending) return <Skeleton className="h-64 max-w-6xl rounded-2xl" />;
  if (copy.isError || !copy.data) {
    const denied = copy.error instanceof ApiError && copy.error.status < 500;
    return (
      <EmptyState
        title={denied ? 'Não dá para abrir este treino' : 'Não deu para abrir agora'}
        description={
          denied
            ? 'Sem acesso ao treino desta pessoa, ou o plano não existe mais.'
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
  if (!copy.data.document) {
    return (
      <EmptyState
        title="Este plano não abre no editor"
        description="Ele veio de um formato antigo. Envie uma versão nova a partir da biblioteca."
      />
    );
  }
  return (
    <CopyEditor
      key={copy.data.version.id}
      groupId={g.id}
      data={copy.data}
      document={copy.data.document}
    />
  );
}

function CopyEditor({
  groupId,
  data,
  document,
}: {
  groupId: string;
  data: PlanCopy;
  document: PlanDocumentView;
}) {
  const qc = useQueryClient();
  const first = firstName(data.studentName);
  const noteId = useId();
  const [doc, setDoc] = useState(document);
  const [saved, setSaved] = useState(document);
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const dirty = JSON.stringify(doc) !== JSON.stringify(saved);
  const fileHref = `/org/${groupId}/members/${data.membershipId}`;

  const save = useMutation({
    mutationFn: (sent: PlanDocumentView) =>
      planCopyApi.save(groupId, data.membershipId, data.offerId, {
        document: toDocumentInput(sent),
        notify,
        ...(note.trim() ? { changeNote: note.trim() } : {}),
      }),
    onSuccess: (r, sent) => {
      setSaved(sent);
      setNote('');
      toast(
        notify
          ? `Salvo como v${r.version}. A ${first} recebe um aviso para aceitar.`
          : `Salvo como v${r.version}, sem aviso. A ${first} vê ao abrir o treino.`,
      );
      void qc.invalidateQueries({ queryKey: fileKeys.file(groupId, data.membershipId) });
    },
    onError: (err) =>
      toast(
        err instanceof ApiError && err.status < 500 && err.message
          ? err.message
          : 'Não deu para salvar agora.',
      ),
  });

  const { done, planned } = data.progress;
  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={fileHref} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft aria-hidden />
          Voltar à ficha
        </Link>
        {data.template && (
          <Link
            href={`/org/${groupId}/content/plans/${data.template.id}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Ver original
          </Link>
        )}
      </div>

      <section
        aria-label="Sobre esta cópia"
        className="flex gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4"
      >
        <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-bold text-foreground">{`Editando a cópia da ${first}`}</p>
          <p className="text-muted-foreground">
            {`${data.title} · v${data.version.version}${data.authorName ? ` · enviado por ${data.authorName}` : ''}. `}
            O original na biblioteca não muda.
          </p>
          <p className="text-muted-foreground">
            {planned
              ? `Sessões já feitas (${done} de ${planned}) ficam como estão. O que você salvar vira uma versão nova, que vale quando a ${first} aceitar.`
              : `Sessões já feitas (${done}) ficam como estão. O que você salvar vira uma versão nova, que vale quando a ${first} aceitar.`}
          </p>
          {data.pendingUpdate && (
            <p className="text-warning">
              {`Há uma versão esperando a ${first} aceitar: salvar aqui a substitui.`}
            </p>
          )}
        </div>
      </section>

      {problems.length > 0 && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <PlanDocumentEditor
        groupId={groupId}
        value={doc}
        onChange={setDoc}
        showWeekdays={data.schedule === 'CALENDAR'}
        student={{ name: data.studentName, lastSets: data.lastSets }}
      />

      <section
        aria-label="Salvar na cópia"
        className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{`Avisar a ${first} no app`}</span>
            <span className="block text-xs text-muted-foreground">
              Sem aviso, ela vê o treino novo na próxima vez que abrir.
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
            placeholder="Ex.: subi a carga do agachamento e troquei o stiff."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!dirty || save.isPending}
          onClick={() => {
            const p = documentProblems(doc);
            setProblems(p);
            if (p.length === 0) save.mutate(doc);
          }}
        >
          {save.isPending ? 'Salvando...' : `Salvar na cópia da ${first}`}
        </Button>
      </section>
    </div>
  );
}
