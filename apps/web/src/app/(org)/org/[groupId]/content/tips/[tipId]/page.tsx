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
import { ImageField, type ImageValue } from '@/components/content/image-field';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { useOrgGroup } from '@/components/org/org-shell';
import { Badge } from '@/components/ui/badge';
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

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

/** Nova dica (`/tips/new`) ou a edição de uma existente. */
export default function OrgTipPage() {
  const g = useOrgGroup();
  const { tipId } = useParams<{ tipId: string }>();
  const nova = tipId === 'new';
  // A equipe não tem rota de uma dica só: a lista já traz tudo.
  const dicas = useQuery({
    queryKey: orgKeys.contentTips(g.id),
    queryFn: () => contentApi.tips(g.id),
    enabled: !nova,
  });

  if (nova) return <TipEditor key="new" groupId={g.id} tip={null} />;
  if (dicas.isPending) return <Skeleton className="h-64 max-w-3xl rounded-2xl" />;
  const tip = dicas.data?.find((d) => d.id === tipId);
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
  const editavel = tip === null || tip.canEdit !== false;
  useTopBarTitle(tip?.title ?? 'Nova dica');

  const [titulo, setTitulo] = useState(tip?.title ?? '');
  const [categoria, setCategoria] = useState<TipCategory>(tip?.category ?? 'GENERAL');
  const [corpo, setCorpo] = useState(tip?.body ?? '');
  const [imagem, setImagem] = useState<ImageValue | null>(
    tip?.image ? { fileId: tip.image.id, url: tip.image.url } : null,
  );
  const [previa, setPrevia] = useState(false);
  const [apagando, setApagando] = useState(false);

  const invalidar = () => qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });

  const salvar = useMutation({
    mutationFn: () => {
      const input = {
        title: titulo.trim(),
        body: corpo.trim(),
        category: categoria,
        imageFileId: imagem?.fileId ?? null,
      };
      return tip
        ? contentApi.updateTip(groupId, tip.id, input)
        : contentApi.createTip(groupId, input);
    },
    onSuccess: (d) => {
      toast(tip ? 'Dica salva.' : 'Rascunho criado. Publique quando estiver pronta.');
      void invalidar();
      if (!tip) router.replace(`/org/${groupId}/content/tips/${d.id}`);
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para salvar agora.')),
  });

  const estado = useMutation({
    mutationFn: (s: { published?: boolean; pinned?: boolean }) =>
      contentApi.setTipState(groupId, tip!.id, s),
    onSuccess: () => void invalidar(),
    onError: (err) => toast(erroDaApi(err, 'Não deu para mudar agora.')),
  });

  const apagar = useMutation({
    mutationFn: () => contentApi.deleteTip(groupId, tip!.id),
    onSuccess: () => {
      toast('Dica apagada.');
      void invalidar();
      router.replace(`/org/${groupId}/content`);
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para apagar agora.')),
  });

  return (
    <div className="max-w-3xl space-y-4">
      {tip && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={tip.publishedAt ? 'default' : 'secondary'}>
            {tip.publishedAt ? 'Publicada' : 'Rascunho'}
          </Badge>
          {tip.pinned && <Badge variant="outline">Fixada</Badge>}
          <span className="text-xs text-muted-foreground">Por {tip.authorName}</span>
        </div>
      )}
      {!editavel && (
        <p className="rounded-xl bg-muted p-3 text-sm">
          Só quem publicou, ou o dono, muda esta dica.
        </p>
      )}

      <form
        aria-label="Dica"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!titulo.trim() || !corpo.trim()) {
            toast('Preencha o título e o texto da dica.');
            return;
          }
          salvar.mutate();
        }}
      >
        <fieldset
          disabled={!editavel}
          className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
        >
          <legend className="sr-only">Dados da dica</legend>
          <div className="space-y-1">
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              maxLength={100}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="categoria">Categoria</Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v as TipCategory)}>
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
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="corpo">Texto</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPrevia(!previa)}>
                {previa ? 'Editar' : 'Ver prévia'}
              </Button>
            </div>
            {previa ? (
              <div
                className="min-h-32 rounded-xl border border-subtle p-3"
                aria-label="Prévia da dica"
              >
                <MarkdownLite source={corpo || 'Nada escrito ainda.'} />
              </div>
            ) : (
              <Textarea
                id="corpo"
                rows={8}
                maxLength={MAX_TIP_BODY}
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
              />
            )}
            <p className="text-xs text-muted-foreground">
              {`**negrito**, *itálico*, listas com "- " e links [texto](https://…). ${corpo.length}/${MAX_TIP_BODY}`}
            </p>
          </div>
          {editavel && (
            <ImageField groupId={groupId} label="Imagem" value={imagem} onChange={setImagem} />
          )}
        </fieldset>

        {editavel && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={salvar.isPending}>
              {tip ? 'Salvar' : 'Criar rascunho'}
            </Button>
            {tip && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={estado.isPending}
                  onClick={() =>
                    estado.mutate(
                      { published: !tip.publishedAt },
                      {
                        onSuccess: (d) =>
                          toast(d.publishedAt ? 'Publicada para os membros.' : 'Saiu do ar.'),
                      },
                    )
                  }
                >
                  {tip.publishedAt ? 'Tirar do ar' : 'Publicar'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={estado.isPending}
                  onClick={() => estado.mutate({ pinned: !tip.pinned })}
                >
                  {tip.pinned ? 'Desafixar' : 'Fixar no topo'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setApagando(true)}>
                  Apagar
                </Button>
              </>
            )}
            <Link href={`/org/${groupId}/content`} className={buttonVariants({ variant: 'ghost' })}>
              Voltar
            </Link>
          </div>
        )}
      </form>

      {tip && (
        <ConfirmDialog
          open={apagando}
          onOpenChange={setApagando}
          title="Apagar esta dica?"
          description="Ela some para os membros, e a imagem é apagada junto."
          confirmLabel="Apagar"
          pendingLabel="Apagando..."
          pending={apagar.isPending}
          onConfirm={() => apagar.mutate()}
        />
      )}
    </div>
  );
}
