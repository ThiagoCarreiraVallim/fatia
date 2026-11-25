'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { IconName } from '@fatia/design';
import {
  DEMO_BANNER_TITLE,
  DEMO_GROUP_NUMBERS,
  DEMO_INTRO,
  DEMO_NOTICES,
  DEMO_SAMPLE_NOTE,
  DEMO_SESSION_HINT,
  demoApi,
  demoBannerText,
  demoCards,
  demoRemovedText,
  demoSessionExpiry,
  demoSessionPath,
  demoShortcuts,
  demoStats,
  demoStudentLine,
  firstStepsSummary,
  groupsApi,
  panelHref,
  SMALL_SAMPLE_LABEL,
  type DemoSession,
  type DemoSummary,
  type MyGroup,
} from '@fatia/api-client';
import { communityKeys, orgKeys } from '@/components/community/query-keys';
import { InviteQr } from '@/components/org/invite-qr';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * A comunidade de demonstração e os primeiros passos no painel (#412,
 * pranchas Pn-21 a Pn-21d). A demo é uma comunidade de verdade, marcada como
 * demo: "Entrar na demo" abre o painel dela, com a faixa "dados fictícios"
 * em toda tela. A API é quem barra o que a demo não faz.
 */

const card = 'rounded-card bg-card p-5 shadow-[inset_0_0_0_1px_hsl(var(--border))]';

export function useDemoState(enabled = true) {
  return useQuery({ queryKey: orgKeys.demo, queryFn: () => demoApi.get(), enabled });
}

/** "Primeiros passos" da comunidade de verdade; só a dona pergunta. */
export function useFirstSteps(g: Pick<MyGroup, 'id' | 'role' | 'isDemo'>) {
  return useQuery({
    queryKey: orgKeys.firstSteps(g.id),
    queryFn: () => demoApi.firstSteps(g.id),
    enabled: g.role === 'OWNER' && !g.isDemo,
    staleTime: 5 * 60_000,
  });
}

/** O nome da comunidade de verdade, para a faixa e o "Demo apagada". */
function useHomeName(homeGroupId: string | null | undefined): string | null {
  const mine = useQuery({ queryKey: communityKeys.mine, queryFn: () => groupsApi.mine() });
  return mine.data?.find((x) => x.id === homeGroupId)?.name ?? null;
}

// ---------------------------------------------------------------- faixa (Pn-21b)

/** A faixa fixa de toda tela da demo: "Demonstração · dados fictícios" e "Sair da demo". */
export function DemoBanner() {
  const state = useDemoState();
  const home = state.data?.homeGroupId ?? null;
  const homeName = useHomeName(home);
  return (
    <div
      role="note"
      className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-[hsl(var(--warning)/0.12)] px-4 py-3 shadow-[inset_0_0_0_1px_hsl(var(--warning)/0.45)] backdrop-blur"
    >
      <Icon name="eye" size={18} className="shrink-0 text-primary" />
      <b className="text-sm text-primary">{DEMO_BANNER_TITLE}</b>
      <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">
        {demoBannerText(homeName)}
      </span>
      {home && (
        <Link href={panelHref(home)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Sair da demo
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- dentro da demo (Pn-21b)

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-card bg-background p-4 shadow-[inset_0_0_0_1px_hsl(var(--border))]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="text-[13px] text-muted-foreground">{sub}</p>
    </div>
  );
}

/** A Visão geral da demo: a Ana, os números dela, a regra dos 5 e "Experimente". */
export function DemoOverview({ g }: { g: MyGroup }) {
  const state = useDemoState();
  const d = state.data?.demo;
  if (state.isLoading) return <Skeleton className="h-80 rounded-2xl" />;
  if (!d || d.groupId !== g.id) {
    return <p className="text-sm text-muted-foreground">A demonstração não está disponível.</p>;
  }
  const iniciais = d.student.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold md:text-3xl">{d.name}</h1>
          <p className="text-sm text-muted-foreground">
            É assim que o painel fica com alunos registrando.
          </p>
        </div>
        <OpenInAppButton />
        <RemoveDemoButton variant="ghost" />
      </div>

      <section aria-label={d.student.name} className={cn(card, 'flex flex-col gap-4')}>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--info)/0.18)] font-display text-sm font-bold text-info">
            {iniciais}
          </span>
          <div className="min-w-0 flex-1">
            <b className="block">{d.student.name}</b>
            <span className="block text-[13px] text-muted-foreground">{demoStudentLine(d)}</span>
          </div>
          <Link
            href={`${panelHref(d.groupId, 'members')}/${d.student.membershipId}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Ver ficha
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {demoStats(d).map((s) => (
            <Stat key={s.key} label={s.label} value={s.value} sub={s.sub} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="demo-numeros" className={card}>
          <h2 id="demo-numeros" className="mb-2 text-lg font-bold">
            Números da comunidade
          </h2>
          <ul className="divide-y divide-border">
            {DEMO_GROUP_NUMBERS.map((n) => (
              <li
                key={n}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <span>{n}</span>
                <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Icon name="lock" size={14} />
                  {SMALL_SAMPLE_LABEL}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-muted-foreground">{DEMO_SAMPLE_NOTE}</p>
        </section>
        <section aria-labelledby="demo-experimente" className={card}>
          <h2 id="demo-experimente" className="mb-2 text-lg font-bold">
            Experimente
          </h2>
          <ul className="divide-y divide-border">
            {demoShortcuts(d).map((s) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className="flex min-h-12 items-center gap-3 py-2 text-sm hover:text-foreground"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Icon name={s.icon as IconName} size={16} />
                  </span>
                  <span className="min-w-0 flex-1 font-semibold">{s.label}</span>
                  <Icon name="chevR" size={16} className="text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Demonstração (Pn-21, 21c, 21d)

/** A tela do item "Demonstração" / "Primeiros passos" do menu. */
export function DemoSectionPage({ g }: { g: MyGroup }) {
  const state = useDemoState();
  const steps = useFirstSteps(g);
  const [removed, setRemoved] = useState(false);
  const homeName = g.name;

  if (state.isLoading || steps.isLoading) return <Skeleton className="h-80 rounded-2xl" />;
  const d = state.data?.demo ?? null;
  const active = steps.data?.active ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold md:text-3xl">
          {active ? 'Primeiros passos' : 'Comunidade de demonstração'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {active
            ? 'Tudo pronto. Sua comunidade já está ativa.'
            : 'Veja o Fatia funcionando antes de convidar alguém.'}
        </p>
      </div>

      {active && steps.data ? (
        <FirstStepsCard g={g} demo={d} />
      ) : d ? (
        <DemoCard d={d} onRemoved={() => setRemoved(true)} />
      ) : (
        <NoDemoCard
          g={g}
          removed={removed}
          homeName={homeName}
          canCreate={state.data?.canCreate ?? false}
        />
      )}

      {!active && d && (
        <div className="grid gap-3 md:grid-cols-3">
          {DEMO_NOTICES.map((n) => (
            <div key={n.title} className={card}>
              <b className="block">{n.title}</b>
              <p className="mt-1 text-[13px] text-muted-foreground">{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DemoCard({ d, onRemoved }: { d: DemoSummary; onRemoved: () => void }) {
  return (
    <section
      aria-label={d.name}
      className="flex flex-col gap-4 rounded-card bg-[hsl(var(--brand)/0.08)] p-5 shadow-[inset_0_0_0_1px_hsl(var(--border))]"
    >
      <div className="flex items-center gap-4">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-display text-xl font-extrabold text-white"
          style={{ background: d.brandColor }}
        >
          AE
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-bold">{d.name}</h2>
          <p className="text-[13px] text-muted-foreground">{DEMO_INTRO}</p>
        </div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {demoCards(d).map((c) => (
          <li
            key={c.key}
            className="flex items-center gap-3 rounded-card bg-background p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border))]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon name={c.icon as IconName} size={18} />
            </span>
            <span className="min-w-0">
              <b className="block truncate">{c.title}</b>
              <span className="block truncate text-[13px] text-muted-foreground">{c.sub}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={panelHref(d.groupId)} className={buttonVariants()}>
          <Icon name="eye" size={16} /> Entrar na demo
        </Link>
        <OpenInAppButton />
        <div className="flex-1" />
        <RemoveDemoButton variant="ghost" onRemoved={onRemoved} />
      </div>
    </section>
  );
}

function NoDemoCard({
  g,
  removed,
  homeName,
  canCreate,
}: {
  g: MyGroup;
  removed: boolean;
  homeName: string;
  canCreate: boolean;
}) {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => demoApi.create(),
    onSuccess: (state) => qc.setQueryData(orgKeys.demo, state),
    onError: () => toast.error('Não deu para criar a demonstração. Tente de novo.'),
  });
  return (
    <section className={cn(card, 'flex flex-col items-center gap-3 py-12 text-center')}>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Icon name={removed ? 'trash' : 'eye'} size={22} />
      </span>
      <h2 className="text-lg font-bold">{removed ? 'Demo apagada' : 'Sem demonstração'}</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {removed
          ? demoRemovedText(homeName)
          : 'Crie uma comunidade de exemplo com uma aluna fictícia para ver o painel funcionando.'}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {canCreate && (
          <Button
            variant={removed ? 'outline' : 'default'}
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            <Icon name="repeat" size={16} />
            {removed ? 'Criar a demo de novo' : 'Criar a demonstração'}
          </Button>
        )}
        {removed && (
          <Link href={panelHref(g.id)} className={buttonVariants()}>
            Voltar para a visão geral
          </Link>
        )}
      </div>
    </section>
  );
}

function FirstStepsCard({ g, demo }: { g: MyGroup; demo: DemoSummary | null }) {
  const steps = useFirstSteps(g);
  if (!steps.data) return null;
  const s = firstStepsSummary(steps.data, g.name);
  return (
    <>
      <section className="flex flex-wrap items-center gap-4 rounded-card bg-primary-soft p-5 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-background text-primary">
          <Icon name="check" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-lg">{s.title}</b>
          <span className="text-[13px] text-muted-foreground">{s.sub}</span>
        </div>
        <Link href={panelHref(g.id)} className={buttonVariants()}>
          Ir para a visão geral
        </Link>
      </section>
      <p className="text-sm text-muted-foreground">
        Quer mostrar o Fatia para alguém da equipe?{' '}
        {demo ? (
          <Link href={panelHref(demo.groupId)} className="font-semibold text-foreground underline">
            Abrir a demonstração
          </Link>
        ) : (
          <CreateDemoLink />
        )}
      </p>
    </>
  );
}

function CreateDemoLink() {
  const qc = useQueryClient();
  const router = useRouter();
  const create = useMutation({
    mutationFn: () => demoApi.create(),
    onSuccess: (state) => {
      qc.setQueryData(orgKeys.demo, state);
      if (state.demo) router.push(panelHref(state.demo.groupId));
    },
  });
  return (
    <button
      type="button"
      onClick={() => create.mutate()}
      disabled={create.isPending}
      className="font-semibold text-foreground underline"
    >
      Abrir a demonstração
    </button>
  );
}

// ---------------------------------------------------------------- ações

/** "Apagar demo", com confirmação. Depois volta para o item do menu (Pn-21c). */
export function RemoveDemoButton({
  variant = 'ghost',
  onRemoved,
}: {
  variant?: 'ghost' | 'outline';
  onRemoved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();
  const state = useDemoState();
  const home = state.data?.homeGroupId ?? null;
  const remove = useMutation({
    mutationFn: () => demoApi.remove(),
    onSuccess: () => {
      setOpen(false);
      qc.setQueryData(orgKeys.demo, (old: typeof state.data) =>
        old ? { ...old, demo: null } : old,
      );
      onRemoved?.();
      // Apagada de dentro da demo: volta para o item da comunidade de verdade.
      if (!onRemoved && home) router.push(panelHref(home, 'demo'));
    },
    onError: () => toast.error('Não deu para apagar a demonstração. Tente de novo.'),
  });
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Icon name="trash" size={16} /> Apagar demo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar a demonstração?</DialogTitle>
            <DialogDescription>
              A Academia Exemplo e a Ana Exemplo saem, com tudo o que foi feito nelas. Sua
              comunidade de verdade não muda. Dá para criar de novo depois.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              Apagar demo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Abrir no app como Ana Exemplo": a sessão de 30 min, só leitura, por QR ou link. */
export function OpenInAppButton() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const open = useMutation({
    mutationFn: () => demoApi.openSession(),
    onSuccess: setSession,
    onError: () => toast.error('Não deu para abrir a sessão da demonstração.'),
  });
  const url =
    session && typeof window !== 'undefined'
      ? `${window.location.origin}${demoSessionPath(session.token)}`
      : null;
  return (
    <>
      <Button variant="outline" onClick={() => open.mutate()} disabled={open.isPending}>
        <Icon name="phone" size={16} /> Abrir no app como Ana Exemplo
      </Button>
      <Dialog open={Boolean(session)} onOpenChange={(o) => !o && setSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir como Ana Exemplo</DialogTitle>
            <DialogDescription>{DEMO_SESSION_HINT}</DialogDescription>
          </DialogHeader>
          {session && url && (
            <div className="flex flex-col items-center gap-3">
              <InviteQr url={url} size={176} />
              <p className="text-[13px] text-muted-foreground">
                {demoSessionExpiry(session.expiresAt)}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(url);
                    toast('Link copiado');
                  }}
                >
                  <Icon name="link" size={16} /> Copiar link
                </Button>
                <a href={url} target="_blank" rel="noreferrer" className={buttonVariants()}>
                  Abrir aqui
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
