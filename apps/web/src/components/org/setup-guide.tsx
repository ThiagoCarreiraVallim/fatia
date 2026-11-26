'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { IconName } from '@fatia/design';
import {
  demoApi,
  nextSetupItem,
  panelApi,
  panelHref,
  reviewApi,
  SETUP_ACTION_LABEL,
  SETUP_FOOTER,
  SETUP_ITEM_COPY,
  setupApi,
  setupHeadline,
  setupItemAction,
  setupItemHref,
  setupItemSub,
  setupKicker,
  setupPercent,
  setupStats,
  splitReview,
  type CommunitySetup,
  type ManualSetupStep,
  type MyGroup,
  type SetupItemKey,
  type SetupItemState,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * O guia de primeiros passos do dono (#372, prancha Onb-Criador-Web): o
 * checklist de 9 passos no topo do Início, o cartão da demo (#412) e os 4
 * números vazios com a regra dos 5. "Fazer" leva à tela do passo; o que a
 * ação faz marca sozinho; o resto se marca no círculo e se desfaz.
 */

const ITEM_ICON: Record<SetupItemKey, IconName> = {
  CREATE: 'check',
  BRAND: 'palette',
  CATEGORIES: 'shield',
  TEAM: 'users',
  MEMBERS: 'qr',
  CHALLENGE: 'trophy',
  PLAN: 'dumbbell',
  EQUIPMENT: 'sliders',
  ACCESS: 'shield',
};

const card = 'rounded-card bg-card shadow-[inset_0_0_0_1px_hsl(var(--border))]';

/** O estado do guia; só a dona da comunidade de verdade pergunta. */
export function useSetup(g: Pick<MyGroup, 'id' | 'role' | 'isDemo'>) {
  return useQuery({
    queryKey: orgKeys.setup(g.id),
    queryFn: () => setupApi.get(g.id),
    enabled: g.role === 'OWNER' && !g.isDemo,
  });
}

/** Marcar, desmarcar, esconder e repetir o guia, com o painel em dia. */
export function useSetupActions(groupId: string) {
  const qc = useQueryClient();
  const done = (s: CommunitySetup) => {
    qc.setQueryData(orgKeys.setup(groupId), s);
    void qc.invalidateQueries({ queryKey: orgKeys.firstSteps(groupId) });
  };
  const step = useMutation({
    mutationFn: ({ key, on }: { key: ManualSetupStep; on: boolean }) =>
      setupApi.setStep(groupId, key, on),
    onSuccess: done,
    onError: () => toast.error('Não deu para marcar agora. Tente de novo.'),
  });
  const guide = useMutation({
    mutationFn: (visible: boolean) => setupApi.setGuide(groupId, visible),
    onSuccess: done,
    onError: () => toast.error('Não deu para mudar o guia agora. Tente de novo.'),
  });
  return { step, guide };
}

/** "Repetir o guia" do menu do perfil: volta o checklist ao Início. */
export function useRepeatGuide(groupId: string) {
  const router = useRouter();
  const qc = useQueryClient();
  // Callbacks no useMutation, não no mutate: o menu fecha (desmonta) antes da resposta.
  const repeat = useMutation({
    mutationFn: () => setupApi.setGuide(groupId, true),
    onSuccess: (s) => {
      qc.setQueryData(orgKeys.setup(groupId), s);
      router.push(panelHref(groupId));
    },
    onError: () => toast.error('Não deu para repetir o guia agora. Tente de novo.'),
  });
  return () => repeat.mutate();
}

/** O Início enquanto o guia está à vista. */
export function SetupHome({ g, setup }: { g: MyGroup; setup: CommunitySetup }) {
  const { step, guide } = useSetupActions(g.id);
  const next = nextSetupItem(setup);
  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-sm text-muted-foreground">{setupKicker(g.createdAt)}</p>
        <h1 className="font-display text-2xl font-extrabold md:text-[28px]">
          {setup.complete ? `${g.name} está pronta` : `Vamos deixar a ${g.name} pronta`}
        </h1>
      </header>

      <DemoInvite />

      <section aria-labelledby="primeiros-passos" className={cn(card, 'p-4 md:p-6')}>
        <div className="flex items-center gap-4">
          <p className="shrink-0 font-display text-4xl font-extrabold tabular-nums">
            {setup.done}
            <span className="text-lg text-muted-foreground">/{setup.total}</span>
          </p>
          <div className="min-w-0 flex-1">
            <h2 id="primeiros-passos" className="text-lg font-bold">
              {setupHeadline(setup)}
            </h2>
            <p className="text-[13px] text-muted-foreground">
              {setup.complete
                ? 'Tudo feito. Esconda o guia quando quiser.'
                : 'Toque em Fazer. O que já está pronto fica riscado.'}
            </p>
            <div
              role="progressbar"
              aria-label="Passos feitos"
              aria-valuemin={0}
              aria-valuemax={setup.total}
              aria-valuenow={setup.done}
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: setupPercent(setup) }}
              />
            </div>
          </div>
        </div>

        <ul className="mt-5 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {setup.items.map((i) => (
            <SetupItem
              key={i.key}
              g={g}
              item={i}
              kind={setup.kind}
              next={i.key === next}
              busy={step.isPending && step.variables?.key === i.key}
              onToggle={(on) => step.mutate({ key: i.key as ManualSetupStep, on })}
            />
          ))}
        </ul>
      </section>

      <SetupStatCards g={g} first />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">{SETUP_FOOTER}</p>
        <Button
          variant="text"
          size="sm"
          disabled={guide.isPending}
          onClick={() => guide.mutate(false)}
        >
          Esconder o guia
        </Button>
      </div>
    </div>
  );
}

function SetupItem({
  g,
  item,
  kind,
  next,
  busy,
  onToggle,
}: {
  g: MyGroup;
  item: SetupItemState;
  kind: CommunitySetup['kind'];
  next: boolean;
  busy: boolean;
  onToggle: (on: boolean) => void;
}) {
  const action = setupItemAction(item);
  const copy = SETUP_ITEM_COPY[item.key];
  const manual = action !== 'done';
  const sub = setupItemSub(item.key, {
    slug: g.slug,
    kind,
    type: g.type,
    requiredSharingScopes: g.requiredSharingScopes,
  });
  return (
    <li
      className={cn(
        'flex min-h-[76px] items-center gap-3 rounded-[14px] bg-background p-3 shadow-[inset_0_0_0_1px_hsl(var(--border))]',
        next && 'shadow-[inset_0_0_0_1.5px_hsl(var(--primary))]',
      )}
    >
      {manual ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={item.done}
          aria-label={`Marcar "${copy.title}" como feito`}
          disabled={busy}
          onClick={() => onToggle(!item.done)}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            item.done ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon name={item.done ? 'check' : ITEM_ICON[item.key]} size={18} />
        </button>
      ) : (
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary"
        >
          <Icon name="check" size={18} />
        </span>
      )}
      <span className={cn('min-w-0 flex-1', item.done && 'opacity-60')}>
        <b className={cn('block text-[14.5px]', item.done && 'line-through')}>{copy.title}</b>
        <span className="block truncate text-[13px] text-muted-foreground">{sub}</span>
      </span>
      {action === 'do' ? (
        <Link
          href={setupItemHref(g.id, item.key)}
          className={buttonVariants({ variant: next ? 'default' : 'outline', size: 'sm' })}
        >
          {SETUP_ACTION_LABEL.do}
          <span className="sr-only">: {copy.title}</span>
        </Link>
      ) : action === 'undo' ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onToggle(false)}>
          {SETUP_ACTION_LABEL.undo}
          <span className="sr-only">: {copy.title}</span>
        </Button>
      ) : (
        <span className="px-2 text-xs font-semibold text-muted-foreground">
          {SETUP_ACTION_LABEL.done}
        </span>
      )}
    </li>
  );
}

/** "Ver a comunidade de demonstração" (#412): entra na demo, ou leva à tela dela. */
function DemoInvite() {
  const state = useQuery({ queryKey: orgKeys.demo, queryFn: () => demoApi.get() });
  const demo = state.data?.demo ?? null;
  const href = demo ? panelHref(demo.groupId) : null;
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-card bg-[hsl(var(--brand)/0.12)] p-4 shadow-[inset_0_0_0_1px_hsl(var(--brand)/0.45)] md:px-5">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-brand-foreground"
      >
        <Icon name="eye" size={18} />
      </span>
      <span className="min-w-0 flex-1 basis-56">
        <b className="block">Ver a comunidade de demonstração</b>
        <span className="text-[13px] text-muted-foreground">
          Uma academia pronta, com membros, planos e desafio de exemplo. Nada do que você fizer lá
          vale aqui.
        </span>
      </span>
      <DemoLink href={href} />
    </section>
  );
}

function DemoLink({ href }: { href: string | null }) {
  const qc = useQueryClient();
  const router = useRouter();
  const create = useMutation({
    mutationFn: () => demoApi.create(),
    onSuccess: (state) => {
      qc.setQueryData(orgKeys.demo, state);
      if (state.demo) router.push(panelHref(state.demo.groupId));
    },
    onError: () => toast.error('Não deu para abrir a demonstração. Tente de novo.'),
  });
  if (href) {
    return (
      <Link href={href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        Abrir a demo <Icon name="chevR" size={14} />
      </Link>
    );
  }
  return (
    <Button variant="outline" size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
      Abrir a demo <Icon name="chevR" size={14} />
    </Button>
  );
}

/**
 * Os 4 números do Início (Ativos em 7 dias, Para revisar, Em risco,
 * Relatório): vazios no começo, com a regra dos 5; cheios na comunidade ativa.
 */
export function SetupStatCards({ g, first }: { g: MyGroup; first: boolean }) {
  const overview = useQuery({
    queryKey: orgKeys.overview(g.id, 30),
    queryFn: () => panelApi.overview(g.id, 30),
  });
  const queue = useQuery({
    queryKey: [...orgKeys.all(g.id), 'review'],
    queryFn: () => reviewApi.queue(g.id),
  });
  const risk = useQuery({
    queryKey: [...orgKeys.all(g.id), 'at-risk'],
    queryFn: () => reviewApi.atRisk(g.id),
  });
  const stats = setupStats({
    activeMembers: overview.data?.members.active ?? 0,
    active7d: overview.data?.aggregates?.active7d ?? null,
    review: queue.data ? splitReview(queue.data.items).open.length : null,
    risk: risk.data ? risk.data.rows.length : null,
    riskDays: risk.data?.riskDays ?? null,
    first,
  });
  const href: Record<string, string> = {
    active: panelHref(g.id),
    review: panelHref(g.id, 'review'),
    risk: `${panelHref(g.id, 'review')}/at-risk`,
    report: panelHref(g.id, 'report'),
  };
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((s) => (
        <li key={s.key}>
          <Link
            href={href[s.key]!}
            className={cn(card, 'flex min-h-[112px] flex-col gap-1 p-4 hover:bg-muted/40 md:px-5')}
          >
            <span className="text-[13px] text-muted-foreground">{s.label}</span>
            <span className="font-display text-[28px] font-extrabold tabular-nums">{s.value}</span>
            <span className="text-[13px] text-muted-foreground">{s.sub}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
