'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Eye, Plus, Smartphone, Trash2, TriangleAlert } from 'lucide-react';
import {
  ApiError,
  WELCOME_COPY,
  WELCOME_KIND_OPTIONS,
  WELCOME_LIMITS,
  emptyWelcomePage,
  groupsApi,
  initialsOf,
  namesLine,
  welcomeApi,
  welcomeCharCount,
  welcomeDraftErrors,
  welcomeHighlights,
  welcomeStatus,
  type WelcomeEditorState,
  type WelcomeKind,
  type WelcomePageInput,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { WelcomePagesView } from '@/components/community/welcome-pages';
import { WelcomeStep } from '@/components/onboarding/onboarding-steps';
import { useOrgGroup } from '@/components/org/org-shell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Quem recebe o que o aluno compartilha (ADR 026): os nomes da página da equipe. */
const TEAM_ROLES = new Set(['OWNER', 'PROFESSIONAL', 'CREATOR']);

function apiErrorText(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

type Draft = { pages: WelcomePageInput[]; showOnJoin: boolean };

const toDraft = (s: WelcomeEditorState): Draft => ({
  pages: s.pages.map(({ kind, title, body, showTeam }) => ({ kind, title, body, showTeam })),
  showOnJoin: s.showOnJoin,
});

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

/** A moldura do celular da prévia (Pn-23): 300 × 600, como o aluno vê. */
function PhoneFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="region"
      aria-label={label}
      className="flex h-[600px] w-[300px] max-w-full shrink-0 flex-col overflow-hidden rounded-[36px] bg-background px-[18px] pb-5 shadow-[0_0_0_8px_hsl(var(--surface-2)),0_0_0_9px_hsl(var(--border))]"
    >
      {children}
    </div>
  );
}

/** O padrão do Fatia em miniatura (Pn-23c): a marca, a equipe e as três frases. */
function DefaultPreview({ groupName, team }: { groupName: string; team: string[] }) {
  const frases = welcomeHighlights({ groupName, sponsored: true, activeChallenge: null })
    .map((h) => h.title)
    .join(' · ');
  return (
    <PhoneFrame label="O que o aluno vê hoje">
      <div
        aria-hidden
        className="-mx-[18px] h-[150px] shrink-0 bg-[linear-gradient(160deg,hsl(var(--brand)),#1a0c02)]"
      />
      <span
        aria-hidden
        className="-mt-[30px] inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-brand font-display text-lg font-bold text-brand-foreground ring-4 ring-background"
      >
        {initialsOf(groupName)}
      </span>
      <div className="flex flex-col gap-2 pt-3.5">
        <b className="font-display text-xl">Bem-vinda à {groupName}</b>
        {team.length > 0 && (
          <span className="text-[13px] text-muted-foreground">{namesLine(team)}</span>
        )}
        <span className="text-[13px] text-muted-foreground">{frases}</span>
      </div>
    </PhoneFrame>
  );
}

/**
 * Boas-vindas da comunidade (#410, Pn-23, 23b e 23c): de 1 a 3 páginas que o
 * aluno vê ao entrar, entre as boas-vindas do Fatia e o que compartilhar.
 * Quem publica conteúdo (`content.publish`) edita; publicar vale para o
 * conjunto. Sem páginas, vale o padrão do Fatia.
 */
export default function OrgWelcomePage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const estado = useQuery({
    queryKey: orgKeys.welcome(g.id),
    queryFn: () => welcomeApi.editor(g.id),
  });
  const membros = useQuery({
    queryKey: orgKeys.members(g.id),
    queryFn: () => groupsApi.members(g.id),
  });
  const team = useMemo(
    () =>
      (membros.data ?? [])
        .filter((m) => m.status === 'ACTIVE' && TEAM_ROLES.has(m.role))
        .map((m) => ({ name: m.name })),
    [membros.data],
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [aba, setAba] = useState(0);
  const [comoAluno, setComoAluno] = useState(false);
  const [padrao, setPadrao] = useState(false);
  const salvo = estado.data ? toDraft(estado.data) : null;
  const atual = draft ?? salvo;
  const publicado = Boolean(estado.data?.publishedAt);

  const salvar = useMutation({
    mutationFn: (v: { draft: Draft; published: boolean }) =>
      welcomeApi.save(g.id, { ...v.draft, published: v.published }),
    onSuccess: (s, v) => {
      qc.setQueryData(orgKeys.welcome(g.id), s);
      setDraft(null);
      if (v.published !== publicado) {
        toast(
          v.published
            ? 'Publicado · aparece para quem entrar a partir de agora'
            : 'Voltou para rascunho',
        );
      } else {
        toast(v.published ? 'Salvo · os alunos já veem a versão nova' : 'Rascunho salvo');
      }
    },
    onError: (err) => toast(apiErrorText(err, 'Não deu para salvar agora. Tente de novo.')),
  });

  if (estado.isPending) return <Skeleton className="h-[640px] rounded-card bg-card" />;
  if (estado.isError || !atual || !estado.data) {
    return (
      <p role="alert" className="text-sm text-danger">
        Não deu para carregar as boas-vindas.{' '}
        <button type="button" className="underline" onClick={() => estado.refetch()}>
          Tentar novamente
        </button>
      </p>
    );
  }

  const pages = atual.pages;
  const i = Math.min(aba, Math.max(0, pages.length - 1));
  const page = pages[i];
  const errors = welcomeDraftErrors(pages);
  const valido = errors.every((e) => !e.title && !e.body);
  const sujo = !!salvo && !sameDraft(atual, salvo);
  const status = welcomeStatus({
    pages: draft ? pages.map((p, k) => ({ ...p, position: k + 1 })) : estado.data.pages,
    publishedAt: estado.data.publishedAt,
  });

  const mudar = (next: Draft) => setDraft(next);
  const mudarPagina = (patch: Partial<WelcomePageInput>) =>
    mudar({ ...atual, pages: pages.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const adicionar = () => {
    mudar({ ...atual, pages: [...pages, emptyWelcomePage()] });
    setAba(pages.length);
  };
  const remover = () => {
    mudar({ ...atual, pages: pages.filter((_, k) => k !== i) });
    setAba(Math.max(0, i - 1));
  };
  // Publicar sem página não existe; voltar a zero páginas despublica.
  const publicar = (published: boolean) =>
    salvar.mutate({ draft: atual, published: published && pages.length > 0 });

  const vazio = pages.length === 0;
  const verComoAluno = (
    <Button
      variant="outline"
      className="gap-1.5"
      onClick={() => setComoAluno(true)}
      disabled={vazio}
    >
      <Smartphone size={16} aria-hidden /> Ver como aluno
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-h3 font-bold">{WELCOME_COPY.title}</h1>
          <p className="text-sm text-muted-foreground">{WELCOME_COPY.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-3 py-1 text-xs font-semibold">
            {status.tone !== 'default' && (
              <i
                aria-hidden
                className={cn(
                  'h-2 w-2 rounded-full',
                  status.tone === 'published' ? 'bg-primary' : 'bg-steps',
                )}
              />
            )}
            {status.label}
          </span>
          {!vazio && verComoAluno}
          {!vazio && (
            <Button
              disabled={salvar.isPending || (!publicado && !valido)}
              onClick={() => publicar(!publicado)}
            >
              {publicado ? 'Voltar para rascunho' : 'Publicar'}
            </Button>
          )}
        </div>
      </div>

      {vazio ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col items-center justify-center gap-2.5 rounded-card bg-card px-6 py-10 text-center">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-surface-3">
              <BookOpen size={20} aria-hidden />
            </span>
            <b className="text-lg">{WELCOME_COPY.emptyTitle}</b>
            <p className="max-w-[420px] text-sm text-muted-foreground">{WELCOME_COPY.emptyBody}</p>
            <div className="mt-1.5 flex flex-wrap justify-center gap-2">
              <Button className="gap-1.5" onClick={adicionar}>
                <Plus size={16} aria-hidden /> Criar a primeira página
              </Button>
              <Button variant="outline" className="gap-1.5" onClick={() => setPadrao(true)}>
                <Smartphone size={16} aria-hidden /> Ver o padrão
              </Button>
            </div>
            {sujo && (
              // Apagou todas as páginas: salvar volta ao padrão e despublica.
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => publicar(false)}
                disabled={salvar.isPending}
              >
                Salvar sem páginas
              </Button>
            )}
          </div>
          <div className="flex flex-col items-center gap-3.5 rounded-card bg-card px-5 py-5">
            <b className="self-start text-sm">O que o aluno vê hoje</b>
            <DefaultPreview groupName={g.name} team={team.map((t) => t.name)} />
          </div>
        </div>
      ) : (
        page && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <form
              aria-label="Página de boas-vindas"
              className="min-w-0 space-y-4 rounded-card bg-card p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (valido) salvar.mutate({ draft: atual, published: publicado });
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  role="tablist"
                  aria-label="Páginas"
                  className="flex min-w-0 flex-wrap gap-1 rounded-xl bg-surface-2 p-1"
                >
                  {pages.map((p, k) => (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={k === i}
                      onClick={() => setAba(k)}
                      className={cn(
                        'max-w-[220px] truncate rounded-lg px-3 py-1.5 text-sm font-semibold',
                        k === i
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground',
                        (errors[k]?.title || errors[k]?.body) && 'text-danger',
                      )}
                    >
                      {k + 1} · {p.title.trim() || 'Página nova'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  {pages.length < WELCOME_LIMITS.pages && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={adicionar}
                    >
                      <Plus size={16} aria-hidden /> Página
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-muted-foreground"
                    onClick={remover}
                    aria-label={`Remover a página ${i + 1}`}
                  >
                    <Trash2 size={16} aria-hidden />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Tipo da página</span>
                <Segmented<WelcomeKind>
                  label="Tipo da página"
                  options={WELCOME_KIND_OPTIONS}
                  value={page.kind}
                  onChange={(kind) => mudarPagina({ kind })}
                  className="w-full sm:w-[340px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="welcome-title">Título</Label>
                <Input
                  id="welcome-title"
                  value={page.title}
                  maxLength={WELCOME_LIMITS.title + 20}
                  aria-invalid={Boolean(errors[i]?.title)}
                  onChange={(e) => mudarPagina({ title: e.target.value })}
                />
                {errors[i]?.title && page.title.length > 0 && (
                  <p className="text-xs text-danger">{errors[i]?.title}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="welcome-body">Texto</Label>
                <Textarea
                  id="welcome-body"
                  rows={6}
                  value={page.body}
                  aria-invalid={Boolean(errors[i]?.body)}
                  aria-describedby="welcome-body-hint"
                  onChange={(e) => mudarPagina({ body: e.target.value })}
                />
                <div
                  id="welcome-body-hint"
                  className="flex flex-wrap justify-between gap-2 text-xs"
                >
                  <span className="text-muted-foreground">{WELCOME_COPY.bodyHint}</span>
                  <span
                    className={cn(
                      'tabular-nums',
                      errors[i]?.body ? 'text-danger' : 'text-muted-foreground',
                    )}
                  >
                    {welcomeCharCount(page.body.trim())} de {WELCOME_LIMITS.body}
                  </span>
                </div>
                {errors[i]?.body && <p className="text-xs text-danger">{errors[i]?.body}</p>}
              </div>

              <div className="flex items-start gap-3 rounded-xl bg-[hsl(var(--danger)/0.08)] px-3.5 py-3 ring-1 ring-inset ring-[hsl(var(--danger)/0.35)]">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
                <span>
                  <b className="block text-[13.5px]">{WELCOME_COPY.healthTitle}</b>
                  <span className="text-xs text-muted-foreground">{WELCOME_COPY.healthBody}</span>
                </span>
              </div>

              <div className="divide-y divide-border rounded-xl bg-surface-2">
                <label className="flex items-center gap-3 px-3.5 py-3">
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm">{WELCOME_COPY.showTeam}</b>
                    <span className="text-xs text-muted-foreground">
                      {team.length > 0
                        ? namesLine(team.map((t) => t.name))
                        : 'Ninguém da equipe ainda'}
                    </span>
                  </span>
                  <Switch
                    label={WELCOME_COPY.showTeam}
                    checked={page.showTeam}
                    onCheckedChange={(showTeam) => mudarPagina({ showTeam })}
                  />
                </label>
                <label className="flex items-center gap-3 px-3.5 py-3">
                  <Eye size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm">{WELCOME_COPY.showOnJoin}</b>
                    <span className="text-xs text-muted-foreground">
                      {WELCOME_COPY.showOnJoinHint}
                    </span>
                  </span>
                  <Switch
                    label={WELCOME_COPY.showOnJoin}
                    checked={atual.showOnJoin}
                    onCheckedChange={(showOnJoin) => mudar({ ...atual, showOnJoin })}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {sujo && (
                  <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                    Descartar
                  </Button>
                )}
                <Button type="submit" disabled={!valido || !sujo || salvar.isPending}>
                  {publicado ? 'Salvar' : 'Salvar rascunho'}
                </Button>
              </div>
            </form>

            <div className="flex flex-col items-center gap-3.5 rounded-card bg-card px-5 py-5">
              <div className="flex w-full items-center justify-between gap-2">
                <b className="text-sm">Prévia no celular</b>
                <span className="text-xs text-muted-foreground">
                  o aluno também pode rever em Sobre
                </span>
              </div>
              <PhoneFrame label="Prévia no celular">
                <WelcomePagesView
                  compact
                  note={false}
                  groupName={g.name}
                  avatarUrl={g.avatarUrl}
                  pages={pages}
                  team={team}
                  index={i}
                  onIndexChange={setAba}
                />
              </PhoneFrame>
            </div>
          </div>
        )
      )}

      <Dialog open={comoAluno} onOpenChange={setComoAluno}>
        <DialogContent className="w-auto max-w-none border-none bg-transparent p-0 shadow-none [&>button:last-child]:hidden">
          <DialogTitle className="sr-only">Como o aluno vê</DialogTitle>
          <PhoneFrame label="Como o aluno vê">
            <WelcomePagesView
              compact
              groupName={g.name}
              avatarUrl={g.avatarUrl}
              pages={pages}
              team={team}
              onSkip={() => setComoAluno(false)}
              onFinish={() => setComoAluno(false)}
            />
          </PhoneFrame>
        </DialogContent>
      </Dialog>

      <Dialog open={padrao} onOpenChange={setPadrao}>
        <DialogContent className="w-auto max-w-none border-none bg-transparent p-0 shadow-none [&>button:last-child]:hidden">
          <DialogTitle className="sr-only">O padrão do Fatia</DialogTitle>
          <PhoneFrame label="O padrão do Fatia">
            <div className="-mx-[18px] flex-1 overflow-y-auto px-5 pt-6 [&>div]:min-h-full">
              <WelcomeStep
                groupName={g.name}
                team={(membros.data ?? []).filter(
                  (m) => m.status === 'ACTIVE' && TEAM_ROLES.has(m.role),
                )}
                sponsored
                activeChallenge={null}
                segment={0}
                onContinue={() => setPadrao(false)}
              />
            </div>
          </PhoneFrame>
        </DialogContent>
      </Dialog>
    </div>
  );
}
