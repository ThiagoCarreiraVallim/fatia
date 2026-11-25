'use client';

import { useQuery } from '@tanstack/react-query';
import { DEMO_BANNER_TITLE, greetingLine, type MeUser, type TodaySummary } from '@fatia/api-client';
import { ErrorState } from '@/components/ui/error-state';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import {
  KcalCard,
  NextWorkoutCard,
  StepsTile,
  StreakTile,
  WaterTile,
  WeightTile,
} from '@/components/today/today-cards';

/**
 * "Abrir no app como Ana Exemplo" (#412): o Hoje da aluna fictícia, só leitura.
 *
 * Lê pelo `/api/demo/*` com o token curto da demo no cabeçalho `x-fatia-demo`;
 * nunca pelo `/api/proxy`, que carregaria a sessão de quem abriu. Os cartões
 * são os mesmos do Hoje, mas ficam inertes: os links deles levariam ao app de
 * quem está no navegador, não ao da Ana.
 */

class DemoExpired extends Error {}

async function demoGet<T>(token: string, route: string): Promise<T> {
  const res = await fetch(`/api/demo/${route}`, {
    method: 'GET',
    headers: { 'x-fatia-demo': token, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) throw new DemoExpired();
  if (!res.ok) throw new Error(`demo ${route}: ${res.status}`);
  return (await res.json()) as T;
}

const noop = () => undefined;

export function DemoSessionToday({ token }: { token: string }) {
  const me = useQuery({
    queryKey: ['demo-session', token, 'me'],
    queryFn: () => demoGet<Pick<MeUser, 'id' | 'name'>>(token, 'users/me'),
  });
  const today = useQuery({
    queryKey: ['demo-session', token, 'today'],
    queryFn: () => demoGet<TodaySummary>(token, 'dashboard/today'),
  });

  const expired = me.error instanceof DemoExpired || today.error instanceof DemoExpired;
  const data = today.data;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="note"
        className="flex items-start gap-3 rounded-card bg-[hsl(var(--warning)/0.12)] px-4 py-3 shadow-[inset_0_0_0_1px_hsl(var(--warning)/0.45)]"
      >
        <Icon name="eye" size={18} className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0">
          <b className="block text-sm text-primary">{DEMO_BANNER_TITLE}</b>
          <span className="block text-[13px] text-muted-foreground">
            É assim que a aluna vê o Hoje. É só leitura: nada é gravado e ninguém recebe aviso.
          </span>
        </div>
      </div>

      {expired ? (
        <section className="flex flex-col gap-2 rounded-card bg-card p-5 text-center">
          <b className="text-base">O link da demonstração venceu.</b>
          <span className="text-sm text-muted-foreground">
            Ele vale por 30 minutos. Abra de novo pelo painel, em Demonstração.
          </span>
        </section>
      ) : me.isError || today.isError ? (
        <ErrorState
          message="Não deu para carregar a demonstração."
          onRetry={() => {
            void me.refetch();
            void today.refetch();
          }}
        />
      ) : !data || !me.data ? (
        <div className="flex flex-col gap-4" aria-busy>
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[172px]" />
          <Skeleton className="h-[96px]" />
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold">{greetingLine(me.data.name)}</h1>
          <div data-demo-cards inert className="flex flex-col gap-4">
            <KcalCard nutrition={data.nutrition} />
            <NextWorkoutCard workout={data.workout} />
            <div className="grid grid-cols-2 gap-3">
              <WaterTile water={data.water} onOpen={noop} onAdd={noop} adding={false} />
              <StepsTile steps={data.steps} onOpen={noop} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <WeightTile weight={data.weight} onOpen={noop} />
              <StreakTile streak={data.streak} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
