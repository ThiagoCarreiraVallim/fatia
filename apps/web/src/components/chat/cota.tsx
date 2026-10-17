'use client';

import { useQuery } from '@tanstack/react-query';
import { getChatQuota, type ChatQuota } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { CHAVE_DA_COTA } from './chat-runtime-provider';

/**
 * O aviso do limite de uso do dia, só quando ele importa: perto do fim ou esgotado.
 *
 * Um medidor sempre visível viraria ruído na tela de quem nunca chega perto do
 * teto — e a instância sem teto por pessoa (`limitMicros: null`) nem o tem.
 */

export const LIMIAR_DO_AVISO = 0.8;

export function avisoDaCota(cota: ChatQuota | undefined): string | null {
  if (!cota) return null;
  const volta = new Date(cota.resetsAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (!cota.allowed) return `O limite do assistente por hoje acabou. Ele volta às ${volta}.`;
  if (cota.usedRatio !== null && cota.usedRatio >= LIMIAR_DO_AVISO) {
    return `Você já usou ${Math.round(cota.usedRatio * 100)}% do limite do assistente por hoje.`;
  }
  return null;
}

export function AvisoDeCota() {
  const { data: cota } = useQuery({
    queryKey: CHAVE_DA_COTA,
    queryFn: getChatQuota,
    staleTime: 60_000,
  });
  const aviso = avisoDaCota(cota);
  if (!aviso) return null;
  const ratio = cota?.usedRatio ?? 1;
  return (
    <div role="status" className="shrink-0 px-5 pb-2">
      <p
        className={cn(
          'text-xs',
          cota?.allowed ? 'text-muted-foreground' : 'font-semibold text-rose-500',
        )}
      >
        {aviso}
      </p>
      {cota?.limitMicros !== null ? (
        <div
          aria-hidden
          className="mt-1 h-1 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
        >
          <div
            className={cn('h-full rounded-full', cota?.allowed ? 'bg-amber-500' : 'bg-rose-500')}
            style={{ width: `${Math.round(Math.min(1, ratio) * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
