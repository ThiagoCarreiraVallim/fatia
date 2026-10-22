'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ApiError,
  contentApi,
  MAX_TIP_BODY,
  TIP_CATEGORIES,
  TIP_CATEGORY_LABEL,
  type GroupTip,
  type TipCategory,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import {
  CheckableRow,
  DeleteButton,
  PublishCard,
  WritePreviewTabs,
} from '@/components/content/content-ui';
import { ImageField, type ImageValue } from '@/components/content/image-field';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { useOrgGroup } from '@/components/org/org-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

/** Nova dica (`/tips/new`) ou a edição de uma existente. */
export default function OrgTipPage() {
  const g = useOrgGroup();
  const { tipId } = useParams<{ tipId: string }>();
  const isNew = tipId === 'new';
  // A equipe não tem rota de uma dica só: a lista já traz tudo.
  const tips = useQuery({
    queryKey: orgKeys.contentTips(g.id),
    queryFn: () => contentApi.tips(g.id),
    enabled: !isNew,
  });

  if (isNew) return <TipEditor key="new" groupId={g.id} tip={null} />;
  if (tips.isPending) return <Skeleton className="h-64 max-w-3xl rounded-2xl" />;
  const tip = tips.data?.find((d) => d.id === tipId);
  if (!tip) {
    return (
      <EmptyState
        title="Dica não encontrada"
        description="Ela foi apagada, ou o endereço está errado."
      />
    );
  }
  return <TipEditor key={tip.id} groupId={g.id} tip={tip} />;
}

function TipEditor({ groupId, tip }: { groupId: string; tip: GroupTip | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const canEdit = tip === null || tip.canEdit !== false;
  useTopBarTitle(tip?.title ?? 'Nova dica');

  const [title, setTitle] = useState(tip?.title ?? '');
  const [category, setCategory] = useState<TipCategory>(tip?.category ?? 'GENERAL');
  const [body, setBody] = useState(tip?.body ?? '');
  const [image, setImage] = useState<ImageValue | null>(
    tip?.image ? { fileId: tip.image.id, url: tip.image.url } : null,
  );
  const [deleting, setDeleting] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  // Publicar manda a versão salva: com mudança pendente, "Publicar" espera.
  const snapshot = JSON.stringify([title, category, body, image?.fileId]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;

  const invalidate = () => qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });

  const save = useMutation({
    mutationFn: (_sent: string) => {
      const input = {
        title: title.trim(),
        body: body.trim(),
        category,
        imageFileId: image?.fileId ?? null,
      };
      return tip
        ? contentApi.updateTip(groupId, tip.id, input)
        : contentApi.createTip(groupId, input);
    },
    onSuccess: (d, sent) => {
      setSavedSnapshot(sent);
      toast(tip ? 'Dica salva.' : 'Rascunho criado. Publique quando estiver pronta.');
      void invalidate();
      if (!tip) router.replace(`/org/${groupId}/content/tips/${d.id}`);
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para salvar agora.')),
  });

  const setState = useMutation({
    mutationFn: (s: { published?: boolean; pinned?: boolean }) =>
      contentApi.setTipState(groupId, tip!.id, s),
    onSuccess: (d, s) => {
      if (s.published !== undefined) {
        setUnpublishing(false);
        toast(d.publishedAt ? 'Publicada para os membros.' : 'Saiu do ar.');
      } else if (s.pinned !== undefined) {
        // Fixar vale na hora, sem "Salvar": o aviso é o que confirma que valeu.
        toast(d.pinned ? 'Fixada no topo das dicas.' : 'Não está mais fixada.');
      }
      void invalidate();
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para mudar agora.')),
  });

  const remove = useMutation({
    mutationFn: () => contentApi.deleteTip(groupId, tip!.id),
    onSuccess: () => {
      toast('Dica apagada.');
      void invalidate();
      // De volta à lista, na aba de dicas: recriá-la abria em Planos.
      router.replace(`/org/${groupId}/content?tab=tips`);
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para apagar agora.')),
  });

  return (
    <div className="max-w-3xl space-y-4">
      {tip && (
        <PublishCard
          published={Boolean(tip.publishedAt)}
          feminine
          authorName={tip.authorName}
          canEdit={canEdit}
          dirty={dirty}
          pending={setState.isPending && setState.variables?.published !== undefined}
          publishedHint="Os membros veem esta dica na comunidade."
          draftHint="Só a equipe vê. Publique quando estiver pronta."
          onPublish={() => setState.mutate({ published: true })}
          onUnpublish={() => setUnpublishing(true)}
        >
          {/* Interruptor, e não mais um botão igual a "Publicar": fixar é um
              estado ligado/desligado, e vale na hora. */}
          {canEdit && (
            <CheckableRow
              role="switch"
              label="Fixar no topo"
              detail="Aparece antes das outras"
              checked={tip.pinned}
              disabled={setState.isPending}
              onChange={() => setState.mutate({ pinned: !tip.pinned })}
            />
          )}
        </PublishCard>
      )}
      {!canEdit && (
        <p className="rounded-xl bg-muted p-3 text-sm">
          Só quem publicou, ou o dono, muda esta dica.
        </p>
      )}

      <form
        aria-label="Dica"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !body.trim()) {
            toast('Preencha o título e o texto da dica.');
            return;
          }
          save.mutate(snapshot);
        }}
      >
        <fieldset
          disabled={!canEdit}
          aria-label="Dados da dica"
          className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
        >
          <div className="space-y-1">
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="categoria">Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TipCategory)}>
              <SelectTrigger id="categoria" className="w-full sm:w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIP_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {TIP_CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <WritePreviewTabs
              write={
                <div className="space-y-1">
                  <Label htmlFor="corpo">Texto</Label>
                  <Textarea
                    id="corpo"
                    rows={8}
                    maxLength={MAX_TIP_BODY}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </div>
              }
              preview={
                <div
                  className="min-h-32 rounded-xl border border-subtle p-3"
                  aria-label="Prévia da dica"
                >
                  <MarkdownLite source={body || 'Nada escrito ainda.'} />
                </div>
              }
            />
            <p className="text-xs text-muted-foreground">
              {`**negrito**, *itálico*, listas com "- " e links [texto](https://…). ${body.length}/${MAX_TIP_BODY}`}
            </p>
          </div>
          {canEdit && (
            <ImageField groupId={groupId} label="Imagem" value={image} onChange={setImage} />
          )}
        </fieldset>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending || (tip !== null && !dirty)}>
              {tip === null ? 'Criar rascunho' : dirty ? 'Salvar mudanças' : 'Tudo salvo'}
            </Button>
            <Link
              href={`/org/${groupId}/content?tab=tips`}
              className={buttonVariants({ variant: 'ghost' })}
            >
              Voltar
            </Link>
          </div>
        )}
      </form>

      {/* Longe do "Salvar", com cor e ícone de perigo. */}
      {canEdit && tip && (
        <div className="border-t border-subtle pt-4">
          <DeleteButton
            label="Apagar dica"
            pending={remove.isPending}
            onClick={() => setDeleting(true)}
          />
        </div>
      )}

      {tip && (
        <>
          <ConfirmDialog
            open={unpublishing}
            onOpenChange={setUnpublishing}
            title="Tirar esta dica do ar?"
            description="Ela some para os membros na hora."
            confirmLabel="Tirar do ar"
            pendingLabel="Tirando do ar..."
            pending={setState.isPending}
            onConfirm={() => setState.mutate({ published: false })}
          />
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title="Apagar esta dica?"
            description="Ela some para os membros, e a imagem é apagada junto."
            confirmLabel="Apagar"
            pendingLabel="Apagando..."
            pending={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        </>
      )}
    </div>
  );
}
