'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dumbbell, Lightbulb, Pin, Plus, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  canSendTemplate,
  communityToggleLabel,
  contentApi,
  filterLibrary,
  groupCan,
  LIBRARY_FILTERS,
  libraryAuthors,
  libraryCounts,
  libraryFormat,
  markdownLitePlainText,
  TIP_CATEGORY_LABEL,
  withWhomLabel,
  type LibraryFilter,
  type PlanTemplate,
  type TemplateKind,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { ListError, RowChevron, StatusBadge } from '@/components/content/content-ui';
import { useOrgGroup } from '@/components/org/org-shell';
import { CountTabs, PanelPageHead, PanelTable } from '@/components/org/panel-bits';
import { apiErrorText } from '@/components/org/seat-forms';
import { SendPlanForm } from '@/components/org/send-plan-form';
import { useOptionalSidePanel, type SidePanelContent } from '@/components/org/side-panel';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Chip, Switch } from '@/components/ui/selection';
import { Skeleton } from '@/components/ui/skeleton';

type Tab = TemplateKind | 'TIPS';

/**
 * Biblioteca da equipe (#405, Pn-08 e Pn-08d): os planos de treino, os planos
 * alimentares e as dicas. Cada plano se envia para alunos (painel lateral,
 * Pn-08b) e, à parte, pode ir para a comunidade (Pn-08c), onde os membros
 * adotam uma cópia. "Com quem" conta quem tem cópia, sem número abaixo de 5.
 */
export default function OrgContentPage() {
  const g = useOrgGroup();
  const router = useRouter();
  const qc = useQueryClient();
  const painel = useOptionalSidePanel();
  const [inline, setInline] = useState<SidePanelContent | null>(null);
  // `?tab=tips` volta para as dicas depois de apagar uma.
  const requested = useSearchParams().get('tab');
  const [tab, setTab] = useState<Tab>(requested === 'tips' ? 'TIPS' : 'WORKOUT');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [author, setAuthor] = useState('');
  const [publishing, setPublishing] = useState<PlanTemplate | null>(null);
  const [announce, setAnnounce] = useState(true);
  const [unpublishing, setUnpublishing] = useState<PlanTemplate | null>(null);
  const canSend = groupCan(g, 'member.plans');

  const plans = useQuery({
    queryKey: orgKeys.contentPlans(g.id),
    queryFn: () => contentApi.plans(g.id),
  });
  const tips = useTipsQuery(g.id);
  const base = `/org/${g.id}/content`;

  const close = () => (painel ? painel.close() : setInline(null));
  const openSend = (t: PlanTemplate) => {
    const c: SidePanelContent = {
      title: `Enviar “${t.title}”`,
      subtitle: libraryFormat(t),
      body: <SendPlanForm key={t.id} groupId={g.id} template={t} onDone={close} onCancel={close} />,
    };
    if (painel) painel.open(c);
    else setInline(c);
  };

  const publish = useMutation({
    mutationFn: (v: { id: string; published: boolean; announce?: boolean }) =>
      v.published
        ? contentApi.publishPlan(g.id, v.id, true, v.announce)
        : contentApi.publishPlan(g.id, v.id, false),
    onSuccess: (_t, v) => {
      setPublishing(null);
      setUnpublishing(null);
      toast(
        !v.published
          ? 'Tirado da comunidade · quem tem a cópia continua com ela'
          : v.announce
            ? 'Publicado · post no mural criado'
            : 'Publicado na comunidade',
      );
      void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });
    },
    onError: (err) => toast(apiErrorText(err, 'Não deu para mudar agora.')),
  });

  const all = plans.data ?? [];
  const counts = libraryCounts(all);
  const kind: TemplateKind = tab === 'TIPS' ? 'WORKOUT' : tab;
  const ofKind = all.filter((t) => t.kind === kind);
  const list = filterLibrary(all, { kind, filter, query, author: author || undefined });
  const authors = libraryAuthors(ofKind);

  return (
    <div className="space-y-4">
      <PanelPageHead
        title="Planos e dicas"
        subtitle="Sua biblioteca. Publique na comunidade o que quiser e envie direto para quem quiser."
        action={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/tips/new`}>Nova dica</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`${base}/plans/new?kind=NUTRITION`)}
            >
              Novo plano alimentar
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => router.push(`${base}/plans/new?kind=WORKOUT`)}
            >
              <Plus size={16} aria-hidden /> Novo plano de treino
            </Button>
          </>
        }
      />

      <CountTabs<Tab>
        label="Biblioteca"
        value={tab}
        onChange={(t) => {
          // O autor de uma aba pode não existir na outra.
          setTab(t);
          setAuthor('');
        }}
        tabs={[
          { key: 'WORKOUT', label: 'Treino', count: plans.data ? counts.WORKOUT : null },
          { key: 'NUTRITION', label: 'Alimentação', count: plans.data ? counts.NUTRITION : null },
          { key: 'TIPS', label: 'Dicas', count: tips.data?.length ?? null },
        ]}
      />

      {inline && (
        <section
          aria-label={inline.title}
          className="overflow-hidden rounded-2xl border border-subtle bg-background"
        >
          <h2 className="border-b border-subtle px-4 py-3 text-sm font-semibold">{inline.title}</h2>
          {inline.body}
        </section>
      )}

      {tab === 'TIPS' ? (
        <TipsList tips={tips} base={base} />
      ) : plans.isPending ? (
        <Skeleton className="h-48 rounded-2xl bg-card" />
      ) : plans.isError ? (
        <ListError title="Não deu para carregar os planos" onRetry={() => void plans.refetch()} />
      ) : ofKind.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Nenhum plano ainda"
          description={
            kind === 'WORKOUT'
              ? 'Monte um plano de treino a partir de um dos seus e envie para os alunos.'
              : 'Metas de calorias e macros e refeições salvas, para enviar ou publicar.'
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {LIBRARY_FILTERS.map((f) => (
              <Chip
                key={f.key}
                type="button"
                selected={filter === f.key}
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Chip>
            ))}
            <label className="relative ml-auto block w-full sm:w-56">
              <span className="sr-only">Buscar plano</span>
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar plano"
                className="pl-9"
              />
            </label>
            {authors.length > 1 && (
              <select
                aria-label="Autor"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">Autor: todos</option>
                {authors.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
          </div>

          <PanelTable
            label="Biblioteca de planos"
            head={['Plano', 'Autor', 'Formato', 'Com quem', 'Na comunidade', '']}
            minWidth={820}
          >
            {list.map((t) => {
              const community = communityToggleLabel(t);
              const published = Boolean(t.publishedAt);
              return (
                <tr key={t.id}>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`${base}/plans/${t.id}`}
                      className="font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t.title}
                    </Link>
                    {t.draft && (
                      <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        rascunho
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{t.authorName}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{libraryFormat(t)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{withWhomLabel(t.withWhom)}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <Switch
                        checked={published}
                        disabled={community.disabled || t.canEdit === false || publish.isPending}
                        label={`Na comunidade: ${t.title}`}
                        onCheckedChange={(on) => {
                          if (on) {
                            setAnnounce(true);
                            setPublishing(t);
                          } else {
                            setUnpublishing(t);
                          }
                        }}
                      />
                      <span className="min-w-0 leading-tight">
                        <span className="block text-xs font-medium">{community.label}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {community.hint}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {canSend && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={!canSendTemplate(t)}
                        aria-label={`Enviar “${t.title}” para alunos`}
                        onClick={() => openSend(t)}
                      >
                        <Send size={14} aria-hidden /> Enviar para…
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nenhum plano com esse filtro.
                </td>
              </tr>
            )}
          </PanelTable>
          <p className="text-xs text-muted-foreground">
            “Com quem” conta quem recebeu ou adotou uma cópia; abaixo de 5 pessoas não mostramos o
            número. Tirar da comunidade não apaga a cópia de ninguém.
          </p>
        </>
      )}

      <Dialog open={publishing !== null} onOpenChange={(o) => !o && setPublishing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Publicar na comunidade</DialogTitle>
            <DialogDescription>
              Os membros de {g.name} veem o plano e podem adotar uma cópia.
            </DialogDescription>
          </DialogHeader>
          {publishing && (
            <div className="space-y-4">
              <div className="space-y-1 rounded-2xl border border-subtle bg-card p-4">
                <span className="block text-[11px] font-extrabold uppercase tracking-[0.06em] text-primary">
                  Plano da academia
                </span>
                <b className="block font-display text-lg">{publishing.title}</b>
                <span className="block text-sm text-muted-foreground">
                  {libraryFormat(publishing)} · por {publishing.authorName}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Anunciar no mural</span>
                  <span className="block text-xs text-muted-foreground">
                    Post “{publishing.authorName.split(' ')[0]} publicou um plano”, com o botão Ver
                    plano.
                  </span>
                </span>
                <Switch
                  checked={announce}
                  onCheckedChange={setAnnounce}
                  label="Anunciar no mural"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Quem adotar fica com a própria cópia. Tirar da comunidade depois não apaga a cópia
                de ninguém.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setPublishing(null)}>
              Agora não
            </Button>
            <Button
              disabled={publish.isPending}
              onClick={() =>
                publishing && publish.mutate({ id: publishing.id, published: true, announce })
              }
            >
              Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={unpublishing !== null}
        onOpenChange={(o) => !o && setUnpublishing(null)}
        title="Tirar da comunidade?"
        description="Os membros deixam de ver o plano. Quem já tem a cópia continua com ela."
        confirmLabel="Tirar da comunidade"
        pendingLabel="Tirando…"
        pending={publish.isPending}
        onConfirm={() => unpublishing && publish.mutate({ id: unpublishing.id, published: false })}
      />
    </div>
  );
}

function TipsList({ tips, base }: { tips: ReturnType<typeof useTipsQuery>; base: string }) {
  if (tips.isPending) return <Skeleton className="h-24 rounded-2xl bg-card" />;
  if (tips.isError) {
    return <ListError title="Não deu para carregar as dicas" onRetry={() => void tips.refetch()} />;
  }
  if (!tips.data.length) {
    return (
      <EmptyState
        icon={Lightbulb}
        title="Nenhuma dica ainda"
        description="Dicas curtas de treino, alimentação ou hábitos, com imagem se quiser."
      />
    );
  }
  return (
    <ul className="space-y-2" aria-label="Dicas da comunidade">
      {tips.data.map((d) => (
        <li key={d.id}>
          <Link
            href={`${base}/tips/${d.id}`}
            className="flex items-center gap-3 rounded-2xl border border-subtle bg-card p-3 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-sm font-semibold">{d.title}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {TIP_CATEGORY_LABEL[d.category]} · {markdownLitePlainText(d.body)}
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge published={Boolean(d.publishedAt)} feminine />
                {d.pinned && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                    <Pin className="h-3 w-3" aria-hidden />
                    Fixada
                  </span>
                )}
              </span>
            </span>
            <RowChevron />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function useTipsQuery(groupId: string) {
  return useQuery({
    queryKey: orgKeys.contentTips(groupId),
    queryFn: () => contentApi.tips(groupId),
  });
}
