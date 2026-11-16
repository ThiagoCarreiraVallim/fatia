'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Dumbbell, Users } from 'lucide-react';
import { initialsOf, templatesSubtitle, workoutTemplatesApi } from '@fatia/api-client';
import { ErrorState } from '@/components/elements/error-state';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const LEVEL_TONE: Record<string, string> = {
  Iniciante: 'text-primary-text',
  Intermediário: 'text-steps',
  Avançado: 'text-danger',
};
/** O quadrado do ícone na cor do nível (prancha: chipic colorido). */
const LEVEL_CHIP: Record<string, string> = {
  Iniciante: 'bg-primary/15 text-primary',
  Intermediário: 'bg-[hsl(var(--steps)/0.15)] text-steps',
  Avançado: 'bg-[hsl(var(--danger)/0.15)] text-danger',
};

/**
 * Modelos das comunidades (#379, prancha Al-T23): os planos de treino prontos
 * de todos os grupos da pessoa, numa tela só. O toque abre o detalhe do modelo
 * na comunidade, onde fica o "Adotar" (uma cópia; o original não muda).
 */
export default function WorkoutTemplatesPage() {
  const [groupId, setGroupId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['workout', 'templates'],
    queryFn: () => workoutTemplatesApi.listMine(),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4 px-4 pt-2">
        <Skeleton className="h-9 rounded-chip bg-muted" />
        <Skeleton className="h-40 rounded-card bg-muted" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="px-4 pt-2">
        <ErrorState
          className="max-w-none"
          title="Não foi possível carregar os modelos"
          detail={q.error instanceof Error ? q.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }

  const groups = q.data.filter((g) => g.templates.length > 0);
  if (groups.length === 0) {
    return (
      <div className="px-4 pt-2">
        <EmptyState
          icon={Users}
          title="Nenhum modelo nas suas comunidades"
          description="Quando a equipe de uma comunidade publicar um plano de treino, ele aparece aqui."
          action={
            <Link
              href="/community"
              className="anim-press inline-flex h-10 items-center rounded-[12px] bg-muted px-4 text-sm font-bold"
            >
              Ver comunidades
            </Link>
          }
        />
      </div>
    );
  }

  const visible = groupId ? groups.filter((g) => g.group.id === groupId) : groups;

  return (
    <div className="space-y-4 px-4 pb-8 pt-2">
      {groups.length > 1 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
          <Chip selected={groupId === null} onClick={() => setGroupId(null)}>
            Todas
          </Chip>
          {groups.map((g) => (
            <Chip
              key={g.group.id}
              selected={groupId === g.group.id}
              onClick={() => setGroupId(g.group.id)}
            >
              {g.group.name}
            </Chip>
          ))}
        </div>
      )}

      {visible.map(({ group, templates }) => (
        <section key={group.id} aria-label={group.name} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-brand text-[11px] font-extrabold text-brand-foreground"
            >
              {initialsOf(group.name)}
            </span>
            <b className="min-w-0 flex-1 truncate text-[15px]">{group.name}</b>
            <span className="text-xs text-muted-foreground">
              {templates.length} {templates.length === 1 ? 'modelo' : 'modelos'}
            </span>
          </div>
          <ul className="divide-y divide-border rounded-card bg-card px-4">
            {templates.map((t) => {
              const sub = templatesSubtitle(t);
              return (
                <li key={t.id}>
                  <Link
                    href={`/community/${group.id}/content/${t.id}`}
                    className="flex min-h-16 items-center gap-3 py-3"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]',
                        (sub.level && LEVEL_CHIP[sub.level]) || 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Dumbbell size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[15px] font-semibold">{t.title}</span>
                        {t.adoptedPlanId && (
                          <span className="inline-flex h-[18px] shrink-0 items-center rounded-pill bg-primary/15 px-2 text-[11px] font-extrabold text-primary">
                            adotado
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {sub.level && (
                          <>
                            <span className={cn('font-bold', LEVEL_TONE[sub.level])}>
                              {sub.level}
                            </span>
                            {' · '}
                          </>
                        )}
                        {sub.rest}
                      </span>
                    </span>
                    <ChevronRight size={16} aria-hidden className="shrink-0 text-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="px-1 text-xs text-muted-foreground">
        Ao adotar, você recebe uma cópia nos seus planos. O original da comunidade não muda.
      </p>
    </div>
  );
}
