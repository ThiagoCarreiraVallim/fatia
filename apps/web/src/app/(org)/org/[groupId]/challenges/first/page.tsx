'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ApiError,
  CHALLENGE_TEMPLATES,
  challengePublishedText,
  challengesApi,
  challengeTemplateInput,
  groupCan,
  mondayLabel,
  nextMondayIso,
  panelHref,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { useOrgGroup } from '@/components/org/org-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type Start = 'monday' | 'today';

/**
 * Primeiro desafio com modelo (#372, prancha Onb-C5): o "Constância 30 dias"
 * pronto, começando na segunda ou hoje, com o push opcional. Publicar marca o
 * passo "Primeiro desafio" do guia (o dado mostra). "Aberto para não membros"
 * depende da página pública (#416) e fica fora.
 */
export default function FirstChallengePage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  useTopBarTitle('Primeiro desafio');
  const [pick, setPick] = useState(0);
  const [others, setOthers] = useState(false);
  const [start, setStart] = useState<Start>('monday');
  const [push, setPush] = useState(true);
  const list = useQuery({
    queryKey: [...orgKeys.all(g.id), 'challenges', 'today'],
    queryFn: () => challengesApi.list(g.id),
    enabled: groupCan(g, 'challenge.manage'),
  });
  const t = CHALLENGE_TEMPLATES[pick]!;
  const today = list.data?.today ?? '';
  const monday = today ? nextMondayIso(today) : '';
  const startDate = start === 'monday' ? monday : today;
  const startLabel = start === 'monday' && monday ? mondayLabel(monday).toLowerCase() : 'hoje';

  const publish = useMutation({
    mutationFn: () => challengesApi.create(g.id, challengeTemplateInput(t, startDate, push)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });
    },
    onError: (err) =>
      toast(
        err instanceof ApiError && err.status < 500
          ? err.message
          : 'Não deu para publicar agora. Tente de novo.',
      ),
  });

  if (!groupCan(g, 'challenge.manage')) {
    return (
      <p className="rounded-card bg-card p-6 text-sm text-muted-foreground">
        Só quem cuida dos desafios da comunidade publica um desafio.
      </p>
    );
  }
  if (list.isPending) return <Skeleton className="mx-auto h-96 max-w-xl rounded-2xl bg-card" />;

  if (publish.isSuccess) {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-card bg-card px-6 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Icon name="trophy" size={24} />
        </span>
        <h1 className="font-display text-2xl font-extrabold">Desafio publicado</h1>
        <p className="text-sm text-muted-foreground">
          {challengePublishedText(t, startLabel, push)}
        </p>
        <Link href={panelHref(g.id)} className={cn(buttonVariants({ size: 'lg' }), 'mt-2')}>
          Voltar ao checklist
        </Link>
      </section>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <section className="rounded-card bg-[linear-gradient(160deg,hsl(var(--brand)/0.22),hsl(var(--card))_70%)] p-5 shadow-[inset_0_0_0_1px_hsl(var(--brand)/0.5)]">
        <span className="inline-flex h-7 items-center rounded-full bg-brand px-3 text-xs font-bold uppercase text-brand-foreground">
          Modelo
        </span>
        <h1 className="mt-3 font-display text-[32px] font-extrabold leading-tight">{t.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
        <dl className="mt-4 flex gap-8">
          <div>
            <dt className="sr-only">Duração</dt>
            <dd className="font-display text-3xl font-extrabold tabular-nums">{t.days}</dd>
            <dd className="text-[13px] text-muted-foreground">dias</dd>
          </div>
          <div>
            <dt className="sr-only">Regra</dt>
            <dd className="font-display text-3xl font-extrabold tabular-nums">{t.rule.value}</dd>
            <dd className="text-[13px] text-muted-foreground">{t.rule.label}</dd>
          </div>
        </dl>
      </section>

      {others && (
        <div role="radiogroup" aria-label="Modelos de desafio" className="flex flex-col gap-2">
          {CHALLENGE_TEMPLATES.map((m, i) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={i === pick}
              onClick={() => {
                setPick(i);
                setOthers(false);
              }}
              className={cn(
                'rounded-card bg-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                i === pick && 'shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
              )}
            >
              <b className="block">{m.title}</b>
              <span className="text-[13px] text-muted-foreground">
                {m.days} dias · {m.rule.value} {m.rule.label}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">Começa</span>
        <Segmented<Start>
          label="Começa"
          value={start}
          onChange={setStart}
          options={[
            { value: 'monday', label: monday ? mondayLabel(monday) : 'Segunda' },
            { value: 'today', label: 'Hoje' },
          ]}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-card bg-card px-4 py-4">
        <span className="text-[15px]">Avisar todos por push</span>
        <Switch label="Avisar todos por push" checked={push} onCheckedChange={setPush} />
      </div>

      <Button
        size="xl"
        full
        disabled={!startDate || publish.isPending}
        onClick={() => publish.mutate()}
      >
        {publish.isPending ? 'Publicando…' : 'Publicar desafio'}
      </Button>
      <Button variant="text" onClick={() => setOthers((v) => !v)} aria-expanded={others}>
        Ver outros modelos
      </Button>
    </div>
  );
}
