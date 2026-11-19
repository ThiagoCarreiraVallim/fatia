'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, ExternalLink, Gift } from 'lucide-react';
import {
  benefitCopiedToast,
  benefitExpiredNote,
  benefitInitials,
  benefitsApi,
  benefitValidity,
  BENEFITS_PRIVACY_NOTE,
  groupsApi,
  type MemberBenefit,
} from '@fatia/api-client';
import { communityKeys } from '@/components/community/query-keys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Monograma neutro: o parceiro não é a academia, então não leva a cor dela (Cm-22). */
function Logo({ b }: { b: MemberBenefit }) {
  if (b.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage, sem otimizador.
    return <img src={b.logoUrl} alt="" className="size-12 shrink-0 rounded-[14px] object-cover" />;
  }
  return (
    <span
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-surface-3 font-display text-sm font-bold text-foreground"
    >
      {benefitInitials(b.partnerName)}
    </span>
  );
}

function BenefitCard({
  b,
  copied,
  onCopy,
}: {
  b: MemberBenefit;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <li className="space-y-3 rounded-card bg-card p-[18px]" aria-label={b.partnerName}>
      <div className="flex items-center gap-3">
        {/* Vencido: apaga só logo e título; selo e nota ficam com contraste cheio. */}
        <div className={cn('flex min-w-0 flex-1 items-center gap-3', b.expired && 'opacity-50')}>
          <Logo b={b} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{b.partnerName}</p>
            <p className="text-sm text-muted-foreground">{b.discountText}</p>
          </div>
        </div>
        <Badge variant={b.expired ? 'pending' : 'done'}>{benefitValidity(b)}</Badge>
      </div>
      {b.expired ? (
        <p className="text-xs text-muted-foreground">{benefitExpiredNote(b)}</p>
      ) : b.kind === 'COUPON' && b.couponCode ? (
        <div className="flex items-center gap-2">
          <span className="flex h-11 flex-1 items-center rounded-xl border border-dashed border-border px-3 font-mono text-sm font-bold tracking-wider">
            {b.couponCode}
          </span>
          <Button
            size="sm"
            variant={copied ? 'outline' : 'brand'}
            className="h-11 gap-1.5"
            onClick={onCopy}
          >
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? 'Copiado' : 'Copiar código'}
          </Button>
        </div>
      ) : b.url ? (
        <Button asChild size="sm" variant="brand" className="h-11 w-full gap-1.5">
          <a href={b.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden />
            Visitar o site
          </a>
        </Button>
      ) : null}
    </li>
  );
}

/**
 * Benefícios (Cm-22): os descontos que a comunidade combinou com parceiros.
 * Cupom copia; link abre fora do app. O vencido de ontem aparece apagado e sem
 * cupom nem link, e sai no dia seguinte (a API já filtra no fuso da comunidade).
 */
export default function CommunityBenefitsPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const [copied, setCopied] = useState<string | null>(null);
  const group = useQuery({
    queryKey: communityKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
  });
  const list = useQuery({
    queryKey: communityKeys.benefits(groupId),
    queryFn: () => benefitsApi.list(groupId),
  });

  async function copy(b: MemberBenefit) {
    if (!b.couponCode) return;
    try {
      await navigator.clipboard.writeText(b.couponCode);
      setCopied(b.id);
      toast(benefitCopiedToast(b.couponCode));
    } catch {
      toast('Não deu para copiar. Selecione o código e copie.');
    }
  }

  return (
    <div className="space-y-4 p-4">
      {/* O título já está na barra do topo; aqui fica só a frase (Cm-22). */}
      <p className="px-1 text-sm text-muted-foreground">
        {group.data
          ? `Descontos que a ${group.data.name} combinou com parceiros.`
          : 'Descontos que a comunidade combinou com parceiros.'}
      </p>

      {list.isPending && (
        <div aria-busy="true" className="space-y-3">
          <Skeleton className="h-32 rounded-card bg-card" />
          <Skeleton className="h-32 rounded-card bg-card" />
        </div>
      )}
      {list.isError && (
        <p role="alert" className="text-sm text-danger">
          Não deu para carregar os benefícios.{' '}
          <button type="button" className="underline" onClick={() => list.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {list.data && list.data.length === 0 && (
        <EmptyState
          icon={Gift}
          title="Nenhum benefício agora"
          description="Quando a comunidade combinar um desconto com um parceiro, ele aparece aqui."
        />
      )}
      {list.data && list.data.length > 0 && (
        <ul className="space-y-3">
          {list.data.map((b) => (
            <BenefitCard key={b.id} b={b} copied={copied === b.id} onCopy={() => copy(b)} />
          ))}
        </ul>
      )}

      <p className="px-1 text-xs text-muted-foreground">{BENEFITS_PRIVACY_NOTE}</p>
    </div>
  );
}
