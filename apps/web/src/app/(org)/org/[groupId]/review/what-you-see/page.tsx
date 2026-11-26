'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  initialsOf,
  orgApi,
  panelHref,
  sharedCategories,
  usersApi,
  whatYouSeeNotes,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { useOrgGroup } from '@/components/org/org-shell';
import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * "O que você vê" (#372, prancha Onb-E2): o profissional recém-chegado vê,
 * aluno por aluno, o que cada um liberou para ele (o que a API devolve em
 * `scopesGrantedToMe`, nunca o que o aluno liberou para outra pessoa). Cada
 * abertura de ficha vai para o registro que o aluno vê (#402).
 */
export default function WhatYouSeePage() {
  const g = useOrgGroup();
  useTopBarTitle('O que você vê');
  const [open, setOpen] = useState(0);
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const members = useQuery({
    queryKey: orgKeys.members(g.id),
    queryFn: () => orgApi.members(g.id),
  });
  const alunos = (members.data ?? []).filter((m) => m.role === 'MEMBER' && m.status === 'ACTIVE');

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <h1 className="font-display text-[32px] font-extrabold leading-tight">
        Você vê só o que cada aluno liberou
      </h1>

      {members.isPending ? (
        <Skeleton className="h-40 rounded-card bg-card" />
      ) : alunos.length === 0 ? (
        <p className="rounded-card bg-card p-5 text-sm text-muted-foreground">
          Quando um aluno entrar, ele escolhe o que compartilhar com a equipe. Você vê aqui só o que
          ele liberou.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 rounded-card bg-card p-3">
          {alunos.map((a, i) => {
            const aberto = open === i;
            return (
              <li key={a.membershipId}>
                <button
                  type="button"
                  aria-expanded={aberto}
                  onClick={() => setOpen(aberto ? -1 : i)}
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold"
                  >
                    {initialsOf(a.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base">{a.name}</span>
                  <Icon
                    name="chevD"
                    size={18}
                    className={cn('shrink-0 transition-transform', aberto && 'rotate-180')}
                  />
                </button>
                {aberto && (
                  <ul
                    aria-label={`O que ${a.name} liberou`}
                    className="flex flex-wrap gap-2 px-2 pb-3 pt-1"
                  >
                    {sharedCategories(a.scopesGrantedToMe ?? []).map((c) => (
                      <li
                        key={c.label}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-bold uppercase',
                          c.shared
                            ? 'bg-primary-soft text-primary'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {c.label}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ul className="flex flex-col gap-4">
        {whatYouSeeNotes(me.data?.name ?? null).map((n) => (
          <li key={n.title} className="flex gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card"
            >
              <Icon name={n.icon} size={18} />
            </span>
            <span>
              <b className="block">{n.title}</b>
              <span className="text-[13px] text-muted-foreground">{n.body}</span>
            </span>
          </li>
        ))}
      </ul>

      <Link href={panelHref(g.id, 'review')} className={buttonVariants({ size: 'xl', full: true })}>
        Entendi
      </Link>
    </div>
  );
}
