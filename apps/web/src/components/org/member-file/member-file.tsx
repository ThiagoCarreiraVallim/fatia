'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Crown, Lock, Plus } from 'lucide-react';
import {
  ApiError,
  fileFollowLine,
  fileTabs,
  lockedCopy,
  memberFileApi,
  panelHref,
  type FileTabKey,
  type MemberFile as MemberFileData,
  type ShareScope,
} from '@fatia/api-client';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { useOptionalSidePanel } from '@/components/org/side-panel';
import { ScopeReading } from '@/components/sharing/member-reading';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AddPlanForm } from './add-plan-form';
import { FileAgenda } from './file-agenda';
import { FilePlans } from './file-plans';
import { FileSummary } from './file-summary';
import { fileKeys } from './keys';

/** O nome da categoria no cadeado ("Ana não compartilha Corpo"). */
const LOCK_LABEL: Partial<Record<FileTabKey, string>> = {
  workout: 'Treino',
  nutrition: 'Alimentação',
  photos: 'Fotos das refeições',
  body: 'Corpo',
  habits: 'Hábitos e metas',
};

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

function Locked({ name, label }: { name: string; label: string }) {
  const c = lockedCopy(name, label);
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/30 p-6 text-center">
      <Lock size={20} aria-hidden className="mx-auto text-muted-foreground" />
      <p className="mt-3 text-sm font-bold text-foreground">{c.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{c.body}</p>
    </div>
  );
}

/** As categorias liberadas de uma aba, cada uma uma leitura própria na trilha. */
function ScopesTab({
  file,
  scopes,
  extra,
}: {
  file: MemberFileData;
  scopes: ShareScope[];
  extra?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {scopes
        .filter((s) => file.grantedToMe.includes(s))
        .map((s) => (
          <ScopeReading key={s} membershipId={file.membershipId} scope={s} />
        ))}
      {extra}
    </div>
  );
}

/**
 * A ficha da pessoa (#402, Pn-05). Um lugar só para a equipe: resumo, planos,
 * as categorias que ela compartilha e a agenda planejada. Cada categoria aberta
 * entra no histórico de acesso que ela vê.
 */
export function MemberFile({ groupId, membershipId }: { groupId: string; membershipId: string }) {
  const panel = useOptionalSidePanel();
  const [tab, setTab] = useState<FileTabKey>('summary');
  const [inlineAdd, setInlineAdd] = useState(false);
  const now = useMemo(() => new Date(), []);
  const q = useQuery({
    queryKey: fileKeys.file(groupId, membershipId),
    queryFn: () => memberFileApi.file(groupId, membershipId),
  });
  useTopBarTitle(q.data?.name);

  if (q.isPending) return <Skeleton className="h-60 rounded-2xl bg-card" />;
  if (q.isError) {
    const sumiu = q.error instanceof ApiError && (q.error.isNotFound || q.error.status === 403);
    return (
      <EmptyState
        title={sumiu ? 'Ficha indisponível' : 'Não deu para abrir a ficha'}
        description={
          sumiu
            ? 'A pessoa saiu da comunidade, o endereço está errado, ou seu papel não abre fichas.'
            : 'Tente de novo em instantes.'
        }
      />
    );
  }

  const file = q.data;
  const first = firstNameOf(file.name);
  const tabs = fileTabs(file.grantedToMe);
  const current = tabs.find((t) => t.key === tab) ?? tabs[0]!;
  const activeCount = file.plans.workout.filter((p) => p.status !== 'ENDED').length;

  const openAdd = () => {
    const close = () => {
      panel?.close();
      setInlineAdd(false);
    };
    if (panel) {
      panel.open({
        title: `Adicionar plano para a ${first}`,
        subtitle: 'treino da biblioteca',
        body: <AddPlanForm file={file} firstName={first} onDone={close} />,
      });
    } else {
      setInlineAdd(true);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <Link
          href={panelHref(groupId, 'members')}
          aria-label="Voltar para Membros"
          className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-muted"
        >
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <div
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-sm font-bold text-primary"
        >
          {initials(file.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-bold text-foreground">{file.name}</h1>
            {file.proByGroup && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                <Crown size={12} aria-hidden />
                PRO pela academia
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{fileFollowLine(file)}</p>
        </div>
        {file.canSendPlans && (
          <Button size="sm" onClick={openAdd}>
            <Plus size={16} aria-hidden /> Adicionar plano
          </Button>
        )}
      </header>

      {inlineAdd && (
        <section className="rounded-2xl border border-subtle bg-card p-4">
          <h2 className="mb-3 text-sm font-bold text-foreground">{`Adicionar plano para a ${first}`}</h2>
          <AddPlanForm file={file} firstName={first} onDone={() => setInlineAdd(false)} />
        </section>
      )}

      <div className="-mx-4 overflow-x-auto px-4">
        <div role="tablist" aria-label="Seções da ficha" className="flex min-w-max gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === current.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold',
                t.key === current.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {t.locked && <Lock size={12} role="img" aria-label="não compartilhado" />}
              {t.label}
              {t.key === 'plans' && activeCount > 0 && (
                <span className="rounded-full bg-background/30 px-1.5 text-[10px]">
                  {activeCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cada categoria que você abre entra no histórico de acesso dela.
      </p>

      <div role="tabpanel" aria-label={current.label}>
        {current.locked ? (
          <Locked name={file.name} label={LOCK_LABEL[current.key] ?? current.label} />
        ) : current.key === 'summary' ? (
          <FileSummary file={file} firstName={first} now={now} onTab={setTab} />
        ) : current.key === 'plans' ? (
          <FilePlans file={file} firstName={first} onAdd={openAdd} />
        ) : current.key === 'agenda' ? (
          <FileAgenda file={file} />
        ) : current.key === 'workout' ? (
          <ScopesTab
            file={file}
            scopes={['WORKOUT']}
            extra={
              <p className="text-[11px] text-muted-foreground">
                Detalhe da sessão e recordes do mês chegam com a tela de sessão (#399).
              </p>
            }
          />
        ) : current.key === 'nutrition' ? (
          <ScopesTab file={file} scopes={['NUTRITION']} />
        ) : current.key === 'photos' ? (
          <ScopesTab file={file} scopes={['MEAL_PHOTOS']} />
        ) : current.key === 'body' ? (
          <ScopesTab
            file={file}
            scopes={['BODY']}
            extra={
              <p className="rounded-2xl border border-dashed border-border bg-card/30 p-4 text-xs text-muted-foreground">
                Avaliações (pedir, registrar e comparar) chegam com a #383. O peso é só dela, nunca
                comparado com outras pessoas.
              </p>
            }
          />
        ) : (
          <ScopesTab file={file} scopes={['HABITS', 'GOALS']} />
        )}
      </div>
    </div>
  );
}
