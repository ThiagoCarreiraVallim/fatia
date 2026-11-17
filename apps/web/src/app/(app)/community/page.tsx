'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, ScanLine, Users } from 'lucide-react';
import {
  communityCardBadges,
  communityCardMeta,
  groupsApi,
  PRO_PAID_BADGE,
  type CommunityBadge,
  type MyGroup,
} from '@fatia/api-client';
import { brandStyle } from '@/components/community/brand-cover';
import { GroupAvatar } from '@/components/community/group-avatar';
import { JoinByCodeDrawer } from '@/components/community/join-by-code-drawer';
import { communityKeys } from '@/components/community/query-keys';
import { TabHeader, headerButtonClass } from '@/components/layout/tab-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

const BADGE_VARIANT: Record<CommunityBadge['tone'], 'pro-community' | 'pending' | 'done'> = {
  team: 'pro-community',
  muted: 'pending',
  ok: 'done',
};

function Badges({ g }: { g: MyGroup }) {
  const badges = communityCardBadges(g);
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <Badge key={b.label} variant={BADGE_VARIANT[b.tone]}>
          {b.label}
        </Badge>
      ))}
    </div>
  );
}

/** Patrocinada: capa na cor da comunidade, avatar sobre a capa, selo do PRO no alto. */
function SponsoredCard({ g }: { g: MyGroup }) {
  return (
    <Link
      href={`/community/${g.id}`}
      style={brandStyle(null)}
      className="block overflow-hidden rounded-card bg-card hover:bg-accent/40"
    >
      <div className="relative h-[92px] bg-[linear-gradient(150deg,hsl(var(--brand)),hsl(var(--brand)/0.25))]">
        {g.hasAiSeat && (
          <Badge variant="pro" className="absolute right-3 top-3">
            {PRO_PAID_BADGE}
          </Badge>
        )}
      </div>
      <div className="relative -mt-7 px-[18px]">
        <GroupAvatar
          name={g.name}
          url={g.avatarUrl}
          size={56}
          className="rounded-[18px] bg-brand text-brand-foreground ring-4 ring-card"
        />
      </div>
      <div className="space-y-3 px-[18px] pb-[18px] pt-2">
        <div>
          <p className="font-display text-h3 font-bold text-foreground">{g.name}</p>
          <p className="text-xs text-muted-foreground">{communityCardMeta(g)}</p>
        </div>
        <Badges g={g} />
      </div>
    </Link>
  );
}

/** Social (ou quem não é patrocinada): uma linha. */
function RowCard({ g }: { g: MyGroup }) {
  return (
    <Link
      href={`/community/${g.id}`}
      className="flex items-center gap-3 rounded-[20px] bg-card px-[18px] py-3.5 hover:bg-accent/40"
    >
      <GroupAvatar name={g.name} url={g.avatarUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{g.name}</span>
        <span className="block text-xs text-muted-foreground">{communityCardMeta(g)}</span>
      </span>
      <Badges g={g} />
      {g.hasAiSeat && <Badge variant="pro">PRO</Badge>}
    </Link>
  );
}

/**
 * Minhas comunidades (Cm-01): onde estou, com que papel e quantas pessoas, se a
 * comunidade paga meu PRO, o que está esperando por mim, posts novos e a
 * posição no desafio. Embaixo, entrar com QR ou código, ou criar.
 *
 * `?join=1` (o "Tenho código" do plano, do chat e o link do QR) abre a folha;
 * com `&code=`, já procura o código.
 */
export default function CommunityPage() {
  return (
    <Suspense>
      <CommunityHome />
    </Suspense>
  );
}

function CommunityHome() {
  const router = useRouter();
  const params = useSearchParams();
  const initialCode = params?.get('code') ?? null;
  const [joining, setJoining] = useState(params?.get('join') === '1' || !!initialCode);
  const groups = useQuery({ queryKey: communityKeys.mine, queryFn: () => groupsApi.mine() });

  return (
    <div className="space-y-4 p-4">
      <TabHeader title="Comunidade">
        <button
          type="button"
          className={headerButtonClass()}
          aria-label="Ler QR Code ou digitar código"
          onClick={() => setJoining(true)}
        >
          <ScanLine size={20} aria-hidden />
        </button>
        <Link
          href="/community/new"
          className={headerButtonClass('lime')}
          aria-label="Criar comunidade"
        >
          <Plus size={20} aria-hidden />
        </Link>
      </TabHeader>

      {groups.isPending && (
        <div aria-busy="true" className="space-y-3">
          <Skeleton className="h-[200px] rounded-card bg-card" />
          <Skeleton className="h-[72px] rounded-2xl bg-card" />
        </div>
      )}
      {groups.isError && (
        <p role="alert" className="text-sm text-danger">
          Não deu para carregar suas comunidades.{' '}
          <button type="button" className="underline" onClick={() => groups.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {groups.data && groups.data.length === 0 && (
        <EmptyState
          icon={Users}
          title="Suas comunidades aparecem aqui"
          description="Entre pelo QR da recepção, pelo convite ou pelo código que sua academia ou treinador divulgou, e escolha o que compartilhar."
        />
      )}
      {groups.data && groups.data.length > 0 && (
        <ul aria-label="Minhas comunidades" className="space-y-3">
          {groups.data.map((g) => (
            <li key={g.id}>
              {g.type === 'SPONSORED' && g.status === 'ACTIVE' ? (
                <SponsoredCard g={g} />
              ) : (
                <RowCard g={g} />
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-2.5 rounded-card bg-surface-3 p-4">
        <p className="font-semibold">Entrar numa comunidade</p>
        <p className="text-xs text-muted-foreground">
          Leia o QR Code da recepção ou digite o código que sua academia ou treinador divulgou.
        </p>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => setJoining(true)}>
            <ScanLine size={16} aria-hidden />
            Ler QR ou código
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/community/new">Criar</Link>
          </Button>
        </div>
      </section>

      <JoinByCodeDrawer
        open={joining}
        onOpenChange={(o) => {
          setJoining(o);
          // Fechou: tira o `?join=1&code=` da URL, para não reabrir ao voltar.
          if (!o && (params?.get('join') || initialCode)) router.replace('/community');
        }}
        initialCode={initialCode}
        onJoined={(groupId) => router.push(`/community/${groupId}`)}
      />
    </div>
  );
}
